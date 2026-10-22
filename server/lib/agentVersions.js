// Which version of each Sarvam agent in the Agent Library to call.
//
// Default: the newest published version, found automatically, so publishing a
// new version in Sarvam is all it takes. A version can be pinned from the
// Agent Library when an older one is needed; clearing the pin goes back to
// "latest".
//
// Sarvam's API key can't list an app's versions (that endpoint needs a
// dashboard login), so versions are found by asking Sarvam to place a call
// with a variable no agent declares: it answers 422 when that version exists
// and 404 when it doesn't, before any call is dialled. The request carries
// the owner's own test number, so even an unexpected success could only ever
// ring that number, never a stranger; if that ever happens, probing stops.
//
// Pins are saved to server/data/agentVersions.json (gitignored). On hosts
// with no persistent disk (Render free tier) they reset on redeploy, which
// simply means "latest" again.
const fs = require('fs');
const path = require('path');
const config = require('../config');

const FILE = path.join(__dirname, '..', 'data', 'agentVersions.json');
const CACHE_MS = 60 * 60 * 1000; // re-check for a newer version at most hourly
const MAX_VERSION = 50;
const PROBE_NUMBER = process.env.SARVAM_PROBE_NUMBER || '+918879185247';
const PROBE_VARIABLE = 'zz_version_probe_not_a_real_variable';

let pins = {};
try { pins = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch (_) { pins = {}; }
const latestCache = {}; // appId -> { latest, checkedAt }
let probingDisabled = false;

function savePins() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(pins, null, 2));
  } catch (e) {
    console.warn('[agentVersions] could not save pins:', e.message);
  }
}

/** true = this version exists, false = it doesn't, null = couldn't tell. */
async function versionExists(appId, version) {
  if (probingDisabled) return null;
  const s = config.sarvam;
  if (!s.apiKey || !s.orgId || !s.workspaceId || !s.connectionId || !s.agentPhoneNumber) return null;
  const url = `https://apps.sarvam.ai/api/outbounds/v1/orgs/${s.orgId}/workspaces/${s.workspaceId}/outbounds`;
  const body = {
    app_config: { app_id: appId, app_version: version, connection_config: { connection_id: s.connectionId, agent_phone_number: s.agentPhoneNumber }, agent_variables: { [PROBE_VARIABLE]: 'x' } },
    user_config: { user_phone_number: PROBE_NUMBER },
  };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': s.apiKey }, body: JSON.stringify(body) });
    if (res.status === 404) return false;
    if (res.status === 422) return true; // rejected on the variable, so the version exists
    if (res.ok) {
      probingDisabled = true;
      console.error(`[agentVersions] Sarvam accepted a version check for ${appId} v${version} as a real call to the probe number. Version checks are now off until restart.`);
      return null;
    }
    return null; // rate limit or another error: don't guess
  } catch (_) {
    return null;
  }
}

/** Newest published version, starting the search at `floor` (the catalog's version, known to exist). */
async function latestVersion(appId, floor = 1, { refresh = false } = {}) {
  const hit = latestCache[appId];
  if (hit && !refresh && Date.now() - hit.checkedAt < CACHE_MS) return hit.latest;
  let latest = Math.max(1, Number(floor) || 1);
  for (let v = latest + 1; v <= MAX_VERSION; v++) {
    const ok = await versionExists(appId, v);
    if (ok === true) { latest = v; continue; }
    if (ok === null && !hit) return latest; // couldn't check; use what we know without caching it
    break;
  }
  latestCache[appId] = { latest, checkedAt: Date.now() };
  return latest;
}

/** The version a call will use, and why. */
async function resolve(appId, floor, opts) {
  const latest = await latestVersion(appId, floor, opts);
  const pinned = pins[appId] && pins[appId].version;
  return {
    appId, latest, pinned: pinned || null, active: pinned || latest, mode: pinned ? 'pinned' : 'latest',
    checkedAt: latestCache[appId] ? new Date(latestCache[appId].checkedAt).toISOString() : null,
    versions: Array.from({ length: Math.max(latest, pinned || 0) }, (_, i) => Math.max(latest, pinned || 0) - i),
  };
}

/** Pin a version (must exist in Sarvam), or pass null to go back to the latest. */
async function setPin(appId, version, by) {
  if (version == null) {
    delete pins[appId];
    savePins();
    return { ok: true };
  }
  const v = Number(version);
  if (!Number.isInteger(v) || v < 1 || v > MAX_VERSION) return { ok: false, error: 'Choose a valid version number.' };
  const exists = await versionExists(appId, v);
  if (exists === false) return { ok: false, error: `Version ${v} doesn't exist in Sarvam for this agent.` };
  pins[appId] = { version: v, by: by || 'dashboard', at: new Date().toISOString() };
  savePins();
  return { ok: true };
}

module.exports = { resolve, setPin, latestVersion };
