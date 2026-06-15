/** Multi-tenant resolution and helpers for Veraglo ERP API. */
export const DEFAULT_TENANT = "default";

export function normalizeTenantSlug(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!s) return DEFAULT_TENANT;
  if (s.length > 64) return s.slice(0, 64);
  return s;
}

/** Resolve tenant from header, query, or subdomain. */
export function resolveTenantSlug(req) {
  const header = req.headers["x-tenant-slug"] || req.headers["x-tenant-id"];
  if (header) return normalizeTenantSlug(header);
  const q = req.query && (req.query.tenant || req.query.tenantSlug);
  if (q) return normalizeTenantSlug(q);
  const host = String(req.headers.host || "").split(":")[0];
  const parts = host.split(".");
  if (parts.length >= 3 && !["www", "localhost", "127"].includes(parts[0])) {
    return normalizeTenantSlug(parts[0]);
  }
  return DEFAULT_TENANT;
}

export function tenantMiddleware(req, _res, next) {
  const slug = resolveTenantSlug(req);
  req.tenantId = slug;
  req.tenantSlug = slug;
  next();
}

export function scopedCounterKey(tenantId, key) {
  return `${tenantId || DEFAULT_TENANT}:${String(key)}`;
}

export function emptyTenantState() {
  return {
    _v: 11,
    seq: { USR: 0 },
    erpUsers: [],
    customRoles: [],
    locations: [{ id: "loc1", name: "Main Warehouse", locType: "Warehouse", status: "Active" }],
    settings: { activation: { status: "Trial" }, security: { minPasswordLength: 8 } },
    connectedSessions: [],
    revokedSessions: [],
    auditLog: [],
    company: { id: DEFAULT_TENANT, tenantId: DEFAULT_TENANT, name: "Organization" },
  };
}

export function platformKeyOk(req) {
  const expected = process.env.VERAGLO_PLATFORM_KEY;
  if (!expected) return process.env.NODE_ENV === "test";
  const got = req.headers["x-platform-key"] || req.headers["authorization"];
  if (!got) return false;
  if (got === expected) return true;
  if (String(got).startsWith("Bearer ")) return String(got).slice(7) === expected;
  return false;
}
