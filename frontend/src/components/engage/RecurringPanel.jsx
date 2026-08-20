'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarClock,
  Check,
  Pause,
  Play,
  Plus,
  Repeat,
  SkipForward,
  Trash2,
  Zap,
} from 'lucide-react';
import Sheet, { ConfirmSheet } from '@/components/ui/Sheet';
import Button from '@/components/ui/Button';
import Picker from '@/components/ui/Picker';
import Avatar from '@/components/ui/Avatar';
import { Input, Label } from '@/components/ui/Field';
import { Toggle } from '@/components/ui/Controls';
import { Badge, Card, EmptyState } from '@/components/ui/Bits';
import { api, normRecurring } from '@/lib/api';
import { FREQUENCY_LABEL, FREQUENCY_OPTIONS, dueLabel } from '@/lib/engage';
import { money, firstName } from '@/lib/format';
import { EXPENSE_CATEGORIES, categoryOf } from '@/lib/categories';
import { useToast } from '@/components/ui/Toast';

/**
 * Recurring bills.
 *
 * The schedule rows existed before this; what did not exist was anything that
 * posted them. A "monthly rent" that never reaches a balance is a note, and
 * the app already has notes. The server now materialises due bills into real
 * expenses on group open — this screen is the control surface for that, and
 * it is built around the two questions people actually have: *what is coming*,
 * and *did the last one go through*.
 *
 * `autoPost` off is deliberately kept as an option. Some bills vary month to
 * month — a phone bill, a shared taxi — and posting a guessed figure to
 * somebody's balance is worse than reminding them to enter the real one.
 */

const EASE = [0.16, 1, 0.3, 1];

function BillRow({ row, personById, currency, onEdit, onToggle, onSkip, busy }) {
  const cat = categoryOf(row.category);
  const overdue = row.active && new Date(row.nextDate) < new Date();
  const payer = personById(row.payerId);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE }}
      className={`rounded-[20px] px-4 py-3.5 ${row.active ? 'bg-surface' : 'bg-surface-2 opacity-70'}`}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[13px] bg-surface-2"
          style={{ color: cat.tint }}
        >
          <cat.icon size={16} strokeWidth={2.3} />
        </span>

        <button type="button" onClick={() => onEdit(row)} className="min-w-0 flex-1 text-left tap">
          <span className="flex items-baseline justify-between gap-3">
            <span className="newq truncate text-[14.5px] text-ink">{row.title}</span>
            <span className="num shrink-0 text-[14px] text-ink">
              {money(row.amount, row.currency)}
            </span>
          </span>

          <span className="newq mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-ink-3">
            <span>{FREQUENCY_LABEL[row.frequency] || row.frequency}</span>
            <span aria-hidden>·</span>
            <span className={overdue ? 'text-warn' : ''}>{dueLabel(row.nextDate)}</span>
            {payer && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <Avatar person={payer} size="xs" className="!size-4" />
                  {firstName(payer.name)} pays
                </span>
              </>
            )}
          </span>

          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            {row.active ? (
              row.autoPost ? (
                <Badge tone="brandSoft" icon={Zap}>
                  Posts itself
                </Badge>
              ) : (
                <Badge tone="warn" icon={CalendarClock}>
                  Reminder only
                </Badge>
              )
            ) : (
              <Badge tone="neutral" icon={Pause}>
                Paused
              </Badge>
            )}
            {row.postedCount > 0 && (
              <Badge tone="neutral">
                {row.postedCount} posted
              </Badge>
            )}
          </span>
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          size="xs"
          variant="soft"
          icon={row.active ? Pause : Play}
          disabled={busy}
          onClick={() => onToggle(row)}
        >
          {row.active ? 'Pause' : 'Resume'}
        </Button>
        {row.active && (
          <Button size="xs" variant="ghost" icon={SkipForward} disabled={busy} onClick={() => onSkip(row)}>
            Skip once
          </Button>
        )}
      </div>
    </motion.div>
  );
}

function BillSheet({ open, onClose, groupId, members, personById, currency, editing, onSaved, onDeleted }) {
  const { toast } = useToast();
  const blank = useMemo(
    () => ({
      title: '',
      amount: '',
      category: 'rent',
      frequency: 'monthly',
      nextDate: new Date().toISOString().slice(0, 10),
      autoPost: true,
      payerId: members[0]?.id || '',
      splitWith: members.map((m) => m.id),
    }),
    [members],
  );

  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [seeded, setSeeded] = useState(null);

  /* Seed once per opening. Deriving straight from `editing` on every render
     would overwrite whatever the user is halfway through typing. */
  if (open && seeded !== (editing?.id || 'new')) {
    setSeeded(editing?.id || 'new');
    setForm(
      editing
        ? {
            title: editing.title,
            amount: String(editing.amount || ''),
            category: editing.category,
            frequency: editing.frequency,
            nextDate: new Date(editing.nextDate).toISOString().slice(0, 10),
            autoPost: editing.autoPost,
            payerId: editing.payerId || members[0]?.id || '',
            splitWith: editing.splitWith?.length ? editing.splitWith : members.map((m) => m.id),
          }
        : blank,
    );
  }
  if (!open && seeded !== null) setSeeded(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  function toggleMember(memberId) {
    setForm((f) => {
      const has = f.splitWith.includes(memberId);
      /* Never let the split empty out — a bill split between nobody cannot
         be posted, and the server would silently widen it back to everyone. */
      if (has && f.splitWith.length === 1) return f;
      return {
        ...f,
        splitWith: has ? f.splitWith.filter((x) => x !== memberId) : [...f.splitWith, memberId],
      };
    });
  }

  async function save() {
    if (saving) return;
    if (!form.title.trim()) {
      toast({ tone: 'error', title: 'Name the bill' });
      return;
    }
    setSaving(true);
    const body = {
      title: form.title.trim(),
      amount: Number(form.amount) || 0,
      currency,
      category: form.category,
      frequency: form.frequency,
      nextDate: new Date(form.nextDate).toISOString(),
      autoPost: form.autoPost,
      payer: form.payerId,
      splitWith: form.splitWith,
    };
    try {
      const out = editing
        ? await api.updateRecurring(groupId, editing.id, body)
        : await api.createRecurring(groupId, body);
      onSaved(normRecurring(out.recurring), !editing);
      onClose();
      toast({
        title: editing ? 'Bill updated' : 'Recurring bill added',
        description: form.autoPost
          ? `Posts ${FREQUENCY_LABEL[form.frequency].toLowerCase()} from ${new Date(form.nextDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
          : 'You will be reminded rather than charged automatically.',
      });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not save', description: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await api.deleteRecurring(groupId, editing.id);
      onDeleted(editing.id);
      setConfirmDelete(false);
      onClose();
      toast({ title: 'Recurring bill removed' });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not remove', description: err.message });
    }
  }

  const perHead = form.splitWith.length
    ? (Number(form.amount) || 0) / form.splitWith.length
    : 0;

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={editing ? 'Edit recurring bill' : 'New recurring bill'}
        subtitle={editing ? editing.title : 'Rent, Wi-Fi, subscriptions, the maid'}
        footer={
          <Button size="lg" block loading={saving} onClick={save}>
            {editing ? 'Save changes' : 'Add bill'}
          </Button>
        }
      >
        <div className="space-y-4">
          <Input
            label="What is it"
            value={form.title}
            placeholder="Rent"
            onChange={(e) => set({ title: e.target.value })}
          />
          <Input
            label="Amount"
            inputMode="decimal"
            value={form.amount}
            placeholder="0"
            onChange={(e) => set({ amount: e.target.value })}
          />

          <Picker
            label="Category"
            value={form.category}
            onChange={(v) => set({ category: v })}
            options={EXPENSE_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
          />

          <Picker
            label="How often"
            value={form.frequency}
            onChange={(v) => set({ frequency: v })}
            options={FREQUENCY_OPTIONS}
          />

          <Input
            label="Next due"
            type="date"
            value={form.nextDate}
            onChange={(e) => set({ nextDate: e.target.value })}
          />

          <Picker
            label="Who pays it"
            value={form.payerId}
            onChange={(v) => set({ payerId: v })}
            options={members.map((m) => ({ value: m.id, label: m.name }))}
          />

          <div>
            <Label hint={`${form.splitWith.length} of ${members.length}`}>Split between</Label>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => {
                const on = form.splitWith.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMember(m.id)}
                    className={`flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 tap
                      ${on ? 'bg-brand text-on-brand' : 'bg-surface-2 text-ink-2'}`}
                  >
                    <Avatar person={m} size="xs" />
                    <span className="newq text-[12.5px]">{firstName(m.name)}</span>
                    {on && <Check size={12} strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
            {perHead > 0 && (
              <p className="newq mt-2 px-1 text-[12px] text-ink-3">
                {money(perHead, currency)} each
              </p>
            )}
          </div>

          <div className="rounded-[18px] bg-surface-2 px-4 py-3">
            <Toggle
              checked={form.autoPost}
              onChange={(v) => set({ autoPost: v })}
              label="Add it to the ledger automatically"
              description={
                form.autoPost
                  ? 'The bill posts itself on the due date and lands on everyone’s balance.'
                  : 'You will see it as due here, but nothing is added until someone enters it.'
              }
            />
          </div>

          {editing && (
            <Button
              block
              variant="ghost"
              icon={Trash2}
              className="text-neg"
              onClick={() => setConfirmDelete(true)}
            >
              Remove this bill
            </Button>
          )}
        </div>
      </Sheet>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Remove recurring bill?"
        body="The expenses it already posted stay on everyone's balance. Only the schedule goes."
        confirmLabel="Remove"
        danger
      />
    </>
  );
}

export default function RecurringPanel({
  groupId,
  rows,
  members,
  personById,
  currency,
  onChange,
  loading,
}) {
  const { toast } = useToast();
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const active = rows.filter((r) => r.active);
  const paused = rows.filter((r) => !r.active);
  const monthlyTotal = active
    .filter((r) => r.frequency === 'monthly')
    .reduce((a, r) => a + r.amount, 0);

  async function toggle(row) {
    setBusy(true);
    try {
      const { recurring } = await api.updateRecurring(groupId, row.id, { active: !row.active });
      onChange.updated(normRecurring(recurring));
    } catch (err) {
      toast({ tone: 'error', title: 'Could not update', description: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function skip(row) {
    setBusy(true);
    try {
      const { recurring } = await api.skipRecurring(groupId, row.id);
      const next = normRecurring(recurring);
      onChange.updated(next);
      toast({ title: 'Skipped once', description: `Next due ${dueLabel(next.nextDate).toLowerCase()}` });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not skip', description: err.message });
    } finally {
      setBusy(false);
    }
  }

  function open(row = null) {
    setEditing(row);
    setSheet(true);
  }

  return (
    <div className="space-y-4">
      {active.length > 0 && monthlyTotal > 0 && (
        <Card tone="mint" className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="newq text-[12px] uppercase tracking-[0.08em] text-ink-3">
              Every month
            </p>
            <p className="num mt-1 text-[26px] leading-none text-ink">
              {money(monthlyTotal, currency)}
            </p>
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-[16px] bg-surface text-ink">
            <Repeat size={19} strokeWidth={2.3} />
          </span>
        </Card>
      )}

      <Button block icon={Plus} onClick={() => open()}>
        Add a recurring bill
      </Button>

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-[104px] animate-pulse rounded-[20px] bg-surface-2" />
          ))}
        </div>
      ) : !rows.length ? (
        <Card tone="soft" pad={false}>
          <EmptyState
            icon={CalendarClock}
            title="No recurring bills"
            body="Rent, Wi-Fi, the maid, a subscription — set it once and it posts itself every cycle."
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {active.map((row) => (
            <BillRow
              key={row.id}
              row={row}
              personById={personById}
              currency={currency}
              busy={busy}
              onEdit={open}
              onToggle={toggle}
              onSkip={skip}
            />
          ))}

          {paused.length > 0 && (
            <>
              <p className="newq px-1 pt-2 text-[11.5px] uppercase tracking-[0.08em] text-ink-3">
                Paused
              </p>
              {paused.map((row) => (
                <BillRow
                  key={row.id}
                  row={row}
                  personById={personById}
                  currency={currency}
                  busy={busy}
                  onEdit={open}
                  onToggle={toggle}
                  onSkip={skip}
                />
              ))}
            </>
          )}
        </div>
      )}

      <BillSheet
        open={sheet}
        onClose={() => setSheet(false)}
        groupId={groupId}
        members={members}
        personById={personById}
        currency={currency}
        editing={editing}
        onSaved={(row, created) => (created ? onChange.added(row) : onChange.updated(row))}
        onDeleted={onChange.removed}
      />
    </div>
  );
}
