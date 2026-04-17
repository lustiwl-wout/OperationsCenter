// Topology repository — tiers (levels), services (processes), and
// dependencies (lines between them). All reads/writes hit Postgres.

const { query } = require('./db');

// ---------- reads ----------

async function listTiers() {
  const { rows } = await query(
    `SELECT id, slug, label, position
       FROM tiers
      ORDER BY position ASC, id ASC`
  );
  return rows;
}

async function listServices() {
  const { rows } = await query(
    `SELECT id, label, tier_id AS "tierId", col
       FROM services
      ORDER BY tier_id ASC, col ASC, id ASC`
  );
  return rows;
}

async function listDependencies() {
  const { rows } = await query(
    `SELECT id, from_service AS "from", to_service AS "to"
       FROM dependencies
      ORDER BY id ASC`
  );
  return rows;
}

async function getTopology() {
  const [tiers, services, deps] = await Promise.all([
    listTiers(), listServices(), listDependencies(),
  ]);
  return { tiers, services, dependencies: deps };
}

// ---------- tier writes ----------

async function createTier({ slug, label, position }) {
  requireSlug(slug); requireLabel(label);
  const pos = Number.isFinite(position) ? position : await nextTierPosition();
  const { rows } = await query(
    `INSERT INTO tiers (slug, label, position)
     VALUES ($1, $2, $3)
     RETURNING id, slug, label, position`,
    [slug, label, pos]
  );
  return rows[0];
}

async function updateTier(id, { slug, label, position }) {
  const fields = [];
  const values = [];
  let i = 1;
  if (slug !== undefined)     { requireSlug(slug);   fields.push(`slug = $${i++}`);     values.push(slug); }
  if (label !== undefined)    { requireLabel(label); fields.push(`label = $${i++}`);    values.push(label); }
  if (position !== undefined) { fields.push(`position = $${i++}`); values.push(position); }
  if (!fields.length) return null;
  values.push(id);
  const { rows } = await query(
    `UPDATE tiers SET ${fields.join(', ')} WHERE id = $${i}
     RETURNING id, slug, label, position`,
    values
  );
  return rows[0] || null;
}

async function deleteTier(id) {
  const { rowCount } = await query(`DELETE FROM tiers WHERE id = $1`, [id]);
  return rowCount > 0;
}

async function reorderTiers(orderedIds) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) return;
  // Bulk-set positions 0..N using a single UPDATE ... FROM VALUES.
  const tuples = orderedIds.map((_, i) => `($${i * 2 + 1}::int, $${i * 2 + 2}::int)`);
  const params = [];
  orderedIds.forEach((id, i) => { params.push(Number(id), i); });
  await query(
    `UPDATE tiers AS t SET position = v.pos
       FROM (VALUES ${tuples.join(', ')}) AS v(id, pos)
      WHERE t.id = v.id`,
    params
  );
}

async function nextTierPosition() {
  const { rows } = await query(`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM tiers`);
  return rows[0].next;
}

// ---------- service writes ----------

async function createService({ id, label, tierId, col }) {
  requireSlug(id); requireLabel(label);
  if (!Number.isInteger(tierId)) throw new HttpError(400, 'tierId must be an integer');
  const column = Number.isFinite(col) ? col : await nextServiceCol(tierId);
  const { rows } = await query(
    `INSERT INTO services (id, label, tier_id, col)
     VALUES ($1, $2, $3, $4)
     RETURNING id, label, tier_id AS "tierId", col`,
    [id, label, tierId, column]
  );
  return rows[0];
}

async function updateService(id, { label, tierId, col }) {
  const fields = [];
  const values = [];
  let i = 1;
  if (label !== undefined)  { requireLabel(label); fields.push(`label = $${i++}`);   values.push(label); }
  if (tierId !== undefined) {
    if (!Number.isInteger(tierId)) throw new HttpError(400, 'tierId must be an integer');
    fields.push(`tier_id = $${i++}`); values.push(tierId);
  }
  if (col !== undefined)    { fields.push(`col = $${i++}`);     values.push(col); }
  if (!fields.length) return null;
  values.push(id);
  const { rows } = await query(
    `UPDATE services SET ${fields.join(', ')} WHERE id = $${i}
     RETURNING id, label, tier_id AS "tierId", col`,
    values
  );
  return rows[0] || null;
}

async function deleteService(id) {
  const { rowCount } = await query(`DELETE FROM services WHERE id = $1`, [id]);
  return rowCount > 0;
}

async function nextServiceCol(tierId) {
  const { rows } = await query(
    `SELECT COALESCE(MAX(col), -1) + 1 AS next FROM services WHERE tier_id = $1`,
    [tierId]
  );
  return rows[0].next;
}

// ---------- dependency writes ----------

async function createDependency({ from, to }) {
  if (!from || !to) throw new HttpError(400, 'from and to are required');
  if (from === to) throw new HttpError(400, 'dependency cannot target itself');
  const { rows } = await query(
    `INSERT INTO dependencies (from_service, to_service)
     VALUES ($1, $2)
     ON CONFLICT (from_service, to_service) DO NOTHING
     RETURNING id, from_service AS "from", to_service AS "to"`,
    [from, to]
  );
  return rows[0] || null;
}

async function deleteDependency(id) {
  const { rowCount } = await query(`DELETE FROM dependencies WHERE id = $1`, [id]);
  return rowCount > 0;
}

// ---------- validation helpers ----------

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/;
function requireSlug(s) {
  if (typeof s !== 'string' || !SLUG_RE.test(s)) {
    throw new HttpError(400, 'slug must be lowercase alphanumeric with hyphens (1–64 chars)');
  }
}
function requireLabel(s) {
  if (typeof s !== 'string' || !s.trim() || s.length > 80) {
    throw new HttpError(400, 'label must be a non-empty string up to 80 chars');
  }
}

module.exports = {
  getTopology,
  listTiers, createTier, updateTier, deleteTier, reorderTiers,
  listServices, createService, updateService, deleteService,
  listDependencies, createDependency, deleteDependency,
  HttpError,
};
