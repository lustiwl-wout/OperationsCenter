// Initial reference topology — the wholesaler (TU) service map.
// Shared by scripts/seed.js (CLI) and the POST /api/topology/seed endpoint
// so either entry point loads the exact same data.

const { query } = require('./db');

const TIERS = [
  { slug: 'channels',          label: 'Channels',           position: 0 },
  { slug: 'core-api',          label: 'Core APIs',          position: 1 },
  { slug: 'business',          label: 'Business',           position: 2 },
  { slug: 'operations',        label: 'Operations',         position: 3 },
  { slug: 'systems-of-record', label: 'Systems of Record',  position: 4 },
];

const SERVICES = [
  { id: 'web-portal',      label: 'Web Portal',   tierSlug: 'channels', col: 0 },
  { id: 'mobile-app',      label: 'Mobile App',   tierSlug: 'channels', col: 1 },
  { id: 'branch-terminal', label: 'Branch POS',   tierSlug: 'channels', col: 2 },
  { id: 'edi-gateway',     label: 'EDI Gateway',  tierSlug: 'channels', col: 3 },
  { id: 'punchout',        label: 'Punchout',     tierSlug: 'channels', col: 4 },

  { id: 'order-api',       label: 'Order API',    tierSlug: 'core-api', col: 0 },
  { id: 'catalog-api',     label: 'Catalog API',  tierSlug: 'core-api', col: 1 },
  { id: 'pricing-engine',  label: 'Pricing',      tierSlug: 'core-api', col: 2 },
  { id: 'customer-api',    label: 'Customer API', tierSlug: 'core-api', col: 3 },

  { id: 'search',          label: 'Search',       tierSlug: 'business', col: 0 },
  { id: 'availability',    label: 'Availability', tierSlug: 'business', col: 1 },
  { id: 'credit-check',    label: 'Credit Check', tierSlug: 'business', col: 2 },
  { id: 'quote-engine',    label: 'Quotes',       tierSlug: 'business', col: 3 },
  { id: 'pim',             label: 'PIM',          tierSlug: 'business', col: 4 },

  { id: 'wms',             label: 'WMS',          tierSlug: 'operations', col: 0 },
  { id: 'dispatch',        label: 'Dispatch',     tierSlug: 'operations', col: 1 },
  { id: 'transport',       label: 'Transport',    tierSlug: 'operations', col: 2 },
  { id: 'invoicing',       label: 'Invoicing',    tierSlug: 'operations', col: 3 },
  { id: 'replenishment',   label: 'Replenish',    tierSlug: 'operations', col: 4 },

  { id: 'sap-erp',         label: 'SAP ERP',      tierSlug: 'systems-of-record', col: 0 },
  { id: 'product-mdm',     label: 'Product MDM',  tierSlug: 'systems-of-record', col: 1 },
  { id: 'stock-db',        label: 'Stock DB',     tierSlug: 'systems-of-record', col: 2 },
  { id: 'customer-crm',    label: 'CRM',          tierSlug: 'systems-of-record', col: 3 },
];

const DEPENDENCIES = [
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

  ['order-api',       'pricing-engine'],
  ['order-api',       'availability'],
  ['order-api',       'credit-check'],
  ['catalog-api',     'pim'],
  ['catalog-api',     'search'],
  ['pricing-engine',  'customer-crm'],
  ['pricing-engine',  'sap-erp'],
  ['customer-api',    'customer-crm'],

  ['search',          'pim'],
  ['availability',    'stock-db'],
  ['credit-check',    'customer-crm'],
  ['credit-check',    'sap-erp'],
  ['quote-engine',    'pricing-engine'],
  ['pim',             'product-mdm'],

  ['wms',             'stock-db'],
  ['wms',             'sap-erp'],
  ['dispatch',        'transport'],
  ['invoicing',       'sap-erp'],
  ['invoicing',       'customer-crm'],
  ['replenishment',   'stock-db'],
  ['replenishment',   'sap-erp'],
];

// Insert-if-absent semantics — safe to run repeatedly. Returns a summary
// of how many rows each bucket inserted vs. the total reference size.
async function seedDefaults() {
  let tiers = 0;
  for (const t of TIERS) {
    const { rowCount } = await query(
      `INSERT INTO tiers (slug, label, position)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO NOTHING`,
      [t.slug, t.label, t.position]
    );
    tiers += rowCount;
  }

  const { rows: tierRows } = await query(`SELECT id, slug FROM tiers`);
  const tierIdBySlug = Object.fromEntries(tierRows.map(r => [r.slug, r.id]));

  let services = 0;
  for (const s of SERVICES) {
    const tierId = tierIdBySlug[s.tierSlug];
    if (!tierId) continue;
    const { rowCount } = await query(
      `INSERT INTO services (id, label, tier_id, col)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [s.id, s.label, tierId, s.col]
    );
    services += rowCount;
  }

  let dependencies = 0;
  for (const [from, to] of DEPENDENCIES) {
    const { rowCount } = await query(
      `INSERT INTO dependencies (from_service, to_service)
       VALUES ($1, $2)
       ON CONFLICT (from_service, to_service) DO NOTHING`,
      [from, to]
    );
    dependencies += rowCount;
  }

  return {
    tiers:        { inserted: tiers,        total: TIERS.length },
    services:     { inserted: services,     total: SERVICES.length },
    dependencies: { inserted: dependencies, total: DEPENDENCIES.length },
  };
}

module.exports = { seedDefaults, TIERS, SERVICES, DEPENDENCIES };
