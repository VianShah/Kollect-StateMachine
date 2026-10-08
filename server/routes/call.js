const express = require('express');
const config = require('../config');
const voizClient = require('../lib/voizClient');
const elevenLabsClient = require('../lib/elevenLabsClient');
const elevenLabsPoller = require('../lib/elevenLabsPoller');
const sarvamClient = require('../lib/sarvamClient');
const sarvamPoller = require('../lib/sarvamPoller');
const store = require('../lib/store');
const callPoller = require('../lib/callPoller');

const router = express.Router();

// Standard call endpoint (used by dashboard workflow). Which VOIZ agent gets
// dialed is resolved here from the orb the attendee picked — the client only
// ever sends voiceId, never an agent_id, so it can't be spoofed into calling
// a different agent than the one it displayed.
function catalogVariablesFor(appId) {
  try {
    const found = require('../agentCatalog.json').find(a => a.appId === appId);
    return found && Array.isArray(found.variables) ? found.variables : undefined;
  } catch (_) { return undefined; }
}

function catalogValuesFor(appId) {
  try {
    const found = require('../agentCatalog.json').find(a => a.appId === appId);
    return found && found.values && typeof found.values === 'object' ? found.values : undefined;
  } catch (_) { return undefined; }
}

router.post('/call', async (req, res) => {
  const { name, phone, voiceId, lang, firstMessage, archetypeId, overdueDays, enhancedQuality, useCase, allowFallback, agentId, sarvamAppId, sarvamAppVersion } = req.body || {};
  if (!name || !phone) {
    return res.status(400).json({ error: 'name and phone are required' });
  }

  let formattedPhone = phone.replace(/[^0-9+]/g, '');
  if (!formattedPhone.startsWith('+')) formattedPhone = '+91' + formattedPhone;

  let targetSarvamAppId = sarvamAppId;
  let targetSarvamAppVersion = sarvamAppVersion;
  if (agentId && !targetSarvamAppId) {
    try {
      const catalog = require('../agentCatalog.json');
      const found = catalog.find(a => a.id === agentId);
      if (found && found.appId) {
        targetSarvamAppId = found.appId;
        targetSarvamAppVersion = found.appVersion || 1;
      }
    } catch (_) {}
  }

  // Two Sarvam agents as of 2026-09-30: Collections (original) and Sales
  // (new). `useCase` ('collections' default, or 'sales') picks which one —
  // see server/lib/sarvamClient.js for the very different agent_variables
  // each one needs.
  const resolvedUseCase = useCase === 'sales' ? 'sales' : 'collections';
  const sarvamApp = config.sarvam.apps[resolvedUseCase];
  const effectiveAppId = targetSarvamAppId || sarvamApp.appId;
  const effectiveAppVersion = targetSarvamAppVersion != null ? Number(targetSarvamAppVersion) : sarvamApp.appVersion;
  // Set when Sarvam was tried and failed. VOIZ only gets dialed after that
  // if the caller re-sends with allowFallback:true (see the gate below).
  let sarvamFailedDetail = null;

  // Sarvam (2026-09-24 user request) — tried FIRST, automatically, for
  // every real call, no manual toggle (unlike Enhanced Quality below).
  // Falls through to Enhanced Quality/VOIZ below on any missing config or
  // dispatch failure — same "blank config = silently skipped" posture as
  // every other provider here. Sales is the ONE exception (2026-09-30
  // user decision): VOIZ/ElevenLabs only have the Collections persona
  // registered, so falling back for a Sales call would hand the prospect
  // an agent saying their "EMI is pending" — worse than just failing
  // cleanly, so a Sales dispatch failure returns an error instead of
  // falling through.
  if (!allowFallback && config.sarvam.apiKey && config.sarvam.orgId && config.sarvam.workspaceId
    && effectiveAppId && config.sarvam.connectionId && config.sarvam.agentPhoneNumber) {
    const sarvamResult = await sarvamClient.placeCall({
      customerPhone: formattedPhone,
      customerName: name,
      overdueDays: overdueDays !== undefined && overdueDays !== null ? overdueDays : 1,
      useCase: resolvedUseCase,
      appId: effectiveAppId,
      appVersion: effectiveAppVersion,
      // A catalog agent can declare its own input variables (e.g. Kollectt
      // takes only user_name); otherwise the use-case default list applies.
      variables: catalogVariablesFor(effectiveAppId),
      values: catalogValuesFor(effectiveAppId),
    });
    const dispatchedOk = sarvamResult.httpStatus >= 200 && sarvamResult.httpStatus < 300 && !!sarvamResult.body.call_id;
    if (dispatchedOk) {
      const callId = sarvamResult.body.call_id;
      store.createCase(callId, {
        name, phone: formattedPhone, voiceId: voiceId || null, lang: lang || null,
        firstMessage: firstMessage || null,
        status: 'initiated',
        provider: 'sarvam',
        useCase: resolvedUseCase,
        sarvamAppId: sarvamResult.appId,
      });
      sarvamPoller.pollAttempt(callId, sarvamResult.appId);
      return res.status(sarvamResult.httpStatus).json({ call_id: callId, status: 'initiated', provider: 'sarvam', useCase: resolvedUseCase });
    }
    console.warn(`[call] Sarvam (${resolvedUseCase}) dispatch failed (HTTP ${sarvamResult.httpStatus}, ${JSON.stringify(sarvamResult.body)})`);
    if (resolvedUseCase === 'sales') {
      return res.status(502).json({ error: 'Sales agent dispatch failed', detail: sarvamResult.body });
    }
    sarvamFailedDetail = (sarvamResult.body && sarvamResult.body.error && sarvamResult.body.error.data && sarvamResult.body.error.data.details)
      || `HTTP ${sarvamResult.httpStatus}`;
  } else if (resolvedUseCase === 'sales') {
    return res.status(500).json({ error: 'Sales agent is not configured (missing Sarvam credentials or SARVAM_APP_ID_SALES)' });
  }

  // "Enhanced Quality" (2026-09-08/09 user request) — ElevenLabs is tried
  // FIRST only when both requested AND actually configured. Dispatch,
  // outcome polling (elevenLabsPoller.js) and outcome mapping
  // (callOutcome.js handleElevenLabsOutcome) are all wired and verified
  // against the real API (2026-09-09) — see elevenLabsClient.js for the
  // path-correction history and what's still unconfirmed (the exact shape
  // of a genuinely ANSWERED call's transcript/status, only a failed-to-
  // connect one has been inspected so far).
  //
  // A 2xx HTTP status here is NOT sufficient on its own — ElevenLabs can
  // return HTTP 200 with `success:false` in the body for a same-request
  // dial failure (confirmed: a SIP 404 on an unreachable number came back
  // this way, not as a non-2xx). Both conditions must hold before this is
  // treated as a real success; anything else falls through to VOIZ below,
  // same as a real ElevenLabs outage would.
  //
  // Per-voice agent — each persona has its own registered ElevenLabs agent
  // (config.elevenLabs.agentIdsByVoice), not one agent that switches voice.
  // A voice with no ElevenLabs agent configured (e.g. Swara) skips this
  // branch entirely and goes straight to VOIZ, even with the toggle on.
  const elevenAgentId = voiceId && config.elevenLabs.agentIdsByVoice[voiceId];
  if (enhancedQuality && config.elevenLabs.apiKey && elevenAgentId) {
    const elevenResult = await elevenLabsClient.placeCall({
      agentId: elevenAgentId,
      customerPhone: formattedPhone,
      customerName: name,
    });
    const dispatchedOk = elevenResult.httpStatus >= 200 && elevenResult.httpStatus < 300 && elevenResult.body.success !== false;
    if (dispatchedOk) {
      const callId = elevenResult.body.call_id || `unknown-${Date.now()}`;
      store.createCase(callId, {
        name, phone: formattedPhone, voiceId: voiceId || null, lang: lang || null,
        firstMessage: firstMessage || null,
        status: 'initiated',
        provider: 'elevenlabs',
      });
      elevenLabsPoller.pollConversation(callId);
      return res.status(elevenResult.httpStatus).json({ call_id: callId, status: 'initiated', provider: 'elevenlabs' });
    }
    console.warn(`[call] Enhanced Quality requested but ElevenLabs dispatch failed (${elevenResult.body && (elevenResult.body.message || elevenResult.body.reason)}) — falling back to VOIZ`);
  }

  // Falling back to VOIZ (a different agent, voice and script) after Sarvam
  // failed is the attendee's call to make, not something to do silently
  // (2026-10-04 user request): answer 409 and let the dashboard ask, then
  // retry with allowFallback:true. Not asked when Sarvam isn't configured at
  // all — VOIZ is simply the primary provider then.
  if (sarvamFailedDetail && !allowFallback) {
    return res.status(409).json({
      needsFallbackConfirm: true, fallback: 'voiz',
      error: 'The primary voice agent could not place this call.', detail: sarvamFailedDetail,
    });
  }

  const targetAgentId = (voiceId && config.voiz.agentIdsByVoice[voiceId]) || config.voiz.defaultAgentId;
  if (!targetAgentId) {
    return res.status(500).json({ error: 'No VOIZ agent configured for this voice, and no VOIZ_DEFAULT_AGENT_ID fallback set' });
  }

  try {
    const { httpStatus, body, payloadSent } = await voizClient.placeCall({
      agentId: targetAgentId,
      customerPhone: formattedPhone,
      customerName: name,
      dueAmount: config.demo.dueAmount,
      dueDate: config.demo.dueDate,
      // Extra context beyond the 3 variables VOIZ_API_REFERENCE.md confirms
      // the registered agent's own prompt actually consumes
      // (customer_name/due_amount/due_date) — VOIZ tolerates unknown keys
      // in customer_data without erroring, but tolerating isn't the same as
      // the live agent actually saying anything different because of them.
      // This is forwarded so it's ready the moment the registered agent's
      // prompt template is updated to reference {archetype}/{overdue_days};
      // until then it has NO effect on what the agent actually says on the
      // call (2026-09-08 user request — see chat for the full explanation
      // of why this is a VOIZ-agent-registration limitation, not a bug
      // fixable from this codebase alone).
      customData: {
        archetype: archetypeId || undefined,
        overdue_days: overdueDays !== undefined && overdueDays !== null ? String(overdueDays) : undefined,
      },
    });

    if (httpStatus !== 200 && httpStatus !== 202) {
      return res.status(httpStatus || 502).json({ error: 'VOIZ call dispatch failed', voizStatus: httpStatus, body, payloadSent });
    }

    const callId = body.call_id || `unknown-${Date.now()}`;
    store.createCase(callId, {
      name,
      phone: formattedPhone,
      voiceId: voiceId || null,
      lang: lang || null, // threaded through to geminiClient so its output matches the demo's language mix
      firstMessage: firstMessage || null, // the actual first WhatsApp text already sent — grounds the no-answer follow-up (server/lib/callOutcome.js) if this call goes unanswered
      status: httpStatus === 200 ? 'initiated' : 'queued',
      room_name: body.room_name || null,
    });
    callPoller.pollCall(callId);

    res.status(httpStatus).json({ call_id: callId, status: httpStatus === 200 ? 'initiated' : 'queued', voizResponse: body, payloadSent });
  } catch (err) {
    console.error('[call] dispatch error', err);
    res.status(502).json({ error: 'Could not reach VOIZ', detail: String(err) });
  }
});

// Direct Trigger Call Endpoint (Captures full custom form data just like VOIZ platform UI)
router.post('/call-direct', async (req, res) => {
  const { agentId, customerPhone, customerName, dueAmount, dueDate, sipId, customData } = req.body || {};

  if (!customerPhone) {
    return res.status(400).json({ error: 'customerPhone is required' });
  }

  try {
    const { httpStatus, body, payloadSent } = await voizClient.placeCall({
      agentId: agentId || config.voiz.defaultAgentId,
      customerPhone,
      customerName: customerName || 'Vatsal',
      dueAmount: dueAmount !== undefined ? dueAmount : config.demo.dueAmount,
      dueDate: dueDate || config.demo.dueDate,
      sipId: sipId || config.voiz.sipTrunkId,
      customData,
    });

    const callId = body.call_id || `call_${Date.now()}`;
    store.createCase(callId, {
      name: customerName || 'Vatsal',
      phone: payloadSent.customer_phone,
      voiceId: null,
      status: body.status || (httpStatus === 200 ? 'initiated' : 'failed'),
      room_name: body.room_name || null,
    });
    callPoller.pollCall(callId);

    res.status(httpStatus).json({
      httpStatus,
      call_id: callId,
      status: body.status || 'initiated',
      voizResponse: body,
      payloadSent,
    });
  } catch (err) {
    console.error('[call-direct] error', err);
    res.status(502).json({ error: 'Failed to trigger call via VOIZ API', detail: String(err) });
  }
});

router.get('/call/:callId', (req, res) => {
  const record = store.getCase(req.params.callId);
  if (!record) return res.status(404).json({ error: 'unknown call_id' });
  res.json(record);
});

// SSE stream so the dashboard can watch a case update live without polling.
router.get('/call/:callId/events', (req, res) => {
  const { callId } = req.params;
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const current = store.getCase(callId);
  if (current) send(current);

  const onUpdate = (updated) => send(updated);
  store.bus.on(`update:${callId}`, onUpdate);

  req.on('close', () => {
    store.bus.off(`update:${callId}`, onUpdate);
  });
});

module.exports = router;
