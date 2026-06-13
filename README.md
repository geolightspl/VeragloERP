# Veraglo ERP — Enterprise Workspace

A modern, modular, **role-based ERP front-end** for a manufacturing company. After login,
users land on a full-screen hero **launcher** with glassmorphism module cards; each module
opens its own dedicated dashboard environment (sidebar, top status bar, KPIs, charts, tabs,
tasks, approvals, activity feed) with its own accent color — so every department feels like
it owns a focused, premium app rather than one cluttered system.

This is a **working coded prototype** (greenfield React + Tailwind UI shell). The previous
vanilla payroll app has been preserved under [`legacy/`](legacy/).

## Java Spring Boot backend (enterprise migration)

Veraglo ERP is migrating to **Java 21 + Spring Boot** for production-grade multi-user ERP.
The existing React UI is preserved; the new backend lives in [`java-backend/`](java-backend/).

```bash
docker compose up -d
./scripts/start-java.sh
# open http://localhost:3000
```

See [docs/JAVA-MIGRATION.md](docs/JAVA-MIGRATION.md) for architecture, data migration, and rollout plan.
The legacy Node.js API in `server/` remains during transition.

## Windows installer (.exe) for other laptops

Build a **Setup.exe** (no Docker on the target PC — data stored locally):

```bat
scripts\build-windows-installer.bat
```

Copy `desktop\dist\Veraglo-ERP-Setup-1.0.0.exe` to the other machine and install. See [docs/WINDOWS-INSTALLER.md](docs/WINDOWS-INSTALLER.md).

**CI:** Publishing a [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) automatically builds and uploads the Windows `.exe` (workflow: `.github/workflows/release-windows.yml`).

## AWS deploy (push to `main`)

After one-time EC2 + RDS setup, every push to **`main`** deploys automatically via GitHub Actions. See [docs/AWS-DEPLOY.md](docs/AWS-DEPLOY.md).

## Run it

### With PostgreSQL (recommended)

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. API + static app (single server on port 3000)
cp server/.env.example server/.env
cd server && npm install && npm start

# 3. Open http://localhost:3000
```

On first launch the app seeds from browser cache if the database is empty, then **syncs the full state to PostgreSQL** (`erp_state.data` JSONB). Every change debounces to `PUT /api/state`.

Health check: `GET http://localhost:3000/api/health`

### Static-only (legacy / offline)

React + Tailwind via CDN (no bundler). Use only if the API is not running:

```bash
python3 -m http.server 5173
# open http://localhost:5173/index.html
```

Falls back to **`localStorage`** when `GET /api/state` is unreachable.

> **Login:** there are no default users. On first launch, create the administrator account (email + password). After a server/GitHub deploy, credentials from another machine **do not** apply — reset with `cd server && npm run db:reset-admin` if needed. Check `GET /api/auth/status` for setup hints.

## What's included

| Area | Detail |
| --- | --- |
| **Login** | Full-screen hero (happy team) + glass card, role selector, light/dark toggle |
| **Launcher** | Hero background + glassmorphism module cards grouped by category, RBAC-filtered, hover lift/glow |
| **App shell** | Collapsible left sidebar (module switcher) + sticky top status bar (search, live clock, notifications, messages, alerts, profile, theme) |
| **Module workspace** | Internal tab bar, KPI cards, performance + breakdown charts, workflow strip, pending tasks, approval queue, recent activity, shortcuts, quick data-entry, reports & analytics tabs, records table |
| **Theming** | Per-module accent color (CSS variable), light & dark mode |
| **Charts** | Dependency-free inline SVG (sparkline, bars, donut) |
| **Icons** | Inline SVG icon set (no external icon lib) |

### Modules (15)

Sales & CRM · Enquiry & Follow-up · Inventory · Purchase · Supplier · Production Planning ·
Quality Control · HR & Payroll · Attendance · Dispatch & Logistics · Accounts & Finance ·
Reports & Analytics · Customer Support · Document Management · Admin Control Panel

### Roles & RBAC

Access is controlled at two levels in [`src/data.jsx`](src/data.jsx) (`VG.ROLES`):

- **Module-level** — `modules: 'all'` or a list of module ids the role can open. The sidebar and
  launcher only render permitted modules; `openModule()` also re-checks permission.
- **Action-level** — `actions: [...]` from `view, add, edit, delete, approve, export, print`.
  UI controls (New / Edit / Delete / Approve / Export / Print, quick-entry forms) show or hide
  based on these.

| Role | Modules | Notable actions |
| --- | --- | --- |
| Administrator | all 15 | everything |
| HR Manager | HR, Attendance, Reports, Documents, Support | + approve, export |
| Sales Team | Sales, Enquiry, Reports, Documents, Support | view/add/edit/export/print (no approve/delete) |
| Inventory Manager | Inventory, Purchase, Supplier, Reports, Documents | full incl. delete + approve |
| Production Team | Production, Inventory, Quality, Reports, Documents | view/add/edit |
| Quality Control | Quality, Production, Reports, Documents | + approve |
| Accounts | Accounts, Purchase, Reports, Documents | + approve |
| Dispatch | Dispatch, Inventory, Reports, Documents | view/add/edit |
| Employee | Attendance, Support, Documents | view/add (self-service) |

### Workflow integration

Relevant modules show a **workflow strip**:
`Sales Order → Production → Quality → Dispatch → Invoice`,
`Purchase Request → Approval → Supplier → Inventory`,
`Leave Request → HR Review → Payroll`.

## Project structure

```
index.html        # entry: CDN setup, Tailwind theme, base styles, app chrome CSS
src/
  data.jsx        # modules, RBAC roles, per-module sample dashboard data  (window.VG)
  ui.jsx          # icons, charts, cards, buttons, toggle  (VG.ui)
  modules.jsx     # ModuleWorkspace: tabs + dashboard widgets  (VG.ModuleWorkspace)
  app.jsx         # theme/auth state, Login, Launcher, Sidebar, Topbar, routing, render
assets/           # hero image + logo (shared with legacy app)
legacy/           # the previous vanilla-JS Veraglo Payroll app, archived
```

The four `src/*.jsx` files load in order as Babel scripts and share a global `window.VG`
namespace — a deliberate choice so the prototype runs with **no bundler**.

---

## Functional data layer (Sales & Inventory are fully working)

Beyond the dashboards, the **Sales & CRM** and **Inventory** modules are fully functional,
backed by a reactive store (`src/store.jsx`) with **PostgreSQL** persistence (JSONB document in
`erp_state`) and **localStorage** as offline cache, plus master tables,
transactional collections, an **automatic stock ledger**, auto-numbering, and a complete
**audit trail**.

Key rules enforced:

- **Master-data only** — customer, supplier/vendor, item/SKU, category, unit, tax, location,
  price, payment & delivery terms are chosen from master dropdowns (`MasterSelect`); no free
  typing where master data is required. A permission-gated **“+ Add new …”** option creates a
  master entry inline.
- **Stock ledger auto-updates** — every receipt, issue, transfer, return, scrap and physical
  adjustment posts signed entries to `stockLedger`; on-hand, value and reorder status are
  derived live.
- **Audit trail** — every create/update/delete is logged with actor, action, entity and a
  summary; surfaced in each module's dashboard “Recent activity”.
- **RBAC at action level** — `New / Edit / Delete / Approve / Export / Print` controls and
  quick-add appear only when the role permits (e.g. Sales gets view-only approval queues).
- **Search, filter, export (CSV) and print** are available on every record table; all printed
  documents (quotation, sales order, proforma, challan, every report) carry the **company
  header & footer**.

### Sales & CRM sections

Dashboard · **Customer Master** · Currency Master · PIN Code Master · Price List · Leads ·
Enquiries (sales/purchase) · Follow-ups (with overdue alerts) · Communication History ·
**Quotations** · Discount Approval · Proforma Invoices · Sales Orders · Order Tracking · Reports.

### Customer Master (world-class)

A tabbed master (`src/customer.jsx`) covering **Basic** (auto code, legal/trade name, type,
category, status, PAN, **optional GSTIN with format validation**, CIN, website, source, sales
person), **Contacts** (unlimited, role-tagged: Primary/Accounts/Purchase/Technical), **Addresses**
(unlimited, typed Billing/Shipping/Registered/Site/Warehouse, with **default billing/shipping**
flags and a *“shipping same as billing”* copy), **Commercial** (currency from **Currency Master** +
multi-currency, price list, payment/delivery terms, credit limit/days, outstanding, discount &
tax category, TCS/TDS, incoterms, freight terms), **Banking**, **Documents** (KYC), and **System**
(approval status, audit, duplicate-check info).

- **GSTIN is optional** (unregistered/export/individual customers) but validated when entered;
  PAN and IFSC are likewise format-checked.
- **PIN-code auto-fill** — entering a PIN fetches city/district/state/country/state-code from the
  **PIN Code Master**, falling back to the India Post API (`api.postalpincode.in`); multiple
  localities are selectable; unknown PINs allow manual entry and are flagged *verify pending*.
  Successful lookups are cached back into the master.
- **Duplicate detection** by name, mobile, email, PAN and GSTIN warns before creating.
- **Approval workflow** — customers added by non-approver roles enter a *Pending* queue;
  approvers see an inline approval panel.
- Quotations/orders/proforma auto-pull the **default billing/shipping** address, contact and GSTIN.

The **Quotation builder** auto-generates the number (`QT/FY/####`) and captures customer
(from master), contact, billing/shipping, GSTIN, multi-line items (SKU, HSN, qty, unit, rate,
discount, tax — auto-filled from item + price master), freight/packing/insurance, payment &
delivery terms, warranty, validity, remarks, T&Cs, prepared/approved by and **revision
history**. Discounts above 10% route to a **discount-approval workflow**. From an approved
quote you can **Convert to Sales Order** (which flows Confirmed → Production → Quality →
Ready → Dispatched → Invoiced) and **generate a Proforma**. Quotations export to a branded
**PDF/print** and can be **emailed**.

### Inventory sections

Dashboard · Item Master · Category Master · Supplier Master · Location/Rack/Bin Master ·
**Stock Ledger** · **Material Receipt (GRN)** · **Material Issue** · Stock Transfer · Returns ·
Scrap/Rejection · Physical Verification · Stock Alerts/Reorder · Batch/Lot Tracking · Reports.

**Material Receipt** captures the full GRN (supplier from master, PO/invoice/challan/
transporter/vehicle/LR, item from master, received/accepted/rejected qty, rate, GST, batch,
warranty, storage location, QC required + status, documents, created/approved by) and posts
the accepted quantity to the ledger. **Material Issue** supports all four issue types —
**Invoicing** (links to a Sales Order from master, dispatch/packing/transport), **Internal
Use/Production** (production order, BOM, department, machine, WIP), **Vendor Returnable
Challan** (vendor from master, returnable challan, expected return, pending-return tracking)
and **Vendor Non-Returnable Challan** (reason, cost impact, approval) — validates available
stock and posts the issue, with a printable challan.

### Cross-module links

Quotation → **Sales Order** → (Material Issue *for invoicing* references the order) → Dispatch
stage → Invoiced. Suppliers are shared across Inventory, Material Receipt and Material Issue
(returnable/non-returnable). The other modules (Production, QC, Dispatch, Accounts, Admin, HR)
currently present their dashboards and are wired to the same store/roles for further build-out.

> Tip: the Admin role can reset all demo data via `VG.store.resetDemo()` in the console.

### Admin Control Panel & Backup

The **Admin Control Panel** (`src/admin.jsx`, admin-only) has four working sections:

- **Control Center** — system health (record count, DB size, backup status, roles) + recent activity.
- **Backup & Restore** — a deliberately **non-technical** backup centre:
  - **Back up now** downloads a full, real backup of the entire ERP database (one `.json` file) to
    the user's computer and keeps a rolling in-app snapshot.
  - **Online (Cloud) backup** — pick a service (Google Drive / Dropbox / OneDrive / Amazon S3 / Box /
    Other), set a folder/path, account and access key, with a one-click **Test connection**.
  - **Local / Office Server backup** — set a backup folder, server name/IP and network share, with a
    **Test folder** check.
  - **Automatic schedule** — Manual / Hourly / Daily / Weekly, time of day, and retention.
  - **Restore** — load a backup file (with a clear confirm + replace warning) or restore a recent
    in-app snapshot; both reload the app with the restored data.
  - **Backup history** with destinations, sizes and statuses.
  > In this prototype the downloadable file + restore are fully functional; the cloud/local-server
  > destinations are saved as configuration that a backend backup agent would consume in production.
- **Audit Trail** — the full system audit log with search, filter, export and print.
- **Company Profile** — edit the company details used on every report/PDF header & footer.

### Source files added

```
src/store.jsx      # reactive DB: masters, transactions, stock ledger, audit, auto-numbering, backup/restore
src/forms.jsx      # Modal, Toast, Confirm, MasterSelect (+inline create), fields, RecordTable, PDF/print
src/customer.jsx   # comprehensive Customer Master (+ Currency & PIN masters)
src/sales.jsx      # full Sales & CRM module
src/inventory.jsx  # full Inventory module
src/admin.jsx      # Admin Control Panel: Control Center, Backup & Restore, Audit Trail, Company Profile
```

> Note: files are loaded by a small **sequential loader** in `index.html` (fetch → Babel
> transform → eval, in order) because Babel's multi-`<script>` loader does not guarantee
> execution order for external sources.

---

## Production architecture (recommended next step)

The prototype intentionally avoids a build step. For production, migrate the same components to:

**Frontend**
- **Vite + React 18 + TypeScript + Tailwind CSS** (compiled, tree-shaken, no CDN).
- `react-router` for real routes (`/m/:moduleId`), `@tanstack/react-query` for server state,
  `lucide-react` for icons, `recharts`/`visx` for charts, `framer-motion` for transitions.
- Keep the `VG.ROLES` matrix as a typed `permissions.ts`; gate routes + UI with a `useCan()` hook.

**Backend**
- **API**: NestJS (Node/TS) or Django REST — modular, one service module per ERP module.
- **AuthN/Z**: JWT access + refresh, server-enforced RBAC (never trust the client). Map the same
  role→module→action matrix to API guards/middleware.
- **Async/workflow**: a queue (BullMQ / Celery) for the order→production→dispatch→invoice and
  approval pipelines; event log for the activity feed.

**Database (PostgreSQL)** — core relationships:
- `organizations 1—* users *—* roles`; `roles *—* permissions` (module + action).
- `customers 1—* sales_orders 1—* order_lines`; `sales_orders 1—1 invoices`.
- `work_orders *—1 sales_orders`; `inspections *—1 work_orders / grns`.
- `suppliers 1—* purchase_orders 1—* po_lines`; `purchase_requests 1—1 purchase_orders`.
- `items 1—* stock_movements`; `grns *—1 purchase_orders`.
- `employees 1—* attendance / leave_requests / payroll_runs`.
- `documents` with version + ACL rows. Add an immutable `audit_log` for all writes.

**Security**: HTTPS/HSTS, httpOnly+SameSite cookies, server-side RBAC + row-level scoping by org,
input validation (zod/class-validator), rate limiting, parameterized queries, secrets in a vault,
audit logging, least-privilege DB roles, regular dependency scanning.

**Scalability**: stateless API behind a load balancer, Postgres read replicas + PgBouncer,
Redis cache + queues, object storage (S3) for documents, CDN for static assets, per-module code
splitting on the frontend, horizontal autoscaling.

**Cloud deployment**: containerize (Docker) → managed Kubernetes (EKS/GKE/AKS) or a PaaS
(Render/Railway/Fly.io); managed Postgres + Redis; S3-compatible storage; CI/CD (GitHub Actions)
with staging + production; observability via OpenTelemetry + Grafana/Sentry.
