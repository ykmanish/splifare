import { CURRENCIES } from './format';

/**
 * Currency conversion for display and for netting balances.
 *
 * The server hands back a table keyed on the viewer's own currency, where
 * `rates[CODE]` is how many CODE one unit of the base buys. Converting the
 * other way — a foreign amount into the base — is therefore a division.
 */

/** Identity converter, used until rates arrive and if they never do. */
export const noConvert = (amount) => Number(amount) || 0;
noConvert.base = null;
noConvert.ready = false;

/**
 * Build `convert(amount, fromCurrency)` for a rate table.
 *
 * An unknown currency passes straight through rather than becoming zero or
 * NaN: a total that is slightly wrong is recoverable, one that silently
 * drops a real debt is not.
 */
export function makeConverter(base, rates) {
  if (!base || !rates) return noConvert;

  const fn = (amount, from) => {
    const value = Number(amount) || 0;
    if (!value) return 0;

    const code = String(from || base).toUpperCase();
    if (code === base) return value;

    const rate = Number(rates[code]);
    if (!Number.isFinite(rate) || rate <= 0) return value;

    return value / rate;
  };

  fn.base = base;
  fn.ready = true;
  fn.rates = rates;
  return fn;
}

/** Every distinct currency appearing in a scope, uppercased. */
export function currenciesIn(expenses = [], settlements = [], scope = undefined, fallback = 'INR') {
  const inScope = (x) => scope === undefined || (x.groupId || null) === scope;
  const seen = new Set();

  for (const e of expenses) if (inScope(e)) seen.add(String(e.currency || fallback).toUpperCase());
  for (const s of settlements) if (inScope(s)) seen.add(String(s.currency || fallback).toUpperCase());

  return seen;
}

/**
 * Whether a scope holds more than one currency — the signal that a total is
 * an approximation at today's rate rather than an exact sum.
 */
export function isMixed(expenses, settlements, scope, displayCurrency) {
  const codes = currenciesIn(expenses, settlements, scope, displayCurrency);
  codes.delete(undefined);
  if (codes.size > 1) return true;
  return codes.size === 1 && !codes.has(String(displayCurrency || 'INR').toUpperCase());
}

/** "1 EUR = ₹110.68" — for showing the reader the rate being applied. */
export function rateLabel(from, to, rates) {
  const rate = Number(rates?.[String(from).toUpperCase()]);
  if (!Number.isFinite(rate) || rate <= 0) return '';

  const per = 1 / rate;
  const symbol = (CURRENCIES[to] || CURRENCIES.INR).symbol;
  const digits = per >= 100 ? 0 : per >= 1 ? 2 : 4;
  return `1 ${String(from).toUpperCase()} = ${symbol}${per.toFixed(digits)}`;
}
