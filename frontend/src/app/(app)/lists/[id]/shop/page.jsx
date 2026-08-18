'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Check,
  ShoppingBasket,
  Store,
  ReceiptText,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import Page from '@/components/layout/Page';
import Button from '@/components/ui/Button';
import Sheet, { ConfirmSheet } from '@/components/ui/Sheet';
import StatusSheet from '@/components/ui/StatusSheet';
import { Input, Label } from '@/components/ui/Field';
import Picker from '@/components/ui/Picker';
import { Stepper } from '@/components/ui/Controls';
import Avatar, { AvatarStack, PersonChip } from '@/components/ui/Avatar';
import { Card, cycleTone, EmptyState, Progress, RowMenu, SumRow } from '@/components/ui/Bits';
import { GroupLabel, ListGroup, SheetHeader, StatusPill } from '@/components/ui/Blocks';
import AssignSheet from '@/components/lists/AssignSheet';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui/Toast';
import { GROCERY_AISLES, UNITS } from '@/lib/categories';
import { haptics } from '@/lib/haptics';
import { allocate, splitsFromItems } from '@/lib/split';
import { money, symbolOf, firstName } from '@/lib/format';

const EASE = [0.16, 1, 0.3, 1];
const SPRING = { type: 'spring', damping: 26, stiffness: 320 };

const rise = (i = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: EASE, delay: i * 0.04 },
});

export default function ShopModePage() {
  const { id } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const {
    me,
    lists,
    groups,
    currency,
    personById,
    updateItem,
    deleteItem,
    checkoutList,
  } = useApp();

  const [assigning, setAssigning] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [status, setStatus] = useState(null);
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState('');
  const priceRefs = useRef({});

  const list = lists.find((l) => l.id === id);

  const stats = useMemo(() => {
    if (!list) return null;
    const picked = list.items.filter((i) => i.checked);
    const priced = picked.filter((i) => Number(i.price) > 0);
    const spent = picked.reduce((a, i) => a + (Number(i.price) || 0), 0);
    return {
      picked,
      priced,
      spent,
      pct: list.items.length ? (picked.length / list.items.length) * 100 : 0,
      budgetPct: list.budget ? (spent / list.budget) * 100 : null,
      left: list.budget ? Math.max(0, list.budget - spent) : null,
      over: list.budget ? spent > list.budget : false,
    };
  }, [list]);

  const grouped = useMemo(() => {
    if (!list) return [];
    const byAisle = {};
    for (const item of list.items) (byAisle[item.aisle] = byAisle[item.aisle] || []).push(item);
    return GROCERY_AISLES.filter((a) => byAisle[a.id]?.length).map((a) => ({
      aisle: a,
      // unticked first so the trolley run stays in order
      items: [...byAisle[a.id]].sort((x, y) => Number(x.checked) - Number(y.checked)),
    }));
  }, [list]);

  if (!list) {
    return (
      <Page title="Shopping" back="/lists">
        <EmptyState
          icon={ShoppingBasket}
          title="List not found"
          body="This list may have been deleted by someone else on it."
          action={
            <Button href="/lists" variant="dark">
              Back to lists
            </Button>
          }
        />
      </Page>
    );
  }

  const members = list.memberIds.map((m) => personById(m));

  function toggle(item) {
    const next = !item.checked;
    updateItem(list.id, item.id, { checked: next });
    if (next) setTimeout(() => priceRefs.current[item.id]?.focus(), 60);
  }

  function setPrice(item, raw) {
    const v = raw.replace(/[^\d.]/g, '');
    if ((v.match(/\./g) || []).length > 1) return;
    updateItem(list.id, item.id, { price: v === '' ? null : Number(v) });
  }

  async function onCheckout(opts) {
    setCheckingOut(false);
    setStatus('processing');
    try {
      const expense = await checkoutList(list.id, opts);
      // Checkout is an expense being recorded, so it gets the same beat.
      haptics.success();
      setResult({ amount: expense.amount, people: expense.splits.length });
      setStatus('success');
    } catch (err) {
      haptics.error();
      setFailure(err.message);
      setStatus('error');
      toast({ tone: 'error', title: 'Could not check out', description: err.message });
    }
  }

  return (
    <Page title="Shopping" back={`/lists/${list.id}`} padded={false}>
      {/* ---------------------------------------------------- sticky summary */}
      {/* butter = money; flips to blush the moment the trolley goes over budget */}
      <div className="sticky top-16 z-20 glass px-5 pb-3 pt-2">
        <Card tone={stats.over ? 'blush' : 'butter'} pad={false} className="px-4 pb-4 pt-3.5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-[16px] bg-white/70 text-[22px]">
              {list.emoji}
            </span>

            <div className="min-w-0 flex-1">
              <p className="newq  text-ink truncate text-[16px]">{list.name}</p>
              <p className="newq truncate text-[12.5px]">
                <Store size={11} className="mr-1 inline align-[-1px]" />
                {list.store || 'Shopping now'}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p
                className="newq  text-ink num text-[27px] leading-none"
                style={stats.over ? { color: 'var(--neg)' } : undefined}
              >
                {money(stats.spent, currency)}
              </p>
              <p className="newq mt-1.5 text-[11.5px]">
                {list.budget
                  ? `of ${money(list.budget, currency)}`
                  : `${stats.picked.length}/${list.items.length} picked`}
              </p>
            </div>
          </div>

          <Progress
            className="mt-3.5"
            value={stats.budgetPct ?? stats.pct}
            tone={stats.over ? 'neg' : 'dark'}
          />

          <div className="mt-2.5 flex items-center justify-between gap-3">
            <span className="newq text-[12px]">
              {stats.picked.length} of {list.items.length} in the trolley
            </span>
            {!stats.over && stats.left !== null && (
              <span className="num text-[12px] text-ink">{money(stats.left, currency)} left</span>
            )}
          </div>
        </Card>

        {stats.over && (
          <StatusPill tone="neg" icon={TriangleAlert} className="mt-2">
            {money(stats.spent - list.budget, currency)} over budget
          </StatusPill>
        )}
      </div>

      {/* ---------------------------------------------------- items */}
      <div className="space-y-6 px-5 pb-44 pt-3">
        {list.items.length === 0 ? (
          <EmptyState
            icon={ShoppingBasket}
            title="Nothing to shop for"
            body="Add items to the list first, then come back and tick them off as they go in the trolley."
            action={
              <Button href={`/lists/${list.id}`} variant="dark">
                Back to the list
              </Button>
            }
          />
        ) : (
          grouped.map(({ aisle, items }, gi) => {
            const AisleIcon = aisle.icon;
            const done = items.filter((i) => i.checked).length;

            return (
            <motion.section key={aisle.id} {...rise(gi)}>
              {/* pastel aisle strip — rotated so consecutive aisles never repeat */}
              <Card
                tone={cycleTone(gi)}
                pad={false}
                className="mb-2 flex items-center gap-2.5 px-3.5 py-2.5"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70">
                  <AisleIcon size={15} strokeWidth={2.2} style={{ color: aisle.tint }} />
                </span>
                <span className="newq  text-ink min-w-0 flex-1 truncate text-[13.5px]">{aisle.label}</span>
                <span className="num shrink-0 text-[12px] text-ink">
                  {done}/{items.length}
                </span>
              </Card>

              <ListGroup>
                {items.map((item) => {
                  // Mirror splitsFromItems: an empty splitWith means everyone on the list.
                  const ids = item.splitWith?.length ? item.splitWith : list.memberIds;
                  const who = ids.map((w) => personById(w));
                  const everyone = ids.length === list.memberIds.length;
                  // Same remainder-aware maths as the checkout, so the two never disagree.
                  const each = who.length
                    ? allocate(Number(item.price) || 0, who.map(() => 1))[0]
                    : 0;
                  const whoLabel = everyone
                    ? 'Everyone'
                    : who.length === 1
                      ? who[0].id === me.id
                        ? 'Only you'
                        : `Only ${firstName(who[0].name)}`
                      : `${who.length} people`;

                  return (
                    <div key={item.id} className={`tap ${item.checked ? 'bg-mint-soft' : ''}`}>
                      <div className="flex items-center gap-3.5 px-4 pb-2 pt-3.5">
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          transition={SPRING}
                          onClick={() => toggle(item)}
                          aria-pressed={item.checked}
                          aria-label={`${item.checked ? 'Un-tick' : 'Tick'} ${item.name}`}
                          className={`grid size-9 shrink-0 place-items-center rounded-full tap
                            ${item.checked ? 'bg-panel text-on-panel' : 'bg-surface-2 text-ink-3'}`}
                        >
                          {item.checked && <Check size={18} strokeWidth={3.2} />}
                        </motion.button>

                        <button onClick={() => toggle(item)} className="min-w-0 flex-1 text-left">
                          <span
                            className={`newq  text-ink block truncate text-[15px] ${
                              item.checked ? 'line-through' : ''
                            }`}
                            style={item.checked ? { color: 'var(--text-3)' } : undefined}
                          >
                            {item.name}
                          </span>
                          <span className="newq block truncate text-[12.5px]">
                            {item.qty} {item.unit}
                            {item.note ? ` · ${item.note}` : ''}
                          </span>
                        </button>

                        <div className="relative w-[92px] shrink-0">
                          <span className="num pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12.5px] text-ink-3">
                            {symbolOf(currency)}
                          </span>
                          <input
                            ref={(el) => {
                              priceRefs.current[item.id] = el;
                            }}
                            inputMode="decimal"
                            value={item.price ?? ''}
                            onChange={(e) => setPrice(item, e.target.value)}
                            onFocus={() => {
                              if (!item.checked) updateItem(list.id, item.id, { checked: true });
                            }}
                            placeholder="0"
                            aria-label={`Price for ${item.name}`}
                            className="num h-10 w-full rounded-[14px] bg-surface-2 pl-6 pr-3
                              text-right text-[15px] text-ink outline-none tap
                              placeholder:text-ink-3/50 focus:bg-surface-3"
                          />
                        </div>
                      </div>

                      {/* who it is for · their share · row actions */}
                      <div className="flex items-center gap-2 pb-2.5 pl-[66px] pr-2">
                        <button
                          onClick={() => setAssigning(item)}
                          aria-label={`Change who ${item.name} is for`}
                          className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left tap
                            active:scale-[0.98]"
                        >
                          <AvatarStack people={who} size="xs" max={4} />
                          <span className="newq truncate text-[11.5px]">{whoLabel}</span>
                          {Number(item.price) > 0 && (
                            <span className="num shrink-0 text-[11.5px] text-ink-3">
                              · {money(each, currency)} each
                            </span>
                          )}
                        </button>

                        <RowMenu
                          title={item.name}
                          subtitle={`${item.qty} ${item.unit} · ${aisle.label}`}
                          editLabel="Edit item"
                          deleteLabel="Remove from list"
                          onEdit={() => setEditing(item)}
                          onDelete={() => setDeleting(item)}
                        />
                      </div>
                    </div>
                  );
                })}
              </ListGroup>
            </motion.section>
            );
          })
        )}
      </div>

      {/* ------------------------------------------------- floating checkout */}
      {/* fixed inside the phone column — never wrapped in an animated transform */}
      <div
        className="phone fixed inset-x-0 z-40 px-5"
        style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom))' }}
      >
        <Card tone="panel" pad={false} className="flex items-center gap-3 p-3 pl-5">
          <div className="min-w-0 flex-1">
            <p className="newq text-[11.5px]" style={{ color: 'var(--on-panel-2)' }}>
              {stats.priced.length} priced
            </p>
            <p
              className="newq  text-ink num text-[20px] leading-tight"
              style={{ color: 'var(--on-panel)' }}
            >
              {money(stats.spent, currency)}
            </p>
          </div>
          <Button
            size="md"
            variant="white"
            icon={ReceiptText}
            onClick={() => setCheckingOut(true)}
            disabled={!stats.priced.length}
          >
            Checkout
          </Button>
        </Card>
      </div>

      {/* ---------------------------------------------------- sheets */}
      <AssignSheet
        open={!!assigning}
        onClose={() => setAssigning(null)}
        item={assigning}
        members={members}
        meId={me.id}
        currency={currency}
        onChange={(next) => {
          updateItem(list.id, assigning.id, { splitWith: next });
          setAssigning((a) => ({ ...a, splitWith: next }));
        }}
      />

      <ItemEditSheet
        open={!!editing}
        item={editing}
        onClose={() => setEditing(null)}
        onSave={(patch) => {
          try {
            updateItem(list.id, editing.id, patch);
            setEditing(null);
          } catch (err) {
            toast({ tone: 'error', title: 'Could not save the item', description: err.message });
          }
        }}
      />

      <ConfirmSheet
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={deleting ? `Remove ${deleting.name}?` : 'Remove item?'}
        body="It comes off the list for everyone shopping. Anything already checked out stays."
        confirmLabel="Remove item"
        danger
        onConfirm={async () => {
          const item = deleting;
          if (!item) return;
          try {
            await deleteItem(list.id, item.id);
          } catch (err) {
            toast({ tone: 'error', title: 'Could not remove it', description: err.message });
          }
        }}
      />

      <CheckoutSheet
        open={checkingOut}
        onClose={() => setCheckingOut(false)}
        list={list}
        members={members}
        groups={groups}
        meId={me.id}
        currency={currency}
        personById={personById}
        onConfirm={onCheckout}
      />

      <StatusSheet
        state={status}
        processingTitle="Splitting the bill…"
        processingBody="Working out who owes what"
        successTitle="Split complete!"
        successBody={
          result
            ? `${money(result.amount, currency)} split between ${result.people} ${
                result.people === 1 ? 'person' : 'people'
              }.`
            : 'The shop is now an expense.'
        }
        errorTitle="Could not check out"
        errorBody={failure || 'Give it another go in a moment.'}
        actionLabel={status === 'error' ? 'Try again' : 'See the list'}
        onClose={() => {
          if (status === 'error') {
            setStatus(null);
            setCheckingOut(true);
            return;
          }
          setStatus(null);
          router.push(`/lists/${list.id}`);
        }}
      />
    </Page>
  );
}

/* ------------------------------------------------------------------ edit */

function ItemEditSheet({ open, item, onClose, onSave }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('pcs');
  const [aisle, setAisle] = useState('pantry');
  const [note, setNote] = useState('');
  const seeded = useRef(null);

  useEffect(() => {
    if (!open) {
      seeded.current = null;
      return;
    }
    if (!item || seeded.current === item.id) return;
    seeded.current = item.id;
    setName(item.name || '');
    setQty(Number(item.qty) || 1);
    setUnit(item.unit || 'pcs');
    setAisle(item.aisle || 'pantry');
    setNote(item.note || '');
  }, [open, item]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit item"
      subtitle="Rename it, change the amount or move it to another aisle"
      footer={
        <Button
          size="md"
          block
          disabled={!name.trim()}
          onClick={() =>
            onSave({
              name: name.trim(),
              qty: Number(qty) || 1,
              unit,
              aisle,
              note: note.trim(),
            })
          }
        >
          Save changes
        </Button>
      }
    >
      <div className="space-y-5">
        <Input label="Item" value={name} onChange={(e) => setName(e.target.value)} />

        <div>
          <Label>How much?</Label>
          <div className="flex items-center gap-3">
            <Stepper value={qty} onChange={setQty} min={1} max={999} label="quantity" />
            <div className="min-w-0 flex-1">
              <Picker
                title="Unit"
                placeholder="Unit"
                value={unit}
                onChange={setUnit}
                options={UNITS.map((u) => ({ value: u, label: u }))}
              />
            </div>
          </div>
        </div>

        <Picker
          label="Aisle"
          title="Which aisle?"
          value={aisle}
          onChange={setAisle}
          options={GROCERY_AISLES.map((a) => ({
            value: a.id,
            label: a.label,
            icon: a.icon,
            tint: a.tint,
          }))}
        />

        <Input
          label="Note"
          hint="optional"
          placeholder="Brand, size, anything else"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ checkout */

function CheckoutSheet({
  open,
  onClose,
  list,
  members,
  groups,
  meId,
  currency,
  personById,
  onConfirm,
}) {
  const [payer, setPayer] = useState(meId);
  const [description, setDescription] = useState(list.name);
  const [groupId, setGroupId] = useState(list.groupId || '');

  const priced = list.items.filter((i) => i.checked && Number(i.price) > 0);
  const { total, splits } = splitsFromItems(priced, list.memberIds);
  const skipped = list.items.filter((i) => i.checked && !(Number(i.price) > 0)).length;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      footer={
        <Button
          size="md"
          block
          icon={ReceiptText}
          onClick={() =>
            onConfirm({ payer, description: description.trim(), groupId: groupId || null })
          }
          disabled={!priced.length}
        >
          Create expense
        </Button>
      }
    >
      <div className="space-y-6">
        <SheetHeader
          title="Check out"
          subtitle={`${priced.length} priced ${priced.length === 1 ? 'item' : 'items'}`}
        />

        {/* butter = the money block */}
        <Card tone="butter" className="text-center">
          <p className="newq text-[12px]  uppercase tracking-[0.07em] text-ink-3">Basket total</p>
          <p className="newq  text-ink num mt-1 text-[34px] leading-none">{money(total, currency)}</p>
          <p className="newq mt-1.5 text-[12.5px]">
            across {splits.length} {splits.length === 1 ? 'person' : 'people'}
          </p>
        </Card>

        <Input
          label="Expense name"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div>
          <GroupLabel>Who paid at the till?</GroupLabel>
          <div className="-mx-5 overflow-x-auto px-5 no-scrollbar">
            <div className="flex gap-2 pb-1">
              {members.map((p) => (
                <PersonChip
                  key={p.id}
                  person={p}
                  you={p.id === meId}
                  selected={p.id === payer}
                  onClick={() => setPayer(p.id)}
                />
              ))}
            </div>
          </div>
        </div>

        <Picker
          label="Add to group"
          hint="optional"
          title="Attach to a group"
          placeholder="No group"
          clearable
          clearLabel="No group"
          value={groupId}
          onChange={setGroupId}
          options={groups.map((g) => ({ value: g.id, label: g.name, emoji: g.emoji }))}
        />

        {/* per-person preview — reads like a bill */}
        <div>
          <GroupLabel>Everyone pays</GroupLabel>
          <div className="space-y-2">
            {splits
              .slice()
              .sort((a, b) => b.amount - a.amount)
              .map((s, idx) => {
                const p = personById(s.userId);
                const items = priced.filter((i) => (i.splitWith || []).includes(s.userId));
                return (
                  <Card key={s.userId} tone={cycleTone(idx)} pad={false} className="px-4">
                    <SumRow
                      avatar={<Avatar person={p} size="sm" />}
                      label={s.userId === meId ? 'You' : p.name}
                      value={money(s.amount, currency)}
                      hint={`${items.length} ${items.length === 1 ? 'item' : 'items'}${
                        s.userId === payer ? ' · paid' : ''
                      }`}
                    />
                  </Card>
                );
              })}

            <Card
              tone="panel"
              pad={false}
              className="flex items-center justify-between gap-4 px-4 py-3.5"
            >
              <span className="newq text-[13.5px]" style={{ color: 'var(--on-panel-2)' }}>
                Total
              </span>
              <span
                className="num text-[16px] "
                style={{ color: 'var(--on-panel)' }}
              >
                {money(total, currency)}
              </span>
            </Card>
          </div>
        </div>

        {skipped > 0 && (
          <StatusPill tone="neg" icon={TriangleAlert}>
            {skipped} ticked {skipped === 1 ? 'item has' : 'items have'} no price
          </StatusPill>
        )}

        <p className="newq flex items-center gap-1.5 text-[12px]">
          <Undo2 size={12} />
          The list stays saved — you can reopen it afterwards.
        </p>
      </div>
    </Sheet>
  );
}
