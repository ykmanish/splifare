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

const VERSION = 'splitta-v2';
const OFFLINE_URL = '/offline.html';

/*
 * Where a share lands. The OS POSTs multipart form data to /share, and a page
 * cannot read a POST body — so this worker takes the request, stashes the
 * payload in Cache Storage and redirects to a screen that reads it back out.
 * Its own cache, so clearing a share never touches the offline page.
 */
const SHARE_CACHE = 'splitta-share';
const SHARE_TEXT = '/__shared/text';
const SHARE_FILE = '/__shared/file';

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
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== VERSION && k !== SHARE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Lift a shared payload out of the POST and hand the page a URL it can load. */
async function receiveShare(request) {
  try {
    const form = await request.formData();

    const text = ['title', 'text', 'url']
      .map((k) => form.get(k))
      .filter((v) => typeof v === 'string' && v.trim())
      .join('\n');

    const cache = await caches.open(SHARE_CACHE);
    await cache.put(
      SHARE_TEXT,
      new Response(JSON.stringify({ text, at: Date.now() }), {
        headers: { 'content-type': 'application/json' },
      }),
    );

    const file = form.get('media');
    if (file && typeof file !== 'string' && file.size) {
      await cache.put(
        SHARE_FILE,
        new Response(file, {
          headers: {
            'content-type': file.type || 'application/octet-stream',
            'x-share-name': encodeURIComponent(file.name || 'shared-image'),
          },
        }),
      );
    } else {
      // Otherwise a previous share's image would resurface under new text.
      await cache.delete(SHARE_FILE);
    }
  } catch {
    /* the screen handles an empty stash on its own */
  }

  // 303 so the browser follows with a GET rather than re-POSTing.
  return Response.redirect('/share?received=1', 303);
}

/** Network-first for page loads, with the offline card as the last resort. */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method === 'POST' && new URL(request.url).pathname === '/share') {
    event.respondWith(receiveShare(request));
    return;
  }

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
