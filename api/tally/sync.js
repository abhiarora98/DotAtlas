/**
 * Atlas backend receiver for the local TallyPrime connector.
 *
 *   POST /api/tally/sync
 *   Authorization: Bearer <ATLAS_TALLY_API_KEY>   (or X-Atlas-Api-Key header)
 *
 * Accepts the connector payload (one chunk per request), validates the API key,
 * and UPSERTS each module into its own tab of the Atlas Google Sheet — rows are
 * matched by a natural key and overwritten in place, so re-syncs and edits never
 * create duplicates (no append-only growth).
 *
 * Natural keys (company is always part of the key):
 *   ledgers      → company + ledger_name
 *   sales        → company + voucher_number
 *   receipts     → company + voucher_number
 *   receivables  → company + invoice_number
 *   purchases    → company + voucher_number
 *   gst_summary  → company + period
 *
 * Required env vars:
 *   ATLAS_TALLY_API_KEY     → shared secret (comma-separate ATLAS_TALLY_API_KEYS for many)
 *   GOOGLE_SERVICE_ACCOUNT  → service account JSON (raw or base64)
 *   SHEETS_SPREADSHEET_ID   → target spreadsheet ID
 */

// Each module: tab name, ordered fields, and the key field(s) within `fields`.
const SCHEMAS = {
  ledgers: {
    sheet: 'Tally_Ledgers',
    key: ['ledger_name'],
    fields: ['ledger_name', 'parent_group', 'gstin', 'phone', 'email',
      'address', 'city', 'state', 'opening_balance', 'credit_limit'],
  },
  sales: {
    sheet: 'Tally_Sales',
    key: ['voucher_number'],
    fields: ['voucher_number', 'voucher_type', 'invoice_number', 'date',
      'party_name', 'gstin', 'amount', 'taxable_amount', 'cgst', 'sgst',
      'igst', 'due_date', 'narration'],
  },
  receipts: {
    sheet: 'Tally_Receipts',
    key: ['voucher_number'],
    fields: ['voucher_number', 'date', 'party_name', 'amount',
      'against_invoice', 'narration'],
  },
  receivables: {
    sheet: 'Tally_Receivables',
    key: ['invoice_number'],
    fields: ['party_name', 'invoice_number', 'invoice_date', 'due_date',
      'bill_amount', 'pending_amount', 'age_days', 'gstin'],
  },
  purchases: {
    sheet: 'Tally_Purchases',
    key: ['voucher_number'],
    fields: ['voucher_number', 'date', 'supplier_name', 'gstin', 'amount',
      'taxable_amount', 'cgst', 'sgst', 'igst', 'narration'],
  },
  gst_summary: {
    sheet: 'Tally_GST_Summary',
    key: ['period'],
    fields: ['period', 'outward_taxable', 'inward_taxable', 'cgst', 'sgst',
      'igst', 'cess', 'invoice_count'],
  },
};

// Header row = these two columns followed by the module's fields.
const META_COLS = ['synced_at', 'company'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const proto = req.headers['x-forwarded-proto'];
  const host = req.headers.host || '';
  if (proto && proto !== 'https' && !/^(localhost|127\.0\.0\.1)/.test(host)) {
    return res.status(400).json({ ok: false, error: 'HTTPS required' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: 'Invalid or missing API key' });
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const company = payload.company || '';
    const syncedAt = payload.synced_at || new Date().toISOString();

    const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
    if (!spreadsheetId) {
      return res.status(500).json({ ok: false, error: 'SHEETS_SPREADSHEET_ID env var is missing' });
    }
    const sheets = await getSheetsClient();

    const written = {};
    for (const [module, schema] of Object.entries(SCHEMAS)) {
      const rows = Array.isArray(payload[module]) ? payload[module] : [];
      if (!rows.length) continue;
      await ensureSheet(sheets, spreadsheetId, schema);
      written[module] = await upsertModule(sheets, spreadsheetId, schema, rows, company, syncedAt);
    }

    return res.status(200).json({ ok: true, company, synced_at: syncedAt, written });
  } catch (err) {
    console.error('[atlas/api/tally/sync] error:', err);
    const msg = err && err.errors && err.errors[0] && err.errors[0].message;
    return res.status(500).json({ ok: false, error: msg || String(err.message || err) });
  }
};

function isAuthorized(req) {
  const keys = (process.env.ATLAS_TALLY_API_KEYS || process.env.ATLAS_TALLY_API_KEY || '')
    .split(',').map((k) => k.trim()).filter(Boolean);
  if (!keys.length) return false;
  const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  const header = (req.headers['x-atlas-api-key'] || '').trim();
  return keys.includes(bearer) || keys.includes(header);
}

async function getSheetsClient() {
  const { google } = require('googleapis'); // lazy: pure helpers stay importable without it
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT env var is missing');
  const credentials = raw.trim().startsWith('{')
    ? JSON.parse(raw)
    : JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// Retry Sheets calls on rate-limit/transient errors with exponential backoff.
async function withRetry(fn, label, tries = 4) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = err && (err.code || (err.response && err.response.status));
      const retriable = code === 429 || (code >= 500 && code < 600);
      lastErr = err;
      if (!retriable || attempt === tries) throw err;
      const waitMs = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s
      console.warn(`[tally/sync] ${label} ${code} — retry ${attempt}/${tries - 1} in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

function colLetter(n) {
  // 1-indexed column number → A1 letters (1→A, 27→AA).
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

async function ensureSheet(sheets, spreadsheetId, schema) {
  const meta = await withRetry(() => sheets.spreadsheets.get({ spreadsheetId }), 'get-meta');
  const exists = (meta.data.sheets || []).some((s) => s.properties && s.properties.title === schema.sheet);
  if (exists) return;
  await withRetry(() => sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: schema.sheet, gridProperties: { frozenRowCount: 1 } } } }] },
  }), 'add-sheet');
  await withRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${schema.sheet}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[...META_COLS, ...schema.fields]] },
  }), 'write-header');
}

// Pure: given the existing data rows and incoming records, decide which to
// update (matched by natural key) and which to insert. Exported for testing.
// `existingRows` are sheet rows below the header, in [synced_at, company, ...fields] order.
function computeUpserts(schema, existingRows, incomingRows, company, syncedAt) {
  const SEP = ' | ';
  const fieldIndex = (f) => META_COLS.length + schema.fields.indexOf(f);
  const COMPANY_COL = META_COLS.indexOf('company');
  // Existing rows key off THEIR OWN company column (a sheet holds many
  // companies); incoming rows key off this request's company.
  const keyFromRow = (row) => [String(row[COMPANY_COL] ?? '').trim(),
    ...schema.key.map((k) => String(row[fieldIndex(k)] ?? '').trim())].join(SEP);
  const keyFromRec = (rec) => [String(company ?? '').trim(),
    ...schema.key.map((k) => String(rec[k] ?? '').trim())].join(SEP);

  // Map existing key → 1-indexed sheet row (data starts at row 2).
  const keyToRow = new Map();
  existingRows.forEach((row, i) => {
    keyToRow.set(keyFromRow(row), i + 2);
  });

  // De-dupe within the incoming batch itself — last record for a key wins.
  const incomingByKey = new Map();
  for (const rec of incomingRows) {
    incomingByKey.set(keyFromRec(rec), rec);
  }

  const updates = [];
  const inserts = [];
  for (const [key, rec] of incomingByKey) {
    const values = [syncedAt, company, ...schema.fields.map((f) => (rec[f] == null ? '' : rec[f]))];
    if (keyToRow.has(key)) {
      const rowNum = keyToRow.get(key);
      const lastCol = colLetter(META_COLS.length + schema.fields.length);
      updates.push({ range: `${schema.sheet}!A${rowNum}:${lastCol}${rowNum}`, values: [values] });
    } else {
      inserts.push(values);
    }
  }
  return { updates, inserts };
}

async function upsertModule(sheets, spreadsheetId, schema, rows, company, syncedAt) {
  const lastCol = colLetter(META_COLS.length + schema.fields.length);
  const resp = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId, range: `${schema.sheet}!A2:${lastCol}`,
  }), 'read-keys');
  const existingRows = resp.data.values || [];

  const { updates, inserts } = computeUpserts(schema, existingRows, rows, company, syncedAt);

  if (updates.length) {
    await withRetry(() => sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    }), 'batch-update');
  }
  if (inserts.length) {
    await withRetry(() => sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${schema.sheet}!A:${lastCol}`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: inserts },
    }), 'append');
  }
  return { updated: updates.length, inserted: inserts.length };
}

module.exports.SCHEMAS = SCHEMAS;
module.exports.computeUpserts = computeUpserts;
module.exports.colLetter = colLetter;
