-- Veraglo ERP — PostgreSQL schema (multi-tenant document store + metadata)
-- Each tenant has an isolated JSONB ERP state row.

CREATE TABLE IF NOT EXISTS tenants (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE tenants IS 'Organization / tenant registry for multi-tenant ERP';

CREATE TABLE IF NOT EXISTS erp_state (
  tenant_id   TEXT PRIMARY KEY REFERENCES tenants(id),
  version     INTEGER NOT NULL,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rev         BIGINT NOT NULL DEFAULT 0
);

COMMENT ON TABLE erp_state IS 'Per-tenant ERP database snapshot (all collections as JSON)';

-- Atomic document-numbering counters. Keys are tenant-prefixed in application code.
CREATE TABLE IF NOT EXISTS erp_counters (
  key         TEXT PRIMARY KEY,
  value       BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE erp_counters IS 'Atomic server-side sequence counters (key includes tenant prefix)';

CREATE TABLE IF NOT EXISTS erp_snapshots (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL DEFAULT 'default',
  label       TEXT NOT NULL DEFAULT 'Manual snapshot',
  created_by  TEXT NOT NULL DEFAULT 'system',
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_snapshots_tenant ON erp_snapshots (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS erp_audit (
  id          TEXT PRIMARY KEY,
  ts          BIGINT NOT NULL,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  ref_id      TEXT,
  summary     TEXT,
  module      TEXT,
  old_value   TEXT,
  new_value   TEXT,
  ip          TEXT,
  device      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_audit_ts ON erp_audit (ts DESC);
CREATE INDEX IF NOT EXISTS idx_erp_audit_entity ON erp_audit (entity);

INSERT INTO tenants (id, slug, name, status)
VALUES ('default', 'default', 'Default Organization', 'active')
ON CONFLICT (id) DO NOTHING;

-- One-time production bootstrap lock (global, not per-tenant).
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

COMMENT ON TABLE system_bootstrap_status IS 'One-time server bootstrap lock — prevents repeated first-admin setup';

INSERT INTO system_bootstrap_status (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;
