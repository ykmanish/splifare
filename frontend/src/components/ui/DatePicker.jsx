'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import Sheet from './Sheet';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Monday-first 6x7 grid covering the given month. */
function buildGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Mon = 0
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

function label(d) {
  const today = startOfDay(new Date());
  const day = startOfDay(d);
  const delta = Math.round((today - day) / 86400000);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Yesterday';
  if (delta === -1) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

/**
 * Custom calendar — no native date input anywhere.
 * `value` / `onChange` speak ISO strings.
 */
export default function DatePicker({ label: fieldLabel, hint, value, onChange, maxToday = true, className = '' }) {
  const selected = useMemo(() => (value ? new Date(value) : new Date()), [value]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => ({ y: selected.getFullYear(), m: selected.getMonth() }));
  const [dir, setDir] = useState(1);

  const today = startOfDay(new Date());
  const grid = useMemo(() => buildGrid(view.y, view.m), [view]);

  const move = (step) => {
    setDir(step);
    setView(({ y, m }) => {
      const next = new Date(y, m + step, 1);
      return { y: next.getFullYear(), m: next.getMonth() };
    });
  };

  const pick = (d) => {
    onChange(startOfDay(d).toISOString());
    setOpen(false);
  };

  const openSheet = () => {
    setView({ y: selected.getFullYear(), m: selected.getMonth() });
    setOpen(true);
  };

  return (
    <div className={className}>
      {fieldLabel && (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="newq text-[13px] font-medium text-ink-2">{fieldLabel}</span>
          {hint && <span className="text-[12px] text-ink-3">{hint}</span>}
        </div>
      )}

      <button
        type="button"
        onClick={openSheet}
        className="flex h-13 w-full items-center gap-3 rounded-2xl bg-surface-2 px-4 text-left
          tap hover:bg-surface-3 active:scale-[0.99]"
      >
        <CalendarDays size={18} className="shrink-0 text-ink-3" strokeWidth={2.1} />
        <span className="flex-1 truncate text-[15px] font-medium text-ink">{label(selected)}</span>
        <span className="text-[13px] text-ink-3">
          {selected.toLocaleDateString('en-GB', { weekday: 'short' })}
        </span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Pick a date" size="sm">
        {/* quick picks */}
        <div className="mb-5 flex gap-2">
          {[
            { l: 'Today', d: new Date() },
            { l: 'Yesterday', d: new Date(Date.now() - 86400000) },
            { l: '2 days ago', d: new Date(Date.now() - 2 * 86400000) },
          ].map((q) => (
            <button
              key={q.l}
              type="button"
              onClick={() => pick(q.d)}
              className={`flex-1 rounded-xl py-2.5 text-[13px] font-medium tap active:scale-95
                ${
                  sameDay(q.d, selected)
                    ? 'bg-panel !text-white'
                    : 'bg-surface-2 text-ink-2 hover:bg-surface-3'
                }`}
            >
              {q.l}
            </button>
          ))}
        </div>

        {/* month header */}
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="Previous month"
            className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2 tap
              hover:bg-surface-3 active:scale-90"
          >
            <ChevronLeft size={18} strokeWidth={2.4} />
          </button>

          <div className="overflow-hidden text-center">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p
                key={`${view.y}-${view.m}`}
                initial={{ opacity: 0, y: dir * 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: dir * -14 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                className="newq text-[16px]  text-ink"
              >
                {MONTHS[view.m]} {view.y}
              </motion.p>
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={() => move(1)}
            aria-label="Next month"
            className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2 tap
              hover:bg-surface-3 active:scale-90"
          >
            <ChevronRight size={18} strokeWidth={2.4} />
          </button>
        </div>

        {/* weekdays */}
        <div className="mb-1 grid grid-cols-7">
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="py-1.5 text-center text-[11.5px]  text-ink-3">
              {w}
            </span>
          ))}
        </div>

        {/* grid */}
        <div className="overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={`${view.y}-${view.m}-grid`}
              initial={{ opacity: 0, x: dir * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -40 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="grid grid-cols-7 gap-y-1"
            >
              {grid.map((d) => {
                const inMonth = d.getMonth() === view.m;
                const isSel = sameDay(d, selected);
                const isToday = sameDay(d, today);
                const disabled = maxToday && startOfDay(d) > today;

                return (
                  <div key={d.toISOString()} className="flex justify-center py-0.5">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => pick(d)}
                      className={`relative grid size-10 place-items-center rounded-full text-[14px]
                        tap active:scale-90 disabled:opacity-25
                        ${
                          isSel
                            ? 'bg-panel !text-white'
                            : inMonth
                              ? 'font-medium text-ink hover:bg-surface-2'
                              : 'text-ink-3 hover:bg-surface-2'
                        }`}
                    >
                      {d.getDate()}
                      {isToday && !isSel && (
                        <span className="absolute bottom-1.5 size-1 rounded-full bg-brand-strong" />
                      )}
                    </button>
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </Sheet>
    </div>
  );
}
