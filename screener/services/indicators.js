'use strict';

/**
 * services/indicators.js
 * ----------------------
 * Pure technical indicator functions.
 * All functions are stateless and deterministic — same input always produces
 * same output. No DB access, no side-effects.
 *
 * Conventions:
 *   - All price arrays are ordered OLDEST → NEWEST (index 0 = oldest candle)
 *   - Functions return null when input is insufficient
 *   - No throws; callers must check for null returns
 */

// ---------------------------------------------------------------------------
// EMA  — Exponential Moving Average
// ---------------------------------------------------------------------------

/**
 * computeEMA(prices, period)
 * --------------------------
 * Standard EMA using the smoothing constant k = 2 / (period + 1).
 * Seeds the EMA with the simple average of the first `period` data points.
 *
 * @param {number[]} prices  Ordered oldest → newest
 * @param {number}   period  EMA period (e.g. 10, 20, 50)
 * @returns {number[]|null}  EMA values aligned to prices (length === prices.length),
 *                           with nulls for the first (period - 1) positions,
 *                           or null if prices.length < period
 */
function computeEMA(prices, period) {
  if (!Array.isArray(prices) || prices.length < period || period < 1) return null;

  const k      = 2 / (period + 1);
  const result = new Array(prices.length).fill(null);

  // Seed: SMA of the first `period` values
  let sum = 0;
  for (let i = 0; i < period; i++) sum += prices[i];
  result[period - 1] = sum / period;

  // Iterate forward
  for (let i = period; i < prices.length; i++) {
    result[i] = prices[i] * k + result[i - 1] * (1 - k);
  }

  return result;
}

/**
 * latestEMA(prices, period)
 * -------------------------
 * Convenience wrapper — returns only the last EMA value.
 *
 * @returns {number|null}
 */
function latestEMA(prices, period) {
  const series = computeEMA(prices, period);
  if (!series) return null;
  return series[series.length - 1];
}

/**
 * emaAtOffset(prices, period, offset)
 * ------------------------------------
 * Returns the EMA value `offset` bars before the latest bar.
 * offset=0 → latest, offset=5 → 5 bars ago.
 *
 * @returns {number|null}
 */
function emaAtOffset(prices, period, offset) {
  const series = computeEMA(prices, period);
  if (!series) return null;
  const idx = series.length - 1 - offset;
  if (idx < 0) return null;
  return series[idx];
}

// ---------------------------------------------------------------------------
// RSI  — Relative Strength Index (Wilder's smoothing)
// ---------------------------------------------------------------------------

/**
 * computeRSI(closes, period)
 * --------------------------
 * Wilder's RSI using exponential smoothing for avg gain / avg loss.
 * Seeds with the SMA of gains/losses over the first `period` changes.
 *
 * @param {number[]} closes  Ordered oldest → newest
 * @param {number}   period  RSI period (default 14)
 * @returns {number[]|null}  RSI values (length = closes.length - period),
 *                           or null if insufficient data
 */
function computeRSI(closes, period) {
  if (!Array.isArray(closes) || closes.length <= period || period < 1) return null;

  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // Seed averages from first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else                 avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  const rsiValues = [];

  // First RSI value
  if (avgLoss === 0) {
    rsiValues.push(100);
  } else {
    rsiValues.push(100 - 100 / (1 + avgGain / avgLoss));
  }

  // Wilder smoothing for remaining values
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsiValues.push(100);
    } else {
      rsiValues.push(100 - 100 / (1 + avgGain / avgLoss));
    }
  }

  return rsiValues;
}

/**
 * latestRSI(closes, period)
 * -------------------------
 * Returns only the most recent RSI value.
 *
 * @returns {number|null}
 */
function latestRSI(closes, period) {
  const series = computeRSI(closes, period || 14);
  if (!series || series.length === 0) return null;
  return series[series.length - 1];
}

// ---------------------------------------------------------------------------
// Volume  — Simple average
// ---------------------------------------------------------------------------

/**
 * avgVolume(volumes, period)
 * -------------------------
 * Simple moving average of the last `period` volume values.
 * Uses the tail of the array (most recent periods).
 *
 * @param {number[]} volumes  Ordered oldest → newest
 * @param {number}   period   Number of bars to average (default 20)
 * @returns {number|null}
 */
function avgVolume(volumes, period) {
  if (!Array.isArray(volumes) || volumes.length < period || period < 1) return null;
  const slice = volumes.slice(volumes.length - period);
  let sum = 0;
  for (const v of slice) sum += (v || 0);
  return sum / period;
}

// ---------------------------------------------------------------------------
// 52-Week High
// ---------------------------------------------------------------------------

/**
 * high52Week(closes)
 * ------------------
 * Maximum close over up to the last 252 candles.
 *
 * @param {number[]} closes  Ordered oldest → newest
 * @returns {number|null}
 */
function high52Week(closes) {
  if (!Array.isArray(closes) || closes.length === 0) return null;
  const slice = closes.slice(Math.max(0, closes.length - 252));
  let max = -Infinity;
  for (const c of slice) {
    if (c != null && c > max) max = c;
  }
  return max === -Infinity ? null : max;
}

// ---------------------------------------------------------------------------
// Relative Return
// ---------------------------------------------------------------------------

/**
 * returnOverPeriod(closes, period)
 * --------------------------------
 * ( closes[last] - closes[last - period] ) / closes[last - period]
 * Returns null if not enough data or base price is zero.
 *
 * @param {number[]} closes
 * @param {number}   period  Look-back bars (default 20)
 * @returns {number|null}
 */
function returnOverPeriod(closes, period) {
  const n = period || 20;
  if (!Array.isArray(closes) || closes.length <= n) return null;
  const base = closes[closes.length - 1 - n];
  const last = closes[closes.length - 1];
  if (!base || base === 0) return null;
  return (last - base) / base;
}

// ---------------------------------------------------------------------------
// Range tightness helper
// ---------------------------------------------------------------------------

/**
 * rangePercent(candles, lookback)
 * --------------------------------
 * Computes ( max(high) - min(low) ) / min(low) over the last `lookback` candles.
 * Used to detect tight consolidation bases.
 *
 * @param {Array<{high: number, low: number}>} candles
 * @param {number} lookback  (default 15)
 * @returns {number|null}
 */
function rangePercent(candles, lookback) {
  const n = lookback || 15;
  if (!Array.isArray(candles) || candles.length < n) return null;
  const slice = candles.slice(candles.length - n);
  let maxHigh = -Infinity;
  let minLow  = Infinity;
  for (const c of slice) {
    if (c.high > maxHigh) maxHigh = c.high;
    if (c.low  < minLow)  minLow  = c.low;
  }
  if (minLow === 0 || minLow === Infinity) return null;
  return (maxHigh - minLow) / minLow;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  computeEMA,
  latestEMA,
  emaAtOffset,
  computeRSI,
  latestRSI,
  avgVolume,
  high52Week,
  returnOverPeriod,
  rangePercent,
};
