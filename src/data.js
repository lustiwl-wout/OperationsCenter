// Mock data provider for the Operations Center dashboard.
// Later this module will be backed by Neon (PostgreSQL) and real integrations
// with each monitoring tool. For now it produces a realistic, slowly-changing
// snapshot so the front-end can render stunning, believable visuals.

const TOOLS = [
  { id: 'datadog',      name: 'Datadog',        category: 'APM / Metrics',     icon: 'DD' },
  { id: 'newrelic',     name: 'New Relic',      category: 'APM',               icon: 'NR' },
  { id: 'grafana',      name: 'Grafana',        category: 'Dashboards',        icon: 'GR' },
  { id: 'prometheus',   name: 'Prometheus',     category: 'Metrics',           icon: 'PR' },
  { id: 'pagerduty',    name: 'PagerDuty',      category: 'Incidents',         icon: 'PD' },
  { id: 'splunk',       name: 'Splunk',         category: 'Logs / SIEM',       icon: 'SP' },
  { id: 'elastic',      name: 'Elastic Stack',  category: 'Logs / Search',     icon: 'EL' },
  { id: 'sentry',       name: 'Sentry',         category: 'Errors',            icon: 'SE' },
  { id: 'dynatrace',    name: 'Dynatrace',      category: 'APM',               icon: 'DT' },
  { id: 'appdynamics',  name: 'AppDynamics',    category: 'APM',               icon: 'AD' },
  { id: 'cloudwatch',   name: 'AWS CloudWatch', category: 'Cloud / AWS',       icon: 'CW' },
  { id: 'azuremon',     name: 'Azure Monitor',  category: 'Cloud / Azure',     icon: 'AZ' },
  { id: 'gcpops',       name: 'GCP Ops Suite',  category: 'Cloud / GCP',       icon: 'GC' },
  { id: 'zabbix',       name: 'Zabbix',         category: 'Infrastructure',    icon: 'ZB' },
  { id: 'statuspage',   name: 'Statuspage',     category: 'Public Status',     icon: 'ST' },
];

// Deterministic pseudo-random so the screen wall doesn't flicker on reload.
function rand(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function pick(seed, arr) {
  return arr[Math.floor(rand(seed) * arr.length)];
}

const SERVICES = [
  'checkout-api', 'payments-gateway', 'auth-service', 'order-service',
  'inventory-db', 'search-cluster', 'cdn-edge', 'notifications',
  'data-pipeline', 'ml-inference', 'web-frontend', 'mobile-bff',
  'billing-worker', 'email-relay', 'warehouse-sync',
];

const REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'];

const P1_TITLES = [
  'Payments gateway 5xx spike',
  'Auth service down in eu-west-1',
  'Database replica lag > 60s',
  'Checkout latency > 5s p95',
  'Kafka consumer lag critical',
];

const P2_TITLES = [
  'Elevated error rate on search',
  'Memory pressure on ml-inference',
  'SSL cert expiring in 7 days',
  'Disk >85% on warehouse-sync',
  'CDN cache hit ratio dropping',
];

const P3_TITLES = [
  'Slow query on reporting DB',
  'Background job queue backing up',
  'Minor latency regression',
  'Non-critical cron job skipped',
  'Deprecated API call detected',
];

function statusFor(counts) {
  if (counts.p1 > 0) return 'critical';
  if (counts.p2 > 0) return 'warning';
  if (counts.p3 > 0) return 'notice';
  return 'healthy';
}

function buildToolSnapshot(tool, tick) {
  const base = tool.id.charCodeAt(0) + tool.id.charCodeAt(1);
  const roll = rand(base + tick);

  // Shape alert volume per tool so the whole wall tells a story.
  let p1 = 0, p2 = 0, p3 = 0;
  if (roll > 0.92) p1 = 1 + Math.floor(rand(base + 1) * 2);
  if (roll > 0.70) p2 = Math.floor(rand(base + 2) * 3);
  p3 = Math.floor(rand(base + 3) * 5);

  // A couple of tools are intentionally always "hot" on first load so the
  // P1 visuals are visible immediately.
  if (tool.id === 'pagerduty') p1 = Math.max(p1, 1);
  if (tool.id === 'sentry')    p2 = Math.max(p2, 2);

  const counts = { p1, p2, p3 };
  const latency = Math.round(20 + rand(base + 4) * 180);
  const uptime = (99 + rand(base + 5)).toFixed(3);
  const throughput = Math.round(500 + rand(base + 6) * 9500);

  // Sparkline: 24 points, mostly flat with occasional spikes.
  const spark = [];
  for (let i = 0; i < 24; i++) {
    const s = rand(base + 10 + i);
    const spike = (p1 > 0 && i > 18) ? 0.6 + rand(base + 50 + i) * 0.4 : 0;
    spark.push(Math.min(1, 0.2 + s * 0.4 + spike));
  }

  return {
    id: tool.id,
    name: tool.name,
    category: tool.category,
    icon: tool.icon,
    status: statusFor(counts),
    counts,
    metrics: {
      latencyMs: latency,
      uptimePct: Number(uptime),
      throughput,
    },
    spark,
    lastCheck: new Date(Date.now() - Math.floor(rand(base + 7) * 120) * 1000).toISOString(),
  };
}

function buildAlerts(tools, tick) {
  const alerts = [];
  let id = 1;
  tools.forEach((t) => {
    for (let i = 0; i < t.counts.p1; i++) {
      alerts.push({
        id: `A${id++}`,
        severity: 'P1',
        tool: t.name,
        toolId: t.id,
        title: pick(id + tick, P1_TITLES),
        service: pick(id + 1, SERVICES),
        region: pick(id + 2, REGIONS),
        openedAt: new Date(Date.now() - Math.floor(rand(id) * 900) * 1000).toISOString(),
      });
    }
    for (let i = 0; i < t.counts.p2; i++) {
      alerts.push({
        id: `A${id++}`,
        severity: 'P2',
        tool: t.name,
        toolId: t.id,
        title: pick(id + tick, P2_TITLES),
        service: pick(id + 1, SERVICES),
        region: pick(id + 2, REGIONS),
        openedAt: new Date(Date.now() - Math.floor(rand(id) * 3600) * 1000).toISOString(),
      });
    }
    for (let i = 0; i < t.counts.p3; i++) {
      alerts.push({
        id: `A${id++}`,
        severity: 'P3',
        tool: t.name,
        toolId: t.id,
        title: pick(id + tick, P3_TITLES),
        service: pick(id + 1, SERVICES),
        region: pick(id + 2, REGIONS),
        openedAt: new Date(Date.now() - Math.floor(rand(id) * 14400) * 1000).toISOString(),
      });
    }
  });
  // Newest first.
  alerts.sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
  return alerts;
}

function getSnapshot() {
  const tick = Math.floor(Date.now() / 15000); // changes every 15s
  const tools = TOOLS.map((t) => buildToolSnapshot(t, tick));
  const alerts = buildAlerts(tools, tick);

  const totals = tools.reduce(
    (acc, t) => {
      acc.p1 += t.counts.p1;
      acc.p2 += t.counts.p2;
      acc.p3 += t.counts.p3;
      return acc;
    },
    { p1: 0, p2: 0, p3: 0 }
  );

  const healthy = tools.filter((t) => t.status === 'healthy').length;
  const overall =
    totals.p1 > 0 ? 'critical' :
    totals.p2 > 0 ? 'warning' :
    totals.p3 > 0 ? 'notice'   : 'healthy';

  return {
    generatedAt: new Date().toISOString(),
    overall,
    totals,
    headline: {
      monitored: tools.length,
      healthy,
      openIncidents: totals.p1 + totals.p2,
      mttrMinutes: 14 + Math.floor(rand(tick) * 20),
    },
    tools,
    alerts,
  };
}

module.exports = { getSnapshot, TOOLS };
