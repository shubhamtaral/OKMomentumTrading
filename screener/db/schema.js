'use strict';

/**
 * db/schema.js
 * Creates all tables and indexes for PostgreSQL.
 * Safe to run multiple times (idempotent).
 */

const db = require('./index');

const CREATE_SYMBOLS = `
  CREATE TABLE IF NOT EXISTS symbols (
    id        SERIAL PRIMARY KEY,
    symbol    TEXT    NOT NULL UNIQUE,
    name      TEXT    NOT NULL,
    sector    TEXT    DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1
  );
`;

const CREATE_OHLC = `
  CREATE TABLE IF NOT EXISTS ohlc_data (
    id      SERIAL PRIMARY KEY,
    symbol  TEXT    NOT NULL,
    date    TEXT    NOT NULL,
    open    DOUBLE PRECISION NOT NULL,
    high    DOUBLE PRECISION NOT NULL,
    low     DOUBLE PRECISION NOT NULL,
    close   DOUBLE PRECISION NOT NULL,
    volume  DOUBLE PRECISION NOT NULL DEFAULT 0,
    UNIQUE (symbol, date)
  );
`;

const CREATE_SIGNALS = `
  CREATE TABLE IF NOT EXISTS signals (
    id           SERIAL PRIMARY KEY,
    symbol       TEXT    NOT NULL,
    price        DOUBLE PRECISION NOT NULL,
    rsi          DOUBLE PRECISION NOT NULL,
    volume_ratio DOUBLE PRECISION NOT NULL DEFAULT 0,
    signal_type  TEXT    NOT NULL,
    action       TEXT    NOT NULL,
    score        INTEGER NOT NULL DEFAULT 0,
    quality      TEXT    NOT NULL,
    reasons      TEXT,
    advice       TEXT,
    timestamp    TEXT    NOT NULL
  );
`;

async function initSchema() {
  const { client, query, release } = await db.getClient();
  try {
    await query('BEGIN');
    await query(CREATE_SYMBOLS);
    await query(CREATE_OHLC);
    await query(CREATE_SIGNALS);
    await query('CREATE INDEX IF NOT EXISTS idx_ohlc_symbol_date ON ohlc_data (symbol, date DESC);');
    await query('CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals (symbol);');
    await query('CREATE INDEX IF NOT EXISTS idx_signals_quality_score ON signals (quality, score DESC);');
    await query('CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals (timestamp DESC);');
    await query('COMMIT');
    console.log('[Schema] PostgreSQL Tables and indexes ready.');
  } catch (err) {
    await query('ROLLBACK');
    console.error('[Schema] Failed to initialize:', err.message);
    throw err;
  } finally {
    release();
  }
}

if (require.main === module) {
  initSchema()
    .then(() => {
      console.log('[Schema] Init complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Schema] FATAL:', err.message);
      process.exit(1);
    });
}

module.exports = { initSchema };
