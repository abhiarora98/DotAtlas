/**
 * Benchmark mode — measures the cost of each module's Tally request so you can
 * validate impact on a live machine. It only talks to Tally (never Atlas) and
 * never changes any state.
 *
 *   node src/index.js --benchmark            # one pass, all modules
 *   node src/index.js --benchmark --runs=3   # average over 3 passes
 *
 * Run it three times against your real TallyPrime 7.0 to characterise impact:
 *   1) idle              2) while entering vouchers     3) while generating a report
 * and compare request durations / response sizes between the three.
 *
 * Reports per module: request duration, raw XML response size, parse time,
 * record count. Plus process-wide CPU time and peak RSS for the whole run.
 */

const { loadConfig } = require('./config');
const tally = require('./tally/client');
const requests = require('./tally/requests');
const parse = require('./tally/parse');

// A full (minAlterId = 0) request for each module, bounded to a recent window
// for vouchers so the benchmark itself stays representative but lightweight.
function buildRequest(m, cfg, now) {
  const company = cfg.company;
  const fromDate = new Date(now.getTime() - (cfg.fullSyncWindowDays || 31) * 86400000);
  switch (m) {
    case 'ledgers': return { xml: requests.ledgers(company, 0), tag: 'LEDGER', parse: parse.parseLedgers };
    case 'sales': return { xml: requests.sales({ company, fromDate, toDate: now }), tag: 'VOUCHER', parse: parse.parseSales };
    case 'receipts': return { xml: requests.receipts({ company, fromDate, toDate: now }), tag: 'VOUCHER', parse: parse.parseReceipts };
    case 'purchases': return { xml: requests.purchases({ company, fromDate, toDate: now }), tag: 'VOUCHER', parse: parse.parsePurchases };
    case 'receivables': return { xml: requests.bills(company), tag: 'BILLS', parse: (j) => parse.parseReceivables(j, now.toISOString()) };
    default: return null;
  }
}

const MODULES = ['ledgers', 'sales', 'receipts', 'purchases', 'receivables'];

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

async function run() {
  const cfg = loadConfig();
  const runs = Number((process.argv.find((a) => a.startsWith('--runs=')) || '').split('=')[1]) || 1;
  const now = new Date();

  console.log(`\nBenchmark against Tally ${cfg.tallyHost}:${cfg.tallyPort}` +
    `  (company: ${cfg.company || 'open company'},  runs: ${runs})\n`);

  const cpuStart = process.cpuUsage();
  let peakRss = process.memoryUsage().rss;
  const agg = {}; // module -> { ms[], bytes[], parseMs[], count }

  for (let r = 0; r < runs; r++) {
    for (const m of MODULES) {
      const reqDef = buildRequest(m, cfg, now);
      agg[m] = agg[m] || { ms: [], bytes: [], parseMs: [], count: 0 };
      try {
        const t0 = process.hrtime.bigint();
        const { raw, json } = await tally.postXml(cfg.tallyHost, cfg.tallyPort, reqDef.xml);
        const t1 = process.hrtime.bigint();
        const rows = reqDef.parse(json);
        const t2 = process.hrtime.bigint();
        agg[m].ms.push(Number(t1 - t0) / 1e6);
        agg[m].parseMs.push(Number(t2 - t1) / 1e6);
        agg[m].bytes.push(Buffer.byteLength(raw, 'utf-8'));
        agg[m].count = rows.length;
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
      } catch (err) {
        agg[m].error = err.message;
      }
    }
  }

  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  console.log('module        records   req(ms)   parse(ms)   response');
  console.log('───────────────────────────────────────────────────────');
  for (const m of MODULES) {
    const a = agg[m];
    if (a.error) { console.log(`${m.padEnd(13)} ERROR: ${a.error}`); continue; }
    console.log(
      `${m.padEnd(13)} ${String(a.count).padStart(7)}   ${avg(a.ms).toFixed(0).padStart(6)}   ` +
      `${avg(a.parseMs).toFixed(1).padStart(9)}   ${fmtBytes(Math.round(avg(a.bytes)))}`
    );
  }

  const cpu = process.cpuUsage(cpuStart);
  console.log('───────────────────────────────────────────────────────');
  console.log(`CPU time (this process): ${((cpu.user + cpu.system) / 1000).toFixed(0)} ms` +
    `   |   peak RSS: ${fmtBytes(peakRss)}`);
  console.log('\nNote: this measures the CONNECTOR side. To gauge Tally-side impact,' +
    '\nwatch Tally\'s CPU in Task Manager during each scenario and compare req(ms).\n');
}

module.exports = { run };
