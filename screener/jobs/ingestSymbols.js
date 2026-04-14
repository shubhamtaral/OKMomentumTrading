'use strict';

/**
 * jobs/ingestSymbols.js
 * ---------------------
 * Fetches the NSE equity universe and upserts all EQ-series symbols
 * into the `symbols` table.
 *
 * Designed to run once per day (called by scheduler.js).
 * Can also be run standalone:  node jobs/ingestSymbols.js
 *
 * Strict rules:
 *   - Uses only DB layer functions (no raw SQL)
 *   - No signal logic
 *   - No frontend changes
 */

const { fetchNSESymbols }  = require('../services/symbolFetcher');
const { insertSymbols }    = require('../db/queries');

// ---------------------------------------------------------------------------
// Main job
// ---------------------------------------------------------------------------

/**
 * run()
 * Fetches NSE symbols and upserts them into the DB.
 * Resolves with a summary object; never throws.
 *
 * @returns {Promise<{success: boolean, total: number, inserted: number, error?: string}>}
 */
async function run() {
  const startedAt = Date.now();
  console.log('[IngestSymbols] Job started at', new Date().toISOString());

  try {
    // 1. Fetch from NSE (with built-in retry in symbolFetcher)
    const symbols = await fetchNSESymbols();

    if (!symbols || symbols.length === 0) {
      throw new Error('fetchNSESymbols returned 0 symbols');
    }

    // 2. Upsert into DB — single transaction for the whole list
    const { inserted } = await insertSymbols(symbols);

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log('[IngestSymbols] Done. Fetched=' + symbols.length +
                ', DB rows processed=' + inserted +
                ', elapsed=' + elapsed + 's');

    return { success: true, total: symbols.length, inserted };

  } catch (err) {
    console.error('[IngestSymbols] FAILED:', err.message);
    return { success: false, total: 0, inserted: 0, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Standalone entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  // Ensure schema exists when running standalone
  const { initSchema } = require('../db/schema');
  initSchema().then(() => {
    run().then((result) => {
      if (result.success) {
        console.log('[IngestSymbols] Standalone run complete.');
        process.exit(0);
      } else {
        console.error('[IngestSymbols] Standalone run failed:', result.error);
        process.exit(1);
      }
    });
  }).catch(err => {
    console.error('[IngestSymbols] Schema init failed:', err.message);
    process.exit(1);
  });
}

module.exports = { run };
