// Topology configuration UI. Reads and writes tiers (levels), services
// (processes), and dependencies (lines) via the /api/* endpoints.

const $  = id => document.getElementById(id);

let state = { tiers: [], services: [], dependencies: [] };

// ---------- fetch helpers ----------

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function loadAll() {
  state = await api('GET', '/api/topology');
  renderTiers();
  renderServices();
  renderDependencies();
  syncTierSelect();
  syncServiceSelects();
}

// ---------- toast ----------

let toastTimer = null;
function toast(msg, kind = 'info') {
  const el = $('toast');
  el.textContent = msg;
  el.dataset.kind = kind;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// ---------- rendering ----------

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function renderTiers() {
  const list = $('tier-list');
  if (!state.tiers.length) {
    list.innerHTML = '<li class="cfg-empty">No levels yet — add one above.</li>';
    return;
  }
  list.innerHTML = state.tiers.map((t, i) => `
    <li class="cfg-row" data-id="${t.id}">
      <div class="cfg-row-main">
        <span class="cfg-slug">${esc(t.slug)}</span>
        <span class="cfg-label">${esc(t.label)}</span>
        <span class="cfg-sub">pos ${t.position}</span>
      </div>
      <button class="cfg-btn" data-act="up"     ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="cfg-btn" data-act="down"   ${i === state.tiers.length - 1 ? 'disabled' : ''}>↓</button>
      <button class="cfg-btn" data-act="rename">Rename</button>
      <button class="cfg-btn danger" data-act="delete">Delete</button>
    </li>
  `).join('');
}

function renderServices() {
  const list = $('service-list');
  if (!state.services.length) {
    list.innerHTML = '<li class="cfg-empty">No processes yet — add one above.</li>';
    return;
  }
  const tierById = new Map(state.tiers.map(t => [t.id, t]));
  list.innerHTML = state.services.map(s => {
    const tier = tierById.get(s.tierId);
    return `
      <li class="cfg-row" data-id="${esc(s.id)}">
        <div class="cfg-row-main">
          <span class="cfg-slug">${esc(s.id)}</span>
          <span class="cfg-label">${esc(s.label)}</span>
          <span class="cfg-sub">${tier ? esc(tier.label) : '—'} · col ${s.col}</span>
        </div>
        <button class="cfg-btn" data-act="edit">Edit</button>
        <button class="cfg-btn danger" data-act="delete">Delete</button>
      </li>`;
  }).join('');
}

function renderDependencies() {
  const list = $('dep-list');
  if (!state.dependencies.length) {
    list.innerHTML = '<li class="cfg-empty">No lines yet — connect two processes above.</li>';
    return;
  }
  const labelFor = id => state.services.find(s => s.id === id)?.label || id;
  list.innerHTML = state.dependencies.map(d => `
    <li class="cfg-row" data-id="${d.id}">
      <div class="cfg-row-main">
        <span class="cfg-label">${esc(labelFor(d.from))}</span>
        <span class="cfg-sub">→</span>
        <span class="cfg-label">${esc(labelFor(d.to))}</span>
      </div>
      <button class="cfg-btn danger" data-act="delete">Delete</button>
    </li>
  `).join('');
}

function syncTierSelect() {
  const sel = document.querySelector('#service-form select[name="tierId"]');
  const prev = sel.value;
  sel.innerHTML = state.tiers.length
    ? state.tiers.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join('')
    : '<option value="">(add a level first)</option>';
  if (prev) sel.value = prev;
}

function syncServiceSelects() {
  const opts = state.services.length
    ? state.services.map(s => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('')
    : '<option value="">(add a process first)</option>';
  const from = document.querySelector('#dep-form select[name="from"]');
  const to   = document.querySelector('#dep-form select[name="to"]');
  const prevFrom = from.value, prevTo = to.value;
  from.innerHTML = opts;
  to.innerHTML   = opts;
  if (prevFrom) from.value = prevFrom;
  if (prevTo)   to.value   = prevTo;
}

// ---------- form handlers ----------

$('tier-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  try {
    await api('POST', '/api/tiers', {
      slug: fd.get('slug').trim(),
      label: fd.get('label').trim(),
    });
    form.reset();
    await loadAll();
    toast('Level added');
  } catch (err) { toast(err.message, 'error'); }
});

$('service-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const colRaw = fd.get('col');
  const payload = {
    id: fd.get('id').trim(),
    label: fd.get('label').trim(),
    tierId: Number(fd.get('tierId')),
  };
  if (colRaw !== '' && colRaw !== null) payload.col = Number(colRaw);
  try {
    await api('POST', '/api/services', payload);
    form.reset();
    await loadAll();
    toast('Process added');
  } catch (err) { toast(err.message, 'error'); }
});

$('dep-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  try {
    await api('POST', '/api/dependencies', {
      from: fd.get('from'),
      to: fd.get('to'),
    });
    await loadAll();
    toast('Line added');
  } catch (err) { toast(err.message, 'error'); }
});

// ---------- row action delegation ----------

$('tier-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const row = btn.closest('.cfg-row');
  const id = Number(row.dataset.id);
  const tier = state.tiers.find(t => t.id === id);
  if (!tier) return;
  const act = btn.dataset.act;
  try {
    if (act === 'delete') {
      if (!confirm(`Delete level "${tier.label}"? All its processes and lines will also be removed.`)) return;
      await api('DELETE', `/api/tiers/${id}`);
      toast('Level removed');
    } else if (act === 'rename') {
      const label = prompt('New label', tier.label);
      if (label == null) return;
      await api('PATCH', `/api/tiers/${id}`, { label });
      toast('Level renamed');
    } else if (act === 'up' || act === 'down') {
      const idx = state.tiers.findIndex(t => t.id === id);
      const next = act === 'up' ? idx - 1 : idx + 1;
      if (next < 0 || next >= state.tiers.length) return;
      const order = state.tiers.map(t => t.id);
      [order[idx], order[next]] = [order[next], order[idx]];
      await api('POST', '/api/tiers/reorder', { order });
      toast('Levels reordered');
    }
    await loadAll();
  } catch (err) { toast(err.message, 'error'); }
});

$('service-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const row = btn.closest('.cfg-row');
  const id = row.dataset.id;
  const svc = state.services.find(s => s.id === id);
  if (!svc) return;
  const act = btn.dataset.act;
  try {
    if (act === 'delete') {
      if (!confirm(`Delete process "${svc.label}"? Lines touching it will also be removed.`)) return;
      await api('DELETE', `/api/services/${encodeURIComponent(id)}`);
      toast('Process removed');
    } else if (act === 'edit') {
      const label = prompt('Label', svc.label);
      if (label == null) return;
      const tierIdStr = prompt('Level (id) — current: ' + svc.tierId, String(svc.tierId));
      if (tierIdStr == null) return;
      const colStr = prompt('Column (number)', String(svc.col));
      if (colStr == null) return;
      await api('PATCH', `/api/services/${encodeURIComponent(id)}`, {
        label,
        tierId: Number(tierIdStr),
        col: Number(colStr),
      });
      toast('Process updated');
    }
    await loadAll();
  } catch (err) { toast(err.message, 'error'); }
});

$('dep-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const row = btn.closest('.cfg-row');
  const id = Number(row.dataset.id);
  if (btn.dataset.act === 'delete') {
    try {
      await api('DELETE', `/api/dependencies/${id}`);
      toast('Line removed');
      await loadAll();
    } catch (err) { toast(err.message, 'error'); }
  }
});

$('seed-btn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  if (!confirm('Load the default wholesaler topology? Existing rows are kept — only missing levels, processes, and lines get added.')) return;
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = 'Loading…';
  try {
    const summary = await api('POST', '/api/topology/seed');
    await loadAll();
    const msg = `Added ${summary.tiers.inserted} level(s), ${summary.services.inserted} process(es), ${summary.dependencies.inserted} line(s)`;
    toast(msg);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
});

// ---------- boot ----------

loadAll().catch(err => toast(err.message, 'error'));
