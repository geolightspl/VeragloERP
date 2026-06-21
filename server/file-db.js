import fs from "fs";
import path from "path";
import os from "os";
import { DEFAULT_TENANT } from "./tenant.js";
import { ensureDefaultTenant, listTenants } from "./tenant-registry.js";

export function dataRoot() {
  return process.env.VERAGLO_DATA_DIR || path.join(os.homedir(), "VeragloERP", "data");
}

function statePath() {
  return path.join(dataRoot(), "erp_state.json");
}

function snapshotsDir() {
  const dir = path.join(dataRoot(), "snapshots");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function countersPath() {
  return path.join(dataRoot(), "erp_counters.json");
}

export function writeJsonAtomic(file, obj) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export function usingFileStorage() {
  return process.env.USE_FILE_STORAGE === "1" || process.env.USE_FILE_STORAGE === "true";
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
}

export async function getState(tenantId = DEFAULT_TENANT) {
  await ensureSchema();
  const tid = tenantId || DEFAULT_TENANT;
  const fp = statePath(tid);
  if (!fs.existsSync(fp)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (raw && raw.data) {
      return { ...raw.data, _v: raw.version || raw.data._v, _updatedAt: raw.updated_at, _rev: Number(raw.rev) || 0 };
    }
    return { ...raw, _updatedAt: raw._updatedAt || null };
  } catch (e) {
    console.error("[file-db] read failed:", e.message);
    return null;
  }
}

export async function saveState(data, tenantId = DEFAULT_TENANT) {
  await ensureSchema();
  const tid = tenantId || DEFAULT_TENANT;
  const version = Number(data._v) || 6;
  const payload = { ...data };
  delete payload._updatedAt;
  delete payload._rev;
  delete payload._baseRev;
  delete payload._stateRev;
  delete payload._serverSnapshot;
  delete payload._tenantId;
  const updated_at = new Date().toISOString();
  const fp = statePath();
  let rev = 0;
  if (fs.existsSync(fp)) {
    try { const prev = JSON.parse(fs.readFileSync(fp, "utf8")); rev = Number(prev.rev) || 0; } catch (e) {}
  }
  rev += 1;
  writeJsonAtomic(fp, { version, data: payload, updated_at, rev });
  return { updatedAt: updated_at, rev };
}

export async function nextSequence(key, min = 0, tenantId = DEFAULT_TENANT) {
  await ensureSchema();
  const tid = tenantId || DEFAULT_TENANT;
  const fp = countersPath(tid);
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

export async function patchConnectedSessions(sessions) {
  const state = (await getState()) || { _v: 6, connectedSessions: [] };
  state.connectedSessions = sessions || [];
  return saveState(state);
}

export async function listSnapshots(limit = 30) {
  await ensureSchema();
  const dir = snapshotsDir();
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const rows = files.map((f) => {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    const meta = JSON.parse(fs.readFileSync(full, "utf8"));
    return { id: meta.id, label: meta.label, created_by: meta.created_by, created_at: meta.created_at, bytes: stat.size };
  });
  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return rows.slice(0, limit);
}

export async function saveSnapshot(label, createdBy, data, tenantId = DEFAULT_TENANT) {
  await ensureSchema();
  const id = "snap-" + Date.now();
  const created_at = new Date().toISOString();
  const dir = snapshotsDir(tenantId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, id + ".json");
  writeJsonAtomic(file, { id, label: label || "Manual snapshot", created_by: createdBy || "system", created_at, data, tenant_id: tenantId });
  return { id, created_at };
}

export async function getSnapshot(id, tenantId = DEFAULT_TENANT) {
  const file = path.join(snapshotsDir(tenantId), id + ".json");
  if (!fs.existsSync(file)) return null;
  const meta = JSON.parse(fs.readFileSync(file, "utf8"));
  return meta.data;
}

export async function healthCheck() {
  await ensureSchema();
  const tenants = await listTenants(null);
  return { now: new Date().toISOString(), db: "file:" + dataRoot(), tenantCount: tenants.length };
}

export async function closePool() {}
