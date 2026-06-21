/** One-time migration from single-row erp_state to tenant-scoped storage. */
import { DEFAULT_TENANT } from "./tenant.js";
import { ensureDefaultTenant } from "./tenant-registry.js";

export async function migrateMultiTenant(pool, queryFn) {
  const cols = await queryFn(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'erp_state'`
  );
  const names = cols.rows.map((r) => r.column_name);
  if (names.includes("tenant_id")) return false;

  await ensureDefaultTenant(queryFn);

  if (names.includes("id")) {
    await queryFn(`
      CREATE TABLE IF NOT EXISTS erp_state_by_tenant (
        tenant_id   TEXT PRIMARY KEY REFERENCES tenants(id),
        version     INTEGER NOT NULL,
        data        JSONB NOT NULL,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        rev         BIGINT NOT NULL DEFAULT 0
      );
    `);
    await queryFn(`
      INSERT INTO erp_state_by_tenant (tenant_id, version, data, updated_at, rev)
      SELECT $1, version, data, updated_at, COALESCE(rev, 0)
      FROM erp_state WHERE id = 1
      ON CONFLICT (tenant_id) DO NOTHING
    `, [DEFAULT_TENANT]);
    await queryFn(`ALTER TABLE erp_state RENAME TO erp_state_legacy_single`);
    await queryFn(`ALTER TABLE erp_state_by_tenant RENAME TO erp_state`);
    console.log("[migrate] erp_state migrated to tenant-scoped model (legacy table kept as erp_state_legacy_single)");
  } else if (!names.length) {
    await queryFn(`
      CREATE TABLE IF NOT EXISTS erp_state (
        tenant_id   TEXT PRIMARY KEY REFERENCES tenants(id),
        version     INTEGER NOT NULL,
        data        JSONB NOT NULL,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        rev         BIGINT NOT NULL DEFAULT 0
      );
    `);
  }

  await queryFn(`ALTER TABLE erp_snapshots ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT '${DEFAULT_TENANT}'`);
  await queryFn(`CREATE INDEX IF NOT EXISTS idx_erp_snapshots_tenant ON erp_snapshots (tenant_id, created_at DESC)`);
  return true;
}
