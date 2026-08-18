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
