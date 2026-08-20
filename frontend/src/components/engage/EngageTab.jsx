'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Award, CalendarClock, Gamepad2, Lightbulb, MapPin, MessageCircle, Send, Sparkles, X, Zap } from 'lucide-react';
import { Card } from '@/components/ui/Bits';
import { PillScroller } from '@/components/ui/Controls';
import { api, normGroupMessage, normMemory, normRecurring, normSavedPlace, normSplitRequest } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { money } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';

import BadgeShelf from './BadgeShelf';
import ChatThread from './ChatThread';
import GamesPanel from './GamesPanel';
import InsightsPanel from './InsightsPanel';
import PlacesPanel from './PlacesPanel';
import RecurringPanel from './RecurringPanel';
import RequestsPanel from './RequestsPanel';
import Timeline from './Timeline';
import WrappedStory from './WrappedStory';

/**
 * The Engage tab.
 *
 * One fetch feeds eight panels, and it lives here rather than in the group
 * page for a plain reason: that page had grown past 1,600 lines with all of
 * this inlined, and every one of these features needs its own state, its own
 * optimistic updates and its own sheets. Splitting the *screen* by feature is
 * what let each feature get the depth it needed.
 *
 * The panels are lazy in the sense that matters — they mount only when their
 * tab is selected — so opening Engage costs one request and one panel, not
 * eight rendered trees and a timeline full of photos.
 */

const TABS = [
  { id: 'overview', label: 'Overview', icon: Sparkles },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'wrapped', label: 'Wrapped', icon: Award },
  { id: 'timeline', label: 'Timeline', icon: MapPin },
  { id: 'bills', label: 'Bills', icon: CalendarClock },
  { id: 'requests', label: 'Requests', icon: Send },
  { id: 'insights', label: 'Insights', icon: Lightbulb },
  { id: 'games', label: 'Games', icon: Gamepad2 },
  { id: 'places', label: 'Places', icon: MapPin },
];

const EMPTY = {
  messages: [],
  hasMoreMessages: false,
  recurring: [],
  requests: [],
  places: [],
  memories: [],
  badges: [],
  checkedAt: 0,
};

const WEEK = 7 * 86400000;

export default function EngageTab({
  group,
  members,
  me,
  personById,
  currency,
  convert,
  expenses,
  settlements,
  nets,
  onOpenExpense,
  onViewExpense,
  onSettle,
  onExpensesChanged,
}) {
  const { toast } = useToast();
  const groupId = group.id;

  /*
   * `onExpensesChanged` is an inline arrow at every call site, so its identity
   * changes on each parent render. Reading it through a ref keeps `load`
   * depending on the group id alone — otherwise the fetch effect re-runs on
   * every render, and the first load fires this request four times over.
   */
  const notifyExpensesChanged = useRef(onExpensesChanged);
  useEffect(() => {
    notifyExpensesChanged.current = onExpensesChanged;
  }, [onExpensesChanged]);
  const [tab, setTab] = useState('overview');
  /* null until the first fetch lands — the loading flag is derived from it
     rather than tracked separately, so the two can never disagree. */
  const [data, setData] = useState(null);
  const [autoPosted, setAutoPosted] = useState([]);
  const loading = data === null;

  /*
   * Promise chain rather than async/await on purpose: every state write lands
   * inside a `.then` callback, which keeps this a subscription-shaped effect
   * instead of one that writes state on the way in.
   */
  const load = useCallback(
    ({ quiet = false } = {}) =>
      api
        .groupEngagement(groupId)
        .then((out) => {
          setData({
            messages: (out.messages || []).map(normGroupMessage),
            hasMoreMessages: !!out.hasMoreMessages,
            recurring: (out.recurring || []).map(normRecurring),
            requests: (out.requests || []).map(normSplitRequest),
            places: (out.places || []).map(normSavedPlace),
            memories: (out.memories || []).map(normMemory),
            badges: out.badges || [],
            /* Stamped here, where a clock reading is honest, rather than in
               render where it would make the component impure. */
            checkedAt: Date.now(),
          });

          /*
           * The sweep runs server-side inside this request, so a bill can post
           * itself between two page loads. Saying so is not optional — a
           * balance that moved while nobody was looking is exactly the kind of
           * surprise that makes people distrust an expense app.
           */
          if (out.autoPosted?.length) {
            setAutoPosted(out.autoPosted);
            notifyExpensesChanged.current?.();
          }
        })
        .catch(() => {
          /* Leave whatever is on screen and stop the spinner. Expenses and
             balances come from the store and are unaffected, so a failure here
             costs the extras, not the group. */
          setData((current) => current || EMPTY);
          if (!quiet) {
            toast({
              tone: 'error',
              title: 'Could not load the extras',
              description: 'Expenses and balances still work — reopen the tab to retry.',
            });
          }
        }),
    [groupId, toast],
  );

  useEffect(() => {
    load();
  }, [load]);

  /* Somebody else changed something in this group — re-read quietly. The chat
     handles its own socket updates, so message traffic is skipped here. */
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onSync = (payload) => {
      if (!payload?.scopes?.includes('engagement')) return;
      if (payload.groupId && payload.groupId !== groupId) return;
      if (payload.kind === 'message') return;
      load({ quiet: true });
    };
    socket.on('sync', onSync);
    return () => socket.off('sync', onSync);
  }, [groupId, load]);

  /** Local list mutators, so a panel does not refetch the world to add a row. */
  const mutators = useMemo(() => {
    const make = (key) => ({
      added: (row) => setData((d) => ({ ...d, [key]: [row, ...d[key]] })),
      updated: (row) =>
        setData((d) => ({ ...d, [key]: d[key].map((x) => (x.id === row.id ? row : x)) })),
      removed: (id) => setData((d) => ({ ...d, [key]: d[key].filter((x) => x.id !== id) })),
    });
    return {
      recurring: make('recurring'),
      requests: make('requests'),
      places: make('places'),
      memories: make('memories'),
    };
  }, []);

  const markBadgesSeen = useCallback(
    (badgeIds) => {
      api.markBadgesSeen(groupId, badgeIds).catch(() => {});
    },
    [groupId],
  );

  const view = data || EMPTY;

  const openRequests = view.requests.filter(
    (r) => !['done', 'declined', 'dismissed'].includes(r.status),
  );
  /* Measured against the stamp taken when the payload arrived, not a clock
     read during render — for "due inside a week" the fetch time is the honest
     reference point, and it keeps this component pure. */
  const dueSoon = useMemo(
    () =>
      view.recurring.filter(
        (r) => r.active && new Date(r.nextDate) - (view.checkedAt || 0) < WEEK,
      ),
    [view.recurring, view.checkedAt],
  );

  return (
    <div className="space-y-5">
      <PillScroller options={TABS} value={tab} onChange={setTab} />

      {/* What posted itself while nobody was looking. */}
      <AnimatePresence>
        {autoPosted.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
          >
            <Card tone="brand" pad={false} className="flex items-start gap-3 p-4">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-on-brand/15 text-on-brand">
                <Zap size={15} strokeWidth={2.5} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="newq text-[13.5px] leading-snug text-on-brand">
                  {autoPosted.length === 1
                    ? `${autoPosted[0].description} posted automatically`
                    : `${autoPosted.length} recurring bills posted automatically`}
                </p>
                <p className="newq mt-0.5 text-[12px] text-on-brand/75">
                  {autoPosted
                    .slice(0, 3)
                    .map((e) => `${e.description} · ${money(e.amount, e.currency, { compact: true })}`)
                    .join('  ·  ')}
                </p>
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setAutoPosted([])}
                className="grid size-7 shrink-0 place-items-center rounded-full text-on-brand/70 tap"
              >
                <X size={14} strokeWidth={2.6} />
              </button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {tab === 'overview' && (
        <div className="space-y-6">
          <section>
            <p className="newq mb-3 px-1 text-[11.5px] uppercase tracking-[0.08em] text-ink-3">
              Badges
            </p>
            <BadgeShelf badges={view.badges} loading={loading} onSeen={markBadgesSeen} />
          </section>

          <section>
            <p className="newq mb-3 px-1 text-[11.5px] uppercase tracking-[0.08em] text-ink-3">
              Right now
            </p>
            <div className="grid grid-cols-2 gap-2">
              <OverviewTile
                icon={Send}
                label="Open requests"
                value={openRequests.length}
                hint={openRequests.length ? 'Someone is waiting' : 'All clear'}
                tone={openRequests.length ? 'blush' : 'soft'}
                onClick={() => setTab('requests')}
              />
              <OverviewTile
                icon={CalendarClock}
                label="Bills due"
                value={dueSoon.length}
                hint={dueSoon.length ? 'Within a week' : 'Nothing this week'}
                tone={dueSoon.length ? 'butter' : 'soft'}
                onClick={() => setTab('bills')}
              />
              <OverviewTile
                icon={MapPin}
                label="Memories"
                value={view.memories.length}
                hint="Photos and notes"
                tone="sky"
                onClick={() => setTab('timeline')}
              />
              <OverviewTile
                icon={MessageCircle}
                label="Messages"
                value={view.messages.length}
                hint="In the group chat"
                tone="mint"
                onClick={() => setTab('chat')}
              />
            </div>
          </section>
        </div>
      )}

      {tab === 'chat' && (
        <ChatThread
          groupId={groupId}
          me={me}
          personById={personById}
          initialMessages={loading ? null : view.messages}
          initialHasMore={view.hasMoreMessages}
          loading={loading}
        />
      )}

      {tab === 'wrapped' && (
        <WrappedStory
          group={group}
          expenses={expenses}
          settlements={settlements}
          currency={currency}
          convert={convert}
          personById={personById}
        />
      )}

      {tab === 'timeline' && (
        <Timeline
          group={group}
          expenses={expenses}
          memories={view.memories}
          me={me}
          personById={personById}
          currency={currency}
          onView={onViewExpense}
          onAdded={mutators.memories.added}
          onRemoved={mutators.memories.removed}
        />
      )}

      {tab === 'bills' && (
        <RecurringPanel
          groupId={groupId}
          rows={view.recurring}
          members={members}
          personById={personById}
          currency={currency}
          onChange={mutators.recurring}
          loading={loading}
        />
      )}

      {tab === 'requests' && (
        <RequestsPanel
          groupId={groupId}
          requests={view.requests}
          members={members}
          me={me}
          personById={personById}
          onChange={mutators.requests}
          onOpenExpense={onOpenExpense}
          loading={loading}
        />
      )}

      {tab === 'insights' && (
        <InsightsPanel
          expenses={expenses}
          convert={convert}
          personById={personById}
          currency={currency}
        />
      )}

      {tab === 'games' && (
        <GamesPanel
          group={group}
          members={members}
          me={me}
          nets={nets}
          currency={currency}
          onSettle={(person) =>
            person.id !== me.id && onSettle({ withUserId: person.id, groupId: group.id })
          }
        />
      )}

      {tab === 'places' && (
        <PlacesPanel
          groupId={groupId}
          places={view.places}
          currency={currency}
          onChange={mutators.places}
          onOpenExpense={onOpenExpense}
          loading={loading}
        />
      )}
    </div>
  );
}

function OverviewTile({ icon: Icon, label, value, hint, tone, onClick }) {
  return (
    <Card
      as="button"
      tone={tone}
      pad={false}
      onClick={onClick}
      className="flex flex-col items-start gap-1 p-4 text-left tap active:scale-[0.98]"
    >
      <span className="grid size-9 place-items-center rounded-[13px] bg-surface text-ink">
        <Icon size={16} strokeWidth={2.3} />
      </span>
      <span className="num mt-1.5 text-[24px] leading-none text-ink">{value}</span>
      <span className="newq text-[12.5px] text-ink">{label}</span>
      <span className="newq text-[11px] text-ink-3">{hint}</span>
    </Card>
  );
}
