/**
 * Config + sync state, persisted as plain JSON files next to the app.
 *
 *   config.json  → user settings (Tally host/port, Atlas URL, API key, company)
 *   state.json   → last sync timestamp, last result, running counters
 *
 * Both files live in the connector folder so a non-technical user can find
 * and back them up. They are git-ignored because config.json holds the API key.
 */

const fs = require('fs');
const path = require('path');

// Resolve to the connector root (one level up from src/).
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const STATE_PATH = path.join(ROOT, 'state.json');

const DEFAULT_CONFIG = {
  tallyHost: 'localhost',
  tallyPort: 9000,
  atlasUrl: '', // e.g. https://your-atlas.vercel.app/api/tally/sync
  apiKey: '',
  company: '', // blank = whichever company is open in Tally
  pollMinutes: 5, // base tick; modules run on their own cadence within this
  uiPort: 8765,

  // --- Performance / low-Tally-impact tuning ---
  // How often each module is allowed to run, in minutes. The poller ticks
  // every `pollMinutes` and only fetches modules whose interval has elapsed,
  // so cheap/urgent data (receivables) stays fresh while heavier pulls
  // (purchases) run less often. GST summary runs only during a full sync.
  moduleIntervals: {
    receivables: 5,
    sales: 5,
    receipts: 5,
    ledgers: 15,
    purchases: 20,
  },
  // Full sync (no AlterID filter, wider history) is heavy, so it only runs
  // on first install or overnight inside this hour window [start, end).
  fullSyncWindowStart: 22, // 10 PM
  fullSyncWindowEnd: 6, // 6 AM
  fullSyncMinGapHours: 20, // at most one full sync per ~day
  fullSyncLookbackDays: 366, // history pulled on a full sync
  // Pause between consecutive Tally requests so we never burst the server
  // and the Tally UI stays responsive while a sync runs.
  requestSpacingMs: 400,
};

const DEFAULT_STATE = {
  lastSyncAt: null,
  lastStatus: 'never', // never | running | ok | error
  lastError: null,
  lastCounts: {}, // { ledgers: 12, sales: 30, ... }
  totalSyncs: 0,
  lastFullSyncAt: null,
  // Per-module incremental checkpoints. `alterId` is Tally's monotonic change
  // counter — we only fetch records with a higher AlterID next time.
  // `lastRunAt` drives the per-module cadence. Checkpoints advance ONLY after
  // Atlas confirms receipt, so a failed send safely re-pulls the same delta.
  checkpoints: {},
};

function readJson(file, fallback) {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf-8')) };
  } catch {
    return { ...fallback };
  }
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

function loadConfig() {
  return readJson(CONFIG_PATH, DEFAULT_CONFIG);
}

function saveConfig(partial) {
  const next = { ...loadConfig(), ...partial };
  // Coerce numerics so values coming from HTML form fields stay typed.
  next.tallyPort = Number(next.tallyPort) || DEFAULT_CONFIG.tallyPort;
  next.pollMinutes = Number(next.pollMinutes) || DEFAULT_CONFIG.pollMinutes;
  next.uiPort = Number(next.uiPort) || DEFAULT_CONFIG.uiPort;
  writeJson(CONFIG_PATH, next);
  return next;
}

function loadState() {
  return readJson(STATE_PATH, DEFAULT_STATE);
}

function saveState(partial) {
  const next = { ...loadState(), ...partial };
  writeJson(STATE_PATH, next);
  return next;
}

module.exports = {
  ROOT,
  CONFIG_PATH,
  STATE_PATH,
  DEFAULT_CONFIG,
  loadConfig,
  saveConfig,
  loadState,
  saveState,
};
