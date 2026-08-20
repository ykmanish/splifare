'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Lightbulb } from 'lucide-react';
import { Card, EmptyState } from '@/components/ui/Bits';
import { buildInsights } from '@/lib/engage';
import { money } from '@/lib/format';
import { categoryOf } from '@/lib/categories';

/**
 * Smart category insights.
 *
 * Each card is a sentence the app is asserting about the group's money, so the
 * arithmetic behind them lives in `lib/engage.js` where it can be read in one
 * place — and each card carries the figures it was derived from underneath.
 * A headline like "weekends cost 2.3x a weekday" is only worth showing if the
 * reader can see the two rates it came from; otherwise it is a number to be
 * taken on faith, which is not an insight.
 */

const EASE = [0.16, 1, 0.3, 1];

const TONES = {
  peach: 'peach',
  mint: 'mint',
  sky: 'sky',
  butter: 'butter',
  grape: 'grape',
  blush: 'blush',
};

function CategoryBars({ expenses, convert, currency }) {
  const rows = useMemo(() => {
    const tally = {};
    let total = 0;
    for (const e of expenses) {
      const value = convert(e.amount, e.currency);
      tally[e.category || 'other'] = (tally[e.category || 'other'] || 0) + value;
      total += value;
    }
    return Object.entries(tally)
      .map(([id, amount]) => ({
        id,
        amount,
        label: categoryOf(id).label,
        tint: categoryOf(id).tint,
        share: total > 0 ? (amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [expenses, convert]);

  if (!rows.length) return null;

  return (
    <Card tone="white" pad={false} className="p-5">
      <p className="newq mb-4 text-[13px] uppercase tracking-[0.08em] text-ink-3">
        Where the money goes
      </p>
      <div className="space-y-2.5">
        {rows.map((row, i) => (
          <div key={row.id} className="flex items-center gap-3">
            <span className="newq w-[86px] shrink-0 truncate text-[12.5px] text-ink-2">
              {row.label}
            </span>
            <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
              <motion.span
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(2, row.share)}%` }}
                transition={{ duration: 0.6, delay: i * 0.05, ease: EASE }}
                className="block h-full rounded-full"
                style={{ background: row.tint }}
              />
            </span>
            <span className="num w-[58px] shrink-0 text-right text-[12px] text-ink-3">
              {money(row.amount, currency, { compact: true })}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function InsightsPanel({ expenses, convert, personById, currency }) {
  const insights = useMemo(
    () => buildInsights({ expenses, convert, personById, currency }),
    [expenses, convert, personById, currency],
  );

  if (!expenses.length) {
    return (
      <Card tone="soft" pad={false}>
        <EmptyState
          icon={Lightbulb}
          title="No patterns yet"
          body="Add a few bills and the app will start telling you what this group actually spends on."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {insights.map((insight, i) => (
        <motion.div
          key={insight.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, delay: i * 0.05, ease: EASE }}
        >
          <Card tone={TONES[insight.tone] || 'white'}>
            <p className="newq text-[17px] leading-snug text-ink">{insight.headline}</p>
            <p className="newq mt-1.5 text-[12.5px] leading-snug text-ink-3">{insight.detail}</p>
          </Card>
        </motion.div>
      ))}

      <CategoryBars expenses={expenses} convert={convert} currency={currency} />

      {!insights.length && (
        <Card tone="soft">
          <p className="newq text-[13.5px] leading-snug text-ink-3">
            Nothing stands out yet — the spending here is even across the week and the
            categories. Come back after a few more bills.
          </p>
        </Card>
      )}
    </div>
  );
}
