'use client';

import { Info, TriangleAlert } from 'lucide-react';
import { isMixed } from '@/lib/fx';
import { useApp } from '@/store/AppContext';

/**
 * The honesty line under a converted total.
 *
 * When a scope holds more than one currency its total is an approximation at
 * today's rate, not an exact sum — and that has to be said out loud, because
 * the number will drift day to day even when nobody spends anything. Renders
 * nothing at all for the ordinary single-currency case.
 */
export default function FxNote({ scope = undefined, className = '' }) {
  const { expenses, settlements, currency, fx } = useApp();

  if (!isMixed(expenses, settlements, scope, currency)) return null;

  const stale = fx.stale || !fx.rates;
  const Icon = stale ? TriangleAlert : Info;

  return (
    <p
      className={`newq flex items-start gap-1.5 px-1.5 text-[11.5px] leading-snug ${className}`}
      style={stale ? { color: 'var(--warn)' } : undefined}
    >
      <Icon size={12} strokeWidth={2.3} className="mt-0.5 shrink-0" />
      <span>
        {stale ? (
          <>
            Mixed currencies, and live rates are unavailable — this total may be off
            {fx.date ? ` (last rates ${fx.date})` : ''}.
          </>
        ) : (
          <>
            Mixed currencies, converted to {currency} at today&apos;s rate
            {fx.date ? ` (${fx.date})` : ''}. Each expense stays exact in its own.
          </>
        )}
      </span>
    </p>
  );
}
