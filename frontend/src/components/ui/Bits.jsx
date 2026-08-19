'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { money } from '@/lib/format';
import { Pills, Toggle } from './Controls';
import Sheet from './Sheet';

/* ---------------------------------------------------------- surfaces */

/**
 * Six saturated pastel colour-blocks on a warm paper canvas, with the
 * near-black panel as the hero surface and lime reserved for the one action
 * on a screen that must be pressed. The pastels carry the design; white is
 * for dense list rows where colour would fight the content.
 */
const TONES = {
  white: 'bg-surface text-ink',
  soft: 'bg-surface-2 text-ink',
  /* The near-black hero */
  panel: 'bg-panel text-white',
  feature: 'bg-panel text-white',
  /* Lime — use sparingly, for the one accent surface */
  lime: 'bg-brand text-on-brand',
  limeSoft: 'bg-brand-soft text-ink',
  /* The home hero. Light in BOTH themes, so it carries its own ink rather
     than the theme's — `text-ink` here would be near-white in dark mode. */
  hero: 'bg-hero-card text-on-hero-card',
  /* The six pastel colour-blocks, at full strength */
  mint: 'bg-mint text-ink',
  mintSoft: 'bg-mint-soft text-ink',
  blush: 'bg-blush text-ink',
  blushSoft: 'bg-blush-soft text-ink',
  sky: 'bg-sky text-ink',
  skySoft: 'bg-sky-soft text-ink',
  grape: 'bg-grape text-ink',
  grapeSoft: 'bg-grape-soft text-ink',
  butter: 'bg-butter text-ink',
  butterSoft: 'bg-butter-soft text-ink',
  peach: 'bg-peach text-ink',
  peachSoft: 'bg-peach-soft text-ink',
  /* Older markup called the violet block "lavender" */
  lavender: 'bg-grape text-ink',
  lavenderSoft: 'bg-grape-soft text-ink',
  coral: 'bg-coral text-on-coral',
};

/**
 * NOTE: put amounts on a pastel card in `text-ink`, never `text-pos` /
 * `text-neg` — the semantic green and red land at roughly 2:1 and 3:1 against
 * these fills, both under WCAG AA. State the direction in a caption instead.
 *
 * Rotate the pastels across a list so no two neighbours share a colour.
 * Six long and co-prime with the 2-column grids, so the groups page never
 * lines two identical fills up side by side either.
 */
export const TONE_CYCLE = ['grape', 'mint', 'butter', 'sky', 'blush', 'peach'];
export const cycleTone = (i) => TONE_CYCLE[i % TONE_CYCLE.length];

/** Flat card — no border, no shadow. `tone` picks a pastel fill. */
export function Card({
  as: Tag = 'div',
  tone = 'white',
  className = '',
  pad = true,
  blob = false,
  children,
  ...rest
}) {
  return (
    <Tag
      className={`relative overflow-hidden rounded-[24px] ${TONES[tone]} ${blob ? 'blob' : ''}
        ${pad ? 'p-5' : ''} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Near-black surface, kept as its own name for readability. */
export function Panel({ className = '', ...rest }) {
  return <Card tone="panel" className={className} {...rest} />;
}

export function SectionTitle({ children, action, className = '' }) {
  return (
    <div className={`mb-3 flex items-end justify-between gap-4 px-1 ${className}`}>
      <h2 className="newq  text-ink text-[17px]">{children}</h2>
      {action}
    </div>
  );
}

export function Divider({ className = '' }) {
  return <div className={`h-px w-full bg-line ${className}`} />;
}

/* ---------------------------------------------------------- badge */

/*
 * Badge text is 11.5px, so it needs 4.5:1. Every tinted tone used to colour
 * the text as well as the fill and every one of them missed: brandSoft was
 * 1.13:1 (lime on pale lime — genuinely invisible), the rest between 2.5 and
 * 4.2. The tint already tells you which kind of badge it is, so the label is
 * ink and the hue stays in the background.
 *
 * The solid tones are left alone — they were designed as a contrasting pair.
 */
const BADGE_TONES = {
  neutral: 'bg-surface-2 text-ink-2',
  dark: 'bg-panel text-white',
  brand: 'bg-brand text-on-brand',
  brandSoft: 'bg-brand-soft text-ink',
  butter: 'bg-butter-soft text-ink',
  mint: 'bg-mint-soft text-ink',
  pos: 'bg-pos-soft text-ink',
  neg: 'bg-neg-soft text-ink',
  warn: 'bg-warn-soft text-ink',
  info: 'bg-info-soft text-ink',
  violet: 'bg-violet-soft text-ink',
  onPanel: 'bg-white/14 text-white',
  onTone: 'bg-black/8 text-ink',
};

export function Badge({ tone = 'neutral', icon: Icon, children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 newq
        text-[11.5px]  ${BADGE_TONES[tone]} ${className}`}
    >
      {Icon && <Icon size={12} strokeWidth={2.6} />}
      {children}
    </span>
  );
}

export function IconTile({ icon: Icon, tint = 'var(--brand)', size = 'md', className = '' }) {
  const dims = { sm: 'size-9', md: 'size-11', lg: 'size-13' }[size];
  const px = { sm: 16, md: 19, lg: 22 }[size];
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-2xl ${dims} ${className}`}
      style={{ background: `color-mix(in srgb, ${tint} 16%, transparent)`, color: tint }}
    >
      <Icon size={px} strokeWidth={2.1} />
    </div>
  );
}

/* ---------------------------------------------------------- money */

export function Amount({ value, currency = 'INR', size = 'md', showZero = 'settled' }) {
  const sizes = {
    xs: 'text-[13px]',
    sm: 'text-[14px]',
    md: 'text-[15.5px]',
    lg: 'text-[22px]',
    xl: 'text-[32px]',
    hero: 'text-[44px] leading-none',
  };
  const tone = value > 0.005 ? 'text-pos' : value < -0.005 ? 'text-neg' : 'text-ink-3';
  if (Math.abs(value) < 0.005 && showZero === 'settled') {
    return <span className={`${sizes[size]} font-medium text-ink-3`}>settled up</span>;
  }
  return (
    <span className={`num  ${sizes[size]} ${tone}`}>
      {money(Math.abs(value), currency)}
    </span>
  );
}

export function BalanceLabel({ value, className = '' }) {
  if (Math.abs(value) < 0.005) return null;
  return (
    <span className={`text-[11.5px] font-medium ${value > 0 ? 'text-pos' : 'text-neg'} ${className}`}>
      {value > 0 ? 'owes you' : 'you owe'}
    </span>
  );
}

/* ---------------------------------------------------------- bill summary */

/** Label → value row; stack inside a Card for the itemised bill look. */
export function SumRow({ label, value, tone = 'default', strong = false, hint, avatar }) {
  const valueTone = {
    default: 'text-ink',
    pos: 'text-pos',
    neg: 'text-neg',
    muted: 'text-ink-3',
  }[tone];

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="flex min-w-0 items-center gap-2.5">
        {avatar}
        <span className="newq truncate text-[13.5px]">{label}</span>
      </span>
      <span className="shrink-0 text-right">
        <span
          className={`num block ${strong ? 'text-[16px] ' : 'text-[14px] font-medium'} ${valueTone}`}
        >
          {value}
        </span>
        {hint && <span className="block text-[11.5px] text-ink-3">{hint}</span>}
      </span>
    </div>
  );
}

export function SummaryCard({ title, action, tone = 'white', children, className = '' }) {
  return (
    <Card tone={tone} pad={false} className={className}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
          <h3 className="newq  text-ink text-[15px]">{title}</h3>
          {action}
        </div>
      )}
      <div className="divide-y divide-line px-5 pb-2">{children}</div>
    </Card>
  );
}

/* ---------------------------------------------------------- row menu */

/**
 * The "⋯" affordance that gives every list row edit + delete.
 */
export function RowMenu({
  onEdit,
  onDelete,
  editLabel = 'Edit',
  deleteLabel = 'Delete',
  title = 'What next?',
  subtitle,
  extra,
  className = '',
}) {
  const [open, setOpen] = useState(false);

  const Item = ({ icon: Icon, label, onClick, danger }) => (
    <button
      type="button"
      onClick={() => {
        setOpen(false);
        onClick?.();
      }}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left tap
        active:scale-[0.985] ${danger ? 'text-neg hover:bg-neg-soft' : 'text-ink hover:bg-surface-2'}`}
    >
      <Icon size={19} strokeWidth={2.1} />
      <span className="newq  text-ink text-[15px]" style={danger ? { color: 'var(--neg)' } : undefined}>
        {label}
      </span>
    </button>
  );

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label="More actions"
        className={`grid size-9 shrink-0 place-items-center rounded-full text-ink-3 tap
          hover:bg-surface-2 hover:text-ink active:scale-90 ${className}`}
      >
        <MoreHorizontal size={19} />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={title} subtitle={subtitle}>
        <div className="space-y-1">
          {extra}
          {onEdit && <Item icon={Pencil} label={editLabel} onClick={onEdit} />}
          {onDelete && <Item icon={Trash2} label={deleteLabel} onClick={onDelete} danger />}
        </div>
      </Sheet>
    </>
  );
}

/* ---------------------------------------------------------- controls */

export const Segmented = Pills;
export const Switch = Toggle;

export function Progress({ value, max = 100, tone = 'brand', className = '' }) {
  const pct = Math.min(100, Math.max(0, (value / (max || 1)) * 100));
  const bg = {
    brand: 'bg-brand',
    dark: 'bg-panel',
    warn: 'bg-butter-deep',
    neg: 'bg-neg',
    violet: 'bg-brand',
    mint: 'bg-mint-deep',
  }[tone];
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-black/8 ${className}`}>
      <motion.div
        className={`h-full rounded-full ${bg}`}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', damping: 30, stiffness: 200 }}
      />
    </div>
  );
}

/* ---------------------------------------------------------- states */

export function EmptyState({ icon: Icon, title, body, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center px-6 py-16 text-center ${className}`}>
      {Icon && (
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 260 }}
          className="mb-5 grid size-18 place-items-center rounded-[26px] bg-lav-100 text-brand"
        >
          <Icon size={30} strokeWidth={1.8} />
        </motion.div>
      )}
      <h3 className="newq  text-ink text-[18px]">{title}</h3>
      {body && <p className="newq mt-2 max-w-[34ch] text-[14.5px] leading-relaxed">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton rounded-2xl ${className}`} />;
}

export function PageLoader() {
  return (
    <div className="space-y-4 p-5">
      <Skeleton className="h-44 w-full rounded-[24px]" />
      <div className="grid grid-cols-4 gap-2.5">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      {[...Array(4)].map((_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}
