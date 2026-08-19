const express = require('express');
const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { signToken, requireAuth, asyncHandler } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');

const router = express.Router();

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/**
 * A UPI virtual payment address: a handle, then `@`, then a provider tag.
 * NPCI allows letters, digits, dot, hyphen and underscore in the handle.
 * Kept deliberately strict — this string is interpolated into a `upi://`
 * link, so anything odd in it ends up in a URL the phone will act on.
 */
const UPI_RE = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$/;

/**
 * A handle people will read and type: letters, digits, underscore and dot,
 * 3–20 characters, and it has to start with a letter or digit so a name cannot
 * masquerade as punctuation.
 */
const USERNAME_RE = /^[a-z0-9][a-z0-9_.]{2,19}$/;

/** Reserved so a handle cannot impersonate the product or a route. */
const RESERVED = new Set([
  'admin', 'splitta', 'support', 'help', 'root', 'system', 'api', 'settings',
  'groups', 'friends', 'lists', 'activity', 'dashboard', 'share', 'login', 'signup',
]);

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
    const allowed = ['name', 'phone', 'currency', 'theme', 'avatarSeed', 'avatarStyle', 'avatarBg'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) req.user[key] = req.body[key];
    }

    if (req.body.username !== undefined) {
      const raw = String(req.body.username).trim().toLowerCase().replace(/^@/, '');

      // Empty clears it and falls back to the display name.
      if (!raw) {
        req.user.username = undefined;
      } else {
        if (!USERNAME_RE.test(raw)) {
          throw new HttpError(
            400,
            'Usernames are 3–20 characters: letters, numbers, dots and underscores',
          );
        }
        if (RESERVED.has(raw)) throw new HttpError(409, 'That username is reserved');

        // Checked here for a clear message; the unique index is what actually
        // guarantees it under a race.
        const taken = await User.exists({ username: raw, _id: { $ne: req.user._id } });
        if (taken) throw new HttpError(409, 'That username is already taken');

        req.user.username = raw;
      }
    }

    if (req.body.upiId !== undefined) {
      const upi = String(req.body.upiId).trim();
      // Empty clears it; anything else has to be a real-looking VPA.
      if (upi && !UPI_RE.test(upi)) {
        throw new HttpError(400, 'That does not look like a UPI ID — try name@bank');
      }
      req.user.upiId = upi;
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
