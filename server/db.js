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
    "SELECT version, data, updated_at FROM erp_state WHERE id = 1"
  );
  if (!rows[0]) return null;
  return {
    ...rows[0].data,
    _v: rows[0].version,
    _updatedAt: rows[0].updated_at,
  };
}

export async function saveState(data) {
  if (useFile()) return fileDb.saveState(data);
  await ensureSchema();
  const version = Number(data._v) || 6;
  const payload = { ...data };
  delete payload._updatedAt;
  const { rows } = await query(
    `INSERT INTO erp_state (id, version, data, updated_at)
     VALUES (1, $1, $2::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET
       version = EXCLUDED.version,
       data = EXCLUDED.data,
       updated_at = NOW()
     RETURNING updated_at`,
    [version, JSON.stringify(payload)]
  );
  return rows[0].updated_at;
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
