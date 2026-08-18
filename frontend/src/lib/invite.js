/**
 * Invite links.
 *
 * A QR that only carries the six characters still leaves the reader typing
 * them in. These links land the person on the right screen with the code
 * already filled, so scanning is the whole journey.
 *
 * `origin` is read at call time rather than baked in, so the same code works
 * on localhost, on a preview host and in production without configuration.
 */

const origin = () => (typeof window === 'undefined' ? '' : window.location.origin);

/** Opens the groups screen with the join sheet primed for this room code. */
export const groupInviteLink = (code) =>
  code ? `${origin()}/groups?join=${encodeURIComponent(code)}` : '';

/** Opens the friends screen with an add request primed for this Splitta code. */
export const friendInviteLink = (code) =>
  code ? `${origin()}/friends?add=${encodeURIComponent(code)}` : '';

/**
 * Read a code back out of whatever a camera just decoded.
 *
 * A QR from this app holds a full invite URL, but people also paste bare
 * codes, and other apps wrap links in tracking. So: try to parse it as a URL
 * and read the query, and otherwise fall back to treating the whole string as
 * a code. Returns `null` when there is nothing code-shaped in it.
 *
 * The host is deliberately not checked. A code lifted from someone else's
 * domain is worthless on its own — it is looked up against our own API, and
 * only a room code that actually exists there resolves to anything. Rejecting
 * foreign hosts would just break links that pass through a URL shortener.
 */
export function parseInviteCode(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const clean = (v) =>
    String(v || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

  // A URL from us, or one that merely carries the params.
  try {
    const url = new URL(raw);
    const join = clean(url.searchParams.get('join'));
    if (join.length >= 4) return { kind: 'group', code: join };

    const add = clean(url.searchParams.get('add'));
    if (add.length >= 4) return { kind: 'friend', code: add };

    // A trailing path segment, in case a link shape changes later.
    const last = clean(url.pathname.split('/').filter(Boolean).pop());
    if (last.length === 6) return { kind: 'unknown', code: last };

    return null;
  } catch {
    /* not a URL — fall through */
  }

  const bare = clean(raw);
  if (bare.length >= 4 && bare.length <= 12) return { kind: 'unknown', code: bare };
  return null;
}
