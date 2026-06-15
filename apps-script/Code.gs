/**
 * atlas — Google Apps Script backend
 *
 * Bound to the Comfort Industries "Masters" spreadsheet. Acts as the
 * write-back endpoint for the static dashboard at https://*.vercel.app.
 *
 * The dashboard's "Create PI" form POSTs a JSON payload describing one
 * PI (header + many line items); this script appends N rows to the
 * Masters sheet, one per line item.
 *
 * The "Add Party" modal POSTs to the same endpoint with kind:'party';
 * this script appends one row to a Parties tab (created on first use).
 *
 * Setup is in apps-script/README.md in the same repo.
 */

const PI_SHEET_NAME      = 'Comfort_atlas';   // tab name where PI line items live
const PARTIES_SHEET_NAME = 'Parties';         // optional — created on first Add Party

// ---------- request entry points ----------

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: 'Empty body' });
    }
    const payload = JSON.parse(e.postData.contents);
    const kind = payload.kind || 'pi';
    if (kind === 'pi')    return handlePi(payload);
    if (kind === 'party') return handleParty(payload);
    return jsonResponse({ ok: false, error: 'Unknown kind: ' + kind });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return jsonResponse({
    ok: true,
    app: 'atlas',
    ready: true,
    piSheet: PI_SHEET_NAME,
    partiesSheet: PARTIES_SHEET_NAME,
    time: new Date().toISOString(),
  });
}

// ---------- handlers ----------

function handlePi(payload) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PI_SHEET_NAME);
  if (!sheet) {
    return jsonResponse({ ok: false, error: 'Tab "' + PI_SHEET_NAME + '" not found. Open Code.gs and edit PI_SHEET_NAME to match your tab name.' });
  }

  const rows = (payload.rows || []);
  if (!rows.length) {
    return jsonResponse({ ok: false, error: 'Payload has no rows.' });
  }

  // Compute next sequential "No." (column A) by reading the last filled row.
  const lastRow = sheet.getLastRow();
  let nextNo = 1;
  if (lastRow >= 2) {
    const lastNo = sheet.getRange(lastRow, 1).getValue();
    nextNo = (Number(lastNo) || 0) + 1;
  }

  // Build a 2D array exactly matching the 31 input columns (A-AE).
  // We don't touch column AF (32) in case it holds a derived formula.
  const dataRows = rows.map(function (r, i) {
    return [
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
    ];
  });

  sheet
    .getRange(lastRow + 1, 1, dataRows.length, dataRows[0].length)
    .setValues(dataRows);

  return jsonResponse({
    ok: true,
    count: rows.length,
    firstNo: nextNo,
    ref: payload.header && payload.header.ref,
  });
}

function handleParty(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PARTIES_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PARTIES_SHEET_NAME);
    sheet.appendRow([
      'CreatedAt', 'Party Name', 'Party Code', 'Sales POC',
      'GSTIN', 'Aadhaar', 'State', 'Phone', 'City',
    ]);
    sheet.setFrozenRows(1);
    sheet.getRange('A1:I1').setFontWeight('bold');
  }

  const p = payload.party || {};
  const name  = String(p.name || '').trim();
  const poc   = String(p.poc || '').trim();
  const state = String(p.state || '').trim();
  const gst   = String(p.gst || '').trim().toUpperCase();
  const aadhaar = String(p.aadhaar || '').replace(/\D/g, '');
  const city  = String(p.city || '').trim();
  const phone = normalizePhone_(p.phone);

  if (!name) return jsonResponse({ ok: false, error: 'Party name is required.' });
  if (!poc)  return jsonResponse({ ok: false, error: 'Sales POC is required to generate the party code.' });
  if (!city) return jsonResponse({ ok: false, error: 'City is required.' });
  if (!isValidPhone_(phone)) return jsonResponse({ ok: false, error: 'A valid 10-digit Indian mobile number is required.' });

  const stateCode = stateToCode_(state);
  if (!stateCode) return jsonResponse({ ok: false, error: 'A valid State is required to generate the party code.' });

  if (!gst && !aadhaar) return jsonResponse({ ok: false, error: 'Provide a GST number or an Aadhaar number.' });
  if (aadhaar && !/^\d{12}$/.test(aadhaar)) return jsonResponse({ ok: false, error: 'Aadhaar must be exactly 12 digits.' });

  // Pull existing names + codes (columns B & C) to enforce uniqueness and
  // compute the next running number for this prefix.
  const last = sheet.getLastRow();
  const existing = last > 1 ? sheet.getRange(2, 2, last - 1, 2).getValues() : [];
  const existingCodes = [];
  const nameU = name.toUpperCase();
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i][0] || '').trim().toUpperCase() === nameU) {
      return jsonResponse({ ok: false, error: 'A party named "' + name + '" already exists.' });
    }
    if (existing[i][1]) existingCodes.push(existing[i][1]);
  }

  const prefix = partyCodePrefix_(name, state, poc);
  const code = nextPartyCode_(prefix, existingCodes);

  sheet.appendRow([
    new Date(),
    name,
    code,
    poc,
    gst,
    aadhaar,
    state,
    phone,
    city,
  ]);

  return jsonResponse({ ok: true, party: name, code: code });
}

// ---------- party code generation ----------

// Indian state / UT → official 2-letter code (PB, HR, DL…), not the GSTIN
// numeric prefix.
var STATE_CODE_MAP_ = {
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

function stateToCode_(state) {
  var s = String(state || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(s)) return s;
  return STATE_CODE_MAP_[s] || '';
}

function pocInitials_(poc) {
  var parts = String(poc || '').trim().split(/\s+/).filter(function (x) { return x; });
  var out = '';
  for (var i = 0; i < parts.length; i++) {
    var letters = parts[i].replace(/[^A-Za-z]/g, '');
    if (!letters) continue;
    out += (letters.length > 1 && letters === letters.toUpperCase())
      ? letters.toUpperCase()
      : letters[0].toUpperCase();
  }
  return out;
}

// Initials of the party name — first letter of every word.
// "ABHITEX FURNISHINGS" → "AF", "SUNNY SYNTHETIC" → "SS".
function nameInitials_(name) {
  var s = String(name || '').trim();
  var words = s.split(/\s+/);
  var out = '';
  for (var i = 0; i < words.length; i++) {
    var m = words[i].match(/[A-Za-z]/);
    if (m) out += m[0].toUpperCase();
  }
  return out || s.charAt(0).toUpperCase();
}

function partyCodePrefix_(name, state, poc) {
  return nameInitials_(name) + '-' + stateToCode_(state) + pocInitials_(poc);
}

// Reduce an Indian mobile number to its 10 core digits (drops +91 / 91 / 0).
function normalizePhone_(raw) {
  var d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
  else if (d.length === 11 && d.indexOf('0') === 0) d = d.slice(1);
  return d;
}
function isValidPhone_(d) { return /^[6-9]\d{9}$/.test(d); }

function nextPartyCode_(prefix, existingCodes) {
  var re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d{3})$', 'i');
  var max = 0;
  for (var i = 0; i < existingCodes.length; i++) {
    var m = re.exec(String(existingCodes[i] || '').trim());
    if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return prefix + ('00' + (max + 1)).slice(-3);
}

// ---------- helpers ----------

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
