const { Expense, RecurringExpense } = require('../models');
const { round2, allocate, formatMoney } = require('./money');
const { notify, logActivity } = require('./feed');
const { emitSync } = require('../realtime');

/**
 * Turning a recurring bill into a real expense.
 *
 * The schedule rows on their own were only a list of intentions — rent that
 * "recurs monthly" but never appeared on anyone's balance. This is the part
 * that actually posts them.
 *
 * There is no cron. The check runs when a member opens the group, which is
 * the only moment the answer matters and costs one indexed query on a page
 * that is already loading. The trade-off is that a bill posts on first sight
 * rather than at midnight — for a flat-share splitting rent that is the same
 * thing, and it means the feature works on a free dyno that sleeps.
 */

/** Post at most this many missed occurrences in one pass. */
const MAX_CATCHUP = 6;

/**
 * Occurrences older than this are skipped rather than posted.
 *
 * Someone coming back after four months should not have sixteen weeks of
 * back-dated Wi-Fi land on their balance at once. The schedule catches up
 * silently to the current cycle instead.
 */
const STALE_DAYS = 75;
const DAY = 86400000;

const MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };

const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

/**
 * The next occurrence after `from`.
 *
 * Two things make this fiddly, and both bite on real bills:
 *
 * Rolling the month first overflows. `Jan 31` with `setMonth(+1)` is `Feb 31`,
 * which JS silently reads as `Mar 3` — a rent due on the 31st would skip
 * February altogether. Moving to the 1st before stepping makes the month
 * arithmetic exact, and the day is put back afterwards.
 *
 * The day is put back from the *original* anchor, not from wherever the last
 * occurrence landed. Clamping `Jan 31` to `Feb 28` and then stepping from
 * that would give `Mar 28`, and the bill would walk backwards down the
 * calendar one February at a time until it hit the 28th forever.
 */
function advance(from, frequency, anchorDay) {
  const next = new Date(from);

  if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7);
    return next;
  }

  const day = anchorDay || next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + (MONTHS[frequency] || 1));
  next.setDate(Math.min(day, daysInMonth(next.getFullYear(), next.getMonth())));
  return next;
}

/** Who this bill is actually split between, given who is still in the group. */
function participantsFor(recurring, group) {
  const members = group.members.map(String);
  const wanted = (recurring.splitWith || []).map(String).filter((id) => members.includes(id));
  /* Somebody left and took the split with them — fall back to the whole group
     rather than posting a bill nobody is on. */
  return wanted.length ? wanted : members;
}

/** The payer, or the group's creator if the original payer has left. */
function payerFor(recurring, group) {
  const members = group.members.map(String);
  const wanted = String(recurring.payer || recurring.createdBy || '');
  if (members.includes(wanted)) return wanted;
  return members.includes(String(group.createdBy)) ? String(group.createdBy) : members[0];
}

/**
 * Post one occurrence, claiming it first.
 *
 * The claim is the whole point of the odd ordering here. Three flatmates
 * opening the group in the same second would otherwise each see the same due
 * row and each post the rent. `findOneAndUpdate` filtered on the exact
 * `nextDate` we read is a compare-and-swap: only the first caller matches, the
 * others get null and move on.
 *
 * If the expense insert then fails, the claim is rolled back so the bill is
 * retried next time rather than silently skipped.
 */
async function postOne(recurring, group, dueDate) {
  const claimed = await RecurringExpense.findOneAndUpdate(
    { _id: recurring._id, nextDate: recurring.nextDate },
    {
      $set: {
        nextDate: advance(dueDate, recurring.frequency, recurring.anchorDay),
        lastPostedAt: new Date(),
      },
      $inc: { postedCount: 1 },
    },
    { new: true },
  );
  if (!claimed) return null;

  const amount = round2(recurring.amount);
  if (!(amount > 0)) return claimed;

  const splitIds = participantsFor(recurring, group);
  const payer = payerFor(recurring, group);
  const parts = allocate(amount, splitIds.map(() => 1));

  try {
    const expense = await Expense.create({
      group: group._id,
      description: recurring.title,
      amount,
      currency: recurring.currency,
      category: recurring.category,
      paidBy: [{ user: payer, amount }],
      splits: splitIds.map((user, i) => ({ user, amount: parts[i] })),
      splitMode: 'equal',
      date: dueDate,
      notes: 'Added automatically from a recurring bill',
      createdBy: recurring.createdBy || payer,
      participants: [...new Set([payer, ...splitIds])],
      recurring: recurring._id,
    });

    const audience = [...new Set([payer, ...splitIds])];
    await notify({
      recipients: audience,
      actor: payer,
      type: 'recurring_posted',
      title: `${recurring.title} was added automatically`,
      body: `${formatMoney(amount, recurring.currency)} split ${splitIds.length} ways in ${group.name}`,
      entityType: 'group',
      entityId: String(group._id),
    });
    await logActivity({
      audience,
      actor: payer,
      type: 'expense_added',
      text: `**${recurring.title}** posted automatically in **${group.name}**`,
      entityType: 'group',
      entityId: String(group._id),
    });

    return { recurring: claimed, expense };
  } catch (err) {
    /* Put the schedule back where it was so the next load retries. */
    await RecurringExpense.updateOne(
      { _id: recurring._id },
      {
        $set: { nextDate: recurring.nextDate, lastPostedAt: recurring.lastPostedAt || null },
        $inc: { postedCount: -1 },
      },
    );
    console.error('[recurring] post failed:', err.message);
    return null;
  }
}

/**
 * Post everything due in this group and return what was created.
 *
 * Never throws: this runs inside a page load, and a bad schedule row must not
 * be able to stop the group from opening.
 */
async function runDueRecurring(group, now = new Date()) {
  const posted = [];
  try {
    const due = await RecurringExpense.find({
      group: group._id,
      active: true,
      autoPost: true,
      nextDate: { $lte: now },
    });

    for (const row of due) {
      let guard = 0;
      /* Re-read through `row` each turn: postOne mutates nextDate on the
         server, and the loop needs the fresh value to know if it is still
         behind. */
      let current = row;
      while (current && new Date(current.nextDate) <= now && guard < MAX_CATCHUP) {
        guard += 1;
        const dueDate = new Date(current.nextDate);
        const stale = now - dueDate > STALE_DAYS * DAY;

        if (stale) {
          /* Skip the occurrence but keep walking the schedule forward, so a
             long-dormant group lands on the current cycle instead of dumping
             a year of history onto everyone's balance. */
          current = await RecurringExpense.findOneAndUpdate(
            { _id: current._id, nextDate: current.nextDate },
            { $set: { nextDate: advance(dueDate, current.frequency, current.anchorDay) } },
            { new: true },
          );
          continue;
        }

        const result = await postOne(current, group, dueDate);
        if (!result) break; // claimed by someone else, or the insert failed
        if (result.expense) posted.push(result.expense);
        current = result.recurring || result;
      }
    }

    if (posted.length) emitSync(group.members.map(String), ['expenses', 'activity', 'notifications']);
  } catch (err) {
    console.error('[recurring] sweep failed:', err.message);
  }
  return posted;
}

module.exports = { runDueRecurring, advance, postOne, MAX_CATCHUP, STALE_DAYS };
