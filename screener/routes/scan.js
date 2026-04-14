'use strict';

/**
 * routes/scan.js
 * --------------
 * Endpoints:
 *   GET  /scan           — return top high-quality signals (A+, A)
 *   POST /scan/single    — return latest signal for one symbol (triggers real-time scan if missing)
 */

const express               = require('express');
const { getSignalsLimited, getSignalBySymbol } = require('../db/queries');
const { scanSingleSymbol }                     = require('../services/onDemandScanner');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * normalizeSymbol(raw)
 */
function normalizeSymbol(raw) {
  const s = String(raw).trim().toUpperCase();
  return s.endsWith('.NS') ? s : s + '.NS';
}

/**
 * isValidSymbolInput(raw)
 */
function isValidSymbolInput(raw) {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 30) return false;
  return /^[A-Za-z0-9.\-&]+$/.test(trimmed);
}

// ---------------------------------------------------------------------------
// GET /scan
// ---------------------------------------------------------------------------

/**
 * Returns up to `limit` high-quality signals (quality = A+ or A),
 * sorted by score DESC.
 */
router.get('/', async (req, res) => {
  try {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit    = !isNaN(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, 200)
      : 50;

    const showAll = req.query.all === 'true';
    const qualityFilter = showAll ? ['A+', 'A', 'B'] : ['A+', 'A'];

    const signals = await getSignalsLimited(limit, qualityFilter);

    return res.json({
      count:   signals.length,
      signals,
    });
  } catch (err) {
    console.error('[GET /scan] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch signals', detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /scan/single
// ---------------------------------------------------------------------------

/**
 * Returns the latest signal for a single symbol.
 * If not in DB, triggers an on-demand scan.
 *
 * Request body:
 *   { "symbol": "RELIANCE" }
 */
router.post('/single', async (req, res) => {
  const { symbol } = req.body || {};

  // Input validation
  if (!isValidSymbolInput(symbol)) {
    return res.status(400).json({
      error:   'Invalid symbol',
      message: 'Provide a non-empty symbol string (max 30 chars, letters/digits only).',
    });
  }

  const normalized = normalizeSymbol(symbol);
  const userApiKey = req.headers['x-ai-key'];

  try {
    // 1. Try DB first (cached signal)
    let signal = await getSignalBySymbol(normalized);

    let snapshot = null;
    let advice   = null;

    // 2. If no signal OR signal lacks "reasons", try On-Demand Scan
    if (!signal || !signal.reasons || signal.reasons.length === 0) {
      console.log('[POST /scan/single] No signal or missing metadata for ' + normalized + '. Triggering fresh scan...');
      const result = await scanSingleSymbol(normalized, userApiKey);
      
      if (result.success) {
        signal   = result.signal;   // Might still be null
        snapshot = result.snapshot; // Technical metrics
        advice   = result.advice;   // Narrative advice
      } else {
        // Only return 404 if the actual scan failed (unreachable symbol, etc)
        if (!result.signal && result.error) {
           return res.status(404).json({
            error:   'Not found',
            message: result.message || `Could not find or scan ${normalized}.`,
            symbol:  normalized,
          });
        }
      }
    }

    // 3. Return result
    if (!signal) {
      return res.status(200).json({
        symbol:   normalized,
        signal:   null,
        snapshot: snapshot,
        advice:   advice,
        message:  `Analysis complete for ${normalized}. No buy/sell/exit signals detected currently.`
      });
    }

    // Merge advice: Prefer fresh scan advice, otherwise use cached advice from DB
    return res.json({ ...signal, advice: advice || signal.advice });

  } catch (err) {
    console.error('[POST /scan/single] error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch signal', detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /scan/run
// ---------------------------------------------------------------------------

/**
 * Triggers a full market-wide signal generation pass.
 * Can be slow; returns immediately with a tracking message.
 */
router.post('/run', async (req, res) => {
  const userApiKey = req.headers['x-ai-key'];
  
  // We use the existing generateSignals job
  const { run: runSignalsJob } = require('../jobs/generateSignals');

  console.log('[POST /scan/run] Manual pipeline trigger started...');
  
  // Run it in the background so the request doesn't timeout
  runSignalsJob(userApiKey)
    .then(result => console.log('[POST /scan/run] Manual run complete:', result))
    .catch(err => console.error('[POST /scan/run] Manual run failed:', err.message));

  return res.json({
    success: true,
    message: 'Market-wide scan started in background. Refresh in 10-20 seconds to see new signals.'
  });
});

module.exports = router;
