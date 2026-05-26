// Pure intent parser for WhatsApp messages. No I/O — easy to unit test by
// calling parse(text, ctx) directly.

// Order matters: more specific patterns first. Once a pattern matches we
// strip it from the input to recover the party name.
const RULES = [
  { intent: 'receipts_today',     re: /\b(receipts?|collections?)\s+today\b/i },
  { intent: 'help',               re: /^\s*(help|hi|hey|hello|menu|start)\b/i },
  { intent: 'overdue_list',       re: /\boverdue\b/i },
  { intent: 'ledger_summary',     re: /\b(ledger|statement|khata)\b/i },
  { intent: 'reminder',           re: /\b(remind|reminder)\b/i },
  // English + Hindi/Hinglish ways to ask "what's outstanding".
  // "kitna lena/dena" = "how much to take/give"; "baki/bakaya" = "remaining".
  { intent: 'receivable_summary', re: /\b(outstanding|pending|receivables?|balance|dues?|due|baki|bakaya|kitna\s*(lena|dena))\b/i },
];

// Filler words to drop when extracting the party name after a keyword strip.
// Also drops generic command verbs ("show", "list", "all") so e.g.
// "show overdue" → party falls back to ctx.currentParty.
const FILLER_RE = /\b(for|of|the|please|pls|me|ka|ki|ke|show|list|all|tell)\b/gi;

function clean(s) {
  return (s || '')
    .replace(FILLER_RE, ' ')
    .replace(/[?.!,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parse(text, ctx) {
  const raw = (text || '').trim();
  if (!raw) return { intent: 'unknown', raw };

  // 1) Numbered quick reply: "1", "2"... resolved against the menu we sent last.
  const num = raw.match(/^\s*([1-9])\s*$/);
  if (num && ctx && Array.isArray(ctx.lastQuickReplies) && ctx.lastQuickReplies.length) {
    const qr = ctx.lastQuickReplies[Number(num[1]) - 1];
    if (qr && qr.key) {
      return {
        intent: qr.key,
        partyName: qr.partyName || (ctx && ctx.currentParty) || undefined,
        raw,
        fromQuickReply: true,
      };
    }
  }

  // 2) Keyword match. First hit wins.
  for (const rule of RULES) {
    if (rule.re.test(raw)) {
      const stripped = clean(raw.replace(rule.re, ' '));
      const partyName =
        stripped || (ctx && ctx.currentParty) || undefined;
      return { intent: rule.intent, partyName, raw };
    }
  }

  // 3) Bare text — assume it's a party name and they want the summary.
  return { intent: 'receivable_summary', partyName: clean(raw), raw };
}

module.exports = { parse };
