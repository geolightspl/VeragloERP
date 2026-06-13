# Veraglo ERP — Sales Module Enhancement Roadmap

**Document version:** 1.0  
**As of:** June 2026  
**Status:** Phase 3 complete (June 2026)  
**Related:** [SALES-MODULE-FEATURES.md](./SALES-MODULE-FEATURES.md) (current implemented features)

---

## Executive summary

The Sales module already has a **strong foundation**: full quote-to-cash lifecycle, cross-module sync (Production, Inventory, QC, Dispatch, Accounts), document conversion pipeline, approvals, and extensive reporting.

The primary gap is not core business logic — it is **UX refinement, automation, analytics, and enterprise polish** to make the product commercially deployable at scale.

This roadmap prioritizes enhancements in three phases.

---

## Architectural observation

| Strength (already built) | Gap (to address) |
|--------------------------|------------------|
| Proper lifecycle logic | Workflow simplification |
| Strong document flow | Executive-grade UX |
| Integrated operations | Automation |
| Cross-module synchronization | Real-time analytics |
| Mid-sized ERP feature depth | Scalability & polish |

**Conclusion:** Enhance rather than rebuild.

---

## 1. UI/UX modernization

**Current state:** Feature-rich; forms and lists are functional but dense.

**Recommended:**

| Enhancement | Benefit |
|-------------|---------|
| Sticky action bar in all forms | Save / Preview / Print always visible |
| Left-side workflow navigation | Clear step-through on long forms |
| Timeline-style document history | Audit-friendly visual trail |
| Smart dashboard cards | Actionable KPIs, not static counts |
| Mobile-responsive layouts | Field sales / director mobile access |
| Collapsible sections | Reduce form overwhelm |
| Faster line-item editing | Tabular inline edit, bulk paste |
| Global command/search palette | Power-user navigation (Cmd+K) |
| Dark/light mode support | User preference (partially via Admin theme) |
| KPI graphs on dashboard | Trend visibility |

**Priority:** Phase 1

---

## 2. Customer 360° enhancement

**Current state:** Customer 360° aggregates enquiries, quotes, SOs, invoices, shipments, payments, follow-ups.

**Add:**

- Outstanding receivables widget  
- Customer profitability  
- Repeat order frequency  
- Last interaction summary  
- Open complaints / service tickets  
- Payment behavior score  
- Customer risk rating  
- Geographic sales heatmap  
- Top-selling products for customer  
- Export/import history  

**Priority:** Phase 2 (widgets); Phase 3 (profitability / risk scoring)

---

## 3. Quotation system improvements

**Current state:** Full quotation builder, discount approval (>10%), PDF, email, conversion workflow.

**Recommended (world-class target):**

| Feature | Notes |
|---------|--------|
| Multiple quotation templates | Aligns with Document Template Manager |
| Drag-drop sections | Layout flexibility |
| Saved reusable clauses | T&C, warranty, scope blocks |
| Auto recommendation pricing | Price list + floor rate (partial today) |
| Margin visibility | Cost vs sell (needs item cost data) |
| Competitor pricing notes | CRM field on quote |
| Internal approval comments | Thread on discount approval |
| Digital signature support | Enterprise gap — see § Missing features |
| Version comparison | Revision history exists; add diff UI |
| “Client viewed quotation” tracking | Portal or link tracking |
| WhatsApp quotation sharing | See Communication § |
| Auto expiry reminders | Background jobs |

**Priority:** Phase 1 (templates, clauses, margin); Phase 2 (signatures, tracking)

---

## 4. Sales order intelligence

**Current state:** 22-stage ORDER_FLOW; manual advance; production/QC/dispatch auto-updates.

**Add:**

- Automatic delivery risk prediction  
- Material shortage alerts (partial via inventory)  
- Estimated dispatch date engine  
- Production bottleneck indicators  
- Priority-based scheduling  
- AI-assisted order planning  
- Order dependency graph  
- Delay escalation system  

**Priority:** Phase 2 (alerts, EDD); Phase 3 (AI planning)

---

## 5. Approval workflow engine enhancement

**Current state:** Quotation discount approval, SO revision approval, customer pending approval; Admin seeded workflows.

**Upgrade to:**

- Multi-level approval matrix  
- Amount-based approval hierarchy  
- Role-based escalation  
- Email / WhatsApp notifications  
- Approval audit trails (partial via `auditLog`)  
- Parallel approvals  
- Delegated approvals  
- Temporary authority assignment  

**Priority:** Phase 2

---

## 6. Communication system enhancement

**Current state:** Communication log (create-only); follow-ups; quotation email via `mailto:`.

**Convert into unified communication center:**

- Email integration (SMTP — server scaffold exists)  
- WhatsApp API integration  
- Call logging  
- Reminder automation  
- Follow-up scheduler (partial)  
- Meeting calendar sync  
- Document sharing history  

**Priority:** Phase 2 (High — see missing features table)

---

## 7. Reporting & analytics modernization

**Current state:** 12 sales reports + 9 enquiry reports (print/PDF tables).

**Add:**

- Real-time charts  
- Monthly / quarterly comparison  
- Sales forecasting  
- Funnel analysis  
- Win/loss reason analytics  
- Territory performance  
- Product profitability  
- Executive dashboards  
- Export trends  
- Currency exposure analytics  

**Priority:** Phase 2 (charts, funnel); Phase 3 (forecasting)

---

## 8. Document engine enhancement

**Current state:** `doc-designer.jsx`, `doc-template-designer.jsx`, per-type templates, premium quotation layout.

**Target architecture (aligns with prior Document Template redesign spec):**

| Capability | Status |
|------------|--------|
| Single centralized Document Template Manager | Planned / partially specified |
| Left-side document list | Specified |
| Template dropdown selector | Specified |
| Save template by name | Specified |
| Template categories | Specified |
| Default template assignment per doc type | Specified |
| Live preview editor | Exists in Advanced Designer |
| Header/footer builder | Exists in Advanced Designer |
| Drag-drop document designer | Future |
| QR code embedding | Exists |
| Watermark support | Exists |

**Priority:** Phase 1 (centralized manager + per-type defaults)

---

## 9. Master data intelligence

**Current state:** Centralized masters; SKU engine; duplicate item detection; PIN auto-fill; price list.

**Add:**

- Auto SKU intelligence (partial — `sku-engine.jsx`)  
- Duplicate detection (customers — partial)  
- Smart customer merge  
- GST verification APIs  
- PIN auto-fetch (exists)  
- Price revision history  
- Customer category automation  
- Item recommendation engine  

**Priority:** Phase 2

---

## 10. Automation features (high priority)

| Automation | Trigger |
|------------|---------|
| Auto-create follow-ups | Enquiry status change |
| Auto reminder emails | Overdue follow-up / quote expiry |
| Auto overdue escalation | Approval / payment / dispatch delay |
| Auto quotation numbering rules | Exists — extend rules engine |
| Auto stage movement | Partial — production integration |
| Auto dispatch alerts | SO ready for dispatch |
| Auto payment reminders | Invoice due |
| Auto repeat-order reminders | Customer order cycle |

**Requires:** Background job queue, notification service (§12).

**Priority:** Phase 2

---

## 11. Executive features for directors

| Feature | Audience |
|---------|----------|
| Director dashboard | Board / MD |
| Company-wide KPI board | Leadership |
| Approval center | All approvers |
| Live order status | Operations |
| High-value order alerts | Finance / Sales head |
| Delay alerts | Production / Dispatch |
| Cash-flow visibility | Accounts |
| Export/import summaries | Compliance |
| Top customers / products | Strategy |
| Pending approval snapshots | Daily stand-up |

**Priority:** Phase 1 (dashboard); Phase 2 (approval center, alerts)

---

## 12. Technical architecture improvements

| Area | Current | Target |
|------|---------|--------|
| API layer | Express REST + JSONB document store | Normalized APIs + optional Java backend |
| PostgreSQL | JSONB `erp_state` blob | Gradual normalization (`java-backend/` migration path) |
| Audit logs | `auditLog` collection | Every critical action |
| Background jobs | None | Queue (Bull / cron) |
| Notification service | Toast + optional SMTP | Central notification center |
| WebSocket live updates | None | Order stage / approval push |
| Backup & restore | Admin backup page | Scheduled + cloud |
| Activity tracking | Partial | User session activity |
| Soft delete + recovery | Partial on users | All masters |
| Attachment storage | Inline/base64 | Object storage (S3/local vault) |

**Priority:** Phase 2–3 (foundation for automation & comms)

---

## Most important missing enterprise features

| Missing feature | Priority | Notes |
|-----------------|----------|--------|
| WhatsApp integration | **High** | Quotation / follow-up / approval alerts |
| Email SMTP integration | **High** | `server/mail.js` exists; needs Admin UI wiring |
| Digital signatures | **High** | Quotes, SO, invoices |
| Audit trail | **High** | Expand coverage + UI viewer |
| Multi-company support | **High** | Tenant / company switcher |
| Role hierarchy | **High** | Partial — `customRoles` + permissions |
| Notification center | **High** | In-app bell + history |
| Advanced search/filter engine | **High** | `search.jsx` — extend globally |
| Dashboard analytics | **High** | Charts beyond KPI tiles |
| Customer portal | Medium | View quote / PO / invoice |
| Vendor/customer document vault | Medium | Secure file store |
| Mobile app support | Medium | Responsive web first, then PWA/native |

---

## Implementation phases

### Phase 1 — Immediate (limited resources) — **COMPLETE**

1. **UI modernization** — sticky action bar on forms, collapsible sections on quotation builder  
2. **Document template redesign** — centralized split-panel manager, Standard ERP Template, per-doc-type save, print template picker  
3. **Quotation improvements** — reusable clause library, margin % per line and summary, template-aware PDF  
4. **Dashboard enhancements** — real monthly bar charts (quotations, SOs, invoices) on Sales dashboard  

**Outcome:** Faster daily use for sales team; professional documents.

### Phase 2 — Automation & intelligence — **COMPLETE**

1. **Approval engine** — `src/approval-engine.jsx`; multi-level workflows, amount thresholds, audit trail, Approval Center  
2. **Communication center** — `src/communication-center.jsx`; unified inbox, `POST /api/notifications/send`, WhatsApp (`wa.me`)  
3. **Analytics** — `src/sales-analytics.jsx`; funnel, win/loss, territory, export trends, CSV export  
4. **Automation engine** — `store.runSalesAutomation()`; follow-up reminders, stale quote alerts, quote expiry, escalation  

**Outcome:** Less manual follow-up; management visibility.

### Phase 3 — Scale & productization — **COMPLETE**

1. **AI intelligence** — `src/sales-intelligence.jsx`; order planning queue, delivery risk, customer risk radar  
2. **Predictive analytics** — `src/sales-forecasting.jsx`; 3-month revenue forecast, customer & product profitability  
3. **Mobile / PWA** — `manifest.webmanifest`, `sw.js`, touch-friendly CSS, installable app shell  
4. **Customer portal** — `portal.html`, `src/customer-portal.jsx`, `GET /api/portal/quote/:token`; share link from quotation, view tracking  

**Outcome:** Commercially deployable multi-tenant ERP.

---

## Mapping to existing codebase

| Roadmap item | Primary files |
|--------------|----------------|
| Sales UI | `src/sales.jsx`, `src/forms.jsx`, `src/screen-nav.jsx` |
| Customer 360° | `src/customer.jsx` |
| Enquiry / CRM | `src/enquiry.jsx` |
| Documents / PDF | `src/doc-designer.jsx`, `src/doc-template-designer.jsx` |
| Approvals | `src/sales.jsx`, `src/store.jsx`, `src/admin.jsx` |
| Communications | `src/sales.jsx`, `server/mail.js`, `server/sms.js` |
| Reports | `src/sales.jsx`, `src/enquiry.jsx` |
| Dashboard | `src/module-dashboard.jsx`, `src/welcome-home.jsx` |
| Numbering | `src/numbering-engine.jsx` |
| Permissions | `src/admin-permissions.jsx`, `src/store.jsx` |
| Dispatch / SO sync | `src/dispatch.jsx`, `src/store.jsx` |
| Accounts / receivables | `src/accounts.jsx` |

---

## Success criteria (product readiness)

- [ ] New user can create enquiry → quotation → SO → invoice without training docs  
- [ ] Director sees company KPIs and pending approvals in one screen  
- [ ] All document types use consistent templates from one admin screen  
- [ ] Critical actions write to searchable audit trail  
- [ ] Overdue items trigger in-app + email (optional WhatsApp) notifications  
- [x] Mobile browser usable for approvals and order status (PWA + touch targets)  
- [ ] Export sales compliance reports without manual Excel work  

---

## Document history

| Version | Date | Change |
|---------|------|--------|
| 1.0 | June 2026 | Initial roadmap from enhancement review |
| 1.1 | June 2026 | Phase 1 & 2 marked complete |
| 1.2 | June 2026 | Phase 3 marked complete |

---

*This is a planning document. For implemented features today, see [SALES-MODULE-FEATURES.md](./SALES-MODULE-FEATURES.md).*
