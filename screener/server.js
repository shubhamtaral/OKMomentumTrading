'use strict';

/**
 * server.js
 * ---------
 * Express entry point for the OK Momentum Screener API.
 *
 * Boot sequence:
 *   1. Load env (.env file)
 *   2. Init DB schema (idempotent)
 *   3. Mount routes
 *   4. Start HTTP server
 *   5. Start background scheduler (daily pipeline)
 */

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const { initSchema } = require('./db/schema');
const scanRouter   = require('./routes/scan');
const symbolRouter = require('./routes/symbols');

// ---------------------------------------------------------------------------
// Bootstrap DB (idempotent — safe to run on every start)
// ---------------------------------------------------------------------------
async function start() {
  try {
    await initSchema();
    console.log('[Server] Database schema initialized.');
  } catch (err) {
    console.error('[Server] Database initialization failed:', err.message);
    process.exit(1);
  }
}
start();

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Request logger (dev-friendly, single line per request)
app.use((req, _res, next) => {
  console.log('[' + new Date().toISOString() + '] ' + req.method + ' ' + req.url);
  next();
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/scan',    scanRouter);
app.use('/symbols', symbolRouter);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Server] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Start HTTP server
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT, 10) || 3001;

const server = app.listen(PORT, () => {
  console.log('');
  console.log('=== OK Momentum Screener API ===');
  console.log('  Port    :', PORT);
  console.log('  DB      :', process.env.DB_PATH || '(default stocks.db)');
  console.log('  Env     :', process.env.NODE_ENV || 'development');
  console.log('');
  console.log('  Endpoints:');
  console.log('    GET  /health');
  console.log('    GET  /scan?limit=50');
  console.log('    POST /scan/single          body: { "symbol": "RELIANCE" }');
  console.log('    GET  /symbols');
  console.log('    GET  /symbols?q=REL&limit=20');
  console.log('');
});

// ---------------------------------------------------------------------------
// Start background scheduler (after server is up)
// ---------------------------------------------------------------------------
try {
  const { startScheduler } = require('./jobs/scheduler');
  startScheduler();
  console.log('[Scheduler] Daily pipeline scheduled (20:00 IST).');
} catch (err) {
  // Non-fatal: server still serves stale data if scheduler fails to start
  console.error('[Scheduler] Failed to start:', err.message);
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
function shutdown(signal) {
  console.log('\n[Server] ' + signal + ' received — shutting down...');
  server.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });
  // Force exit after 5 seconds if server hangs
  setTimeout(() => {
    console.error('[Server] Forced exit after timeout.');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app; // exported for testing
