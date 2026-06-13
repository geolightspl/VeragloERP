# Veraglo ERP — Module-wise Features List

**Document version:** 1.0  
**As of:** June 2026  
**Product:** Veraglo ERP (manufacturing enterprise workspace)  
**Download:** `/docs/ERP-MODULE-FEATURES.md` · `/docs/ERP-MODULE-FEATURES.csv`

---

## Platform-wide features

| Area | Features |
|------|----------|
| **Authentication** | Email/password login, first-time admin setup (once only), forgot password (OTP/link), session timeout, failed-login lockout, auth repair |
| **Access control** | Role-based modules, action permissions (view/add/edit/delete/approve/export/print), field permissions, section-level access |
| **Workspace** | Module launcher, collapsible sidebar, universal search, light/dark theme, per-module accent, mobile/PWA support |
| **Data** | PostgreSQL JSONB document store (or local file mode), localStorage cache, backup & restore, snapshots, audit trail |
| **Documents** | PDF preview/print, email share, document templates, company header/footer on prints |
| **Numbering** | Configurable document number series, SKU auto-numbering, master codes |
| **Workflow** | Sales Order → Production → Quality → Dispatch → Invoice; PR → PO → GRN → Inventory |
| **Integrations** | Customer portal (quotation share), SMTP/SMS notifications, Open-Meteo login weather theme |

---

## 1. Sales & CRM (`sales`)

| Section | Key features |
|---------|----------------|
| **Dashboard** | KPIs, work queues, pending approvals, follow-up alerts, SO revision queue |
| **Customers** | Customer master (7 tabs), Customer 360°, duplicate detection, GSTIN/PAN validation, PIN auto-fill, approval workflow |
| **Enquiries** | Sales/purchase enquiries, assignment, timeline, technical lines, convert to quotation |
| **Leads** | Lead register, stages, estimated value, convert to customer/quotation |
| **Follow-ups** | Due/overdue alerts, modes (call/email/visit), link to enquiry/lead |
| **Comm. Center** | Unified inbox, email compose (SMTP), WhatsApp links, activity log |
| **Communication** | Customer communication history |
| **Approval Center** | Quotation discount approvals, SO revision approvals |
| **Quotations** | Multi-line builder, clause library, discount/tax, PDF/email, portal share, convert to SO |
| **Proforma Invoice** | From quotation/SO, PDF, linked to sales pipeline |
| **Tax Invoices** | Domestic/export types, GST treatment, e-invoice/e-way fields, multi-copy print, from SO |
| **Sales Orders** | Full builder, revision control (mandatory reason), revision history, push to production, stage workflow |
| **Order Tracking** | Live SO stage pipeline |
| **Order History** | Completed/cancelled order archive |
| **Discount Approval** | Pending discount queue |
| **Revision Approval** | SO revisions after production push |
| **Price List** | Item rates by customer/category |
| **Currencies** | Multi-currency master, exchange rates |
| **PIN Codes** | India PIN master with auto-fill |
| **AI Intelligence** | Order planning suggestions, delivery/customer risk |
| **Analytics** | Funnel, win/loss, territory, export analytics |
| **Forecasting** | Revenue forecast, profitability view |
| **Reports** | Sales registers, enquiry analytics, export |

> Detailed sales reference: [SALES-MODULE-FEATURES.md](./SALES-MODULE-FEATURES.md)

---

## 2. Enquiry & Follow-up (`enquiry`)

| Section | Key features |
|---------|----------------|
| **Overview** | Enquiry KPIs and pipeline (launcher module; enquiry UI also under Sales) |
| **Capture** | RFQ logging, contact/project fields, priority, offer due dates |
| **Follow-up** | Scheduled callbacks, overdue tracking |
| **Conversion** | Enquiry → quotation/lead |

---

## 3. Inventory Management (`inventory`)

| Section | Key features |
|---------|----------------|
| **Dashboard** | Stock value, low-stock alerts, movement summary |
| **Item Master** | SKU engine, manufacturer/part duplicate check, categories, HSN, reorder levels |
| **Material Receipt** | GRN posting, stock ledger update, batch/lot |
| **Material Issue** | Issue to production/WO, ledger posting |
| **Material Requirement** | WO-linked requirements, shortage view |
| **Stock Ledger** | Full movement history, on-hand derivation |
| **Returnable Challan** | Vendor returnable issue |
| **Non-Returnable Challan** | Consumable issue |
| **Manufacturers** | Manufacturer master |
| **Bill of Materials** | BOM register, revision, explode for MRP |
| **Categories** | Item category tree |
| **Supplier Master** | Vendor records (shared with purchase) |
| **Storage Locations** | Warehouse/location master |
| **Item Locations** | Bin/shelf mapping |
| **Stock Transfer** | Inter-location transfer |
| **Returns** | Customer/vendor returns |
| **Scrap / Rejection** | Scrap posting |
| **Opening Balance** | Opening stock entry |
| **Physical Verification** | Cycle count, variance adjustment |
| **Stock Alerts** | Below reorder, critical, overstock |
| **Batch / Lot** | Batch traceability |
| **Reports** | Stock registers, valuation, movement |

---

## 4. Purchase Management (`purchase`)

| Section | Key features |
|---------|----------------|
| **Dashboard** | Open POs, PR pending, spend MTD |
| **Vendor Master** | Supplier onboarding, GST, contacts |
| **Purchase Request** | Internal requisition, approval |
| **RFQ** | Request for quotation to vendors |
| **Vendor Quotations** | Quote entry and comparison |
| **Vendor Comparison** | Side-by-side quote analysis |
| **Purchase Order** | PO builder, terms, linked to PR/RFQ |
| **GRN / Receipt** | Goods receipt, stock posting |
| **Vendor Bills** | AP invoice entry |
| **Vendor Ledger** | Outstanding, payment history |
| **Approvals** | PR/PO approval queue |
| **Reports** | PO register, vendor spend |

---

## 5. Supplier Management (`supplier`)

| Section | Key features |
|---------|----------------|
| **Overview** | Vendor ratings, contracts (launcher/dashboard module) |
| **Vendor data** | Shared with Purchase → Vendor Master |
| **Ratings & contracts** | Supplier performance tracking (dashboard KPIs) |

---

## 6. Production Planning (`production`)

| Section | Key features |
|---------|----------------|
| **Dashboard** | Active WOs, updated revision alerts, material queues |
| **Work Orders** | Full-width WO preview (7 sections), SO→WO link, revision sync, accept revision |
| **Shop Floor** | Line-wise WO status, progress bars |
| **BOM Register** | BOM selection, WO-specific BOM, revision |
| **Material Requirements** | MRP explode, plan materials for WO |
| **WO Material Control** | Issue status, shortages, alternate materials |
| **Reports** | WO register, active production |

**Work order preview sections:** Header · Product · Technical · Special notes · Material status · Revision summary · Actions (print/PDF/Excel)

**SO → WO revision:** Mandatory SO revision reason · Push Updated Revision to Production · Production notification · WO revision history

---

## 7. Quality Control (`quality`)

| Section | Key features |
|---------|----------------|
| **Dashboard** | Open inspections, NCR count, yield KPIs |
| **Incoming Inspection** | GRN-linked QC |
| **Production Inspection** | In-process QC |
| **Final QC** | Finished goods inspection before dispatch |
| **Rejection (NCR)** | Non-conformance register, root cause |
| **QC Reports** | Inspection registers |

---

## 8. Dispatch & Logistics (`dispatch`)

| Section | Key features |
|---------|----------------|
| **Dashboard** | Open shipments, in-transit, OTD |
| **Shipments** | Create from SO, delivery challan, status |
| **Delivery** | POD, delivery tracking |
| **Reports** | Shipment register |

---

## 9. Accounts & Finance (`accounts`)

| Section | Key features |
|---------|----------------|
| **Dashboard** | Receivables, overdue, cash position |
| **Receivables** | Customer outstanding, invoice aging |
| **Payments** | Payment receipt against invoices |
| **Reports** | AR registers |

---

## 10. HR & Payroll (`hr`)

| Section | Key features |
|---------|----------------|
| **Dashboard** | Headcount, payroll MTD, leave pending |
| **Employees** | Employee master, department, CTC, documents |
| **Leave** | Leave application, approval workflow |
| **Attendance** | Monthly attendance (linked module) |
| **Payroll** | Payroll run, salary slips |
| **Self-Service** | Employee self-service portal |
| **Reports** | HR registers |

---

## 11. Attendance (`attendance`)

| Section | Key features |
|---------|----------------|
| **Dashboard** | Present today, leave, late marks |
| **Monthly Register** | Present/leave/absent/OT per employee |
| **Reports** | Register print/export |

---

## 12. Reports & Analytics (`reports`)

| Section | Key features |
|---------|----------------|
| **Overview** | Cross-module KPI dashboard (launcher module) |
| **Saved reports** | Report builder concept (dashboard) |
| **Exports** | Module-level CSV/PDF exports |

---

## 13. Customer Support (`support`)

| Section | Key features |
|---------|----------------|
| **Overview** | Ticket KPIs, SLA, CSAT (launcher/dashboard module) |
| **Tickets** | Support ticket workflow (dashboard prototype) |

---

## 14. Document Management (`documents`)

| Section | Key features |
|---------|----------------|
| **Overview** | Document library KPIs (launcher module) |
| **Templates** | Admin → Document Templates, PDF layouts |
| **Designer** | Visual document template designer |

---

## 15. Admin Control Panel (`admin`)

| Section | Key features |
|---------|----------------|
| **Dashboard** | System KPIs, connected users |
| **System Health** | API/DB status, storage mode |
| **Reports** | Audit, login activity, permission matrix, **ERP features download** |
| **Company Profile** | Legal entity, GSTIN, logo, addresses |
| **Locations** | Plants, warehouses |
| **Users** | ERP login accounts, password reset, sessions, login history |
| **Roles** | Custom roles, module access, actions |
| **Permissions** | Module × action matrix |
| **Field Permissions** | Field-level edit restrictions |
| **Approvals** | Workflow configuration |
| **Master Data** | Central master hub |
| **Import / Export** | Master data JSON import/export |
| **Document Templates** | Template management |
| **Numbering Settings** | Document series |
| **SKU Numbering** | SKU pattern rules |
| **Security** | Password policy, session timeout, forgot password, **auth repair** |
| **Date Format** | Regional date display |
| **Notifications** | SMTP, SMS, alert toggles |
| **Typography** | Fonts, sizes, density |
| **Theme** | Accent color, default mode |
| **Login Weather** | Open-Meteo weather on login screen |
| **Backup & Restore** | Snapshots, restore, cloud backup settings |
| **Audit Trail** | Permanent change log |
| **Licensing** | Trial, activation, renew, transfer, data path |
| **Connected Users** | Live session monitor |

---

## Cross-module workflows

| Workflow | Steps |
|----------|-------|
| **Quote to cash** | Enquiry → Quotation → SO → Proforma → Production → QC → Dispatch → Tax Invoice → Payment |
| **Procure to stock** | PR → RFQ → Vendor quote → PO → GRN → Stock ledger |
| **SO revision → WO** | SO edit (revision reason) → Approval → Push Updated Revision → Production accept |
| **Leave to payroll** | Leave request → HR approval → Payroll run → Salary slip |

---

## Role-based access (summary)

| Role | Primary modules |
|------|----------------|
| Administrator | All 15 modules |
| Sales Team | Sales, Enquiry, Reports, Documents, Support |
| Inventory Manager | Inventory, Purchase, Supplier, Reports |
| Production Team | Production, Inventory, Quality |
| Quality Control | Quality, Production |
| Accounts | Accounts, Purchase |
| Dispatch | Dispatch, Inventory |
| HR Manager | HR, Attendance |
| Employee | Attendance, Support, Documents |

Actions: `view` · `add` · `edit` · `delete` · `approve` · `export` · `print`

---

## Document index

| Document | Path |
|----------|------|
| This features list (Markdown) | `docs/ERP-MODULE-FEATURES.md` |
| Features list (CSV) | `docs/ERP-MODULE-FEATURES.csv` |
| Sales module detail | `docs/SALES-MODULE-FEATURES.md` |
| Sales roadmap | `docs/SALES-MODULE-ROADMAP.md` |
| Database | `docs/DATABASE.md` |
| AWS deploy | `docs/AWS-DEPLOY.md` |

---

*Generated from Veraglo ERP codebase — module sections registered in `src/*.jsx` and `src/data.jsx`.*
