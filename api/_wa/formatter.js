const { inr } = require('./format');
const { OVERDUE_DAYS } = require('./queries');

// Every formatter returns { body, quickReplies } where quickReplies is the
// ordered menu we showed the user — saved to ctx so a "1"/"2" reply resolves.
// quickReplies items: { key: <intent>, partyName?: <string> }.

function fmtReceivableSummary(agg) {
  const body =
`*${agg.party}*  (${agg.partyCode || '—'})

Outstanding: *${inr(agg.outstanding)}*
Overdue (>${OVERDUE_DAYS}d): *${inr(agg.overdue)}*
Oldest invoice: ${agg.oldestAge}d
Open invoices: ${agg.invoices.length}

Reply:
1. overdue invoices
2. ledger
3. draft reminder`;
  return {
    body,
    quickReplies: [
      { key: 'overdue_list',   partyName: agg.party },
      { key: 'ledger_summary', partyName: agg.party },
      { key: 'reminder',       partyName: agg.party },
    ],
  };
}

function fmtOverdueList(agg) {
  const overdue = agg.invoices.filter(i => i.age > OVERDUE_DAYS);
  const lines = overdue.slice(0, 10)
    .map(i => `• ${i.invoiceNo}  ${inr(i.amount)}  · ${i.age}d`)
    .join('\n');
  const body =
`*${agg.party}* — overdue (>${OVERDUE_DAYS}d)

${lines || '_None overdue_'}

Total overdue: *${inr(agg.overdue)}*

Reply:
1. draft reminder
2. ledger`;
  return {
    body,
    quickReplies: [
      { key: 'reminder',       partyName: agg.party },
      { key: 'ledger_summary', partyName: agg.party },
    ],
  };
}

function fmtLedgerSummary(agg) {
  const lines = agg.invoices.slice(0, 15)
    .map(i => `• ${i.invoiceNo}  ${inr(i.amount)}  · ${i.age}d`)
    .join('\n');
  const body =
`*${agg.party}* — open ledger

${lines || '_No open invoices_'}

Total outstanding: *${inr(agg.outstanding)}*

Reply:
1. overdue only
2. draft reminder`;
  return {
    body,
    quickReplies: [
      { key: 'overdue_list', partyName: agg.party },
      { key: 'reminder',     partyName: agg.party },
    ],
  };
}

function fmtReminderDraft(agg) {
  const body =
`Draft reminder for *${agg.party}*:

---
Hi ${agg.party},

Sharing pending invoices totaling ${inr(agg.outstanding)}, with ${inr(agg.overdue)} overdue beyond ${OVERDUE_DAYS} days.

Please check and let us know.
---

Reply *COPY* to keep, *EDIT* to revise.`;
  return { body, quickReplies: [] };
}

function fmtZeroOutstanding(party, partyCode) {
  const body =
`*${party}*  (${partyCode || '—'})

No outstanding receivables 🎉
All invoices are settled.

Reply:
1. ledger
2. help`;
  return {
    body,
    quickReplies: [
      { key: 'ledger_summary', partyName: party },
      { key: 'help' },
    ],
  };
}

function fmtPartyNotFound(input, suggestions) {
  const sugg = (suggestions || []).slice(0, 3);
  const suggLines = sugg.length
    ? sugg.map(s => `• ${s}`).join('\n')
    : '• (no parties with outstanding yet)';
  const body =
`Couldn't find party "${input || ''}".

Try:
${suggLines}

Or type *help*.`;
  // No quickReplies — handler preserves the existing ctx.lastQuickReplies.
  return { body, quickReplies: null };
}

function fmtDisambiguation(input, candidates) {
  const opts = candidates.slice(0, 5);
  const body =
`Multiple matches for "${input}":

${opts.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Reply with the number.`;
  return {
    body,
    quickReplies: opts.map(c => ({ key: 'receivable_summary', partyName: c })),
  };
}

function fmtReceiptsToday() {
  return {
    body: 'Receipts tracking with dates is coming soon.',
    quickReplies: [],
  };
}

function fmtHelp() {
  const body =
`*Atlas Receivables*

Try:
• \`<party> outstanding\`
• \`<party> baki\` / \`kitna lena\`
• \`overdue <party>\`
• \`ledger <party>\`
• \`remind <party>\`

Or just send a party name.`;
  return { body, quickReplies: [] };
}

function fmtUnknown(raw) {
  return {
    body: `Didn't understand "${raw}". Send *help* for options.`,
    quickReplies: [],
  };
}

function fmtTimeoutOrError() {
  return {
    body:
`Atlas is taking a little longer than usual.
Please try again in a moment.

Or type *help*.`,
    quickReplies: null, // preserve previous quick replies on failure
  };
}

module.exports = {
  fmtReceivableSummary,
  fmtOverdueList,
  fmtLedgerSummary,
  fmtReminderDraft,
  fmtZeroOutstanding,
  fmtPartyNotFound,
  fmtDisambiguation,
  fmtReceiptsToday,
  fmtHelp,
  fmtUnknown,
  fmtTimeoutOrError,
};
