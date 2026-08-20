'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Award,
  Calendar,
  Camera,
  Handshake,
  Lock,
  MapPin,
  MessageCircle,
  Plane,
  Receipt,
  Scale,
  Shield,
  Target,
  Zap,
} from 'lucide-react';
import Sheet from '@/components/ui/Sheet';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Bits';
import { ConfettiLayer, useConfetti } from '@/lib/confetti';

/**
 * The badge shelf.
 *
 * Two decisions carry this screen.
 *
 * First, a locked badge shows a *ring*, not a grey box. Every badge reports
 * progress out of a target, so "3 of 5 receipts" reads as a nudge where "not
 * earned" read as a wall. The ring is the difference between a trophy case
 * and a to-do list, and the to-do list is the useful one.
 *
 * Second, the unlock is a moment. The server flags a badge `justEarned` until
 * the client says it has been seen, so the celebration fires exactly once —
 * on whichever device opens the group first — and never again on reload.
 */

const ICONS = {
  handshake: Handshake,
  scale: Scale,
  plane: Plane,
  receipt: Receipt,
  target: Target,
  chat: MessageCircle,
  camera: Camera,
  pin: MapPin,
  calendar: Calendar,
  zap: Zap,
  shield: Shield,
};

const RING = { size: 46, stroke: 3.5 };
const CIRCUMFERENCE = 2 * Math.PI * ((RING.size - RING.stroke) / 2);

const TONE_FILL = {
  mint: 'bg-mint',
  brand: 'bg-brand',
  sky: 'bg-sky',
  butter: 'bg-butter',
  grape: 'bg-grape',
  blush: 'bg-blush',
  peach: 'bg-peach',
};

function ProgressRing({ value, target, earned, children }) {
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <span className="relative grid place-items-center" style={{ width: RING.size, height: RING.size }}>
      <svg
        width={RING.size}
        height={RING.size}
        viewBox={`0 0 ${RING.size} ${RING.size}`}
        className="absolute inset-0 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={RING.size / 2}
          cy={RING.size / 2}
          r={(RING.size - RING.stroke) / 2}
          fill="none"
          stroke="currentColor"
          strokeWidth={RING.stroke}
          className="text-ink/10"
        />
        <motion.circle
          cx={RING.size / 2}
          cy={RING.size / 2}
          r={(RING.size - RING.stroke) / 2}
          fill="none"
          stroke="currentColor"
          strokeWidth={RING.stroke}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          className={earned ? 'text-pos' : 'text-brand'}
          initial={{ strokeDashoffset: CIRCUMFERENCE }}
          animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - pct) }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      {children}
    </span>
  );
}

function BadgeTile({ badge, onOpen, index }) {
  const Icon = ICONS[badge.icon] || Award;
  return (
    <motion.button
      type="button"
      onClick={() => onOpen(badge)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index * 0.03, 0.24), ease: [0.16, 1, 0.3, 1] }}
      whileTap={{ scale: 0.96 }}
      className={`flex min-w-0 flex-col items-center gap-2 rounded-[20px] px-2 py-3.5 text-center tap
        ${badge.earned ? TONE_FILL[badge.tone] || 'bg-surface-2' : 'bg-surface-2'}`}
    >
      <ProgressRing value={badge.value} target={badge.target} earned={badge.earned}>
        <span
          className={`grid size-8 place-items-center rounded-full ${
            badge.earned ? 'bg-surface text-ink' : 'bg-surface text-ink-3'
          }`}
        >
          {badge.earned ? (
            <Icon size={15} strokeWidth={2.4} />
          ) : (
            <Lock size={13} strokeWidth={2.4} />
          )}
        </span>
      </ProgressRing>

      {/* Two lines, not truncated. At four across, "First Settlement" and
          "Receipt Master" both became ellipses — a badge whose name you cannot
          read is not a badge. Three across plus wrapping fits every name in
          the catalogue. */}
      <span className="newq line-clamp-2 min-h-[2.1em] w-full text-[11.5px] leading-tight text-ink">
        {badge.name}
      </span>
      {!badge.earned && badge.target > 1 && (
        <span className="num text-[10.5px] text-ink-3">
          {badge.value}/{badge.target}
        </span>
      )}
    </motion.button>
  );
}

/**
 * The unlock.
 *
 * Deliberately a sheet rather than a toast: earning something should
 * interrupt, and a toast that slides past while the user is reading a balance
 * is the same as no celebration at all. Multiple unlocks queue rather than
 * stack, so finishing a trip does not bury the screen in cards.
 */
function UnlockSheet({ badge, onNext, remaining }) {
  const { canvasRef, fire } = useConfetti();
  const Icon = ICONS[badge?.icon] || Award;

  useEffect(() => {
    if (!badge) return undefined;
    const t = setTimeout(() => fire({ count: 110, spread: 9 }), 220);
    return () => clearTimeout(t);
  }, [badge, fire]);

  return (
    <Sheet open={!!badge} onClose={onNext} title="Badge unlocked" size="sm">
      <div className="relative overflow-hidden pb-2">
        <ConfettiLayer canvasRef={canvasRef} />
        <div className="relative z-0 flex flex-col items-center py-4 text-center">
          <motion.span
            initial={{ scale: 0.4, rotate: -18, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 12, stiffness: 220, delay: 0.08 }}
            className={`grid size-24 place-items-center rounded-[32px] ${
              TONE_FILL[badge?.tone] || 'bg-brand'
            }`}
          >
            <Icon size={40} strokeWidth={2.1} className="text-ink" />
          </motion.span>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24 }}
            className="newq mt-5 text-[24px] leading-tight text-ink"
          >
            {badge?.name}
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32 }}
            className="newq mt-2 max-w-[260px] text-[13.5px] leading-snug text-ink-3"
          >
            {badge?.blurb}
          </motion.p>
        </div>

        <Button block size="lg" onClick={onNext} className="mt-2">
          {remaining > 0 ? `Next badge (${remaining} more)` : 'Nice'}
        </Button>
      </div>
    </Sheet>
  );
}

export default function BadgeShelf({ badges = [], loading, onSeen }) {
  const [detail, setDetail] = useState(null);
  /** Ids the user has already clicked past in this session. */
  const [dismissed, setDismissed] = useState([]);

  const earned = badges.filter((b) => b.earned);
  const sorted = useMemo(
    () => [...badges].sort((a, b) => Number(b.earned) - Number(a.earned) || b.value / b.target - a.value / a.target),
    [badges],
  );

  /*
   * The queue is *derived*, not accumulated in an effect.
   *
   * The obvious version — watch `badges`, push new ones into a queue — has to
   * remember what it already pushed, or a background refetch re-queues the
   * badge currently on screen behind itself. Deriving from the server's
   * `justEarned` flag minus what the user has clicked past needs no such
   * bookkeeping, and it cannot double-queue however often the parent refetches.
   */
  const queue = useMemo(
    () => badges.filter((b) => b.justEarned && !dismissed.includes(b.id)),
    [badges, dismissed],
  );

  /** Mark it seen server-side as the user dismisses it — that *is* seeing it. */
  function next() {
    const current = queue[0];
    if (!current) return;
    setDismissed((prev) => [...prev, current.id]);
    onSeen?.([current.id]);
  }

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="h-[104px] animate-pulse rounded-[20px] bg-surface-2" />
        ))}
      </div>
    );
  }

  const DetailIcon = ICONS[detail?.icon] || Award;

  return (
    <>
      <div className="mb-3 flex items-baseline justify-between gap-3 px-0.5">
        <p className="newq text-[13px] text-ink-3">
          <span className="num text-ink">{earned.length}</span> of {badges.length} unlocked
        </p>
        {earned.length > 0 && (
          <p className="newq text-[11.5px] text-ink-3">Tap one for the detail</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {sorted.map((b, i) => (
          <BadgeTile key={b.id} badge={b} index={i} onOpen={setDetail} />
        ))}
      </div>

      <Sheet
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name}
        subtitle={detail?.earned ? 'Unlocked' : 'Locked'}
        size="sm"
      >
        {detail && (
          <div className="space-y-4">
            <Card tone={detail.earned ? detail.tone : 'soft'} className="text-center">
              <span className="mx-auto grid size-16 place-items-center rounded-[22px] bg-surface">
                <DetailIcon size={28} strokeWidth={2.2} className="text-ink" />
              </span>
              <p className="newq mt-4 text-[15px] leading-snug text-ink">{detail.blurb}</p>
              {detail.target > 1 && (
                <p className="num mt-2 text-[13px] text-ink-3">
                  {detail.value} of {detail.target}
                </p>
              )}
            </Card>
            {detail.earnedAt && (
              <p className="newq text-center text-[12px] text-ink-3">
                Unlocked {new Date(detail.earnedAt).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            )}
          </div>
        )}
      </Sheet>

      <AnimatePresence>
        {queue.length > 0 && (
          <UnlockSheet badge={queue[0]} remaining={queue.length - 1} onNext={next} />
        )}
      </AnimatePresence>
    </>
  );
}
