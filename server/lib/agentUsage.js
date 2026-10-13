// Real talk time per live (Sarvam) agent, keyed by Sarvam app id. Updated when
// a call finishes (see callOutcome.handleSarvamOutcome) and read by the agent
// catalog so a live agent's card shows how long it has actually been on calls,
// not a seeded number.
//
// Persisted to server/data/agentUsage.json, which is gitignored like the other
// runtime data. On Railway that file lives on the container's own disk, so it
// resets whenever the service is redeployed unless a volume is mounted there.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'agentUsage.json');

let usage = {};
try {
  usage = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || {};
} catch (_) {
  usage = {}; // first run, or an unreadable file: start from zero
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(usage, null, 2), 'utf8');
  } catch (e) {
    console.warn('[agentUsage] could not write agentUsage.json:', e.message);
  }
}

// seconds is the call's real duration. Calls that never connected add a call
// to the count but no talk time.
function record(appId, seconds, answered) {
  if (!appId) return;
  const u = usage[appId] || { seconds: 0, calls: 0, answered: 0 };
  u.calls += 1;
  if (answered) {
    u.answered += 1;
    u.seconds += Math.max(0, Math.round(Number(seconds) || 0));
  }
  usage[appId] = u;
  save();
}

function get(appId) {
  return usage[appId] || { seconds: 0, calls: 0, answered: 0 };
}

module.exports = { record, get };
