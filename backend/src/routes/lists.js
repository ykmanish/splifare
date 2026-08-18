const express = require('express');
const { ShoppingList, Expense, Group } = require('../models');
const { requireAuth, asyncHandler } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const { splitsFromItems } = require('../utils/money');
const { notify, logActivity } = require('../utils/feed');
const { assertReachable } = require('../utils/people');

const router = express.Router();
router.use(requireAuth);

async function memberList(id, userId) {
  const list = await ShoppingList.findById(id);
  if (!list) throw new HttpError(404, 'List not found');
  if (!list.members.some((m) => String(m) === String(userId))) {
    throw new HttpError(403, 'You are not on this list');
  }
  return list;
}

/* ------------------------------------------------------------ lists */

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = { members: req.userId };
    if (req.query.group) query.group = req.query.group;
    if (req.query.status) query.status = req.query.status;

    const lists = await ShoppingList.find(query).sort({ updatedAt: -1 });
    res.json({ lists: lists.map((l) => l.toJSON()) });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const list = await memberList(req.params.id, req.userId);
    res.json({ list: list.toJSON() });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (name.length < 2) throw new HttpError(400, 'Give the list a name');

    const members = [...new Set([req.userId, ...(req.body.memberIds || []).map(String)])];
    await assertReachable(req.user, members, 'a list');

    const list = await ShoppingList.create({
      name,
      emoji: req.body.emoji || '🛒',
      group: req.body.groupId || null,
      members,
      store: String(req.body.store || '').trim(),
      budget: req.body.budget != null ? Number(req.body.budget) : null,
      createdBy: req.userId,
      items: [],
    });

    await logActivity({
      audience: members,
      actor: req.userId,
      type: 'list_created',
      text: `**${req.user.name}** created the list **${list.name}**`,
      entityType: 'list',
      entityId: String(list._id),
    });

    res.status(201).json({ list: list.toJSON() });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const list = await memberList(req.params.id, req.userId);

    for (const key of ['name', 'emoji', 'store', 'status']) {
      if (req.body[key] !== undefined) list[key] = req.body[key];
    }
    if (req.body.budget !== undefined) {
      list.budget = req.body.budget == null ? null : Number(req.body.budget);
    }
    if (req.body.groupId !== undefined) list.group = req.body.groupId || null;
    if (Array.isArray(req.body.memberIds)) {
      const next = [...new Set([req.userId, ...req.body.memberIds.map(String)])];
      // Only newcomers are gated — people already sharing the list stay put.
      const already = new Set(list.members.map(String));
      await assertReachable(req.user, next.filter((id) => !already.has(id)), 'a list');
      list.members = next;
    }

    await list.save();

    if (req.body.status === 'shopping') {
      await notify({
        recipients: list.members.map(String),
        actor: req.userId,
        type: 'list_shared',
        title: `${req.user.name} started shopping`,
        body: `“${list.name}”${list.store ? ` at ${list.store}` : ''}`,
        entityType: 'list',
        entityId: String(list._id),
      });
    }

    res.json({ list: list.toJSON() });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const list = await memberList(req.params.id, req.userId);
    await list.deleteOne();
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------ items */

router.post(
  '/:id/items',
  asyncHandler(async (req, res) => {
    const list = await memberList(req.params.id, req.userId);
    const name = String(req.body.name || '').trim();
    if (!name) throw new HttpError(400, 'Give the item a name');

    list.items.push({
      name,
      qty: Number(req.body.qty) || 1,
      unit: req.body.unit || 'pcs',
      aisle: req.body.aisle || 'pantry',
      note: String(req.body.note || '').trim(),
      addedBy: req.userId,
      checked: false,
      price: null,
      splitWith: (req.body.splitWith || list.members).map(String),
    });

    await list.save();
    res.status(201).json({ list: list.toJSON() });
  }),
);

router.patch(
  '/:id/items/:itemId',
  asyncHandler(async (req, res) => {
    const list = await memberList(req.params.id, req.userId);
    const item = list.items.id(req.params.itemId);
    if (!item) throw new HttpError(404, 'Item not found');

    for (const key of ['name', 'qty', 'unit', 'aisle', 'note', 'checked']) {
      if (req.body[key] !== undefined) item[key] = req.body[key];
    }
    if (req.body.price !== undefined) {
      item.price = req.body.price === null || req.body.price === '' ? null : Number(req.body.price);
    }
    if (Array.isArray(req.body.splitWith) && req.body.splitWith.length) {
      item.splitWith = req.body.splitWith.map(String);
    }

    await list.save();
    res.json({ list: list.toJSON() });
  }),
);

router.delete(
  '/:id/items/:itemId',
  asyncHandler(async (req, res) => {
    const list = await memberList(req.params.id, req.userId);
    const item = list.items.id(req.params.itemId);
    if (!item) throw new HttpError(404, 'Item not found');
    item.deleteOne();
    await list.save();
    res.json({ list: list.toJSON() });
  }),
);

/* --------------------------------------------------------- checkout */

/**
 * Turn the ticked, priced items into one expense — each item divided
 * only among the people it was assigned to.
 */
router.post(
  '/:id/checkout',
  asyncHandler(async (req, res) => {
    const list = await memberList(req.params.id, req.userId);
    if (list.status === 'completed') throw new HttpError(400, 'This list is already checked out');

    const priced = list.items.filter((i) => i.checked && Number(i.price) > 0);
    if (!priced.length) throw new HttpError(400, 'Tick some items and add prices first');

    const { total, splits } = splitsFromItems(priced, list.members.map(String));
    if (!(total > 0) || !splits.length) throw new HttpError(400, 'Nothing to charge');

    const payer = String(req.body.payer || req.userId);
    const groupId = req.body.groupId !== undefined ? req.body.groupId : list.group;

    if (groupId) {
      const group = await Group.findById(groupId);
      if (!group) throw new HttpError(404, 'Group not found');
    }

    const expense = await Expense.create({
      group: groupId || null,
      description: String(req.body.description || list.name).trim(),
      amount: total,
      currency: req.user.currency,
      category: req.body.category || 'groceries',
      paidBy: [{ user: payer, amount: total }],
      splits,
      splitMode: 'items',
      date: new Date(),
      notes: `From shopping list · ${priced.length} items${list.store ? ` · ${list.store}` : ''}`,
      createdBy: req.userId,
      list: list._id,
    });

    list.status = 'completed';
    list.completedAt = new Date();
    list.expense = expense._id;
    await list.save();

    const audience = expense.participants.map(String);
    await notify({
      recipients: audience,
      actor: req.userId,
      type: 'list_completed',
      title: `${req.user.name} checked out “${list.name}”`,
      body: `${total} split ${splits.length} ways.`,
      entityType: 'expense',
      entityId: String(expense._id),
    });
    await logActivity({
      audience,
      actor: req.userId,
      type: 'list_completed',
      text: `**${req.user.name}** turned **${list.name}** into an expense`,
      amount: total,
      currency: expense.currency,
      entityType: 'list',
      entityId: String(list._id),
    });

    res.status(201).json({ list: list.toJSON(), expense: expense.toJSON() });
  }),
);

module.exports = router;
