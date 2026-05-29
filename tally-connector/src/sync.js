/**
 * Sync engine — built for minimal impact on TallyPrime.
 *
 * Design choices that keep Tally responsive during business hours:
 *   • Incremental by default — uses Tally's AlterID change counter to fetch
 *     ONLY records created/edited since the last successful sync.
 *   • Full sync is rare — only on first install or overnight (configurable
 *     window), never repeatedly during working hours.
 *   • Per-module cadence — urgent/cheap data (receivables, sales) every poll;
 *     heavier pulls (purchases) less often; GST summary only on full sync.
 *   • Lightweight requests — each query asks for a fixed, narrow field set.
 *   • Request spacing — a small pause between Tally requests so we never burst
 *     the server while a user is entering vouchers.
 *   • Single-flight queue — if a sync is already running, new triggers are
 *     dropped rather than piling up.
 *   • Checkpoint-on-success — checkpoints (AlterID + lastRunAt) advance only
 *     after Atlas confirms receipt, so a failed sync safely re-pulls the same
 *     delta from the last good checkpoint.
 */

const { loadConfig, loadState, saveState } = require('./config');
const logger = require('./logger');
const tally = require('./tally/client');
const requests = require('./tally/requests');
const parse = require('./tally/parse');
const atlas = require('./atlas/client');

// Modules that support AlterID incremental fetch + per-module cadence.
const INCREMENTAL_MODULES = ['receivables', 'sales', 'receipts', 'ledgers', 'purchases'];
// gst_summary is derived locally from the full sales+purchases set, so it only
// runs during a full sync.
const ALL_MODULES = [...INCREMENTAL_MODULES, 'gst_summary'];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Single-flight guard: only one sync may run at a time.
let running = false;

function inNightWindow(cfg, now) {
  const h = now.getHours();
  const { fullSyncWindowStart: s, fullSyncWindowEnd: e } = cfg;
  return s < e ? h >= s && h < e : h >= s || h < e; // handle the 22→6 wrap
}

function isFullDue(cfg, state, now) {
  if (!state.lastFullSyncAt) return true; // first install
  if (!inNightWindow(cfg, now)) return false;
  const gapHrs = (now - new Date(state.lastFullSyncAt)) / 3600000;
  return gapHrs >= cfg.fullSyncMinGapHours;
}

function dueModules(cfg, state, now) {
  return INCREMENTAL_MODULES.filter((m) => {
    const last = state.checkpoints?.[m]?.lastRunAt;
    if (!last) return true;
    const intervalMs = (cfg.moduleIntervals?.[m] || cfg.pollMinutes) * 60000;
    return now - new Date(last) >= intervalMs;
  });
}

// Fetch + parse one module. Returns { rows, alterId } where alterId is the
// highest AlterID seen (0 for derived/non-incremental modules).
async function fetchModule(m, ctx) {
  const { host, port, company, isFull, fromDate, toDate, syncedAt, checkpoints } = ctx;
  const minAlterId = isFull ? 0 : (checkpoints?.[m]?.alterId || 0);
  const post = (xml) => tally.postXml(host, port, xml);

  if (m === 'ledgers') {
    const { json } = await post(requests.ledgers(company, minAlterId));
    return { rows: parse.parseLedgers(json), alterId: parse.maxAlterId(json, 'LEDGER') };
  }
  if (m === 'sales') {
    const { json } = await post(requests.sales({ company, fromDate, toDate, minAlterId }));
    return { rows: parse.parseSales(json), alterId: parse.maxAlterId(json, 'VOUCHER') };
  }
  if (m === 'receipts') {
    const { json } = await post(requests.receipts({ company, fromDate, toDate, minAlterId }));
    return { rows: parse.parseReceipts(json), alterId: parse.maxAlterId(json, 'VOUCHER') };
  }
  if (m === 'purchases') {
    const { json } = await post(requests.purchases({ company, fromDate, toDate, minAlterId }));
    return { rows: parse.parsePurchases(json), alterId: parse.maxAlterId(json, 'VOUCHER') };
  }
  if (m === 'receivables') {
    // Open bills are derived balances (no AlterID); always a fresh, filtered,
    // and naturally small pull.
    const { json } = await post(requests.bills(company));
    return { rows: parse.parseReceivables(json, syncedAt), alterId: 0 };
  }
  return { rows: [], alterId: 0 };
}

// Decide what this invocation should do without mutating state.
function plan(cfg, state, options, now) {
  let isFull = Boolean(options.full);
  let modules;

  if (options.modules) {
    modules = options.modules.filter((m) => ALL_MODULES.includes(m));
  } else if (isFull) {
    modules = ALL_MODULES;
  } else if (!state.lastFullSyncAt) {
    isFull = true; // first ever sync is always a full baseline
    modules = ALL_MODULES;
  } else if (options.source === 'scheduled') {
    if (isFullDue(cfg, state, now)) {
      isFull = true;
      modules = ALL_MODULES;
    } else {
      modules = dueModules(cfg, state, now);
    }
  } else {
    // Manual "Sync now": quick incremental refresh of everything fetchable.
    modules = INCREMENTAL_MODULES;
  }
  return { isFull, modules };
}

async function runSync(options = {}) {
  const source = options.source || 'manual';
  if (running) {
    logger.warn(`Sync trigger (${source}) ignored — a sync is already running`);
    return { ok: false, error: 'Sync already in progress' };
  }

  const cfg = loadConfig();
  const state = loadState();
  const now = new Date();
  const { isFull, modules } = plan(cfg, state, options, now);

  if (!modules.length) {
    logger.info(`Nothing due this tick (${source})`);
    return { ok: true, skipped: true, counts: {} };
  }

  running = true;
  saveState({ lastStatus: 'running', lastError: null });
  const syncedAt = now.toISOString();
  logger.info(`Sync started (${source}, ${isFull ? 'FULL' : 'incremental'}): ${modules.join(', ')}`);

  const ctx = {
    host: cfg.tallyHost,
    port: cfg.tallyPort,
    company: cfg.company,
    isFull,
    fromDate: new Date(now.getTime() - cfg.fullSyncLookbackDays * 86400000),
    toDate: now,
    syncedAt,
    checkpoints: state.checkpoints || {},
  };

  try {
    const fetched = {}; // module -> { rows, alterId }
    let first = true;
    for (const m of modules) {
      if (m === 'gst_summary') continue; // derived after the fetch loop
      if (!first) await delay(cfg.requestSpacingMs); // spacing keeps Tally responsive
      first = false;
      try {
        fetched[m] = await fetchModule(m, ctx);
        logger.info(`Fetched ${m}: ${fetched[m].rows.length} record(s)`);
      } catch (err) {
        // A single module failing must not abort the whole sync. Its checkpoint
        // simply won't advance, so the next run retries that module's delta.
        logger.error(`Failed to fetch ${m}: ${err.message}`);
      }
    }

    // GST summary is rebuilt from the full sales+purchases set (full sync only).
    let gstSummary = [];
    if (modules.includes('gst_summary') && fetched.sales && fetched.purchases) {
      gstSummary = parse.buildGstSummary(fetched.sales.rows, fetched.purchases.rows);
    }

    const payload = {
      company: cfg.company || '',
      synced_at: syncedAt,
      mode: isFull ? 'full' : 'incremental',
      ledgers: fetched.ledgers?.rows || [],
      sales: fetched.sales?.rows || [],
      receipts: fetched.receipts?.rows || [],
      receivables: fetched.receivables?.rows || [],
      purchases: fetched.purchases?.rows || [],
      gst_summary: gstSummary,
    };

    await atlas.sendSync({ atlasUrl: cfg.atlasUrl, apiKey: cfg.apiKey, payload });

    // --- commit checkpoints only after Atlas confirms receipt ---
    const fresh = loadState();
    const checkpoints = { ...(fresh.checkpoints || {}) };
    const counts = {};
    for (const m of Object.keys(fetched)) {
      const prev = checkpoints[m] || { alterId: 0 };
      checkpoints[m] = {
        alterId: Math.max(prev.alterId || 0, fetched[m].alterId || 0),
        lastRunAt: syncedAt,
      };
      counts[m] = fetched[m].rows.length;
    }
    if (gstSummary.length || modules.includes('gst_summary')) {
      checkpoints.gst_summary = { alterId: 0, lastRunAt: syncedAt };
      counts.gst_summary = gstSummary.length;
    }

    const saved = saveState({
      lastSyncAt: syncedAt,
      lastStatus: 'ok',
      lastError: null,
      lastCounts: { ...(fresh.lastCounts || {}), ...counts },
      totalSyncs: (fresh.totalSyncs || 0) + 1,
      lastFullSyncAt: isFull ? syncedAt : fresh.lastFullSyncAt,
      checkpoints,
    });
    logger.info(`Sync OK (${isFull ? 'full' : 'incremental'}) — ${JSON.stringify(counts)}`);
    return { ok: true, isFull, counts, state: saved };
  } catch (err) {
    // No checkpoints advanced → next run resumes from the last good checkpoint.
    saveState({ lastStatus: 'error', lastError: err.message });
    logger.error(`Sync failed (checkpoints preserved): ${err.message}`);
    return { ok: false, error: err.message };
  } finally {
    running = false;
  }
}

module.exports = { runSync, isRunning: () => running, INCREMENTAL_MODULES, ALL_MODULES };
