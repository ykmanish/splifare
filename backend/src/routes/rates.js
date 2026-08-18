const express = require('express');
const { requireAuth, asyncHandler } = require('../middleware/auth');
const { getRates, SUPPORTED } = require('../utils/fx');

const router = express.Router();
router.use(requireAuth);

/**
 * Live rate table for one base currency.
 *
 * The client asks for its own display currency and converts every foreign
 * amount locally, so this is one small request per session rather than one
 * per expense. `stale: true` means every source was unreachable and these
 * are the newest rates on file.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const base = String(req.query.base || req.user.currency || 'INR').toUpperCase();
    const table = await getRates(base, req.query.date);

    res.set('Cache-Control', 'private, max-age=300');
    res.json({ ...table, supported: SUPPORTED });
  }),
);

module.exports = router;
