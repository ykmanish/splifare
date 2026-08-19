'use client';

import { io } from 'socket.io-client';
import { getToken } from './api';

/**
 * Socket connection to the API.
 *
 * One shared connection for the whole app rather than one per screen: the
 * server puts every socket in a room keyed by user id, so a second connection
 * would just double the traffic for the same messages.
 *
 * The server only ever sends the *names* of the data slices that changed. The
 * client re-fetches them, which means a missed or duplicated message can never
 * leave the UI showing a wrong balance — the worst case is a wasted GET.
 */

/** Same origin the REST client uses, minus the `/api` suffix. */
function serverOrigin() {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
  try {
    return new URL(base).origin;
  } catch {
    return base.replace(/\/api\/?$/, '');
  }
}

let socket = null;

export function connectSocket() {
  if (typeof window === 'undefined') return null;

  const token = getToken();
  if (!token) return null;

  if (socket) {
    // A token change means a different account; the old socket is in the wrong
    // room, so it has to go rather than be reused.
    if (socket.auth?.token === token) return socket;
    disconnectSocket();
  }

  socket = io(serverOrigin(), {
    auth: { token },
    // Websocket first; polling only where a proxy refuses the upgrade.
    transports: ['websocket', 'polling'],
    // Reconnect with backoff. The REST poll stays on as a slow safety net, so
    // a long outage degrades to the old behaviour rather than to nothing.
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 10000,
    timeout: 8000,
  });

  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  try {
    socket.removeAllListeners();
    socket.disconnect();
  } catch {
    /* already gone */
  }
  socket = null;
}

export const getSocket = () => socket;
