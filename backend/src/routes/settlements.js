const express = require('express');
const { Settlement, User } = require('../models');
const { requireAuth, asyncHandler } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const { round2 } = require('../utils/money');
const { notify, logActivity } = require('../utils/feed');
const { canTransactWith } = require('../utils/people');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = { $or: [{ from: req.userId }, { to: req.userId }] };
    if (req.query.with) {
      query.$or = [
        { from: req.userId, to: req.query.with },
        { from: req.query.with, to: req.userId },
      ];
    }
    if (req.query.group) query.group = req.query.group;

    const settlements = await Settlement.find(query).sort({ date: -1 }).limit(200);
    res.json({ settlements: settlements.map((s) => s.toJSON()) });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const amount = round2(req.body.amount);
    if (!(amount > 0)) throw new HttpError(400, 'Enter an amount above zero');

    const from = String(req.body.fromUserId || req.body.from || '');
    const to = String(req.body.toUserId || req.body.to || '');
    if (!from || !to) throw new HttpError(400, 'Say who paid whom');
    if (from === to) throw new HttpError(400, 'Those are the same person');
    if (from !== req.userId && to !== req.userId) {
      throw new HttpError(403, 'You can only record payments you are part of');
    }

    const otherId = from === req.userId ? to : from;
    if (!(await canTransactWith(req.user, otherId))) {
      throw new HttpError(403, 'You can only record payments with friends and group members');
    }

    const other = await User.findById(otherId);
    if (!other) throw new HttpError(404, 'That person no longer exists');

    const settlement = await Settlement.create({
      from,
      to,
      amount,
      currency: String(req.body.currency || req.user.currency || 'INR').toUpperCase(),
      group: req.body.groupId || null,
      note: String(req.body.note || '').trim(),
      date: req.body.date ? new Date(req.body.date) : new Date(),
      createdBy: req.userId,
    });

    const iPaid = from === req.userId;
    await notify({
      recipients: [from, to],
      actor: req.userId,
      type: 'settle',
      title: iPaid
        ? `${req.user.name} paid you ${amount}`
        : `${req.user.name} recorded your payment`,
      body: settlement.note || 'Balance updated.',
      entityType: 'friend',
      entityId: req.userId,
    });
    await logActivity({
      audience: [from, to],
      actor: req.userId,
      type: 'settle',
      text: iPaid
        ? `**${req.user.name}** paid **${other.name}**`
        : `**${other.name}** paid **${req.user.name}**`,
      amount,
      entityType: 'friend',
      entityId: String(other._id),
    });

    res.status(201).json({ settlement: settlement.toJSON() });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const s = await Settlement.findById(req.params.id);
    if (!s) throw new HttpError(404, 'Payment not found');
    if (String(s.from) !== req.userId && String(s.to) !== req.userId) {
      throw new HttpError(403, 'Not your payment to remove');
    }
    await s.deleteOne();
    res.json({ ok: true });
  }),
);

module.exports = router;
