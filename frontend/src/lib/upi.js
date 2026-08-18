/**
 * UPI deep links.
 *
 * A `upi://pay?…` URL hands the payment off to whatever UPI app the phone
 * has, pre-filled. Splitta never sees money, holds no credentials and needs
 * no gateway — but it also never learns whether the transfer succeeded, so
 * the recorded settlement stays a separate, explicit step.
 */

/** Same shape the server enforces, so the client rejects before the round trip. */
export const UPI_RE = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$/;

export const isValidUpiId = (id) => UPI_RE.test(String(id || '').trim());

/** UPI settles in rupees only — there is no currency field to negotiate. */
export const UPI_CURRENCY = 'INR';

/**
 * Build the link. Returns `null` rather than a half-built URL whenever it
 * would not work: no payee handle, a malformed one, nothing to pay, or a
 * currency UPI cannot carry.
 */
export function buildUpiLink({ upiId, payeeName, amount, note, currency = UPI_CURRENCY }) {
  const vpa = String(upiId || '').trim();
  if (!isValidUpiId(vpa)) return null;

  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (String(currency).toUpperCase() !== UPI_CURRENCY) return null;

  /*
   * Built by hand rather than with URLSearchParams, which gets two details
   * wrong for this scheme: it percent-encodes the `@` in the payee address,
   * and it writes spaces as `+`. Plenty of UPI apps parse the intent loosely
   * and choke on both, so the address goes in verbatim and spaces become
   * `%20`.
   *
   * Interpolating `vpa` raw is safe only because UPI_RE has already passed
   * it: the pattern permits no `&`, `=`, `?` or `#`, so it cannot invent a
   * parameter. Never move this above the validation.
   */
  const parts = [
    `pa=${vpa}`,
    // Two decimals exactly: some apps reject a bare integer or a long float.
    `am=${value.toFixed(2)}`,
    `cu=${UPI_CURRENCY}`,
  ];

  const name = String(payeeName || '').trim();
  if (name) parts.push(`pn=${encodeURIComponent(name.slice(0, 50))}`);

  const tn = String(note || '').trim();
  if (tn) parts.push(`tn=${encodeURIComponent(tn.slice(0, 50))}`);

  return `upi://pay?${parts.join('&')}`;
}

/**
 * Whether a UPI hand-off is worth offering at all: someone to pay, a real
 * handle, an amount, and rupees.
 */
export const canPayByUpi = ({ upiId, amount, currency }) =>
  !!buildUpiLink({ upiId, amount, currency });
