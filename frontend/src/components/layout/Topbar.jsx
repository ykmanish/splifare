'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Bell, ChevronLeft, RefreshCw } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { IconCircle } from '@/components/ui/Blocks';
import { useApp } from '@/store/AppContext';
import { firstName } from '@/lib/format';

/**
 * Called at render, not hoisted to a constant: the app is a long-lived SPA and
 * a greeting baked at load would still say "Good morning" at dinner.
 */
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Sticky solid chrome at the top of every screen.
 *
 * No title  → avatar left, a time-aware greeting over the first name.
 * With title → back IconCircle (or the avatar) left, centred title.
 * Always     → the screen's own actions, then the bell with its unread dot.
 *
 * Sticky, never transformed — BottomNav is position:fixed inside the same
 * phone column and a transformed ancestor would collapse it.
 */
export default function Topbar({ title, subtitle, back, right, onOpenNotifications }) {
  const { me, unreadCount, reload, syncing } = useApp();
  const router = useRouter();

  const goBack = () => (typeof back === 'string' ? router.push(back) : router.back());

  return (
    <header className="sticky top-0 z-30 bg-canvas pt-safe">
      <div className="grid h-16 grid-cols-[auto_1fr_auto] items-center gap-3 px-5">
        {/* ---------------------------------------------- left control */}
        {back ? (
          <IconCircle icon={ChevronLeft} onClick={goBack} label="Go back" />
        ) : (
          <Link
            href="/settings"
            aria-label="Your profile"
            className="block shrink-0 rounded-full tap active:scale-95"
          >
            <Avatar person={me} size="md" />
          </Link>
        )}

        {/* ---------------------------------------------- centre */}
        {title ? (
          <div className="min-w-0 text-center">
            <h1 className="newq  text-ink truncate text-[18px] leading-tight">{title}</h1>
            {subtitle && <p className="newq truncate text-[12px] leading-tight">{subtitle}</p>}
          </div>
        ) : (
          <div className="min-w-0">
            <p className="newq text-[12.5px] leading-tight">{greeting()} 👋</p>
            <p className="newq  text-ink truncate text-[16px] leading-tight">
              {firstName(me?.name || '')}
            </p>
          </div>
        )}

        {/* ---------------------------------------------- right cluster */}
        <div className="flex shrink-0 items-center gap-2 justify-self-end">
          {right}

          <button
            type="button"
            onClick={reload}
            aria-label="Refresh"
            aria-busy={syncing || undefined}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink tap hover:bg-surface-3 active:scale-90"
          >
            <RefreshCw
              size={18}
              strokeWidth={2.2}
              className={syncing ? 'animate-spin' : ''}
            />
          </button>

          <div className="relative shrink-0">
            <IconCircle
              icon={Bell}
              onClick={onOpenNotifications}
              label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
            />

            {unreadCount > 0 && (
              <motion.span
                key={unreadCount}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 14, stiffness: 520 }}
                aria-hidden="true"
                className="pointer-events-none absolute right-1.5 top-1.5 size-2.5 rounded-full
                  bg-brand ring-2 ring-canvas"
              />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
