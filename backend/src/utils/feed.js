const { Notification, Activity } = require('../models');
const { sendPush } = require('./push');

/** Where a notification of this shape should open in the app. */
function routeFor(type, entityType, entityId) {
  if (type === 'friend_request') return '/friends';
  if (entityType === 'group' && entityId) return `/groups/${entityId}`;
  if (entityType === 'friend' && entityId) return `/friends/${entityId}`;
  if (entityType === 'list' && entityId) return `/lists/${entityId}`;
  return '/activity';
}

/**
 * Fan a notification out to everyone involved except whoever caused it.
 *
 * The rows are written first and awaited; the push is fired afterwards and
 * deliberately not awaited, because a slow push service must not hold up the
 * request that triggered it. sendPush never rejects, but `.catch` is kept as
 * a belt-and-braces guard against an unhandled rejection.
 */
async function notify({ recipients, actor, type, title, body = '', entityType = null, entityId = null }) {
  const unique = [...new Set(recipients.map(String))].filter((id) => id !== String(actor));
  if (!unique.length) return [];

  const rows = await Notification.insertMany(
    unique.map((user) => ({ user, actor, type, title, body, entityType, entityId })),
  );

  sendPush(unique, {
    title,
    body,
    url: routeFor(type, entityType, entityId),
    tag: `${type}:${entityId || 'none'}`,
  }).catch((err) => console.error('[notify] push failed:', err.message));

  return rows;
}

/**
 * Activity is shared: one document, visible to everyone in `audience`.
 * The text carries **bold** markers the client renders.
 */
async function logActivity({
  audience,
  actor,
  type,
  text,
  amount = null,
  currency = null,
  entityType = null,
  entityId = null,
}) {
  return Activity.create({
    audience: [...new Set(audience.map(String))],
    actor,
    type,
    text,
    amount,
    currency,
    entityType,
    entityId,
  });
}

module.exports = { notify, logActivity, routeFor };
