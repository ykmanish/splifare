'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X, Undo2 } from 'lucide-react';

const ToastCtx = createContext(null);

const TONES = {
  success: { icon: CheckCircle2, cls: 'text-pos' },
  error: { icon: AlertCircle, cls: 'text-neg' },
  info: { icon: Info, cls: 'text-info' },
};

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef({});

  // The portal must not exist on the first client render either, or the
  // tree shape differs from the server HTML and hydration fails.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id) => {
    setItems((list) => list.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const toast = useCallback(
    (opts) => {
      const t = typeof opts === 'string' ? { title: opts } : opts;
      const id = `t${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
      const item = { id, tone: 'success', duration: 3600, ...t };
      setItems((list) => [...list.slice(-2), item]);
      timers.current[id] = setTimeout(() => dismiss(id), item.duration);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 bottom-0 z-200 flex flex-col items-center
              gap-2 px-4 pb-28 sm:items-end sm:px-6 sm:pb-6"
          >
            <AnimatePresence mode="popLayout">
              {items.map((t) => {
                const tone = TONES[t.tone] || TONES.success;
                const Icon = tone.icon;
                return (
                  <motion.div
                    key={t.id}
                    layout
                    initial={{ opacity: 0, y: 24, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ type: 'spring', damping: 26, stiffness: 380 }}
                    className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl
                      bg-surface p-3.5 shadow-lg"
                  >
                    <Icon size={19} className={`mt-px shrink-0 ${tone.cls}`} strokeWidth={2.2} />
                    <div className="min-w-0 flex-1">
                      <p className="newq text-[14px] font-medium leading-snug text-ink">
                        {t.title}
                      </p>
                      {t.description && (
                        <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">
                          {t.description}
                        </p>
                      )}
                    </div>
                    {t.action && (
                      <button
                        onClick={() => {
                          t.action.onClick?.();
                          dismiss(t.id);
                        }}
                        className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 newq
                          text-[12.5px]  text-brand transition-colors hover:bg-brand-soft"
                      >
                        <Undo2 size={13} />
                        {t.action.label}
                      </button>
                    )}
                    <button
                      onClick={() => dismiss(t.id)}
                      aria-label="Dismiss"
                      className="-mr-1 -mt-1 grid size-6 shrink-0 place-items-center rounded-md
                        text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                      <X size={13} />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>,
          document.body,
        )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
