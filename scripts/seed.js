// Seed the Operations Center topology with the initial wholesaler (TU)
// reference data. Safe to re-run — inserts skip existing rows.
//
// Usage: DATABASE_URL=... node scripts/seed.js

const { getPool, migrate } = require('../src/db');
const { seedDefaults } = require('../src/seed-data');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set — aborting seed.');
    process.exit(1);
  }
  await migrate();
  const summary = await seedDefaults();
  console.log(`[seed] tiers:        ${summary.tiers.inserted} inserted (total ${summary.tiers.total})`);
  console.log(`[seed] services:     ${summary.services.inserted} inserted (total ${summary.services.total})`);
  console.log(`[seed] dependencies: ${summary.dependencies.inserted} inserted (total ${summary.dependencies.total})`);
}

main()
  .then(async () => { await getPool().end(); })
  .catch(async (err) => {
    console.error('[seed] failed:', err.message);
    try { await getPool().end(); } catch {}
    process.exit(1);
  });
