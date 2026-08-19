/**
 * Reference-counted body scroll lock.
 *
 * Every overlay used to save `body.style.overflow` on open and restore its own
 * copy on close. That breaks the moment two overlap, which the app does
 * constantly — "Delete this group" closes the settings sheet and opens a
 * confirm in the same handler. The settings sheet then restores `''` while the
 * confirm still holds a captured `'hidden'`, and when the confirm closes it
 * writes `'hidden'` back: the page is locked with nothing on screen to unlock
 * it.
 *
 * A counter fixes it regardless of ordering. The first lock records the real
 * value, the last release puts it back, and anything in between is a no-op.
 */

let depth = 0;
let original = null;

/** Locks scrolling and returns an idempotent release function. */
export function lockScroll() {
  if (typeof document === 'undefined') return () => {};

  if (depth === 0) {
    original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  depth += 1;

  let released = false;
  return function release() {
    // Guarded because React can invoke a cleanup more than once in dev.
    if (released) return;
    released = true;

    depth = Math.max(0, depth - 1);
    if (depth === 0) {
      document.body.style.overflow = original ?? '';
      original = null;
    }
  };
}

/**
 * Escape hatch for a stuck page. Nothing calls it in normal operation — it
 * exists so a bug in one overlay can never strand the whole app.
 */
export function forceUnlockScroll() {
  depth = 0;
  original = null;
  if (typeof document !== 'undefined') document.body.style.overflow = '';
}
