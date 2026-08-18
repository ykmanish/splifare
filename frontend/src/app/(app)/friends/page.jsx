'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, Check, UserPlus, UsersRound } from 'lucide-react';
import Page from '@/components/layout/Page';
import { useUI } from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import Sheet, { ConfirmSheet } from '@/components/ui/Sheet';
import { Input, SearchInput } from '@/components/ui/Field';
import { Badge, Card, EmptyState, RowMenu, cycleTone } from '@/components/ui/Bits';
import { BubbleTile, CoralFab, GroupLabel } from '@/components/ui/Blocks';
import { Pills } from '@/components/ui/Controls';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui/Toast';
import { money, firstName } from '@/lib/format';

const EASE = [0.16, 1, 0.3, 1];
const enter = (i = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: EASE, delay: i * 0.04 },
});

/* ------------------------------------------------------------------ add */

function AddFriendSheet({ open, onClose }) {
  const { addPerson } = useApp();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e?.preventDefault();
    setTouched(true);
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const p = await addPerson({ name, email });
      toast({ title: `${p.name} added`, description: 'You can now split expenses with them.' });
      setName('');
      setEmail('');
      setTouched(false);
      onClose();
    } catch (err) {
      toast({ tone: 'error', title: 'Could not add them', description: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a friend"
      subtitle="Anyone you split money with"
      size="sm"
      footer={
        <div className="flex gap-2.5">
          <Button variant="soft" size="md" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button size="md" onClick={submit} loading={busy} className="flex-[2]">
            Add friend
          </Button>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Name"
          placeholder="Meera Iyer"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={touched && !name.trim() ? 'Enter a name' : ''}
          autoFocus
        />
        <Input
          label="Email"
          hint="optional"
          type="email"
          placeholder="meera@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="hidden" aria-hidden />
      </form>
    </Sheet>
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
  const { me, people, overview, currency, removeFriend } = useApp();
  const { openSettle } = useUI();
  const { toast } = useToast();

  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [pendingRemove, setPendingRemove] = useState(null);

  const balanceOf = useMemo(
    () => Object.fromEntries(overview.rows.map((r) => [r.userId, r.amount])),
    [overview.rows],
  );

  const rows = useMemo(() => {
    return people
      .filter((p) => p.id !== me.id)
      .map((p) => ({ ...p, balance: balanceOf[p.id] || 0 }))
      .filter((p) => {
        if (filter === 'owed' && p.balance <= 0.005) return false;
        if (filter === 'owe' && p.balance >= -0.005) return false;
        return p.name.toLowerCase().includes(q.trim().toLowerCase());
      })
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance) || a.name.localeCompare(b.name));
  }, [people, me, balanceOf, q, filter]);

  async function confirmRemove() {
    const p = pendingRemove;
    if (!p) return;
    try {
      await removeFriend(p.id);
      toast({ title: `${firstName(p.name)} removed`, description: 'They are no longer in your friends list.' });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not remove them', description: err.message });
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

        {/* ------------------------------------------------ filter + search */}
        <motion.div {...enter(1)} className="space-y-3">
          <Pills
            options={[
              { id: 'all', label: 'All' },
              { id: 'owed', label: 'Owes you' },
              { id: 'owe', label: 'You owe' },
            ]}
            value={filter}
            onChange={setFilter}
          />

          {people.length > 4 && (
            <SearchInput value={q} onChange={setQ} placeholder="Search friends…" />
          )}
        </motion.div>

        {/* ------------------------------------------------ list */}
        <motion.section {...enter(2)}>
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
                    ? 'Add the people you share bills with to start tracking balances.'
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
        body="They will be taken off your friends list. Shared expenses stay on record."
        confirmLabel="Remove"
        danger
      />
    </Page>
  );
}
