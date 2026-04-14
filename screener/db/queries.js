'use strict';

const db = require('./index');

/**
 * db/queries.js
 * PostgreSQL implementation of all database operations.
 * All functions are now async.
 */

// ── Symbols ──────────────────────────────────────────────────────────────────

async function insertSymbols(symbols) {
  if (!Array.isArray(symbols) || symbols.length === 0) return { inserted: 0 };
  
  const { client, query, release } = await db.getClient();
  try {
    await query('BEGIN');
    let n = 0;
    const sql = `
      INSERT INTO symbols (symbol, name, sector, is_active)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT(symbol) DO UPDATE SET
        name      = EXCLUDED.name,
        sector    = EXCLUDED.sector,
        is_active = EXCLUDED.is_active
    `;
    
    for (const s of symbols) {
      if (!s.symbol) continue;
      await query(sql, [
        s.symbol,
        s.name || '',
        s.sector || '',
        s.is_active != null ? s.is_active : 1
      ]);
      n++;
    }
    await query('COMMIT');
    return { inserted: n };
  } catch (err) {
    await query('ROLLBACK');
    console.error('[Queries] insertSymbols failed:', err.message);
    throw err;
  } finally {
    release();
  }
}

async function getAllSymbols() {
  const sql = `
    SELECT id, symbol, name, sector
    FROM   symbols
    WHERE  is_active = 1
    ORDER  BY symbol ASC
  `;
  const res = await db.query(sql);
  return res.rows;
}

// ── OHLC Data ───────────────────────────────────────────────────────────────

async function insertOHLC(symbol, candles, keepCount) {
  if (!symbol || !Array.isArray(candles) || candles.length === 0) return { inserted: 0 };
  const keep = keepCount || 350;
  
  const { client, query, release } = await db.getClient();
  try {
    const validCandles = candles.filter(c => c.date && c.close != null);
    if (validCandles.length === 0) return { inserted: 0 };

    await query('BEGIN');
    
    // Build a bulk insert query
    // SQL: INSERT INTO ohlc_data (...) VALUES ($1, $2, ...), ($8, $9, ...)
    const values = [];
    const placeholders = [];
    
    validCandles.forEach((c, i) => {
      const idx = i * 7;
      placeholders.push(`($${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6}, $${idx+7})`);
      values.push(
        symbol, c.date,
        c.open   != null ? c.open   : 0,
        c.high   != null ? c.high   : 0,
        c.low    != null ? c.low    : 0,
        c.close,
        c.volume != null ? c.volume : 0
      );
    });

    const bulkUpsertSql = `
      INSERT INTO ohlc_data (symbol, date, open, high, low, close, volume)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT(symbol, date) DO UPDATE SET
        open   = EXCLUDED.open,
        high   = EXCLUDED.high,
        low    = EXCLUDED.low,
        close  = EXCLUDED.close,
        volume = EXCLUDED.volume
    `;
    
    await query(bulkUpsertSql, values);
    
    // Prune logic
    const pruneSql = `
      DELETE FROM ohlc_data
      WHERE symbol = $1
        AND date NOT IN (
          SELECT date FROM ohlc_data
          WHERE  symbol = $1
          ORDER  BY date DESC
          LIMIT  $2
        )
    `;
    await query(pruneSql, [symbol, keep]);
    
    await query('COMMIT');
    return { inserted: validCandles.length };
  } catch (err) {
    await query('ROLLBACK');
    console.error(`[Queries] insertOHLC failed for ${symbol}:`, err.message);
    throw err;
  } finally {
    release();
  }
}

async function getOHLC(symbol, limit) {
  const sql = `
    SELECT date, open, high, low, close, volume
    FROM   ohlc_data
    WHERE  symbol = $1
    ORDER  BY date DESC
    LIMIT  $2
  `;
  const res = await db.query(sql, [symbol, limit || 150]);
  return res.rows;
}

// ── Signals ──────────────────────────────────────────────────────────────────

async function upsertSignal(signal) {
  const now    = new Date().toISOString();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const insertSql = `
    INSERT INTO signals
      (symbol, price, rsi, volume_ratio, signal_type, action, score, quality, reasons, advice, fundamentals, timestamp)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `;
  
  const deleteSql = `
    DELETE FROM signals
    WHERE symbol    = $1
      AND timestamp < $2
  `;

  const reasons = Array.isArray(signal.reasons) ? JSON.stringify(signal.reasons) : '[]';
  const fundamentals = signal.fundamentals && typeof signal.fundamentals === 'object' 
    ? JSON.stringify(signal.fundamentals) 
    : null;
  
  await db.query(insertSql, [
    signal.symbol, signal.price, signal.rsi,
    signal.volume_ratio != null ? signal.volume_ratio : 0,
    signal.signal_type, signal.action, 
    signal.score != null ? signal.score : 0,
    signal.quality, reasons,
    signal.advice || null,
    fundamentals,
    signal.timestamp || now
  ]);
  
  await db.query(deleteSql, [signal.symbol, cutoff]);
}

function parseSignal(row) {
  if (!row) return null;
  try {
    row.reasons = JSON.parse(row.reasons || '[]');
  } catch (_) {
    row.reasons = [];
  }
  try {
    if (row.fundamentals && typeof row.fundamentals === 'string') {
      row.fundamentals = JSON.parse(row.fundamentals);
    }
  } catch (_) {
    row.fundamentals = null;
  }
  return row;
}

async function getSignals() {
  const sql = `
    SELECT s.*, sy.name, sy.sector
    FROM   signals s
    JOIN   symbols sy ON s.symbol = sy.symbol
    INNER JOIN (
      SELECT symbol, MAX(timestamp) AS latest
      FROM   signals
      GROUP  BY symbol
    ) latest ON s.symbol = latest.symbol AND s.timestamp = latest.latest
    ORDER  BY s.score DESC
  `;
  const res = await db.query(sql);
  return res.rows.map(parseSignal);
}

async function getSignalBySymbol(symbol) {
  const sql = `
    SELECT s.*, sy.name, sy.sector
    FROM   signals s
    JOIN   symbols sy ON s.symbol = sy.symbol
    WHERE  s.symbol = $1
    ORDER  BY s.timestamp DESC
    LIMIT  1
  `;
  const res = await db.query(sql, [symbol]);
  return parseSignal(res.rows[0]);
}

async function getAllSignals(limit) {
  const sql = `
    SELECT s.*, sy.name, sy.sector
    FROM   signals s
    JOIN   symbols sy ON s.symbol = sy.symbol
    ORDER  BY s.timestamp DESC, s.score DESC
    LIMIT  $1
  `;
  const res = await db.query(sql, [limit || 500]);
  return res.rows.map(parseSignal);
}

async function getSignalsLimited(limit, qualityFilter = ['A+', 'A']) {
  const sql = `
    SELECT s.*, sy.name, sy.sector
    FROM   signals s
    JOIN   symbols sy ON s.symbol = sy.symbol
    INNER JOIN (
      SELECT symbol, MAX(timestamp) AS latest
      FROM   signals
      GROUP  BY symbol
    ) latest ON s.symbol = latest.symbol AND s.timestamp = latest.latest
    ORDER  BY s.score DESC
    LIMIT  $1
  `;
  const res = await db.query(sql, [limit * 2 || 200]);
  return res.rows
    .map(parseSignal)
    .filter(s => qualityFilter.includes(s.quality))
    .slice(0, limit || 50);
}

async function searchSymbols(queryStr, limit) {
  const q     = '%' + (queryStr || '').toUpperCase() + '%';
  const op    = (queryStr || '').toUpperCase() + '%';
  const sql = `
    SELECT symbol, name
    FROM   symbols
    WHERE  is_active = 1
      AND  (symbol LIKE $1 OR name LIKE $1)
    ORDER  BY
      CASE WHEN symbol LIKE $2 THEN 0 ELSE 1 END,
      symbol ASC
    LIMIT  $3
  `;
  const res = await db.query(sql, [q, op, limit || 20]);
  return res.rows;
}

module.exports = {
  insertSymbols,
  getAllSymbols,
  insertOHLC,
  getOHLC,
  upsertSignal,
  getSignals,
  getSignalBySymbol,
  getAllSignals,
  getSignalsLimited,
  searchSymbols,
};
