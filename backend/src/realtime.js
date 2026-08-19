const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { User } = require('./models');
const { BUILD } = require('./utils/build');

/**
 * Realtime push over websockets.
 *
 * The client used to learn about other people's changes by polling every 15
 * seconds, which made a shared expense feel like it arrived late and a
 * notification later still. This closes that gap.
 *
 * The protocol is deliberately thin: the server never sends records, only the
 * names of the slices that changed. The client re-fetches those. That means a
 * dropped or out-of-order message can never leave the client holding a wrong
 * balance — the worst case is a redundant GET — and the emit sites stay one
 * line each instead of having to serialise a payload the client already knows
 * how to fetch.
 *
 * Every socket joins a room named after its user id, so a fan-out to "everyone
 * on this expense" is one emit per participant and nothing leaks between
 * accounts.
 */

let io = null;

const room = (userId) => `user:${String(userId)}`;

/** Attaches the socket server to an existing HTTP server. */
function initRealtime(httpServer, { allowedOrigins }) {
  io = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
    // The same path the client defaults to; named here so it is greppable.
    path: '/socket.io',
    // Websocket first, long-polling only if the upgrade fails (some proxies).
    transports: ['websocket', 'polling'],
  });

  /*
   * Authenticate before the connection is established, not after. An
   * unauthenticated socket is refused rather than allowed to sit idle, so
   * there is no window in which a client is connected but roomless.
   */
  io.use(async (socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers.authorization || '').replace(/^Bearer /, '');

    if (!token) return next(new Error('Not signed in'));

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return next(new Error('Invalid session'));
    }

    /*
     * The token alone is not enough. The client reconnects with backoff, so
     * a closed account whose socket was dropped would simply come back and
     * sit in its room for the token's remaining life — receiving other
     * people's notifications. Check the row, not just the signature.
     */
    try {
      const user = await User.findById(payload.sub).select('deletedAt');
      if (!user || user.deletedAt) return next(new Error('Invalid session'));
    } catch {
      return next(new Error('Invalid session'));
    }

    socket.userId = String(payload.sub);
    return next();
  });

  io.on('connection', (socket) => {
    socket.join(room(socket.userId));

    /*
     * Lets the client tell "connected" from "connected and authenticated",
     * and carries the build it is talking to. A deploy restarts the server,
     * every socket reconnects, and the build in this payload is how a client
     * finds out its own copy of the app is now behind — no polling.
     */
    socket.emit('ready', { userId: socket.userId, build: BUILD });

    socket.on('disconnect', () => {
      /* rooms are cleaned up by socket.io */
    });
  });

  console.log('  Realtime ready      → websocket on /socket.io');
  return io;
}

/**
 * Tell these users that some slices of their data changed.
 *
 * `scopes` are the same keys AppContext's `refresh()` understands, so the
 * client can hand them straight to it: 'expenses', 'settlements', 'groups',
 * 'people', 'lists', 'notifications', 'activity', 'requests'.
 *
 * Never throws: realtime is a nicety layered on top of requests that have
 * already succeeded, and it must not be able to fail one.
 */
function emitSync(userIds, scopes, meta = {}) {
  if (!io) return;
  try {
    const unique = [...new Set((userIds || []).map(String))].filter(Boolean);
    if (!unique.length || !scopes?.length) return;

    for (const id of unique) {
      io.to(room(id)).emit('sync', { scopes, ...meta });
    }
  } catch (err) {
    console.error('[realtime] emitSync failed:', err.message);
  }
}

/** A notification was written for these users — used for the badge and panel. */
function emitNotification(userIds, notification) {
  if (!io) return;
  try {
    for (const id of [...new Set((userIds || []).map(String))]) {
      io.to(room(id)).emit('notification', notification);
    }
  } catch (err) {
    console.error('[realtime] emitNotification failed:', err.message);
  }
}

/**
 * Drop every socket a user currently holds. Used when an account closes:
 * without it the client keeps a live, authenticated connection to a room
 * that should no longer exist.
 */
async function disconnectUser(userId) {
  if (!io) return 0;
  try {
    const sockets = await io.in(room(userId)).fetchSockets();
    sockets.forEach((s) => s.disconnect(true));
    return sockets.length;
  } catch (err) {
    console.error('[realtime] disconnectUser failed:', err.message);
    return 0;
  }
}

/** How many sockets a user currently has open, for diagnostics. */
async function socketCount(userId) {
  if (!io) return 0;
  const sockets = await io.in(room(userId)).fetchSockets();
  return sockets.length;
}

module.exports = { initRealtime, emitSync, emitNotification, disconnectUser, socketCount };
