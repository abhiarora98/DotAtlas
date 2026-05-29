/**
 * Sync engine — built for minimal impact on TallyPrime.
 *
 * Design choices that keep Tally responsive during business hours:
 *   • Incremental by default — uses Tally's AlterID change counter to fetch
 *     ONLY records created/edited since the last successful sync.
 *   • Full sync is rare — only on first install or overnight (configurable
 *     window), never repeatedly during working hours.
 *   • Chunked full sync — vouchers are pulled one month at a time so a single
 *     XML response never balloons in memory; Atlas POSTs are row-capped.
 *   • Per-module cadence — urgent/cheap data (receivables, sales) every poll;
 *     heavier pulls (purchases) less often; GST summary only on full sync.
 *   • Request spacing — a small pause between Tally requests so the UI stays
 *     responsive while a user is entering vouchers.
 *   • Single-flight queue — if a sync is already running, new triggers drop.
 *   • Checkpoint-on-success — checkpoints (AlterID + lastRunAt) advance only
 *     after Atlas confirms receipt, so a failed sync safely re-pulls the same
 *     delta from the last good checkpoint.
 *   • Fail loud — if every attempted module fails to fetch (Tally down), the
 *     sync is marked `error`, never a misleading "OK, 0 records".
 */

const { loadConfig, loadState, saveState } = require('./config');
const logger = require('./logger');
const tally = require('./tally/client');
const requests = require('./tally/requests');
const parse = require('./tally/parse');
const atlas = require('./atlas/client');

const INCREMENTAL_MODULES = ['receivables', 'sales', 'receipts', 'ledgers', 'purchases'];
const ALL_MODULES = [...INCREMENTAL_MODULES, 'gst_summary'];
const VOUCHER_MODULES = { sales: 'sales', receipts: 'receipts', purchases: 'purchases' };

const delay = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

let running = false;

function inNightWindow(cfg, now) {
  const h = now.getHours();
  const { fullSyncWindowStart: s, fullSyncWindowEnd: e } = cfg;
  return s < e ? h >= s && h < e : h >= s || h < e;
}

function isFullDue(cfg, state, now) {
  if (!state.lastFullSyncAt) return true;
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

// Split [from, to] into <= windowDays calendar windows for bounded XML pulls.
function dateWindows(from, to, windowDays) {
  const spanMs = Math.max(1, windowDays) * 86400000;
  const windows = [];
  let start = new Date(from);
  while (start <= to) {
    const end = new Date(Math.min(start.getTime() + spanMs - 1, to.getTime()));
    windows.push({ fromDate: new Date(start), toDate: end });
    start = new Date(end.getTime() + 1);
  }
  return windows.length ? windows : [{ fromDate: from, toDate: to }];
}

const VOUCHER_PARSERS = {
  sales: parse.parseSales,
  receipts: parse.parseReceipts,
  purchases: parse.parsePurchases,
};

// Fetch one voucher module. On a full sync we walk month windows so each XML
// response stays small; incremental relies on the AlterID filter (no windows).
async function fetchVoucherModule(m, ctx) {
  const { host, port, company, isFull, minAlterIdFor, spacingMs } = ctx;
  const minAlterId = isFull ? 0 : minAlterIdFor(m);
  const build = requests[m];
  let rows = [];
  let alterId = 0;

  const windows = isFull
    ? dateWindows(ctx.fromDate, ctx.toDate, ctx.windowDays)
    : [{ fromDate: null, toDate: null }];

  let first = true;
  for (const w of windows) {
    if (!first) await delay(spacingMs);
    first = false;
    const { json } = await tally.postXml(host, port, build({
      company, fromDate: w.fromDate, toDate: w.toDate, minAlterId,
    }));
    rows = rows.concat(VOUCHER_PARSERS[m](json));
    alterId = Math.max(alterId, parse.maxAlterId(json, 'VOUCHER'));
  }
  return { rows, alterId };
}

async function fetchModule(m, ctx) {
  const { host, port, company, isFull, minAlterIdFor, syncedAt } = ctx;
  if (VOUCHER_MODULES[m]) return fetchVoucherModule(m, ctx);

  if (m === 'ledgers') {
    const { json } = await tally.postXml(host, port, requests.ledgers(company, isFull ? 0 : minAlterIdFor('ledgers')));
    return { rows: parse.parseLedgers(json), alterId: parse.maxAlterId(json, 'LEDGER') };
  }
  if (m === 'receivables') {
    const { json } = await tally.postXml(host, port, requests.bills(company));
    return { rows: parse.parseReceivables(json, syncedAt), alterId: 0 };
  }
  return { rows: [], alterId: 0 };
}

function plan(cfg, state, options, now) {
  let isFull = Boolean(options.full);
  let modules;
  if (options.dryRun) {
    return { isFull: true, modules: options.modules?.filter((m) => ALL_MODULES.includes(m)) || ALL_MODULES };
  }
  if (options.modules) {
    modules = options.modules.filter((m) => ALL_MODULES.includes(m));
  } else if (isFull) {
    modules = ALL_MODULES;
  } else if (!state.lastFullSyncAt) {
    isFull = true;
    modules = ALL_MODULES;
  } else if (options.source === 'scheduled') {
    if (isFullDue(cfg, state, now)) { isFull = true; modules = ALL_MODULES; }
    else modules = dueModules(cfg, state, now);
  } else {
    modules = INCREMENTAL_MODULES;
  }
  return { isFull, modules };
}

// Fetch + parse every requested module (gst is derived, not fetched). Returns
// the fetched map plus counts of attempts/successes so the caller can tell a
// genuine "nothing changed" from "Tally is down".
async function fetchAll(modules, ctx) {
  const fetched = {};
  let attempts = 0;
  let successes = 0;
  let first = true;
  for (const m of modules) {
    if (m === 'gst_summary') continue;
    if (!first) await delay(ctx.spacingMs);
    first = false;
    attempts += 1;
    try {
      fetched[m] = await fetchModule(m, ctx);
      successes += 1;
      logger.info(`Fetched ${m}: ${fetched[m].rows.length} record(s)`);
    } catch (err) {
      logger.error(`Failed to fetch ${m}: ${err.message}`);
    }
  }
  return { fetched, attempts, successes };
}

function buildModuleArrays(fetched, modules) {
  let gst_summary = [];
  if (modules.includes('gst_summary') && fetched.sales && fetched.purchases) {
    gst_summary = parse.buildGstSummary(fetched.sales.rows, fetched.purchases.rows);
  }
  return {
    ledgers: fetched.ledgers?.rows || [],
    sales: fetched.sales?.rows || [],
    receipts: fetched.receipts?.rows || [],
    receivables: fetched.receivables?.rows || [],
    purchases: fetched.purchases?.rows || [],
    gst_summary,
  };
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
  const syncedAt = now.toISOString();
  const ctx = {
    host: cfg.tallyHost,
    port: cfg.tallyPort,
    company: cfg.company,
    isFull,
    fromDate: new Date(now.getTime() - cfg.fullSyncLookbackDays * 86400000),
    toDate: now,
    windowDays: cfg.fullSyncWindowDays,
    spacingMs: cfg.requestSpacingMs,
    syncedAt,
    minAlterIdFor: (m) => state.checkpoints?.[m]?.alterId || 0,
  };

  try {
    // --- Dry run: fetch + parse + return JSON, no Atlas, no state changes ---
    if (options.dryRun) {
      logger.info(`Dry run (full fetch, no send): ${modules.join(', ')}`);
      const { fetched, attempts, successes } = await fetchAll(modules, ctx);
      if (attempts > 0 && successes === 0) {
        return { ok: false, error: 'All modules failed to fetch from Tally' };
      }
      const arrays = buildModuleArrays(fetched, modules);
      return { ok: true, dryRun: true, payload: { company: cfg.company || '', synced_at: syncedAt, mode: 'dry-run', ...arrays } };
    }

    saveState({ lastStatus: 'running', lastError: null });
    logger.info(`Sync started (${source}, ${isFull ? 'FULL' : 'incremental'}): ${modules.join(', ')}`);

    const { fetched, attempts, successes } = await fetchAll(modules, ctx);

    // Fail loud: if we tried to fetch and every module failed, Tally is down /
    // unreachable — do NOT send or advance any checkpoint.
    if (attempts > 0 && successes === 0) {
      const msg = 'All modules failed to fetch from Tally (is TallyPrime running?)';
      saveState({ lastStatus: 'error', lastError: msg });
      logger.error(`Sync failed: ${msg}`);
      return { ok: false, error: msg };
    }

    const arrays = buildModuleArrays(fetched, modules);
    const base = { company: cfg.company || '', synced_at: syncedAt, mode: isFull ? 'full' : 'incremental' };
    const totalRows = Object.values(arrays).reduce((a, r) => a + r.length, 0);

    // Chunked, row-capped send. Zero rows = nothing to upsert; skip the POST
    // but still advance checkpoints so cadence/lastSyncAt move forward.
    if (totalRows > 0) {
      const sent = await atlas.sendSyncChunked({
        atlasUrl: cfg.atlasUrl, apiKey: cfg.apiKey, base, modules: arrays,
        rowsPerRequest: cfg.rowsPerRequest,
      });
      logger.info(`Sent ${totalRows} row(s) to Atlas in ${sent.chunks} chunk(s)`);
    } else {
      logger.info('No changed records this sync — nothing to send');
    }

    // --- Commit checkpoints only after a successful send ---
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
    if (modules.includes('gst_summary')) {
      checkpoints.gst_summary = { alterId: 0, lastRunAt: syncedAt };
      counts.gst_summary = arrays.gst_summary.length;
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
    saveState({ lastStatus: 'error', lastError: err.message });
    logger.error(`Sync failed (checkpoints preserved): ${err.message}`);
    return { ok: false, error: err.message };
  } finally {
    running = false;
  }
}

module.exports = { runSync, isRunning: () => running, dateWindows, INCREMENTAL_MODULES, ALL_MODULES };
