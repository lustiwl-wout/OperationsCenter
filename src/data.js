// Operations Center — live snapshot provider.
// Topology (tiers / services / dependencies) is loaded from Postgres via
// src/topology.js. Incident signals are still synthesized for now — they
// decorate whichever services happen to exist in the database.

const { getTopology } = require('./topology');

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

const REGIONS = ['nl-hoofddorp', 'nl-strijen-dc', 'nl-amsterdam', 'nl-eindhoven', 'nl-rotterdam', 'azure-weu'];

const SEVERITIES = ['P1', 'P2', 'P3'];
const TITLE_BY_SEV = {
  P1: svc => `${svc} failure — customer traffic affected`,
  P2: svc => `${svc} degraded — elevated error rate`,
  P3: svc => `${svc} notice — minor anomaly`,
};

function rand(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}
function pick(seed, arr) { return arr[Math.floor(rand(seed) * arr.length)]; }

// Walk the dependency graph upward (toward consumers) from failing IDs to
// compute the blast radius.
function computeImpact(services, failingIds) {
  const impacted = new Set(failingIds);
  const depsByService = new Map();
  services.forEach(s => depsByService.set(s.id, s.deps || []));

  let changed = true;
  while (changed) {
    changed = false;
    for (const s of services) {
      if (impacted.has(s.id)) continue;
      const deps = depsByService.get(s.id) || [];
      if (deps.some(d => impacted.has(d))) {
        impacted.add(s.id);
        changed = true;
      }
    }
  }
  return impacted;
}

function buildServiceView(topology) {
  // Flatten tiers to their ordering index, and inline each service's deps
  // as an array of target service IDs.
  const tierById = new Map(topology.tiers.map((t, i) => [t.id, { ...t, index: i }]));
  const depsByFrom = new Map();
  topology.dependencies.forEach(d => {
    if (!depsByFrom.has(d.from)) depsByFrom.set(d.from, []);
    depsByFrom.get(d.from).push(d.to);
  });
  return topology.services.map(s => ({
    id: s.id,
    label: s.label,
    tier: tierById.get(s.tierId)?.index ?? 0,
    col: s.col,
    deps: depsByFrom.get(s.id) || [],
  }));
}

async function getSnapshot() {
  const topology = await getTopology();
  const services = buildServiceView(topology);
  const tierLabels = topology.tiers.map(t => t.label);

  // If the operator hasn't configured anything yet, return an empty-but-valid
  // snapshot so the dashboard stays rendered.
  if (!services.length) {
    return {
      generatedAt: new Date().toISOString(),
      overall: 'healthy',
      totals: { p1: 0, p2: 0, p3: 0 },
      tierLabels,
      services: [],
      incidents: [],
    };
  }

  const tick = Math.floor(Date.now() / 20000);

  // Synthesize incidents against real service IDs. Stable per tick.
  const serviceIds = services.map(s => s.id);
  const incidentCount = Math.min(serviceIds.length, 1 + Math.floor(rand(tick) * 4));
  const activeIncidents = [];
  const used = new Set();
  for (let i = 0; i < incidentCount * 3 && activeIncidents.length < incidentCount; i++) {
    const svc = serviceIds[Math.floor(rand(tick + i * 13) * serviceIds.length)];
    if (used.has(svc)) continue;
    used.add(svc);
    const sev = SEVERITIES[Math.min(2, Math.floor(rand(tick + i * 17) * 3.2))];
    const tool = TOOLS[Math.floor(rand(tick + i * 19) * TOOLS.length)];
    activeIncidents.push({
      id: `INC-${(tick % 1000) * 10 + activeIncidents.length}`,
      severity: sev,
      service: svc,
      title: TITLE_BY_SEV[sev](services.find(s => s.id === svc).label),
      toolId: tool.id,
      toolName: tool.name,
      toolColor: tool.color,
      toolIcon: tool.icon,
      region: pick(tick + i * 23, REGIONS),
      reporters: TOOLS
        .filter(t => t.id !== tool.id && rand(tick + i + t.id.charCodeAt(0)) > 0.78)
        .slice(0, 2)
        .map(t => ({ id: t.id, name: t.name, color: t.color, icon: t.icon })),
      openedAt: new Date(Date.now() - Math.floor(rand(tick + i) * (sev === 'P1' ? 600 : 2700)) * 1000).toISOString(),
    });
  }

  // Primary failing services (strongest severity wins per service).
  const failingBySeverity = {};
  activeIncidents.forEach(inc => {
    const current = failingBySeverity[inc.service];
    if (!current || current.severity > inc.severity) {
      failingBySeverity[inc.service] = inc;
    }
  });
  const failingIds = Object.keys(failingBySeverity);
  const impactedIds = computeImpact(services, failingIds);

  const servicesOut = services.map(s => {
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
    tierLabels,
    services: servicesOut,
    incidents: activeIncidents.sort((a, b) => a.severity.localeCompare(b.severity)),
  };
}

module.exports = { getSnapshot, TOOLS };
