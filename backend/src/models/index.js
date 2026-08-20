const mongoose = require('mongoose');

const { Schema, model } = mongoose;

/** Every document serialises with `id` instead of `_id`, matching the client. */
const baseOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform(_doc, ret) {
      ret.id = String(ret._id);
      delete ret._id;
      return ret;
    },
  },
};

const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name });

/* ------------------------------------------------------------------ User */

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, default: '', trim: true },
    currency: { type: String, default: 'INR' },
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    avatarSeed: { type: String, default: '', trim: true, maxlength: 80 },
    avatarStyle: {
      type: String,
      enum: ['adventurer', 'lorelei', 'micah', 'notionists', 'personas'],
      default: 'adventurer',
    },
    avatarBg: { type: String, default: '', trim: true, maxlength: 12 },
    /**
     * Shareable handle. Someone who knows it can send a friend request
     * without knowing the email address, so it is safe to paste in a chat.
     */
    code: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
    /**
     * Chosen handle, e.g. `manish`. Optional — the UI falls back to a name
     * until one is set — but unique once taken, since it is how people are
     * shown to each other.
     */
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    /**
     * UPI virtual payment address, e.g. `name@okhdfcbank`. Lets a friend
     * settle by opening their own UPI app instead of leaving for a bank
     * transfer. Visible to confirmed friends only — it is a payment handle,
     * so sharing a group must not be enough to learn it.
     */
    upiId: { type: String, default: '', trim: true, maxlength: 80 },
    /** Confirmed, mutual friendships only — requests live in FriendRequest. */
    friends: [ref('User')],
    /**
     * Set when the account is closed. The row survives on purpose: expenses
     * and settlements name people by id, so destroying it would leave real
     * balances owed to nobody — unsettleable and unnamed on everyone else's
     * screen. A closed row keeps the name and face that history already
     * shows, and nothing else.
     */
    deletedAt: { type: Date, default: null },
  },
  {
    ...baseOptions,
    toJSON: {
      ...baseOptions.toJSON,
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

/* ----------------------------------------------------------------- Group */

const groupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    emoji: { type: String, default: '🏠' },
    type: {
      type: String,
      enum: ['home', 'trip', 'couple', 'friends', 'work', 'other'],
      default: 'other',
    },
    members: [ref('User')],
    createdBy: ref('User'),
    /** Room code — anyone holding it can join the group. */
    code: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
  },
  baseOptions,
);
groupSchema.index({ members: 1 });

/* --------------------------------------------------------- Group Feature */

const reactionSchema = new Schema(
  {
    emoji: { type: String, required: true, maxlength: 8 },
    user: { ...ref('User'), required: true },
  },
  { _id: false },
);

const groupMessageSchema = new Schema(
  {
    group: { ...ref('Group'), required: true, index: true },
    /** Set when the message belongs to one bill's thread rather than the room. */
    expense: { ...ref('Expense'), default: null, index: true },
    author: { ...ref('User'), required: true },
    text: { type: String, required: true, trim: true, maxlength: 500 },
    reactions: { type: [reactionSchema], default: [] },
  },
  baseOptions,
);
/* The chat pages backwards from newest, per room and per bill thread. */
groupMessageSchema.index({ group: 1, expense: 1, createdAt: -1 });

const recurringExpenseSchema = new Schema(
  {
    group: { ...ref('Group'), required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    amount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },
    category: { type: String, default: 'other' },
    frequency: {
      type: String,
      enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
      default: 'monthly',
    },
    nextDate: { type: Date, default: Date.now },
    /**
     * The day of the month the bill was originally set for.
     *
     * Kept separately from `nextDate` because a rent due on the 31st has to
     * come back to the 31st after February, and a date that has already been
     * clamped down to the 28th has forgotten where it started.
     */
    anchorDay: { type: Number, default: null, min: 1, max: 31 },
    /** Off means "remind me", on means "post it to the ledger for me". */
    autoPost: { type: Boolean, default: true },
    payer: { ...ref('User'), default: null },
    splitWith: [ref('User')],
    lastPostedAt: { type: Date, default: null },
    postedCount: { type: Number, default: 0 },
    createdBy: ref('User'),
    active: { type: Boolean, default: true },
  },
  baseOptions,
);
/* The due sweep runs on every group open, so it must be an index hit. */
recurringExpenseSchema.index({ group: 1, active: 1, autoPost: 1, nextDate: 1 });

const splitRequestSchema = new Schema(
  {
    group: { ...ref('Group'), required: true, index: true },
    type: {
      type: String,
      enum: ['add_bill', 'confirm_expense', 'settle_up'],
      default: 'add_bill',
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    details: { type: String, default: '', trim: true, maxlength: 400 },
    requester: { ...ref('User'), required: true },
    assignee: { ...ref('User'), default: null },
    expense: { ...ref('Expense'), default: null },
    /** Set once the assignee actually adds the bill the request asked for. */
    resolvedExpense: { ...ref('Expense'), default: null },
    status: {
      type: String,
      enum: ['open', 'accepted', 'done', 'declined', 'dismissed'],
      default: 'open',
    },
    respondedAt: { type: Date, default: null },
    closedBy: { ...ref('User'), default: null },
  },
  baseOptions,
);

const savedPlaceSchema = new Schema(
  {
    group: { ...ref('Group'), required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    kind: { type: String, default: 'restaurant', trim: true, maxlength: 40 },
    category: { type: String, default: 'food' },
    note: { type: String, default: '', trim: true, maxlength: 240 },
    /** Typical spend, offered as the amount when a bill starts from here. */
    typicalAmount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },

    /*
     * Where it is, when the place was picked from Google rather than typed.
     *
     * The place id is the durable handle — a restaurant can move or be
     * renamed and the id still resolves — so it is what the map and the
     * directions link are built from. The coordinates and address are kept
     * alongside it so a saved place still shows something useful if the
     * Maps key is ever missing or the API is down.
     */
    mapsPlaceId: { type: String, default: '', trim: true, maxlength: 300 },
    address: { type: String, default: '', trim: true, maxlength: 300 },
    lat: { type: Number, default: null, min: -90, max: 90 },
    lng: { type: Number, default: null, min: -180, max: 180 },
    mapsUrl: { type: String, default: '', trim: true, maxlength: 600 },
    /** How often a bill actually started here — the sort key for the list. */
    useCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: null },
    createdBy: ref('User'),
  },
  baseOptions,
);

/**
 * A photo, note or place pinned to the group's timeline.
 *
 * Deliberately separate from Expense: the point of a trip timeline is the
 * things that were not bills — the view from the hotel, the name of the beach
 * — and hanging those off an expense would mean inventing a zero-rupee one to
 * hold them. A memory may reference an expense, but it does not need to.
 */
const groupMemorySchema = new Schema(
  {
    group: { ...ref('Group'), required: true, index: true },
    expense: { ...ref('Expense'), default: null },
    author: { ...ref('User'), required: true },
    title: { type: String, default: '', trim: true, maxlength: 120 },
    note: { type: String, default: '', trim: true, maxlength: 500 },
    place: { type: String, default: '', trim: true, maxlength: 120 },
    /**
     * A downscaled JPEG data URL, or empty.
     *
     * Inline rather than in object storage because the app has no bucket and
     * a timeline thumbnail is a few tens of kilobytes; the route caps the
     * string so one memory can never bloat a document past what Mongo will
     * comfortably hand back in a list query.
     */
    photo: { type: String, default: '' },
    date: { type: Date, default: Date.now },
  },
  baseOptions,
);
groupMemorySchema.index({ group: 1, date: -1 });

/**
 * When a badge was first seen as earned.
 *
 * Not the source of truth for *whether* it is earned — that is recomputed
 * from the group's data every load (see utils/badges.js). This row exists so
 * the unlock animation plays exactly once, and so the shelf can be ordered by
 * when things happened.
 */
const badgeAwardSchema = new Schema(
  {
    group: { ...ref('Group'), required: true, index: true },
    user: { ...ref('User'), required: true },
    badge: { type: String, required: true },
    earnedAt: { type: Date, default: Date.now },
    /** Cleared until the owner has actually seen the celebration. */
    seen: { type: Boolean, default: false },
  },
  baseOptions,
);
badgeAwardSchema.index({ group: 1, user: 1, badge: 1 }, { unique: true });

/* --------------------------------------------------------------- Expense */

const shareSchema = new Schema(
  {
    user: { ...ref('User'), required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const expenseItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const expenseSchema = new Schema(
  {
    group: { ...ref('Group'), default: null },
    description: { type: String, required: true, trim: true, maxlength: 140 },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    category: { type: String, default: 'other' },
    paidBy: {
      type: [shareSchema],
      validate: (v) => v.length > 0,
    },
    splits: {
      type: [shareSchema],
      validate: (v) => v.length > 0,
    },
    splitMode: {
      type: String,
      enum: ['equal', 'exact', 'percent', 'shares', 'items'],
      default: 'equal',
    },
    date: { type: Date, default: Date.now },
    notes: { type: String, default: '', maxlength: 500 },
    items: { type: [expenseItemSchema], default: [] },
    createdBy: ref('User'),
    list: { ...ref('ShoppingList'), default: null },
    /** Set when the schedule posted this rather than a person. */
    recurring: { ...ref('RecurringExpense'), default: null },
    /** Denormalised for cheap "expenses involving me" queries. */
    participants: [ref('User')],
  },
  baseOptions,
);
expenseSchema.index({ participants: 1, date: -1 });
expenseSchema.index({ group: 1, date: -1 });

// Mongoose 9 document hooks are async-first — no `next` callback is passed.
expenseSchema.pre('validate', function setParticipants() {
  const ids = new Set(
    [...(this.paidBy || []), ...(this.splits || [])].map((s) => String(s.user)),
  );
  this.participants = [...ids];
});

/* ------------------------------------------------------------ Settlement */

const settlementSchema = new Schema(
  {
    from: { ...ref('User'), required: true },
    to: { ...ref('User'), required: true },
    amount: { type: Number, required: true, min: 0 },
    /** Without this a payment is a bare number, so it could not be netted
        against expenses recorded in another currency. */
    currency: { type: String, default: 'INR' },
    group: { ...ref('Group'), default: null },
    note: { type: String, default: '', maxlength: 200 },
    date: { type: Date, default: Date.now },
    createdBy: ref('User'),
  },
  baseOptions,
);
settlementSchema.index({ from: 1, to: 1, date: -1 });

/* ---------------------------------------------------------- ShoppingList */

const listItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    qty: { type: Number, default: 1, min: 0 },
    unit: { type: String, default: 'pcs' },
    aisle: { type: String, default: 'pantry' },
    note: { type: String, default: '', maxlength: 200 },
    addedBy: ref('User'),
    checked: { type: Boolean, default: false },
    price: { type: Number, default: null },
    splitWith: [ref('User')],
  },
  {
    _id: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        return ret;
      },
    },
  },
);

const listSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    emoji: { type: String, default: '🛒' },
    group: { ...ref('Group'), default: null },
    members: [ref('User')],
    status: {
      type: String,
      enum: ['planning', 'shopping', 'completed'],
      default: 'planning',
    },
    store: { type: String, default: '', maxlength: 120 },
    budget: { type: Number, default: null },
    items: [listItemSchema],
    createdBy: ref('User'),
    completedAt: { type: Date, default: null },
    expense: { ...ref('Expense'), default: null },
  },
  baseOptions,
);
listSchema.index({ members: 1, updatedAt: -1 });

/* ------------------------------------------------------------- ScanUsage */

/**
 * How many receipt scans an account has run today.
 *
 * In Mongo rather than a process Map because a scan costs real money at a
 * paid API, and a limit that resets on every nodemon restart is not a limit.
 * The `user: null` row is the whole server's daily count.
 */
const scanUsageSchema = new Schema(
  {
    user: { ...ref('User'), default: null },
    /** UTC `YYYY-MM-DD`. */
    day: { type: String, required: true },
    count: { type: Number, default: 0 },
    /** Timestamps of the last few, for the rolling-hour check. */
    at: [{ type: Date }],
  },
  baseOptions,
);
scanUsageSchema.index({ user: 1, day: 1 }, { unique: true });
// Yesterday's counters are of no interest to anything.
scanUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

/* -------------------------------------------------------------- Reminder */

/**
 * A nudge already sent, so the next one can be refused.
 *
 * Its own collection rather than a query over Notification: the recipient can
 * clear their notifications, and a cooldown the person being nudged can reset
 * for the nudger is not a cooldown.
 */
const reminderSchema = new Schema(
  {
    from: { ...ref('User'), required: true },
    to: { ...ref('User'), required: true },
    /** What was owed when it was sent, in `currency` — for the record only. */
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    note: { type: String, default: '', maxlength: 140 },
  },
  baseOptions,
);
reminderSchema.index({ from: 1, to: 1, createdAt: -1 });
// A cooldown is measured in hours; a month of history is more than enough.
reminderSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

/* --------------------------------------------------------- Notification */

const notificationSchema = new Schema(
  {
    /** Recipient. */
    user: { ...ref('User'), required: true, index: true },
    actor: ref('User'),
    type: {
      type: String,
      enum: [
        'expense_added',
        'expense_updated',
        'expense_deleted',
        'settle',
        'reminder',
        'split_request',
        'split_request_update',
        'recurring_posted',
        'badge_earned',
        'group_message',
        'list_shared',
        'list_completed',
        'group_invite',
        'group_joined',
        'group_left',
        'friend_added',
        'friend_request',
        'friend_accepted',
        'account_closed',
      ],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    entityType: { type: String, enum: ['group', 'friend', 'list', 'expense', null], default: null },
    entityId: { type: String, default: null },
    read: { type: Boolean, default: false },
  },
  baseOptions,
);
notificationSchema.index({ user: 1, createdAt: -1 });

/* --------------------------------------------------- ExchangeRate */

/**
 * One cached rate table per base currency. `date` is an ISO day for a
 * historical snapshot or the literal 'latest' for the live table, which is
 * what makes the pair uniquely indexable.
 */
const exchangeRateSchema = new Schema(
  {
    base: { type: String, required: true, uppercase: true },
    date: { type: String, required: true },
    /** What the source called the day these rates are for. */
    rateDate: { type: String, default: null },
    rates: { type: Map, of: Number, default: {} },
    source: { type: String, default: '' },
    fetchedAt: { type: Date, default: Date.now },
  },
  baseOptions,
);
exchangeRateSchema.index({ base: 1, date: 1 }, { unique: true });

/* ----------------------------------------------- PushSubscription */

/**
 * One row per browser that opted in. `endpoint` is unique because that is
 * what the push service hands back, and re-subscribing the same browser
 * must update rather than duplicate.
 */
const pushSubscriptionSchema = new Schema(
  {
    user: { ...ref('User'), required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: '' },
    lastSeenAt: { type: Date, default: Date.now },
  },
  baseOptions,
);

/* -------------------------------------------------- FriendRequest */

/**
 * One row per invitation. Kept after the fact (status `accepted` /
 * `declined`) so a declined request cannot be spammed straight back, and
 * so re-friending after a removal reuses the same row.
 */
const friendRequestSchema = new Schema(
  {
    from: { ...ref('User'), required: true, index: true },
    to: { ...ref('User'), required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending',
    },
    respondedAt: { type: Date, default: null },
  },
  baseOptions,
);
// One row per ordered pair — `requestBetween` reuses it in both directions.
friendRequestSchema.index({ from: 1, to: 1 }, { unique: true });

/* -------------------------------------------------------------- Activity */

const activitySchema = new Schema(
  {
    /** Everyone who should see this entry in their feed. */
    audience: [ref('User')],
    actor: ref('User'),
    type: { type: String, required: true },
    text: { type: String, required: true },
    amount: { type: Number, default: null },
    /** The currency `amount` is in. Without it the feed cannot render a
        figure honestly, since each expense carries its own. */
    currency: { type: String, default: null },
    entityType: { type: String, default: null },
    entityId: { type: String, default: null },
  },
  baseOptions,
);
activitySchema.index({ audience: 1, createdAt: -1 });

/* ------------------------------------------------------------------ */

module.exports = {
  User: model('User', userSchema),
  Group: model('Group', groupSchema),
  FriendRequest: model('FriendRequest', friendRequestSchema),
  ExchangeRate: model('ExchangeRate', exchangeRateSchema),
  PushSubscription: model('PushSubscription', pushSubscriptionSchema),
  Expense: model('Expense', expenseSchema),
  Settlement: model('Settlement', settlementSchema),
  ShoppingList: model('ShoppingList', listSchema),
  Notification: model('Notification', notificationSchema),
  Activity: model('Activity', activitySchema),
  ScanUsage: model('ScanUsage', scanUsageSchema),
  Reminder: model('Reminder', reminderSchema),
  GroupMessage: model('GroupMessage', groupMessageSchema),
  RecurringExpense: model('RecurringExpense', recurringExpenseSchema),
  SplitRequest: model('SplitRequest', splitRequestSchema),
  SavedPlace: model('SavedPlace', savedPlaceSchema),
  GroupMemory: model('GroupMemory', groupMemorySchema),
  BadgeAward: model('BadgeAward', badgeAwardSchema),
};
