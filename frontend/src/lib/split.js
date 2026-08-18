import { round2 } from './format';

export const SPLIT_MODES = [
  { id: 'equal', label: 'Equally', hint: 'Split the total evenly' },
  { id: 'exact', label: 'Exact', hint: 'Enter an amount per person' },
  { id: 'percent', label: 'Percent', hint: 'Enter a % per person' },
  { id: 'shares', label: 'Shares', hint: 'Weight it, e.g. 2 : 1 : 1' },
];

/**
 * Distribute `total` across `weights` exactly, in cents, using the
 * largest-remainder method so the parts always sum back to the total.
 * Returns an array of 2dp numbers the same length as `weights`.
 */
export function allocate(total, weights) {
  const n = weights.length;
  if (!n) return [];

  const cents = Math.round(round2(total) * 100);
  const sum = weights.reduce((a, b) => a + (Number(b) || 0), 0);

  if (sum <= 0) {
    // No meaningful weights — fall back to an even split.
    return allocate(total, weights.map(() => 1));
  }

  const exact = weights.map((w) => ((Number(w) || 0) / sum) * cents);
  const floors = exact.map(Math.floor);
  let remainder = cents - floors.reduce((a, b) => a + b, 0);

  // Hand out the leftover cents to the largest fractional parts first.
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const out = floors.slice();
  for (let k = 0; remainder > 0; k = (k + 1) % n, remainder--) {
    out[order[k].i] += 1;
  }

  return out.map((c) => c / 100);
}

/**
 * Turn UI split state into concrete per-person amounts.
 *
 * @param {number} total
 * @param {string[]} participantIds
 * @param {string} mode           equal | exact | percent | shares
 * @param {Record<string, number>} values  keyed by participant id
 * @returns {{ splits: {userId,amount}[], valid: boolean, remaining: number, message: string }}
 */
export function computeSplits(total, participantIds, mode, values = {}) {
  const ids = participantIds.filter(Boolean);
  const amount = round2(total);

  if (!ids.length) {
    return { splits: [], valid: false, remaining: amount, message: 'Pick at least one person' };
  }

  if (mode === 'equal') {
    const parts = allocate(amount, ids.map(() => 1));
    return {
      splits: ids.map((id, i) => ({ userId: id, amount: parts[i] })),
      valid: amount > 0,
      remaining: 0,
      message: '',
    };
  }

  if (mode === 'exact') {
    const parts = ids.map((id) => round2(Number(values[id]) || 0));
    const sum = round2(parts.reduce((a, b) => a + b, 0));
    const remaining = round2(amount - sum);
    return {
      splits: ids.map((id, i) => ({ userId: id, amount: parts[i] })),
      valid: Math.abs(remaining) < 0.005 && amount > 0,
      remaining,
      message:
        Math.abs(remaining) < 0.005
          ? ''
          : remaining > 0
            ? `${remaining.toFixed(2)} left to assign`
            : `${Math.abs(remaining).toFixed(2)} over the total`,
    };
  }

  if (mode === 'percent') {
    const pcts = ids.map((id) => Number(values[id]) || 0);
    const sum = round2(pcts.reduce((a, b) => a + b, 0));
    const remaining = round2(100 - sum);
    const parts = allocate(amount, pcts);
    return {
      splits: ids.map((id, i) => ({ userId: id, amount: parts[i] })),
      valid: Math.abs(remaining) < 0.005 && amount > 0,
      remaining,
      message:
        Math.abs(remaining) < 0.005
          ? ''
          : remaining > 0
            ? `${remaining.toFixed(2)}% left`
            : `${Math.abs(remaining).toFixed(2)}% over`,
    };
  }

  // shares
  const shares = ids.map((id) => Math.max(0, Number(values[id]) || 0));
  const totalShares = shares.reduce((a, b) => a + b, 0);
  const parts = allocate(amount, shares);
  return {
    splits: ids.map((id, i) => ({ userId: id, amount: parts[i] })),
    valid: totalShares > 0 && amount > 0,
    remaining: totalShares,
    message: totalShares > 0 ? `${totalShares} share${totalShares === 1 ? '' : 's'} total` : 'Give someone at least one share',
  };
}

/** Seed sensible defaults when the user switches split mode. */
export function defaultValuesFor(mode, total, ids) {
  if (mode === 'exact') {
    const parts = allocate(total, ids.map(() => 1));
    return Object.fromEntries(ids.map((id, i) => [id, parts[i]]));
  }
  if (mode === 'percent') {
    const parts = allocate(100, ids.map(() => 1));
    return Object.fromEntries(ids.map((id, i) => [id, parts[i]]));
  }
  if (mode === 'shares') {
    return Object.fromEntries(ids.map((id) => [id, 1]));
  }
  return {};
}

/**
 * Roll a shopping list's per-item assignments up into per-person totals.
 * Each priced item is divided equally among the people it was assigned to.
 */
export function splitsFromItems(items, fallbackIds = []) {
  const totals = {};
  let grand = 0;

  for (const item of items) {
    const price = round2(Number(item.price) || 0);
    if (price <= 0) continue;
    const who = item.splitWith?.length ? item.splitWith : fallbackIds;
    if (!who.length) continue;

    grand = round2(grand + price);
    const parts = allocate(price, who.map(() => 1));
    who.forEach((id, i) => {
      totals[id] = round2((totals[id] || 0) + parts[i]);
    });
  }

  return {
    total: grand,
    splits: Object.entries(totals).map(([userId, amount]) => ({ userId, amount })),
  };
}
