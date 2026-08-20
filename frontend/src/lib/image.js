/**
 * Getting a phone photo small enough to send.
 *
 * A modern phone camera produces something like 4000×3000 and 4–6 MB. A
 * vision model gains nothing from that — it downsamples anyway — so shipping
 * the original only buys upload time on a phone connection and a bigger
 * request to reject. Everything here happens before the bytes leave the
 * device, and the result is thrown away as soon as the scan comes back.
 */

/**
 * Long edge, in pixels, after downscaling.
 *
 * 1568 is the point past which the vision model resizes internally, so a
 * larger image costs upload bandwidth and buys no extra detail. Receipt text
 * survives it: a full-width receipt photographed at arm's length still lands
 * around 8–10 px per character, well above the ~6 px where digits start to
 * confuse.
 */
const MAX_EDGE = 1568;

/** JPEG quality. Above ~0.85 the file grows fast for detail OCR cannot use. */
const QUALITY = 0.82;

/** Anything bigger than this is refused before we even try to decode it. */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export class ImageError extends Error {}

const canDecode = () => typeof createImageBitmap === 'function' && typeof document !== 'undefined';

/**
 * Decode to a bitmap with EXIF rotation already applied.
 *
 * `imageOrientation: 'from-image'` is the load-bearing option: without it a
 * photo taken in portrait decodes sideways, and a sideways receipt reads far
 * worse. Safari ignored the flag for a long time but applies orientation by
 * default, so both paths end up upright.
 */
async function decode(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    // Chrome and Firefox on desktop cannot decode HEIC — the codec belongs to
    // the OS, and only Apple's platforms ship it. Nothing to do but say so.
    throw new ImageError(
      /heic|heif/i.test(blob.type)
        ? 'This phone saved the photo as HEIC, which this browser cannot open. Try sharing it as JPEG.'
        : 'That image could not be opened.',
    );
  }
}

/**
 * A downscaled JPEG of `blob`, as `{ base64, mediaType, width, height, bytes }`.
 *
 * Returns base64 without the `data:` prefix, which is the shape the API wants.
 */
export async function prepareImage(blob, { maxEdge = MAX_EDGE, quality = QUALITY } = {}) {
  if (!blob) throw new ImageError('No image to read.');
  if (!canDecode()) throw new ImageError('This browser cannot process images.');
  if (blob.size > MAX_INPUT_BYTES) {
    throw new ImageError('That image is too large — try a screenshot or a smaller photo.');
  }

  const bitmap = await decode(blob);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  // A receipt is dark text on white. Without this the transparent canvas
  // flattens to black behind any alpha channel and the text disappears.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!out) throw new ImageError('That image could not be converted.');

  const base64 = await blobToBase64(out);
  // Release the backing store now rather than waiting for a GC that may not
  // come before the next few images are decoded.
  canvas.width = 0;
  canvas.height = 0;

  return { base64, mediaType: 'image/jpeg', width, height, bytes: out.size };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new ImageError('That image could not be read.'));
    reader.onload = () => {
      const url = String(reader.result || '');
      const comma = url.indexOf(',');
      resolve(comma === -1 ? '' : url.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/** A small object URL for the review thumbnail. Revoke it when done. */
export const previewUrl = (blob) => URL.createObjectURL(blob);

/**
 * A timeline-sized `data:` URL, small enough to live inside a document.
 *
 * Receipt scanning wants every pixel the vision model can use; a memory photo
 * is displayed at roughly 160 px on a phone and stored in Mongo rather than a
 * bucket, so the trade runs the other way. 900 px at 0.72 lands around 60–90 KB
 * — under the route's cap with room for a photo that happens to be busy.
 */
export async function prepareThumb(blob) {
  const { base64, mediaType } = await prepareImage(blob, { maxEdge: 900, quality: 0.72 });
  return `data:${mediaType};base64,${base64}`;
}
