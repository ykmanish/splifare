/**
 * Draft persistence for the expense sheet.
 *
 * The sheet is a bottom sheet you can dismiss by flicking down or tapping the
 * backdrop, which makes losing a half-typed bill genuinely easy. This keeps the
 * work on the device until it is either submitted or explicitly discarded.
 *
 * Local, not server-side: a draft is scratch work, and syncing it would mean
 * an unfinished bill appearing on another device mid-sentence.
 */

const KEY = 'splitta.expenseDraft';

/** A draft older than a day is scratch nobody wants back. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Whether there is anything worth keeping. Without this, merely opening and
 * closing the sheet would leave a draft that then "restores" as an empty form
 * and quietly overrides the next prefill.
 */
function hasContent(form) {
  if (!form) return false;
  if (Number(form.amount) > 0) return true;
  if (String(form.description || '').trim()) return true;
  if (String(form.notes || '').trim()) return true;
  return (form.items || []).some((i) => String(i?.name || '').trim() || Number(i?.price) > 0);
}

export function readExpenseDraft() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const { at = 0, form = null } = JSON.parse(raw);
    if (!hasContent(form) || Date.now() - at > STALE_AFTER_MS) {
      clearExpenseDraft();
      return null;
    }
    return form;
  } catch {
    // Corrupt or unreadable: drop it rather than fail opening the sheet.
    clearExpenseDraft();
    return null;
  }
}

export function writeExpenseDraft(form) {
  if (!hasContent(form)) {
    clearExpenseDraft();
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), form }));
  } catch {
    /* private mode, or storage full — the sheet still works, just not the draft */
  }
}

export function clearExpenseDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
