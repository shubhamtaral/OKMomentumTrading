'use strict';

/**
 * services/symbolFetcher.js
 * -------------------------
 * Fetches the NSE equity universe CSV and returns a clean array
 * of {symbol, name} objects ready for DB insertion.
 *
 * Rules:
 *   - Fetches and parses in memory (no file saved to disk)
 *   - Filters to EQ series only (eliminates BE, SM, BL etc.)
 *   - Normalises symbol to SYMBOL.NS format
 *   - No DB logic here — pure fetch + parse
 */

const axios = require('axios');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const NSE_CSV_URL = 'https://archives.nseindia.com/content/equities/EQUITY_L.csv';

const REQUEST_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer':         'https://www.nseindia.com/',
};

// NSE CSV column indices
const COL_SYMBOL = 0;
const COL_NAME   = 1;
const COL_SERIES = 2;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * parseNSECsv(csvText)
 * --------------------
 * Converts raw CSV text into an array of symbol records.
 * Filters to EQ series, skips header row and malformed lines.
 *
 * @param {string} csvText
 * @returns {Array<{symbol: string, name: string}>}
 */
function parseNSECsv(csvText) {
  const lines  = csvText.split('\n');
  const result = [];

  // Skip header (line 0)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(',');
    if (cols.length < 3) continue;

    const rawSymbol = (cols[COL_SYMBOL] || '').trim().toUpperCase();
    const rawName   = (cols[COL_NAME]   || '').trim();
    const series    = (cols[COL_SERIES] || '').trim().toUpperCase();

    // Only EQ series (regular equity)
    if (series !== 'EQ') continue;
    if (!rawSymbol)       continue;

    result.push({
      symbol: rawSymbol + '.NS',   // Normalise to Yahoo Finance format
      name:   rawName,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

/**
 * fetchNSESymbols()
 * -----------------
 * Downloads the NSE EQUITY_L.csv, parses it in memory, and returns
 * all EQ-series symbols normalised to SYMBOL.NS format.
 *
 * @returns {Promise<Array<{symbol: string, name: string}>>}
 * @throws  {Error} if the fetch fails after one retry
 */
async function fetchNSESymbols() {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log('[SymbolFetcher] Fetching NSE CSV (attempt ' + attempt + ')...');

      const response = await axios.get(NSE_CSV_URL, {
        headers:        REQUEST_HEADERS,
        timeout:        30_000,
        responseType:   'text',
        // Some environments need this to avoid gzip decode issues
        decompress:     true,
      });

      if (response.status !== 200) {
        throw new Error('HTTP ' + response.status);
      }

      const symbols = parseNSECsv(response.data);

      if (symbols.length === 0) {
        throw new Error('Parsed 0 symbols — CSV may be malformed');
      }

      console.log('[SymbolFetcher] Parsed ' + symbols.length + ' EQ symbols.');
      return symbols;

    } catch (err) {
      lastError = err;
      console.warn('[SymbolFetcher] Attempt ' + attempt + ' failed:', err.message);

      if (attempt < 2) {
        // Brief pause before retry
        await new Promise((res) => setTimeout(res, 3000));
      }
    }
  }

  throw new Error('[SymbolFetcher] All attempts failed: ' + lastError.message);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { fetchNSESymbols, parseNSECsv };
