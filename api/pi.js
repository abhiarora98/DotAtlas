/**
 * atlas — Vercel serverless function
 *
 * Replaces the Apps Script web app. Writes directly to the Comfort_atlas
 * Google Sheet via Google Sheets API v4 using a service account.
 * Faster (~200-500ms vs Apps Script's 1-3s) and no per-call cold start
 * from Google's Apps Script runtime.
 *
 * Required env vars (set in Vercel → Settings → Environment Variables):
 *   GOOGLE_SERVICE_ACCOUNT  → JSON string of the service account key
 *                             (raw JSON OR base64-encoded JSON both work)
 *   SHEETS_SPREADSHEET_ID   → the long ID from the sheet URL
 *
 * Setup guide: api/README.md
 */

const { google } = require('googleapis');

// Tab names inside the spreadsheet. Override via env vars when your tab is
// named something other than the defaults.
const PI_SHEET      = process.env.PI_SHEET_NAME      || 'Comfort_atlas';
const PARTIES_SHEET = process.env.PARTIES_SHEET_NAME || 'Parties';

const PI_HEADERS = [
  'No.', 'Party Code', 'PARTY NAME', 'SALES POC', 'REF #', 'PI Date', 'ONo',
  'Qty', 'Category', 'Model', 'Backing', 'Colour', 'Width', 'Length',
  'Units (sq.ft./pc)', 'Actual Rate', 'Bill Rate (Custom)', 'Freight', 'TD',
  'Taxable Value', 'Total (inc GST)', 'Dispatch Approved', 'Approval Date',
  'Total Received', 'Invoice No.', 'Dispatch Date', 'Remarks',
  'Dispatch Status', 'Month', 'STATE', 'REFRENCE ID',
];

// Parties tab columns. Aadhaar sits right after GSTIN (column F).
const PARTIES_HEADERS = [
  'CreatedAt', 'Party Name', 'Party Code', 'Sales POC',
  'GSTIN', 'Aadhaar', 'State', 'Phone', 'City',
];
const PARTIES_RANGE = PARTIES_SHEET + '!A:I';

// Indian state / UT → official 2-letter code, used to build the Party Code.
// These are the standard registration codes (PB, HR, DL…), not the numeric
// GSTIN prefixes.
const STATE_CODE_MAP = {
  'JAMMU & KASHMIR': 'JK', 'JAMMU AND KASHMIR': 'JK',
  'HIMACHAL PRADESH': 'HP', 'PUNJAB': 'PB', 'CHANDIGARH': 'CH',
  'UTTARAKHAND': 'UK', 'HARYANA': 'HR', 'DELHI': 'DL', 'RAJASTHAN': 'RJ',
  'UTTAR PRADESH': 'UP', 'BIHAR': 'BR', 'SIKKIM': 'SK',
  'ARUNACHAL PRADESH': 'AR', 'NAGALAND': 'NL', 'MANIPUR': 'MN',
  'MIZORAM': 'MZ', 'TRIPURA': 'TR', 'MEGHALAYA': 'ML', 'ASSAM': 'AS',
  'WEST BENGAL': 'WB', 'JHARKHAND': 'JH', 'ODISHA': 'OD', 'CHHATTISGARH': 'CG',
  'MADHYA PRADESH': 'MP', 'GUJARAT': 'GJ', 'DAMAN & DIU': 'DD',
  'DAMAN AND DIU': 'DD', 'DADRA & NAGAR HAVELI': 'DN',
  'DADRA AND NAGAR HAVELI': 'DN', 'MAHARASHTRA': 'MH',
  'ANDHRA PRADESH': 'AP', 'ANDHRA PRADESH (OLD)': 'AP', 'KARNATAKA': 'KA',
  'GOA': 'GA', 'LAKSHADWEEP': 'LD', 'KERALA': 'KL', 'TAMIL NADU': 'TN',
  'PUDUCHERRY': 'PY', 'ANDAMAN & NICOBAR': 'AN', 'ANDAMAN AND NICOBAR': 'AN',
  'TELANGANA': 'TS', 'LADAKH': 'LA',
};

// Resolve a state name (or an already-2-letter code) to its 2-letter code.
function stateToCode(state) {
  const s = String(state || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(s)) return s;
  return STATE_CODE_MAP[s] || '';
}

// Sales POC initials. Full names ("Vishal Sharma") → first letter of each
// token ("VS"). Already-uppercase abbreviations are kept whole, so
// "SP Mehta" → "SPM" and a bare "VS"/"SPM" passes through unchanged.
function pocInitials(poc) {
  const parts = String(poc || '').trim().split(/\s+/).filter(Boolean);
  let out = '';
  for (const p of parts) {
    const letters = p.replace(/[^A-Za-z]/g, '');
    if (!letters) continue;
    out += (letters.length > 1 && letters === letters.toUpperCase())
      ? letters.toUpperCase()
      : letters[0].toUpperCase();
  }
  return out;
}

// Initials of the party name — first letter of every word.
// "ABHITEX FURNISHINGS" → "AF", "SUNNY SYNTHETIC" → "SS".
function nameInitials(name) {
  const s = String(name || '').trim();
  let out = '';
  for (const word of s.split(/\s+/)) {
    const m = word.match(/[A-Za-z]/);
    if (m) out += m[0].toUpperCase();
  }
  return out || s.charAt(0).toUpperCase();
}

// Build the prefix that all running numbers share, e.g. "AF-HRVS".
function partyCodePrefix(name, state, poc) {
  return nameInitials(name) + '-' + stateToCode(state) + pocInitials(poc);
}

// Reduce an Indian mobile number to its 10 core digits (drops +91 / 91 / 0).
function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}
function isValidPhone(d) { return /^[6-9]\d{9}$/.test(d); }

// Given the prefix and all existing codes, return the next zero-padded code.
function nextPartyCode(prefix, existingCodes) {
  const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d{3})$', 'i');
  let max = 0;
  for (const c of existingCodes) {
    const m = re.exec(String(c || '').trim());
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return prefix + String(max + 1).padStart(3, '0');
}

module.exports = async (req, res) => {
  // Same-origin requests don't need CORS, but be permissive in case
  // someone runs the dashboard from a different host during testing.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true, app: 'atlas', backend: 'sheets-api',
      piSheet: PI_SHEET, partiesSheet: PARTIES_SHEET,
      time: new Date().toISOString(),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Dashboard sends Content-Type: text/plain to bypass CORS preflight on
    // Apps Script. Vercel doesn't auto-parse text/plain, so handle both shapes.
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const kind = payload.kind || 'pi';

    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
    if (!spreadsheetId) {
      return res.status(500).json({ ok: false, error: 'SHEETS_SPREADSHEET_ID env var is missing' });
    }

    if (kind === 'pi')           return await handlePi(sheets, spreadsheetId, payload, res);
    if (kind === 'party')        return await handleParty(sheets, spreadsheetId, payload, res);
    if (kind === 'list')         return await handleList(sheets, spreadsheetId, payload, res);
    if (kind === 'updateStatus') return await handleUpdateStatus(sheets, spreadsheetId, payload, res);

    return res.status(400).json({ ok: false, error: 'Unknown kind: ' + kind });
  } catch (err) {
    console.error('[atlas/api/pi] error:', err);
    const msg = err && err.errors && err.errors[0] && err.errors[0].message;
    return res.status(500).json({ ok: false, error: msg || String(err.message || err) });
  }
};

async function getSheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT env var is missing');

  let credentials;
  try {
    // Support raw JSON OR base64-encoded JSON (Vercel-safe envelope)
    credentials = raw.trim().startsWith('{')
      ? JSON.parse(raw)
      : JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
  } catch (e) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT is not valid JSON: ' + e.message);
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function handlePi(sheets, spreadsheetId, payload, res) {
  const rows = payload.rows || [];
  if (!rows.length) return res.status(400).json({ ok: false, error: 'Payload has no rows' });

  // Read column A and find the max No. so we can append after it.
  // Tolerates a header row (Number("No.") is NaN, gets skipped) and works
  // when the sheet has no headers at all.
  const colA = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: PI_SHEET + '!A:A',
  });
  const vals = colA.data.values || [];
  let maxNo = 0;
  for (const row of vals) {
    const n = Number(row && row[0]);
    if (!isNaN(n) && n > maxNo) maxNo = n;
  }
  const nextNo = maxNo + 1;

  // Self-bootstrap: if the sheet is empty, write the header row first so
  // fresh deployments don't need any manual setup.
  if (vals.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: PI_SHEET + '!A1:AE1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [PI_HEADERS] },
    });
  }

  const values = rows.map((r, i) => [
    nextNo + i,                          // A  No.
    r.partyCode || '',                   // B  Party Code
    r.partyName || '',                   // C  PARTY NAME
    r.salesPoc || '',                    // D  SALES POC
    r.ref || '',                         // E  REF #
    r.piDate || '',                      // F  PI Date
    r.oNo || (i + 1),                    // G  ONo
    r.qty || 0,                          // H  Qty
    r.category || '',                    // I  Category
    r.model || '',                       // J  Model
    r.backing || '',                     // K  Backing
    r.colour || '',                      // L  Colour
    r.width || '',                       // M  Width
    r.length || '',                      // N  Length
    r.units || 0,                        // O  Units (sq.ft./pc)
    r.actualRate || 0,                   // P  Actual Rate
    r.billRate || 0,                     // Q  Bill Rate (Custom)
    r.freight || 0,                      // R  Freight
    r.td || 0,                           // S  TD
    r.taxable || 0,                      // T  Taxable Value
    r.totalIncGst || 0,                  // U  Total (inc GST)
    r.dispatchApproved || '',            // V  Dispatch Approved
    r.approvalDate || '',                // W  Approval Date
    r.totalReceived || '',               // X  Total Received
    r.invoiceNo || '',                   // Y  Invoice No.
    r.dispatchDate || '',                // Z  Dispatch Date
    r.remarks || '',                     // AA Remarks
    r.dispatchStatus || 'Pending',       // AB Dispatch Status
    r.month || '',                       // AC Month
    r.state || '',                       // AD STATE
    r.referenceId || '',                 // AE REFRENCE ID
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: PI_SHEET + '!A:AE',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });

  return res.status(200).json({
    ok: true,
    count: rows.length,
    firstNo: nextNo,
    ref: payload.header && payload.header.ref,
  });
}

async function handleList(sheets, spreadsheetId, _payload, res) {
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: PI_SHEET + '!A:AE',
  });
  const all = resp.data.values || [];
  if (all.length === 0) return res.status(200).json({ ok: true, pis: [] });

  // Skip the header row if column A of row 0 isn't a number (i.e. it's "No.")
  const first = all[0] || [];
  const startIdx = (isNaN(Number(first[0])) || first[0] === '') ? 1 : 0;
  const dataRows = all.slice(startIdx);

  // Group rows by REF# (column E, index 4). A single PI = one REF# spanning N rows.
  const groups = new Map();
  for (const r of dataRows) {
    const ref = (r[4] || '').toString().trim();
    if (!ref) continue;
    if (!groups.has(ref)) groups.set(ref, []);
    groups.get(ref).push(r);
  }

  const pis = [];
  for (const [ref, items] of groups) {
    const f = items[0];
    // PI-level status: if all lines share the same dispatchStatus, use it;
    // otherwise label it 'Mixed' so the UI can flag the inconsistency.
    const statuses = new Set(items.map(r => (r[27] || 'Pending').trim()));
    const piStatus = statuses.size === 1 ? [...statuses][0] : 'Mixed';
    pis.push({
      ref,
      partyCode: f[1] || '',
      party:     f[2] || '',
      poc:       f[3] || '',
      date:      f[5] || '',
      state:     f[29] || '',
      referenceId: f[30] || '',
      lines:     items.length,
      totalQty:  items.reduce((a, r) => a + (Number(r[7])  || 0), 0),
      totalIncGst: items.reduce((a, r) => a + (Number(r[20]) || 0), 0),
      status:    piStatus,
      firstNo: Number(f[0]) || 0,
      items: items.map(r => ({
        no:         r[0]  || '',
        oNo:        r[6]  || '',
        qty:        Number(r[7])  || 0,
        category:   r[8]  || '',
        model:      r[9]  || '',
        backing:    r[10] || '',
        colour:     r[11] || '',
        width:      r[12] || '',
        length:     r[13] || '',
        units:      Number(r[14]) || 0,
        actualRate: Number(r[15]) || 0,
        billRate:   Number(r[16]) || 0,
        freight:    Number(r[17]) || 0,
        td:         Number(r[18]) || 0,
        taxable:    Number(r[19]) || 0,
        total:      Number(r[20]) || 0,
        dispatchStatus: r[27] || '',
      })),
    });
  }

  // Newest first by the No. of the PI's first line (column A is sequential).
  pis.sort((a, b) => b.firstNo - a.firstNo);

  return res.status(200).json({ ok: true, count: pis.length, pis });
}

async function handleUpdateStatus(sheets, spreadsheetId, payload, res) {
  const ref = (payload.ref || '').toString().trim();
  const status = (payload.status || '').toString().trim();
  if (!ref)    return res.status(400).json({ ok: false, error: 'ref is required' });
  if (!status) return res.status(400).json({ ok: false, error: 'status is required' });

  // Find all rows whose column E (REF #) matches; collect their sheet-row numbers.
  const colE = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: PI_SHEET + '!E:E',
  });
  const vals = colE.data.values || [];
  const rowNums = [];
  for (let i = 0; i < vals.length; i++) {
    const cell = (vals[i] && vals[i][0] || '').toString().trim();
    if (cell === ref) rowNums.push(i + 1); // sheet rows are 1-indexed
  }
  if (!rowNums.length) return res.status(404).json({ ok: false, error: 'No rows match REF# ' + ref });

  // Batch-update column AB on each matching row.
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: rowNums.map(n => ({
        range: PI_SHEET + '!AB' + n,
        values: [[status]],
      })),
    },
  });

  return res.status(200).json({ ok: true, ref, status, updated: rowNums.length });
}

async function handleParty(sheets, spreadsheetId, payload, res) {
  const p = payload.party || {};
  const name  = String(p.name || '').trim();
  const poc   = String(p.poc || '').trim();
  const state = String(p.state || '').trim();
  const gst   = String(p.gst || '').trim().toUpperCase();
  const aadhaar = String(p.aadhaar || '').replace(/\D/g, '');
  const city  = String(p.city || '').trim();
  const phone = normalizePhone(p.phone);

  if (!name)  return res.status(400).json({ ok: false, error: 'Party name is required' });
  if (!poc)   return res.status(400).json({ ok: false, error: 'Sales POC is required to generate the party code' });
  if (!city)  return res.status(400).json({ ok: false, error: 'City is required' });
  if (!isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'A valid 10-digit Indian mobile number is required' });

  const stateCode = stateToCode(state);
  if (!stateCode) return res.status(400).json({ ok: false, error: 'A valid State is required to generate the party code' });

  // GST or Aadhaar must be present; Aadhaar must be 12 numeric digits.
  if (!gst && !aadhaar) {
    return res.status(400).json({ ok: false, error: 'Provide a GST number or an Aadhaar number' });
  }
  if (aadhaar && !/^\d{12}$/.test(aadhaar)) {
    return res.status(400).json({ ok: false, error: 'Aadhaar must be exactly 12 digits' });
  }

  // Ensure the Parties tab exists; create it with a header row on first call.
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets || []).some(s => s.properties && s.properties.title === PARTIES_SHEET);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: PARTIES_SHEET,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: PARTIES_SHEET + '!A1:I1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [PARTIES_HEADERS] },
    });
  }

  // Read existing Party Codes (column C) so we can guarantee uniqueness and
  // compute the next running number for this prefix. Also guard against an
  // exact duplicate party name.
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: PARTIES_SHEET + '!B:C',
  });
  const existingRows = existing.data.values || [];
  const existingCodes = [];
  const nameU = name.toUpperCase();
  for (let i = 0; i < existingRows.length; i++) {
    const row = existingRows[i] || [];
    if (String(row[0] || '').trim().toUpperCase() === nameU) {
      return res.status(409).json({ ok: false, error: 'A party named "' + name + '" already exists' });
    }
    if (row[1]) existingCodes.push(row[1]);
  }

  // System-generated, unique party code: [First letter]-[State][POC][NNN].
  const prefix = partyCodePrefix(name, state, poc);
  const code = nextPartyCode(prefix, existingCodes);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: PARTIES_RANGE,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        new Date().toISOString(),
        name, code, poc,
        gst, aadhaar, state,
        phone, city,
      ]],
    },
  });

  return res.status(200).json({ ok: true, party: name, code });
}
