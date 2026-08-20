'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, MapPin, Navigation, Search, X } from 'lucide-react';
import { Label } from '@/components/ui/Field';
import { MapsError, embedMapUrl, mapsEnabled, searchPlaces } from '@/lib/maps';

/**
 * Look a place up on Google, keep the pin.
 *
 * Typing a name is still allowed and always was — this only removes the part
 * nobody enjoys, which is typing the address and then still not being able to
 * navigate to it. Picking a result attaches Google's place id, and everything
 * downstream (the map, the directions link, the "open in the app" behaviour)
 * falls out of that one identifier.
 *
 * Degrades on purpose. No key, a rejected key, an offline phone: the field
 * turns back into a plain text input and saving still works.
 */

const DEBOUNCE_MS = 350;

export default function PlaceSearch({ value, onPick, onClear, onTypedName }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const abortRef = useRef(null);
  const timerRef = useRef(null);

  const enabled = mapsEnabled();

  const run = useCallback(async (text) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setError('');
    try {
      const found = await searchPlaces(text, { signal: controller.signal });
      setResults(found);
      setOpen(true);
      if (!found.length) setError('Nothing found — you can still type the name yourself.');
    } catch (err) {
      if (err.name === 'AbortError') return;
      setResults([]);
      setError(err instanceof MapsError ? err.message : 'Search is unavailable right now.');
    } finally {
      setSearching(false);
    }
  }, []);

  /*
   * Below this the query is noise — "ca" matches half the planet, and Places
   * bills per call.
   */
  const canSearch = query.trim().length >= 3;

  /* Debounced, and every keystroke cancels the request in flight, so a
     six-letter name costs one search rather than six. */
  useEffect(() => {
    if (!enabled || !canSearch) return undefined;
    const text = query.trim();
    timerRef.current = setTimeout(() => run(text), DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [query, canSearch, enabled, run]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /* Already picked: show the pin and its map instead of the search field. */
  if (value?.mapsPlaceId || value?.lat != null) {
    const mapUrl = embedMapUrl(value);
    return (
      <div>
        <Label>Location</Label>
        <div className="overflow-hidden rounded-[20px] bg-surface-2">
          {/*
           * Address above the map, deliberately.
           *
           * The Maps Embed API is a separately-enabled product, and a key that
           * is fine for Places search can still be refused here — in which
           * case Google renders a wall of explanatory text *inside* the frame,
           * which is cross-origin and cannot be styled or suppressed. Putting
           * the pin first means that failure costs a scruffy thumbnail rather
           * than burying the address and the buttons that still work.
           */}
          <div className="flex items-start gap-2.5 px-4 py-3">
            <MapPin size={15} strokeWidth={2.4} className="mt-0.5 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="newq truncate text-[13.5px] text-ink">{value.name}</p>
              {value.address && (
                <p className="newq mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-ink-3">
                  {value.address}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Remove location"
              onClick={onClear}
              className="grid size-7 shrink-0 place-items-center rounded-full text-ink-3 tap hover:bg-surface"
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>

          {mapUrl && (
            <div className="relative h-36 w-full overflow-hidden border-t border-line">
              <iframe
                title={`Map of ${value.name || 'the place'}`}
                src={mapUrl}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                /* Deprecated, but still honoured everywhere and the only lever
                   that stops a cross-origin error page growing its own
                   scrollbar inside the card. */
                scrolling="no"
                className="absolute inset-0 size-full border-0"
              />
            </div>
          )}
        </div>

        {/*
         * Only the person who owns the key can act on this, so it stays out of
         * the production bundle rather than telling end users to go and edit a
         * Cloud console they have never heard of.
         */}
        {mapUrl && process.env.NODE_ENV === 'development' && (
          <p className="newq mt-1.5 px-1 text-[11px] leading-snug text-ink-3">
            No map above? Enable <span className="text-ink">Maps Embed API</span> for this key —
            it is a separate product from Places API.
          </p>
        )}
      </div>
    );
  }

  if (!enabled) return null;

  return (
    <div>
      <Label hint="Optional">Find it on Google Maps</Label>
      <div className="relative">
        <Search
          size={17}
          strokeWidth={2.2}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search a restaurant, shop, address…"
          className="newq h-13 w-full rounded-[14px] bg-surface-2 pl-11.5 pr-11 text-[15px]
            text-ink outline-none placeholder:text-ink-3 focus:shadow-[inset_0_0_0_1.5px_var(--brand)]"
        />
        {searching && (
          <Loader2
            size={16}
            className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-ink-3"
          />
        )}
      </div>

      {canSearch && error && <p className="newq mt-1.5 px-1 text-[11.5px] leading-snug text-ink-3">{error}</p>}

      <AnimatePresence>
        {open && canSearch && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="mt-2 overflow-hidden rounded-[16px] bg-surface"
          >
            {results.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onPick(r);
                  /* Fill the name field too, unless the user already typed
                     one they prefer — "Rahul (scooters)" beats the shop's
                     registered name every time. */
                  onTypedName?.(r.name);
                  setOpen(false);
                  setQuery('');
                  setResults([]);
                }}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left tap hover:bg-surface-2
                  ${i ? 'border-t border-line' : ''}`}
              >
                <Navigation size={14} strokeWidth={2.4} className="mt-1 shrink-0 text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="newq block truncate text-[13.5px] text-ink">{r.name}</span>
                  <span className="newq mt-0.5 block truncate text-[11.5px] text-ink-3">
                    {[r.kindLabel, r.address].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
