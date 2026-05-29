/**
 * Atlas backend receiver for the local TallyPrime connector.
 *
 *   POST /api/tally/sync
 *   Authorization: Bearer <ATLAS_TALLY_API_KEY>   (or X-Atlas-Api-Key header)
 *
 * Accepts the connector payload (see tally-connector/), validates the API key,
 * and writes each module to its own tab in the Atlas Google Sheet. Each module
 * gets a header row on first write, then rows are appended. This keeps the
 * dashboard and future WhatsApp queries reading from one familiar store.
 *
 * Required env vars (Vercel → Settings → Environment Variables):
 *   ATLAS_TALLY_API_KEY     → shared secret the connector sends (comma-separate
 *                             ATLAS_TALLY_API_KEYS for multiple companies)
 *   GOOGLE_SERVICE_ACCOUNT  → service account JSON (raw or base64)
 *   SHEETS_SPREADSHEET_ID   → target spreadsheet ID
 */

const { google } = require('googleapis');

// Column order per module — defines both the header row and the row mapping.
const SCHEMAS = {
  ledgers: {
    sheet: 'Tally_Ledgers',
    fields: ['ledger_name', 'parent_group', 'gstin', 'phone', 'email',
      'address', 'city', 'state', 'opening_balance', 'credit_limit'],
  },
  sales: {
    sheet: 'Tally_Sales',
    fields: ['voucher_number', 'voucher_type', 'invoice_number', 'date',
      'party_name', 'gstin', 'amount', 'taxable_amount', 'cgst', 'sgst',
      'igst', 'due_date', 'narration'],
  },
  receipts: {
    sheet: 'Tally_Receipts',
    fields: ['voucher_number', 'date', 'party_name', 'amount',
      'against_invoice', 'narration'],
  },
  receivables: {
    sheet: 'Tally_Receivables',
    fields: ['party_name', 'invoice_number', 'invoice_date', 'due_date',
      'bill_amount', 'pending_amount', 'age_days', 'gstin'],
  },
  purchases: {
    sheet: 'Tally_Purchases',
    fields: ['voucher_number', 'date', 'supplier_name', 'gstin', 'amount',
      'taxable_amount', 'cgst', 'sgst', 'igst', 'narration'],
  },
  gst_summary: {
    sheet: 'Tally_GST_Summary',
    fields: ['period', 'outward_taxable', 'inward_taxable', 'cgst', 'sgst',
      'igst', 'cess', 'invoice_count'],
  },
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Reject plain HTTP in production (Vercel terminates TLS; x-forwarded-proto
  // is 'https' for real traffic). Localhost/dev is exempt.
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
      written[module] = rows.length;
      if (!rows.length) continue;
      await ensureSheet(sheets, spreadsheetId, schema);
      await appendRows(sheets, spreadsheetId, schema, rows, company, syncedAt);
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
  if (!keys.length) return false; // fail closed if no key configured
  const auth = req.headers['authorization'] || '';
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  const header = (req.headers['x-atlas-api-key'] || '').trim();
  return keys.includes(bearer) || keys.includes(header);
}

async function getSheetsClient() {
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

// Create the module's tab with a header row if it doesn't exist yet.
async function ensureSheet(sheets, spreadsheetId, schema) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets || []).some(
    (s) => s.properties && s.properties.title === schema.sheet
  );
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        addSheet: { properties: { title: schema.sheet, gridProperties: { frozenRowCount: 1 } } },
      }],
    },
  });
  const headers = ['synced_at', 'company', ...schema.fields];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${schema.sheet}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers] },
  });
}

async function appendRows(sheets, spreadsheetId, schema, rows, company, syncedAt) {
  const values = rows.map((r) => [syncedAt, company, ...schema.fields.map((f) => {
    const v = r[f];
    return v == null ? '' : v;
  })]);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${schema.sheet}!A:Z`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}
