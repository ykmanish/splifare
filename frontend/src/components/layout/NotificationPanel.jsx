'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Receipt,
  Wallet,
  BellRing,
  ShoppingCart,
  Users,
  UserPlus,
  UserCheck,
  KeyRound,
  DoorOpen,
  CheckCheck,
  Bell,
  Trash2,
} from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { dayLabel, relativeTime } from '@/lib/format';
import { FieldRow, GroupLabel, IconCircle, ListGroup, SheetHeader } from '@/components/ui/Blocks';
import { EmptyState } from '@/components/ui/Bits';
import Button from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { lockScroll } from '@/lib/scrollLock';

const KIND = {
  expense_added: { icon: Receipt, tint: 'var(--brand)' },
  settle: { icon: Wallet, tint: 'var(--pos)' },
  reminder: { icon: BellRing, tint: 'var(--warn)' },
  list_shared: { icon: ShoppingCart, tint: 'var(--info)' },
  list_completed: { icon: ShoppingCart, tint: 'var(--pos)' },
  group_invite: { icon: Users, tint: 'var(--info)' },
  group_joined: { icon: KeyRound, tint: 'var(--info)' },
  group_left: { icon: DoorOpen, tint: 'var(--warn)' },
  friend_added: { icon: UserPlus, tint: 'var(--brand)' },
  friend_request: { icon: UserPlus, tint: 'var(--warn)' },
  friend_accepted: { icon: UserCheck, tint: 'var(--pos)' },
};

const EASE = [0.16, 1, 0.3, 1];

/* The portal target only exists on the client, so the server must render
   nothing and the client must agree on its first (hydrating) pass. */
const subscribeNever = () => () => {};
const onClient = () => true;
const onServer = () => false;

function routeFor(n) {
  // A request has no friendship to open yet — send them where they can answer.
  if (n.type === 'friend_request') return '/friends';

  switch (n.entityType) {
    case 'group':
      return `/groups/${n.entityId}`;
    case 'friend':
      return `/friends/${n.entityId}`;
    case 'list':
      return `/lists/${n.entityId}`;
    default:
      return '/activity';
  }
}

export default function NotificationPanel({ open, onClose }) {
  const { notifications, unreadCount, markRead, markAllRead, clearNotifications } = useApp();
  const router = useRouter();
  const { toast } = useToast();

  const mounted = useSyncExternalStore(subscribeNever, onClient, onServer);
  const [confirmClear, setConfirmClear] = useState(false);
  const [marking, setMarking] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    return lockScroll();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /** Consecutive runs of the same day → one GroupLabel + one ListGroup each. */
  const days = useMemo(() => {
    const out = [];
    for (const n of notifications) {
      const key = dayLabel(n.createdAt);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(n);
      else out.push({ key, items: [n] });
    }
    return out;
  }, [notifications]);

  if (!mounted) return null;

  /* Navigate first so the tap feels instant, then settle the read flag. */
  const go = async (n) => {
    onClose();
    router.push(routeFor(n));
    if (n.read) return;
    try {
      await markRead(n.id);
    } catch (err) {
      toast({
        tone: 'error',
        title: 'Could not mark as read',
        description: err.message,
      });
    }
  };

  const onMarkAllRead = async () => {
    if (marking) return;
    setMarking(true);
    try {
      await markAllRead();
    } catch (err) {
      toast({
        tone: 'error',
        title: 'Could not mark all as read',
        description: err.message,
      });
    } finally {
      setMarking(false);
    }
  };

  const onClearAll = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      await clearNotifications();
    } catch (err) {
      toast({
        tone: 'error',
        title: 'Could not clear notifications',
        description: err.message,
      });
    } finally {
      setClearing(false);
    }
  };

  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-100">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/45 backdrop-blur-[3px]"
            />

            <motion.aside
              role="dialog"
              aria-label="Notifications"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 34, stiffness: 360, mass: 0.8 }}
              className="phone absolute inset-y-0 left-0 right-0 flex flex-col bg-canvas
                pt-safe pb-safe"
            >
              <div className="px-5 pb-4 pt-4">
                <SheetHeader
                  title="Notifications"
                  subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up'}
                  left={
                    unreadCount > 0 ? (
                      <IconCircle
                        icon={CheckCheck}
                        onClick={onMarkAllRead}
                        label="Mark all as read"
                      />
                    ) : null
                  }
                  right={<IconCircle icon={X} onClick={onClose} label="Close notifications" />}
                />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
                {notifications.length === 0 ? (
                  <EmptyState
                    icon={Bell}
                    title="Nothing yet"
                    body="Expenses, payments and shopping updates from your groups will land here."
                  />
                ) : (
                  <div className="space-y-5">
                    {days.map((d, i) => (
                      <motion.section
                        key={`${d.key}-${d.items[0].id}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.4,
                          ease: EASE,
                          delay: Math.min(i, 8) * 0.04,
                        }}
                      >
                        <GroupLabel>{d.key}</GroupLabel>

                        <ListGroup>
                          {d.items.map((n) => {
                            const k = KIND[n.type] || KIND.expense_added;
                            return (
                              <FieldRow
                                key={n.id}
                                icon={k.icon}
                                iconTint={k.tint}
                                iconBg={`color-mix(in srgb, ${k.tint} 15%, transparent)`}
                                label={n.title}
                                sublabel={
                                  <span className="block whitespace-normal">{n.body}</span>
                                }
                                onClick={() => go(n)}
                                className={n.read ? '' : 'bg-sky'}
                                trailing={
                                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                                    <span className="newq whitespace-nowrap text-[11.5px]">
                                      {relativeTime(n.createdAt)}
                                    </span>
                                    {!n.read && (
                                      <span className="size-2 rounded-full bg-brand" />
                                    )}
                                  </span>
                                }
                              />
                            );
                          })}
                        </ListGroup>
                      </motion.section>
                    ))}
                  </div>
                )}
              </div>

              {notifications.length > 0 && (
                <div className="px-5 pb-4 pt-2">
                  <Button
                    variant="dangerSoft"
                    size="md"
                    block
                    icon={Trash2}
                    loading={clearing}
                    onClick={() => setConfirmClear(true)}
                  >
                    Clear all
                  </Button>
                </div>
              )}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <ConfirmSheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={onClearAll}
        title="Clear all notifications?"
        body="This removes every notification from your inbox. It cannot be undone."
        confirmLabel="Clear all"
        danger
      />
    </>,
    document.body,
  );
}
