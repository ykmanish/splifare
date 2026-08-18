'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ChevronRight,
  KeyRound,
  Plus,
  QrCode,
  ScanLine,
  UsersRound,
  UserPlus,
} from 'lucide-react';
import Page from '@/components/layout/Page';
import Button from '@/components/ui/Button';
import Sheet, { ConfirmSheet } from '@/components/ui/Sheet';
import { Input, Label, SearchInput } from '@/components/ui/Field';

import { AvatarStack } from '@/components/ui/Avatar';
import { Badge, Card, EmptyState, RowMenu, cycleTone } from '@/components/ui/Bits';
import {
  CoralFab,
  FieldRow,
  GroupLabel,
  ListGroup,
  PersonRow,
} from '@/components/ui/Blocks';
import CodeBox, { spaceCode } from '@/components/ui/CodeBox';
import { groupInviteLink } from '@/lib/invite';
import FxNote from '@/components/ui/FxNote';
import CreateGroupSheet from '@/components/groups/CreateGroupSheet';
import JoinGroupSheet from '@/components/groups/JoinGroupSheet';
import MemberSheet from '@/components/groups/MemberSheet';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui/Toast';
import { buildLedger, balancesFor } from '@/lib/balances';
import { money, firstName, splitAmount } from '@/lib/format';
import { GROUP_EMOJIS } from '@/lib/categories';

const EASE = [0.16, 1, 0.3, 1];

/* ------------------------------------------------------------------ edit */

function EditGroupSheet({ group, onClose }) {
  const { me, friends, people, updateGroup, rotateGroupCode } = useApp();
  const { toast } = useToast();

  const [gid, setGid] = useState(null);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏠');
  const [busy, setBusy] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [viewingMember, setViewingMember] = useState(null);

  /* Members and addable friends are two different lists with two different
     actions — tap a member to open their card, tap a friend to add them.
     A single toggle list is what let a stray tap remove somebody. */
  const otherMembers = useMemo(() => {
    const ids = group?.memberIds || [];
    return ids
      .filter((id) => id !== me?.id)
      .map((id) => people.find((x) => x.id === id))
      .filter(Boolean);
  }, [group, people, me]);

  const addableFriends = useMemo(() => {
    const ids = new Set(group?.memberIds || []);
    return friends.filter((p) => p && !ids.has(p.id));
  }, [friends, group]);

  /* Seed the form the moment a group is handed in. Keeping this in render
     (rather than an effect) means the sheet never flashes stale values. */
  if (group && gid !== group.id) {
    setGid(group.id);
    setName(group.name);
    setEmoji(group.emoji);
    setBusy(false);
  }

  function close() {
    setGid(null);
    onClose();
  }

  async function addMember(person) {
    if (!group || group.memberIds.includes(person.id)) return;
    try {
      await updateGroup(group.id, { memberIds: [...group.memberIds, person.id] });
      toast({ title: `${firstName(person.name)} added`, description: `They are now in ${group.name}.` });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not add them', description: err.message });
    }
  }

  /* Throws on failure so MemberSheet keeps itself open on error. */
  async function removeMember(person) {
    if (!group) return;
    const next = group.memberIds.filter((x) => x !== person.id);
    if (!next.length) return;
    try {
      await updateGroup(group.id, { memberIds: next });
      toast({
        tone: 'info',
        title: `${firstName(person.name)} removed`,
        description: `They are no longer in ${group.name}.`,
      });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not remove them', description: err.message });
      throw err;
    }
  }

  async function onRotate() {
    if (!group || rotating) return;
    setRotating(true);
    try {
      await rotateGroupCode(group.id);
      toast({
        title: 'New room code',
        description: 'The old one stops working right away.',
      });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not change the code', description: err.message });
    } finally {
      setRotating(false);
    }
  }

  async function save() {
    if (!group || busy) return;
    const clean = name.trim();
    if (clean.length < 2) return;
    setBusy(true);
    try {
      // Members are applied as they change, so this only carries the drafts.
      await updateGroup(group.id, { name: clean, emoji });
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
          <Label>Room code</Label>
          <CodeBox
            code={group?.code}
            label="Anyone with this can join"
            hint="Rotate it if it ends up somewhere it should not be"
            shareTitle={`Join ${group?.name || 'my group'} on Splitta`}
            shareText={`Join ${group?.name || 'my group'} on Splitta — the room code is ${group?.code || ''}`}
            qrValue={groupInviteLink(group?.code)}
            qrLabel={`QR code to join ${group?.name || 'this group'}`}
            onRotate={onRotate}
            rotating={rotating}
          />
        </div>

        <div>
          <Label hint={`${group?.memberIds.length || 0} in this group`}>Members</Label>
          <ListGroup>
            <PersonRow person={me} name="You" sublabel="Always a member" />

            {otherMembers.map((p) => (
              <PersonRow
                key={p.id}
                person={p}
                sublabel={p.isFriend ? p.email : 'joined with the code'}
                onClick={() => setViewingMember(p)}
                trailing={
                  <ChevronRight size={18} strokeWidth={2.2} className="shrink-0 text-ink-3" />
                }
              />
            ))}
          </ListGroup>
          <p className="newq mt-2.5 px-1.5 text-[12px]">
            Tap a member to open their card, or to remove them.
          </p>
        </div>

        <div>
          <Label hint={addableFriends.length ? `${addableFriends.length} available` : undefined}>
            Add from your friends
          </Label>
          {addableFriends.length ? (
            <ListGroup>
              {addableFriends.map((p) => (
                <PersonRow
                  key={p.id}
                  person={p}
                  sublabel={p.email}
                  onClick={() => addMember(p)}
                  trailing={
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                      <UserPlus size={15} strokeWidth={2.4} />
                    </span>
                  }
                />
              ))}
            </ListGroup>
          ) : (
            <Card tone="skySoft" pad={false}>
              <FieldRow
                icon={UserPlus}
                iconTint="var(--brand)"
                iconBg="var(--sky)"
                label="Everyone you know is already here"
                sublabel="Anyone else joins with the room code"
              />
            </Card>
          )}
        </div>
      </div>

      <MemberSheet
        open={!!viewingMember}
        onClose={() => setViewingMember(null)}
        person={viewingMember}
        groupName={group?.name || 'this group'}
        isMember={!!viewingMember && !!group?.memberIds.includes(viewingMember.id)}
        onRemove={removeMember}
      />
    </Sheet>
  );
}

/* --------------------------------------------------------------- chooser */

/**
 * The FAB has two jobs now — start a circle, or walk into one someone else
 * started — so it asks which before opening either form.
 */
function StartSheet({ open, onClose, onCreate, onJoin, onScan }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a group"
      subtitle="Start your own, or join with a code"
      size="sm"
    >
      <ListGroup tone="fill">
        {/* Near-black on full lime, not lime on pale lime — that pairing was
            1.13:1 and effectively invisible. It also makes Create read as the
            primary action of the three, which it is. */}
        <FieldRow
          icon={Plus}
          iconTint="var(--text)"
          iconBg="var(--brand)"
          label="Create a group"
          sublabel="You get a room code to share"
          chevron
          onClick={() => {
            onClose();
            onCreate();
          }}
        />
        <FieldRow
          icon={KeyRound}
          iconTint="var(--info)"
          iconBg="var(--sky)"
          label="Join with a code"
          sublabel="Someone already made one"
          chevron
          onClick={() => {
            onClose();
            onJoin();
          }}
        />
        <FieldRow
          icon={ScanLine}
          iconTint="var(--violet)"
          iconBg="var(--grape)"
          label="Scan a QR code"
          sublabel="Point your camera at their code"
          chevron
          onClick={() => {
            onClose();
            onScan();
          }}
        />
      </ListGroup>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ tile */

/**
 * One group as a full-width strip.
 *
 * A two-up grid of tall tiles gave each group a tiny column to fit a name, a
 * head count, a code and a balance into — everything truncated and the second
 * column sat empty whenever the count was odd. Across the full width the same
 * facts line up in one scannable row: icon, who and where, balance.
 */
function GroupTile({ group, index, currency, onEdit, onDelete }) {
  const settled = Math.abs(group.net) < 0.005;
  const people = group.members.length;

  return (
    <Card tone={cycleTone(index)} pad={false} className="px-3.5 py-3">
      <div className="flex items-center gap-3">
        {/* The whole row navigates; the menu sits outside the link so its own
            taps do not follow it. */}
        <Link
          href={`/groups/${group.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 tap active:scale-[0.99]"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-white/70 text-[23px]">
            {group.emoji}
          </span>

          <span className="min-w-0 flex-1">
            <span className="newq text-ink block truncate text-[15.5px]">{group.name}</span>
            <span className="mt-0.5 flex min-w-0 items-center gap-2">
              <AvatarStack people={group.members} size="xs" max={3} />
              <span className="newq truncate text-[12px]">
                {people} {people === 1 ? 'person' : 'people'}
                {group.code ? ` · ${spaceCode(group.code)}` : ''}
              </span>
            </span>
          </span>

          <span className="shrink-0 pl-1 text-right">
            {settled ? (
              <Badge tone="onTone">Settled</Badge>
            ) : (
              <>
                {/* Ink, not pos/neg: green or red on a saturated pastel lands
                    at about 2:1 contrast. The caption carries the direction,
                    which is how the friend cards already read. */}
                <span className="num block text-[16px] text-ink">
                  {money(Math.abs(group.net), currency)}
                </span>
                <span className="newq block text-[11px]">
                  {group.net > 0 ? 'you are owed' : 'you owe'}
                </span>
              </>
            )}
          </span>
        </Link>

        <RowMenu
          title={group.name}
          subtitle={`${people} people · ${group.count} expenses`}
          editLabel="Edit group"
          deleteLabel="Delete group"
          className="-mr-1"
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ list */

function GroupsInner() {
  const { me, groups, people, expenses, settlements, currency, convert, deleteGroup } = useApp();
  const { toast } = useToast();
  const params = useSearchParams();

  /* `?join=1` opens an empty join sheet; `?join=<code>` is what a scanned QR
     hits, and opens it with the code already in. */
  const joinParam = params.get('join') || '';
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [joining, setJoining] = useState(!!joinParam);
  /** Opens the join sheet with the camera already running. */
  const [scanFirst, setScanFirst] = useState(params.get('scan') === '1');
  const [choosing, setChoosing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [q, setQ] = useState('');

  const all = useMemo(() => {
    return groups.map((g) => {
      const ledger = buildLedger(expenses, settlements, g.id, convert);
      const { net } = balancesFor(ledger, me.id);
      const members = g.memberIds.map((id) => people.find((p) => p.id === id)).filter(Boolean);
      const count = expenses.filter((e) => e.groupId === g.id).length;
      return { ...g, net, members, count };
    });
  }, [groups, expenses, settlements, people, me, convert]);

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

  const owedParts = splitAmount(totals.owed, currency);
  const oweParts = splitAmount(totals.owe, currency);

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
            {/* Mint, with both figures in ink. Green on mint is 2.1:1 and red
                on mint 3.1:1, both under AA — and they were already failing on
                the yellow this replaced. The captions carry the direction. */}
            <Card tone="mint" className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="newq text-[12px]  uppercase tracking-[0.07em] text-ink-3">
                  Across {groups.length} {groups.length === 1 ? 'circle' : 'circles'}
                </p>
                {/* Same hero treatment as the dashboard: the symbol keeps the
                    UI face, the digits take `small`. Both figures share the
                    face so the card reads as one thing; only the headline
                    figure is bold. */}
                <p className="num mt-1.5 truncate text-[30px] font-bold leading-none text-ink">
                  <span className="mr-1">{owedParts.symbol}</span>
                  <span className="small">
                    {owedParts.whole}
                    {owedParts.cents && <span className="text-ink-3">{owedParts.cents}</span>}
                  </span>
                </p>
                <p className="newq mt-1.5 text-[12.5px]">owed to you</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="num text-[19px] text-ink">
                  <span className="mr-0.5">{oweParts.symbol}</span>
                  <span className="small">
                    {oweParts.whole}
                    {oweParts.cents && <span className="text-ink-3">{oweParts.cents}</span>}
                  </span>
                </p>
                <p className="newq text-[12.5px]">you owe</p>
              </div>
            </Card>
            <FxNote className="mt-2" />
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
                    : 'Make one for your flat, a trip, or anyone you split with regularly — then share its room code.'
                }
                action={
                  q ? undefined : (
                    <div className="flex flex-col items-center gap-2.5">
                      <Button variant="dark" icon={Plus} onClick={() => setCreating(true)}>
                        New group
                      </Button>
                      <Button
                        variant="soft"
                        icon={KeyRound}
                        onClick={() => {
                          setScanFirst(false);
                          setJoining(true);
                        }}
                      >
                        Join with a code
                      </Button>
                      <Button
                        variant="ghost"
                        icon={QrCode}
                        onClick={() => {
                          setScanFirst(true);
                          setJoining(true);
                        }}
                      >
                        Scan a QR code
                      </Button>
                    </div>
                  )
                }
              />
            </Card>
          </motion.div>
        ) : (
          <div>
            <GroupLabel>Your circles</GroupLabel>
            <div className="space-y-2.5">
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
                Every circle has a room code. Share it and people walk straight in.
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
            <CoralFab icon={Plus} label="Add a group" onClick={() => setChoosing(true)} />
          </span>
        </div>
      </div>

      <StartSheet
        open={choosing}
        onClose={() => setChoosing(false)}
        onCreate={() => setCreating(true)}
        onJoin={() => {
          setScanFirst(false);
          setJoining(true);
        }}
        onScan={() => {
          setScanFirst(true);
          setJoining(true);
        }}
      />

      <CreateGroupSheet open={creating} onClose={() => setCreating(false)} />

      <JoinGroupSheet
        open={joining}
        onClose={() => {
          setJoining(false);
          setScanFirst(false);
        }}
        initialCode={joinParam === '1' ? '' : joinParam}
        scanOnOpen={scanFirst}
      />

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
