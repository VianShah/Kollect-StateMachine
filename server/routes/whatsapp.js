const express = require('express');
const config = require('../config');
const whatsapp = require('../lib/whatsapp');
const meta = require('../lib/metaWhatsapp');
const templateConfig = require('../lib/whatsappTemplateConfig');

const router = express.Router();

// Triggered from the dashboard's scripted timeline (mirrors how the real
// call is triggered mid-timeline at a different step). `message` is the
// exact text already rendered on screen for that step (see
// public/js/dashboard.js's triggerWhatsApp) — sent byte-for-byte, so
// whatever the attendee sees IS what goes out.
//
// Recipient trust boundary: for 'paymentReminder'/'followup' the client
// picks itself (name/phone it typed on screen 1) — same as POST /api/call.
// For 'escalation' the recipient is always resolved server-side from
// WHATSAPP_HUMAN_AGENT_NUMBER, never from the client, so a booth attendee
// can't redirect that message anywhere else.
router.post('/whatsapp/send', async (req, res) => {
  const { templateKey, name, phone, message } = req.body || {};
  if (!templateKey || !message) {
    return res.status(400).json({ error: 'templateKey and message are required' });
  }

  try {
    let result;

    if (templateKey === 'escalation') {
      result = await whatsapp.sendTemplate('escalation', {
        to: config.whatsapp.humanAgentNumber,
        caseKey: phone || name,
        vars: { message, name, phone },
      });
    } else if (templateKey === 'paymentReminder' || templateKey === 'followup') {
      if (!phone) return res.status(400).json({ error: 'phone is required for this templateKey' });
      let formattedPhone = phone.replace(/[^0-9+]/g, '');
      if (!formattedPhone.startsWith('+')) formattedPhone = '+91' + formattedPhone;

      result = await whatsapp.sendTemplate(templateKey, {
        to: formattedPhone,
        caseKey: formattedPhone,
        vars: { message, name, phone: formattedPhone },
      });
    } else {
      return res.status(400).json({ error: `unknown templateKey: ${templateKey}` });
    }

    res.json(result);
  } catch (err) {
    console.error('[whatsapp route] error', err);
    res.status(502).json({ error: 'WhatsApp send failed', detail: String(err) });
  }
});

// Dashboard template picker: approved Meta templates + the saved choice per
// step (paymentReminder / followup / escalation). Applies to the next send.
router.get('/whatsapp/templates', async (req, res) => {
  const list = await meta.listTemplates({ refresh: req.query.refresh === '1' });
  const selected = {};
  templateConfig.KEYS.forEach(k => { selected[k] = templateConfig.get(k); });
  res.json({ provider: config.whatsapp.provider, mode: whatsapp.modeState.getMode(), ...list, selected });
});

router.post('/whatsapp/template-config', async (req, res) => {
  const { templateKey, name, language, params, reset } = req.body || {};
  try {
    if (reset) return res.json({ selected: templateConfig.reset(templateKey) });
    const list = await meta.listTemplates();
    const found = list.templates.find(t => t.name === name && t.language === language);
    if (list.templates.length && !found) {
      return res.status(400).json({ error: `"${name}" (${language}) is not an approved template on this WhatsApp account` });
    }
    if (found && !found.usable) return res.status(400).json({ error: 'This template has a media/header or named variables and cannot be sent from the dashboard' });
    if (found && (params || []).length !== found.paramCount) {
      return res.status(400).json({ error: `This template needs ${found.paramCount} variable(s), got ${(params || []).length}` });
    }
    res.json({ selected: templateConfig.set(templateKey, { name, language, params }) });
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// Runtime mock/live toggle — see server/lib/whatsappModeState.js. Does NOT
// touch .env; resets to .env's value on server restart by design.
router.get('/whatsapp/mode', (req, res) => {
  res.json({ mode: whatsapp.modeState.getMode() });
});

router.post('/whatsapp/mode', (req, res) => {
  const { mode } = req.body || {};
  try {
    const applied = whatsapp.modeState.setMode(mode);
    res.json({ mode: applied });
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// Manual verification only — deliberately NOT called from any dashboard/
// booth UI. Free-form text, so it only works if `to` messaged in within the
// last 24h (opens the window — see docs/WHATSAPP_API_REFERENCE.md). Exists
// to prove the Vobiz integration works before templates are approved,
// without needing an approved template. Fire this yourself via curl/Postman
// — never wire a UI button to it.
router.post('/whatsapp/send-test', async (req, res) => {
  const { to, body } = req.body || {};
  if (!to || !body) {
    return res.status(400).json({ error: 'to and body are required' });
  }
  try {
    const result = await whatsapp.sendText(to, body, to);
    res.json(result);
  } catch (err) {
    console.error('[whatsapp send-test] error', err);
    res.status(502).json({ error: 'WhatsApp test send failed', detail: String(err) });
  }
});

module.exports = router;
