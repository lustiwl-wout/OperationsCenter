// Neon (PostgreSQL) connection stub.
// Not wired into the dashboard yet — visuals are driven by src/data.js.
// When we flip to real data we'll read from here; the Render service expects
// DATABASE_URL to be the Neon pooled connection string.

const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false }, // Neon requires SSL
    max: 5,
  });
  return pool;
}

async function query(text, params) {
  const p = getPool();
  if (!p) throw new Error('DATABASE_URL not set');
  return p.query(text, params);
}

module.exports = { getPool, query };
