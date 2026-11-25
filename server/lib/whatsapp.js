const fetch = require('node-fetch');
const config = require('../config');
const templates = require('../whatsappTemplates');
const modeState = require('./whatsappModeState');
const meta = require('./metaWhatsapp');
const templateConfig = require('./whatsappTemplateConfig');

const VOBIZ_SEND_URL = 'https://api.vobiz.ai/api/v1/messaging/messages';

async function postToVobiz(payload) {
  const res = await fetch(VOBIZ_SEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-ID': config.whatsapp.authId,
      'X-Auth-Token': config.whatsapp.authToken,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return {
    mode: 'live',
    httpStatus: res.status,
    to: payload.to,
    template: payload.template ? payload.template.name : null,
    voizMessageId: body.id || null,
    metaMessageId: body.meta_message_id || null,
    status: body.status || (res.ok ? 'pending' : 'failed'),
    sentAt: new Date().toISOString(),
    raw: body,
  };
}

const useMeta = () => config.whatsapp.provider === 'meta' && meta.isConfigured();
const vobizConfigured = () => !!(config.whatsapp.authId && config.whatsapp.authToken && config.whatsapp.channelId);

// Meta first; Vobiz only if the Meta send failed and Vobiz is configured.
async function viaMetaThenVobiz(metaSend, vobizSend) {
  const m = await metaSend();
  if (m.status === 'sent') return m;
  if (!vobizConfigured()) return m;
  console.warn(`[whatsapp] Meta send failed (${m.error}); falling back to Vobiz`);
  const v = await vobizSend();
  return { ...v, fallbackFrom: 'meta', metaError: m.error };
}

// caseKey identifies the real-world case (call_id or recipient phone) —
// kept as a param even with no rate limiter consuming it, since callers
// (callOutcome.js, dashboard triggers) already pass it and it's useful
// context in logs.
async function sendTemplate(templateKey, { to, caseKey, vars }) {
  const tpl = templates[templateKey];
  if (!tpl) throw new Error(`Unknown WhatsApp template key: ${templateKey}`);
  if (!to) throw new Error('sendTemplate requires "to"');

  // Meta Cloud API path: the template and its variables come from the
  // dashboard's saved choice (whatsappTemplateConfig), defaulting to tpl.
  if (useMeta()) {
    const chosen = templateConfig.get(templateKey);
    const params = templateConfig.renderParams(chosen.params, { ...(vars || {}), message: (vars && vars.message) || '', name: (vars && vars.name) || '', phone: (vars && vars.phone) || to });
    if (modeState.getMode() !== 'live') {
      console.log(`[whatsapp:mock] would send Meta template "${chosen.name}" (${chosen.language}) to ${meta.maskNumber(to)}`);
      return { mode: 'mock', provider: 'meta', to, template: chosen.name, params, status: 'sent', sentAt: new Date().toISOString() };
    }
    return viaMetaThenVobiz(
      () => meta.sendTemplate({ to, name: chosen.name, language: chosen.language, params }),
      () => postToVobiz({
        channel_id: config.whatsapp.channelId, waba_id: config.whatsapp.wabaId, to, type: 'template',
        template: { name: tpl.name, language: { code: tpl.language }, components: tpl.buildComponents(vars || {}) },
      }),
    );
  }


  // TEMPORARY fallback (config.whatsapp.useTemplates=false) while templates
  // await Meta approval: send the same content as free-form text instead.
  // Only reaches a real recipient if they've messaged in within 24h — this
  // is a rehearsal/known-number workaround, NOT usable for a real booth
  // attendee (who has never messaged the business). Switch back the moment
  // templates are approved: set WHATSAPP_USE_TEMPLATES=true (or remove it).
  if (!config.whatsapp.useTemplates) {
    const body = (vars && vars.message) || `[${tpl.name}] (no message text provided)`;
    if (modeState.getMode() !== 'live') {
      console.log(`[whatsapp:mock] (as text, templates pending) would send "${tpl.name}" to ${to}:`, body);
      return { mode: 'mock', to, template: tpl.name, asText: true, body, status: 'sent', sentAt: new Date().toISOString() };
    }
    const result = await postToVobiz({
      channel_id: config.whatsapp.channelId,
      waba_id: config.whatsapp.wabaId,
      to,
      type: 'text',
      text: { body },
    });
    return { ...result, template: tpl.name, asText: true };
  }

  const components = tpl.buildComponents(vars || {});

  if (modeState.getMode() !== 'live') {
    console.log(`[whatsapp:mock] would send "${tpl.name}" to ${to}:`, JSON.stringify(components));
    return {
      mode: 'mock',
      to,
      template: tpl.name,
      components,
      status: 'sent', // pretend delivery succeeded; UI treats this identically to a real send
      sentAt: new Date().toISOString(),
    };
  }

  return postToVobiz({
    channel_id: config.whatsapp.channelId,
    waba_id: config.whatsapp.wabaId,
    to,
    type: 'template',
    template: { name: tpl.name, language: { code: tpl.language }, components },
  });
}

// Free-form text — only usable when the recipient messaged in within the
// last 24h (WhatsApp's window rule; see docs/WHATSAPP_API_REFERENCE.md).
// NOT wired into the dashboard/booth UI on purpose — this exists solely for
// a manual, deliberate verification send before templates are approved.
async function sendText(to, body, caseKey) {
  if (!to) throw new Error('sendText requires "to"');
  if (!body) throw new Error('sendText requires "body"');

  if (modeState.getMode() !== 'live') {
    console.log(`[whatsapp:mock] would send text to ${to}:`, body);
    return { mode: 'mock', to, body, status: 'sent', sentAt: new Date().toISOString() };
  }

  const vobizText = () => postToVobiz({
    channel_id: config.whatsapp.channelId,
    waba_id: config.whatsapp.wabaId,
    to,
    type: 'text',
    text: { body },
  });
  if (useMeta()) return viaMetaThenVobiz(() => meta.sendText({ to, body }), vobizText);
  return vobizText();
}

// Thin wrapper kept for the existing webhook.js call site (real-outcome
// escalation, PRD §7.1, once Phase 0.5 branch scripts + real dispositions
// exist). Sends to the human agent, never the borrower.
async function sendHandoffMessage({ borrowerName, borrowerPhone, summary }) {
  return sendTemplate('escalation', {
    to: config.whatsapp.humanAgentNumber,
    caseKey: borrowerPhone,
    vars: { name: borrowerName, phone: borrowerPhone, message: `Escalation: ${borrowerName}. ${summary} Contact: ${borrowerPhone}. Please follow up within 2 hours.` },
  });
}

module.exports = { sendTemplate, sendText, sendHandoffMessage, modeState };
