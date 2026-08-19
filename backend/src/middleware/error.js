function notFound(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => e.message);
    return res.status(422).json({ error: 'Validation failed', details });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: `Malformed ${err.path}` });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || { field: 1 })[0];
    return res.status(409).json({ error: `That ${field} is already taken` });
  }

  const status = err.status || 500;
  if (status >= 500) console.error('[500]', err.stack || err);

  const dev = process.env.NODE_ENV !== 'production';
  res.status(status).json({
    // A 5xx message is hidden by default — it usually names something
    // internal. `expose` is for the few that are written for the user, like
    // "scanning is not set up on this server".
    error: status >= 500 && !err.expose ? 'Something went wrong on our end' : err.message,
    ...(status >= 500 && dev ? { message: err.message, stack: err.stack?.split('\n').slice(0, 5) } : {}),
  });
}

/**
 * Throwable HTTP error.
 *
 * Pass `{ expose: true }` when a 5xx message is meant for the person rather
 * than the log — otherwise the handler above replaces it.
 */
class HttpError extends Error {
  constructor(status, message, options = {}) {
    super(message);
    this.status = status;
    if (options.expose) this.expose = true;
  }
}

module.exports = { notFound, errorHandler, HttpError };
