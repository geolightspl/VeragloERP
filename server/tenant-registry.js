/** Tenant registry — Postgres table or file-backed JSON list. */
import fs from "fs";
import path from "path";
import { normalizeTenantSlug, DEFAULT_TENANT } from "./tenant.js";
import * as fileDb from "./file-db.js";

function useFile() {
  return fileDb.usingFileStorage();
}

function tenantsFilePath() {
  return path.join(fileDb.dataRoot(), "tenants.json");
}

function readFileRegistry() {
  const fp = tenantsFilePath();
  if (!fs.existsSync(fp)) return [];
  try {
    const rows = JSON.parse(fs.readFileSync(fp, "utf8"));
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.error("[tenant-registry] read failed:", e.message);
    return [];
  }
}

function writeFileRegistry(rows) {
  fileDb.writeJsonAtomic(tenantsFilePath(), rows);
}

export async function ensureTenantRegistryTable(queryFn) {
  if (useFile()) return;
  await queryFn(`
    CREATE TABLE IF NOT EXISTS tenants (
      id          TEXT PRIMARY KEY,
      slug        TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      settings    JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);
}

export async function listTenants(queryFn) {
  if (useFile()) {
    return readFileRegistry().filter((t) => t.status !== "suspended");
  }
  await ensureTenantRegistryTable(queryFn);
  const { rows } = await queryFn(
    `SELECT id, slug, name, status, created_at, settings
     FROM tenants WHERE status <> 'suspended' ORDER BY created_at ASC`
  );
  return rows;
}

export async function getTenant(slug, queryFn) {
  const id = normalizeTenantSlug(slug);
  if (useFile()) {
    return readFileRegistry().find((t) => t.id === id || t.slug === id) || null;
  }
  await ensureTenantRegistryTable(queryFn);
  const { rows } = await queryFn(
    `SELECT id, slug, name, status, created_at, settings FROM tenants WHERE id = $1 OR slug = $1 LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function ensureTenant(slug, name, queryFn) {
  const id = normalizeTenantSlug(slug);
  const display = String(name || id).trim() || id;
  const existing = await getTenant(id, queryFn);
  if (existing) return existing;

  const row = {
    id,
    slug: id,
    name: display,
    status: "active",
    created_at: new Date().toISOString(),
    settings: {},
  };

  if (useFile()) {
    const rows = readFileRegistry();
    rows.push(row);
    writeFileRegistry(rows);
    return row;
  }

  await ensureTenantRegistryTable(queryFn);
  const { rows } = await queryFn(
    `INSERT INTO tenants (id, slug, name, status, settings)
     VALUES ($1, $2, $3, 'active', '{}'::jsonb)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, slug, name, status, created_at, settings`,
    [id, id, display]
  );
  return rows[0];
}

export async function createTenant({ slug, name }, queryFn) {
  const id = normalizeTenantSlug(slug);
  if (!id || id.length < 2) throw new Error("Organization code must be at least 2 characters");
  const hit = await getTenant(id, queryFn);
  if (hit) throw new Error("Organization code already exists");
  return ensureTenant(id, name || id, queryFn);
}

export async function ensureDefaultTenant(queryFn) {
  return ensureTenant(DEFAULT_TENANT, "Default Organization", queryFn);
}

function orgSettingsPath() {
  return path.join(fileDb.dataRoot(), "organization_settings.json");
}

export async function getDefaultTenantSlug(queryFn) {
  if (useFile()) {
    const fp = orgSettingsPath();
    if (fs.existsSync(fp)) {
      try {
        const s = JSON.parse(fs.readFileSync(fp, "utf8"));
        if (s.defaultTenantSlug) return normalizeTenantSlug(s.defaultTenantSlug);
      } catch (e) { /* ignore */ }
    }
    return DEFAULT_TENANT;
  }
  await ensureTenantRegistryTable(queryFn);
  const { rows } = await queryFn(
    `SELECT slug FROM tenants WHERE (settings->>'isDefault')::boolean = true AND status <> 'suspended' LIMIT 1`
  );
  if (rows[0]) return normalizeTenantSlug(rows[0].slug);
  return DEFAULT_TENANT;
}

export async function setDefaultTenantSlug(slug, queryFn) {
  const id = normalizeTenantSlug(slug);
  const row = await getTenant(id, queryFn);
  if (!row) throw new Error("Organization not found");
  if (useFile()) {
    fileDb.writeJsonAtomic(orgSettingsPath(), { defaultTenantSlug: id, updatedAt: new Date().toISOString() });
    return id;
  }
  await ensureTenantRegistryTable(queryFn);
  await queryFn(`UPDATE tenants SET settings = settings - 'isDefault' WHERE settings->>'isDefault' = 'true'`);
  await queryFn(
    `UPDATE tenants SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{isDefault}', 'true'::jsonb, true) WHERE id = $1`,
    [id]
  );
  return id;
}

export async function getLoginOrganizations(queryFn, getState) {
  await ensureDefaultTenant(queryFn);
  const defaultSlug = await getDefaultTenantSlug(queryFn);
  const rows = await listTenants(queryFn);
  const orgs = [];
  for (const t of rows) {
    if (t.status === "suspended") continue;
    const slug = t.slug || t.id;
    let configured = false;
    let hasUsers = false;
    let companyName = t.name || slug;
    try {
      const state = getState ? await getState(slug) : null;
      if (state) {
        const { hasLoginUsers, hasCompanyProfile, hasTransactionalData } = await import("./auth-utils.js");
        configured = !!(hasLoginUsers(state) || hasCompanyProfile(state) || hasTransactionalData(state));
        hasUsers = hasLoginUsers(state);
        if (state.company && (state.company.tradeName || state.company.name)) {
          companyName = state.company.tradeName || state.company.name;
        }
      }
    } catch (e) { /* empty org */ }
    orgs.push({
      slug,
      name: companyName,
      status: t.status || "active",
      configured,
      hasUsers,
      isDefault: slug === defaultSlug,
    });
  }
  if (!orgs.length) {
    orgs.push({
      slug: DEFAULT_TENANT,
      name: "Default Organization",
      status: "active",
      configured: false,
      hasUsers: false,
      isDefault: true,
    });
  }
  return { defaultTenantSlug: defaultSlug, organizations: orgs };
}
