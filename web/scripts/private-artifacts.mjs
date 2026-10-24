import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function files(root,base=''){
  return fs.readdirSync(path.join(root,base),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>{
    if(e.isSymbolicLink())throw Error('symlink in artifact');
    const name=base?base+'/'+e.name:e.name;return e.isDirectory()?files(root,name):[name];
  });
}
function hashes(root){return Object.fromEntries(files(root).map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));}
function sameFiles(root,expected){if(JSON.stringify(hashes(root))!==JSON.stringify(expected))throw Error('artifact hash or file list changed');}
export function sourceRelease(root,base,publicEnv={}){
  if(!/^[a-f0-9]{40}$/.test(base))throw Error('exact baseline required');
  const hash=createHash('sha256');
  const inputs=['src','scripts','package.json','package-lock.json','vite.config.ts','index.html','tsconfig.json','tsconfig.node.json'];
  for(const input of inputs){const p=path.join(root,input);if(!fs.existsSync(p))continue;for(const file of fs.statSync(p).isDirectory()?files(p).map(f=>input+'/'+f):[input])hash.update(file+'\0').update(fs.readFileSync(path.join(root,file)));}
  const publicDefaults={VITE_AUTH_MODE:'wecom',VITE_OAUTH_PROVIDER:'oidc',VITE_POCKETBASE_URL:'',VITE_WECOM_CORP_ID:'',VITE_WECOM_AGENT_ID:''};
  for(const [key,fallback] of Object.entries(publicDefaults))hash.update(key+'\0'+String(publicEnv[key]??fallback)+'\0');
  return `qrcode-signin-web@${base}+${hash.digest('hex').slice(0,12)}`;
}
function requireRelease(release){if(!/^qrcode-signin-web@[a-f0-9]{40}\+[a-f0-9]{12}$/.test(release))throw Error('invalid release');}
function publicGuard(dist){
  const list=files(dist);if(!list.includes('index.html')||!list.some(f=>f.endsWith('.js')))throw Error('missing public artifact');
  for(const file of list){if(/\.map(?:$|\.)/.test(file))throw Error('public map');if(/\.(?:js|css|html)$/.test(file)&&/sourceMappingURL\s*=/.test(fs.readFileSync(path.join(dist,file),'utf8')))throw Error('public sourceMappingURL');}
}
export function invalidateUpload(root){fs.rmSync(path.join(root,'.monitoring-private/upload-receipt.json'),{force:true});}
export async function stageArtifacts(root,release){
  requireRelease(release);const dist=path.join(root,'dist'),priv=path.join(root,'.monitoring-private');
  // A new build invalidates every old upload receipt before any validation can fail.
  invalidateUpload(root);
  fs.mkdirSync(path.join(priv,'assets'),{recursive:true,mode:0o700});fs.chmodSync(priv,0o700);
  fs.rmSync(path.join(priv,'assets'),{recursive:true,force:true});fs.mkdirSync(path.join(priv,'assets'),{mode:0o700});
  const list=files(dist);const maps=list.filter(f=>f.endsWith('.js.map'));
  if(!maps.length)throw Error('hidden private maps missing');
  for(const file of list.filter(f=>/\.(?:js|css|html)$/.test(f)))if(/sourceMappingURL\s*=/.test(fs.readFileSync(path.join(dist,file),'utf8')))throw Error('public sourceMappingURL');
  for(const file of maps){
    const js=file.slice(0,-4),map=JSON.parse(fs.readFileSync(path.join(dist,file),'utf8'));
    const code=fs.readFileSync(path.join(dist,js),'utf8');
    const injectedIds=[...new Set([...code.matchAll(/sentry-dbid-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/g)].map(match=>match[1]))];
    const id=map.debug_id || map.debugId || (injectedIds.length===1?injectedIds[0]:undefined);
    if(!/^[a-f0-9-]{36}$/.test(id||'')||!code.includes(id)||injectedIds.some(value=>value!==id))throw Error('debug ID mismatch');
    // Injection-only plugin does not prepare upload maps: annotate only the private copy.
    // Public JS bytes and mappings remain untouched, preserving runtime coordinates.
    const privateMap=path.join(priv,file);fs.mkdirSync(path.dirname(privateMap),{recursive:true,mode:0o700});
    fs.writeFileSync(privateMap,JSON.stringify({...map,debug_id:id}),{mode:0o600});
    const privateJs=path.join(priv,js);fs.copyFileSync(path.join(dist,js),privateJs);fs.chmodSync(privateJs,0o600);
  }
  for(const file of list.filter(f=>f.endsWith('.map')))fs.unlinkSync(path.join(dist,file));
  publicGuard(dist);
  const manifest={release,project:'suislink-qrcode-signin-web',projectId:40,publicFiles:hashes(dist),privateFiles:hashes(path.join(priv,'assets'))};
  fs.writeFileSync(path.join(priv,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});return manifest;
}
function staged(root){const priv=path.join(root,'.monitoring-private'),m=JSON.parse(fs.readFileSync(path.join(priv,'manifest.json'),'utf8'));requireRelease(m.release);if(m.projectId!==40||m.project!=='suislink-qrcode-signin-web')throw Error('wrong Sentry project');publicGuard(path.join(root,'dist'));sameFiles(path.join(root,'dist'),m.publicFiles);sameFiles(path.join(priv,'assets'),m.privateFiles);return m;}
export async function uploadArtifacts(root,uploader){
  const priv=path.join(root,'.monitoring-private');fs.rmSync(path.join(priv,'upload-receipt.json'),{force:true});const manifest=staged(root);
  await uploader(manifest,path.join(priv,'assets'));
  staged(root);
  fs.writeFileSync(path.join(priv,'upload-receipt.json'),JSON.stringify({...manifest,uploaded:true},null,2),{mode:0o600});
}
export function verifyArtifacts(root){
  const m=staged(root),receiptFile=path.join(root,'.monitoring-private/upload-receipt.json');if(!fs.existsSync(receiptFile))throw Error('private upload receipt required');const receipt=JSON.parse(fs.readFileSync(receiptFile,'utf8'));
  if(receipt.uploaded!==true||receipt.release!==m.release||JSON.stringify(receipt.publicFiles)!==JSON.stringify(m.publicFiles)||JSON.stringify(receipt.privateFiles)!==JSON.stringify(m.privateFiles))throw Error('private upload receipt mismatch');return m;
}
const own=fileURLToPath(import.meta.url);
if(process.argv[1]&&path.resolve(process.argv[1])===own){
  const root=path.resolve(path.dirname(own),'..');
  try{
    const cmd=process.argv[2];
    if(cmd==='invalidate')invalidateUpload(root);
    else if(cmd==='stage')await stageArtifacts(root,sourceRelease(root,execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),process.env));
    else if(cmd==='verify')verifyArtifacts(root);
    else if(cmd==='upload')await uploadArtifacts(root,async(manifest,assets)=>{
      if(!process.env.SENTRY_AUTH_TOKEN||process.env.SENTRY_URL!=='https://sentry.suisqp.cn'||process.env.SENTRY_ORG!=='sentry'||process.env.SENTRY_PROJECT!=='suislink-qrcode-signin-web')throw Error('private upload credentials/target required');
      const require=createRequire(import.meta.url),SentryCli=require('@sentry/cli');
      const binary=SentryCli.getPath();
      execFileSync(binary,['sourcemaps','upload','--release',manifest.release,'--url-prefix','~/assets',assets],{cwd:root,stdio:'pipe',env:process.env,timeout:120000,maxBuffer:2*1024*1024});
    });else throw Error('expected stage, upload or verify');
  }catch{console.error('Private monitoring artifact gate failed; do not build/publish image.');process.exitCode=1;}
}
