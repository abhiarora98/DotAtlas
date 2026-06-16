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

// Parties tab columns. Aadhaar sits right after GSTIN (column F); Type
// (Customer/Supplier/Both) and Status (Active/Inactive) trail at the end,
// followed by Email, addresses, Credit Limit and the last-updated stamp.
const PARTIES_HEADERS = [
  'CreatedAt', 'Party Name', 'Party Code', 'Sales POC',
  'GSTIN', 'Aadhaar', 'State', 'Phone', 'City', 'Type', 'Status',
  'Email', 'Billing Address', 'Shipping Address', 'Credit Limit', 'UpdatedAt',
  'Stage', 'Owner',
];
const PARTIES_RANGE = PARTIES_SHEET + '!A:R';

// CRM entities (tasks, contacts, documents, interaction log) for each party,
// so they sync across users/devices. One row per entity, keyed by PartyCode.
const CRM_SHEET   = process.env.CRM_SHEET_NAME || 'PartyCRM';
const CRM_HEADERS = ['Id', 'PartyCode', 'Kind', 'Text', 'Due', 'Done', 'Meta', 'CreatedAt', 'UpdatedAt'];
const CRM_RANGE   = CRM_SHEET + '!A:I';

// Sales documents (Sales Orders + Sales Invoices). PIs stay in the PI sheet;
// these are the SO/INV layer plus the dispatch pipeline stage.
const SALES_SHEET   = process.env.SALES_SHEET_NAME || 'SalesDocs';
const SALES_HEADERS = ['Id', 'DocType', 'Number', 'Date', 'PartyCode', 'PartyName',
  'POC', 'SourceRef', 'Amount', 'Lines', 'Status', 'DispatchStage', 'CreatedAt', 'UpdatedAt'];
const SALES_RANGE   = SALES_SHEET + '!A:N';

function normPartyType(t) {
  const v = String(t || '').trim().toLowerCase();
  if (v === 'supplier') return 'Supplier';
  if (v === 'both') return 'Both';
  return 'Customer';
}
function normPartyStatus(s) {
  const v = String(s || '').trim().toLowerCase();
  if (v === 'archived') return 'Archived';
  if (v === 'inactive') return 'Inactive';
  return 'Active';
}

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
    if (kind === 'updateParty')  return await handleUpdateParty(sheets, spreadsheetId, payload, res);
    if (kind === 'list')         return await handleList(sheets, spreadsheetId, payload, res);
    if (kind === 'listParties')  return await handleListParties(sheets, spreadsheetId, payload, res);
    if (kind === 'crmList')      return await handleCrmList(sheets, spreadsheetId, payload, res);
    if (kind === 'crmListAll')   return await handleCrmListAll(sheets, spreadsheetId, payload, res);
    if (kind === 'salesDocList')   return await handleSalesDocList(sheets, spreadsheetId, payload, res);
    if (kind === 'salesDocAdd')    return await handleSalesDocAdd(sheets, spreadsheetId, payload, res);
    if (kind === 'salesDocUpdate') return await handleSalesDocUpdate(sheets, spreadsheetId, payload, res);
    if (kind === 'crmAdd')       return await handleCrmAdd(sheets, spreadsheetId, payload, res);
    if (kind === 'crmUpdate')    return await handleCrmUpdate(sheets, spreadsheetId, payload, res);
    if (kind === 'crmDelete')    return await handleCrmDelete(sheets, spreadsheetId, payload, res);
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
  const type   = normPartyType(p.type);
  const status = normPartyStatus(p.status);
  const email = String(p.email || '').trim();
  const billing = String(p.billingAddress || '').trim();
  const shipping = String(p.shippingAddress || '').trim();
  const creditLimit = p.creditLimit != null && String(p.creditLimit).trim() !== ''
    ? String(Number(String(p.creditLimit).replace(/[^0-9.]/g, '')) || 0) : '';

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
      range: PARTIES_SHEET + '!A1:R1',
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

  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: PARTIES_RANGE,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        now,
        name, code, poc,
        gst, aadhaar, state,
        phone, city, type, status,
        email, billing, shipping, creditLimit, now,
        String(p.stage || ''), String(p.owner || poc),
      ]],
    },
  });

  return res.status(200).json({
    ok: true, party: name, code,
    record: { createdAt: now, name, code, poc, gst, aadhaar, state, phone,
              city, type, status, email, billingAddress: billing,
              shippingAddress: shipping, creditLimit, updatedAt: now,
              stage: String(p.stage || ''), owner: String(p.owner || poc) },
  });
}

async function handleUpdateParty(sheets, spreadsheetId, payload, res) {
  const p = payload.party || {};
  const code = String(p.code || '').trim();
  if (!code) return res.status(400).json({ ok: false, error: 'Party code is required to update' });

  const name = String(p.name || '').trim();
  if (!name) return res.status(400).json({ ok: false, error: 'Party name is required' });
  const phone = p.phone != null ? normalizePhone(p.phone) : '';
  if (p.phone != null && p.phone !== '' && !isValidPhone(phone)) {
    return res.status(400).json({ ok: false, error: 'Phone must be a valid 10-digit Indian mobile number' });
  }

  // Locate the row by Party Code (column C).
  const colC = await sheets.spreadsheets.values.get({ spreadsheetId, range: PARTIES_SHEET + '!C:C' });
  const vals = colC.data.values || [];
  let rowNum = -1;
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0] || '').trim().toUpperCase() === code.toUpperCase()) { rowNum = i + 1; break; }
  }
  if (rowNum < 1) return res.status(404).json({ ok: false, error: 'No party found with code ' + code });

  // Read the current row so unspecified fields (and CreatedAt) are preserved.
  const cur = await sheets.spreadsheets.values.get({
    spreadsheetId, range: PARTIES_SHEET + '!A' + rowNum + ':R' + rowNum });
  const r = (cur.data.values && cur.data.values[0]) || [];
  const keep = (v, old) => (v != null ? v : (old || ''));

  const createdAt = r[0] || '';
  const rec = {
    name,
    poc: keep(p.poc, r[3]),
    gst: p.gst != null ? String(p.gst).trim().toUpperCase() : (r[4] || ''),
    aadhaar: p.aadhaar != null ? String(p.aadhaar).replace(/\D/g, '') : (r[5] || ''),
    state: keep(p.state, r[6]),
    phone: p.phone != null ? phone : (r[7] || ''),
    city: keep(p.city, r[8]),
    type: p.type != null ? normPartyType(p.type) : (r[9] || 'Customer'),
    status: p.status != null ? normPartyStatus(p.status) : (r[10] || 'Active'),
    email: keep(p.email, r[11]),
    billing: keep(p.billingAddress, r[12]),
    shipping: keep(p.shippingAddress, r[13]),
    creditLimit: p.creditLimit != null
      ? (String(p.creditLimit).trim() === '' ? '' : String(Number(String(p.creditLimit).replace(/[^0-9.]/g, '')) || 0))
      : (r[14] || ''),
    stage: keep(p.stage, r[16]),
    owner: keep(p.owner, r[17]),
  };
  const updatedAt = new Date().toISOString();

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: PARTIES_SHEET + '!A' + rowNum + ':R' + rowNum,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        createdAt, rec.name, code, rec.poc, rec.gst, rec.aadhaar, rec.state,
        rec.phone, rec.city, rec.type, rec.status, rec.email, rec.billing,
        rec.shipping, rec.creditLimit, updatedAt, rec.stage, rec.owner,
      ]],
    },
  });

  return res.status(200).json({
    ok: true, code,
    record: { createdAt, name: rec.name, code, poc: rec.poc, gst: rec.gst,
              aadhaar: rec.aadhaar, state: rec.state, phone: rec.phone,
              city: rec.city, type: rec.type, status: rec.status,
              email: rec.email, billingAddress: rec.billing,
              shippingAddress: rec.shipping, creditLimit: rec.creditLimit,
              updatedAt, stage: rec.stage, owner: rec.owner },
  });
}

async function handleListParties(sheets, spreadsheetId, _payload, res) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets || []).some(s => s.properties && s.properties.title === PARTIES_SHEET);
  if (!exists) return res.status(200).json({ ok: true, count: 0, parties: [] });

  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: PARTIES_RANGE });
  const rows = resp.data.values || [];
  if (!rows.length) return res.status(200).json({ ok: true, count: 0, parties: [] });

  // Skip the header row if present.
  const first = rows[0] || [];
  const startIdx = String(first[1] || '').trim().toLowerCase() === 'party name' ? 1 : 0;

  const parties = [];
  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i] || [];
    if (!r[1] && !r[2]) continue; // skip blank rows
    parties.push({
      createdAt: r[0] || '', name: r[1] || '', code: r[2] || '', poc: r[3] || '',
      gst: r[4] || '', aadhaar: r[5] || '', state: r[6] || '', phone: r[7] || '',
      city: r[8] || '', type: r[9] || 'Customer', status: r[10] || 'Active',
      email: r[11] || '', billingAddress: r[12] || '', shippingAddress: r[13] || '',
      creditLimit: r[14] || '', updatedAt: r[15] || '', stage: r[16] || '', owner: r[17] || '',
    });
  }
  return res.status(200).json({ ok: true, count: parties.length, parties });
}

// ---------- CRM entities (tasks / contacts / documents / interaction log) ----------

async function ensureCrmSheet(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sh = (meta.data.sheets || []).find(s => s.properties && s.properties.title === CRM_SHEET);
  if (sh) return sh.properties.sheetId;
  const resp = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: CRM_SHEET, gridProperties: { frozenRowCount: 1 } } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: CRM_SHEET + '!A1:I1', valueInputOption: 'USER_ENTERED',
    requestBody: { values: [CRM_HEADERS] },
  });
  return resp.data.replies[0].addSheet.properties.sheetId;
}

async function handleCrmList(sheets, spreadsheetId, payload, res) {
  const code = String(payload.partyCode || '').trim();
  if (!code) return res.status(400).json({ ok: false, error: 'partyCode is required' });
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets || []).some(s => s.properties && s.properties.title === CRM_SHEET);
  if (!exists) return res.status(200).json({ ok: true, items: [] });

  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: CRM_RANGE });
  const rows = resp.data.values || [];
  const cu = code.toUpperCase();
  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (String(r[1] || '').trim().toUpperCase() !== cu) continue;
    items.push({
      id: r[0] || '', partyCode: r[1] || '', kind: r[2] || '', text: r[3] || '',
      due: r[4] || '', done: String(r[5] || '').toUpperCase() === 'TRUE',
      meta: r[6] || '{}', createdAt: r[7] || '', updatedAt: r[8] || '',
    });
  }
  return res.status(200).json({ ok: true, count: items.length, items });
}

async function handleCrmListAll(sheets, spreadsheetId, _payload, res) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets || []).some(s => s.properties && s.properties.title === CRM_SHEET);
  if (!exists) return res.status(200).json({ ok: true, items: [] });
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: CRM_RANGE });
  const rows = resp.data.values || [];
  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (!r[0]) continue;
    items.push({
      id: r[0] || '', partyCode: r[1] || '', kind: r[2] || '', text: r[3] || '',
      due: r[4] || '', done: String(r[5] || '').toUpperCase() === 'TRUE',
      meta: r[6] || '{}', createdAt: r[7] || '', updatedAt: r[8] || '',
    });
  }
  return res.status(200).json({ ok: true, count: items.length, items });
}

async function handleCrmAdd(sheets, spreadsheetId, payload, res) {
  const code = String(payload.partyCode || '').trim();
  const e = payload.entity || {};
  if (!code) return res.status(400).json({ ok: false, error: 'partyCode is required' });
  if (!e.kind) return res.status(400).json({ ok: false, error: 'entity kind is required' });
  await ensureCrmSheet(sheets, spreadsheetId);
  const now = new Date().toISOString();
  const id = 'C' + Date.now() + Math.floor(Math.random() * 1000);
  const meta = typeof e.meta === 'object' ? JSON.stringify(e.meta || {}) : String(e.meta || '{}');
  await sheets.spreadsheets.values.append({
    spreadsheetId, range: CRM_RANGE, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[id, code, e.kind, String(e.text || ''), String(e.due || ''), e.done ? 'TRUE' : 'FALSE', meta, now, now]] },
  });
  return res.status(200).json({
    ok: true,
    item: { id, partyCode: code, kind: e.kind, text: e.text || '', due: e.due || '', done: !!e.done, meta, createdAt: now, updatedAt: now },
  });
}

async function handleCrmUpdate(sheets, spreadsheetId, payload, res) {
  const id = String(payload.id || '').trim();
  const patch = payload.patch || {};
  if (!id) return res.status(400).json({ ok: false, error: 'id is required' });
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: CRM_RANGE });
  const rows = resp.data.values || [];
  let rowNum = -1, row = null;
  for (let i = 1; i < rows.length; i++) {
    if (String((rows[i] || [])[0] || '').trim() === id) { rowNum = i + 1; row = rows[i]; break; }
  }
  if (rowNum < 0) return res.status(404).json({ ok: false, error: 'CRM item not found' });
  const cur = { text: row[3] || '', due: row[4] || '', done: String(row[5] || '').toUpperCase() === 'TRUE', meta: row[6] || '{}' };
  const text = patch.text != null ? String(patch.text) : cur.text;
  const due = patch.due != null ? String(patch.due) : cur.due;
  const done = patch.done != null ? !!patch.done : cur.done;
  const meta = patch.meta != null ? (typeof patch.meta === 'object' ? JSON.stringify(patch.meta) : String(patch.meta)) : cur.meta;
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: CRM_SHEET + '!D' + rowNum + ':I' + rowNum, valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[text, due, done ? 'TRUE' : 'FALSE', meta, row[7] || '', new Date().toISOString()]] },
  });
  return res.status(200).json({ ok: true, id });
}

async function handleCrmDelete(sheets, spreadsheetId, payload, res) {
  const id = String(payload.id || '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'id is required' });
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sh = (meta.data.sheets || []).find(s => s.properties && s.properties.title === CRM_SHEET);
  if (!sh) return res.status(404).json({ ok: false, error: 'CRM sheet not found' });
  const sheetId = sh.properties.sheetId;
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: CRM_SHEET + '!A:A' });
  const rows = resp.data.values || [];
  let rowIdx = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String((rows[i] || [])[0] || '').trim() === id) { rowIdx = i; break; }
  }
  if (rowIdx < 0) return res.status(404).json({ ok: false, error: 'CRM item not found' });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIdx, endIndex: rowIdx + 1 } } }] },
  });
  return res.status(200).json({ ok: true, id });
}

// ---------- Sales documents (Sales Orders + Sales Invoices) ----------

async function ensureSalesSheet(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sh = (meta.data.sheets || []).find(s => s.properties && s.properties.title === SALES_SHEET);
  if (sh) return sh.properties.sheetId;
  const resp = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: SALES_SHEET, gridProperties: { frozenRowCount: 1 } } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: SALES_SHEET + '!A1:N1', valueInputOption: 'USER_ENTERED',
    requestBody: { values: [SALES_HEADERS] },
  });
  return resp.data.replies[0].addSheet.properties.sheetId;
}

function salesRowToObj(r) {
  return {
    id: r[0] || '', docType: r[1] || '', number: r[2] || '', date: r[3] || '',
    partyCode: r[4] || '', partyName: r[5] || '', poc: r[6] || '', sourceRef: r[7] || '',
    amount: Number(r[8]) || 0, lines: r[9] || '[]', status: r[10] || 'Draft',
    dispatchStage: r[11] || '', createdAt: r[12] || '', updatedAt: r[13] || '',
  };
}

async function handleSalesDocList(sheets, spreadsheetId, _payload, res) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets || []).some(s => s.properties && s.properties.title === SALES_SHEET);
  if (!exists) return res.status(200).json({ ok: true, docs: [] });
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: SALES_RANGE });
  const rows = resp.data.values || [];
  const docs = [];
  for (let i = 1; i < rows.length; i++) { if ((rows[i] || [])[0]) docs.push(salesRowToObj(rows[i])); }
  return res.status(200).json({ ok: true, count: docs.length, docs });
}

async function handleSalesDocAdd(sheets, spreadsheetId, payload, res) {
  const d = payload.doc || {};
  const docType = String(d.docType || '').toUpperCase() === 'INV' ? 'INV' : 'SO';
  if (!d.partyName) return res.status(400).json({ ok: false, error: 'Party is required' });
  await ensureSalesSheet(sheets, spreadsheetId);

  // Auto number: SO-#### / INV-####, max existing + 1 for that type.
  const cur = await sheets.spreadsheets.values.get({ spreadsheetId, range: SALES_SHEET + '!B:C' });
  const rows = cur.data.values || [];
  let max = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (String(r[0] || '').toUpperCase() !== docType) continue;
    const m = String(r[1] || '').match(/(\d+)\s*$/);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  const number = (docType === 'INV' ? 'INV-' : 'SO-') + String(max + 1).padStart(4, '0');
  const now = new Date().toISOString();
  const id = 'D' + Date.now() + Math.floor(Math.random() * 1000);
  const lines = typeof d.lines === 'string' ? d.lines : JSON.stringify(d.lines || []);
  const row = [
    id, docType, number, String(d.date || now.slice(0, 10)), String(d.partyCode || ''),
    String(d.partyName || ''), String(d.poc || ''), String(d.sourceRef || ''),
    Number(d.amount) || 0, lines, String(d.status || 'Confirmed'),
    String(d.dispatchStage || ''), now, now,
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId, range: SALES_RANGE, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
  return res.status(200).json({ ok: true, doc: salesRowToObj(row) });
}

async function handleSalesDocUpdate(sheets, spreadsheetId, payload, res) {
  const id = String(payload.id || '').trim();
  const patch = payload.patch || {};
  if (!id) return res.status(400).json({ ok: false, error: 'id is required' });
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: SALES_RANGE });
  const rows = resp.data.values || [];
  let rowNum = -1, row = null;
  for (let i = 1; i < rows.length; i++) {
    if (String((rows[i] || [])[0] || '').trim() === id) { rowNum = i + 1; row = rows[i]; break; }
  }
  if (rowNum < 0) return res.status(404).json({ ok: false, error: 'Sales doc not found' });
  const status = patch.status != null ? String(patch.status) : (row[10] || 'Draft');
  const stage = patch.dispatchStage != null ? String(patch.dispatchStage) : (row[11] || '');
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: SALES_SHEET + '!K' + rowNum + ':N' + rowNum, valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[status, stage, row[12] || '', new Date().toISOString()]] },
  });
  return res.status(200).json({ ok: true, id, status, dispatchStage: stage });
}
