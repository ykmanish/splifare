const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Distribute `total` across `weights` exactly, in cents, using the
 * largest-remainder method so the parts always sum back to the total.
 */
function allocate(total, weights) {
  const n = weights.length;
  if (!n) return [];

  const cents = Math.round(round2(total) * 100);
  const sum = weights.reduce((a, b) => a + (Number(b) || 0), 0);
  if (sum <= 0) return allocate(total, weights.map(() => 1));

  const exact = weights.map((w) => ((Number(w) || 0) / sum) * cents);
  const floors = exact.map(Math.floor);
  let remainder = cents - floors.reduce((a, b) => a + b, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const out = floors.slice();
  for (let k = 0; remainder > 0; k = (k + 1) % n, remainder--) out[order[k].i] += 1;

  return out.map((c) => c / 100);
}

/**
 * Roll a shopping list's per-item assignments up into per-person totals.
 * Each priced item is divided equally among the people assigned to it.
 */
function splitsFromItems(items, fallbackIds = []) {
  const totals = new Map();
  let grand = 0;

  for (const item of items) {
    const price = round2(Number(item.price) || 0);
    if (price <= 0) continue;

    const who = (item.splitWith?.length ? item.splitWith : fallbackIds).map(String);
    if (!who.length) continue;

    grand = round2(grand + price);
    const parts = allocate(price, who.map(() => 1));
    who.forEach((id, i) => totals.set(id, round2((totals.get(id) || 0) + parts[i])));
  }

  return {
    total: grand,
    splits: [...totals.entries()].map(([user, amount]) => ({ user, amount })),
  };
}

/**
 * Format an amount for a notification body.
 *
 * Notification text is baked at write time and read back verbatim, so the
 * currency has to be in the string — a bare "1200" tells the reader nothing
 * about whether they owe rupees or euros.
 */
function formatMoney(amount, currency = 'INR') {
  const value = round2(amount);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: String(currency || 'INR').toUpperCase(),
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Unknown code: still say which currency it was.
    return `${String(currency || '').toUpperCase()} ${value}`.trim();
  }
}

/** Validate that splits add up to the expense total. */
function splitsBalance(amount, splits) {
  const sum = splits.reduce((a, s) => a + (Number(s.amount) || 0), 0);
  return Math.abs(round2(sum) - round2(amount)) < 0.01;
}

module.exports = { round2, allocate, splitsFromItems, splitsBalance, formatMoney };
