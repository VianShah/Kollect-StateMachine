const crypto = require('crypto');
const express = require('express');

const router = express.Router();

// TEST-ONLY webhook for the new Meta WhatsApp app (direct Meta Cloud API, not
// Vobiz). Used with our own test number only, no client data. Client traffic
// will go to a separate production service, not this route.
//
//   GET  /whatsapp/webhook  Meta's one-time verification handshake
//   POST /whatsapp/webhook  incoming messages + sent/delivered/read/failed
//
// Env: WHATSAPP_VERIFY_TOKEN (the token typed into Meta's setup page) and
// WHATSAPP_APP_SECRET (the Meta app's App Secret, used to check
// X-Hub-Signature-256). Read per request so a Render env change applies
// without code changes.

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

router.get('/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (expected && mode === 'subscribe' && token && safeEqual(token, expected)) {
    console.log('[metaWebhook] verification succeeded');
    return res.status(200).type('text/plain').send(String(challenge || ''));
  }
  console.warn('[metaWebhook] verification rejected (token mismatch, wrong mode, or WHATSAPP_VERIFY_TOKEN unset)');
  return res.sendStatus(403);
});

// Meta signs the raw request body: X-Hub-Signature-256: sha256=<hex HMAC-SHA256
// with the app secret>. req.rawBody is captured by express.json in index.js.
function validMetaSignature(req) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const header = req.get('X-Hub-Signature-256');
  if (!secret || !header || !req.rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  return safeEqual(header, expected);
}

router.post('/whatsapp/webhook', (req, res) => {
  if (!process.env.WHATSAPP_APP_SECRET) {
    console.error('[metaWebhook] WHATSAPP_APP_SECRET not set: rejecting, cannot verify the signature');
    return res.sendStatus(503);
  }
  if (!validMetaSignature(req)) {
    console.warn('[metaWebhook] rejected POST with a missing or invalid X-Hub-Signature-256');
    return res.sendStatus(401);
  }

  // Acknowledge first so Meta never times out and retries, then log.
  res.sendStatus(200);

  const body = req.body || {};
  setImmediate(() => {
    try {
      (body.entry || []).forEach(entry => (entry.changes || []).forEach(change => {
        const v = change.value || {};
        (v.messages || []).forEach(m => {
          const text = m.type === 'text' && m.text ? m.text.body : `[${m.type}]`;
          console.log(`[metaWebhook] message from ${m.from}: ${text}`);
        });
        (v.statuses || []).forEach(s => {
          const err = s.errors && s.errors[0] ? ` error ${s.errors[0].code}: ${s.errors[0].title || s.errors[0].message || ''}` : '';
          console.log(`[metaWebhook] status ${s.status} for ${s.id} to ${s.recipient_id}${err}`);
        });
      }));
      console.log('[metaWebhook] payload', JSON.stringify(body));
    } catch (e) {
      console.error('[metaWebhook] could not log payload', e);
    }
  });
});

module.exports = router;
