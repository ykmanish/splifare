'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Plus,
  Wallet,
  ShoppingBasket,
  UsersRound,
  Check,
  Sparkles,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import Page from '@/components/layout/Page';
import { useUI } from '@/components/layout/AppShell';
import { useApp } from '@/store/AppContext';
import Button from '@/components/ui/Button';
import { Badge, Card, EmptyState, RowMenu } from '@/components/ui/Bits';
import {
  ActionTiles,
  FieldRow,
  GroupLabel,
  ListGroup,
  MetricRow,
  PersonRow,
} from '@/components/ui/Blocks';
import { Pills } from '@/components/ui/Controls';
import { ConfirmSheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { categoryOf } from '@/lib/categories';
import { money, firstName, splitAmount, CURRENCIES } from '@/lib/format';
import { isInvolved, shareOf } from '@/lib/balances';
import { canEditExpense } from '@/lib/permissions';
import FxNote from '@/components/ui/FxNote';

const EASE = [0.16, 1, 0.3, 1];
const SPRING = { type: 'spring', damping: 26, stiffness: 320 };

function Section({ children, delay = 0, className = '' }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

const MoreLink = ({ href, children = 'See all' }) => (
  <Link href={href} className="newq text-[12.5px] tap hover:text-ink">
    {children}
  </Link>
);

/* An emoji standing in for a lucide icon inside a FieldRow tile. */
const emojiIcon = (char) => {
  const EmojiTile = () => <span className="text-[16px] leading-none">{char}</span>;
  return EmojiTile;
};

const TABS = [
  { id: 'recent', label: 'Recent' },
  { id: 'owe', label: 'You owe' },
  { id: 'owed', label: 'Owed to you' },
];

export default function DashboardPage() {
  const {
    me,
    overview,
    personById,
    currency,
    expenses,
    lists,
    groups,
    deleteExpense,
    deleteList,
    deleteGroup,
    removeFriend,
    convert,
  } = useApp();
  const { openExpense, editExpense, openSettle } = useUI();
  const { toast } = useToast();
  const router = useRouter();

  const [tab, setTab] = useState('recent');
  const [confirm, setConfirm] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const ask = (cfg) => {
    setConfirm(cfg);
    setConfirmOpen(true);
  };

  const run = async (fn, failTitle) => {
    try {
      await fn();
    } catch (err) {
      toast({ tone: 'error', title: failTitle, description: err.message });
    }
  };

  /* -------------------------------------------------- computations */

  const myExpenses = expenses.filter((e) => isInvolved(e, me.id));
  const activeLists = lists.filter((l) => l.status !== 'completed');
  // A sum across expenses, so each term has to be normalised first —
  // otherwise a €40 dinner adds 40 to a rupee total.
  const monthTotal = expenses
    .filter((e) => new Date(e.date).getMonth() === new Date().getMonth())
    .reduce(
      (a, e) => a + convert(e.splits.find((s) => s.userId === me.id)?.amount || 0, e.currency),
      0,
    );

  const feed = myExpenses
    .filter((e) => {
      if (tab === 'owe') return shareOf(e, me.id).net < -0.005;
      if (tab === 'owed') return shareOf(e, me.id).net > 0.005;
      return true;
    })
    .slice(0, 5);

  const settledNet = Math.abs(overview.net) < 0.005;
  const headline = settledNet
    ? 'Everything is settled up.'
    : overview.net > 0
      ? 'Your friends still owe you.'
      : 'A few bills need settling.';

  const payTargetOf = (expense) => {
    const other = (expense.paidBy || []).find((p) => p.userId !== me.id);
    return { withUserId: other?.userId, groupId: expense.groupId || undefined };
  };

  const payerLabel = (expense) => {
    const ids = (expense.paidBy || []).map((p) => p.userId);
    if (!ids.length) return 'Nobody';
    const first = ids[0] === me.id ? 'You' : firstName(personById(ids[0])?.name || 'Someone');
    return ids.length > 1 ? `${first} +${ids.length - 1}` : first;
  };

  /* Bars are relative to whichever figure is biggest. */
  const peak = Math.max(monthTotal, overview.owed, overview.owe, 1);
  const pctOf = (v) => (v / peak) * 100;

  /* Symbol in the UI face, digits in the display face, decimals quieter — a
     big number reads faster when the part that rarely matters recedes. */
  const { symbol: heroSymbol, whole: heroWhole, cents: heroCents } = splitAmount(
    overview.net,
    currency,
  );

  const tiles = [
    { id: 'add', label: 'Add', icon: Plus, tone: 'dark', onClick: () => openExpense() },
    { id: 'settle', label: 'Settle', icon: Wallet, onClick: () => openSettle() },
    /* The section, not its create form. `?new=1` opened a sheet on arrival,
       which is the wrong default for a nav tile — you cannot get to the list
       without dismissing something you did not ask for. */
    { id: 'list', label: 'List', icon: ShoppingBasket, href: '/lists' },
    { id: 'group', label: 'Group', icon: UsersRound, href: '/groups' },
  ];

  return (
    <Page>
      <div className="space-y-6">
        {/* --------------------------------------------- hero */}
        <Section delay={0.04}>
          <Card tone="grape" pad={false} className="px-5 pb-5 pt-6">
            <p className="newq text-[11.5px] uppercase tracking-[0.09em] text-ink-3 dark:text-ink-2">
              {settledNet ? 'All settled' : overview.net > 0 ? 'You are owed' : 'You owe'}
            </p>

            {/* `small` is scoped to the digits only — the currency symbol stays
                in the UI face. `num` stays on the wrapper for its tabular
                figures, so the digits keep their positions as the balance
                changes. */}
            <p className="num mt-2 text-[44px] font-bold leading-none text-ink">
              {/* A margin, not a literal space: JSX would collapse the space and
                  a real one is not tunable at this size. */}
              <span className="mr-1.5">{heroSymbol}</span>
              <span className="small">
                {heroWhole}
                {heroCents && <span className="text-ink-3 dark:text-ink-2">{heroCents}</span>}
              </span>
            </p>

            <p className="newq mt-2.5 text-[12.5px]">{headline}</p>

            {/* Two white discs on the pastel, the way the reference splits a
                balance into its two directions. */}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <div className="rounded-[18px] bg-white/70 dark:bg-white/10 px-4 py-3">
                <span className="flex items-center gap-1.5">
                  <ArrowDownLeft size={13} strokeWidth={2.5} className="text-pos" />
                  <span className="newq text-[11.5px]">Owed to you</span>
                </span>
                <p className="num mt-1 truncate text-[18px] text-ink">
                  {money(overview.owed, currency)}
                </p>
              </div>
              <div className="rounded-[18px] bg-white/70 dark:bg-white/10 px-4 py-3">
                <span className="flex items-center gap-1.5">
                  <ArrowUpRight size={13} strokeWidth={2.5} className="text-neg" />
                  <span className="newq text-[11.5px]">You owe</span>
                </span>
                <p className="num mt-1 truncate text-[18px] text-ink">
                  {money(overview.owe, currency)}
                </p>
              </div>
            </div>
          </Card>
          <FxNote className="mt-2" />
        </Section>

        {/* --------------------------------------------- metrics */}
        {/* White, not a pastel: this row is the one place semantic green and red
            are used at small sizes, and they need a neutral behind them. A grey
            fill would also read as almost nothing against the warm canvas. */}
        <Section delay={0.08}>
          <Card tone="white" pad={false} className="p-5">
            <MetricRow
              stats={[
                {
                  label: 'This month',
                  value: money(monthTotal, currency, { compact: true }),
                  tone: 'brand',
                  pct: pctOf(monthTotal),
                },
                {
                  label: 'Owed to you',
                  value: money(overview.owed, currency, { compact: true }),
                  tone: 'pos',
                  pct: pctOf(overview.owed),
                },
                {
                  label: 'You owe',
                  value: money(overview.owe, currency, { compact: true }),
                  tone: 'neg',
                  pct: pctOf(overview.owe),
                },
              ]}
            />
          </Card>
        </Section>

        {/* --------------------------------------------- quick actions */}
        <Section delay={0.12}>
          <ActionTiles actions={tiles} />
        </Section>

        {/* --------------------------------------------- bills */}
        <Section delay={0.16}>
          <GroupLabel action={<MoreLink href="/activity">Activity</MoreLink>}>Bills</GroupLabel>

          <Pills options={TABS} value={tab} onChange={setTab} size="sm" className="mb-2.5" />

          {feed.length ? (
            <ListGroup>
              {feed.map((e) => {
                const cat = categoryOf(e.category);
                const Icon = e.listId ? ShoppingBasket : cat.icon;
                const share = shareOf(e, me.id);
                const settled = Math.abs(share.net) < 0.005;
                const ways = e.splits?.length || 0;
                // Exact figures for a single row stay in the currency it was
                // recorded in; only the aggregates above get converted.
                const own = e.currency || currency;
                const mine = canEditExpense(e, me.id);
                const canSettle = !settled && share.net < 0;

                return (
                  <FieldRow
                    key={e.id}
                    icon={Icon}
                    iconTint={cat.tint}
                    iconBg={`color-mix(in srgb, ${cat.tint} 16%, transparent)`}
                    label={e.description}
                    sublabel={`Paid by ${payerLabel(e)} · split ${ways} ${ways === 1 ? 'way' : 'ways'}`}
                    value={money(share.owed, own)}
                    trailing={
                      <span className="flex shrink-0 items-center gap-1.5">
                        {settled && (
                          <Badge tone="pos" icon={Check}>
                            Paid
                          </Badge>
                        )}
                        {/* Edit and delete are the author's; settling is not,
                            so a non-author keeps that item and loses the rest.
                            With neither, the menu would be empty — so it goes. */}
                        {(mine || canSettle) && (
                        <RowMenu
                          onEdit={mine ? () => editExpense(e) : undefined}
                          onDelete={
                            mine
                              ? () =>
                                  ask({
                                    title: 'Delete this bill?',
                                    body: `“${e.description}” will be removed for everyone it was split with.`,
                                    confirmLabel: 'Delete bill',
                                    action: () =>
                                      run(() => deleteExpense(e.id), 'Could not delete the bill'),
                                  })
                              : undefined
                          }
                          editLabel="Edit bill"
                          deleteLabel="Delete bill"
                          title={e.description}
                          subtitle={`${money(e.amount, own)} · split ${ways} ${ways === 1 ? 'way' : 'ways'}`}
                          extra={
                            canSettle ? (
                              <button
                                type="button"
                                onClick={() => openSettle(payTargetOf(e))}
                                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5
                                  text-left text-ink tap hover:bg-surface-2 active:scale-[0.985]"
                              >
                                <Wallet size={19} strokeWidth={2.1} />
                                <span className="newq  text-ink text-[15px]">Settle this up</span>
                              </button>
                            ) : null
                          }
                        />
                        )}
                      </span>
                    }
                  />
                );
              })}
            </ListGroup>
          ) : (
            <Card pad={false}>
              <EmptyState
                icon={Sparkles}
                title={tab === 'recent' ? 'No bills yet' : 'Nothing here'}
                body={
                  tab === 'recent'
                    ? 'Add the first one and Splitta works out who owes what.'
                    : 'Switch tabs, or add a bill to get this moving.'
                }
                action={
                  <Button variant="dark" icon={Plus} onClick={() => openExpense()}>
                    Add a bill
                  </Button>
                }
              />
            </Card>
          )}
        </Section>

        {/* --------------------------------------------- shopping */}
        {activeLists.length > 0 && (
          <Section delay={0.2}>
            <GroupLabel action={<MoreLink href="/lists">All lists</MoreLink>}>Shopping</GroupLabel>

            <ListGroup>
              {activeLists.map((l) => {
                const done = l.items.filter((i) => i.checked).length;
                const spent = l.items.reduce((a, i) => a + (Number(i.price) || 0), 0);

                return (
                  <FieldRow
                    key={l.id}
                    icon={emojiIcon(l.emoji)}
                    label={l.name}
                    sublabel={`${done}/${l.items.length} picked${l.store ? ` · ${l.store}` : ''}`}
                    value={money(spent, currency)}
                    href={l.status === 'shopping' ? `/lists/${l.id}/shop` : `/lists/${l.id}`}
                    trailing={
                      <span className="flex shrink-0 items-center gap-1.5">
                        {l.status === 'shopping' && <Badge tone="brandSoft">Live</Badge>}
                        <RowMenu
                          onEdit={() => router.push(`/lists/${l.id}`)}
                          onDelete={() =>
                            ask({
                              title: 'Delete this list?',
                              body: `“${l.name}” and everything on it will be removed.`,
                              confirmLabel: 'Delete list',
                              action: () => run(() => deleteList(l.id), 'Could not delete the list'),
                            })
                          }
                          editLabel="Open list"
                          deleteLabel="Delete list"
                          title={l.name}
                          subtitle={`${l.items.length} items`}
                        />
                      </span>
                    }
                  />
                );
              })}
            </ListGroup>
          </Section>
        )}

        {/* --------------------------------------------- people */}
        {overview.rows.length > 0 && (
          <Section delay={0.24}>
            <GroupLabel action={<MoreLink href="/friends" />}>People</GroupLabel>

            <ListGroup>
              {overview.rows.slice(0, 4).map((r) => {
                const p = personById(r.userId);
                const positive = r.amount > 0;

                return (
                  <PersonRow
                    key={r.userId}
                    person={p}
                    name={firstName(p?.name)}
                    sublabel={positive ? 'owes you' : 'you owe'}
                    trailing={
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={`num text-[15px]  ${positive ? 'text-pos' : 'text-neg'}`}
                        >
                          {money(Math.abs(r.amount), currency)}
                        </span>
                        <Button
                          size="xs"
                          variant={positive ? 'soft' : 'dark'}
                          onClick={() => openSettle({ withUserId: r.userId })}
                        >
                          {positive ? 'Remind' : 'Pay'}
                        </Button>
                        <RowMenu
                          onEdit={() => router.push(`/friends/${r.userId}`)}
                          onDelete={() =>
                            ask({
                              title: `Remove ${firstName(p?.name)}?`,
                              body: 'They will be taken off your friends list. Shared history stays.',
                              confirmLabel: 'Remove',
                              action: () =>
                                run(() => removeFriend(r.userId), 'Could not remove this friend'),
                            })
                          }
                          editLabel="Open profile"
                          deleteLabel="Remove friend"
                          className="-mr-2"
                          title={p?.name}
                          subtitle={
                            positive
                              ? `Owes you ${money(Math.abs(r.amount), currency)}`
                              : `You owe ${money(Math.abs(r.amount), currency)}`
                          }
                        />
                      </span>
                    }
                  />
                );
              })}
            </ListGroup>
          </Section>
        )}

        {/* --------------------------------------------- groups */}
        {groups.length > 0 && (
          <Section delay={0.28}>
            <GroupLabel action={<MoreLink href="/groups">All groups</MoreLink>}>Groups</GroupLabel>

            <ListGroup>
              {groups.slice(0, 4).map((g) => (
                <FieldRow
                  key={g.id}
                  icon={emojiIcon(g.emoji)}
                  label={g.name}
                  sublabel={`${g.memberIds.length} members`}
                  href={`/groups/${g.id}`}
                  trailing={
                    <RowMenu
                      onEdit={() => router.push(`/groups/${g.id}`)}
                      onDelete={() =>
                        ask({
                          title: 'Delete this group?',
                          body: `“${g.name}” and its shared history will be removed for everyone.`,
                          confirmLabel: 'Delete group',
                          action: () => run(() => deleteGroup(g.id), 'Could not delete the group'),
                        })
                      }
                      editLabel="Open group"
                      deleteLabel="Delete group"
                      title={g.name}
                      subtitle={`${g.memberIds.length} members`}
                    />
                  }
                />
              ))}
            </ListGroup>
          </Section>
        )}

        {/* --------------------------------------------- primary CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, ...SPRING }}
        >
          <Button block size="lg" icon={Plus} onClick={() => openExpense()}>
            Add an expense
          </Button>
          <p className="newq mt-3 text-center text-[12.5px]">
            Splitta works out who owes what, down to the last{' '}
            {(CURRENCIES[currency] || CURRENCIES.INR).symbol}1.
          </p>
        </motion.div>
      </div>

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => confirm?.action?.()}
        title={confirm?.title}
        body={confirm?.body}
        confirmLabel={confirm?.confirmLabel || 'Delete'}
        danger
      />
    </Page>
  );
}
