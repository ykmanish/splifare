'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, QrCode as QrIcon, RefreshCw, Share2 } from 'lucide-react';
import QrCode from './QrCode';

const SPRING = { type: 'spring', damping: 26, stiffness: 320 };

/** Codes are grouped in threes so they are easy to read back over a call. */
export const spaceCode = (code = '') =>
  String(code)
    .replace(/(.{3})(?=.)/g, '$1 ')
    .trim();

/**
 * Copy to clipboard, falling back to a hidden textarea where the async
 * Clipboard API is unavailable (older iOS Safari, or any insecure origin).
 */
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/* `navigator.share` only exists on the client, so the server must render
   without the button and the client must agree on its hydrating pass. */
const subscribeNever = () => () => {};
const onClient = () => true;
const onServer = () => false;

/* ================================================================
   CODE BOX — a big, tappable code with copy (and optional share)
   ================================================================ */

export default function CodeBox({
  code,
  label = 'Room code',
  hint,
  tone = 'panel',
  shareTitle,
  shareText,
  /** What the QR should encode — usually a join link, not the bare code, so
      scanning lands the person on the right screen instead of showing them
      six characters to retype. Omit it and no QR button appears. */
  qrValue,
  qrLabel,
  onRotate,
  rotating = false,
  className = '',
}) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  // Absent on desktop and on insecure origins, so the button only appears
  // once the client has confirmed it exists.
  const mounted = useSyncExternalStore(subscribeNever, onClient, onServer);
  const canShare = mounted && typeof navigator !== 'undefined' && !!navigator.share;

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const dark = tone === 'panel';
  const surface = dark ? 'bg-panel' : 'bg-surface-2';
  const codeText = dark ? 'text-white' : 'text-ink';
  const capText = dark ? 'text-white/55' : 'text-ink-3';
  const chip = dark ? 'bg-white/14 text-white' : 'bg-surface text-ink';

  async function onCopy() {
    if (await copyText(code)) setCopied(true);
  }

  async function onShare() {
    try {
      await navigator.share({
        title: shareTitle || label,
        text: shareText || code,
      });
    } catch {
      /* the user dismissed the share sheet */
    }
  }

  if (!code) return null;

  return (
    <div className={`rounded-[22px] px-4 py-4 ${surface} ${className}`}>
      <p className={`newq text-[11.5px] uppercase tracking-[0.09em] ${capText}`}>{label}</p>

      <button
        type="button"
        onClick={onCopy}
        aria-label={`Copy ${label.toLowerCase()} ${code}`}
        className="mt-1.5 flex w-full items-center gap-3 text-left tap active:scale-[0.99]"
      >
        <span className={`num min-w-0 flex-1 truncate text-[27px] leading-none ${codeText}`}>
          {spaceCode(code)}
        </span>

        <motion.span
          whileTap={{ scale: 0.9 }}
          transition={SPRING}
          className={`grid size-9 shrink-0 place-items-center rounded-full ${chip}`}
        >
          {copied ? (
            <Check size={16} strokeWidth={2.8} />
          ) : (
            <Copy size={16} strokeWidth={2.2} />
          )}
        </motion.span>
      </button>

      <div className="mt-2.5 flex items-center justify-between gap-3">
        <p className={`newq min-w-0 flex-1 text-[12px] ${capText}`}>
          {copied ? 'Copied to your clipboard' : hint}
        </p>

        <span className="flex shrink-0 items-center gap-1.5">
          {qrValue && (
            <button
              type="button"
              onClick={() => setShowQr((v) => !v)}
              aria-expanded={showQr}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5
                newq text-[12px] tap active:scale-95 ${chip}`}
            >
              <QrIcon size={13} strokeWidth={2.3} />
              {showQr ? 'Hide' : 'QR'}
            </button>
          )}

          {canShare && (
            <button
              type="button"
              onClick={onShare}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5
                newq text-[12px] tap active:scale-95 ${chip}`}
            >
              <Share2 size={13} strokeWidth={2.3} />
              Share
            </button>
          )}

          {onRotate && (
            <button
              type="button"
              onClick={onRotate}
              disabled={rotating}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5
                newq text-[12px] tap active:scale-95 disabled:opacity-45 ${chip}`}
            >
              <RefreshCw
                size={13}
                strokeWidth={2.3}
                className={rotating ? 'animate-spin' : ''}
              />
              New code
            </button>
          )}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {showQr && qrValue && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col items-center pt-4">
              <QrCode value={qrValue} size={172} label={qrLabel || `QR code for ${label}`} />
              <p className={`newq mt-2.5 text-center text-[11.5px] ${capText}`}>
                Point a camera at this to join
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ================================================================
   CODE INPUT — fixed-width slots for typing a code in
   ================================================================ */

/**
 * A single text input styled as `length` slots. One real input keeps mobile
 * keyboards, autofill and paste behaving normally; the slots are painted
 * over it.
 */
export function CodeInput({ value, onChange, length = 6, error, autoFocus = false, onComplete }) {
  const ref = useRef(null);
  const chars = value.padEnd(length, ' ').slice(0, length).split('');
  const filled = value.length;

  return (
    <div>
      <button
        type="button"
        onClick={() => ref.current?.focus()}
        className="flex w-full justify-center gap-2"
        aria-hidden
        tabIndex={-1}
      >
        {chars.map((ch, i) => (
          <span
            key={i}
            className={`num grid h-15 flex-1 place-items-center rounded-[14px] text-[24px]
              uppercase text-ink transition-colors
              ${
                error
                  ? 'bg-blush'
                  : i === filled
                    ? 'bg-surface-2 shadow-[inset_0_0_0_1.5px_var(--brand)]'
                    : 'bg-surface-2'
              }`}
          >
            {ch.trim() || <span className="text-ink-3/40">·</span>}
          </span>
        ))}
      </button>

      <input
        ref={ref}
        value={value}
        onChange={(e) => {
          const next = e.target.value
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, length);
          onChange(next);
          if (next.length === length) onComplete?.(next);
        }}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        aria-label="Room code"
        maxLength={length}
        // Kept in the layout (not `hidden`) so focus and the caret behave, but
        // visually collapsed behind the painted slots above.
        className="h-0 w-full opacity-0"
      />

      {error && <p className="mt-2 px-1.5 text-center text-[12.5px] font-medium text-neg">{error}</p>}
    </div>
  );
}
