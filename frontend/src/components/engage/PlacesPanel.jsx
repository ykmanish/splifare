'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, MapPin, Navigation, Plus, Receipt, Star, Trash2 } from 'lucide-react';
import Sheet, { ConfirmSheet } from '@/components/ui/Sheet';
import Button from '@/components/ui/Button';
import Picker from '@/components/ui/Picker';
import { Input } from '@/components/ui/Field';
import { Badge, Card, EmptyState } from '@/components/ui/Bits';
import { api, normSavedPlace } from '@/lib/api';
import { PLACE_KINDS, placeKind } from '@/lib/engage';
import { directionsLink, embedMapUrl, hasLocation, placeLink } from '@/lib/maps';
import { money } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';
import PlaceSearch from './PlaceSearch';

/**
 * Map Google's own category wording onto the app's shorter list.
 *
 * Google returns hundreds of primary types; matching a handful of words is
 * enough to spare the user a dropdown they would otherwise set by hand, and
 * anything unrecognised simply leaves their choice alone.
 */
const KIND_HINTS = [
  [/coffee|cafe|café|bakery|tea/i, 'cafe'],
  [/grocer|supermarket|market|convenience/i, 'grocery'],
  [/restaurant|food|dining|bar|pub|pizza/i, 'restaurant'],
  [/taxi|transit|station|airport|parking|car/i, 'transport'],
  [/store|shop|mall|clothing|retail/i, 'shop'],
  [/electric|water|utility|gas|telecom/i, 'utility'],
  [/apartment|real estate|lodging|housing/i, 'landlord'],
];

function guessKind(label) {
  if (!label) return null;
  return KIND_HINTS.find(([re]) => re.test(label))?.[1] || null;
}

/**
 * Saved places and vendors.
 *
 * The list is sorted by how often a bill actually started from each entry, not
 * by when it was added. That single choice is what turns this from a bookmark
 * folder into a shortcut: after a fortnight the canteen everyone eats at sits
 * at the top and the restaurant somebody saved once sinks, without anyone
 * having to curate anything.
 *
 * Tapping a place opens the expense sheet with its name, category and typical
 * amount already filled — which is the whole feature. Saving a name you then
 * have to retype is not a saving.
 */

const EASE = [0.16, 1, 0.3, 1];

const BLANK = {
  name: '',
  kind: 'restaurant',
  note: '',
  typicalAmount: '',
  mapsPlaceId: '',
  address: '',
  lat: null,
  lng: null,
  mapsUrl: '',
};

function PlaceSheet({ open, onClose, groupId, currency, editing, onSaved, onDeleted }) {
  const { toast } = useToast();
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [seeded, setSeeded] = useState(null);

  if (open && seeded !== (editing?.id || 'new')) {
    setSeeded(editing?.id || 'new');
    setForm(
      editing
        ? {
            name: editing.name,
            kind: editing.kind,
            note: editing.note,
            typicalAmount: editing.typicalAmount ? String(editing.typicalAmount) : '',
            mapsPlaceId: editing.mapsPlaceId || '',
            address: editing.address || '',
            lat: editing.lat ?? null,
            lng: editing.lng ?? null,
            mapsUrl: editing.mapsUrl || '',
          }
        : BLANK,
    );
  }
  if (!open && seeded !== null) setSeeded(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  /** A Google result becomes the pin, and suggests the kind and the name. */
  function pickFromMaps(result) {
    set({
      mapsPlaceId: result.id,
      address: result.address,
      lat: result.lat,
      lng: result.lng,
      mapsUrl: result.mapsUrl,
      kind: guessKind(result.kindLabel) || form.kind,
    });
  }

  async function save() {
    if (saving || !form.name.trim()) return;
    setSaving(true);
    const body = {
      name: form.name.trim(),
      kind: form.kind,
      category: placeKind(form.kind).category,
      note: form.note.trim(),
      typicalAmount: Number(form.typicalAmount) || 0,
      currency,
      mapsPlaceId: form.mapsPlaceId,
      address: form.address,
      lat: form.lat,
      lng: form.lng,
      mapsUrl: form.mapsUrl,
    };
    try {
      const out = editing
        ? await api.updateSavedPlace(groupId, editing.id, body)
        : await api.createSavedPlace(groupId, body);
      onSaved(normSavedPlace(out.place), !editing);
      onClose();
    } catch (err) {
      toast({ tone: 'error', title: 'Could not save', description: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await api.deleteSavedPlace(groupId, editing.id);
      onDeleted(editing.id);
      onClose();
    } catch (err) {
      toast({ tone: 'error', title: 'Could not remove', description: err.message });
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={editing ? 'Edit place' : 'Save a place'}
        subtitle="Restaurants, shops, the landlord, the grocer"
        footer={
          <Button size="lg" block loading={saving} disabled={!form.name.trim()} onClick={save}>
            {editing ? 'Save changes' : 'Save place'}
          </Button>
        }
      >
        <div className="space-y-4">
          <PlaceSearch
            value={form}
            onPick={pickFromMaps}
            onClear={() =>
              set({ mapsPlaceId: '', address: '', lat: null, lng: null, mapsUrl: '' })
            }
            /* Only auto-fill the name if the field is still empty — someone who
               typed "Rahul (scooters)" means that, not the shop's registered
               name. */
            onTypedName={(name) => !form.name.trim() && set({ name })}
          />

          <Input
            label="Name"
            value={form.name}
            placeholder="Sagar Ratna"
            onChange={(e) => set({ name: e.target.value })}
          />
          <Picker
            label="What is it"
            value={form.kind}
            onChange={(v) => set({ kind: v })}
            options={PLACE_KINDS.map((k) => ({
              value: k.value,
              label: `${k.emoji}  ${k.label}`,
            }))}
          />
          <Input
            label="Typical spend"
            hint="Optional — pre-fills the amount"
            inputMode="decimal"
            value={form.typicalAmount}
            placeholder="0"
            onChange={(e) => set({ typicalAmount: e.target.value })}
          />
          <Input
            label="Note"
            value={form.note}
            placeholder="Ask for the corner table"
            onChange={(e) => set({ note: e.target.value })}
          />

          {hasLocation(form) && (
            <div className="flex gap-2">
              {/*
               * `api=1` links, opened in a new context. On a phone with Google
               * Maps installed the OS hands these straight to the app, which is
               * the whole point — no app-detection, no deep-link guesswork.
               */}
              <Button
                variant="soft"
                icon={Navigation}
                className="flex-1"
                as="a"
                href={directionsLink(form)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Directions
              </Button>
              <Button
                variant="ghost"
                icon={ExternalLink}
                className="flex-1"
                as="a"
                href={placeLink(form)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in Maps
              </Button>
            </div>
          )}

          {editing && (
            <Button
              block
              variant="ghost"
              icon={Trash2}
              className="text-neg"
              onClick={() => setConfirmDelete(true)}
            >
              Remove this place
            </Button>
          )}
        </div>
      </Sheet>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Remove this place?"
        body="Expenses you already added from it are unaffected."
        confirmLabel="Remove"
        danger
      />
    </>
  );
}

export default function PlacesPanel({ groupId, places, currency, onChange, onOpenExpense, loading }) {
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState(null);

  /* Most-used first, then most recently touched. */
  const sorted = useMemo(
    () =>
      [...places].sort(
        (a, b) =>
          b.useCount - a.useCount ||
          new Date(b.lastUsedAt || b.createdAt) - new Date(a.lastUsedAt || a.createdAt),
      ),
    [places],
  );

  const regulars = sorted.filter((p) => p.useCount >= 3);

  function start(place) {
    onOpenExpense({
      groupId,
      description: place.name,
      category: place.category,
      amount: place.typicalAmount || undefined,
    });
    /* Fire-and-forget: the count is a sort hint, and a failed bump must not
       interrupt the thing the user actually pressed. */
    api
      .updateSavedPlace(groupId, place.id, { used: true })
      .then(({ place: updated }) => onChange.updated(normSavedPlace(updated)))
      .catch(() => {});
  }

  function open(place = null) {
    setEditing(place);
    setSheet(true);
  }

  return (
    <div className="space-y-4">
      <Button block icon={Plus} onClick={() => open()}>
        Save a place or vendor
      </Button>

      {loading ? (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[92px] animate-pulse rounded-[20px] bg-surface-2" />
          ))}
        </div>
      ) : !places.length ? (
        <Card tone="soft" pad={false}>
          <EmptyState
            icon={MapPin}
            title="No saved places"
            body="Save the places you keep spending at. Tapping one starts a bill with its name and usual amount already in."
          />
        </Card>
      ) : (
        <>
          {regulars.length > 0 && (
            <p className="newq px-1 text-[11.5px] uppercase tracking-[0.08em] text-ink-3">
              Your regulars
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <AnimatePresence initial={false}>
              {sorted.map((place, i) => {
                const kind = placeKind(place.kind);
                return (
                  <motion.div
                    key={place.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.26, delay: Math.min(i * 0.02, 0.2), ease: EASE }}
                    className="relative"
                  >
                    <button
                      type="button"
                      onClick={() => start(place)}
                      className="flex h-full w-full flex-col gap-1.5 rounded-[20px] bg-surface px-3.5 py-3.5 text-left tap active:scale-[0.98]"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="grid size-9 shrink-0 place-items-center rounded-[13px] bg-surface-2 text-[17px]">
                          {kind.emoji}
                        </span>
                        {place.useCount >= 3 && (
                          <Star size={12} strokeWidth={2.6} className="mt-1 shrink-0 text-brand" />
                        )}
                      </span>

                      <span className="newq mt-0.5 line-clamp-2 text-[13.5px] leading-snug text-ink">
                        {place.name}
                      </span>

                      {place.address && (
                        <span className="newq -mt-0.5 line-clamp-1 text-[11px] text-ink-3">
                          {place.address}
                        </span>
                      )}

                      <span className="mt-auto flex flex-wrap items-center gap-1 pr-8">
                        {place.typicalAmount > 0 && (
                          <span className="num text-[11.5px] text-ink-3">
                            ~{money(place.typicalAmount, place.currency || currency, { compact: true })}
                          </span>
                        )}
                        {place.useCount > 0 && (
                          <Badge tone="neutral">{place.useCount}x</Badge>
                        )}
                      </span>
                    </button>

                    {/* Always visible, not hover-revealed: this is a phone
                        app first, and a control that only appears on hover is
                        a control that does not exist on a touchscreen. */}
                    <button
                      type="button"
                      aria-label={`Edit ${place.name}`}
                      onClick={() => open(place)}
                      className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full
                        text-ink-3 tap hover:bg-surface-2 hover:text-ink"
                    >
                      <span className="text-[15px] leading-none">···</span>
                    </button>

                    {/* Directions without opening anything first. Sitting on
                        the card rather than behind the edit sheet is the whole
                        difference between "saved" and "useful when you are
                        standing outside trying to find it". */}
                    {hasLocation(place) && (
                      <a
                        href={directionsLink(place)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Directions to ${place.name}`}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full
                          bg-brand-soft text-ink tap active:scale-90"
                      >
                        <Navigation size={13} strokeWidth={2.6} />
                      </a>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          <p className="newq flex items-center gap-1.5 px-1 text-[11.5px] text-ink-3">
            <Receipt size={11} strokeWidth={2.4} />
            Tap a place to start a bill from it
          </p>
        </>
      )}

      <PlaceSheet
        open={sheet}
        onClose={() => setSheet(false)}
        groupId={groupId}
        currency={currency}
        editing={editing}
        onSaved={(place, created) => (created ? onChange.added(place) : onChange.updated(place))}
        onDeleted={onChange.removed}
      />
    </div>
  );
}
