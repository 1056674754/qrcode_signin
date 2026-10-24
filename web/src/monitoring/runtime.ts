import {BrowserClient, Scope, defaultStackParser, makeFetchTransport} from '@sentry/browser';
import type {Event, EventHint, ErrorEvent as SentryErrorEvent} from '@sentry/browser';
import {applyScopeDataToEvent, getDebugImagesForResources, notifyEventProcessors, uuid4} from '@sentry/core';
import {APP, safeResource, safeRoute, scrubEvent, validStage, validEndpoint} from './policy';
type BrowserClientOptions = ConstructorParameters<typeof BrowserClient>[0];
function snapshotException(error: unknown): Error {
  const snapshot = new Error('SuisLink frontend failure');
  try {
    if (error instanceof Error) {snapshot.name = error.name; snapshot.stack = error.stack;}
  } catch { /* Host-owned error properties need not be readable. */ }
  return snapshot;
}

// SDK 9.47 prepareEvent unconditionally merges the global scope, even when an
// isolation scope is supplied. Error-only preparation must never enter that path.
export class IsolatedBrowserClient extends BrowserClient {
  private readonly localIsolation = new Scope();
  private readonly capturedOriginals = new WeakSet<object>();
  private internalCaptureInFlight = false;
  captureException(error: unknown, hint: EventHint = {}, scope?: Scope): string {
    const internal = hint.data?.__sentry__ === true;
    const original = (typeof error === 'object' && error !== null) || typeof error === 'function' ? error as object : undefined;
    // Preserve SDK duplicate suppression without marking any host-owned object.
    if ((original && this.capturedOriginals.has(original)) || (internal && this.internalCaptureInFlight)) return hint.event_id || uuid4();
    if (original) this.capturedOriginals.add(original);
    if (internal) this.internalCaptureInFlight = true;
    const snapshot = snapshotException(error);
    return super.captureException(snapshot, {...hint, originalException:snapshot}, scope);
  }
  protected _prepareEvent(event: Event, hint: EventHint, scope: Scope): PromiseLike<Event | null> {
    const options = this.getOptions();
    const prepared: Event = {...event, platform:'javascript', event_id:event.event_id || hint.event_id,
      timestamp:event.timestamp || Date.now()/1000, release:options.release,
      environment:options.environment, dist:options.dist};
    const ownData = scope.getScopeData();
    applyScopeDataToEvent(prepared, ownData);
    // Only processors explicitly owned by this client/scope may veto its event.
    return notifyEventProcessors([...this.getEventProcessors(), ...ownData.eventProcessors], prepared, hint).then(result => {
      if (!result) return null;
      const files = (result.exception?.values || []).flatMap(exception =>
        (exception.stacktrace?.frames || []).map(frame => frame.abs_path || frame.filename || ''));
      const images = getDebugImagesForResources(options.stackParser || defaultStackParser, files);
      if (images.length) result.debug_meta = {images};
      return result;
    });
  }
  protected _captureEvent(event: Event, hint: EventHint = {}, scope: Scope = new Scope()): PromiseLike<string | undefined> {
    const pending = super._captureEvent(event, hint, scope, this.localIsolation);
    if (hint.data?.__sentry__ !== true) return pending;
    return pending.then(id => {this.internalCaptureInFlight = false; return id;}, error => {
      this.internalCaptureInFlight = false;
      throw error;
    });
  }
}

export function eventOnlyTransport(factory: BrowserClientOptions['transport']): BrowserClientOptions['transport'] {
  return options => {
    const transport=factory(options);
    return {...transport,send(envelope){
      const items: [{type:'event'},SentryErrorEvent][] = envelope[1].filter(item=>item[0].type==='event').map(item=>[{type:'event'},scrubEvent(item[1] as Record<string,any>) as SentryErrorEvent]);
      const eventId=items[0]?.[1].event_id;
      if (!items.length || typeof eventId!=='string' || !/^[a-f0-9]{32}$/.test(eventId)) return Promise.resolve({});
      return transport.send([{sent_at:new Date().toISOString(),event_id:eventId},items]);
    },flush:timeout=>transport.flush(timeout)};
  };
}
export type Options = {release:string;environment:'production'|'test';target?:EventTarget;transport?:BrowserClientOptions['transport']};
export function createMonitoring(options: Options) {
  let disposed=false;
  const scope=new Scope();
  const crumbs: Record<string,unknown>[]=[];
  const seen=new WeakSet<object>();
  const recent=new Map<string,number>();
  const client=new IsolatedBrowserClient({dsn:'https://abc90428a709daa8ef80ad813dff8728@sentry.suisqp.cn/40',release:options.release,environment:options.environment,integrations:[],transport:eventOnlyTransport(options.transport||makeFetchTransport),stackParser:defaultStackParser,sendDefaultPii:false,sendClientReports:false,sampleRate:1,beforeSend:event=>scrubEvent({...event,breadcrumbs:[...crumbs]}) as SentryErrorEvent});
  scope.setClient(client);client.init();
  function capture(error:unknown,stage:string,tags:Record<string,string>={}) {
    if (disposed || !validStage(stage)) return;
    try {
      if (error && typeof error==='object' && seen.has(error)) return;
      const snapshot=snapshotException(error);
      const key=stage+':'+(validEndpoint(tags.endpoint)?tags.endpoint:'')+':'+snapshot.name;
      const now=Date.now();
      if (recent.has(key) && recent.get(key)!>now-10000) return;
      recent.set(key,now);if(recent.size>100)recent.delete(recent.keys().next().value as string);
      if(error && typeof error==='object')seen.add(error);
      const owned=scope.clone();owned.setTags({...tags,app:APP,stage});owned.setFingerprint(['{{ default }}',APP,stage]);
      return owned.captureException(snapshot);
    } catch { return undefined; }
  }
  function navigation(raw:string){if(!disposed){crumbs.push({category:'navigation',data:{route:safeRoute(raw)}});if(crumbs.length>30)crumbs.shift();}}
  const target=options.target || (typeof window!=='undefined'?window:undefined);
  const onError=(raw:globalThis.Event)=>{
    const event=raw as ErrorEvent;
    if(event.error){if(!quiet(event.error))capture(event.error,'standalone.error');}
    else if(typeof HTMLScriptElement!=='undefined' && (event.target instanceof HTMLScriptElement || event.target instanceof HTMLLinkElement)){
      const resource=event.target instanceof HTMLScriptElement?event.target.src:event.target.href;
      if(safeResource(resource))capture(new Error('SuisLink resource failure'),'resource.load');
    }
  };
  const onRejection=(raw:globalThis.Event)=>{const reason=(raw as PromiseRejectionEvent).reason;if(!quiet(reason))capture(reason,'standalone.rejection');};
  target?.addEventListener('error',onError,true);target?.addEventListener('unhandledrejection',onRejection);
  return {capture,navigation,async flush(){try{return await client.flush(1000);}catch{return false;}},async dispose(){if(disposed)return;disposed=true;target?.removeEventListener('error',onError,true);target?.removeEventListener('unhandledrejection',onRejection);crumbs.length=0;recent.clear();scope.clear();try{await client.close(1000);}catch{}}};
}
function quiet(error:unknown):boolean {
  try {
    if (!error || typeof error!=='object') return false;
    const e=error as {status?:unknown;isAbort?:unknown;name?:unknown};
    return e.isAbort===true || ['AbortError','NotAllowedError','NotFoundError','NotReadableError','OverconstrainedError'].includes(String(e.name)) || typeof e.status==='number' && e.status>=400 && e.status<500;
  } catch {return true;}
}
export function reportCaught(error:unknown,stage:string,endpoint?:string,monitor:Pick<ReturnType<typeof createMonitoring>,'capture'>|undefined=monitoring) {
  try {
    if (!monitor || !validStage(stage) || quiet(error)) return;
    let status:unknown;
    if(error && typeof error==='object')status=(error as {status?:unknown}).status;
    const tags:Record<string,string>={};
    if(validEndpoint(endpoint))tags.endpoint=endpoint;
    if(typeof status==='number' && Number.isInteger(status) && status>=0 && status<=599)tags.http_status='http:'+status;
    // Never pass PocketBase errors: response, URL, originalError and message can contain auth/QR/person data.
    monitor.capture(new Error('SuisLink frontend failure'),stage,tags);
  } catch { /* Monitoring cannot alter auth, camera, server clock or UI results. */ }
}
let monitoring: ReturnType<typeof createMonitoring>|undefined;
export function initializeMonitoring(){
  try {
    if(!monitoring && import.meta.env.PROD && window.location.protocol==='https:' && window.location.hostname==='stfact.suisqp.cn')monitoring=createMonitoring({release:__SENTRY_RELEASE__,environment:'production'});
  }catch{/* Privacy-safe disabled state must not break mounting. */}
  return monitoring;
}
export const captureRender=(error:unknown)=>{try{monitoring?.capture(error,'react.render');}catch{}};
export const recordNavigation=(path:string)=>{try{monitoring?.navigation(path);}catch{}};
