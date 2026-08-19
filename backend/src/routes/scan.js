const express = require('express');
const { ScanUsage } = require('../models');
const { requireAuth, asyncHandler } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const { scanReceipt, scanEnabled } = require('../utils/scan');

const router = express.Router();
router.use(requireAuth);

/*
 * A scan response is the itemised contents of one person's shopping, and the
 * remaining-quota figure is per account. Neither is cacheable by anything in
 * between — the opposite of rates.js, which caches because FX rates are
 * public and impersonal.
 */
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/* -------------------------------------------------------------- the limits */

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** Per account, per rolling day and hour. */
const PER_DAY = 20;
const PER_HOUR = 6;
/** Whole-server ceiling, so one runaway client cannot spend the month's budget. */
const GLOBAL_PER_DAY = Number(process.env.SCAN_DAILY_LIMIT) || 300;

const dayKey = () => new Date().toISOString().slice(0, 10);

/**
 * One scan at a time per account.
 *
 * A scan takes ten seconds or more, so a check-then-call quota would let a
 * handful of parallel sockets all pass the check before any of them counted.
 * This is the cheap half of that fix; the atomic `$inc` below is the rest.
 */
const inFlight = new Set();

/**
 * Reserve a scan before making the call, never after.
 *
 * Refunded only when the request never left this process — refunding on a
 * model-side failure would turn a bad image into an unlimited retry loop.
 */
async function reserve(userId) {
  const day = dayKey();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const globalRow = await ScanUsage.findOneAndUpdate(
    { user: null, day },
    { $inc: { count: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  if (globalRow.count > GLOBAL_PER_DAY) {
    throw new HttpError(429, 'Scanning is busy right now — try again later');
  }

  const row = await ScanUsage.findOneAndUpdate(
    { user: userId, day },
    { $inc: { count: 1 }, $push: { at: { $each: [new Date()], $slice: -PER_HOUR } } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  if (row.count > PER_DAY) {
    throw new HttpError(429, "You have used today's scans — type the items in, or try tomorrow");
  }
  const recent = (row.at || []).filter((t) => t > hourAgo);
  if (recent.length > PER_HOUR) {
    throw new HttpError(429, 'That is a lot of scans in one hour — try again shortly');
  }

  return { day, used: row.count };
}

const refund = (userId) =>
  Promise.all([
    ScanUsage.updateOne({ user: userId, day: dayKey() }, { $inc: { count: -1 } }),
    ScanUsage.updateOne({ user: null, day: dayKey() }, { $inc: { count: -1 } }),
  ]).catch(() => {});

/* -------------------------------------------------------------- validation */

function readImages(body) {
  const images = Array.isArray(body?.images) ? body.images : [];
  if (!images.length) throw new HttpError(400, 'Add a photo to read');
  if (images.length > MAX_IMAGES) {
    throw new HttpError(400, `Up to ${MAX_IMAGES} photos at a time`);
  }

  let total = 0;
  return images.map((image, index) => {
    const mediaType = String(image?.mediaType || image?.media_type || '').toLowerCase();
    if (!MEDIA_TYPES.has(mediaType)) {
      throw new HttpError(400, `Photo ${index + 1} is not a JPEG, PNG or WebP`);
    }

    const data = String(image?.data || '');
    if (data.length < 1000 || !BASE64_RE.test(data)) {
      throw new HttpError(400, `Photo ${index + 1} could not be read`);
    }

    // 4 base64 characters carry 3 bytes.
    const bytes = Math.floor((data.length * 3) / 4);
    if (bytes > MAX_IMAGE_BYTES) {
      throw new HttpError(413, `Photo ${index + 1} is too large — take a screenshot of it instead`);
    }
    total += bytes;
    if (total > MAX_TOTAL_BYTES) throw new HttpError(413, 'Those photos are too large together');

    return { mediaType, data };
  });
}

/* ------------------------------------------------------------------ routes */

/**
 * Whether this server can scan at all, and how much of today is left.
 *
 * The sheet asks before it offers the button, so a server with no API key
 * simply does not show a control that could only fail.
 */
router.get(
  '/status',
  asyncHandler(async (req, res) => {
    if (!scanEnabled) return res.json({ enabled: false, remainingToday: 0 });

    const row = await ScanUsage.findOne({ user: req.userId, day: dayKey() }).select('count');
    res.json({
      enabled: true,
      remainingToday: Math.max(0, PER_DAY - (row?.count || 0)),
    });
  }),
);

router.post(
  '/receipt',
  asyncHandler(async (req, res) => {
    if (!scanEnabled) {
      throw new HttpError(
        503,
        'Scanning is not set up on this server — type the items in below',
        { expose: true },
      );
    }

    const images = readImages(req.body);
    const currency = /^[A-Z]{3}$/.test(String(req.body?.currency || '').toUpperCase())
      ? String(req.body.currency).toUpperCase()
      : null;

    if (inFlight.has(req.userId)) {
      throw new HttpError(429, 'A scan is already running');
    }
    inFlight.add(req.userId);

    // Hang up on the model if the phone gave up waiting.
    const controller = new AbortController();
    req.on('close', () => controller.abort());

    let reserved = false;
    try {
      await reserve(req.userId);
      reserved = true;

      const result = await scanReceipt(images, { currency, signal: controller.signal });
      res.json(result);
    } catch (err) {
      // Our own refusals carry their own status and message already.
      if (err instanceof HttpError) throw err;

      if (reserved) await refund(req.userId);
      if (err.name === 'AbortError' || controller.signal.aborted) return;

      /*
       * Everything below is the SDK's. Its errors must never be forwarded as
       * they are: an upstream 401 for a bad API key would reach the client as
       * a 401, which every Splitta screen reads as "your session died" and
       * acts on by signing the person out. A server misconfiguration would
       * log out the whole userbase.
       */
      const upstream = err.status || err.statusCode;
      console.error('[scan] upstream failed:', upstream, err.message);

      if (upstream === 401 || upstream === 403) {
        throw new HttpError(503, 'Scanning is not configured correctly on this server', {
          expose: true,
        });
      }
      if (upstream === 429) {
        throw new HttpError(429, 'The reader is busy — try again in a moment');
      }
      if (upstream === 400 || upstream === 422) {
        throw new HttpError(422, 'That photo could not be read — try a clearer one');
      }
      throw new HttpError(502, 'Could not read that photo — try again, or type the items in', {
        expose: true,
      });
    } finally {
      inFlight.delete(req.userId);
    }
  }),
);

module.exports = router;
