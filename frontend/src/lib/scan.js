import { allocate } from './split';
import { round2, CURRENCIES } from './format';

/**
 * Turning a scanned bill into rows the expense form can hold.
 *
 * The form derives its total from the items when itemised, so whatever lands
 * here IS the money. Two rules follow from that, and everything below is one
 * of them:
 *
 *   - a charged fee has to become a row, or the payer is quietly short-changed
 *     by exactly that fee;
 *   - nothing is ever silently adjusted, dropped or deduplicated — a bill that
 *     does not add up is shown to the person, not fixed behind their back.
 */

/** Below this, a difference is float noise rather than a real gap. */
const EPS = 0.005;

const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const sumOf = (rows) => round2(rows.reduce((total, row) => total + (Number(row.price) || 0), 0));

/**
 * What the sheet should do with a scan result.
 *
 * Returns `{ action, ... }` where action is one of:
 *   'reject'  — do not touch the form; show `title`/`body`.
 *   'amount'  — a payment confirmation: an amount but nothing to itemise.
 *   'items'   — rows to put in the form, plus whatever the user must check.
 */
export function planFromScan(result, { existingItems = [], currency } = {}) {
  if (!result) return { action: 'reject', title: 'Nothing came back', body: 'Try again.' };

  if (result.multipleReceiptsDetected) {
    return {
      action: 'reject',
      title: 'That looks like more than one bill',
      body:
        result.notes ||
        'Scan one bill at a time — an expense has a single payer, date and total.',
    };
  }

  if (result.status === 'not_a_receipt') {
    return {
      action: 'reject',
      title: 'That does not look like a bill',
      body: result.reason || 'Pick a photo of a receipt or an order summary.',
    };
  }

  if (result.status === 'unreadable') {
    return {
      action: 'reject',
      retry: true,
      title: 'That photo was too hard to read',
      body: result.reason || 'Try a straighter, brighter shot — or type the items in.',
    };
  }

  // A UPI or card confirmation carries a total and nothing to itemise. Filling
  // the amount is strictly better than the regex guess the share screen used.
  if (!result.items?.length) {
    const total = result.statedTotals?.grandTotal;
    if (total > 0) {
      return {
        action: 'amount',
        amount: total,
        description: result.suggestedDescription || '',
        currency: pickCurrency(result, currency),
        note: 'Read the amount, but there were no items to list.',
      };
    }
    return {
      action: 'reject',
      retry: true,
      title: 'No items found in that photo',
      body: result.reason || 'Try a straighter, brighter shot — or type the items in.',
    };
  }

  return buildItems(result, existingItems, currency);
}

function pickCurrency(result, current) {
  if (result.currencyConfidence !== 'high' || !result.currency) return null;
  if (!CURRENCIES[result.currency]) return null;
  return result.currency === current ? null : result.currency;
}

function buildItems(result, existingItems, currency) {
  const notes = [];

  let goods = result.items.map((item) => ({
    name: item.name,
    price: Number(item.price) || 0,
    listPrice: item.listPrice ?? null,
    confidence: item.confidence,
    kind: 'item',
  }));

  const adjustments = result.adjustments || [];
  const charged = adjustments.filter((row) => row.charged && row.amount !== 0);

  /*
   * A cart-level discount cannot be a row: price is `min: 0` on the schema and
   * the expense route drops anything not above zero, so a "-₹50 coupon" would
   * vanish server-side and the group would overpay by ₹50. Spreading it across
   * the goods keeps every row positive and the total honest.
   */
  const discount = round2(
    charged.filter((row) => row.amount < 0).reduce((total, row) => total + row.amount, 0),
  );
  if (discount < 0 && goods.length) {
    const target = round2(sumOf(goods) + discount);
    if (target > 0) {
      const parts = allocate(
        target,
        goods.map((row) => row.price),
      );
      goods = goods.map((row, index) => ({ ...row, price: parts[index] }));
      const label = charged.find((row) => row.amount < 0)?.label || 'A discount';
      notes.push(`${label} was spread across ${goods.length} items.`);
    }
  }

  /*
   * A charged fee becomes its own row. Without it the fee is not merely
   * unlabelled — the form's total is the item sum, so it disappears from the
   * expense entirely and everyone under-pays the person who covered it.
   */
  const fees = charged
    .filter((row) => row.amount > 0)
    .map((row) => ({
      name: row.label,
      price: round2(row.amount),
      listPrice: null,
      confidence: 'high',
      kind: row.kind || 'fee',
    }));

  // Waived lines are shown, never added: a zero row is silently dropped both
  // by the form's own filter and by the server's.
  const waived = adjustments
    .filter((row) => !row.charged && (row.originalAmount || 0) > 0)
    .map((row) => ({ label: row.label, originalAmount: row.originalAmount }));

  const rows = [...goods, ...fees];
  const stated = result.statedTotals?.grandTotal ?? null;
  const sum = sumOf(rows);
  // A little slack per row, since each price is an independent read.
  const tolerance = Math.max(0.05, 0.01 * rows.length);
  const delta = stated == null ? null : round2(sum - stated);

  let warning = null;
  let mrpSwap = null;

  if (delta != null && Math.abs(delta) > EPS) {
    if (Math.abs(delta) <= tolerance) {
      notes.push(`Rounded to match the bill total of ${stated}.`);
    } else if (delta > 0) {
      /*
       * Too high is the signature of the list-price mistake: the struck-through
       * MRP column was read instead of what was paid. Offer the swap, never
       * apply it — the person can see both columns and decide.
       */
      const listSum = round2(
        goods.reduce((total, row) => total + (row.listPrice ?? row.price), 0) +
          fees.reduce((total, row) => total + row.price, 0),
      );
      if (goods.some((row) => row.listPrice != null) && Math.abs(listSum - stated) <= tolerance) {
        mrpSwap = { from: sum, to: listSum };
        warning = `These may be the pre-discount prices — they add up to ${sum}, but the bill says ${stated}.`;
      } else {
        warning = `The items add up to ${sum} but the bill says ${stated}. Check the prices before saving.`;
      }
    } else {
      warning = `The items add up to ${sum} but the bill says ${stated} — something may be missing.`;
      // Offer the gap as a line rather than leaving the payer short.
      mrpSwap = null;
    }
  } else if (stated == null) {
    warning = 'Could not read the bill total, so there is nothing to check these against.';
  }

  return {
    action: 'items',
    rows: merge(existingItems, rows),
    waived,
    statedTotal: stated,
    itemsSum: sum,
    shortfall: delta != null && delta < -tolerance ? round2(-delta) : 0,
    mrpSwap,
    warning,
    notes: [...notes, result.notes].filter(Boolean),
    description: result.suggestedDescription || '',
    currency: pickCurrency(result, currency),
    lowConfidence: rows.filter((row) => row.confidence === 'low').length,
  };
}

/**
 * Scanned rows appended to whatever the form already had.
 *
 * The blank placeholder row the form seeds itself with is dropped: left in
 * the middle of a list it trips the "complete or remove unfinished items"
 * error next to a set of perfectly good rows.
 */
function merge(existing, scanned) {
  const kept = (existing || []).filter(
    (row) => String(row.name || '').trim() || Number(row.price) > 0,
  );
  const seen = new Set(kept.map(key));

  return [
    ...kept,
    ...scanned.map((row) => ({
      id: uid(),
      name: row.name,
      price: String(row.price),
      listPrice: row.listPrice,
      confidence: row.confidence,
      kind: row.kind,
      scanned: true,
      // Flagged only. Two different products can honestly cost the same, and
      // removing one would put the total below what the bill says.
      duplicate: seen.has(key({ name: row.name, price: row.price })),
    })),
  ];
}

const key = (row) =>
  `${String(row.name || '')
    .trim()
    .toLowerCase()}|${(Number(row.price) || 0).toFixed(2)}`;

/** A row carrying the gap, for the "add the difference" repair. */
export const shortfallRow = (amount) => ({
  id: uid(),
  name: 'Other charges',
  price: String(round2(amount)),
  listPrice: null,
  confidence: 'low',
  kind: 'other',
  scanned: true,
});
