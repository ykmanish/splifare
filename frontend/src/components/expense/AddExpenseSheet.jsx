'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Camera,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  ScanLine,
  Trash2,
  X,
} from 'lucide-react';
import Sheet, { ConfirmSheet } from '@/components/ui/Sheet';
import StatusSheet from '@/components/ui/StatusSheet';
import Button from '@/components/ui/Button';
import {
  FieldRow,
  GroupLabel,
  IconCircle,
  ListGroup,
  PersonRow,
  SheetHeader,
  StatusPill,
} from '@/components/ui/Blocks';
import { Card } from '@/components/ui/Bits';
import { AmountInput, Input, Textarea } from '@/components/ui/Field';
import Picker from '@/components/ui/Picker';
import DatePicker from '@/components/ui/DatePicker';
import { PersonChip } from '@/components/ui/Avatar';
import CategoryPicker from './CategoryPicker';
import SplitEditor from './SplitEditor';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui/Toast';
import { haptics } from '@/lib/haptics';
import { readExpenseDraft, writeExpenseDraft, clearExpenseDraft } from '@/lib/draft';
import { canEditExpense } from '@/lib/permissions';
import { computeSplits, defaultValuesFor } from '@/lib/split';
import { firstName, dayLabel, money, CURRENCIES } from '@/lib/format';
import { rateLabel } from '@/lib/fx';
import { api } from '@/lib/api';
import { prepareImage, ImageError } from '@/lib/image';
import { planFromScan, shortfallRow } from '@/lib/scan';

/** Up to three, matching the server's own limit. */
const MAX_SCAN_IMAGES = 3;

/**
 * `crypto.randomUUID` needs a secure context, which `http://192.168.x.x`
 * is not — and testing a PWA from a phone on the LAN is exactly that.
 */
const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

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
      currency: editing.currency || me?.currency || 'INR',
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
            id: item.id || uid(),
            name: item.name || '',
            price: item.price ? String(item.price) : '',
          }))
        : [{ id: uid(), name: '', price: '' }],
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
    currency: prefill.currency || me?.currency || 'INR',
    description: prefill.description || '',
    category: prefill.category || 'other',
    groupId,
    payerId: prefill.payerId || me?.id,
    selectedIds,
    mode: 'equal',
    values: {},
    date: new Date().toISOString(),
    notes: '',
    // A share can arrive already itemised — a receipt read on the share
    // screen hands its rows straight over.
    itemized: !!prefill.itemized,
    items: prefill.items?.length ? prefill.items : [{ id: uid(), name: '', price: '' }],
  };
}

export default function AddExpenseSheet({ open, onClose, prefill = {}, editing = null }) {
  const {
    me,
    people,
    personById,
    splitPool,
    groups,
    currency,
    convert,
    addExpense,
    updateExpense,
    deleteExpense,
  } = useApp();
  const { toast } = useToast();

  const [amount, setAmount] = useState('');
  /** The currency this expense is recorded in — not necessarily the one the
      viewer reads totals in. */
  const [cur, setCur] = useState(currency);
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
  /** True when this opening was seeded from a saved draft rather than fresh. */
  const [restored, setRestored] = useState(false);
  const [status, setStatus] = useState(null);
  const [saved, setSaved] = useState({ title: '', body: '' });

  /* ---- reading items out of a photo ---- */
  const fileRef = useRef(null);
  /** Bumped on every close, so a slow scan cannot land in a reopened sheet. */
  const scanRun = useRef(0);
  const [scanAvailable, setScanAvailable] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [scanError, setScanError] = useState(null);
  const [scanResult, setScanResult] = useState(null);

  /*
   * Ask once whether this server can scan at all. A control that could only
   * ever fail is worse than no control, so the panel stays hidden without a
   * configured reader.
   */
  useEffect(() => {
    if (!open || editing || scanAvailable !== null) return;
    let alive = true;
    api
      .scanStatus()
      .then((r) => alive && setScanAvailable(!!r.enabled))
      .catch(() => alive && setScanAvailable(false));
    return () => {
      alive = false;
    };
  }, [open, editing, scanAvailable]);

  const runScan = useCallback(
    async (files) => {
      const picked = Array.from(files || []).slice(0, MAX_SCAN_IMAGES);
      if (!picked.length) return;

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setScanError({
          title: 'Reading a photo needs a connection',
          body: 'Type the items in for now.',
        });
        return;
      }

      const run = scanRun.current;
      setScanning(true);
      setScanError(null);
      try {
        const images = [];
        for (const file of picked) {
          // Sequential on purpose: three 12-megapixel decodes at once is how
          // a mid-range phone runs out of memory mid-scan.
          const prepared = await prepareImage(file);
          images.push({ mediaType: prepared.mediaType, data: prepared.base64 });
        }

        const result = await api.scanReceipt({ images, currency: cur });
        if (run !== scanRun.current) return;

        const plan = planFromScan(result, { existingItems: items, currency: cur });

        if (plan.action === 'reject') {
          setScanError({ title: plan.title, body: plan.body });
          return;
        }

        if (plan.currency) setCur(plan.currency);
        if (plan.description && !description.trim()) {
          setDescription(plan.description.slice(0, 140));
        }

        if (plan.action === 'amount') {
          setAmount(String(plan.amount));
          setScanResult({ note: plan.note, notes: [], waived: [] });
          setScanCount((n) => n + picked.length);
          haptics.success();
          return;
        }

        setItems(plan.rows);
        setItemized(true);
        setScanResult(plan);
        setScanCount((n) => n + picked.length);
        haptics.success();
      } catch (err) {
        if (run !== scanRun.current) return;
        setScanError(
          err instanceof ImageError
            ? { title: 'That photo could not be opened', body: err.message }
            : { title: 'Could not read that photo', body: err.message },
        );
      } finally {
        if (run === scanRun.current) setScanning(false);
      }
    },
    [cur, items, description],
  );

  /** Swap every scanned row to the other price column the bill printed. */
  const useListedPrices = useCallback(() => {
    setItems((rows) =>
      rows.map((row) =>
        row.listPrice != null ? { ...row, price: String(row.listPrice), listPrice: null } : row,
      ),
    );
    setScanResult((r) => (r ? { ...r, mrpSwap: null, warning: null } : r));
  }, []);

  /* -------------------------------------------------- pool of people */

  const pool = useMemo(() => {
    if (groupId) {
      const g = groups.find((x) => x.id === groupId);
      return g ? g.memberIds.map((id) => people.find((p) => p.id === id)).filter(Boolean) : [];
    }
    // No group means no shared room, so only confirmed friends are offered.
    return splitPool;
  }, [groupId, groups, people, splitPool]);

  /* -------------------------------------------------- open / reset */

  // React's "adjust state when a prop changes" pattern. Seeding the form
  // during render on the closed → open edge avoids the extra commit (and the
  // one stale painted frame) that resetting inside an effect would cause.
  // Starts false so mounting already-open still seeds the form, as the
  // previous mount-time effect did.
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);

    /*
     * Any scan still in flight belongs to the opening that started it. Bumping
     * the run id here means a reply that arrives after a close-and-reopen is
     * dropped rather than written into an unrelated form.
     */
    scanRun.current += 1;
    setScanning(false);
    setScanError(null);
    setScanResult(null);
    setScanCount(0);

    if (open) {
      /*
       * An edit is always seeded from the expense itself — a stale draft has
       * no business overwriting a bill that already exists. Neither does it
       * over a prefill that carries real content: someone who just read a
       * receipt is handed those items, not yesterday's half-typed one.
       */
      const seeded = prefill.items?.length || prefill.amount || prefill.description;
      const draft = editing || seeded ? null : readExpenseDraft();
      const f = draft || initialForm({ editing, prefill, groups, me });

      applyForm(f);
      setTouched(false);
      setConfirmDelete(false);
      setRestored(!!draft);
    }
  }

  /** Pushes a whole form object into state — used by seeding and by discard. */
  function applyForm(f) {
    setAmount(f.amount ?? '');
    setCur(f.currency || currency);
    setDescription(f.description ?? '');
    setCategory(f.category ?? 'other');
    setGroupId(f.groupId ?? '');
    setPayerId(f.payerId ?? me?.id);
    setSelectedIds(f.selectedIds ?? [me?.id]);
    setMode(f.mode ?? 'equal');
    setValues(f.values ?? {});
    setDate(f.date ?? new Date().toISOString());
    setNotes(f.notes ?? '');
    setItemized(!!f.itemized);
    setItems(f.items?.length ? f.items : [{ id: uid(), name: '', price: '' }]);
  }

  /** Throw the draft away and start from what this opening would have shown. */
  function startFresh() {
    clearExpenseDraft();
    applyForm(initialForm({ editing: null, prefill, groups, me }));
    setTouched(false);
    setRestored(false);
  }

  /* -------------------------------------------------- draft */

  /*
   * Written on a short delay so a burst of keystrokes is one write, and only
   * for a new expense. Writing to storage is not a state update, so this
   * effect cannot cascade a render.
   */
  useEffect(() => {
    if (!open || editing) return undefined;

    const t = setTimeout(() => {
      writeExpenseDraft({
        amount,
        currency: cur,
        description,
        category,
        groupId,
        payerId,
        selectedIds,
        mode,
        values,
        date,
        notes,
        itemized,
        items,
      });
    }, 400);

    return () => clearTimeout(t);
  }, [
    open,
    editing,
    amount,
    cur,
    description,
    category,
    groupId,
    payerId,
    selectedIds,
    mode,
    values,
    date,
    notes,
    itemized,
    items,
  ]);

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
    setItems((rows) => [...rows, { id: uid(), name: '', price: '' }]);
  };

  const removeItem = (id) => {
    setItems((rows) =>
      rows.length === 1
        ? [{ id: uid(), name: '', price: '' }]
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
      currency: cur,
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
        // A lighter tick for an edit: nothing new joined the ledger.
        haptics.tap();
        setSaved({ title: 'Changes saved', body: payload.description });
      } else {
        await addExpense(payload);
        // Saved for real, so the draft has done its job.
        clearExpenseDraft();
        setRestored(false);
        haptics.success();
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
      haptics.error();
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

  /*
   * Someone else's expense opens as a record, not a form. Everyone on a split
   * is entitled to see how it was worked out; only its author may change it,
   * which the server enforces independently.
   */
  if (editing && !canEditExpense(editing, me?.id)) {
    const own = editing.currency || currency;
    const author = personById(editing.createdBy);
    const paidRows = (editing.paidBy || []).map((r) => ({
      person: personById(r.userId),
      amount: r.amount,
    }));
    const splitRows = (editing.splits || []).map((r) => ({
      person: personById(r.userId),
      amount: r.amount,
    }));

    return (
      <Sheet open={open} onClose={onClose} size="lg">
        <div className="space-y-6">
          <SheetHeader
            title={editing.description}
            subtitle={`${money(editing.amount, own)} · ${dayLabel(editing.date)}`}
          />

          <StatusPill tone="blue" icon={Lock}>
            Only {author?.id === me?.id ? 'you' : firstName(author?.name || 'whoever added it')} can
            change this
          </StatusPill>

          <div>
            <GroupLabel>Paid by</GroupLabel>
            <ListGroup>
              {paidRows.map((r) => (
                <PersonRow
                  key={`paid-${r.person.id}`}
                  person={r.person}
                  name={r.person.id === me?.id ? 'You' : r.person.name}
                  trailing={
                    <span className="num shrink-0 text-[15px] font-medium text-ink">
                      {money(r.amount, own)}
                    </span>
                  }
                />
              ))}
            </ListGroup>
          </div>

          <div>
            <GroupLabel action={<Hint>{splitRows.length} people</Hint>}>Split between</GroupLabel>
            <ListGroup>
              {splitRows.map((r) => (
                <PersonRow
                  key={`split-${r.person.id}`}
                  person={r.person}
                  name={r.person.id === me?.id ? 'You' : r.person.name}
                  trailing={
                    <span className="num shrink-0 text-[15px] font-medium text-ink">
                      {money(r.amount, own)}
                    </span>
                  }
                />
              ))}
            </ListGroup>
          </div>

          {!!editing.items?.length && (
            <div>
              <GroupLabel>Items</GroupLabel>
              <ListGroup>
                {editing.items.map((item) => (
                  <FieldRow
                    key={item.id}
                    label={item.name}
                    value={money(item.price, own)}
                  />
                ))}
              </ListGroup>
            </div>
          )}

          {editing.notes && (
            <div>
              <GroupLabel>Note</GroupLabel>
              <Card tone="soft">
                <p className="newq whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
                  {editing.notes}
                </p>
              </Card>
            </div>
          )}

          <Button variant="soft" size="md" block onClick={onClose}>
            Close
          </Button>
        </div>
      </Sheet>
    );
  }

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
                : 'Splitting with the friends you pick below'
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

          {restored && (
            <Section i={0}>
              <div className="flex items-center gap-3 rounded-[16px] bg-sky px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="newq text-ink block text-[13.5px]">Picked up where you left off</span>
                  <span className="newq block text-[12px]">
                    This bill was still unsaved from last time.
                  </span>
                </span>
                <Button
                  type="button"
                  variant="onTone"
                  size="xs"
                  icon={RotateCcw}
                  className="shrink-0"
                  onClick={startFresh}
                >
                  Start fresh
                </Button>
              </div>
            </Section>
          )}

          {/* ---------------------------------------------- read a photo */}
          {!editing && scanAvailable && (
            <Section i={0}>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  runScan(e.target.files);
                  // Cleared so picking the same file twice fires again.
                  e.target.value = '';
                }}
              />

              <div className="rounded-[22px] bg-surface-2 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-lime-200 text-ink">
                    <ScanLine size={19} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="newq text-[15px] text-ink">
                      {scanCount ? 'Add another photo' : 'Read items from a photo'}
                    </p>
                    <p className="newq mt-0.5 text-[12.5px] leading-snug">
                      {scanCount
                        ? `${scanCount} ${scanCount === 1 ? 'photo' : 'photos'} read so far. Check every price before saving.`
                        : 'A receipt or an order screen. The photo is read and discarded — only the items are kept.'}
                    </p>
                  </div>
                </div>

                <Button
                  variant="soft"
                  size="md"
                  block
                  className="mt-3"
                  type="button"
                  icon={scanning ? Loader2 : Camera}
                  loading={scanning}
                  disabled={scanning}
                  onClick={() => fileRef.current?.click()}
                >
                  {scanning ? 'Reading…' : scanCount ? 'Add another photo' : 'Choose a photo'}
                </Button>
              </div>

              {scanError && (
                <div className="mt-2 rounded-[18px] bg-blush-soft p-4">
                  <p className="newq text-[13.5px] text-ink">{scanError.title}</p>
                  <p className="newq mt-1 text-[12.5px] leading-snug">{scanError.body}</p>
                </div>
              )}

              {scanResult?.warning && (
                <div className="mt-2 rounded-[18px] bg-butter-soft p-4">
                  <p className="newq flex items-start gap-2 text-[13px] leading-snug text-ink">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    {scanResult.warning}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {scanResult.mrpSwap && (
                      <Button variant="soft" size="sm" type="button" onClick={useListedPrices}>
                        Use the other prices ({money(scanResult.mrpSwap.to, cur)})
                      </Button>
                    )}
                    {scanResult.shortfall > 0 && (
                      <Button
                        variant="soft"
                        size="sm"
                        type="button"
                        onClick={() => {
                          setItems((rows) => [...rows, shortfallRow(scanResult.shortfall)]);
                          setScanResult((r) => ({ ...r, shortfall: 0, warning: null }));
                        }}
                      >
                        Add the {money(scanResult.shortfall, cur)} difference
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {!!scanResult?.notes?.length && (
                <p className="newq mt-2 px-1.5 text-[12.5px] leading-snug">
                  {scanResult.notes.join(' ')}
                </p>
              )}

              {!!scanResult?.waived?.length && (
                <p className="newq mt-1.5 px-1.5 text-[12.5px] leading-snug text-ink-3">
                  {scanResult.waived
                    .map((w) => `${w.label} ${money(w.originalAmount, cur)} — waived`)
                    .join(' · ')}
                </p>
              )}

              {scanResult?.statedTotal != null && (
                <p className="newq mt-1.5 px-1.5 text-[12.5px]">
                  Bill total <span className="num text-ink">{money(scanResult.statedTotal, cur)}</span>
                </p>
              )}
            </Section>
          )}

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
                      currency: cur,
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
                currency={cur}
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
                <GroupLabel
                  action={
                    cur !== currency ? (
                      <Hint>{rateLabel(cur, currency, convert.rates) || 'converted for totals'}</Hint>
                    ) : null
                  }
                >
                  Currency
                </GroupLabel>
                <Picker
                  title="What currency was this in?"
                  value={cur}
                  onChange={(next) => setCur(next || currency)}
                  options={Object.values(CURRENCIES).map((c) => ({
                    value: c.code,
                    label: `${c.symbol}  ${c.code}`,
                    sublabel: c.name,
                  }))}
                />
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
                      currency: cur,
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
                      aria-label={item.name ? `Remove ${item.name}` : `Remove item ${index + 1}`}
                      className="mt-0.5 grid size-10 place-items-center rounded-full bg-surface-2 text-ink-3 tap hover:bg-surface-3 hover:text-ink active:scale-90"
                    >
                      <X size={16} strokeWidth={2.4} />
                    </button>

                    {/* Where the number came from, and a one-tap correction if
                        the wrong price column was read. */}
                    {item.listPrice != null && Number(item.listPrice) !== Number(item.price) && (
                      <button
                        type="button"
                        onClick={() => updateItem(item.id, { price: String(item.listPrice) })}
                        aria-label={`Listed price ${money(item.listPrice, cur)} — tap to use it instead`}
                        className="num col-start-2 -mt-1.5 text-left text-[11.5px] text-ink-3 line-through tap"
                      >
                        {money(item.listPrice, cur)}
                      </button>
                    )}

                    {(item.confidence === 'low' || item.duplicate) && (
                      <p className="newq col-span-3 -mt-1 text-[11.5px] text-butter-deep">
                        {item.duplicate
                          ? 'Same name and price as another row — check it is not counted twice.'
                          : 'This one was hard to read — check it.'}
                      </p>
                    )}
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
              currency={cur}
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
