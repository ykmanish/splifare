'use client';

import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { initials, firstName } from '@/lib/format';

const SIZES = {
  xs: { box: 'size-6', text: 'text-[9px]' },
  sm: { box: 'size-9', text: 'text-[11px]' },
  md: { box: 'size-11', text: 'text-[13px]' },
  lg: { box: 'size-14', text: 'text-[16px]' },
  xl: { box: 'size-18', text: 'text-[21px]' },
  '2xl': { box: 'size-24', text: 'text-[28px]' },
};

/** Pastel tile colours behind each illustration. */
const TILES = ['ddd3fa', 'f8e9a1', 'cdebd8', 'fbd9e3', 'd3e5fb', 'efeafd'];
export const AVATAR_BACKGROUNDS = TILES;
export const AVATAR_STYLES = [
  { id: 'adventurer', label: 'Adventure' },
  { id: 'lorelei', label: 'Soft' },
  { id: 'micah', label: 'Clean' },
  { id: 'notionists', label: 'Sketch' },
  { id: 'personas', label: 'Persona' },
];

export const AVATAR_OPTIONS = Array.from({ length: 30 }, (_, index) => {
  const style = AVATAR_STYLES[index % AVATAR_STYLES.length];
  const bg = AVATAR_BACKGROUNDS[index % AVATAR_BACKGROUNDS.length];
  return {
    id: `avatar-${index + 1}`,
    label: `Avatar ${index + 1}`,
    seed: `splitta-avatar-${index + 1}`,
    style: style.id,
    styleLabel: style.label,
    bg,
  };
});

const hash = (s = '') => {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) >>> 0;
  return h;
};

export function avatarUrl(seed, tile, style = 'adventurer') {
  const bg = tile || TILES[hash(seed) % TILES.length];
  const safeStyle = AVATAR_STYLES.some((s) => s.id === style) ? style : 'adventurer';
  return `https://api.dicebear.com/9.x/${safeStyle}/svg?seed=${encodeURIComponent(
    seed,
  )}&backgroundColor=${bg}&radius=50&scale=88`;
}

/**
 * DiceBear illustration with an initials tile behind it, so there is never
 * a blank circle while the SVG loads (or if the API is unreachable).
 */
export default function Avatar({ person, size = 'md', ring = false, className = '', ...rest }) {
  const s = SIZES[size] || SIZES.md;
  const seed = person?.avatarSeed || person?.id || person?.name || 'splitta';
  const [failed, setFailed] = useState(false);

  const { url, tile } = useMemo(() => {
    const t = person?.avatarBg || TILES[hash(seed) % TILES.length];
    return { url: avatarUrl(seed, t, person?.avatarStyle), tile: t };
  }, [person?.avatarBg, person?.avatarStyle, seed]);

  return (
    <div
      className={`${s.box} ${s.text} relative grid shrink-0 place-items-center overflow-hidden
        rounded-full ${ring ? 'ring-2 ring-surface' : ''} ${className}`}
      style={{ background: `#${tile}` }}
      title={person?.name}
      {...rest}
    >
      <span className="newq  text-ink absolute select-none text-ink/55">{initials(person?.name)}</span>
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          aria-hidden="true"
          loading="lazy"
          onError={() => setFailed(true)}
          className="relative size-full object-cover"
        />
      )}
    </div>
  );
}

export function AvatarStack({ people = [], size = 'sm', max = 4, className = '' }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const s = SIZES[size] || SIZES.sm;

  return (
    <div className={`flex items-center ${className}`}>
      {shown.map((p, i) => (
        <Avatar
          key={p.id}
          person={p}
          size={size}
          ring
          className={i > 0 ? '-ml-2.5' : ''}
          style={{ zIndex: shown.length - i }}
        />
      ))}
      {extra > 0 && (
        <div
          className={`${s.box} ${s.text} -ml-2.5 grid shrink-0 place-items-center rounded-full
            bg-surface-3 newq  text-ink-2 ring-2 ring-surface`}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}

/** Selectable person row. */
export function PersonToggle({ person, selected, onToggle, disabled, subtitle }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onToggle(person.id)}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left tap
        disabled:opacity-40 ${selected ? 'bg-brand-soft' : 'bg-surface-2 hover:bg-surface-3'}`}
    >
      <Avatar person={person} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="newq  text-ink truncate text-[14px]">{person.name}</p>
        {subtitle && <p className="newq truncate text-[12px]">{subtitle}</p>}
      </div>
      <span
        className={`grid size-5 shrink-0 place-items-center rounded-full tap
          ${selected ? 'bg-brand text-on-brand' : 'bg-surface-3'}`}
      >
        {selected && <Check size={12} strokeWidth={3.2} />}
      </span>
    </button>
  );
}

/** Compact horizontally-scrolling person picker. */
export function PersonChip({ person, selected, onClick, you = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 tap
        active:scale-95 ${
          selected ? 'bg-brand text-on-brand' : 'bg-surface-2 text-ink-2 hover:bg-surface-3'
        }`}
    >
      <Avatar person={person} size="xs" />
      <span className="text-[13px] font-medium">{you ? 'You' : firstName(person.name)}</span>
    </button>
  );
}
