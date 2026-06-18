/** Persistent one-time system bootstrap lock (file or PostgreSQL). */
import fs from "fs";
import path from "path";
import * as fileDb from "./file-db.js";

const STATUS_ID = "global";
const STATUS_FILE = "system_bootstrap_status.json";

export function isProductionMode() {
  return process.env.VERAGLO_PRODUCTION === "1" || process.env.NODE_ENV === "production";
}

export function bootstrapEnabledEnv() {
  const v = String(process.env.BOOTSTRAP_ENABLED || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function expectedBootstrapSecret() {
  return String(process.env.BOOTSTRAP_SECRET || "").trim();
}

export function expectedRecoverySecret() {
  return String(process.env.RECOVERY_SECRET || process.env.BOOTSTRAP_SECRET || "").trim();
}

function defaultStatus() {
  return {
    bootstrap_completed: false,
    bootstrap_locked: false,
    completed_at: null,
    completed_by: null,
    server_environment: null,
    organization_id: null,
    admin_user_id: null,
    failed_attempts: 0,
    last_attempt_at: null,
    last_attempt_ip: null,
    audit: [],
  };
}

function rowToStatus(row) {
  return {
    bootstrap_completed: !!row.bootstrap_completed,
    bootstrap_locked: !!row.bootstrap_locked,
    completed_at: row.completed_at || null,
    completed_by: row.completed_by || null,
    server_environment: row.server_environment || null,
    organization_id: row.organization_id || null,
    admin_user_id: row.admin_user_id || null,
    failed_attempts: Number(row.failed_attempts) || 0,
    last_attempt_at: row.last_attempt_at || null,
    last_attempt_ip: row.last_attempt_ip || null,
    audit: Array.isArray(row.audit) ? row.audit : [],
  };
}

export function statusFilePath() {
  return path.join(fileDb.dataRoot(), STATUS_FILE);
}

export async function ensureBootstrapTable(queryFn) {
  if (fileDb.usingFileStorage()) return;
  await queryFn(`
    CREATE TABLE IF NOT EXISTS system_bootstrap_status (
      id                  TEXT PRIMARY KEY DEFAULT 'global',
      bootstrap_completed BOOLEAN NOT NULL DEFAULT FALSE,
      bootstrap_locked    BOOLEAN NOT NULL DEFAULT FALSE,
      completed_at        TIMESTAMPTZ,
      completed_by        TEXT,
      server_environment  TEXT,
      organization_id     TEXT,
      admin_user_id       TEXT,
      failed_attempts     INTEGER NOT NULL DEFAULT 0,
      last_attempt_at     TIMESTAMPTZ,
      last_attempt_ip     TEXT,
      audit               JSONB NOT NULL DEFAULT '[]'::jsonb
    );
  `);
  await queryFn(`
    INSERT INTO system_bootstrap_status (id)
    VALUES ('global')
    ON CONFLICT (id) DO NOTHING;
  `);
}

export async function loadBootstrapStatus(queryFn) {
  if (fileDb.usingFileStorage()) {
    const fp = statusFilePath();
    if (!fs.existsSync(fp)) return defaultStatus();
    try {
      const raw = JSON.parse(fs.readFileSync(fp, "utf8"));
      return { ...defaultStatus(), ...raw };
    } catch (e) {
      console.error("[bootstrap-status] read failed:", e.message);
      return defaultStatus();
    }
  }
  await ensureBootstrapTable(queryFn);
  const { rows } = await queryFn(
    `SELECT bootstrap_completed, bootstrap_locked, completed_at, completed_by,
            server_environment, organization_id, admin_user_id,
            failed_attempts, last_attempt_at, last_attempt_ip, audit
     FROM system_bootstrap_status WHERE id = $1 LIMIT 1`,
    [STATUS_ID]
  );
  if (!rows[0]) return defaultStatus();
  return rowToStatus(rows[0]);
}

export async function saveBootstrapStatus(patch, queryFn) {
  const current = await loadBootstrapStatus(queryFn);
  const next = { ...current, ...patch };
  if (fileDb.usingFileStorage()) {
    fs.mkdirSync(fileDb.dataRoot(), { recursive: true });
    fileDb.writeJsonAtomic(statusFilePath(), next);
    return next;
  }
  await ensureBootstrapTable(queryFn);
  await queryFn(
    `UPDATE system_bootstrap_status SET
      bootstrap_completed = $2,
      bootstrap_locked = $3,
      completed_at = $4,
      completed_by = $5,
      server_environment = $6,
      organization_id = $7,
      admin_user_id = $8,
      failed_attempts = $9,
      last_attempt_at = $10,
      last_attempt_ip = $11,
      audit = $12::jsonb
     WHERE id = $1`,
    [
      STATUS_ID,
      !!next.bootstrap_completed,
      !!next.bootstrap_locked,
      next.completed_at,
      next.completed_by,
      next.server_environment,
      next.organization_id,
      next.admin_user_id,
      Number(next.failed_attempts) || 0,
      next.last_attempt_at,
      next.last_attempt_ip,
      JSON.stringify(next.audit || []),
    ]
  );
  return next;
}

export function appendBootstrapAudit(status, entry) {
  const audit = (status.audit || []).concat({
    id: "bs-" + Date.now(),
    ts: new Date().toISOString(),
    ...entry,
  });
  return { ...status, audit: audit.slice(-100) };
}

export function isBootstrapLocked(status) {
  return !!(status && (status.bootstrap_locked || status.bootstrap_completed));
}

export function verifyDataPathAccessible() {
  if (!fileDb.usingFileStorage()) {
    return { ok: true, mode: "postgresql", path: process.env.DATABASE_URL ? "(database)" : null };
  }
  const root = fileDb.dataRoot();
  try {
    if (!fs.existsSync(root)) {
      return {
        ok: false,
        mode: "file",
        path: root,
        message: "Production database not found. Please verify data path or restore backup.",
      };
    }
    fs.accessSync(root, fs.constants.R_OK | fs.constants.W_OK);
    return { ok: true, mode: "file", path: root };
  } catch (e) {
    return {
      ok: false,
      mode: "file",
      path: root,
      message: "Production database path is not accessible: " + (e.message || e),
    };
  }
}

export function bootstrapSecretFromRequest(req) {
  const h = req.headers || {};
  const auth = String(h.authorization || "");
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return String(h["x-bootstrap-secret"] || h["x-setup-secret"] || "").trim();
}

export function recoverySecretFromRequest(req) {
  const h = req.headers || {};
  const auth = String(h.authorization || "");
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return String(h["x-recovery-secret"] || h["x-bootstrap-secret"] || "").trim();
}

export function checkBootstrapSecret(req) {
  const expected = expectedBootstrapSecret();
  if (!expected) {
    return { ok: false, reason: "bootstrap_secret_not_configured" };
  }
  const got = bootstrapSecretFromRequest(req);
  if (!got || got !== expected) {
    return { ok: false, reason: "invalid_bootstrap_secret" };
  }
  return { ok: true };
}

export function checkRecoverySecret(req) {
  const expected = expectedRecoverySecret();
  if (!expected) {
    return { ok: false, reason: "recovery_secret_not_configured" };
  }
  const got = recoverySecretFromRequest(req);
  if (!got || got !== expected) {
    return { ok: false, reason: "invalid_recovery_secret" };
  }
  return { ok: true };
}

