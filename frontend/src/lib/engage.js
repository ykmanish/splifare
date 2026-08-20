import { categoryOf } from './categories';

/**
 * The reading side of the engagement features.
 *
 * Wrapped, insights and the timeline all answer questions about the same pile
 * of expenses, and every one of them is a *claim* shown to the group — "you
 * spend 2.3x more at weekends" is either true or it is the app making things
 * up. So the arithmetic lives here, in one place, rather than inline in six
 * panels where a subtly different denominator can hide.
 */

const DAY = 86400000;

/* --------------------------------------------------------------- periods */

/** `2026-08` — the key a month is bucketed and navigated by. */
export const monthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const monthLabel = (key, { long = false } = {}) => {
  const [year, month] = String(key).split('-').map(Number);
  const d = new Date(year, (month || 1) - 1, 1);
  return d.toLocaleDateString(undefined, {
    month: long ? 'long' : 'short',
    year: 'numeric',
  });
};

/** Step a month key by `delta` months. */
export function shiftMonth(key, delta) {
  const [year, month] = String(key).split('-').map(Number);
  const d = new Date(year, (month || 1) - 1 + delta, 1);
  return monthKey(d);
}

/**
 * Every month that has an expense, newest first, plus the current one.
 *
 * The current month is always included even when empty, because a wrapped
 * that refuses to open until someone spends money is a wrapped nobody
 * discovers.
 */
export function monthsWithData(expenses) {
  const keys = new Set(expenses.map((e) => monthKey(e.date)));
  keys.add(monthKey(new Date()));
  return [...keys].sort().reverse();
}

/* ------------------------------------------------------------- utilities */

const sumBy = (rows, fn) => rows.reduce((a, r) => a + (fn(r) || 0), 0);

/** Largest entry of an `{key: number}` tally, or null. */
function topEntry(tally) {
  const rows = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  return rows.length ? { key: rows[0][0], value: rows[0][1] } : null;
}

/**
 * How memorable an expense title is.
 *
 * This replaces a hardcoded `/lol|pizza|momo/` match, which only ever fired
 * for the words its author happened to think of and quietly ranked a group's
 * whole history by whether anyone had typed "momo".
 *
 * Instead: score the things that actually make a title stand out in a list of
 * bills — an emoji, a shout, a joke long enough to be deliberate — and dock
 * the flat nouns that make up most of a ledger. It is still a guess, but it is
 * a guess about *this* group's titles rather than about a fixed word list.
 */
const FLAT_TITLES = /^(rent|wifi|wi-fi|groceries|grocery|fuel|petrol|milk|electricity|water|bill|food|lunch|dinner|breakfast|cab|uber|taxi|maid|internet)$/i;
const EMOJI = /\p{Extended_Pictographic}/u;

export function funScore(text = '') {
  const title = String(text).trim();
  if (!title || FLAT_TITLES.test(title)) return 0;

  const words = title.split(/\s+/);
  let score = 0;
  if (EMOJI.test(title)) score += 4;
  if (/!/.test(title)) score += 2;
  if (/\b[A-Z]{3,}\b/.test(title)) score += 2;
  if (words.length >= 4) score += 2;
  else if (words.length === 3) score += 1;
  if (/\(|\)|"|'/.test(title)) score += 1;
  /* A long title is usually a story; a very short one is usually a noun. */
  if (title.length > 24) score += 1;
  if (title.length <= 5) score -= 1;
  return score;
}

/* --------------------------------------------------------------- wrapped */

/**
 * A month in review, for one group.
 *
 * Every figure is converted to the reader's currency first, because a group
 * that spent in two currencies cannot be totalled any other way — and a
 * wrapped that adds ₹ to € and calls it a total is worse than no wrapped.
 */
export function buildWrapped({
  expenses,
  settlements = [],
  memberIds = [],
  month,
  convert,
  personById,
}) {
  const inMonth = expenses.filter((e) => monthKey(e.date) === month);
  const prevKey = shiftMonth(month, -1);
  const prev = expenses.filter((e) => monthKey(e.date) === prevKey);

  const total = sumBy(inMonth, (e) => convert(e.amount, e.currency));
  const prevTotal = sumBy(prev, (e) => convert(e.amount, e.currency));

  const byCategory = {};
  const byPayer = {};
  const byDay = {};
  for (const e of inMonth) {
    const value = convert(e.amount, e.currency);
    byCategory[e.category || 'other'] = (byCategory[e.category || 'other'] || 0) + value;
    byDay[new Date(e.date).getDay()] = (byDay[new Date(e.date).getDay()] || 0) + value;
    for (const p of e.paidBy || []) {
      byPayer[p.userId] = (byPayer[p.userId] || 0) + convert(p.amount, e.currency);
    }
  }

  const topCategory = topEntry(byCategory);
  const topPayer = topEntry(byPayer);
  const busiestDay = topEntry(byDay);

  const biggest = [...inMonth].sort(
    (a, b) => convert(b.amount, b.currency) - convert(a.amount, a.currency),
  )[0];

  /* Highest fun score wins; ties break on the bigger bill, so a memorable
     title attached to a real night out beats a throwaway one. */
  const funniest = [...inMonth]
    .map((e) => ({ e, score: funScore(e.description) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || convert(b.e.amount, b.e.currency) - convert(a.e.amount, a.e.currency))[0]?.e;

  /*
   * "Settled fastest" is the median gap between a person's settlements and
   * the month's start, not a single lucky payment — one fast transfer in a
   * month of silence should not crown anybody.
   */
  const monthStart = new Date(`${month}-01T00:00:00`);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  const paidUp = {};
  for (const s of settlements) {
    const when = new Date(s.date || s.createdAt);
    if (when < monthStart || when >= monthEnd) continue;
    const days = Math.max(0, (when - monthStart) / DAY);
    (paidUp[s.fromUserId] = paidUp[s.fromUserId] || []).push(days);
  }
  const fastest = Object.entries(paidUp)
    .map(([userId, gaps]) => ({
      userId,
      days: gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)],
      count: gaps.length,
    }))
    .sort((a, b) => a.days - b.days)[0];

  const perMember = memberIds.map((memberId) => ({
    userId: memberId,
    paid: byPayer[memberId] || 0,
    share: sumBy(
      inMonth,
      (e) =>
        convert(
          (e.splits || []).find((s) => s.userId === memberId)?.amount || 0,
          e.currency,
        ),
    ),
  }));

  return {
    month,
    label: monthLabel(month, { long: true }),
    total,
    count: inMonth.length,
    prevTotal,
    /* null rather than Infinity when there is nothing to compare against, so
       the card can say "first month" instead of showing a nonsense percentage. */
    changePct: prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null,
    average: inMonth.length ? total / inMonth.length : 0,
    topCategory: topCategory && {
      id: topCategory.key,
      label: categoryOf(topCategory.key).label,
      amount: topCategory.value,
      share: total > 0 ? (topCategory.value / total) * 100 : 0,
    },
    topPayer: topPayer && {
      userId: topPayer.key,
      person: personById?.(topPayer.key),
      amount: topPayer.value,
    },
    fastestSettler: fastest && { ...fastest, person: personById?.(fastest.userId) },
    busiestDay:
      busiestDay &&
      {
        day: Number(busiestDay.key),
        label: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
          Number(busiestDay.key)
        ],
        amount: busiestDay.value,
      },
    biggest,
    funniest,
    perMember,
    categories: Object.entries(byCategory)
      .map(([catId, amount]) => ({
        id: catId,
        label: categoryOf(catId).label,
        amount,
        share: total > 0 ? (amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount),
    empty: inMonth.length === 0,
  };
}

/* -------------------------------------------------------------- insights */

/**
 * Claims about the group's spending, each with the arithmetic behind it.
 *
 * The weekend comparison is the one worth reading twice. The obvious version
 * — weekend total against weekday total — is not a fact about behaviour at
 * all: there are five weekdays to two weekend days, so a group that spends
 * identically every day of the week produces a "weekends are 0.4x" headline.
 *
 * Both sides are normalised to a per-day rate over the days that actually
 * occurred in the window. Then "2.3x" means what a reader assumes it means.
 */
export function buildInsights({ expenses, convert, personById, currency }) {
  const out = [];
  if (!expenses.length) return out;

  const dates = expenses.map((e) => new Date(e.date)).sort((a, b) => a - b);
  const first = dates[0];
  const last = dates[dates.length - 1];
  const spanDays = Math.max(1, Math.round((last - first) / DAY) + 1);

  let weekendDays = 0;
  for (let i = 0; i < spanDays; i += 1) {
    const d = new Date(first.getTime() + i * DAY);
    if (d.getDay() === 0 || d.getDay() === 6) weekendDays += 1;
  }
  const weekdayDays = Math.max(1, spanDays - weekendDays);

  const weekendTotal = sumBy(
    expenses.filter((e) => [0, 6].includes(new Date(e.date).getDay())),
    (e) => convert(e.amount, e.currency),
  );
  const total = sumBy(expenses, (e) => convert(e.amount, e.currency));
  const weekdayTotal = total - weekendTotal;

  const weekendRate = weekendTotal / Math.max(1, weekendDays);
  const weekdayRate = weekdayTotal / weekdayDays;

  /* Only claim a ratio once there is a weekday baseline worth dividing by.
     Below that, a single Saturday coffee reads as "12x". */
  if (weekdayRate > 0 && weekendDays > 0 && total > 0) {
    const ratio = weekendRate / weekdayRate;
    out.push({
      id: 'weekend',
      tone: ratio >= 1.25 ? 'peach' : 'mint',
      headline:
        ratio >= 1.05
          ? `Weekends cost ${ratio.toFixed(1)}x a weekday`
          : ratio <= 0.8
            ? `Weekdays cost ${(1 / ratio).toFixed(1)}x a weekend day`
            : 'Spending is even across the week',
      detail: `${fmtRate(weekendRate, currency)} a day at weekends vs ${fmtRate(weekdayRate, currency)} on weekdays`,
    });
  }

  const byCategory = {};
  for (const e of expenses) {
    byCategory[e.category || 'other'] =
      (byCategory[e.category || 'other'] || 0) + convert(e.amount, e.currency);
  }
  const top = topEntry(byCategory);
  if (top && total > 0) {
    out.push({
      id: 'category',
      tone: 'sky',
      headline: `${Math.round((top.value / total) * 100)}% of spend goes on ${categoryOf(top.key).label.toLowerCase()}`,
      detail: `${Object.keys(byCategory).length} categories in play across ${expenses.length} bills`,
    });
  }

  /* Averages are only interesting against a spread — a mean with no sense of
     the outliers is the statistic people misread most. */
  const values = expenses.map((e) => convert(e.amount, e.currency)).sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  const mean = total / values.length;
  if (values.length >= 4 && median > 0 && mean / median >= 1.6) {
    out.push({
      id: 'skew',
      tone: 'butter',
      headline: 'A few big bills carry the total',
      detail: `Typical bill is ${fmtRate(median, currency)}, but the average is ${fmtRate(mean, currency)}`,
    });
  }

  const byPayer = {};
  for (const e of expenses) {
    for (const p of e.paidBy || []) {
      byPayer[p.userId] = (byPayer[p.userId] || 0) + 1;
    }
  }
  const payer = topEntry(byPayer);
  if (payer && expenses.length >= 4) {
    const share = Math.round((payer.value / expenses.length) * 100);
    if (share >= 55) {
      out.push({
        id: 'payer',
        tone: 'grape',
        headline: `${personById?.(payer.key)?.name || 'One person'} fronts ${share}% of bills`,
        detail: 'Fronting most of the money means carrying the balance between settle-ups',
      });
    }
  }

  /* A month-on-month move, but only once two full months exist. */
  const thisMonth = monthKey(new Date());
  const lastMonth = shiftMonth(thisMonth, -1);
  const nowTotal = sumBy(
    expenses.filter((e) => monthKey(e.date) === thisMonth),
    (e) => convert(e.amount, e.currency),
  );
  const thenTotal = sumBy(
    expenses.filter((e) => monthKey(e.date) === lastMonth),
    (e) => convert(e.amount, e.currency),
  );
  if (thenTotal > 0 && nowTotal > 0) {
    const delta = ((nowTotal - thenTotal) / thenTotal) * 100;
    if (Math.abs(delta) >= 15) {
      out.push({
        id: 'trend',
        tone: delta > 0 ? 'blush' : 'mint',
        headline: `${monthLabel(thisMonth)} is ${Math.abs(Math.round(delta))}% ${delta > 0 ? 'up on' : 'down on'} ${monthLabel(lastMonth)}`,
        detail: `${fmtRate(nowTotal, currency)} so far vs ${fmtRate(thenTotal, currency)}`,
      });
    }
  }

  return out;
}

/** Compact money for insight copy — the panels are narrow. */
function fmtRate(value, currency = 'INR') {
  const n = Math.round(value);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      notation: n >= 100000 ? 'compact' : 'standard',
    }).format(value);
  } catch {
    return `${currency} ${n}`;
  }
}

/* ---------------------------------------------------------------- labels */

export const FREQUENCY_LABEL = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Every 3 months',
  yearly: 'Yearly',
};

export const FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: '3 months' },
  { value: 'yearly', label: 'Yearly' },
];

export const REQUEST_TYPE = {
  add_bill: { label: 'Add a bill', verb: 'add' },
  confirm_expense: { label: 'Confirm a bill', verb: 'confirm' },
  settle_up: { label: 'Settle up', verb: 'settle' },
};

export const REQUEST_STATUS = {
  open: { label: 'Waiting', tone: 'warn' },
  accepted: { label: 'On it', tone: 'info' },
  done: { label: 'Done', tone: 'pos' },
  declined: { label: 'Passed', tone: 'neutral' },
  dismissed: { label: 'Withdrawn', tone: 'neutral' },
};

export const PLACE_KINDS = [
  { value: 'restaurant', label: 'Restaurant', emoji: '🍽️', category: 'food' },
  { value: 'cafe', label: 'Café', emoji: '☕', category: 'cafe' },
  { value: 'grocery', label: 'Grocery', emoji: '🛒', category: 'groceries' },
  { value: 'landlord', label: 'Landlord', emoji: '🏠', category: 'rent' },
  { value: 'transport', label: 'Transport', emoji: '🚕', category: 'transport' },
  { value: 'shop', label: 'Shop', emoji: '🛍️', category: 'shopping' },
  { value: 'utility', label: 'Utility', emoji: '💡', category: 'utilities' },
  { value: 'other', label: 'Other', emoji: '📍', category: 'other' },
];

export const placeKind = (value) =>
  PLACE_KINDS.find((k) => k.value === value) || PLACE_KINDS[PLACE_KINDS.length - 1];

/** How soon a recurring bill is due, in words. */
export function dueLabel(nextDate) {
  const days = Math.round((new Date(nextDate) - Date.now()) / DAY);
  if (days < -1) return `${Math.abs(days)} days overdue`;
  if (days <= 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days <= 7) return `In ${days} days`;
  return new Date(nextDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
