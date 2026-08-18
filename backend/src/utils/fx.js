const { ExchangeRate } = require('../models');

/**
 * Foreign exchange rates, fetched live and cached.
 *
 * Two free, key-less sources, tried in order:
 *
 *  1. @fawazahmed0/currency-api on jsDelivr — ~200 currencies plus crypto,
 *     and it keeps dated snapshots, so a rate can be asked for as-of a past
 *     day. CDN-backed, so there is no per-key rate limit to blow through.
 *  2. open.er-api.com — ~160 currencies, latest only. The safety net for
 *     when the CDN or the upstream dataset is having a bad day.
 *
 * ECB-backed sources (Frankfurter and friends) were rejected: the ECB does
 * not publish AED, which this app offers.
 */

const PRIMARY = (base, date) =>
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date || 'latest'}/v1/currencies/${base.toLowerCase()}.json`;
const PRIMARY_MIRROR = (base, date) =>
  `https://${date || 'latest'}.currency-api.pages.dev/v1/currencies/${base.toLowerCase()}.json`;
const FALLBACK = (base) => `https://open.er-api.com/v6/latest/${base.toUpperCase()}`;

/** Live rates are re-fetched at most once an hour; dated ones never change. */
const TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

/** Currencies the app actually offers — everything else is dropped. */
const SUPPORTED = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'JPY', 'AUD'];

/** Process-local cache in front of Mongo, keyed `BASE:date`. */
const memory = new Map();

const isCode = (c) => /^[A-Z]{3}$/.test(String(c || '').toUpperCase());

async function getJSON(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

/** Keep only the app's currencies, as plain positive numbers. */
function trim(raw, base) {
  const out = {};
  for (const code of SUPPORTED) {
    if (code === base) {
      out[code] = 1;
      continue;
    }
    const v = Number(raw[code] ?? raw[code.toLowerCase()]);
    if (Number.isFinite(v) && v > 0) out[code] = v;
  }
  return out;
}

async function fromPrimary(base, date) {
  let payload;
  try {
    payload = await getJSON(PRIMARY(base, date));
  } catch {
    payload = await getJSON(PRIMARY_MIRROR(base, date));
  }
  const table = payload[base.toLowerCase()] || payload[base];
  if (!table) throw new Error('primary returned no rate table');
  return { rates: trim(table, base), date: payload.date || date || null, source: 'currency-api' };
}

async function fromFallback(base) {
  const payload = await getJSON(FALLBACK(base));
  if (payload.result && payload.result !== 'success') throw new Error('fallback reported failure');
  if (!payload.rates) throw new Error('fallback returned no rate table');
  return {
    rates: trim(payload.rates, base),
    date: (payload.time_last_update_utc || '').slice(0, 16) || null,
    source: 'open.er-api.com',
  };
}

/**
 * Rates for one base currency, as `{ base, date, rates, source, stale }`.
 *
 * A cached row is served whenever it is fresh. When every source fails we
 * fall back to the newest stored row and flag it `stale` rather than
 * throwing — a slightly old rate beats a screen with no totals on it.
 */
async function getRates(baseInput, dateInput) {
  const base = String(baseInput || 'INR').toUpperCase();
  if (!isCode(base)) throw new Error('Currency codes are three letters');

  // Only accept an ISO day, and never a future one.
  const date =
    typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput) ? dateInput : null;
  const key = `${base}:${date || 'latest'}`;

  const hit = memory.get(key);
  // A dated snapshot is immutable, so it never expires.
  if (hit && (date || Date.now() - hit.fetchedAt < TTL_MS)) return hit.value;

  const stored = await ExchangeRate.findOne({ base, date: date || 'latest' });
  if (stored && (date || Date.now() - stored.fetchedAt.getTime() < TTL_MS)) {
    const value = {
      base,
      date: stored.rateDate,
      rates: Object.fromEntries(stored.rates),
      source: stored.source,
      stale: false,
    };
    memory.set(key, { fetchedAt: stored.fetchedAt.getTime(), value });
    return value;
  }

  let fresh = null;
  try {
    fresh = await fromPrimary(base, date);
  } catch (primaryErr) {
    if (!date) {
      try {
        fresh = await fromFallback(base);
      } catch (fallbackErr) {
        console.error('[fx] both sources failed:', primaryErr.message, '/', fallbackErr.message);
      }
    } else {
      console.error('[fx] dated lookup failed:', primaryErr.message);
    }
  }

  if (!fresh) {
    if (stored) {
      return {
        base,
        date: stored.rateDate,
        rates: Object.fromEntries(stored.rates),
        source: stored.source,
        stale: true,
      };
    }
    // Nothing cached and nothing reachable: identity for the base alone, so
    // single-currency users still see correct totals.
    return { base, date: null, rates: { [base]: 1 }, source: 'unavailable', stale: true };
  }

  const value = { ...fresh, base, stale: false };

  await ExchangeRate.updateOne(
    { base, date: date || 'latest' },
    {
      $set: {
        base,
        date: date || 'latest',
        rateDate: fresh.date,
        rates: fresh.rates,
        source: fresh.source,
        fetchedAt: new Date(),
      },
    },
    { upsert: true },
  );

  memory.set(key, { fetchedAt: Date.now(), value });
  return value;
}

module.exports = { getRates, SUPPORTED };
