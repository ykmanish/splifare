const express = require('express');
const { User, Reminder } = require('../models');
const { requireAuth, asyncHandler } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const { canTransactWith } = require('../utils/people');
const { balanceBetween } = require('../utils/ledger');
const { formatMoney } = require('../utils/money');
const { notify, logActivity } = require('../utils/feed');
const { emitSync } = require('../realtime');

const router = express.Router();
router.use(requireAuth);

/**
 * How long before the same person can be nudged again.
 *
 * A day. Long enough that a reminder cannot become a stream, short enough
 * that a genuine "any chance you could sort this out" the next morning still
 * works. There is no second tier and no escalation: this is a tap on the
 * shoulder, and the app should not offer a way to make it more than that.
 */
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Nothing under this is worth a notification. */
const MIN_AMOUNT = 1;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Who this account has nudged recently, so the UI can show a spent
    // affordance rather than offering a button that will be refused.
    const since = new Date(Date.now() - COOLDOWN_MS);
    const rows = await Reminder.find({ from: req.userId, createdAt: { $gte: since } })
      .select('to createdAt')
      .sort({ createdAt: -1 });

    res.json({
      cooldownHours: COOLDOWN_MS / (60 * 60 * 1000),
      recent: rows.map((r) => ({ userId: String(r.to), at: r.createdAt })),
    });
  }),
);

/**
 * Nudge someone about what they owe.
 *
 * The server works the balance out itself rather than taking the sender's
 * word for it. Two reasons, and the second is the real one: a client could
 * otherwise put any figure it liked into someone else's notifications, and
 * even honestly, the sender's screen is not evidence about another person's
 * money.
 *
 * The amount quoted is the sender's view, converted into the sender's
 * currency. The recipient's own screen recomputes it in theirs, so the two
 * can differ by a rounding step or a day's exchange rate — which is why the
 * gate is the *direction* of the debt, never the figure. A sign survives
 * rounding; a number does not.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const targetId = String(req.body?.userId || '').trim();
    if (!targetId) throw new HttpError(400, 'Say who to remind');
    if (targetId === req.userId) throw new HttpError(400, 'That is you');

    const note = String(req.body?.note || '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140);

    const target = await User.findById(targetId).select('name deletedAt');
    if (!target || target.deletedAt) throw new HttpError(404, 'That person is not here any more');

    // The same gate as recording a payment: friends, group members, or anyone
    // an existing expense already ties you to.
    if (!(await canTransactWith(req.user, targetId))) {
      throw new HttpError(403, 'You can only remind people you share expenses with');
    }

    const last = await Reminder.findOne({ from: req.userId, to: targetId }).sort({
      createdAt: -1,
    });
    if (last && Date.now() - last.createdAt.getTime() < COOLDOWN_MS) {
      const hours = Math.max(
        1,
        Math.ceil((COOLDOWN_MS - (Date.now() - last.createdAt.getTime())) / (60 * 60 * 1000)),
      );
      throw new HttpError(
        429,
        `You reminded ${target.name.split(' ')[0]} already — you can again in ${hours} ${hours === 1 ? 'hour' : 'hours'}`,
      );
    }

    const currency = req.user.currency || 'INR';
    const balance = await balanceBetween(req.userId, targetId, currency);

    if (balance <= 0) {
      throw new HttpError(
        409,
        balance < 0
          ? `You owe ${target.name.split(' ')[0]}, not the other way round`
          : `${target.name.split(' ')[0]} does not owe you anything right now`,
      );
    }
    if (balance < MIN_AMOUNT) {
      throw new HttpError(409, 'That balance is too small to be worth a reminder');
    }

    // Written before the notification: if the fan-out fails halfway, the
    // cooldown has still started, and a nudge that quietly sends twice is
    // worse than one that quietly sends none.
    await Reminder.create({
      from: req.userId,
      to: targetId,
      amount: balance,
      currency,
      note,
    });

    await notify({
      recipients: [targetId],
      actor: req.userId,
      type: 'reminder',
      title: `${req.user.name} sent you a reminder`,
      body: note
        ? `${formatMoney(balance, currency)} — “${note}”`
        : `You have ${formatMoney(balance, currency)} outstanding with them.`,
      entityType: 'friend',
      entityId: req.userId,
    });

    /*
     * Deliberately not in the shared activity feed. A reminder is one message
     * between two people; putting it in a feed a whole group reads turns a
     * private nudge into a public one, which is the opposite of the point.
     */
    await logActivity({
      audience: [req.userId],
      actor: req.userId,
      type: 'reminder',
      text: `You reminded **${target.name}**`,
      amount: balance,
      currency,
      entityType: 'friend',
      entityId: targetId,
    });

    emitSync([targetId], ['notifications']);

    res.status(201).json({ ok: true, amount: balance, currency });
  }),
);

module.exports = router;
