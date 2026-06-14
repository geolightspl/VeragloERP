import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as fileDb from "./file-db.js";
import { createPgPoolOptions } from "./pg-config.js";

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

export async function ensureSchema() {
  if (useFile()) return fileDb.ensureSchema();
  await getPg();
  if (_schemaReady) return;
  const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  _schemaReady = true;
}

export async function query(text, params) {
  if (useFile()) throw new Error("SQL not available in file storage mode");
  await getPg();
  return pool.query(text, params);
}

export async function getState() {
  if (useFile()) return fileDb.getState();
  await ensureSchema();
  const { rows } = await query(
    "SELECT version, data, updated_at, rev FROM erp_state WHERE id = 1"
  );
  if (!rows[0]) return null;
  return {
    ...rows[0].data,
    _v: rows[0].version,
    _updatedAt: rows[0].updated_at,
    _rev: Number(rows[0].rev) || 0,
  };
}

/**
 * Persist full state.
 * If opts.expectedRev is a number, applies OPTIMISTIC LOCKING: the write only
 * succeeds when the stored rev still equals expectedRev. On mismatch it returns
 * { conflict: true, currentRev } so the caller can return HTTP 409.
 * Always returns { updatedAt, rev } on success.
 */
export async function saveState(data, opts = {}) {
  if (useFile()) {
    const updatedAt = await fileDb.saveState(data);
    return { updatedAt, rev: 0 };
  }
  await ensureSchema();
  const version = Number(data._v) || 6;
  const payload = { ...data };
  delete payload._updatedAt;
  delete payload._rev;
  delete payload._baseRev;
  delete payload._stateRev;
  const json = JSON.stringify(payload);
  const expectedRev = opts.expectedRev;

  if (expectedRev != null && Number.isFinite(Number(expectedRev))) {
    // Conditional update guarded by rev.
    const upd = await query(
      `UPDATE erp_state
         SET version = $1, data = $2::jsonb, rev = rev + 1, updated_at = NOW()
       WHERE id = 1 AND rev = $3
       RETURNING updated_at, rev`,
      [version, json, Number(expectedRev)]
    );
    if (upd.rows[0]) return { updatedAt: upd.rows[0].updated_at, rev: Number(upd.rows[0].rev) };
    // No row updated: either first-ever insert, or a genuine rev conflict.
    const cur = await query("SELECT rev FROM erp_state WHERE id = 1");
    if (!cur.rows[0]) {
      const ins = await query(
        `INSERT INTO erp_state (id, version, data, rev, updated_at)
         VALUES (1, $1, $2::jsonb, 1, NOW())
         ON CONFLICT (id) DO NOTHING
         RETURNING updated_at, rev`,
        [version, json]
      );
      if (ins.rows[0]) return { updatedAt: ins.rows[0].updated_at, rev: Number(ins.rows[0].rev) };
      const after = await query("SELECT rev FROM erp_state WHERE id = 1");
      return { conflict: true, currentRev: after.rows[0] ? Number(after.rows[0].rev) : 0 };
    }
    return { conflict: true, currentRev: Number(cur.rows[0].rev) || 0 };
  }

  // Unconditional save (back-compat) — still bumps rev so trackers stay monotonic.
  const { rows } = await query(
    `INSERT INTO erp_state (id, version, data, rev, updated_at)
     VALUES (1, $1, $2::jsonb, 1, NOW())
     ON CONFLICT (id) DO UPDATE SET
       version = EXCLUDED.version,
       data = EXCLUDED.data,
       rev = erp_state.rev + 1,
       updated_at = NOW()
     RETURNING updated_at, rev`,
    [version, json]
  );
  return { updatedAt: rows[0].updated_at, rev: Number(rows[0].rev) };
}

/**
 * Atomically reserve the next sequence value for a counter key.
 * Single-statement upsert => safe under concurrent requests (row lock).
 * `min` lets callers seed from the current max so server counters never reuse
 * numbers already present in existing data. Returns the reserved integer.
 */
export async function nextSequence(key, min = 0) {
  const seedMin = Math.max(0, Number(min) || 0);
  if (useFile()) return fileDb.nextSequence(key, seedMin);
  await ensureSchema();
  const { rows } = await query(
    `INSERT INTO erp_counters (key, value, updated_at)
     VALUES ($1, $2 + 1, NOW())
     ON CONFLICT (key) DO UPDATE SET
       value = GREATEST(erp_counters.value, $2) + 1,
       updated_at = NOW()
     RETURNING value`,
    [String(key), seedMin]
  );
  return Number(rows[0].value);
}

/** Update only connectedSessions — avoids full-state races during heartbeat. */
export async function patchConnectedSessions(sessions) {
  if (useFile()) {
    const state = (await fileDb.getState()) || { _v: 6, connectedSessions: [] };
    state.connectedSessions = sessions || [];
    return fileDb.saveState(state);
  }
  await ensureSchema();
  const { rows } = await query(
    `UPDATE erp_state
     SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{connectedSessions}', $1::jsonb, true),
         updated_at = NOW()
     WHERE id = 1
     RETURNING updated_at`,
    [JSON.stringify(sessions || [])]
  );
  return rows[0] ? rows[0].updated_at : null;
}

export async function listSnapshots(limit = 30) {
  if (useFile()) return fileDb.listSnapshots(limit);
  const { rows } = await query(
    `SELECT id, label, created_by, created_at,
            octet_length(data::text) AS bytes
     FROM erp_snapshots
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function saveSnapshot(label, createdBy, data) {
  if (useFile()) return fileDb.saveSnapshot(label, createdBy, data);
  const { rows } = await query(
    `INSERT INTO erp_snapshots (label, created_by, data)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id, created_at`,
    [label || "Manual snapshot", createdBy || "system", JSON.stringify(data)]
  );
  return rows[0];
}

export async function getSnapshot(id) {
  if (useFile()) return fileDb.getSnapshot(id);
  const { rows } = await query(
    "SELECT data FROM erp_snapshots WHERE id = $1",
    [id]
  );
  return rows[0] ? rows[0].data : null;
}

export async function healthCheck() {
  if (useFile()) return fileDb.healthCheck();
  const { rows } = await query("SELECT NOW() AS now, current_database() AS db");
  return rows[0];
}

export async function closePool() {
  if (useFile()) return fileDb.closePool();
  if (pool) await pool.end();
}

export function storageMode() {
  return useFile() ? "file" : "postgresql";
}
