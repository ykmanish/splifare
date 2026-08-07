const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User } = require('../models');
const { requireAuth, asyncHandler } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const { notify } = require('../utils/feed');

const router = express.Router();
router.use(requireAuth);

/** Everyone this user can split with (themselves included). */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const friends = await User.find({ _id: { $in: req.user.friends } }).sort({ name: 1 });
    res.json({ people: [req.user.toJSON(), ...friends.map((f) => f.toJSON())] });
  }),
);

/**
 * Add a friend. If someone already uses that email we link to them,
 * otherwise we create a placeholder account they can claim later by
 * registering with the same address.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const rawEmail = String(req.body.email || '').trim().toLowerCase();
    if (name.length < 2) throw new HttpError(400, 'Enter a name');

    const email = rawEmail || `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}.${crypto.randomBytes(3).toString('hex')}@placeholder.splitta`;

    let friend = await User.findOne({ email });
    if (!friend) {
      friend = await User.create({
        name,
        email,
        // Unusable random password — the placeholder cannot be signed into.
        passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10),
        phone: String(req.body.phone || '').trim(),
      });
    }

    if (String(friend._id) === req.userId) throw new HttpError(400, 'That is you');

    if (!req.user.friends.some((f) => String(f) === String(friend._id))) {
      req.user.friends.push(friend._id);
      await req.user.save();
    }
    // Keep it mutual so balances resolve from either side.
    await User.updateOne({ _id: friend._id }, { $addToSet: { friends: req.user._id } });

    await notify({
      recipients: [friend._id],
      actor: req.user._id,
      type: 'friend_added',
      title: `${req.user.name} added you on Splitta`,
      body: 'You can now split expenses together.',
      entityType: 'friend',
      entityId: req.userId,
    });

    res.status(201).json({ person: friend.toJSON() });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await User.updateOne({ _id: req.userId }, { $pull: { friends: req.params.id } });
    res.json({ ok: true });
  }),
);

module.exports = router;
