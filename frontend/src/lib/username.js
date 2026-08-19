/**
 * Usernames.
 *
 * A handle people read and type, so it stays narrow: letters, digits, dots and
 * underscores, 3-20 characters, opening on a letter or digit. Kept in step with
 * `USERNAME_RE` in `backend/src/routes/auth.js` — the server is the authority,
 * this only spares the user a round trip to be told the obvious.
 */
const USERNAME_RE = /^[a-z0-9][a-z0-9_.]{2,19}$/;

/** Lower-cased, trimmed, a leading `@` dropped — people type the sigil. */
export const normalizeUsername = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');

export const isValidUsername = (value) => USERNAME_RE.test(normalizeUsername(value));

/**
 * The reason it is invalid, for an inline error. Empty string when it is fine
 * or still blank — a username is optional, so an untouched field is not wrong.
 */
export function usernameError(value) {
  const name = normalizeUsername(value);
  if (!name) return '';
  if (name.length < 3) return 'At least 3 characters';
  if (name.length > 20) return 'At most 20 characters';
  if (!/^[a-z0-9]/.test(name)) return 'Start with a letter or number';
  if (!USERNAME_RE.test(name)) return 'Letters, numbers, dots and underscores only';
  return '';
}

/**
 * What to show next to someone's name. Falls back to nothing rather than
 * inventing one from an email address — a handle nobody chose is a handle
 * nobody can be reached by.
 */
export const handleOf = (user) => (user?.username ? '@' + user.username : '');
