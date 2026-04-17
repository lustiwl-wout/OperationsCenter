// Operations Center — topology wall display.
// Primary visual: a service-topology SVG.
//   - Services laid out in tiers (Edge → API → Services → Async → Data)
//   - Dependency lines connect them
//   - Healthy = calm, impacted = colored, critical = red + glowing + animated
//     dependency path, tool badges attached to the failing nodes
//   - Right rail lists active incidents (minimal, color-coded)

const REFRESH_MS = 5000;

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');

const STATUS_COLOR = {
  healthy:  '#00913F',
  impacted: '#D97706',
  notice:   '#2563EB',
  warning:  '#D97706',
  critical: '#DC2626',
};

// ----- clock -----
function startClock() {
  const el = $('clock');
  const tick = () => {
    const n = new Date();
    el.textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
  };
  tick();
  setInterval(tick, 1000);
}

// ----- overall pill -----
function renderOverall(snap) {
  const pill = $('overall-pill');
  pill.setAttribute('data-status', snap.overall);
  $('overall-label').textContent = {
    healthy:  'All clear',
    notice:   'Notices',
    warning:  'Elevated',
    critical: snap.totals.p1 > 1 ? `${snap.totals.p1} critical` : 'Critical',
  }[snap.overall] ?? snap.overall;
}

// ----- rel time -----
function relTime(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60)   return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

// ----- topology renderer -----
function renderTopology(snap) {
  const svg = $('topology');
  const wrap = svg.parentElement;
  const cw = wrap.clientWidth - 48; // padding
  const ch = wrap.clientHeight - 48;

  // Layout constants
  const NODE_W = 128;
  const NODE_H = 52;
  const tiers = snap.tierLabels;
  const nTiers = tiers.length;
  const tierGap = 28;
  const tierHeight = (ch - (nTiers - 1) * tierGap) / nTiers;

  // Group services by tier
  const byTier = tiers.map((_, i) => snap.services.filter(s => s.tier === i));

  // Compute x positions per tier — centered horizontally
  const nodePositions = {};
  byTier.forEach((group, tier) => {
    const n = group.length;
    const totalW = n * NODE_W + (n - 1) * 32;
    const startX = (cw - totalW) / 2 + 90; // offset for tier labels
    group.forEach((s, i) => {
      nodePositions[s.id] = {
        x: startX + i * (NODE_W + 32),
        y: 12 + tier * (tierHeight + tierGap) + (tierHeight - NODE_H) / 2,
        w: NODE_W, h: NODE_H,
      };
    });
  });

  const viewW = cw + 48;
  const viewH = ch + 48;
  svg.setAttribute('viewBox', `0 0 ${viewW} ${viewH}`);
  svg.setAttribute('width', viewW);
  svg.setAttribute('height', viewH);

  // ---- build SVG contents ----
  const parts = [];

  // Tier dividers + labels
  tiers.forEach((label, i) => {
    const y = 12 + i * (tierHeight + tierGap) + tierHeight / 2;
    parts.push(`<text class="tier-label" x="16" y="${y}" dominant-baseline="middle">${label}</text>`);
    if (i < tiers.length - 1) {
      const dy = 12 + i * (tierHeight + tierGap) + tierHeight + tierGap / 2;
      parts.push(`<line class="tier-divider" x1="90" y1="${dy}" x2="${viewW - 20}" y2="${dy}"/>`);
    }
  });

  // Build edge list (service -> dep)
  const svcById = Object.fromEntries(snap.services.map(s => [s.id, s]));
  const edges = [];
  snap.services.forEach(s => {
    s.deps.forEach(d => {
      if (!svcById[d]) return;
      edges.push({ from: s.id, to: d });
    });
  });

  // Classify each edge: does it carry impact?
  // An edge is "impacted-crit" if the target is critical and the source is
  // downstream (impacted/critical). "impacted-warn" for warning/impacted.
  function edgeClass(from, to) {
    const src = svcById[from];
    const dst = svcById[to];
    if (!src || !dst) return '';
    const srcBroken = ['critical','warning','notice','impacted'].includes(src.status);
    const dstFailing = ['critical','warning','notice'].includes(dst.status);
    if (!srcBroken || !dstFailing) return '';
    if (dst.status === 'critical') return 'impacted-crit';
    return 'impacted-warn';
  }

  // Draw edges first (below nodes). Dependents point DOWN to their deps.
  edges.forEach(e => {
    const a = nodePositions[e.from];
    const b = nodePositions[e.to];
    if (!a || !b) return;
    const ax = a.x + a.w / 2;
    const ay = a.y + a.h;
    const bx = b.x + b.w / 2;
    const by = b.y;
    const mx1 = ax;
    const my1 = ay + (by - ay) / 2;
    const mx2 = bx;
    const my2 = ay + (by - ay) / 2;
    const cls = edgeClass(e.from, e.to);
    parts.push(`<path class="edge-path ${cls}" d="M ${ax} ${ay} C ${mx1} ${my1}, ${mx2} ${my2}, ${bx} ${by}"/>`);
  });

  // Draw nodes
  snap.services.forEach(s => {
    const p = nodePositions[s.id];
    if (!p) return;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;

    // Ping ring for critical nodes
    let ping = '';
    if (s.status === 'critical') {
      ping = `<rect class="node-ping" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="12" ry="12"/>`;
    }

    // Node body
    const bg = `<rect class="node-bg" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="12" ry="12"/>`;
    const statusBar = `<rect class="node-status-bar" x="${p.x + 10}" y="${p.y + p.h - 6}" width="${p.w - 20}" height="3" rx="1.5"/>`;
    const label = `<text class="node-label" x="${cx}" y="${cy - 2}">${s.label}</text>`;

    // Tool badges (only for directly failing nodes — cluster at top-right)
    let badges = '';
    if (s.incident) {
      const reporters = [{ icon: s.incident.toolIcon, color: s.incident.toolColor }, ...s.incident.reporters];
      const br = 10; // badge radius
      reporters.slice(0, 3).forEach((t, i) => {
        const bx = p.x + p.w - 6 - i * (br * 2 - 4);
        const by = p.y - 4;
        badges += `
          <g class="tool-badge" transform="translate(${bx}, ${by})">
            <circle class="tool-badge-bg" cx="0" cy="0" r="${br}" style="fill: ${t.color}"/>
            <text class="tool-badge-label" x="0" y="0" fill="#fff">${t.icon}</text>
          </g>`;
      });
    }

    parts.push(`<g class="node" data-status="${s.status}" data-id="${s.id}">${ping}${bg}${statusBar}${label}${badges}</g>`);
  });

  svg.innerHTML = parts.join('');
}

// ----- rail -----
function renderRail(snap) {
  const rail = $('rail');
  const list = $('rail-list');
  const count = $('rail-count');

  rail.setAttribute('data-overall', snap.overall);

  if (snap.incidents.length === 0) {
    rail.setAttribute('data-empty', 'true');
    count.textContent = '0';
    list.innerHTML = '';
    return;
  }

  rail.setAttribute('data-empty', 'false');
  count.textContent = snap.incidents.length;

  list.innerHTML = snap.incidents.map(inc => `
    <div class="inc-card" data-sev="${inc.severity}">
      <div class="inc-top">
        <span class="inc-sev">${inc.severity}</span>
        <span class="inc-time">${relTime(inc.openedAt)}</span>
      </div>
      <div class="inc-title">${inc.title}</div>
      <div class="inc-meta">
        <span class="tool-tag" style="border-color: ${inc.toolColor}55">
          <span class="tool-tag-dot" style="background: ${inc.toolColor}"></span>
          ${inc.toolName}
        </span>
        <span class="region-tag">${inc.region}</span>
      </div>
    </div>
  `).join('');
}

// ----- sync indicator -----
function markSync(ok) {
  const el = $('sync-text');
  el.textContent = ok ? 'live' : 'offline';
  $('sync-chip').style.opacity = ok ? '1' : '0.6';
}

// ----- refresh loop -----
let lastSnap = null;

async function refresh() {
  try {
    const res = await fetch('/api/snapshot', { cache: 'no-store' });
    if (!res.ok) throw new Error('bad status');
    const snap = await res.json();
    lastSnap = snap;

    renderOverall(snap);
    renderTopology(snap);
    renderRail(snap);
    markSync(true);
  } catch (e) {
    markSync(false);
    console.error(e);
  }
}

startClock();
refresh();
setInterval(refresh, REFRESH_MS);

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (lastSnap) renderTopology(lastSnap); }, 120);
});
