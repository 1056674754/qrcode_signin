import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {stageArtifacts,verifyArtifacts,uploadArtifacts,sourceRelease} from '../scripts/private-artifacts.mjs';
const base=path.dirname(fileURLToPath(import.meta.url));
const release='qrcode-signin-web@'+'a'.repeat(40)+'+'+'b'.repeat(12);
function fixture(){const root=path.join(base,'.fixture-'+crypto.randomUUID());fs.mkdirSync(path.join(root,'dist/assets'),{recursive:true});fs.writeFileSync(path.join(root,'dist/index.html'),'<script src="/assets/index-abcdefgh.js"></script>');fs.writeFileSync(path.join(root,'dist/assets/index-abcdefgh.js'),'console.log("FAKE");\n//# debugId=b1234567-b123-b123-b123-b123456789ab');fs.writeFileSync(path.join(root,'dist/assets/index-abcdefgh.js.map'),JSON.stringify({version:3,debug_id:'b1234567-b123-b123-b123-b123456789ab',sources:['src/pages/OAuthCallback.tsx'],sourcesContent:['FAKE_SOURCE'],mappings:''}));return root;}
test('stage keeps hidden exact maps outside public artifact; verify needs upload and detects tampering',async()=>{const root=fixture();try{await stageArtifacts(root,release);assert(!fs.existsSync(path.join(root,'dist/assets/index-abcdefgh.js.map')));assert(fs.existsSync(path.join(root,'.monitoring-private/assets/index-abcdefgh.js.map')));assert.throws(()=>verifyArtifacts(root),/upload/);await uploadArtifacts(root,async()=>{});verifyArtifacts(root);fs.appendFileSync(path.join(root,'dist/assets/index-abcdefgh.js'),'changed');assert.throws(()=>verifyArtifacts(root),/artifact|hash/i);}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('failed private upload throws and leaves image gate closed',async()=>{const root=fixture();try{await stageArtifacts(root,release);await assert.rejects(uploadArtifacts(root,async()=>{throw Error('synthetic upload unavailable');}),/unavailable/);assert.throws(()=>verifyArtifacts(root),/upload/);}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('public sourceMappingURL or map files cannot be accepted; private map tampering fails before upload',async()=>{const root=fixture();try{fs.appendFileSync(path.join(root,'dist/assets/index-abcdefgh.js'),'\n//# sourceMappingURL=index.js.map');await assert.rejects(stageArtifacts(root,release),/sourceMappingURL/);}finally{fs.rmSync(root,{recursive:true,force:true});}const other=fixture();try{await stageArtifacts(other,release);fs.appendFileSync(path.join(other,'.monitoring-private/assets/index-abcdefgh.js.map'),'x');await assert.rejects(uploadArtifacts(other,async()=>{}),/artifact|hash/i);}finally{fs.rmSync(other,{recursive:true,force:true});}});
test('release changes with source bytes without committing and ignores private/generated artifacts',()=>{const root=fixture();try{fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src/main.tsx'),'source A');fs.writeFileSync(path.join(root,'package-lock.json'),'{}');const a=sourceRelease(root,'a'.repeat(40));fs.writeFileSync(path.join(root,'src/main.tsx'),'source B');const b=sourceRelease(root,'a'.repeat(40));assert.notEqual(a,b);fs.mkdirSync(path.join(root,'.monitoring-private'));fs.writeFileSync(path.join(root,'.monitoring-private/upload-receipt.json'),'not source');assert.equal(sourceRelease(root,'a'.repeat(40)),b);}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('image guard rejects unuploaded or changed bytes and accepts only exact uploaded public artifact',async()=>{
  const {spawnSync}=await import('node:child_process');const guard=path.resolve(base,'../scripts/image-guard.cjs'),root=fixture();
  const run=()=>spawnSync(process.execPath,[guard],{cwd:root,encoding:'utf8'}).status;
  try{await stageArtifacts(root,release);assert.notEqual(run(),0);await uploadArtifacts(root,async()=>{});fs.copyFileSync(path.join(root,'.monitoring-private/upload-receipt.json'),path.join(root,'upload-receipt.json'));assert.equal(run(),0);fs.writeFileSync(path.join(root,'dist/private.js.map'),'FAKE_PRIVATE');assert.notEqual(run(),0);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('injection-only Vite map without metadata obtains exact injected runtime debug ID privately, never rewrites JS',async()=>{
  const root=fixture();try{
    const js=path.join(root,'dist/assets/index-abcdefgh.js'),mapFile=js+'.map';
    const code='try{e._sentryDebugIds[t]="b1234567-b123-b123-b123-b123456789ab",e._sentryDebugIdIdentifier="sentry-dbid-b1234567-b123-b123-b123-b123456789ab"}catch{}';
    fs.writeFileSync(js,code);const map=JSON.parse(fs.readFileSync(mapFile,'utf8'));delete map.debug_id;fs.writeFileSync(mapFile,JSON.stringify(map));
    await stageArtifacts(root,release);
    const privateMap=JSON.parse(fs.readFileSync(path.join(root,'.monitoring-private/assets/index-abcdefgh.js.map'),'utf8'));
    assert.equal(privateMap.debug_id,'b1234567-b123-b123-b123-b123456789ab');assert.equal(fs.readFileSync(js,'utf8'),code);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('release binds public auth mode/provider/base URL to artifact without hashing secrets',()=>{
  const root=fixture();try{
    const oauth={VITE_AUTH_MODE:'oauth2',VITE_OAUTH_PROVIDER:'oidc',VITE_POCKETBASE_URL:''};
    const a=sourceRelease(root,'a'.repeat(40),oauth);
    assert.notEqual(a,sourceRelease(root,'a'.repeat(40),{...oauth,VITE_AUTH_MODE:'wecom'}));
    assert.notEqual(a,sourceRelease(root,'a'.repeat(40),{...oauth,VITE_OAUTH_PROVIDER:'FAKE_OTHER_PROVIDER'}));
    assert.notEqual(a,sourceRelease(root,'a'.repeat(40),{...oauth,VITE_POCKETBASE_URL:'https://fake.invalid'}));
    assert.equal(a,sourceRelease(root,'a'.repeat(40),{...oauth,SENTRY_AUTH_TOKEN:'MUST_NOT_BIND_SECRET'}));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('starting a build invalidates old upload receipt before compiler/output work can fail',async()=>{
  const root=fixture();try{
    await stageArtifacts(root,release);await uploadArtifacts(root,async()=>{});verifyArtifacts(root);
    const {invalidateUpload}=await import('../scripts/private-artifacts.mjs');
    invalidateUpload(root);assert.throws(()=>verifyArtifacts(root),/upload/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
for (const input of ['Dockerfile', '.dockerignore', 'nginx.conf', 'scripts/image-guard.cjs']) {
  test(`runtime image input ${input} changes release and rebuild invalidates prior upload receipt`, async () => {
    const root = fixture();
    try {
      fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
      for (const file of ['Dockerfile', '.dockerignore', 'nginx.conf', 'scripts/image-guard.cjs']) {
        fs.writeFileSync(path.join(root, file), 'FAKE authored input A\n');
      }
      const before = sourceRelease(root, 'a'.repeat(40));
      await stageArtifacts(root, before);
      await uploadArtifacts(root, async () => {});
      verifyArtifacts(root);
      fs.appendFileSync(path.join(root, input), 'FAKE authored input B\n');
      const after = sourceRelease(root, 'a'.repeat(40));
      assert.notEqual(after, before, `${input} must bind the release digest`);
      fs.copyFileSync(path.join(root, '.monitoring-private/assets/index-abcdefgh.js.map'),
        path.join(root, 'dist/assets/index-abcdefgh.js.map'));
      const rebuilt = await stageArtifacts(root, after);
      assert.equal(rebuilt.release, after);
      assert(!fs.existsSync(path.join(root, '.monitoring-private/upload-receipt.json')));
      assert.throws(() => verifyArtifacts(root), /upload/);
    } finally { fs.rmSync(root, {recursive: true, force: true}); }
  });
}
test('authored fingerprint is deterministic and ignores private/git/cache/generated or unrelated script files', () => {
  const root = fixture();
  try {
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.writeFileSync(path.join(root, 'scripts/image-guard.cjs'), 'FAKE guard');
    fs.writeFileSync(path.join(root, 'scripts/private-artifacts.mjs'), 'FAKE artifact tool');
    const before = sourceRelease(root, 'a'.repeat(40));
    assert.equal(sourceRelease(root, 'a'.repeat(40)), before);
    for (const file of ['.git/HEAD', '.cache/private', '.monitoring-private/upload-receipt.json',
      'dist/generated.js', '.env', 'scripts/.cache/private', 'scripts/unrelated-local-note']) {
      fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
      fs.writeFileSync(path.join(root, file), 'FAKE private/generated input, never hash');
    }
    assert.equal(sourceRelease(root, 'a'.repeat(40)), before);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
