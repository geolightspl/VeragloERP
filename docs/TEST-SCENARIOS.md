# Veraglo ERP — Test Scenario Catalog

This document lists recommended automated and manual test scenarios for Veraglo ERP.  
**Implemented API tests** live in `server/tests/api/api.test.mjs` (Node.js / Express backend).

---

## 1. Platform & API (Node.js Express)

| ID | Scenario | Type | Status |
|----|----------|------|--------|
| API-001 | `GET /api/health` returns ok, storage mode, server time | API | ✅ Automated |
| API-002 | `GET /api/auth/status` on empty DB → `needsSetup: true` | API | ✅ Automated |
| API-003 | `GET /api/auth/status` after admin exists → `hasUsers: true` | API | ✅ Automated |
| API-004 | `POST /api/setup/bootstrap-admin` creates first admin | API | ✅ Automated |
| API-005 | Second bootstrap attempt returns 403 `users_exist` | API | ✅ Automated |
| API-006 | Bootstrap rejects password &lt; 8 chars | API | ✅ Automated |
| API-007 | `GET /api/state` returns 404 on empty DB | API | ✅ Automated |
| API-008 | `PUT /api/state` saves and `GET` returns same document | API | ✅ Automated |
| API-009 | `PUT /api/state` rejects body without `_v` | API | ✅ Automated |
| API-010 | Stale client cannot wipe `erpUsers` (merge protection) | API | ✅ Automated |
| API-011 | `PUT /api/state` optimistic lock conflict (409) when `_baseRev` stale | API | ⏳ Postgres only |
| API-012 | `POST /api/sessions/heartbeat` stores session | API | ✅ Automated |
| API-013 | `GET /api/sessions` lists active sessions | API | ✅ Automated |
| API-014 | `POST /api/auth/repair` on missing state → 404 | API | ✅ Automated |
| API-015 | `POST /api/auth/repair` rebuilds auth index | API | ✅ Automated |
| API-016 | `POST /api/numbering/next` sequential counters | API | ✅ Automated |
| API-017 | `POST /api/numbering/next` requires `key` | API | ✅ Automated |
| API-018 | `POST /api/numbering/next` respects `min` seed | API | ✅ Automated |
| API-019 | Snapshots create / list / get | API | ✅ Automated |
| API-020 | Snapshot missing id → 404 | API | ✅ Automated |
| API-021 | Forgot-password settings (public) | API | ✅ Automated |
| API-022 | Forgot-password request (no user enumeration) | API | ✅ Automated |
| API-023 | Forgot-password OTP verify rejects invalid code | API | ✅ Automated |
| API-024 | Forgot-password full flow: request → OTP → reset → login | API | ⏳ Planned |
| API-025 | Weather settings + disabled current weather | API | ✅ Automated |
| API-026 | Themes list / current / apply / custom CRUD | API | ✅ Automated |
| API-027 | Email integration settings mask secrets | API | ✅ Automated |
| API-028 | Email sync requires configuration | API | ✅ Automated |
| API-029 | Email → enquiry conversion creates record | API | ✅ Automated |
| API-030 | Portal quote invalid token → not_found | API | ✅ Automated |
| API-031 | Portal quote valid token → sanitized payload | API | ✅ Automated |
| API-032 | Portal view increments view count | API | ✅ Automated |
| API-033 | Notifications send validates `to` + `subject` | API | ✅ Automated |
| API-034 | Data path validate blank path | API | ✅ Automated |
| API-035 | `GET /` serves React shell (`index.html`) | API | ✅ Automated |

---

## 2. Platform & API (Java Spring Boot — migration target)

| ID | Scenario | Type | Status |
|----|----------|------|--------|
| JAVA-001 | `GET /api/health` | API | ⏳ Planned |
| JAVA-002 | `GET /api/auth/status` | API | ⏳ Planned |
| JAVA-003 | `POST /api/auth/login` JWT issuance | API | ⏳ Planned |
| JAVA-004 | `GET/PUT /api/state` parity with Node | API | ⏳ Planned |
| JAVA-005 | Customer CRUD REST endpoints | API | ⏳ Planned |
| JAVA-006 | Item CRUD REST endpoints | API | ⏳ Planned |
| JAVA-007 | Sales order CRUD + stage patch | API | ⏳ Planned |
| JAVA-008 | JSON migration import | API | ⏳ Planned |
| JAVA-009 | Contract parity: Node vs Java same responses | API | ⏳ Planned |

---

## 3. Authentication & Security

| ID | Scenario | Type | Status |
|----|----------|------|--------|
| AUTH-001 | First-time administrator setup screen | E2E | ⏳ Planned |
| AUTH-002 | Login with valid email/password | E2E | ⏳ Planned |
| AUTH-003 | Login fails for wrong password | E2E | ⏳ Planned |
| AUTH-004 | Login fails for inactive role | E2E | ⏳ Planned |
| AUTH-005 | Account lockout after max failed attempts | E2E | ⏳ Planned |
| AUTH-006 | Session heartbeat keeps session alive | E2E | ⏳ Planned |
| AUTH-007 | Logout clears session | E2E | ⏳ Planned |
| AUTH-008 | Forgot password OTP flow (dev debug mode) | E2E | ⏳ Planned |
| AUTH-009 | Forgot password email link flow | E2E | ⏳ Planned |
| AUTH-010 | Role without module access cannot open module | E2E | ⏳ Planned |
| AUTH-011 | Action RBAC: view/add/edit/delete/approve/export/print | E2E | ⏳ Planned |
| AUTH-012 | Admin → Users: create user with password | E2E | ⏳ Planned |
| AUTH-013 | Admin → Users: reset password | E2E | ⏳ Planned |
| AUTH-014 | Admin → Roles: module + section restrictions | E2E | ⏳ Planned |
| AUTH-015 | Change password from top-right user menu | E2E | ⏳ Planned |
| AUTH-016 | Profile settings: theme + display size | E2E | ⏳ Planned |
| AUTH-017 | Data integrity warning blocks first-time setup | E2E | ⏳ Planned |
| AUTH-018 | Auth repair restores login index | E2E | ⏳ Planned |

---

## 4. App Shell & Navigation

| ID | Scenario | Type | Status |
|----|----------|------|--------|
| NAV-001 | Post-login Home Dashboard shows module grid | E2E | ⏳ Planned |
| NAV-002 | Sidebar shows logo + module selector + submenus only | E2E | ⏳ Planned |
| NAV-003 | Sidebar logo click → Home Dashboard | E2E | ⏳ Planned |
| NAV-004 | Unsaved form → logo click shows leave warning | E2E | ⏳ Planned |
| NAV-005 | Leave dialog: Save & Continue / Leave / Cancel | E2E | ⏳ Planned |
| NAV-006 | Module selector switches module | E2E | ⏳ Planned |
| NAV-007 | Section submenu navigates within module | E2E | ⏳ Planned |
| NAV-008 | Top bar user menu: Home, Profile, Change password, Logout | E2E | ⏳ Planned |
| NAV-009 | Universal search (⌘K) opens and finds records | E2E | ⏳ Planned |
| NAV-010 | Light/dark theme toggle persists | E2E | ⏳ Planned |
| NAV-011 | Sidebar collapse/expand (⌘B) | E2E | ⏳ Planned |
| NAV-012 | Mobile sidebar drawer opens/closes | E2E | ⏳ Planned |

---

## 5. Sales & CRM

| ID | Scenario | Type | Status |
|----|----------|------|--------|
| SAL-001 | Customer Master: create customer with GSTIN/PAN | E2E | ⏳ Planned |
| SAL-002 | Customer Master: edit + audit trail | E2E | ⏳ Planned |
| SAL-003 | Customer Master: deactivate / block duplicate code | E2E | ⏳ Planned |
| SAL-004 | Enquiry: create with customer from master only | E2E | ⏳ Planned |
| SAL-005 | Enquiry → Quotation opens review (not silent create) | E2E | ⏳ Planned |
| SAL-006 | Quotation: create, edit lines, tax/discount calc | Unit | ⏳ Planned |
| SAL-007 | Quotation: revision format R00, R01 | Unit | ⏳ Planned |
| SAL-008 | Quotation PDF header shows quotation title (not SO) | E2E | ⏳ Planned |
| SAL-009 | Quotation clone opens editable draft | E2E | ⏳ Planned |
| SAL-010 | Quotation → Proforma: confirm → review → forward | E2E | ⏳ Planned |
| SAL-011 | Quotation → Sales Order: opens SO builder (no auto-create) | E2E | ⏳ Planned |
| SAL-012 | Sales Order: create, confirm, revision | E2E | ⏳ Planned |
| SAL-013 | Sales Order PDF header matches document type | E2E | ⏳ Planned |
| SAL-014 | Proforma → Sales Order workflow | E2E | ⏳ Planned |
| SAL-015 | Tax Invoice: domestic + export fields | E2E | ⏳ Planned |
| SAL-016 | Invoice: LUT/Bond, Incoterms, multi-currency | E2E | ⏳ Planned |
| SAL-017 | Document numbering uses server atomic counter | API | ✅ Partial |
| SAL-018 | Workflow audit: confirm, review opened, forward, draft saved | E2E | ⏳ Planned |
| SAL-019 | Customer portal link view + download flag | E2E | ⏳ Planned |
| SAL-020 | Communication center notifications | E2E | ⏳ Planned |

---

## 6. Enquiry & Follow-up

| ID | Scenario | Type | Status |
|----|----------|------|--------|
| ENQ-001 | Create enquiry with project/requirement fields | E2E | ⏳ Planned |
| ENQ-002 | Assign enquiry to sales user | E2E | ⏳ Planned |
| ENQ-003 | Follow-up reminders and status transitions | E2E | ⏳ Planned |
| ENQ-004 | Convert enquiry → quotation via review screen | E2E | ⏳ Planned |
| ENQ-005 | Email integration → convert to enquiry | API | ✅ Automated |
| ENQ-006 | Enquiry list filters and export | E2E | ⏳ Planned |

---

## 7. Purchase

| ID | Scenario | Type | Status |
|----|----------|------|--------|
| PUR-001 | Supplier master CRUD | E2E | ⏳ Planned |
| PUR-002 | Purchase requisition create + approve | E2E | ⏳ Planned |
| PUR-003 | Purchase order create from requisition | E2E | ⏳ Planned |
| PUR-004 | PO → GRN workflow via review | E2E | ⏳ Planned |
| PUR-005 | PO revision and cancellation rules | E2E | ⏳ Planned |
| PUR-006 | Purchase analytics/report export | E2E | ⏳ Planned |

---

## 8. Inventory

| ID | Scenario | Type | Status |
|----|----------|------|--------|
| INV-001 | Item Master: create FG/RM with UOM | E2E | ⏳ Planned |
| INV-002 | Item locations (plant/warehouse/rack) | E2E | ⏳ Planned |
| INV-003 | Opening balance entry + approval lock | E2E | ⏳ Planned |
| INV-004 | GRN: multi-line receipt posts stock ledger | E2E | ⏳ Planned |
| INV-005 | Material issue reduces stock | E2E | ⏳ Planned |
| INV-006 | Stock cannot go negative (if configured) | E2E | ⏳ Planned |
| INV-007 | Inline “Add New Item” from transaction line | E2E | ⏳ Planned |
| INV-008 | Item search/filter in transaction dropdowns | E2E | ⏳ Planned |
| INV-009 | Stock valuation report | E2E | ⏳ Planned |

---

## 9. Production

| ID | Scenario | Type | Status |
|----|----------|------|--------|
| PRD-001 | BOM create/edit with components | E2E | ⏳ Planned |
| PRD-002 | Work order from sales order via review | E2E | ⏳ Planned |
| PRD-003 | Material requirement explosion | E2E | ⏳ Planned |
| PRD-004 | WO stage transitions + audit | E2E | ⏳ Planned |
| PRD-005 | Production dashboard KPIs load | E2E | ⏳ Planned |

---

## 10. Quality

| ID | Scenario | Type | Status |
|----|----------|------|--------|
| QUA-001 | Inspection template create | E2E | ⏳ Planned |
| QUA-002 | Incoming/in-process/final inspection records | E2E | ⏳ Planned |
| QUA-003 | QC accept → dispatch ready workflow | E2E | ⏳ Planned |
| QUA-004 | QC reject / rework path | E2E | ⏳ Planned |
| QUA-005 | Aviation QC template (if enabled) | E2E | ⏳ Planned |

---

## 11. Dispatch

| ID | Scenario | Type | Status |
|----|----------|------|--------|
| DIS-001 | Dispatch note from ready QC | E2E | ⏳ Planned |
| DIS-002 | Shipment tracking fields | E2E | ⏳ Planned |
| DIS-003 | Partial dispatch quantities | E2E | ⏳ Planned |
| DIS-004 | Dispatch → invoice linkage | E2E | ⏳ Planned |

---

## 12. Accounts

| ID | Scenario | Type | Status |
|----|----------|------|--------|
| ACC-001 | Chart of accounts setup | E2E | ⏳ Planned |
| ACC-002 | AR from sales invoice | E2E | ⏳ Planned |
| ACC-003 | AP from purchase invoice | E2E | ⏳ Planned |
| ACC-004 | Payment receipt / voucher | E2E | ⏳ Planned |
| ACC-005 | GST/tax summary reports | E2E | ⏳ Planned |

---

## 13. HR & Payroll

| ID | Scenario | Type | Status |
|----|----------|------|--------|
| HR-001 | Employee master create/edit | E2E | ⏳ Planned |
| HR-002 | Attendance import / entry | E2E | ⏳ Planned |
| HR-003 | Payroll run via review workflow | E2E | ⏳ Planned |
| HR-004 | Payslip PDF generation | E2E | ⏳ Planned |
| HR-005 | Leave / shift rules (if configured) | E2E | ⏳ Planned |

---

## 14. Admin

| ID | Scenario | Type | Status |
|----|----------|------|--------|
| ADM-001 | Company profile: logo, GSTIN, addresses | E2E | ⏳ Planned |
| ADM-002 | Locations: plant/warehouse CRUD | E2E | ⏳ Planned |
| ADM-003 | Users + roles + permissions matrix | E2E | ⏳ Planned |
| ADM-004 | Document numbering rules | E2E | ⏳ Planned |
| ADM-005 | Security: forgot password, session timeout | E2E | ⏳ Planned |
| ADM-006 | Notifications: SMTP/SMS settings | E2E | ⏳ Planned |
| ADM-007 | Login weather theme settings | E2E | ⏳ Planned |
| ADM-008 | Theme designer apply custom theme | E2E | ⏳ Planned |
| ADM-009 | Audit log records critical actions | E2E | ⏳ Planned |
| ADM-010 | Backup snapshot create/restore | E2E | ⏳ Planned |
| ADM-011 | License / trial activation gate | E2E | ⏳ Planned |

---

## 15. Cross-cutting workflow engine

| ID | Scenario | Type | Status |
|----|----------|------|--------|
| WF-001 | No stage advances without user confirm | E2E | ⏳ Planned |
| WF-002 | Review screen opens full-window with editable fields | E2E | ⏳ Planned |
| WF-003 | Forward generates target document | E2E | ⏳ Planned |
| WF-004 | Save draft keeps source document unchanged | E2E | ⏳ Planned |
| WF-005 | Audit trail: confirm, review opened, forward, draft saved | E2E | ⏳ Planned |
| WF-006 | Back from review respects unsaved guard | E2E | ⏳ Planned |

---

## 16. Documents & PDF

| ID | Scenario | Type | Status |
|----|----------|------|--------|
| DOC-001 | Quotation PDF company header/footer | E2E | ⏳ Planned |
| DOC-002 | SO / PI / Invoice PDF titles correct per type | E2E | ⏳ Planned |
| DOC-003 | Revision label R00 format on PDF | E2E | ⏳ Planned |
| DOC-004 | Print preview from list actions | E2E | ⏳ Planned |
| DOC-005 | Email document with PDF attachment | E2E | ⏳ Planned |

---

## 17. Performance & concurrency

| ID | Scenario | Type | Status |
|----|----------|------|--------|
| PERF-001 | Two users create documents simultaneously → unique numbers | API | ⏳ Planned |
| PERF-002 | Two users PUT state → one gets 409 conflict | API | ⏳ Postgres |
| PERF-003 | Large state sync (&gt;5MB) within limit | API | ⏳ Planned |
| PERF-004 | Login page loads if weather API down | E2E | ⏳ Planned |

---

## Running automated API tests

```bash
# From repository root
npm run test:api

# Or from server folder
cd server && npm test
```

Tests use isolated **file storage** (`USE_FILE_STORAGE=1`) — no Docker required.

Test files: `server/tests/api/api.test.mjs`

For Postgres-specific scenarios (API-011, PERF-002), run with:

```bash
USE_FILE_STORAGE=0 DATABASE_URL=postgresql://veraglo:veraglo@localhost:5432/veraglo_erp_test npm run test:api
```

---

## Recommended implementation order

1. ✅ **API smoke** (health, auth, state, numbering) — done  
2. **E2E smoke** (login, home, open module) — Playwright  
3. **Sales critical path** (enquiry → quotation → SO)  
4. **Inventory GRN/issue**  
5. **Admin users/roles**  
6. **Java backend parity** tests as migration completes  

**Legend:** ✅ Automated · ⏳ Planned · Partial = covered indirectly
