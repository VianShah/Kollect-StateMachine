const fetch = require('node-fetch');
const config = require('../config');

// Direct WhatsApp Cloud API (Meta) sender and template lookup. Primary
// WhatsApp provider; server/lib/whatsapp.js falls back to Vobiz if a send
// here fails. Never logs the access token or full message bodies.
const TIMEOUT_MS = 10000;
const TEMPLATE_CACHE_MS = 5 * 60 * 1000;

let templateCache = null; // { at, templates }

function isConfigured() {
  const m = config.whatsapp.meta;
  return !!(m.accessToken && m.phoneNumberId);
}

function base() {
  return `https://graph.facebook.com/${config.whatsapp.meta.apiVersion}`;
}

async function graph(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${config.whatsapp.meta.accessToken}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    return { httpStatus: res.status, ok: res.ok, body: json };
  } catch (err) {
    return { httpStatus: 502, ok: false, body: { error: { message: err.name === 'AbortError' ? 'timeout' : 'network_error' } } };
  } finally {
    clearTimeout(timer);
  }
}

// Meta wants the number as digits only, country code included, no "+".
function toMetaNumber(to) {
  return String(to || '').replace(/[^0-9]/g, '');
}

function maskNumber(n) {
  const d = toMetaNumber(n);
  return d.length > 4 ? `${'*'.repeat(d.length - 4)}${d.slice(-4)}` : d;
}

function errorText(body) {
  const e = body && body.error;
  return e ? `${e.code ? `(#${e.code}) ` : ''}${e.error_user_msg || e.message || 'unknown error'}` : 'unknown error';
}

// Meta rejects template variables containing newlines, tabs or 4+ spaces
// (error 132018), and the dashboard sends multi-line step text.
function cleanParam(t) {
  return String(t).replace(/[\r\n\t]+/g, ' | ').replace(/ {4,}/g, '   ').trim() || '-';
}

// params: array of body-variable strings, in {{1}}, {{2}}... order.
async function sendTemplate({ to, name, language, params = [] }) {
  const components = params.length
    ? [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: cleanParam(t) })) }]
    : [];
  const payload = {
    messaging_product: 'whatsapp',
    to: toMetaNumber(to),
    type: 'template',
    template: { name, language: { code: language }, ...(components.length ? { components } : {}) },
  };
  const r = await graph(`/${config.whatsapp.meta.phoneNumberId}/messages`, { method: 'POST', body: payload });
  const messageId = r.ok && r.body.messages && r.body.messages[0] ? r.body.messages[0].id : null;
  const ok = r.ok && !!messageId;
  console.log(`[metaWhatsapp] template "${name}" (${language}) to ${maskNumber(to)} -> HTTP ${r.httpStatus} ${ok ? `sent ${messageId}` : `failed ${errorText(r.body)}`}`);
  return {
    mode: 'live', provider: 'meta', httpStatus: r.httpStatus, to, template: name,
    metaMessageId: messageId, status: ok ? 'sent' : 'failed', error: ok ? null : errorText(r.body),
    sentAt: new Date().toISOString(), raw: r.body,
  };
}

async function sendText({ to, body }) {
  const payload = { messaging_product: 'whatsapp', to: toMetaNumber(to), type: 'text', text: { body } };
  const r = await graph(`/${config.whatsapp.meta.phoneNumberId}/messages`, { method: 'POST', body: payload });
  const messageId = r.ok && r.body.messages && r.body.messages[0] ? r.body.messages[0].id : null;
  const ok = r.ok && !!messageId;
  console.log(`[metaWhatsapp] text to ${maskNumber(to)} -> HTTP ${r.httpStatus} ${ok ? `sent ${messageId}` : `failed ${errorText(r.body)}`}`);
  return {
    mode: 'live', provider: 'meta', httpStatus: r.httpStatus, to, metaMessageId: messageId,
    status: ok ? 'sent' : 'failed', error: ok ? null : errorText(r.body), sentAt: new Date().toISOString(), raw: r.body,
  };
}

function summarize(t) {
  const body = (t.components || []).find(c => c.type === 'BODY');
  const header = (t.components || []).find(c => c.type === 'HEADER');
  const text = body && body.text ? body.text : '';
  const vars = [...text.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]));
  return {
    name: t.name, language: t.language, category: t.category, status: t.status,
    body: text, paramCount: vars.length ? Math.max(...vars) : 0,
    // A header that needs media/params can't be sent from the dashboard flow.
    headerFormat: header ? header.format : null,
    usable: !(header && header.format && header.format !== 'TEXT') && !/\{\{[^\d]/.test(text),
  };
}

// Approved templates on the WABA, cached for a few minutes.
async function listTemplates({ refresh = false } = {}) {
  if (!isConfigured() || !config.whatsapp.meta.wabaId) return { configured: false, templates: [] };
  if (!refresh && templateCache && Date.now() - templateCache.at < TEMPLATE_CACHE_MS) {
    return { configured: true, templates: templateCache.templates };
  }
  const r = await graph(`/${config.whatsapp.meta.wabaId}/message_templates?fields=name,status,language,category,components&limit=200`);
  if (!r.ok) {
    console.warn(`[metaWhatsapp] could not list templates: HTTP ${r.httpStatus} ${errorText(r.body)}`);
    return { configured: true, templates: templateCache ? templateCache.templates : [], error: errorText(r.body) };
  }
  const templates = (r.body.data || []).filter(t => t.status === 'APPROVED').map(summarize);
  templateCache = { at: Date.now(), templates };
  return { configured: true, templates };
}

function _resetCache() { templateCache = null; }

module.exports = { cleanParam, isConfigured, sendTemplate, sendText, listTemplates, toMetaNumber, maskNumber, _resetCache };
