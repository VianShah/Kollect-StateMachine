const test = require('node:test');
const assert = require('node:assert');

// Stub node-fetch before the modules under test load it.
const calls = [];
let responder = () => ({ status: 200, json: { messages: [{ id: 'wamid.X' }] } });
require.cache[require.resolve('node-fetch')] = {
  id: 'node-fetch', filename: 'node-fetch', loaded: true,
  exports: async (url, opts) => {
    calls.push({ url, opts, body: opts.body ? JSON.parse(opts.body) : null });
    const r = responder(url, opts);
    return { ok: r.status < 400, status: r.status, json: async () => r.json };
  },
};

Object.assign(process.env, {
  META_WA_ACCESS_TOKEN: 'tok', META_WA_PHONE_NUMBER_ID: '111', META_WA_MESSAGING_ACC_ID: '222',
  WHATSAPP_MODE: 'live', WHATSAPP_AUTH_ID: 'a', WHATSAPP_AUTH_TOKEN: 'b', WHATSAPP_CHANNEL_ID: 'c', WHATSAPP_WABA_ID: 'd',
});
const whatsapp = require('../server/lib/whatsapp');
const meta = require('../server/lib/metaWhatsapp');
const templateConfig = require('../server/lib/whatsappTemplateConfig');

test.beforeEach(() => { calls.length = 0; meta._resetCache(); responder = () => ({ status: 200, json: { messages: [{ id: 'wamid.X' }] } }); });

test('Meta is primary and sends digits-only number with cleaned params', async () => {
  const r = await whatsapp.sendTemplate('paymentReminder', { to: '+919876543210', vars: { message: 'Line1\nLine2', name: 'Asha' } });
  assert.equal(r.provider, 'meta');
  assert.equal(r.status, 'sent');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /graph\.facebook\.com\/v20\.0\/111\/messages$/);
  assert.equal(calls[0].body.to, '919876543210');
  assert.equal(calls[0].body.template.components[0].parameters.length, 4);
  assert.equal(meta.cleanParam('Line1\nLine2'), 'Line1 | Line2');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
});

test('falls back to Vobiz when Meta fails, and says so', async () => {
  responder = (url) => url.includes('graph.facebook.com')
    ? { status: 400, json: { error: { code: 132001, message: 'Template does not exist' } } }
    : { status: 200, json: { id: 'v1', status: 'pending' } };
  const r = await whatsapp.sendTemplate('followup', { to: '+919876543210', vars: { message: 'hi' } });
  assert.equal(r.fallbackFrom, 'meta');
  assert.match(r.metaError, /Template does not exist/);
  assert.equal(r.voizMessageId, 'v1');
  assert.equal(calls.length, 2);
});

test('no fallback result hides the Meta error when Vobiz is not configured', async () => {
  const cfg = require('../server/config');
  const saved = cfg.whatsapp.authId; cfg.whatsapp.authId = '';
  responder = () => ({ status: 400, json: { error: { code: 131047, message: 're-engagement' } } });
  const r = await whatsapp.sendTemplate('paymentReminder', { to: '+919876543210', vars: { message: 'x' } });
  cfg.whatsapp.authId = saved;
  assert.equal(r.status, 'failed');
  assert.match(r.error, /re-engagement/);
  assert.equal(calls.length, 1);
});

test('mock mode never calls Meta', async () => {
  whatsapp.modeState.setMode('mock');
  const r = await whatsapp.sendTemplate('paymentReminder', { to: '+919876543210', vars: { message: 'x' } });
  whatsapp.modeState.setMode('live');
  assert.equal(r.mode, 'mock');
  assert.equal(calls.length, 0);
});

test('lists only approved templates with variable counts', async () => {
  responder = () => ({ status: 200, json: { data: [
    { name: 'a', language: 'en', category: 'UTILITY', status: 'APPROVED', components: [{ type: 'BODY', text: 'Hi {{1}}, due {{2}}' }] },
    { name: 'b', language: 'en', category: 'UTILITY', status: 'PENDING', components: [{ type: 'BODY', text: 'x' }] },
    { name: 'c', language: 'en', category: 'MARKETING', status: 'APPROVED', components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'y' }] },
  ] } });
  const l = await meta.listTemplates({ refresh: true });
  assert.deepEqual(l.templates.map(t => [t.name, t.paramCount, t.usable]), [['a', 2, true], ['c', 0, false]]);
  assert.match(calls[0].url, /\/222\/message_templates/);
});

test('template config substitutes tokens', () => {
  assert.deepEqual(templateConfig.renderParams(['{{name}}: {{message}}', 'x'], { name: 'A', message: 'M' }), ['A: M', 'x']);
});

test('defaults fill every variable of the approved templates', async () => {
  const r = await whatsapp.sendTemplate('paymentReminder', { to: '+919876543210', vars: { message: 'm', name: 'Asha', phone: '+919876543210' } });
  assert.equal(r.status, 'sent');
  assert.deepEqual(calls[0].body.template.components[0].parameters.map(p => p.text),
    ['Asha', '45000', '1 days', 'https://snapmint.example/pay']);
  calls.length = 0;
  await whatsapp.sendTemplate('escalation', { to: '+910000000000', vars: { message: 'Disputed charge', name: 'Asha', phone: '+919876543210' } });
  assert.deepEqual(calls[0].body.template.components[0].parameters.map(p => p.text), ['Asha', 'Disputed charge', '+919876543210']);
  assert.equal(calls[0].body.template.name, 'kollect_demo_case_escalation');
});
