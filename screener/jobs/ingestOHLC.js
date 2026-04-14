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

const BATCH_SIZE        = parseInt(process.env.OHLC_BATCH_SIZE, 10) || 35;
const BATCH_DELAY_MS    = parseInt(process.env.OHLC_BATCH_DELAY_MS, 10) || 800;
const CANDLES_TO_KEEP   = 350;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * processBatch(symbols)
 * ---------------------
 * Fetches OHLC data concurrently, then writes to the DB in parallel.
 * Returns per-symbol outcomes.
 */
async function processBatch(symbols) {
  // 1. Fetch from Yahoo Finance in parallel
  const fetchPromises = symbols.map(({ symbol }) =>
    fetchOHLCWithRetry(symbol).then((candles) => ({ symbol, candles }))
  );

  const fetchResults = await Promise.all(fetchPromises);
  
  // 2. Write to DB in parallel
  const dbPromises = fetchResults.map(async ({ symbol, candles }) => {
    if (!candles || candles.length === 0) {
      return { symbol, status: 'skipped', candles: 0 };
    }
    try {
      const { inserted } = await insertOHLC(symbol, candles, CANDLES_TO_KEEP);
      return { symbol, status: 'ok', candles: inserted };
    } catch (dbErr) {
      console.error(`[IngestOHLC] DB write failed for ${symbol}:`, dbErr.message);
      return { symbol, status: 'db_error', candles: 0 };
    }
  });

  return await Promise.all(dbPromises);
}

// ---------------------------------------------------------------------------
// Main job
// ---------------------------------------------------------------------------

async function run() {
  const startedAt = Date.now();
  console.log('[IngestOHLC] Optimized job started at', new Date().toISOString());

  let counters = { ok: 0, skipped: 0, errors: 0 };

  try {
    const allSymbols = await getAllSymbols();
    if (allSymbols.length === 0) {
      console.warn('[IngestOHLC] No active symbols in DB.');
      return { success: true, total: 0, ok: 0, skipped: 0, errors: 0 };
    }

    console.log(`[IngestOHLC] Parallel processing ${allSymbols.length} symbols (Batch: ${BATCH_SIZE}, Delay: ${BATCH_DELAY_MS}ms)`);

    const batches = chunk(allSymbols, BATCH_SIZE);

    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      const outcomes = await processBatch(batch);

      for (const o of outcomes) {
        if (o.status === 'ok')       counters.ok++;
        else if (o.status === 'skipped') counters.skipped++;
        else                         counters.errors++;
      }

      if (bi < batches.length - 1) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[IngestOHLC] Completed in ${elapsed}s. ok=${counters.ok}, skipped=${counters.skipped}, errors=${counters.errors}`);

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
