/**
 * End-to-end smoke test with no real Tally/Atlas:
 *   - a fake Tally HTTP server returns canned XML per request ID
 *   - a fake Atlas HTTP server captures the posted payload
 *   - we run a real sync through the actual code path and assert the shape
 *
 * Run with: node test/e2e.test.js
 */

const http = require('http');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

// --- canned Tally XML responses, keyed by the <ID> in the request ---
const FIXTURES = {
  AtlasCompanies: `<ENVELOPE><BODY><DATA><COLLECTION>
    <COMPANY NAME="Acme Traders"></COMPANY>
    <COMPANY NAME="Beta Exports"></COMPANY>
  </COLLECTION></DATA></BODY></ENVELOPE>`,

  AtlasLedgers: `<ENVELOPE><BODY><DATA><COLLECTION>
    <LEDGER NAME="Reliable Retail">
      <PARENT>Sundry Debtors</PARENT>
      <ALTERID>5</ALTERID>
      <OPENINGBALANCE>15000.00 Dr</OPENINGBALANCE>
      <CREDITLIMIT>200000</CREDITLIMIT>
      <LEDGERMOBILE>9876543210</LEDGERMOBILE>
      <EMAIL>accounts@reliable.example</EMAIL>
      <PARTYGSTIN>27AABCR1234M1Z5</PARTYGSTIN>
      <LEDGERSTATENAME>Maharashtra</LEDGERSTATENAME>
      <ADDRESS.LIST><ADDRESS>12 MG Road</ADDRESS><ADDRESS>Pune</ADDRESS></ADDRESS.LIST>
    </LEDGER>
  </COLLECTION></DATA></BODY></ENVELOPE>`,

  AtlasSales: `<ENVELOPE><BODY><DATA><COLLECTION>
    <VOUCHER>
      <DATE>20260510</DATE>
      <ALTERID>12</ALTERID>
      <VOUCHERNUMBER>S-101</VOUCHERNUMBER>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <REFERENCE>INV-101</REFERENCE>
      <REFERENCEDATE>20260609</REFERENCEDATE>
      <PARTYLEDGERNAME>Reliable Retail</PARTYLEDGERNAME>
      <PARTYGSTIN>27AABCR1234M1Z5</PARTYGSTIN>
      <NARRATION>Sale of goods</NARRATION>
      <AMOUNT>-11800.00</AMOUNT>
      <ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales Account</LEDGERNAME><AMOUNT>-10000</AMOUNT></ALLLEDGERENTRIES.LIST>
      <ALLLEDGERENTRIES.LIST><LEDGERNAME>CGST</LEDGERNAME><AMOUNT>-900</AMOUNT></ALLLEDGERENTRIES.LIST>
      <ALLLEDGERENTRIES.LIST><LEDGERNAME>SGST</LEDGERNAME><AMOUNT>-900</AMOUNT></ALLLEDGERENTRIES.LIST>
    </VOUCHER>
  </COLLECTION></DATA></BODY></ENVELOPE>`,

  AtlasReceipts: `<ENVELOPE><BODY><DATA><COLLECTION>
    <VOUCHER>
      <DATE>20260512</DATE>
      <ALTERID>7</ALTERID>
      <VOUCHERNUMBER>R-55</VOUCHERNUMBER>
      <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
      <PARTYLEDGERNAME>Reliable Retail</PARTYLEDGERNAME>
      <NARRATION>Payment received</NARRATION>
      <AMOUNT>5000</AMOUNT>
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>Reliable Retail</LEDGERNAME><AMOUNT>-5000</AMOUNT>
        <BILLALLOCATIONS.LIST><NAME>INV-101</NAME></BILLALLOCATIONS.LIST>
      </ALLLEDGERENTRIES.LIST>
    </VOUCHER>
  </COLLECTION></DATA></BODY></ENVELOPE>`,

  AtlasPurchases: `<ENVELOPE><BODY><DATA><COLLECTION>
    <VOUCHER>
      <DATE>20260508</DATE>
      <ALTERID>9</ALTERID>
      <VOUCHERNUMBER>P-22</VOUCHERNUMBER>
      <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
      <PARTYLEDGERNAME>Global Supplies</PARTYLEDGERNAME>
      <PARTYGSTIN>29AAACG1234N1Z2</PARTYGSTIN>
      <NARRATION>Stock purchase</NARRATION>
      <AMOUNT>23600</AMOUNT>
      <ALLLEDGERENTRIES.LIST><LEDGERNAME>Purchase Account</LEDGERNAME><AMOUNT>20000</AMOUNT></ALLLEDGERENTRIES.LIST>
      <ALLLEDGERENTRIES.LIST><LEDGERNAME>IGST</LEDGERNAME><AMOUNT>3600</AMOUNT></ALLLEDGERENTRIES.LIST>
    </VOUCHER>
  </COLLECTION></DATA></BODY></ENVELOPE>`,

  AtlasBills: `<ENVELOPE><BODY><DATA><COLLECTION>
    <BILLS>
      <BILLDATE>20260510</BILLDATE>
      <NAME>INV-101</NAME>
      <PARENT>Reliable Retail</PARENT>
      <OPENINGBALANCE>11800 Dr</OPENINGBALANCE>
      <CLOSINGBALANCE>6800 Dr</CLOSINGBALANCE>
      <BILLCREDITPERIOD>30 Days</BILLCREDITPERIOD>
      <PARTYGSTIN>27AABCR1234M1Z5</PARTYGSTIN>
    </BILLS>
    <BILLS>
      <BILLDATE>20260101</BILLDATE>
      <NAME>INV-090</NAME>
      <PARENT>Old Customer</PARENT>
      <CLOSINGBALANCE>0</CLOSINGBALANCE>
    </BILLS>
  </COLLECTION></DATA></BODY></ENVELOPE>`,
};

const tallyRequests = {}; // last request body seen, keyed by <ID>
function fakeTally() {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const m = body.match(/<ID>(.*?)<\/ID>/);
      const id = m ? m[1] : '';
      tallyRequests[id] = body;
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(FIXTURES[id] || '<ENVELOPE><BODY><DATA><COLLECTION/></DATA></BODY></ENVELOPE>');
    });
  });
}

let captured = null;
function fakeAtlas() {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      captured = { auth: req.headers.authorization, payload: JSON.parse(body) };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

(async () => {
  const tallyServer = fakeTally();
  const atlasServer = fakeAtlas();
  const tallyPort = await listen(tallyServer);
  const atlasPort = await listen(atlasServer);

  // Point the connector at the fakes via config.json (clean it up after).
  const cfgPath = path.join(ROOT, 'config.json');
  const statePath = path.join(ROOT, 'state.json');
  const hadCfg = fs.existsSync(cfgPath);
  const backup = hadCfg ? fs.readFileSync(cfgPath, 'utf-8') : null;
  fs.writeFileSync(cfgPath, JSON.stringify({
    tallyHost: '127.0.0.1', tallyPort,
    atlasUrl: `http://127.0.0.1:${atlasPort}/api/tally/sync`,
    apiKey: 'test-key-123', company: 'Acme Traders', pollMinutes: 5, uiPort: 8765,
    requestSpacingMs: 0, // no need to throttle the in-process fake
  }));
  // Start with a clean state so the first sync is a fresh full baseline.
  if (fs.existsSync(statePath)) fs.unlinkSync(statePath);

  // Require AFTER writing config so modules read the fake settings.
  delete require.cache[require.resolve('../src/config')];
  const { runSync } = require('../src/sync');
  const tallyClient = require('../src/tally/client');

  try {
    // listCompanies
    const companies = await tallyClient.listCompanies('127.0.0.1', tallyPort);
    assert.deepStrictEqual(companies, ['Acme Traders', 'Beta Exports'], 'company list');

    // --- First sync: should be a FULL baseline (no prior checkpoint) ---
    const r = await runSync({ source: 'test' });
    assert.ok(r.ok, 'sync should succeed: ' + r.error);
    assert.ok(r.isFull, 'first sync must be a full baseline');

    const p = captured.payload;
    assert.strictEqual(p.mode, 'full', 'payload mode full');
    assert.strictEqual(captured.auth, 'Bearer test-key-123', 'bearer auth header');
    assert.strictEqual(p.company, 'Acme Traders');
    assert.ok(p.synced_at, 'synced_at present');

    // Ledgers
    assert.strictEqual(p.ledgers.length, 1);
    assert.strictEqual(p.ledgers[0].ledger_name, 'Reliable Retail');
    assert.strictEqual(p.ledgers[0].gstin, '27AABCR1234M1Z5');
    assert.strictEqual(p.ledgers[0].address, '12 MG Road, Pune');
    assert.strictEqual(p.ledgers[0].opening_balance, 15000);

    // Sales + tax breakup
    assert.strictEqual(p.sales.length, 1);
    assert.strictEqual(p.sales[0].invoice_number, 'INV-101');
    assert.strictEqual(p.sales[0].taxable_amount, 10000);
    assert.strictEqual(p.sales[0].cgst, 900);
    assert.strictEqual(p.sales[0].sgst, 900);
    assert.strictEqual(p.sales[0].amount, 11800);
    assert.strictEqual(p.sales[0].due_date, '2026-06-09');

    // Receipts + bill allocation
    assert.strictEqual(p.receipts.length, 1);
    assert.strictEqual(p.receipts[0].against_invoice, 'INV-101');
    assert.strictEqual(p.receipts[0].amount, 5000);

    // Purchases + IGST
    assert.strictEqual(p.purchases.length, 1);
    assert.strictEqual(p.purchases[0].supplier_name, 'Global Supplies');
    assert.strictEqual(p.purchases[0].igst, 3600);
    assert.strictEqual(p.purchases[0].taxable_amount, 20000);

    // Receivables: only the open bill survives (closing > 0)
    assert.strictEqual(p.receivables.length, 1);
    assert.strictEqual(p.receivables[0].invoice_number, 'INV-101');
    assert.strictEqual(p.receivables[0].pending_amount, 6800);
    assert.strictEqual(p.receivables[0].due_date, '2026-06-09');
    assert.ok(p.receivables[0].age_days >= 0);

    // GST summary derived for 2026-05
    assert.strictEqual(p.gst_summary.length, 1);
    assert.strictEqual(p.gst_summary[0].period, '2026-05');
    assert.strictEqual(p.gst_summary[0].outward_taxable, 10000);
    assert.strictEqual(p.gst_summary[0].inward_taxable, 20000);
    assert.strictEqual(p.gst_summary[0].cgst, 900);
    assert.strictEqual(p.gst_summary[0].invoice_count, 1);

    // --- Checkpoints persisted from the full sync ---
    const stateAfterFull = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    assert.strictEqual(stateAfterFull.checkpoints.ledgers.alterId, 5, 'ledger AlterID checkpoint');
    assert.strictEqual(stateAfterFull.checkpoints.sales.alterId, 12, 'sales AlterID checkpoint');
    assert.strictEqual(stateAfterFull.checkpoints.purchases.alterId, 9, 'purchase AlterID checkpoint');
    assert.ok(stateAfterFull.lastFullSyncAt, 'lastFullSyncAt recorded');

    // --- A scheduled tick right after a full sync: nothing is due ---
    const sched = await runSync({ source: 'scheduled' });
    assert.ok(sched.ok && sched.skipped, 'scheduled tick right after full should skip');

    // --- Manual incremental: must send the AlterID filter, not a full pull ---
    const inc = await runSync({ source: 'manual' });
    assert.ok(inc.ok, 'manual incremental should succeed');
    assert.ok(!inc.isFull, 'manual sync is incremental');
    assert.strictEqual(captured.payload.mode, 'incremental', 'incremental payload mode');
    assert.ok(
      /\$AlterID &gt; 12|\$AlterID > 12/.test(tallyRequests.AtlasSales),
      'incremental sales request must filter by AlterID > 12'
    );
    // gst_summary is full-sync-only, so it is absent from an incremental run.
    assert.strictEqual(captured.payload.gst_summary.length, 0, 'no GST summary on incremental');

    console.log('\n✅ All e2e assertions passed.');
  } finally {
    tallyServer.close();
    atlasServer.close();
    // Restore prior config; remove the test state file.
    if (backup != null) fs.writeFileSync(cfgPath, backup);
    else fs.existsSync(cfgPath) && fs.unlinkSync(cfgPath);
    fs.existsSync(statePath) && fs.unlinkSync(statePath);
  }
})().catch((e) => { console.error('❌ Test failed:', e); process.exit(1); });
