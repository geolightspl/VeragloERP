# Multi-tenant architecture

Veraglo ERP supports **multiple isolated organizations** on a single deployment. Each organization (tenant) has its own ERP data: users, items, transactions, settings, and snapshots.

## Model

| Layer | Isolation |
|-------|-----------|
| **Tenant registry** | `tenants` table (Postgres) or `data/tenants.json` (file mode) |
| **ERP state** | One JSON document per tenant (`erp_state.tenant_id`) |
| **Counters** | Keys prefixed with `{tenantId}:` |
| **Snapshots** | Scoped by `tenant_id` |
| **Client cache** | `localStorage` key `veraglo-erp-db:{slug}` |

Default single-company installs use organization code **`default`** — no behavior change for existing deployments after migration.

## Tenant resolution (API)

Every API request resolves the active tenant in this order:

1. Header `X-Tenant-Slug` or `X-Tenant-Id`
2. Query `?tenant=` or `?tenantSlug=`
3. Subdomain (e.g. `acme.example.com` → `acme`)
4. Fallback: `default`

## Client

- **Login:** Organization code field (defaults to `default`)
- **Storage:** `src/tenant.jsx` — `VG.tenant.currentSlug()`, `VG.tenant.headers()`, `VG.tenant.switchTenant(slug)`
- **Admin → Organizations:** List, switch, and create tenants (platform key required for create in production)

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tenants` | List organizations (public names/codes) |
| GET | `/api/tenants/current` | Current tenant from request context |
| POST | `/api/tenants` | Create organization (`X-Platform-Key` header) |

## Creating organizations (production)

Set on the server:

```bash
VERAGLO_PLATFORM_KEY=your-secret-platform-key
```

Create via API:

```bash
curl -X POST http://localhost:3000/api/tenants \
  -H "Content-Type: application/json" \
  -H "X-Platform-Key: your-secret-platform-key" \
  -d '{"slug":"acme","name":"Acme Manufacturing"}'
```

Users sign in with organization code **`acme`**.

## Migration from single-tenant

**PostgreSQL:** On startup, existing `erp_state` row `id=1` is copied to tenant `default`. Legacy table renamed to `erp_state_legacy_single`.

**File storage:** `erp_state.json` at data root moves to `tenants/default/erp_state.json`.

## Deployment modes

| Mode | Recommendation |
|------|----------------|
| **One customer per server** | Use `default` only — simplest |
| **SaaS / hosted multi-org** | Enable `VERAGLO_PLATFORM_KEY`, create tenants per customer |
| **Strong isolation** | Consider database-per-tenant for large enterprise (operational, not in-app) |

## Security notes (roadmap)

Current v1 provides **data isolation at storage layer**. Production SaaS should also add:

- JWT/session with `tenantId` claim
- Authenticated `PUT /api/state` (today open for LAN/desktop compatibility)
- Email unique per `(tenant_id, email)` when Java normalized auth is adopted

## Key files

| File | Role |
|------|------|
| `server/tenant.js` | Resolution middleware |
| `server/tenant-registry.js` | Tenant CRUD |
| `server/db.js` | Tenant-scoped state I/O |
| `server/migrate-multi-tenant.js` | Postgres migration |
| `src/tenant.jsx` | Client tenant context |
| `src/admin-tenants.jsx` | Admin UI |
