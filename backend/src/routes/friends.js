const express = require('express');
const { User, FriendRequest } = require('../models');
const { requireAuth, asyncHandler } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const { notify, logActivity } = require('../utils/feed');
const { normaliseCode } = require('../utils/codes');
const {
  visiblePeople,
  publicUser,
  friendUser,
  requestBetween,
  ensureUserCode,
} = require('../utils/people');

const router = express.Router();
router.use(requireAuth);

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/** The card shown for a pending request, on either side of it. */
const asRequest = (doc, other) => ({
  id: String(doc._id),
  status: doc.status,
  fromId: String(doc.from),
  toId: String(doc.to),
  person: other ? publicUser(other) : null,
  createdAt: doc.createdAt,
});

/* ------------------------------------------------------------- people */

/**
 * Everyone this account may see. Confirmed friends arrive whole; people who
 * merely share a group arrive as `isFriend: false` with no contact details.
 * Nobody else appears at all.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const people = await visiblePeople(req.user);
    res.json({ people, code: await ensureUserCode(req.user) });
  }),
);

/* ----------------------------------------------------------- requests */

router.get(
  '/requests',
  asyncHandler(async (req, res) => {
    const rows = await FriendRequest.find({
      status: 'pending',
      $or: [{ from: req.userId }, { to: req.userId }],
    }).sort({ createdAt: -1 });

    const otherIds = rows.map((r) => (String(r.from) === req.userId ? r.to : r.from));
    const others = await User.find({ _id: { $in: otherIds } });
    const byId = new Map(others.map((u) => [String(u._id), u]));

    const incoming = [];
    const outgoing = [];
    for (const r of rows) {
      const mine = String(r.from) === req.userId;
      const other = byId.get(String(mine ? r.to : r.from));
      if (!other) continue;
      (mine ? outgoing : incoming).push(asRequest(r, other));
    }

    res.json({ incoming, outgoing });
  }),
);

/** Links both sides and marks the row accepted. */
async function acceptRequest(doc, req) {
  const otherId = String(doc.from) === req.userId ? doc.to : doc.from;

  await User.updateOne({ _id: req.userId }, { $addToSet: { friends: otherId } });
  await User.updateOne({ _id: otherId }, { $addToSet: { friends: req.user._id } });

  doc.status = 'accepted';
  doc.respondedAt = new Date();
  await doc.save();

  const other = await User.findById(otherId);

  await notify({
    recipients: [otherId],
    actor: req.user._id,
    type: 'friend_accepted',
    title: `${req.user.name} accepted your request`,
    body: 'You can now split expenses together.',
    entityType: 'friend',
    entityId: req.userId,
  });
  await logActivity({
    audience: [req.userId, String(otherId)],
    actor: req.user._id,
    type: 'friend_added',
    text: `**${req.user.name}** and **${other?.name || 'someone'}** are now friends`,
    entityType: 'friend',
    entityId: String(otherId),
  });

  return other;
}

/**
 * Send a request. `query` is an exact email address or a Splitta code —
 * there is deliberately no fuzzy search, so the user directory cannot be
 * browsed by anyone.
 */
router.post(
  '/requests',
  asyncHandler(async (req, res) => {
    const raw = String(req.body.query || req.body.email || req.body.code || '').trim();
    if (!raw) throw new HttpError(400, 'Enter an email address or a Splitta code');

    const target = EMAIL_RE.test(raw)
      ? await User.findOne({ email: raw.toLowerCase() })
      : await User.findOne({ code: normaliseCode(raw) });

    // One message for both misses — never reveal which emails or codes exist.
    if (!target) throw new HttpError(404, 'No account matches that email or code');
    if (String(target._id) === req.userId) throw new HttpError(400, 'That is your own account');

    if (req.user.friends.some((f) => String(f) === String(target._id))) {
      throw new HttpError(409, `You and ${target.name} are already friends`);
    }

    const existing = await requestBetween(req.userId, target._id);

    if (existing && existing.status === 'pending') {
      // They asked first — treat this as the accept it plainly is.
      if (String(existing.to) === req.userId) {
        await acceptRequest(existing, req);
        return res.json({
          accepted: true,
          person: friendUser(target),
          message: `${target.name} had already asked — you are friends now`,
        });
      }
      throw new HttpError(409, `You already have a request waiting with ${target.name}`);
    }

    // A settled row (declined, or accepted then unfriended) is reused, so the
    // unique {from,to} index never turns a fresh attempt into a 409.
    let doc;
    if (existing) {
      existing.from = req.user._id;
      existing.to = target._id;
      existing.status = 'pending';
      existing.respondedAt = null;
      doc = await existing.save();
    } else {
      doc = await FriendRequest.create({ from: req.user._id, to: target._id });
    }

    await notify({
      recipients: [target._id],
      actor: req.user._id,
      type: 'friend_request',
      title: `${req.user.name} wants to be friends`,
      body: 'Accept to start splitting expenses together.',
      entityType: 'friend',
      entityId: req.userId,
    });

    res.status(201).json({ request: asRequest(doc, target) });
  }),
);

/** Loads a pending request the caller is actually part of. */
async function ownRequest(id, userId, side) {
  const doc = await FriendRequest.findById(id);
  if (!doc) throw new HttpError(404, 'That request no longer exists');

  const isRecipient = String(doc.to) === userId;
  const isSender = String(doc.from) === userId;
  if (!isRecipient && !isSender) throw new HttpError(403, 'That is not your request');
  if (side === 'to' && !isRecipient) throw new HttpError(403, 'Only the recipient can do that');
  if (side === 'from' && !isSender) throw new HttpError(403, 'Only the sender can do that');
  if (doc.status !== 'pending') throw new HttpError(409, 'That request was already answered');

  return doc;
}

router.post(
  '/requests/:id/accept',
  asyncHandler(async (req, res) => {
    const doc = await ownRequest(req.params.id, req.userId, 'to');
    const other = await acceptRequest(doc, req);
    res.json({ person: other ? friendUser(other) : null });
  }),
);

router.post(
  '/requests/:id/decline',
  asyncHandler(async (req, res) => {
    const doc = await ownRequest(req.params.id, req.userId, 'to');
    doc.status = 'declined';
    doc.respondedAt = new Date();
    await doc.save();
    res.json({ ok: true });
  }),
);

/** Withdraw a request you sent. */
router.delete(
  '/requests/:id',
  asyncHandler(async (req, res) => {
    const doc = await ownRequest(req.params.id, req.userId, 'from');
    await doc.deleteOne();
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------ unfriend */

/**
 * Removal is mutual: a one-sided version would leave the other person still
 * able to name you in an expense, which is exactly what the friend list
 * gates. Shared history stays on record.
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const other = String(req.params.id);

    await User.updateOne({ _id: req.userId }, { $pull: { friends: other } });
    await User.updateOne({ _id: other }, { $pull: { friends: req.user._id } });

    const doc = await requestBetween(req.userId, other);
    if (doc) await doc.deleteOne();

    res.json({ ok: true });
  }),
);

module.exports = router;
