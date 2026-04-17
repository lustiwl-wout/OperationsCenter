// Mock data provider for the Operations Center dashboard.
// Later this module will be backed by Neon (PostgreSQL) and real integrations
// with each monitoring tool. For now it produces a realistic, slowly-changing
// snapshot so the front-end can render a clean, at-a-glance status wall.

const TOOLS = [
  { id: 'datadog',     name: 'Datadog',        category: 'APM / Metrics',  icon: 'DD', color: '#774AA4' },
  { id: 'newrelic',    name: 'New Relic',      category: 'APM',            icon: 'NR', color: '#008C99' },
  { id: 'grafana',     name: 'Grafana',        category: 'Dashboards',     icon: 'GR', color: '#F46800' },
  { id: 'prometheus',  name: 'Prometheus',     category: 'Metrics',        icon: 'PR', color: '#E6522C' },
  { id: 'pagerduty',   name: 'PagerDuty',      category: 'Incidents',      icon: 'PD', color: '#06AC38' },
  { id: 'splunk',      name: 'Splunk',         category: 'Logs / SIEM',    icon: 'SP', color: '#F2B824' },
  { id: 'elastic',     name: 'Elastic Stack',  category: 'Logs / Search',  icon: 'EL', color: '#00BFB3' },
  { id: 'sentry',      name: 'Sentry',         category: 'Errors',         icon: 'SE', color: '#6E4AA4' },
  { id: 'dynatrace',   name: 'Dynatrace',      category: 'APM',            icon: 'DT', color: '#1496FF' },
  { id: 'appdynamics', name: 'AppDynamics',    category: 'APM',            icon: 'AD', color: '#0057B7' },
  { id: 'cloudwatch',  name: 'AWS CloudWatch', category: 'Cloud / AWS',    icon: 'CW', color: '#FF9900' },
  { id: 'azuremon',    name: 'Azure Monitor',  category: 'Cloud / Azure',  icon: 'AZ', color: '#0078D4' },
  { id: 'gcpops',      name: 'GCP Ops Suite',  category: 'Cloud / GCP',    icon: 'GC', color: '#4285F4' },
  { id: 'zabbix',      name: 'Zabbix',         category: 'Infrastructure', icon: 'ZB', color: '#D40000' },
  { id: 'statuspage',  name: 'Statuspage',     category: 'Public Status',  icon: 'ST', color: '#2389E1' },
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

// 60-slot uptime history: each slot is a recent time-slice status.
// Healthy tools have a clean run; warning/critical tools show recent dips.
function buildUptimeHistory(status, seed) {
  const slots = new Array(60).fill('ok');
  if (status === 'healthy') return slots;

  const failStart = status === 'critical' ? 50 : 54;
  const failType =
    status === 'critical' ? 'crit' :
    status === 'warning'  ? 'warn' : 'notice';

  for (let i = failStart; i < 60; i++) {
    // Not every slot fails — jitter keeps it realistic.
    if (rand(seed + i) > 0.35) slots[i] = failType;
  }
  // A couple of earlier blips for realism.
  if (rand(seed + 7) > 0.7) slots[30 + Math.floor(rand(seed + 8) * 10)] = 'notice';
  return slots;
}

function buildToolSnapshot(tool, tick) {
  const base = tool.id.charCodeAt(0) + tool.id.charCodeAt(1);
  const roll = rand(base + tick);

  let p1 = 0, p2 = 0, p3 = 0;
  if (roll > 0.92) p1 = 1 + Math.floor(rand(base + 1) * 2);
  if (roll > 0.70) p2 = Math.floor(rand(base + 2) * 3);
  p3 = Math.floor(rand(base + 3) * 5);

  // A couple of tools are intentionally "hot" so the visuals are immediately
  // informative on first load.
  if (tool.id === 'pagerduty') p1 = Math.max(p1, 1);
  if (tool.id === 'sentry')    p2 = Math.max(p2, 2);

  const counts = { p1, p2, p3 };
  const status = statusFor(counts);

  const latency = Math.round(20 + rand(base + 4) * 180);
  const uptime = (99 + rand(base + 5)).toFixed(3);
  const throughput = Math.round(500 + rand(base + 6) * 9500);

  // 24-point sparkline: relatively flat, with spikes for unhealthy tools.
  const spark = [];
  for (let i = 0; i < 24; i++) {
    const s = rand(base + 10 + i);
    const spike = (p1 > 0 && i > 18) ? 0.5 + rand(base + 50 + i) * 0.5 : 0;
    spark.push(Math.min(1, 0.2 + s * 0.4 + spike));
  }

  return {
    id: tool.id,
    name: tool.name,
    category: tool.category,
    icon: tool.icon,
    color: tool.color,
    status,
    counts,
    metrics: {
      latencyMs: latency,
      uptimePct: Number(uptime),
      throughput,
    },
    spark,
    uptimeHistory: buildUptimeHistory(status, base),
    lastCheck: new Date(Date.now() - Math.floor(rand(base + 7) * 120) * 1000).toISOString(),
  };
}

function buildAlerts(tools, tick) {
  const alerts = [];
  let id = 1;
  tools.forEach((t) => {
    for (let i = 0; i < t.counts.p1; i++) {
      alerts.push({
        id: `A${id++}`, severity: 'P1',
        tool: t.name, toolId: t.id,
        title: pick(id + tick, P1_TITLES),
        service: pick(id + 1, SERVICES),
        region: pick(id + 2, REGIONS),
        openedAt: new Date(Date.now() - Math.floor(rand(id) * 900) * 1000).toISOString(),
      });
    }
    for (let i = 0; i < t.counts.p2; i++) {
      alerts.push({
        id: `A${id++}`, severity: 'P2',
        tool: t.name, toolId: t.id,
        title: pick(id + tick, P2_TITLES),
        service: pick(id + 1, SERVICES),
        region: pick(id + 2, REGIONS),
        openedAt: new Date(Date.now() - Math.floor(rand(id) * 3600) * 1000).toISOString(),
      });
    }
    for (let i = 0; i < t.counts.p3; i++) {
      alerts.push({
        id: `A${id++}`, severity: 'P3',
        tool: t.name, toolId: t.id,
        title: pick(id + tick, P3_TITLES),
        service: pick(id + 1, SERVICES),
        region: pick(id + 2, REGIONS),
        openedAt: new Date(Date.now() - Math.floor(rand(id) * 14400) * 1000).toISOString(),
      });
    }
  });
  alerts.sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
  return alerts;
}

// 24 hourly buckets of the last day, counting incidents per severity.
// Shape tells a realistic story: quiet night, a P1 burst late in the period.
function buildTimeline(tick) {
  const now = new Date();
  const buckets = [];
  for (let h = 23; h >= 0; h--) {
    const date = new Date(now.getTime() - h * 3600 * 1000);
    const hour = date.getHours();
    const quiet = hour >= 0 && hour < 6;
    const seed = tick + hour * 7;

    let p1 = 0, p2 = 0, p3 = 0;
    if (!quiet) {
      p3 = Math.floor(rand(seed + 1) * 4);
      if (rand(seed + 2) > 0.65) p2 = 1 + Math.floor(rand(seed + 3) * 3);
      if (rand(seed + 4) > 0.92) p1 = 1;
    } else {
      p3 = Math.floor(rand(seed + 1) * 2);
    }
    // Ensure the final bucket has a visible P1 so the timeline reflects live P1s.
    if (h === 0) p1 = Math.max(p1, 1);

    buckets.push({
      hour,
      label: String(hour).padStart(2, '0') + ':00',
      p1, p2, p3,
    });
  }
  return buckets;
}

function getSnapshot() {
  const tick = Math.floor(Date.now() / 15000); // changes every 15s
  const tools = TOOLS.map((t) => buildToolSnapshot(t, tick));
  const alerts = buildAlerts(tools, tick);
  const timeline = buildTimeline(tick);

  const totals = tools.reduce(
    (acc, t) => { acc.p1 += t.counts.p1; acc.p2 += t.counts.p2; acc.p3 += t.counts.p3; return acc; },
    { p1: 0, p2: 0, p3: 0 }
  );

  const byStatus = {
    critical: tools.filter((t) => t.status === 'critical').length,
    warning:  tools.filter((t) => t.status === 'warning').length,
    notice:   tools.filter((t) => t.status === 'notice').length,
    healthy:  tools.filter((t) => t.status === 'healthy').length,
  };

  const overall =
    totals.p1 > 0 ? 'critical' :
    totals.p2 > 0 ? 'warning' :
    totals.p3 > 0 ? 'notice'   : 'healthy';

  return {
    generatedAt: new Date().toISOString(),
    overall,
    totals,
    byStatus,
    headline: {
      monitored: tools.length,
      healthy: byStatus.healthy,
      openIncidents: totals.p1 + totals.p2,
      mttrMinutes: 14 + Math.floor(rand(tick) * 20),
    },
    timeline,
    tools,
    alerts,
  };
}

module.exports = { getSnapshot, TOOLS };
