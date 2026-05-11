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

const PI_SHEET_NAME      = 'Masters';   // change if your PI sheet tab is named differently
const PARTIES_SHEET_NAME = 'Parties';   // optional — created on first Add Party

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
      'GSTIN', 'State', 'Phone', 'City',
    ]);
    sheet.setFrozenRows(1);
    sheet.getRange('A1:H1').setFontWeight('bold');
  }

  const p = payload.party || {};
  if (!p.name) return jsonResponse({ ok: false, error: 'Party name is required.' });
  if (!p.code) return jsonResponse({ ok: false, error: 'Party code is required.' });

  sheet.appendRow([
    new Date(),
    p.name,
    p.code,
    p.poc || '',
    p.gst || '',
    p.state || '',
    p.phone || '',
    p.city || '',
  ]);

  return jsonResponse({ ok: true, party: p.name });
}

// ---------- helpers ----------

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
