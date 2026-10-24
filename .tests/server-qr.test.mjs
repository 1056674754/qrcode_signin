import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServerQr } from '../web/src/lib/serverQr.ts';

const proof = () => ({ v: 1, e: 'event', c: 100, m: 'a'.repeat(64), server_time_ms: 300500, expires_at_ms: 315000 });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function setup(fetchProof = async () => proof(), renderOverride) {
  let time = 0, id = 0, visible = false, rendered;
  const tasks = new Map(), states = [];
  const controller = createServerQr({ eventId: 'event', fetchProof,
    render: renderOverride || (async (value, isCurrent) => { if (isCurrent()) { rendered = value; visible = true; } }),
    clear: () => { visible = false; }, onState: state => states.push(state), now: () => time,
    setTimer: (fn, delay) => { const key = ++id; tasks.set(key, { at: time + delay, fn }); return key; },
    clearTimer: key => tasks.delete(key),
  });
  return { controller, states, get visible() { return visible; }, get rendered() { return rendered; },
    async tick(ms) { const end = time + ms; while (true) {
      const next = [...tasks].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break; time = next[1].at; tasks.delete(next[0]); next[1].fn(); await flush();
    } time = end; await flush(); },
    jump(ms) { time += ms; }, taskCount: () => tasks.size,
  };
}
test('client wall clock plus/minus one day never changes server-issued payload', async () => {
  const original = Date.now;
  try { for (const offset of [-86400000, 86400000]) {
    Date.now = () => 1792800601250 + offset;
    const h = setup(); h.controller.refresh(); await flush();
    assert.equal(h.visible, true); assert.deepEqual(h.rendered, proof()); h.controller.stop();
  } } finally { Date.now = original; }
});
test('refresh failures hide an existing code and recover with a fresh response', async () => {
  let failed = false;
  const h = setup(async () => { if (failed) throw new Error('offline'); return proof(); });
  h.controller.refresh(); await flush(); assert.equal(h.visible, true);
  failed = true; await h.tick(3000); assert.equal(h.visible, false); assert.equal(h.states.at(-1), 'error');
  failed = false; h.controller.refresh(); await flush(); assert.equal(h.visible, true); h.controller.stop();
});
test('suspending hides immediately and late network responses cannot resurrect canvas', async () => {
  let resolve;
  const h = setup(() => new Promise(r => { resolve = r; }));
  h.controller.refresh(); h.controller.suspend(); resolve(proof()); await flush();
  assert.equal(h.visible, false); h.controller.stop(); assert.equal(h.taskCount(), 0);
});
test('hung request aborts and hides code instead of leaving a permanent stale canvas', async () => {
  let calls = 0, aborted = false;
  const h = setup(signal => { calls++; if (calls === 1) return Promise.resolve(proof()); signal.addEventListener('abort', () => { aborted = true; }); return new Promise(() => {}); });
  h.controller.refresh(); await flush(); assert.equal(h.visible, true);
  await h.tick(6000); assert.equal(h.visible, false);
  await h.tick(2000); assert.equal(aborted, true); h.controller.stop();
});
test('tab resume discards old work and immediately fetches a new proof', async () => {
  let calls = 0;
  const h = setup(async () => ({ ...proof(), m: (++calls === 1 ? 'a' : 'b').repeat(64) }));
  h.controller.refresh(); await flush(); h.controller.suspend(); assert.equal(h.visible, false);
  h.jump(100000); h.controller.refresh(); await flush();
  assert.equal(h.visible, true); assert.equal(h.rendered.m, 'b'.repeat(64)); h.controller.stop();
});
test('slow QR drawing cannot publish after its validity budget elapsed', async () => {
  let finish;
  const h = setup(async () => proof(), async (_, isCurrent) => { await new Promise(r => { finish = r; }); assert.equal(isCurrent(), false); });
  h.controller.refresh(); await flush(); h.jump(7000); finish(); await flush();
  assert.equal(h.visible, false); assert.equal(h.states.at(-1), 'error'); h.controller.stop();
});
test('malformed and cross-event proofs never display a QR', async () => {
  for (const changed of [{ e: 'other' }, { m: 'invalid' }, { c: NaN }, { expires_at_ms: 300000 }, { server_time_ms: Infinity }]) {
    const h = setup(async () => ({ ...proof(), ...changed })); h.controller.refresh(); await flush();
    assert.equal(h.visible, false); assert.equal(h.states.at(-1), 'error'); h.controller.stop();
  }
});
test('response arriving after request timeout cannot resurrect a hidden code', async () => {
  let resolve;
  const h = setup(() => new Promise(r => { resolve = r; }));
  h.controller.refresh(); await h.tick(5000);
  assert.equal(h.visible, false); assert.equal(h.states.at(-1), 'error');
  resolve(proof()); await flush(); assert.equal(h.visible, false); h.controller.stop();
});
test('older request cannot overwrite a newer refresh', async () => {
  const resolves = [];
  const h = setup(() => new Promise(r => resolves.push(r)));
  h.controller.refresh(); h.controller.refresh();
  resolves[1]({ ...proof(), m: 'b'.repeat(64) }); await flush();
  assert.equal(h.rendered.m, 'b'.repeat(64));
  resolves[0](proof()); await flush(); assert.equal(h.rendered.m, 'b'.repeat(64)); h.controller.stop();
});
test('stopping cancels all timers and discards an in-flight render', async () => {
  let finish;
  const h = setup(async () => proof(), async (_, isCurrent) => { await new Promise(r => { finish = r; }); assert.equal(isCurrent(), false); });
  h.controller.refresh(); await flush(); h.controller.stop(); finish(); await flush();
  assert.equal(h.visible, false); assert.equal(h.taskCount(), 0);
});
