'use strict';

/**
 * services/ohlcFetcher.js
 * -----------------------
 * Fetches 6-month daily OHLCV data from Yahoo Finance for a given symbol.
 *
 * Rules:
 *   - Pure fetch + transform (no DB logic)
 *   - Retries once on failure then throws
 *   - Filters out candles with null/zero prices
 *   - Returns candles sorted ascending by date (oldest first)
 */

const axios = require('axios');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

const REQUEST_HEADERS = {
  'User-Agent':  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept':      'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  // Without this header Yahoo often returns 401
  'Origin':      'https://finance.yahoo.com',
  'Referer':     'https://finance.yahoo.com/',
};

const FETCH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Timestamp -> YYYY-MM-DD
// ---------------------------------------------------------------------------

/**
 * toDateString(unixSeconds)
 * Converts a Unix timestamp (seconds) to an ISO date string (YYYY-MM-DD).
 * Uses UTC to avoid timezone-induced off-by-one errors.
 *
 * @param {number} unixSeconds
 * @returns {string}
 */
function toDateString(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

/**
 * parseYahooResponse(data)
 * ------------------------
 * Extracts candles from the Yahoo Finance v8 chart API response.
 * Skips any candle where close is null/zero/NaN.
 *
 * @param {object} data - parsed JSON response body
 * @returns {Array<{date, open, high, low, close, volume}>}
 */
function parseYahooResponse(data) {
  const result = data && data.chart && data.chart.result;
  if (!result || result.length === 0) {
    throw new Error('Empty chart result from Yahoo');
  }

  const chartData   = result[0];
  const timestamps  = chartData.timestamp || [];
  const quote       = (chartData.indicators && chartData.indicators.quote && chartData.indicators.quote[0]) || {};
  const opens       = quote.open   || [];
  const highs       = quote.high   || [];
  const lows        = quote.low    || [];
  const closes      = quote.close  || [];
  const volumes     = quote.volume || [];

  if (timestamps.length === 0) {
    throw new Error('No timestamp data in Yahoo response');
  }

  const candles = [];

  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];

    // Skip malformed candles
    if (close == null || isNaN(close) || close <= 0) continue;

    candles.push({
      date:   toDateString(timestamps[i]),
      open:   opens[i]   != null ? opens[i]   : close,
      high:   highs[i]   != null ? highs[i]   : close,
      low:    lows[i]    != null ? lows[i]    : close,
      close:  close,
      volume: volumes[i] != null ? volumes[i] : 0,
    });
  }

  // Return ascending by date (oldest first) for correct EMA calculations
  candles.sort((a, b) => (a.date > b.date ? 1 : -1));
  return candles;
}

// ---------------------------------------------------------------------------
// Core fetcher
// ---------------------------------------------------------------------------

/**
 * fetchOHLC(symbol)
 * -----------------
 * Fetches 6 months of daily OHLCV for the given symbol (e.g. "RELIANCE.NS").
 * Throws on failure — callers should use fetchOHLCWithRetry for resilience.
 *
 * @param {string} symbol
 * @returns {Promise<Array<{date, open, high, low, close, volume}>>}
 */
async function fetchOHLC(symbol) {
  const url = YAHOO_BASE + '/' + encodeURIComponent(symbol) + '?interval=1d&range=6mo';

  const response = await axios.get(url, {
    headers: REQUEST_HEADERS,
    timeout: FETCH_TIMEOUT_MS,
  });

  if (response.status !== 200) {
    throw new Error('Yahoo HTTP ' + response.status + ' for ' + symbol);
  }

  const candles = parseYahooResponse(response.data);

  if (candles.length === 0) {
    throw new Error('Zero valid candles returned for ' + symbol);
  }

  return candles;
}

// ---------------------------------------------------------------------------
// Retry wrapper
// ---------------------------------------------------------------------------

/**
 * fetchOHLCWithRetry(symbol)
 * --------------------------
 * Fetches OHLC data with one automatic retry on failure.
 * Returns null (does not throw) if both attempts fail, so the caller
 * can skip and continue with the next symbol.
 *
 * @param {string} symbol
 * @returns {Promise<Array<{date, open, high, low, close, volume}>|null>}
 */
async function fetchOHLCWithRetry(symbol) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const candles = await fetchOHLC(symbol);
      return candles;
    } catch (err) {
      console.warn('[OHLCFetcher] ' + symbol + ' attempt ' + attempt + ' failed: ' + err.message);

      if (attempt < 2) {
        // Wait 2s before retry to avoid hammering Yahoo
        await new Promise((res) => setTimeout(res, 2000));
      }
    }
  }

  console.error('[OHLCFetcher] Skipping ' + symbol + ' — both attempts failed.');
  return null;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { fetchOHLC, fetchOHLCWithRetry, parseYahooResponse, toDateString };
