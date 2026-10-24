const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
function walk(root,base=''){return fs.readdirSync(path.join(root,base),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>{if(e.isSymbolicLink())throw Error('symlink');const name=base?base+'/'+e.name:e.name;return e.isDirectory()?walk(root,name):[name];});}
try{
  const receipt=JSON.parse(fs.readFileSync('upload-receipt.json','utf8'));
  if(receipt.uploaded!==true||receipt.projectId!==40||receipt.project!=='suislink-qrcode-signin-web'||!/^qrcode-signin-web@[a-f0-9]{40}\+[a-f0-9]{12}$/.test(receipt.release))throw Error('upload receipt');
  const files=walk('dist');
  if(!files.includes('index.html')||!files.some(f=>f.endsWith('.js')))throw Error('empty artifact');
  const actual=Object.fromEntries(files.map(f=>{
    const bytes=fs.readFileSync(path.join('dist',f));
    if(/\.map(?:$|\.)/.test(f)||/\.(js|css|html)$/.test(f)&&/sourceMappingURL\s*=/.test(bytes.toString()))throw Error('public source map');
    return [f,createHash('sha256').update(bytes).digest('hex')];
  }));
  if(JSON.stringify(actual)!==JSON.stringify(receipt.publicFiles))throw Error('artifact mismatch');
}catch{console.error('Private upload receipt/artifact verification failed.');process.exitCode=1;}
