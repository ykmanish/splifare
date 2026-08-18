'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { NAV, isActive } from './nav';

const SPRING = { type: 'spring', damping: 26, stiffness: 320 };

/** Split the destinations either side of the raised centre button. */
const MID = Math.ceil(NAV.length / 2);
const LEFT = NAV.slice(0, MID);
const RIGHT = NAV.slice(MID);

/**
 * One destination. Declared at module scope — defining it inside BottomNav
 * would mint a new component type on every render, remounting the tabs and
 * killing the shared-layout dot animation.
 */
function Item({ item, active }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className="flex min-w-0 flex-1 flex-col items-center gap-1 py-1 tap active:scale-95"
    >
      <item.icon
        size={21}
        strokeWidth={active ? 2.4 : 1.9}
        className={active ? 'text-ink' : 'text-ink-3'}
      />

      <span
        className={`newq text-[10.5px] ${active ? ' text-ink' : 'text-ink-3'}`}
        style={{ letterSpacing: '-0.01em' }}
      >
        {item.label}
      </span>

      <span className="relative mt-0.5 block size-1.5">
        {active && (
          <motion.span
            layoutId="bottom-nav-dot"
            transition={SPRING}
            className="absolute inset-0 rounded-full bg-brand-strong"
          />
        )}
      </span>
    </Link>
  );
}

/**
 * Every destination in NAV, with a raised near-black disc in the middle
 * carrying a lime glyph — the accent pairing this scheme is built on.
 *
 * The 1fr/auto/1fr grid keeps the centre button dead centre even when the two
 * halves hold a different number of tabs.
 *
 * This element is position:fixed — never wrap it (or its ancestors) in an
 * animated transform, that would collapse the fixed positioning.
 */
export default function BottomNav({ onAddExpense }) {
  const pathname = usePathname();

  return (
    <nav className="phone fixed inset-x-0 bottom-0 z-40">
      <div className="bg-surface border-t border-line rounded-t-[32px] px-2 pb-safe pt-2.5 shadow-[0_-4px_24px_rgba(0,0,0,0.02)]">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end pb-1">
          <div className="flex items-end">
            {LEFT.map((i) => (
              <Item key={i.href} item={i} active={isActive(pathname, i.href)} />
            ))}
          </div>

          <div className="flex w-16 shrink-0 justify-center">
            <motion.button
              type="button"
              onClick={onAddExpense}
              aria-label="Add expense"
              whileTap={{ scale: 0.88 }}
              transition={SPRING}
              className="-mt-8 grid size-14 place-items-center rounded-full bg-panel
                text-brand ring-4 ring-canvas"
            >
              <Plus size={27} strokeWidth={3} className="text-brand" />
            </motion.button>
          </div>

          <div className="flex items-end">
            {RIGHT.map((i) => (
              <Item key={i.href} item={i} active={isActive(pathname, i.href)} />
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
