'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronRight,
  ExternalLink,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  Receipt,
  Trash2,
} from 'lucide-react';
import Sheet, { ConfirmSheet } from '@/components/ui/Sheet';
import Button from '@/components/ui/Button';
import Picker from '@/components/ui/Picker';
import { Input } from '@/components/ui/Field';
import { Card, EmptyState } from '@/components/ui/Bits';
import { FieldRow, GroupLabel, ListGroup } from '@/components/ui/Blocks';
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
 * Tapping a place opens its detail — map, address, directions, what you
 * usually spend — with "start a bill from here" as the primary action from
 * there. Going straight to the expense sheet was one tap faster and left
 * nowhere to simply look a place up, which is most of why you saved it.
 *
 * There was a "times used" counter ranking this list. It is gone, and
 * deliberately not replaced with a fixed version: it counted the expense sheet
 * *opening* rather than a bill being saved, so backing out still scored, and
 * it was driving a visible ranking off a number nobody could check. A list you
 * scan by name belongs in name order.
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

/**
 * Everything known about one place, before you commit to a bill.
 *
 * Tapping a card used to fire the expense sheet straight away, which made the
 * list a one-trick shortcut — there was nowhere to simply *look* at a place,
 * check the address, or get directions to it. Starting a bill is still the
 * primary action here, it just is not the only one any more.
 */
function PlaceDetailSheet({ place, onClose, onStartBill, onEdit, currency }) {
  if (!place) return null;

  const kind = placeKind(place.kind);
  const located = hasLocation(place);
  const mapUrl = embedMapUrl(place);

  return (
    <Sheet
      open={!!place}
      onClose={onClose}
      title={place.name}
      subtitle={kind.label}
      footer={
        <Button size="lg" block icon={Receipt} onClick={() => onStartBill(place)}>
          Start a bill from here
        </Button>
      }
    >
      <div className="space-y-4">
        {mapUrl && (
          <div className="relative h-44 w-full overflow-hidden rounded-[20px] bg-surface-2">
            <iframe
              title={`Map of ${place.name}`}
              src={mapUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              scrolling="no"
              className="absolute inset-0 size-full border-0"
            />
          </div>
        )}

        {place.address && (
          <div className="flex items-start gap-2.5 rounded-[18px] bg-surface-2 px-4 py-3">
            <MapPin size={15} strokeWidth={2.4} className="mt-0.5 shrink-0 text-brand" />
            <p className="newq min-w-0 flex-1 text-[13px] leading-snug text-ink-2">
              {place.address}
            </p>
          </div>
        )}

        {located && (
          <div className="flex gap-2">
            <Button
              variant="soft"
              icon={Navigation}
              className="flex-1"
              as="a"
              href={directionsLink(place)}
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
              href={placeLink(place)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Maps
            </Button>
          </div>
        )}

        {place.note && (
          <div>
            <GroupLabel>Note</GroupLabel>
            <Card tone="soft">
              <p className="newq text-[13.5px] leading-relaxed text-ink">{place.note}</p>
            </Card>
          </div>
        )}

        {place.typicalAmount > 0 && (
          <div>
            <GroupLabel>Detail</GroupLabel>
            <ListGroup>
              <FieldRow
                label="Typical spend"
                value={money(place.typicalAmount, place.currency || currency)}
              />
            </ListGroup>
          </div>
        )}

        <Button block variant="ghost" icon={Pencil} onClick={() => onEdit(place)}>
          Edit this place
        </Button>
      </div>
    </Sheet>
  );
}

export default function PlacesPanel({ groupId, places, currency, onChange, onOpenExpense, loading }) {
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);

  /*
   * Alphabetical.
   *
   * This used to rank by a "times used" counter, which turned out to measure
   * the wrong thing: it incremented when the expense sheet *opened*, so
   * changing your mind still counted, and the order was quietly wrong. A list
   * you scan by name is better served by being in name order anyway — it does
   * not reshuffle under you, and you can find somewhere without hunting.
   */
  const sorted = useMemo(
    () => [...places].sort((a, b) => a.name.localeCompare(b.name)),
    [places],
  );

  function start(place) {
    onOpenExpense({
      groupId,
      description: place.name,
      category: place.category,
      amount: place.typicalAmount || undefined,
    });
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
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-[20px] bg-surface-2" />
          ))}
        </div>
      ) : !places.length ? (
        <Card tone="soft" pad={false}>
          <EmptyState
            icon={MapPin}
            title="No saved places"
            body="Save the places you keep spending at, then start a bill from one in two taps — name, category and usual amount already filled."
          />
        </Card>
      ) : (
        <>
          {/*
           * Full-width rows rather than a two-column grid.
           *
           * The tiles were losing the thing that makes a saved place worth
           * having — its address — to a `line-clamp-1` about forty characters
           * too short. A row has the width to show where somewhere actually
           * is, which is the difference between a list of names and a list of
           * places.
           */}
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {sorted.map((place, i) => {
                const kind = placeKind(place.kind);
                const located = hasLocation(place);
                return (
                  <motion.div
                    key={place.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.26, delay: Math.min(i * 0.02, 0.2), ease: EASE }}
                    className="relative"
                  >
                    <button
                      type="button"
                      onClick={() => setDetail(place)}
                      className="flex w-full items-center gap-3 rounded-[20px] bg-surface px-3.5 py-3
                        text-left tap active:scale-[0.99]"
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-[15px] bg-surface-2 text-[19px]">
                        {kind.emoji}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="newq block truncate text-[14.5px] text-ink">
                          {place.name}
                        </span>

                        <span className="newq mt-0.5 block truncate text-[11.5px] text-ink-3">
                          {place.address || kind.label}
                        </span>

                        {place.typicalAmount > 0 && (
                          <span className="num mt-1 block text-[11.5px] text-ink-3">
                            ~{money(place.typicalAmount, place.currency || currency, { compact: true })}
                          </span>
                        )}
                      </span>

                      {/* Room is kept for the directions button whether or not
                          this place has a pin, so names do not shift about
                          between rows. */}
                      <span className="w-9 shrink-0" />
                      <ChevronRight size={16} strokeWidth={2.4} className="shrink-0 text-ink-3" />
                    </button>

                    {/* One tap to navigate, without opening anything first —
                        the difference between "saved" and "useful when you are
                        standing outside trying to find it". */}
                    {located && (
                      <a
                        href={directionsLink(place)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Directions to ${place.name}`}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-9 top-1/2 grid size-9 -translate-y-1/2 place-items-center
                          rounded-full bg-brand-soft text-ink tap active:scale-90"
                      >
                        <Navigation size={14} strokeWidth={2.6} />
                      </a>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </>
      )}

      <PlaceDetailSheet
        place={detail}
        currency={currency}
        onClose={() => setDetail(null)}
        onStartBill={(place) => {
          setDetail(null);
          start(place);
        }}
        onEdit={(place) => {
          setDetail(null);
          open(place);
        }}
      />

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
