# Veraglo ERP — Sales Module Feature Reference

**Document version:** 1.0  
**As of:** June 2026  
**Codebase:** `main` branch (`src/sales.jsx`, `src/enquiry.jsx`, `src/customer.jsx`, related modules)

This document describes every feature currently implemented in the **Sales & CRM** module of Veraglo ERP, including navigation, workflows, master data, documents, approvals, integrations, and reports.

---

## Table of contents

1. [Module overview](#1-module-overview)
2. [Navigation structure](#2-navigation-structure)
3. [Quick actions](#3-quick-actions)
4. [Feature reference by section](#4-feature-reference-by-section)
5. [Document conversion pipeline](#5-document-conversion-pipeline)
6. [Sales order lifecycle](#6-sales-order-lifecycle)
7. [Master data dependencies](#7-master-data-dependencies)
8. [Numbering](#8-numbering)
9. [Approvals and field permissions](#9-approvals-and-field-permissions)
10. [PDF, print, and email](#10-pdf-print-and-email)
11. [Reports](#11-reports)
12. [Cross-module integrations](#12-cross-module-integrations)
13. [Roles and permissions](#13-roles-and-permissions)
14. [Technical notes](#14-technical-notes)

---

## 1. Module overview

The Sales module is a full **quote-to-cash** workspace covering:

- **CRM:** customers, enquiries, leads, follow-ups, communication history  
- **Commercial documents:** quotations, proforma invoices, sales orders, tax invoices  
- **Operations visibility:** order tracking, order history, discount/revision approvals  
- **Setup:** price list, currencies, PIN codes  
- **Reporting:** sales registers, export analytics, enquiry analytics  

Primary implementation files:

| Area | File |
|------|------|
| Sales core | `src/sales.jsx` |
| Enquiry management | `src/enquiry.jsx` |
| Customer master & 360° | `src/customer.jsx` |
| Document conversion dialogs | `src/doc-conversion.jsx` |
| Export invoice helpers | `src/invoice-export.jsx` |
| Receivables (shared) | `src/accounts.jsx` |
| Dispatch / shipments | `src/dispatch.jsx` |

---

## 2. Navigation structure

The Sales module sidebar is grouped as follows:

### Overview

| Section | Label |
|---------|-------|
| `dashboard` | **Dashboard** |

### Sales & CRM

| Section | Label |
|---------|-------|
| `customers` | **Customers** |
| `enquiries` | **Enquiries** |
| `leads` | **Leads** |
| `followups` | **Follow-ups** |
| `comms` | **Communication** |
| `quotations` | **Quotations** |
| `proformas` | **Proforma Invoice** |
| `invoices` | **Tax Invoices** |
| `orders` | **Sales Orders** |
| `tracking` | **Order Tracking** |
| `history` | **Order History** |
| `discounts` | **Discount Approval** |
| `revisions` | **Revision Approval** |

### Setup

| Section | Label |
|---------|-------|
| `pricelist` | **Price List** |
| `currencies` | **Currencies** |
| `pincodes` | **PIN Codes** |

### Reports

| Section | Label |
|---------|-------|
| `reports` | **Reports** |

> **Note:** Enquiry management appears under Sales → **Enquiries**. Admin permissions may also list a separate `enquiry` app ID, but the UI lives inside the Sales module.

---

## 3. Quick actions

The Sales module header provides one-click shortcuts:

| Action | Goes to |
|--------|---------|
| **New Sales Order** | Sales Orders (opens create flow) |
| **Create Quotation** | Quotations |
| **Tax Invoices** | Tax Invoices |
| **Add Customer** | Customers |

---

## 4. Feature reference by section

### 4.1 Dashboard

- Module KPIs and work-queue tiles via `VG.ModuleDashboard` (`modId="sales"`).
- Surfaces alerts such as pending quotation approvals, follow-ups due, SO revisions, and orders ready to invoice (when permitted).
- Requires **View** permission.

---

### 4.2 Customers (`customer.jsx`)

**Purpose:** Master data for all buyers; foundation for every sales transaction.

**UI pages:**
- **Customer Master** — list with search, filter, export, print
- **Add New Customer** — full-page form (not a floating modal)
- **Customer 360°** — consolidated view of all customer activity

**Form tabs:**
1. Basic  
2. Contacts  
3. Addresses  
4. Commercial  
5. Banking  
6. Documents  
7. System  

**Key fields (summary):**

| Area | Fields |
|------|--------|
| Identity | Customer code (auto), legal name, display/trade name, type, category |
| Tax | PAN, GSTIN, GST registration type |
| Contacts | Multiple contacts with roles, phone, email |
| Addresses | Billing/shipping; default flags; PIN auto-fill |
| Commercial | Currency, payment terms, delivery terms, credit limit/days, price list, discount category |
| Banking | Remittance / account references |
| Documents | KYC uploads |
| System | Status, approval status, owner |

**Statuses:**
- Customer: **Active** / **Inactive** / **Blocked**
- Approval: **Approved** / **Pending** / **Rejected**

**Customer 360° includes:**
- Enquiries, quotations, proformas, sales orders, invoices, shipments, payments, follow-ups
- Finance tiles (statement, ageing) when user has Accounts/Admin access
- Actions: Preview, Print, PDF download, Transaction summary, Statement PDF, Email statement, Export Excel (CSV)

**Permissions:** Add, Edit, Delete, Approve (for pending customers), Print/Export

---

### 4.3 Enquiries (`enquiry.jsx`)

**Purpose:** Capture RFQs and opportunities; track offer pipeline; convert to quotation or sales order.

**UI:**
- **Enquiry Management** dashboard with KPI tiles
- **Add Enquiry** — full-page builder
- **Enquiry List** with status/priority/type filters
- **Enquiry reports** (embedded or under Sales → Reports)

**Builder sections:**
- Customer (existing or new company details)
- Project (name, location, RFQ reference)
- Requirements (multi-line: description, category, qty, unit, tech spec, drawing ref)
- Other (source, priority, assigned salesperson, dates, remarks)

**Enquiry statuses (12):**

1. New Enquiry  
2. Under Review  
3. Clarification Required  
4. Quotation Under Preparation  
5. Offer Sent  
6. Follow-up Pending  
7. Negotiation  
8. Revised Offer Sent  
9. Won / Converted to Sales Order  
10. Lost  
11. Closed  
12. Cancelled  

**Detail view actions:**
- Create Quotation  
- Request Clarification  
- Add Follow-up  
- Mark Offer Sent  
- Create Revised Offer  
- Mark Negotiation  
- Convert to Sales Order  
- Mark as Won / Lost  
- Cancel / Close Enquiry  
- Upload Documents  
- View Timeline  

**Dashboard tiles:** New enquiries, Under review, Quotation prep, Offers sent, Follow-ups today, Overdue follow-ups, Won, Lost, Conversion %

**Number prefix:** `ENQ`

---

### 4.4 Leads

**Purpose:** Lightweight opportunity tracking before formal enquiry.

**Fields:** Customer (master), title, estimated value, date, source, stage, status, remarks

**Sources:** Website, Referral, Exhibition, Cold call

**Stages:** New, Qualified, Proposal, Negotiation

**Statuses:** Open, Won, Lost

**Number prefix:** `LEAD`

---

### 4.5 Follow-ups

**Purpose:** Schedule and complete customer/enquiry follow-up tasks.

**Fields:** Customer, date, time, mode, next follow-up date, status, remarks; optional link to enquiry (`refType: Enquiry`)

**Modes:** Call, Email, WhatsApp, Meeting, Visit

**Statuses:** Pending, Done

**UI badges:** Overdue count, Due today count

**Integration:** Completing a follow-up linked to an enquiry updates the enquiry timeline via `VG.enquiryOnFollowupDone`.

---

### 4.6 Communication

**Purpose:** Log customer interactions (call log / CRM notes).

**Fields:** Customer, date, mode, subject, note

**Modes:** Call, Email, Visit, Meeting, WhatsApp

**Note:** Create-only in current implementation (log communication).

---

### 4.7 Quotations

**Purpose:** Commercial offers with line-level pricing, tax, and terms.

**UI:**
- **Quotations** list with lifecycle filters
- **Add Quotation** / **Edit Quotation** — full-page builder
- Quotation detail view with conversion workflow panel

**Header fields:**
- Customer, contact, GSTIN  
- Date, validity (days), warranty, subject  
- Project name, project ref, RFQ ref, project location  
- Billing & shipping addresses  
- Currency, exchange rate  
- Payment terms, delivery terms  

**Line fields:**
- Item (from Item Master), description, HSN  
- Qty, unit, rate, discount %, tax %, amount  
- Freight, packing, insurance  
- Round-off (auto/manual)  
- Remarks, terms & conditions  

**Quotation statuses:**
- Draft  
- Pending Approval  
- Approved  
- Sent  
- Won  
- Lost  
- Revised  

**Derived lifecycle display** (from linked documents):
Draft → Pending Approval → Approved → Quote Sent → Proforma Issued → Sales Order Generated → Tax Invoice Generated → Dispatched

**Workflow:**
1. Save as **Draft** or **Submit** (auto **Pending Approval** if discount > 10%)  
2. Manager **Approve** / reject  
3. **Mark Won** / **Mark Lost**  
4. **Send** (email opens mail client; marks Sent)  
5. Convert to Proforma, Sales Order, Tax Invoice, or Dispatch (when Approved/Sent/Won)  
6. **Revision history** on edits after document is sent  

**Discount rule:** Line or overall discount **> 10%** triggers approval (`DISCOUNT_LIMIT = 10`).

**Field permissions (Sales Executive):**
- **Rate:** visible, not editable  
- **Discount %:** editable, triggers approval when over limit  

**PDF:** Premium industrial/commercial offer layout via `VG.buildIndustrialDocument`

**Number prefix:** `QT`

---

### 4.8 Proforma Invoice

**Purpose:** Pre-invoice document for customer PO / advance payment / export shipping.

**UI:** Proforma Invoices list, Add Proforma Invoice, detail/PDF preview

**Fields:**
- Customer, contact, GSTIN  
- Proforma date, due date, validity days  
- Linked sales order, customer PO reference  
- Place of supply  
- Payment & delivery terms, addresses  
- Currency, bank details  
- Line items, freight/packing/insurance, remarks  

**Status:** Issued

**Creation paths:**
- Manual entry  
- Convert from quotation  
- Generate from sales order (**Generate Proforma** on SO detail)

**Number prefix:** `PI`

---

### 4.9 Sales Orders

**Purpose:** Confirmed customer order; drives production, inventory, QC, dispatch, and invoicing.

**UI:**
- Sales Orders list  
- Add / Edit Sales Order — full-page builder  
- Sales Order detail with stage stepper, timeline, and action buttons  

**Header fields:**
- Customer, contact, GSTIN  
- Order date, customer PO ref, delivery date  
- Priority: Normal, Urgent, High Priority, Critical, Custom  
- Linked quotation  
- Billing & dispatch address  
- Payment & delivery terms  
- Technical specifications, special instructions, internal remarks  
- Document upload references  

**Line fields:** Same pattern as quotation (items from master, HSN, qty, rate, disc, tax, charges)

**Initial status:** Created / Saved

**Detail actions:**
- Preview / Print / PDF (`DocActions`)  
- **Generate Proforma**  
- **Send to Production** (creates work order)  
- **Create shipment**  
- **Post invoice**  
- **Advance stage** (manual step-through)  

**Revision workflow:** After send-to-production, critical field changes set `revisionPendingApproval` → **Revision Approval** queue.

**Number prefix:** `SO`

See [Section 6](#6-sales-order-lifecycle) for the full 22-stage pipeline.

---

### 4.10 Tax Invoices

**Purpose:** GST-compliant billing (domestic and export); links to sales order and receivables.

**UI:** Tax Invoices list, Create/Edit Tax Invoice, invoice detail with compliance actions

**Invoice types:**
- Domestic Tax Invoice  
- Export Invoice  
- SEZ Invoice  
- Deemed Export Invoice  

**Key fields:**
- Invoice type, GST treatment  
- Customer, dates, place of supply  
- Linked sales order  
- Payment & delivery terms, addresses  
- Currency, exchange rate, FX totals  
- Bank details (proforma/tax invoice policy)  
- **Export block:** IEC, LUT number, incoterms, ports, weights, buyer country, export declaration, supply type  
- Line items, freight/packing/insurance  

**Invoice statuses:** Posted, Partially Paid, Paid, Cancelled

**Compliance display statuses:** E-Invoice Generated, E-way Generated, E-Invoice + E-way (simulated IRN flow in prototype)

**Print copies:** ORIGINAL, DUPLICATE, TRIPLICATE, TRANSPORTER, OFFICE, RECIPIENT (multi-copy print modal)

**Ready-to-invoice banner:** Shows SOs in dispatch-ready stages without invoice

**Number prefix:** `INV`

> Tax Invoices also appear under **Accounts → Receivables** for payment recording.

---

### 4.11 Order Tracking

**Purpose:** Kanban-style visibility of all open sales orders by stage.

**Features:**
- One card per pipeline stage (excluding Closed) with order count  
- Click stage → list of orders in that stage  
- Drill-down: Order detail (WO, material requirement, dispatch, timeline)  
- Customer snapshot and value breakdown popups  

---

### 4.12 Order History

**Purpose:** Archive of closed/completed orders.

**Fields shown:** SO number, customer, closure date, final status, lifecycle event count

**Action:** View opens printable order timeline

---

### 4.13 Discount Approval

**Purpose:** Manager queue for high-discount quotations.

**Rule:** Quotations with line or overall discount **> 10%**

**Actions:** Approve (→ Approved) / Reject (→ Draft)

**Requires:** Approve permission

---

### 4.14 Revision Approval

**Purpose:** Control changes to sales orders after production has started.

**Rule:** SO with `revisionPendingApproval` after send-to-production edits

**Actions:** Approve (notifies production, updates linked WO) / Reject

**Requires:** Approve permission

---

### 4.15 Price List

**Purpose:** Standard and floor rates per item for quotation pricing control.

**Fields:** Item (master), list rate, floor rate, effective date

**Usage:** Quotation lines warn when rate is below floor rate

---

### 4.16 Currencies

**Purpose:** Multi-currency support for customers and invoices.

**Fields:** Code, name, symbol, rate to INR, base currency flag

---

### 4.17 PIN Codes

**Purpose:** Auto-fill city, district, state, state code on addresses.

**Fields:** PIN, city, district, state, state code, country

---

## 5. Document conversion pipeline

Standard path shown on quotation detail (**Conversion workflow**):

```
Enquiry → Quotation → Proforma Invoice → Sales Order → Tax Invoice → Dispatch
```

### Conversion matrix

| From | To | How |
|------|-----|-----|
| Enquiry | Quotation | **Create Quotation** on enquiry detail |
| Enquiry | Sales Order | **Convert to Sales Order** (requires quotation) |
| Quotation | Proforma | Conversion button on quotation view |
| Quotation | Sales Order | Conversion button; marks quote **Won** |
| Quotation | Tax Invoice | Ensures SO, opens invoice builder |
| Quotation | Dispatch | Ensures SO, creates shipment |
| Sales Order | Proforma | **Generate Proforma** on SO detail |
| Sales Order | Production | **Send to Production** → Work Order |
| Sales Order | Shipment | **Create shipment** (dispatch-ready stages) |
| Sales Order | Tax Invoice | **Post invoice** |
| Shipment | Delivered | Dispatch module: In-transit → Delivered |

All conversions use **`VG.forwardDocument`** with confirmation dialogs (`doc-conversion.jsx`) and audit logging via `store.recordDocumentConversion`.

---

## 6. Sales order lifecycle

Sales orders progress through **22 stages** (`ORDER_FLOW`):

| # | Stage |
|---|-------|
| 1 | Created / Saved |
| 2 | Sent to Production |
| 3 | Accepted by Production |
| 4 | BOM Finalized |
| 5 | Material Requirement Generated |
| 6 | Material Shortage Pending |
| 7 | Material Required |
| 8 | Material Partially Issued |
| 9 | Material Fully Issued |
| 10 | Production In Progress |
| 11 | Production Completed |
| 12 | Sent to Finished Goods Store |
| 13 | Sent to Quality |
| 14 | QC Pending |
| 15 | QC Accepted |
| 16 | Ready for Dispatch |
| 17 | Partially Dispatched |
| 18 | Fully Dispatched |
| 19 | Closed |
| — | On Hold |
| — | Cancelled |

**Automatic updates:** Production, inventory issue, QC, and dispatch modules update SO stages via `store._setSOStage`.

**Manual advance:** SO detail allows stepping through stages (with special handling for production acceptance).

**Invoicing stages:** Ready to Dispatch, Ready for Dispatch, Dispatch Planned, Partially/Fully Dispatched, Dispatched, Invoiced

---

## 7. Master data dependencies

| Master | Collection | Used in |
|--------|------------|---------|
| Customers | `customers` | All transactions |
| Items | `items` | Quote, SO, proforma, invoice lines |
| Categories | `categories` | Enquiry requirement lines |
| Taxes | `taxes` | Line tax % |
| Price list | `priceList` | List rate + floor rate |
| Payment terms | `paymentTerms` | Customer, quote, SO, proforma, invoice |
| Delivery terms | `deliveryTerms` | Same |
| Currencies | `currencies` | Multi-currency transactions |
| PIN codes | `pincodes` | Address auto-fill |
| Bank accounts | Company profile | Proforma & tax invoice PDFs |
| Document templates | `documentTemplates` | PDF layout per doc type |
| Company profile | `company` | GSTIN, headers, E-Invoice |

**Default seeded payment terms:** 100% Advance; 50% Advance / 50% before dispatch; 30/45 Days Credit; Against Delivery

**Default seeded delivery terms:** Ex-Works, FOR Destination, Within 1/2/4 Weeks

Items, categories, taxes, and units are maintained in the **Inventory** module but are required for sales line entry.

---

## 8. Numbering

Document numbers use `store.nextNo()` with Admin-configurable **Number Series** (`VG.numberingEngine`).

| Document | Default prefix | Admin key |
|----------|----------------|-----------|
| Enquiry | ENQ | `enquiry` |
| Lead | LEAD | `lead` |
| Quotation | QT | `quotation` |
| Sales Order | SO | `salesOrder` |
| Proforma | PI | `proforma` |
| Tax Invoice | INV | `taxInvoice` |
| Shipment | SH | `dispatch` |
| Customer | CUST | `customer` |
| Work Order | WO | (Production module) |

Default pattern: **prefix + calendar year + zero-padded sequence** (yearly reset). Legacy slash formats are normalized on migration.

Configure under **Admin → Numbering Settings**.

---

## 9. Approvals and field permissions

### Built-in approval rules (Sales module)

| Type | Trigger | Queue page |
|------|---------|------------|
| Quotation discount | Discount > 10% | Discount Approval |
| SO revision | Edit after send-to-production | Revision Approval |
| Customer master | New customer without approver role | Customers (inline) |

### Admin approval workflows (seeded)

Configurable in Admin → Approvals:
- Quotation discount  
- Sales order  
- (Plus purchase, leave, vendor payment, etc.)

### Field permissions (Admin → Field Permissions)

Granular control per module: `quotation`, `proforma`, `salesOrder`, `customer`, etc.

**Default for Sales Executive on quotations:**
- `rate` — visible, not editable  
- `discountPct` — editable, approval required when over limit  

Enforced via `VG.fieldRule(roleKey, "quotation", field)`.

---

## 10. PDF, print, and email

| Document | Preview | Print | PDF | Email |
|----------|---------|-------|-----|-------|
| Quotation | ✓ | ✓ | ✓ | ✓ (mailto + marks Sent) |
| Sales Order | ✓ | ✓ | ✓ | — |
| Proforma | ✓ | ✓ | ✓ | — |
| Tax Invoice | ✓ | ✓ (multi-copy) | ✓ | — |
| Order History | ✓ timeline | ✓ | via print | — |
| Customer 360° | ✓ | ✓ statement | ✓ | ✓ statement |
| Reports | ✓ | ✓ | Save as PDF | — |

**Engine:** `printDocument` → `VG.printStyledDocument` with document templates from `doc-designer.jsx`.

**Quotation PDF:** Industrial international layout (`VG.buildIndustrialDocument` / premium commercial offer template).

**Invoice copies:** User selects copy types; each prints on a separate page.

**Email:** Quotation email opens the system mail client with subject/body; PDF is not auto-attached.

---

## 11. Reports

### Sales → Reports (12 reports)

| # | Report name |
|---|-------------|
| 1 | Quotation Register |
| 2 | Sales Order Register |
| 3 | Tax Invoice Register |
| 4 | Export Invoice Register |
| 5 | Currency-wise Sales Report |
| 6 | Exchange Rate Report |
| 7 | LUT-wise Export Report |
| 8 | Country-wise Export Sales |
| 9 | Customer-wise Export Sales |
| 10 | Foreign Currency Receivables |
| 11 | Won / Lost Analysis |
| 12 | Customer Master |

All reports include company header/footer. Requires **Print** permission.

### Enquiry reports (9 reports)

Available under Enquiries page and embedded in Sales → Reports:

| # | Report name |
|---|-------------|
| 1 | Enquiry status report |
| 2 | Offer sent report |
| 3 | Pending quotation report |
| 4 | Follow-up due report |
| 5 | Lost enquiry report |
| 6 | Won enquiry report |
| 7 | Salesperson-wise enquiry report |
| 8 | Customer-wise enquiry report |
| 9 | Product-wise enquiry report |

### List-level exports

- Most lists support **Print** via `RecordTable`  
- Customer 360° supports **Export Excel** (CSV), transaction summary PDF, statement PDF  

---

## 12. Cross-module integrations

### Production

- **Send to Production** creates a **Work Order** (`store.sendSalesOrderToProduction`)  
- SO stages sync with BOM, material issue, production progress, FG transfer  
- Revision approval updates linked work order  

### Inventory

- Items, HSN, units from Item Master  
- Price list floor rates on quotations  
- Material requirements and issues visible in Order Tracking drill-down  

### Quality

- SO stages: Sent to Quality → QC Pending → QC Accepted  
- QC acceptance can push dispatch queue → Ready for Dispatch  

### Dispatch

- **Shipments** module manages Pending → In-transit → Delivered  
- Sales creates shipment from SO; dispatch team completes delivery  
- Delivery updates SO to Partially/Fully Dispatched; full delivery writes **orderHistory**  
- Shipment prefix: **SH**; Dispatch Note / Gate Pass PDF  

### Accounts

- **Receivables** mirrors invoices + payment recording  
- `store.recordPayment` updates invoice Paid / Partially Paid  
- Customer 360° finance tiles require accounts permission  
- Receivables ageing report in Accounts module  

---

## 13. Roles and permissions

### Built-in sales roles

| Role | Module access | Notable actions |
|------|---------------|-----------------|
| **Sales Manager** | sales, enquiry, reports, documents | approve, delete, export, print |
| **Sales Executive** | sales, enquiry, documents | add, edit, export, print (no approve/delete) |
| **Viewer** | sales (read) | view, print only |

### Permission actions

View, Add, Edit, Delete, Approve, Reject, Print, Export/Download, Import, Email, Settings

Configured per role in **Admin → Permissions**.

---

## 14. Technical notes

- **Architecture:** Zero-build React + Tailwind (CDN/Babel); data in `VG.store` (PostgreSQL JSONB or localStorage fallback).  
- **UI pattern:** Full-page `InternalScreen` for forms; list pages use integrated `ListPage` + `RecordTable`.  
- **Customer scoping:** `VG.useFilteredCustomerRows` / `CustomerFilterBanner` on transactional lists.  
- **State linking:** Pending navigation flags (e.g. `VG._pendingQuotationFromEnquiry`, `VG._pendingSalesOrderCreate`) seed cross-section workflows.  
- **Quotation math:** `computeQuote()` handles line tax, charges, and round-off (auto/manual).  
- **Export invoices:** `VG.isExportInvoiceType`, LUT/Bond, incoterms, multi-currency FX totals in `invoice-export.jsx`.  

---

## Appendix A — Quotation lifecycle statuses (derived)

| Display status | Meaning |
|----------------|---------|
| Draft | Not yet submitted |
| Pending Approval | Awaiting discount approval |
| Approved | Ready to send/convert |
| Quote Sent | Marked sent / emailed |
| Proforma Issued | Linked proforma exists |
| Sales Order Generated | Linked SO exists |
| Tax Invoice Generated | Linked invoice exists |
| Dispatched | Linked shipment delivered/in transit |
| Won / Lost | Commercial outcome |

---

## Appendix B — Files changed most often for Sales features

```
src/sales.jsx          — Main module (quotations, SO, invoices, tracking, reports)
src/enquiry.jsx        — Enquiry CRM
src/customer.jsx       — Customer master & 360°
src/doc-conversion.jsx — Conversion confirmation UX
src/doc-designer.jsx   — PDF templates & print engine
src/invoice-export.jsx — Export invoice types & GST treatment
src/dispatch.jsx       — Shipments (downstream of SO)
src/accounts.jsx       — Receivables & payments
src/store.jsx          — Data APIs, numbering, SO stage sync, conversions
```

---

*End of document.*
