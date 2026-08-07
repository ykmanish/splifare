const express = require('express');
const { Notification, Activity } = require('../models');
const { requireAuth, asyncHandler } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

/* ---------------------------------------------------- notifications */

router.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const notifications = await Notification.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .limit(100);
    const unread = await Notification.countDocuments({ user: req.userId, read: false });
    res.json({ notifications: notifications.map((n) => n.toJSON()), unread });
  }),
);

router.patch(
  '/notifications/:id/read',
  asyncHandler(async (req, res) => {
    await Notification.updateOne({ _id: req.params.id, user: req.userId }, { read: true });
    res.json({ ok: true });
  }),
);

router.post(
  '/notifications/read-all',
  asyncHandler(async (req, res) => {
    await Notification.updateMany({ user: req.userId, read: false }, { read: true });
    res.json({ ok: true });
  }),
);

router.delete(
  '/notifications',
  asyncHandler(async (req, res) => {
    await Notification.deleteMany({ user: req.userId });
    res.json({ ok: true });
  }),
);

/* --------------------------------------------------------- activity */

router.get(
  '/activity',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    const activity = await Activity.find({ audience: req.userId })
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json({ activity: activity.map((a) => a.toJSON()) });
  }),
);

module.exports = router;
