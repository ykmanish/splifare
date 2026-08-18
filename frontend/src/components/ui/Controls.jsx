'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';

const SPRING = { type: 'spring', damping: 28, stiffness: 380, mass: 0.7 };

/* ================================================================
   PILLS — segmented control with a spring indicator
   ================================================================ */

export function Pills({ options, value, onChange, size = 'md', tone = 'dark', className = '' }) {
  const id = useId();
  const h = { sm: 'h-9', md: 'h-11', lg: 'h-12' }[size];
  const txt = { sm: 'text-[12.5px]', md: 'text-[13.5px]', lg: 'text-[14.5px]' }[size];

  const fill = { dark: 'bg-panel', lime: 'bg-brand', brand: 'bg-brand', white: 'bg-surface' }[tone];
  const on = {
    dark: 'text-white',
    lime: 'text-on-brand',
    brand: 'text-on-brand',
    white: 'text-ink',
  }[tone];

  return (
    <div
      role="tablist"
      className={`inline-flex ${h} w-full items-center gap-1 rounded-full bg-surface-2 p-1 ${className}`}
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={`relative h-full flex-1 rounded-full ${txt} tap
              ${active ? '' : 'newq hover:text-ink'}`}
          >
            {active && (
              <motion.span
                layoutId={`pill-${id}`}
                transition={SPRING}
                className={`absolute inset-0 rounded-full ${fill}`}
              />
            )}
            {/* Emit exactly one colour utility — two would resolve by
                stylesheet order, not class order, and flip unpredictably. */}
            <span
              className={`newq relative z-10 block truncate px-2 ${
                active ? ` ${on}` : 'text-ink-3'
              }`}
            >
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Horizontally scrolling pill row — for long option sets like categories. */
export function PillScroller({ options, value, onChange, className = '' }) {
  return (
    <div className={`-mx-5 overflow-x-auto px-5 no-scrollbar ${className}`}>
      <div className="flex gap-2 pb-1">
        {options.map((o) => {
          const active = o.id === value;
          const Icon = o.icon;
          return (
            <motion.button
              key={o.id}
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => onChange(o.id)}
              aria-pressed={active}
              className={`flex shrink-0 items-center gap-2 rounded-full py-2.5 pl-3 pr-4 tap
                ${active ? 'bg-panel text-white' : 'bg-surface-2 hover:bg-surface-3'}`}
            >
              {Icon && (
                <Icon
                  size={16}
                  strokeWidth={2.2}
                  className={active ? '' : 'text-ink-3'}
                  style={active && o.tint ? { color: o.tint } : undefined}
                />
              )}
              <span
                className={`newq text-[13.5px] ${
                  active ? ' text-white' : 'text-ink-2'
                }`}
              >
                {o.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================
   SLIDER
   ================================================================ */

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  format = (v) => v,
  className = '',
}) {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  const setFromClientX = useCallback(
    (clientX) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      const snapped = Math.round((min + ratio * (max - min)) / step) * step;
      onChange(Number(Math.min(max, Math.max(min, snapped)).toFixed(4)));
    },
    [min, max, step, onChange],
  );

  const onKeyDown = (e) => {
    const big = (max - min) / 10;
    const map = {
      ArrowLeft: -step,
      ArrowDown: -step,
      ArrowRight: step,
      ArrowUp: step,
      PageDown: -big,
      PageUp: big,
      Home: min - value,
      End: max - value,
    };
    if (map[e.key] === undefined) return;
    e.preventDefault();
    onChange(Number(Math.min(max, Math.max(min, value + map[e.key])).toFixed(4)));
  };

  return (
    <div className={className}>
      {label && (
        <div className="mb-2.5 flex items-baseline justify-between px-1">
          <span className="newq  text-ink text-[13px]">{label}</span>
          <span className="num text-[15px]  text-ink">{format(value)}</span>
        </div>
      )}

      <div
        ref={trackRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          setFromClientX(e.clientX);
        }}
        onPointerMove={(e) => dragging && setFromClientX(e.clientX)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        className="relative flex h-11 cursor-pointer touch-none items-center"
      >
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
          <motion.div
            className="h-full rounded-full bg-brand"
            animate={{ width: `${pct}%` }}
            transition={dragging ? { duration: 0 } : SPRING}
          />
        </div>

        <motion.div
          role="slider"
          tabIndex={0}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-label={label}
          onKeyDown={onKeyDown}
          className="absolute grid size-7 -translate-x-1/2 place-items-center rounded-full
            bg-surface shadow-lg outline-none"
          style={{ left: `${pct}%` }}
          animate={{ scale: dragging ? 1.2 : 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 420 }}
        >
          <span className="size-3 rounded-full bg-brand" />
        </motion.div>
      </div>
    </div>
  );
}

/* ================================================================
   STEPPER
   ================================================================ */

export function Stepper({ value, onChange, min = 0, max = 999, label, className = '' }) {
  return (
    <div className={`flex items-center gap-1 rounded-full bg-surface-2 p-1 ${className}`}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, (Number(value) || 0) - 1))}
        aria-label={label ? `Decrease ${label}` : 'Decrease'}
        className="grid size-8 place-items-center rounded-full text-ink-2 tap
          hover:bg-surface-3 active:scale-90"
      >
        <Minus size={15} strokeWidth={2.6} />
      </button>
      <motion.span
        key={value}
        initial={{ scale: 0.7, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20, stiffness: 500 }}
        className="num w-7 text-center text-[15px]  text-ink"
      >
        {value}
      </motion.span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, (Number(value) || 0) + 1))}
        aria-label={label ? `Increase ${label}` : 'Increase'}
        className="grid size-8 place-items-center rounded-full text-ink-2 tap
          hover:bg-surface-3 active:scale-90"
      >
        <Plus size={15} strokeWidth={2.6} />
      </button>
    </div>
  );
}

/* ================================================================
   TOGGLE
   ================================================================ */

export function Toggle({ checked, onChange, label, description, id }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span className="min-w-0">
        {label && <span className="newq  text-ink block text-[15px]">{label}</span>}
        {description && <span className="newq mt-0.5 block text-[12.5px]">{description}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full tap ${checked ? 'bg-brand' : 'bg-surface-3'}`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', damping: 26, stiffness: 500 }}
          className="absolute top-1 size-5 rounded-full bg-white shadow-sm"
          style={{ left: checked ? 'calc(100% - 1.5rem)' : '0.25rem' }}
        />
      </button>
    </label>
  );
}
