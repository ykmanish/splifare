'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Award,
  Calendar,
  CalendarClock,
  Camera,
  Handshake,
  Inbox,
  MapPin,
  MessageCircle,
  Plane,
  Receipt,
  Scale,
  Shield,
  Sparkles,
  Target,
  UsersRound,
  Zap,
} from 'lucide-react';
import Page from '@/components/layout/Page';
import Button from '@/components/ui/Button';
import { Badge, Card, EmptyState } from '@/components/ui/Bits';
import { FieldRow, GroupLabel, ListGroup } from '@/components/ui/Blocks';
import { api, normRecurring, normSavedPlace, normSplitRequest } from '@/lib/api';
import { useApp } from '@/store/AppContext';
import { dueLabel, placeKind } from '@/lib/engage';
import { money, firstName } from '@/lib/format';

/**
 * The Engage hub.
 *
 * What sat here before was a grid of unclickable tiles above a list of groups
 * — a menu that told you features existed somewhere else. This screen answers
 * the questions that are genuinely *cross-group* and therefore have nowhere
 * else to live: what is due this month across every group I am in, who is
 * waiting on me anywhere, and what have I actually earned.
 *
 * Anything that only makes sense inside one group — the chat, that group's
 * wrapped, its timeline — stays in the group and is linked to, not mirrored.
 */

const EASE = [0.16, 1, 0.3, 1];

const BADGE_ICONS = {
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

const TONE_FILL = {
  mint: 'bg-mint',
  brand: 'bg-brand',
  sky: 'bg-sky',
  butter: 'bg-butter',
  grape: 'bg-grape',
  blush: 'bg-blush',
  peach: 'bg-peach',
};

function Section({ title, action, children, delay = 0 }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay }}
    >
      {title && <GroupLabel action={action}>{title}</GroupLabel>}
      {children}
    </motion.section>
  );
}

export default function EngagePage() {
  const { groups, me, currency, personById } = useApp();
  const [summary, setSummary] = useState(null);

  const load = useCallback(
    () =>
      api
        .engagementSummary()
        .then((out) =>
          setSummary({
            upcoming: (out.upcoming || []).map(normRecurring),
            requests: (out.requests || []).map(normSplitRequest),
            places: (out.places || []).map(normSavedPlace),
            badges: out.badges || [],
            badgeTotal: out.badgeTotal || 0,
          }),
        )
        .catch(() =>
          setSummary({ upcoming: [], requests: [], places: [], badges: [], badgeTotal: 0 }),
        ),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const groupById = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.id, g])),
    [groups],
  );

  const loading = summary === null;
  const view = summary || { upcoming: [], requests: [], places: [], badges: [], badgeTotal: 0 };

  /* Requests are only interesting here when somebody is actually blocked on
     you. The ones you sent live in their own group's screen. */
  const waitingOnMe = view.requests.filter(
    (r) => (r.assigneeId === me.id || !r.assigneeId) && r.status !== 'done',
  );

  const monthlyTotal = view.upcoming
    .filter((r) => r.frequency === 'monthly' && r.autoPost)
    .reduce((a, r) => a + r.amount, 0);

  /* One row per badge, newest first, deduped across groups — earning "Zero
     Dues" in three flats is one achievement on a personal shelf, not three. */
  const shelf = useMemo(() => {
    const seen = new Set();
    return view.badges.filter((b) => (seen.has(b.id) ? false : seen.add(b.id)));
  }, [view.badges]);

  if (!groups.length) {
    return (
      <Page title="Engage">
        <Card tone="white" pad={false}>
          <EmptyState
            icon={UsersRound}
            title="No groups yet"
            body="Chat, badges, wrapped, recurring bills, games and saved places all live inside a group. Make one to get started."
            action={
              <Button variant="dark" href="/groups">
                Go to groups
              </Button>
            }
          />
        </Card>
      </Page>
    );
  }

  return (
    <Page title="Engage">
      <div className="space-y-7">
        {/* ------------------------------------------------------ shelf */}
        <Section delay={0}>
          <Card tone="panel" pad={false} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="newq text-[11.5px] uppercase tracking-[0.09em] text-white/55">
                  Your shelf
                </p>
                <p className="num mt-1.5 text-[38px] leading-none text-white">
                  {loading ? '—' : shelf.length}
                  {view.badgeTotal > 0 && (
                    <span className="text-[18px] text-white/50"> / {view.badgeTotal}</span>
                  )}
                </p>
                <p className="newq mt-2 text-[13px] leading-snug text-white/70">
                  {shelf.length
                    ? 'Badges earned across all your groups'
                    : 'Settle a debt or itemise a bill to unlock your first'}
                </p>
              </div>
              <span className="grid size-12 shrink-0 place-items-center rounded-[18px] bg-white/12 text-white">
                <Award size={22} strokeWidth={2.2} />
              </span>
            </div>

            {shelf.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {shelf.slice(0, 8).map((b, i) => {
                  const Icon = BADGE_ICONS[b.icon] || Award;
                  return (
                    <motion.span
                      key={b.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: i * 0.04, ease: EASE }}
                      title={b.name}
                      className={`grid size-10 place-items-center rounded-[14px] ${
                        TONE_FILL[b.tone] || 'bg-white/12'
                      }`}
                    >
                      <Icon size={17} strokeWidth={2.3} className="text-ink" />
                    </motion.span>
                  );
                })}
                {shelf.length > 8 && (
                  <span className="newq grid size-10 place-items-center rounded-[14px] bg-white/12 text-[12px] text-white">
                    +{shelf.length - 8}
                  </span>
                )}
              </div>
            )}
          </Card>
        </Section>

        {/* --------------------------------------------------- requests */}
        {waitingOnMe.length > 0 && (
          <Section title="Waiting on you" delay={0.04}>
            <ListGroup>
              {waitingOnMe.slice(0, 5).map((r) => {
                const group = groupById[r.groupId];
                return (
                  <FieldRow
                    key={r.id}
                    icon={Inbox}
                    iconTint="var(--brand)"
                    label={r.title}
                    sublabel={`${firstName(personById(r.requesterId)?.name)} asked${
                      group ? ` · ${group.name}` : ''
                    }`}
                    href={group ? `/groups/${group.id}?tab=engage` : undefined}
                    chevron
                  />
                );
              })}
            </ListGroup>
          </Section>
        )}

        {/* ---------------------------------------------------- upcoming */}
        <Section
          title="Coming up"
          delay={0.08}
          action={
            monthlyTotal > 0 ? (
              <span className="num text-[12.5px] text-ink-3">
                {money(monthlyTotal, currency, { compact: true })}/mo
              </span>
            ) : null
          }
        >
          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-[18px] bg-surface-2" />
              ))}
            </div>
          ) : view.upcoming.length ? (
            <ListGroup>
              {view.upcoming.slice(0, 6).map((r) => {
                const group = groupById[r.groupId];
                const overdue = new Date(r.nextDate) < new Date();
                return (
                  <FieldRow
                    key={r.id}
                    icon={r.autoPost ? Zap : CalendarClock}
                    iconTint={overdue ? 'var(--warn)' : undefined}
                    label={r.title}
                    sublabel={`${dueLabel(r.nextDate)}${group ? ` · ${group.name}` : ''}`}
                    value={money(r.amount, r.currency, { compact: true })}
                    href={group ? `/groups/${group.id}?tab=engage` : undefined}
                    chevron
                  />
                );
              })}
            </ListGroup>
          ) : (
            <Card tone="soft" pad={false}>
              <EmptyState
                icon={CalendarClock}
                title="No bills scheduled"
                body="Set rent, Wi-Fi or a subscription to post itself every month from inside a group."
              />
            </Card>
          )}
        </Section>

        {/* ------------------------------------------------------ places */}
        {view.places.length > 0 && (
          <Section title="Your regular spots" delay={0.12}>
            <div className="-mx-5 overflow-x-auto px-5 no-scrollbar">
              <div className="flex gap-2 pb-1">
                {view.places.slice(0, 10).map((p) => {
                  const kind = placeKind(p.kind);
                  return (
                    <div
                      key={p.id}
                      className="flex w-[126px] shrink-0 flex-col gap-1.5 rounded-[18px] bg-surface px-3.5 py-3"
                    >
                      <span className="grid size-9 place-items-center rounded-[13px] bg-surface-2 text-[17px]">
                        {kind.emoji}
                      </span>
                      <span className="newq line-clamp-2 text-[13px] leading-snug text-ink">
                        {p.name}
                      </span>
                      {p.useCount > 0 && <Badge tone="neutral">{p.useCount}x</Badge>}
                    </div>
                  );
                })}
              </div>
            </div>
          </Section>
        )}

        {/* ------------------------------------------------------ groups */}
        <Section title="Open a group" delay={0.16}>
          <ListGroup>
            {groups.map((g) => {
              const due = view.upcoming.filter((r) => r.groupId === g.id).length;
              const asks = waitingOnMe.filter((r) => r.groupId === g.id).length;
              /* "coming up", not "due" — this list runs 30 days out, and
                 calling a bill three weeks away "due" invents an urgency the
                 group's own Bills tab would then contradict. */
              const notes = [
                asks && `${asks} waiting on you`,
                due && `${due} bill${due > 1 ? 's' : ''} coming up`,
              ].filter(Boolean);

              return (
                <FieldRow
                  key={g.id}
                  icon={UsersRound}
                  label={g.name}
                  sublabel={
                    notes.length
                      ? notes.join(' · ')
                      : `${g.memberIds.length} member${g.memberIds.length === 1 ? '' : 's'}`
                  }
                  trailing={
                    asks ? (
                      <Badge tone="warn" icon={Sparkles}>
                        {asks}
                      </Badge>
                    ) : null
                  }
                  href={`/groups/${g.id}?tab=engage`}
                  chevron
                />
              );
            })}
          </ListGroup>
        </Section>
      </div>
    </Page>
  );
}
