// Operations Center — mock data provider.
// Service topology modelled on a technical wholesaler like Technische Unie:
// B2B channels (web, mobile, EDI, punchout, branch terminals) → core APIs →
// business services (pricing, availability across 43 DCs, credit check) →
// operations (WMS, dispatch, transport, invoicing) → systems of record
// (SAP ERP, CRM, PIM, stock).

const TOOLS = [
  { id: 'datadog',     name: 'Datadog',       icon: 'DD', color: '#774AA4' },
  { id: 'newrelic',    name: 'New Relic',     icon: 'NR', color: '#008C99' },
  { id: 'grafana',     name: 'Grafana',       icon: 'GR', color: '#F46800' },
  { id: 'prometheus',  name: 'Prometheus',    icon: 'PR', color: '#E6522C' },
  { id: 'pagerduty',   name: 'PagerDuty',     icon: 'PD', color: '#06AC38' },
  { id: 'splunk',      name: 'Splunk',        icon: 'SP', color: '#F2B824' },
  { id: 'elastic',     name: 'Elastic',       icon: 'EL', color: '#00BFB3' },
  { id: 'sentry',      name: 'Sentry',        icon: 'SE', color: '#6E4AA4' },
  { id: 'dynatrace',   name: 'Dynatrace',     icon: 'DT', color: '#1496FF' },
  { id: 'appdynamics', name: 'AppDynamics',   icon: 'AD', color: '#0057B7' },
  { id: 'solarwinds',  name: 'SolarWinds',    icon: 'SW', color: '#F99D1C' },
  { id: 'azuremon',    name: 'Azure Monitor', icon: 'AZ', color: '#0078D4' },
  { id: 'sapfocused',  name: 'SAP Focused',   icon: 'SR', color: '#0FAAFF' },
  { id: 'zabbix',      name: 'Zabbix',        icon: 'ZB', color: '#D40000' },
  { id: 'statuspage',  name: 'Statuspage',    icon: 'ST', color: '#2389E1' },
];
const TOOL_MAP = Object.fromEntries(TOOLS.map(t => [t.id, t]));

// -----------------------------------------------------------------------
// Service topology — technical wholesaler.
// Tiers (top → bottom):
//   0 channels   — entry points customers and staff use
//   1 core-api   — request handlers / orchestration
//   2 business   — domain services (pricing, availability, credit, catalog)
//   3 ops        — fulfilment / back-office workers
//   4 data       — systems of record (SAP ERP, CRM, MDM, stock)
// -----------------------------------------------------------------------

const SERVICES = [
  // ---- Channels (tier 0) ----
  { id: 'web-portal',        label: 'Web Portal',   tier: 0, col: 0, deps: ['catalog-api', 'order-api', 'customer-api', 'search'] },
  { id: 'mobile-app',        label: 'Mobile App',   tier: 0, col: 1, deps: ['catalog-api', 'order-api', 'search'] },
  { id: 'branch-terminal',   label: 'Branch POS',   tier: 0, col: 2, deps: ['catalog-api', 'order-api', 'availability'] },
  { id: 'edi-gateway',       label: 'EDI Gateway',  tier: 0, col: 3, deps: ['order-api', 'pricing-engine'] },
  { id: 'punchout',          label: 'Punchout',     tier: 0, col: 4, deps: ['catalog-api', 'order-api'] },

  // ---- Core APIs (tier 1) ----
  { id: 'order-api',         label: 'Order API',    tier: 1, col: 0, deps: ['pricing-engine', 'availability', 'credit-check'] },
  { id: 'catalog-api',       label: 'Catalog API',  tier: 1, col: 1, deps: ['pim', 'search'] },
  { id: 'pricing-engine',    label: 'Pricing',      tier: 1, col: 2, deps: ['customer-crm', 'sap-erp'] },
  { id: 'customer-api',      label: 'Customer API', tier: 1, col: 3, deps: ['customer-crm'] },

  // ---- Business services (tier 2) ----
  { id: 'search',            label: 'Search',       tier: 2, col: 0, deps: ['pim'] },
  { id: 'availability',      label: 'Availability', tier: 2, col: 1, deps: ['stock-db'] },
  { id: 'credit-check',      label: 'Credit Check', tier: 2, col: 2, deps: ['customer-crm', 'sap-erp'] },
  { id: 'quote-engine',      label: 'Quotes',       tier: 2, col: 3, deps: ['pricing-engine'] },
  { id: 'pim',               label: 'PIM',          tier: 2, col: 4, deps: ['product-mdm'] },

  // ---- Operations (tier 3) ----
  { id: 'wms',               label: 'WMS',          tier: 3, col: 0, deps: ['stock-db', 'sap-erp'] },
  { id: 'dispatch',          label: 'Dispatch',     tier: 3, col: 1, deps: ['transport'] },
  { id: 'transport',         label: 'Transport',    tier: 3, col: 2, deps: [] },
  { id: 'invoicing',         label: 'Invoicing',    tier: 3, col: 3, deps: ['sap-erp', 'customer-crm'] },
  { id: 'replenishment',     label: 'Replenish',    tier: 3, col: 4, deps: ['stock-db', 'sap-erp'] },

  // ---- Data (tier 4) ----
  { id: 'sap-erp',           label: 'SAP ERP',      tier: 4, col: 0, deps: [] },
  { id: 'product-mdm',       label: 'Product MDM',  tier: 4, col: 1, deps: [] },
  { id: 'stock-db',          label: 'Stock DB',     tier: 4, col: 2, deps: [] },
  { id: 'customer-crm',      label: 'CRM',          tier: 4, col: 3, deps: [] },
];

const TIER_LABELS = ['Channels', 'Core APIs', 'Business', 'Operations', 'Systems of Record'];

// Dutch branches / datacenter regions — fits TU's 43-branch NL footprint.
const REGIONS = ['nl-hoofddorp', 'nl-strijen-dc', 'nl-amsterdam', 'nl-eindhoven', 'nl-rotterdam', 'azure-weu'];

// TU-realistic incidents — each fails a specific service so the topology
// tells a coherent story on screen.
const INCIDENT_TEMPLATES = [
  { severity: 'P1', service: 'sap-erp',        title: 'SAP ERP unreachable from core APIs',  toolId: 'sapfocused' },
  { severity: 'P1', service: 'pricing-engine', title: 'Pricing engine timeouts > 8s',        toolId: 'datadog' },
  { severity: 'P1', service: 'order-api',      title: 'Order API 5xx spike',                 toolId: 'pagerduty' },
  { severity: 'P1', service: 'stock-db',       title: 'Stock DB replication lag > 120s',     toolId: 'azuremon' },
  { severity: 'P1', service: 'edi-gateway',    title: 'EDI gateway rejecting B2B messages',  toolId: 'splunk' },
  { severity: 'P2', service: 'availability',   title: 'Availability: stale stock snapshots', toolId: 'newrelic' },
  { severity: 'P2', service: 'dispatch',       title: 'Dispatch: route optimizer slow',      toolId: 'dynatrace' },
  { severity: 'P2', service: 'pim',            title: 'PIM: product sync delayed 45m',       toolId: 'sentry' },
  { severity: 'P2', service: 'credit-check',   title: 'Credit check provider latency high',  toolId: 'appdynamics' },
  { severity: 'P2', service: 'wms',            title: 'WMS: pick queue backing up',          toolId: 'zabbix' },
  { severity: 'P3', service: 'search',         title: 'Search: relevance degraded',          toolId: 'elastic' },
  { severity: 'P3', service: 'mobile-app',     title: 'Mobile app: elevated error rate',     toolId: 'sentry' },
  { severity: 'P3', service: 'invoicing',      title: 'Invoicing batch: 12m behind',         toolId: 'prometheus' },
  { severity: 'P3', service: 'replenishment',  title: 'Replenishment: 1 supplier feed slow', toolId: 'solarwinds' },
];

function rand(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}
function pick(seed, arr) { return arr[Math.floor(rand(seed) * arr.length)]; }

// Walk the service graph upward (toward consumers) from failing IDs to
// compute the blast radius.
function computeImpact(failingIds) {
  const impacted = new Set(failingIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of SERVICES) {
      if (impacted.has(s.id)) continue;
      if (s.deps.some(d => impacted.has(d))) {
        impacted.add(s.id);
        changed = true;
      }
    }
  }
  return impacted;
}

function getSnapshot() {
  const tick = Math.floor(Date.now() / 20000);

  // Pick a stable-ish set of active incidents.
  const activeIncidents = [];
  // Guaranteed P1 (rotate between pricing / order / stock / edi).
  const p1Pool = INCIDENT_TEMPLATES.filter(i => i.severity === 'P1' && i.service !== 'sap-erp');
  activeIncidents.push({ ...p1Pool[Math.floor(rand(tick) * p1Pool.length)] });
  // A few more incidents of mixed severity.
  const extraCount = 2 + Math.floor(rand(tick + 1) * 2);
  for (let i = 0; i < extraCount; i++) {
    const t = INCIDENT_TEMPLATES[Math.floor(rand(tick + i + 7) * INCIDENT_TEMPLATES.length)];
    if (!activeIncidents.some(a => a.service === t.service)) {
      activeIncidents.push({ ...t });
    }
  }

  // Attach metadata.
  activeIncidents.forEach((inc, i) => {
    const seed = tick + i * 11;
    inc.id = `INC-${(tick % 1000) * 10 + i}`;
    inc.region = pick(seed, REGIONS);
    const tool = TOOL_MAP[inc.toolId];
    inc.toolName = tool.name;
    inc.toolColor = tool.color;
    inc.toolIcon = tool.icon;
    inc.reporters = TOOLS
      .filter(t => t.id !== inc.toolId && rand(seed + t.id.charCodeAt(0)) > 0.75)
      .slice(0, 2)
      .map(t => ({ id: t.id, name: t.name, color: t.color, icon: t.icon }));
    inc.openedAt = new Date(Date.now() - Math.floor(rand(seed) * (inc.severity === 'P1' ? 600 : 2700)) * 1000).toISOString();
  });

  // Primary failing services.
  const failingBySeverity = {};
  activeIncidents.forEach(inc => {
    const current = failingBySeverity[inc.service];
    if (!current || current.severity > inc.severity) {
      failingBySeverity[inc.service] = inc;
    }
  });
  const failingIds = Object.keys(failingBySeverity);
  const impactedIds = computeImpact(failingIds);

  const services = SERVICES.map(s => {
    let status = 'healthy';
    if (failingBySeverity[s.id]) {
      const sev = failingBySeverity[s.id].severity;
      status = sev === 'P1' ? 'critical' : sev === 'P2' ? 'warning' : 'notice';
    } else if (impactedIds.has(s.id)) {
      status = 'impacted';
    }
    return {
      id: s.id, label: s.label, tier: s.tier, col: s.col, deps: s.deps,
      status,
      incident: failingBySeverity[s.id] ? {
        severity: failingBySeverity[s.id].severity,
        toolIcon: failingBySeverity[s.id].toolIcon,
        toolColor: failingBySeverity[s.id].toolColor,
        reporters: failingBySeverity[s.id].reporters,
      } : null,
    };
  });

  const totals = activeIncidents.reduce(
    (a, x) => { a[x.severity.toLowerCase()]++; return a; },
    { p1: 0, p2: 0, p3: 0 }
  );
  const overall =
    totals.p1 > 0 ? 'critical' :
    totals.p2 > 0 ? 'warning'  :
    totals.p3 > 0 ? 'notice'   : 'healthy';

  return {
    generatedAt: new Date().toISOString(),
    overall,
    totals,
    tierLabels: TIER_LABELS,
    services,
    incidents: activeIncidents.sort((a, b) => a.severity.localeCompare(b.severity)),
  };
}

module.exports = { getSnapshot, TOOLS, SERVICES, TIER_LABELS };
