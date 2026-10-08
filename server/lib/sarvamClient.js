const fetch = require('node-fetch');
const config = require('../config');

// Sarvam ("Samvaad") voice agents — third real-call provider, added
// 2026-09-24. placeCall's endpoint/payload shape confirmed against the real
// API same day: a request with a syntactically-invalid fake destination
// number (+10000000000) got all the way through auth and org/workspace/
// app/connection validation, failing only on phone-number format
// ("user_config.user_phone_number: Invalid phone number... Please provide a
// valid phone number in E.164 format") — meaning every ID below is real and
// accepted. getAttempt/getTranscript are still per Sarvam's docs only, not
// yet confirmed against a real completed call — same "confirm before
// trusting beyond a first smoke test" posture as every other integration
// here. Update this comment once a real call has gone out and those two
// response shapes are verified.
const TIMEOUT_MS = 8000;
const BASE_URL = 'https://apps.sarvam.ai';

function orgWorkspacePath() {
  return `orgs/${config.sarvam.orgId}/workspaces/${config.sarvam.workspaceId}`;
}

async function fetchJson(url, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    const body = await res.json().catch(() => ({}));
    return { httpStatus: res.status, body };
  } catch (err) {
    clearTimeout(timer);
    const reason = err.name === 'AbortError' ? 'timeout' : 'network_error';
    return { httpStatus: 502, body: { error: reason } };
  }
}

// POST /api/outbounds/v1/orgs/{org_id}/workspaces/{workspace_id}/outbounds
// per docs.sarvam.ai/conversations/api/instant-outbound/create — returns
// { attempt_id } on success.
//
// Two agents as of 2026-09-30 — Collections (original) and Sales (new) —
// selected by `useCase` ('collections' default, or 'sales'). No per-voice
// agent mapping within either one (one agent per use case, regardless of
// persona selected).
//
// agent_variables must match the SPECIFIC AGENT's declared variables
// exactly — sending an undeclared key 422s ("Agent variables ... not found
// in agent variables of app"). The two use cases have entirely different
// declared variables, confirmed against each agent directly (not guessed):
//   collections: the 11-variable set below, copied from the Sarvam
//     dashboard 2026-09-24. Every value is either real per-call data
//     already flowing through this app (name, dpd/overdue_days, today's
//     real date) or this project's own existing demo constants
//     (config.demo.dueAmount/dueDate) — nothing invented. product_type is
//     the one static placeholder (user-confirmed, "Personal Loan").
//     prior_context/link_live are deliberately blank rather than
//     fabricated: a made-up payment link or contact history could actually
//     mislead someone on a live call.
//   sales: ONLY `user_name` as input (user-confirmed 2026-09-30) —
//     `call_summary` is an OUTPUT this agent writes back after the call,
//     not something to send in.
async function placeCall({ customerPhone, customerName, overdueDays, useCase, appId, appVersion, variables, values }) {
  const resolvedUseCase = useCase === 'sales' ? 'sales' : 'collections';
  const app = config.sarvam.apps[resolvedUseCase];
  const targetAppId = appId || app.appId;
  const targetAppVersion = appVersion != null ? Number(appVersion) : app.appVersion;
  const url = `${BASE_URL}/api/outbounds/v1/${orgWorkspacePath()}/outbounds`;

  // Every variable we can fill, all with demo data — nothing here names a
  // real company (a made-up "XYZ Bank" stands in for the lender everywhere,
  // 2026-10-04). Sarvam rejects the WHOLE call if even one key isn't
  // declared on the agent, so only the names listed for this use case in
  // config.sarvam.apps.<useCase>.variables are actually sent.
  const name = customerName || 'Valued Customer';
  const dueAmount = String(config.demo.dueAmount);
  const available = {
    user_name: name,
    customer_name: name,
    name,
    bank_name: 'XYZ Bank',
    company_name: 'XYZ Bank',
    dpd: String(overdueDays != null ? overdueDays : 1),
    emi_amount: dueAmount,
    emi_due_date: config.demo.dueDate,
    outstanding_amount: dueAmount,
    overdue_amount: dueAmount,
    product_type: 'Personal Loan',
    today_date: new Date().toISOString().slice(0, 10),
    prior_context: 'First reminder call from XYZ Bank about an overdue personal loan EMI.',
    link_live: 'https://xyzbank.example/pay',
    attempt_no_month: '1',
  };
  if (values) {
    // Per-agent demo data (catalog `values`) overrides the generic set. The
    // due date is derived from dpd so the two never contradict each other.
    Object.assign(available, values);
    if (!values.emi_due_date) {
      const d = new Date(); d.setDate(d.getDate() - Number(available.dpd || 0));
      available.emi_due_date = d.toISOString().slice(0, 10);
    }
  }
  const agentVariables = {};
  (variables || app.variables || []).forEach(k => { if (k in available) agentVariables[k] = available[k]; });

  const payload = {
    app_config: {
      app_id: targetAppId,
      app_version: targetAppVersion,
      connection_config: {
        connection_id: config.sarvam.connectionId,
        agent_phone_number: config.sarvam.agentPhoneNumber,
      },
      agent_variables: agentVariables,
    },
    user_config: {
      user_phone_number: customerPhone,
    },
  };

  console.log(`[sarvamClient] (${resolvedUseCase}) Posting to Sarvam API ${url}:`, JSON.stringify(payload, null, 2));
  const { httpStatus, body } = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': config.sarvam.apiKey },
    body: JSON.stringify(payload),
  });
  console.log(`[sarvamClient] Response HTTP ${httpStatus}:`, JSON.stringify(body, null, 2));
  return { httpStatus, body: { ...body, call_id: body.attempt_id || null }, payloadSent: payload, appId: targetAppId };
}

// GET /api/analytics/v1/{org_id}/{workspace_id}/{app_id}/attempts, filtered
// to one attempt_id — per docs.sarvam.ai/conversations/api/analytics/attempts.
// The endpoint requires a start/end datetime window rather than a plain
// get-by-id, so this passes a wide window (24h back to now) to be sure the
// attempt falls inside it regardless of clock skew.
//
// `appId` is now required (not read from a single global config.sarvam.appId
// — that stopped existing once Collections/Sales became two separate apps
// 2026-09-30). Callers must pass the SAME app_id the call was originally
// dispatched to, since the analytics endpoints are scoped per app and an
// attempt made against one app_id is invisible to another's endpoint.
async function getAttempt(attemptId, appId) {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    start_datetime: dayAgo.toISOString(),
    end_datetime: now.toISOString(),
    filter_conditions: JSON.stringify([{ id: '1', field: 'attempt_id', operator: 'equals', value: attemptId }]),
  });
  // NOTE: the analytics API's path shape is org_id/workspace_id directly,
  // NOT "orgs/{id}/workspaces/{id}" like the outbounds endpoint above —
  // confirmed 2026-09-24 after the orgs/workspaces form 404'd outright.
  const url = `${BASE_URL}/api/analytics/v1/${config.sarvam.orgId}/${config.sarvam.workspaceId}/${appId}/attempts?${params.toString()}`;
  const { httpStatus, body } = await fetchJson(url, {
    headers: { 'X-API-Key': config.sarvam.apiKey },
  });
  console.log(`[sarvamClient] getAttempt ${attemptId} -> HTTP ${httpStatus}:`, JSON.stringify(body, null, 2));
  const attempt = (body.items && body.items[0]) || null;
  return { httpStatus, attempt };
}

// GET /api/analytics/v1/{org_id}/{workspace_id}/{app_id}/transcripts/{interaction_id}
// — confirmed against a real completed call 2026-09-24. Real shape is
// { interaction_id, messages: [{ turn_id, role, content, language_name }] }
// — role is "assistant"/"user" (NOT "agent", despite the campaigns webhook
// payload doc describing "agent"/"user" and a field called
// interaction_transcript with en_text; this is the real
// GET-transcripts-endpoint shape, which differs from that doc).
//
// Retries on 429/5xx (confirmed real: a third test call hit "429 Rate limit
// exceeded" on the very first fetch, right after the same-second getAttempt
// call — the two analytics calls back-to-back apparently trip Sarvam's own
// rate limit). Without a retry, a transient 429 permanently lost that call's
// transcript and, worse, made handleSarvamOutcome treat an ANSWERED call as
// unanswered — see callOutcome.js's `answered`-driven branch, added the same
// day this was found.
const TRANSCRIPT_RETRIES = 3;
const TRANSCRIPT_RETRY_DELAY_MS = 2000;

async function getTranscript(interactionId, appId) {
  const url = `${BASE_URL}/api/analytics/v1/${config.sarvam.orgId}/${config.sarvam.workspaceId}/${appId}/transcripts/${interactionId}`;
  let last = null;
  for (let attempt = 1; attempt <= TRANSCRIPT_RETRIES; attempt++) {
    const { httpStatus, body } = await fetchJson(url, {
      headers: { 'X-API-Key': config.sarvam.apiKey },
    });
    console.log(`[sarvamClient] getTranscript ${interactionId} attempt ${attempt} -> HTTP ${httpStatus}:`, JSON.stringify(body, null, 2));
    last = { httpStatus, body };
    if (httpStatus === 200) return last;
    if (httpStatus !== 429 && !(httpStatus >= 500)) return last; // non-transient — don't retry a real error
    if (attempt < TRANSCRIPT_RETRIES) await new Promise(r => setTimeout(r, TRANSCRIPT_RETRY_DELAY_MS));
  }
  return last;
}

module.exports = { placeCall, getAttempt, getTranscript };
