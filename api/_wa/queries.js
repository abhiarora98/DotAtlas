const { daysSince } = require('./format');

const OVERDUE_DAYS = Number(process.env.OVERDUE_DAYS || 30);

// --- Party name matching ---------------------------------------------------

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Levenshtein distance. Small inputs, plain implementation, no deps.
function lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function maxEditsFor(len) {
  if (len <= 5) return 1;
  if (len <= 8) return 2;
  return 3;
}

// Score a candidate party name against the (normalized) input.
// Lower = better. Returns Infinity if outside the typo budget.
function fuzzyScore(input, party) {
  const a = input;
  const b = normalize(party);
  const budget = maxEditsFor(a.length);
  // Compare against the whole name and against each token; take the best.
  let best = lev(a, b);
  for (const tok of b.split(/\s+/)) {
    if (!tok) continue;
    best = Math.min(best, lev(a, tok));
    // Also handle "Suny" vs "Sunny Synthetic": substring with a typo.
    if (b.length > a.length + 2) {
      // slide a window over b and check the min edit distance.
      const wlen = a.length;
      for (let i = 0; i + wlen <= b.length; i++) {
        const window = b.slice(i, i + wlen + 1); // +1 lets us catch missing char
        best = Math.min(best, lev(a, window));
      }
    }
  }
  return best <= budget ? best : Infinity;
}

function matchParty(input, allParties) {
  if (!input) return { status: 'none' };
  const q = normalize(input);
  if (!q) return { status: 'none' };
  const tokens = q.split(/\s+/).filter(Boolean);

  // Stage 1: prefix
  const prefix = allParties.filter(p => normalize(p).startsWith(q));
  if (prefix.length === 1) return { status: 'one', party: prefix[0] };
  if (prefix.length > 1)   return { status: 'many', candidates: prefix.slice(0, 5) };

  // Stage 2: all-tokens substring
  const tokenMatch = allParties.filter(p => {
    const np = normalize(p);
    return tokens.every(t => np.includes(t));
  });
  if (tokenMatch.length === 1) return { status: 'one', party: tokenMatch[0] };
  if (tokenMatch.length > 1)   return { status: 'many', candidates: tokenMatch.slice(0, 5) };

  // Stage 3: fuzzy fallback
  const scored = allParties
    .map(p => ({ p, s: fuzzyScore(q, p) }))
    .filter(x => Number.isFinite(x.s))
    .sort((a, b) => a.s - b.s);

  if (!scored.length) return { status: 'none' };
  // Auto-match only when the best is clearly the best (gap >= 2 to the runner-up).
  if (scored.length === 1 || scored[1].s - scored[0].s >= 2) {
    return { status: 'one', party: scored[0].p };
  }
  return { status: 'many', candidates: scored.slice(0, 5).map(x => x.p) };
}

// --- Receivables computation ----------------------------------------------

// pis: output of aggregatePIs() in api/pi.js
// Returns Map<partyName, { party, partyCode, outstanding, overdue, oldestAge, invoices[] }>
function computeReceivables(pis) {
  const byParty = new Map();
  for (const pi of pis) {
    const received = Number(pi.totalReceived) || 0;
    const outstanding = (Number(pi.totalIncGst) || 0) - received;
    if (outstanding <= 0.5) continue;        // settled / rounding noise
    const age = daysSince(pi.date);
    const overdue = age != null && age > OVERDUE_DAYS ? outstanding : 0;

    if (!byParty.has(pi.party)) {
      byParty.set(pi.party, {
        party: pi.party,
        partyCode: pi.partyCode || '',
        outstanding: 0,
        overdue: 0,
        oldestAge: 0,
        invoices: [],
      });
    }
    const agg = byParty.get(pi.party);
    agg.outstanding += outstanding;
    agg.overdue     += overdue;
    if (age != null && age > agg.oldestAge) agg.oldestAge = age;
    agg.invoices.push({
      invoiceNo: pi.invoiceNo || pi.ref || '—',
      ref: pi.ref,
      amount: outstanding,
      age: age == null ? 0 : age,
      date: pi.date,
    });
  }
  for (const agg of byParty.values()) {
    agg.invoices.sort((a, b) => b.age - a.age);
  }
  return byParty;
}

function uniqueParties(pis) {
  const set = new Set();
  for (const p of pis) if (p.party) set.add(p.party);
  return [...set];
}

module.exports = {
  OVERDUE_DAYS,
  matchParty,
  computeReceivables,
  uniqueParties,
  normalize, // exported for tests
};
