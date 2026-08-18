/* eslint-disable no-undef */
/**
 * Splitta service worker.
 *
 * Scope is deliberately narrow: receive pushes, focus the right screen when
 * one is tapped, and serve a small offline page for navigations that fail.
 *
 * It does NOT precache the app's JS. Next.js fingerprints its chunks per
 * build, and a worker holding an old chunk while the HTML asks for a new one
 * produces a white screen that only a manual cache clear fixes. Losing an
 * offline shell is a much cheaper problem than that, so navigations go to the
 * network first and only fall back to the cache.
 */

const VERSION = 'splitta-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Network-first for page loads, with the offline card as the last resort. */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(VERSION);
      return (await cache.match(OFFLINE_URL)) || Response.error();
    }),
  );
});

/* ------------------------------------------------------------------ push */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Splitta', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Splitta';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      // Same tag replaces rather than stacks, so ten edits to one expense do
      // not become ten separate notifications.
      tag: data.tag || 'splitta',
      renotify: true,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/activity' },
    }),
  );
});

/**
 * Reuse an already-open Splitta tab where there is one — opening a fresh tab
 * each time a notification is tapped is how people end up with fifteen.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/activity';

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

/** Fires when a push service rotates a subscription out from under us. */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // The page owns the auth token, so it does the re-subscribing.
      all.forEach((client) => client.postMessage({ type: 'push-resubscribe' }));
    })(),
  );
});
