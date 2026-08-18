'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, X } from 'lucide-react';
import Sheet, { ConfirmSheet } from '@/components/ui/Sheet';
import StatusSheet from '@/components/ui/StatusSheet';
import Button from '@/components/ui/Button';
import { GroupLabel, IconCircle, ListGroup, SheetHeader } from '@/components/ui/Blocks';
import { AmountInput, Input, Textarea } from '@/components/ui/Field';
import Picker from '@/components/ui/Picker';
import DatePicker from '@/components/ui/DatePicker';
import { PersonChip } from '@/components/ui/Avatar';
import CategoryPicker from './CategoryPicker';
import SplitEditor from './SplitEditor';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui/Toast';
import { computeSplits, defaultValuesFor } from '@/lib/split';
import { firstName } from '@/lib/format';

const EASE = [0.16, 1, 0.3, 1];

/** Staggered entrance for each block of the form. */
function Section({ i = 0, className = '', children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay: i * 0.04 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Small grey caption on the right of a GroupLabel. */
function Hint({ children }) {
  return <span className="newq text-[12px]">{children}</span>;
}

/**
 * Everything the form holds for one opening of the sheet. Pure, so it can be
 * computed during render when `open` flips rather than in an effect.
 */
function initialForm({ editing, prefill, groups, me }) {
  if (editing) {
    const mode = ['equal', 'exact', 'percent', 'shares'].includes(editing.splitMode)
      ? editing.splitMode
      : 'exact';
    const ids = editing.splits.map((s) => s.userId);

    return {
      amount: String(editing.amount),
      description: editing.description,
      category: editing.category,
      groupId: editing.groupId || '',
      payerId: editing.paidBy?.[0]?.userId || me?.id,
      selectedIds: ids,
      mode,
      values:
        mode === 'exact'
          ? Object.fromEntries(editing.splits.map((s) => [s.userId, s.amount]))
          : defaultValuesFor(mode, editing.amount, ids),
      date: editing.date,
      notes: editing.notes || '',
      itemized: (editing.items || []).length > 0,
      items: (editing.items || []).length
        ? editing.items.map((item) => ({
            id: item.id || crypto.randomUUID(),
            name: item.name || '',
            price: item.price ? String(item.price) : '',
          }))
        : [{ id: crypto.randomUUID(), name: '', price: '' }],
    };
  }

  const groupId = prefill.groupId || '';
  const group = groups.find((x) => x.id === groupId);
  const selectedIds = group
    ? [...group.memberIds]
    : prefill.withUserId
      ? [me?.id, prefill.withUserId]
      : [me?.id];

  return {
    amount: prefill.amount ? String(prefill.amount) : '',
    description: prefill.description || '',
    category: prefill.category || 'other',
    groupId,
    payerId: prefill.payerId || me?.id,
    selectedIds,
    mode: 'equal',
    values: {},
    date: new Date().toISOString(),
    notes: '',
    itemized: false,
    items: [{ id: crypto.randomUUID(), name: '', price: '' }],
  };
}

export default function AddExpenseSheet({ open, onClose, prefill = {}, editing = null }) {
  const { me, people, groups, currency, addExpense, updateExpense, deleteExpense } = useApp();
  const { toast } = useToast();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [groupId, setGroupId] = useState('');
  const [payerId, setPayerId] = useState(me?.id);
  const [selectedIds, setSelectedIds] = useState([]);
  const [mode, setMode] = useState('equal');
  const [values, setValues] = useState({});
  const [date, setDate] = useState(() => new Date().toISOString());
  const [notes, setNotes] = useState('');
  const [itemized, setItemized] = useState(false);
  const [items, setItems] = useState([{ id: 'initial', name: '', price: '' }]);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState(null);
  const [saved, setSaved] = useState({ title: '', body: '' });

  /* -------------------------------------------------- pool of people */

  const pool = useMemo(() => {
    if (groupId) {
      const g = groups.find((x) => x.id === groupId);
      return g ? g.memberIds.map((id) => people.find((p) => p.id === id)).filter(Boolean) : [];
    }
    return people;
  }, [groupId, groups, people]);

  /* -------------------------------------------------- open / reset */

  // React's "adjust state when a prop changes" pattern. Seeding the form
  // during render on the closed → open edge avoids the extra commit (and the
  // one stale painted frame) that resetting inside an effect would cause.
  // Starts false so mounting already-open still seeds the form, as the
  // previous mount-time effect did.
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);

    if (open) {
      const f = initialForm({ editing, prefill, groups, me });
      setAmount(f.amount);
      setDescription(f.description);
      setCategory(f.category);
      setGroupId(f.groupId);
      setPayerId(f.payerId);
      setSelectedIds(f.selectedIds);
      setMode(f.mode);
      setValues(f.values);
      setDate(f.date);
      setNotes(f.notes);
      setItemized(f.itemized);
      setItems(f.items);
      setTouched(false);
      setConfirmDelete(false);
    }
  }

  /* -------------------------------------------------- success flash */

  useEffect(() => {
    if (status !== 'success') return;
    const t = setTimeout(() => setStatus(null), 1500);
    return () => clearTimeout(t);
  }, [status]);

  /* -------------------------------------------------- reactions */

  const onGroupChange = (id) => {
    setGroupId(id);
    const g = groups.find((x) => x.id === id);
    const next = g ? [...g.memberIds] : [me.id];
    setSelectedIds(next);
    setValues(mode === 'equal' ? {} : defaultValuesFor(mode, Number(amount) || 0, next));
    if (g && !g.memberIds.includes(payerId)) setPayerId(me.id);
  };

  const onModeChange = (m) => {
    setMode(m);
    setValues(defaultValuesFor(m, Number(amount) || 0, selectedIds));
  };

  const togglePerson = (id) => {
    if (id === '__all__') {
      const next = selectedIds.length === pool.length ? [me.id] : pool.map((p) => p.id);
      setSelectedIds(next);
      if (mode !== 'equal') setValues(defaultValuesFor(mode, Number(amount) || 0, next));
      return;
    }
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    if (!next.length) return;
    setSelectedIds(next);
    if (mode !== 'equal') setValues(defaultValuesFor(mode, Number(amount) || 0, next));
  };

  /* -------------------------------------------------- validation */

  const itemRows = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        name: item.name.trim(),
        price: Number(item.price) || 0,
      })),
    [items],
  );
  const validItems = itemRows.filter((item) => item.name && item.price > 0);
  const itemTotal = Number(validItems.reduce((sum, item) => sum + item.price, 0).toFixed(2));
  const total = itemized ? itemTotal : Number(amount) || 0;
  const split = computeSplits(total, selectedIds, mode, values);

  const errors = {
    amount: total <= 0 ? 'Enter an amount' : '',
    description: !description.trim() ? 'Give it a name' : '',
    items:
      itemized && !validItems.length
        ? 'Add at least one item with a name and price'
        : itemized && validItems.length !== itemRows.filter((item) => item.name || item.price > 0).length
          ? 'Complete or remove unfinished items'
          : '',
    split: !split.valid ? split.message || 'Check the split' : '',
  };
  const canSave = !errors.amount && !errors.description && !errors.items && !errors.split;

  const updateItem = (id, patch) => {
    setItems((rows) => rows.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addItem = () => {
    setItems((rows) => [...rows, { id: crypto.randomUUID(), name: '', price: '' }]);
  };

  const removeItem = (id) => {
    setItems((rows) =>
      rows.length === 1
        ? [{ id: crypto.randomUUID(), name: '', price: '' }]
        : rows.filter((item) => item.id !== id),
    );
  };

  const toggleItemized = () => {
    setItemized((next) => {
      const enabled = !next;
      if (enabled && items.length === 1 && !items[0].name && !items[0].price && description) {
        setItems([{ id: items[0].id, name: description, price: amount }]);
      }
      if (!enabled && itemTotal > 0) setAmount(String(itemTotal));
      return enabled;
    });
  };

  /* -------------------------------------------------- submit */

  async function onSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (!canSave || busy) return;

    const payload = {
      groupId: groupId || null,
      description: description.trim(),
      amount: total,
      category,
      paidBy: [{ userId: payerId, amount: total }],
      splits: split.splits,
      splitMode: itemized ? 'items' : mode,
      date: new Date(date).toISOString(),
      notes: notes.trim(),
      items: itemized ? validItems.map(({ name, price }) => ({ name, price })) : [],
    };

    setBusy(true);
    try {
      if (editing) {
        await updateExpense(editing.id, payload);
        setSaved({ title: 'Changes saved', body: payload.description });
      } else {
        await addExpense(payload);
        const others = split.splits.length - 1;
        setSaved({
          title: 'Expense added',
          body:
            others > 0
              ? `${payload.description} split with ${others} ${others === 1 ? 'other' : 'others'}.`
              : payload.description,
        });
      }
      setStatus('success');
      onClose();
    } catch (err) {
      toast({ tone: 'error', title: 'Could not save', description: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await deleteExpense(editing.id);
      toast({ tone: 'info', title: 'Expense deleted', description: editing.description });
      onClose();
    } catch (err) {
      toast({ tone: 'error', title: 'Could not delete', description: err.message });
    } finally {
      setBusy(false);
    }
  }

  const payer = people.find((p) => p.id === payerId);

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        size="lg"
        footer={
          <div className="flex gap-2.5">
            <Button variant="soft" size="md" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              size="md"
              onClick={onSubmit}
              loading={busy}
              className="flex-[2]"
              disabled={touched && !canSave}
            >
              {editing ? 'Save changes' : 'Add expense'}
            </Button>
          </div>
        }
      >
        <form onSubmit={onSubmit} className="space-y-6">
          <SheetHeader
            title={editing ? 'Edit expense' : 'Add an expense'}
            subtitle={
              groupId
                ? groups.find((g) => g.id === groupId)?.name
                : 'Splitting with the people you pick below'
            }
            right={
              editing ? (
                <IconCircle
                  icon={Trash2}
                  tone="neg"
                  label="Delete expense"
                  onClick={() => setConfirmDelete(true)}
                />
              ) : null
            }
          />

          {/* -------------------------------------------------- amount */}
          <Section i={0}>
            {itemized ? (
              <div>
                <p className="newq mb-2 px-1.5 text-[12px] uppercase tracking-[0.07em] text-ink-3">
                  Total from items
                </p>
                <div
                  className={`rounded-[18px] px-5 py-7 text-center transition-colors ${
                    touched && errors.amount ? 'bg-blush' : 'bg-surface-2'
                  }`}
                >
                  <p className="num text-[48px] font-medium leading-none text-ink">
                    {new Intl.NumberFormat('en-IN', {
                      style: 'currency',
                      currency,
                      maximumFractionDigits: 2,
                    }).format(total)}
                  </p>
                  <p className="newq mt-2 text-[12.5px] text-ink-3">
                    {validItems.length} {validItems.length === 1 ? 'priced item' : 'priced items'}
                  </p>
                </div>
                {touched && errors.amount && (
                  <p className="mt-2 px-1.5 text-center text-[12.5px] font-medium text-neg">
                    {errors.amount}
                  </p>
                )}
              </div>
            ) : (
              <AmountInput
                label={editing ? 'Total on this expense' : 'How much was it?'}
                value={amount}
                onChange={(v) => {
                  setAmount(v);
                  if (mode !== 'equal' && mode !== 'shares') {
                    setValues(defaultValuesFor(mode, Number(v) || 0, selectedIds));
                  }
                }}
                currency={currency}
                autoFocus
                error={touched ? errors.amount : ''}
              />
            )}
          </Section>

          {/* -------------------------------------------------- details */}
          <Section i={1}>
            <ListGroup>
              <div className="px-4 py-3.5">
                <GroupLabel>What was it for?</GroupLabel>
                <Input
                  placeholder={itemized ? 'Grocery run, restaurant bill…' : 'Dinner, cab fare, rent…'}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  error={touched ? errors.description : ''}
                />
              </div>

              <div className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="newq text-ink text-[15px]">Expense contains many items</p>
                    <p className="newq mt-0.5 text-[12.5px]">
                      Add item names and prices, or keep it off for one simple total.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={itemized}
                    onClick={toggleItemized}
                    className={`relative h-8 w-14 shrink-0 rounded-full p-1 tap ${
                      itemized ? 'bg-brand' : 'bg-surface-3'
                    }`}
                  >
                    <span
                      className={`block size-6 rounded-full bg-surface transition-transform duration-200 ${
                        itemized ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="px-4 py-3.5">
                <GroupLabel>Category</GroupLabel>
                <CategoryPicker value={category} onChange={setCategory} />
              </div>

              <div className="px-4 py-3.5">
                <GroupLabel action={<Hint>optional</Hint>}>Group</GroupLabel>
                <Picker
                  title="Add to a group"
                  value={groupId}
                  onChange={onGroupChange}
                  clearable
                  clearLabel="No group — just these people"
                  placeholder="No group — just these people"
                  options={groups.map((g) => ({
                    value: g.id,
                    label: g.name,
                    sublabel: `${g.memberIds.length} members`,
                    emoji: g.emoji,
                  }))}
                />
              </div>

              <div className="px-4 py-3.5">
                <GroupLabel>Date</GroupLabel>
                <DatePicker value={date} onChange={setDate} />
              </div>
            </ListGroup>
          </Section>

          {itemized && (
            <Section i={2}>
              <GroupLabel
                action={
                  <Hint>
                    {validItems.length} items ·{' '}
                    {new Intl.NumberFormat('en-IN', {
                      style: 'currency',
                      currency,
                      maximumFractionDigits: 2,
                    }).format(total)}
                  </Hint>
                }
              >
                Items in this expense
              </GroupLabel>
              <ListGroup>
                {items.map((item, index) => (
                  <div key={item.id} className="grid grid-cols-[1fr_112px_34px] gap-2 px-4 py-3">
                    <Input
                      aria-label={`Item ${index + 1} name`}
                      placeholder={`Item ${index + 1}`}
                      value={item.name}
                      onChange={(e) => updateItem(item.id, { name: e.target.value })}
                    />
                    <Input
                      aria-label={`Item ${index + 1} price`}
                      placeholder="Price"
                      inputMode="decimal"
                      value={item.price}
                      onChange={(e) =>
                        updateItem(item.id, {
                          price: e.target.value
                            .replace(/[^\d.]/g, '')
                            .replace(/(\..*)\./g, '$1'),
                        })
                      }
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      aria-label="Remove item"
                      className="mt-0.5 grid size-10 place-items-center rounded-full bg-surface-2 text-ink-3 tap hover:bg-surface-3 hover:text-ink active:scale-90"
                    >
                      <X size={16} strokeWidth={2.4} />
                    </button>
                  </div>
                ))}
                <div className="px-4 py-3.5">
                  <button
                    type="button"
                    onClick={addItem}
                    className="newq flex w-full items-center justify-center gap-2 rounded-[14px] bg-surface-2 py-3 text-[14px] text-ink tap hover:bg-surface-3 active:scale-[0.99]"
                  >
                    <Plus size={17} strokeWidth={2.3} />
                    Add another item
                  </button>
                </div>
              </ListGroup>
              {touched && errors.items && (
                <p className="mt-2 px-1.5 text-[12.5px] font-medium text-neg">{errors.items}</p>
              )}
            </Section>
          )}

          {/* -------------------------------------------------- paid by */}
          <Section i={itemized ? 3 : 2}>
            <GroupLabel
              action={payer ? <Hint>{firstName(payer.name)} covered it</Hint> : null}
            >
              Paid by
            </GroupLabel>
            <div className="-mx-5 overflow-x-auto px-5 no-scrollbar">
              <div className="flex gap-2 pb-1">
                {pool.map((p) => (
                  <PersonChip
                    key={p.id}
                    person={p}
                    you={p.id === me?.id}
                    selected={p.id === payerId}
                    onClick={() => setPayerId(p.id)}
                  />
                ))}
              </div>
            </div>
          </Section>

          {/* -------------------------------------------------- split */}
          <Section i={itemized ? 4 : 3}>
            <GroupLabel
              action={
                <Hint>
                  {selectedIds.length} of {pool.length}
                </Hint>
              }
            >
              Split between
            </GroupLabel>
            <SplitEditor
              total={total}
              currency={currency}
              people={pool}
              selectedIds={selectedIds}
              onTogglePerson={togglePerson}
              mode={mode}
              onModeChange={(m) => onModeChange(m === 'items' ? 'equal' : m)}
              values={values}
              onValueChange={(id, v) => setValues((s) => ({ ...s, [id]: v }))}
              meId={me?.id}
            />
          </Section>

          {/* -------------------------------------------------- note */}
          <Section i={itemized ? 5 : 4}>
            <GroupLabel action={<Hint>optional</Hint>}>Note</GroupLabel>
            <Textarea
              placeholder="Anything worth remembering later"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Section>

          <button type="submit" className="hidden" aria-hidden />
        </form>
      </Sheet>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={onDelete}
        title="Delete this expense?"
        body={
          editing
            ? `“${editing.description}” will be removed for everyone it was split with. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        danger
      />

      <StatusSheet
        state={status}
        onClose={() => setStatus(null)}
        successTitle={saved.title || 'Expense added'}
        successBody={saved.body}
        actionLabel="Done"
      />
    </>
  );
}
