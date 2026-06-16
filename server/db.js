import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as fileDb from "./file-db.js";
import { createPgPoolOptions } from "./pg-config.js";
import { DEFAULT_TENANT, scopedCounterKey } from "./tenant.js";
import { ensureDefaultTenant, getTenant, ensureTenant } from "./tenant-registry.js";
import { migrateMultiTenant } from "./migrate-multi-tenant.js";

function useFile() {
  return fileDb.usingFileStorage();
}

let pgModule = null;
let pool = null;

async function getPg() {
  if (pgModule) return pgModule;
  const pg = await import("pg");
  pgModule = pg;
  pool = new pg.Pool(createPgPoolOptions());
  pool.on("error", (err) => {
    console.error("[postgres] unexpected pool error", err);
  });
  return pgModule;
}

let _schemaReady = false;

async function query(text, params) {
  if (useFile()) throw new Error("SQL not available in file storage mode");
  await getPg();
  return pool.query(text, params);
}

export async function ensureSchema() {
  if (useFile()) return fileDb.ensureSchema();
  await getPg();
  if (_schemaReady) return;
  const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  await migrateMultiTenant(pool, query);
  await ensureDefaultTenant(query);
  _schemaReady = true;
}

export { query };

export async function getState(tenantId = DEFAULT_TENANT) {
  if (useFile()) return fileDb.getState(tenantId);
  await ensureSchema();
  const tid = tenantId || DEFAULT_TENANT;
  const { rows } = await query(
    "SELECT version, data, updated_at, rev FROM erp_state WHERE tenant_id = $1",
    [tid]
  );
  if (!rows[0]) return null;
  return {
    ...rows[0].data,
    _v: rows[0].version,
    _updatedAt: rows[0].updated_at,
    _rev: Number(rows[0].rev) || 0,
    _tenantId: tid,
  };
}

export async function saveState(data, opts = {}) {
  const tenantId = opts.tenantId || data._tenantId || DEFAULT_TENANT;
  if (useFile()) {
    const result = await fileDb.saveState(data, tenantId);
    return result;
  }
  await ensureSchema();
  const version = Number(data._v) || 6;
  const payload = { ...data };
  delete payload._updatedAt;
  delete payload._rev;
  delete payload._baseRev;
  delete payload._stateRev;
  delete payload._serverSnapshot;
  delete payload._tenantId;
  const json = JSON.stringify(payload);
  const expectedRev = opts.expectedRev;
  const tid = tenantId || DEFAULT_TENANT;
  await ensureDefaultTenant(query);
  let tenantRow = await getTenant(tid, query);
  if (!tenantRow) {
    if (tid === DEFAULT_TENANT) {
      tenantRow = await ensureTenant(DEFAULT_TENANT, "Default Organization", query);
    } else {
      const err = new Error('Organization code not found. Use "default" for single-company installs.');
      err.code = "tenant_not_found";
      throw err;
    }
  }

  if (expectedRev != null && Number.isFinite(Number(expectedRev))) {
    const upd = await query(
      `UPDATE erp_state
         SET version = $1, data = $2::jsonb, rev = rev + 1, updated_at = NOW()
       WHERE tenant_id = $3 AND rev = $4
       RETURNING updated_at, rev`,
      [version, json, tid, Number(expectedRev)]
    );
    if (upd.rows[0]) return { updatedAt: upd.rows[0].updated_at, rev: Number(upd.rows[0].rev) };
    const cur = await query("SELECT rev FROM erp_state WHERE tenant_id = $1", [tid]);
    if (!cur.rows[0]) {
      const ins = await query(
        `INSERT INTO erp_state (tenant_id, version, data, rev, updated_at)
         VALUES ($1, $2, $3::jsonb, 1, NOW())
         ON CONFLICT (tenant_id) DO NOTHING
         RETURNING updated_at, rev`,
        [tid, version, json]
      );
      if (ins.rows[0]) return { updatedAt: ins.rows[0].updated_at, rev: Number(ins.rows[0].rev) };
      const after = await query("SELECT rev FROM erp_state WHERE tenant_id = $1", [tid]);
      return { conflict: true, currentRev: after.rows[0] ? Number(after.rows[0].rev) : 0 };
    }
    return { conflict: true, currentRev: Number(cur.rows[0].rev) || 0 };
  }

  const { rows } = await query(
    `INSERT INTO erp_state (tenant_id, version, data, rev, updated_at)
     VALUES ($1, $2, $3::jsonb, 1, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET
       version = EXCLUDED.version,
       data = EXCLUDED.data,
       rev = erp_state.rev + 1,
       updated_at = NOW()
     RETURNING updated_at, rev`,
    [tid, version, json]
  );
  return { updatedAt: rows[0].updated_at, rev: Number(rows[0].rev) };
}

export async function nextSequence(key, min = 0, tenantId = DEFAULT_TENANT) {
  const scoped = scopedCounterKey(tenantId, key);
  const seedMin = Math.max(0, Number(min) || 0);
  if (useFile()) return fileDb.nextSequence(scoped, seedMin, tenantId);
  await ensureSchema();
  const { rows } = await query(
    `INSERT INTO erp_counters (key, value, updated_at)
     VALUES ($1, $2 + 1, NOW())
     ON CONFLICT (key) DO UPDATE SET
       value = GREATEST(erp_counters.value, $2) + 1,
       updated_at = NOW()
     RETURNING value`,
    [scoped, seedMin]
  );
  return Number(rows[0].value);
}

export async function patchConnectedSessions(sessions, tenantId = DEFAULT_TENANT) {
  if (useFile()) return fileDb.patchConnectedSessions(sessions, tenantId);
  await ensureSchema();
  const tid = tenantId || DEFAULT_TENANT;
  const { rows } = await query(
    `UPDATE erp_state
     SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{connectedSessions}', $1::jsonb, true),
         updated_at = NOW()
     WHERE tenant_id = $2
     RETURNING updated_at`,
    [JSON.stringify(sessions || []), tid]
  );
  return rows[0] ? rows[0].updated_at : null;
}

export async function listSnapshots(limit = 30, tenantId = DEFAULT_TENANT) {
  if (useFile()) return fileDb.listSnapshots(limit, tenantId);
  const tid = tenantId || DEFAULT_TENANT;
  const { rows } = await query(
    `SELECT id, label, created_by, created_at, tenant_id,
            octet_length(data::text) AS bytes
     FROM erp_snapshots
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [tid, limit]
  );
  return rows;
}

export async function saveSnapshot(label, createdBy, data, tenantId = DEFAULT_TENANT) {
  if (useFile()) return fileDb.saveSnapshot(label, createdBy, data, tenantId);
  const tid = tenantId || DEFAULT_TENANT;
  const { rows } = await query(
    `INSERT INTO erp_snapshots (tenant_id, label, created_by, data)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id, created_at`,
    [tid, label || "Manual snapshot", createdBy || "system", JSON.stringify(data)]
  );
  return rows[0];
}

export async function getSnapshot(id, tenantId = DEFAULT_TENANT) {
  if (useFile()) return fileDb.getSnapshot(id, tenantId);
  const tid = tenantId || DEFAULT_TENANT;
  const { rows } = await query(
    "SELECT data FROM erp_snapshots WHERE id = $1 AND tenant_id = $2",
    [id, tid]
  );
  return rows[0] ? rows[0].data : null;
}

export async function healthCheck() {
  if (useFile()) return fileDb.healthCheck();
  const { rows } = await query("SELECT NOW() AS now, current_database() AS db");
  const tenants = await query("SELECT COUNT(*)::int AS c FROM tenants WHERE status <> 'suspended'");
  return { ...rows[0], tenantCount: tenants.rows[0].c };
}

export async function closePool() {
  if (useFile()) return fileDb.closePool();
  if (pool) await pool.end();
}

export function storageMode() {
  return useFile() ? "file" : "postgresql";
}
