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
    error: status >= 500 ? 'Something went wrong on our end' : err.message,
    ...(status >= 500 && dev ? { message: err.message, stack: err.stack?.split('\n').slice(0, 5) } : {}),
  });
}

/** Throwable HTTP error. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { notFound, errorHandler, HttpError };
