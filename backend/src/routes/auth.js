const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const {
  User,
  Group,
  Expense,
  Settlement,
  ShoppingList,
  Notification,
  Activity,
  FriendRequest,
  PushSubscription,
} = require('../models');
const { signToken, requireAuth, asyncHandler } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const { notify, logActivity } = require('../utils/feed');
const { emitSync, disconnectUser } = require('../realtime');

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

    // `deletedAt: null` keeps a closed account out of the lookup entirely,
    // rather than relying on its scrambled hash to fail the compare.
    const user = await User.findOne({ email, deletedAt: null }).select('+passwordHash');
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

/* ================================================================
   CLOSING AN ACCOUNT
   ================================================================ */

/**
 * Failed close attempts, per account.
 *
 * This route compares a password, so without a limit it is an unthrottled
 * oracle whose success case cannot be undone. In-process, and therefore reset
 * by a restart and not shared between instances — proportionate for a
 * single-process deploy, and the honest note is that it is a speed bump
 * rather than a lockout.
 */
const closeAttempts = new Map();
const CLOSE_WINDOW_MS = 15 * 60 * 1000;
const CLOSE_MAX_FAILURES = 5;

function assertCloseAllowed(userId) {
  const row = closeAttempts.get(userId);
  if (!row) return;
  if (Date.now() - row.first > CLOSE_WINDOW_MS) {
    closeAttempts.delete(userId);
    return;
  }
  if (row.count >= CLOSE_MAX_FAILURES) {
    throw new HttpError(429, 'Too many attempts — wait 15 minutes and try again');
  }
}

function recordCloseFailure(userId) {
  const row = closeAttempts.get(userId);
  if (!row || Date.now() - row.first > CLOSE_WINDOW_MS) {
    closeAttempts.set(userId, { count: 1, first: Date.now() });
    return;
  }
  row.count += 1;
}

/**
 * Everyone who should hear that this account closed, and who must be told to
 * re-fetch. Collected *before* any membership is pulled — afterwards there is
 * no query that can find these people again.
 */
async function closureAudience(me) {
  const [groups, lists, expenseIds, settlements] = await Promise.all([
    Group.find({ members: me._id }).select('members'),
    ShoppingList.find({ members: me._id }).select('members'),
    Expense.distinct('participants', { participants: me._id }),
    Settlement.find({ $or: [{ from: me._id }, { to: me._id }] }).select('from to'),
  ]);

  const ids = [
    ...(me.friends || []).map(String),
    ...groups.flatMap((g) => g.members.map(String)),
    ...lists.flatMap((l) => l.members.map(String)),
    ...expenseIds.map(String),
    ...settlements.flatMap((s) => [String(s.from), String(s.to)]),
  ];

  return [...new Set(ids)].filter((id) => id !== String(me._id));
}

/**
 * Close and delete an account.
 *
 * The row is kept and stripped rather than destroyed, and **no expense or
 * settlement is touched at all**. That is the whole design, and it follows
 * from what the money means: an expense names its people by id and its shares
 * must sum to its total, so removing someone from one is impossible without
 * rewriting a bill other people already agreed to. Deleting those rows
 * instead would silently move real balances — pay 3,000 for a dinner three
 * people split, close your account, and what the other two owe simply
 * evaporates with nobody told.
 *
 * So the account stops existing as a *participant* — no logins, no sockets,
 * no lookups, no memberships, no contact details — while the history that
 * names it stays exactly as it was, still nameable and still settleable by
 * whoever is left holding a balance with it.
 */
router.delete(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertCloseAllowed(req.userId);

    const confirm = String(req.body?.confirm || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    // Read again with the hash: requireAuth's lookup does not select it,
    // since `passwordHash` is `select: false` on the schema.
    const me = await User.findById(req.userId).select('+passwordHash');
    if (!me) throw new HttpError(401, 'Account no longer exists');

    if (!confirm) throw new HttpError(400, 'Type your email address to confirm');
    if (confirm !== String(me.email).toLowerCase()) {
      recordCloseFailure(req.userId);
      throw new HttpError(400, 'That does not match the email on this account');
    }
    if (!(await bcrypt.compare(password, me.passwordHash))) {
      recordCloseFailure(req.userId);
      throw new HttpError(401, 'That password is not right');
    }

    const survivors = await closureAudience(me);
    const name = me.name;

    /* ---- 1. anything that can reach a device, first ----------------- */
    await PushSubscription.deleteMany({ user: me._id });

    /* ---- 2. relationships, both directions -------------------------- */
    await FriendRequest.deleteMany({ $or: [{ from: me._id }, { to: me._id }] });
    // The reciprocal half matters more than their own list: `reachableIds`
    // reads the *other* person's friends, so skipping this would let a
    // survivor name a closed account in a brand-new expense.
    await User.updateMany({ friends: me._id }, { $pull: { friends: me._id } });

    /* ---- 3. memberships --------------------------------------------- */
    await Group.updateMany({ members: me._id }, { $pull: { members: me._id } });
    const emptiedGroups = await Group.find({ members: { $size: 0 } }).select('_id');
    for (const group of emptiedGroups) {
      // Only when nothing was ever spent there. A group can hold expenses
      // naming people who left it earlier, and deleting those would move
      // their balances — so an empty-but-spent group is orphaned instead.
      if (!(await Expense.exists({ group: group._id }))) await group.deleteOne();
    }

    const lists = await ShoppingList.find({ members: me._id });
    for (const list of lists) {
      list.members = list.members.filter((m) => String(m) !== String(me._id));
      // A finished list has already become an expense; recomputing its shares
      // now would disagree with the bill that was actually recorded.
      if (list.status !== 'completed') {
        list.items.forEach((item) => {
          item.splitWith = (item.splitWith || []).filter((u) => String(u) !== String(me._id));
        });
      }
      // A list nobody belongs to can never be opened or removed again.
      if (!list.members.length) await list.deleteOne();
      else await list.save();
    }

    /* ---- 4. their own feed ------------------------------------------ */
    await Notification.deleteMany({ user: me._id });
    // Pulled, never deleted: one Activity row is shared by its whole
    // audience, so deleting it would erase the entry from everyone's feed.
    await Activity.updateMany({ audience: me._id }, { $pull: { audience: me._id } });

    /* ---- 5. the identity strip, last and irreversible ---------------- */
    me.deletedAt = new Date();
    // Rewritten rather than unset: `email` is required and uniquely indexed,
    // so keeping it would bar this person from ever signing up again.
    me.email = `deleted+${me._id}@splitta.invalid`;
    me.username = undefined;
    me.phone = '';
    me.upiId = '';
    me.friends = [];
    // The `code` is kept on purpose. Releasing it would let a stranger
    // inherit the handle people use to reconnect, and be friend-requested
    // in their place.
    me.passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    await me.save();

    closeAttempts.delete(req.userId);
    await disconnectUser(req.userId);

    /* ---- 6. tell everyone still here --------------------------------- */
    await notify({
      recipients: survivors,
      actor: me._id,
      type: 'account_closed',
      title: `${name} closed their Splitta account`,
      body: 'Any balance you had with them stays on record — you can still settle it.',
    });
    await logActivity({
      audience: survivors,
      actor: me._id,
      type: 'account_closed',
      text: `**${name}** closed their account`,
    });
    // Not 'expenses' or 'settlements': nothing in either changed, and saying
    // so would imply a money movement that did not happen.
    emitSync(survivors, ['people', 'groups', 'lists', 'requests']);

    res.json({ ok: true });
  }),
);

module.exports = router;
