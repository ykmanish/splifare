'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Play,
  Plus,
  Receipt,
  Settings2,
  ShoppingBasket,
  Store,
  Trash2,
  Users,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Sheet, { ConfirmSheet } from '@/components/ui/Sheet';
import { Input, Label } from '@/components/ui/Field';
import Picker from '@/components/ui/Picker';
import { Stepper } from '@/components/ui/Controls';
import { AvatarStack, PersonToggle } from '@/components/ui/Avatar';
import { Badge, Card, EmptyState, RowMenu } from '@/components/ui/Bits';
import {
  ActionTiles,
  FieldRow,
  GroupLabel,
  IconCircle,
  ListGroup,
  MetricRow,
  SheetHeader,
  StatusPill,
} from '@/components/ui/Blocks';
import AssignSheet from '@/components/lists/AssignSheet';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui/Toast';
import { GROCERY_AISLES, guessAisle, UNITS } from '@/lib/categories';
import { money, firstName, symbolOf } from '@/lib/format';

const EASE = [0.16, 1, 0.3, 1];
const SPRING = { type: 'spring', damping: 26, stiffness: 320 };

const rise = (i = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: EASE, delay: i * 0.04 },
});

const AISLE_OPTIONS = GROCERY_AISLES.map((a) => ({
  value: a.id,
  label: a.label,
  icon: a.icon,
  tint: a.tint,
}));

const UNIT_OPTIONS = UNITS.map((u) => ({ value: u, label: u }));

/** Each aisle group gets its own soft pastel card, cycled down the screen. */
const AISLE_TONES = ['butterSoft', 'mintSoft', 'skySoft', 'blushSoft', 'lavenderSoft'];
const aisleTone = (i) => AISLE_TONES[i % AISLE_TONES.length];

/** "2 kg tomatoes" -> { qty: 2, unit: 'kg', name: 'tomatoes' } */
function parseEntry(raw) {
  const text = raw.trim();
  const m = text.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(.*)$/);
  if (!m) return { qty: 1, unit: 'pcs', name: text };

  const [, num, maybeUnit, rest] = m;
  const unit = UNITS.find((u) => u.toLowerCase() === (maybeUnit || '').toLowerCase());
  if (unit) return { qty: Number(num), unit, name: rest.trim() };
  return { qty: Number(num), unit: 'pcs', name: [maybeUnit, rest].filter(Boolean).join(' ').trim() };
}

/* ------------------------------------------------------------------ */

/** Sheet-style screen frame: back control · centred name · row menu. */
function Screen({ title, subtitle, right, children }) {
  return (
    <>
      <header className="sticky top-0 z-30 glass pt-safe">
        <div className="flex h-16 items-center px-5">
          <SheetHeader
            className="w-full"
            title={title}
            subtitle={subtitle}
            left={<IconCircle icon={ChevronLeft} href="/lists" label="Back to lists" />}
            right={right}
          />
        </div>
      </header>

      <main className="px-5 pb-32 pt-1">{children}</main>
    </>
  );
}

/* ------------------------------------------------------------------ */

function ListDetailInner() {
  const { id } = useParams();
  const router = useRouter();
  const search = useSearchParams();
  const { toast } = useToast();
  const {
    me,
    lists,
    groups,
    people,
    friends,
    currency,
    personById,
    addItem,
    updateItem,
    deleteItem,
    updateList,
    deleteList,
    startShopping,
  } = useApp();

  const [entry, setEntry] = useState('');
  const [adding, setAdding] = useState(false);
  const [starting, setStarting] = useState(false);
  const [assigning, setAssigning] = useState(null);
  const [renaming, setRenaming] = useState(null); // { item, k } — k remounts the draft
  const [renameOpen, setRenameOpen] = useState(false);
  const [confirmItem, setConfirmItem] = useState(null);
  const [editing, setEditing] = useState(search.get('edit') === '1');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef(null);

  const list = lists.find((l) => l.id === id);

  const grouped = useMemo(() => {
    if (!list) return [];
    const byAisle = {};
    for (const item of list.items) {
      (byAisle[item.aisle] = byAisle[item.aisle] || []).push(item);
    }
    return GROCERY_AISLES.filter((a) => byAisle[a.id]?.length).map((a) => ({
      aisle: a,
      items: byAisle[a.id],
    }));
  }, [list]);

  if (!list) {
    return (
      <Screen title="List" subtitle="Not found">
        <Card tone="blushSoft" pad={false}>
          <EmptyState
            icon={ShoppingBasket}
            title="List not found"
            body="It may have been deleted, or the link is out of date."
            action={
              <Button variant="dark" href="/lists">
                Back to lists
              </Button>
            }
          />
        </Card>
      </Screen>
    );
  }

  const members = list.memberIds.map((m) => personById(m));
  const group = groups.find((g) => g.id === list.groupId);
  const completed = list.status === 'completed';
  const shopping = list.status === 'shopping';

  const picked = list.items.filter((i) => i.checked).length;
  const spent = list.items.reduce((a, i) => a + (Number(i.price) || 0), 0);
  const overBudget = !!list.budget && spent > list.budget;

  const stats = [
    {
      label: 'Picked',
      value: `${picked}/${list.items.length}`,
      tone: 'brand',
      pct: list.items.length ? (picked / list.items.length) * 100 : 0,
    },
    {
      label: 'Spent',
      value: money(spent, currency),
      tone: overBudget ? 'neg' : 'pos',
      pct: list.budget ? (spent / list.budget) * 100 : spent > 0 ? 100 : 0,
    },
    {
      label: list.budget ? 'Left' : 'Budget',
      value: list.budget ? money(Math.max(0, list.budget - spent), currency) : '—',
      tone: overBudget ? 'neg' : 'brand',
      pct: list.budget ? Math.max(0, ((list.budget - spent) / list.budget) * 100) : 0,
    },
  ];

  function closeSettings() {
    setEditing(false);
    if (search.get('edit')) router.replace(`/lists/${list.id}`, { scroll: false });
  }

  function focusEntry() {
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  async function onAdd(e) {
    e?.preventDefault();
    const text = entry.trim();
    if (!text || adding) return;
    const { qty, unit, name } = parseEntry(text);
    if (!name) return;

    setAdding(true);
    try {
      await addItem(list.id, {
        name,
        qty,
        unit,
        aisle: guessAisle(name),
        splitWith: [...list.memberIds],
      });
      setEntry('');
      inputRef.current?.focus();
    } catch (err) {
      toast({ tone: 'error', title: 'Could not add the item', description: err.message });
    } finally {
      setAdding(false);
    }
  }

  async function onStart() {
    if (starting) return;
    setStarting(true);
    try {
      await startShopping(list.id);
      toast({
        title: 'Shopping mode on',
        description: 'Tick items off as you put them in the trolley.',
      });
      router.push(`/lists/${list.id}/shop`);
    } catch (err) {
      toast({ tone: 'error', title: 'Could not start shopping', description: err.message });
    } finally {
      setStarting(false);
    }
  }

  async function onRemoveItem() {
    const target = confirmItem;
    if (!target) return;
    try {
      await deleteItem(list.id, target.id);
    } catch (err) {
      toast({ tone: 'error', title: 'Could not remove the item', description: err.message });
    }
  }

  function openRename(item) {
    setRenaming((r) => ({ item, k: (r?.k || 0) + 1 }));
    setRenameOpen(true);
  }

  function onSaveItem(patch) {
    if (!renaming) return;
    try {
      updateItem(list.id, renaming.item.id, patch);
      setRenameOpen(false);
    } catch (err) {
      toast({ tone: 'error', title: 'Could not update the item', description: err.message });
    }
  }

  async function onDeleteList() {
    try {
      await deleteList(list.id);
      toast({ tone: 'info', title: 'List deleted', description: list.name });
      router.push('/lists');
    } catch (err) {
      toast({ tone: 'error', title: 'Could not delete the list', description: err.message });
    }
  }

  const tiles = completed
    ? [
        {
          id: 'expense',
          label: 'Expense',
          icon: Receipt,
          tone: 'blue',
          href: list.expenseId ? '/activity' : undefined,
          disabled: !list.expenseId,
        },
        { id: 'settings', label: 'Settings', icon: Settings2, onClick: () => setEditing(true) },
        {
          id: 'delete',
          label: 'Remove',
          icon: Trash2,
          tone: 'neg',
          onClick: () => setConfirmDelete(true),
        },
      ]
    : [
        {
          id: 'shop',
          label: shopping ? 'Resume' : 'Start shopping',
          icon: Play,
          tone: 'dark',
          onClick: onStart,
          disabled: starting || !list.items.length,
        },
        { id: 'add', label: 'Add item', icon: Plus, onClick: focusEntry },
        { id: 'settings', label: 'Settings', icon: Settings2, onClick: () => setEditing(true) },
      ];

  return (
    <Screen
      title={list.name}
      subtitle={list.store || 'No store set'}
      right={
        <RowMenu
          title={list.name}
          subtitle={list.store || 'No store set'}
          editLabel="List settings"
          deleteLabel="Delete list"
          className="!size-10 bg-surface-2 !text-ink"
          onEdit={() => setEditing(true)}
          onDelete={() => setConfirmDelete(true)}
        />
      }
    >
      <div className="space-y-6">
        {/* -------------------------------------------------- hero */}
        <motion.div {...rise(0)}>
          <Card tone="sky">
            <div className="flex items-center gap-3.5">
              <span className="grid size-14 shrink-0 place-items-center rounded-[18px] bg-white/70 text-[26px] leading-none">
                {list.emoji}
              </span>

              <div className="min-w-0 flex-1">
                <p className="newq  text-ink truncate text-[17px]">{list.name}</p>
                <p className="newq mt-0.5 truncate text-[12.5px]">
                  {list.store || 'No store set'}
                  {group ? ` · ${group.emoji} ${group.name}` : ''}
                </p>
              </div>

              <AvatarStack people={members} size="sm" max={4} />
            </div>

            <MetricRow className="mt-5" stats={stats} />
          </Card>
        </motion.div>

        {/* -------------------------------------------------- state */}
        {(completed || shopping) && (
          <motion.div {...rise(1)}>
            <StatusPill tone={completed ? 'pos' : 'blue'} icon={completed ? Check : ShoppingBasket}>
              {completed ? 'Checked out — now an expense' : 'Shopping in progress'}
            </StatusPill>
          </motion.div>
        )}

        {/* -------------------------------------------------- actions */}
        <motion.div {...rise(2)}>
          <ActionTiles actions={tiles} />
        </motion.div>

        {/* -------------------------------------------------- fast add */}
        {!completed && (
          <motion.div {...rise(3)}>
            <GroupLabel>Quick add</GroupLabel>
            <form onSubmit={onAdd} className="flex items-center gap-2.5">
              <Input
                ref={inputRef}
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                placeholder="Try “2 kg tomatoes”"
                aria-label="Add an item"
                containerClass="min-w-0 flex-1"
                className="!rounded-[16px]"
              />
              <Button
                type="submit"
                size="md"
                icon={Plus}
                aria-label="Add item"
                loading={adding}
                disabled={!entry.trim()}
                className="!size-13"
              />
            </form>
          </motion.div>
        )}

        {/* -------------------------------------------------- items */}
        {list.items.length === 0 ? (
          <motion.div {...rise(4)}>
            <Card tone="skySoft" pad={false}>
              <EmptyState
                icon={ShoppingBasket}
                title="Nothing on the list yet"
                body="Add items above. Splitta guesses the aisle and shares each one with everybody unless you say otherwise."
              />
            </Card>
          </motion.div>
        ) : (
          grouped.map(({ aisle, items }, gi) => (
            <motion.section key={aisle.id} {...rise(4 + Math.min(gi, 6))}>
              <GroupLabel
                action={<span className="num text-[12px] text-ink-3">{items.length}</span>}
              >
                {aisle.label}
              </GroupLabel>

              <ListGroup>
                {items.map((item) => {
                  // Mirror splitsFromItems: an empty splitWith means everyone on the list.
                  const sharedIds = item.splitWith?.length ? item.splitWith : list.memberIds;
                  const who = sharedIds.map((w) => personById(w));
                  const everyone = sharedIds.length === list.memberIds.length;

                  /*
                   * Built by hand rather than with FieldRow: the row itself
                   * opens the item, and FieldRow with an onClick renders a
                   * <button>, which cannot legally contain the assign button.
                   */
                  return (
                    <div key={item.id} className="flex items-center gap-2 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openRename(item)}
                        aria-label={`Open ${item.name}`}
                        className="flex min-w-0 flex-1 items-center gap-3 py-0.5 text-left tap
                          active:scale-[0.995]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="newq text-ink block truncate text-[15px]">
                            {item.name}
                          </span>
                          <span className="newq block truncate text-[12.5px]">
                            {item.qty} {item.unit}
                            {item.note ? ` · ${item.note}` : ''}
                          </span>
                        </span>
                        {Number(item.price) > 0 && (
                          <span className="num shrink-0 text-[15px] font-medium text-ink">
                            {money(item.price, currency)}
                          </span>
                        )}
                      </button>

                      {/* Once the list is an expense, who each item was for is
                          history — shown, but no longer a control. */}
                      {(() => {
                        const shares = everyone ? (
                          <Badge tone="brandSoft" icon={Users}>
                            All
                          </Badge>
                        ) : who.length === 1 ? (
                          <Badge tone="neutral">
                            {who[0]?.id === me.id ? 'You' : firstName(who[0]?.name || '')}
                          </Badge>
                        ) : (
                          <AvatarStack people={who} size="xs" max={3} />
                        );

                        return completed ? (
                          <span className="shrink-0 p-1">{shares}</span>
                        ) : (
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.97 }}
                            transition={SPRING}
                            onClick={() => setAssigning(item)}
                            aria-label={`Change who ${item.name} is for`}
                            className="shrink-0 rounded-full p-1 tap hover:bg-surface-2"
                          >
                            {shares}
                          </motion.button>
                        );
                      })()}

                      <ChevronRight
                        size={17}
                        strokeWidth={2.2}
                        className="shrink-0 text-ink-3"
                        aria-hidden
                      />
                    </div>
                  );
                })}
              </ListGroup>
            </motion.section>
          ))
        )}
      </div>

      {/* -------------------------------------------------- sheets */}
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

      {renaming && (
        <ItemEditSheet
          key={renaming.k}
          open={renameOpen}
          onClose={() => setRenameOpen(false)}
          item={renaming.item}
          readOnly={completed}
          onSave={onSaveItem}
          onDelete={
            completed
              ? undefined
              : () => {
                  setRenameOpen(false);
                  setConfirmItem(renaming.item);
                }
          }
        />
      )}

      <ConfirmSheet
        open={!!confirmItem}
        onClose={() => setConfirmItem(null)}
        title={confirmItem ? `Remove ${confirmItem.name}?` : 'Remove item?'}
        body="It comes off the list for everybody sharing it."
        confirmLabel="Remove"
        danger
        onConfirm={onRemoveItem}
      />

      <ListSettingsSheet
        open={editing}
        onClose={closeSettings}
        readOnly={completed}
        list={list}
        groups={groups}
        people={people}
        friends={friends}
        meId={me.id}
        currency={currency}
        onSave={(patch) => updateList(list.id, patch)}
        onDelete={() => {
          closeSettings();
          setConfirmDelete(true);
        }}
      />

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${list.name}?`}
        body="The list and its items will be removed. Any expense already created from it stays."
        confirmLabel="Delete list"
        danger
        onConfirm={onDeleteList}
      />
    </Screen>
  );
}

export default function ListDetailPage() {
  return (
    <Suspense fallback={null}>
      <ListDetailInner />
    </Suspense>
  );
}

/* ------------------------------------------------------------------ */

/** Inline item edit — rename, retune the quantity, move it to another aisle. */
function ItemEditSheet({ open, onClose, item, onSave, onDelete, readOnly = false }) {
  // Remounted with a fresh `key` every time an item is picked, so the draft
  // always starts from that item — no reset effect needed.
  const [name, setName] = useState(item?.name || '');
  const [qty, setQty] = useState(Number(item?.qty) || 1);
  const [unit, setUnit] = useState(item?.unit || 'pcs');
  const [aisle, setAisle] = useState(item?.aisle || 'pantry');
  const [note, setNote] = useState(item?.note || '');

  if (!item) return null;

  const trimmed = name.trim();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item.name}
      subtitle={`${item.qty} ${item.unit}`}
      size="sm"
      footer={
        readOnly ? (
          <Button variant="soft" size="md" block onClick={onClose}>
            Close
          </Button>
        ) : (
          <div className="flex gap-2.5">
            <Button variant="soft" size="md" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              size="md"
              className="flex-[2]"
              disabled={!trimmed}
              onClick={() =>
                onSave({
                  name: trimmed || item.name,
                  qty: Number(qty) || 1,
                  unit,
                  aisle,
                  note: note.trim(),
                })
              }
            >
              Save item
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-5">
        {readOnly && (
          <StatusPill tone="pos" icon={Check}>
            This list is checked out — items are read-only
          </StatusPill>
        )}

        <Input
          label="Item"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tomatoes"
          autoFocus={!readOnly}
          disabled={readOnly}
        />

        <div>
          <Label hint={unit}>Quantity</Label>
          {readOnly ? (
            <p className="num text-ink text-[17px]">
              {qty} {unit}
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <Stepper value={qty} onChange={setQty} min={1} max={999} label="quantity" />
              <Picker
                title="Unit"
                value={unit}
                onChange={setUnit}
                options={UNIT_OPTIONS}
                className="min-w-0 flex-1"
              />
            </div>
          )}
        </div>

        <Picker
          label="Aisle"
          title="Which aisle?"
          value={aisle}
          onChange={setAisle}
          options={AISLE_OPTIONS}
          disabled={readOnly}
        />

        <Input
          label="Note"
          hint="optional"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ripe ones, not the green"
          disabled={readOnly}
        />

        {/* Removal lives here now that the row opens this sheet — it replaces
            the per-row ⋯ menu, so a delete is never one stray tap away. */}
        {onDelete && (
          <div>
            <GroupLabel>Remove</GroupLabel>
            <Card tone="blushSoft" pad={false}>
              <FieldRow
                icon={Trash2}
                iconBg="var(--blush)"
                label="Remove from the list"
                sublabel="Comes off for everybody sharing it"
                danger
                onClick={onDelete}
              />
            </Card>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

function ListSettingsSheet({
  open,
  onClose,
  readOnly = false,
  list,
  groups,
  people,
  friends,
  meId,
  currency,
  onSave,
  onDelete,
}) {
  const { toast } = useToast();
  const [name, setName] = useState(list.name);
  const [store, setStore] = useState(list.store || '');
  const [budget, setBudget] = useState(list.budget ? String(list.budget) : '');
  const [groupId, setGroupId] = useState(list.groupId || '');
  const [memberIds, setMemberIds] = useState(list.memberIds);
  const [busy, setBusy] = useState(false);

  /* You first, then friends, then existing members who are not friends. */
  const roster = useMemo(() => {
    const me = people.find((p) => p.id === meId);
    const existing = list.memberIds.map((mid) => people.find((p) => p.id === mid));
    const seen = new Set();
    const out = [];
    for (const p of [me, ...friends, ...existing]) {
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }, [people, friends, list.memberIds, meId]);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await onSave({
        name: name.trim() || list.name,
        store: store.trim(),
        budget: budget ? Number(budget) : null,
        groupId: groupId || null,
        memberIds: [...new Set([meId, ...memberIds])],
      });
      onClose();
    } catch (err) {
      toast({ tone: 'error', title: 'Could not save the list', description: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="List settings"
      subtitle={list.name}
      footer={
        readOnly ? (
          <Button variant="soft" size="md" block onClick={onClose}>
            Close
          </Button>
        ) : (
          <div className="flex gap-2.5">
            <Button variant="soft" size="md" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button size="md" onClick={save} loading={busy} className="flex-[2]">
              Save
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-5">
        {readOnly && (
          <StatusPill tone="pos" icon={Check}>
            Checked out — these details are read-only
          </StatusPill>
        )}
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={readOnly}
        />
        <Input
          label="Store"
          icon={Store}
          value={store}
          onChange={(e) => setStore(e.target.value)}
          disabled={readOnly}
        />
        <Input
          label="Budget"
          hint="optional"
          inputMode="decimal"
          suffix={symbolOf(currency)}
          value={budget}
          onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ''))}
          disabled={readOnly}
        />
        <Picker
          label="Group"
          title="Attach to a group"
          placeholder="No group"
          clearable
          clearLabel="No group"
          value={groupId}
          onChange={setGroupId}
          options={groups.map((g) => ({ value: g.id, label: g.name, emoji: g.emoji }))}
          disabled={readOnly}
        />

        <div>
          <Label hint={`${memberIds.length} people`}>Sharing with</Label>
          <div className="space-y-1.5">
            {roster.map((p) => (
              <PersonToggle
                key={p.id}
                person={{ ...p, name: p.id === meId ? 'You' : p.name }}
                subtitle={p.id === meId ? 'You — always on the list' : undefined}
                selected={memberIds.includes(p.id)}
                disabled={readOnly || p.id === meId}
                onToggle={(pid) =>
                  setMemberIds((m) => (m.includes(pid) ? m.filter((x) => x !== pid) : [...m, pid]))
                }
              />
            ))}
          </div>
          <p className="newq mt-2.5 px-1.5 text-[12px]">
            Your friends, plus anyone already sharing this list.
          </p>
        </div>

        <div>
          <GroupLabel>Danger zone</GroupLabel>
          <ListGroup tone="fill">
            <FieldRow
              icon={Trash2}
              iconBg="color-mix(in srgb, var(--neg) 12%, transparent)"
              label="Delete this list"
              sublabel={`Removes all ${list.items.length} ${
                list.items.length === 1 ? 'item' : 'items'
              }`}
              danger
              onClick={onDelete}
            />
          </ListGroup>
        </div>
      </div>
    </Sheet>
  );
}
