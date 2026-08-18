'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  Plus,
  Receipt,
  ShoppingBasket,
  Trash2,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { useUI } from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import Sheet, { ConfirmSheet } from '@/components/ui/Sheet';
import { Input, Label } from '@/components/ui/Field';
import Avatar from '@/components/ui/Avatar';
import {
  Segmented,
  EmptyState,
  Badge,
  Card,
  SumRow,
  RowMenu,
  cycleTone,
} from '@/components/ui/Bits';
import {
  ActionTiles,
  AvatarCluster,
  FieldRow,
  GroupLabel,
  IconCircle,
  ListGroup,
  PersonRow,
  SheetHeader,
  StatusPill,
} from '@/components/ui/Blocks';
import CodeBox from '@/components/ui/CodeBox';
import MemberSheet from '@/components/groups/MemberSheet';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui/Toast';
import { buildLedger, balancesFor, netByMember, simplify, shareOf } from '@/lib/balances';
import { money, firstName, dayLabel } from '@/lib/format';
import { categoryOf, GROUP_EMOJIS } from '@/lib/categories';

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

/* FieldRow wants an icon *component*; emoji tiles get a cached stand-in so the
   identity stays stable across renders. Keyed by the character itself, so a
   changed emoji always yields a different component. */
const EMOJI_ICONS = new Map();
function emojiIcon(char) {
  if (!EMOJI_ICONS.has(char)) {
    const C = () => <span className="text-[16px] leading-none">{char}</span>;
    C.displayName = `Emoji(${char})`;
    EMOJI_ICONS.set(char, C);
  }
  return EMOJI_ICONS.get(char);
}

/* ------------------------------------------------------------- expenses */

function ExpenseRow({ expense, me, currency, personById, onEdit, onDelete }) {
  const cat = categoryOf(expense.category);
  const Icon = expense.listId ? ShoppingBasket : cat.icon;
  const payer = personById(expense.paidBy?.[0]?.userId);
  const isMe = payer.id === me?.id;
  const { net } = shareOf(expense, me?.id);

  const sub = isMe
    ? `You paid ${money(expense.amount, currency)}`
    : `${firstName(payer.name)} paid ${money(expense.amount, currency)}`;

  return (
    <div className="flex items-center">
      <FieldRow
        className="min-w-0 flex-1"
        icon={Icon}
        iconTint={cat.tint}
        iconBg={`color-mix(in srgb, ${cat.tint} 13%, transparent)`}
        label={expense.description}
        sublabel={sub}
        onClick={onEdit}
        trailing={
          Math.abs(net) < 0.005 ? (
            <span className="newq shrink-0 text-[12px]">not involved</span>
          ) : (
            <span className="shrink-0 text-right">
              <span
                className={`num block text-[15px]  ${net > 0 ? 'text-pos' : 'text-neg'}`}
              >
                {money(Math.abs(net), currency)}
              </span>
              <span className="newq block text-[11px]">{net > 0 ? 'you lent' : 'you owe'}</span>
            </span>
          )
        }
      />

      <div className="pr-3">
        <RowMenu
          title={expense.description}
          subtitle={sub}
          editLabel="Edit expense"
          deleteLabel="Delete expense"
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function GroupDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { openExpense, openSettle, editExpense } = useUI();
  const {
    me,
    friends,
    groups,
    expenses,
    settlements,
    lists,
    currency,
    updateGroup,
    deleteGroup,
    leaveGroup,
    rotateGroupCode,
    deleteExpense,
    deleteList,
    personById,
  } = useApp();

  const [tab, setTab] = useState('expenses');
  const [managing, setManaging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [viewingMember, setViewingMember] = useState(null);
  const [deletingExpense, setDeletingExpense] = useState(null);
  const [deletingList, setDeletingList] = useState(null);

  /* Drafts for the name/emoji edit inside the settings sheet. */
  const [nameDraft, setNameDraft] = useState('');
  const [emojiDraft, setEmojiDraft] = useState('🏠');
  const [savingMeta, setSavingMeta] = useState(false);

  const group = groups.find((g) => g.id === id);

  const data = useMemo(() => {
    if (!group) return null;
    const ledger = buildLedger(expenses, settlements, group.id);
    const mine = balancesFor(ledger, me.id);
    const nets = netByMember(ledger, group.memberIds);
    const transfers = simplify(nets);
    const groupExpenses = expenses.filter((e) => e.groupId === group.id);
    const total = groupExpenses.reduce((a, e) => a + e.amount, 0);
    return { ledger, mine, nets, transfers, groupExpenses, total };
  }, [group, expenses, settlements, me]);

  if (!group) {
    return (
      <div className="pt-safe">
        <main className="px-5 pb-32 pt-3">
          <SheetHeader
            className="mb-6"
            left={<IconCircle icon={ChevronLeft} href="/groups" label="Back to groups" />}
            title="Group"
          />
          <Card tone="blushSoft" pad={false}>
            <EmptyState
              icon={Receipt}
              title="Group not found"
              body="It may have been deleted."
              action={<Button href="/groups">Back to groups</Button>}
            />
          </Card>
        </main>
      </div>
    );
  }

  const members = group.memberIds.map((m) => personById(m));

  /* Two separate lists, because the two actions are not alike: tapping a
     member opens their card, tapping a friend adds them. Showing both in one
     toggle list is what made a stray tap remove somebody. */
  const otherMembers = members.filter((p) => p && p.id !== me.id);

  const memberIdSet = new Set(group.memberIds);
  const addableFriends = friends.filter((p) => p && !memberIdSet.has(p.id));

  const groupLists = lists.filter((l) => l.groupId === group.id);
  const { mine, nets, transfers, groupExpenses, total } = data;
  const settled = Math.abs(mine.net) < 0.005;
  const netTone = mine.net > 0.005 ? 'text-pos' : mine.net < -0.005 ? 'text-neg' : 'text-ink';

  const byDay = groupExpenses.reduce((acc, e) => {
    const key = dayLabel(e.date);
    (acc[key] = acc[key] || []).push(e);
    return acc;
  }, {});

  /* Seed the drafts on open so the sheet never shows stale values. */
  function openSettings() {
    setNameDraft(group.name);
    setEmojiDraft(group.emoji);
    setManaging(true);
  }

  /* "Done" doubles as save — it only calls the store when something changed. */
  async function saveSettings() {
    if (savingMeta) return;
    const clean = nameDraft.trim();
    const changed = clean.length >= 2 && (clean !== group.name || emojiDraft !== group.emoji);
    if (!changed) {
      setManaging(false);
      return;
    }
    setSavingMeta(true);
    try {
      await updateGroup(group.id, { name: clean, emoji: emojiDraft });
      toast({ title: 'Group updated', description: clean });
      setManaging(false);
    } catch (err) {
      toast({ tone: 'error', title: 'Could not save the group', description: err.message });
    } finally {
      setSavingMeta(false);
    }
  }

  async function addMember(person) {
    if (group.memberIds.includes(person.id)) return;
    try {
      await updateGroup(group.id, { memberIds: [...group.memberIds, person.id] });
      toast({ title: `${firstName(person.name)} added`, description: `They can add expenses in ${group.name}.` });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not add them', description: err.message });
    }
  }

  /* Throws on failure so MemberSheet keeps its own sheet open on error. */
  async function removeMember(person) {
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

  async function onRotateCode() {
    if (rotating) return;
    setRotating(true);
    try {
      await rotateGroupCode(group.id);
      toast({ title: 'New room code', description: 'The old one stops working right away.' });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not change the code', description: err.message });
    } finally {
      setRotating(false);
    }
  }

  async function onLeaveGroup() {
    try {
      await leaveGroup(group.id);
      toast({ tone: 'info', title: `You left ${group.name}`, description: 'Your balance here stays on record.' });
      router.push('/groups');
    } catch (err) {
      toast({ tone: 'error', title: 'Could not leave the group', description: err.message });
    }
  }

  async function onDeleteGroup() {
    try {
      await deleteGroup(group.id);
      toast({ tone: 'info', title: 'Group deleted', description: group.name });
      router.push('/groups');
    } catch (err) {
      toast({ tone: 'error', title: 'Could not delete the group', description: err.message });
    }
  }

  async function onDeleteExpense() {
    if (!deletingExpense) return;
    const doomed = deletingExpense;
    try {
      await deleteExpense(doomed.id);
      toast({ tone: 'info', title: 'Expense deleted', description: doomed.description });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not delete the expense', description: err.message });
    }
  }

  async function onDeleteList() {
    if (!deletingList) return;
    const doomed = deletingList;
    try {
      await deleteList(doomed.id);
      toast({ tone: 'info', title: 'List deleted', description: doomed.name });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not delete the list', description: err.message });
    }
  }

  return (
    <div className="pt-safe">
      <main className="px-5 pb-32 pt-3">
        {/* ------------------------------------------------------ header */}
        <SheetHeader
          className="mb-7"
          left={<IconCircle icon={ChevronLeft} href="/groups" label="Back to groups" />}
          title={group.name}
          subtitle={`${members.length} members · ${money(total, currency)} tracked`}
          right={
            <RowMenu
              title={group.name}
              subtitle={`${members.length} members · ${groupExpenses.length} expenses`}
              editLabel="Group settings"
              deleteLabel="Delete group"
              className="!size-10 bg-surface-2 !text-ink"
              onEdit={openSettings}
              onDelete={() => setConfirmDelete(true)}
              extra={
                <button
                  type="button"
                  onClick={() => setConfirmLeave(true)}
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left
                    text-ink tap hover:bg-surface-2 active:scale-[0.985]"
                >
                  <DoorOpen size={19} strokeWidth={2.1} />
                  <span className="newq text-ink text-[15px]">Leave group</span>
                </button>
              }
            />
          }
        />

        <div className="space-y-7">
          {/* ------------------------------------------------------ hero */}
          <Section>
            <Card tone="lavender" className="flex flex-col items-center px-5 py-7">
              <AvatarCluster people={members} size={126} />

              <p className="newq  text-ink mt-4 text-center text-[19px] leading-tight">{group.name}</p>

              <p className="newq text-[12px] font-bold small uppercase tracking-[0.07em] text-ink-3 mt-4">Your balance here</p>
              <p className={`num mt-1.5 text-[38px]  leading-none ${netTone}`}>
                {money(Math.abs(mine.net), currency)}
              </p>

              {settled ? (
                <StatusPill tone="pos" icon={Check} className="mt-4 w-full">
                  Everyone here is square
                </StatusPill>
              ) : (
                <p className="newq mt-2 text-[13px]">
                  {mine.net > 0 ? 'you are owed' : 'you owe'}
                </p>
              )}
            </Card>
          </Section>

          {/* ------------------------------------------------- room code */}
          <Section delay={0.02}>
            <CodeBox
              code={group.code}
              label="Room code"
              hint="Share it and they can join without a friend request"
              shareTitle={`Join ${group.name} on Splitta`}
              shareText={`Join ${group.name} on Splitta — the room code is ${group.code}`}
            />
          </Section>

          {/* --------------------------------------------------- actions */}
          <Section delay={0.04}>
            <ActionTiles
              actions={[
                {
                  id: 'add',
                  label: 'Add expense',
                  icon: Plus,
                  tone: 'blue',
                  onClick: () => openExpense({ groupId: group.id }),
                },
                {
                  id: 'settle',
                  label: 'Settle up',
                  icon: Wallet,
                  tone: 'dark',
                  onClick: () => openSettle({ groupId: group.id }),
                },
                {
                  id: 'members',
                  label: 'Members',
                  icon: Users,
                  tone: 'neutral',
                  onClick: openSettings,
                },
              ]}
            />
          </Section>

          {/* ----------------------------------------------------- lists */}
          {groupLists.length > 0 && (
            <Section delay={0.08}>
              <GroupLabel
                action={
                  <Button variant="ghost" size="xs" href="/lists">
                    All
                  </Button>
                }
              >
                Shopping lists
              </GroupLabel>
              <Card tone="skySoft" pad={false} className="divide-y divide-line">
                {groupLists.map((l) => (
                  <FieldRow
                    key={l.id}
                    icon={emojiIcon(l.emoji)}
                    label={l.name}
                    sublabel={`${l.items.filter((i) => i.checked).length}/${l.items.length} picked`}
                    href={l.status === 'shopping' ? `/lists/${l.id}/shop` : `/lists/${l.id}`}
                    trailing={
                      <span className="flex shrink-0 items-center gap-1.5">
                        {l.status === 'shopping' ? (
                          <Badge tone="brandSoft">Live</Badge>
                        ) : l.status === 'completed' ? (
                          <Badge tone="mint">Done</Badge>
                        ) : null}
                        <RowMenu
                          title={l.name}
                          subtitle={`${l.items.length} items`}
                          editLabel="Open list"
                          deleteLabel="Delete list"
                          className="-mr-1.5"
                          onEdit={() => router.push(`/lists/${l.id}`)}
                          onDelete={() => setDeletingList(l)}
                        />
                      </span>
                    }
                  />
                ))}
              </Card>
            </Section>
          )}

          {/* ------------------------------------------------------ tabs */}
          <Section delay={0.12}>
            <Segmented
              options={[
                { id: 'expenses', label: `Expenses (${groupExpenses.length})` },
                { id: 'balances', label: 'Balances' },
              ]}
              value={tab}
              onChange={setTab}
              className="mb-5"
            />

            {tab === 'expenses' ? (
              groupExpenses.length ? (
                <div className="space-y-5">
                  {Object.entries(byDay).map(([day, items]) => (
                    <div key={day}>
                      <GroupLabel>{day}</GroupLabel>
                      <ListGroup>
                        {items.map((e) => (
                          <ExpenseRow
                            key={e.id}
                            expense={e}
                            me={me}
                            currency={currency}
                            personById={personById}
                            onEdit={() => editExpense(e)}
                            onDelete={() => setDeletingExpense(e)}
                          />
                        ))}
                      </ListGroup>
                    </div>
                  ))}
                </div>
              ) : (
                <Card tone="lavenderSoft" pad={false}>
                  <EmptyState
                    icon={Receipt}
                    title="No expenses in this group"
                    body="Add the first one to start tracking who owes what."
                    action={
                      <Button
                        variant="dark"
                        icon={Plus}
                        onClick={() => openExpense({ groupId: group.id })}
                      >
                        Add expense
                      </Button>
                    }
                  />
                </Card>
              )
            ) : (
              <div className="space-y-7">
                {/* -------------------------------------- per member */}
                <div>
                  <GroupLabel>Where everyone stands</GroupLabel>
                  <div className="space-y-2.5">
                    {members.map((p, i) => {
                      const n = nets[p.id] || 0;
                      const square = Math.abs(n) < 0.005;
                      return (
                        <motion.div
                          key={p.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, ease: EASE, delay: Math.min(i, 8) * 0.04 }}
                        >
                          <Card tone={cycleTone(i)} pad={false} className="px-4 py-1">
                            <SumRow
                              avatar={<Avatar person={p} size="sm" />}
                              label={p.id === me.id ? 'You' : p.name}
                              value={square ? 'settled' : money(Math.abs(n), currency)}
                              tone={square ? 'muted' : n > 0 ? 'pos' : 'neg'}
                              strong={!square}
                              hint={square ? undefined : n > 0 ? 'is owed' : 'owes the group'}
                            />
                          </Card>
                        </motion.div>
                      );
                    })}

                    <Card tone="butter" pad={false} className="px-4 py-1">
                      <SumRow
                        label="Total tracked"
                        value={money(total, currency)}
                        strong
                        hint={`${groupExpenses.length} expenses`}
                      />
                    </Card>
                  </div>
                </div>

                {/* ------------------------------------- simplified */}
                <div>
                  <GroupLabel>Simplest way to settle</GroupLabel>
                  {transfers.length === 0 ? (
                    <StatusPill tone="pos" icon={Check}>
                      Nothing to settle — everyone is square
                    </StatusPill>
                  ) : (
                    <ListGroup>
                      {transfers.map((t, i) => {
                        const from = personById(t.from);
                        const to = personById(t.to);
                        const involvesMe = t.from === me.id || t.to === me.id;
                        return (
                          <FieldRow
                            key={`${t.from}-${t.to}-${i}`}
                            icon={ArrowRight}
                            iconTint={involvesMe ? 'var(--brand)' : undefined}
                            iconBg={involvesMe ? 'var(--sky)' : undefined}
                            label={`${t.from === me.id ? 'You' : firstName(from.name)} → ${
                              t.to === me.id ? 'you' : firstName(to.name)
                            }`}
                            sublabel="settles the balance"
                            value={money(t.amount, currency)}
                            trailing={
                              involvesMe ? (
                                <Button
                                  variant="dark"
                                  size="xs"
                                  className="shrink-0"
                                  onClick={() =>
                                    openSettle({
                                      withUserId: t.from === me.id ? t.to : t.from,
                                      groupId: group.id,
                                    })
                                  }
                                >
                                  Settle
                                </Button>
                              ) : null
                            }
                          />
                        );
                      })}
                    </ListGroup>
                  )}
                </div>
              </div>
            )}
          </Section>
        </div>
      </main>

      {/* --------------------------------------------------------- manage */}
      <Sheet
        open={managing}
        onClose={() => setManaging(false)}
        title="Group settings"
        subtitle={group.name}
        footer={
          <Button
            size="lg"
            block
            loading={savingMeta}
            disabled={nameDraft.trim().length < 2}
            onClick={saveSettings}
          >
            Done
          </Button>
        }
      >
        <div className="space-y-6">
          <div className="flex gap-3">
            <div className="shrink-0">
              <Label>Icon</Label>
              <div className="grid size-13 place-items-center rounded-[16px] bg-surface-2 text-2xl">
                {emojiDraft}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <Input
                label="Group name"
                value={nameDraft}
                placeholder="Flat 402"
                onChange={(e) => setNameDraft(e.target.value)}
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
                    transition={SPRING}
                    onClick={() => setEmojiDraft(e)}
                    aria-pressed={emojiDraft === e}
                    className={`grid size-11 shrink-0 place-items-center rounded-[14px] text-xl tap
                      ${emojiDraft === e ? 'bg-sky' : 'bg-surface-2 hover:bg-surface-3'}`}
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
              code={group.code}
              label="Anyone with this can join"
              hint="Rotate it if it ends up somewhere it should not be"
              shareTitle={`Join ${group.name} on Splitta`}
              shareText={`Join ${group.name} on Splitta — the room code is ${group.code}`}
              onRotate={onRotateCode}
              rotating={rotating}
            />
          </div>

          <div>
            <Label hint={`${group.memberIds.length} in this group`}>Members</Label>
            <ListGroup>
              <PersonRow
                person={me}
                name="You"
                sublabel="Tap for your balance here"
                onClick={() => setViewingMember(me)}
                trailing={<ChevronRight size={18} strokeWidth={2.2} className="shrink-0 text-ink-3" />}
              />

              {otherMembers.map((p) => {
                const n = nets[p.id] || 0;
                return (
                  <PersonRow
                    key={p.id}
                    person={p}
                    sublabel={
                      Math.abs(n) < 0.005
                        ? 'settled up'
                        : `${n > 0 ? 'is owed' : 'owes'} ${money(Math.abs(n), currency)}`
                    }
                    onClick={() => setViewingMember(p)}
                    trailing={
                      <ChevronRight size={18} strokeWidth={2.2} className="shrink-0 text-ink-3" />
                    }
                  />
                );
              })}
            </ListGroup>
            <p className="newq mt-2.5 px-1.5 text-[12px]">
              Tap anyone to see their balance, or to remove them.
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

          <div>
            <GroupLabel>Leaving</GroupLabel>
            <Card tone="skySoft" pad={false}>
              <FieldRow
                icon={DoorOpen}
                iconTint="var(--info)"
                iconBg="var(--sky)"
                label="Leave this group"
                sublabel="The group carries on without you"
                onClick={() => {
                  setManaging(false);
                  setConfirmLeave(true);
                }}
              />
            </Card>
          </div>

          <div>
            <GroupLabel>Danger zone</GroupLabel>
            <Card tone="blushSoft" pad={false}>
              <FieldRow
                icon={Trash2}
                iconBg="var(--blush)"
                label="Delete this group"
                sublabel={`Removes it and its ${groupExpenses.length} expenses`}
                danger
                onClick={() => {
                  setManaging(false);
                  setConfirmDelete(true);
                }}
              />
            </Card>
          </div>
        </div>
      </Sheet>

      <MemberSheet
        open={!!viewingMember}
        onClose={() => setViewingMember(null)}
        person={viewingMember}
        groupName={group.name}
        balance={viewingMember ? (viewingMember.id === me.id ? mine.net : nets[viewingMember.id] || 0) : null}
        currency={currency}
        isYou={viewingMember?.id === me.id}
        isMember={!!viewingMember && group.memberIds.includes(viewingMember.id)}
        onRemove={removeMember}
        onLeave={() => setConfirmLeave(true)}
      />

      <ConfirmSheet
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title={`Leave ${group.name}?`}
        body={
          settled
            ? 'You come off the member list. The expenses you were part of stay on record for everyone else.'
            : `You still have ${money(Math.abs(mine.net), currency)} ${
                mine.net > 0 ? 'owed to you' : 'to pay'
              } here. Leaving does not clear it — settle up first if you want it closed.`
        }
        confirmLabel="Leave group"
        danger
        onConfirm={onLeaveGroup}
      />

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${group.name}?`}
        body={`Its ${groupExpenses.length} expenses will be removed and balances recalculated. This cannot be undone.`}
        confirmLabel="Delete group"
        danger
        onConfirm={onDeleteGroup}
      />

      <ConfirmSheet
        open={!!deletingExpense}
        onClose={() => setDeletingExpense(null)}
        title="Delete this expense?"
        body={
          deletingExpense
            ? `${deletingExpense.description} · ${money(deletingExpense.amount, currency)} will be removed and balances recalculated.`
            : undefined
        }
        confirmLabel="Delete expense"
        danger
        onConfirm={onDeleteExpense}
      />

      <ConfirmSheet
        open={!!deletingList}
        onClose={() => setDeletingList(null)}
        title="Delete this list?"
        body={
          deletingList
            ? `${deletingList.name} and its ${deletingList.items.length} items will be removed. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete list"
        danger
        onConfirm={onDeleteList}
      />
    </div>
  );
}
