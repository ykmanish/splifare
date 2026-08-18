'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ChevronRight, Plus } from 'lucide-react';
import Avatar from './Avatar';

const SPRING = { type: 'spring', damping: 26, stiffness: 320 };

/* ================================================================
   GROUP LABEL — the small grey caption above a grouped section
   ================================================================ */

export function GroupLabel({ children, action, className = '' }) {
  return (
    <div className={`mb-2 flex items-end justify-between gap-3 px-1.5 ${className}`}>
      <span className="newq text-[12px]  uppercase tracking-[0.07em] text-ink-3">{children}</span>
      {action}
    </div>
  );
}

/* ================================================================
   LIST GROUP — rounded container, hairline-separated rows
   ================================================================ */

export function ListGroup({ tone = 'surface', className = '', children }) {
  const bg = { surface: 'bg-surface', fill: 'bg-surface-2' }[tone];
  return (
    <div className={`overflow-hidden rounded-[20px] ${bg} ${className}`}>
      <div className="divide-y divide-line">{children}</div>
    </div>
  );
}

/**
 * One row inside a ListGroup: leading icon, label (+ sublabel), trailing.
 * Renders as a link, button, or plain div depending on what you pass.
 */
export function FieldRow({
  icon: Icon,
  iconTint,
  iconBg,
  label,
  sublabel,
  value,
  trailing,
  href,
  onClick,
  chevron = false,
  plus = false,
  danger = false,
  className = '',
}) {
  const interactive = !!(href || onClick);
  const Tag = href ? Link : onClick ? 'button' : 'div';

  return (
    <Tag
      href={href}
      onClick={onClick}
      type={Tag === 'button' ? 'button' : undefined}
      className={`flex w-full items-center gap-3.5 px-4 py-3.5 text-left tap
        ${interactive ? 'hover:bg-surface-2 active:scale-[0.99]' : ''} ${className}`}
    >
      {Icon && (
        <span
          className="grid size-9 shrink-0 place-items-center rounded-[11px]"
          style={{
            background: iconBg || 'var(--surface-2)',
            color: danger ? 'var(--neg)' : iconTint || 'var(--text)',
          }}
        >
          <Icon size={17} strokeWidth={2.1} />
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span
          className="newq  text-ink block truncate text-[15px]"
          style={danger ? { color: 'var(--neg)' } : undefined}
        >
          {label}
        </span>
        {sublabel && <span className="newq block truncate text-[12.5px]">{sublabel}</span>}
      </span>

      {value && (
        <span className="num shrink-0 text-[15px] font-medium text-ink">{value}</span>
      )}
      {trailing}
      {plus && <Plus size={18} strokeWidth={2.2} className="shrink-0 text-ink-3" />}
      {chevron && <ChevronRight size={18} strokeWidth={2.2} className="shrink-0 text-ink-3" />}
    </Tag>
  );
}

/* ================================================================
   ACTION TILES — the 3-up row (Complete · Edit · Remove)
   ================================================================ */

const TILE_TONES = {
  neutral: { bg: 'bg-surface-2', fg: 'text-ink', icon: 'text-ink' },
  dark: { bg: 'bg-panel', fg: 'text-white', icon: 'text-white' },
  pos: { bg: 'bg-mint', fg: 'text-pos', icon: 'text-pos' },
  neg: { bg: 'bg-blush', fg: 'text-neg', icon: 'text-neg' },
  blue: { bg: 'bg-sky', fg: 'text-info', icon: 'text-info' },
};

/**
 * actions: [{ id, label, icon, tone?, onClick?, href?, disabled? }]
 */
export function ActionTiles({ actions = [], className = '' }) {
  return (
    <div className={`grid gap-2.5 ${className}`} style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
      {actions.map((a) => {
        const t = TILE_TONES[a.tone || 'neutral'];
        const Tag = a.href ? Link : 'button';
        return (
          <motion.div key={a.id} whileTap={a.disabled ? undefined : { scale: 0.96 }} transition={SPRING}>
            <Tag
              href={a.href}
              onClick={a.onClick}
              disabled={Tag === 'button' ? a.disabled : undefined}
              type={Tag === 'button' ? 'button' : undefined}
              className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-[16px]
                px-2 py-3.5 tap disabled:opacity-40 ${t.bg}`}
            >
              {a.icon && <a.icon size={19} strokeWidth={2.2} className={t.icon} />}
              <span className={`newq text-[12.5px]  ${t.fg}`}>{a.label}</span>
            </Tag>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ================================================================
   ICON BUTTON — circular grey control (pencil / trash / close)
   ================================================================ */

export function IconCircle({
  icon: Icon,
  onClick,
  href,
  label,
  tone = 'neutral',
  size = 'md',
  className = '',
}) {
  const dims = { sm: 'size-9', md: 'size-10', lg: 'size-11' }[size];
  const px = { sm: 16, md: 18, lg: 19 }[size];
  const t = {
    neutral: 'bg-surface-2 text-ink',
    dark: 'bg-panel text-white',
    neg: 'bg-blush text-neg',
    blue: 'bg-sky text-brand',
  }[tone];

  const Tag = href ? Link : 'button';
  return (
    <motion.div whileTap={{ scale: 0.9 }} transition={SPRING} className="shrink-0">
      <Tag
        href={href}
        onClick={onClick}
        type={Tag === 'button' ? 'button' : undefined}
        aria-label={label}
        className={`grid ${dims} place-items-center rounded-full tap ${t} ${className}`}
      >
        <Icon size={px} strokeWidth={2.2} />
      </Tag>
    </motion.div>
  );
}

/* ================================================================
   SHEET HEADER — left control · centred title · right control
   ================================================================ */

export function SheetHeader({ title, subtitle, left, right, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="w-10 shrink-0">{left}</div>
      <div className="min-w-0 flex-1 text-center">
        <h2 className="newq  text-ink truncate text-[19px] leading-tight">{title}</h2>
        {subtitle && <p className="newq truncate text-[12.5px]">{subtitle}</p>}
      </div>
      <div className="flex w-10 shrink-0 justify-end">{right}</div>
    </div>
  );
}

/* ================================================================
   AVATAR CLUSTER — the soft circular blob of overlapping faces
   ================================================================ */

export function AvatarCluster({ people = [], label, sublabel, badge, onClick, href, size = 132 }) {
  const shown = people.slice(0, 6);
  const n = Math.max(shown.length, 1);
  // Ring them inside the blob; a single face sits dead centre.
  const radius = n === 1 ? 0 : size * 0.21;
  const face = n <= 2 ? size * 0.3 : n <= 4 ? size * 0.26 : size * 0.22;

  const Tag = href ? Link : onClick ? 'button' : 'div';

  return (
    <Tag
      href={href}
      onClick={onClick}
      type={Tag === 'button' ? 'button' : undefined}
      className="flex flex-col items-center gap-2.5 tap active:scale-[0.97]"
    >
      <div
        className="relative grid shrink-0 place-items-center rounded-full bg-surface-2"
        style={{ width: size, height: size }}
      >
        {shown.map((p, i) => {
          const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
          return (
            <span
              key={p.id}
              className="absolute"
              style={{
                width: face,
                height: face,
                left: `calc(50% + ${Math.cos(angle) * radius}px - ${face / 2}px)`,
                top: `calc(50% + ${Math.sin(angle) * radius}px - ${face / 2}px)`,
              }}
            >
              <Avatar person={p} size="md" ring className="!size-full" />
            </span>
          );
        })}

        {badge != null && (
          <span
            className="absolute right-1 top-1 grid min-w-6 place-items-center rounded-full
              bg-brand px-1.5 text-[11.5px]  text-on-brand ring-2 ring-canvas"
          >
            {badge}
          </span>
        )}
      </div>

      {label && <span className="newq  text-ink text-[15.5px]">{label}</span>}
      {sublabel && <span className="newq -mt-1.5 text-[12.5px]">{sublabel}</span>}
    </Tag>
  );
}

/* ================================================================
   PERSON ROW — avatar · name/sub · trailing pill (the invite list)
   ================================================================ */

export function PersonRow({ person, name, sublabel, trailing, onClick, href, className = '' }) {
  const Tag = href ? Link : onClick ? 'button' : 'div';
  return (
    <Tag
      href={href}
      onClick={onClick}
      type={Tag === 'button' ? 'button' : undefined}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left tap ${className}`}
    >
      <Avatar person={person} size="md" />
      <span className="min-w-0 flex-1">
        <span className="newq  text-ink block truncate text-[15px]">{name ?? person?.name}</span>
        {sublabel && <span className="newq block truncate text-[12.5px]">{sublabel}</span>}
      </span>
      {trailing}
    </Tag>
  );
}

/* ================================================================
   STATUS PILL — full-width grey status strip
   ================================================================ */

/**
 * Full-width status strip.
 *
 * The label is always ink and the tone rides on the icon instead. Colouring
 * the text left `blue` at 1.14:1 (lime on pale blue — invisible), and `pos`
 * and `neg` at 2.1:1 and 3.0:1, all well under WCAG AA. Ink on these fills
 * is above 14:1, and a tinted icon carries the meaning perfectly well.
 */
export function StatusPill({ children, tone = 'neutral', icon: Icon, className = '' }) {
  const t = {
    neutral: { bg: 'bg-surface-2', icon: 'text-ink-3' },
    pos: { bg: 'bg-mint', icon: 'text-pos' },
    neg: { bg: 'bg-blush', icon: 'text-neg' },
    blue: { bg: 'bg-sky', icon: 'text-info' },
  }[tone] || { bg: 'bg-surface-2', icon: 'text-ink-3' };

  return (
    <div
      className={`flex items-center justify-center gap-2 rounded-[16px] px-4 py-3.5 ${t.bg} ${className}`}
    >
      {Icon && <Icon size={16} strokeWidth={2.2} className={`shrink-0 ${t.icon}`} />}
      <span className="newq text-[13.5px] text-ink">{children}</span>
    </div>
  );
}

/* ================================================================
   METRIC COLUMNS — the "Daily goals" style stat row
   ================================================================ */

/** stats: [{ label, value, sub, tone }] */
export function MetricRow({ stats = [], className = '' }) {
  const bar = { brand: 'bg-brand', pos: 'bg-pos', neg: 'bg-neg', warn: 'bg-butter-deep' };
  const txt = { brand: 'text-ink', pos: 'text-pos', neg: 'text-neg', warn: 'text-warn' };

  return (
    <div className={`grid gap-4 ${className}`} style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0,1fr))` }}>
      {stats.map((s) => (
        <div key={s.label}>
          <p className="newq truncate text-[12.5px]">{s.label}</p>
          <p className="num mt-0.5 truncate text-[19px] ">
            <span className={txt[s.tone] || 'text-ink'}>{s.value}</span>
            {s.sub && <span className="text-[13px] font-normal text-ink-3">{s.sub}</span>}
          </p>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-3">
            <motion.div
              className={`h-full rounded-full ${bar[s.tone] || 'bg-ink'}`}
              initial={false}
              animate={{ width: `${Math.min(100, Math.max(0, s.pct ?? 0))}%` }}
              transition={{ type: 'spring', damping: 30, stiffness: 200 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================================================================
   BUBBLE TILES — the pastel amount tiles from the reference
   ================================================================ */

const BUBBLE_TONES = {
  lavender: 'bg-grape',
  grape: 'bg-grape',
  butter: 'bg-butter',
  mint: 'bg-mint',
  sky: 'bg-sky',
  blush: 'bg-blush',
  peach: 'bg-peach',
};

const BUBBLE_CYCLE = ['lavender', 'sky', 'butter', 'mint', 'blush', 'peach'];

/**
 * One pastel tile: emoji badge on a white disc, a caption, and a big amount.
 * `size="lg"` makes it the feature tile in a BubbleGrid.
 */
export function BubbleTile({
  emoji,
  icon: Icon,
  label,
  value,
  tone = 'lavender',
  size = 'md',
  href,
  onClick,
  className = '',
}) {
  const Tag = href ? Link : onClick ? 'button' : 'div';
  const pad = size === 'lg' ? 'p-5' : 'p-4';

  return (
    <motion.div whileTap={href || onClick ? { scale: 0.97 } : undefined} transition={SPRING}>
      <Tag
        href={href}
        onClick={onClick}
        type={Tag === 'button' ? 'button' : undefined}
        className={`flex h-full w-full flex-col justify-between rounded-[24px] text-left tap
          ${BUBBLE_TONES[tone] || BUBBLE_TONES.lavender} ${pad} ${className}`}
      >
        <span className="grid size-11 place-items-center rounded-full bg-white/70">
          {Icon ? (
            <Icon size={20} strokeWidth={2.1} className="text-ink" />
          ) : (
            <span className="text-[19px] leading-none">{emoji}</span>
          )}
        </span>

        <span className="mt-6 block">
          {label && <span className="newq block truncate text-[12.5px]">{label}</span>}
          <span
            className={`num block truncate  text-ink ${
              size === 'lg' ? 'text-[26px]' : 'text-[19px]'
            }`}
          >
            {value}
          </span>
        </span>
      </Tag>
    </motion.div>
  );
}

/**
 * Two-column masonry of BubbleTiles — the first tile runs tall, matching
 * the staggered grid in the reference.
 */
export function BubbleGrid({ tiles = [], className = '' }) {
  const left = tiles.filter((_, i) => i % 2 === 0);
  const right = tiles.filter((_, i) => i % 2 === 1);

  const col = (items, offset) => (
    <div className={`flex flex-col gap-3 ${offset ? 'pt-7' : ''}`}>
      {items.map((t, i) => (
        <motion.div
          key={t.id ?? t.label ?? i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1], delay: i * 0.06 }}
          className={t.size === 'lg' ? 'aspect-[1/1.12]' : 'aspect-square'}
        >
          <BubbleTile {...t} tone={t.tone || BUBBLE_CYCLE[(tiles.indexOf(t) || 0) % BUBBLE_CYCLE.length]} />
        </motion.div>
      ))}
    </div>
  );

  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`}>
      {col(left, false)}
      {col(right, true)}
    </div>
  );
}

/* ================================================================
   CATEGORY CHIP — white pill with a coloured dot
   ================================================================ */

export function CategoryChip({ label, dot = 'var(--dot-other)', active, onClick, className = '' }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 tap
        ${active ? 'bg-panel' : 'bg-surface-2'} ${onClick ? 'active:scale-95' : ''} ${className}`}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: dot }} />
      <span
        className="newq  text-ink text-[13px]"
        style={active ? { color: 'var(--on-panel)' } : undefined}
      >
        {label}
      </span>
    </Tag>
  );
}

/** Horizontally scrolling row of CategoryChips. */
export function ChipRow({ chips = [], value, onChange, className = '' }) {
  return (
    <div className={`-mx-5 overflow-x-auto px-5 no-scrollbar ${className}`}>
      <div className="flex gap-2 pb-1">
        {chips.map((c) => (
          <CategoryChip
            key={c.id}
            label={c.label}
            dot={c.dot}
            active={c.id === value}
            onClick={onChange ? () => onChange(c.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/* ================================================================
   CORAL FAB — the floating add button
   ================================================================ */

export function CoralFab({ icon: Icon = Plus, onClick, href, label = 'Add', className = '' }) {
  const Tag = href ? Link : 'button';
  return (
    <motion.div whileTap={{ scale: 0.88 }} transition={SPRING} className={className}>
      <Tag
        href={href}
        onClick={onClick}
        type={Tag === 'button' ? 'button' : undefined}
        aria-label={label}
        className="grid size-14 place-items-center rounded-full bg-coral text-on-coral
          shadow-[0_10px_24px_-8px_rgba(255,90,95,0.7)] tap"
      >
        <Icon size={25} strokeWidth={2.6} />
      </Tag>
    </motion.div>
  );
}
