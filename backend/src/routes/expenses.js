const express = require('express');
const { Expense, Group } = require('../models');
const { requireAuth, asyncHandler } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const { round2, splitsBalance } = require('../utils/money');
const { notify, logActivity } = require('../utils/feed');

const router = express.Router();
router.use(requireAuth);

/** Normalise {userId, amount} | {user, amount} into model shape. */
const toShares = (rows = []) =>
  rows
    .map((r) => ({ user: String(r.user || r.userId), amount: round2(r.amount) }))
    .filter((r) => r.user && r.user !== 'undefined');

function validate(body) {
  const amount = round2(body.amount);
  if (!(amount > 0)) throw new HttpError(400, 'Enter an amount above zero');

  const description = String(body.description || '').trim();
  if (!description) throw new HttpError(400, 'Give the expense a name');

  const paidBy = toShares(body.paidBy);
  const splits = toShares(body.splits);
  if (!paidBy.length) throw new HttpError(400, 'Say who paid');
  if (!splits.length) throw new HttpError(400, 'Pick at least one person to split with');

  if (!splitsBalance(amount, paidBy)) {
    throw new HttpError(422, 'Payments do not add up to the total');
  }
  if (!splitsBalance(amount, splits)) {
    throw new HttpError(422, 'The split does not add up to the total');
  }

  return { amount, description, paidBy, splits };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = { participants: req.userId };
    if (req.query.group) query.group = req.query.group;
    if (req.query.with) query.participants = { $all: [req.userId, req.query.with] };

    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const expenses = await Expense.find(query).sort({ date: -1, createdAt: -1 }).limit(limit);

    res.json({ expenses: expenses.map((e) => e.toJSON()) });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { amount, description, paidBy, splits } = validate(req.body);

    let group = null;
    if (req.body.groupId) {
      group = await Group.findById(req.body.groupId);
      if (!group) throw new HttpError(404, 'Group not found');
      if (!group.members.some((m) => String(m) === req.userId)) {
        throw new HttpError(403, 'You are not in that group');
      }
    }

    const expense = await Expense.create({
      group: group?._id || null,
      description,
      amount,
      currency: req.body.currency || req.user.currency,
      category: req.body.category || 'other',
      paidBy,
      splits,
      splitMode: req.body.splitMode || 'equal',
      date: req.body.date ? new Date(req.body.date) : new Date(),
      notes: String(req.body.notes || '').trim(),
      createdBy: req.userId,
      list: req.body.listId || null,
    });

    const audience = expense.participants.map(String);
    await notify({
      recipients: audience,
      actor: req.userId,
      type: 'expense_added',
      title: `${req.user.name} added an expense`,
      body: `“${description}” · ${amount}${group ? ` in ${group.name}` : ''}`,
      entityType: group ? 'group' : 'expense',
      entityId: String(group?._id || expense._id),
    });
    await logActivity({
      audience,
      actor: req.userId,
      type: 'expense_added',
      text: group
        ? `**${req.user.name}** added **${description}** in **${group.name}**`
        : `**${req.user.name}** added **${description}**`,
      amount,
      entityType: group ? 'group' : 'expense',
      entityId: String(group?._id || expense._id),
    });

    res.status(201).json({ expense: expense.toJSON() });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const expense = await Expense.findById(req.params.id);
    if (!expense) throw new HttpError(404, 'Expense not found');
    if (!expense.participants.some((p) => String(p) === req.userId)) {
      throw new HttpError(403, 'You are not part of this expense');
    }

    const { amount, description, paidBy, splits } = validate({
      amount: req.body.amount ?? expense.amount,
      description: req.body.description ?? expense.description,
      paidBy: req.body.paidBy ?? expense.paidBy,
      splits: req.body.splits ?? expense.splits,
    });

    Object.assign(expense, {
      amount,
      description,
      paidBy,
      splits,
      group: req.body.groupId !== undefined ? req.body.groupId || null : expense.group,
      category: req.body.category ?? expense.category,
      splitMode: req.body.splitMode ?? expense.splitMode,
      date: req.body.date ? new Date(req.body.date) : expense.date,
      notes: req.body.notes !== undefined ? String(req.body.notes).trim() : expense.notes,
    });

    await expense.save();

    await notify({
      recipients: expense.participants.map(String),
      actor: req.userId,
      type: 'expense_updated',
      title: `${req.user.name} edited an expense`,
      body: `“${description}” is now ${amount}`,
      entityType: 'expense',
      entityId: String(expense._id),
    });

    res.json({ expense: expense.toJSON() });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const expense = await Expense.findById(req.params.id);
    if (!expense) throw new HttpError(404, 'Expense not found');
    if (!expense.participants.some((p) => String(p) === req.userId)) {
      throw new HttpError(403, 'You are not part of this expense');
    }

    const audience = expense.participants.map(String);
    const { description, amount } = expense;
    await expense.deleteOne();

    await logActivity({
      audience,
      actor: req.userId,
      type: 'expense_deleted',
      text: `**${req.user.name}** deleted **${description}**`,
      amount,
      entityType: 'expense',
      entityId: String(req.params.id),
    });

    res.json({ ok: true });
  }),
);

module.exports = router;
