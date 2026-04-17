// Neon (PostgreSQL) connection + schema bootstrap.
// The Operations Center stores its topology (tiers, services, dependencies)
// in Postgres. On first boot we create the tables if they don't exist.

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

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tiers (
  id         SERIAL PRIMARY KEY,
  slug       TEXT   UNIQUE NOT NULL,
  label      TEXT   NOT NULL,
  position   INT    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS services (
  id         TEXT   PRIMARY KEY,
  label      TEXT   NOT NULL,
  tier_id    INT    NOT NULL REFERENCES tiers(id) ON DELETE CASCADE,
  col        INT    NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS services_tier_idx ON services(tier_id);

CREATE TABLE IF NOT EXISTS dependencies (
  id             SERIAL PRIMARY KEY,
  from_service   TEXT   NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  to_service     TEXT   NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  UNIQUE (from_service, to_service),
  CHECK  (from_service <> to_service)
);
CREATE INDEX IF NOT EXISTS deps_from_idx ON dependencies(from_service);
CREATE INDEX IF NOT EXISTS deps_to_idx   ON dependencies(to_service);
`;

async function migrate() {
  const p = getPool();
  if (!p) {
    console.warn('[db] DATABASE_URL not set — skipping migrations');
    return false;
  }
  await p.query(SCHEMA);
  console.log('[db] schema ready');
  return true;
}

module.exports = { getPool, query, migrate };
