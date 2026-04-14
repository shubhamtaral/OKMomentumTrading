const db = require('./index');

async function migrate() {
  try {
    await db.query('ALTER TABLE signals ADD COLUMN reasons TEXT');
    console.log('[Migration] Added "reasons" column to signals table.');
  } catch (err) {
    // Postgres error code for duplicate column is '42701'
    if (err.code === '42701' || err.message.includes('already exists')) {
      console.log('[Migration] "reasons" column already exists.');
    } else {
      console.error('[Migration] Failed:', err.message);
    }
  }
}

migrate().then(() => process.exit(0));
