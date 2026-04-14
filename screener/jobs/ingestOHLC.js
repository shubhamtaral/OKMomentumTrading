'use strict';

/**
 * jobs/ingestOHLC.js
 * ------------------
 * Fetches 6-month daily OHLCV data from Yahoo Finance for every active symbol
 * in the DB and stores it in the `ohlc_data` table.
 *
 * Performance strategy:
 *   - Processes stocks in batches of BATCH_SIZE (default 20)
 *   - Each batch runs concurrently (Promise.allSettled)
 *   - Small delay between batches to avoid Yahoo rate-limiting
 *   - Failures are logged and skipped (job never crashes)
 *   - DB inserts use transactions (fast + atomic)
 *
 * Strict rules:
 *   - Uses only DB layer functions (no raw SQL)
 *   - No signal logic
 *   - No frontend changes
 */

const { fetchOHLCWithRetry } = require('../services/ohlcFetcher');
const { getAllSymbols, insertOHLC } = require('../db/queries');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BATCH_SIZE        = parseInt(process.env.OHLC_BATCH_SIZE, 10) || 20;
const BATCH_DELAY_MS    = parseInt(process.env.OHLC_BATCH_DELAY_MS, 10) || 1500;
const CANDLES_TO_KEEP   = 350;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * sleep(ms)
 * Simple promise-based delay.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * chunk(array, size)
 * Splits an array into sub-arrays of at most `size` elements.
 *
 * @param {Array} array
 * @param {number} size
 * @returns {Array<Array>}
 */
function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Batch processor
// ---------------------------------------------------------------------------

/**
 * processBatch(symbols)
 * ---------------------
 * Fetches OHLC data for every symbol in the batch concurrently, then
 * writes each result to the DB. Returns per-symbol outcomes.
 *
 * @param {Array<{symbol: string}>} symbols
 * @returns {Promise<Array<{symbol, status, candles}>>}
 */
async function processBatch(symbols) {
  // Fire all fetches in parallel — allSettled so one failure does not abort the rest
  const fetches = symbols.map(({ symbol }) =>
    fetchOHLCWithRetry(symbol).then((candles) => ({ symbol, candles }))
  );

  const results = await Promise.allSettled(fetches);
  const outcomes = [];

  for (const result of results) {
    if (result.status === 'rejected') {
      // fetchOHLCWithRetry never rejects (returns null on failure), but guard anyway
      console.error('[IngestOHLC] Unexpected rejection:', result.reason);
      continue;
    }

    const { symbol, candles } = result.value;

    if (!candles || candles.length === 0) {
      outcomes.push({ symbol, status: 'skipped', candles: 0 });
      continue;
    }

    try {
      const { inserted } = await insertOHLC(symbol, candles, CANDLES_TO_KEEP);
      outcomes.push({ symbol, status: 'ok', candles: inserted });
    } catch (dbErr) {
      console.error('[IngestOHLC] DB write failed for ' + symbol + ':', dbErr.message);
      outcomes.push({ symbol, status: 'db_error', candles: 0 });
    }
  }

  return outcomes;
}

// ---------------------------------------------------------------------------
// Main job
// ---------------------------------------------------------------------------

/**
 * run()
 * -----
 * Processes the full symbol universe in batches. Returns a summary.
 * Never throws — all errors are caught and logged.
 *
 * @returns {Promise<{success: boolean, total: number, ok: number, skipped: number, errors: number}>}
 */
async function run() {
  const startedAt = Date.now();
  console.log('[IngestOHLC] Job started at', new Date().toISOString());

  let counters = { ok: 0, skipped: 0, errors: 0 };

  try {
    // 1. Load symbol universe from DB
    const allSymbols = await getAllSymbols();

    if (allSymbols.length === 0) {
      console.warn('[IngestOHLC] No active symbols in DB. Run ingestSymbols first.');
      return { success: true, total: 0, ok: 0, skipped: 0, errors: 0 };
    }

    console.log('[IngestOHLC] Processing ' + allSymbols.length +
                ' symbols in batches of ' + BATCH_SIZE + '...');

    // 2. Split into batches
    const batches = chunk(allSymbols, BATCH_SIZE);

    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      console.log('[IngestOHLC] Batch ' + (bi + 1) + '/' + batches.length +
                  ' (' + batch.length + ' symbols)...');

      const outcomes = await processBatch(batch);

      for (const o of outcomes) {
        if (o.status === 'ok')       counters.ok++;
        else if (o.status === 'skipped') counters.skipped++;
        else                         counters.errors++;
      }

      // Throttle: pause between batches (skip delay after last batch)
      if (bi < batches.length - 1) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log('[IngestOHLC] Done. ok=' + counters.ok +
                ', skipped=' + counters.skipped +
                ', errors=' + counters.errors +
                ', elapsed=' + elapsed + 's');

    return {
      success: true,
      total:   allSymbols.length,
      ok:      counters.ok,
      skipped: counters.skipped,
      errors:  counters.errors,
    };

  } catch (err) {
    console.error('[IngestOHLC] Fatal error:', err.message);
    return {
      success: false,
      total:   0,
      ok:      counters.ok,
      skipped: counters.skipped,
      errors:  counters.errors + 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Standalone entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const { initSchema } = require('../db/schema');
  
  initSchema().then(() => {
    run().then((result) => {
      if (result.success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    });
  }).catch(err => {
    console.error('[IngestOHLC] Schema init failed:', err.message);
    process.exit(1);
  });
}

module.exports = { run, processBatch };
