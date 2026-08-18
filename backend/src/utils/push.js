const webpush = require('web-push');
const { PushSubscription } = require('../models');

/**
 * Web Push delivery.
 *
 * Without VAPID keys configured the whole module turns into a no-op rather
 * than throwing — a missing key must not take down expense creation, which
 * is what calls this by way of notify().
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@splitta.app';

const enabled = !!(PUBLIC_KEY && PRIVATE_KEY);

if (enabled) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
} else {
  console.warn('[push] VAPID keys missing — web push is disabled');
}

/**
 * A push service answers 404 or 410 once a browser has thrown the
 * subscription away. Those rows are dead forever, so they get deleted;
 * anything else is treated as a transient failure and left alone.
 */
const GONE = new Set([404, 410]);

/**
 * Fan a payload out to every browser belonging to `userIds`.
 * Always resolves — delivery is best-effort by design.
 */
async function sendPush(userIds, payload) {
  if (!enabled) return { sent: 0, pruned: 0, skipped: true };

  const ids = [...new Set((userIds || []).map(String))];
  if (!ids.length) return { sent: 0, pruned: 0 };

  const subs = await PushSubscription.find({ user: { $in: ids } });
  if (!subs.length) return { sent: 0, pruned: 0 };

  const body = JSON.stringify(payload);
  const dead = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          body,
          { TTL: 60 * 60 * 24, urgency: 'normal' },
        );
        sent++;
      } catch (err) {
        if (GONE.has(err.statusCode)) dead.push(sub._id);
        else console.error('[push] send failed:', err.statusCode || '', err.message);
      }
    }),
  );

  if (dead.length) await PushSubscription.deleteMany({ _id: { $in: dead } });

  return { sent, pruned: dead.length };
}

module.exports = { sendPush, pushEnabled: enabled, PUBLIC_KEY };
