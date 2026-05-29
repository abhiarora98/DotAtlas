/**
 * Builders for the XML/TDL requests we POST to TallyPrime's HTTP server.
 *
 * Tally listens for XML over HTTP (Gateway of Tally → F1 → Advanced Config →
 * "Enable ODBC/HTTP" on port 9000 by default). Each request is an <ENVELOPE>
 * asking Tally to Export a Collection in XML format.
 *
 * NOTE: TDL field names vary slightly between Tally versions/regions. These
 * cover stock TallyPrime (India, GST) and are intentionally defensive — the
 * parser tolerates missing fields. Tweak FETCH/NATIVEMETHOD lines here if your
 * Tally returns blanks for a field.
 */

// Tally wants dates as YYYYMMDD for SVFROMDATE / SVTODATE.
function tallyDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function envelope({ id, company, fromDate, toDate, collectionXml }) {
  const staticVars = [
    '<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>',
    company ? `<SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY>` : '',
    fromDate ? `<SVFROMDATE>${tallyDate(fromDate)}</SVFROMDATE>` : '',
    toDate ? `<SVTODATE>${tallyDate(toDate)}</SVTODATE>` : '',
  ].join('');

  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>${id}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>${staticVars}</STATICVARIABLES>
      <TDL><TDLMESSAGE>${collectionXml}</TDLMESSAGE></TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

// --- List of companies open in Tally (used by Test connection + selector) ---
function companies() {
  return envelope({
    id: 'AtlasCompanies',
    collectionXml: `
      <COLLECTION NAME="AtlasCompanies" ISMODIFY="No">
        <TYPE>Company</TYPE>
        <NATIVEMETHOD>Name</NATIVEMETHOD>
        <NATIVEMETHOD>StartingFrom</NATIVEMETHOD>
      </COLLECTION>`,
  });
}

// --- MODULE 1: Ledger masters ---
// minAlterId > 0 restricts to ledgers changed since the last checkpoint, so
// routine syncs touch only edited/new masters instead of every ledger.
function ledgers(company, minAlterId = 0) {
  const incremental = minAlterId > 0;
  return envelope({
    id: 'AtlasLedgers',
    company,
    collectionXml: `
      <COLLECTION NAME="AtlasLedgers" ISMODIFY="No">
        <TYPE>Ledger</TYPE>
        ${incremental ? '<FILTERS>AtlasLedgersFilter</FILTERS>' : ''}
        <NATIVEMETHOD>Name</NATIVEMETHOD>
        <NATIVEMETHOD>Parent</NATIVEMETHOD>
        <NATIVEMETHOD>AlterID</NATIVEMETHOD>
        <NATIVEMETHOD>OpeningBalance</NATIVEMETHOD>
        <NATIVEMETHOD>CreditLimit</NATIVEMETHOD>
        <NATIVEMETHOD>LedgerPhone</NATIVEMETHOD>
        <NATIVEMETHOD>LedgerMobile</NATIVEMETHOD>
        <NATIVEMETHOD>Email</NATIVEMETHOD>
        <NATIVEMETHOD>PartyGSTIN</NATIVEMETHOD>
        <NATIVEMETHOD>GSTRegistrationType</NATIVEMETHOD>
        <NATIVEMETHOD>LedgerStateName</NATIVEMETHOD>
        <NATIVEMETHOD>PriorStateName</NATIVEMETHOD>
        <NATIVEMETHOD>PinCode</NATIVEMETHOD>
        <NATIVEMETHOD>Address</NATIVEMETHOD>
      </COLLECTION>
      ${incremental ? `<SYSTEM TYPE="Formulae" NAME="AtlasLedgersFilter">$AlterID > ${minAlterId}</SYSTEM>` : ''}`,
  });
}

// Shared voucher collection. `vchType` is matched against $VoucherTypeName.
// Incremental (minAlterId > 0): filter to vouchers changed since the checkpoint
// and skip the date window entirely, so even edits to old vouchers are caught
// while keeping the pull tiny. Full (minAlterId = 0): bound by the date window.
function voucherCollection({ id, name, vchType, company, fromDate, toDate, minAlterId = 0 }) {
  const incremental = minAlterId > 0;
  let cond = `$VoucherTypeName = "${escapeXml(vchType)}"`;
  if (incremental) cond += ` AND $AlterID > ${minAlterId}`;
  return envelope({
    id,
    company,
    fromDate: incremental ? null : fromDate,
    toDate: incremental ? null : toDate,
    collectionXml: `
      <COLLECTION NAME="${name}" ISMODIFY="No">
        <TYPE>Voucher</TYPE>
        <FILTERS>${name}Filter</FILTERS>
        <NATIVEMETHOD>Date</NATIVEMETHOD>
        <NATIVEMETHOD>AlterID</NATIVEMETHOD>
        <NATIVEMETHOD>VoucherNumber</NATIVEMETHOD>
        <NATIVEMETHOD>VoucherTypeName</NATIVEMETHOD>
        <NATIVEMETHOD>Reference</NATIVEMETHOD>
        <NATIVEMETHOD>ReferenceDate</NATIVEMETHOD>
        <NATIVEMETHOD>PartyLedgerName</NATIVEMETHOD>
        <NATIVEMETHOD>PartyName</NATIVEMETHOD>
        <NATIVEMETHOD>PartyGSTIN</NATIVEMETHOD>
        <NATIVEMETHOD>Narration</NATIVEMETHOD>
        <NATIVEMETHOD>Amount</NATIVEMETHOD>
        <NATIVEMETHOD>LedgerEntries</NATIVEMETHOD>
        <NATIVEMETHOD>AllLedgerEntries</NATIVEMETHOD>
      </COLLECTION>
      <SYSTEM TYPE="Formulae" NAME="${name}Filter">${cond}</SYSTEM>`,
  });
}

// --- MODULE 2: Sales vouchers ---
function sales({ company, fromDate, toDate, minAlterId }) {
  return voucherCollection({
    id: 'AtlasSales', name: 'AtlasSales', vchType: 'Sales', company, fromDate, toDate, minAlterId,
  });
}

// --- MODULE 3: Receipt vouchers ---
function receipts({ company, fromDate, toDate, minAlterId }) {
  return voucherCollection({
    id: 'AtlasReceipts', name: 'AtlasReceipts', vchType: 'Receipt', company, fromDate, toDate, minAlterId,
  });
}

// --- MODULE 5: Purchase vouchers ---
function purchases({ company, fromDate, toDate, minAlterId }) {
  return voucherCollection({
    id: 'AtlasPurchases', name: 'AtlasPurchases', vchType: 'Purchase', company, fromDate, toDate, minAlterId,
  });
}

// --- MODULE 4: Outstanding / receivables (open bills) ---
function bills(company) {
  return envelope({
    id: 'AtlasBills',
    company,
    collectionXml: `
      <COLLECTION NAME="AtlasBills" ISMODIFY="No">
        <TYPE>Bills</TYPE>
        <NATIVEMETHOD>BillDate</NATIVEMETHOD>
        <NATIVEMETHOD>Name</NATIVEMETHOD>
        <NATIVEMETHOD>Parent</NATIVEMETHOD>
        <NATIVEMETHOD>OpeningBalance</NATIVEMETHOD>
        <NATIVEMETHOD>ClosingBalance</NATIVEMETHOD>
        <NATIVEMETHOD>BillCreditPeriod</NATIVEMETHOD>
        <NATIVEMETHOD>BillType</NATIVEMETHOD>
        <NATIVEMETHOD>BillFinalBalance</NATIVEMETHOD>
        <NATIVEMETHOD>PartyGSTIN</NATIVEMETHOD>
      </COLLECTION>`,
  });
}

module.exports = {
  tallyDate,
  companies,
  ledgers,
  sales,
  receipts,
  purchases,
  bills,
};
