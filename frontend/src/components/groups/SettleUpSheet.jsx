'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, ArrowDownLeft, ArrowUpRight, Scale, Wallet } from 'lucide-react';
import { motion } from 'framer-motion';
import Sheet from '@/components/ui/Sheet';
import StatusSheet from '@/components/ui/StatusSheet';
import Button from '@/components/ui/Button';
import { AmountInput, Input } from '@/components/ui/Field';
import Picker from '@/components/ui/Picker';
import { ActionTiles, GroupLabel, IconCircle, ListGroup, SheetHeader, StatusPill } from '@/components/ui/Blocks';
import Avatar from '@/components/ui/Avatar';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui/Toast';
import { buildLedger, balanceBetween } from '@/lib/balances';
import { money, firstName } from '@/lib/format';

/** Section entrance — restrained, staggered by index. */
function Section({ i = 0, className = '', children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: i * 0.04 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function SettleUpSheet({ open, onClose, prefill = {} }) {
  const { me, people, friends, groups, expenses, settlements, currency, settleUp } = useApp();
  const { toast } = useToast();

  const [withId, setWithId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [direction, setDirection] = useState('pay'); // pay | receive
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  /* 'processing' | 'success' | null — the sheet stays open behind it. */
  const [status, setStatus] = useState(null);
  const [recorded, setRecorded] = useState(null);

  /**
   * Friends, plus anyone you already share an expense with. The second half
   * matters: leaving a group or unfriending must not strand a real balance
   * with nobody to pay it to.
   */
  const others = useMemo(() => {
    const shared = new Set();
    for (const e of expenses) {
      const ids = [...e.paidBy, ...e.splits].map((r) => r.userId);
      if (ids.includes(me?.id)) ids.forEach((uid) => shared.add(uid));
    }

    const seen = new Set([me?.id]);
    return [...friends, ...people].filter((p) => {
      if (seen.has(p.id)) return false;
      if (!p.isFriend && !shared.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [people, friends, expenses, me]);

  /* Balance for the chosen scope, so we can suggest the right amount. */
  const scopedLedger = useMemo(
    () => buildLedger(expenses, settlements, groupId || undefined),
    [expenses, settlements, groupId],
  );
  const balance = withId && me ? balanceBetween(scopedLedger, me.id, withId) : 0;

  // React's "adjust state when a prop changes" pattern, as in AddExpenseSheet.
  // Seeding during render on the closed → open edge avoids the extra commit
  // (and the one stale painted frame) a reset effect would cause.
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);

    if (open) {
      setTouched(false);
      setStatus(null);
      setRecorded(null);

      const target = prefill.withUserId || '';
      const g = prefill.groupId || '';
      setWithId(target);
      setGroupId(g);
      setNote('');

      if (target && me) {
        const led = buildLedger(expenses, settlements, g || undefined);
        const bal = balanceBetween(led, me.id, target);
        setDirection(bal < 0 ? 'pay' : 'receive');
        setAmount(Math.abs(bal) > 0.005 ? String(Math.abs(bal)) : '');
      } else {
        setDirection('pay');
        setAmount('');
      }
    }
  }

  /* Re-suggest whenever the person or scope changes. */
  const onPick = (id) => {
    setWithId(id);
    if (!id || !me) return;
    const bal = balanceBetween(scopedLedger, me.id, id);
    setDirection(bal < 0 ? 'pay' : 'receive');
    setAmount(Math.abs(bal) > 0.005 ? String(Math.abs(bal)) : '');
  };

  const onScope = (g) => {
    setGroupId(g);
    if (!withId || !me) return;
    const led = buildLedger(expenses, settlements, g || undefined);
    const bal = balanceBetween(led, me.id, withId);
    setDirection(bal < 0 ? 'pay' : 'receive');
    setAmount(Math.abs(bal) > 0.005 ? String(Math.abs(bal)) : '');
  };

  const other = people.find((p) => p.id === withId);
  const total = Number(amount) || 0;
  const canSave = !!withId && total > 0;

  async function onSubmit(e) {
    e?.preventDefault();
    setTouched(true);
    if (!canSave || busy) return;

    setBusy(true);
    setStatus('processing');
    try {
      await settleUp({
        fromUserId: direction === 'pay' ? me.id : withId,
        toUserId: direction === 'pay' ? withId : me.id,
        amount: total,
        groupId: groupId || null,
        note: note.trim(),
      });
      setRecorded({
        body:
          direction === 'pay'
            ? `You paid ${firstName(other.name)} ${money(total, currency)}.`
            : `${firstName(other.name)} paid you ${money(total, currency)}.`,
      });
      setStatus('success');
    } catch (err) {
      setStatus(null);
      toast({ tone: 'error', title: 'Could not record it', description: err.message });
    } finally {
      setBusy(false);
    }
  }

  const from = direction === 'pay' ? me : other;
  const to = direction === 'pay' ? other : me;
  const nameOf = (p) => (p?.id === me?.id ? 'You' : firstName(p?.name));

  return (
    <>
      {/* Rendered before the Sheet on purpose: both lock body scroll, and they
          unlock in tree order — the status layer must release first so the
          Sheet's own restore is the one that lands. */}
      <StatusSheet
        state={status}
        processingTitle="Recording payment…"
        processingBody="Saving it against your balance"
        successTitle="Payment recorded"
        successBody={recorded?.body || 'Your balance is up to date.'}
        actionLabel="Done"
        onClose={() => {
          setStatus(null);
          onClose();
        }}
      />

      <Sheet
        open={open}
        onClose={onClose}
        footer={
          <Button size="lg" block onClick={onSubmit} loading={busy} icon={Wallet}>
            Record payment
          </Button>
        }
      >
        <form onSubmit={onSubmit} className="space-y-6">
          {/* ------------------------------------------------ header */}
          <Section i={0}>
            <SheetHeader
              title="Record a payment"
              subtitle="Log cash or a transfer that already happened"
            />
          </Section>

          {/* ------------------------------------------------ person */}
          <Section i={1}>
            <Picker
              label="With"
              title="Who are you settling with?"
              placeholder="Choose a person…"
              searchable={others.length > 6}
              value={withId}
              onChange={onPick}
              options={others.map((p) => ({
                value: p.id,
                label: p.name,
                sublabel: p.email,
              }))}
            />
          </Section>

          {/* `other` is looked up in `people`; a prefilled id can point at a
              group member who is not in the friend list, so guard on it —
              the block below reads `other.name` unconditionally. */}
          {withId && other && (
            <>
              {/* -------------------------------------------- from → to */}
              <Section i={2}>
                <div className="rounded-[20px] bg-surface-2 px-5 py-6">
                  <div className="flex items-center justify-center gap-4">
                    <div className="flex min-w-0 flex-col items-center gap-2.5">
                      <Avatar person={from} size="2xl" />
                      <span className="newq  text-ink max-w-[9ch] truncate text-[13.5px]">
                        {nameOf(from)}
                      </span>
                    </div>

                    <div className="mb-7">
                      <IconCircle
                        icon={ArrowRight}
                        tone="dark"
                        size="lg"
                        label="Swap direction"
                        onClick={() => setDirection((d) => (d === 'pay' ? 'receive' : 'pay'))}
                      />
                    </div>

                    <div className="flex min-w-0 flex-col items-center gap-2.5">
                      <Avatar person={to} size="2xl" />
                      <span className="newq  text-ink max-w-[9ch] truncate text-[13.5px]">{nameOf(to)}</span>
                    </div>
                  </div>

                  <p className="newq mt-4 text-center text-[12.5px]">
                    Tap the arrow to flip who paid whom
                  </p>
                </div>
              </Section>

              {/* -------------------------------------------- amount */}
              <Section i={3}>
                <AmountInput
                  label="Amount handed over"
                  value={amount}
                  onChange={setAmount}
                  currency={currency}
                  error={touched && total <= 0 ? 'Enter an amount' : ''}
                />
              </Section>

              {/* -------------------------------------------- direction */}
              <Section i={4}>
                <GroupLabel>Direction</GroupLabel>
                <ActionTiles
                  actions={[
                    {
                      id: 'pay',
                      label: `You paid ${firstName(other.name)}`,
                      icon: ArrowUpRight,
                      tone: direction === 'pay' ? 'dark' : 'neutral',
                      onClick: () => setDirection('pay'),
                    },
                    {
                      id: 'receive',
                      label: `${firstName(other.name)} paid you`,
                      icon: ArrowDownLeft,
                      tone: direction === 'receive' ? 'dark' : 'neutral',
                      onClick: () => setDirection('receive'),
                    },
                  ]}
                />
              </Section>

              {/* -------------------------------------------- balance hint */}
              {Math.abs(balance) > 0.005 && (
                <Section i={5}>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                    onClick={() => setAmount(String(Math.abs(balance)))}
                    className="block w-full tap"
                  >
                    <StatusPill tone="blue" icon={Scale}>
                      {balance < 0
                        ? `You owe ${firstName(other.name)} `
                        : `${firstName(other.name)} owes you `}
                      <span className="num">{money(Math.abs(balance), currency)}</span>
                      {groupId ? ' in this group' : ' in total'} · tap to use
                    </StatusPill>
                  </motion.button>
                </Section>
              )}

              {/* -------------------------------------------- scope + note */}
              <Section i={6}>
                <GroupLabel action={<span className="newq text-[12px]">optional</span>}>
                  Details
                </GroupLabel>
                <ListGroup>
                  <div className="px-4 py-3.5">
                    <Picker
                      label="Applies to"
                      title="Scope this payment"
                      placeholder="Everything between you"
                      clearable
                      clearLabel="Everything between you"
                      value={groupId}
                      onChange={onScope}
                      options={groups
                        .filter((g) => g.memberIds.includes(withId))
                        .map((g) => ({ value: g.id, label: g.name, emoji: g.emoji }))}
                    />
                  </div>

                  <div className="px-4 py-3.5">
                    <Input
                      label="Note"
                      placeholder="UPI, cash, bank transfer…"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>
                </ListGroup>
              </Section>
            </>
          )}

          <button type="submit" className="hidden" aria-hidden />
        </form>
      </Sheet>
    </>
  );
}
