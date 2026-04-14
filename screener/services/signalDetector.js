'use strict';

/**
 * services/signalDetector.js
 * --------------------------
 * Core trading signal detection for Oliver Kell-style momentum setups.
 *
 * Entry point: detectSignal(symbol, candles, niftyCandles)
 *
 * Pipeline:
 *   1. Universe filter  — hard reject low-quality stocks
 *   2. Advanced filters — relative strength, 52W high, volume expansion
 *   3. Pattern detection — identify the specific setup
 *   4. Scoring          — assign numeric score
 *   5. Quality rating   — A+, A, B (or null if rejected)
 *
 * Returns a signal object or null (stock does not qualify).
 *
 * All indicator math is delegated to indicators.js.
 * No DB access, no external API calls.
 */

const {
  latestEMA,
  emaAtOffset,
  latestRSI,
  avgVolume,
  high52Week,
  returnOverPeriod,
  rangePercent,
} = require('./indicators');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_PRICE        = 100;      // Universe filter: minimum price
const MIN_AVG_VOLUME   = 500000;   // Universe filter: 20-day avg volume
const MIN_RSI          = 50;       // Universe filter: momentum floor
const EMA20_TREND_BARS = 5;        // Bars to look back for EMA20 slope check
const BASE_LOOKBACK    = 15;       // Candles to check for tight base
const BASE_MAX_RANGE   = 0.05;     // 5% max range for a valid base
const BREAKOUT_MIN_PCT = 0.01;     // 1% minimum breakout strength
const VOL_RATIO_MIN    = 1.5;      // Volume must be 1.5x avg for breakout confirmation
const EXHAUSTION_RSI   = 75;       // RSI threshold for exhaustion sell signal
const EXHAUSTION_EXT   = 0.08;     // 8% extension above EMA10 for exhaustion
const NEAR_52W_THRESH  = 0.90;     // Within 10% of 52W high counts as "near high"
const RSI_STRENGTH_LOW = 55;       // RSI range for RSI-strength score point
const RSI_STRENGTH_HIGH= 70;

// ---------------------------------------------------------------------------
// Universe filter
// ---------------------------------------------------------------------------

/**
 * passesUniverseFilter(closes, volumes, rsi, ema20, ema20_5ago)
 * --------------------------------------------------------------
 * Hard gates — stock must pass ALL to receive signal processing.
 * Returns { pass: boolean, reason: string|null }
 */
function passesUniverseFilter(closes, volumes) {
  if (!closes || closes.length < 25) return { pass: false, reason: 'insufficient_data' };

  const price   = closes[closes.length - 1];
  const avgVol  = avgVolume(volumes, 20);
  const rsi     = latestRSI(closes, 14);
  const ema20   = latestEMA(closes, 20);
  const ema20_5 = emaAtOffset(closes, 20, EMA20_TREND_BARS);

  if (price == null || price < MIN_PRICE)         return { pass: false, reason: 'price_below_100' };
  if (avgVol == null || avgVol < MIN_AVG_VOLUME)  return { pass: false, reason: 'low_volume' };
  if (rsi == null || rsi < MIN_RSI)               return { pass: false, reason: 'rsi_below_50' };
  if (ema20 == null || price <= ema20)            return { pass: false, reason: 'price_below_ema20' };
  if (ema20_5 == null || ema20 <= ema20_5)        return { pass: false, reason: 'ema20_not_trending' };

  return { pass: true, reason: null };
}

// ---------------------------------------------------------------------------
// Advanced filters (each returns boolean)
// ---------------------------------------------------------------------------

/**
 * hasRelativeStrength(closes, niftyCloses)
 * Returns true when the stock has outperformed NIFTY over the last 20 days.
 */
function hasRelativeStrength(closes, niftyCloses) {
  if (!niftyCloses || niftyCloses.length < 21) return false;
  const stockReturn = returnOverPeriod(closes, 20);
  const niftyReturn = returnOverPeriod(niftyCloses, 20);
  if (stockReturn == null || niftyReturn == null) return false;
  return stockReturn > niftyReturn;
}

/**
 * isNear52WeekHigh(closes)
 * Returns true when price >= 90% of the 52-week high.
 */
function isNear52WeekHigh(closes) {
  const price  = closes[closes.length - 1];
  const high52 = high52Week(closes);
  if (high52 == null || high52 === 0) return false;
  return price >= high52 * NEAR_52W_THRESH;
}

/**
 * hasVolumeExpansion(volumes)
 * Returns true when today's volume > yesterday's volume.
 */
function hasVolumeExpansion(volumes) {
  if (!volumes || volumes.length < 2) return false;
  return volumes[volumes.length - 1] > volumes[volumes.length - 2];
}

// ---------------------------------------------------------------------------
// Pattern detection
// ---------------------------------------------------------------------------

/**
 * detectBaseBreak(candles, closes, volumes, avgVol)
 * -------------------------------------------------
 * Base 'n Break (BUY):
 *   - Range over last 15 candles < 5%
 *   - Current close breaks above the resistance (highest high of base)
 *   - Breakout strength > 1%
 *   - Volume > 1.5× avg volume
 *
 * @returns {{ detected: boolean, resistance: number|null }}
 */
function detectBaseBreak(candles, avgVol) {
  if (!candles || candles.length < BASE_LOOKBACK + 1) return { detected: false };

  // The "base" is the candles BEFORE the current bar
  const baseBars  = candles.slice(candles.length - BASE_LOOKBACK - 1, candles.length - 1);
  const currBar   = candles[candles.length - 1];
  const range     = rangePercent(baseBars, BASE_LOOKBACK);

  if (range == null || range >= BASE_MAX_RANGE) return { detected: false };

  // Resistance = highest high of the base period
  let resistance = -Infinity;
  for (const b of baseBars) {
    if (b.high > resistance) resistance = b.high;
  }
  if (resistance === -Infinity) return { detected: false };

  // Breakout conditions
  const breakoutStrength = (currBar.close - resistance) / resistance;
  const volRatio         = avgVol > 0 ? currBar.volume / avgVol : 0;

  if (breakoutStrength < BREAKOUT_MIN_PCT) return { detected: false };
  if (volRatio < VOL_RATIO_MIN)            return { detected: false };

  return { detected: true, resistance, breakoutStrength, volRatio };
}

/**
 * detectWedgePop(candles, avgVol)
 * --------------------------------
 * Wedge Pop (BUY):
 *   - Lower highs over recent bars (descending resistance)
 *   - Higher lows over recent bars (ascending support → converging)
 *   - Current bar breaks above the descending resistance with volume
 *
 * Uses a simplified 10-bar detection window.
 *
 * @returns {{ detected: boolean }}
 */
function detectWedgePop(candles, avgVol) {
  const WINDOW = 10;
  if (!candles || candles.length < WINDOW + 1) return { detected: false };

  const wedgeBars = candles.slice(candles.length - WINDOW - 1, candles.length - 1);
  const currBar   = candles[candles.length - 1];

  // Split wedge bars into two halves and compare
  const half    = Math.floor(WINDOW / 2);
  const earlyHi = wedgeBars.slice(0, half).reduce((m, b) => Math.max(m, b.high), -Infinity);
  const lateHi  = wedgeBars.slice(half).reduce((m, b) => Math.max(m, b.high), -Infinity);
  const earlyLo = wedgeBars.slice(0, half).reduce((m, b) => Math.min(m, b.low), Infinity);
  const lateLo  = wedgeBars.slice(half).reduce((m, b) => Math.min(m, b.low), Infinity);

  // Lower highs + higher lows = converging wedge
  const lowerHighs = lateHi < earlyHi;
  const higherLows = lateLo > earlyLo;

  if (!lowerHighs || !higherLows) return { detected: false };

  // Breakout above the recent (late) resistance
  const breakoutStrength = (currBar.close - lateHi) / lateHi;
  const volRatio         = avgVol > 0 ? currBar.volume / avgVol : 0;

  if (breakoutStrength < BREAKOUT_MIN_PCT) return { detected: false };
  if (volRatio < VOL_RATIO_MIN)            return { detected: false };

  return { detected: true, breakoutStrength, volRatio };
}

/**
 * detectExhaustion(closes, rsi)
 * ------------------------------
 * Exhaustion (SELL):
 *   - RSI > 75
 *   - Price extended > 8% above EMA10
 *
 * @returns {{ detected: boolean }}
 */
function detectExhaustion(closes, rsi) {
  if (rsi == null || rsi <= EXHAUSTION_RSI) return { detected: false };

  const price = closes[closes.length - 1];
  const ema10 = latestEMA(closes, 10);
  if (ema10 == null || ema10 === 0) return { detected: false };

  const extension = (price - ema10) / ema10;
  if (extension < EXHAUSTION_EXT) return { detected: false };

  return { detected: true, rsi, extension };
}

/**
 * detectEMACrossback(candles, closes)
 * ------------------------------------
 * EMA Crossback (EXIT):
 *   - Price has crossed below both EMA10 and EMA20
 *   - Previous candle was above EMA10 (the cross just happened)
 *
 * @returns {{ detected: boolean }}
 */
function detectEMACrossback(candles, closes) {
  if (!closes || closes.length < 22) return { detected: false };

  const currPrice = closes[closes.length - 1];
  const prevPrice = closes[closes.length - 2];

  const ema10curr  = latestEMA(closes, 10);
  const ema20curr  = latestEMA(closes, 20);

  // EMA10 of the previous bar — computed on closes without the last point
  const prevCloses  = closes.slice(0, closes.length - 1);
  const ema10prev   = latestEMA(prevCloses, 10);

  if (ema10curr == null || ema20curr == null || ema10prev == null) return { detected: false };

  const crossedBelow = currPrice < ema10curr && currPrice < ema20curr;
  const wasAbove     = prevPrice >= ema10prev;

  if (!crossedBelow || !wasAbove) return { detected: false };

  return { detected: true };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * computeScore(flags)
 * -------------------
 * Assigns score points based on confirmed attributes.
 *
 * +2  tight base
 * +2  breakout (base break or wedge pop)
 * +2  volume expansion (vol ratio >= 1.5)
 * +1  RSI in sweet spot (55–70)
 * +1  near 52-week high
 * +1  relative strength vs NIFTY
 *
 * @returns {{ score: number, quality: string }}
 */
function computeScore(flags) {
  let score = 0;
  const reasons = [];

  if (flags.tightBase) {
    score += 2;
    reasons.push('Tight consolidation base');
  }
  if (flags.breakout) {
    score += 2;
    reasons.push('Price breakout from resistance');
  }
  if (flags.volumeBreakout) {
    score += 2;
    reasons.push('Significant volume expansion');
  }
  if (flags.rsiStrength) {
    score += 1;
    reasons.push('RSI in momentum sweet-spot');
  }
  if (flags.near52W) {
    score += 1;
    reasons.push('Trading near 52-week high');
  }
  if (flags.relativeStrength) {
    score += 1;
    reasons.push('Outperforming market benchmark (RS)');
  }

  let quality;
  if (score >= 7)      quality = 'A+';
  else if (score >= 5) quality = 'A';
  else                 quality = 'B';

  return { score, quality, reasons };
}

// ---------------------------------------------------------------------------
// Main detection entry point
// ---------------------------------------------------------------------------

/**
 * detectSignal(symbol, candles, niftyCandles)
 * --------------------------------------------
 * Full signal detection pipeline for a single symbol.
 *
 * @param {string}   symbol        e.g. 'RELIANCE.NS'
 * @param {Array}    candles       Array of { date, open, high, low, close, volume }
 *                                 ordered OLDEST → NEWEST
 * @param {Array}    niftyCandles  Same shape, for NIFTY50 (used for relative strength)
 *
 * @returns {object|null}
 *   Returns null when:
 *     - Insufficient data (< 30 candles)
 *     - Fails universe filter
 *     - No pattern detected
 *     - Score < 1 (shouldn't happen if a pattern is detected but guard anyway)
 *
 *   Returns signal object when a pattern is found:
 *   {
 *     symbol, price, rsi, volume_ratio,
 *     signal_type, action, score, quality,
 *     reasons, timestamp
 *   }
 */
function detectSignal(symbol, candles, niftyCandles) {
  // ── Minimum data guard ──────────────────────────────────────────────────
  if (!symbol || !Array.isArray(candles) || candles.length < 30) return null;

  // ── Extract price / volume series ───────────────────────────────────────
  const closes  = candles.map((c) => c.close);
  const highs   = candles.map((c) => c.high);
  const lows    = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);

  const price   = closes[closes.length - 1];
  const rsi     = latestRSI(closes, 14);
  const avgVol  = avgVolume(volumes, 20);
  const volRatio = (avgVol && avgVol > 0)
    ? volumes[volumes.length - 1] / avgVol
    : 0;

  // ── Universe filter ─────────────────────────────────────────────────────
  const uFilter = passesUniverseFilter(closes, volumes);
  if (!uFilter.pass) return null;

  // ── Advanced filters ────────────────────────────────────────────────────
  const niftyCloses  = niftyCandles
    ? niftyCandles.map((c) => c.close)
    : null;
  const relStrength  = hasRelativeStrength(closes, niftyCloses);
  const near52W      = isNear52WeekHigh(closes);
  const volExpansion = hasVolumeExpansion(volumes);

  // ── Pattern detection ───────────────────────────────────────────────────
  let signalType = null;
  let action     = null;
  let patternFlags = {};

  // Priority order: EXIT > SELL > BUY patterns
  const crossback = detectEMACrossback(candles, closes);
  if (crossback.detected) {
    signalType   = 'ema_crossback';
    action       = 'EXIT';
    patternFlags = {};   // Exit signals: no extra bonus points
  }

  if (!signalType) {
    const exhaustion = detectExhaustion(closes, rsi);
    if (exhaustion.detected) {
      signalType   = 'exhaustion';
      action       = 'SELL';
      patternFlags = {};
    }
  }

  if (!signalType) {
    const baseBreak = detectBaseBreak(candles, avgVol);
    if (baseBreak.detected) {
      signalType   = 'base_break';
      action       = 'BUY';
      patternFlags = {
        tightBase:      true,
        breakout:       true,
        volumeBreakout: baseBreak.volRatio >= VOL_RATIO_MIN,
      };
    }
  }

  if (!signalType) {
    const wedge = detectWedgePop(candles, avgVol);
    if (wedge.detected) {
      signalType   = 'wedge_pop';
      action       = 'BUY';
      patternFlags = {
        tightBase:      false,
        breakout:       true,
        volumeBreakout: wedge.volRatio >= VOL_RATIO_MIN,
      };
    }
  }

  // No pattern found → no signal
  if (!signalType) return null;

  // ── RSI sweet-spot flag ─────────────────────────────────────────────────
  const rsiStrength = rsi != null && rsi >= RSI_STRENGTH_LOW && rsi <= RSI_STRENGTH_HIGH;

  // ── Scoring ─────────────────────────────────────────────────────────────
  const { score, quality, reasons } = computeScore({
    ...patternFlags,
    rsiStrength,
    near52W,
    relativeStrength: relStrength,
  });

  // ── Build signal object ──────────────────────────────────────────────────
  return {
    symbol,
    price:        price != null ? parseFloat(price.toFixed(2)) : 0,
    rsi:          rsi   != null ? parseFloat(rsi.toFixed(2))   : 0,
    volume_ratio: parseFloat(volRatio.toFixed(2)),
    signal_type:  signalType,
    action,
    score,
    quality,
    reasons,
    timestamp:    new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  detectSignal,
  // Expose internals for unit testing
  passesUniverseFilter,
  hasRelativeStrength,
  isNear52WeekHigh,
  hasVolumeExpansion,
  detectBaseBreak,
  detectWedgePop,
  detectExhaustion,
  detectEMACrossback,
  computeScore,
};
