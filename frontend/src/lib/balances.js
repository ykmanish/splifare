import { round2 } from './format';

const EPS = 0.005;

/* ------------------------------------------------------------------
   A ledger is  { [debtorId]: { [creditorId]: amount } }
   meaning "debtor owes creditor amount". Adding an edge automatically
   nets off anything owed in the opposite direction.
   ------------------------------------------------------------------ */

function addEdge(ledger, from, to, amount) {
  if (from === to || amount <= EPS) return;

  // Cancel against the opposite direction first.
  const back = ledger[to]?.[from] || 0;
  if (back > 0) {
    const cancelled = Math.min(back, amount);
    ledger[to][from] = round2(back - cancelled);
    if (ledger[to][from] <= EPS) delete ledger[to][from];
    amount = round2(amount - cancelled);
    if (amount <= EPS) return;
  }

  ledger[from] = ledger[from] || {};
  ledger[from][to] = round2((ledger[from][to] || 0) + amount);
}

/** Per-expense: who ends up owing whom, given payers and splits. */
function edgesForExpense(expense) {
  const net = {};
  for (const p of expense.paidBy || []) {
    net[p.userId] = round2((net[p.userId] || 0) + (Number(p.amount) || 0));
  }
  for (const s of expense.splits || []) {
    net[s.userId] = round2((net[s.userId] || 0) - (Number(s.amount) || 0));
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
 * Build the full pairwise ledger from expenses + settlements.
 * `scope` optionally narrows to a single group id (use `null` for
 * non-group expenses, or omit for everything).
 */
export function buildLedger(expenses = [], settlements = [], scope = undefined) {
  const inScope = (x) => scope === undefined || (x.groupId || null) === scope;
  const ledger = {};

  for (const e of expenses) {
    if (!inScope(e)) continue;
    for (const edge of edgesForExpense(e)) addEdge(ledger, edge.from, edge.to, edge.amount);
  }

  // A settlement is money actually handed over: it pays down a debt.
  for (const s of settlements) {
    if (!inScope(s)) continue;
    addEdge(ledger, s.toUserId, s.fromUserId, round2(Number(s.amount) || 0));
  }

  return ledger;
}

/** Net position between two people. > 0 means `them` owes `me`. */
export function balanceBetween(ledger, me, them) {
  const theyOwe = ledger[them]?.[me] || 0;
  const iOwe = ledger[me]?.[them] || 0;
  return round2(theyOwe - iOwe);
}

/** Everyone `me` has a live balance with, biggest first. */
export function balancesFor(ledger, me) {
  const others = new Set([
    ...Object.keys(ledger[me] || {}),
    ...Object.keys(ledger).filter((k) => ledger[k]?.[me] > EPS),
  ]);

  const rows = [...others]
    .map((id) => ({ userId: id, amount: balanceBetween(ledger, me, id) }))
    .filter((r) => Math.abs(r.amount) > EPS)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  const owed = round2(rows.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0));
  const owe = round2(rows.filter((r) => r.amount < 0).reduce((a, r) => a - r.amount, 0));

  return { rows, owed, owe, net: round2(owed - owe) };
}

/** Net position of every member — used for group summaries. */
export function netByMember(ledger, memberIds = []) {
  const ids = new Set([...memberIds, ...Object.keys(ledger)]);
  for (const from of Object.keys(ledger)) {
    for (const to of Object.keys(ledger[from])) ids.add(to);
  }

  const out = {};
  for (const id of ids) {
    let net = 0;
    for (const [creditor, amt] of Object.entries(ledger[id] || {})) {
      void creditor;
      net -= amt;
    }
    for (const from of Object.keys(ledger)) {
      if (ledger[from][id]) net += ledger[from][id];
    }
    out[id] = round2(net);
  }
  return out;
}

/**
 * Fewest transfers that clear everyone out.
 * Classic greedy: repeatedly settle the biggest debtor against the
 * biggest creditor.
 */
export function simplify(netMap) {
  const creditors = Object.entries(netMap)
    .filter(([, v]) => v > EPS)
    .map(([id, v]) => ({ id, amt: v }))
    .sort((a, b) => b.amt - a.amt || a.id.localeCompare(b.id));
  const debtors = Object.entries(netMap)
    .filter(([, v]) => v < -EPS)
    .map(([id, v]) => ({ id, amt: -v }))
    .sort((a, b) => b.amt - a.amt || a.id.localeCompare(b.id));

  const transfers = [];
  let ci = 0;
  for (const d of debtors) {
    let left = d.amt;
    while (left > EPS && ci < creditors.length) {
      const c = creditors[ci];
      const take = round2(Math.min(left, c.amt));
      if (take > EPS) transfers.push({ from: d.id, to: c.id, amount: take });
      c.amt = round2(c.amt - take);
      left = round2(left - take);
      if (c.amt <= EPS) ci++;
    }
  }
  return transfers;
}

/** How much of an expense a given user personally carried. */
export function shareOf(expense, userId) {
  const paid = (expense.paidBy || []).reduce(
    (a, p) => (p.userId === userId ? a + (Number(p.amount) || 0) : a),
    0,
  );
  const owed = (expense.splits || []).reduce(
    (a, s) => (s.userId === userId ? a + (Number(s.amount) || 0) : a),
    0,
  );
  return { paid: round2(paid), owed: round2(owed), net: round2(paid - owed) };
}

export const isInvolved = (expense, userId) =>
  (expense.paidBy || []).some((p) => p.userId === userId) ||
  (expense.splits || []).some((s) => s.userId === userId);
