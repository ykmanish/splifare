const express = require('express');
const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { signToken, requireAuth, asyncHandler } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');

const router = express.Router();

const EMAIL_RE = /^\S+@\S+\.\S+$/;

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (name.length < 2) throw new HttpError(400, 'Enter your name');
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email');
    if (password.length < 8) throw new HttpError(400, 'Use at least 8 characters');

    if (await User.exists({ email })) {
      throw new HttpError(409, 'An account with that email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });

    res.status(201).json({ token: signToken(user._id), user: user.toJSON() });
  }),
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      // Same message either way — do not leak which emails exist.
      throw new HttpError(401, 'Email or password is not right');
    }

    res.json({ token: signToken(user._id), user: user.toJSON() });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user.toJSON() });
  }),
);

router.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const allowed = ['name', 'phone', 'currency', 'theme'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) req.user[key] = req.body[key];
    }
    if (req.body.email) {
      const email = String(req.body.email).trim().toLowerCase();
      if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email');
      if (email !== req.user.email && (await User.exists({ email }))) {
        throw new HttpError(409, 'That email is already taken');
      }
      req.user.email = email;
    }
    await req.user.save();
    res.json({ user: req.user.toJSON() });
  }),
);

router.post(
  '/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const current = String(req.body.currentPassword || '');
    const next = String(req.body.newPassword || '');
    if (next.length < 8) throw new HttpError(400, 'Use at least 8 characters');

    const user = await User.findById(req.userId).select('+passwordHash');
    if (!(await bcrypt.compare(current, user.passwordHash))) {
      throw new HttpError(401, 'Current password is not right');
    }
    user.passwordHash = await bcrypt.hash(next, 12);
    await user.save();
    res.json({ ok: true });
  }),
);

module.exports = router;
