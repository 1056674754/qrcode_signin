import {test, expect} from 'bun:test';
import {scrubEvent, safeRoute} from '../src/monitoring/policy';
import {createMonitoring, eventOnlyTransport, reportCaught} from '../src/monitoring/runtime';
import {getGlobalScope} from '@sentry/core';
const release='qrcode-signin-web@'+'a'.repeat(40)+'+'+'b'.repeat(12);
const secret='FAKE_person_PKCE_qr_eventId_OAuth_token';

test('semantic route never contains event identifiers, OAuth query or unknown paths',()=>{
  expect(safeRoute('/display/FAKE_EVENT?code='+secret)).toBe('/display/:eventId');
  expect(safeRoute('/oauth-callback?state='+secret)).toBe('/oauth-callback');
  expect(safeRoute('/s/FAKE_EVENT?m='+secret)).toBe('/s/:eventId');
  expect(safeRoute('/'+secret)).toBe('/unknown');
});
test('privacy is an allowlist including final headers, source coordinates, no payloads',()=>{
  const clean=scrubEvent({event_id:'a'.repeat(32),release,user:{email:secret},request:{url:secret,headers:{Cookie:secret}},contexts:{state:secret},extra:{body:secret},message:secret,tags:{app:'qrcode-signin',stage:'oauth.exchange',endpoint:'auth.exchange',eventId:secret},exception:{values:[{type:secret,value:secret,stacktrace:{frames:[{filename:'https://stfact.suisqp.cn/assets/index-abcdefgh.js?code='+secret,lineno:17,colno:29,vars:{secret},function:secret}]}}]},breadcrumbs:[{category:'console',message:secret}]});
  expect(JSON.stringify(clean)).not.toContain(secret);
  expect(clean.platform).toBe('javascript');
  expect(clean.exception.values[0].stacktrace.frames[0]).toMatchObject({filename:'https://stfact.suisqp.cn/assets/index-abcdefgh.js',lineno:17,colno:29});
  expect(clean.request).toBeUndefined();
  expect(clean.user).toEqual({ip_address:'0.0.0.0'});
});
test('envelope discards non-events and rescrubs late event mutation and envelope headers',async()=>{
  const sent:any[]=[];
  const transport=eventOnlyTransport(()=>({send:async(e:any)=>{sent.push(e);return {};},flush:async()=>true}))({} as any);
  await transport.send([{dsn:secret,trace:{secret}},[[{type:'attachment'},secret],[{type:'event'},{event_id:'a'.repeat(32),platform:secret,extra:{secret}}]]] as any);
  expect(sent.length).toBe(1);expect(JSON.stringify(sent)).not.toContain(secret);expect(sent[0][1].length).toBe(1);expect(sent[0][1][0][1].platform).toBe('javascript');
});
test('actual SDK isolates global processors, scope, attachments and never marks original',async()=>{
  const host=getGlobalScope();const sent:any[]=[];let hostRuns=0;
  host.setTag('private',secret);host.addAttachment({filename:secret,data:secret});host.addEventProcessor(e=>{hostRuns++;return {...e,extra:{secret}};});
  const monitoring=createMonitoring({release,environment:'test',target:new EventTarget(),transport:()=>({send:async(e:any)=>{sent.push(e);return {};},flush:async()=>true})});
  const error=new TypeError(secret);error.stack='TypeError: '+secret+'\n    at synthetic (https://stfact.suisqp.cn/assets/index-abcdefgh.js:17:29)';
  const originalKeys=Object.getOwnPropertyNames(error);
  monitoring.capture(error,'react.render');await monitoring.flush();
  expect(sent.length).toBe(1);expect(hostRuns).toBe(0);expect(JSON.stringify(sent)).not.toContain(secret);expect(Object.getOwnPropertyNames(error)).toEqual(originalKeys);
  expect(sent[0][1][0][1].platform).toBe('javascript');expect(sent[0][1][0][1].exception.values[0].stacktrace.frames[0].lineno).toBe(17);
  await monitoring.dispose();host.clear();
});
test('caught stages keep permission, user400, cancellation and camera rejection quiet without reading message/body',()=>{
  const got:any[]=[]; const m={capture:(_e:any,stage:string,tags:any)=>got.push([stage,tags])};
  for(const status of [400,401,403,404,409,422])reportCaught({status,get message(){throw Error('read private message');}},'oauth.exchange','auth.exchange',m);
  reportCaught({isAbort:true,status:0},'display.proof','qr.proof',m);
  reportCaught({name:'NotAllowedError'},'checkin.camera',undefined,m);
  expect(got).toEqual([]);
  reportCaught({status:503,response:{secret}},'oauth.exchange','auth.exchange',m);
  expect(got).toEqual([['oauth.exchange',{endpoint:'auth.exchange',http_status:'http:503'}]]);
});
test('owned standalone listeners dispose without replacing host handlers and local dedup bounds repeats',async()=>{
  const target=new EventTarget();let host=0;target.addEventListener('error',()=>host++);const sent:any[]=[];
  const m=createMonitoring({release,environment:'test',target,transport:()=>({send:async(e:any)=>{sent.push(e);return {};},flush:async()=>true})});
  const ev=new Event('error');Object.assign(ev,{error:new Error(secret)});target.dispatchEvent(ev);target.dispatchEvent(ev);await m.flush();expect(host).toBe(2);expect(sent.length).toBe(1);
  await m.dispose();target.dispatchEvent(ev);expect(host).toBe(3);expect(sent.length).toBe(1);
});
for(const kind of ['retained','fresh'])test('SDK internal processor '+kind+' failure is bounded and unmarked',async()=>{
  const {IsolatedBrowserClient}=await import('../src/monitoring/runtime');const sdk=await import('@sentry/browser');
  const retained=Error(secret);let calls=0,enabled=true;const events:any[]=[];
  const client=new IsolatedBrowserClient({dsn:'https://abc90428a709daa8ef80ad813dff8728@sentry.suisqp.cn/40',release,environment:'test',integrations:[],stackParser:sdk.defaultStackParser,transport:()=>({send:async(e:any)=>{events.push(e);return {};},flush:async()=>true})});
  client.addEventProcessor(e=>{calls++;if(enabled)throw kind==='retained'?retained:Error(secret);return e;});client.init();const scope=new sdk.Scope();scope.setClient(client);
  scope.captureException(Error('initial'));await client.flush(1000);expect(calls).toBe(2);expect(events.length).toBe(0);expect(Object.hasOwn(retained,'__sentry_captured__')).toBe(false);
  enabled=false;scope.captureException(Error('later'));await client.flush(1000);expect(events.length).toBe(1);await client.close(1000);
});
test('debug IDs and source coordinates survive final actual SDK rescrub',async()=>{
  const filename='https://stfact.suisqp.cn/assets/index-abcdefgh.js';const debugId='b1234567-b123-b123-b123-b123456789ab';const stack='Error\n    at synthetic ('+filename+':51:23)';const old=(globalThis as any)._sentryDebugIds;
  (globalThis as any)._sentryDebugIds={[stack]:debugId};const events:any[]=[];const m=createMonitoring({release,environment:'test',target:new EventTarget(),transport:()=>({send:async(e:any)=>{events.push(e);return {};},flush:async()=>true})});
  try{const error=Error(secret);error.stack=stack;m.capture(error,'oauth.exchange');await m.flush();const event=events[0][1][0][1];expect(event.debug_meta.images).toEqual([{type:'sourcemap',debug_id:debugId,code_file:filename}]);expect(event.exception.values[0].stacktrace.frames[0]).toMatchObject({filename,lineno:51,colno:23});expect(event.platform).toBe('javascript');}
  finally{await m.dispose();(globalThis as any)._sentryDebugIds=old;}
});
for(const itemType of ['attachment','replay_event','replay_recording','transaction','profile','session','sessions','span'])test('final transport drops '+itemType+' even with private payload',async()=>{
  let sent=0;const transport=eventOnlyTransport(()=>({send:async()=>{sent++;return {};},flush:async()=>true}))({} as any);
  await transport.send([{dsn:secret},[[{type:itemType},secret]]] as any);expect(sent).toBe(0);
});
for(const outcome of ['null','throw'])test('host global processor '+outcome+' cannot veto owned errors',async()=>{
  const host=getGlobalScope();let runs=0;const retained=Error(secret);host.addEventProcessor(()=>{runs++;if(outcome==='throw')throw retained;return null;});
  const sent:any[]=[];const m=createMonitoring({release,environment:'test',target:new EventTarget(),transport:()=>({send:async(e:any)=>{sent.push(e);return {};},flush:async()=>true})});
  m.capture(Error(secret),'react.render');await m.flush();expect(sent.length).toBe(1);expect(runs).toBe(0);expect(Object.hasOwn(retained,'__sentry_captured__')).toBe(false);await m.dispose();host.clear();
});
