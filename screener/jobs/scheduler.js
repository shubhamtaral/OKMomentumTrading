'use strict';

/**
 * jobs/scheduler.js
 * -----------------
 * Daily data ingestion scheduler.
 *
 * Schedule: 8:00 PM IST every day (14:30 UTC).
 *
 * Pipeline (runs in order):
 *   Step 1 -> ingestSymbols  (refresh NSE universe)
 *   Step 2 -> ingestOHLC     (fetch and store OHLCV data)
 *
 * Signal generation is a separate phase and NOT triggered here.
 *
 * The scheduler also exposes runPipeline() for manual triggering
 * from server.js or a test script.
 */

const cron = require('node-cron');

const { run: runSymbols  } = require('./ingestSymbols');
const { run: runOHLC     } = require('./ingestOHLC');
const { run: runSignals  } = require('./generateSignals');

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

let isRunning = false;  // Guard against overlapping runs

/**
 * runPipeline()
 * -------------
 * Executes the full ingestion pipeline sequentially.
 * If a run is already in progress it logs and returns immediately.
 *
 * @returns {Promise<{symbols: object, ohlc: object}>}
 */
async function runPipeline() {
  if (isRunning) {
    console.warn('[Scheduler] Pipeline already running — skipping this trigger.');
    return null;
  }

  isRunning = true;
  const startedAt = Date.now();

  console.log('');
  console.log('=== [Scheduler] Pipeline START', new Date().toISOString(), '===');

  let symbolResult = null;
  let ohlcResult   = null;
  let signalResult = null;

  try {
    // Step 1: Symbols
    console.log('[Scheduler] Step 1/3 — Ingesting NSE symbols...');
    symbolResult = await runSymbols();
    console.log('[Scheduler] Symbol ingestion:', symbolResult);

    // Only proceed to OHLC if symbols succeeded
    if (!symbolResult.success) {
      console.warn('[Scheduler] Symbol step failed — skipping OHLC + signal steps.');
    } else {
      // Step 2: OHLC data
      console.log('[Scheduler] Step 2/3 — Ingesting OHLC data...');
      ohlcResult = await runOHLC();
      console.log('[Scheduler] OHLC ingestion:', ohlcResult);

      // Step 3: Signal generation (runs even if OHLC had partial failures)
      console.log('[Scheduler] Step 3/3 — Generating signals...');
      signalResult = await runSignals();
      console.log('[Scheduler] Signal generation:', signalResult);
    }

  } catch (err) {
    console.error('[Scheduler] Unexpected pipeline error:', err.message);
  } finally {
    isRunning = false;
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log('=== [Scheduler] Pipeline END — elapsed=' + elapsed + 's ===');
    console.log('');
  }

  return { symbols: symbolResult, ohlc: ohlcResult, signals: signalResult };
}

// ---------------------------------------------------------------------------
// Cron schedule
// ---------------------------------------------------------------------------

/**
 * startScheduler()
 * ----------------
 * Registers the daily cron job.
 * Called once at server startup.
 *
 * Cron expression: '30 14 * * *'
 *   -> 14:30 UTC = 20:00 IST (UTC+5:30)
 *
 * node-cron timezone option ensures correct scheduling regardless of
 * the server's local timezone.
 */
function startScheduler() {
  // '30 14 * * 1-5' = 14:30 UTC (20:00 IST) Monday to Friday
  const expression = process.env.CRON_EXPRESSION || '30 14 * * 1-5';

  console.log('[Scheduler] Registering weekday pipeline at: ' + expression + ' UTC');
  console.log('[Scheduler] IST Schedule: Monday-Friday @ 20:00 (8:00 PM)');

  const task = cron.schedule(expression, () => {
    console.log('[Scheduler] Cron triggered at', new Date().toISOString());
    runPipeline().catch((err) => {
      console.error('[Scheduler] runPipeline threw unexpectedly:', err.message);
    });
  }, {
    scheduled: true,
    timezone:  'UTC',
  });

  console.log('[Scheduler] Daily pipeline scheduled. Next run: 20:00 IST.');
  return task;
}

// ---------------------------------------------------------------------------
// Standalone entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const { initSchema } = require('../db/schema');
  initSchema().then(() => {
    console.log('[Scheduler] Running pipeline now (manual trigger)...');
    runPipeline().then(() => process.exit(0)).catch(() => process.exit(1));
  }).catch(err => {
    console.error('[Scheduler] Schema init failed:', err.message);
    process.exit(1);
  });
}

module.exports = { startScheduler, runPipeline };
