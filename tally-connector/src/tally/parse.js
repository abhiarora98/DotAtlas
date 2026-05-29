/**
 * Converts the parsed Tally XML (loose, version-dependent shapes) into the
 * clean, flat JSON arrays defined in the Atlas spec. Everything here is
 * defensive: Tally happily omits empty fields, so each getter tolerates
 * missing keys, attribute-vs-text differences, and single-vs-array nodes.
 */

// fast-xml-parser may give a value as a string, or as { '#text': '...' },
// or as an object carrying attributes. Squeeze out a plain string.
function text(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    if ('#text' in v) return text(v['#text']);
  }
  return '';
}

// Pull a field that might live as a child tag OR as an attribute (@_NAME).
function field(obj, name) {
  if (!obj || typeof obj !== 'object') return '';
  if (obj[name] !== undefined) return text(obj[name]);
  if (obj['@_' + name] !== undefined) return text(obj['@_' + name]);
  return '';
}

// Tally amounts come as strings like "-1,234.50 Cr". Strip to a number.
// Returns the absolute magnitude; callers decide sign meaning per context.
function num(v) {
  const s = text(v).replace(/,/g, '').replace(/[^0-9.\-]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// Tally dates export as YYYYMMDD; normalise to ISO YYYY-MM-DD.
function isoDate(v) {
  const s = text(v);
  const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : s;
}

function joinAddress(obj) {
  // Address exports as <ADDRESS.LIST><ADDRESS>..</ADDRESS>..</ADDRESS.LIST>
  const list = obj['ADDRESS.LIST'] || obj.ADDRESSLIST || obj.ADDRESS;
  if (!list) return '';
  const node = list.ADDRESS !== undefined ? list.ADDRESS : list;
  return asArray(node).map(text).filter(Boolean).join(', ');
}

function collectionItems(json, itemTag) {
  const coll = json?.ENVELOPE?.BODY?.DATA?.COLLECTION;
  if (!coll) return [];
  return asArray(coll[itemTag]);
}

// Highest AlterID in the batch — becomes the next incremental checkpoint.
function maxAlterId(json, itemTag) {
  let max = 0;
  for (const item of collectionItems(json, itemTag)) {
    const id = parseInt(field(item, 'ALTERID'), 10);
    if (Number.isFinite(id) && id > max) max = id;
  }
  return max;
}

// --- MODULE 1: Ledgers ---
function parseLedgers(json) {
  return collectionItems(json, 'LEDGER').map((l) => ({
    ledger_name: field(l, 'NAME'),
    parent_group: field(l, 'PARENT'),
    gstin: field(l, 'PARTYGSTIN') || field(l, 'GSTREGISTRATIONNUMBER'),
    phone: field(l, 'LEDGERMOBILE') || field(l, 'LEDGERPHONE'),
    email: field(l, 'EMAIL'),
    address: joinAddress(l),
    city: field(l, 'PINCODE') ? '' : '', // Tally has no clean city field; left blank for MVP
    state: field(l, 'LEDGERSTATENAME') || field(l, 'PRIORSTATENAME'),
    opening_balance: num(l.OPENINGBALANCE),
    credit_limit: num(l.CREDITLIMIT),
  }));
}

// Classify a voucher's ledger entries to derive tax + taxable amounts.
// Tally stores GST as separate ledger lines (parent group "Duties & Taxes").
function taxBreakup(voucher) {
  const entries = [
    ...asArray(voucher['ALLLEDGERENTRIES.LIST']),
    ...asArray(voucher['LEDGERENTRIES.LIST']),
  ];
  let cgst = 0, sgst = 0, igst = 0, taxable = 0;
  for (const e of entries) {
    const name = field(e, 'LEDGERNAME').toUpperCase();
    const amt = Math.abs(num(e.AMOUNT));
    if (/IGST/.test(name)) igst += amt;
    else if (/CGST/.test(name) || /CENTRAL\s*TAX/.test(name)) cgst += amt;
    else if (/SGST|UTGST/.test(name) || /STATE\s*TAX/.test(name)) sgst += amt;
    else if (/ROUND/.test(name)) { /* ignore rounding */ }
    else taxable += amt; // sales/purchase/income ledgers
  }
  return { cgst, sgst, igst, taxable };
}

// Collect bill references a payment/receipt was settled against.
function billRefs(voucher) {
  const entries = [
    ...asArray(voucher['ALLLEDGERENTRIES.LIST']),
    ...asArray(voucher['LEDGERENTRIES.LIST']),
  ];
  const refs = [];
  for (const e of entries) {
    for (const b of asArray(e['BILLALLOCATIONS.LIST'])) {
      const name = field(b, 'NAME');
      if (name) refs.push(name);
    }
  }
  return refs.join(', ');
}

// --- MODULE 2: Sales vouchers ---
function parseSales(json) {
  return collectionItems(json, 'VOUCHER').map((v) => {
    const { cgst, sgst, igst, taxable } = taxBreakup(v);
    return {
      voucher_number: field(v, 'VOUCHERNUMBER'),
      voucher_type: field(v, 'VOUCHERTYPENAME'),
      invoice_number: field(v, 'REFERENCE') || field(v, 'VOUCHERNUMBER'),
      date: isoDate(v.DATE),
      party_name: field(v, 'PARTYLEDGERNAME') || field(v, 'PARTYNAME'),
      gstin: field(v, 'PARTYGSTIN'),
      amount: Math.abs(num(v.AMOUNT)),
      taxable_amount: taxable,
      cgst,
      sgst,
      igst,
      due_date: isoDate(v.REFERENCEDATE),
      narration: field(v, 'NARRATION'),
    };
  });
}

// --- MODULE 3: Receipt vouchers ---
function parseReceipts(json) {
  return collectionItems(json, 'VOUCHER').map((v) => ({
    voucher_number: field(v, 'VOUCHERNUMBER'),
    date: isoDate(v.DATE),
    party_name: field(v, 'PARTYLEDGERNAME') || field(v, 'PARTYNAME'),
    amount: Math.abs(num(v.AMOUNT)),
    against_invoice: billRefs(v),
    narration: field(v, 'NARRATION'),
  }));
}

// --- MODULE 5: Purchase vouchers ---
function parsePurchases(json) {
  return collectionItems(json, 'VOUCHER').map((v) => {
    const { cgst, sgst, igst, taxable } = taxBreakup(v);
    return {
      voucher_number: field(v, 'VOUCHERNUMBER'),
      date: isoDate(v.DATE),
      supplier_name: field(v, 'PARTYLEDGERNAME') || field(v, 'PARTYNAME'),
      gstin: field(v, 'PARTYGSTIN'),
      amount: Math.abs(num(v.AMOUNT)),
      taxable_amount: taxable,
      cgst,
      sgst,
      igst,
      narration: field(v, 'NARRATION'),
    };
  });
}

// --- MODULE 4: Outstanding / receivables ---
function parseReceivables(json, syncedAt) {
  const now = syncedAt ? new Date(syncedAt) : new Date();
  return collectionItems(json, 'BILLS')
    .map((b) => {
      const invoiceDate = isoDate(b.BILLDATE);
      const pending = Math.abs(num(b.CLOSINGBALANCE));
      const creditDays = parseInt(text(b.BILLCREDITPERIOD), 10);
      let dueDate = '';
      if (invoiceDate && Number.isFinite(creditDays)) {
        const d = new Date(invoiceDate);
        d.setDate(d.getDate() + creditDays);
        dueDate = d.toISOString().slice(0, 10);
      }
      const ageBase = invoiceDate ? new Date(invoiceDate) : null;
      const ageDays = ageBase ? Math.max(0, Math.round((now - ageBase) / 86400000)) : 0;
      return {
        party_name: field(b, 'PARENT'),
        invoice_number: field(b, 'NAME'),
        invoice_date: invoiceDate,
        due_date: dueDate,
        bill_amount: Math.abs(num(b.OPENINGBALANCE)) || pending,
        pending_amount: pending,
        age_days: ageDays,
        gstin: field(b, 'PARTYGSTIN'),
      };
    })
    // Only keep bills that still have something outstanding.
    .filter((b) => b.pending_amount > 0);
}

// --- MODULE 6: GST summary (derived from sales + purchases for the MVP) ---
// Building this from already-parsed vouchers avoids the fragile GSTR report
// XML and gives an accurate-enough monthly rollup for dashboards/WhatsApp.
function buildGstSummary(sales, purchases) {
  const byPeriod = new Map();
  const periodOf = (d) => (d || '').slice(0, 7); // YYYY-MM

  const ensure = (p) => {
    if (!byPeriod.has(p)) {
      byPeriod.set(p, {
        period: p,
        outward_taxable: 0,
        inward_taxable: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        cess: 0,
        invoice_count: 0,
      });
    }
    return byPeriod.get(p);
  };

  for (const s of sales) {
    const row = ensure(periodOf(s.date));
    row.outward_taxable += s.taxable_amount;
    row.cgst += s.cgst;
    row.sgst += s.sgst;
    row.igst += s.igst;
    row.invoice_count += 1;
  }
  for (const p of purchases) {
    const row = ensure(periodOf(p.date));
    row.inward_taxable += p.taxable_amount;
  }

  // Round to 2 decimals for clean JSON.
  const round = (n) => Math.round(n * 100) / 100;
  return [...byPeriod.values()]
    .filter((r) => r.period)
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((r) => ({
      ...r,
      outward_taxable: round(r.outward_taxable),
      inward_taxable: round(r.inward_taxable),
      cgst: round(r.cgst),
      sgst: round(r.sgst),
      igst: round(r.igst),
    }));
}

module.exports = {
  parseLedgers,
  parseSales,
  parseReceipts,
  parsePurchases,
  parseReceivables,
  buildGstSummary,
  maxAlterId,
};
