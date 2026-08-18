'use client';

import { forwardRef, useId, useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Search, X } from 'lucide-react';
import { symbolOf, money } from '@/lib/format';

/** Grey inset field, rounded rect — the field style from the references. */
const base =
  'w-full rounded-[14px] bg-surface-2 text-ink placeholder:text-ink-3 outline-none ' +
  'transition-[background-color,box-shadow] duration-200 ' +
  'focus:shadow-[inset_0_0_0_1.5px_var(--brand)] disabled:opacity-45';

export function Label({ children, hint, htmlFor, className = '' }) {
  return (
    <div className={`mb-2 flex items-baseline justify-between gap-3 px-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="newq text-[12px]  uppercase tracking-[0.07em] text-ink-3">
        {children}
      </label>
      {hint && <span className="newq text-[12px]">{hint}</span>}
    </div>
  );
}

export const Input = forwardRef(function Input(
  { label, hint, error, icon: Icon, suffix, className = '', containerClass = '', id, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id || auto;

  return (
    <div className={containerClass}>
      {label && (
        <Label htmlFor={fieldId} hint={hint}>
          {label}
        </Label>
      )}
      <div className="relative">
        {Icon && (
          <Icon
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3"
            strokeWidth={2.1}
          />
        )}
        <input
          ref={ref}
          id={fieldId}
          className={`${base} h-13 text-[15px] ${Icon ? 'pl-11.5' : 'pl-4'} ${suffix ? 'pr-12' : 'pr-4'}
            ${error ? 'shadow-[inset_0_0_0_1.5px_var(--neg)]' : ''} ${className}`}
          aria-invalid={!!error}
          {...rest}
        />
        {suffix && (
          <span className="newq pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px]">
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1.5 px-1.5 text-[12.5px] font-medium text-neg"
        >
          {error}
        </motion.p>
      )}
    </div>
  );
});

export const PasswordInput = forwardRef(function PasswordInput({ ...props }, ref) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={show ? 'text' : 'password'} className="pr-12" {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-[34px] grid size-9 place-items-center rounded-full
          text-ink-3 tap hover:bg-surface-3 hover:text-ink active:scale-90"
      >
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
});

export const Textarea = forwardRef(function Textarea(
  { label, hint, error, rows = 3, className = '', id, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id || auto;
  return (
    <div>
      {label && (
        <Label htmlFor={fieldId} hint={hint}>
          {label}
        </Label>
      )}
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        className={`${base} resize-none px-4 py-3.5 text-[15px]
          ${error ? 'shadow-[inset_0_0_0_1.5px_var(--neg)]' : ''} ${className}`}
        {...rest}
      />
      {error && <p className="mt-1.5 px-1.5 text-[12.5px] font-medium text-neg">{error}</p>}
    </div>
  );
});

/* ================================================================
   AMOUNT — the "how much was it?" block
   A grey inset card with the figure centred, plus quick-add chips
   so the common amounts are one tap away.
   ================================================================ */

const QUICK = [100, 250, 500, 1000, 2000, 5000];

export function AmountInput({
  value,
  onChange,
  currency = 'INR',
  autoFocus,
  error,
  label = 'How much was it?',
  quick = true,
}) {
  const n = Number(value) || 0;

  const set = (raw) => {
    const v = String(raw).replace(/[^\d.]/g, '');
    if ((v.match(/\./g) || []).length > 1) return;
    const [, dec] = v.split('.');
    if (dec && dec.length > 2) return;
    onChange(v);
  };

  return (
    <div>
      {label && <p className="newq text-[12px]  uppercase tracking-[0.07em] text-ink-3 mb-2 px-1.5">{label}</p>}

      <div
        className={`rounded-[18px] px-5 py-6 transition-colors
          ${error ? 'bg-blush' : 'bg-surface-2'}`}
      >
        <div className="flex items-baseline justify-center gap-1.5">
          <span className="num text-[26px] font-medium text-ink-3">{symbolOf(currency)}</span>
          <input
            value={value}
            onChange={(e) => set(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            autoFocus={autoFocus}
            aria-label="Amount"
            size={1}
            className="num min-w-[1.5ch] border-none bg-transparent text-center !text-[56px] font-medium
               leading-none text-ink outline-none placeholder:text-ink-3/45"
            style={{ width: `${Math.max(String(value || '0').length, 1)}ch`, fontSize: '56px' }}
          />
        </div>


      </div>

      {quick && (
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {QUICK.map((q) => (
            <motion.button
              key={q}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => set(String(n + q))}
              className="num rounded-[12px] bg-surface-2 py-2.5 text-[13.5px] font-medium
                text-ink tap hover:bg-surface-3"
            >
              +{money(q, currency)}
            </motion.button>
          ))}
        </div>
      )}

      {n > 0 && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="newq mt-2 w-full py-1 text-center text-[12.5px] tap hover:text-ink"
        >
          Clear
        </button>
      )}

      {error && <p className="mt-2 px-1.5 text-center text-[12.5px] font-medium text-neg">{error}</p>}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search
        size={17}
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3"
        strokeWidth={2.1}
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${base} h-12 pl-11 ${value ? 'pr-11' : 'pr-4'} text-[14.5px]`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center
            rounded-full bg-surface-3 text-ink-3 tap hover:text-ink active:scale-90"
        >
          <X size={13} strokeWidth={2.6} />
        </button>
      )}
    </div>
  );
}
