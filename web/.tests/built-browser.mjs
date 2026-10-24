// Run only against the real production dist built with VITE_AUTH_MODE=oauth2.
// All origins are intercepted before navigation: no real auth, ingest, PB or sign-in write.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'.monitoring-private/manifest.json'),'utf8'));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output=path.join(root,'.evidence');fs.mkdirSync(output,{recursive:true});
const runtime=path.join(output,'browser-runtime');fs.mkdirSync(runtime,{recursive:true});
if(!process.env.CHROME_BIN)throw Error('Set CHROME_BIN to existing initialized Chrome executable');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN,env:{...process.env,TMPDIR:runtime},args:['--incognito','--disable-gpu']});
const origin='https://stfact.suisqp.cn',eventId='FAKE_EVENT_0001',userId='FAKE_USER_00001';
const code='FAKE_OAUTH_CODE',state='FAKE_STATE',verifier='FAKE_PKCE_VERIFIER';
const jwt=`${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({id:userId,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.FAKE_SIGNATURE`;
const provider={name:'oidc',displayName:'Synthetic identity provider',state,codeVerifier:verifier,codeChallenge:'FAKE_CHALLENGE',codeChallengeMethod:'S256',authURL:`https://fake.identity.invalid/authorize?state=${state}&code_challenge=FAKE_CHALLENGE&redirect_uri=`};
let methods=0,exchangeStatus=400,proofReads=0,proofStatus=200,writeAttempts=0;const exchanges=[],events=[],envelopeHeaders=[],blocked=[];
const lifecycle={};
const context=await browser.newContext({viewport:{width:1280,height:900}});
await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  const json=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(url.origin==='https://sentry.suisqp.cn'&&url.pathname==='/api/40/envelope/'){
    const lines=(request.postData()||'').split('\n');const envelopeHeader=JSON.parse(lines[0]);assert.deepEqual(Object.keys(envelopeHeader).sort(),['event_id','sent_at']);envelopeHeaders.push(envelopeHeader);for(let i=1;i<lines.length;i+=2){const header=JSON.parse(lines[i]||'{}');if(header.type==='event')events.push(JSON.parse(lines[i+1]));else throw Error('non-event envelope');}
    return json(200,{});
  }
  if(url.origin==='https://fake.identity.invalid')return route.fulfill({contentType:'text/html',body:'<p>Synthetic provider reached; no real OAuth request.</p>'});
  if(url.origin!==origin){blocked.push(url.origin);return route.abort();}
  if(url.pathname==='/api/collections/users/auth-methods'){
    methods++;if(methods===1)return json(503,{message:'FAKE OAuth methods temporarily unavailable'});
    return json(200,{mfa:{enabled:false},password:{enabled:false},oauth2:{enabled:true,providers:[provider]}});
  }
  if(url.pathname==='/api/collections/users/auth-with-oauth2'){
    exchanges.push(JSON.parse(request.postData()));
    if(exchangeStatus!==200)return json(exchangeStatus,{message:exchangeStatus===400?'FAKE expected authorization cancellation':'FAKE temporary OAuth exchange failure'});
    return json(200,{token:jwt,record:{id:userId,collectionId:'_pb_users_auth_',collectionName:'users',name:'模拟参与者（非真实教师）'}});
  }
  if(url.pathname.startsWith('/api/')&&request.method()!=='GET'){writeAttempts++;return json(405,{message:'synthetic browser forbids writes'});}
  if(url.pathname==='/api/collections/events/records')return json(200,{page:1,perPage:500,totalItems:1,totalPages:1,items:[{id:eventId,name:'模拟培训：消防演练（仅合成只读场景）',owner:userId,created:'2026-10-24 09:00:00.000Z'}]});
  if(url.pathname===`/api/collections/events/records/${eventId}`)return json(200,{id:eventId,name:'模拟培训：消防演练（仅合成只读场景）',owner:userId,created:'2026-10-24 09:00:00.000Z'});
  if(url.pathname==='/api/collections/check_ins/records')return json(200,{page:1,perPage:500,totalItems:1,totalPages:1,items:[{id:'FAKE_RECORD_001',user:userId,event:eventId,created:'2026-10-24 09:05:00.000Z',expand:{user:{name:'模拟参与者（非真实教师）'},event:{name:'模拟培训：消防演练'}}}]});
  if(url.pathname===`/api/qrcheck/events/${eventId}/proof`){proofReads++;if(proofStatus!==200)return json(proofStatus,{message:'FAKE QR response failure'});const now=Date.now(),counter=Math.floor(now/3000);return json(200,{v:1,e:eventId,c:counter,m:'b'.repeat(64),server_time_ms:now,expires_at_ms:(counter+5)*3000});}
  if(url.pathname.startsWith('/api/'))throw Error('unmodeled synthetic endpoint');
  if(url.pathname==='/__synthetic-inspect')return route.fulfill({contentType:'text/html',body:'<p>Synthetic same-origin session verification only.</p>'});
  const relative=url.pathname.startsWith('/assets/')?url.pathname.slice(1):'index.html';
  const file=path.join(root,'dist',relative);
  if(!fs.existsSync(file)||!file.startsWith(path.join(root,'dist')+path.sep))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
});
const page=await context.newPage();
const waitTelemetry=()=>page.waitForTimeout(250);
async function begin(){await page.locator('.login-btn').click();await page.waitForURL('https://fake.identity.invalid/**');await page.goto(origin+'/__synthetic-inspect');const saved=await page.evaluate(()=>sessionStorage.getItem('oauth2_provider'));assert.deepEqual(JSON.parse(saved),{name:'oidc',codeVerifier:verifier,codeChallenge:'FAKE_CHALLENGE',codeChallengeMethod:'S256',state});}
try{
  await page.goto(origin+'/login');await page.locator('.login-btn').click();await page.locator('.alert-error').waitFor();await waitTelemetry();assert(events.some(e=>e.tags.stage==='login.methods'));
  await begin();await page.goto(`${origin}/oauth-callback?code=${code}&state=${state}`);await page.locator('a[href="/login"]').waitFor();assert((await page.locator('body').innerText()).includes('FAKE expected authorization cancellation'));await waitTelemetry();assert(!events.some(e=>e.tags.stage==='oauth.exchange'));await page.screenshot({path:path.join(output,'_synthetic-oauth-expected400.png')});
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('oauth2_provider')),null);
  await page.locator('a[href="/login"]').click();await begin();exchangeStatus=503;await page.goto(`${origin}/oauth-callback?code=${code}&state=${state}`);await page.locator('a[href="/login"]').waitFor();await waitTelemetry();assert(events.some(e=>e.tags.stage==='oauth.exchange'));await page.screenshot({path:path.join(output,'_synthetic-oauth-retry503.png')});
  await page.locator('a[href="/login"]').click();await begin();exchangeStatus=200;await page.goto(`${origin}/oauth-callback?code=${code}&state=${state}`);await page.waitForURL(origin+'/events');await page.locator(`a[href="/display/${eventId}"]`).waitFor();await page.screenshot({path:path.join(output,'_synthetic-events.png')});
  await page.locator(`a[href="/display/${eventId}"]`).click();await page.locator('canvas:not([hidden])').waitFor();assert(proofReads>0);assert((await page.locator('body').innerText()).includes('模拟培训'));await page.screenshot({path:path.join(output,'_synthetic-qr-display.png')});
  await page.reload();await page.locator('canvas:not([hidden])').waitFor();lifecycle.persistedSessionReload=true;
  await context.setOffline(true);await page.locator('canvas[hidden]').waitFor({state:'attached'});lifecycle.offlineHidden=true;
  await page.screenshot({path:path.join(output,'_synthetic-qr-offline-hidden.png')});
  await context.setOffline(false);await page.locator('canvas:not([hidden])').waitFor();lifecycle.onlineRecovered=true;
  proofStatus=503;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.locator('canvas[hidden]').waitFor({state:'attached'});await waitTelemetry();assert(events.some(e=>e.tags.stage==='display.proof'));lifecycle.failedProofHidden=true;
  await page.screenshot({path:path.join(output,'_synthetic-qr-server-failure.png')});
  proofStatus=200;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.locator('canvas:not([hidden])').waitFor();lifecycle.serverRetryRecovered=true;
  const proofErrors=events.filter(e=>e.tags.stage==='display.proof').length;
  proofStatus=403;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.locator('canvas[hidden]').waitFor({state:'attached'});await waitTelemetry();assert.equal(events.filter(e=>e.tags.stage==='display.proof').length,proofErrors);lifecycle.permissionQuietAndHidden=true;
  proofStatus=200;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.locator('canvas:not([hidden])').waitFor();
  for(const offset of [86400000,-86400000]){
    await page.evaluate(value=>{globalThis.__syntheticRealNow ||= Date.now.bind(Date);Date.now=()=>globalThis.__syntheticRealNow()+value;window.dispatchEvent(new Event('online'));},offset);
    await page.locator('canvas:not([hidden])').waitFor();
  }
  lifecycle.browserClockPlusMinusDay=true;
  await page.evaluate(()=>{Date.now=globalThis.__syntheticRealNow;delete globalThis.__syntheticRealNow;});
  await page.goto(origin+'/history');await page.locator('.history-item').waitFor();assert((await page.locator('body').innerText()).includes('模拟培训'));await page.screenshot({path:path.join(output,'_synthetic-history.png')});lifecycle.historyRead=true;
  await page.goto(origin+'/events');await page.locator(`a[href="/display/${eventId}"]`).waitFor();await page.locator(`a[href="/display/${eventId}"]`).click();await page.locator('canvas:not([hidden])').waitFor();lifecycle.reenterDisplay=true;
  for(const exchange of exchanges){assert.equal(exchange.provider,'oidc');assert.equal(exchange.code,code);assert.equal(exchange.codeVerifier,verifier);assert.equal(exchange.redirectURL,origin+'/oauth-callback');}
  assert.equal(writeAttempts,0);assert.deepEqual(blocked,[]);
  for(const event of events){assert.equal(event.release,manifest.release);assert.equal(event.platform,'javascript');const encoded=JSON.stringify(event);for(const value of [code,state,verifier,eventId,userId,jwt,'b'.repeat(64),'FAKE temporary OAuth exchange failure'])assert(!encoded.includes(value));assert(!event.request);assert(!event.contexts);}
  const {TraceMap,originalPositionFor}=await import(process.env.TRACE_MAPPING_MODULE || '@jridgewell/trace-mapping');
  const callback=events.find(e=>e.tags.stage==='oauth.exchange');const positions=[];
  for(const exception of callback.exception.values)for(const frame of exception.stacktrace.frames){if(!frame.filename)continue;const map=JSON.parse(fs.readFileSync(path.join(root,'.monitoring-private',new URL(frame.filename).pathname.slice(1)+'.map'),'utf8'));positions.push(originalPositionFor(new TraceMap(map),{line:frame.lineno,column:frame.colno-1}));}
  assert(positions.some(p=>p.source?.endsWith('/pages/OAuthCallback.tsx')));
  fs.writeFileSync(path.join(output,'_synthetic-events.json'),JSON.stringify({envelopeHeaders,events},null,2));
  fs.writeFileSync(path.join(output,'_synthetic-summary.json'),JSON.stringify({scope:'offline real production artifact, fake OAuth identity and QR reads only',release:manifest.release,methods,exchanges:exchanges.length,proofReads,writeAttempts,lifecycle,stages:events.map(e=>e.tags.stage),sourceCoordinates:positions},null,2));
  console.log('Synthetic built OAuth failure/400/retry/return and QR display/reload passed; no real network or sign-in writes.');
}finally{await context.close();await browser.close();fs.rmSync(runtime,{recursive:true,force:true});}
