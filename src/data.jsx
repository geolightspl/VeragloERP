/* Veraglo ERP — data layer: modules, RBAC roles, and per-module dashboard content.
   Everything shared lives on the global window.VG namespace so the other
   babel scripts (ui / modules / app) can read it without a bundler. */
window.VG = window.VG || {};

(function (VG) {
  /* ---------- Action verbs used for action-level RBAC ---------- */
  VG.ACTIONS = ["view", "add", "edit", "delete", "approve", "export", "print"];

  /* ---------- Modules ---------- */
  // Each module is a self-contained "product": accent color, icon, internal
  // tabs, and rich sample widgets so every operator feels they have a dedicated app.
  /** Business-priority order for post-login module home (frequently used modules first). */
  VG.MODULE_HOME_ORDER = [
    "sales", "enquiry", "inventory", "production", "purchase", "supplier",
    "quality", "dispatch", "accounts", "hr", "attendance", "reports",
    "documents", "support", "admin",
  ];

  VG.MODULES = [
    {
      id: "sales",
      name: "Sales & CRM",
      tagline: "Pipeline, customers & orders",
      icon: "trending",
      accent: "#6366f1",
      category: "Commercial",
      tabs: ["Overview", "Pipeline", "Customers", "Orders", "Reports", "Analytics"],
      kpis: [
        { label: "Open Pipeline", value: "₹2.41 Cr", delta: "+12.4%", trend: "up" },
        { label: "Orders (MTD)", value: "184", delta: "+8.1%", trend: "up" },
        { label: "Win Rate", value: "37%", delta: "+3.2%", trend: "up" },
        { label: "Avg. Deal", value: "₹1.31 L", delta: "-1.4%", trend: "down" },
      ],
      series: [42, 55, 48, 67, 72, 65, 84, 92, 88, 101, 96, 118],
      donut: [
        { label: "Qualified", value: 38, color: "#6366f1" },
        { label: "Proposal", value: 27, color: "#22d3ee" },
        { label: "Negotiation", value: 21, color: "#f59e0b" },
        { label: "Won", value: 14, color: "#34d399" },
      ],
      tasks: [
        { t: "Send revised quote to Larsen Infra", due: "Today", p: "high" },
        { t: "Follow-up call — Tata Projects", due: "Today", p: "med" },
        { t: "Renewal: Adani Facilities", due: "Tomorrow", p: "med" },
      ],
      approvals: [
        { t: "Discount 18% — Order #SO-2291", who: "R. Kapoor", amt: "₹4.8 L" },
        { t: "Credit terms 45d — Bharat Heavy", who: "S. Nair", amt: "₹12.0 L" },
      ],
      activities: [
        "Order SO-2290 confirmed for Reliance Retail",
        "New lead captured from website — Godrej",
        "Quote QT-1184 viewed by client",
      ],
      shortcuts: ["New Lead", "Create Quote", "Log Call", "New Order"],
      workflow: ["Sales Order", "Production", "Quality", "Dispatch", "Invoice"],
      entry: { title: "Quick Lead", fields: ["Company", "Contact person", "Est. value (₹)", "Source"] },
    },
    {
      id: "enquiry",
      name: "Enquiry & Follow-up",
      tagline: "Capture & nurture interest",
      icon: "inbox",
      accent: "#0ea5e9",
      category: "Commercial",
      tabs: ["Overview", "New Enquiries", "Follow-ups", "Converted", "Reports", "Analytics"],
      kpis: [
        { label: "New Enquiries", value: "63", delta: "+19%", trend: "up" },
        { label: "Due Follow-ups", value: "27", delta: "+5", trend: "up" },
        { label: "Conversion", value: "22%", delta: "+1.8%", trend: "up" },
        { label: "Avg. Response", value: "3.4h", delta: "-0.6h", trend: "up" },
      ],
      series: [12, 18, 15, 22, 28, 24, 31, 26, 35, 30, 38, 41],
      donut: [
        { label: "Web", value: 44, color: "#0ea5e9" },
        { label: "Referral", value: 26, color: "#34d399" },
        { label: "Exhibition", value: 18, color: "#f59e0b" },
        { label: "Cold", value: 12, color: "#a78bfa" },
      ],
      tasks: [
        { t: "Call back — Mahindra CIE", due: "Today", p: "high" },
        { t: "Email brochure — JSW Steel", due: "Today", p: "med" },
        { t: "Schedule demo — Ashok Leyland", due: "Tomorrow", p: "low" },
      ],
      approvals: [{ t: "Assign enquiry batch to South region", who: "Auto-router", amt: "12 leads" }],
      activities: ["Enquiry EQ-882 marked qualified", "5 enquiries auto-assigned to Sales", "Follow-up reminder sent"],
      shortcuts: ["New Enquiry", "Schedule Follow-up", "Convert to Lead", "Bulk Assign"],
      entry: { title: "Log Enquiry", fields: ["Name", "Phone", "Interested in", "Source"] },
    },
    {
      id: "inventory",
      name: "Inventory Management",
      tagline: "Stock, movement & alerts",
      icon: "box",
      accent: "#10b981",
      category: "Operations",
      tabs: ["Overview", "Stock", "Movements", "Stock Alerts", "Reports", "Analytics"],
      kpis: [
        { label: "SKUs", value: "1,842", delta: "+24", trend: "up" },
        { label: "Stock Value", value: "₹8.6 Cr", delta: "+2.1%", trend: "up" },
        { label: "Low-stock Items", value: "37", delta: "+6", trend: "down" },
        { label: "Turnover", value: "5.8x", delta: "+0.3x", trend: "up" },
      ],
      series: [88, 84, 86, 80, 78, 82, 76, 74, 79, 72, 70, 73],
      donut: [
        { label: "Raw Material", value: 46, color: "#10b981" },
        { label: "WIP", value: 22, color: "#f59e0b" },
        { label: "Finished", value: 24, color: "#6366f1" },
        { label: "Spares", value: 8, color: "#f472b6" },
      ],
      tasks: [
        { t: "Reorder: LED Driver 36W (below ROL)", due: "Today", p: "high" },
        { t: "Cycle count — Aisle B3", due: "Today", p: "med" },
        { t: "Quarantine batch #B-7741", due: "Tomorrow", p: "high" },
      ],
      approvals: [{ t: "Stock write-off — damaged housings", who: "Store Mgr", amt: "₹62,400" }],
      activities: ["GRN-5521 posted (Supplier: Syska)", "Stock transfer to Plant-2", "Low-stock alert: Heat Sink 50W"],
      shortcuts: ["Add Item", "Stock In", "Stock Out", "Adjust"],
      alerts: ["37 items below reorder level", "2 batches near expiry"],
      entry: { title: "Stock Adjustment", fields: ["SKU", "Quantity", "Reason", "Location"] },
    },
    {
      id: "purchase",
      name: "Purchase Management",
      tagline: "Requisitions to POs",
      icon: "cart",
      accent: "#f59e0b",
      category: "Operations",
      tabs: ["Overview", "Requisitions", "Purchase Orders", "Approvals", "Reports", "Analytics"],
      kpis: [
        { label: "Open POs", value: "92", delta: "+7", trend: "up" },
        { label: "PR Pending", value: "18", delta: "+3", trend: "down" },
        { label: "Spend (MTD)", value: "₹1.74 Cr", delta: "+4.5%", trend: "up" },
        { label: "On-time GRN", value: "94%", delta: "+1.1%", trend: "up" },
      ],
      series: [60, 72, 65, 80, 74, 88, 95, 90, 102, 98, 110, 121],
      donut: [
        { label: "Raw Material", value: 52, color: "#f59e0b" },
        { label: "Packaging", value: 18, color: "#22d3ee" },
        { label: "Services", value: 16, color: "#a78bfa" },
        { label: "Capex", value: 14, color: "#34d399" },
      ],
      tasks: [
        { t: "Approve PR-3391 (Aluminium)", due: "Today", p: "high" },
        { t: "Float RFQ — packaging vendors", due: "Today", p: "med" },
        { t: "3-way match PO-8810", due: "Tomorrow", p: "med" },
      ],
      approvals: [
        { t: "PO-8841 capital purchase", who: "Plant Head", amt: "₹9.2 L" },
        { t: "PR-3391 raw material", who: "Store Mgr", amt: "₹3.6 L" },
      ],
      activities: ["PO-8839 sent to supplier", "PR-3380 approved", "Vendor quote received: Havells"],
      shortcuts: ["New Requisition", "Create PO", "Compare Quotes", "GRN"],
      workflow: ["Purchase Request", "Approval", "Supplier", "Inventory"],
      entry: { title: "New Requisition", fields: ["Item", "Quantity", "Required by", "Justification"] },
    },
    {
      id: "supplier",
      name: "Supplier Management",
      tagline: "Vendors, ratings & contracts",
      icon: "handshake",
      accent: "#14b8a6",
      category: "Operations",
      tabs: ["Overview", "Suppliers", "Ratings", "Contracts", "Reports", "Analytics"],
      kpis: [
        { label: "Active Vendors", value: "318", delta: "+11", trend: "up" },
        { label: "Avg. Rating", value: "4.3", delta: "+0.2", trend: "up" },
        { label: "Contracts Due", value: "9", delta: "+2", trend: "down" },
        { label: "Blacklisted", value: "4", delta: "0", trend: "flat" },
      ],
      series: [4.0, 4.1, 4.0, 4.2, 4.1, 4.2, 4.3, 4.2, 4.3, 4.4, 4.3, 4.3],
      donut: [
        { label: "A-grade", value: 41, color: "#14b8a6" },
        { label: "B-grade", value: 34, color: "#6366f1" },
        { label: "C-grade", value: 18, color: "#f59e0b" },
        { label: "Watch", value: 7, color: "#ef4444" },
      ],
      tasks: [
        { t: "Renew contract — Syska Lighting", due: "This week", p: "med" },
        { t: "Vendor audit — Plant safety gear", due: "Today", p: "high" },
        { t: "Update GST docs — 6 vendors", due: "Tomorrow", p: "low" },
      ],
      approvals: [{ t: "Onboard new supplier — Wipro Lighting", who: "Procurement", amt: "Tier-2" }],
      activities: ["Rating updated: Bajaj +0.3", "Contract signed: Crompton", "KYC verified: 3 vendors"],
      shortcuts: ["Add Supplier", "Rate Vendor", "New Contract", "Compare"],
      entry: { title: "Onboard Supplier", fields: ["Company", "GSTIN", "Category", "Contact"] },
    },
    {
      id: "production",
      name: "Production Planning",
      tagline: "Work orders & shop floor",
      icon: "factory",
      accent: "#ef4444",
      category: "Manufacturing",
      tabs: ["Overview", "Work Orders", "Schedule", "Shop Floor", "Reports", "Analytics"],
      kpis: [
        { label: "Active WOs", value: "47", delta: "+5", trend: "up" },
        { label: "OEE", value: "82%", delta: "+2.4%", trend: "up" },
        { label: "Output (units)", value: "12,940", delta: "+6.7%", trend: "up" },
        { label: "Downtime", value: "3.1%", delta: "-0.5%", trend: "up" },
      ],
      series: [70, 74, 72, 78, 81, 79, 84, 82, 86, 83, 88, 90],
      donut: [
        { label: "Running", value: 58, color: "#34d399" },
        { label: "Setup", value: 16, color: "#f59e0b" },
        { label: "Idle", value: 14, color: "#94a3b8" },
        { label: "Breakdown", value: 12, color: "#ef4444" },
      ],
      tasks: [
        { t: "Release WO-1192 to Line 2", due: "Today", p: "high" },
        { t: "Maintenance window — CNC-04", due: "Today", p: "med" },
        { t: "Material staging for WO-1195", due: "Tomorrow", p: "med" },
      ],
      approvals: [{ t: "Overtime shift — Line 3", who: "Shift In-charge", amt: "8 ops" }],
      activities: ["WO-1188 completed (2,400 units)", "Line 1 changeover done", "Scrap logged: 1.8%"],
      shortcuts: ["New Work Order", "Schedule", "Log Output", "Report Downtime"],
      workflow: ["Sales Order", "Production", "Quality", "Dispatch", "Invoice"],
      status: [
        { line: "Line 1 — Drivers", pct: 88, state: "Running" },
        { line: "Line 2 — Assembly", pct: 64, state: "Running" },
        { line: "Line 3 — Packing", pct: 0, state: "Setup" },
      ],
      entry: { title: "New Work Order", fields: ["Product", "Quantity", "Line", "Target date"] },
    },
    {
      id: "quality",
      name: "Quality Control",
      tagline: "Inspections & compliance",
      icon: "shield",
      accent: "#8b5cf6",
      category: "Manufacturing",
      tabs: ["Overview", "Inspections", "NCR / Defects", "Compliance", "Reports", "Analytics"],
      kpis: [
        { label: "First-pass Yield", value: "96.4%", delta: "+0.8%", trend: "up" },
        { label: "Open NCRs", value: "11", delta: "-3", trend: "up" },
        { label: "Inspections (MTD)", value: "412", delta: "+24", trend: "up" },
        { label: "Reject Rate", value: "1.7%", delta: "-0.3%", trend: "up" },
      ],
      series: [94, 95, 94, 96, 95, 96, 97, 96, 96, 97, 96, 96],
      donut: [
        { label: "Passed", value: 78, color: "#8b5cf6" },
        { label: "Rework", value: 12, color: "#f59e0b" },
        { label: "Rejected", value: 6, color: "#ef4444" },
        { label: "Pending", value: 4, color: "#94a3b8" },
      ],
      tasks: [
        { t: "Incoming inspection — GRN-5521", due: "Today", p: "high" },
        { t: "Close NCR #NC-204", due: "Today", p: "med" },
        { t: "Calibrate gauge set B", due: "Tomorrow", p: "med" },
      ],
      approvals: [{ t: "Deviation approval — batch B-7741", who: "QA Head", amt: "Conditional" }],
      activities: ["Batch B-7740 passed", "NCR-203 root-cause filed", "Audit checklist updated"],
      shortcuts: ["New Inspection", "Raise NCR", "Approve Batch", "Checklist"],
      workflow: ["Sales Order", "Production", "Quality", "Dispatch", "Invoice"],
      entry: { title: "Log Inspection", fields: ["Batch / GRN", "Sample size", "Result", "Remarks"] },
    },
    {
      id: "hr",
      name: "HR & Payroll",
      tagline: "People, leave & salary",
      icon: "users",
      accent: "#ec4899",
      category: "People",
      tabs: ["Overview", "Employees", "Payroll", "Leave Approvals", "Reports", "Analytics"],
      kpis: [
        { label: "Headcount", value: "642", delta: "+9", trend: "up" },
        { label: "Payroll (MTD)", value: "₹3.18 Cr", delta: "+1.6%", trend: "up" },
        { label: "Leave Pending", value: "23", delta: "+4", trend: "down" },
        { label: "Attrition", value: "1.2%", delta: "-0.2%", trend: "up" },
      ],
      series: [610, 615, 618, 622, 625, 628, 631, 634, 636, 638, 640, 642],
      donut: [
        { label: "Production", value: 48, color: "#ec4899" },
        { label: "Quality", value: 14, color: "#8b5cf6" },
        { label: "Sales", value: 16, color: "#6366f1" },
        { label: "Support", value: 22, color: "#22d3ee" },
      ],
      tasks: [
        { t: "Approve 6 leave requests", due: "Today", p: "high" },
        { t: "Run payroll preview — May", due: "Today", p: "high" },
        { t: "Confirm 3 probation reviews", due: "Tomorrow", p: "med" },
      ],
      approvals: [
        { t: "Leave — A. Sharma (4 days)", who: "Reporting Mgr", amt: "Casual" },
        { t: "Salary revision — 5 employees", who: "HR Head", amt: "Cycle FY26" },
      ],
      activities: ["May attendance locked", "2 new joiners onboarded", "PF challan generated"],
      shortcuts: ["Add Employee", "Run Payroll", "Approve Leave", "Salary Slip"],
      workflow: ["Leave Request", "HR Review", "Payroll"],
      entry: { title: "Add Employee", fields: ["Full name", "Department", "Designation", "CTC (₹)"] },
    },
    {
      id: "attendance",
      name: "Attendance",
      tagline: "Shifts, biometrics & leave",
      icon: "clock",
      accent: "#22c55e",
      category: "People",
      tabs: ["Overview", "Today", "Roster", "Regularisation", "Reports", "Analytics"],
      kpis: [
        { label: "Present Today", value: "598", delta: "93%", trend: "up" },
        { label: "On Leave", value: "31", delta: "+5", trend: "flat" },
        { label: "Late Marks", value: "12", delta: "-4", trend: "up" },
        { label: "Overtime (hrs)", value: "284", delta: "+18", trend: "up" },
      ],
      series: [92, 94, 91, 95, 93, 90, 96, 94, 93, 95, 92, 93],
      donut: [
        { label: "Present", value: 79, color: "#22c55e" },
        { label: "Leave", value: 9, color: "#f59e0b" },
        { label: "WFH", value: 7, color: "#6366f1" },
        { label: "Absent", value: 5, color: "#ef4444" },
      ],
      tasks: [
        { t: "Approve 4 regularisations", due: "Today", p: "med" },
        { t: "Publish next-week roster", due: "Today", p: "high" },
        { t: "Sync biometric — Plant 2", due: "Tomorrow", p: "low" },
      ],
      approvals: [{ t: "Comp-off — N. Verma", who: "Shift In-charge", amt: "1 day" }],
      activities: ["Biometric synced (Plant 1)", "Shift A roster published", "3 late marks regularised"],
      shortcuts: ["Mark Attendance", "Apply Leave", "Roster", "Regularise"],
      entry: { title: "Regularise", fields: ["Employee", "Date", "In / Out", "Reason"] },
    },
    {
      id: "dispatch",
      name: "Dispatch & Logistics",
      tagline: "Shipments & deliveries",
      icon: "truck",
      accent: "#f97316",
      category: "Operations",
      tabs: ["Overview", "Shipments", "Vehicles", "Delivery", "Reports", "Analytics"],
      kpis: [
        { label: "Open Shipments", value: "58", delta: "+6", trend: "up" },
        { label: "In-transit", value: "23", delta: "+2", trend: "flat" },
        { label: "On-time Delivery", value: "91%", delta: "+1.4%", trend: "up" },
        { label: "Freight (MTD)", value: "₹14.2 L", delta: "+3.1%", trend: "down" },
      ],
      series: [40, 46, 44, 52, 49, 55, 60, 58, 64, 62, 68, 71],
      donut: [
        { label: "Delivered", value: 62, color: "#f97316" },
        { label: "In-transit", value: 22, color: "#22d3ee" },
        { label: "Loading", value: 10, color: "#f59e0b" },
        { label: "Delayed", value: 6, color: "#ef4444" },
      ],
      tasks: [
        { t: "Generate e-way bill — SH-7741", due: "Today", p: "high" },
        { t: "Assign vehicle — Pune route", due: "Today", p: "med" },
        { t: "POD reconciliation", due: "Tomorrow", p: "low" },
      ],
      approvals: [{ t: "Expedited freight — Reliance order", who: "Logistics Mgr", amt: "₹38,000" }],
      activities: ["SH-7739 delivered (POD ok)", "Vehicle MH12-AB assigned", "Route optimised: West"],
      shortcuts: ["New Shipment", "Assign Vehicle", "E-way Bill", "Track"],
      workflow: ["Sales Order", "Production", "Quality", "Dispatch", "Invoice"],
      entry: { title: "Create Shipment", fields: ["Order #", "Destination", "Vehicle", "Dispatch date"] },
    },
    {
      id: "accounts",
      name: "Accounts & Finance",
      tagline: "Invoices, payments & GST",
      icon: "rupee",
      accent: "#0891b2",
      category: "Finance",
      tabs: ["Overview", "Receivables", "Payables", "GST", "Reports", "Analytics"],
      kpis: [
        { label: "Receivables", value: "₹4.9 Cr", delta: "+2.2%", trend: "down" },
        { label: "Payables", value: "₹2.7 Cr", delta: "-1.1%", trend: "up" },
        { label: "Cash Position", value: "₹1.8 Cr", delta: "+5.4%", trend: "up" },
        { label: "Overdue", value: "₹61 L", delta: "+8%", trend: "down" },
      ],
      series: [120, 132, 128, 140, 136, 150, 145, 158, 152, 165, 160, 172],
      donut: [
        { label: "0-30d", value: 48, color: "#0891b2" },
        { label: "31-60d", value: 27, color: "#f59e0b" },
        { label: "61-90d", value: 15, color: "#f97316" },
        { label: "90d+", value: 10, color: "#ef4444" },
      ],
      tasks: [
        { t: "File GSTR-1 — May", due: "Today", p: "high" },
        { t: "Send payment reminders (₹61 L)", due: "Today", p: "high" },
        { t: "Approve 9 vendor payments", due: "Tomorrow", p: "med" },
      ],
      approvals: [
        { t: "Vendor payment run", who: "Finance Head", amt: "₹74.0 L" },
        { t: "Credit note — Adani return", who: "Accounts Mgr", amt: "₹2.1 L" },
      ],
      activities: ["Invoice INV-2291 raised", "Payment received: Tata ₹18 L", "Bank reco completed"],
      shortcuts: ["New Invoice", "Record Payment", "Reminders", "GST Filing"],
      reminders: ["₹61 L overdue across 14 invoices", "GSTR-1 due in 3 days"],
      entry: { title: "Raise Invoice", fields: ["Customer", "Amount (₹)", "Due date", "GST %"] },
    },
    {
      id: "reports",
      name: "Reports & Analytics",
      tagline: "Cross-module insights",
      icon: "chart",
      accent: "#3b82f6",
      category: "Insights",
      tabs: ["Overview", "Builder", "Dashboards", "Scheduled", "Exports", "Analytics"],
      kpis: [
        { label: "Saved Reports", value: "126", delta: "+8", trend: "up" },
        { label: "Scheduled", value: "34", delta: "+3", trend: "up" },
        { label: "Dashboards", value: "19", delta: "+1", trend: "up" },
        { label: "Exports (MTD)", value: "512", delta: "+11%", trend: "up" },
      ],
      series: [30, 38, 35, 44, 41, 50, 47, 56, 53, 62, 59, 68],
      donut: [
        { label: "Sales", value: 30, color: "#3b82f6" },
        { label: "Finance", value: 26, color: "#0891b2" },
        { label: "Production", value: 24, color: "#ef4444" },
        { label: "HR", value: 20, color: "#ec4899" },
      ],
      tasks: [
        { t: "Schedule monthly board pack", due: "Today", p: "med" },
        { t: "Refresh production dashboard", due: "Today", p: "low" },
        { t: "Share GST report to Finance", due: "Tomorrow", p: "low" },
      ],
      approvals: [{ t: "Publish exec dashboard to Directors", who: "Admin", amt: "Org-wide" }],
      activities: ["Board pack exported (PDF)", "New KPI added: OTD%", "Dashboard shared with QA"],
      shortcuts: ["Build Report", "New Dashboard", "Schedule", "Export"],
      entry: { title: "New Report", fields: ["Name", "Source module", "Metrics", "Frequency"] },
    },
    {
      id: "support",
      name: "Customer Support",
      tagline: "Tickets & service",
      icon: "headset",
      accent: "#a855f7",
      category: "Service",
      tabs: ["Overview", "Tickets", "SLA", "Knowledge Base", "Reports", "Analytics"],
      kpis: [
        { label: "Open Tickets", value: "76", delta: "+9", trend: "down" },
        { label: "Avg. Resolution", value: "6.2h", delta: "-0.8h", trend: "up" },
        { label: "CSAT", value: "4.5", delta: "+0.1", trend: "up" },
        { label: "SLA Breaches", value: "3", delta: "-2", trend: "up" },
      ],
      series: [50, 58, 54, 62, 59, 66, 63, 70, 67, 74, 71, 76],
      donut: [
        { label: "Resolved", value: 64, color: "#a855f7" },
        { label: "In-progress", value: 22, color: "#22d3ee" },
        { label: "Waiting", value: 9, color: "#f59e0b" },
        { label: "Breached", value: 5, color: "#ef4444" },
      ],
      tasks: [
        { t: "Resolve T-9912 (warranty claim)", due: "Today", p: "high" },
        { t: "Reply pending — 8 tickets", due: "Today", p: "med" },
        { t: "Update KB: installation guide", due: "Tomorrow", p: "low" },
      ],
      approvals: [{ t: "Free replacement — defective unit", who: "Support Lead", amt: "₹8,200" }],
      activities: ["T-9908 resolved (CSAT 5)", "KB article published", "Escalation to QA: T-9911"],
      shortcuts: ["New Ticket", "Assign", "Resolve", "KB Article"],
      entry: { title: "New Ticket", fields: ["Customer", "Subject", "Priority", "Category"] },
    },
    {
      id: "documents",
      name: "Document Management",
      tagline: "Files, versions & approvals",
      icon: "folder",
      accent: "#64748b",
      category: "Workspace",
      tabs: ["Overview", "Library", "Shared", "Approvals", "Reports", "Analytics"],
      kpis: [
        { label: "Documents", value: "8,214", delta: "+126", trend: "up" },
        { label: "Pending Approval", value: "14", delta: "+3", trend: "down" },
        { label: "Storage", value: "62%", delta: "+1%", trend: "flat" },
        { label: "Shared Links", value: "208", delta: "+12", trend: "up" },
      ],
      series: [60, 64, 66, 70, 72, 75, 78, 80, 83, 85, 88, 90],
      donut: [
        { label: "Policy", value: 24, color: "#64748b" },
        { label: "Quality", value: 30, color: "#8b5cf6" },
        { label: "Finance", value: 26, color: "#0891b2" },
        { label: "HR", value: 20, color: "#ec4899" },
      ],
      tasks: [
        { t: "Approve ISO procedure rev-4", due: "Today", p: "high" },
        { t: "Archive FY24 vouchers", due: "Today", p: "low" },
        { t: "Review shared-link access", due: "Tomorrow", p: "med" },
      ],
      approvals: [{ t: "Publish quality manual rev-4", who: "QA Head", amt: "Controlled" }],
      activities: ["SOP-118 uploaded", "Doc DOC-552 approved", "Link expired: vendor pack"],
      shortcuts: ["Upload", "New Folder", "Share", "Request Approval"],
      entry: { title: "Upload Document", fields: ["Title", "Category", "Owner", "Access level"] },
    },
    {
      id: "admin",
      name: "Admin Control Panel",
      tagline: "Users, roles & system",
      icon: "settings",
      accent: "#475569",
      category: "Administration",
      tabs: ["Overview", "Users", "Roles & Access", "Organisation", "Audit Log", "Settings"],
      kpis: [
        { label: "Active Users", value: "212", delta: "+6", trend: "up" },
        { label: "Roles", value: "9", delta: "0", trend: "flat" },
        { label: "Modules", value: "15", delta: "0", trend: "flat" },
        { label: "Open Sessions", value: "88", delta: "+5", trend: "up" },
      ],
      series: [180, 184, 186, 190, 194, 198, 200, 204, 206, 208, 210, 212],
      donut: [
        { label: "Operators", value: 58, color: "#475569" },
        { label: "Managers", value: 24, color: "#6366f1" },
        { label: "Admins", value: 8, color: "#ef4444" },
        { label: "Viewers", value: 10, color: "#22d3ee" },
      ],
      tasks: [
        { t: "Review 3 access requests", due: "Today", p: "high" },
        { t: "Rotate API keys", due: "Today", p: "med" },
        { t: "Backup verification", due: "Tomorrow", p: "med" },
      ],
      approvals: [{ t: "Grant Accounts module to S. Iyer", who: "Self / Admin", amt: "RBAC" }],
      activities: ["Role 'Dispatch' permissions updated", "User locked after 5 fails", "Audit export generated"],
      shortcuts: ["Add User", "Edit Role", "Org Profile", "Audit Log"],
      entry: { title: "Invite User", fields: ["Name", "Email", "Role", "Modules"] },
    },
  ];

  VG.MODULE_BY_ID = VG.MODULES.reduce((m, x) => ((m[x.id] = x), m), {});

  /* ---------- Roles (RBAC) ----------
     modules: 'all' or array of module ids the role may open.
     actions: action verbs the role may perform (action-level RBAC).
     home: suggested module highlighted on the welcome screen (not auto-opened). */
  VG.ROLES = {
    admin: {
      label: "Administrator",
      tag: "Full system control",
      avatar: "AD",
      color: "#ef4444",
      modules: "all",
      actions: ["view", "add", "edit", "delete", "approve", "export", "print"],
      home: null,
    },
    hr: {
      label: "HR Manager",
      tag: "People & payroll",
      avatar: "HR",
      color: "#ec4899",
      modules: ["hr", "attendance", "reports", "documents", "support"],
      actions: ["view", "add", "edit", "approve", "export", "print"],
      home: "hr",
    },
    sales: {
      label: "Sales Team",
      tag: "Revenue & customers",
      avatar: "SL",
      color: "#6366f1",
      modules: ["sales", "enquiry", "reports", "documents", "support"],
      actions: ["view", "add", "edit", "export", "print"],
      home: "sales",
    },
    inventory: {
      label: "Inventory Manager",
      tag: "Stock & procurement",
      avatar: "IN",
      color: "#10b981",
      modules: ["inventory", "purchase", "supplier", "reports", "documents"],
      actions: ["view", "add", "edit", "delete", "approve", "export", "print"],
      home: "inventory",
    },
    production: {
      label: "Production Team",
      tag: "Shop floor & WOs",
      avatar: "PR",
      color: "#ef4444",
      modules: ["production", "inventory", "quality", "reports", "documents"],
      actions: ["view", "add", "edit", "export", "print"],
      home: "production",
    },
    quality: {
      label: "Quality Control",
      tag: "Inspections & compliance",
      avatar: "QC",
      color: "#8b5cf6",
      modules: ["quality", "production", "reports", "documents"],
      actions: ["view", "add", "edit", "approve", "export", "print"],
      home: "quality",
    },
    accounts: {
      label: "Accounts",
      tag: "Finance & GST",
      avatar: "AC",
      color: "#0891b2",
      modules: ["accounts", "purchase", "reports", "documents"],
      actions: ["view", "add", "edit", "approve", "export", "print"],
      home: "accounts",
    },
    dispatch: {
      label: "Dispatch",
      tag: "Shipments & logistics",
      avatar: "DP",
      color: "#f97316",
      modules: ["dispatch", "inventory", "reports", "documents"],
      actions: ["view", "add", "edit", "export", "print"],
      home: "dispatch",
    },
    employee: {
      label: "Employee",
      tag: "Self-service portal",
      avatar: "EM",
      color: "#22c55e",
      modules: ["attendance", "support", "documents"],
      actions: ["view", "add"],
      home: "attendance",
    },
  };

  VG.modulesForRole = function (roleKey) {
    if (VG.store && VG.store.modulesForRole) {
      const mods = VG.store.modulesForRole(roleKey);
      if (mods.length) return mods;
    }
    const role = VG.ROLES[roleKey];
    if (!role) return [];
    if (role.modules === "all") return VG.MODULES.slice();
    return role.modules.map((id) => VG.MODULE_BY_ID[id]).filter(Boolean);
  };

  VG.can = function (roleKey, action, moduleId) {
    if (VG.store && VG.store.canAction) return VG.store.canAction(roleKey, action, moduleId);
    const role = VG.ROLES[roleKey];
    return !!role && role.actions.includes(action);
  };

  VG.fieldRule = function (roleKey, module, field) {
    if (VG.store && VG.store.fieldRule) return VG.store.fieldRule(roleKey, module, field);
    return { visible: true, editable: true, mandatory: false, approvalRequired: false, masked: false };
  };

  /* Short, friendly greeting helpers used on the launcher */
  VG.greeting = function () {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };
})(window.VG);
