type Dict = Record<string, any>;
export const APP = 'qrcode-signin';
const stages = new Set(['app.bootstrap','react.render','standalone.error','standalone.rejection','resource.load','login.methods','login.redirect','oauth.exchange','events.load','events.create','events.export','history.load','display.load','display.checkins','display.proof','display.render','checkin.submit','checkin.event','checkin.camera']);
const endpoints = new Set(['auth.methods','auth.exchange','auth.wecom','events.list','events.create','events.read','checkins.list','checkins.create','qr.proof']);
const names = new Set(['Error','TypeError','ReferenceError','SyntaxError','RangeError','URIError','EvalError','AggregateError','AbortError','NetworkError','ChunkLoadError']);
const assets = /^\/assets\/[a-zA-Z0-9_.-]+-[a-zA-Z0-9_-]{8,64}\.(?:js|css)$/;
export const validStage = (value: unknown): value is string => typeof value === 'string' && stages.has(value);
export const validEndpoint = (value: unknown): value is string => typeof value === 'string' && endpoints.has(value);
export function safeRoute(raw: unknown): string {
  if (typeof raw !== 'string') return '/unknown';
  try {
    const path = new URL(raw,'https://route.invalid').pathname;
    if (['/','/login','/oauth-callback','/events','/checkin','/history'].includes(path)) return path;
    if (/^\/display\/[^/]+$/.test(path)) return '/display/:eventId';
    if (/^\/s\/[^/]+$/.test(path)) return '/s/:eventId';
  } catch { /* Untrusted location is never retained. */ }
  return '/unknown';
}
export function safeResource(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && url.hostname === 'stfact.suisqp.cn' && !url.username && !url.password && !url.port && assets.test(url.pathname)) return url.origin + url.pathname;
  } catch { /* Only this application's emitted assets can retain coordinates. */ }
  return undefined;
}
function safeTags(input: Dict = {}): Dict {
  const tags: Dict = {app:APP,policy:'qrcode-web-v2'};
  if (validStage(input.stage)) tags.stage=input.stage;
  if (validEndpoint(input.endpoint)) tags.endpoint=input.endpoint;
  if (typeof input.http_status==='string' && /^http:(?:0|[1-5]\d\d)$/.test(input.http_status)) tags.http_status=input.http_status;
  return tags;
}
export function scrubEvent(input: Dict): Dict {
  const out: Dict = {platform:'javascript',level:'error',message:'SuisLink frontend failure',user:{ip_address:'0.0.0.0'},tags:safeTags(input.tags)};
  if (/^[a-f0-9]{32}$/.test(input.event_id)) out.event_id=input.event_id;
  if (typeof input.timestamp==='number' && Number.isFinite(input.timestamp)) out.timestamp=input.timestamp;
  if (typeof input.release==='string' && /^qrcode-signin-web@[a-f0-9]{40}\+[a-f0-9]{12}$/.test(input.release)) out.release=input.release;
  if (['production','test'].includes(input.environment)) out.environment=input.environment;
  if (Array.isArray(input.exception?.values)) out.exception={values:input.exception.values.slice(0,3).map((e:Dict)=>({type:names.has(e.type)?e.type:'Error',value:'SuisLink frontend failure',mechanism:{type:'generic',handled:e.mechanism?.handled!==false},stacktrace:{frames:(e.stacktrace?.frames||[]).slice(-50).map((f:Dict)=>({filename:safeResource(f.filename),abs_path:safeResource(f.abs_path),lineno:Number.isInteger(f.lineno)?f.lineno:undefined,colno:Number.isInteger(f.colno)?f.colno:undefined,in_app:Boolean(f.in_app)}))}}))};
  out.breadcrumbs=(input.breadcrumbs||[]).slice(-30).flatMap((b:Dict)=>{
    if (b.category==='navigation') return [{category:'navigation',type:'default',data:{route:safeRoute(b.data?.route)}}];
    if (b.category==='lifecycle' && validStage(b.data?.stage)) return [{category:'lifecycle',type:'default',data:{stage:b.data.stage}}];
    return [];
  });
  if (Array.isArray(input.debug_meta?.images)) out.debug_meta={images:input.debug_meta.images.slice(0,20).filter((i:Dict)=>safeResource(i.code_file) && typeof i.debug_id==='string' && /^[a-f0-9-]{36}$/.test(i.debug_id)).map((i:Dict)=>({type:'sourcemap',debug_id:i.debug_id,code_file:safeResource(i.code_file)}))};
  if (Array.isArray(input.fingerprint)) out.fingerprint=input.fingerprint.filter((s:unknown)=>s==='{{ default }}'||s===APP||validStage(s)||validEndpoint(s)).slice(0,5);
  return out;
}
