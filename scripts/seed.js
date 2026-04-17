// Seed the Operations Center topology with the initial wholesaler (TU)
// reference data: 5 levels, 23 processes, and the lines between them.
//
// Idempotent — re-running will skip anything that already exists (matched by
// slug for tiers, by id for services, and by (from, to) for dependencies).
//
// Usage: DATABASE_URL=... node scripts/seed.js

const { getPool, migrate, query } = require('../src/db');

const TIERS = [
  { slug: 'channels',          label: 'Channels',           position: 0 },
  { slug: 'core-api',          label: 'Core APIs',          position: 1 },
  { slug: 'business',          label: 'Business',           position: 2 },
  { slug: 'operations',        label: 'Operations',         position: 3 },
  { slug: 'systems-of-record', label: 'Systems of Record',  position: 4 },
];

const SERVICES = [
  // ---- Channels ----
  { id: 'web-portal',      label: 'Web Portal',   tierSlug: 'channels', col: 0 },
  { id: 'mobile-app',      label: 'Mobile App',   tierSlug: 'channels', col: 1 },
  { id: 'branch-terminal', label: 'Branch POS',   tierSlug: 'channels', col: 2 },
  { id: 'edi-gateway',     label: 'EDI Gateway',  tierSlug: 'channels', col: 3 },
  { id: 'punchout',        label: 'Punchout',     tierSlug: 'channels', col: 4 },

  // ---- Core APIs ----
  { id: 'order-api',       label: 'Order API',    tierSlug: 'core-api', col: 0 },
  { id: 'catalog-api',     label: 'Catalog API',  tierSlug: 'core-api', col: 1 },
  { id: 'pricing-engine',  label: 'Pricing',      tierSlug: 'core-api', col: 2 },
  { id: 'customer-api',    label: 'Customer API', tierSlug: 'core-api', col: 3 },

  // ---- Business services ----
  { id: 'search',          label: 'Search',       tierSlug: 'business', col: 0 },
  { id: 'availability',    label: 'Availability', tierSlug: 'business', col: 1 },
  { id: 'credit-check',    label: 'Credit Check', tierSlug: 'business', col: 2 },
  { id: 'quote-engine',    label: 'Quotes',       tierSlug: 'business', col: 3 },
  { id: 'pim',             label: 'PIM',          tierSlug: 'business', col: 4 },

  // ---- Operations ----
  { id: 'wms',             label: 'WMS',          tierSlug: 'operations', col: 0 },
  { id: 'dispatch',        label: 'Dispatch',     tierSlug: 'operations', col: 1 },
  { id: 'transport',       label: 'Transport',    tierSlug: 'operations', col: 2 },
  { id: 'invoicing',       label: 'Invoicing',    tierSlug: 'operations', col: 3 },
  { id: 'replenishment',   label: 'Replenish',    tierSlug: 'operations', col: 4 },

  // ---- Systems of Record ----
  { id: 'sap-erp',         label: 'SAP ERP',      tierSlug: 'systems-of-record', col: 0 },
  { id: 'product-mdm',     label: 'Product MDM',  tierSlug: 'systems-of-record', col: 1 },
  { id: 'stock-db',        label: 'Stock DB',     tierSlug: 'systems-of-record', col: 2 },
  { id: 'customer-crm',    label: 'CRM',          tierSlug: 'systems-of-record', col: 3 },
];

const DEPENDENCIES = [
  // Channels → Core APIs / Business
  ['web-portal',      'catalog-api'],
  ['web-portal',      'order-api'],
  ['web-portal',      'customer-api'],
  ['web-portal',      'search'],
  ['mobile-app',      'catalog-api'],
  ['mobile-app',      'order-api'],
  ['mobile-app',      'search'],
  ['branch-terminal', 'catalog-api'],
  ['branch-terminal', 'order-api'],
  ['branch-terminal', 'availability'],
  ['edi-gateway',     'order-api'],
  ['edi-gateway',     'pricing-engine'],
  ['punchout',        'catalog-api'],
  ['punchout',        'order-api'],

  // Core APIs → Business / Data
  ['order-api',    'pricing-engine'],
  ['order-api',    'availability'],
  ['order-api',    'credit-check'],
  ['catalog-api',  'pim'],
  ['catalog-api',  'search'],
  ['pricing-engine', 'customer-crm'],
  ['pricing-engine', 'sap-erp'],
  ['customer-api', 'customer-crm'],

  // Business → Data
  ['search',       'pim'],
  ['availability', 'stock-db'],
  ['credit-check', 'customer-crm'],
  ['credit-check', 'sap-erp'],
  ['quote-engine', 'pricing-engine'],
  ['pim',          'product-mdm'],

  // Operations → Data
  ['wms',           'stock-db'],
  ['wms',           'sap-erp'],
  ['dispatch',      'transport'],
  ['invoicing',     'sap-erp'],
  ['invoicing',     'customer-crm'],
  ['replenishment', 'stock-db'],
  ['replenishment', 'sap-erp'],
];

async function seed() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set — aborting seed.');
    process.exit(1);
  }
  await migrate();

  let tiersInserted = 0;
  for (const t of TIERS) {
    const { rowCount } = await query(
      `INSERT INTO tiers (slug, label, position)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO NOTHING`,
      [t.slug, t.label, t.position]
    );
    tiersInserted += rowCount;
  }

  const { rows: tierRows } = await query(`SELECT id, slug FROM tiers`);
  const tierIdBySlug = Object.fromEntries(tierRows.map(r => [r.slug, r.id]));

  let servicesInserted = 0;
  for (const s of SERVICES) {
    const tierId = tierIdBySlug[s.tierSlug];
    if (!tierId) {
      console.warn(`skipping ${s.id}: unknown tier ${s.tierSlug}`);
      continue;
    }
    const { rowCount } = await query(
      `INSERT INTO services (id, label, tier_id, col)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [s.id, s.label, tierId, s.col]
    );
    servicesInserted += rowCount;
  }

  let depsInserted = 0;
  for (const [from, to] of DEPENDENCIES) {
    const { rowCount } = await query(
      `INSERT INTO dependencies (from_service, to_service)
       VALUES ($1, $2)
       ON CONFLICT (from_service, to_service) DO NOTHING`,
      [from, to]
    );
    depsInserted += rowCount;
  }

  console.log(`[seed] tiers: ${tiersInserted} inserted (total ${TIERS.length})`);
  console.log(`[seed] services: ${servicesInserted} inserted (total ${SERVICES.length})`);
  console.log(`[seed] dependencies: ${depsInserted} inserted (total ${DEPENDENCIES.length})`);
}

seed()
  .then(async () => { await getPool().end(); })
  .catch(async (err) => {
    console.error('[seed] failed:', err.message);
    try { await getPool().end(); } catch {}
    process.exit(1);
  });
