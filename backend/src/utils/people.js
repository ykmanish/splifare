const { User, Group, Expense, FriendRequest } = require('../models');
const { HttpError } = require('../middleware/error');
const { uniqueCode } = require('./codes');

/**
 * What a stranger is allowed to learn about you. Sharing a group is enough
 * to see a name and a face — it is not enough to see an email or a phone
 * number, so those stay out of this shape.
 */
function publicUser(user) {
  const u = typeof user.toJSON === 'function' ? user.toJSON() : user;
  return {
    id: String(u.id || u._id),
    name: u.name,
    email: '',
    phone: '',
    currency: u.currency || 'INR',
    avatarSeed: u.avatarSeed || '',
    avatarStyle: u.avatarStyle || 'adventurer',
    avatarBg: u.avatarBg || '',
    isFriend: false,
  };
}

/** The full record, for yourself and for confirmed friends. */
function friendUser(user) {
  const u = typeof user.toJSON === 'function' ? user.toJSON() : user;
  return { ...u, id: String(u.id || u._id), isFriend: true };
}

/**
 * Everyone this account is allowed to see: itself, its confirmed friends,
 * and anyone sharing a group with it. Group co-members are included so
 * names resolve on a group screen — they arrive without contact details
 * and with `isFriend: false`, and the client keeps them out of pickers.
 *
 * Anyone outside this set is invisible: no name, no lookup, nothing.
 */
async function visiblePeople(me) {
  const friendIds = (me.friends || []).map(String);
  const groups = await Group.find({ members: me._id }).select('members');
  const coMemberIds = [
    ...new Set(groups.flatMap((g) => g.members.map(String))),
  ].filter((id) => id !== String(me._id) && !friendIds.includes(id));

  const [friends, coMembers] = await Promise.all([
    User.find({ _id: { $in: friendIds } }).sort({ name: 1 }),
    User.find({ _id: { $in: coMemberIds } }).sort({ name: 1 }),
  ]);

  return [
    { ...friendUser(me), isSelf: true },
    ...friends.map(friendUser),
    ...coMembers.map(publicUser),
  ];
}

/** ids of everyone `me` may name in an expense, settlement or list. */
async function reachableIds(me) {
  const groups = await Group.find({ members: me._id }).select('members');
  return new Set([
    String(me._id),
    ...(me.friends || []).map(String),
    ...groups.flatMap((g) => g.members.map(String)),
  ]);
}

/**
 * Guards a write that names other people. Throws unless every id is the
 * caller, a confirmed friend, or someone in a group the caller belongs to.
 */
async function assertReachable(me, ids, what = 'those people') {
  const wanted = [...new Set(ids.map(String))].filter(Boolean);
  if (!wanted.length) return;

  const allowed = await reachableIds(me);
  const stranger = wanted.find((id) => !allowed.has(id));
  if (stranger) {
    throw new HttpError(403, `You can only include friends and group members in ${what}`);
  }
}

/**
 * Whether `me` may record a payment with `otherId`. Reachability is the usual
 * test, but an existing shared expense also qualifies: unfriending or leaving
 * a group must never strand a real balance with no way to settle it.
 */
async function canTransactWith(me, otherId) {
  const allowed = await reachableIds(me);
  if (allowed.has(String(otherId))) return true;

  return !!(await Expense.exists({
    participants: { $all: [me._id, otherId] },
  }));
}

/** ids that are confirmed friends of `me`, filtered from a candidate list. */
function friendsAmong(me, ids) {
  const friendIds = new Set((me.friends || []).map(String));
  return [...new Set(ids.map(String))].filter((id) => friendIds.has(id));
}

/**
 * The single FriendRequest row for a pair, whichever direction it was
 * first sent in. `null` when the two have never interacted.
 */
async function requestBetween(a, b) {
  return FriendRequest.findOne({
    $or: [
      { from: a, to: b },
      { from: b, to: a },
    ],
  });
}

/** Assigns a shareable code the first time an account needs one. */
async function ensureUserCode(user) {
  if (user.code) return user.code;
  user.code = await uniqueCode(User, { length: 6 });
  await user.save();
  return user.code;
}

module.exports = {
  publicUser,
  friendUser,
  visiblePeople,
  reachableIds,
  assertReachable,
  canTransactWith,
  friendsAmong,
  requestBetween,
  ensureUserCode,
};
