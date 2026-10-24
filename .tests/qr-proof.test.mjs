import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHmac } from 'node:crypto';

const eventId = 'fixtureevent001';
const secret = 'fixture-secret-not-production';
const now = 1792800601250;
const hs256 = (msg, key) => createHmac('sha256', key).update(msg).digest('hex');
function signer({ auth = { id: 'host' }, owner = 'host', missing = false } = {}) {
  let route;
  const headers = {};
  const context = {
    Date: { now: () => now },
    routerAdd: (method, path, handler, middleware) => { route = { method, path, handler, middleware }; },
    $apis: { requireAuth: () => 'require-auth' },
    $security: { hs256 },
    ForbiddenError: class extends Error {},
    $app: { findRecordById: (collection, id) => {
      assert.equal(collection, 'events'); assert.equal(id, eventId);
      if (missing) throw new Error('not found');
      return { get: key => ({ owner, secret_key: secret })[key] };
    } },
  };
  vm.runInNewContext(readFileSync(new URL('../pb_hooks/qr_proof.pb.js', import.meta.url), 'utf8'), context);
  assert.equal(route.method, 'GET');
  assert.equal(route.path, '/api/qrcheck/events/{eventId}/proof');
  assert.equal(route.middleware, 'require-auth');
  const request = {
    auth,
    request: { pathValue: () => eventId },
    response: { header: () => ({ set: (key, value) => { headers[key] = value; } }) },
    json: (status, data) => ({ status, data: JSON.parse(JSON.stringify(data)), headers }),
  };
  return () => route.handler(request);
}
function checkin(proof, time) {
  let handler;
  let persisted = false;
  const body = { event: eventId, proof: JSON.stringify(proof) };
  vm.runInNewContext(readFileSync(new URL('../pb_hooks/check_ins.pb.js', import.meta.url), 'utf8'), {
    onRecordCreateRequest: fn => { handler = fn; }, Date: { now: () => time },
    Record: class { set() {} }, BadRequestError: class extends Error {}, $security: { hs256 },
    $app: { findCollectionByNameOrId: () => ({}), save() {}, logger: () => ({ info() {}, warn() {} }),
      findRecordById: () => ({ get: () => secret }) },
  });
  handler({ requestInfo: () => ({ body, auth: { id: 'attendee' } }), record: { get: key => body[key], set() {} }, next: () => { persisted = true; } });
  return persisted;
}

test('event responses hide the signing secret without changing its stored value', () => {
  let enrich;
  vm.runInNewContext(readFileSync(new URL('../pb_hooks/events.pb.js', import.meta.url), 'utf8'), {
    onRecordCreateRequest() {}, onRecordEnrich: fn => { enrich = fn; },
  });
  assert.equal(typeof enrich, 'function');
  const fields = { secret_key: secret, name: 'Staff training' };
  const hidden = new Set();
  enrich({ record: { hide: field => hidden.add(field) }, next() {} });
  const response = Object.fromEntries(Object.entries(fields).filter(([key]) => !hidden.has(key)));
  assert.equal(response.secret_key, undefined);
  assert.equal(fields.secret_key, secret);
  assert.equal(response.name, 'Staff training');
});

test('owner receives server-timed proof accepted by unchanged checkin validation', () => {
  const { status, data, headers } = signer()();
  assert.equal(status, 200);
  assert.equal(data.c, 597600200);
  assert.equal(data.server_time_ms, now);
  assert.equal(data.expires_at_ms, 1792800615000);
  assert.equal(data.e, eventId);
  assert.equal(data.v, 1);
  assert.equal(data.m, hs256('597600200|fixtureevent001', secret));
  assert.match(headers['Cache-Control'], /no-store/);
  assert.equal(JSON.stringify(data).includes(secret), false);
  assert.equal(checkin(data, now), true);
  assert.throws(() => checkin(data, 1792800615000), /invalid or expired code/);
});
test('anonymous cannot obtain proof even before middleware enforcement', () => {
  assert.throws(signer({ auth: null }), /./);
});
test('another authenticated user cannot mint an owner proof', () => {
  assert.throws(signer({ auth: { id: 'other' } }), /./);
});
test('nonexistent events do not yield any proof', () => {
  assert.throws(signer({ missing: true }), /not found/);
});
