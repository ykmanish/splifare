require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { connectDB } = require('./src/config/db');
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
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
const app = express();
const PORT = Number(process.env.PORT) || 5000;

/* ------------------------------------------------------------ setup */

const allowed = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim());

app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin/tooling requests that send no Origin header.
      if (!origin || allowed.includes(origin)) return cb(null, true);
      cb(new Error(`Origin ${origin} is not allowed`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));

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
app.use('/api', feedRoutes);

app.use(notFound);
app.use(errorHandler);

/* ------------------------------------------------------------ start */

async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => {
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
