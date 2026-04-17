// Operations Center — front-end renderer.
// Fetches /api/snapshot, renders the wall, and plays the P1 attention effects.

const REFRESH_MS = 5000;

const $ = (sel) => document.querySelector(sel);
const fmtNum = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));
const pad = (n) => String(n).padStart(2, '0');

function fmtTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function fmtTimeUTC(date) {
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}
function relTime(iso) {
  const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${Math.floor(diff)}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ---- Clock ----
function startClock() {
  const tick = () => {
    const now = new Date();
    $('#clock').textContent = fmtTime(now);
    $('#clock-utc').textContent = fmtTimeUTC(now) + 'Z';
  };
  tick();
  setInterval(tick, 1000);
}

// ---- Rendering ----

function renderOverall(snapshot) {
  const pill = $('#overall-pill');
  const label = $('#overall-label');
  pill.setAttribute('data-status', snapshot.overall);
  const map = {
    healthy:  'ALL SYSTEMS OPERATIONAL',
    notice:   'MINOR NOTICES',
    warning:  'DEGRADED — ATTENTION',
    critical: 'CRITICAL — P1 ACTIVE',
  };
  label.textContent = map[snapshot.overall] || snapshot.overall.toUpperCase();

  $('#kpi-p1').textContent = snapshot.totals.p1;
  $('#kpi-p2').textContent = snapshot.totals.p2;
  $('#kpi-p3').textContent = snapshot.totals.p3;
  $('#kpi-healthy').textContent = snapshot.headline.healthy;
  $('#kpi-total').textContent = snapshot.headline.monitored;
  $('#kpi-incidents').textContent = snapshot.headline.openIncidents;
  $('#kpi-mttr').textContent = snapshot.headline.mttrMinutes;

  const p1Card = document.querySelector('.kpi-card[data-tone="p1"]');
  if (p1Card) p1Card.setAttribute('data-hot', snapshot.totals.p1 > 0 ? 'true' : 'false');
}

function renderP1Banner(snapshot) {
  const banner = $('#p1-banner');
  const p1Alerts = snapshot.alerts.filter((a) => a.severity === 'P1');
  if (p1Alerts.length === 0) {
    banner.classList.add('hidden');
    document.body.removeAttribute('data-p1');
    return;
  }
  document.body.setAttribute('data-p1', 'true');
  banner.classList.remove('hidden');

  const lead = p1Alerts[0];
  $('#p1-title').textContent = `${lead.title}`;
  const extra = p1Alerts.length > 1 ? ` · +${p1Alerts.length - 1} more P1` : '';
  $('#p1-meta').textContent = `${lead.tool} · ${lead.service} · ${lead.region}${extra}`;
  $('#p1-count').textContent = p1Alerts.length;
}

function sparklinePath(values, w, h, pad = 2) {
  if (!values || values.length === 0) return '';
  const n = values.length;
  const step = (w - pad * 2) / (n - 1);
  return values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - v * (h - pad * 2);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function sparklineSVG(values, status) {
  const w = 240, h = 36;
  const path = sparklinePath(values, w, h);
  const stroke = {
    healthy:  '#34e2a5',
    notice:   '#4fc3ff',
    warning:  '#ffb547',
    critical: '#ff3860',
  }[status] || '#7c9cff';
  const fill = stroke;
  return `
    <svg class="tool-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="g-${status}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stop-color="${fill}" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="${fill}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${path} L${w - 2},${h - 2} L2,${h - 2} Z" fill="url(#g-${status})" />
      <path d="${path}" fill="none" stroke="${stroke}" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"
            style="filter: drop-shadow(0 0 3px ${stroke});"/>
    </svg>`;
}

function toolCardHTML(tool) {
  const statusLabel = {
    healthy:  'OK',
    notice:   'NOTICE',
    warning:  'WARN',
    critical: 'CRIT',
  }[tool.status] || 'OK';

  const { p1, p2, p3 } = tool.counts;
  const { latencyMs, uptimePct, throughput } = tool.metrics;

  return `
    <article class="tool-card" data-status="${tool.status}" data-tool="${tool.id}">
      <div class="tool-head">
        <div class="tool-icon">${tool.icon}</div>
        <div>
          <div class="tool-name">${tool.name}</div>
          <div class="tool-category">${tool.category}</div>
        </div>
        <div class="tool-status-chip">${statusLabel}</div>
      </div>

      <div class="tool-metrics">
        <div class="metric">
          <div class="metric-label">Latency</div>
          <div class="metric-value">${latencyMs}<span style="font-size:10px;color:var(--text-mute);"> ms</span></div>
        </div>
        <div class="metric">
          <div class="metric-label">Uptime</div>
          <div class="metric-value">${uptimePct.toFixed(2)}<span style="font-size:10px;color:var(--text-mute);">%</span></div>
        </div>
        <div class="metric">
          <div class="metric-label">Events/min</div>
          <div class="metric-value">${fmtNum(throughput)}</div>
        </div>
      </div>

      ${sparklineSVG(tool.spark, tool.status)}

      <div class="tool-alerts">
        <div class="alert-chip p1 ${p1 > 0 ? 'on' : ''}"><span>P1</span><span class="chip-n">${p1}</span></div>
        <div class="alert-chip p2 ${p2 > 0 ? 'on' : ''}"><span>P2</span><span class="chip-n">${p2}</span></div>
        <div class="alert-chip p3 ${p3 > 0 ? 'on' : ''}"><span>P3</span><span class="chip-n">${p3}</span></div>
      </div>
    </article>`;
}

function renderTools(snapshot) {
  const wall = $('#tools-grid');
  // Sort so criticals float to the top for visual impact.
  const order = { critical: 0, warning: 1, notice: 2, healthy: 3 };
  const sorted = [...snapshot.tools].sort((a, b) => order[a.status] - order[b.status]);
  wall.innerHTML = sorted.map(toolCardHTML).join('');
}

function alertRowHTML(a) {
  return `
    <div class="alert-row" data-sev="${a.severity}">
      <div class="severity-tag">${a.severity}</div>
      <div>
        <div class="alert-title">${a.title}</div>
        <div class="alert-meta">
          <span>${a.tool}</span><span class="sep">·</span>
          <span>${a.service}</span><span class="sep">·</span>
          <span>${a.region}</span>
        </div>
      </div>
      <div class="alert-time">${relTime(a.openedAt)}</div>
    </div>`;
}

function renderAlerts(snapshot) {
  const list = $('#alerts-list');
  const shown = snapshot.alerts.slice(0, 40);
  list.innerHTML = shown.map(alertRowHTML).join('');
  const open = snapshot.alerts.filter((a) => a.severity !== 'P3').length;
  $('#alerts-count').textContent = `${open} open · ${snapshot.alerts.length} total`;
}

function pulseTick() {
  const dot = $('#tick-indicator');
  dot.classList.remove('on');
  // force reflow so animation restarts
  void dot.offsetWidth;
  dot.classList.add('on');
}

// ---- Fetch loop ----
async function refresh() {
  const status = $('#refresh-status');
  try {
    status.textContent = 'syncing…';
    const res = await fetch('/api/snapshot', { cache: 'no-store' });
    if (!res.ok) throw new Error('bad status');
    const snap = await res.json();
    renderOverall(snap);
    renderP1Banner(snap);
    renderTools(snap);
    renderAlerts(snap);
    const now = new Date();
    $('#last-sync').textContent = fmtTime(now);
    status.textContent = 'live';
    pulseTick();
  } catch (err) {
    status.textContent = 'offline — retrying';
    console.error(err);
  }
}

startClock();
refresh();
setInterval(refresh, REFRESH_MS);
