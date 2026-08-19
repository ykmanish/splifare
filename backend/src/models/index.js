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
};
