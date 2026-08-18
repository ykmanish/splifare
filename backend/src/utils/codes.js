const crypto = require('crypto');

/**
 * Ambiguity-free alphabet: no O/0, I/1, or S/5. Codes get read aloud and
 * retyped from a chat message, so the pairs people confuse are left out.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ23456789';

/** One random code of `length` characters. */
function randomCode(length = 6) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Normalise whatever the user typed into the stored form. */
function normaliseCode(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * A code no document in `Model` is using yet. Collisions are vanishingly
 * rare at 31^6, but a retry loop costs nothing and keeps the unique index
 * from turning one into a 409.
 */
async function uniqueCode(Model, { length = 6, field = 'code', tries = 12 } = {}) {
  for (let i = 0; i < tries; i++) {
    const code = randomCode(length);
    if (!(await Model.exists({ [field]: code }))) return code;
  }
  // Longer codes have far more room — only reached if the short space is full.
  return randomCode(length + 2);
}

module.exports = { ALPHABET, randomCode, normaliseCode, uniqueCode };
