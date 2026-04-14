/**
 * services/api.js
 * ---------------
 * All HTTP communication with the backend.
 * Pure data layer — no React, no state, no side effects.
 *
 * Base URL: reads VITE_API_URL env var (defaults to '' so Vite's proxy
 * handles /scan and /symbols in development).
 * In production set: VITE_API_URL=https://your-backend.com
 */

const BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/**
 * Internal fetch wrapper.
 * Throws a structured error on non-2xx responses.
 */
async function apiFetch(path, options = {}) {
  const url = BASE_URL + path;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.message || body.error || message;
    } catch (_) { /* body not JSON */ }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * fetchBulkSignals(limit)
 * -----------------------
 * GET /scan?limit=N
 * Returns { count, signals: Signal[] }
 *
 * @param {number} [limit=50]
 * @returns {Promise<{ count: number, signals: Signal[] }>}
 */
export async function fetchBulkSignals(limit = 50, showAll = false) {
  const query = new URLSearchParams({ limit });
  if (showAll) query.set('all', 'true');
  return apiFetch(`/scan?${query.toString()}`);
}

/**
  
  const headers = {};
 * fetchSingleSignal(symbol, aiKey)
 * -------------------------
 * POST /scan/single  { symbol }
 * Returns a single Signal object.
 */
export async function fetchSingleSignal(symbol, aiKey = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (aiKey) headers['x-ai-key'] = aiKey;

  const res = await fetch(`${BASE_URL}/scan/single`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ symbol }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Fetch failed');
  }
  return res.json();
}

/**
 * fetchSymbols()
 * -------------
 * GET /symbols
 * Returns { count, symbols: { symbol, name }[] }
 * Called once on app load and cached in state.
 *
 * @returns {Promise<{ count: number, symbols: { symbol: string, name: string }[] }>}
 */
export async function fetchSymbols() {
  return apiFetch('/symbols');
}

/**
 * triggerRunScan(aiKey)
 * --------------------
 * POST /scan/run
 * Triggers a full market scan in the background.
 */
export async function triggerRunScan(aiKey = null) {
  const headers = {};
  if (aiKey) headers['x-ai-key'] = aiKey;
  return apiFetch('/scan/run', { method: 'POST', headers });
}

/**
 * @typedef {Object} Signal
 * @property {string} symbol
 * @property {number} price
 * @property {number} rsi
 * @property {number} volume_ratio
 * @property {string} signal_type
 * @property {string} action        BUY | SELL | EXIT
 * @property {number} score
 * @property {string} quality       A+ | A | B
 * @property {string} timestamp
 */
