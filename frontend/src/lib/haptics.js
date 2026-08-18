/**
 * Haptic feedback for the moments that matter.
 *
 * Only two events in this app are worth a buzz: money going on the ledger and
 * money coming off it. Everything else would be noise, and a phone that
 * vibrates constantly gets its haptics switched off wholesale.
 *
 * Support is Android-only in practice — iOS Safari does not implement the
 * Vibration API, with or without an installed PWA. Every call here is a silent
 * no-op where it is unavailable, so callers never need to check.
 */

const KEY = 'splitta.haptics';

export const hapticsSupported = () =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/**
 * On by default, and stored per device rather than on the account: whether a
 * phone should buzz has nothing to do with whether a laptop should.
 */
export function hapticsEnabled() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true; // private mode — behave as default rather than break
  }
}

export function setHapticsEnabled(on) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* private mode — the setting simply will not persist */
  }
}

/** `pattern` is ms, or alternating vibrate/pause durations. */
function buzz(pattern) {
  if (!hapticsSupported() || !hapticsEnabled()) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

export const haptics = {
  /** A single tick — a toggle, a tick-off. */
  tap: () => buzz(10),

  /**
   * Two beats, the second longer: reads as "that landed". Used when an
   * expense is recorded.
   */
  success: () => buzz([18, 45, 32]),

  /**
   * Three rising beats — a deliberately bigger moment than adding a bill,
   * because clearing one is the good news.
   */
  settled: () => buzz([14, 35, 20, 35, 45]),

  /** Two heavy beats, for a failure the reader needs to notice. */
  error: () => buzz([40, 70, 40]),
};
