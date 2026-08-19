const express = require('express');
const { Group, Expense, ShoppingList, User } = require('../models');
const { requireAuth, asyncHandler } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const { notify, logActivity } = require('../utils/feed');
const { uniqueCode, normaliseCode } = require('../utils/codes');
const { publicUser, friendUser } = require('../utils/people');
const { emitSync } = require('../realtime');

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

/**
 * Groups made before room codes existed have none. Handing one out on first
 * read means old groups become joinable without a migration step.
 */
async function withCode(group) {
  if (!group.code) {
    group.code = await uniqueCode(Group, { length: 6 });
    await group.save();
  }
  return group;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const groups = await Group.find({ members: req.userId }).sort({ updatedAt: -1 });
    const withCodes = await Promise.all(groups.map(withCode));
    res.json({ groups: withCodes.map((g) => g.toJSON()) });
  }),
);

/* ---------------------------------------------------------- room codes */

/**
 * Peek at a code before committing to it, so the join screen can show what
 * you are about to walk into. Deliberately thin: a name, an icon and a head
 * count — never the member list, since the caller is still an outsider.
 */
router.get(
  '/code/:code',
  asyncHandler(async (req, res) => {
    const code = normaliseCode(req.params.code);
    if (code.length < 4) throw new HttpError(400, 'That code looks too short');

    const group = await Group.findOne({ code });
    if (!group) throw new HttpError(404, 'No group uses that code');

    res.json({
      group: {
        id: String(group._id),
        name: group.name,
        emoji: group.emoji,
        type: group.type,
        code: group.code,
        memberCount: group.members.length,
        isMember: group.members.some((m) => String(m) === req.userId),
      },
    });
  }),
);

/** Join with a room code. Idempotent — joining twice is a no-op, not an error. */
router.post(
  '/join',
  asyncHandler(async (req, res) => {
    const code = normaliseCode(req.body.code);
    if (!code) throw new HttpError(400, 'Enter the room code');

    const group = await Group.findOne({ code });
    if (!group) throw new HttpError(404, 'No group uses that code');

    if (group.members.some((m) => String(m) === req.userId)) {
      return res.json({ group: group.toJSON(), alreadyIn: true });
    }

    const existing = group.members.map(String);
    group.members.push(req.user._id);
    await group.save();

    await notify({
      recipients: existing,
      actor: req.userId,
      type: 'group_joined',
      title: `${req.user.name} joined ${group.name}`,
      body: `${group.members.length} people can add expenses here.`,
      entityType: 'group',
      entityId: String(group._id),
    });
    await logActivity({
      audience: group.members.map(String),
      actor: req.userId,
      type: 'group_joined',
      text: `**${req.user.name}** joined **${group.name}**`,
      entityType: 'group',
      entityId: String(group._id),
    });

    // Joining changes the member list and makes co-members visible.
    emitSync(group.members.map(String), ['groups', 'people']);

    res.status(201).json({ group: group.toJSON() });
  }),
);

/** Retire a leaked code and mint a fresh one. Members only. */
router.post(
  '/:id/code',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    group.code = await uniqueCode(Group, { length: 6 });
    await group.save();
    emitSync(group.members.map(String), ['groups']);
    res.json({ group: group.toJSON() });
  }),
);

/* -------------------------------------------------------------- groups */

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const group = await withCode(await memberGroup(req.params.id, req.userId));
    res.json({ group: group.toJSON() });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (name.length < 2) throw new HttpError(400, 'Give the group a name');

    // Only confirmed friends can be dropped straight in; everyone else
    // arrives through the room code.
    const friendIds = new Set(req.user.friends.map(String));
    const invited = [...new Set((req.body.memberIds || []).map(String))].filter(
      (id) => id !== req.userId,
    );
    const stranger = invited.find((id) => !friendIds.has(id));
    if (stranger) throw new HttpError(403, 'You can only add friends to a new group');

    const members = [req.userId, ...invited];

    const group = await Group.create({
      name,
      emoji: req.body.emoji || '🏠',
      type: req.body.type || 'other',
      members,
      createdBy: req.userId,
      code: await uniqueCode(Group, { length: 6 }),
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
      const next = [...new Set([...req.body.memberIds.map(String), req.userId])];

      const current = group.members.map(String);
      const added = next.filter((id) => !current.includes(id));

      // Same rule as create: newcomers must be friends of whoever is adding
      // them. Existing members are left alone, however they first got here.
      const friendIds = new Set(req.user.friends.map(String));
      const stranger = added.find((id) => !friendIds.has(id));
      if (stranger) throw new HttpError(403, 'You can only add your own friends to a group');

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
    emitSync([...group.members.map(String), ...(req.body.memberIds || []).map(String)], [
      'groups',
      'people',
    ]);
    res.json({ group: group.toJSON() });
  }),
);

/**
 * Leave without deleting. Expenses already recorded keep the leaver in their
 * splits — the balance is real and does not vanish because someone left.
 */
router.post(
  '/:id/leave',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);

    const remaining = group.members.filter((m) => String(m) !== req.userId);
    if (!remaining.length) {
      throw new HttpError(
        409,
        'You are the last member — delete the group instead of leaving it',
      );
    }

    group.members = remaining;
    await group.save();

    await ShoppingList.updateMany(
      { group: group._id },
      { $pull: { members: req.user._id } },
    );

    await notify({
      recipients: remaining.map(String),
      actor: req.userId,
      type: 'group_left',
      title: `${req.user.name} left ${group.name}`,
      body: 'Any balance they had stays on record.',
      entityType: 'group',
      entityId: String(group._id),
    });
    await logActivity({
      audience: [...remaining.map(String), req.userId],
      actor: req.userId,
      type: 'group_left',
      text: `**${req.user.name}** left **${group.name}**`,
      entityType: 'group',
      entityId: String(group._id),
    });

    emitSync([...remaining.map(String), req.userId], ['groups', 'people', 'lists']);

    res.json({ ok: true });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);

    const audience = group.members.map(String);
    await Expense.deleteMany({ group: group._id });
    await ShoppingList.updateMany({ group: group._id }, { $set: { group: null } });
    await group.deleteOne();

    emitSync(audience, ['groups', 'expenses', 'lists']);

    res.json({ ok: true });
  }),
);

/** The people in a group, for pickers. Non-friends stay contact-less. */
router.get(
  '/:id/members',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    const people = await User.find({ _id: { $in: group.members } }).sort({ name: 1 });
    const friendIds = new Set([req.userId, ...req.user.friends.map(String)]);

    res.json({
      people: people.map((p) => (friendIds.has(String(p._id)) ? friendUser(p) : publicUser(p))),
    });
  }),
);

module.exports = router;
module.exports.memberGroup = memberGroup;
