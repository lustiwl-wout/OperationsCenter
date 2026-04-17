// Operations Center — minimal wall display.
// All-clear = breathing dot, nothing else.
// Incidents = canvas constellation of impacted nodes + minimal list.

const REFRESH_MS = 5000;

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');

const SEV_COLOR = { P1: '#F85149', P2: '#D29922', P3: '#388BFD' };

const NODE_COLORS = {
  tool:     '#E6EDF3',
  service:  '#8B949E',
  cascade:  '#484F58',
  region:   '#388BFD',
  reporter: '#8B949E',
};

// ---- Clock ----
function startClock() {
  const el = $('clock');
  const tick = () => {
    const n = new Date();
    el.textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
  };
  tick();
  setInterval(tick, 1000);
}

// ---- Bar status ----
function renderBar(snap) {
  const bar = $('bar-status');
  bar.setAttribute('data-status', snap.overall);
  $('bar-label').textContent = {
    healthy:  'All clear',
    notice:   'Notices',
    warning:  'Elevated',
    critical: `${snap.totals.p1} critical`,
  }[snap.overall] ?? snap.overall;
}

// ---- Toggle views ----
function showAllClear() {
  $('all-clear').classList.remove('hidden');
  $('stage').classList.add('hidden');
}
function showStage() {
  $('all-clear').classList.add('hidden');
  $('stage').classList.remove('hidden');
}

// ---- Relative time ----
function relTime(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60)    return `${Math.floor(s)}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

// ---- Incident list (right panel) ----
function renderList(alerts) {
  $('incident-list').innerHTML = alerts.map(a => {
    const chips = [
      `<span class="chip tool" style="border-color:${a.toolColor}44;color:${a.toolColor}">${a.tool}</span>`,
      `<span class="chip svc">${a.service}</span>`,
      ...a.affectedRegions.map(r => `<span class="chip region">${r}</span>`),
    ].join('');
    return `
      <div class="inc-row" data-sev="${a.severity}" data-id="${a.id}">
        <div class="inc-top">
          <span class="sev-dot"></span>
          <span class="inc-sev">${a.severity}</span>
          <span class="inc-title">${a.title}</span>
          <span class="inc-time">${relTime(a.openedAt)}</span>
        </div>
        <div class="inc-chips">${chips}</div>
      </div>`;
  }).join('');
}

// ================================================================
// CONSTELLATION — canvas-based impact map
// ================================================================

// Layout: incidents are placed in a column on the left of the canvas.
// For each incident a sub-graph fans out rightward:
//   col 0 (leftmost):  tool node (the source)
//   col 1:             directly affected services
//   col 2:             cascading services
//   col 3 (rightmost): regions
//
// Nodes are linked by curved lines. Severity colours the source node.
// Healthy nodes that appear in no incident are not drawn.

const NODE_R = { tool: 22, service: 14, cascade: 10, region: 10 };
const FONT = { tool: 10, service: 9, cascade: 8, region: 8 };

let animFrame = null;
let particles = []; // ambient floating sparks

function buildGraph(alerts) {
  // Collect unique nodes and edges.
  const nodes = new Map();   // key → node
  const edges = [];

  function addNode(key, type, label, color, sev) {
    if (!nodes.has(key)) {
      nodes.set(key, {
        key, type, label,
        color: color || NODE_COLORS[type],
        sev: sev || null,
        x: 0, y: 0,
        // target position (animated toward)
        tx: 0, ty: 0,
      });
    }
  }

  alerts.forEach(a => {
    const toolKey = `tool:${a.toolId}`;
    addNode(toolKey, 'tool', a.tool, a.toolColor, a.severity);

    const svcKey = `svc:${a.service}`;
    addNode(svcKey, 'service', a.service.replace(/-/g, '\u2011'), null, a.severity);
    edges.push({ from: toolKey, to: svcKey, sev: a.severity });

    a.affectedServices.forEach(s => {
      const k = `svc:${s}`;
      addNode(k, 'service', s.replace(/-/g, '\u2011'), null, null);
      edges.push({ from: svcKey, to: k, sev: a.severity });
    });

    a.cascadeServices.forEach(s => {
      const k = `cas:${s}`;
      addNode(k, 'cascade', s.replace(/-/g, '\u2011'), null, null);
      edges.push({ from: `svc:${a.affectedServices[0] ?? a.service}`, to: k, sev: null });
    });

    a.affectedRegions.forEach(r => {
      const k = `reg:${r}`;
      addNode(k, 'region', r, null, null);
      edges.push({ from: svcKey, to: k, sev: null });
    });

    // Sibling reporters
    a.reportedBy.forEach(t => {
      const k = `tool:${t.id}`;
      addNode(k, 'reporter', t.name, t.color, a.severity);
      edges.push({ from: toolKey, to: k, sev: null });
    });
  });

  return { nodes: [...nodes.values()], edges };
}

function layoutGraph(nodes, edges, cw, ch) {
  // Assign columns by type.
  const colX = {
    tool:     cw * 0.12,
    reporter: cw * 0.12,
    service:  cw * 0.38,
    cascade:  cw * 0.62,
    region:   cw * 0.82,
  };

  // Count nodes per column to spread them vertically.
  const cols = {};
  nodes.forEach(n => {
    const cx = colX[n.type] ?? cw * 0.5;
    if (!cols[cx]) cols[cx] = [];
    cols[cx].push(n);
  });

  const padY = 80;
  Object.entries(cols).forEach(([cx, group]) => {
    const step = (ch - padY * 2) / Math.max(group.length, 1);
    group.forEach((n, i) => {
      n.tx = parseFloat(cx);
      n.ty = padY + i * step + step / 2;
      // Init position if first render.
      if (n.x === 0) { n.x = n.tx; n.y = n.ty; }
    });
  });
}

function drawEdge(ctx, a, b, sev) {
  const color = sev ? SEV_COLOR[sev] : 'rgba(255,255,255,0.06)';
  const mid = (a.x + b.x) / 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.bezierCurveTo(mid, a.y, mid, b.y, b.x, b.y);
  ctx.strokeStyle = sev ? color.replace(')', ',0.35)').replace('rgb', 'rgba') : color;
  ctx.lineWidth = sev ? 1.2 : 0.6;
  ctx.stroke();
}

// Convert hex to rgba for glow.
function hexAlpha(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function drawNode(ctx, n, t) {
  const r = NODE_R[n.type] ?? 12;
  const col = n.sev ? SEV_COLOR[n.sev] : n.color;

  // Glow for critical/warning nodes.
  if (n.sev === 'P1') {
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.003);
    const g = ctx.createRadialGradient(n.x, n.y, r, n.x, n.y, r * 3.5);
    g.addColorStop(0, hexAlpha(col, 0.35 * pulse));
    g.addColorStop(1, hexAlpha(col, 0));
    ctx.beginPath();
    ctx.arc(n.x, n.y, r * 3.5, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  // Node fill.
  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  ctx.fillStyle = n.sev === 'P1' ? col :
                  n.sev === 'P2' ? col :
                  hexAlpha(n.color, 0.15);
  ctx.fill();

  // Node border.
  ctx.strokeStyle = n.sev ? col : hexAlpha(n.color, 0.35);
  ctx.lineWidth = n.sev ? 1.5 : 1;
  ctx.stroke();

  // Label.
  ctx.fillStyle = n.sev ? '#fff' : NODE_COLORS[n.type];
  ctx.font = `${n.sev ? 600 : 400} ${FONT[n.type] ?? 9}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Truncate long labels.
  const maxLen = n.type === 'tool' ? 5 : 11;
  const label = n.label.length > maxLen ? n.label.slice(0, maxLen) + '…' : n.label;
  ctx.fillText(label, n.x, n.y);
}

function drawParticles(ctx, t, cw, ch) {
  // Slowly drift ambient particles across the canvas.
  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x > cw + 10) p.x = -10;
    if (p.y > ch + 10) p.y = -10;
    const alpha = 0.08 + 0.04 * Math.sin(t * 0.001 + p.phase);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fill();
  });
}

function initParticles(cw, ch) {
  particles = Array.from({ length: 60 }, (_, i) => ({
    x: Math.random() * cw,
    y: Math.random() * ch,
    vx: 0.08 + Math.random() * 0.12,
    vy: 0.04 + Math.random() * 0.06,
    phase: Math.random() * Math.PI * 2,
  }));
}

let graph = { nodes: [], edges: [] };

function startConstellation() {
  const canvas = $('constellation');
  const ctx = canvas.getContext('2d');
  let t = 0;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width  = rect.width;
    canvas.height = rect.height;
    initParticles(canvas.width, canvas.height);
    layoutGraph(graph.nodes, graph.edges, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  function draw() {
    const cw = canvas.width, ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    // Background.
    ctx.fillStyle = '#0D1117';
    ctx.fillRect(0, 0, cw, ch);

    drawParticles(ctx, t, cw, ch);

    // Smooth nodes toward target positions.
    graph.nodes.forEach(n => {
      n.x += (n.tx - n.x) * 0.06;
      n.y += (n.ty - n.y) * 0.06;
    });

    // Build a lookup for edge drawing.
    const byKey = Object.fromEntries(graph.nodes.map(n => [n.key, n]));

    // Edges first (below nodes).
    graph.edges.forEach(e => {
      const a = byKey[e.from], b = byKey[e.to];
      if (a && b) drawEdge(ctx, a, b, e.sev);
    });

    // Nodes on top.
    graph.nodes.forEach(n => drawNode(ctx, n, t));

    t++;
    animFrame = requestAnimationFrame(draw);
  }

  draw();
}

// ---- Refresh loop ----
async function refresh() {
  const sync = $('bar-sync');
  try {
    const res = await fetch('/api/snapshot', { cache: 'no-store' });
    if (!res.ok) throw new Error('bad status');
    const snap = await res.json();

    renderBar(snap);
    sync.textContent = '● live';
    sync.classList.add('live');

    if (snap.overall === 'healthy') {
      showAllClear();
    } else {
      // Sort P1 first, then P2, then P3.
      snap.alerts.sort((a, b) => a.severity.localeCompare(b.severity));
      renderList(snap.alerts);
      graph = buildGraph(snap.alerts);
      const canvas = $('constellation');
      if (canvas) {
        const rect = canvas.parentElement?.getBoundingClientRect();
        if (rect) layoutGraph(graph.nodes, graph.edges, rect.width, rect.height);
      }
      showStage();
    }
  } catch {
    sync.textContent = '○ offline';
    sync.classList.remove('live');
  }
}

startClock();
startConstellation();
refresh();
setInterval(refresh, REFRESH_MS);
