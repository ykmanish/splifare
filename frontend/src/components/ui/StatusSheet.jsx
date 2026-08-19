'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Send, Check, AlertCircle } from 'lucide-react';
import { lockScroll } from '@/lib/scrollLock';

/** Scalloped disc behind the state glyph, as in the reference. */
function Scallop({ tone = 'pos', children }) {
  const fill = { pos: 'var(--pos)', brand: 'var(--brand)', neg: 'var(--neg)' }[tone];
  const points = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return `${50 + 46 * Math.cos(a)}% ${50 + 46 * Math.sin(a)}%`;
  });

  return (
    <div className="relative grid size-24 place-items-center">
      {points.map((p, i) => (
        <span
          key={i}
          className="absolute size-8 rounded-full"
          style={{ background: fill, left: `calc(${p.split(' ')[0]} - 1rem)`, top: `calc(${p.split(' ')[1]} - 1rem)` }}
        />
      ))}
      <span className="absolute inset-2 rounded-full" style={{ background: fill }} />
      <span className="relative text-white">{children}</span>
    </div>
  );
}

/**
 * The processing → success pair from the reference. Render it with
 * `state` of 'processing' | 'success' | 'error' | null.
 */
export default function StatusSheet({
  state,
  onClose,
  processingTitle = 'Processing…',
  processingBody = 'Hang on a moment',
  successTitle = 'Success!',
  successBody = 'That went through',
  errorTitle = 'Did not work',
  errorBody = 'Give it another go',
  actionLabel = 'Nice one!',
}) {
  const open = !!state;

  useEffect(() => {
    if (!open) return undefined;
    return lockScroll();
  }, [open]);

  if (typeof document === 'undefined') return null;

  const copy = {
    processing: { title: processingTitle, body: processingBody },
    success: { title: successTitle, body: successBody },
    error: { title: errorTitle, body: errorBody },
  }[state] || { title: '', body: '' };

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
            className="phone relative rounded-t-[28px] bg-surface px-6 pb-8 pt-3 text-center shadow-xl"
          >
            <div className="mx-auto mb-6 h-1.5 w-10 rounded-full bg-line-strong" />

            <div className="flex justify-center">
              {state === 'processing' ? (
                <motion.div
                  animate={{ y: [0, -9, 0], rotate: [0, -6, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  className="grid size-24 place-items-center rounded-full bg-brand-soft text-brand"
                >
                  <Send size={38} strokeWidth={2} />
                </motion.div>
              ) : (
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 13, stiffness: 320 }}
                >
                  <Scallop tone={state === 'error' ? 'neg' : 'pos'}>
                    {state === 'error' ? (
                      <AlertCircle size={38} strokeWidth={2.4} />
                    ) : (
                      <Check size={40} strokeWidth={3.2} />
                    )}
                  </Scallop>
                </motion.div>
              )}
            </div>

            <h2 className="newq  text-ink mt-6 text-[21px]">{copy.title}</h2>
            <p className="newq mt-1.5 text-[14px]">{copy.body}</p>

            {state !== 'processing' && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                onClick={onClose}
                className="mt-7 h-12 w-full rounded-full bg-panel px-8 newq text-[15px]
                   text-white tap active:scale-[0.97]"
              >
                {actionLabel}
              </motion.button>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
