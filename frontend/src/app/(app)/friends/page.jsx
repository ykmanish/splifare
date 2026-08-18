'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Clock,
  Mail,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';
import Page from '@/components/layout/Page';
import { useUI } from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import Sheet, { ConfirmSheet } from '@/components/ui/Sheet';
import { Input, SearchInput } from '@/components/ui/Field';
import { Badge, Card, EmptyState, RowMenu, cycleTone } from '@/components/ui/Bits';
import { BubbleTile, CoralFab, GroupLabel, ListGroup } from '@/components/ui/Blocks';
import CodeBox from '@/components/ui/CodeBox';
import { Pills } from '@/components/ui/Controls';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui/Toast';
import { money, firstName, relativeTime } from '@/lib/format';

const EASE = [0.16, 1, 0.3, 1];
const enter = (i = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: EASE, delay: i * 0.04 },
});

/* ------------------------------------------------------------------ add */

/**
 * Friendship is by invitation now: you send a request to an exact email or
 * Splitta code, and nothing is shared until the other person accepts.
 */
function AddFriendSheet({ open, onClose }) {
  const { sendFriendRequest, myCode, me } = useApp();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery('');
      setError('');
      setBusy(false);
    }
  }

  async function submit(e) {
    e?.preventDefault();
    const clean = query.trim();
    if (!clean) {
      setError('Enter their email or Splitta code');
      return;
    }
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await sendFriendRequest(clean);
      toast(
        res.accepted
          ? { title: 'You are friends', description: res.message }
          : {
              title: 'Request sent',
              description: res.person
                ? `${res.person.name} has to accept before you can split.`
                : 'They have to accept before you can split.',
            },
      );
      setQuery('');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a friend"
      subtitle="They accept before anything is shared"
      footer={
        <div className="flex gap-2.5">
          <Button variant="soft" size="md" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button size="md" onClick={submit} loading={busy} className="flex-[2]">
            Send request
          </Button>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-6">
        <div>
          <Input
            label="Their email or code"
            placeholder="meera@example.com  ·  H4K 9TP"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setError('');
            }}
            error={error}
            icon={Mail}
            autoCapitalize="off"
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
          <p className="newq mt-2 px-1.5 text-[12px]">
            Has to match exactly — nobody can be found by browsing.
          </p>
        </div>

        <div>
          <GroupLabel>Or let them add you</GroupLabel>
          <CodeBox
            code={myCode}
            label="Your Splitta code"
            hint="Share it and they can send you a request"
            shareTitle="Add me on Splitta"
            shareText={`Add me on Splitta — my code is ${myCode}${
              me?.name ? ` (${me.name})` : ''
            }`}
          />
        </div>

        <button type="submit" className="hidden" aria-hidden />
      </form>
    </Sheet>
  );
}

/* -------------------------------------------------------------- requests */

function IncomingCard({ request, index, onAccept, onDecline, busy }) {
  const p = request.person;

  return (
    <motion.div {...enter(index)}>
      <Card tone="limeSoft" pad={false} className="px-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar person={p} size="md" />
          <span className="min-w-0 flex-1">
            <span className="newq text-ink block truncate text-[15.5px]">{p.name}</span>
            <span className="newq block truncate text-[12.5px]">
              wants to be friends · {relativeTime(request.createdAt)}
            </span>
          </span>
        </div>

        <div className="mt-3.5 flex gap-2.5">
          <Button
            variant="soft"
            size="sm"
            icon={X}
            className="flex-1"
            disabled={busy}
            onClick={onDecline}
          >
            Decline
          </Button>
          <Button
            variant="dark"
            size="sm"
            icon={Check}
            className="flex-[1.6]"
            loading={busy}
            onClick={onAccept}
          >
            Accept
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}

/* ------------------------------------------------------------ friend card */

/**
 * A friend is a whole pastel card, not a grey list row: face + name on top,
 * the balance and a black Settle pill underneath. The fill rotates through
 * the pastel cycle so consecutive friends never share a colour.
 */
function FriendCard({ person, balance, currency, tone, index, onSettle, onRemove }) {
  const settled = Math.abs(balance) < 0.005;
  const status = settled ? 'all settled up' : balance > 0 ? 'owes you' : 'you owe';

  return (
    <motion.div {...enter(index)}>
      <Card
        as={Link}
        href={`/friends/${person.id}`}
        tone={tone}
        pad={false}
        className="block px-4 py-4 tap active:scale-[0.99]"
      >
        <div className="flex items-center gap-3">
          <Avatar person={person} size="md" />

          <span className="min-w-0 flex-1">
            <span className="newq  text-ink block truncate text-[15.5px]">{person.name}</span>
            <span className="newq block truncate text-[12.5px]">{person.email || status}</span>
          </span>

          {/* RowMenu's sheet is a portal — its clicks still bubble through the
              React tree into the card's <Link>, so the guard sits here. */}
          <span
            role="presentation"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="-mr-1.5 flex shrink-0 items-center"
          >
            <RowMenu
              title={person.name}
              subtitle={settled ? 'All settled up' : 'You still have a balance'}
              deleteLabel="Remove friend"
              onDelete={onRemove}
            />
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          {settled ? (
            <span className="newq text-[13px]">Nothing owed either way</span>
          ) : (
            <span className="min-w-0">
              <span className="newq block text-[11.5px]">{status}</span>
              <span className="num mt-0.5 block truncate text-[23px]  leading-none text-ink">
                {money(Math.abs(balance), currency)}
              </span>
            </span>
          )}

          {settled ? (
            <Badge tone="onTone" icon={Check}>
              settled
            </Badge>
          ) : (
            <Button
              size="xs"
              variant="dark"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSettle();
              }}
            >
              Settle
            </Button>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ page */

export default function FriendsPage() {
  const {
    me,
    friends,
    incoming,
    outgoing,
    myCode,
    overview,
    currency,
    removeFriend,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
  } = useApp();
  const { openSettle } = useUI();
  const { toast } = useToast();

  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [pendingRemove, setPendingRemove] = useState(null);
  const [workingId, setWorkingId] = useState(null);

  const balanceOf = useMemo(
    () => Object.fromEntries(overview.rows.map((r) => [r.userId, r.amount])),
    [overview.rows],
  );

  const rows = useMemo(() => {
    return friends
      .map((p) => ({ ...p, balance: balanceOf[p.id] || 0 }))
      .filter((p) => {
        if (filter === 'owed' && p.balance <= 0.005) return false;
        if (filter === 'owe' && p.balance >= -0.005) return false;
        return p.name.toLowerCase().includes(q.trim().toLowerCase());
      })
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance) || a.name.localeCompare(b.name));
  }, [friends, balanceOf, q, filter]);

  async function confirmRemove() {
    const p = pendingRemove;
    if (!p) return;
    try {
      await removeFriend(p.id);
      toast({
        title: `${firstName(p.name)} removed`,
        description: 'Neither of you can add the other to an expense now.',
      });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not remove them', description: err.message });
    }
  }

  /** Accept / decline / cancel all follow the same busy-and-report shape. */
  async function respond(id, run, done, failed) {
    if (workingId) return;
    setWorkingId(id);
    try {
      await run();
      if (done) toast(done);
    } catch (err) {
      toast({ tone: 'error', title: failed, description: err.message });
    } finally {
      setWorkingId(null);
    }
  }

  const groupLabel =
    filter === 'owed' ? 'Owes you' : filter === 'owe' ? 'You owe' : 'Everyone you split with';

  return (
    <Page title="Friends">
      <div className="space-y-7">
        {/* ------------------------------------------------ summary bubbles */}
        <motion.div {...enter(0)} className="grid grid-cols-2 gap-3">
          <BubbleTile
            tone="mint"
            icon={ArrowDownLeft}
            label="Owed to you"
            value={money(overview.owed, currency)}
          />
          <BubbleTile
            tone="blush"
            icon={ArrowUpRight}
            label="You owe"
            value={money(overview.owe, currency)}
          />
        </motion.div>

        {/* ------------------------------------------------ incoming */}
        {incoming.length > 0 && (
          <motion.section {...enter(1)}>
            <GroupLabel
              action={
                <span className="newq num text-[12px] uppercase tracking-[0.07em] text-ink-3">
                  {incoming.length}
                </span>
              }
            >
              Friend requests
            </GroupLabel>
            <div className="space-y-3">
              {incoming.map((r, i) => (
                <IncomingCard
                  key={r.id}
                  request={r}
                  index={i}
                  busy={workingId === r.id}
                  onAccept={() =>
                    respond(
                      r.id,
                      () => acceptFriendRequest(r.id),
                      {
                        title: `${firstName(r.person.name)} is now a friend`,
                        description: 'You can split expenses together.',
                      },
                      'Could not accept',
                    )
                  }
                  onDecline={() =>
                    respond(
                      r.id,
                      () => declineFriendRequest(r.id),
                      { tone: 'info', title: 'Request declined' },
                      'Could not decline',
                    )
                  }
                />
              ))}
            </div>
          </motion.section>
        )}

        {/* ------------------------------------------------ outgoing */}
        {outgoing.length > 0 && (
          <motion.section {...enter(2)}>
            <GroupLabel>Waiting on them</GroupLabel>
            <ListGroup>
              {outgoing.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar person={r.person} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="newq text-ink block truncate text-[14.5px]">
                      {r.person.name}
                    </span>
                    <span className="newq block truncate text-[12px]">
                      sent {relativeTime(r.createdAt)}
                    </span>
                  </span>
                  <Badge tone="butter" icon={Clock}>
                    pending
                  </Badge>
                  <button
                    type="button"
                    aria-label={`Cancel request to ${r.person.name}`}
                    disabled={workingId === r.id}
                    onClick={() =>
                      respond(
                        r.id,
                        () => cancelFriendRequest(r.id),
                        { tone: 'info', title: 'Request withdrawn' },
                        'Could not withdraw it',
                      )
                    }
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2
                      text-ink-3 tap hover:bg-surface-3 hover:text-ink active:scale-90
                      disabled:opacity-40"
                  >
                    <X size={15} strokeWidth={2.4} />
                  </button>
                </div>
              ))}
            </ListGroup>
          </motion.section>
        )}

        {/* ------------------------------------------------ filter + search */}
        <motion.div {...enter(3)} className="space-y-3">
          <Pills
            options={[
              { id: 'all', label: 'All' },
              { id: 'owed', label: 'Owes you' },
              { id: 'owe', label: 'You owe' },
            ]}
            value={filter}
            onChange={setFilter}
          />

          {friends.length > 4 && (
            <SearchInput value={q} onChange={setQ} placeholder="Search friends…" />
          )}
        </motion.div>

        {/* ------------------------------------------------ list */}
        <motion.section {...enter(4)}>
          <GroupLabel action={<span className="newq text-[12px]  uppercase tracking-[0.07em] text-ink-3 num">{rows.length}</span>}>
            {groupLabel}
          </GroupLabel>

          {rows.length === 0 ? (
            <Card tone="skySoft" pad={false}>
              <EmptyState
                icon={UsersRound}
                title={
                  filter === 'owed'
                    ? 'Nobody owes you'
                    : filter === 'owe'
                      ? 'You owe nobody'
                      : q
                        ? 'No friends match that'
                        : 'No friends yet'
                }
                body={
                  filter === 'all' && !q
                    ? 'Send a request with someone’s email or Splitta code. Once they accept, they show up whenever you split a bill.'
                    : 'Try a different filter.'
                }
                action={
                  filter === 'all' && !q ? (
                    <Button variant="dark" icon={UserPlus} onClick={() => setAdding(true)}>
                      Add a friend
                    </Button>
                  ) : null
                }
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {rows.map((p, i) => (
                <FriendCard
                  key={p.id}
                  person={p}
                  balance={p.balance}
                  currency={currency}
                  tone={cycleTone(i)}
                  index={i}
                  onSettle={() => openSettle({ withUserId: p.id })}
                  onRemove={() => setPendingRemove(p)}
                />
              ))}
            </div>
          )}
        </motion.section>

        {/* ------------------------------------------------ your code */}
        <motion.section {...enter(5)}>
          <GroupLabel>Your code</GroupLabel>
          <CodeBox
            code={myCode}
            label="Add me on Splitta"
            hint="Anyone with this can send you a friend request"
            shareTitle="Add me on Splitta"
            shareText={`Add me on Splitta — my code is ${myCode}${me?.name ? ` (${me.name})` : ''}`}
          />
        </motion.section>
      </div>

      {/* ------------------------------------------------------------ fab */}
      <div className="phone pointer-events-none fixed inset-x-0 bottom-0 z-40">
        <div className="flex justify-end px-5 pb-28">
          <CoralFab
            icon={UserPlus}
            label="Add a friend"
            onClick={() => setAdding(true)}
            className="pointer-events-auto"
          />
        </div>
      </div>

      <AddFriendSheet open={adding} onClose={() => setAdding(false)} />

      <ConfirmSheet
        open={!!pendingRemove}
        onClose={() => setPendingRemove(null)}
        onConfirm={confirmRemove}
        title={pendingRemove ? `Remove ${firstName(pendingRemove.name)}?` : 'Remove friend?'}
        body="You come off each other’s friend lists, so neither of you can add the other to a new expense. Shared expenses stay on record."
        confirmLabel="Remove"
        danger
      />
    </Page>
  );
}
