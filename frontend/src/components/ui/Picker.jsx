'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronDown, Search } from 'lucide-react';
import Sheet from './Sheet';
import { Label } from './Field';

/**
 * Drop-in replacement for <select>. The trigger is a real button and the
 * options live in a sheet, so it looks and animates the same everywhere —
 * there is no native dropdown anywhere in the app.
 *
 * options: [{ value, label, sublabel?, emoji?, icon?, tint? }]
 */
export default function Picker({
  label,
  hint,
  value,
  onChange,
  options = [],
  placeholder = 'Choose…',
  searchable = false,
  title,
  disabled,
  error,
  clearable = false,
  clearLabel = 'None',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(term) ||
        String(o.sublabel || '').toLowerCase().includes(term),
    );
  }, [options, q]);

  const pick = (v) => {
    onChange(v);
    setOpen(false);
    setQ('');
  };

  const SelIcon = selected?.icon;

  return (
    <div className={className}>
      {label && <Label hint={hint}>{label}</Label>}

      <motion.button
        type="button"
        disabled={disabled}
        whileTap={disabled ? undefined : { scale: 0.99 }}
        onClick={() => setOpen(true)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-13 w-full items-center gap-3 rounded-[14px] bg-surface-2 px-4 text-left
          tap hover:bg-surface-3 disabled:opacity-45
          ${error ? 'shadow-[inset_0_0_0_1.5px_var(--neg)]' : ''}`}
      >
        {selected?.emoji && <span className="text-[19px] leading-none">{selected.emoji}</span>}
        {SelIcon && (
          <span
            className="grid size-8 shrink-0 place-items-center rounded-[10px]"
            style={{
              background: `color-mix(in srgb, ${selected.tint || 'var(--text)'} 14%, transparent)`,
              color: selected.tint || 'var(--text)',
            }}
          >
            <SelIcon size={16} strokeWidth={2.2} />
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span
            className={`newq block truncate text-[15px] ${
              selected ? ' text-ink' : 'text-ink-3'
            }`}
          >
            {selected ? selected.label : placeholder}
          </span>
          {selected?.sublabel && (
            <span className="newq block truncate text-[12px]">{selected.sublabel}</span>
          )}
        </span>

        <ChevronDown size={18} className="shrink-0 text-ink-3" strokeWidth={2.2} />
      </motion.button>

      {error && <p className="mt-1.5 px-1.5 text-[12.5px] font-medium text-neg">{error}</p>}

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          setQ('');
        }}
        title={title || label || 'Choose'}
        padded={false}
      >
        {searchable && (
          <div className="px-5 pb-3">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                autoFocus
                className="h-12 w-full rounded-[14px] bg-surface-2 pl-11 pr-4 text-[15px] text-ink
                  outline-none placeholder:text-ink-3"
              />
            </div>
          </div>
        )}

        <div className="px-5 pb-6">
          <div className="overflow-hidden rounded-[18px] bg-surface-2">
            <div className="divide-y divide-line">
              {clearable && (
                <Option
                  index={0}
                  option={{ value: '', label: clearLabel }}
                  active={!value}
                  onPick={() => pick('')}
                />
              )}

              {filtered.map((o, i) => (
                <Option
                  key={o.value}
                  index={i + (clearable ? 1 : 0)}
                  option={o}
                  active={o.value === value}
                  onPick={() => pick(o.value)}
                />
              ))}
            </div>
          </div>

          {filtered.length === 0 && (
            <p className="newq py-10 text-center text-[14px]">Nothing matches “{q}”</p>
          )}
        </div>
      </Sheet>
    </div>
  );
}

function Option({ option: o, active, onPick, index }) {
  const Icon = o.icon;
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.02, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      onClick={onPick}
      role="option"
      aria-selected={active}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left tap hover:bg-surface-3"
    >
      {o.emoji && <span className="text-[19px] leading-none">{o.emoji}</span>}
      {Icon && (
        <span
          className="grid size-9 shrink-0 place-items-center rounded-[11px]"
          style={{
            background: `color-mix(in srgb, ${o.tint || 'var(--text)'} 14%, transparent)`,
            color: o.tint || 'var(--text)',
          }}
        >
          <Icon size={17} strokeWidth={2.2} />
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="newq  text-ink block truncate text-[15px]">{o.label}</span>
        {o.sublabel && <span className="newq block truncate text-[12.5px]">{o.sublabel}</span>}
      </span>

      <span
        className={`grid size-6 shrink-0 place-items-center rounded-full tap
          ${active ? 'bg-panel text-white' : 'bg-surface-3'}`}
      >
        {active && <Check size={13} strokeWidth={3} />}
      </span>
    </motion.button>
  );
}
