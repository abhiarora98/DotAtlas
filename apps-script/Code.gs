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
const CRM_SHEET_NAME     = 'PartyCRM';        // CRM entities (tasks/contacts/docs/log)
const CRM_HEADERS_       = ['Id', 'PartyCode', 'Kind', 'Text', 'Due', 'Done', 'Meta', 'CreatedAt', 'UpdatedAt'];
const SALES_SHEET_NAME   = 'SalesDocs';       // Sales Orders + Sales Invoices
const SALES_HEADERS_     = ['Id', 'DocType', 'Number', 'Date', 'PartyCode', 'PartyName',
  'POC', 'SourceRef', 'Amount', 'Lines', 'Status', 'DispatchStage', 'CreatedAt', 'UpdatedAt',
  'DispatchedAmount', 'InvoicedAmount'];

// ---------- request entry points ----------

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: 'Empty body' });
    }
    const payload = JSON.parse(e.postData.contents);
    const kind = payload.kind || 'pi';
    if (kind === 'pi')          return handlePi(payload);
    if (kind === 'party')       return handleParty(payload);
    if (kind === 'updateParty') return handleUpdateParty(payload);
    if (kind === 'listParties') return handleListParties();
    if (kind === 'crmList')     return handleCrmList(payload);
    if (kind === 'crmListAll')  return handleCrmListAll();
    if (kind === 'salesDocList')   return handleSalesDocList();
    if (kind === 'salesDocAdd')    return handleSalesDocAdd(payload);
    if (kind === 'salesDocUpdate') return handleSalesDocUpdate(payload);
    if (kind === 'crmAdd')      return handleCrmAdd(payload);
    if (kind === 'crmUpdate')   return handleCrmUpdate(payload);
    if (kind === 'crmDelete')   return handleCrmDelete(payload);
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
      'GSTIN', 'Aadhaar', 'State', 'Phone', 'City', 'Type', 'Status',
      'Email', 'Billing Address', 'Shipping Address', 'Credit Limit', 'UpdatedAt',
      'Stage', 'Owner',
    ]);
    sheet.setFrozenRows(1);
    sheet.getRange('A1:R1').setFontWeight('bold');
  }

  const p = payload.party || {};
  const name  = String(p.name || '').trim();
  const poc   = String(p.poc || '').trim();
  const state = String(p.state || '').trim();
  const gst   = String(p.gst || '').trim().toUpperCase();
  const aadhaar = String(p.aadhaar || '').replace(/\D/g, '');
  const city  = String(p.city || '').trim();
  const phone = normalizePhone_(p.phone);
  const type   = normPartyType_(p.type);
  const status = normPartyStatus_(p.status);
  const email = String(p.email || '').trim();
  const billing = String(p.billingAddress || '').trim();
  const shipping = String(p.shippingAddress || '').trim();
  const creditLimit = (p.creditLimit != null && String(p.creditLimit).trim() !== '')
    ? String(Number(String(p.creditLimit).replace(/[^0-9.]/g, '')) || 0) : '';

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

  var now = new Date();
  var stage = String(p.stage || ''); var owner = String(p.owner || poc);
  sheet.appendRow([
    now, name, code, poc, gst, aadhaar, state, phone, city, type, status,
    email, billing, shipping, creditLimit, now, stage, owner,
  ]);

  return jsonResponse({
    ok: true, party: name, code: code,
    record: { createdAt: now, name: name, code: code, poc: poc, gst: gst,
              aadhaar: aadhaar, state: state, phone: phone, city: city,
              type: type, status: status, email: email, billingAddress: billing,
              shippingAddress: shipping, creditLimit: creditLimit, updatedAt: now,
              stage: stage, owner: owner },
  });
}

function handleUpdateParty(payload) {
  const p = payload.party || {};
  const code = String(p.code || '').trim();
  if (!code) return jsonResponse({ ok: false, error: 'Party code is required to update.' });
  const name = String(p.name || '').trim();
  if (!name) return jsonResponse({ ok: false, error: 'Party name is required.' });
  const phone = p.phone != null ? normalizePhone_(p.phone) : '';
  if (p.phone != null && p.phone !== '' && !isValidPhone_(phone)) {
    return jsonResponse({ ok: false, error: 'Phone must be a valid 10-digit Indian mobile number.' });
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PARTIES_SHEET_NAME);
  if (!sheet) return jsonResponse({ ok: false, error: 'Parties sheet not found.' });
  const last = sheet.getLastRow();
  if (last < 2) return jsonResponse({ ok: false, error: 'No party found with code ' + code });

  const codes = sheet.getRange(2, 3, last - 1, 1).getValues();
  var rowNum = -1;
  for (var i = 0; i < codes.length; i++) {
    if (String(codes[i][0] || '').trim().toUpperCase() === code.toUpperCase()) { rowNum = i + 2; break; }
  }
  if (rowNum < 2) return jsonResponse({ ok: false, error: 'No party found with code ' + code });

  const r = sheet.getRange(rowNum, 1, 1, 18).getValues()[0];
  function keep(v, old) { return v != null ? v : (old || ''); }
  const createdAt = r[0] || '';
  const rec = {
    name: name,
    poc: keep(p.poc, r[3]),
    gst: p.gst != null ? String(p.gst).trim().toUpperCase() : (r[4] || ''),
    aadhaar: p.aadhaar != null ? String(p.aadhaar).replace(/\D/g, '') : (r[5] || ''),
    state: keep(p.state, r[6]),
    phone: p.phone != null ? phone : (r[7] || ''),
    city: keep(p.city, r[8]),
    type: p.type != null ? normPartyType_(p.type) : (r[9] || 'Customer'),
    status: p.status != null ? normPartyStatus_(p.status) : (r[10] || 'Active'),
    email: keep(p.email, r[11]),
    billing: keep(p.billingAddress, r[12]),
    shipping: keep(p.shippingAddress, r[13]),
    creditLimit: p.creditLimit != null
      ? (String(p.creditLimit).trim() === '' ? '' : String(Number(String(p.creditLimit).replace(/[^0-9.]/g, '')) || 0))
      : (r[14] || ''),
    stage: keep(p.stage, r[16]),
    owner: keep(p.owner, r[17]),
  };
  const updatedAt = new Date();
  sheet.getRange(rowNum, 1, 1, 18).setValues([[
    createdAt, rec.name, code, rec.poc, rec.gst, rec.aadhaar, rec.state,
    rec.phone, rec.city, rec.type, rec.status, rec.email, rec.billing,
    rec.shipping, rec.creditLimit, updatedAt, rec.stage, rec.owner,
  ]]);

  return jsonResponse({
    ok: true, code: code,
    record: { createdAt: createdAt, name: rec.name, code: code, poc: rec.poc,
              gst: rec.gst, aadhaar: rec.aadhaar, state: rec.state, phone: rec.phone,
              city: rec.city, type: rec.type, status: rec.status, email: rec.email,
              billingAddress: rec.billing, shippingAddress: rec.shipping,
              creditLimit: rec.creditLimit, updatedAt: updatedAt,
              stage: rec.stage, owner: rec.owner },
  });
}

function handleListParties() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PARTIES_SHEET_NAME);
  if (!sheet) return jsonResponse({ ok: true, count: 0, parties: [] });
  const last = sheet.getLastRow();
  if (last < 2) return jsonResponse({ ok: true, count: 0, parties: [] });
  const rows = sheet.getRange(2, 1, last - 1, 18).getValues();
  const parties = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r[1] && !r[2]) continue;
    parties.push({
      createdAt: r[0] || '', name: r[1] || '', code: r[2] || '', poc: r[3] || '',
      gst: r[4] || '', aadhaar: r[5] || '', state: r[6] || '', phone: r[7] || '',
      city: r[8] || '', type: r[9] || 'Customer', status: r[10] || 'Active',
      email: r[11] || '', billingAddress: r[12] || '', shippingAddress: r[13] || '',
      creditLimit: r[14] || '', updatedAt: r[15] || '', stage: r[16] || '', owner: r[17] || '',
    });
  }
  return jsonResponse({ ok: true, count: parties.length, parties: parties });
}

// ---------- CRM entities ----------

function ensureCrmSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CRM_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CRM_SHEET_NAME);
    sheet.appendRow(CRM_HEADERS_);
    sheet.setFrozenRows(1);
    sheet.getRange('A1:I1').setFontWeight('bold');
  }
  return sheet;
}

function handleCrmList(payload) {
  const code = String(payload.partyCode || '').trim();
  if (!code) return jsonResponse({ ok: false, error: 'partyCode is required.' });
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CRM_SHEET_NAME);
  if (!sheet) return jsonResponse({ ok: true, items: [] });
  const last = sheet.getLastRow();
  if (last < 2) return jsonResponse({ ok: true, items: [] });
  const rows = sheet.getRange(2, 1, last - 1, 9).getValues();
  const cu = code.toUpperCase();
  const items = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[1] || '').trim().toUpperCase() !== cu) continue;
    items.push({
      id: r[0] || '', partyCode: r[1] || '', kind: r[2] || '', text: r[3] || '',
      due: r[4] || '', done: String(r[5] || '').toUpperCase() === 'TRUE',
      meta: r[6] || '{}', createdAt: r[7] || '', updatedAt: r[8] || '',
    });
  }
  return jsonResponse({ ok: true, count: items.length, items: items });
}

function handleCrmListAll() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CRM_SHEET_NAME);
  if (!sheet) return jsonResponse({ ok: true, items: [] });
  const last = sheet.getLastRow();
  if (last < 2) return jsonResponse({ ok: true, items: [] });
  const rows = sheet.getRange(2, 1, last - 1, 9).getValues();
  const items = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    items.push({
      id: r[0] || '', partyCode: r[1] || '', kind: r[2] || '', text: r[3] || '',
      due: r[4] || '', done: String(r[5] || '').toUpperCase() === 'TRUE',
      meta: r[6] || '{}', createdAt: r[7] || '', updatedAt: r[8] || '',
    });
  }
  return jsonResponse({ ok: true, count: items.length, items: items });
}

function handleCrmAdd(payload) {
  const code = String(payload.partyCode || '').trim();
  const e = payload.entity || {};
  if (!code) return jsonResponse({ ok: false, error: 'partyCode is required.' });
  if (!e.kind) return jsonResponse({ ok: false, error: 'entity kind is required.' });
  const sheet = ensureCrmSheet_();
  const now = new Date().toISOString();
  const id = 'C' + Date.now() + Math.floor(Math.random() * 1000);
  const meta = typeof e.meta === 'object' ? JSON.stringify(e.meta || {}) : String(e.meta || '{}');
  sheet.appendRow([id, code, e.kind, String(e.text || ''), String(e.due || ''), e.done ? 'TRUE' : 'FALSE', meta, now, now]);
  return jsonResponse({ ok: true, item: { id: id, partyCode: code, kind: e.kind, text: e.text || '', due: e.due || '', done: !!e.done, meta: meta, createdAt: now, updatedAt: now } });
}

function handleCrmUpdate(payload) {
  const id = String(payload.id || '').trim();
  const patch = payload.patch || {};
  if (!id) return jsonResponse({ ok: false, error: 'id is required.' });
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CRM_SHEET_NAME);
  if (!sheet) return jsonResponse({ ok: false, error: 'CRM sheet not found.' });
  const last = sheet.getLastRow();
  if (last < 2) return jsonResponse({ ok: false, error: 'CRM item not found.' });
  const rows = sheet.getRange(2, 1, last - 1, 9).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() === id) {
      var row = rows[i];
      var text = patch.text != null ? String(patch.text) : (row[3] || '');
      var due = patch.due != null ? String(patch.due) : (row[4] || '');
      var done = patch.done != null ? !!patch.done : (String(row[5] || '').toUpperCase() === 'TRUE');
      var meta = patch.meta != null ? (typeof patch.meta === 'object' ? JSON.stringify(patch.meta) : String(patch.meta)) : (row[6] || '{}');
      sheet.getRange(i + 2, 4, 1, 6).setValues([[text, due, done ? 'TRUE' : 'FALSE', meta, row[7] || '', new Date().toISOString()]]);
      return jsonResponse({ ok: true, id: id });
    }
  }
  return jsonResponse({ ok: false, error: 'CRM item not found.' });
}

function handleCrmDelete(payload) {
  const id = String(payload.id || '').trim();
  if (!id) return jsonResponse({ ok: false, error: 'id is required.' });
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CRM_SHEET_NAME);
  if (!sheet) return jsonResponse({ ok: false, error: 'CRM sheet not found.' });
  const last = sheet.getLastRow();
  if (last < 2) return jsonResponse({ ok: false, error: 'CRM item not found.' });
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '').trim() === id) {
      sheet.deleteRow(i + 2);
      return jsonResponse({ ok: true, id: id });
    }
  }
  return jsonResponse({ ok: false, error: 'CRM item not found.' });
}

// ---------- Sales documents ----------

function ensureSalesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SALES_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SALES_SHEET_NAME);
    sheet.appendRow(SALES_HEADERS_);
    sheet.setFrozenRows(1);
    sheet.getRange('A1:P1').setFontWeight('bold');
  }
  return sheet;
}

function salesRowToObj_(r) {
  return {
    id: r[0] || '', docType: r[1] || '', number: r[2] || '', date: r[3] || '',
    partyCode: r[4] || '', partyName: r[5] || '', poc: r[6] || '', sourceRef: r[7] || '',
    amount: Number(r[8]) || 0, lines: r[9] || '[]', status: r[10] || 'Draft',
    dispatchStage: r[11] || '', createdAt: r[12] || '', updatedAt: r[13] || '',
    dispatchedAmount: Number(r[14]) || 0, invoicedAmount: Number(r[15]) || 0,
  };
}

function handleSalesDocList() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SALES_SHEET_NAME);
  if (!sheet) return jsonResponse({ ok: true, docs: [] });
  const last = sheet.getLastRow();
  if (last < 2) return jsonResponse({ ok: true, docs: [] });
  const rows = sheet.getRange(2, 1, last - 1, 16).getValues();
  const docs = [];
  for (var i = 0; i < rows.length; i++) { if (rows[i][0]) docs.push(salesRowToObj_(rows[i])); }
  return jsonResponse({ ok: true, count: docs.length, docs: docs });
}

function handleSalesDocAdd(payload) {
  const d = payload.doc || {};
  const dt = String(d.docType || '').toUpperCase();
  const docType = dt === 'INV' ? 'INV' : dt === 'PI' ? 'PI' : 'SO';
  if (!d.partyName) return jsonResponse({ ok: false, error: 'Party is required.' });
  const sheet = ensureSalesSheet_();
  const last = sheet.getLastRow();
  var number;
  if (docType === 'PI') {
    number = String(d.number || d.sourceRef || '');
  } else {
    var max = 0;
    if (last > 1) {
      const ex = sheet.getRange(2, 2, last - 1, 2).getValues();
      for (var i = 0; i < ex.length; i++) {
        if (String(ex[i][0] || '').toUpperCase() !== docType) continue;
        var m = String(ex[i][1] || '').match(/(\d+)\s*$/);
        if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; }
      }
    }
    number = (docType === 'INV' ? 'INV-' : 'SO-') + ('000' + (max + 1)).slice(-4);
  }
  const now = new Date().toISOString();
  const id = 'D' + Date.now() + Math.floor(Math.random() * 1000);
  const lines = typeof d.lines === 'string' ? d.lines : JSON.stringify(d.lines || []);
  const row = [
    id, docType, number, String(d.date || now.slice(0, 10)), String(d.partyCode || ''),
    String(d.partyName || ''), String(d.poc || ''), String(d.sourceRef || ''),
    Number(d.amount) || 0, lines, String(d.status || 'Confirmed'),
    String(d.dispatchStage || ''), now, now,
    Number(d.dispatchedAmount) || 0, Number(d.invoicedAmount) || 0,
  ];
  sheet.appendRow(row);
  return jsonResponse({ ok: true, doc: salesRowToObj_(row) });
}

function handleSalesDocUpdate(payload) {
  const id = String(payload.id || '').trim();
  const patch = payload.patch || {};
  if (!id) return jsonResponse({ ok: false, error: 'id is required.' });
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SALES_SHEET_NAME);
  if (!sheet) return jsonResponse({ ok: false, error: 'Sales doc not found.' });
  const last = sheet.getLastRow();
  if (last < 2) return jsonResponse({ ok: false, error: 'Sales doc not found.' });
  const rows = sheet.getRange(2, 1, last - 1, 16).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() === id) {
      var status = patch.status != null ? String(patch.status) : (rows[i][10] || 'Draft');
      var stage = patch.dispatchStage != null ? String(patch.dispatchStage) : (rows[i][11] || '');
      var dispatched = patch.dispatchedAmount != null ? (Number(patch.dispatchedAmount) || 0) : (Number(rows[i][14]) || 0);
      var invoiced = patch.invoicedAmount != null ? (Number(patch.invoicedAmount) || 0) : (Number(rows[i][15]) || 0);
      sheet.getRange(i + 2, 11, 1, 6).setValues([[status, stage, rows[i][12] || '', new Date().toISOString(), dispatched, invoiced]]);
      return jsonResponse({ ok: true, id: id, status: status, dispatchStage: stage, dispatchedAmount: dispatched, invoicedAmount: invoiced });
    }
  }
  return jsonResponse({ ok: false, error: 'Sales doc not found.' });
}

function normPartyType_(t) {
  var v = String(t || '').trim().toLowerCase();
  if (v === 'supplier') return 'Supplier';
  if (v === 'both') return 'Both';
  return 'Customer';
}
function normPartyStatus_(s) {
  var v = String(s || '').trim().toLowerCase();
  if (v === 'archived') return 'Archived';
  if (v === 'inactive') return 'Inactive';
  return 'Active';
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
