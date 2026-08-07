const dns = require('node:dns');
const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

/**
 * Some machines (notably Windows boxes whose only resolver is an IPv6
 * link-local router) leave Node's c-ares resolver unable to do the SRV
 * lookup that mongodb+srv:// needs, even though the OS resolver is fine.
 * Falling back to public resolvers fixes it without changing the URI.
 */
const FALLBACK_DNS = (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const isSrvFailure = (err) =>
  /querySrv|queryTxt|ENOTFOUND|ECONNREFUSED|EREFUSED|ESERVFAIL/i.test(err?.message || '');

function attachListeners() {
  mongoose.connection.on('connected', () => {
    console.log(`  MongoDB connected → ${mongoose.connection.name}`);
  });
  mongoose.connection.on('error', (err) => {
    console.error('  MongoDB error:', err.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('  MongoDB disconnected');
  });
}

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set — copy .env.example to .env and fill it in.');
  }

  attachListeners();

  const options = { serverSelectionTimeoutMS: 20000, maxPoolSize: 10 };

  try {
    await mongoose.connect(uri, options);
  } catch (err) {
    if (!uri.startsWith('mongodb+srv://') || !isSrvFailure(err)) throw err;

    console.warn(`  SRV lookup failed (${err.message}) — retrying via ${FALLBACK_DNS.join(', ')}`);
    dns.setServers(FALLBACK_DNS);
    await mongoose.connect(uri, options);
  }

  return mongoose.connection;
}

module.exports = { connectDB };
