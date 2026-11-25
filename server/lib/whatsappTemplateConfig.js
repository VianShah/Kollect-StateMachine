const fs = require('fs');
const path = require('path');
const config = require('../config');
const defaults = require('../whatsappTemplates');

// Which approved Meta template (and which values for its {{n}} variables) each
// dashboard step uses. Chosen from the dashboard while a call is running and
// applied to the next send. Stored in server/data (gitignored); on Render
// without a persistent disk it resets to the defaults below on redeploy.
const FILE = path.join(__dirname, '..', 'data', 'whatsappTemplateConfig.json');
const KEYS = Object.keys(defaults);

let saved = {};
try { saved = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { saved = {}; }

function persist() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(saved, null, 2));
  } catch (e) { console.warn('[whatsappTemplateConfig] could not save:', e.message); }
}

// Out-of-the-box choice per step: approved templates on the Predixion WABA
// (checked against Graph 2026-11-25), with their variables pre-filled.
// kollect_demo_followup was never approved, so follow-up uses kollect_2.
const DEFAULTS = {
  paymentReminder: { name: 'kollect_demo_payment_reminder', language: 'en', params: ['{{name}}', '{{amount}}', '{{overdue}} days', '{{link}}'] },
  followup: { name: 'kollect_2', language: 'en', params: ['{{amount}}', '{{overdue}}'] },
  escalation: { name: 'kollect_demo_case_escalation', language: 'en', params: ['{{name}}', '{{message}}', '{{phone}}'] },
};

// Params may use {{message}}, {{name}}, {{phone}}, {{amount}}, {{overdue}} and {{link}} tokens.
function get(key) {
  const d = defaults[key];
  if (!d) return null;
  const s = saved[key] || {};
  const m = DEFAULTS[key];
  return {
    name: s.name || m.name,
    language: s.language || m.language,
    params: Array.isArray(s.params) ? s.params : m.params,
    custom: !!saved[key],
  };
}

function set(key, { name, language, params }) {
  if (!KEYS.includes(key)) throw new Error(`unknown templateKey: ${key}`);
  if (!name || !language) throw new Error('name and language are required');
  const clean = Array.isArray(params) ? params.map(p => String(p)).slice(0, 10) : ['{{message}}'];
  saved[key] = { name: String(name), language: String(language), params: clean };
  persist();
  return get(key);
}

function reset(key) {
  delete saved[key];
  persist();
  return get(key);
}

function renderParams(params, vars) {
  const v = {
    amount: String(config.demo.dueAmount),
    overdue: '1',
    link: process.env.WHATSAPP_PAYMENT_LINK || 'https://predixion.ai',
    ...(vars || {}),
  };
  return params.map(p => String(p).replace(/\{\{(message|name|phone|amount|overdue|link)\}\}/g, (_, k) => (v[k] != null ? v[k] : '')));
}

module.exports = { KEYS, get, set, reset, renderParams };
