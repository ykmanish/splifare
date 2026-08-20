/**
 * Google Maps, used through its URLs rather than its SDK.
 *
 * The Maps JavaScript SDK is roughly half a megabyte and wants to own a DOM
 * node; none of what this app needs justifies that. Three plain HTTPS
 * endpoints cover the lot:
 *
 *  · **Places API (New)** — one `fetch` for search, returns JSON with CORS.
 *  · **Maps Embed API** — an `<iframe>` for the map view. Unmetered, and it
 *    renders the real interactive map with no script at all.
 *  · **Universal cross-platform links** — `/maps/dir/?api=1&…` opens the
 *    Google Maps *app* on a phone that has it and the website everywhere
 *    else, which is exactly the "open the maps app" behaviour people expect
 *    and is impossible to get from the SDK.
 *
 * Every function degrades: without a key, search returns a clear error and
 * the map view hides itself, but saving a place by name still works. The
 * feature is an accelerator, never a gate.
 */

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export const mapsEnabled = () => Boolean(KEY);

export class MapsError extends Error {}

/**
 * The fields worth paying for.
 *
 * Places API (New) bills by field mask, so asking for everything on a search
 * that exists to fill in a name and a pin is money spent on nothing. These
 * six are what the app actually stores and shows.
 */
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.googleMapsUri',
  'places.primaryTypeDisplayName',
].join(',');

/**
 * A location bias, but only if the browser has *already* been granted
 * permission.
 *
 * Searching "the canteen" is far better with a bias, but not so much better
 * that it is worth a permission prompt interrupting someone halfway through
 * saving a restaurant. If they granted location for something else, use it;
 * otherwise search plainly.
 */
async function silentLocationBias() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' });
    if (status?.state !== 'granted') return null;
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          circle: {
            center: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
            radius: 20000,
          },
        }),
      () => resolve(null),
      { timeout: 3000, maximumAge: 600000 },
    );
  });
}

/**
 * Search Google for a place.
 *
 * Returns `[{ id, name, address, lat, lng, mapsUrl, kindLabel }]`.
 */
export async function searchPlaces(query, { signal } = {}) {
  const text = String(query || '').trim();
  if (!text) return [];
  if (!KEY) throw new MapsError('No Google Maps key is configured for this build.');

  const locationBias = await silentLocationBias();

  let res;
  try {
    res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: text,
        maxResultCount: 6,
        ...(locationBias ? { locationBias } : {}),
      }),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new MapsError('Could not reach Google Maps.');
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const message = detail?.error?.message || '';
    /* The two failures that actually happen in practice, named plainly —
       "request failed" would send someone hunting through their code when the
       fix is two clicks in the Cloud console. */
    if (res.status === 403 || /API key|referer|not authorized/i.test(message)) {
      throw new MapsError(
        'Google rejected the key — check that Places API (New) is enabled and this site is an allowed referrer.',
      );
    }
    throw new MapsError(message || `Google Maps search failed (${res.status})`);
  }

  const data = await res.json();
  return (data.places || []).map((p) => ({
    id: p.id,
    name: p.displayName?.text || '',
    address: p.formattedAddress || '',
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    mapsUrl: p.googleMapsUri || '',
    kindLabel: p.primaryTypeDisplayName?.text || '',
  }));
}

/** A canonical link to the place, preferring Google's own permalink. */
export function placeLink(place) {
  if (!place) return '';
  if (place.mapsUrl) return place.mapsUrl;
  if (place.mapsPlaceId) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      place.name || '',
    )}&query_place_id=${place.mapsPlaceId}`;
  }
  if (place.lat != null && place.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  }
  if (place.name) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`;
  }
  return '';
}

/**
 * Turn-by-turn to the place.
 *
 * `api=1` links are the documented cross-platform form: on Android and iOS
 * with Google Maps installed the OS hands them to the app, and everywhere
 * else they open the site. No app-detection guesswork, no `intent://`.
 */
export function directionsLink(place) {
  if (!place) return '';
  const destination =
    place.lat != null && place.lng != null
      ? `${place.lat},${place.lng}`
      : encodeURIComponent(place.name || '');
  if (!destination) return '';

  const placeId = place.mapsPlaceId ? `&destination_place_id=${place.mapsPlaceId}` : '';
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}${placeId}`;
}

/**
 * An embedded interactive map, or empty when there is nothing to show.
 *
 * Prefers the place id: coordinates alone drop a bare pin, whereas the id
 * brings the place card — name, rating, photos — which is the difference
 * between a map and a useful one.
 */
export function embedMapUrl(place, { zoom = 16 } = {}) {
  if (!KEY || !place) return '';
  const base = 'https://www.google.com/maps/embed/v1/place';

  if (place.mapsPlaceId) {
    return `${base}?key=${KEY}&q=place_id:${place.mapsPlaceId}&zoom=${zoom}`;
  }
  if (place.lat != null && place.lng != null) {
    return `${base}?key=${KEY}&q=${place.lat},${place.lng}&zoom=${zoom}`;
  }
  if (place.name) {
    return `${base}?key=${KEY}&q=${encodeURIComponent(place.name)}`;
  }
  return '';
}

/** True once a saved place has enough to put on a map. */
export const hasLocation = (place) =>
  Boolean(place && (place.mapsPlaceId || (place.lat != null && place.lng != null)));
