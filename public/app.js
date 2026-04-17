// Operations Center — front-end renderer.
// Fetches /api/snapshot and paints a clean, at-a-glance status wall.

const REFRESH_MS = 5000;

const $ = (sel) => document.querySelector(sel);
const fmtNum = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));
const pad = (n) => String(n).padStart(2, '0');

const STATUS_COLORS = {
  healthy:  '#00913F',
  notice:   '#2563EB',
  warning:  '#D97706',
  critical: '#DC2626',
};
const SEV_COLORS = {
  P1: '#DC2626',
  P2: '#D97706',
  P3: '#2563EB',
};

function fmtTime(date)    { return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`; }
function fmtTimeUTC(date) { return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`; }
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

// ---- Hero: overall pill + headline + donut + mini stats + timeline ----

function renderOverallPill(snapshot) {
  const pill = $('#overall-pill');
  const label = $('#overall-label');
  pill.setAttribute('data-status', snapshot.overall);
  label.textContent = {
    healthy:  'All systems operational',
    notice:   'Minor notices',
    warning:  'Degraded',
    critical: 'Critical — P1 active',
  }[snapshot.overall] || snapshot.overall;
}

function renderHero(snapshot) {
  $('#hero').setAttribute('data-status', snapshot.overall);

  // Headline — the answer to "is everything ok?" in one phrase.
  const { critical, warning, notice, healthy } = snapshot.byStatus;
  const parts = [];
  if (critical) parts.push(`${critical} critical`);
  if (warning)  parts.push(`${warning} elevated`);
  if (notice)   parts.push(`${notice} notice`);

  const isHealthy = critical === 0 && warning === 0;
  $('#hero-eyebrow').textContent = isHealthy ? 'Status' : 'Attention';
  $('#hero-headline').textContent = isHealthy
    ? 'Everything looks good'
    : parts.join(' · ');
  $('#hero-sub').textContent = isHealthy
    ? `${healthy}/${snapshot.headline.monitored} sources healthy · ${snapshot.totals.p3} informational notices`
    : `${healthy}/${snapshot.headline.monitored} sources healthy · ${snapshot.headline.openIncidents} open incidents`;

  // Donut
  renderDonut(snapshot);

  // Mini stats
  $('#stat-p1').textContent = snapshot.totals.p1;
  $('#stat-p2').textContent = snapshot.totals.p2;
  $('#stat-p3').textContent = snapshot.totals.p3;
  $('#stat-mttr').textContent = snapshot.headline.mttrMinutes;

  // Timeline
  renderTimeline(snapshot.timeline);
}

function renderDonut(snapshot) {
  const svg = $('#donut-segments');
  if (!svg) return;

  const total = snapshot.headline.monitored;
  const parts = [
    { key: 'critical', value: snapshot.byStatus.critical },
    { key: 'warning',  value: snapshot.byStatus.warning  },
    { key: 'notice',   value: snapshot.byStatus.notice   },
    { key: 'healthy',  value: snapshot.byStatus.healthy  },
  ].filter((p) => p.value > 0);

  const r = 48;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const gap = 2; // visual gap between segments in px along the circumference

  svg.innerHTML = parts.map((p) => {
    const len = (p.value / total) * c;
    const dash = Math.max(0, len - gap);
    const el = `
      <circle cx="60" cy="60" r="${r}" fill="none"
              stroke="${STATUS_COLORS[p.key]}"
              stroke-width="10"
              stroke-dasharray="${dash} ${c - dash}"
              stroke-dashoffset="${-offset}"
              transform="rotate(-90 60 60)"
              stroke-linecap="butt" />`;
    offset += len;
    return el;
  }).join('');

  $('#donut-healthy').textContent = snapshot.byStatus.healthy;
  $('#donut-total').textContent = total;
}

function renderTimeline(buckets) {
  const host = $('#timeline-chart');
  if (!host) return;
  const w = host.clientWidth || 600;
  const h = 72;
  const padT = 6, padB = 14, padL = 2, padR = 2;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const maxTotal = Math.max(1, ...buckets.map((b) => b.p1 + b.p2 + b.p3));
  const slot = innerW / buckets.length;
  const barW = Math.max(3, slot - 3);

  const rects = [];
  const labels = [];
  buckets.forEach((b, i) => {
    const x = padL + i * slot + (slot - barW) / 2;
    let y = padT + innerH;
    const segs = [
      { v: b.p3, c: SEV_COLORS.P3 },
      { v: b.p2, c: SEV_COLORS.P2 },
      { v: b.p1, c: SEV_COLORS.P1 },
    ];
    segs.forEach((s, idx) => {
      if (s.v <= 0) return;
      const sh = (s.v / maxTotal) * innerH;
      y -= sh;
      const r = idx === segs.length - 1 || segs.slice(idx + 1).every((n) => n.v <= 0) ? 2 : 0;
      rects.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${sh.toFixed(1)}" fill="${s.c}" rx="${r}" />`);
    });

    // x-axis tick labels at 0, 6, 12, 18, and last bucket
    if ([0, 6, 12, 18].includes(b.hour) || i === buckets.length - 1) {
      const tx = x + barW / 2;
      labels.push(`<text x="${tx.toFixed(1)}" y="${h - 2}" font-size="10" fill="#8A9099" text-anchor="middle" font-family="JetBrains Mono, monospace">${b.label}</text>`);
    }
  });

  host.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
      <line x1="${padL}" x2="${w - padR}" y1="${h - padB}" y2="${h - padB}" stroke="#E6E8EC" stroke-width="1"/>
      ${rects.join('')}
      ${labels.join('')}
    </svg>`;
}

// ---- Tools: attention cards + compact tiles ----

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

function sparklineSVG(values, color, big = false) {
  const w = big ? 320 : 160;
  const h = big ? 56 : 28;
  const path = sparklinePath(values, w, h);
  const uid = 'g-' + Math.floor(Math.random() * 1e9);
  return `
    <svg class="tool-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stop-color="${color}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${path} L${w - 2},${h - 2} L2,${h - 2} Z" fill="url(#${uid})" />
      <path d="${path}" fill="none" stroke="${color}" stroke-width="${big ? 1.8 : 1.4}"
            stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function uptimeStripSVG(slots) {
  const w = 320, h = 14, gap = 1;
  const barW = (w - (slots.length - 1) * gap) / slots.length;
  const color = {
    ok:     '#B9DFC6',
    notice: '#2563EB',
    warn:   '#D97706',
    crit:   '#DC2626',
  };
  const bars = slots.map((s, i) => {
    const x = i * (barW + gap);
    return `<rect x="${x.toFixed(2)}" y="0" width="${barW.toFixed(2)}" height="${h}" fill="${color[s]}" rx="1"/>`;
  }).join('');
  return `<svg class="uptime-strip" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
}

function attentionCardHTML(tool) {
  const { p1, p2, p3 } = tool.counts;
  const statusLabel = {
    critical: 'Critical',
    warning:  'Warning',
    notice:   'Notice',
    healthy:  'Healthy',
  }[tool.status];
  const strokeColor = STATUS_COLORS[tool.status] || tool.color;

  return `
    <article class="attention-card" data-status="${tool.status}">
      <div class="att-head">
        <div class="tool-icon" style="background:${tool.color}1A;color:${tool.color};border-color:${tool.color}40;">${tool.icon}</div>
        <div class="att-name-wrap">
          <div class="tool-name">${tool.name}</div>
          <div class="tool-category">${tool.category}</div>
        </div>
        <div class="tool-status-chip">${statusLabel}</div>
      </div>

      ${sparklineSVG(tool.spark, strokeColor, true)}

      <div class="uptime-row">
        <div class="uptime-label">Uptime · last 60 min</div>
        ${uptimeStripSVG(tool.uptimeHistory)}
      </div>

      <div class="tool-alerts">
        <div class="alert-chip p1 ${p1 > 0 ? 'on' : ''}"><span>P1</span><span class="chip-n">${p1}</span></div>
        <div class="alert-chip p2 ${p2 > 0 ? 'on' : ''}"><span>P2</span><span class="chip-n">${p2}</span></div>
        <div class="alert-chip p3 ${p3 > 0 ? 'on' : ''}"><span>P3</span><span class="chip-n">${p3}</span></div>
      </div>
    </article>`;
}

function tileHTML(tool) {
  const strokeColor = STATUS_COLORS[tool.status] || tool.color;
  const alertTotal = tool.counts.p1 + tool.counts.p2 + tool.counts.p3;
  const alertBadge = alertTotal > 0
    ? `<span class="tile-alert-badge" data-status="${tool.status}">${alertTotal}</span>`
    : '';
  return `
    <article class="tile" data-status="${tool.status}">
      <div class="tile-top">
        <div class="tool-icon tile-icon" style="background:${tool.color}1A;color:${tool.color};border-color:${tool.color}40;">${tool.icon}</div>
        <div class="tile-name-wrap">
          <div class="tool-name">${tool.name}</div>
          <div class="tool-category">${tool.category}</div>
        </div>
        <span class="tile-dot" style="background:${STATUS_COLORS[tool.status]};"></span>
        ${alertBadge}
      </div>
      ${sparklineSVG(tool.spark, strokeColor, false)}
    </article>`;
}

function renderTools(snapshot) {
  const attention = snapshot.tools.filter((t) => t.status === 'critical' || t.status === 'warning');
  const attentionPanel = $('#attention-panel');
  const attentionGrid = $('#attention-grid');
  const attentionCount = $('#attention-count');

  if (attention.length === 0) {
    attentionPanel.classList.add('hidden');
    attentionGrid.innerHTML = '';
  } else {
    attention.sort((a, b) => (a.status === 'critical' ? -1 : 1));
    attentionPanel.classList.remove('hidden');
    attentionGrid.innerHTML = attention.map(attentionCardHTML).join('');
    const crit = attention.filter((t) => t.status === 'critical').length;
    const warn = attention.length - crit;
    const parts = [];
    if (crit) parts.push(`${crit} critical`);
    if (warn) parts.push(`${warn} elevated`);
    attentionCount.textContent = parts.join(' · ');
  }

  // All tools as compact tiles — sorted worst-first so problems always sit top-left.
  const order = { critical: 0, warning: 1, notice: 2, healthy: 3 };
  const sorted = [...snapshot.tools].sort((a, b) => order[a.status] - order[b.status]);
  $('#tiles-grid').innerHTML = sorted.map(tileHTML).join('');
}

// ---- P1 banner ----

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
  $('#p1-title').textContent = lead.title;
  const extra = p1Alerts.length > 1 ? ` · +${p1Alerts.length - 1} more P1` : '';
  $('#p1-meta').textContent = `${lead.tool} · ${lead.service} · ${lead.region}${extra}`;
  $('#p1-count').textContent = p1Alerts.length;
}

// ---- Alerts feed ----

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

// ---- Refresh loop ----

function pulseTick() {
  const dot = $('#tick-indicator');
  dot.classList.remove('on');
  void dot.offsetWidth;
  dot.classList.add('on');
}

let lastSnapshot = null;

async function refresh() {
  const status = $('#refresh-status');
  try {
    status.textContent = 'syncing…';
    const res = await fetch('/api/snapshot', { cache: 'no-store' });
    if (!res.ok) throw new Error('bad status');
    const snap = await res.json();
    lastSnapshot = snap;
    renderOverallPill(snap);
    renderHero(snap);
    renderP1Banner(snap);
    renderTools(snap);
    renderAlerts(snap);
    $('#last-sync').textContent = fmtTime(new Date());
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

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (lastSnapshot) renderTimeline(lastSnapshot.timeline);
  }, 120);
});
