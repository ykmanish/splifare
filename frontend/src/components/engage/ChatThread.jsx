'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ArrowDown, Loader2, MessageCircle, SendHorizonal, Trash2 } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/Bits';
import { api, normGroupMessage } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { firstName } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';

/**
 * The group chat.
 *
 * Built to the standard people already hold it to, because the competition is
 * WhatsApp and nobody grades on a curve:
 *
 *  · **Sending is instant.** The bubble is on screen before the request
 *    leaves — a spinner on a 40-character message is the app admitting it is
 *    slower than the thing it is replacing.
 *  · **The view stays put.** Scrolling is done by setting `scrollTop` on the
 *    list, never `scrollIntoView` — that walks up the ancestor chain and drags
 *    the whole page with it, which is what made the screen jog upward on send.
 *  · **Live messages merge, they do not replace.** A socket ping re-reads the
 *    page and unions it into what is already there, so nothing re-mounts,
 *    nothing flickers, and a half-written reaction is not swept away.
 *
 * The same component serves two threads. With no `expenseId` it is the group
 * room; with one it is the comment thread on a single bill.
 */

const QUICK_REACTIONS = ['👍', '😂', '🙏', '💸', '🔥', '❤️'];

/** Local id for a message that has not come back from the server yet. */
let tempSeq = 0;
const tempId = () => `pending-${(tempSeq += 1)}`;

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

function dayDivider(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

const clockTime = (iso) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * Fold a server page into what is on screen.
 *
 * Three groups survive: history the reader paged in above the window, the
 * authoritative page itself, and anything still in flight below it. Reusing
 * the incoming objects by id is what stops React tearing down and rebuilding
 * every bubble each time a message arrives.
 */
function mergeMessages(current, incoming) {
  if (!incoming.length) return current.filter((m) => m.pending).length ? current : incoming;

  const incomingIds = new Set(incoming.map((m) => m.id));
  const oldest = new Date(incoming[0].createdAt).getTime();

  const older = current.filter(
    (m) => !m.pending && !incomingIds.has(m.id) && new Date(m.createdAt).getTime() < oldest,
  );
  const inFlight = current.filter((m) => m.pending);
  return [...older, ...incoming, ...inFlight];
}

/** Group reactions by emoji, so five thumbs render as one chip reading 5. */
function tallyReactions(reactions = [], meId) {
  const out = new Map();
  for (const r of reactions) {
    const row = out.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
    row.count += 1;
    if (r.userId === meId) row.mine = true;
    out.set(r.emoji, row);
  }
  return [...out.values()];
}

function Bubble({ message, me, person, mine, showAuthor, onReact, onDelete, onRetry }) {
  const [picking, setPicking] = useState(false);
  const reactions = tallyReactions(message.reactions, me.id);
  const failed = message.failed;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={`flex w-full gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
    >
      {/* The avatar column is held open even when the avatar is hidden, so a
          run of messages from one person stays on one vertical line. */}
      {!mine && (
        <span className="w-7 shrink-0 self-end pb-1">
          {showAuthor && <Avatar person={person} size="xs" />}
        </span>
      )}

      <div className={`flex min-w-0 max-w-[80%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {showAuthor && !mine && (
          <span className="newq mb-1 px-1 text-[11px] text-ink-3">{firstName(person?.name)}</span>
        )}

        <button
          type="button"
          onClick={() => (failed ? onRetry(message) : setPicking((v) => !v))}
          className={`w-full rounded-[18px] px-3.5 py-2 text-left tap
            ${mine ? 'bg-brand text-on-brand rounded-br-[6px]' : 'bg-surface-2 text-ink rounded-bl-[6px]'}
            ${message.pending ? 'opacity-70' : ''}
            ${failed ? 'ring-1 ring-neg' : ''}`}
        >
          {/* Text and time share the last line the way every messaging app
              does it — a timestamp on its own row doubles a one-word bubble. */}
          <span className="newq whitespace-pre-wrap break-words text-[14.5px] leading-snug">
            {message.text}
            <span aria-hidden className="inline-block w-[52px]" />
          </span>
          <span
            className={`newq -mt-4 flex items-center justify-end gap-1 text-[10.5px] tabular-nums
              ${mine ? 'text-on-brand/60' : 'text-ink-3'}`}
          >
            {failed ? (
              <>
                <AlertCircle size={10} strokeWidth={2.8} className="text-neg" />
                <span className="text-neg">Tap to retry</span>
              </>
            ) : message.pending ? (
              <Loader2 size={10} className="animate-spin" />
            ) : (
              clockTime(message.createdAt)
            )}
          </span>
        </button>

        {reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1 px-0.5">
            {reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onReact(message.id, r.emoji)}
                className={`flex items-center gap-1 rounded-full px-2 py-[3px] text-[12px] leading-none tap
                  ${r.mine ? 'bg-brand-soft ring-1 ring-brand' : 'bg-surface-2 ring-1 ring-line'}`}
              >
                <span>{r.emoji}</span>
                {r.count > 1 && <span className="num text-[10px] text-ink-2">{r.count}</span>}
              </button>
            ))}
          </div>
        )}

        <AnimatePresence>
          {picking && !message.pending && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.94 }}
              transition={{ duration: 0.14 }}
              className="mt-1.5 flex items-center gap-0.5 rounded-full bg-surface px-1.5 py-1
                shadow-[0_6px_22px_rgba(0,0,0,0.14)] ring-1 ring-line"
            >
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`React ${emoji}`}
                  onClick={() => {
                    onReact(message.id, emoji);
                    setPicking(false);
                  }}
                  className="grid size-8 place-items-center rounded-full text-[16px] tap
                    hover:bg-surface-2 active:scale-90"
                >
                  {emoji}
                </button>
              ))}
              {mine && (
                <button
                  type="button"
                  aria-label="Delete message"
                  onClick={() => {
                    onDelete(message.id);
                    setPicking(false);
                  }}
                  className="grid size-8 place-items-center rounded-full text-neg tap hover:bg-surface-2"
                >
                  <Trash2 size={14} strokeWidth={2.4} />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function ChatThread({
  groupId,
  expenseId = null,
  me,
  personById,
  initialMessages = null,
  initialHasMore = false,
  loading = false,
  emptyBody = 'Start with the bill everyone keeps asking about.',
  height = 'h-[52vh]',
}) {
  const { toast } = useToast();
  const [messages, setMessages] = useState(() =>
    initialMessages ? [...initialMessages].reverse() : [],
  );
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [fetching, setFetching] = useState(!initialMessages);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [seed, setSeed] = useState(initialMessages);
  /**
   * Whether the reader is parked at the bottom.
   *
   * Held twice on purpose: the ref is what the scroll effect reads (it needs
   * the value as of this instant, before React has re-rendered), and the state
   * is what the jump pill renders from.
   */
  const [atBottom, setAtBottom] = useState(true);
  const pinnedRef = useRef(true);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  /**
   * Scroll the message list — and only the message list.
   *
   * `scrollIntoView` would do this too, and would also scroll every scrollable
   * ancestor, nudging the whole page upward on every send. Setting `scrollTop`
   * on the container touches nothing else.
   */
  const stickToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const loadFirstPage = useCallback(
    () =>
      api
        .groupMessages(groupId, expenseId ? `?expenseId=${expenseId}` : '')
        .then((out) => {
          const page = (out.messages || []).map(normGroupMessage).reverse();
          setMessages((current) => mergeMessages(current, page));
          setHasMore(!!out.hasMore);
          setFetching(false);
        })
        .catch(() => {
          /* Keep whatever is on screen; the composer still works. */
          setFetching(false);
        }),
    [groupId, expenseId],
  );

  /* Re-seed from the page the parent already fetched, rather than asking for
     the same messages a second time. */
  if (initialMessages && initialMessages !== seed) {
    setSeed(initialMessages);
    setMessages((current) => mergeMessages(current, [...initialMessages].reverse()));
    setHasMore(initialHasMore);
    setFetching(false);
  }

  useEffect(() => {
    if (initialMessages) return;
    loadFirstPage();
  }, [initialMessages, loadFirstPage]);

  /* Realtime. The server sends only "something changed here", so the thread
     re-reads and merges — a dropped socket message costs one wasted GET, never
     a missing reply, and a delivered one never disturbs the scroll. */
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onSync = (payload) => {
      if (!payload?.scopes?.includes('engagement')) return;
      if (payload.groupId && payload.groupId !== groupId) return;
      if (payload.kind && payload.kind !== 'message') return;
      loadFirstPage();
    };
    socket.on('sync', onSync);
    return () => socket.off('sync', onSync);
  }, [groupId, loadFirstPage]);

  /* Stay glued to the bottom, but only while the reader is already there. */
  useLayoutEffect(() => {
    if (pinnedRef.current) stickToBottom();
  }, [messages, stickToBottom]);

  function onScroll(e) {
    const el = e.currentTarget;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    pinnedRef.current = bottom;
    setAtBottom(bottom);
  }

  /** Grow the composer with the text, up to a few lines. */
  function autoGrow(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }

  async function loadOlder() {
    if (loadingMore || !messages.length) return;
    setLoadingMore(true);
    const el = scrollRef.current;
    const before = el?.scrollHeight || 0;
    try {
      const params = new URLSearchParams({ before: messages[0].id });
      if (expenseId) params.set('expenseId', expenseId);
      const out = await api.groupMessages(groupId, `?${params}`);
      const older = (out.messages || []).map(normGroupMessage).reverse();
      setHasMore(!!out.hasMore);
      if (older.length) {
        pinnedRef.current = false;
        setMessages((prev) => [...older, ...prev]);
        /* Hold the reader's place: prepending changes scrollHeight, and without
           this the list jumps to a different message. */
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - before;
        });
      }
    } catch (err) {
      toast({ tone: 'error', title: 'Could not load older messages', description: err.message });
    } finally {
      setLoadingMore(false);
    }
  }

  /**
   * Put the message on screen now, reconcile with the server after.
   *
   * The optimistic row carries a local id, which the response then swaps for
   * the real one — so a reaction or a delete pressed in the intervening
   * moment addresses a row the server knows about by the time it is sent.
   */
  const deliver = useCallback(
    async (body, localId) => {
      try {
        const { message } = await api.createGroupMessage(groupId, { text: body, expenseId });
        const real = normGroupMessage(message);
        setMessages((prev) => prev.map((m) => (m.id === localId ? real : m)));
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m.id === localId ? { ...m, pending: false, failed: true } : m)),
        );
      }
    },
    [groupId, expenseId],
  );

  function send(e) {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;

    const localId = tempId();
    setText('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    pinnedRef.current = true;
    setMessages((prev) => [
      ...prev,
      {
        id: localId,
        groupId,
        expenseId,
        authorId: me.id,
        text: body,
        reactions: [],
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ]);
    deliver(body, localId);
  }

  function retry(message) {
    setMessages((prev) =>
      prev.map((m) => (m.id === message.id ? { ...m, pending: true, failed: false } : m)),
    );
    deliver(message.text, message.id);
  }

  async function react(messageId, emoji) {
    if (String(messageId).startsWith('pending-')) return;
    /* Optimistic: a reaction that waits for a round trip feels broken. */
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const had = m.reactions.some((r) => r.userId === me.id && r.emoji === emoji);
        return {
          ...m,
          reactions: had
            ? m.reactions.filter((r) => !(r.userId === me.id && r.emoji === emoji))
            : [...m.reactions, { emoji, userId: me.id }],
        };
      }),
    );
    try {
      const { message } = await api.reactToMessage(groupId, messageId, emoji);
      const real = normGroupMessage(message);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? real : m)));
    } catch {
      loadFirstPage();
    }
  }

  async function remove(messageId) {
    const snapshot = messages;
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    if (String(messageId).startsWith('pending-')) return;
    try {
      await api.deleteGroupMessage(groupId, messageId);
    } catch (err) {
      setMessages(snapshot);
      toast({ tone: 'error', title: 'Could not delete', description: err.message });
    }
  }

  /* Day dividers, and whether each bubble needs its author's name. A run of
     messages from one person inside two minutes reads as one turn. */
  const rows = useMemo(() => {
    const out = [];
    let lastDay = null;
    messages.forEach((m, i) => {
      const day = dayDivider(m.createdAt);
      if (day !== lastDay) {
        out.push({ kind: 'day', id: `day-${m.id}`, label: day });
        lastDay = day;
      }
      const prev = messages[i - 1];
      const sameRun =
        prev &&
        prev.authorId === m.authorId &&
        sameDay(prev.createdAt, m.createdAt) &&
        new Date(m.createdAt) - new Date(prev.createdAt) < 120000;
      out.push({ kind: 'msg', id: m.id, message: m, showAuthor: !sameRun });
    });
    return out;
  }, [messages]);

  const busy = loading || fetching;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="relative">
        {/*
         * No `overscroll-contain`: reaching the end of the thread should hand
         * the scroll on to the page, which is what a reader flicking down the
         * screen expects. Trapping it here is what made the page feel stuck.
         */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className={`${height} min-h-0 space-y-2 overflow-y-auto px-0.5 pb-1`}
        >
          {busy ? (
            <div className="space-y-3 py-4">
              {[70, 45, 60].map((w, i) => (
                <div
                  key={i}
                  className={`h-10 animate-pulse rounded-[18px] bg-surface-2 ${i % 2 ? 'ml-auto' : ''}`}
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          ) : !messages.length ? (
            <EmptyState icon={MessageCircle} title="No messages yet" body={emptyBody} />
          ) : (
            <>
              {hasMore && (
                <div className="flex justify-center pb-1 pt-2">
                  <button
                    type="button"
                    onClick={loadOlder}
                    disabled={loadingMore}
                    className="newq flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5
                      text-[12px] text-ink-2 tap disabled:opacity-50"
                  >
                    {loadingMore && <Loader2 size={12} className="animate-spin" />}
                    {loadingMore ? 'Loading' : 'Load earlier messages'}
                  </button>
                </div>
              )}

              {rows.map((row) =>
                row.kind === 'day' ? (
                  <div key={row.id} className="flex justify-center py-1.5">
                    <span className="newq rounded-full bg-surface-2 px-2.5 py-1 text-[10.5px] text-ink-3">
                      {row.label}
                    </span>
                  </div>
                ) : (
                  <Bubble
                    key={row.id}
                    message={row.message}
                    me={me}
                    person={personById(row.message.authorId)}
                    mine={row.message.authorId === me.id}
                    showAuthor={row.showAuthor}
                    onReact={react}
                    onDelete={remove}
                    onRetry={retry}
                  />
                ),
              )}
            </>
          )}
        </div>

        {/*
         * Reading back through the history should never be interrupted by an
         * arriving message, so nothing scrolls under the reader — this offers
         * the way back down instead of forcing it.
         */}
        <AnimatePresence>
          {!atBottom && messages.length > 0 && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.9 }}
              onClick={() => {
                pinnedRef.current = true;
                setAtBottom(true);
                stickToBottom(true);
              }}
              className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5
                rounded-full bg-panel px-3 py-1.5 text-[12px] text-white shadow-[0_6px_20px_rgba(0,0,0,0.2)] tap"
            >
              <ArrowDown size={12} strokeWidth={2.6} />
              Jump to latest
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <form onSubmit={send} className="mt-3 flex items-end gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-[20px] bg-surface-2 px-3.5">
          <textarea
            ref={inputRef}
            value={text}
            rows={1}
            onChange={(e) => {
              setText(e.target.value);
              autoGrow(e.target);
            }}
            onKeyDown={(e) => {
              /* Enter sends, Shift+Enter breaks the line — the convention
                 every messaging app already taught these users. */
              if (e.key === 'Enter' && !e.shiftKey) send(e);
            }}
            placeholder={expenseId ? 'Ask about this bill' : 'Message the group'}
            maxLength={500}
            className="newq max-h-24 w-full resize-none bg-transparent py-3 text-[14.5px]
              leading-snug text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <motion.button
          type="submit"
          aria-label="Send message"
          whileTap={{ scale: 0.88 }}
          disabled={!text.trim()}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-on-brand
            tap disabled:opacity-30"
        >
          <SendHorizonal size={17} strokeWidth={2.4} />
        </motion.button>
      </form>
    </div>
  );
}
