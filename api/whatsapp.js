/**
 * Atlas — WhatsApp Receivables Assistant webhook (Vercel serverless function).
 *
 * GET  → Meta verification handshake (echoes hub.challenge when token matches)
 * POST → inbound message events. We compute the reply from the Comfort_atlas
 *        sheet and send it back via the WhatsApp Cloud API.
 *
 * Setup: api/WHATSAPP.md
 *
 * Required env vars:
 *   WHATSAPP_VERIFY_TOKEN     — shared secret for the GET handshake
 *   WHATSAPP_ACCESS_TOKEN     — Meta access token used to send replies
 *   WHATSAPP_PHONE_NUMBER_ID  — sender phone-number-id from the Meta dashboard
 *   GOOGLE_SERVICE_ACCOUNT    — (existing) service-account JSON
 *   SHEETS_SPREADSHEET_ID     — (existing) spreadsheet ID
 *
 * Optional:
 *   OVERDUE_DAYS              — aging threshold, default 30
 *   SHEETS_TIMEOUT_MS         — soft timeout before fallback reply, default 8000
 *   WA_CONTEXT_SHEET_NAME     — override tab name, default `WA_Context`
 *   PI_SHEET_NAME             — (existing) override PI tab, default `Comfort_atlas`
 */

const { getSheetsClient, aggregatePIs, PI_SHEET } = require('./pi');
const { parse } = require('./_wa/parser');
const { getContext, setContext } = require('./_wa/context');
const { sendWhatsAppMessage } = require('./_wa/send');
const {
  matchParty, computeReceivables, uniqueParties, OVERDUE_DAYS,
} = require('./_wa/queries');
const {
  fmtReceivableSummary, fmtOverdueList, fmtLedgerSummary, fmtReminderDraft,
  fmtZeroOutstanding, fmtPartyNotFound, fmtDisambiguation,
  fmtReceiptsToday, fmtHelp, fmtUnknown, fmtTimeoutOrError,
} = require('./_wa/formatter');

const SHEETS_TIMEOUT_MS = Number(process.env.SHEETS_TIMEOUT_MS || 8000);

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const q = req.query || {};
    const mode      = q['hub.mode'];
    const token     = q['hub.verify_token'];
    const challenge = q['hub.challenge'];
    if (mode === 'subscribe' &&
        token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(String(challenge || ''));
    }
    return res.status(403).end();
  }
  if (req.method !== 'POST') return res.status(405).end();

  // The webhook must respond 200 quickly. Anything else risks Meta disabling
  // the subscription. We do the work synchronously (Vercel has no background
  // queue) but guard with a timeout so a slow Sheets call falls back to a
  // friendly message instead of hanging.
  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    console.error('[wa] bad JSON body', e);
    return res.status(200).end();
  }

  const msg = payload &&
              payload.entry &&
              payload.entry[0] &&
              payload.entry[0].changes &&
              payload.entry[0].changes[0] &&
              payload.entry[0].changes[0].value &&
              payload.entry[0].changes[0].value.messages &&
              payload.entry[0].changes[0].value.messages[0];

  if (!msg) {
    // Status updates, delivery receipts, etc. — ack and move on.
    return res.status(200).end();
  }

  const from = msg.from;
  const text =
    (msg.text && msg.text.body) ||
    (msg.interactive && msg.interactive.button_reply && msg.interactive.button_reply.id) ||
    (msg.interactive && msg.interactive.list_reply && msg.interactive.list_reply.id) ||
    (msg.button && msg.button.payload) ||
    '';

  try {
    await Promise.race([
      handle(from, text),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('handler timeout')), SHEETS_TIMEOUT_MS)),
    ]);
  } catch (e) {
    console.error('[wa] handler error:', e && e.stack || e);
    try { await sendWhatsAppMessage(from, fmtTimeoutOrError().body); }
    catch (e2) { console.error('[wa] fallback send failed:', e2); }
  }
  return res.status(200).end();
};

async function handle(from, text) {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('SHEETS_SPREADSHEET_ID is missing');

  const ctx = await getContext(sheets, spreadsheetId, from);
  const parsed = parse(text, ctx);

  // No-data intents short-circuit (no sheet read needed).
  if (parsed.intent === 'help')           return reply(from, sheets, spreadsheetId, ctx, parsed, fmtHelp());
  if (parsed.intent === 'receipts_today') return reply(from, sheets, spreadsheetId, ctx, parsed, fmtReceiptsToday());
  if (parsed.intent === 'unknown')        return reply(from, sheets, spreadsheetId, ctx, parsed, fmtUnknown(parsed.raw));

  // Read PIs once, derive everything from them.
  const pis = await fetchPis(sheets, spreadsheetId);
  const byParty = computeReceivables(pis);
  const allParties = uniqueParties(pis);

  const m = matchParty(parsed.partyName, allParties);

  if (m.status === 'none') {
    const suggestions = [...byParty.values()]
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 3)
      .map(x => x.party);
    return reply(from, sheets, spreadsheetId, ctx, parsed,
                 fmtPartyNotFound(parsed.partyName, suggestions),
                 { preserveContext: true });
  }

  if (m.status === 'many') {
    // Disambiguation — don't change currentParty yet, but DO save the
    // numbered options so the next "1"/"2" resolves.
    return reply(from, sheets, spreadsheetId, ctx, parsed,
                 fmtDisambiguation(parsed.partyName, m.candidates),
                 { keepCurrentParty: true });
  }

  const agg = byParty.get(m.party);
  const partyCode = lookupPartyCode(pis, m.party);

  let out;
  if (!agg || agg.outstanding <= 0) {
    out = fmtZeroOutstanding(m.party, partyCode);
  } else {
    switch (parsed.intent) {
      case 'receivable_summary': out = fmtReceivableSummary(agg); break;
      case 'overdue_list':       out = fmtOverdueList(agg); break;
      case 'ledger_summary':     out = fmtLedgerSummary(agg); break;
      case 'reminder':           out = fmtReminderDraft(agg); break;
      default:                   out = fmtUnknown(parsed.raw);
    }
  }

  return reply(from, sheets, spreadsheetId, ctx, { ...parsed, currentParty: m.party }, out);
}

async function fetchPis(sheets, spreadsheetId) {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: PI_SHEET + '!A:AE',
  });
  return aggregatePIs(r.data.values || []);
}

function lookupPartyCode(pis, party) {
  for (const p of pis) if (p.party === party && p.partyCode) return p.partyCode;
  return '';
}

// Persist context then send the reply. opts controls how context is updated:
//   preserveContext  — don't touch currentParty / lastQuickReplies (only bump updatedAt)
//   keepCurrentParty — don't change currentParty, but DO update lastQuickReplies
async function reply(from, sheets, spreadsheetId, ctx, parsed, out, opts) {
  opts = opts || {};
  const patch = {};
  if (opts.preserveContext) {
    // touch updatedAt only
  } else if (opts.keepCurrentParty) {
    patch.lastIntent = parsed.intent;
    if (out.quickReplies != null) patch.lastQuickReplies = out.quickReplies;
  } else {
    if (parsed.currentParty) patch.currentParty = parsed.currentParty;
    patch.lastIntent = parsed.intent;
    if (out.quickReplies != null) patch.lastQuickReplies = out.quickReplies;
  }

  try {
    await setContext(sheets, spreadsheetId, from, patch);
  } catch (e) {
    console.error('[wa] setContext failed:', e);
  }
  await sendWhatsAppMessage(from, out.body);
}

// Export OVERDUE_DAYS for sanity checks / debugging.
module.exports.OVERDUE_DAYS = OVERDUE_DAYS;
