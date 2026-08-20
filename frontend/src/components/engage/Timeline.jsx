'use client';

import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Camera,
  ImagePlus,
  Loader2,
  MapPin,
  Repeat,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import Sheet from '@/components/ui/Sheet';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import { Input, Label } from '@/components/ui/Field';
import { Card, EmptyState } from '@/components/ui/Bits';
import { api, normMemory } from '@/lib/api';
import { ImageError, prepareThumb } from '@/lib/image';
import { money, firstName } from '@/lib/format';
import { categoryOf } from '@/lib/categories';
import { useToast } from '@/components/ui/Toast';

/**
 * The trip timeline.
 *
 * The version this replaces listed the last eight expenses — which the
 * expenses tab already does, one screen away. A timeline earns its place only
 * if it holds the things a ledger cannot: the photo of the meal, the name of
 * the beach, the note about who was ill that day.
 *
 * So memories and expenses are merged into one dated rail. An expense is a
 * fact with a number; a memory is a fact without one; the trip is both, in
 * order.
 */

const EASE = [0.16, 1, 0.3, 1];

const dateHeading = (iso) =>
  new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

function PhotoPicker({ photo, onPick, onClear, busy }) {
  const inputRef = useRef(null);

  return (
    <div>
      <Label>Photo</Label>
      {photo ? (
        <div className="relative overflow-hidden rounded-[20px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="" className="h-44 w-full object-cover" />
          <button
            type="button"
            onClick={onClear}
            aria-label="Remove photo"
            className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-panel/80 text-white tap"
          >
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-[20px]
            bg-surface-2 text-ink-3 tap disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <ImagePlus size={20} strokeWidth={2.2} />
          )}
          <span className="newq text-[12.5px]">{busy ? 'Shrinking photo' : 'Add a photo'}</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onPick(file);
        }}
      />
    </div>
  );
}

function AddMemorySheet({ open, onClose, groupId, onAdded }) {
  const { toast } = useToast();
  const [photo, setPhoto] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  function reset() {
    setPhoto('');
    setTitle('');
    setPlace('');
    setNote('');
    setDate(new Date().toISOString().slice(0, 10));
  }

  async function pick(file) {
    setPreparing(true);
    try {
      /* Downscaled on the device: a 5 MB phone photo would be refused by the
         route, and uploading it only to be told so wastes the connection. */
      setPhoto(await prepareThumb(file));
    } catch (err) {
      toast({
        tone: 'error',
        title: 'Could not read that photo',
        description: err instanceof ImageError ? err.message : 'Try a different image.',
      });
    } finally {
      setPreparing(false);
    }
  }

  async function save() {
    if (saving) return;
    if (!photo && !title.trim() && !place.trim() && !note.trim()) {
      toast({ tone: 'error', title: 'Add a photo, a place or a note' });
      return;
    }
    setSaving(true);
    try {
      const { memory } = await api.createMemory(groupId, {
        photo,
        title: title.trim(),
        place: place.trim(),
        note: note.trim(),
        date: new Date(date).toISOString(),
      });
      onAdded(normMemory(memory));
      reset();
      onClose();
      toast({ title: 'Added to the timeline' });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not save', description: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a memory"
      subtitle="A photo, a place, or just a note"
      footer={
        <Button size="lg" block loading={saving} onClick={save}>
          Add to timeline
        </Button>
      }
    >
      <div className="space-y-4">
        <PhotoPicker
          photo={photo}
          busy={preparing}
          onPick={pick}
          onClear={() => setPhoto('')}
        />
        <Input
          label="Title"
          value={title}
          placeholder="Sunset at the fort"
          onChange={(e) => setTitle(e.target.value)}
        />
        <Input
          label="Place"
          value={place}
          placeholder="Chapora, Goa"
          onChange={(e) => setPlace(e.target.value)}
        />
        <Input
          label="Note"
          value={note}
          placeholder="Everyone was late except Riya"
          onChange={(e) => setNote(e.target.value)}
        />
        <Input
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
    </Sheet>
  );
}

function Rail({ children, last }) {
  return (
    <div className="relative pl-9">
      {/* The rail stops at the last node rather than running past it. */}
      {!last && <span className="absolute left-[13px] top-7 h-full w-px bg-line" />}
      {children}
    </div>
  );
}

export default function Timeline({ group, expenses, memories, me, personById, currency, onView, onAdded, onRemoved }) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState(null);

  /* One dated stream. Ties put the memory first, because a photo taken at a
     restaurant reads better above the bill for it than below. The date
     headings are resolved here too, rather than tracked with a mutable
     cursor while the list renders. */
  const items = useMemo(() => {
    const rows = [
      ...expenses.map((e) => ({ kind: 'expense', id: `e-${e.id}`, at: e.date, data: e })),
      ...memories.map((m) => ({ kind: 'memory', id: `m-${m.id}`, at: m.date, data: m })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at) || (a.kind === 'memory' ? -1 : 1));

    return rows.map((row, i) => {
      const heading = dateHeading(row.at);
      return {
        ...row,
        heading,
        showHeading: i === 0 || dateHeading(rows[i - 1].at) !== heading,
      };
    });
  }, [expenses, memories]);

  async function remove(memoryId) {
    try {
      await api.deleteMemory(group.id, memoryId);
      onRemoved(memoryId);
      setViewing(null);
    } catch (err) {
      toast({ tone: 'error', title: 'Could not remove', description: err.message });
    }
  }

  return (
    <div className="space-y-4">
      <Button block variant="soft" icon={Camera} onClick={() => setAdding(true)}>
        Add a photo or note
      </Button>

      {!items.length ? (
        <Card tone="soft" pad={false}>
          <EmptyState
            icon={MapPin}
            title="Nothing on the timeline yet"
            body="Add a bill or pin a photo, and the trip starts telling its own story."
          />
        </Card>
      ) : (
        <div className="space-y-1">
          {items.map((item, i) => {
            const last = i === items.length - 1;

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.32, delay: Math.min(i * 0.02, 0.3), ease: EASE }}
              >
                {item.showHeading && (
                  <p className="newq mb-1.5 mt-3 pl-9 text-[11.5px] uppercase tracking-[0.08em] text-ink-3">
                    {item.heading}
                  </p>
                )}

                <Rail last={last}>
                  {item.kind === 'expense' ? (
                    <ExpenseNode
                      expense={item.data}
                      currency={currency}
                      onView={() => onView(item.data)}
                    />
                  ) : (
                    <MemoryNode
                      memory={item.data}
                      person={personById(item.data.authorId)}
                      onOpen={() => setViewing(item.data)}
                    />
                  )}
                </Rail>
              </motion.div>
            );
          })}
        </div>
      )}

      <AddMemorySheet
        open={adding}
        onClose={() => setAdding(false)}
        groupId={group.id}
        onAdded={onAdded}
      />

      <Sheet
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.title || viewing?.place || 'Memory'}
        subtitle={viewing && dateHeading(viewing.date)}
      >
        {viewing && (
          <div className="space-y-4">
            {viewing.photo && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={viewing.photo} alt="" className="w-full rounded-[20px] object-cover" />
            )}
            {viewing.place && (
              <p className="newq flex items-center gap-2 text-[14px] text-ink">
                <MapPin size={14} strokeWidth={2.4} className="text-brand" />
                {viewing.place}
              </p>
            )}
            {viewing.note && (
              <p className="newq whitespace-pre-wrap text-[14px] leading-snug text-ink-2">
                {viewing.note}
              </p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <Avatar person={personById(viewing.authorId)} size="sm" />
              <p className="newq text-[12.5px] text-ink-3">
                Added by {viewing.authorId === me.id ? 'you' : firstName(personById(viewing.authorId)?.name)}
              </p>
            </div>
            {viewing.authorId === me.id && (
              <Button
                block
                variant="ghost"
                icon={Trash2}
                className="text-neg"
                onClick={() => remove(viewing.id)}
              >
                Remove from timeline
              </Button>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function ExpenseNode({ expense, currency, onView }) {
  const cat = categoryOf(expense.category);
  return (
    <button type="button" onClick={onView} className="flex w-full gap-3 pb-3 text-left tap">
      <span
        className="absolute left-0 grid size-7 shrink-0 place-items-center rounded-full bg-surface-2"
        style={{ color: cat.tint }}
      >
        <cat.icon size={13} strokeWidth={2.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="newq truncate text-[14px] text-ink">{expense.description}</span>
          <span className="num shrink-0 text-[13.5px] text-ink">
            {money(expense.amount, expense.currency, { compact: true })}
          </span>
        </span>
        <span className="newq mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-3">
          {cat.label}
          {expense.recurringId && (
            <>
              <Repeat size={10} strokeWidth={2.6} />
              auto
            </>
          )}
        </span>
      </span>
    </button>
  );
}

function MemoryNode({ memory, person, onOpen }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full gap-3 pb-3 text-left tap">
      <span className="absolute left-0 grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-ink">
        {memory.photo ? (
          <Camera size={13} strokeWidth={2.5} />
        ) : memory.place ? (
          <MapPin size={13} strokeWidth={2.5} />
        ) : (
          <StickyNote size={13} strokeWidth={2.5} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        {memory.photo && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={memory.photo}
            alt=""
            loading="lazy"
            className="mb-2 h-32 w-full rounded-[16px] object-cover"
          />
        )}
        <span className="newq block truncate text-[14px] text-ink">
          {memory.title || memory.place || memory.note || 'Memory'}
        </span>
        <span className="newq mt-0.5 block truncate text-[11.5px] text-ink-3">
          {[memory.place, firstName(person?.name)].filter(Boolean).join(' · ')}
        </span>
      </span>
    </button>
  );
}
