require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');

const { connectDB } = require('./src/config/db');
const { initRealtime } = require('./src/realtime');
const { notFound, errorHandler } = require('./src/middleware/error');

const authRoutes = require('./src/routes/auth');
const friendRoutes = require('./src/routes/friends');
const groupRoutes = require('./src/routes/groups');
const expenseRoutes = require('./src/routes/expenses');
const settlementRoutes = require('./src/routes/settlements');
const listRoutes = require('./src/routes/lists');
const feedRoutes = require('./src/routes/feed');
const rateRoutes = require('./src/routes/rates');
const pushRoutes = require('./src/routes/push');
const scanRoutes = require('./src/routes/scan');
const reminderRoutes = require('./src/routes/reminders');
const groupFeatureRoutes = require('./src/routes/groupFeatures');
const { BUILD, STARTED_AT } = require('./src/utils/build');
const { CHANGELOG, LATEST } = require('./src/changelog');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
const app = express();
const PORT = Number(process.env.PORT) || 5000;

/* ------------------------------------------------------------ setup */

const allowed = (
  process.env.CLIENT_URL ||
  'http://localhost:3000,https://split.nexarrow.eu'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // Allow requests with no Origin header
      // (Postman, server-to-server requests, etc.)
      if (!origin) {
        return cb(null, true);
      }

      if (allowed.includes(origin)) {
        return cb(null, true);
      }

      return cb(new Error(`Origin ${origin} is not allowed`));
    },

    credentials: true,
  })
);

/*
 * The scan route carries base64 photos, so it gets its own larger parser
 * mounted first. body-parser skips a request whose stream is already drained,
 * so the 1mb parser below simply passes it through — the global limit stays
 * where it is for every other route.
 */
app.use('/api/scan', express.json({ limit: '6mb' }));
app.use(express.json({ limit: '1mb' }));

/*
 * The running build, for a client that wants to check without a socket — the
 * slow poll uses it as a safety net when a websocket cannot be established.
 */
app.get('/api/version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  // The notes ride along: the update screen wants them the moment it finishes,
  // and one round trip is one fewer thing to fail at that point.
  res.json({ build: BUILD, startedAt: STARTED_AT, notes: LATEST });
});

/** Every release, for a full history rather than just the newest. */
app.get('/api/changelog', (req, res) => {
  res.json({ releases: CHANGELOG });
});

app.get('/api/health', (req, res) => {
  const mongoose = require('mongoose');
  res.json({
    ok: true,
    db: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState],
    uptime: Math.round(process.uptime()),
  });
});

/* ----------------------------------------------------------- routes */

app.use('/api/auth', authRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/lists', listRoutes);
app.use('/api/rates', rateRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api', groupFeatureRoutes);
app.use('/api', feedRoutes);

app.use(notFound);
app.use(errorHandler);

/* ------------------------------------------------------------ start */

async function start() {
  try {
    await connectDB();

    /*
     * An explicit http server rather than app.listen, because socket.io has to
     * share the same port and attach to it.
     */
    const server = http.createServer(app);
    initRealtime(server, { allowedOrigins: allowed });

    server.listen(PORT, () => {
      console.log(`\n  Splitta API ready → http://localhost:${PORT}`);
      console.log(`  CORS allows      → ${allowed.join(', ')}\n`);
    });
  } catch (err) {
    console.error('\n  Failed to start:', err.message, '\n');
    process.exit(1);
  }
}

start();

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

module.exports = app;
