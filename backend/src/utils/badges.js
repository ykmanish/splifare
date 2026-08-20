const { round2 } = require('./money');

/**
 * Badges, evaluated from data the group already has.
 *
 * Nothing here is awarded by a write elsewhere in the app — a badge is a
 * *reading* of the group's history, recomputed on every load. That is the
 * whole reason the catalogue is a list of pure functions: a criterion can be
 * changed, or a badge added, without a migration and without a backfill job,
 * because there is no stored "earned" flag to go stale.
 *
 * The one thing that *is* stored is `earnedAt` (see the BadgeAward model), and
 * only so the app can tell "earned" from "earned just now" and play the unlock
 * once. If that row is lost the badge stays earned; only the party is missed.
 *
 * Every badge reports progress, not just a boolean. A shelf of grey squares
 * reading "not yet" is a dead end; "3 of 5 receipts" is an instruction.
 */

const EPS = 0.01;
const DAY = 86400000;

/** Net position per member: positive means the group owes them. */
function netByMember(expenses, settlements, convert) {
  const net = {};
  const add = (id, amount) => {
    const key = String(id);
    net[key] = round2((net[key] || 0) + amount);
  };

  for (const e of expenses) {
    for (const p of e.paidBy || []) add(p.user, convert(p.amount, e.currency));
    for (const s of e.splits || []) add(s.user, -convert(s.amount, e.currency));
  }
  /* A settlement moves real money, so it cancels the debt it paid down. */
  for (const s of settlements) {
    add(s.from, convert(s.amount, s.currency));
    add(s.to, -convert(s.amount, s.currency));
  }
  return net;
}

/** How many distinct ISO weeks the group logged something in. */
function activeWeeks(expenses) {
  const weeks = new Set();
  for (const e of expenses) {
    const d = new Date(e.date);
    if (Number.isNaN(d.getTime())) continue;
    /* Shift to the Thursday of the same week — the ISO rule — so a Sunday and
       the Monday after it never collapse into one bucket. */
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const week = Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / DAY + 1) / 7);
    weeks.add(`${t.getUTCFullYear()}-${week}`);
  }
  return weeks.size;
}

/**
 * The catalogue.
 *
 * `value` and `target` are both numbers so the shelf can draw a progress ring;
 * a yes/no badge is just target 1. `scope: 'you'` marks the badges that read
 * one member's behaviour rather than the group's.
 */
const BADGES = [
  {
    id: 'first_settlement',
    name: 'First Settlement',
    icon: 'handshake',
    tone: 'mint',
    scope: 'group',
    target: 1,
    todo: 'Record the first payment in this group',
    done: 'The first debt here got paid off',
    value: (c) => c.settlements.length,
  },
  {
    id: 'zero_dues',
    name: 'Zero Dues',
    icon: 'scale',
    tone: 'brand',
    scope: 'group',
    target: 1,
    todo: 'Get every balance in the group to zero',
    done: 'Everyone is square — nobody owes a rupee',
    value: (c) => {
      if (!c.expenses.length) return 0;
      const nets = netByMember(c.expenses, c.settlements, c.convert);
      return Object.values(nets).every((v) => Math.abs(v) < EPS) ? 1 : 0;
    },
  },
  {
    id: 'trip_treasurer',
    name: 'Trip Treasurer',
    icon: 'plane',
    tone: 'sky',
    scope: 'group',
    target: 10,
    todo: 'Log 10 expenses on a trip',
    done: 'You kept the books for a whole trip',
    /* A holiday group nobody bothered to re-type still counts: what makes
       something a trip is ten bills inside a fortnight, not the label someone
       picked on day one. */
    value: (c) => {
      if (c.group.type === 'trip') return c.expenses.length;
      const days = c.expenses
        .map((e) => new Date(e.date).getTime())
        .filter((t) => !Number.isNaN(t))
        .sort((a, b) => a - b);
      if (days.length < 10) return days.length;
      let best = 0;
      for (let i = 0; i < days.length; i += 1) {
        let j = i;
        while (j < days.length && days[j] - days[i] <= 14 * DAY) j += 1;
        best = Math.max(best, j - i);
      }
      return best;
    },
  },
  {
    id: 'receipt_master',
    name: 'Receipt Master',
    icon: 'receipt',
    tone: 'butter',
    scope: 'group',
    target: 5,
    todo: 'Add 5 itemised bills, line by line',
    done: 'Five bills split down to the last item',
    value: (c) => c.expenses.filter((e) => (e.items || []).length > 0).length,
  },
  {
    id: 'budget_boss',
    name: 'Budget Boss',
    icon: 'target',
    tone: 'grape',
    scope: 'group',
    target: 1,
    todo: 'Finish a shopping list under its budget',
    done: 'Came in under budget on a full list',
    value: (c) =>
      c.lists.filter((l) => {
        const items = l.items || [];
        if (!(l.budget > 0) || !items.length) return false;
        /* Either marked complete, or every line ticked off — a list can be
           finished in the shop without anyone pressing "complete". */
        if (l.status !== 'completed' && !items.every((i) => i.checked)) return false;
        return items.reduce((a, i) => a + (Number(i.price) || 0), 0) <= l.budget;
      }).length,
  },
  {
    id: 'chatterbox',
    name: 'Chatterbox',
    icon: 'chat',
    tone: 'blush',
    scope: 'group',
    target: 25,
    todo: 'Send 25 messages about the bills',
    done: 'This group actually talks about money',
    value: (c) => c.messageCount,
  },
  {
    id: 'memory_maker',
    name: 'Memory Maker',
    icon: 'camera',
    tone: 'peach',
    scope: 'group',
    target: 5,
    todo: 'Pin 5 photos or notes to the timeline',
    done: 'The timeline has a story, not just totals',
    value: (c) => c.memoryCount,
  },
  {
    id: 'local_guide',
    name: 'Local Guide',
    icon: 'pin',
    tone: 'mint',
    scope: 'group',
    target: 5,
    todo: 'Save 5 regular places or vendors',
    done: 'Your regular spots are one tap away',
    value: (c) => c.placeCount,
  },
  {
    id: 'steady_hand',
    name: 'Steady Hand',
    icon: 'calendar',
    tone: 'sky',
    scope: 'group',
    target: 4,
    todo: 'Log expenses in 4 different weeks',
    done: 'Four weeks running without losing track',
    value: (c) => activeWeeks(c.expenses),
  },
  {
    id: 'quick_draw',
    name: 'Quick Draw',
    icon: 'zap',
    tone: 'brand',
    scope: 'you',
    target: 1,
    todo: 'Settle a debt within a day of the bill',
    done: 'You paid up inside 24 hours',
    /* A payment that lands within a day of any bill the payer was actually on.
       The app never ties a settlement to one expense, so this is the honest
       reading of "settled fast" rather than an invented link. */
    value: (c) =>
      c.settlements
        .filter((s) => String(s.from) === c.userId)
        .some((s) =>
          c.expenses.some((e) => {
            if (!(e.splits || []).some((x) => String(x.user) === c.userId)) return false;
            const gap = new Date(s.createdAt || s.date) - new Date(e.date);
            return gap >= 0 && gap <= DAY;
          }),
        )
        ? 1
        : 0,
  },
  {
    id: 'peacekeeper',
    name: 'Peacekeeper',
    icon: 'shield',
    tone: 'grape',
    scope: 'you',
    target: 3,
    todo: 'Clear 3 split requests people sent you',
    done: 'Nobody has to chase you twice',
    value: (c) => c.requestsClosedByMe,
  },
];

/**
 * Evaluate the whole catalogue.
 *
 * `awarded` is a Map of id → earnedAt built from the BadgeAward rows, folded
 * in so the caller can spot the badges that are earned but have no row yet —
 * those are the ones to celebrate and then persist.
 */
function evaluateBadges(ctx, awarded = new Map()) {
  return BADGES.map((b) => {
    let value = 0;
    try {
      value = Number(b.value(ctx)) || 0;
    } catch {
      /* A badge that cannot be read is simply not earned. One broken
         criterion must not take the whole shelf down with it. */
      value = 0;
    }
    const earned = value >= b.target;
    return {
      id: b.id,
      name: b.name,
      icon: b.icon,
      tone: b.tone,
      scope: b.scope,
      target: b.target,
      value: Math.max(0, Math.min(value, b.target)),
      earned,
      blurb: earned ? b.done : b.todo,
      earnedAt: earned ? awarded.get(b.id) || null : null,
    };
  });
}

module.exports = { BADGES, evaluateBadges, netByMember, activeWeeks };
