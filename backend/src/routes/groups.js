const express = require('express');
const { Group, Expense, ShoppingList, User } = require('../models');
const { requireAuth, asyncHandler } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const { notify, logActivity } = require('../utils/feed');

const router = express.Router();
router.use(requireAuth);

/** Loads a group and confirms the caller is a member. */
async function memberGroup(id, userId) {
  const group = await Group.findById(id);
  if (!group) throw new HttpError(404, 'Group not found');
  if (!group.members.some((m) => String(m) === String(userId))) {
    throw new HttpError(403, 'You are not in this group');
  }
  return group;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const groups = await Group.find({ members: req.userId }).sort({ updatedAt: -1 });
    res.json({ groups: groups.map((g) => g.toJSON()) });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    res.json({ group: group.toJSON() });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (name.length < 2) throw new HttpError(400, 'Give the group a name');

    const members = [
      ...new Set([req.userId, ...(req.body.memberIds || []).map(String)]),
    ];

    const group = await Group.create({
      name,
      emoji: req.body.emoji || '🏠',
      type: req.body.type || 'other',
      members,
      createdBy: req.userId,
    });

    await notify({
      recipients: members,
      actor: req.userId,
      type: 'group_invite',
      title: `${req.user.name} added you to ${group.name}`,
      body: `${members.length} people can add expenses here.`,
      entityType: 'group',
      entityId: String(group._id),
    });
    await logActivity({
      audience: members,
      actor: req.userId,
      type: 'group_created',
      text: `**${req.user.name}** created the group **${group.name}**`,
      entityType: 'group',
      entityId: String(group._id),
    });

    res.status(201).json({ group: group.toJSON() });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);

    for (const key of ['name', 'emoji', 'type']) {
      if (req.body[key] !== undefined) group[key] = req.body[key];
    }

    if (Array.isArray(req.body.memberIds)) {
      const next = [...new Set([...req.body.memberIds.map(String), String(group.createdBy)])];
      if (!next.length) throw new HttpError(400, 'A group needs at least one member');

      const added = next.filter((id) => !group.members.some((m) => String(m) === id));
      group.members = next;

      if (added.length) {
        await notify({
          recipients: added,
          actor: req.userId,
          type: 'group_invite',
          title: `${req.user.name} added you to ${group.name}`,
          body: 'You can now split expenses in this group.',
          entityType: 'group',
          entityId: String(group._id),
        });
      }
    }

    await group.save();
    res.json({ group: group.toJSON() });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);

    await Expense.deleteMany({ group: group._id });
    await ShoppingList.updateMany({ group: group._id }, { $set: { group: null } });
    await group.deleteOne();

    res.json({ ok: true });
  }),
);

/** Convenience: the people in a group, for pickers. */
router.get(
  '/:id/members',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    const people = await User.find({ _id: { $in: group.members } }).sort({ name: 1 });
    res.json({ people: people.map((p) => p.toJSON()) });
  }),
);

module.exports = router;
module.exports.memberGroup = memberGroup;
