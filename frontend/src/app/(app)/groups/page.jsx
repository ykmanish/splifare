'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plus, UsersRound, UserPlus } from 'lucide-react';
import Page from '@/components/layout/Page';
import Button from '@/components/ui/Button';
import Sheet, { ConfirmSheet } from '@/components/ui/Sheet';
import { Input, Label, SearchInput } from '@/components/ui/Field';
import { PersonToggle } from '@/components/ui/Avatar';
import { Badge, Card, EmptyState, RowMenu, cycleTone } from '@/components/ui/Bits';
import { AvatarCluster, CoralFab, GroupLabel } from '@/components/ui/Blocks';
import CreateGroupSheet from '@/components/groups/CreateGroupSheet';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui/Toast';
import { buildLedger, balancesFor } from '@/lib/balances';
import { money } from '@/lib/format';
import { GROUP_EMOJIS } from '@/lib/categories';

const EASE = [0.16, 1, 0.3, 1];

/* ------------------------------------------------------------------ edit */

function EditGroupSheet({ group, onClose }) {
  const { me, people, updateGroup } = useApp();
  const { toast } = useToast();

  const [gid, setGid] = useState(null);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏠');
  const [memberIds, setMemberIds] = useState([]);
  const [busy, setBusy] = useState(false);

  /* Seed the form the moment a group is handed in. Keeping this in render
     (rather than an effect) means the sheet never flashes stale values. */
  if (group && gid !== group.id) {
    setGid(group.id);
    setName(group.name);
    setEmoji(group.emoji);
    setMemberIds(group.memberIds);
    setBusy(false);
  }

  function close() {
    setGid(null);
    onClose();
  }

  function toggle(pid) {
    if (pid === me?.id) return;
    setMemberIds((m) => {
      const next = m.includes(pid) ? m.filter((x) => x !== pid) : [...m, pid];
      return next.length ? next : m;
    });
  }

  async function save() {
    if (!group || busy) return;
    const clean = name.trim();
    if (clean.length < 2) return;
    setBusy(true);
    try {
      await updateGroup(group.id, { name: clean, emoji, memberIds });
      toast({ title: 'Group updated', description: clean });
      close();
    } catch (err) {
      toast({ tone: 'error', title: 'Could not save the group', description: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!group}
      onClose={close}
      title="Edit group"
      subtitle={group?.name}
      footer={
        <div className="flex gap-2.5">
          <Button variant="soft" size="md" className="flex-1" onClick={close}>
            Cancel
          </Button>
          <Button
            size="md"
            className="flex-[2]"
            loading={busy}
            disabled={name.trim().length < 2}
            onClick={save}
          >
            Save changes
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex gap-3">
          <div className="shrink-0">
            <Label>Icon</Label>
            <div className="grid size-13 place-items-center rounded-[16px] bg-surface-2 text-2xl">
              {emoji}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <Input
              label="Group name"
              value={name}
              placeholder="Flat 402"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label>Pick an icon</Label>
          <div className="-mx-5 overflow-x-auto px-5 no-scrollbar">
            <div className="flex gap-2 pb-1">
              {GROUP_EMOJIS.map((e) => (
                <motion.button
                  key={e}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                  onClick={() => setEmoji(e)}
                  aria-pressed={emoji === e}
                  className={`grid size-11 shrink-0 place-items-center rounded-[14px] text-xl tap
                    ${emoji === e ? 'bg-sky' : 'bg-surface-2 hover:bg-surface-3'}`}
                >
                  {e}
                </motion.button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <Label hint={`${memberIds.length} in this group`}>Members</Label>
          <div className="space-y-1.5">
            {people.map((p) => (
              <PersonToggle
                key={p.id}
                person={p}
                subtitle={p.id === me?.id ? 'You — always a member' : p.email}
                selected={memberIds.includes(p.id)}
                disabled={p.id === me?.id}
                onToggle={toggle}
              />
            ))}
          </div>
          <p className="newq mt-2.5 flex items-center gap-1.5 px-1.5 text-[12px]">
            <UserPlus size={13} />
            Add new people from the friends screen first.
          </p>
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ tile */

function GroupTile({ group, index, currency, onEdit, onDelete }) {
  const settled = Math.abs(group.net) < 0.005;

  return (
    <Card tone={cycleTone(index)} pad={false} className="px-3 pb-4 pt-2.5">
      <div className="absolute right-1 top-1 z-10">
        <RowMenu
          title={group.name}
          subtitle={`${group.members.length} people · ${group.count} expenses`}
          editLabel="Edit group"
          deleteLabel="Delete group"
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>

      <AvatarCluster
        people={group.members}
        label={group.name}
        sublabel={`${group.members.length} ${group.members.length === 1 ? 'person' : 'people'}`}
        href={`/groups/${group.id}`}
        size={100}
      />

      <div className="mt-3 text-center">
        {settled ? (
          <Badge tone="onTone">Settled</Badge>
        ) : (
          <>
            <span
              className={`num block text-[16.5px]  ${
                group.net > 0 ? 'text-pos' : 'text-neg'
              }`}
            >
              {money(Math.abs(group.net), currency)}
            </span>
            <span className="newq block text-[11.5px]">
              {group.net > 0 ? 'you are owed' : 'you owe'}
            </span>
          </>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ list */

function GroupsInner() {
  const { me, groups, people, expenses, settlements, currency, deleteGroup } = useApp();
  const { toast } = useToast();
  const params = useSearchParams();

  const [creating, setCreating] = useState(params.get('new') === '1');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [q, setQ] = useState('');

  const all = useMemo(() => {
    return groups.map((g) => {
      const ledger = buildLedger(expenses, settlements, g.id);
      const { net } = balancesFor(ledger, me.id);
      const members = g.memberIds.map((id) => people.find((p) => p.id === id)).filter(Boolean);
      const count = expenses.filter((e) => e.groupId === g.id).length;
      return { ...g, net, members, count };
    });
  }, [groups, expenses, settlements, people, me]);

  const rows = useMemo(
    () => all.filter((g) => g.name.toLowerCase().includes(q.trim().toLowerCase())),
    [all, q],
  );

  /* Headline figures for the butter hero — derived from every circle, not the
     filtered view, so searching never changes the totals. */
  const totals = useMemo(
    () => ({
      owed: all.reduce((a, g) => (g.net > 0.005 ? a + g.net : a), 0),
      owe: all.reduce((a, g) => (g.net < -0.005 ? a - g.net : a), 0),
    }),
    [all],
  );

  async function onDelete() {
    if (!deleting) return;
    try {
      await deleteGroup(deleting.id);
      toast({ tone: 'info', title: 'Group deleted', description: deleting.name });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not delete the group', description: err.message });
    }
  }

  return (
    <Page title="Groups">
      <div className="space-y-5 pb-6">
        {groups.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <Card tone="butter" className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="newq text-[12px]  uppercase tracking-[0.07em] text-ink-3">
                  Across {groups.length} {groups.length === 1 ? 'circle' : 'circles'}
                </p>
                <p className="num mt-1.5 truncate text-[30px]  leading-none text-pos">
                  {money(totals.owed, currency)}
                </p>
                <p className="newq mt-1.5 text-[12.5px]">owed to you</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="num text-[19px]  text-neg">
                  {money(totals.owe, currency)}
                </p>
                <p className="newq text-[12.5px]">you owe</p>
              </div>
            </Card>
          </motion.div>
        )}

        {groups.length > 3 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE, delay: 0.02 }}
          >
            <SearchInput value={q} onChange={setQ} placeholder="Search groups…" />
          </motion.div>
        )}

        {rows.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE, delay: 0.04 }}
          >
            <Card tone="lavenderSoft" pad={false}>
              <EmptyState
                icon={UsersRound}
                title={q ? 'No groups match that' : 'No groups yet'}
                body={
                  q
                    ? 'Try a different search.'
                    : 'Make one for your flat, a trip, or anyone you split with regularly.'
                }
                action={
                  q ? undefined : (
                    <Button variant="dark" icon={Plus} onClick={() => setCreating(true)}>
                      New group
                    </Button>
                  )
                }
              />
            </Card>
          </motion.div>
        ) : (
          <div>
            <GroupLabel>Your circles</GroupLabel>
            <div className="grid grid-cols-2 gap-3">
              {rows.map((g, i) => (
                <motion.div
                  key={g.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE, delay: Math.min(i, 8) * 0.04 }}
                >
                  <GroupTile
                    group={g}
                    index={i}
                    currency={currency}
                    onEdit={() => setEditing(g)}
                    onDelete={() => setDeleting(g)}
                  />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE, delay: 0.12 }}
            className="pt-1"
          >
            <Card tone="skySoft" className="text-center">
              <p className="newq text-[12.5px]">
                A circle keeps a flat, a trip or a crew on its own tab.
              </p>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Pinned inside the 440px column. Not inside an animated wrapper — a
          transformed ancestor would collapse the fixed positioning. */}
      <div className="phone pointer-events-none fixed inset-x-0 bottom-0 z-30">
        <div className="flex justify-end px-5 pb-28">
          <span className="pointer-events-auto">
            <CoralFab icon={Plus} label="New group" onClick={() => setCreating(true)} />
          </span>
        </div>
      </div>

      <CreateGroupSheet open={creating} onClose={() => setCreating(false)} />

      <EditGroupSheet group={editing} onClose={() => setEditing(null)} />

      <ConfirmSheet
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={deleting ? `Delete ${deleting.name}?` : 'Delete group?'}
        body={
          deleting
            ? `Its ${deleting.count} ${deleting.count === 1 ? 'expense' : 'expenses'} will be removed and balances recalculated. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete group"
        danger
        onConfirm={onDelete}
      />
    </Page>
  );
}

export default function GroupsPage() {
  return (
    <Suspense fallback={null}>
      <GroupsInner />
    </Suspense>
  );
}
