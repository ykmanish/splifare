const { Notification, Activity } = require('../models');

/**
 * Fan a notification out to everyone involved except whoever caused it.
 */
async function notify({ recipients, actor, type, title, body = '', entityType = null, entityId = null }) {
  const unique = [...new Set(recipients.map(String))].filter((id) => id !== String(actor));
  if (!unique.length) return [];

  return Notification.insertMany(
    unique.map((user) => ({ user, actor, type, title, body, entityType, entityId })),
  );
}

/**
 * Activity is shared: one document, visible to everyone in `audience`.
 * The text carries **bold** markers the client renders.
 */
async function logActivity({ audience, actor, type, text, amount = null, entityType = null, entityId = null }) {
  return Activity.create({
    audience: [...new Set(audience.map(String))],
    actor,
    type,
    text,
    amount,
    entityType,
    entityId,
  });
}

module.exports = { notify, logActivity };
