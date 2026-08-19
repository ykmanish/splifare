'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';
import { lockScroll } from '@/lib/scrollLock';
import { api } from '@/lib/api';

/**
 * Taking the new build.
 *
 * The steps are real work, and the bar is driven by them finishing rather
 * than by a timer pretending to be progress: a bar that fills on a schedule
 * and then sits at 99% is worse than no bar, because the number stops meaning
 * anything. The estimate is the honest part — a rough remaining figure, from
 * measured step weights, that stops counting the moment the step lands.
 */

/**
 * Weights are how long each step tends to take relative to the others, not
 * seconds. `seconds` is the estimate shown, and only ever an estimate — a
 * cold cache on a slow connection will beat it or lose to it.
 */
const STEPS = [
  // Measured at ~2s end to end on a warm connection; the fetch is the only
  // step that varies, so it carries most of the estimate.
  { id: 'fetch', label: 'Fetching the new version', weight: 3, seconds: 2 },
  { id: 'worker', label: 'Swapping in the new app', weight: 2, seconds: 1 },
  { id: 'cache', label: 'Clearing the old files', weight: 2, seconds: 1 },
  { id: 'ready', label: 'Almost there', weight: 1, seconds: 1 },
];

const TOTAL_WEIGHT = STEPS.reduce((sum, s) => sum + s.weight, 0);
const TOTAL_SECONDS = STEPS.reduce((sum, s) => sum + s.seconds, 0);

export default function UpdateSheet({ open, onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(null);
  const [remaining, setRemaining] = useState(TOTAL_SECONDS);
  const [notes, setNotes] = useState(null);
  const started = useRef(false);

  const progress = done
    ? 100
    : Math.round(
        (STEPS.slice(0, stepIndex).reduce((sum, s) => sum + s.weight, 0) / TOTAL_WEIGHT) * 100,
      );

  useEffect(() => {
    if (!open) return undefined;
    return lockScroll();
  }, [open]);

  /*
   * The estimate is re-based whenever a step lands — adjusted during render
   * rather than from an effect, which would set state on a tick the render
   * already knew about and re-render the whole sheet a second time.
   */
  const [countedFrom, setCountedFrom] = useState(-1);
  if (open && !done && countedFrom !== stepIndex) {
    setCountedFrom(stepIndex);
    setRemaining(STEPS.slice(stepIndex).reduce((sum, s) => sum + s.seconds, 0));
  }

  useEffect(() => {
    if (!open || done) return undefined;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [open, done]);

  const run = useCallback(async () => {
    const advance = (index) =>
      new Promise((resolve) => {
        setStepIndex(index);
        // A beat per step so the label is readable rather than a flicker; the
        // work below is genuinely fast on a warm connection.
        setTimeout(resolve, 420);
      });

    try {
      // 1. Make sure the new build is actually reachable before tearing
      //    anything down — otherwise a flaky network leaves a blank app.
      await advance(0);
      await Promise.all([
        fetch(`/?v=${Date.now()}`, { cache: 'reload' }).catch(() => {}),
        // What they are about to get. Failing to read it is not a reason to
        // fail the update, so it degrades to no notes rather than an error.
        api
          .version()
          .then((v) => setNotes(v?.notes || null))
          .catch(() => {}),
      ]);

      // 2. Hand over to the new service worker, if one is registered.
      await advance(1);
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
        await Promise.all(regs.map((r) => r.update().catch(() => {})));
      }

      // 3. Drop the old cached shell. The share cache is left alone — it may
      //    hold something the user is midway through using.
      await advance(2);
      if ('caches' in window) {
        const keys = await caches.keys().catch(() => []);
        await Promise.all(
          keys.filter((k) => k !== 'splitta-share').map((k) => caches.delete(k).catch(() => {})),
        );
      }

      await advance(3);
      setDone(true);
    } catch (err) {
      setFailed(err?.message || 'Something went wrong');
    }
  }, []);

  useEffect(() => {
    if (!open || started.current) return;
    started.current = true;
    run();
  }, [open, run]);

  /*
   * The sheet is mounted for the whole session, so a close has to put it back
   * how it was for the next open. Done during render, for the same reason as
   * the estimate above.
   */
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setStepIndex(0);
      setCountedFrom(-1);
      setDone(false);
      setFailed(null);
      setNotes(null);
      setRemaining(TOTAL_SECONDS);
    }
  }

  // The one-run latch is a ref, so it is cleared from an effect rather than
  // during render.
  useEffect(() => {
    if (!open) started.current = false;
  }, [open]);

  const finish = () => {
    // A cache-busting reload rather than location.reload(), which a browser
    // is free to answer from its own memory cache.
    window.location.replace(`${window.location.pathname}?u=${Date.now()}`);
  };

  if (typeof document === 'undefined') return null;

  const step = STEPS[Math.min(stepIndex, STEPS.length - 1)];

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-180 flex items-end justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24 }}
            className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
          />

          <motion.div
            role="status"
            aria-live="polite"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340, mass: 0.85 }}
            // Capped and scrollable: with a full set of release notes this
            // would otherwise run past the bottom of a small phone, taking the
            // only button with it.
            className="phone relative max-h-[88dvh] overflow-y-auto overscroll-contain
              rounded-t-[28px] bg-surface px-6 pb-8 pt-3 text-center shadow-xl"
          >
            <div className="mx-auto mb-6 h-1.5 w-10 rounded-full bg-line-strong" />

            <div className="flex justify-center">
              {done ? (
                <motion.span
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 13, stiffness: 320 }}
                  className="grid size-20 place-items-center rounded-[26px] bg-pos text-white"
                >
                  <Check size={38} strokeWidth={3.2} />
                </motion.span>
              ) : (
                <motion.div
                  animate={{ y: [0, -9, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Image
                    src="/icon.png"
                    alt=""
                    width={80}
                    height={80}
                    priority
                    className="size-20 rounded-[26px]"
                  />
                </motion.div>
              )}
            </div>

            <h2 className="small text-ink mt-6 text-[21px] tracking-[0.02em]">
              {failed ? 'Could not update' : done ? 'All done' : 'Bringing you the new things'}
            </h2>
            <p className="newq mt-1.5 text-[14px]">
              {failed || (done ? 'Splitta is up to date.' : step.label)}
            </p>

            {/* What they actually got, in their words rather than the diff's.
                Only after it lands — before that it would be a promise. */}
            {done && notes?.items?.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="mt-6 rounded-[22px] bg-surface-2 p-4 text-left"
              >
                <p className="newq flex items-center gap-2 text-[11.5px] uppercase tracking-[0.09em] text-ink-3">
                  <Sparkles size={13} strokeWidth={2.4} />
                  What&rsquo;s new
                  {notes.version && <span className="num ml-auto normal-case">v{notes.version}</span>}
                </p>

                {notes.title && (
                  <p className="small mt-2 text-[15px] leading-snug text-ink">{notes.title}</p>
                )}

                <ul className="mt-3 space-y-2.5">
                  {notes.items.map((item, index) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className="num mt-0.5 grid size-5 shrink-0 place-items-center rounded-full
                          bg-brand text-[10.5px] font-medium text-on-brand"
                      >
                        {index + 1}
                      </span>
                      <span className="newq text-[13px] leading-snug text-ink">{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}

            {!done && !failed && (
              <>
                <div
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Update progress"
                  className="mt-6 h-2 w-full overflow-hidden rounded-full bg-surface-3"
                >
                  <motion.div
                    className="h-full rounded-full bg-brand"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(progress, 4)}%` }}
                    transition={{ type: 'spring', damping: 30, stiffness: 120 }}
                  />
                </div>
                <p className="newq mt-2.5 text-[12px]">
                  <span className="num">{progress}%</span>
                  {remaining > 0 && (
                    <>
                      {' · about '}
                      <span className="num">{remaining}</span>
                      {remaining === 1 ? ' second left' : ' seconds left'}
                    </>
                  )}
                </p>
              </>
            )}

            {(done || failed) && (
              <motion.button
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                onClick={done ? finish : onClose}
                className="mt-7 h-12 w-full rounded-full bg-panel px-8 newq text-[15px]
                   text-white tap active:scale-[0.97]"
              >
                {done ? 'Open the new version' : 'Close'}
              </motion.button>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
