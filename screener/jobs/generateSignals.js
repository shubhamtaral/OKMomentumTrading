'use strict';

/**
 * jobs/generateSignals.js
 * -----------------------
 * Reads OHLCV data from the DB for every active symbol, runs signal
 * detection, and stores results back into the `signals` table.
 */

const { getAllSymbols, getOHLC, upsertSignal } = require('../db/queries');
const { detectSignal }                          = require('../services/signalDetector');
const { fetchOHLCWithRetry }                    = require('../services/ohlcFetcher');
const { createSnapshot }                        = require('../services/technicalSnapshot');
const { generateNarrative }                     = require('../services/narrativeService');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Number of candles per symbol to load from DB for analysis. */
const CANDLES_PER_SYMBOL = 150;

/** Symbol used for relative strength benchmark. */
const NIFTY_SYMBOL = '^NSEI';

/** Symbols to process per batch (controls memory footprint). */
const SIGNAL_BATCH_SIZE = parseInt(process.env.SIGNAL_BATCH_SIZE, 10) || 50;

// ---------------------------------------------------------------------------
// NIFTY benchmark fetch
// ---------------------------------------------------------------------------

async function fetchNiftyCandles() {
  try {
    const rows = await getOHLC(NIFTY_SYMBOL, CANDLES_PER_SYMBOL);
    if (rows && rows.length >= 20) {
      return rows.slice().reverse();
    }
  } catch (_) {}

  try {
    return await fetchOHLCWithRetry(NIFTY_SYMBOL);
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Per-symbol signal generation
// ---------------------------------------------------------------------------

async function processSymbol(symbol, niftyCandles, userApiKey = null) {
  try {
    const rows = await getOHLC(symbol, CANDLES_PER_SYMBOL);
    if (!rows || rows.length < 30) {
      return { status: 'skipped', reason: 'insufficient_candles' };
    }

    const candles = rows.slice().reverse();
    const signal = detectSignal(symbol, candles, niftyCandles);

    if (!signal) {
      return { status: 'no_signal' };
    }

    // --- NEW: Add AI Advisory for Bulk Signals ---
    // Only generate AI narrative if a valid pattern was found.
    // This keeps the pipeline fast and minimizes API cost.
    try {
      const snapshot = createSnapshot(symbol, candles);
      console.log(`[GenerateSignals] Generating AI advice for detected signal on ${symbol}...`);
      signal.advice = await generateNarrative(symbol, snapshot, signal, userApiKey);
    } catch (aiErr) {
      console.warn(`[GenerateSignals] AI advice failed for ${symbol}:`, aiErr.message);
      signal.advice = null; // Fallback handled by upsertSignal/DB
    }

    await upsertSignal(signal);
    return { status: 'signal', signal };

  } catch (err) {
    console.error('[GenerateSignals] Error processing ' + symbol + ':', err.message);
    return { status: 'error', reason: err.message };
  }
}

// ---------------------------------------------------------------------------
// Batch helper
// ---------------------------------------------------------------------------

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Main job
// ---------------------------------------------------------------------------

async function run(userApiKey = null) {
  const startedAt = Date.now();
  console.log('[GenerateSignals] Job started at', new Date().toISOString());

  const counters = { signals: 0, no_signal: 0, skipped: 0, errors: 0 };

  try {
    console.log('[GenerateSignals] Loading NIFTY50 benchmark...');
    const niftyCandles = await fetchNiftyCandles();
    if (niftyCandles) {
      console.log('[GenerateSignals] NIFTY50 loaded (' + niftyCandles.length + ' candles)');
    } else {
      console.warn('[GenerateSignals] NIFTY50 unavailable — relative strength scoring disabled');
    }

    const allSymbols = await getAllSymbols();
    if (allSymbols.length === 0) {
      console.warn('[GenerateSignals] No active symbols. Run ingestSymbols first.');
      return { success: true, total: 0, ...counters, elapsed_ms: Date.now() - startedAt };
    }

    console.log('[GenerateSignals] Processing ' + allSymbols.length +
                ' symbols in batches of ' + SIGNAL_BATCH_SIZE + '...');

    const batches = chunk(allSymbols, SIGNAL_BATCH_SIZE);

    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      console.log('[GenerateSignals] Batch ' + (bi + 1) + '/' + batches.length +
                  ' (' + batch.length + ' symbols)');

      for (const { symbol } of batch) {
        const outcome = await processSymbol(symbol, niftyCandles, userApiKey);
        if (outcome.status === 'signal')     counters.signals++;
        else if (outcome.status === 'no_signal') counters.no_signal++;
        else if (outcome.status === 'skipped')   counters.skipped++;
        else                                     counters.errors++;
      }
    }

    const elapsed = Date.now() - startedAt;
    console.log(
      '[GenerateSignals] Done. signals=' + counters.signals +
      ', no_signal=' + counters.no_signal +
      ', skipped=' + counters.skipped +
      ', errors=' + counters.errors +
      ', elapsed=' + (elapsed / 1000).toFixed(1) + 's'
    );

    return {
      success:   true,
      total:     allSymbols.length,
      ...counters,
      elapsed_ms: elapsed,
    };

  } catch (err) {
    console.error('[GenerateSignals] Fatal error:', err.message);
    return {
      success:    false,
      total:      0,
      ...counters,
      errors:     counters.errors + 1,
      elapsed_ms: Date.now() - startedAt,
    };
  }
}

// ---------------------------------------------------------------------------
// Standalone entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const { initSchema } = require('../db/schema');
  
  initSchema()
    .then(() => {
      run()
        .then((result) => {
          console.log('[GenerateSignals] Result:', JSON.stringify(result, null, 2));
          process.exit(result.success ? 0 : 1);
        })
        .catch((err) => {
          console.error('[GenerateSignals] Uncaught:', err.message);
          process.exit(1);
        });
    })
    .catch((err) => {
      console.error('[GenerateSignals] Schema init failed:', err.message);
      process.exit(1);
    });
}

module.exports = { run, processSymbol };
