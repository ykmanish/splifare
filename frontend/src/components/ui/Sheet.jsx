'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import { X } from 'lucide-react';

export const SPRING = { type: 'spring', damping: 32, stiffness: 340, mass: 0.85 };
export const SPRING_SOFT = { type: 'spring', damping: 28, stiffness: 260, mass: 0.9 };

/**
 * Bottom sheet on phones (draggable, flick to dismiss), centred dialog on
 * desktop. Everything modal in the app runs through this.
 */
export default function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  dismissable = true,
  padded = true,
}) {
  const y = useMotionValue(0);
  const backdrop = useTransform(y, [0, 400], [1, 0.35]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && dismissable && onClose?.();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, dismissable]);

  useEffect(() => {
    if (open) y.set(0);
  }, [open, y]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            style={{ opacity: backdrop }}
            onClick={() => dismissable && onClose?.()}
            className="absolute inset-0 bg-black/65 backdrop-blur-[3px]"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            drag={dismissable ? 'y' : false}
            dragDirectionLock
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 130 || info.velocity.y > 700) onClose?.();
            }}
            style={{ y }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
            transition={SPRING}
            className="phone relative flex max-h-[92dvh] w-full touch-pan-y flex-col
              overflow-hidden rounded-t-[28px] bg-surface shadow-xl"
          >
            <div className="flex justify-center pt-3">
              <div className="h-1.5 w-10 rounded-full bg-line-strong" />
            </div>

            {(title || dismissable) && (
              <header className="flex items-start gap-3 px-5 pb-3 pt-4">
                <div className="min-w-0 flex-1">
                  {title && <h2 className="newq  text-ink text-[21px] leading-tight">{title}</h2>}
                  {subtitle && <p className="newq mt-1 text-[13.5px]">{subtitle}</p>}
                </div>
                {dismissable && (
                  <button
                    onClick={onClose}
                    aria-label="Close"
                    className="-mr-1.5 -mt-1 grid size-9 shrink-0 place-items-center rounded-full
                      bg-surface-2 text-ink-2 tap hover:bg-surface-3 hover:text-ink active:scale-90"
                  >
                    <X size={18} strokeWidth={2.4} />
                  </button>
                )}
              </header>
            )}

            <div
              className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${padded ? 'px-5 pb-[max(3rem,env(safe-area-inset-bottom))]' : ''}`}
            >
              {children}
            </div>

            {footer && (
              <footer className="border-t border-line bg-surface px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{footer}</footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Compact confirm dialog on the same primitive. */
export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  body,
  confirmLabel = 'Confirm',
  danger = false,
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} size="sm">
      {body && <p className="newq text-[15px] leading-relaxed">{body}</p>}
      <div className="mt-6 flex gap-2.5">
        <button
          onClick={onClose}
          className="h-13 flex-1 rounded-2xl bg-surface-2 newq text-[15px] font-medium
            text-ink tap hover:bg-surface-3 active:scale-[0.97]"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            onConfirm?.();
            onClose?.();
          }}
          className={`h-13 flex-1 rounded-2xl newq text-[15px]  tap
            active:scale-[0.97] ${
              danger
                ? 'bg-neg text-white hover:brightness-110'
                : 'bg-panel text-white hover:brightness-125'
            }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
