import { api } from './api';

/**
 * Web Push plumbing on the client.
 *
 * Every entry point is defensive: push is unavailable in a plain iframe, on
 * insecure origins, on iOS outside an installed PWA, and whenever the user
 * has blocked notifications. None of that should throw into a render.
 */

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** 'granted' | 'denied' | 'default' | 'unsupported' */
export const permissionState = () =>
  pushSupported() ? Notification.permission : 'unsupported';

/** VAPID keys travel as base64url; PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

let registering = null;

/** Registers the worker once per page life and resolves when it is usable. */
export async function registerServiceWorker() {
  if (!pushSupported()) return null;
  if (registering) return registering;

  registering = navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then(() => navigator.serviceWorker.ready)
    .catch((err) => {
      console.warn('[push] service worker registration failed:', err.message);
      return null;
    });

  return registering;
}

/** The subscription this browser already holds, if any. */
export async function currentSubscription() {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    return (await reg?.pushManager.getSubscription()) || null;
  } catch {
    return null;
  }
}

/**
 * Ask permission, subscribe, and hand the subscription to the server.
 * Returns `{ ok }` or `{ ok: false, reason }` — never throws for the
 * ordinary refusals, since "the user said no" is not an error.
 */
export async function enablePush() {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: permission };

  const { enabled, publicKey } = await api.pushKey();
  if (!enabled || !publicKey) return { ok: false, reason: 'server-disabled' };

  const reg = await registerServiceWorker();
  if (!reg) return { ok: false, reason: 'no-worker' };

  let sub = await reg.pushManager.getSubscription();

  // A subscription minted against a different VAPID key cannot be reused, and
  // the mismatch only shows up as a silent delivery failure. Re-create it.
  if (sub) {
    const existing = sub.options?.applicationServerKey;
    const wanted = urlBase64ToUint8Array(publicKey);
    const same =
      existing &&
      new Uint8Array(existing).length === wanted.length &&
      new Uint8Array(existing).every((b, i) => b === wanted[i]);
    if (!same) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
  }

  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await api.pushSubscribe(sub.toJSON());
  return { ok: true };
}

/** Drops the local subscription and forgets it server-side. */
export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) {
    await api.pushUnsubscribe(null).catch(() => {});
    return { ok: true };
  }
  const { endpoint } = sub;
  await sub.unsubscribe().catch(() => {});
  await api.pushUnsubscribe(endpoint).catch(() => {});
  return { ok: true };
}

/** Plain-English reason, for a toast. */
export const pushReason = (reason) =>
  ({
    unsupported: 'This browser cannot receive push notifications.',
    denied: 'Notifications are blocked — turn them back on in your browser settings.',
    default: 'Permission was dismissed, so nothing changed.',
    'server-disabled': 'The server has no push keys configured.',
    'no-worker': 'The service worker could not start.',
  })[reason] || 'Push could not be turned on.';
