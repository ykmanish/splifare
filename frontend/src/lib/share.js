/**
 * Reading a Web Share payload back out.
 *
 * The service worker takes the OS's multipart POST and parks it in Cache
 * Storage, because a page cannot read a POST body. This is the other half:
 * the /share screen lifts it out, uses it, then clears it.
 */

const SHARE_CACHE = 'splitta-share';
const SHARE_TEXT = '/__shared/text';
const SHARE_FILE = '/__shared/file';

/** A share older than this is treated as gone, not resurfaced later. */
const STALE_AFTER_MS = 10 * 60 * 1000;

const cacheAvailable = () => typeof window !== 'undefined' && 'caches' in window;

/**
 * `{ text, blob, name }`, or `null` when nothing was shared (or the stash has
 * gone stale — otherwise a share from an hour ago would ambush the next
 * person to open the screen).
 */
export async function readSharedPayload() {
  if (!cacheAvailable()) return null;

  try {
    const cache = await caches.open(SHARE_CACHE);

    const textRes = await cache.match(SHARE_TEXT);
    if (!textRes) return null;

    const { text = '', at = 0 } = await textRes.json();
    if (Date.now() - at > STALE_AFTER_MS) {
      await clearSharedPayload();
      return null;
    }

    const fileRes = await cache.match(SHARE_FILE);
    const blob = fileRes ? await fileRes.blob() : null;
    const name = fileRes
      ? decodeURIComponent(fileRes.headers.get('x-share-name') || 'shared-image')
      : '';

    if (!text && !blob) return null;
    return { text, blob, name };
  } catch {
    return null;
  }
}

export async function clearSharedPayload() {
  if (!cacheAvailable()) return;
  try {
    const cache = await caches.open(SHARE_CACHE);
    await Promise.all([cache.delete(SHARE_TEXT), cache.delete(SHARE_FILE)]);
  } catch {
    /* nothing to clear */
  }
}

/* ------------------------------------------------------------------ parsing */

/**
 * Symbol-anchored first: a payment message is full of numbers — reference
 * ids, dates, card tails — and the one attached to a currency marker is the
 * one that means money. Only if none is found do we consider a bare decimal,
 * which at least looks like a price rather than an account number.
 */
const ANCHORED = /(?:₹|rs\.?|inr|\$|usd|€|eur|£|gbp|aed|sgd)\s*([\d][\d,]*(?:\.\d{1,2})?)/i;
const TRAILING = /([\d][\d,]*(?:\.\d{1,2})?)\s*(?:₹|rs\.?|inr|\$|usd|€|eur|£|gbp|aed|sgd)/i;
const BARE_DECIMAL = /(?:^|\s)([\d][\d,]*\.\d{2})(?:\s|$)/;

const toNumber = (raw) => {
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** The amount a shared message is about, or `null` if it cannot be trusted. */
export function parseSharedAmount(text) {
  const body = String(text || '');
  if (!body) return null;

  for (const re of [ANCHORED, TRAILING, BARE_DECIMAL]) {
    const m = body.match(re);
    const value = m && toNumber(m[1]);
    // A cap keeps a mis-read reference number out of the amount field.
    if (value && value < 10_000_000) return value;
  }
  return null;
}

/**
 * A description worth pre-filling. The first line that is not just an amount
 * or a bare URL, capped to the field's own limit.
 */
export function parseSharedDescription(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/^https?:\/\/\S+$/i.test(line)) continue;
    // Skip a line that is only a number and a currency marker.
    if (/^[^a-z]*$/i.test(line)) continue;
    return line.slice(0, 140);
  }
  return '';
}
