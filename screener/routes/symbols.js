'use strict';

/**
 * routes/symbols.js
 * -----------------
 * Endpoints:
 *   GET /symbols          — full active symbol list (for client-side autocomplete)
 *   GET /symbols?q=REL    — server-side filtered search (symbol LIKE %REL%, max 20)
 *
 * Rules:
 *   - No business logic; data from queries.js only
 *   - No external API calls
 *   - Safe against SQL injection via prepared statements in queries.js
 */

const express                          = require('express');
const { getAllSymbols, searchSymbols } = require('../db/queries');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /symbols
// ---------------------------------------------------------------------------

/**
 * With no query param:  returns all active symbols (for one-time client-side cache).
 * With ?q=<term>:       returns up to `limit` matches filtered server-side.
 *
 * Query params:
 *   q      {string}  Search term — matched against symbol and name (case-insensitive)
 *   limit  {number}  Max results when ?q is present (default 20, max 50)
 *
 * Response 200 (no ?q):
 *   {
 *     count:   number,
 *     symbols: [ { symbol, name } ]
 *   }
 *
 * Response 200 (with ?q):
 *   {
 *     count:   number,
 *     query:   string,
 *     symbols: [ { symbol, name } ]
 *   }
 *
 * Response 400:
 *   Query term too long (> 50 chars) or contains disallowed characters
 */
router.get('/', async (req, res) => {
  const { q, limit: rawLimit } = req.query;

  // If no search term, return full symbol list for client-side autocomplete
  if (q === undefined || q === null || q === '') {
    try {
      const rows = await getAllSymbols();
      // Slim the payload — only what the frontend needs
      const symbols = rows.map(({ symbol, name }) => ({ symbol, name }));
      return res.json({ count: symbols.length, symbols });
    } catch (err) {
      console.error('[GET /symbols] DB error:', err.message);
      return res.status(500).json({ error: 'Failed to fetch symbols', detail: err.message });
    }
  }

  // Validate query term
  const term = String(q).trim();
  if (term.length === 0) {
    return res.json({ count: 0, query: term, symbols: [] });
  }
  if (term.length > 50) {
    return res.status(400).json({
      error:   'Query too long',
      message: 'Search term must be 50 characters or fewer.',
    });
  }
  // Block characters that have no place in a stock symbol search
  if (!/^[A-Za-z0-9 &.\-]+$/.test(term)) {
    return res.status(400).json({
      error:   'Invalid query',
      message: 'Search term may only contain letters, digits, spaces, dots, & or -.',
    });
  }

  // Parse optional limit
  const rawLimitNum = parseInt(rawLimit, 10);
  const limit = !isNaN(rawLimitNum) && rawLimitNum > 0
    ? Math.min(rawLimitNum, 50)
    : 20;

  try {
    const rows    = await searchSymbols(term.toUpperCase(), limit);
    const symbols = rows.map(({ symbol, name }) => ({ symbol, name }));
    return res.json({ count: symbols.length, query: term.toUpperCase(), symbols });
  } catch (err) {
    console.error('[GET /symbols?q=] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to search symbols', detail: err.message });
  }
});

module.exports = router;
