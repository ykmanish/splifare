'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  AtSign,
  Check,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  Plus,
  Receipt,
  ShoppingBasket,
  UserMinus,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { useUI } from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import { Badge, Card, EmptyState, RowMenu, cycleTone } from '@/components/ui/Bits';
import {
  ActionTiles,
  AvatarCluster,
  FieldRow,
  GroupLabel,
  IconCircle,
  ListGroup,
  PersonRow,
  SheetHeader,
} from '@/components/ui/Blocks';
import { ConfirmSheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { useApp } from '@/store/AppContext';
import { balanceBetween, isInvolved, shareOf } from '@/lib/balances';
import { canEditExpense } from '@/lib/permissions';
import FxNote from '@/components/ui/FxNote';
import { categoryOf } from '@/lib/categories';
import { money, firstName, relativeTime, dayLabel } from '@/lib/format';
import { handleOf } from '@/lib/username';

const EASE = [0.16, 1, 0.3, 1];
const enter = (i = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: EASE, delay: i * 0.04 },
});

/* ---------------------------------------------------------- page chrome */

function Header({ title, subtitle, right }) {
  return (
    <header className="sticky top-0 z-30 glass pt-safe">
      <div className="px-5 py-3">
        <SheetHeader
          title={title}
          subtitle={subtitle}
          left={<IconCircle icon={ChevronLeft} href="/friends" label="Back to friends" />}
          right={right}
        />
      </div>
    </header>
  );
}

/* ------------------------------------------------------- expense row */

function SharedExpenseRow({ expense, onDelete }) {
  const { me, personById, groups, currency } = useApp();
  const { editExpense } = useUI();

  const cat = categoryOf(expense.category);
  const Icon = expense.listId ? ShoppingBasket : cat.icon;
  const payer = personById(expense.paidBy?.[0]?.userId);
  const isMe = payer.id === me?.id;
  const { net } = shareOf(expense, me?.id);
  const group = groups.find((g) => g.id === expense.groupId);

  // One expense is exact in the currency it was recorded in — showing a €40
  // dinner under the viewer's ₹ symbol would misstate it outright.
  const own = expense.currency || currency;
  const mine = canEditExpense(expense, me?.id);

  const sub = [
    isMe
      ? `You paid ${money(expense.amount, own)}`
      : `${firstName(payer.name)} paid ${money(expense.amount, own)}`,
    group ? group.name : null,
    dayLabel(expense.date),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <FieldRow
      icon={Icon}
      iconTint={cat.tint}
      iconBg={`color-mix(in srgb, ${cat.tint} 13%, transparent)`}
      label={expense.description}
      sublabel={sub}
      trailing={
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="text-right">
            {Math.abs(net) < 0.005 ? (
              <span className="newq text-[12.5px]">not involved</span>
            ) : (
              <>
                <span
                  className={`num block text-[15px] 
                    ${net > 0 ? 'text-pos' : 'text-neg'}`}
                >
                  {money(Math.abs(net), own)}
                </span>
                <span className="newq block text-[11.5px]">{net > 0 ? 'you lent' : 'you owe'}</span>
              </>
            )}
          </span>

          {mine && (
            <RowMenu
              title={expense.description}
              subtitle={sub}
              editLabel="Edit expense"
              deleteLabel="Delete expense"
              onEdit={() => editExpense(expense)}
              onDelete={() => onDelete(expense)}
              className="-mr-1.5"
            />
          )}
        </span>
      }
    />
  );
}

/* ------------------------------------------------------------- page */

export default function FriendDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { openExpense, openSettle } = useUI();
  const { toast } = useToast();
  const {
    me,
    groups,
    expenses,
    settlements,
    ledger,
    currency,
    personById,
    people,
    deleteExpense,
    deleteSettlement,
    removeFriend,
  } = useApp();

  const [pendingExpense, setPendingExpense] = useState(null);
  const [pendingPayment, setPendingPayment] = useState(null);
  const [removing, setRemoving] = useState(false);

  const person = people.find((p) => p.id === id);

  const data = useMemo(() => {
    if (!person) return null;
    const shared = expenses.filter((e) => isInvolved(e, me.id) && isInvolved(e, person.id));
    const payments = settlements
      .filter(
        (s) =>
          (s.fromUserId === me.id && s.toUserId === person.id) ||
          (s.fromUserId === person.id && s.toUserId === me.id),
      )
      .slice(0, 6);
    const sharedGroups = groups.filter(
      (g) => g.memberIds.includes(me.id) && g.memberIds.includes(person.id),
    );

    const mutualIds = [
      ...new Set(sharedGroups.flatMap((g) => g.memberIds)),
    ].filter((uid) => uid !== me.id && uid !== person.id);
    const mutuals = mutualIds.map((uid) => personById(uid));

    return { shared, payments, sharedGroups, mutuals };
  }, [person, expenses, settlements, groups, me, personById]);

  async function confirmDeleteExpense() {
    const e = pendingExpense;
    if (!e) return;
    try {
      await deleteExpense(e.id);
      toast({ title: 'Expense deleted', description: e.description });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not delete it', description: err.message });
    }
  }

  async function confirmDeletePayment() {
    const s = pendingPayment;
    if (!s) return;
    try {
      await deleteSettlement(s.id);
      toast({ title: 'Payment deleted', description: 'Your balances have been updated.' });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not delete it', description: err.message });
    }
  }

  async function confirmRemoveFriend() {
    if (!person) return;
    try {
      await removeFriend(person.id);
      toast({ title: `${firstName(person.name)} removed` });
      router.push('/friends');
    } catch (err) {
      toast({ tone: 'error', title: 'Could not remove them', description: err.message });
    }
  }

  if (!person) {
    return (
      <>
        <Header title="Friend" />
        <main className="px-5 pb-32 pt-3">
          <Card tone="white" pad={false}>
            <EmptyState
              icon={UsersRound}
              title="Person not found"
              action={
                <Button href="/friends" variant="dark">
                  Back to friends
                </Button>
              }
            />
          </Card>
        </main>
      </>
    );
  }

  const balance = balanceBetween(ledger, me.id, person.id);
  const { shared, payments, sharedGroups, mutuals } = data;

  const settled = Math.abs(balance) < 0.005;
  const balanceCaption = settled
    ? 'You are all settled up'
    : balance > 0
      ? `${firstName(person.name)} owes you`
      : `You owe ${firstName(person.name)}`;

  const contact = [
    handleOf(person) && { id: 'username', icon: AtSign, label: handleOf(person) },
    person.email && { id: 'email', icon: Mail, label: person.email, href: `mailto:${person.email}` },
    person.phone && { id: 'phone', icon: Phone, label: person.phone, href: `tel:${person.phone}` },
  ].filter(Boolean);

  return (
    <>
      <Header
        title={person.name}
        right={
          <RowMenu
            title={person.name}
            subtitle="Manage this friend"
            deleteLabel="Remove friend"
            onDelete={() => setRemoving(true)}
          />
        }
      />

      <main className="px-5 pb-32 pt-3">
        <div className="space-y-7">
          {/* ------------------------------------------------------ hero */}
          <motion.section {...enter(0)}>
            <Card tone="lavender" pad={false} className="flex flex-col items-center px-5 py-7">
              <Avatar person={person} size="2xl" ring />

              <p className="newq  text-ink mt-4 text-[19px] leading-tight">{person.name}</p>

              <p className="num mt-3 text-[40px]  leading-none text-ink">
                {money(Math.abs(balance), currency)}
              </p>

              <span className="mt-3.5">
                <Badge
                  tone={settled ? 'onTone' : balance > 0 ? 'mint' : 'neg'}
                  icon={settled ? Check : undefined}
                >
                  {balanceCaption}
                </Badge>
              </span>
            </Card>
            <FxNote className="mt-2" />
          </motion.section>

          {/* --------------------------------------------------- actions */}
          <motion.div {...enter(1)}>
            <ActionTiles
              actions={[
                {
                  id: 'expense',
                  label: 'Add expense',
                  icon: Plus,
                  tone: 'dark',
                  onClick: () => openExpense({ withUserId: person.id }),
                },
                {
                  id: 'settle',
                  label: 'Settle up',
                  icon: Wallet,
                  tone: 'blue',
                  onClick: () => openSettle({ withUserId: person.id }),
                },
                {
                  id: 'remove',
                  label: 'Remove',
                  icon: UserMinus,
                  tone: 'neg',
                  onClick: () => setRemoving(true),
                },
              ]}
            />
          </motion.div>

          {/* --------------------------------------------------- contact */}
          {contact.length > 0 && (
            <motion.section {...enter(2)}>
              <GroupLabel>Contact</GroupLabel>
              <ListGroup tone="surface">
                {contact.map((c) => (
                  <FieldRow key={c.id} icon={c.icon} label={c.label} href={c.href} chevron={!!c.href} />
                ))}
              </ListGroup>
            </motion.section>
          )}

          {/* ---------------------------------------------- shared groups */}
          {sharedGroups.length > 0 && (
            <motion.section {...enter(3)}>
              <GroupLabel action={<span className="newq text-[12px]  uppercase tracking-[0.07em] text-ink-3 num">{sharedGroups.length}</span>}>
                Shared groups
              </GroupLabel>

              <div className="-mx-5 overflow-x-auto px-5 no-scrollbar">
                <div className="flex gap-3 pb-1">
                  {sharedGroups.map((g, i) => (
                    <Card
                      key={g.id}
                      as={Link}
                      href={`/groups/${g.id}`}
                      tone={cycleTone(i)}
                      pad={false}
                      className="block w-[138px] shrink-0 px-3 pb-4 pt-3.5 tap active:scale-[0.97]"
                    >
                      <span className="flex flex-col items-center">
                        <AvatarCluster
                          size={80}
                          people={g.memberIds.map((uid) => personById(uid))}
                        />
                        <span className="newq  text-ink mt-2.5 block w-full truncate text-center text-[13.5px]">
                          {g.emoji} {g.name}
                        </span>
                        <span className="newq block w-full truncate text-center text-[11.5px]">
                          {g.memberIds.length} people
                        </span>
                      </span>
                    </Card>
                  ))}
                </div>
              </div>
            </motion.section>
          )}

          {/* --------------------------------------------------- mutuals */}
          {mutuals.length > 0 && (
            <motion.section {...enter(4)}>
              <GroupLabel>People you both know</GroupLabel>
              <ListGroup tone="surface">
                {mutuals.map((p) => (
                  <PersonRow
                    key={p.id}
                    person={p}
                    href={`/friends/${p.id}`}
                    trailing={<ChevronRight size={18} strokeWidth={2.2} className="text-ink-3" />}
                  />
                ))}
              </ListGroup>
            </motion.section>
          )}

          {/* -------------------------------------------------- payments */}
          {payments.length > 0 && (
            <motion.section {...enter(5)}>
              <GroupLabel>Payments</GroupLabel>
              <ListGroup tone="surface">
                {payments.map((s) => {
                  const iPaid = s.fromUserId === me.id;
                  const from = personById(s.fromUserId);
                  const to = personById(s.toUserId);
                  return (
                    <FieldRow
                      key={s.id}
                      icon={Wallet}
                      iconTint="var(--brand)"
                      label={
                        <span className="inline-flex items-center gap-1.5">
                          {iPaid ? 'You' : firstName(from.name)}
                          <ArrowRight size={12} strokeWidth={2.4} className="text-ink-3" />
                          {iPaid ? firstName(to.name) : 'you'}
                        </span>
                      }
                      sublabel={`${relativeTime(s.date)}${s.note ? ` · ${s.note}` : ''}`}
                      value={money(s.amount, s.currency || currency)}
                      trailing={
                        <RowMenu
                          title="Payment"
                          subtitle={`${money(s.amount, s.currency || currency)} · ${relativeTime(s.date)}`}
                          deleteLabel="Delete payment"
                          onDelete={() => setPendingPayment(s)}
                          className="-mr-1.5"
                        />
                      }
                    />
                  );
                })}
              </ListGroup>
            </motion.section>
          )}

          {/* -------------------------------------------------- expenses */}
          <motion.section {...enter(6)}>
            <GroupLabel action={<span className="newq text-[12px]  uppercase tracking-[0.07em] text-ink-3 num">{shared.length}</span>}>
              Shared expenses
            </GroupLabel>

            {shared.length ? (
              <ListGroup tone="surface">
                {shared.map((e) => (
                  <SharedExpenseRow key={e.id} expense={e} onDelete={setPendingExpense} />
                ))}
              </ListGroup>
            ) : (
              <Card tone="white" pad={false}>
                <EmptyState
                  icon={Receipt}
                  title="Nothing shared yet"
                  body={`Add an expense with ${firstName(person.name)} to get started.`}
                  action={
                    <Button
                      variant="dark"
                      icon={Plus}
                      onClick={() => openExpense({ withUserId: person.id })}
                    >
                      Add expense
                    </Button>
                  }
                />
              </Card>
            )}
          </motion.section>
        </div>
      </main>

      <ConfirmSheet
        open={!!pendingExpense}
        onClose={() => setPendingExpense(null)}
        onConfirm={confirmDeleteExpense}
        title="Delete this expense?"
        body={
          pendingExpense
            ? `“${pendingExpense.description}” will be removed for everyone it was split with.`
            : ''
        }
        confirmLabel="Delete"
        danger
      />

      <ConfirmSheet
        open={!!pendingPayment}
        onClose={() => setPendingPayment(null)}
        onConfirm={confirmDeletePayment}
        title="Delete this payment?"
        body={
          pendingPayment
            ? `Reversing ${money(pendingPayment.amount, pendingPayment.currency || currency)} will change your balance with ${firstName(person.name)}.`
            : ''
        }
        confirmLabel="Delete"
        danger
      />

      <ConfirmSheet
        open={removing}
        onClose={() => setRemoving(false)}
        onConfirm={confirmRemoveFriend}
        title={`Remove ${firstName(person.name)}?`}
        body="They will be taken off your friends list. Shared expenses stay on record."
        confirmLabel="Remove"
        danger
      />
    </>
  );
}
