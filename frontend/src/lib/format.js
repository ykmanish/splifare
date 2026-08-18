export const CURRENCIES = {
  INR: { code: 'INR', symbol: '₹', locale: 'en-IN', name: 'Indian Rupee' },
  USD: { code: 'USD', symbol: '$', locale: 'en-US', name: 'US Dollar' },
  EUR: { code: 'EUR', symbol: '€', locale: 'de-DE', name: 'Euro' },
  GBP: { code: 'GBP', symbol: '£', locale: 'en-GB', name: 'British Pound' },
  AED: { code: 'AED', symbol: 'د.إ', locale: 'en-AE', name: 'UAE Dirham' },
  SGD: { code: 'SGD', symbol: 'S$', locale: 'en-SG', name: 'Singapore Dollar' },
  JPY: { code: 'JPY', symbol: '¥', locale: 'ja-JP', name: 'Japanese Yen' },
  AUD: { code: 'AUD', symbol: 'A$', locale: 'en-AU', name: 'Australian Dollar' },
};

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Money as a display string, e.g. ₹1,240.50 */
export function money(amount, currency = 'INR', { compact = false, sign = false } = {}) {
  const c = CURRENCIES[currency] || CURRENCIES.INR;
  const value = Number(amount) || 0;
  const abs = Math.abs(value);

  let body;
  if (compact && abs >= 100000) {
    body = new Intl.NumberFormat(c.locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(abs);
  } else {
    body = new Intl.NumberFormat(c.locale, {
      minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(abs);
  }

  const prefix = sign && value !== 0 ? (value > 0 ? '+' : '−') : value < 0 ? '−' : '';
  return `${prefix}${c.symbol}${body}`;
}

/** Bare number, no symbol — for inputs */
export function plain(amount) {
  const n = Number(amount) || 0;
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

export const symbolOf = (code) => (CURRENCIES[code] || CURRENCIES.INR).symbol;

/**
 * Take a formatted amount apart so a hero can style its pieces differently:
 * the symbol stays in the UI face, the digits can take the display face, and
 * the decimals can recede.
 *
 * The symbol is peeled off with `symbolOf` rather than a regex, so this holds
 * for every currency in CURRENCIES (all of them lead with their symbol, and
 * none collides with digit grouping). `money` remains the only place the
 * number itself is formatted.
 */
export function splitAmount(amount, currency = 'INR') {
  const symbol = symbolOf(currency);
  const text = money(Math.abs(Number(amount) || 0), currency);
  const digits = text.startsWith(symbol) ? text.slice(symbol.length) : text;
  const m = digits.match(/^(.*?)([.,]\d{2})$/);
  return { symbol, whole: m ? m[1] : digits, cents: m ? m[2] : '' };
}

/* ---------------------------------------------------------------- dates */

const DAY = 86400000;

export function formatDate(iso, style = 'medium') {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (style === 'short') return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (style === 'long')
    return d.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatDate(iso, 'short');
}

/** "Today" / "Yesterday" / "12 Mar" — for grouping feeds by day */
export function dayLabel(iso) {
  const d = new Date(iso);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const delta = Math.round((startOf(new Date()) - startOf(d)) / DAY);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Yesterday';
  if (delta < 7 && delta > 0) return d.toLocaleDateString('en-GB', { weekday: 'long' });
  return formatDate(iso, d.getFullYear() === new Date().getFullYear() ? 'short' : 'medium');
}

export const todayISO = () => new Date().toISOString();
export const dateInputValue = (iso) => new Date(iso).toISOString().slice(0, 10);

/* ---------------------------------------------------------------- people */

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function firstName(name = '') {
  return String(name).trim().split(/\s+/)[0] || name;
}

/** Deterministic avatar colour from an id/name */
export const AVATAR_COLORS = [
  { bg: '#06A97F', fg: '#ffffff' },
  { bg: '#6C5CE7', fg: '#ffffff' },
  { bg: '#F2545B', fg: '#ffffff' },
  { bg: '#E08600', fg: '#ffffff' },
  { bg: '#2F7EF0', fg: '#ffffff' },
  { bg: '#D6336C', fg: '#ffffff' },
  { bg: '#0CA678', fg: '#ffffff' },
  { bg: '#7048E8', fg: '#ffffff' },
  { bg: '#F76707', fg: '#ffffff' },
  { bg: '#1098AD', fg: '#ffffff' },
];

export function avatarColor(seed = '') {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/* ---------------------------------------------------------------- misc */

export function pluralise(n, one, many) {
  return `${n} ${n === 1 ? one : many || one + 's'}`;
}

export function listNames(names, max = 2) {
  if (!names.length) return '';
  if (names.length <= max) {
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, max).join(', ')} and ${names.length - max} others`;
}
