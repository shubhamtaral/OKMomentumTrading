'use strict';

/**
 * services/onDemandScanner.js
 * ---------------------------
 * Orchestrates a real-time scan for a single symbol.
 */

const { fetchOHLCWithRetry } = require('./ohlcFetcher');
const { detectSignal }        = require('./signalDetector');
const { createSnapshot }      = require('./technicalSnapshot');
const { generateNarrative }   = require('./narrativeService');
const { 
  insertOHLC, 
  upsertSignal, 
  getOHLC, 
  insertSymbols
} = require('../db/queries');

async function scanSingleSymbol(symbol, userApiKey = null) {
  try {
    console.log('[OnDemandScanner] Starting fresh scan for:', symbol);

    // 1. Fetch fresh candles
    const candles = await fetchOHLCWithRetry(symbol);
    if (!candles || candles.length < 30) {
      return {
        success: false,
        error: 'Incomplete data',
        message: `Yahoo Finance returned ${candles ? candles.length : 0} candles for ${symbol}. Need at least 30 for analysis.`
      };
    }

    // 2. Ensure symbol exists in symbols table
    await insertSymbols([{ symbol, name: symbol, is_active: 1 }]);

    // 3. Save candles to DB
    await insertOHLC(symbol, candles);

    // 4. Run signal detection
    const niftyRows = await getOHLC('^NSEI', 150);
    const niftyCandles = (niftyRows && niftyRows.length >= 30) 
      ? niftyRows.slice().reverse() 
      : null;

    let signal = detectSignal(symbol, candles, niftyCandles);
    const snapshot = createSnapshot(symbol, candles);

    // 5. Generate Intelligent Narrative
    const advice = await generateNarrative(symbol, snapshot, signal, userApiKey);

    // 6. Persist results (Always save if we have advice)
    const persistenceObject = signal || {
      symbol,
      price: snapshot.price,
      rsi: snapshot.rsi,
      volume_ratio: snapshot.volume_ratio,
      signal_type: 'NEUTRAL',
      action: 'WATCH',
      score: 0,
      quality: 'N/A',
      reasons: ['No technical trigger detected'],
      timestamp: new Date().toISOString()
    };
    
    persistenceObject.advice = advice;
    await upsertSignal(persistenceObject);

    return {
      success: true,
      signal: signal || null,
      snapshot: snapshot,
      advice: advice,
      symbol: symbol
    };

  } catch (err) {
    console.error('[OnDemandScanner] Failed for ' + symbol + ':', err.message);
    return {
      success: false,
      error: 'Scanner error',
      message: err.message
    };
  }
}

module.exports = { scanSingleSymbol };
