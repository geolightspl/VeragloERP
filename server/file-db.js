import fs from "fs";
import path from "path";
import os from "os";

function dataRoot() {
  return process.env.VERAGLO_DATA_DIR || path.join(os.homedir(), "VeragloERP", "data");
}

function statePath() {
  return path.join(dataRoot(), "erp_state.json");
}

function snapshotsDir() {
  return path.join(dataRoot(), "snapshots");
}

function writeJsonAtomic(file, obj) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export function usingFileStorage() {
  return process.env.USE_FILE_STORAGE === "1" || process.env.USE_FILE_STORAGE === "true";
}

function tenantDir(tenantId) {
  return path.join(dataRoot(), "tenants", tenantId || DEFAULT_TENANT);
}

function statePath(tenantId) {
  return path.join(tenantDir(tenantId), "erp_state.json");
}

function snapshotsDir(tenantId) {
  return path.join(tenantDir(tenantId), "snapshots");
}

function countersPath(tenantId) {
  return path.join(tenantDir(tenantId), "erp_counters.json");
}

async function migrateLegacyFileLayout() {
  const legacy = path.join(dataRoot(), "erp_state.json");
  const target = statePath(DEFAULT_TENANT);
  if (!fs.existsSync(legacy)) return;
  if (fs.existsSync(target)) return;
  fs.mkdirSync(tenantDir(DEFAULT_TENANT), { recursive: true });
  fs.renameSync(legacy, target);
  const legacyCounters = path.join(dataRoot(), "erp_counters.json");
  if (fs.existsSync(legacyCounters)) {
    fs.renameSync(legacyCounters, countersPath(DEFAULT_TENANT));
  }
  const legacySnaps = path.join(dataRoot(), "snapshots");
  if (fs.existsSync(legacySnaps)) {
    fs.renameSync(legacySnaps, snapshotsDir(DEFAULT_TENANT));
  }
  console.log("[file-db] migrated legacy single-tenant files to tenants/default/");
}

function productionFileStorage() {
  return usingFileStorage()
    && (process.env.VERAGLO_PRODUCTION === "1" || process.env.NODE_ENV === "production");
}

export async function ensureSchema() {
  const root = dataRoot();
  if (productionFileStorage() && !fs.existsSync(root)) {
    const err = new Error(
      "Production database not found at " + root + ". Create the directory or restore a backup before starting."
    );
    err.code = "production_data_missing";
    throw err;
  }
  fs.mkdirSync(root, { recursive: true });
  await migrateLegacyFileLayout();
  await ensureDefaultTenant(null);
}

export async function getState() {
  await ensureSchema();
  const fp = statePath();
  if (!fs.existsSync(fp)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(fp, "utf8"));
    return {
      ...raw.data,
      _v: raw.version,
      _updatedAt: raw.updated_at,
    };
  } catch (e) {
    console.error("[file-db] read failed:", e.message);
    return null;
  }
}

export async function saveState(data) {
  await ensureSchema();
  const version = Number(data._v) || 6;
  const payload = { ...data };
  delete payload._updatedAt;
  const updated_at = new Date().toISOString();
  writeJsonAtomic(statePath(), { version, data: payload, updated_at });
  return updated_at;
}

function countersPath() {
  return path.join(dataRoot(), "erp_counters.json");
}

export async function nextSequence(key, min = 0) {
  await ensureSchema();
  const fp = countersPath();
  let counters = {};
  if (fs.existsSync(fp)) {
    try { counters = JSON.parse(fs.readFileSync(fp, "utf8")) || {}; } catch (e) { counters = {}; }
  }
  const cur = Number(counters[key]) || 0;
  const next = Math.max(cur, Math.max(0, Number(min) || 0)) + 1;
  counters[key] = next;
  writeJsonAtomic(fp, counters);
  return next;
}

export async function listSnapshots(limit = 30) {
  await ensureSchema();
  const dir = snapshotsDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const rows = files.map((f) => {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    const meta = JSON.parse(fs.readFileSync(full, "utf8"));
    return {
      id: meta.id,
      label: meta.label,
      created_by: meta.created_by,
      created_at: meta.created_at,
      bytes: stat.size,
    };
  });
  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return rows.slice(0, limit);
}

export async function saveSnapshot(label, createdBy, data) {
  await ensureSchema();
  const id = "snap-" + Date.now();
  const created_at = new Date().toISOString();
  const file = path.join(snapshotsDir(), id + ".json");
  writeJsonAtomic(file, { id, label: label || "Manual snapshot", created_by: createdBy || "system", created_at, data });
  return { id, created_at };
}

export async function getSnapshot(id) {
  const file = path.join(snapshotsDir(), id + ".json");
  if (!fs.existsSync(file)) return null;
  const meta = JSON.parse(fs.readFileSync(file, "utf8"));
  return meta.data;
}

export async function healthCheck() {
  await ensureSchema();
  return { now: new Date().toISOString(), db: "file:" + dataRoot() };
}

export async function closePool() {}
