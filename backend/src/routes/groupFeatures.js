const express = require('express');
const {
  BadgeAward,
  Expense,
  Group,
  GroupMemory,
  GroupMessage,
  RecurringExpense,
  SavedPlace,
  Settlement,
  ShoppingList,
  SplitRequest,
} = require('../models');
const { requireAuth, asyncHandler } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const { memberGroup } = require('./groups');
const { round2 } = require('../utils/money');
const { notify } = require('../utils/feed');
const { emitSync } = require('../realtime');
const { BADGES, evaluateBadges } = require('../utils/badges');
const { runDueRecurring, advance } = require('../utils/recurring');
const { getRates } = require('../utils/fx');
const { makeConverter } = require('../utils/ledger');

const router = express.Router();
router.use(requireAuth);

const clean = (v, max = 140) => String(v || '').trim().slice(0, max);
const PAGE = 40;

/**
 * A money field that may simply not have been sent.
 *
 * `round2(undefined)` is `NaN`, which Mongoose then rejects as a cast error —
 * so an optional amount left out of the body failed the whole write with a
 * message about a field the caller never mentioned. Amounts here are all
 * optional; absent means zero.
 */
const optionalAmount = (v) => (v === undefined || v === null || v === '' ? 0 : round2(v) || 0);

/**
 * A timeline photo, capped.
 *
 * The client already downscales to a thumbnail before upload, so anything
 * over this is either a client that skipped that step or someone poking the
 * API directly. Rejecting is better than truncating: half a JPEG renders as a
 * broken image forever, and the row would still be in the list query.
 */
const MAX_PHOTO_BYTES = 400 * 1024;

function readPhoto(raw) {
  const value = String(raw || '');
  if (!value) return '';
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(value)) {
    throw new HttpError(400, 'That photo is not in a format the app can store');
  }
  if (value.length > MAX_PHOTO_BYTES) {
    throw new HttpError(413, 'That photo is too large — try a smaller one');
  }
  return value;
}

async function assertExpenseInGroup(expenseId, groupId) {
  if (!expenseId) return null;
  const expense = await Expense.findById(expenseId);
  if (!expense) throw new HttpError(404, 'Expense not found');
  if (String(expense.group || '') !== String(groupId)) {
    throw new HttpError(403, 'That expense is not in this group');
  }
  return expense;
}

const inGroup = (group, userId) => group.members.some((m) => String(m) === String(userId));

/**
 * The Google Maps fields on a saved place.
 *
 * Only ever `https://` links are stored, and only Google's own hosts. These
 * strings are rendered as an anchor and loaded into an iframe, so an
 * attacker-supplied `javascript:` URL or a lookalike host would be a stored
 * XSS / phishing vector in a shared group — cheap to close here, impossible
 * to close reliably at every render site.
 */
const SHORTENERS = new Set(['goo.gl', 'maps.app.goo.gl']);

/**
 * Is this hostname really Google's?
 *
 * Parsed label by label rather than pattern-matched. The tempting regex —
 * `google\.[a-z.]+` — happily accepts `google.com.evil.com`, because the
 * character class eats the dots and the attacker's domain along with them.
 * Requiring `google` to sit immediately before the public suffix closes that,
 * and reads as the rule it is enforcing.
 */
function isGoogleHost(host) {
  if (SHORTENERS.has(host)) return true;

  const labels = host.split('.');
  const at = labels.lastIndexOf('google');
  if (at === -1) return false;

  /* What follows must be the suffix alone: `com`, or `co.in`, `co.uk`. */
  const suffix = labels.slice(at + 1);
  return (
    suffix.length >= 1 &&
    suffix.length <= 2 &&
    suffix.every((label) => /^[a-z]{2,3}$/.test(label))
  );
}

function safeMapsUrl(raw) {
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return '';
  }
  if (parsed.protocol !== 'https:') return '';
  return isGoogleHost(parsed.hostname.toLowerCase()) ? parsed.toString() : '';
}

function readMapsFields(body) {
  const out = {};
  if (body.mapsPlaceId !== undefined) out.mapsPlaceId = clean(body.mapsPlaceId, 300);
  if (body.address !== undefined) out.address = clean(body.address, 300);
  if (body.mapsUrl !== undefined) out.mapsUrl = safeMapsUrl(clean(body.mapsUrl, 600));
  for (const [key, limit] of [['lat', 90], ['lng', 180]]) {
    if (body[key] === undefined) continue;
    if (body[key] === null || body[key] === '') {
      out[key] = null;
      continue;
    }
    const n = Number(body[key]);
    if (!Number.isFinite(n) || Math.abs(n) > limit) {
      throw new HttpError(400, 'That location is not valid');
    }
    out[key] = n;
  }
  return out;
}

/**
 * A converter for a group's expenses, bought only when it is needed.
 *
 * Most groups spend in one currency, and fetching a rate table for those
 * would put a network call on the critical path of every group open for no
 * gain. Rates are only pulled when the group actually mixes currencies.
 */
async function converterFor(rows, base) {
  const codes = new Set(rows.map((r) => r.currency).filter(Boolean));
  if (codes.size <= 1 && (codes.size === 0 || codes.has(base))) {
    return (amount) => Number(amount) || 0;
  }
  try {
    const table = await getRates(base);
    return makeConverter(base, table.rates);
  } catch {
    /* Same fallback the client makes when its table fails: take figures at
       face value rather than zeroing them. */
    return (amount) => Number(amount) || 0;
  }
}

/**
 * Recompute the shelf and persist anything newly earned.
 *
 * The write is what makes an unlock a moment rather than a state: a badge
 * with no row yet is returned as `justEarned`, the client plays the
 * celebration, and the row stops it happening twice. Losing these rows costs
 * a party, never a badge.
 */
async function badgesFor(group, userId, ctx) {
  const rows = await BadgeAward.find({ group: group._id, user: userId });
  const awarded = new Map(rows.map((r) => [r.badge, r.earnedAt]));
  const seen = new Set(rows.filter((r) => r.seen).map((r) => r.badge));

  const badges = evaluateBadges(ctx, awarded);
  const fresh = badges.filter((b) => b.earned && !awarded.has(b.id));

  if (fresh.length) {
    /* Unordered, so one duplicate key from a parallel request cannot drop the
       rest of the batch. The unique index is what makes the retry safe. */
    await BadgeAward.insertMany(
      fresh.map((b) => ({ group: group._id, user: userId, badge: b.id })),
      { ordered: false },
    ).catch(() => {});
  }

  return badges.map((b) => ({
    ...b,
    justEarned: b.earned && !seen.has(b.id),
  }));
}

/* ------------------------------------------------------------- engagement */

/**
 * Everything the group's Engage screen needs, in one round trip.
 *
 * It also sweeps due recurring bills. That is a write inside a GET, which is
 * not lovely, but the alternative is a scheduler this deployment does not
 * have — and a rent that only posts when someone remembers to press a button
 * is not a recurring bill.
 */
router.get(
  '/groups/:id/engagement',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    const postedNow = await runDueRecurring(group);

    const [messages, recurring, requests, places, memories, expenses, settlements, lists] =
      await Promise.all([
        GroupMessage.find({ group: group._id, expense: null })
          .sort({ createdAt: -1 })
          .limit(PAGE),
        RecurringExpense.find({ group: group._id }).sort({ active: -1, nextDate: 1 }),
        SplitRequest.find({ group: group._id }).sort({ createdAt: -1 }).limit(60),
        SavedPlace.find({ group: group._id }).sort({ useCount: -1, updatedAt: -1 }).limit(60),
        GroupMemory.find({ group: group._id }).sort({ date: -1 }).limit(60),
        Expense.find({ group: group._id }).sort({ date: -1 }),
        Settlement.find({ group: group._id }),
        ShoppingList.find({ group: group._id }),
      ]);

    const convert = await converterFor([...expenses, ...settlements], req.user.currency || 'INR');
    const messageCount = await GroupMessage.countDocuments({ group: group._id });

    const badges = await badgesFor(group, req.userId, {
      group,
      userId: String(req.userId),
      expenses,
      settlements,
      lists,
      convert,
      messageCount,
      placeCount: places.length,
      memoryCount: memories.length,
      requestsClosedByMe: requests.filter(
        (r) => r.status === 'done' && String(r.closedBy || '') === String(req.userId),
      ).length,
    });

    res.json({
      messages: messages.map((m) => m.toJSON()),
      hasMoreMessages: messages.length === PAGE,
      recurring: recurring.map((r) => r.toJSON()),
      requests: requests.map((r) => r.toJSON()),
      places: places.map((p) => p.toJSON()),
      memories: memories.map((m) => m.toJSON()),
      badges,
      /* Named so the client can say "rent was added while you were away"
         instead of the balance quietly changing under them. */
      autoPosted: postedNow.map((e) => e.toJSON()),
    });
  }),
);

/* ------------------------------------------------------------------- chat */

/** One page of a thread, newest first. `before` is a message id to page from. */
router.get(
  '/groups/:id/messages',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    const query = { group: group._id, expense: req.query.expenseId || null };

    if (req.query.before) {
      const anchor = await GroupMessage.findById(req.query.before).select('createdAt');
      if (anchor) query.createdAt = { $lt: anchor.createdAt };
    }

    const messages = await GroupMessage.find(query).sort({ createdAt: -1 }).limit(PAGE);
    res.json({
      messages: messages.map((m) => m.toJSON()),
      hasMore: messages.length === PAGE,
    });
  }),
);

router.post(
  '/groups/:id/messages',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    const text = clean(req.body.text, 500);
    if (!text) throw new HttpError(400, 'Write a message first');
    const expense = await assertExpenseInGroup(req.body.expenseId, group._id);

    const message = await GroupMessage.create({
      group: group._id,
      expense: expense ? expense._id : null,
      author: req.userId,
      text,
    });

    /*
     * A chat that only refreshes on reload is not a chat. `engagement` is a
     * scope the group screen listens for directly rather than one of the
     * store's data slices — the whole thread does not need re-fetching, only
     * whoever has that room open needs to know.
     */
    emitSync(group.members.map(String), ['engagement'], {
      groupId: String(group._id),
      expenseId: expense ? String(expense._id) : null,
      kind: 'message',
    });

    /*
     * Push only for a bill's thread. A room message pinging six phones is how
     * a group chat becomes a muted group chat; a comment on a specific bill is
     * nearly always a question aimed at the people on it.
     */
    if (expense) {
      await notify({
        recipients: expense.participants.map(String),
        actor: req.userId,
        type: 'group_message',
        title: `${req.user.name} commented on ${expense.description}`,
        body: text,
        entityType: 'group',
        entityId: String(group._id),
      });
    }

    res.status(201).json({ message: message.toJSON() });
  }),
);

/** Toggle one emoji from the sender. Same emoji twice removes it. */
router.post(
  '/groups/:id/messages/:mid/react',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    const emoji = clean(req.body.emoji, 8);
    if (!emoji) throw new HttpError(400, 'Pick an emoji');

    const message = await GroupMessage.findOne({ _id: req.params.mid, group: group._id });
    if (!message) throw new HttpError(404, 'Message not found');

    const mine = message.reactions.findIndex(
      (r) => String(r.user) === String(req.userId) && r.emoji === emoji,
    );
    if (mine >= 0) message.reactions.splice(mine, 1);
    else message.reactions.push({ emoji, user: req.userId });

    await message.save();
    emitSync(group.members.map(String), ['engagement'], {
      groupId: String(group._id),
      kind: 'message',
    });
    res.json({ message: message.toJSON() });
  }),
);

/** Only the author can remove their own message. */
router.delete(
  '/groups/:id/messages/:mid',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    const message = await GroupMessage.findOne({ _id: req.params.mid, group: group._id });
    if (!message) throw new HttpError(404, 'Message not found');
    if (String(message.author) !== String(req.userId)) {
      throw new HttpError(403, 'You can only delete your own messages');
    }
    await message.deleteOne();
    emitSync(group.members.map(String), ['engagement'], {
      groupId: String(group._id),
      kind: 'message',
    });
    res.json({ ok: true });
  }),
);

/* -------------------------------------------------------------- recurring */

function readRecurringBody(body, group, req) {
  const splitWith = (Array.isArray(body.splitWith) ? body.splitWith : [])
    .map(String)
    .filter((memberId) => group.members.some((m) => String(m) === memberId));

  const nextDate = body.nextDate ? new Date(body.nextDate) : new Date();
  if (Number.isNaN(nextDate.getTime())) throw new HttpError(400, 'That date is not valid');

  const payer = body.payer && inGroup(group, body.payer) ? String(body.payer) : String(req.userId);

  return {
    title: clean(body.title, 100),
    amount: optionalAmount(body.amount),
    currency: clean(body.currency || req.user.currency || 'INR', 8).toUpperCase(),
    category: clean(body.category || 'other', 40),
    frequency: body.frequency || 'monthly',
    nextDate,
    anchorDay: nextDate.getDate(),
    autoPost: body.autoPost !== false,
    payer,
    splitWith: splitWith.length ? splitWith : group.members.map(String),
  };
}

router.post(
  '/groups/:id/recurring',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    const body = readRecurringBody(req.body, group, req);
    if (!body.title) throw new HttpError(400, 'Name the recurring expense');

    const recurring = await RecurringExpense.create({
      ...body,
      group: group._id,
      createdBy: req.userId,
    });
    emitSync(group.members.map(String), ['engagement'], { groupId: String(group._id) });
    res.status(201).json({ recurring: recurring.toJSON() });
  }),
);

router.patch(
  '/groups/:id/recurring/:rid',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    const recurring = await RecurringExpense.findOne({ _id: req.params.rid, group: group._id });
    if (!recurring) throw new HttpError(404, 'Recurring expense not found');

    if (req.body.title !== undefined) recurring.title = clean(req.body.title, 100);
    if (req.body.category !== undefined) recurring.category = clean(req.body.category, 40);
    if (req.body.frequency !== undefined) recurring.frequency = req.body.frequency;
    if (req.body.amount !== undefined) recurring.amount = optionalAmount(req.body.amount);
    if (req.body.currency !== undefined) {
      recurring.currency = clean(req.body.currency, 8).toUpperCase();
    }
    if (req.body.autoPost !== undefined) recurring.autoPost = !!req.body.autoPost;
    if (req.body.active !== undefined) recurring.active = !!req.body.active;
    if (req.body.payer !== undefined && inGroup(group, req.body.payer)) {
      recurring.payer = req.body.payer;
    }
    if (Array.isArray(req.body.splitWith)) {
      const next = req.body.splitWith.map(String).filter((m) => inGroup(group, m));
      if (next.length) recurring.splitWith = next;
    }
    if (req.body.nextDate !== undefined) {
      const date = new Date(req.body.nextDate);
      if (Number.isNaN(date.getTime())) throw new HttpError(400, 'That date is not valid');
      recurring.nextDate = date;
      recurring.anchorDay = date.getDate();
    }

    await recurring.save();
    emitSync(group.members.map(String), ['engagement'], { groupId: String(group._id) });
    res.json({ recurring: recurring.toJSON() });
  }),
);

/** Push the schedule on by one cycle without posting anything. */
router.post(
  '/groups/:id/recurring/:rid/skip',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    const recurring = await RecurringExpense.findOne({ _id: req.params.rid, group: group._id });
    if (!recurring) throw new HttpError(404, 'Recurring expense not found');

    recurring.nextDate = advance(recurring.nextDate, recurring.frequency, recurring.anchorDay);
    await recurring.save();
    emitSync(group.members.map(String), ['engagement'], { groupId: String(group._id) });
    res.json({ recurring: recurring.toJSON() });
  }),
);

router.delete(
  '/groups/:id/recurring/:rid',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    await RecurringExpense.deleteOne({ _id: req.params.rid, group: group._id });
    emitSync(group.members.map(String), ['engagement'], { groupId: String(group._id) });
    res.json({ ok: true });
  }),
);

/* --------------------------------------------------------------- requests */

router.post(
  '/groups/:id/requests',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    const title = clean(req.body.title, 120);
    if (!title) throw new HttpError(400, 'Name the request');
    if (req.body.assignee && !inGroup(group, req.body.assignee)) {
      throw new HttpError(400, 'Assign it to someone in this group');
    }
    await assertExpenseInGroup(req.body.expenseId, group._id);

    const request = await SplitRequest.create({
      group: group._id,
      type: req.body.type || 'add_bill',
      title,
      details: clean(req.body.details, 400),
      requester: req.userId,
      assignee: req.body.assignee || null,
      expense: req.body.expenseId || null,
    });

    if (request.assignee) {
      await notify({
        recipients: [String(request.assignee)],
        actor: req.userId,
        type: 'split_request',
        title: `${req.user.name} asked you for something`,
        body: `${title}${request.details ? ` · ${request.details}` : ''}`,
        entityType: 'group',
        entityId: String(group._id),
      });
    }

    emitSync(group.members.map(String), ['engagement'], { groupId: String(group._id) });
    res.status(201).json({ request: request.toJSON() });
  }),
);

const RESPONSE_WORDING = {
  accepted: 'is on it',
  declined: 'passed on it',
  done: 'marked it done',
};

/**
 * Respond to a request.
 *
 * Who may do what is the point of this route. Anyone in the group could
 * previously close anything, which made an assignment meaningless — the
 * person who asked could tick off their own request and the person asked
 * would never know. Now the assignee answers, and the requester can withdraw.
 */
router.patch(
  '/groups/:id/requests/:rid',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    const request = await SplitRequest.findOne({ _id: req.params.rid, group: group._id });
    if (!request) throw new HttpError(404, 'Split request not found');

    const me = String(req.userId);
    const isAssignee = String(request.assignee || '') === me;
    const isRequester = String(request.requester) === me;
    /* An unassigned request is an open ask to the room, so anyone may take it. */
    const open = !request.assignee;
    const status = req.body.status;

    if (status !== undefined) {
      if (status === 'dismissed' && !isRequester) {
        throw new HttpError(403, 'Only the person who asked can withdraw this');
      }
      if (status !== 'dismissed' && !(isAssignee || isRequester || open)) {
        throw new HttpError(403, 'This request is not yours to answer');
      }
      request.status = status;
      request.respondedAt = new Date();
      if (status === 'done') request.closedBy = req.userId;
    }

    if (req.body.resolvedExpenseId !== undefined) {
      await assertExpenseInGroup(req.body.resolvedExpenseId, group._id);
      request.resolvedExpense = req.body.resolvedExpenseId || null;
    }
    if (req.body.title !== undefined && isRequester) request.title = clean(req.body.title, 120);
    if (req.body.details !== undefined && isRequester) {
      request.details = clean(req.body.details, 400);
    }
    await request.save();

    /* Tell the other side. A request answered in silence is the thing this
       feature exists to replace. */
    const other = isRequester ? String(request.assignee || '') : String(request.requester);
    if (other && other !== me && RESPONSE_WORDING[request.status]) {
      await notify({
        recipients: [other],
        actor: req.userId,
        type: 'split_request_update',
        title: `${req.user.name} ${RESPONSE_WORDING[request.status]}`,
        body: request.title,
        entityType: 'group',
        entityId: String(group._id),
      });
    }

    emitSync(group.members.map(String), ['engagement'], { groupId: String(group._id) });
    res.json({ request: request.toJSON() });
  }),
);

router.delete(
  '/groups/:id/requests/:rid',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    const request = await SplitRequest.findOne({ _id: req.params.rid, group: group._id });
    if (!request) throw new HttpError(404, 'Split request not found');
    if (String(request.requester) !== String(req.userId)) {
      throw new HttpError(403, 'Only the person who asked can remove this');
    }
    await request.deleteOne();
    emitSync(group.members.map(String), ['engagement'], { groupId: String(group._id) });
    res.json({ ok: true });
  }),
);

/* ----------------------------------------------------------------- places */

router.post(
  '/groups/:id/places',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    const name = clean(req.body.name, 120);
    if (!name) throw new HttpError(400, 'Name the place or vendor');

    const place = await SavedPlace.create({
      group: group._id,
      name,
      kind: clean(req.body.kind || 'restaurant', 40),
      category: clean(req.body.category || 'food', 40),
      note: clean(req.body.note, 240),
      typicalAmount: optionalAmount(req.body.typicalAmount),
      currency: clean(req.body.currency || req.user.currency || 'INR', 8).toUpperCase(),
      ...readMapsFields(req.body),
      createdBy: req.userId,
    });
    emitSync(group.members.map(String), ['engagement'], { groupId: String(group._id) });
    res.status(201).json({ place: place.toJSON() });
  }),
);

router.patch(
  '/groups/:id/places/:pid',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    const place = await SavedPlace.findOne({ _id: req.params.pid, group: group._id });
    if (!place) throw new HttpError(404, 'Place not found');

    /*
     * `used` is the interesting write here: starting a bill from a place bumps
     * its count, which is what floats the canteen everyone actually goes to
     * above the restaurant somebody saved once.
     */
    if (req.body.used) {
      place.useCount += 1;
      place.lastUsedAt = new Date();
      if (req.body.amount !== undefined) place.typicalAmount = optionalAmount(req.body.amount);
    }
    if (req.body.name !== undefined) place.name = clean(req.body.name, 120);
    if (req.body.kind !== undefined) place.kind = clean(req.body.kind, 40);
    if (req.body.category !== undefined) place.category = clean(req.body.category, 40);
    if (req.body.note !== undefined) place.note = clean(req.body.note, 240);
    if (req.body.typicalAmount !== undefined) {
      place.typicalAmount = optionalAmount(req.body.typicalAmount);
    }
    Object.assign(place, readMapsFields(req.body));

    await place.save();
    emitSync(group.members.map(String), ['engagement'], { groupId: String(group._id) });
    res.json({ place: place.toJSON() });
  }),
);

router.delete(
  '/groups/:id/places/:pid',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    await SavedPlace.deleteOne({ _id: req.params.pid, group: group._id });
    emitSync(group.members.map(String), ['engagement'], { groupId: String(group._id) });
    res.json({ ok: true });
  }),
);

/* --------------------------------------------------------------- memories */

router.post(
  '/groups/:id/memories',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    const photo = readPhoto(req.body.photo);
    const title = clean(req.body.title, 120);
    const note = clean(req.body.note, 500);
    const place = clean(req.body.place, 120);
    if (!photo && !title && !note && !place) {
      throw new HttpError(400, 'Add a photo, a place or a note');
    }
    await assertExpenseInGroup(req.body.expenseId, group._id);

    const date = req.body.date ? new Date(req.body.date) : new Date();
    const memory = await GroupMemory.create({
      group: group._id,
      expense: req.body.expenseId || null,
      author: req.userId,
      title,
      note,
      place,
      photo,
      date: Number.isNaN(date.getTime()) ? new Date() : date,
    });

    emitSync(group.members.map(String), ['engagement'], { groupId: String(group._id) });
    res.status(201).json({ memory: memory.toJSON() });
  }),
);

router.delete(
  '/groups/:id/memories/:mid',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    const memory = await GroupMemory.findOne({ _id: req.params.mid, group: group._id });
    if (!memory) throw new HttpError(404, 'Memory not found');
    if (String(memory.author) !== String(req.userId)) {
      throw new HttpError(403, 'You can only remove memories you added');
    }
    await memory.deleteOne();
    emitSync(group.members.map(String), ['engagement'], { groupId: String(group._id) });
    res.json({ ok: true });
  }),
);

/* ----------------------------------------------------------------- badges */

/** Mark unlocks as celebrated so the animation does not replay on next load. */
router.post(
  '/groups/:id/badges/seen',
  asyncHandler(async (req, res) => {
    const group = await memberGroup(req.params.id, req.userId);
    const ids = (Array.isArray(req.body.badges) ? req.body.badges : []).map(String).slice(0, 40);
    if (ids.length) {
      await BadgeAward.updateMany(
        { group: group._id, user: req.userId, badge: { $in: ids } },
        { $set: { seen: true } },
      );
    }
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------- hub */

/**
 * The cross-group view behind the Engage tab.
 *
 * Kept as its own query rather than N calls to `/engagement` because that
 * route sweeps recurring bills and recomputes badges per group — fine once on
 * a group screen, wasteful eleven times over on a summary. This reads only
 * what the hub actually paints.
 */
router.get(
  '/engagement/summary',
  asyncHandler(async (req, res) => {
    const groups = await Group.find({ members: req.userId }).select('_id name emoji members');
    const groupIds = groups.map((g) => g._id);

    if (!groupIds.length) {
      return res.json({ upcoming: [], requests: [], badges: [], unread: [], places: [] });
    }

    const soon = new Date(Date.now() + 30 * 86400000);
    const [upcoming, requests, awards, places] = await Promise.all([
      RecurringExpense.find({
        group: { $in: groupIds },
        active: true,
        nextDate: { $lte: soon },
      })
        .sort({ nextDate: 1 })
        .limit(20),
      SplitRequest.find({
        group: { $in: groupIds },
        status: { $in: ['open', 'accepted'] },
        $or: [{ assignee: req.userId }, { assignee: null }, { requester: req.userId }],
      })
        .sort({ createdAt: -1 })
        .limit(20),
      BadgeAward.find({ user: req.userId }).sort({ earnedAt: -1 }).limit(40),
      SavedPlace.find({ group: { $in: groupIds } })
        .sort({ useCount: -1, updatedAt: -1 })
        .limit(12),
    ]);

    /* The catalogue is server-side, so the hub is sent names and icons rather
       than bare ids — a second copy of the badge list on the client is a
       second place for a renamed badge to go stale. */
    const catalogue = new Map(BADGES.map((b) => [b.id, b]));

    res.json({
      upcoming: upcoming.map((r) => r.toJSON()),
      requests: requests.map((r) => r.toJSON()),
      badges: awards
        .filter((a) => catalogue.has(a.badge))
        .map((a) => {
          const meta = catalogue.get(a.badge);
          return {
            id: a.badge,
            name: meta.name,
            icon: meta.icon,
            tone: meta.tone,
            groupId: String(a.group),
            earnedAt: a.earnedAt,
            seen: a.seen,
          };
        }),
      /* So the hub can say "7 of 11" without hardcoding the denominator. */
      badgeTotal: BADGES.length,
      places: places.map((p) => p.toJSON()),
    });
  }),
);

module.exports = router;
