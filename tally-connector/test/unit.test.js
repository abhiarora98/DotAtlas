/**
 * Unit tests for the pure logic that has no network/Tally/Sheets dependency:
 *   - computeUpserts  (Atlas-side upsert/dedupe diffing)
 *   - chunkPayload    (connector-side row-capped POST chunking)
 *
 * Run with: node test/unit.test.js
 */

const assert = require('assert');
const { computeUpserts, SCHEMAS, colLetter } = require('../../api/tally/sync');
const { chunkPayload } = require('../src/atlas/client');

// --- computeUpserts: update existing by key, insert new, de-dupe batch ---
(function testUpsert() {
  const schema = SCHEMAS.sales; // key: voucher_number; meta cols: synced_at, company
  const idx = (f) => 2 + schema.fields.indexOf(f);

  // One existing row for Acme / S-1.
  const existing = (() => {
    const row = ['2026-01-01T00:00:00Z', 'Acme'];
    schema.fields.forEach((f) => row.push(f === 'voucher_number' ? 'S-1' : (f === 'amount' ? 100 : '')));
    return [row];
  })();

  const incoming = [
    { voucher_number: 'S-1', amount: 150, party_name: 'Reliable' }, // update
    { voucher_number: 'S-2', amount: 200 },                          // insert
    { voucher_number: 'S-3', amount: 1 },                            // dup key, older
    { voucher_number: 'S-3', amount: 999 },                          // dup key, newer wins
  ];

  const { updates, inserts } = computeUpserts(schema, existing, incoming, 'Acme', '2026-05-29T00:00:00Z');

  assert.strictEqual(updates.length, 1, 'one update (S-1)');
  assert.strictEqual(updates[0].range, `${schema.sheet}!A2:${colLetter(2 + schema.fields.length)}2`, 'update targets row 2');
  assert.strictEqual(updates[0].values[0][idx('amount')], 150, 'S-1 amount overwritten to 150');

  assert.strictEqual(inserts.length, 2, 'two inserts (S-2, S-3)');
  const s3 = inserts.find((r) => r[idx('voucher_number')] === 'S-3');
  assert.strictEqual(s3[idx('amount')], 999, 'S-3 de-duped to newest (999)');
  console.log('✓ computeUpserts: update + insert + intra-batch de-dupe');
})();

// --- computeUpserts: same key under a different company must NOT collide ---
(function testCompanyScoping() {
  const schema = SCHEMAS.ledgers; // key: ledger_name
  const idx = (f) => 2 + schema.fields.indexOf(f);
  const existing = [(() => {
    const row = ['t', 'Acme'];
    schema.fields.forEach((f) => row.push(f === 'ledger_name' ? 'Cash' : ''));
    return row;
  })()];
  // Incoming "Cash" for a DIFFERENT company → should insert, not update.
  const { updates, inserts } = computeUpserts(schema, existing, [{ ledger_name: 'Cash' }], 'Beta', 't2');
  assert.strictEqual(updates.length, 0, 'no update across companies');
  assert.strictEqual(inserts.length, 1, 'insert for other company');
  assert.strictEqual(inserts[0][idx('ledger_name')], 'Cash');
  console.log('✓ computeUpserts: company is part of the key');
})();

// --- chunkPayload: caps rows per chunk, preserves all rows + module keys ---
(function testChunking() {
  const base = { company: 'Acme', synced_at: 't', mode: 'full' };
  const sales = Array.from({ length: 5 }, (_, i) => ({ voucher_number: `S-${i}` }));
  const purchases = Array.from({ length: 3 }, (_, i) => ({ voucher_number: `P-${i}` }));

  const chunks = chunkPayload(base, { sales, purchases, receipts: [] }, 4);

  // No chunk exceeds the row cap.
  for (const c of chunks) {
    const rows = (c.sales || []).length + (c.purchases || []).length;
    assert.ok(rows <= 4, `chunk has ${rows} rows (<= 4)`);
    assert.strictEqual(c.company, 'Acme');
    assert.strictEqual(c.mode, 'full');
  }
  // All rows preserved across chunks.
  const totalSales = chunks.reduce((a, c) => a + (c.sales || []).length, 0);
  const totalPurch = chunks.reduce((a, c) => a + (c.purchases || []).length, 0);
  assert.strictEqual(totalSales, 5, 'all sales rows kept');
  assert.strictEqual(totalPurch, 3, 'all purchase rows kept');
  assert.ok(chunks.length >= 2, 'splits into multiple chunks');

  // Empty input → no chunks (caller skips the POST).
  assert.strictEqual(chunkPayload(base, { sales: [] }, 4).length, 0, 'empty → no chunks');
  console.log('✓ chunkPayload: caps rows, preserves data, handles empty');
})();

console.log('\n✅ All unit assertions passed.');
