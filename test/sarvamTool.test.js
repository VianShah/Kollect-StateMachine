const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');

const sent = [];
require.cache[require.resolve('node-fetch')] = {
  id: 'node-fetch', filename: 'node-fetch', loaded: true,
  exports: async (url, opts) => { sent.push({ url, body: JSON.parse(opts.body) }); return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.T' }] }) }; },
};
Object.assign(process.env, { META_WA_ACCESS_TOKEN: 't', META_WA_PHONE_NUMBER_ID: '1', META_WA_MESSAGING_ACC_ID: '2', WHATSAPP_MODE: 'live', SARVAM_TOOL_SECRET: 's3cret' });

const store = require('../server/lib/store');
const router = require('../server/routes/sarvamTool');

let server, base;
test.before(async () => {
  const app = express(); app.use(express.json()); app.use('/api', router);
  server = http.createServer(app); await new Promise(r => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}/api/tools/send-whatsapp`;
});
test.after(() => server.close());
test.beforeEach(() => { sent.length = 0; });

const post = (body, headers = { Authorization: 'Bearer s3cret' }) => new Promise((resolve) => {
  const req = http.request(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
    let d = ''; res.on('data', c => d += c); res.on('end', () => { let b = null; try { b = d ? JSON.parse(d) : null; } catch (_) { b = d; } resolve({ status: res.statusCode, body: b }); });
  });
  req.end(JSON.stringify(body));
});

test('rejects a missing or wrong secret', async () => {
  assert.equal((await post({ phone: '9876500001' }, {})).status, 401);
  assert.equal((await post({ phone: '9876500001' }, { Authorization: 'Bearer nope' })).status, 401);
  assert.equal(sent.length, 0);
});

test('refuses a number with no recent Sarvam call', async () => {
  const r = await post({ phone: '9876500002' });
  assert.equal(r.status, 403);
  assert.equal(sent.length, 0);
});

test('refuses a call that is not a Sarvam call', async () => {
  store.createCase('c-voiz', { phone: '+919876500003', provider: 'voiz' });
  assert.equal((await post({ phone: '9876500003' })).status, 403);
});

test('sends via Meta for an active Sarvam call, then dedupes', async () => {
  store.createCase('c1', { name: 'Asha', phone: '+919876500004', provider: 'sarvam', sarvamAppId: 'Snampint-Pr-f9e99bbc-8a68' });
  const r = await post({ phone: '9876500004', interaction_id: 'int-1' });
  assert.equal(r.body.status, 'sent');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.to, '919876500004');
  assert.deepEqual(sent[0].body.template.components[0].parameters.map(p => p.text),
    ['Asha', '4500', '1 days', 'https://snapmint.example/pay']);
  const again = await post({ phone: '9876500004' });
  assert.equal(again.body.status, 'already_sent');
  assert.equal(sent.length, 1);
});

test('will not send the human-agent escalation template', async () => {
  store.createCase('c2', { phone: '+919876500005', provider: 'sarvam' });
  assert.equal((await post({ phone: '9876500005', templateKey: 'escalation' })).status, 400);
});
