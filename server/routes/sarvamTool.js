const crypto = require('crypto');
const express = require('express');
const store = require('../lib/store');
const whatsapp = require('../lib/whatsapp');

const router = express.Router();

// Webhook tool for the Sarvam voice agent: while the call is running the agent
// calls this to WhatsApp the borrower (payment link / follow-up) through the
// Meta Cloud API (Vobiz fallback), using the template chosen in the dashboard.
// Setup: docs/SARVAM_WHATSAPP_TOOL.md.
//
// Safety, because an LLM decides when this runs:
//  - shared secret (SARVAM_TOOL_SECRET), constant-time compared
//  - the number must belong to a Sarvam call this server placed in the last
//    CALL_WINDOW_MS, so a leaked secret or a caller talking the agent into
//    "send it to another number" can't message arbitrary people
//  - only the borrower-facing templates (never the human-agent escalation)
//  - one send per number+template per DEDUPE_MS, so a looping agent can't spam
const CALL_WINDOW_MS = 30 * 60 * 1000;
const DEDUPE_MS = 2 * 60 * 1000;
const ALLOWED_KEYS = ['paymentReminder', 'followup'];
const recent = new Map(); // `${last10}:${key}` -> timestamp

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function presentedSecret(req) {
  const h = req.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : (req.get('X-Tool-Secret') || '');
}

const last10 = (p) => String(p || '').replace(/[^0-9]/g, '').slice(-10);

function catalogValue(appId, key) {
  try {
    const a = require('../agentCatalog.json').find(x => x.appId === appId);
    return a && a.values ? a.values[key] : undefined;
  } catch (_) { return undefined; }
}

router.post('/tools/send-whatsapp', async (req, res) => {
  const secret = process.env.SARVAM_TOOL_SECRET;
  if (!secret) return res.status(503).json({ status: 'unavailable', message: 'Tool is not configured.' });
  if (!safeEqual(presentedSecret(req), secret)) {
    console.warn('[sarvamTool] rejected request with a missing or wrong secret');
    return res.sendStatus(401);
  }

  const { phone, name, templateKey = 'paymentReminder', interaction_id: interactionId, amount, overdue, link, message } = req.body || {};
  if (!ALLOWED_KEYS.includes(templateKey)) return res.status(400).json({ status: 'rejected', message: 'Unknown template.' });
  if (last10(phone).length !== 10) return res.status(400).json({ status: 'rejected', message: 'A valid phone number is required.' });

  const kase = store.findCaseByPhone(phone);
  if (!kase || kase.provider !== 'sarvam' || Date.now() - (kase.createdAt || 0) > CALL_WINDOW_MS) {
    console.warn(`[sarvamTool] no recent Sarvam call for ***${last10(phone).slice(-4)}; refusing`);
    return res.status(403).json({ status: 'rejected', message: 'I could not find an active call for this number.' });
  }

  const dedupeKey = `${last10(phone)}:${templateKey}`;
  if (Date.now() - (recent.get(dedupeKey) || 0) < DEDUPE_MS) {
    return res.json({ status: 'already_sent', message: 'I have already sent that message on WhatsApp.' });
  }
  recent.set(dedupeKey, Date.now());

  const to = `+91${last10(phone)}`;
  const vars = {
    name: name || kase.name || 'Customer',
    phone: to,
    message: message || '',
    amount: amount || catalogValue(kase.sarvamAppId, 'emi_amount'),
    overdue,
    link: link || catalogValue(kase.sarvamAppId, 'link_live'),
  };
  Object.keys(vars).forEach(k => { if (vars[k] === undefined || vars[k] === null || vars[k] === '') delete vars[k]; });

  try {
    const result = await whatsapp.sendTemplate(templateKey, { to, caseKey: kase.call_id, vars });
    const ok = result.status === 'sent' || result.status === 'pending';
    console.log(`[sarvamTool] ${templateKey} to ***${last10(phone).slice(-4)} call=${kase.call_id} interaction=${interactionId || '-'} -> ${result.mode}/${result.provider || 'vobiz'} ${result.status}${result.fallbackFrom ? ' (fallback)' : ''}`);
    if (!ok) recent.delete(dedupeKey);
    return res.json({
      status: ok ? 'sent' : 'failed',
      mode: result.mode,
      message: ok ? 'I have sent the details on WhatsApp.' : 'I could not send the WhatsApp message right now.',
    });
  } catch (err) {
    recent.delete(dedupeKey);
    console.error('[sarvamTool] send failed', err);
    return res.json({ status: 'failed', message: 'I could not send the WhatsApp message right now.' });
  }
});

module.exports = router;
