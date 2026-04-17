// Operations Center — mock data provider.
// Each alert carries a full impact chain (tool → services → regions → dependent tools)
// so the front-end can visualise the blast radius without any text.

const TOOLS = [
  { id: 'datadog',     name: 'Datadog',        category: 'APM',        icon: 'DD', color: '#774AA4' },
  { id: 'newrelic',    name: 'New Relic',      category: 'APM',        icon: 'NR', color: '#008C99' },
  { id: 'grafana',     name: 'Grafana',        category: 'Dashboards', icon: 'GR', color: '#F46800' },
  { id: 'prometheus',  name: 'Prometheus',     category: 'Metrics',    icon: 'PR', color: '#E6522C' },
  { id: 'pagerduty',   name: 'PagerDuty',      category: 'Incidents',  icon: 'PD', color: '#06AC38' },
  { id: 'splunk',      name: 'Splunk',         category: 'Logs',       icon: 'SP', color: '#F2B824' },
  { id: 'elastic',     name: 'Elastic',        category: 'Logs',       icon: 'EL', color: '#00BFB3' },
  { id: 'sentry',      name: 'Sentry',         category: 'Errors',     icon: 'SE', color: '#6E4AA4' },
  { id: 'dynatrace',   name: 'Dynatrace',      category: 'APM',        icon: 'DT', color: '#1496FF' },
  { id: 'appdynamics', name: 'AppDynamics',    category: 'APM',        icon: 'AD', color: '#0057B7' },
  { id: 'cloudwatch',  name: 'CloudWatch',     category: 'AWS',        icon: 'CW', color: '#FF9900' },
  { id: 'azuremon',    name: 'Azure Monitor',  category: 'Azure',      icon: 'AZ', color: '#0078D4' },
  { id: 'gcpops',      name: 'GCP Ops',        category: 'GCP',        icon: 'GC', color: '#4285F4' },
  { id: 'zabbix',      name: 'Zabbix',         category: 'Infra',      icon: 'ZB', color: '#D40000' },
  { id: 'statuspage',  name: 'Statuspage',     category: 'Status',     icon: 'ST', color: '#2389E1' },
];

const TOOL_MAP = Object.fromEntries(TOOLS.map(t => [t.id, t]));

// Service dependency graph — realistic service relationships.
const SERVICE_DEPS = {
  'payments-gateway':  ['auth-service', 'fraud-detection', 'order-service'],
  'auth-service':      ['user-db', 'session-cache', 'email-relay'],
  'checkout-api':      ['payments-gateway', 'inventory-db', 'cart-service'],
  'order-service':     ['inventory-db', 'warehouse-sync', 'notifications'],
  'search-cluster':    ['inventory-db', 'cdn-edge'],
  'ml-inference':      ['data-pipeline', 'model-store'],
  'web-frontend':      ['checkout-api', 'search-cluster', 'cdn-edge'],
  'mobile-bff':        ['checkout-api', 'auth-service', 'notifications'],
  'data-pipeline':     ['warehouse-sync', 'billing-worker'],
  'billing-worker':    ['payments-gateway', 'email-relay'],
  'cdn-edge':          [],
  'notifications':     ['email-relay'],
  'inventory-db':      [],
  'user-db':           [],
  'session-cache':     [],
  'email-relay':       [],
  'fraud-detection':   ['ml-inference'],
  'cart-service':      ['inventory-db', 'session-cache'],
  'warehouse-sync':    [],
  'model-store':       [],
};

const REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'];

const P1_INCIDENTS = [
  { title: 'Payments gateway 5xx spike', service: 'payments-gateway' },
  { title: 'Auth service unavailable',   service: 'auth-service' },
  { title: 'DB replica lag > 60s',       service: 'inventory-db' },
  { title: 'Checkout latency p95 > 5s',  service: 'checkout-api' },
  { title: 'Kafka consumer lag critical',service: 'data-pipeline' },
];
const P2_INCIDENTS = [
  { title: 'Elevated error rate',        service: 'search-cluster' },
  { title: 'Memory pressure critical',   service: 'ml-inference' },
  { title: 'SSL cert expiring in 7 days',service: 'cdn-edge' },
  { title: 'Disk >85% capacity',         service: 'warehouse-sync' },
  { title: 'Cache hit ratio dropping',   service: 'cdn-edge' },
];
const P3_INCIDENTS = [
  { title: 'Slow query detected',        service: 'user-db' },
  { title: 'Job queue backing up',       service: 'billing-worker' },
  { title: 'Minor latency regression',   service: 'mobile-bff' },
  { title: 'Deprecated API call',        service: 'web-frontend' },
];

function rand(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}
function pick(seed, arr) { return arr[Math.floor(rand(seed) * arr.length)]; }

function affectedRegions(seed) {
  const count = 1 + Math.floor(rand(seed) * 2);
  const shuffled = [...REGIONS].sort(() => rand(seed++) - 0.5);
  return shuffled.slice(0, count);
}

function impactChain(service) {
  const direct = SERVICE_DEPS[service] || [];
  const indirect = direct.flatMap(s => (SERVICE_DEPS[s] || []).filter(x => x !== service && !direct.includes(x)));
  return { direct: [...new Set(direct)], indirect: [...new Set(indirect)] };
}

function buildAlert(id, severity, pool, toolId, tick) {
  const seed = id * 17 + tick;
  const incident = pick(seed, pool);
  const { direct, indirect } = impactChain(incident.service);
  const regions = affectedRegions(seed + 5);
  const tool = TOOL_MAP[toolId];

  // Which other tools are also reporting on this incident?
  const siblingTools = TOOLS
    .filter(t => t.id !== toolId && rand(seed + t.id.charCodeAt(0)) > 0.72)
    .slice(0, 2)
    .map(t => ({ id: t.id, name: t.name, color: t.color }));

  return {
    id: `A${id}`,
    severity,
    tool: tool.name,
    toolId,
    toolColor: tool.color,
    title: incident.title,
    service: incident.service,
    affectedServices: direct,
    cascadeServices: indirect,
    affectedRegions: regions,
    reportedBy: siblingTools,
    openedAt: new Date(Date.now() - Math.floor(rand(seed) * (severity === 'P1' ? 900 : 3600)) * 1000).toISOString(),
  };
}

function getSnapshot() {
  const tick = Math.floor(Date.now() / 15000);

  // Always have at least one P1 + a couple of P2s for demo realism.
  const alerts = [];
  let id = 1;

  alerts.push(buildAlert(id++, 'P1', P1_INCIDENTS, 'pagerduty', tick));
  if (rand(tick + 3) > 0.5) alerts.push(buildAlert(id++, 'P1', P1_INCIDENTS, 'datadog', tick + 1));

  alerts.push(buildAlert(id++, 'P2', P2_INCIDENTS, 'sentry',    tick + 2));
  alerts.push(buildAlert(id++, 'P2', P2_INCIDENTS, 'newrelic',  tick + 3));
  if (rand(tick + 6) > 0.6) alerts.push(buildAlert(id++, 'P2', P2_INCIDENTS, 'cloudwatch', tick + 4));

  alerts.push(buildAlert(id++, 'P3', P3_INCIDENTS, 'grafana',   tick + 5));
  alerts.push(buildAlert(id++, 'P3', P3_INCIDENTS, 'elastic',   tick + 6));

  const totals = alerts.reduce(
    (a, x) => { a[x.severity.toLowerCase()]++; return a; },
    { p1: 0, p2: 0, p3: 0 }
  );

  const overall = totals.p1 > 0 ? 'critical' : totals.p2 > 0 ? 'warning' : totals.p3 > 0 ? 'notice' : 'healthy';

  // Tool-level status: healthy unless they appear in alerts.
  const affectedToolIds = new Set(alerts.map(a => a.toolId));
  const tools = TOOLS.map(t => ({
    id: t.id, name: t.name, color: t.color, icon: t.icon,
    status: affectedToolIds.has(t.id)
      ? (alerts.find(a => a.toolId === t.id)?.severity === 'P1' ? 'critical'
        : alerts.find(a => a.toolId === t.id)?.severity === 'P2' ? 'warning' : 'notice')
      : 'healthy',
  }));

  return { generatedAt: new Date().toISOString(), overall, totals, tools, alerts };
}

module.exports = { getSnapshot, TOOLS };
