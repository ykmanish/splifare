'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  /* Lime pill — the hero call to action */
  primary: 'bg-brand text-on-brand shadow-brand hover:bg-brand-strong',
  /* Near-black pill — confirm / pay / emphasis */
  dark: 'bg-panel !text-white hover:brightness-150',
  /* White pill — sits on the canvas or on a dark panel edge */
  white: 'bg-surface text-ink hover:bg-surface-2',
  secondary: 'bg-surface text-ink hover:bg-surface-2',
  soft: 'bg-surface-2 text-ink hover:bg-surface-3',
  onTone: 'bg-black/6 text-ink hover:bg-black/10',
  limeSoft: 'bg-brand-soft text-ink hover:brightness-97',
  brandSoft: 'bg-brand-soft text-ink hover:brightness-97',
  pos: 'bg-mint text-pos hover:brightness-97',
  ghost: 'bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-neg text-white hover:brightness-110',
  dangerSoft: 'bg-neg-soft text-neg hover:brightness-97',
  /* On the near-black panel */
  onPanel: 'bg-panel-3 text-white hover:brightness-150',
};

const SIZES = {
  xs: 'h-8 px-3.5 text-[12.5px] gap-1.5',
  sm: 'h-10 px-4 text-[13.5px] gap-2',
  md: 'h-12 px-5 text-[15px] gap-2',
  lg: 'h-14 px-6 text-[16px] gap-2.5',
};

const ICON_SIZES = { xs: 'size-8', sm: 'size-10', md: 'size-12', lg: 'size-14' };

export default function Button({
  as,
  href,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  block = false,
  square = false,
  className = '',
  children,
  disabled,
  ...rest
}) {
  const iconOnly = !children && (Icon || IconRight);
  const Comp = href ? Link : as || 'button';

  const classes = [
    'relative inline-flex items-center justify-center rounded-full newq ',
    'select-none whitespace-nowrap tap active:scale-[0.96]',
    'disabled:pointer-events-none disabled:opacity-40',
    iconOnly ? `${ICON_SIZES[size]} shrink-0` : SIZES[size],
    square && '!rounded-2xl',
    VARIANTS[variant] || VARIANTS.primary,
    block && 'w-full',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const px = size === 'lg' ? 20 : size === 'xs' ? 15 : 18;

  return (
    <Comp
      href={href}
      className={classes}
      disabled={Comp === 'button' ? disabled || loading : undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Loader2 size={px} className="animate-spin" />
      ) : (
        Icon && <Icon size={px} strokeWidth={2.3} className="shrink-0" />
      )}
      {children}
      {IconRight && !loading && <IconRight size={px} strokeWidth={2.3} className="shrink-0" />}
    </Comp>
  );
}
