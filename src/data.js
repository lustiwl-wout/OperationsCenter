// Operations Center — mock data provider.
// The core model is a service topology: every service belongs to a tier and
// has dependencies on other services. Alerts raise the status of specific
// services; the impact (blast radius) is computed by walking the dependency
// graph from each failing service.

const TOOLS = [
  { id: 'datadog',     name: 'Datadog',        icon: 'DD', color: '#774AA4' },
  { id: 'newrelic',    name: 'New Relic',      icon: 'NR', color: '#008C99' },
  { id: 'grafana',     name: 'Grafana',        icon: 'GR', color: '#F46800' },
  { id: 'prometheus',  name: 'Prometheus',     icon: 'PR', color: '#E6522C' },
  { id: 'pagerduty',   name: 'PagerDuty',      icon: 'PD', color: '#06AC38' },
  { id: 'splunk',      name: 'Splunk',         icon: 'SP', color: '#F2B824' },
  { id: 'elastic',     name: 'Elastic',        icon: 'EL', color: '#00BFB3' },
  { id: 'sentry',      name: 'Sentry',         icon: 'SE', color: '#6E4AA4' },
  { id: 'dynatrace',   name: 'Dynatrace',      icon: 'DT', color: '#1496FF' },
  { id: 'appdynamics', name: 'AppDynamics',    icon: 'AD', color: '#0057B7' },
  { id: 'cloudwatch',  name: 'CloudWatch',     icon: 'CW', color: '#FF9900' },
  { id: 'azuremon',    name: 'Azure Monitor',  icon: 'AZ', color: '#0078D4' },
  { id: 'gcpops',      name: 'GCP Ops',        icon: 'GC', color: '#4285F4' },
  { id: 'zabbix',      name: 'Zabbix',         icon: 'ZB', color: '#D40000' },
  { id: 'statuspage',  name: 'Statuspage',     icon: 'ST', color: '#2389E1' },
];
const TOOL_MAP = Object.fromEntries(TOOLS.map(t => [t.id, t]));

// -----------------------------------------------------------------------
// Service topology.
// Each service has:
//   - id, label
//   - tier    (row in the topology: 0 = edge, 4 = data stores)
//   - col     (column inside its tier)
//   - deps    (services it depends on — arrows flow DOWN to deps)
//
// Tiers:
//   0 edge        — customer-facing
//   1 api         — request handlers
//   2 services    — business logic / workers
//   3 async       — background jobs
//   4 data        — storage
// -----------------------------------------------------------------------

const SERVICES = [
  // ---- Edge (tier 0) ----
  { id: 'cdn-edge',         label: 'CDN',         tier: 0, col: 0, deps: [] },
  { id: 'web-frontend',     label: 'Web',         tier: 0, col: 1, deps: ['cdn-edge', 'checkout-api', 'search-cluster'] },
  { id: 'mobile-bff',       label: 'Mobile BFF',  tier: 0, col: 2, deps: ['checkout-api', 'auth-service', 'notifications'] },

  // ---- API (tier 1) ----
  { id: 'checkout-api',     label: 'Checkout',    tier: 1, col: 0, deps: ['payments-gateway', 'cart-service', 'inventory-db'] },
  { id: 'auth-service',     label: 'Auth',        tier: 1, col: 1, deps: ['user-db', 'session-cache'] },
  { id: 'payments-gateway', label: 'Payments',    tier: 1, col: 2, deps: ['fraud-detection', 'order-service'] },
  { id: 'order-service',    label: 'Orders',      tier: 1, col: 3, deps: ['inventory-db', 'notifications', 'warehouse-sync'] },

  // ---- Services (tier 2) ----
  { id: 'search-cluster',   label: 'Search',      tier: 2, col: 0, deps: ['inventory-db'] },
  { id: 'cart-service',     label: 'Cart',        tier: 2, col: 1, deps: ['session-cache', 'inventory-db'] },
  { id: 'fraud-detection',  label: 'Fraud',       tier: 2, col: 2, deps: ['ml-inference'] },
  { id: 'ml-inference',     label: 'ML',          tier: 2, col: 3, deps: ['model-store'] },
  { id: 'notifications',    label: 'Notify',      tier: 2, col: 4, deps: ['email-relay'] },

  // ---- Async (tier 3) ----
  { id: 'billing-worker',   label: 'Billing',     tier: 3, col: 0, deps: ['payments-gateway', 'email-relay'] },
  { id: 'email-relay',      label: 'Email',       tier: 3, col: 1, deps: [] },
  { id: 'warehouse-sync',   label: 'Warehouse',   tier: 3, col: 2, deps: ['inventory-db'] },
  { id: 'data-pipeline',    label: 'Pipeline',    tier: 3, col: 3, deps: ['warehouse-sync'] },

  // ---- Data (tier 4) ----
  { id: 'user-db',          label: 'User DB',     tier: 4, col: 0, deps: [] },
  { id: 'inventory-db',     label: 'Inventory',   tier: 4, col: 1, deps: [] },
  { id: 'session-cache',    label: 'Cache',       tier: 4, col: 2, deps: [] },
  { id: 'model-store',      label: 'Model Store', tier: 4, col: 3, deps: [] },
];

const TIER_LABELS = ['Edge', 'API', 'Services', 'Async', 'Data'];

const REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'];

// Canonical incident templates — each one fails a specific service so the
// topology tells a coherent story.
const INCIDENT_TEMPLATES = [
  { severity: 'P1', service: 'payments-gateway', title: 'Payments gateway: 5xx spike',     toolId: 'pagerduty' },
  { severity: 'P1', service: 'auth-service',     title: 'Auth service unavailable',        toolId: 'datadog' },
  { severity: 'P1', service: 'inventory-db',     title: 'Inventory DB replica lag > 60s',  toolId: 'cloudwatch' },
  { severity: 'P1', service: 'checkout-api',     title: 'Checkout latency p95 > 5s',       toolId: 'newrelic' },
  { severity: 'P2', service: 'search-cluster',   title: 'Search: elevated error rate',     toolId: 'sentry' },
  { severity: 'P2', service: 'ml-inference',     title: 'ML: memory pressure critical',    toolId: 'dynatrace' },
  { severity: 'P2', service: 'cdn-edge',         title: 'CDN: cache hit ratio dropping',   toolId: 'grafana' },
  { severity: 'P2', service: 'warehouse-sync',   title: 'Warehouse: disk >85% capacity',   toolId: 'zabbix' },
  { severity: 'P3', service: 'user-db',          title: 'User DB: slow query detected',    toolId: 'splunk' },
  { severity: 'P3', service: 'billing-worker',   title: 'Billing: job queue backing up',   toolId: 'prometheus' },
  { severity: 'P3', service: 'email-relay',      title: 'Email: deliverability dip',       toolId: 'elastic' },
];

function rand(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}
function pick(seed, arr) { return arr[Math.floor(rand(seed) * arr.length)]; }

// Walk the service graph forward (upstream toward consumers) to compute
// blast radius from a set of failing service IDs.
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

  // Pick a stable-ish set of active incidents for this tick.
  const activeIncidents = [];
  // Guaranteed P1 for demo realism.
  activeIncidents.push({ ...INCIDENT_TEMPLATES[Math.floor(rand(tick) * 4)] });
  // 1-3 more incidents of mixed severity.
  const extraCount = 1 + Math.floor(rand(tick + 1) * 3);
  for (let i = 0; i < extraCount; i++) {
    const t = INCIDENT_TEMPLATES[Math.floor(rand(tick + i + 7) * INCIDENT_TEMPLATES.length)];
    if (!activeIncidents.some(a => a.service === t.service)) {
      activeIncidents.push({ ...t });
    }
  }

  // Attach metadata to each incident.
  activeIncidents.forEach((inc, i) => {
    const seed = tick + i * 11;
    inc.id = `INC-${(tick % 1000) * 10 + i}`;
    inc.region = pick(seed, REGIONS);
    const tool = TOOL_MAP[inc.toolId];
    inc.toolName = tool.name;
    inc.toolColor = tool.color;
    inc.toolIcon = tool.icon;
    // Which other tools are co-reporting?
    inc.reporters = TOOLS
      .filter(t => t.id !== inc.toolId && rand(seed + t.id.charCodeAt(0)) > 0.75)
      .slice(0, 2)
      .map(t => ({ id: t.id, name: t.name, color: t.color, icon: t.icon }));
    inc.openedAt = new Date(Date.now() - Math.floor(rand(seed) * (inc.severity === 'P1' ? 600 : 2700)) * 1000).toISOString();
  });

  // Primary failing services (exact service in the incident).
  const failingBySeverity = {};
  activeIncidents.forEach(inc => {
    const current = failingBySeverity[inc.service];
    // Keep worst severity per service.
    if (!current || current.severity > inc.severity) {
      failingBySeverity[inc.service] = inc;
    }
  });

  // Compute impact set (blast radius via dependency walk).
  const failingIds = Object.keys(failingBySeverity);
  const impactedIds = computeImpact(failingIds);

  // Map services → status.
  const services = SERVICES.map(s => {
    let status = 'healthy';
    if (failingBySeverity[s.id]) {
      const sev = failingBySeverity[s.id].severity;
      status = sev === 'P1' ? 'critical' : sev === 'P2' ? 'warning' : 'notice';
    } else if (impactedIds.has(s.id)) {
      status = 'impacted'; // downstream consumer of a failing service
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
