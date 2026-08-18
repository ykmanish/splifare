'use client';

import { Check, AlertTriangle, Equal } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { GroupLabel, ListGroup, StatusPill } from '@/components/ui/Blocks';
import { Pills, Stepper } from '@/components/ui/Controls';
import { SPLIT_MODES, computeSplits } from '@/lib/split';
import { money, symbolOf, firstName } from '@/lib/format';

/**
 * Who is in, and how much each of them carries. Handles all four split
 * modes and reports validity up to the parent.
 */
export default function SplitEditor({
  total,
  currency,
  people,
  selectedIds,
  onTogglePerson,
  mode,
  onModeChange,
  values,
  onValueChange,
  meId,
}) {
  const result = computeSplits(total, selectedIds, mode, values);
  const byId = Object.fromEntries(result.splits.map((s) => [s.userId, s.amount]));

  const setAll = (v) => {
    selectedIds.forEach((id) => onValueChange(id, v));
  };

  const allOn = selectedIds.length === people.length;

  return (
    <div className="space-y-3">
      <Pills
        options={SPLIT_MODES.map((m) => ({ id: m.id, label: m.label }))}
        value={mode}
        onChange={onModeChange}
      />

      <GroupLabel
        action={
          <span className="flex shrink-0 items-center gap-3.5">
            {mode === 'shares' && (
              <button
                type="button"
                onClick={() => setAll(1)}
                className="newq  text-ink inline-flex items-center gap-1 text-[12.5px] tap active:scale-95"
                style={{ color: 'var(--brand)' }}
              >
                <Equal size={12} strokeWidth={2.8} /> Reset
              </button>
            )}

            <button
              type="button"
              onClick={() => onTogglePerson('__all__')}
              className="newq  text-ink text-[12.5px] tap active:scale-95"
              style={{ color: 'var(--brand)' }}
            >
              {allOn ? 'Clear all' : 'Select all'}
            </button>
          </span>
        }
      >
        {SPLIT_MODES.find((m) => m.id === mode)?.hint}
      </GroupLabel>

      <ListGroup>
        {people.map((p) => {
          const on = selectedIds.includes(p.id);
          const amt = byId[p.id] ?? 0;
          const who = p.id === meId ? 'You' : p.name;

          return (
            <div
              key={p.id}
              className={`flex w-full items-center gap-3 px-4 py-3 transition-opacity duration-200
                ${on ? '' : 'opacity-45'}`}
            >
              <button
                type="button"
                onClick={() => onTogglePerson(p.id)}
                aria-pressed={on}
                className="flex min-w-0 flex-1 items-center gap-3 text-left tap"
              >
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded-full transition-colors
                    ${on ? 'bg-brand text-on-brand' : 'bg-surface-3'}`}
                >
                  {on && <Check size={12} strokeWidth={3.2} />}
                </span>

                <Avatar person={p} size="sm" />

                <span className="min-w-0 flex-1">
                  <span className="newq  text-ink block truncate text-[14.5px]">{who}</span>
                  {on && mode !== 'equal' && (
                    <span className="num block text-[12px] text-ink-3">{money(amt, currency)}</span>
                  )}
                </span>
              </button>

              {/* right-hand control per mode */}
              {!on ? (
                <span className="newq shrink-0 text-[12.5px]">out</span>
              ) : mode === 'equal' ? (
                <span className="num shrink-0 text-[15px]  text-ink">
                  {money(amt, currency)}
                </span>
              ) : mode === 'shares' ? (
                <Stepper
                  value={Number(values[p.id]) || 0}
                  onChange={(v) => onValueChange(p.id, v)}
                  min={0}
                  label={`shares for ${firstName(p.name)}`}
                  className="shrink-0"
                />
              ) : (
                <div className="relative w-[104px] shrink-0">
                  <span className="num pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-3">
                    {mode === 'percent' ? '%' : symbolOf(currency)}
                  </span>
                  <input
                    inputMode="decimal"
                    value={values[p.id] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d.]/g, '');
                      if ((v.match(/\./g) || []).length > 1) return;
                      onValueChange(p.id, v);
                    }}
                    placeholder="0"
                    aria-label={`${mode === 'percent' ? 'Percent' : 'Amount'} for ${firstName(p.name)}`}
                    className="num h-10 w-full rounded-[14px] bg-surface-2 pl-7 pr-3.5 text-right
                      text-[14.5px]  text-ink outline-none
                      transition-[background-color,box-shadow] duration-200
                      focus:shadow-[inset_0_0_0_1.5px_var(--brand)]"
                  />
                </div>
              )}
            </div>
          );
        })}
      </ListGroup>

      {/* running status */}
      <StatusPill
        tone={result.valid ? 'pos' : 'neg'}
        icon={result.valid ? Check : AlertTriangle}
      >
        {result.valid ? (
          <>
            Split {selectedIds.length} {selectedIds.length === 1 ? 'way' : 'ways'} ·{' '}
            <span className="num">{money(total || 0, currency)}</span>
          </>
        ) : (
          result.message || 'Check the split'
        )}
      </StatusPill>
    </div>
  );
}
