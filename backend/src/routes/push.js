const express = require('express');
const { PushSubscription } = require('../models');
const { requireAuth, asyncHandler } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const { sendPush, pushEnabled, PUBLIC_KEY } = require('../utils/push');

const router = express.Router();
router.use(requireAuth);

/** The client needs the public key before it can subscribe. */
router.get(
  '/key',
  asyncHandler(async (req, res) => {
    res.json({ enabled: pushEnabled, publicKey: pushEnabled ? PUBLIC_KEY : null });
  }),
);

/**
 * Register (or re-register) this browser.
 *
 * Keyed on the endpoint, so the same browser re-subscribing updates its row
 * instead of piling up duplicates — and if the endpoint previously belonged
 * to another account on a shared device, it moves across.
 */
router.post(
  '/subscribe',
  asyncHandler(async (req, res) => {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new HttpError(400, 'That subscription is missing its endpoint or keys');
    }

    await PushSubscription.updateOne(
      { endpoint: String(endpoint) },
      {
        $set: {
          user: req.user._id,
          endpoint: String(endpoint),
          keys: { p256dh: String(keys.p256dh), auth: String(keys.auth) },
          userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
          lastSeenAt: new Date(),
        },
      },
      { upsert: true },
    );

    res.status(201).json({ ok: true });
  }),
);

router.post(
  '/unsubscribe',
  asyncHandler(async (req, res) => {
    const endpoint = String(req.body?.endpoint || '');
    if (endpoint) await PushSubscription.deleteOne({ endpoint, user: req.user._id });
    else await PushSubscription.deleteMany({ user: req.user._id });
    res.json({ ok: true });
  }),
);

/** Proves the round trip works, from the Settings screen. */
router.post(
  '/test',
  asyncHandler(async (req, res) => {
    const result = await sendPush([req.userId], {
      title: 'Splitta push is working',
      body: 'This is what a notification will look like.',
      url: '/activity',
      tag: 'splitta-test',
    });

    if (result.skipped) throw new HttpError(503, 'Push is not configured on the server');
    if (!result.sent) throw new HttpError(404, 'No browser is subscribed for this account yet');

    res.json(result);
  }),
);

module.exports = router;
