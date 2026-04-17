const express = require('express');
const path = require('path');
const { getSnapshot } = require('./src/data');
const { migrate } = require('./src/db');
const topology = require('./src/topology');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '64kb' }));

// ---------- health / snapshot ----------

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/snapshot', async (_req, res, next) => {
  try {
    res.json(await getSnapshot());
  } catch (err) { next(err); }
});

// ---------- topology (read) ----------

app.get('/api/topology', async (_req, res, next) => {
  try {
    res.json(await topology.getTopology());
  } catch (err) { next(err); }
});

// ---------- tiers ----------

app.post('/api/tiers', async (req, res, next) => {
  try {
    const { slug, label, position } = req.body || {};
    res.status(201).json(await topology.createTier({ slug, label, position }));
  } catch (err) { next(err); }
});

app.patch('/api/tiers/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await topology.updateTier(id, req.body || {});
    if (!row) return res.status(404).json({ error: 'tier not found' });
    res.json(row);
  } catch (err) { next(err); }
});

app.delete('/api/tiers/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ok = await topology.deleteTier(id);
    if (!ok) return res.status(404).json({ error: 'tier not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

app.post('/api/tiers/reorder', async (req, res, next) => {
  try {
    const { order } = req.body || {};
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of tier ids' });
    await topology.reorderTiers(order);
    res.json(await topology.listTiers());
  } catch (err) { next(err); }
});

// ---------- services ----------

app.post('/api/services', async (req, res, next) => {
  try {
    const { id, label, tierId, col } = req.body || {};
    res.status(201).json(await topology.createService({ id, label, tierId, col }));
  } catch (err) { next(err); }
});

app.patch('/api/services/:id', async (req, res, next) => {
  try {
    const row = await topology.updateService(req.params.id, req.body || {});
    if (!row) return res.status(404).json({ error: 'service not found' });
    res.json(row);
  } catch (err) { next(err); }
});

app.delete('/api/services/:id', async (req, res, next) => {
  try {
    const ok = await topology.deleteService(req.params.id);
    if (!ok) return res.status(404).json({ error: 'service not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ---------- dependencies ----------

app.post('/api/dependencies', async (req, res, next) => {
  try {
    const { from, to } = req.body || {};
    const row = await topology.createDependency({ from, to });
    if (!row) return res.status(200).json({ status: 'exists' });
    res.status(201).json(row);
  } catch (err) { next(err); }
});

app.delete('/api/dependencies/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ok = await topology.deleteDependency(id);
    if (!ok) return res.status(404).json({ error: 'dependency not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ---------- error handler ----------

app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === '23505' ? 409 : err.code === '23503' ? 400 : 500);
  const message = err.expose === false ? 'internal error' : (err.message || 'internal error');
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({ error: message });
});

// ---------- boot ----------

async function boot() {
  try { await migrate(); }
  catch (err) { console.error('[db] migration failed:', err.message); }
  app.listen(PORT, () => {
    console.log(`Operations Center listening on :${PORT}`);
  });
}

boot();
