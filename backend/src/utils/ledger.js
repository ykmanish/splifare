const { Expense, Settlement } = require('../models');
const { round2 } = require('./money');
const { getRates } = require('./fx');

/**
 * What one person owes another, computed on the server.
 *
 * The balances a person sees are worked out on their own device, and that
 * stays the authority — this exists only so the server can refuse to send a
 * reminder for a debt that is not there. A nudge is a message about someone
 * else's money; the server should not take the sender's word for which
 * direction it flows.
 *
 * **This is a deliberate second implementation of
 * `frontend/src/lib/balances.js`, and the two must stay in step.** It is kept
 * structurally identical to that file — same greedy matching, same tie-break,
 * same rounding — so a divergence shows up as a diff rather than as a wrong
 * number in someone's notification. What it is used for is chosen to be
 * robust to the small differences that remain: a sign, never a figure the
 * recipient is asked to trust over their own screen.
 */

const EPS = 0.005;

/** Mirrors `makeConverter` in frontend/src/lib/fx.js, including its fallbacks. */
function makeConverter(base, rates) {
  return (amount, from) => {
    const value = Number(amount) || 0;
    if (!value) return 0;
    const code = String(from || base).toUpperCase();
    if (code === base) return value;
    const rate = Number(rates?.[code]);
    // An unknown or broken rate passes the figure through rather than zeroing
    // it — the same choice the client makes, so both land in the same place.
    if (!Number.isFinite(rate) || rate <= 0) return value;
    return value / rate;
  };
}

/**
 * Who ends up owing whom for one expense.
 *
 * Ported line for line from `edgesForExpense`. The sort's tie-break on id is
 * load-bearing: with two debtors owing the same amount it decides which of
 * them is matched to which creditor, so dropping it would silently give a
 * different answer from the client's.
 */
function edgesForExpense(expense, convert) {
  const cur = expense.currency;
  const net = {};

  for (const p of expense.paidBy || []) {
    const id = String(p.user || p.userId);
    net[id] = round2((net[id] || 0) + convert(p.amount, cur));
  }
  for (const s of expense.splits || []) {
    const id = String(s.user || s.userId);
    net[id] = round2((net[id] || 0) - convert(s.amount, cur));
  }

  const creditors = Object.entries(net)
    .filter(([, v]) => v > EPS)
    .map(([id, v]) => ({ id, amt: v }))
    .sort((a, b) => b.amt - a.amt || a.id.localeCompare(b.id));
  const debtors = Object.entries(net)
    .filter(([, v]) => v < -EPS)
    .map(([id, v]) => ({ id, amt: -v }))
    .sort((a, b) => b.amt - a.amt || a.id.localeCompare(b.id));

  const edges = [];
  let ci = 0;
  for (const d of debtors) {
    let left = d.amt;
    while (left > EPS && ci < creditors.length) {
      const c = creditors[ci];
      const take = Math.min(left, c.amt);
      edges.push({ from: d.id, to: c.id, amount: round2(take) });
      c.amt = round2(c.amt - take);
      left = round2(left - take);
      if (c.amt <= EPS) ci++;
    }
  }
  return edges;
}

/**
 * The net position between two people, in `currency`.
 *
 * Positive means `themId` owes `meId`.
 *
 * Only expenses naming both of them can produce an edge between them — an
 * edge runs from a debtor to a creditor and both come out of that expense's
 * own participants — so one indexed query covers it rather than the whole
 * history.
 */
async function balanceBetween(meId, themId, currency = 'INR') {
  const me = String(meId);
  const them = String(themId);
  if (me === them) return 0;

  const [expenses, settlements] = await Promise.all([
    Expense.find({ participants: { $all: [me, them] } }).select(
      'paidBy splits currency participants',
    ),
    Settlement.find({
      $or: [
        { from: me, to: them },
        { from: them, to: me },
      ],
    }).select('from to amount currency'),
  ]);

  let convert = (amount) => Number(amount) || 0;
  // Only pay for rates when there is actually more than one currency in play.
  const codes = new Set([
    ...expenses.map((e) => e.currency),
    ...settlements.map((s) => s.currency),
  ].filter(Boolean));
  if (codes.size > 1 || (codes.size === 1 && !codes.has(currency))) {
    try {
      const table = await getRates(currency);
      convert = makeConverter(currency, table.rates);
    } catch {
      // Rates unavailable: fall back to treating figures at face value, which
      // is what the client does too when its own table fails to load.
    }
  }

  let theyOwe = 0;
  let iOwe = 0;

  for (const expense of expenses) {
    for (const edge of edgesForExpense(expense, convert)) {
      if (edge.from === them && edge.to === me) theyOwe = round2(theyOwe + edge.amount);
      else if (edge.from === me && edge.to === them) iOwe = round2(iOwe + edge.amount);
    }
  }

  // A settlement is money actually handed over: it pays a debt down.
  for (const s of settlements) {
    const amount = round2(convert(s.amount, s.currency));
    if (String(s.from) === them) theyOwe = round2(theyOwe - amount);
    else iOwe = round2(iOwe - amount);
  }

  return round2(theyOwe - iOwe);
}

module.exports = { balanceBetween, edgesForExpense, makeConverter, EPS };
