const jwt = require('jsonwebtoken');
const { User } = require('../models');

function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
}

/** Requires a valid bearer token and attaches req.user. */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not signed in' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    // A closed account keeps its row so history still resolves, but its
    // outstanding tokens must stop working — the same message as a missing
    // row, so the client's existing 401 handling needs no new branch.
    if (user.deletedAt) return res.status(401).json({ error: 'Account no longer exists' });

    req.user = user;
    req.userId = String(user._id);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired — sign in again' });
    }
    return res.status(401).json({ error: 'Invalid session' });
  }
}

/** Wraps an async handler so rejections reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { signToken, requireAuth, asyncHandler };
