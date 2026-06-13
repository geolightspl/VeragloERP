# Veraglo ERP — Production Readiness Audit & Report

_Internal pre-release audit. Scope: full ERP workflow, data integrity, multi-user/
multi-organization safety, duplicate prevention, module wiring, validation._

This document reports the **actual, evidence-based state** of the system and the
**fixes implemented in this pass**. It is deliberately honest about what is and is
not production-ready so the team can prioritise remaining work.

---

## Architecture context (important)

The entire ERP state is held in one in-memory JSON object on the client and
persisted as a **single PostgreSQL JSONB row** (`erp_state.id = 1`). Business
logic (numbering, duplicate checks, stock, workflow) runs **client-side** in
`src/store.jsx`; the server stores and returns the whole blob via `GET/PUT
/api/state`.

This design is excellent for a fast single-company prototype but has structural
limits for true multi-user / multi-tenant production use (see Risk section).

---

## A. Working properly (verified)

| Area | Evidence |
| --- | --- |
| End-to-end workflow chain | Enquiry → Quotation → SO → Work Order → Material Requirement → Issue → Production → QC → Dispatch → Invoice → Payment is wired in `store.jsx` (`ensureQuotationSO`, `sendSalesOrderToProduction`, `planMaterialRequirement`, `issueMaterialAgainstRequirement`, `completeWorkOrder`, `recordFinalQcResult`, `createShipmentFromSO`, `saveInvoice`, `recordPayment`). |
| Stock is ledger-driven | `stockLedger` entries summed for balances; `postIssue` checks availability and rolls back on shortage. |
| Item SKU duplicate prevention | Hard block via `sku-engine.jsx` + `validateItemMfrDuplicate`. |
| Manufacturer + part-number duplicate | Hard block (`store.jsx` `findDuplicateItemMfr`). |
| ERP user email duplicate | Blocked on create. |
| Document numbering engine | Central prefix/padding/FY-year/reset engine with a soft duplicate retry loop (`numbering-engine.jsx`). |
| Audit log | `auditLog` captures generic CRUD + key workflow events; Admin → Audit Trail viewer. |
| Conversion guards | Quotation→SO, SO→Invoice etc. guard against duplicate forwarding. |
| Dashboards | Redesigned command-center layout; KPI/work-queue counts read live from state. |

## B. Partially working

| Area | Detail |
| --- | --- |
| Document numbering | Engine is correct **single-user**, but generation is read-modify-write in JS memory with **no DB sequence/uniqueness** → concurrent creates can collide. |
| Stock integrity | Main issue path is guarded; a **central negative guard was added this pass** (see Fixes), but location-scoped balances can still be optimistic. |
| Validation | GST/PAN/email/IFSC/PIN existed on customers only; **now centralised** and applied to suppliers/employees (see Fixes). |
| Workflow | Sales can shortcut Quotation→Invoice without production/QC (by design for trading, but no policy toggle). |
| Audit log | Capped at 500 entries; `erp_audit` relational table defined in `schema.sql` but unused. |

## C. Broken / not connected (before this pass)

| Item | Status |
| --- | --- |
| Supplier duplicate prevention | **Was missing** → fixed (hard block on GSTIN/email/name). |
| Employee duplicate prevention | **Was missing** → fixed (hard block on email/mobile/PAN). |
| Supplier/Employee field validation | **Was missing** → fixed (shared validators). |
| Customer master `outstanding` | Not updated by payments → **fixed** (`recomputeCustomerOutstanding`). |
| Negative stock on bypass paths | No central guard → **fixed** in `postLedger`. |

## D. Duplicate / unnecessary fields

- `customer.outstanding` was a manual field duplicated by a computed balance in the
  360 view. Now kept in sync automatically; recommend making it read-only in the UI.
- No large-scale dead-field removal was performed in this pass (requires per-form
  review with stakeholders to avoid removing fields used in PDFs/reports).

## E. Missing functionality (not implemented — requires dedicated project)

- **Multi-organization / multi-tenant.** The app is single-company
  (`DB.company` is one object; `erp_state` is one row). There is **no `orgId`
  scoping** on any record. True multi-org needs a schema redesign (per-org rows or
  `orgId` column + scoped queries + an org switcher + per-org numbering/roles).
  This is a feature build, not a fix, and was **not** attempted here.

## F. Security risks

- Business rules (permissions, validation, numbering) are enforced **client-side**;
  the server accepts whatever state the client PUTs (with only a stale-overwrite
  guard). A malicious client could bypass rules. Server-side enforcement is
  recommended for production.
- Audit log is client-written and capped; not tamper-evident.

## G. Data integrity risks (highest priority)

1. **Lost updates / last-writer-wins.** Two users editing concurrently both PUT the
   full state; the second overwrites the first. `mergeStateProtected` only guards
   against a client sending *empty* protected arrays — it does **not** merge
   concurrent record additions. **Recommended fix:** optimistic concurrency
   (version check → `409` → client refetch+retry) or per-entity endpoints.
2. **Non-atomic numbering.** Concurrent document creation can yield duplicate
   numbers despite the soft retry. **Recommended fix:** Postgres sequences or a
   numbering table with `SELECT … FOR UPDATE`.
3. **No DB uniqueness constraints** (all data is JSONB).

## H. UI/UX issues (addressed in earlier passes)

- Sidebar simplified to module dropdown + submenus.
- Dashboards redesigned (banner, quick actions, KPI grid, work queue) — fixed the
  congested/broken grid layout.
- Theme system added (14 themes, light/dark).

## I. Required fixes before production (prioritised)

| Priority | Fix | Effort |
| --- | --- | --- |
| P0 | Optimistic concurrency on `PUT /api/state` (version check + client retry) | Medium |
| P0 | Atomic numbering via DB sequence/locked table | Medium |
| P1 | Server-side validation & permission enforcement | High |
| P1 | Multi-organization scoping (if multi-tenant is required) | High |
| P2 | Move audit log to `erp_audit` table; remove 500 cap; honour retention days | Medium |
| P2 | Make `customer.outstanding` read-only; extend ledger sync to supplier AP | Low |
| P3 | Per-form dead-field review; PDF/backup regression suite | Medium |

---

## Fixes implemented in this audit pass

All changes are client-side, localized, and backward-compatible.

1. **`src/validators.js` (new)** — shared format validators (`isEmail`, `isMobile`,
   `isGSTIN`, `isPAN`, `isIFSC`, `isPIN`, `validateRecord`). Registered as
   `VG.validators` and loaded before `store.jsx`.

2. **Supplier duplicate prevention + validation** — `store.create/update("suppliers")`
   now blocks duplicates by GSTIN, email, or name, and rejects invalid
   GST/PAN/email/mobile. Applies to both the Purchase and Inventory supplier forms.

3. **Employee duplicate prevention + validation** — `store.create/update("employees")`
   blocks duplicates by email, mobile, or PAN, and validates formats.

4. **Central negative-stock guard** — `store.postLedger` rejects any posting that
   would drive an item's total on-hand below zero (with an `allowNegative` escape
   hatch and an audit entry), protecting scrap/transfer/adjustment/BOM paths.

5. **Customer outstanding sync** — `recomputeCustomerOutstanding` recalculates the
   customer master balance from posted invoices and is invoked on invoice
   save/update and on `recordPayment`.

### Verification

- All changed files transform cleanly with the Babel React preset.
- Manual browser testing of duplicate-supplier and duplicate-employee blocking and
  an end-to-end workflow (see PR walkthrough artifacts).

---

_Last updated: June 2026 · audit build `2026-06-audit-hardening-v1`._
