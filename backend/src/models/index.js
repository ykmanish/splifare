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
    /** People this user has added — the "friends" list. */
    friends: [ref('User')],
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
        'friend_added',
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

/* -------------------------------------------------------------- Activity */

const activitySchema = new Schema(
  {
    /** Everyone who should see this entry in their feed. */
    audience: [ref('User')],
    actor: ref('User'),
    type: { type: String, required: true },
    text: { type: String, required: true },
    amount: { type: Number, default: null },
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
  Expense: model('Expense', expenseSchema),
  Settlement: model('Settlement', settlementSchema),
  ShoppingList: model('ShoppingList', listSchema),
  Notification: model('Notification', notificationSchema),
  Activity: model('Activity', activitySchema),
};
