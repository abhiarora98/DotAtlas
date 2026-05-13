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

    if (kind === 'pi')    return await handlePi(sheets, spreadsheetId, payload, res);
    if (kind === 'party') return await handleParty(sheets, spreadsheetId, payload, res);

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

  // Read column A to determine the next No.
  const colA = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: PI_SHEET + '!A:A',
  });
  const vals = colA.data.values || [];
  let nextNo = 1;
  for (let i = vals.length - 1; i >= 1; i--) {
    const n = Number(vals[i][0]);
    if (!isNaN(n) && n > 0) { nextNo = n + 1; break; }
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

async function handleParty(sheets, spreadsheetId, payload, res) {
  const p = payload.party || {};
  if (!p.name) return res.status(400).json({ ok: false, error: 'Party name is required' });
  if (!p.code) return res.status(400).json({ ok: false, error: 'Party code is required' });

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
      range: PARTIES_SHEET + '!A1:H1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['CreatedAt', 'Party Name', 'Party Code', 'Sales POC',
                  'GSTIN', 'State', 'Phone', 'City']],
      },
    });
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: PARTIES_SHEET + '!A:H',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        new Date().toISOString(),
        p.name, p.code, p.poc || '',
        p.gst || '', p.state || '',
        p.phone || '', p.city || '',
      ]],
    },
  });

  return res.status(200).json({ ok: true, party: p.name });
}
