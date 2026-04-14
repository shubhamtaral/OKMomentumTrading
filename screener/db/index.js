const { Pool } = require('pg');
const dns = require('dns');

// Force Node.js to prefer IPv4 over IPv6. 
// This fixes "ENETUNREACH" errors on some hosting providers (like Render or Vercel)
// when connecting to Supabase/PostgreSQL.
dns.setDefaultResultOrder('ipv4first');

let connectionString = (process.env.DATABASE_URL || '').trim();

if (!connectionString) {
  console.error('[DB] FATAL: DATABASE_URL environment variable is missing.');
  console.error('[DB] Please provide a valid PostgreSQL connection string.');
  process.exit(1);
}

// Basic format check
if (!connectionString.startsWith('postgres://') && !connectionString.startsWith('postgresql://')) {
  console.error('[DB] FATAL: Invalid DATABASE_URL format.');
  console.error('[DB] It must start with "postgres://" or "postgresql://".');
  process.exit(1);
}

// Detect if we should use SSL
// Usually true for production managed DBs, false for local Docker/dev
const useSSL = process.env.DB_SSL === 'true' || 
               (process.env.NODE_ENV === 'production' && 
                !connectionString.includes('localhost') && 
                !connectionString.includes('@db:'));

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
});

/**
 * query(text, params)
 * Helper to run queries using the pool.
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    // console.log('[DB] Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (err) {
    console.error('[DB] Query Error:', err.message);
    throw err;
  }
}

/**
 * getClient()
 * Returns a client from the pool for transactions.
 */
async function getClient() {
  const client = await pool.connect();
  const query = client.query.bind(client);
  const release = client.release.bind(client);
  return { client, query, release };
}

module.exports = {
  query,
  getClient,
  pool,
};
