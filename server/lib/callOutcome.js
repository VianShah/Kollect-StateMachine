const store = require('./store');
const whatsapp = require('./whatsapp');
const geminiClient = require('./geminiClient');
const glmClient = require('./glmClient');
const config = require('../config');

// Tries GLM 5 (Bedrock) first, falls back to Gemini only on a CLEAN GLM
// failure — no key configured, or the stream ended having captured zero
// fields (both clients' own streamLabeledCompletion already returns
// 'ready' with whatever partial fields it captured rather than
// 'unavailable' the moment even one field streamed back, so by the time
// this sees 'unavailable' at all, nothing has been shown to the user yet).
// This is what keeps the fallback safe to do mid-stream: it never discards
// or contradicts real data already on screen, it only ever fires before
// anything was displayed at all.
async function analyzeWithFallback(mode, input, onPartial) {
  const glmFn = mode === 'transcript' ? glmClient.analyzeCallTranscriptStreaming : glmClient.analyzeNoAnswerStreaming;
  const geminiFn = mode === 'transcript' ? geminiClient.analyzeCallTranscriptStreaming : geminiClient.analyzeNoAnswerStreaming;

  if (config.glm.apiKey) {
    const glmResult = await glmFn(input, onPartial);
    if (glmResult.status !== 'unavailable') return { ...glmResult, provider: 'glm' };
    console.warn(`[callOutcome] GLM unavailable (${glmResult.reason}), falling back to Gemini`);
  }
  const geminiResult = await geminiFn(input, onPartial);
  return { ...geminiResult, provider: 'gemini' };
}

// Confirmed real fields via GET /calls/{call_id} (2026-09-05) — there is no
// single "disposition" enum as the platform guide's example implied. VOIZ
// uses separate boolean flags instead. Either one triggers escalation.
const ESCALATION_FLAGS = ['escalation_flag', 'dispute_flag'];

function flattenTranscript(record) {
  const messages = record.transcript
    && record.transcript.transcript_data
    && record.transcript.transcript_data.messages;
  if (!Array.isArray(messages)) return null;
  return messages.map(m => `${m.speaker}: ${m.message}`).join('\n');
}

// Called once a call reaches a terminal status, whether learned by polling
// GET /calls/{call_id} (primary path) or, best-effort, by an inbound
// webhook (secondary — payload shape unverified, see webhook.js).
//
// NOTE: every outcome field (escalation_flag, dispute_flag, call_success,
// customer_sentiment, etc.) lives under `record.artifacts.*`, NOT at the
// top level — confirmed against a real call 2026-09-05 after an earlier
// version of this function read the wrong (top-level) path and silently
// got `undefined` for all of them.
async function handleCallOutcome(callId, record) {
  const existing = store.getCase(callId) || {};
  const transcriptText = flattenTranscript(record);
  const a = record.artifacts || {};

  const updated = store.updateCase(callId, {
    status: 'completed',
    call_end_reason: a.call_end_reason,
    answered: a.answered,
    duration: record.duration,
    transcript: transcriptText,
    recording_url: a.recording_url,
    ptp_flag: a.ptp_flag,
    rtp_flag: a.rtp_flag,
    dispute_flag: a.dispute_flag,
    escalation_flag: a.escalation_flag,
    call_success: a.call_success,
    customer_sentiment: a.customer_sentiment,
    next_best_action: a.next_best_action,
    dispute_description: a.dispute_description,
    structured_outputs: a.structured_outputs,
  });

  const shouldEscalate = ESCALATION_FLAGS.some(flag => a[flag] === true);
  if (shouldEscalate) {
    const summary = a.dispute_description
      || (transcriptText ? transcriptText.slice(0, 160) : 'Escalation triggered, no transcript available');
    const borrowerPhone = record.phone || existing.phone || 'unknown';
    const borrowerName = existing.name || record.customer_name || 'Unknown borrower';

    const whatsappResult = await whatsapp.sendHandoffMessage({
      borrowerName,
      borrowerPhone,
      summary,
    });

    store.addEscalation({
      call_id: callId,
      name: borrowerName,
      phone: borrowerPhone,
      escalation_flag: a.escalation_flag,
      dispute_flag: a.dispute_flag,
      summary,
      whatsapp: whatsappResult,
      createdAt: new Date().toISOString(),
    });
  }

  // Post-call intelligence — fire-and-forget, does NOT block this function's
  // return. The real transcript/duration/answered fields above have already
  // rendered on the dashboard by the time this resolves. Streamed: each
  // field (sentiment, summary, NBA, dispute flag, WhatsApp copy) lands as
  // its own store.updateCase the instant it finishes generating — on a long
  // transcript that's the difference between one long silent wait and the
  // dashboard visibly filling in field by field. Every patch re-emits over
  // the same SSE bus the real completion event already used.
  //
  // Always called, even with no API key or no transcript — geminiClient
  // resolves those to {status:'unavailable', reason:...} almost instantly.
  // Skipping the call entirely in that case (an earlier version of this did)
  // meant geminiAnalysis never landed at all, so the dashboard's pending
  // badge sat there for the full client-side ceiling before silently giving
  // up instead of clearing right away.
  // Unanswered/declined/voicemail/cancelled — no transcript exists, and
  // this must NOT quietly fall through to the scripted happy-path follow-up
  // (which assumes the borrower engaged). Route to the dedicated no-answer
  // prompt instead, grounded in the fact that nothing was said and in the
  // one real message already sent (so the second message reads as a
  // continuation of an actual thread, not a restart). a.answered === true
  // is the only case that gets the transcript-analysis path; anything else
  // (false, or missing/undefined on a genuinely weird terminal status)
  // gets the no-answer path.
  // hasTranscript gates the dashboard's Next Best Action pointer (see
  // dashboard.js renderGeminiAnalysis): a genuine transcript can justify
  // replacing the templated NBA with the AI's own read; a call that was
  // never answered has no real conversation to reason from, so its NBA
  // must stay the templated one even though sentiment/summary/WhatsApp
  // copy from the no-answer prompt are still shown (they're honest about
  // "no reply happened", not a fabricated recommendation).
  const runningAnalysis = { status: 'streaming', hasTranscript: a.answered === true };
  const onPartial = (partial) => {
    Object.assign(runningAnalysis, partial);
    store.updateCase(callId, { geminiAnalysis: { ...runningAnalysis } });
  };
  const analysisPromise = a.answered === true
    ? analyzeWithFallback('transcript', {
        transcript: transcriptText,
        borrowerName: existing.name || record.customer_name,
        language: existing.lang,
        dueAmount: existing.dueAmount || config.demo.dueAmount,
        dueDate: existing.dueDate || config.demo.dueDate,
        callDurationSeconds: record.duration,
        answered: a.answered,
      }, onPartial)
    : analyzeWithFallback('no_answer', {
        borrowerName: existing.name || record.customer_name,
        language: existing.lang,
        dueAmount: existing.dueAmount || config.demo.dueAmount,
        dueDate: existing.dueDate || config.demo.dueDate,
        firstMessageText: existing.firstMessage,
        callEndReason: a.call_end_reason,
      }, onPartial);

  analysisPromise.then(finalAnalysis => {
    // finalAnalysis is a fresh object from analyzeWithFallback (status/
    // provider/fields/latencyMs) — it doesn't carry hasTranscript, which
    // only exists on runningAnalysis above, so it has to be merged back in
    // explicitly or the terminal 'ready' write would silently drop it after
    // the streaming partials (which do carry it) already set the
    // frontend's expectation.
    store.updateCase(callId, { geminiAnalysis: { hasTranscript: runningAnalysis.hasTranscript, ...finalAnalysis } });
  }).catch(err => {
    console.error(`[callOutcome] post-call analysis threw for ${callId}`, err);
    store.updateCase(callId, { geminiAnalysis: { status: 'unavailable', reason: 'threw' } });
  });

  return updated;
}

// "Enhanced Quality" (ElevenLabs) equivalent of handleCallOutcome above —
// same downstream pipeline (analyzeWithFallback, the SSE-visible case
// record), different provider shape going in. Confirmed against ONE real
// conversation record (2026-09-09, a call that failed to connect at the SIP
// level — see server/lib/elevenLabsClient.js's path history) — the shape
// for a genuinely ANSWERED conversation, in particular the transcript
// entries' exact field names and what a successful `status` value looks
// like, is NOT yet confirmed. `answered` below is a best-effort proxy
// (no explicit boolean field was present on the one record inspected);
// correct it once a real answered call has actually been inspected.
function flattenElevenLabsTranscript(record) {
  const turns = record.transcript;
  if (!Array.isArray(turns) || turns.length === 0) return null;
  return turns.map(t => `${t.role || t.speaker || 'unknown'}: ${t.message || t.text || ''}`).join('\n');
}

async function handleElevenLabsOutcome(callId, record) {
  const existing = store.getCase(callId) || {};
  const transcriptText = flattenElevenLabsTranscript(record);
  const meta = record.metadata || {};
  // No explicit "answered" boolean in the one real response shape seen so
  // far — proxy: didn't fail outright AND had measurable call time.
  const answered = record.status !== 'failed' && (meta.call_duration_secs || 0) > 0;
  const callEndReason = meta.termination_reason || (meta.error && meta.error.reason) || record.status;

  const updated = store.updateCase(callId, {
    status: 'completed',
    call_end_reason: callEndReason,
    answered,
    duration: meta.call_duration_secs || 0,
    transcript: transcriptText,
  });

  // ElevenLabs' conversation record has no VOIZ-style escalation_flag/
  // dispute_flag — this provider never auto-triggers the human-handoff
  // WhatsApp send the way a VOIZ call can (see ESCALATION_FLAGS above).

  const runningAnalysis = { status: 'streaming', hasTranscript: answered };
  const onPartial = (partial) => {
    Object.assign(runningAnalysis, partial);
    store.updateCase(callId, { geminiAnalysis: { ...runningAnalysis } });
  };
  const analysisPromise = answered
    ? analyzeWithFallback('transcript', {
        transcript: transcriptText,
        borrowerName: existing.name,
        language: existing.lang,
        dueAmount: existing.dueAmount || config.demo.dueAmount,
        dueDate: existing.dueDate || config.demo.dueDate,
        callDurationSeconds: meta.call_duration_secs,
        answered,
      }, onPartial)
    : analyzeWithFallback('no_answer', {
        borrowerName: existing.name,
        language: existing.lang,
        dueAmount: existing.dueAmount || config.demo.dueAmount,
        dueDate: existing.dueDate || config.demo.dueDate,
        firstMessageText: existing.firstMessage,
        callEndReason,
      }, onPartial);

  analysisPromise.then(finalAnalysis => {
    store.updateCase(callId, { geminiAnalysis: { hasTranscript: runningAnalysis.hasTranscript, ...finalAnalysis } });
  }).catch(err => {
    console.error(`[callOutcome] ElevenLabs post-call analysis threw for ${callId}`, err);
    store.updateCase(callId, { geminiAnalysis: { status: 'unavailable', reason: 'threw' } });
  });

  return updated;
}

// Sarvam ("Samvaad") equivalent of handleElevenLabsOutcome above — same
// downstream pipeline, different provider shape going in. Confirmed against
// a real answered call 2026-09-24 (attempt_id 99cd1d66-e0dd-4d73-bbc5-
// bb0d824cb098): connectivity_status "connected", failure_reason
// "NO_FAILURE_REASON" when there's nothing wrong, transcript under
// `messages` with role "assistant"/"user" and text in `content` — NOT the
// campaigns-webhook-doc shape (interaction_transcript/en_text) this
// originally assumed.
const sarvamClient = require('./sarvamClient');

function flattenSarvamTranscript(transcriptBody) {
  const turns = transcriptBody && transcriptBody.messages;
  if (!Array.isArray(turns) || turns.length === 0) return null;
  return turns.map(t => `${t.role === 'assistant' ? 'agent' : (t.role || 'unknown')}: ${t.content || ''}`).join('\n');
}

async function handleSarvamOutcome(callId, attempt, appId) {
  const existing = store.getCase(callId) || {};
  const answered = attempt.connectivity_status === 'connected';
  const callEndReason = attempt.failure_reason || attempt.connectivity_status;
  const duration = attempt.duration_in_seconds || 0;

  let transcriptText = null;
  if (answered && attempt.interaction_id) {
    const { body } = await sarvamClient.getTranscript(attempt.interaction_id, appId);
    transcriptText = flattenSarvamTranscript(body);
  }
  // Sarvam's own post-call summary, written back into agent_variables —
  // real fallback content when the transcript fetch itself failed (see
  // sarvamClient.js's getTranscript retry comment: a real answered call hit
  // a transient 429 on this endpoint). NOT the same as a real transcript,
  // only used to avoid discarding a real call's outcome entirely.
  const sarvamOwnSummary = attempt.agent_variables && attempt.agent_variables.call_summary;

  const updated = store.updateCase(callId, {
    status: 'completed',
    call_end_reason: callEndReason,
    // `answered` reflects the real connectivity signal, never transcript
    // availability — a transcript-fetch failure must NOT relabel an
    // actually-answered call as unanswered (real bug found 2026-09-24: a
    // 429 on getTranscript for a genuinely connected, 138s/23-message call
    // fell into the no_answer branch below and produced "Unresponsive, call
    // attempt failed" for a call that went fine).
    answered,
    duration,
    transcript: transcriptText,
  });

  // Add this call to its agent's running talk time (shown on the agent's
  // card in the Agent Library).
  require('./agentUsage').record(appId, duration, answered);

  // Sarvam's attempt record has no VOIZ-style escalation_flag/dispute_flag —
  // this provider never auto-triggers the human-handoff WhatsApp send the
  // way a VOIZ call can (see ESCALATION_FLAGS above).

  const runningAnalysis = { status: 'streaming', hasTranscript: !!transcriptText };
  const onPartial = (partial) => {
    Object.assign(runningAnalysis, partial);
    store.updateCase(callId, { geminiAnalysis: { ...runningAnalysis } });
  };

  let analysisPromise;
  if (transcriptText) {
    analysisPromise = analyzeWithFallback('transcript', {
      transcript: transcriptText,
      borrowerName: existing.name,
      language: existing.lang,
      dueAmount: existing.dueAmount || config.demo.dueAmount,
      dueDate: existing.dueDate || config.demo.dueDate,
      callDurationSeconds: duration,
      answered,
    }, onPartial);
  } else if (answered && sarvamOwnSummary) {
    // Answered, but the real transcript never arrived — use Sarvam's own
    // summary as the transcript-analysis input rather than either
    // fabricating a no-answer narrative or running GLM/Gemini against
    // nothing. Labeled so a reviewer can tell this wasn't the real turn-by-
    // turn transcript.
    analysisPromise = analyzeWithFallback('transcript', {
      transcript: `[Sarvam-generated call summary — real transcript unavailable]\n${sarvamOwnSummary}`,
      borrowerName: existing.name,
      language: existing.lang,
      dueAmount: existing.dueAmount || config.demo.dueAmount,
      dueDate: existing.dueDate || config.demo.dueDate,
      callDurationSeconds: duration,
      answered,
    }, onPartial);
  } else if (answered) {
    // Answered, no transcript, no Sarvam summary either — genuinely nothing
    // to analyze. Do NOT run the no_answer path (the call WAS answered);
    // surface this honestly instead of guessing.
    analysisPromise = Promise.resolve({ status: 'unavailable', reason: 'transcript_unavailable' });
  } else {
    analysisPromise = analyzeWithFallback('no_answer', {
      borrowerName: existing.name,
      language: existing.lang,
      dueAmount: existing.dueAmount || config.demo.dueAmount,
      dueDate: existing.dueDate || config.demo.dueDate,
      firstMessageText: existing.firstMessage,
      callEndReason,
    }, onPartial);
  }

  analysisPromise.then(finalAnalysis => {
    store.updateCase(callId, { geminiAnalysis: { hasTranscript: runningAnalysis.hasTranscript, ...finalAnalysis } });
  }).catch(err => {
    console.error(`[callOutcome] Sarvam post-call analysis threw for ${callId}`, err);
    store.updateCase(callId, { geminiAnalysis: { status: 'unavailable', reason: 'threw' } });
  });

  return updated;
}

module.exports = { handleCallOutcome, handleElevenLabsOutcome, handleSarvamOutcome, ESCALATION_FLAGS };
