/* Veraglo ERP — data store.
   Primary persistence: PostgreSQL (via REST API, JSONB document in erp_state).
   Fallback: browser localStorage when the API is unreachable.
   In-memory reactive DB with master tables, stock ledger, audit trail. */
(function (VG) {
  const { useState, useEffect } = React;
  const KEY = "veraglo-erp-db";
  const VERSION = 11;
  const AUTH_INACTIVE_MSG = "User account does not exist or has been deactivated.";
  const ITEM_MFR_DUP_MSG = "This manufacturer and part number already exist in Item Master. Duplicate item cannot be created.";

  /* ---------------- helpers ---------------- */
  const todayISO = () => new Date().toISOString().slice(0, 10);
  function extraDueDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + (days || 30));
    return d.toISOString().slice(0, 10);
  }
  function fyCode(d) {
    const dt = d ? new Date(d) : new Date();
    const y = dt.getFullYear();
    const start = dt.getMonth() >= 3 ? y : y - 1; // FY starts April
    return String(start % 100) + String((start + 1) % 100);
  }
  const inr = (n) =>
    "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function normalizeMfrName(name) {
    return String(name || "").trim().replace(/\s+/g, " ").toUpperCase();
  }
  function normalizeMfrPart(part) {
    return String(part || "").trim().toUpperCase().replace(/[\s\-_./]+/g, "");
  }
  function itemMfrKey(name, part) {
    const n = normalizeMfrName(name);
    const p = normalizeMfrPart(part);
    if (!n || !p) return "";
    return n + "|" + p;
  }

  /* ---------------- seed ---------------- */
  function seed() {
    const company = {
      legalName: "Veraglo Manufacturing Private Limited",
      tradeName: "Veraglo",
      name: "Veraglo Manufacturing Pvt. Ltd.",
      tagline: "Precision LED & Lighting Systems",
      logo: "assets/veraglo-logo.png",
      letterheadLogo: "",
      favicon: "",
      address1: "Plot 14, MIDC Industrial Area",
      address2: "",
      city: "Pune",
      state: "Maharashtra",
      country: "India",
      pin: "411018",
      address: "Plot 14, MIDC Industrial Area, Pune, Maharashtra 411018",
      registeredAddress: {
        line1: "Plot 14, MIDC Industrial Area", line2: "", city: "Pune", district: "Pune", state: "Maharashtra", stateCode: "27",
        country: "India", pin: "411018", gstin: "27ABCDE1234F1Z5", phone: "+91 20 4123 5600", email: "sales@veraglo.in",
      },
      officeSameAsRegistered: true,
      officeAddress: { line1: "", line2: "", city: "", state: "", country: "", pin: "" },
      factoryAddress: {
        line1: "Plant-1, MIDC Chakan", line2: "", city: "Pune", state: "Maharashtra", country: "India", pin: "410501",
      },
      gstin: "27ABCDE1234F1Z5",
      pan: "ABCDE1234F",
      cin: "U29309PN2010PTC123456",
      udyam: "UDYAM-MH-12-0012345",
      iec: "0309001234",
      website: "www.veraglo.in",
      email: "sales@veraglo.in",
      salesEmail: "sales@veraglo.in",
      accountsEmail: "accounts@veraglo.in",
      supportEmail: "support@veraglo.in",
      phone: "+91 20 4123 5600",
      altPhone: "+91 20 4123 5601",
      bank: "HDFC Bank · A/c 50200012345678 · IFSC HDFC0000123",
      bankName: "HDFC Bank",
      accountNo: "50200012345678",
      ifsc: "HDFC0000123",
      signatoryName: "Authorized Signatory",
      signatoryTitle: "Director",
      signatureImage: "",
      sealImage: "",
      terms: "Goods once sold will not be taken back. Subject to Pune jurisdiction.",
      warranty: "Standard warranty as per product datasheet.",
      paymentTermsDefault: "30 Days Credit",
      deliveryTermsDefault: "FOR Destination",
      jurisdiction: "Courts at Pune, Maharashtra shall have exclusive jurisdiction.",
      docFooter: "Thank you for your business.",
    };
    const units = ["Nos", "Set", "Mtr", "Kg", "Ltr", "Box", "Pair", "Roll"].map((u, i) => ({ id: "u" + i, name: u }));
    const taxes = [0, 5, 12, 18, 28].map((r) => ({ id: "gst" + r, name: "GST " + r + "%", rate: r }));
    const categoryDefs = [
      { name: "LED Drivers", typeCode: "RWM" }, { name: "Heat Sinks", typeCode: "RWM" }, { name: "Housings", typeCode: "RWM" },
      { name: "Fasteners", typeCode: "RWM" }, { name: "Packaging", typeCode: "PKG" }, { name: "Optics", typeCode: "RWM" },
      { name: "PCB", typeCode: "RWM" }, { name: "Wiring", typeCode: "RWM" },
    ];
    const categories = categoryDefs.map((c, i) => ({ id: "cat" + i, code: "CAT-" + (i + 1), name: c.name, typeCode: c.typeCode }));
    const locDefs = [
      { name: "Head Office — Main Store", locType: "Head office", defaultWarehouse: true },
      { name: "Plant-1 Factory", locType: "Factory" },
      { name: "Plant-2 WIP", locType: "Factory" },
      { name: "Finished Goods Warehouse", locType: "Warehouse" },
      { name: "Quarantine Store", locType: "Warehouse" },
      { name: "Rack A1", locType: "Store" },
      { name: "Bhiwandi Dispatch Hub", locType: "Branch" },
    ];
    const locations = locDefs.map((l, i) => ({
      id: "loc" + i, code: "LOC-" + String(i + 1).padStart(2, "0"), name: l.name, locType: l.locType,
      line1: "Plot 14, MIDC Industrial Area", city: "Pune", state: "Maharashtra", pin: "411018", country: "India",
      contact: "Operations", phone: "+91 20 4123 5600", email: "ops@veraglo.in", gstin: company.gstin,
      defaultWarehouse: !!l.defaultWarehouse, status: "Active",
    }));
    const paymentTerms = [
      "100% Advance", "50% Advance, 50% before dispatch", "30 Days Credit", "45 Days Credit", "Against Delivery",
    ].map((t, i) => ({ id: "pt" + i, name: t }));
    const deliveryTerms = [
      "Ex-Works", "FOR Destination", "Within 1 Week", "Within 2 Weeks", "Within 4 Weeks",
    ].map((t, i) => ({ id: "dt" + i, name: t }));
    const currencies = [
      { id: "cur1", code: "INR", name: "Indian Rupee", symbol: "₹", rate: 1, base: true },
      { id: "cur2", code: "USD", name: "US Dollar", symbol: "$", rate: 83.2 },
      { id: "cur3", code: "EUR", name: "Euro", symbol: "€", rate: 90.1 },
      { id: "cur4", code: "AED", name: "UAE Dirham", symbol: "د.إ", rate: 22.65 },
      { id: "cur5", code: "GBP", name: "Pound Sterling", symbol: "£", rate: 105.4 },
    ];
    const pincodes = [
      { id: "p1", pin: "411018", city: "Pune", district: "Pune", state: "Maharashtra", country: "India", stateCode: "27" },
      { id: "p2", pin: "400002", city: "Mumbai", district: "Mumbai", state: "Maharashtra", country: "India", stateCode: "27" },
      { id: "p3", pin: "500082", city: "Hyderabad", district: "Hyderabad", state: "Telangana", country: "India", stateCode: "36" },
      { id: "p4", pin: "382421", city: "Ahmedabad", district: "Ahmedabad", state: "Gujarat", country: "India", stateCode: "24" },
      { id: "p5", pin: "560100", city: "Bengaluru", district: "Bengaluru", state: "Karnataka", country: "India", stateCode: "29" },
      { id: "p6", pin: "421302", city: "Bhiwandi", district: "Thane", state: "Maharashtra", country: "India", stateCode: "27" },
    ];

    const customers = [
      {
        id: "c1", code: "CUST-0001", name: "Reliance Retail Ltd.", legalName: "Reliance Retail Limited", tradeName: "Reliance Retail",
        type: "Company", category: "Key Account", status: "Active", pan: "AAACR5055K", gstin: "27AAACR5055K1Z5", cin: "U01100MH1999PLC120563",
        website: "www.relianceretail.com", source: "Key Account", salesPerson: "Sales Team", currency: "INR", gstRegType: "Regular", multiCurrency: false,
        priceList: "Dealer", paymentTermsId: "pt2", creditLimit: 5000000, creditDays: 45, outstanding: 1240000,
        discountCategory: "Tier-1", taxCategory: "Registered", incoterms: "", freightTerms: "FOR Destination", deliveryTermsId: "dt1",
        approvalStatus: "Approved", approvedBy: "admin", createdBy: "admin",
        contacts: [
          { name: "R. Kapoor", designation: "Procurement Head", role: "Primary", mobile: "+91 98200 11111", altPhone: "", email: "rkapoor@relianceretail.com" },
          { name: "M. Desai", designation: "Accounts Manager", role: "Accounts", mobile: "+91 98200 22222", altPhone: "", email: "accounts@relianceretail.com" },
        ],
        addresses: [
          { id: "a1", type: "Billing", line1: "Court House", line2: "Lokmanya Tilak Marg", landmark: "", city: "Mumbai", district: "Mumbai", state: "Maharashtra", country: "India", pin: "400002", stateCode: "27", gstin: "27AAACR5055K1Z5", contact: "M. Desai", mobile: "+91 98200 22222", email: "accounts@relianceretail.com", defaultBilling: true, defaultShipping: false },
          { id: "a2", type: "Shipping", line1: "DC-3, Bhiwandi Logistics Park", line2: "Mankoli Naka", landmark: "", city: "Bhiwandi", district: "Thane", state: "Maharashtra", country: "India", pin: "421302", stateCode: "27", gstin: "", contact: "Store Incharge", mobile: "+91 98200 33333", email: "", defaultBilling: false, defaultShipping: true },
        ],
        // compat flat fields (auto-derived on save):
        contact: "R. Kapoor", phone: "+91 98200 11111", email: "rkapoor@relianceretail.com", state: "Maharashtra",
        billing: "Court House, Lokmanya Tilak Marg, Mumbai, Maharashtra 400002",
        shipping: "DC-3, Bhiwandi Logistics Park, Bhiwandi, Maharashtra 421302", credit: "45 Days Credit",
      },
      { id: "c2", code: "CUST-0002", name: "Tata Projects Ltd.", contact: "S. Nair", phone: "+91 99000 22222", email: "snair@tataprojects.com", gstin: "36AAACT2803M1ZS", billing: "Mithona Towers, Hyderabad 500082", shipping: "Site Office, Hyderabad 500032", state: "Telangana", credit: "30 Days Credit", status: "Active", approvalStatus: "Approved" },
      { id: "c3", code: "CUST-0003", name: "Adani Facilities Mgmt.", contact: "P. Shah", phone: "+91 90000 33333", email: "pshah@adani.com", gstin: "24AAACA1234K1Z9", billing: "Shantigram, Ahmedabad 382421", shipping: "Mundra Port, Gujarat 370421", state: "Gujarat", credit: "Against Delivery", status: "Active", approvalStatus: "Approved" },
      { id: "c4", code: "CUST-0004", name: "Larsen Infra Pvt. Ltd.", contact: "A. Menon", phone: "+91 88000 44444", email: "amenon@larseninfra.com", gstin: "29AAACL9999K1Z2", billing: "Powai, Mumbai 400072", shipping: "EPC Site, Bengaluru 560100", state: "Karnataka", credit: "30 Days Credit", status: "Active", approvalStatus: "Approved" },
    ];
    const suppliers = [
      { id: "s1", code: "SUPP-0001", name: "Syska LED Lights", contact: "M. Jain", phone: "+91 98111 55555", email: "purchase@syska.co.in", gstin: "27AABCS1234K1Z1", address: "Andheri East, Mumbai 400093", category: "A-grade", rating: 4.5 },
      { id: "s2", code: "SUPP-0002", name: "Bajaj Electricals", contact: "K. Rao", phone: "+91 98222 66666", email: "vendor@bajajelectricals.com", gstin: "27AAACB1234K1Z2", address: "Lower Parel, Mumbai 400013", category: "A-grade", rating: 4.3 },
      { id: "s3", code: "SUPP-0003", name: "Crompton Greaves", contact: "D. Iyer", phone: "+91 98333 77777", email: "supply@crompton.co.in", gstin: "27AAACC1234K1Z3", address: "Kanjurmarg, Mumbai 400042", category: "B-grade", rating: 4.0 },
    ];
    const manufacturers = [
      { id: "mfr1", code: "MFR-001", name: "OSRAM", brand: "OSRAM", country: "Germany", website: "www.osram.com", contact: "Regional Sales", email: "sales@osram.com", active: true },
      { id: "mfr2", code: "MFR-002", name: "Mean Well", brand: "Mean Well", country: "Taiwan", website: "www.meanwell.com", contact: "India Distributor", email: "support@meanwell.com", active: true },
      { id: "mfr3", code: "MFR-003", name: "Cree LED", brand: "Cree", country: "USA", website: "www.cree.com", contact: "", email: "", active: true },
      { id: "mfr4", code: "MFR-004", name: "Ledil", brand: "Ledil", country: "Finland", website: "", contact: "", email: "", active: true },
      { id: "mfr5", code: "MFR-005", name: "Kingboard", brand: "Kingboard", country: "China", website: "", contact: "", email: "", active: true },
    ];
    const items = [
      { id: "i1", sku: "DRV-36W", name: "LED Driver 36W Constant Current", categoryId: "cat0", unit: "Nos", hsn: "85044090", rate: 320, taxId: "gst18", reorder: 200, minStock: 120, batchTracked: true, locationId: "loc0", warranty: "24 months", manufacturerId: "mfr2", manufacturerPartNumber: "LCM-36X", manufacturerDesc: "36W constant current LED driver", manufacturerModel: "LCM-36X", brandName: "Mean Well" },
      { id: "i2", sku: "DRV-50W", name: "LED Driver 50W Dimmable", categoryId: "cat0", unit: "Nos", hsn: "85044090", rate: 540, taxId: "gst18", reorder: 150, minStock: 100, batchTracked: true, locationId: "loc0", warranty: "24 months", manufacturerId: "mfr2", manufacturerPartNumber: "LCM-50X", manufacturerDesc: "50W dimmable LED driver", manufacturerModel: "LCM-50X", brandName: "Mean Well" },
      { id: "i3", sku: "HS-50W", name: "Aluminium Heat Sink 50W", categoryId: "cat1", unit: "Nos", hsn: "76169990", rate: 145, taxId: "gst18", reorder: 300, minStock: 150, batchTracked: false, locationId: "loc0", warranty: "", manufacturerId: "mfr3", manufacturerPartNumber: "HS-AL-50", manufacturerDesc: "Extruded aluminium heat sink 50W class", manufacturerModel: "HS-AL-50", brandName: "Cree" },
      { id: "i4", sku: "HOU-RND-7", name: "Round Housing 7-inch", categoryId: "cat2", unit: "Nos", hsn: "94054090", rate: 88, taxId: "gst12", reorder: 400, minStock: 200, batchTracked: false, locationId: "loc0", warranty: "", manufacturerId: "mfr1", manufacturerPartNumber: "HOUS-RND-7", manufacturerDesc: "Die-cast round downlight housing 7 inch", manufacturerModel: "HOUS-RND-7", brandName: "OSRAM" },
      { id: "i5", sku: "OPT-90D", name: "Optical Lens 90° Beam", categoryId: "cat5", unit: "Nos", hsn: "90019000", rate: 26, taxId: "gst18", reorder: 800, minStock: 400, batchTracked: false, locationId: "loc0", warranty: "", manufacturerId: "mfr4", manufacturerPartNumber: "C13450-90", manufacturerDesc: "PMMA lens 90° beam angle", manufacturerModel: "C13450", brandName: "Ledil" },
      { id: "i6", sku: "PCB-MCB-24", name: "MCPCB 24-LED Board", categoryId: "cat6", unit: "Nos", hsn: "85340000", rate: 210, taxId: "gst18", reorder: 250, minStock: 150, batchTracked: true, locationId: "loc0", warranty: "12 months", manufacturerId: "mfr5", manufacturerPartNumber: "KB-MCPCB-24", manufacturerDesc: "Metal core PCB 24 LED positions", manufacturerModel: "KB-MCPCB-24", brandName: "Kingboard" },
      { id: "i7", sku: "WIR-2C-1.0", name: "2-Core Wire 1.0sqmm (per mtr)", categoryId: "cat7", unit: "Mtr", hsn: "85444900", rate: 18, taxId: "gst18", reorder: 2000, minStock: 1000, batchTracked: false, locationId: "loc0", warranty: "", manufacturerId: "mfr1", manufacturerPartNumber: "WIRE-2C-1.0", manufacturerDesc: "2-core copper wire 1.0 sqmm", manufacturerModel: "", brandName: "" },
      { id: "i8", sku: "PKG-CRT-A", name: "Carton Box Type-A", categoryId: "cat4", unit: "Nos", hsn: "48191010", rate: 12, taxId: "gst12", reorder: 1500, minStock: 800, batchTracked: false, locationId: "loc0", warranty: "", manufacturerId: "", manufacturerPartNumber: "", manufacturerDesc: "", manufacturerModel: "", brandName: "" },
    ];
    items.forEach((it) => {
      const mfr = it.manufacturerId ? manufacturers.find((m) => m.id === it.manufacturerId) : null;
      it.manufacturerName = mfr ? mfr.name : "";
      it.mfrKey = itemMfrKey(it.manufacturerName, it.manufacturerPartNumber);
    });
    const priceList = items.map((it, i) => ({ id: "pl" + i, itemId: it.id, listRate: it.rate, minRate: Math.round(it.rate * 0.88), effective: "2026-04-01", currency: "INR" }));

    // opening stock as ledger entries
    const opening = [
      ["i1", 480], ["i2", 260], ["i3", 240], ["i4", 620], ["i5", 1500], ["i6", 95], ["i7", 3400], ["i8", 2100],
    ];
    let lid = 1;
    const stockLedger = opening.map(([itemId, qty]) => ({
      id: "L" + (lid++), date: "2026-04-01", itemId, locationId: "loc0", type: "opening",
      qty, ref: "Opening Balance", batch: "", by: "system",
    }));

    const seq = { QT: 0, PI: 0, SO: 1, MR: 0, FG: 0, QCI: 0, MRN: 0, MIN: 0, GRN: 0, TRF: 0, RET: 0, SCR: 0, PV: 0, LEAD: 0, ENQ: 0, PR: 1, PO: 0, QC: 0, NCR: 0, BOM: 0, WO: 0, SH: 0, INV: 0, LP: 0, PAY: 0 };

    return {
      _v: VERSION,
      company, units, taxes, categories, locations, paymentTerms, deliveryTerms, currencies, pincodes,
      customers, suppliers, manufacturers, items, priceList,
      leads: [
        { id: "L1", no: "LEAD/2627/0001", date: "2026-05-21", customerId: "c1", title: "Façade lighting drivers", value: 480000, source: "Website", stage: "Qualified", status: "Open", owner: "sales", remarks: "Needs 36W & 50W drivers" },
        { id: "L2", no: "LEAD/2627/0002", date: "2026-05-24", customerId: "c4", title: "Heat sinks bulk order", value: 220000, source: "Referral", stage: "Proposal", status: "Open", owner: "sales", remarks: "" },
      ],
      enquiries: [
        {
          id: "E1", no: "ENQ/2627/0001", date: "2026-05-22", type: "Sales", customerId: "c2",
          companyName: "L&T Construction", contactPerson: "A. Sharma", contactPhone: "9876543210", contactEmail: "asharma@lt.com",
          customerType: "Existing", customerSource: "Tender", priority: "Urgent",
          projectName: "Metro Station Façade Lighting", projectLocation: "Mumbai", customerRfqNo: "RFQ-METRO-2026-042",
          offerDueDate: "2026-06-10", expectedOrderDate: "2026-07-15",
          subject: "RFQ for 50W dimmable drivers", status: "Under Review", owner: "sales", assignedTo: "sales",
          lines: [{ desc: "50W Dimmable LED Driver", category: "Drivers", qty: 500, unit: "Nos", techSpec: "0-10V dimming, IP67", application: "Façade" }],
          timeline: [{ id: "t1", ts: Date.now() - 86400000 * 3, action: "created", by: "sales", detail: "Enquiry ENQ/2627/0001 logged" }, { id: "t2", ts: Date.now() - 86400000 * 2, action: "assigned", by: "sales", detail: "Assigned to sales" }],
          remarks: "Urgent tender submission",
        },
      ],
      followups: [
        { id: "F1", date: todayISO(), customerId: "c1", refType: "Lead", refId: "L1", mode: "Call", note: "Share revised quote", status: "Pending", owner: "sales" },
        { id: "F2", date: todayISO(), customerId: "c2", refType: "Enquiry", refId: "E1", mode: "Email", note: "Send technical datasheet", status: "Pending", owner: "sales" },
      ],
      quotations: [],
      proformas: [],
      salesOrders: [
        {
          id: "so1", no: "SO/2627/0001", date: todayISO(), quotationId: "", customerId: "c1",
          contact: "R. Kapoor", billing: "Court House, Lokmanya Tilak Marg, Mumbai 400002", shipping: "DC-3, Bhiwandi Logistics Park, Bhiwandi 421302",
          gstin: "27AAACR5055K1Z5", lines: [{ sku: "DRV-36W", desc: "LED Driver 36W", hsn: "85044090", qty: 200, unit: "Nos", rate: 320, discountPct: 5, taxPct: 18 }],
          totals: { sub: 64000, discount: 3200, taxable: 60800, tax: 10944, charges: 0, grand: 71744 },
          paymentTermsId: "pt2", deliveryTermsId: "dt3", status: "Confirmed", stage: "Confirmed", preparedBy: "sales",
          timeline: [{ ts: Date.now(), action: "create", by: "sales", note: "Order confirmed from quotation" }],
        },
      ],
      boms: [],
      workOrders: [],
      materialRequirements: [],
      finishedGoodsTransfers: [],
      qcIssues: [],
      dispatchQueue: [],
      orderHistory: [],
      shipments: [],
      invoices: [],
      payments: [],
      employees: [
        { id: "e1", code: "EMP-0001", name: "A. Sharma", department: "Production", designation: "Line Operator", doj: "2024-04-01", ctc: 420000, pan: "ABCDE1234A", status: "Active" },
        { id: "e2", code: "EMP-0002", name: "N. Verma", department: "Quality", designation: "QC Inspector", doj: "2023-08-15", ctc: 480000, pan: "BCDEF2345B", status: "Active" },
        { id: "e3", code: "EMP-0003", name: "S. Iyer", department: "Accounts", designation: "Accounts Executive", doj: "2022-01-10", ctc: 540000, pan: "CDEFG3456C", status: "Active" },
      ],
      leaveRequests: [
        { id: "lv1", no: "LP/2627/0001", employeeId: "e1", from: todayISO(), to: todayISO(), days: 1, type: "Casual", reason: "Personal", status: "Pending", appliedOn: todayISO() },
      ],
      attendanceRecords: [
        { id: "att1", employeeId: "e1", month: "2026-05", present: 20, leave: 1, absent: 0, otHours: 8, locked: false },
        { id: "att2", employeeId: "e2", month: "2026-05", present: 21, leave: 0, absent: 0, otHours: 4, locked: false },
        { id: "att3", employeeId: "e3", month: "2026-05", present: 22, leave: 0, absent: 0, otHours: 0, locked: false },
      ],
      payrollRuns: [],
      salarySlips: [],
      purchaseRequests: [
        { id: "PR1", no: "PR/2627/0001", date: todayISO(), itemId: "i6", qty: 250, uom: "Nos", neededBy: "", priority: "High", reason: "Below reorder level", status: "Pending", raisedBy: "inventory", supplierId: "s1" },
      ],
      purchaseOrders: [],
      qcInspections: [],
      ncrs: [],
      communications: [
        { id: "CM1", date: "2026-05-20", customerId: "c1", mode: "Call", subject: "Intro call", note: "Discussed requirement", by: "sales" },
      ],
      materialReceipts: [],
      materialIssues: [],
      stockTransfers: [],
      returns: [],
      scrap: [],
      physicalVerifications: [],
      stockLedger,
      auditLog: [
        { id: "A0", ts: Date.now(), actor: "system", action: "seed", entity: "system", refId: "-", summary: "Database initialised with master data" },
      ],
      seq,
      settings: defaultSettings(),
      backups: [],
      erpUsers: [],
      customRoles: [],
      loginLog: [],
      approvalWorkflows: [],
      documentTemplates: [],
      numberSeries: [],
      fieldPermissions: [],
      departments: [
        { id: "d1", name: "Sales" }, { id: "d2", name: "Production" }, { id: "d3", name: "Quality" },
        { id: "d4", name: "Inventory" }, { id: "d5", name: "Accounts" }, { id: "d6", name: "HR" },
      ],
      designations: [
        { id: "dg1", name: "Manager" }, { id: "dg2", name: "Executive" }, { id: "dg3", name: "Operator" },
      ],
    };
  }

  function defaultSettings() {
    return {
      security: {
        minPasswordLength: 8, passwordExpiryDays: 90, sessionTimeoutMins: 60, maxLoginAttempts: 5,
        lockoutMins: 30, twoFactorRequired: false, loginOtp: false, ipRestriction: false, allowedIps: "",
        exportRestricted: false, auditRetentionDays: 365, forceLogoutAll: false,
      },
      theme: {
        accent: "#6366f1", defaultMode: "dark", sidebarCollapsed: false, fontSize: "medium",
        loginBackground: "assets/happy-employees.png",
      },
      typography: {
        fontFamily: "inter", headingSize: "medium", tableSize: "medium", formSize: "medium",
        pdfFontFamily: "inter", fontWeight: "medium", lineSpacing: "comfortable", density: "comfortable",
      },
      dashboard: { pinnedModules: [], hiddenModules: [], moduleOrder: [] },
      notifications: {
        smtpHost: "", smtpPort: 587, smtpUser: "", smtpPass: "", smtpFrom: "noreply@veraglo.in",
        smtpTls: true, lowStockAlert: true, approvalAlerts: true, paymentReminders: true, followupReminders: true,
      },
      license: { plan: "Enterprise Manufacturing", seats: 50, validUntil: "2027-03-31", status: "Active" },
      activation: { status: "Trial", trialEndsAt: null, serial: "", licenseKeyId: "", machineId: "" },
      dataPath: {
        current: "", type: "local", lastValidatedAt: null, readOk: false, writeOk: false,
        encryptAtRest: true, companies: [], lockEnabled: true,
      },
      backup: {
        cloud: { enabled: false, provider: "Google Drive", folder: "Veraglo ERP/Backups", account: "", token: "", connected: false },
        local: { enabled: false, path: "", server: "", share: "", connected: false },
        schedule: { frequency: "Manual", time: "22:00", retention: 7 },
        lastBackupAt: null,
      },
      skuNumbering: {
        enabled: true, companyPrefix: "GLS", separator: "", numberLength: 7, startNumber: 1,
        resetRule: "never", includeBranchCode: false, branchCode: "", includeCategoryCode: true,
        categoryPrefixes: { RWM: "RWM", FNG: "FGD", SFG: "SFG", CON: "CON", PKG: "PKM", SPR: "SPR", WIP: "WIP", OTH: "OTH" },
        manualOverrideAllowed: false, duplicateCheck: true, seriesCounters: {}, auditLog: [],
      },
    };
  }

  /* ---------------- store core ---------------- */
  let DB = seed();
  let _ready = false;
  let _usePostgres = false;
  const listeners = new Set();

  function migrate(db) {
    if (!db.settings) db.settings = defaultSettings();
    if (!db.settings.backup) db.settings.backup = defaultSettings().backup;
    if (!Array.isArray(db.backups)) db.backups = [];
    ["purchaseRequests", "purchaseOrders", "qcInspections", "qcIssues", "ncrs", "boms", "workOrders", "materialRequirements", "finishedGoodsTransfers", "dispatchQueue", "orderHistory", "shipments", "invoices", "payments", "employees", "leaveRequests", "attendanceRecords", "payrollRuns", "salarySlips",
      "erpUsers", "customRoles", "loginLog", "approvalWorkflows", "documentTemplates", "numberSeries", "fieldPermissions", "departments", "designations"].forEach((k) => { if (!Array.isArray(db[k])) db[k] = []; });
    if (!db.settings.security) db.settings.security = defaultSettings().security;
    if (!db.settings.theme) db.settings.theme = defaultSettings().theme;
    if (!db.settings.typography) {
      db.settings.typography = typeof VG !== "undefined" && VG.defaultTypography
        ? VG.defaultTypography(db.settings.theme)
        : defaultSettings().typography;
    } else {
      db.settings.typography = { ...defaultSettings().typography, ...db.settings.typography };
    }
    if (!db.settings.notifications) db.settings.notifications = defaultSettings().notifications;
    if (!db.settings.license) db.settings.license = defaultSettings().license;
    if (!db.settings.dashboard) db.settings.dashboard = defaultSettings().dashboard;
    if (!db.settings.skuNumbering) db.settings.skuNumbering = defaultSettings().skuNumbering;
    else db.settings.skuNumbering = { ...defaultSettings().skuNumbering, ...db.settings.skuNumbering, categoryPrefixes: { ...defaultSettings().skuNumbering.categoryPrefixes, ...(db.settings.skuNumbering.categoryPrefixes || {}) } };
    if (!db.settings.activation) db.settings.activation = defaultSettings().activation;
    if (!db.settings.dataPath) db.settings.dataPath = defaultSettings().dataPath;
    migrateLicense(db);
    db.seq = db.seq || {};
    ["PR", "PO", "QC", "QCI", "NCR", "BOM", "WO", "MR", "FG", "SH", "INV", "LP", "PAY", "USR"].forEach((k) => { if (db.seq[k] == null) db.seq[k] = 0; });
    migrateBoms(db);
    (db.categories || []).forEach((c) => { if (!c.typeCode) c.typeCode = "RWM"; });
    (db.salesOrders || []).forEach((o) => { if (!o.timeline) o.timeline = []; if (!o.stage && o.status === "Confirmed") o.stage = "Confirmed"; });
    migrateAdmin(db);
    migrateAuth(db);
    migrateManufacturers(db);
    migrateCompanyAddresses(db);
    migrateEnquiries(db);
    db._v = VERSION;
    return db;
  }

  function migrateEnquiries(db) {
    const map = { Open: "New Enquiry", Quoted: "Offer Sent", Converted: "Won / Converted to Sales Order", Closed: "Closed" };
    (db.enquiries || []).forEach((e) => {
      if (map[e.status]) e.status = map[e.status];
      if (!Array.isArray(e.timeline)) e.timeline = e.createdAt ? [{ id: "m" + e.id, ts: e.createdAt, action: "created", by: e.owner || "system", detail: "Enquiry " + (e.no || e.id) }] : [];
      if (!Array.isArray(e.lines)) e.lines = e.items ? [{ desc: e.items, qty: 1, unit: "Nos" }] : [];
      if (!Array.isArray(e.documents)) e.documents = [];
      if (!Array.isArray(e.followups)) e.followups = [];
      if (!Array.isArray(e.quotationIds)) e.quotationIds = e.quotationId ? [e.quotationId] : [];
      if (!e.customerType) e.customerType = e.customerId ? "Existing" : "New";
      if (!e.customerSource) e.customerSource = "Other";
      if (!e.priority) e.priority = "Normal";
      if (!e.projectName && e.subject) e.projectName = e.subject;
      if (!e.companyName && e.customerId) {
        const c = (db.customers || []).find((x) => x.id === e.customerId);
        if (c) e.companyName = c.legalName || c.name;
      }
    });
  }

  function formatCompanyAddr(a) {
    if (!a) return "";
    return [a.line1, a.line2, a.city, a.state, a.country, a.pin].filter(Boolean).join(", ");
  }
  function migrateCompanyAddresses(db) {
    const c = db.company || {};
    if (!c.registeredAddress || !c.registeredAddress.line1) {
      c.registeredAddress = {
        line1: c.address1 || "", line2: c.address2 || "", city: c.city || "", district: c.district || "",
        state: c.state || "", stateCode: c.stateCode || "", country: c.country || "India", pin: c.pin || "",
        gstin: c.gstin || "", phone: c.phone || "", email: c.email || "",
      };
    }
    if (!c.officeAddress) c.officeAddress = { line1: "", line2: "", city: "", state: "", country: "", pin: "" };
    if (!c.factoryAddress) c.factoryAddress = { line1: "", line2: "", city: "", state: "", country: "", pin: "" };
    if (c.officeSameAsRegistered == null) c.officeSameAsRegistered = true;
    if (c.officeSameAsRegistered) {
      c.officeAddress = {
        line1: c.registeredAddress.line1, line2: c.registeredAddress.line2, city: c.registeredAddress.city,
        state: c.registeredAddress.state, country: c.registeredAddress.country, pin: c.registeredAddress.pin,
      };
    }
    const regText = formatCompanyAddr(c.registeredAddress);
    if (regText) {
      c.address = regText;
      c.address1 = c.registeredAddress.line1;
      c.address2 = c.registeredAddress.line2;
      c.city = c.registeredAddress.city;
      c.state = c.registeredAddress.state;
      c.pin = c.registeredAddress.pin;
      c.country = c.registeredAddress.country;
    }
    db.company = c;
    (db.customers || []).forEach((cust) => {
      if (!cust.addresses || !cust.addresses.length) {
        if (VG.normalizeCustomer) Object.assign(cust, VG.normalizeCustomer(cust));
        else if (cust.billing) {
          cust.addresses = [{ id: "m" + Math.random().toString(36).slice(2, 8), type: "Billing", line1: cust.billing, city: "", state: cust.state || "", country: "India", pin: "", defaultBilling: true, defaultShipping: !cust.shipping }];
          if (cust.shipping) cust.addresses.push({ id: "m" + Math.random().toString(36).slice(2, 8), type: "Shipping", line1: cust.shipping, city: "", state: "", country: "India", pin: "", defaultBilling: false, defaultShipping: true });
        }
      }
      if (!cust.gstRegType) cust.gstRegType = cust.gstin ? "Regular" : "Unregistered";
      if (!cust.currency) cust.currency = "INR";
    });
  }

  function migrateManufacturers(db) {
    if (!Array.isArray(db.manufacturers)) db.manufacturers = [];
    if (!db.manufacturers.length) {
      db.manufacturers = [
        { id: "mfr1", code: "MFR-001", name: "OSRAM", brand: "OSRAM", country: "Germany", active: true },
        { id: "mfr2", code: "MFR-002", name: "Mean Well", brand: "Mean Well", country: "Taiwan", active: true },
        { id: "mfr3", code: "MFR-003", name: "Cree LED", brand: "Cree", country: "USA", active: true },
        { id: "mfr4", code: "MFR-004", name: "Ledil", brand: "Ledil", country: "Finland", active: true },
        { id: "mfr5", code: "MFR-005", name: "Kingboard", brand: "Kingboard", country: "China", active: true },
      ];
    }
    const defaults = {
      i1: { manufacturerId: "mfr2", manufacturerPartNumber: "LCM-36X", manufacturerDesc: "36W constant current LED driver", manufacturerModel: "LCM-36X", brandName: "Mean Well" },
      i2: { manufacturerId: "mfr2", manufacturerPartNumber: "LCM-50X", manufacturerDesc: "50W dimmable LED driver", manufacturerModel: "LCM-50X", brandName: "Mean Well" },
      i3: { manufacturerId: "mfr3", manufacturerPartNumber: "HS-AL-50", manufacturerDesc: "Extruded aluminium heat sink 50W class", manufacturerModel: "HS-AL-50", brandName: "Cree" },
      i4: { manufacturerId: "mfr1", manufacturerPartNumber: "HOUS-RND-7", manufacturerDesc: "Die-cast round downlight housing 7 inch", manufacturerModel: "HOUS-RND-7", brandName: "OSRAM" },
      i5: { manufacturerId: "mfr4", manufacturerPartNumber: "C13450-90", manufacturerDesc: "PMMA lens 90° beam angle", manufacturerModel: "C13450", brandName: "Ledil" },
      i6: { manufacturerId: "mfr5", manufacturerPartNumber: "KB-MCPCB-24", manufacturerDesc: "Metal core PCB 24 LED positions", manufacturerModel: "KB-MCPCB-24", brandName: "Kingboard" },
      i7: { manufacturerId: "mfr1", manufacturerPartNumber: "WIRE-2C-1.0", manufacturerDesc: "2-core copper wire 1.0 sqmm", manufacturerModel: "", brandName: "" },
    };
    (db.items || []).forEach((it) => {
      if (!it.manufacturerId && defaults[it.id]) Object.assign(it, defaults[it.id]);
      const mfr = it.manufacturerId ? (db.manufacturers || []).find((m) => m.id === it.manufacturerId) : null;
      it.manufacturerName = mfr ? mfr.name : (it.manufacturerName || "");
      it.mfrKey = itemMfrKey(it.manufacturerName, it.manufacturerPartNumber);
    });
  }

  const ALL_ACTIONS = ["view", "add", "edit", "delete", "approve", "reject", "print", "export", "import", "email", "settings"];
  const ROLE_MODULE_MAP = {
    admin: "all", hr: ["hr", "attendance", "reports", "documents", "support"],
    sales: ["sales", "enquiry", "reports", "documents", "support"],
    inventory: ["inventory", "purchase", "supplier", "reports", "documents"],
    production: ["production", "inventory", "quality", "reports", "documents"],
    quality: ["quality", "production", "reports", "documents"],
    accounts: ["accounts", "purchase", "reports", "documents"],
    dispatch: ["dispatch", "inventory", "reports", "documents"],
    employee: ["attendance", "support", "documents"],
  };

  function migrateLicense(db) {
    ["licenseKeys", "licenseActivations", "licenseHistory", "dataPathHistory", "connectedSessions", "revokedSessions", "recordLocks", "migrationLogs"].forEach((k) => {
      if (!Array.isArray(db[k])) db[k] = [];
    });
    if (!db.settings.activation.trialEndsAt) {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);
      db.settings.activation.trialEndsAt = trialEnd.toISOString().slice(0, 10);
      db.settings.activation.status = db.settings.activation.status || "Trial";
    }
    if (!(db.licenseKeys || []).length && typeof VG !== "undefined" && VG.generateSerial) {
      const serial = VG.generateSerial();
      const payload = {
        companyId: (db.company && db.company.id) || "co1",
        companyName: (db.company && db.company.name) || "Veraglo Industries",
        licenseType: "Enterprise",
        maxUsers: 50,
        maxDevices: 5,
        modules: ["all"],
        startDate: todayISO(),
        expiryDate: "2027-12-31",
        status: "Active",
      };
      const code = VG.generateActivationCode(serial, payload);
      db.licenseKeys = [{
        id: "lic_demo", serial, activationCode: code, ...payload,
        status: "Active", isDefault: true, remarks: "Demo enterprise license",
        createdAt: Date.now(), createdBy: "system",
      }];
    }
  }

  function migrateBoms(db) {
    if (!Array.isArray(db.boms)) db.boms = [];
    if (!Array.isArray(db.categories)) db.categories = [];
    if (!db.categories.some((c) => c.typeCode === "FNG")) {
      const n = db.categories.length + 1;
      db.categories.push({ id: "catfng", code: "CAT-" + n, name: "Finished Goods", typeCode: "FNG" });
    }
    (db.boms || []).forEach((b) => {
      if (b.revision === "A" || !b.revision) { b.revision = "Rev-00"; b.revisionNo = 0; }
      if (b.revisionNo == null) {
        const m = String(b.revision || "").match(/Rev-(\d+)/i);
        b.revisionNo = m ? parseInt(m[1], 10) : 0;
      }
      if (!Array.isArray(b.revisionHistory)) b.revisionHistory = [];
      if (!b.approvalStatus) b.approvalStatus = b.status === "Active" ? "Approved" : "Pending";
      const fg = (db.items || []).find((i) => i.id === b.finishedItemId);
      if (fg) {
        b.fgSku = fg.sku;
        b.fgName = b.fgName || fg.name;
        b.fgDescription = b.fgDescription || fg.description || fg.name;
        b.fgCategoryId = b.fgCategoryId || fg.categoryId;
      }
    });
    if (!(db.boms || []).length) {
      db.boms = [
        {
          id: "bom1", no: "BOM/2627/0001", revision: "Rev-00", revisionNo: 0, date: "2026-04-01", finishedItemId: "i2",
          fgSku: "GLSFNG0000001", fgName: "LED Driver 50W", fgDescription: "LED Driver 50W — finished assembly",
          name: "LED Driver 50W — Standard BOM", status: "Active", approvalStatus: "Approved", isDefault: true, qtyOutput: 1, unit: "Nos",
          department: "Assembly", line: "Line 1", cycleTimeMin: 45, remarks: "Standard assembly BOM", revisionHistory: [],
          lines: [
            { itemId: "i6", qty: 1, unit: "Nos", scrapPct: 2, issueMethod: "Manual", alternateAllowed: false, remarks: "MCPCB" },
            { itemId: "i3", qty: 1, unit: "Nos", scrapPct: 1, issueMethod: "Manual", alternateAllowed: false, remarks: "Heat sink" },
            { itemId: "i5", qty: 1, unit: "Nos", scrapPct: 0, issueMethod: "Manual", alternateAllowed: false, remarks: "Lens" },
            { itemId: "i7", qty: 0.8, unit: "Mtr", scrapPct: 5, issueMethod: "Backflush", alternateAllowed: false, remarks: "Wire harness" },
            { itemId: "i8", qty: 1, unit: "Nos", scrapPct: 0, issueMethod: "Manual", alternateAllowed: false, remarks: "Packaging" },
          ],
        },
        {
          id: "bom2", no: "BOM/2627/0002", revision: "Rev-00", revisionNo: 0, date: "2026-04-01", finishedItemId: "i1",
          fgSku: "GLSFNG0000002", fgName: "LED Driver 36W", fgDescription: "LED Driver 36W — finished assembly",
          name: "LED Driver 36W — Standard BOM", status: "Active", approvalStatus: "Approved", isDefault: true, qtyOutput: 1, unit: "Nos",
          department: "Assembly", line: "Line 1", cycleTimeMin: 38, remarks: "", revisionHistory: [],
          lines: [
            { itemId: "i6", qty: 1, unit: "Nos", scrapPct: 2, issueMethod: "Manual", alternateAllowed: false, remarks: "" },
            { itemId: "i3", qty: 1, unit: "Nos", scrapPct: 1, issueMethod: "Manual", alternateAllowed: false, remarks: "" },
            { itemId: "i7", qty: 0.6, unit: "Mtr", scrapPct: 5, issueMethod: "Backflush", alternateAllowed: false, remarks: "" },
            { itemId: "i8", qty: 1, unit: "Nos", scrapPct: 0, issueMethod: "Manual", alternateAllowed: false, remarks: "" },
          ],
        },
      ];
      db.seq.BOM = 2;
    }
  }

  function migrateAdmin(db) {
    const c = db.company || {};
    if (!c.legalName) c.legalName = c.name;
    if (!c.tradeName) c.tradeName = "Veraglo";
    if (!c.address1 && c.address) c.address1 = c.address;
    db.company = c;
    (db.locations || []).forEach((l) => { if (!l.locType) l.locType = "Warehouse"; if (!l.status) l.status = "Active"; });

    if (!(db.customRoles || []).length && typeof VG !== "undefined" && VG.ROLES) {
      db.customRoles = Object.keys(VG.ROLES).map((key, i) => {
        const r = VG.ROLES[key];
        return {
          id: "role_" + key, key, label: r.label, tag: r.tag, avatar: r.avatar, color: r.color,
          moduleAccess: r.modules, actions: r.actions || ["view"],
          permissions: {}, hierarchy: (i + 1) * 10, builtIn: true, active: true,
        };
      });
      db.customRoles.push(
        { id: "role_viewer", key: "viewer", label: "Viewer / Read Only", tag: "Read-only access", avatar: "RO", color: "#94a3b8", moduleAccess: ["sales", "inventory", "production", "reports"], actions: ["view", "print"], permissions: {}, hierarchy: 900, builtIn: true, active: true },
        { id: "role_auditor", key: "auditor", label: "Auditor", tag: "Audit & reports", avatar: "AU", color: "#64748b", moduleAccess: ["reports", "admin"], actions: ["view", "export", "print"], permissions: {}, hierarchy: 850, builtIn: true, active: true }
      );
    }
    /* erpUsers: no demo accounts — first administrator is created via in-app setup only */
    if (!(db.approvalWorkflows || []).length) {
      const types = ["Quotation discount", "Sales order", "Purchase request", "Purchase order", "Leave", "Vendor payment"];
      db.approvalWorkflows = types.map((t, i) => ({
        id: "wf" + i, process: t, levels: 1, amountThreshold: t.indexOf("discount") >= 0 ? 5000 : 0,
        departmentBased: false, roleApprovers: ["admin"], autoApproveBelow: 0, escalationHours: 24,
        remarksMandatory: true, active: true,
      }));
    }
    const tplBase = {
      active: true, themeId: "modern", fontFamily: "Inter, 'Segoe UI', Arial, sans-serif", fontSize: 10.5, logoSize: 52,
      logoPlacement: "left", pageSize: "A4", accentColor: "#2563eb", secondaryColor: "#1e3a8a", marginMm: 12,
      watermark: "", showQr: false, showSignatures: true, showStamp: true, showBankBlock: true, showAmountInWords: true,
      headerLayout: "banner", headerStyle: "banner", footerOverride: "", termsOverride: "",
      tableStyle: "professional", titleTransform: "uppercase", lineItemStriped: true, showDocRibbon: true,
    };
    (db.documentTemplates || []).forEach((t, i) => {
      const merged = { ...tplBase, ...t };
      if (!merged.themeId) merged.themeId = merged.tableStyle === "minimal" ? "minimal" : merged.headerLayout === "centered" ? "minimal" : "modern";
      if (!merged.headerStyle) merged.headerStyle = merged.headerLayout === "banner" ? "banner" : "split";
      if (merged.showBankBlock == null) merged.showBankBlock = true;
      if (merged.showAmountInWords == null) merged.showAmountInWords = true;
      if (merged.showDocRibbon == null) merged.showDocRibbon = true;
      db.documentTemplates[i] = merged;
    });
    const indPreset = typeof VG !== "undefined" && VG.applyDocThemePreset ? VG.applyDocThemePreset("industrial") : {};
    const premiumQtn = {
      ...indPreset,
      variant: "premium_offer",
      docTitleOverride: "Commercial Offer",
      showLogoOnly: true,
      showCompanyTagline: false,
      showCompanyNameInHeader: false,
      showDocSubtitle: false,
      logoSize: 72,
      showColoredTableHeader: false,
      showQr: true,
      accentColor: "#c8102e",
      textColor: "#1a1a1a",
      warrantyDefault: "Warranty: 12 months from the date of invoice.",
      roundOffEnabled: true,
      roundOffMode: "auto",
      titleLetterSpacing: "0.02em",
    };
    (db.documentTemplates || []).forEach((t, i) => {
      if (t.docType === "Quotation" && t.isDefault) {
        db.documentTemplates[i] = { ...premiumQtn, ...t, ...premiumQtn, name: t.name && t.name.indexOf("Premium") >= 0 ? t.name : "Premium Commercial Offer" };
      }
    });
    const qtnVariants = [
      { id: "tpl_q_compact", name: "Compact Quotation", variant: "compact_qtn", isDefault: false, fontSize: 9, logoSize: 48 },
      { id: "tpl_q_export", name: "Export Quotation", variant: "export_qtn", isDefault: false, showQr: true },
      { id: "tpl_q_gov", name: "Government Tender Quotation", variant: "gov_tender", isDefault: false, themeId: "classic", tableStyle: "bordered" },
      { id: "tpl_q_simple", name: "Simple Price Offer", variant: "simple_price", isDefault: false, themeId: "minimal", showSignatures: false },
    ];
    qtnVariants.forEach((v) => {
      if (!(db.documentTemplates || []).some((t) => t.id === v.id)) {
        db.documentTemplates = (db.documentTemplates || []).concat([{ docType: "Quotation", active: true, ...premiumQtn, ...v }]);
      }
    });
    if (typeof VG !== "undefined" && VG.applyDocThemePreset && !(db.documentTemplates || []).some((t) => t.docType === "Quotation" && t.themeId === "industrial" && t.id !== "tpl1")) {
      if (!(db.documentTemplates || []).some((t) => t.id === "tpl1ind")) {
        db.documentTemplates = (db.documentTemplates || []).concat([
          { id: "tpl1ind", docType: "Quotation", name: "Quotation — Industrial International", isDefault: false, active: true, ...premiumQtn },
        ]);
      }
    }
    if (!(db.documentTemplates || []).length) {
      const presets = typeof VG !== "undefined" && VG.applyDocThemePreset ? VG.applyDocThemePreset : () => tplBase;
      db.documentTemplates = [
        { id: "tpl1", docType: "Quotation", name: "Premium Commercial Offer", isDefault: true, variant: "premium_offer", docTitleOverride: "Commercial Offer", showLogoOnly: true, showCompanyTagline: false, showDocSubtitle: false, logoSize: 72, showQr: true, accentColor: "#c8102e", warrantyDefault: "Warranty: 12 months from the date of invoice.", roundOffEnabled: true, roundOffMode: "auto", ...presets("industrial") },
        { id: "tpl1a", docType: "Quotation", name: "Quotation — Executive", isDefault: false, ...presets("executive") },
        { id: "tpl1b", docType: "Quotation", name: "Quotation — Minimal (compact)", isDefault: false, ...presets("minimal") },
        { id: "tpl1c", docType: "Quotation", name: "Quotation — Warm Commerce", isDefault: false, ...presets("warm") },
        { id: "tpl2", docType: "Tax Invoice", name: "Tax Invoice — Corporate GST", isDefault: true, ...presets("corporate"), showQr: true },
        { id: "tpl2b", docType: "Tax Invoice", name: "Tax Invoice — Classic", isDefault: false, ...presets("classic") },
        { id: "tpl3", docType: "Purchase Order", name: "Purchase Order — Modern", isDefault: true, ...presets("modern") },
        { id: "tpl4", docType: "Salary Slip", name: "Salary Slip — Classic", isDefault: true, ...presets("classic"), fontSize: 10, showDocRibbon: false },
        { id: "tpl5", docType: "Proforma Invoice", name: "Proforma — Executive", isDefault: true, ...presets("executive") },
        { id: "tpl6", docType: "Delivery Challan", name: "Delivery Challan — Modern", isDefault: true, ...presets("modern") },
        { id: "tpl7", docType: "Material Receipt Note", name: "GRN — Corporate", isDefault: true, ...presets("corporate") },
        { id: "tpl8", docType: "Purchase Order", name: "PO — Warm Commerce", isDefault: false, ...presets("warm") },
      ];
    }
    if (!(db.numberSeries || []).length) {
      const defs = [
        ["QTN", "Quotation"], ["PI", "Proforma Invoice"], ["SO", "Sales Order"], ["PO", "Purchase Order"],
        ["MRN", "Material Receipt"], ["MIS", "Material Issue"], ["RC", "Returnable Challan"], ["INV", "Tax Invoice"],
      ];
      db.numberSeries = defs.map(([prefix, label], i) => ({
        id: "ns" + i, docType: label, prefix: "GLS/" + prefix, useFy: true, padding: 4, reset: "Yearly",
        branchWise: false, manualOverride: false, active: true,
      }));
    }
    const extraRoles = [
      { id: "role_super", key: "super_admin", label: "Super Admin", tag: "Unrestricted control", avatar: "SA", color: "#dc2626", moduleAccess: "all", actions: ALL_ACTIONS, permissions: {}, hierarchy: 1, builtIn: true, active: true },
      { id: "role_sm", key: "sales_manager", label: "Sales Manager", tag: "Sales leadership", avatar: "SM", color: "#4f46e5", moduleAccess: ["sales", "enquiry", "reports", "documents"], actions: ["view", "add", "edit", "delete", "approve", "export", "print"], permissions: {}, hierarchy: 40, builtIn: true, active: true },
      { id: "role_se", key: "sales_executive", label: "Sales Executive", tag: "Field sales", avatar: "SE", color: "#6366f1", moduleAccess: ["sales", "enquiry", "documents"], actions: ["view", "add", "edit", "export", "print"], permissions: {}, hierarchy: 50, builtIn: true, active: true },
      { id: "role_pm", key: "purchase_manager", label: "Purchase Manager", tag: "Procurement lead", avatar: "PM", color: "#d97706", moduleAccess: ["purchase", "supplier", "inventory", "reports"], actions: ["view", "add", "edit", "approve", "export", "print"], permissions: {}, hierarchy: 45, builtIn: true, active: true },
      { id: "role_im", key: "inventory_manager", label: "Inventory Manager", tag: "Stock control", avatar: "IM", color: "#059669", moduleAccess: ["inventory", "purchase", "reports"], actions: ["view", "add", "edit", "delete", "approve", "export", "print"], permissions: {}, hierarchy: 45, builtIn: true, active: true },
      { id: "role_qm", key: "quality_manager", label: "Quality Manager", tag: "QC leadership", avatar: "QM", color: "#7c3aed", moduleAccess: ["quality", "production", "reports"], actions: ["view", "add", "edit", "approve", "export", "print"], permissions: {}, hierarchy: 45, builtIn: true, active: true },
    ];
    extraRoles.forEach((r) => { if (!(db.customRoles || []).some((x) => x.key === r.key)) db.customRoles.push(r); });
    if (!(db.fieldPermissions || []).length) {
      db.fieldPermissions = [
        { id: "fp1", module: "quotation", field: "discountPct", roleKey: "sales_executive", visible: true, editable: true, mandatory: false, approvalRequired: true },
        { id: "fp2", module: "quotation", field: "rate", roleKey: "sales_executive", visible: true, editable: false, mandatory: false, approvalRequired: false },
        { id: "fp3", module: "item", field: "rate", roleKey: "quality", visible: true, editable: false, mandatory: false, approvalRequired: false },
      ];
    }
  }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw && raw._v) return migrate(raw);
    } catch (e) {}
    const fresh = seed();
    try { localStorage.setItem(KEY, JSON.stringify(fresh)); } catch (e) {}
    return fresh;
  }
  const SNAP_KEY = "veraglo-erp-snapshots";

  function apiBase() {
    return (typeof VG !== "undefined" && VG.apiBase != null) ? String(VG.apiBase) : "";
  }

  async function pushStateToApi() {
    if (!_usePostgres) return;
    try {
      const res = await fetch(apiBase() + "/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(DB),
      });
      if (!res.ok) throw new Error("PUT /api/state " + res.status);
    } catch (e) {
      console.warn("[Veraglo store] PostgreSQL sync failed:", e.message || e);
    }
  }

  let persistTimer;
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) {}
    clearTimeout(persistTimer);
    persistTimer = setTimeout(pushStateToApi, 400);
  }
  function notify() { persist(); listeners.forEach((fn) => fn()); }

  let counter = Date.now();
  const uid = (p) => (p || "x") + (++counter).toString(36);

  function newPasswordSalt() {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const a = new Uint8Array(16);
      crypto.getRandomValues(a);
      return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
    }
    return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  async function hashPassword(password, salt) {
    const text = (salt || "") + ":" + String(password || "");
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h) ^ text.charCodeAt(i);
    return "legacy-" + (h >>> 0).toString(16);
  }

  function migrateAuth(db) {
    if (!Array.isArray(db.revokedSessions)) db.revokedSessions = [];
    (db.erpUsers || []).forEach((u) => {
      if (u.isDeleted == null) u.isDeleted = false;
      if (u.isDeleted) {
        u.status = u.status || "Deleted";
        u.loginAllowed = false;
      }
      if (u.status === "Deleted" && !u.isDeleted) u.isDeleted = true;
      if (u.password) {
        delete u.password;
        if (!u.passwordHash) u.forcePasswordChange = true;
      }
    });
    /* Remove legacy auto-seeded accounts that never had a real password */
    if ((db._v || 0) < 9) {
      const before = (db.erpUsers || []).length;
      db.erpUsers = (db.erpUsers || []).filter((u) => u.passwordHash && String(u.passwordHash).length > 8);
      if (before !== (db.erpUsers || []).length) {
        db.auditLog = (db.auditLog || []).concat({
          id: "A-migrate-auth", ts: Date.now(), actor: "system", action: "cleanup", entity: "erpUsers",
          refId: "-", summary: "Removed " + (before - db.erpUsers.length) + " initial demo user(s) without passwords",
        });
      }
      delete db._authBootstrapDone;
    }
  }

  const store = {
    db: () => DB,
    company: () => DB.company,
    list(coll, opts) {
      let rows = DB[coll] || [];
      if (coll === "erpUsers" && !(opts && opts.includeDeleted)) rows = rows.filter((u) => !u.isDeleted);
      return rows;
    },
    get: (coll, id) => (DB[coll] || []).find((x) => x.id === id),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    nextNo(prefix, dateRef) {
      const DOC_BY_PREFIX = {
        QTN: "Quotation", PI: "Proforma Invoice", SO: "Sales Order", PO: "Purchase Order",
        PR: "Purchase Request", MRN: "Material Receipt", MIS: "Material Issue", RC: "Returnable Challan",
        INV: "Tax Invoice", QC: "QC Report", NCR: "QC Report", WO: "Work Order", SH: "Delivery Challan",
        LP: "Leave", PAY: "Salary Slip",
      };
      const docType = DOC_BY_PREFIX[prefix];
      const ser = docType && (DB.numberSeries || []).find((s) => s.active !== false && s.docType === docType);
      if (ser) {
        const sk = "NS_" + ser.id;
        DB.seq[sk] = (DB.seq[sk] || 0) + 1;
        const n = String(DB.seq[sk]).padStart(Number(ser.padding) || 4, "0");
        const parts = String(ser.prefix || "GLS/" + prefix).split("/").filter(Boolean);
        if (ser.useFy) parts.push(fyCode(dateRef));
        parts.push(n);
        return parts.join("/");
      }
      DB.seq[prefix] = (DB.seq[prefix] || 0) + 1;
      return prefix + "/" + fyCode(dateRef) + "/" + String(DB.seq[prefix]).padStart(4, "0");
    },

    // Category master code: CAT-1, CAT-2 … continues from highest existing (CAT-8 → CAT-9).
    nextCategoryCode() {
      let max = 0;
      (DB.categories || []).forEach((c) => {
        if (!c.code) return;
        const m = String(c.code).toUpperCase().match(/^CAT-?(\d+)$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      return "CAT-" + (max + 1);
    },

    skuCompanyPrefix() {
      const cfg = (DB.settings && DB.settings.skuNumbering) || {};
      return cfg.companyPrefix || "GLS";
    },
    nextSkuByType(typeCode) {
      if (typeof VG !== "undefined" && VG.skuEngine && VG.skuEngine.preview) {
        try { return VG.skuEngine.preview(typeCode); } catch (e) { console.warn("[SKU]", e.message); }
      }
      const stem = this.skuCompanyPrefix() + String(typeCode || "RWM").replace(/\s+/g, "").toUpperCase();
      let max = 0;
      (DB.items || []).forEach((it) => {
        if (!it.sku) return;
        const u = String(it.sku).toUpperCase();
        if (!u.startsWith(stem)) return;
        const m = u.slice(stem.length).match(/^(\d{1,7})$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      return stem + String(max + 1).padStart(7, "0");
    },
    nextSku(categoryId) {
      if (typeof VG !== "undefined" && VG.skuEngine && VG.skuEngine.preview) {
        try { return VG.skuEngine.preview(categoryId, true); } catch (e) { console.warn("[SKU]", e.message); }
      }
      const cat = categoryId ? this.get("categories", categoryId) : null;
      return this.nextSkuByType(cat && cat.typeCode);
    },

    nextManufacturerCode() {
      let max = 0;
      (DB.manufacturers || []).forEach((m) => {
        if (!m.code) return;
        const match = String(m.code).toUpperCase().match(/^MFR-?(\d+)$/);
        if (match) max = Math.max(max, parseInt(match[1], 10));
      });
      return "MFR-" + String(max + 1).padStart(3, "0");
    },

    normalizeMfrName,
    normalizeMfrPart,
    itemMfrKey,
    manufacturerNameForItem(item) {
      if (!item) return "";
      if (item.manufacturerName) return item.manufacturerName;
      if (item.manufacturerId) return (this.get("manufacturers", item.manufacturerId) || {}).name || "";
      return "";
    },
    prepareItemMfrFields(item) {
      const merged = { ...item };
      merged.manufacturerName = this.manufacturerNameForItem(merged);
      merged.manufacturerPartNumber = String(merged.manufacturerPartNumber || "").trim();
      merged.mfrKey = itemMfrKey(merged.manufacturerName, merged.manufacturerPartNumber);
      return merged;
    },
    findDuplicateItemMfr(item, excludeItemId) {
      const prep = this.prepareItemMfrFields(item);
      if (!prep.mfrKey) return null;
      return (DB.items || []).find((it) => {
        if (excludeItemId && it.id === excludeItemId) return false;
        const key = it.mfrKey || itemMfrKey(this.manufacturerNameForItem(it), it.manufacturerPartNumber);
        return key === prep.mfrKey;
      }) || null;
    },
    validateItemMfrDuplicate(item, excludeItemId) {
      const data = this.prepareItemMfrFields(item);
      const dup = this.findDuplicateItemMfr(data, excludeItemId);
      if (dup) return { ok: false, message: ITEM_MFR_DUP_MSG, duplicate: dup, data };
      return { ok: true, data };
    },
    scanMfrDuplicates() {
      const byKey = {};
      (DB.items || []).forEach((it) => {
        const key = it.mfrKey || itemMfrKey(this.manufacturerNameForItem(it), it.manufacturerPartNumber);
        if (!key) return;
        if (!byKey[key]) byKey[key] = [];
        byKey[key].push(it);
      });
      return Object.keys(byKey).filter((k) => byKey[k].length > 1).map((key) => ({ key, items: byKey[key] }));
    },
    manufacturerPurchaseHistory() {
      const rows = [];
      (DB.materialReceipts || []).forEach((r) => {
        const it = this.get("items", r.itemId);
        if (!it) return;
        rows.push({
          id: "mr-" + r.id, date: r.date, docType: "Material Receipt", docNo: r.no,
          manufacturer: this.manufacturerNameForItem(it), partNo: it.manufacturerPartNumber || "",
          sku: it.sku, itemName: it.name, qty: r.qtyReceived || r.qtyAccepted || 0, value: r.totalValue || 0,
        });
      });
      (DB.purchaseOrders || []).forEach((po) => {
        (po.lines || []).forEach((l, i) => {
          const it = this.get("items", l.itemId);
          if (!it) return;
          rows.push({
            id: "po-" + po.id + "-" + i, date: po.date, docType: "Purchase Order", docNo: po.no,
            manufacturer: this.manufacturerNameForItem(it), partNo: it.manufacturerPartNumber || "",
            sku: it.sku, itemName: it.name, qty: l.qty, value: (Number(l.qty) || 0) * (Number(l.rate) || 0),
          });
        });
      });
      (DB.purchaseRequests || []).forEach((pr) => {
        const it = this.get("items", pr.itemId);
        if (!it) return;
        rows.push({
          id: "pr-" + pr.id, date: pr.date, docType: "Purchase Request", docNo: pr.no,
          manufacturer: this.manufacturerNameForItem(it), partNo: it.manufacturerPartNumber || "",
          sku: it.sku, itemName: it.name, qty: pr.qty, value: 0,
        });
      });
      return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    },

    create(coll, obj, actor) {
      if (coll === "items") {
        if (typeof VG !== "undefined" && VG.skuEngine && !obj.skuGeneratedAt && !obj._skuPrepared) {
          const prep = VG.skuEngine.prepareCreate(obj, actor, { module: obj._skuModule || "Item Master" });
          if (!prep.ok) {
            if (VG.toast) VG.toast(prep.message, "error");
            return null;
          }
          obj = prep.item;
        }
        const v = this.validateItemMfrDuplicate(obj);
        if (!v.ok) {
          if (typeof VG !== "undefined" && VG.toast) VG.toast(v.message, "error");
          return null;
        }
        obj = v.data;
      }
      const rec = { id: uid(coll.slice(0, 2)), createdAt: Date.now(), ...obj };
      DB[coll] = (DB[coll] || []).concat(rec);
      this.audit(actor, "create", coll, rec.no || rec.code || rec.id, summarize(coll, rec));
      notify();
      return rec;
    },
    update(coll, id, patch, actor) {
      const lockErr = this.checkRecordLock(coll, id, actor);
      if (lockErr) return null;
      const prev = this.get(coll, id);
      if (coll === "items" && prev) {
        if (typeof VG !== "undefined" && VG.skuEngine) {
          const skuPrep = VG.skuEngine.prepareUpdate(prev, patch, actor);
          if (!skuPrep.ok) {
            if (VG.toast) VG.toast(skuPrep.message, "error");
            return null;
          }
          patch = skuPrep.patch;
        }
        const v = this.validateItemMfrDuplicate({ ...prev, ...patch }, id);
        if (!v.ok) {
          if (typeof VG !== "undefined" && VG.toast) VG.toast(v.message, "error");
          return null;
        }
        patch = { ...patch, manufacturerName: v.data.manufacturerName, mfrKey: v.data.mfrKey };
      }
      let updated = null;
      DB[coll] = (DB[coll] || []).map((x) => (x.id === id ? (updated = { ...x, ...patch, updatedAt: Date.now() }) : x));
      const changed = prev && Object.keys(patch).filter((k) => k !== "updatedAt" && JSON.stringify(prev[k]) !== JSON.stringify(patch[k])).slice(0, 4);
      this.audit(actor, "update", coll, (updated && (updated.no || updated.code)) || id, summarize(coll, updated || {}), changed && changed.length ? { oldValue: changed.map((k) => k + ": " + prev[k]).join("; "), newValue: changed.map((k) => k + ": " + updated[k]).join("; ") } : null);
      if (coll === "manufacturers" && updated && patch.name) {
        (DB.items || []).filter((it) => it.manufacturerId === id).forEach((it) => {
          const prep = this.prepareItemMfrFields({ ...it });
          const dup = this.findDuplicateItemMfr(prep, it.id);
          if (!dup) {
            DB.items = DB.items.map((x) => (x.id === it.id ? { ...x, manufacturerName: prep.manufacturerName, mfrKey: prep.mfrKey } : x));
          }
        });
      }
      notify();
      return updated;
    },
    remove(coll, id, actor) {
      if (coll === "erpUsers") return this.deleteErpUser(id, actor);
      const rec = this.get(coll, id);
      DB[coll] = (DB[coll] || []).filter((x) => x.id !== id);
      this.audit(actor, "delete", coll, (rec && (rec.no || rec.code)) || id, summarize(coll, rec || {}));
      notify();
    },

    audit(actor, action, entity, refId, summary, meta) {
      const m = meta || {};
      DB.auditLog = (DB.auditLog || []).concat({
        id: uid("A"), ts: Date.now(), actor: actor || "system", action, entity, refId: refId || "-",
        summary: summary || "", module: m.module || entity, oldValue: m.oldValue, newValue: m.newValue,
        ip: m.ip || "", device: m.device || "",
      });
      if (DB.auditLog.length > 500) DB.auditLog = DB.auditLog.slice(-500);
      persist();
    },

    /* ----- stock engine ----- */
    ledgerFor(itemId, locationId) {
      return DB.stockLedger.filter((e) => e.itemId === itemId && (!locationId || e.locationId === locationId));
    },
    onHand(itemId, locationId) {
      return this.ledgerFor(itemId, locationId).reduce((s, e) => s + e.qty, 0);
    },
    postLedger(entry, actor) {
      const rec = { id: uid("L"), date: entry.date || todayISO(), batch: "", ref: "", by: actor || "system", ...entry };
      DB.stockLedger = DB.stockLedger.concat(rec);
      notify();
      return rec;
    },
    stockSummary() {
      return DB.items.map((it) => {
        const qty = this.onHand(it.id);
        return {
          ...it, qty,
          value: qty * it.rate,
          below: qty < it.minStock,
          reorderNeeded: qty < it.reorder,
        };
      });
    },

    /* ----- cross-module workflow engine ----- */
    // Material Receipt entry point. When QC is required, the goods are held
    // (no stock posted) and a pending inspection lands in the Quality dept.
    // When QC is not required, accepted qty is posted to stock immediately.
    postReceipt(receipt, actor) {
      const acc = Number(receipt.qtyAccepted ?? receipt.qtyReceived) || 0;
      const no = receipt.no || this.nextNo("MRN", receipt.date);
      const rec = this.create("materialReceipts", { ...receipt, no, totalValue: receipt.totalValue || 0, createdBy: actor }, actor);
      if (receipt.qcRequired === "Yes") {
        const insp = this.create("qcInspections", {
          no: this.nextNo("QC", receipt.date), date: receipt.date, source: "Incoming (GRN)",
          receiptId: rec.id, receiptNo: rec.no, itemId: receipt.itemId, supplierId: receipt.supplierId,
          locationId: receipt.locationId, batch: receipt.batch || "", qtyReceived: acc, sampleSize: "",
          status: "Pending", result: "", remarks: "", inspectedBy: "",
        }, actor);
        this.update("materialReceipts", rec.id, { qcStatus: "Pending", qcInspectionId: insp.id }, actor);
      } else {
        this.postLedger({ itemId: receipt.itemId, locationId: receipt.locationId, type: "receipt", qty: acc, ref: rec.no, batch: receipt.batch || "", date: receipt.date }, actor);
        this.update("materialReceipts", rec.id, { qcStatus: "Not required" }, actor);
        this.audit(actor, "stock-in", "stockLedger", rec.no, "Receipt " + acc + " accepted to stock");
      }
      return rec;
    },
    // Quality decision on an incoming inspection.
    decideInspection(inspId, result, payload, actor) {
      const insp = this.get("qcInspections", inspId);
      if (!insp) return;
      const acceptQty = Number(payload.acceptQty ?? insp.qtyReceived) || 0;
      const rejectQty = Number(payload.rejectQty) || 0;
      this.update("qcInspections", inspId, { status: result, result, acceptQty, rejectQty, remarks: payload.remarks || "", inspectedBy: actor, decidedAt: Date.now() }, actor);
      if (insp.receiptId) this.update("materialReceipts", insp.receiptId, { qcStatus: result === "Accepted" ? "Passed" : result === "Rejected" ? "Failed" : "Partial" }, actor);
      if (acceptQty > 0) {
        this.postLedger({ itemId: insp.itemId, locationId: insp.locationId, type: "receipt", qty: acceptQty, ref: insp.receiptNo || insp.no, batch: insp.batch || "", date: todayISO() }, actor);
        this.audit(actor, "stock-in", "stockLedger", insp.no, "QC accepted " + acceptQty + " to stock");
      }
      if (rejectQty > 0 || result === "Rejected") {
        this.create("ncrs", { no: this.nextNo("NCR", todayISO()), date: todayISO(), source: "Incoming", inspectionId: inspId, itemId: insp.itemId, supplierId: insp.supplierId, qty: rejectQty || insp.qtyReceived, disposition: payload.disposition || "Supplier Return", status: "Open", remarks: payload.remarks || "", raisedBy: actor }, actor);
      }
      return insp;
    },
    // Convert an approved purchase request into a purchase order.
    poFromRequest(prId, extra, actor) {
      const pr = this.get("purchaseRequests", prId);
      if (!pr) return null;
      const item = this.get("items", pr.itemId) || {};
      const rate = (extra && extra.rate) || item.rate || 0;
      const po = this.create("purchaseOrders", {
        no: this.nextNo("PO", todayISO()), date: todayISO(), supplierId: (extra && extra.supplierId) || pr.supplierId || "",
        prId, lines: [{ itemId: pr.itemId, qty: pr.qty, uom: pr.uom || item.unit, rate, taxId: item.taxId }],
        status: "Open", received: false, total: rate * (Number(pr.qty) || 0), preparedBy: actor,
      }, actor);
      this.update("purchaseRequests", prId, { status: "Ordered", poId: po.id, poNo: po.no }, actor);
      return po;
    },
    raisePRFromItem(itemId, qty, actor) {
      const it = this.get("items", itemId) || {};
      return this.create("purchaseRequests", { no: this.nextNo("PR", todayISO()), date: todayISO(), itemId, qty: qty || it.reorder || 0, uom: it.unit, priority: "High", reason: "Below reorder level", status: "Pending", raisedBy: actor, supplierId: "" }, actor);
    },

    // Live, cross-module task list — drives notifications and module dashboards.
    openTasks() {
      const t = [];
      const push = (module, section, label, count, tone) => { if (count > 0) t.push({ module, section, label, count, tone }); };
      const qc = (DB.qcInspections || []);
      push("quality", "inspections", "Material inspections pending", qc.filter((x) => x.status === "Pending").length, "#8b5cf6");
      push("quality", "ncr", "Non-conformance (NCR) open", (DB.ncrs || []).filter((x) => x.status === "Open").length, "#ef4444");
      const low = this.stockSummary().filter((s) => s.reorderNeeded);
      push("inventory", "alerts", "Items below reorder level", low.length, "#f59e0b");
      push("inventory", "issue", "Returnable challans pending return", (DB.materialIssues || []).filter((x) => x.pendingReturn).length, "#22d3ee");
      push("purchase", "requests", "Purchase requests to approve", (DB.purchaseRequests || []).filter((x) => x.status === "Pending").length, "#f59e0b");
      push("purchase", "orders", "POs awaiting material receipt", (DB.purchaseOrders || []).filter((x) => x.status === "Open" || x.status === "Approved").length, "#22d3ee");
      push("sales", "followups", "Follow-ups due", (DB.followups || []).filter((x) => x.status === "Pending" && (x.date || "") <= todayISO()).length, "#6366f1");
      push("sales", "discounts", "Quotation approvals waiting", (DB.quotations || []).filter((x) => x.status === "Pending Approval").length, "#f59e0b");
      push("sales", "revisions", "Sales order revisions waiting approval", (DB.salesOrders || []).filter((x) => x.revisionPendingApproval).length, "#f59e0b");
      push("production", "orders", "Work orders pending BOM", (DB.workOrders || []).filter((x) => x.status === "BOM Pending" || x.status === "BOM Under Review").length, "#ef4444");
      push("production", "orders", "WOs in progress", (DB.workOrders || []).filter((x) => x.status === "Production In Progress" || x.status === "Running" || x.status === "Released").length, "#f59e0b");
      push("production", "orders", "Approved revisions to acknowledge", (DB.workOrders || []).filter((w) => w.revisionPendingAck).length, "#22d3ee");
      push("production", "mrp", "WOs pending material issue", (DB.workOrders || []).filter((w) => (w.status === "Production Planned" || w.status === "Running" || w.status === "Released") && !w.materialsIssuedAt).length, "#8b5cf6");
      push("production", "mrp", "Material requirements to plan", (DB.workOrders || []).filter((w) => (w.status === "BOM Approved" || w.status === "Production Planned") && !w.materialRequirementId).length, "#a78bfa");
      push("inventory", "issue", "Material requirements received", (DB.materialRequirements || []).filter((m) => m.status === "Open" || m.status === "Partially Issued" || m.status === "Shortage Pending").length, "#22d3ee");
      push("inventory", "issue", "Finished goods pending acceptance", (DB.finishedGoodsTransfers || []).filter((x) => x.status === "Pending Stores Acceptance").length, "#10b981");
      push("quality", "inspections-prod", "Final QC pending", (DB.qcIssues || []).filter((x) => x.status === "Pending Inspection" || x.status === "Under Inspection").length, "#8b5cf6");
      push("dispatch", "shipments", "Orders ready from QC", (DB.dispatchQueue || []).filter((x) => x.status === "Ready").length, "#f97316");
      push("inventory", "bom", "Draft BOMs to activate", (DB.boms || []).filter((b) => b.status === "Draft").length, "#94a3b8");
      push("dispatch", "shipments", "Shipments pending dispatch", (DB.shipments || []).filter((x) => x.status === "Pending" || x.status === "Packing").length, "#f97316");
      push("dispatch", "shipments", "In-transit deliveries", (DB.shipments || []).filter((x) => x.status === "In-transit").length, "#22d3ee");
      push("accounts", "receivables", "Orders ready to invoice", (DB.salesOrders || []).filter((x) => x.stage === "Dispatched" || x.stage === "Ready to Dispatch").filter((x) => !(DB.invoices || []).some((i) => i.salesOrderId === x.id)).length, "#0891b2");
      push("accounts", "receivables", "Overdue invoices", (DB.invoices || []).filter((x) => x.status !== "Paid" && x.dueDate && x.dueDate < todayISO()).length, "#ef4444");
      push("hr", "leave", "Leave pending approval", (DB.leaveRequests || []).filter((x) => x.status === "Pending").length, "#ec4899");
      push("hr", "payroll", "Payroll not run this month", (DB.payrollRuns || []).some((p) => p.month === todayISO().slice(0, 7)) ? 0 : 1, "#db2777");
      return t;
    },
    tasksFor(moduleId) { return this.openTasks().filter((x) => x.module === moduleId); },

    /* ----- order-to-cash workflow (SO → Production → Dispatch → Invoice) ----- */
    _soTimeline(soId, action, by, note) {
      const so = this.get("salesOrders", soId);
      if (!so) return;
      const timeline = (so.timeline || []).concat({ ts: Date.now(), action, by: by || "system", note: note || "" });
      this.update("salesOrders", soId, { timeline }, by);
    },
    _setSOStage(soId, stage, actor, note) {
      const patch = { stage };
      if (stage === "Invoiced") patch.status = "Invoiced";
      this.update("salesOrders", soId, patch, actor);
      if (note) this._soTimeline(soId, "stage", actor, stage + " — " + note);
    },
    salesOrderStatuses() {
      return [
        "Created / Saved", "Sent to Production", "Accepted by Production", "Material Required", "Material Partially Issued",
        "Material Fully Issued", "Production In Progress", "Production Completed", "Sent to Finished Goods Store",
        "Sent to Quality", "QC Pending", "QC Accepted", "Ready for Dispatch",
        "Partially Dispatched", "Fully Dispatched", "Closed", "Cancelled", "On Hold",
      ];
    },
    productionStatuses() {
      return ["Not Started", "Planned", "Material Awaited", "In Progress", "Partially Completed", "Completed", "Hold", "Cancelled"];
    },
    issueStatuses() {
      return ["Not Issued", "Partially Issued", "Fully Issued", "Shortage Pending", "Awaiting Purchase", "Closed"];
    },
    workOrderStatuses() {
      return [
        "Received from Sales", "BOM Pending", "BOM Under Review", "BOM Approved", "Material Requirement Generated",
        "Material Availability Checked", "Material Partially Issued", "Material Fully Issued", "Production Planned",
        "Production In Progress", "Production Completed", "Material Returned", "Sent to Finished Goods Store", "Closed",
      ];
    },
    _soMask(ref) {
      if (!ref) return "";
      return String(ref).replace(/.(?=.{4})/g, "•");
    },
    canViewCustomerForRole(roleKey) {
      return ["admin", "sales", "accounts", "dispatch"].includes(roleKey);
    },
    workOrderViewForRole(wo, roleKey) {
      if (!wo) return wo;
      if (this.canViewCustomerForRole(roleKey)) return wo;
      const masked = wo.salesOrderNo ? this._soMask(wo.salesOrderNo) : "";
      return {
        ...wo,
        salesOrderNoMasked: masked,
        salesOrderNo: masked || wo.salesOrderNo,
        customerId: "",
        customerName: "",
        customerPoRef: "",
        paymentTermsId: "",
        deliveryTermsId: "",
        contact: "",
        dispatchAddress: "",
      };
    },
    createProductionRequestFromSO(soId, actor) {
      const so = this.get("salesOrders", soId);
      if (!so) return null;
      const existing = (DB.workOrders || []).find((w) => w.salesOrderId === soId && w.status !== "Cancelled");
      if (existing) return existing;
      const line = (so.lines || [])[0] || {};
      const qty = (so.lines || []).reduce((s, l) => s + (Number(l.qty) || 0), 0) || Number(line.qty) || 0;
      const fgItem = line.itemId ? this.get("items", line.itemId) : (line.sku ? this.findItemBySku(line.sku) : null);
      const bom = fgItem ? this.getDefaultBom(fgItem.id) : null;
      const wo = this.create("workOrders", {
        no: this.nextNo("WO", so.date), date: todayISO(), salesOrderId: soId, salesOrderNo: so.no,
        customerId: so.customerId, customerPoRef: so.customerPoRef || "", priority: so.priority || "Normal",
        product: line.desc || line.sku || "Order " + so.no, sku: line.sku || "", technicalSpec: so.technicalSpec || line.spec || "",
        productionInstructions: so.specialInstructions || "", drawingRef: so.drawingRef || "", documentRef: so.documents || "",
        finishedItemId: fgItem ? fgItem.id : "", bomId: bom ? bom.id : "", bomNo: bom ? bom.no : "",
        qtyPlanned: qty, qtyProduced: 0, targetDate: so.deliveryDate || "", requiredDate: so.deliveryDate || "",
        status: bom ? "Received from Sales" : "BOM Pending", productionStatus: "Not Started", issueStatus: "Not Issued", preparedBy: actor,
        revisionNo: "Rev-00", revisionIndex: 0, revisionHistory: [],
        bomRevisionNo: bom ? (bom.revision || "Rev-00") : "",
      }, actor);
      return wo;
    },
    sendSalesOrderToProduction(soId, actor) {
      const so = this.get("salesOrders", soId);
      if (!so) return null;
      const wo = this.createProductionRequestFromSO(soId, actor);
      if (!wo) return null;
      this._setSOStage(soId, "Sent to Production", actor, "Work order request " + wo.no + " generated");
      return this.get("workOrders", wo.id);
    },
    approveSalesOrderRevision(soId, actor) {
      const so = this.get("salesOrders", soId);
      if (!so || !so.revisionPendingApproval) return so;
      const revNo = Number(so.revisionNo || 0);
      const approvedAt = Date.now();
      this.update("salesOrders", soId, {
        revisionPendingApproval: false,
        revisionApprovedAt: approvedAt,
        revisionApprovedBy: actor,
      }, actor);
      const wo = (DB.workOrders || []).find((w) => w.salesOrderId === soId && w.status !== "Cancelled");
      if (wo) {
        this.update("workOrders", wo.id, {
          priority: so.priority || wo.priority,
          technicalSpec: so.technicalSpec || wo.technicalSpec,
          productionInstructions: so.specialInstructions || wo.productionInstructions,
          requiredDate: so.deliveryDate || wo.requiredDate,
          revisionNo: revNo,
          revisionPendingAck: true,
          revisionApprovedAt: approvedAt,
          revisionApprovedBy: actor,
        }, actor);
      }
      this._soTimeline(soId, "revision-approved", actor, "Revision " + revNo + " approved and shared with production");
      return this.get("salesOrders", soId);
    },
    rejectSalesOrderRevision(soId, actor, reason) {
      const so = this.get("salesOrders", soId);
      if (!so || !so.revisionPendingApproval) return so;
      const revNo = Number(so.revisionNo || 0);
      this.update("salesOrders", soId, {
        revisionPendingApproval: false,
        revisionRejectedAt: Date.now(),
        revisionRejectedBy: actor,
        revisionRejectReason: reason || "",
      }, actor);
      this._soTimeline(soId, "revision-rejected", actor, "Revision " + revNo + " rejected" + (reason ? " — " + reason : ""));
      return this.get("salesOrders", soId);
    },
    acknowledgeWorkOrderRevision(woId, actor) {
      const wo = this.get("workOrders", woId);
      if (!wo) return null;
      this.update("workOrders", woId, {
        revisionPendingAck: false,
        revisionAckAt: Date.now(),
        revisionAckBy: actor,
      }, actor);
      if (wo.salesOrderId) this._soTimeline(wo.salesOrderId, "revision-ack", actor, "Production acknowledged revision " + (wo.revisionNo || ""));
      return this.get("workOrders", woId);
    },
    useExistingBomForWorkOrder(woId, bomId, actor) {
      const wo = this.get("workOrders", woId);
      const bom = this.get("boms", bomId);
      if (!wo || !bom || bom.status !== "Active") return null;
      this.update("workOrders", woId, {
        bomId: bom.id, bomNo: bom.no, bomRevisionNo: bom.revision || "Rev-00",
        status: "BOM Approved", bomApprovedAt: Date.now(), bomApprovedBy: actor,
      }, actor);
      if (wo.salesOrderId) {
        this._setSOStage(wo.salesOrderId, "BOM Finalized", actor, "Selected existing BOM " + bom.no);
        this._soTimeline(wo.salesOrderId, "bom-selected", actor, "Selected existing BOM " + bom.no + " (" + (bom.revision || "Rev-00") + ")");
      }
      return this.get("workOrders", woId);
    },
    createWorkOrderSpecificBom(woId, payload, actor) {
      const wo = this.get("workOrders", woId);
      if (!wo) return null;
      const rec = this.create("boms", {
        no: this.nextNo("BOM", todayISO()), date: todayISO(), name: payload.name || ("WO " + wo.no + " BOM"),
        finishedItemId: wo.finishedItemId || payload.finishedItemId || "", qtyOutput: Number(payload.qtyOutput || 1), unit: payload.unit || "Nos",
        revision: "Rev-00", revisionNo: 0, status: "Draft", approvalStatus: "Pending", isDefault: false, workOrderId: woId,
        lines: payload.lines || [], remarks: payload.remarks || "", revisionHistory: [],
      }, actor);
      this.update("workOrders", woId, { bomId: rec.id, bomNo: rec.no, bomRevisionNo: rec.revision, status: "BOM Under Review" }, actor);
      if (wo.salesOrderId) this._soTimeline(wo.salesOrderId, "bom-created", actor, "WO-specific BOM " + rec.no + " created");
      return rec;
    },
    reviseWorkOrderBom(woId, patch, actor) {
      const wo = this.get("workOrders", woId);
      if (!wo || !wo.bomId || !patch.reason) return null;
      const bom = this.get("boms", wo.bomId);
      if (!bom) return null;
      const nextRev = Number(bom.revisionNo || 0) + 1;
      const revLabel = "Rev-" + String(nextRev).padStart(2, "0");
      const history = (bom.revisionHistory || []).concat({
        revision: bom.revision || "Rev-00", revisionNo: Number(bom.revisionNo || 0), revisedAt: Date.now(), revisedBy: actor, reason: patch.reason,
        approvedBy: patch.approvedBy || "", snapshot: { lines: bom.lines, remarks: bom.remarks, status: bom.status },
      });
      this.update("boms", bom.id, {
        lines: patch.lines || bom.lines, remarks: patch.remarks ?? bom.remarks, revisionNo: nextRev, revision: revLabel,
        status: "Draft", approvalStatus: "Pending", revisionReason: patch.reason, revisedAt: Date.now(), revisedBy: actor,
        approvedBy: patch.approvedBy || "", revisionHistory: history,
      }, actor);
      this.update("workOrders", wo.id, { bomRevisionNo: revLabel, status: "BOM Under Review" }, actor);
      if (wo.salesOrderId) this._soTimeline(wo.salesOrderId, "bom-revised", actor, "BOM revised to " + revLabel + " — " + patch.reason);
      return this.get("boms", bom.id);
    },
    approveBomForWorkOrder(woId, actor) {
      const wo = this.get("workOrders", woId);
      if (!wo || !wo.bomId) return null;
      const bom = this.get("boms", wo.bomId);
      if (!bom) return null;
      this.update("boms", bom.id, { status: "Active", approvalStatus: "Approved", approvedBy: actor, approvedAt: Date.now() }, actor);
      this.update("workOrders", wo.id, { status: "BOM Approved", bomRevisionNo: bom.revision || "Rev-00" }, actor);
      if (wo.salesOrderId) {
        this._setSOStage(wo.salesOrderId, "BOM Finalized", actor, "BOM " + bom.no + " approved");
        this._soTimeline(wo.salesOrderId, "bom-approved", actor, "BOM " + bom.no + " approved");
      }
      return this.get("workOrders", wo.id);
    },
    acceptWorkOrder(woId, actor) {
      const wo = this.get("workOrders", woId);
      if (!wo) return null;
      this.update("workOrders", woId, { status: "Production Planned", productionStatus: "Planned", acceptedAt: Date.now(), acceptedBy: actor }, actor);
      if (wo.salesOrderId) this._setSOStage(wo.salesOrderId, "Accepted by Production", actor, "Work order accepted: " + wo.no);
      return this.get("workOrders", woId);
    },
    planMaterialRequirement(woId, payload, actor) {
      const wo = this.get("workOrders", woId);
      if (!wo) return null;
      const bom = (wo.bomId && this.get("boms", wo.bomId)) || (wo.finishedItemId && this.getDefaultBom(wo.finishedItemId));
      const reqs = bom ? this.explodeBom(bom.id, Number(payload.qtyRequired || wo.qtyPlanned || 0)) : [];
      const lines = reqs.map((r) => {
        const item = this.get("items", r.itemId) || {};
        const available = this.onHand(r.itemId, item.locationId || "loc0");
        const reserved = Number(item.reservedQty) || 0;
        const wip = Number(item.wipQty) || 0;
        const min = Number(item.minStock) || 0;
        const shortage = Math.max(0, (Number(r.qty) || 0) - Math.max(0, available - reserved));
        return {
          itemId: r.itemId, sku: item.sku || "", description: item.name || "", category: item.category || "Raw Material",
          processStage: r.processStage || "", requiredQty: Number(r.qty) || 0, wastagePct: Number(r.scrapPct) || 0,
          totalRequiredQty: Number(r.qty) || 0, unit: r.unit || item.unit || "Nos", alternateItemId: r.altItemId || "", alternateAllowed: !!r.altItemId,
          availableStock: available, wipStock: wip, reservedStock: reserved, minStock: min, shortageQty: shortage,
          issueStatus: shortage > 0 ? "Material Pending" : "Ready",
        };
      });
      const mr = this.create("materialRequirements", {
        no: this.nextNo("MR", todayISO()), date: todayISO(), workOrderId: woId, workOrderNo: wo.no, salesOrderId: wo.salesOrderId,
        salesOrderNo: wo.salesOrderNo || "", productName: wo.product || "", qtyToManufacture: Number(payload.qtyRequired || wo.qtyPlanned || 0),
        bomId: bom ? bom.id : "", bomNo: bom ? bom.no : "", bomRevision: bom ? (bom.revision || "Rev-00") : "",
        requiredByDate: payload.requiredByDate || wo.requiredDate || "", productionStartDate: payload.productionStartDate || "",
        expectedProductionDate: payload.expectedProductionDate || "", requiredMaterialAvailabilityDate: payload.requiredMaterialAvailabilityDate || payload.requiredByDate || wo.requiredDate || "",
        priority: payload.priority || wo.priority || "Normal", approvalStatus: payload.approvalStatus || "Pending",
        remarks: payload.remarks || "", requestedBy: actor, status: "Open", lines,
      }, actor);
      this.update("workOrders", woId, {
        materialRequirementId: mr.id, materialRequirementNo: mr.no, productionStatus: "Material Awaited", status: "Material Requirement Generated",
      }, actor);
      if (wo.salesOrderId) this._setSOStage(wo.salesOrderId, "Material Requirement Generated", actor, "Material requirement " + mr.no + " created");
      return mr;
    },
    issueMaterialAgainstRequirement(mrId, issuePayload, actor) {
      const mr = this.get("materialRequirements", mrId);
      if (!mr) return null;
      const wo = mr.workOrderId ? this.get("workOrders", mr.workOrderId) : null;
      const updates = [];
      const shortages = [];
      (mr.lines || []).forEach((ln) => {
        const req = Number(ln.requiredQty) || 0;
        const issueQty = Math.max(0, Number((issuePayload.issued || {})[ln.itemId] ?? ln.issuedQty ?? 0));
        const item = this.get("items", ln.itemId) || {};
        const available = this.onHand(ln.itemId, item.locationId || "loc0");
        const finalIssue = Math.min(issueQty, available);
        const pending = Math.max(0, req - finalIssue);
        const status = pending <= 0 ? "Fully Issued" : finalIssue > 0 ? "Partially Issued" : "Not Issued";
        if (finalIssue > 0) {
          const no = this.nextNo("MIN", todayISO());
          this.create("materialIssues", {
            date: todayISO(), no, type: "Internal Use / Production", itemId: ln.itemId, locationId: item.locationId || "loc0",
            qtyIssued: finalIssue, unit: ln.unit || item.unit || "Nos", productionOrder: wo ? wo.no : mr.workOrderNo,
            workOrderId: mr.workOrderId, purpose: "Issue against MR " + mr.no, approval: "Approved", issuedBy: actor,
            receivedBy: issuePayload.receivedBy || "", remarks: issuePayload.remarks || "",
            batchNo: (issuePayload.batches || {})[ln.itemId] || "", rackBin: (issuePayload.locations || {})[ln.itemId] || "",
          }, actor);
          this.postLedger({ itemId: ln.itemId, locationId: item.locationId || "loc0", type: "issue", qty: -finalIssue, ref: no, date: todayISO() }, actor);
        }
        if (pending > 0) {
          shortages.push({ ...ln, pendingQty: pending, reason: (issuePayload.reasons || {})[ln.itemId] || "Stock unavailable", expectedDate: (issuePayload.expectedDates || {})[ln.itemId] || "" });
          const pr = this.create("purchaseRequests", {
            no: this.nextNo("PR", todayISO()), date: todayISO(), itemId: ln.itemId, qty: pending, uom: ln.unit || item.unit || "Nos",
            neededBy: mr.requiredByDate || "", priority: mr.priority || "High", reason: "Material shortage for WO " + mr.workOrderNo,
            status: "Pending", raisedBy: actor, supplierId: "", workOrderId: mr.workOrderId, materialRequirementId: mr.id,
          }, actor);
          shortages[shortages.length - 1].purchaseRequestNo = pr.no;
          shortages[shortages.length - 1].purchaseRequestId = pr.id;
        }
        updates.push({
          ...ln,
          issuedQty: (Number(ln.issuedQty) || 0) + finalIssue,
          pendingQty: pending,
          availableStock: Math.max(0, available - finalIssue),
          issueStatus: pending > 0 ? ((Number(ln.issuedQty) || 0) + finalIssue > 0 ? "Shortage Pending" : "Awaiting Purchase") : status,
          pendingReason: (issuePayload.reasons || {})[ln.itemId] || "",
          expectedAvailabilityDate: (issuePayload.expectedDates || {})[ln.itemId] || "",
        });
      });
      const allDone = updates.every((x) => (Number(x.pendingQty) || 0) <= 0);
      const anyIssued = updates.some((x) => (Number(x.issuedQty) || 0) > 0);
      const issueStatus = allDone ? "Fully Issued" : anyIssued ? "Partially Issued" : "Shortage Pending";
      this.update("materialRequirements", mrId, { lines: updates, status: allDone ? "Fully Issued" : anyIssued ? "Partially Issued" : "Shortage Pending", lastIssuedAt: Date.now(), lastIssuedBy: actor, shortageCount: shortages.length }, actor);
      if (wo) {
        this.update("workOrders", wo.id, {
          issueStatus,
          materialsIssuedAt: anyIssued ? Date.now() : wo.materialsIssuedAt || null,
          productionStatus: allDone ? "In Progress" : "Material Awaited",
          status: allDone ? "Material Fully Issued" : "Material Partially Issued",
        }, actor);
      }
      if (wo && wo.salesOrderId) {
        this._setSOStage(wo.salesOrderId, allDone ? "Material Fully Issued" : (anyIssued ? "Material Partially Issued" : "Material Shortage Pending"), actor, "Stores issue status: " + issueStatus);
        if (!allDone) this._soTimeline(wo.salesOrderId, "shortage", actor, "Material shortage pending for WO " + wo.no);
      }
      return { ok: true, issueStatus, shortages };
    },
    approveAlternateForMrLine(mrId, itemId, payload, actor) {
      const mr = this.get("materialRequirements", mrId);
      if (!mr) return null;
      const lines = (mr.lines || []).map((ln) => {
        if (ln.itemId !== itemId) return ln;
        return {
          ...ln,
          alternateApproved: true,
          alternateApprovedBy: actor,
          alternateApprovedAt: Date.now(),
          alternateIssuedItemId: payload && payload.alternateItemId ? payload.alternateItemId : (ln.alternateItemId || ""),
          alternateApprovalRemark: (payload && payload.remark) || "",
        };
      });
      this.update("materialRequirements", mrId, { lines }, actor);
      const row = (lines || []).find((x) => x.itemId === itemId);
      if (mr.workOrderId) this._soTimeline(mr.salesOrderId, "alternate-approved", actor, "Alternate approved for " + (row && row.sku ? row.sku : itemId));
      return this.get("materialRequirements", mrId);
    },
    classifyShortageForMrLine(mrId, itemId, payload, actor) {
      const mr = this.get("materialRequirements", mrId);
      if (!mr) return null;
      const lines = (mr.lines || []).map((ln) => {
        if (ln.itemId !== itemId) return ln;
        return {
          ...ln,
          shortageClass: (payload && payload.shortageClass) || ln.shortageClass || "",
          vendorStatus: (payload && payload.vendorStatus) || ln.vendorStatus || "",
          expectedReceiptDate: (payload && payload.expectedReceiptDate) || ln.expectedReceiptDate || "",
          substituteAvailable: !!((payload && payload.substituteAvailable) ?? ln.substituteAvailable),
          shortageRemark: (payload && payload.remark) || ln.shortageRemark || "",
        };
      });
      this.update("materialRequirements", mrId, { lines }, actor);
      return this.get("materialRequirements", mrId);
    },
    recordWorkOrderMaterialConsumption(woId, payload, actor) {
      const wo = this.get("workOrders", woId);
      if (!wo || !wo.materialRequirementId) return null;
      const mr = this.get("materialRequirements", wo.materialRequirementId);
      if (!mr) return null;
      const consume = (payload && payload.consume) || {};
      const scrap = (payload && payload.scrap) || {};
      const lines = (mr.lines || []).map((ln) => {
        const consumedQty = Math.max(0, Number(consume[ln.itemId] ?? ln.consumedQty ?? 0));
        const scrapQty = Math.max(0, Number(scrap[ln.itemId] ?? ln.scrapQty ?? 0));
        const planned = Number(ln.requiredQty) || 0;
        const issued = Number(ln.issuedQty) || 0;
        const returned = Number(ln.returnedQty) || 0;
        const varianceQty = Math.round((planned - consumedQty - scrapQty + returned) * 1000) / 1000;
        return { ...ln, consumedQty, scrapQty, varianceQty };
      });
      this.update("materialRequirements", mr.id, { lines, consumptionUpdatedAt: Date.now(), consumptionUpdatedBy: actor }, actor);
      if (wo.salesOrderId) this._soTimeline(wo.salesOrderId, "consumption", actor, "Material consumption updated for WO " + wo.no);
      return this.get("materialRequirements", mr.id);
    },

    findItemBySku(sku) {
      if (!sku) return null;
      const u = String(sku).trim().toUpperCase();
      return (DB.items || []).find((x) => String(x.sku || "").trim().toUpperCase() === u) || null;
    },
    getDefaultBom(itemId) {
      if (!itemId) return null;
      const active = (DB.boms || []).filter((b) => b.finishedItemId === itemId && b.status === "Active" && (b.approvalStatus === "Approved" || !b.approvalStatus));
      return active.find((b) => b.isDefault) || active[0] || null;
    },
    findBomByFgSku(sku, excludeId) {
      if (!sku) return null;
      return (DB.boms || []).find((b) => b.id !== excludeId && (b.fgSku === sku || ((this.get("items", b.finishedItemId) || {}).sku === sku))) || null;
    },
    reviseBom(bomId, patch, actor) {
      const bom = this.get("boms", bomId);
      if (!bom || !patch.reason) return null;
      const nextRev = Number(bom.revisionNo != null ? bom.revisionNo : 0) + 1;
      const revLabel = "Rev-" + String(nextRev).padStart(2, "0");
      const oldLines = (bom.lines || []).map((l) => ({ ...l }));
      const newLines = patch.lines || oldLines;
      const history = (bom.revisionHistory || []).concat({
        revision: bom.revision || "Rev-00",
        revisionNo: Number(bom.revisionNo != null ? bom.revisionNo : 0),
        revisedAt: Date.now(),
        revisedBy: actor,
        approvedBy: patch.approvedBy || "",
        reason: patch.reason,
        remarks: patch.remarks || "",
        oldLines,
        newLines: newLines.map((l) => ({ ...l })),
        snapshot: { lines: oldLines, remarks: bom.remarks, status: bom.status, qtyOutput: bom.qtyOutput },
      });
      this.update("boms", bomId, {
        lines: newLines,
        remarks: patch.remarks != null ? patch.remarks : bom.remarks,
        qtyOutput: patch.qtyOutput != null ? patch.qtyOutput : bom.qtyOutput,
        unit: patch.unit || bom.unit,
        revisionNo: nextRev,
        revision: revLabel,
        status: "Draft",
        approvalStatus: "Pending",
        revisionReason: patch.reason,
        revisedAt: Date.now(),
        revisedBy: actor,
        revisionHistory: history,
      }, actor);
      return this.get("boms", bomId);
    },
    approveBom(bomId, actor) {
      const bom = this.get("boms", bomId);
      if (!bom) return null;
      const hist = bom.revisionHistory || [];
      if (hist.length) {
        const last = hist[hist.length - 1];
        last.approvedBy = actor;
        last.approvedAt = Date.now();
      }
      this.update("boms", bomId, {
        status: "Active",
        approvalStatus: "Approved",
        approvedBy: actor,
        approvedAt: Date.now(),
        revisionHistory: hist,
      }, actor);
      return this.get("boms", bomId);
    },
    explodeBom(bomId, multiplier) {
      const bom = this.get("boms", bomId);
      if (!bom) return [];
      const mult = Number(multiplier) || 1;
      const outQty = Number(bom.qtyOutput) || 1;
      const factor = mult / outQty;
      return (bom.lines || []).map((l) => {
        const scrap = 1 + (Number(l.scrapPct) || 0) / 100;
        const qty = Math.round((Number(l.qty) || 0) * factor * scrap * 1000) / 1000;
        const it = this.get("items", l.itemId) || {};
        return {
          itemId: l.itemId, sku: it.sku, name: it.name, unit: l.unit || it.unit || "Nos",
          qty, scrapPct: l.scrapPct, issueMethod: l.issueMethod || "Manual",
          processStage: l.processStage || "", alternateAllowed: !!l.alternateAllowed, altItemId: l.altItemId || "",
        };
      });
    },
    calcBomCost(bomId) {
      const bom = this.get("boms", bomId);
      if (!bom) return 0;
      const outQty = Number(bom.qtyOutput) || 1;
      const total = (bom.lines || []).reduce((s, l) => {
        const it = this.get("items", l.itemId) || {};
        const scrap = 1 + (Number(l.scrapPct) || 0) / 100;
        return s + (Number(l.qty) || 0) * scrap * (Number(it.rate) || 0);
      }, 0);
      return Math.round(total / outQty);
    },
    setDefaultBom(bomId, actor) {
      const b = this.get("boms", bomId);
      if (!b) return;
      (DB.boms || []).forEach((x) => {
        if (x.finishedItemId === b.finishedItemId && x.id !== bomId) this.update("boms", x.id, { isDefault: false }, actor);
      });
      this.update("boms", bomId, { isDefault: true, status: "Active" }, actor);
    },
    materialAvailabilityReportForMR(mrId) {
      const mr = this.get("materialRequirements", mrId);
      if (!mr) return [];
      return (mr.lines || []).map((ln) => {
        const item = this.get("items", ln.itemId) || {};
        const available = this.onHand(ln.itemId, item.locationId || "loc0");
        const reserved = Number(item.reservedQty) || 0;
        const free = Math.max(0, available - reserved);
        const required = Number(ln.totalRequiredQty || ln.requiredQty) || 0;
        const qtyCanIssueNow = Math.min(required, free);
        const shortageQty = Math.max(0, required - qtyCanIssueNow);
        const alt = ln.alternateItemId ? this.get("items", ln.alternateItemId) : null;
        return {
          workOrderNo: mr.workOrderNo, salesOrderNo: mr.salesOrderNo || "", bomNo: mr.bomNo || "", bomRevision: mr.bomRevision || "",
          sku: item.sku || ln.sku || "", description: item.name || ln.description || "", category: ln.category || item.category || "",
          unit: ln.unit || item.unit || "Nos", requiredQty: required, availableStock: available, reservedStock: reserved, freeStock: free,
          qtyCanIssueNow, shortageQty, expectedAvailabilityDate: ln.expectedAvailabilityDate || "", purchaseRequestStatus: ln.purchaseRequestNo ? "Pending (" + ln.purchaseRequestNo + ")" : "",
          locationRackBin: ln.rackBin || item.locationId || "loc0", altItemAvailable: alt ? this.onHand(alt.id) > 0 : false, remarks: ln.pendingReason || ln.remarks || "",
        };
      });
    },
    returnMaterialFromProduction(woId, payload, actor) {
      const wo = this.get("workOrders", woId);
      if (!wo || !payload || !Array.isArray(payload.lines)) return null;
      const rows = [];
      payload.lines.forEach((ln) => {
        const qty = Number(ln.qtyReturned) || 0;
        if (!ln.itemId || qty <= 0) return;
        const no = this.nextNo("RET", todayISO());
        this.create("returns", {
          no, date: todayISO(), kind: "Production Return", workOrderId: woId, workOrderNo: wo.no,
          itemId: ln.itemId, qty, condition: ln.condition || "Good", status: "Accepted by Stores",
          acceptedBy: payload.acceptedBy || actor, remarks: ln.remarks || "",
        }, actor);
        const item = this.get("items", ln.itemId) || {};
        this.postLedger({ itemId: ln.itemId, locationId: item.locationId || "loc0", type: "return", qty, ref: no, date: todayISO() }, actor);
        rows.push({ itemId: ln.itemId, qty });
      });
      if (wo.materialRequirementId) {
        const mr = this.get("materialRequirements", wo.materialRequirementId);
        if (mr) {
          const lines = (mr.lines || []).map((ln) => {
            const ret = rows.filter((r) => r.itemId === ln.itemId).reduce((s, r) => s + (Number(r.qty) || 0), 0);
            if (!ret) return ln;
            return { ...ln, returnedQty: (Number(ln.returnedQty) || 0) + ret };
          });
          this.update("materialRequirements", mr.id, { lines }, actor);
        }
      }
      this.update("workOrders", woId, { materialReturnAt: Date.now(), materialReturnBy: actor, status: "Material Returned" }, actor);
      if (wo.salesOrderId) this._soTimeline(wo.salesOrderId, "material-return", actor, "Material returned from production");
      return rows;
    },
    issueBomForWorkOrder(woId, actor, opts) {
      const wo = this.get("workOrders", woId);
      if (!wo) return { ok: false, reason: "Work order not found" };
      const fgItem = wo.finishedItemId ? this.get("items", wo.finishedItemId) : this.findItemBySku(wo.sku);
      const bom = (wo.bomId && this.get("boms", wo.bomId)) || (fgItem && this.getDefaultBom(fgItem.id));
      if (!bom) return { ok: false, reason: "No active BOM for this product" };
      const qty = Number(wo.qtyPlanned) || 1;
      const reqs = this.explodeBom(bom.id, qty);
      const locationId = (opts && opts.locationId) || (fgItem && fgItem.locationId) || "loc0";
      const issued = [];
      const skipped = [];
      reqs.forEach((r) => {
        const need = Math.ceil(Number(r.qty) || 0);
        if (need <= 0) return;
        const avail = this.onHand(r.itemId, locationId);
        if (avail < need && !(opts && opts.allowPartial)) {
          skipped.push({ ...r, need, avail });
          return;
        }
        const issueQty = (opts && opts.allowPartial) ? Math.min(need, avail) : need;
        if (issueQty <= 0) { skipped.push({ ...r, need, avail }); return; }
        const no = this.nextNo("MIN", todayISO());
        this.create("materialIssues", {
          date: todayISO(), no, type: "Internal Use / Production", itemId: r.itemId, locationId,
          qtyIssued: issueQty, unit: r.unit, productionOrder: wo.no, bomId: bom.id, bomRef: bom.no,
          workOrderId: woId, purpose: "BOM issue for " + wo.no, approval: "Approved", issuedBy: actor,
        }, actor);
        this.postLedger({ itemId: r.itemId, locationId, type: "issue", qty: -issueQty, ref: no, date: todayISO() }, actor);
        issued.push({ ...r, qty: issueQty, no });
      });
      this.update("workOrders", woId, { bomId: bom.id, bomNo: bom.no, finishedItemId: bom.finishedItemId, materialsIssuedAt: Date.now(), status: skipped.length ? "Material Partially Issued" : "Material Fully Issued" }, actor);
      return { ok: true, bom, issued, skipped };
    },

    releaseWorkOrderFromSO(soId, actor) {
      const wo = this.sendSalesOrderToProduction(soId, actor);
      if (!wo) return null;
      this.update("workOrders", wo.id, { status: "Production Planned", releasedAt: Date.now(), productionStatus: "Planned" }, actor);
      return this.get("workOrders", wo.id);
    },
    completeWorkOrder(woId, payload, actor) {
      const wo = this.get("workOrders", woId);
      if (!wo) return null;
      const planned = Number(wo.qtyPlanned) || 0;
      const qty = Number(payload.qtyProduced ?? planned) || 0;
      const rejectQty = Number(payload.rejectQty) || 0;
      const balanceQty = Math.max(0, planned - qty);
      const prodStatus = qty >= planned ? "Completed" : qty > 0 ? "Partially Completed" : "In Progress";
      this.update("workOrders", woId, {
        status: "Production Completed",
        productionStatus: prodStatus,
        qtyProduced: qty,
        qtyRejected: rejectQty,
        balanceQty,
        completedAt: Date.now(),
        completionDate: todayISO(),
        operatorName: payload.operatorName || "",
        supervisorName: payload.supervisorName || "",
        batchNo: payload.batchNo || "",
        productionDocuments: payload.productionDocuments || "",
        remarks: payload.remarks || "",
      }, actor);
      if (wo.salesOrderId) {
        this._setSOStage(wo.salesOrderId, "Production Completed", actor, "WO " + wo.no + " completed — " + qty + " units");
        const insp = this.create("qcInspections", {
          no: this.nextNo("QC", todayISO()), date: todayISO(), source: "Production (WO)",
          workOrderId: woId, workOrderNo: wo.no, salesOrderId: wo.salesOrderId,
          itemId: wo.finishedItemId || "", qtyReceived: qty,
          status: "Pending", result: "", priority: wo.priority || "Normal",
          requiredDispatchDate: wo.requiredDate || "", remarks: "Post-production inspection for " + wo.no,
        }, actor);
        this.update("workOrders", woId, { qcInspectionId: insp.id }, actor);
        this._setSOStage(wo.salesOrderId, "QC Pending", actor, "QC inspection " + insp.no + " created");
      }
      return wo;
    },
    transferFinishedGoodsToStores(woId, payload, actor) {
      const wo = this.get("workOrders", woId);
      if (!wo) return null;
      const qty = Number(payload.qtyTransferred || wo.qtyProduced || 0) || 0;
      if (qty <= 0) return null;
      const fg = this.create("finishedGoodsTransfers", {
        no: this.nextNo("FG", todayISO()), date: todayISO(),
        workOrderId: woId, workOrderNo: wo.no, salesOrderId: wo.salesOrderId,
        finishedItemId: wo.finishedItemId || "", sku: wo.sku || "", product: wo.product || "",
        qtyTransferred: qty, batchNo: payload.batchNo || wo.batchNo || "",
        productionRef: wo.no, sentBy: actor, receivedBy: payload.receivedBy || "",
        storageLocationId: payload.storageLocationId || "loc0", status: "Pending Stores Acceptance",
        remarks: payload.remarks || "",
      }, actor);
      this._soTimeline(wo.salesOrderId, "fg-transfer", actor, "FG transfer " + fg.no + " created");
      return fg;
    },
    acceptFinishedGoodsTransfer(fgId, actor) {
      const fg = this.get("finishedGoodsTransfers", fgId);
      if (!fg) return null;
      const itemId = fg.finishedItemId || (fg.sku ? (this.findItemBySku(fg.sku) || {}).id : "");
      if (itemId) {
        this.postLedger({ itemId, locationId: fg.storageLocationId || "loc0", type: "receipt", qty: Number(fg.qtyTransferred) || 0, ref: fg.no, batch: fg.batchNo || "", date: todayISO() }, actor);
      }
      this.update("finishedGoodsTransfers", fgId, { status: "Accepted by Stores", acceptedAt: Date.now(), acceptedBy: actor }, actor);
      if (fg.salesOrderId) this._setSOStage(fg.salesOrderId, "Sent to Finished Goods Store", actor, "FG accepted in stores (" + fg.no + ")");
      return this.get("finishedGoodsTransfers", fgId);
    },
    issueFinishedGoodsToQC(fgId, payload, actor) {
      const fg = this.get("finishedGoodsTransfers", fgId);
      if (!fg || fg.status !== "Accepted by Stores") return null;
      const qci = this.create("qcIssues", {
        no: this.nextNo("QCI", todayISO()), date: todayISO(),
        fgTransferId: fgId, workOrderId: fg.workOrderId, workOrderNo: fg.workOrderNo, salesOrderId: fg.salesOrderId,
        finishedItemId: fg.finishedItemId, sku: fg.sku, qtyForQc: Number(payload.qtyForQc || fg.qtyTransferred) || 0,
        batchNo: fg.batchNo || "", sentBy: actor, receivedByQc: payload.receivedByQc || "", priority: payload.priority || "Normal",
        requiredDispatchDate: payload.requiredDispatchDate || "", status: "Pending Inspection", remarks: payload.remarks || "",
      }, actor);
      this.update("finishedGoodsTransfers", fgId, { status: "Issued to QC", qcIssueId: qci.id, qcIssueNo: qci.no }, actor);
      if (fg.salesOrderId) this._setSOStage(fg.salesOrderId, "Sent to Quality", actor, "QC issue " + qci.no + " created");
      return qci;
    },
    recordFinalQcResult(qcIssueId, payload, actor) {
      const q = this.get("qcIssues", qcIssueId);
      if (!q) return null;
      const inspected = Number(payload.qtyInspected || q.qtyForQc || 0) || 0;
      const accepted = Number(payload.acceptQty || 0) || 0;
      const rejected = Number(payload.rejectQty || 0) || 0;
      const rework = Number(payload.reworkQty || 0) || 0;
      const status = payload.status || (accepted > 0 && rejected > 0 ? "Partially Accepted" : accepted > 0 ? "Accepted" : rework > 0 ? "Rework Required" : rejected > 0 ? "Rejected" : "Hold");
      this.update("qcIssues", qcIssueId, {
        status,
        qtyInspected: inspected,
        acceptQty: accepted,
        rejectQty: rejected,
        reworkQty: rework,
        inspectionDate: payload.inspectionDate || todayISO(),
        inspectorName: payload.inspectorName || actor,
        testReportNo: payload.testReportNo || "",
        inspectionChecklist: payload.inspectionChecklist || "",
        remarks: payload.remarks || "",
        qcDocument: payload.qcDocument || "",
      }, actor);
      if (q.salesOrderId) {
        if (status === "Accepted" || status === "Partially Accepted") this._setSOStage(q.salesOrderId, "QC Accepted", actor, "Final QC " + status + " (" + q.no + ")");
        if (status === "Rework Required") this._setSOStage(q.salesOrderId, "Production In Progress", actor, "Rework required from QC (" + q.no + ")");
        if (status === "Hold") this._setSOStage(q.salesOrderId, "On Hold", actor, "QC hold (" + q.no + ")");
      }
      if (accepted > 0) {
        const dq = this.create("dispatchQueue", {
          date: todayISO(), workOrderNo: q.workOrderNo, salesOrderId: q.salesOrderId, qcIssueId, qcIssueNo: q.no,
          itemId: q.finishedItemId, sku: q.sku, qtyReady: accepted, batchNo: q.batchNo || "", priority: q.priority || "Normal",
          requiredDispatchDate: q.requiredDispatchDate || "", status: "Ready", remarks: payload.remarks || "",
        }, actor);
        if (q.salesOrderId) this._setSOStage(q.salesOrderId, "Ready for Dispatch", actor, "Dispatch queue " + dq.id + " ready");
      }
      return this.get("qcIssues", qcIssueId);
    },

    createShipmentFromSO(soId, extra, actor) {
      const so = this.get("salesOrders", soId);
      if (!so) return null;
      const sh = this.create("shipments", {
        no: this.nextNo("SH", todayISO()), date: todayISO(), salesOrderId: soId, salesOrderNo: so.no,
        customerId: so.customerId, destination: extra.destination || so.shipping || "",
        vehicle: extra.vehicle || "", driver: extra.driver || "", ewayBill: extra.ewayBill || "",
        lines: so.lines || [], status: "Pending", packingStatus: "Pending", preparedBy: actor,
      }, actor);
      this._setSOStage(soId, "Dispatch Planned", actor, "Shipment " + sh.no + " created");
      return sh;
    },
    dispatchShipment(shId, actor) {
      const sh = this.get("shipments", shId);
      if (!sh) return null;
      this.update("shipments", shId, { status: "In-transit", dispatchDate: todayISO(), dispatchedBy: actor }, actor);
      if (sh.salesOrderId) this._setSOStage(sh.salesOrderId, "Partially Dispatched", actor, "Shipment " + sh.no + " dispatched");
      return sh;
    },
    deliverShipment(shId, actor) {
      const sh = this.get("shipments", shId);
      if (!sh) return null;
      this.update("shipments", shId, { status: "Delivered", deliveredDate: todayISO(), podStatus: "OK" }, actor);
      if (sh.salesOrderId) {
        const so = this.get("salesOrders", sh.salesOrderId);
        if (so) {
          const ordQty = (so.lines || []).reduce((s, l) => s + (Number(l.qty) || 0), 0);
          const shippedQty = (DB.shipments || []).filter((x) => x.salesOrderId === so.id && (x.status === "Delivered" || x.status === "In-transit"))
            .reduce((s, x) => s + ((x.lines || []).reduce((a, l) => a + (Number(l.qty) || 0), 0)), 0);
          const done = shippedQty >= ordQty && ordQty > 0;
          this._setSOStage(so.id, done ? "Fully Dispatched" : "Partially Dispatched", actor, "Delivery confirmed for " + sh.no);
          if (done) {
            this.update("salesOrders", so.id, { status: "Closed", closedAt: Date.now() }, actor);
            this._setSOStage(so.id, "Closed", actor, "Order fully dispatched and closed");
            this.create("orderHistory", {
              date: todayISO(), salesOrderId: so.id, salesOrderNo: so.no, customerId: so.customerId,
              closureDate: todayISO(), finalStatus: "Closed", timeline: so.timeline || [],
              delayReason: so.delayReason || "", activityLog: so.timeline || [],
            }, actor);
          }
        }
      }
      return sh;
    },

    ensureQuotationSO(q, actor) {
      if (!q || !q.id) return null;
      let so = (DB.salesOrders || []).find((o) => o.quotationId === q.id && o.status !== "Cancelled");
      if (so) return this._ensureSOAddresses(so, actor);
      const c = typeof VG !== "undefined" && VG.normalizeCustomer
        ? VG.normalizeCustomer(this.get("customers", q.customerId) || {})
        : (this.get("customers", q.customerId) || {});
      let payload = {
        quotationId: q.id, customerId: q.customerId, contact: q.contact || "",
        currency: q.currency || c.currency || "INR", exchangeRate: q.exchangeRate != null ? q.exchangeRate : 1,
        lines: q.lines || [], totals: q.totals || {},
        paymentTermsId: q.paymentTermsId || "", deliveryTermsId: q.deliveryTermsId || "",
        freight: q.freight, packing: q.packing, insurance: q.insurance,
        remarks: q.remarks || "", enquiryId: q.enquiryId || "", templateId: q.templateId || "",
        projectName: q.projectName || "", projectRef: q.projectRef || "", rfqRef: q.rfqRef || "",
        preparedBy: actor,
      };
      if (typeof VG !== "undefined" && VG.applyCustomerToTransaction) {
        payload = VG.applyCustomerToTransaction(c, payload);
      } else {
        payload = { ...payload, billing: q.billing || c.billing || "", shipping: q.shipping || c.shipping || "", gstin: q.gstin || c.gstin || "" };
      }
      so = this.create("salesOrders", {
        no: this.nextNo("SO", todayISO()), date: todayISO(), ...payload,
        deliveryDate: todayISO(), priority: "Normal", technicalSpec: "", specialInstructions: "",
        status: "Created / Saved", stage: "Created / Saved",
      }, actor);
      if (so && q.enquiryId && typeof VG !== "undefined" && VG.enquiryOnConverted) VG.enquiryOnConverted(q, so, actor);
      return so ? this._ensureSOAddresses(so, actor) : null;
    },
    _ensureSOAddresses(so, actor) {
      if (!so) return so;
      const bill = (so.billing || "").trim();
      const ship = (so.shipping || "").trim();
      if (bill && ship) return so;
      const c = typeof VG !== "undefined" && VG.normalizeCustomer
        ? VG.normalizeCustomer(this.get("customers", so.customerId) || {})
        : (this.get("customers", so.customerId) || {});
      if (typeof VG !== "undefined" && VG.applyCustomerToTransaction) {
        const patched = VG.applyCustomerToTransaction(c, so);
        const updated = this.update("salesOrders", so.id, {
          billing: patched.billing || bill,
          shipping: patched.shipping || ship || patched.billing || bill,
          billingAddressId: patched.billingAddressId || so.billingAddressId || "",
          shippingAddressId: patched.shippingAddressId || so.shippingAddressId || "",
          gstin: patched.gstin || so.gstin || "",
        }, actor);
        return updated || so;
      }
      return so;
    },
    createInvoiceFromQuotation(quotationId, actor) {
      const q = this.get("quotations", quotationId);
      if (!q) return null;
      const byQuote = (DB.invoices || []).find((i) => i.quotationId === quotationId && i.status !== "Cancelled");
      if (byQuote) return byQuote;
      const so = this.ensureQuotationSO(q, actor);
      if (!so) return null;
      const inv = this.createInvoiceFromSO(so.id, actor);
      if (inv) {
        this.update("invoices", inv.id, { quotationId: q.id, quotationNo: q.no }, actor);
        this.update("quotations", quotationId, { status: "Won" }, actor);
      }
      return inv;
    },
    createInvoiceFromSO(soId, actor) {
      const so = this.get("salesOrders", soId);
      if (!so) return null;
      const existing = (DB.invoices || []).find((i) => i.salesOrderId === soId && i.status !== "Cancelled");
      if (existing) return existing;
      const t = so.totals || {};
      const grand = Number(t.final != null ? t.final : t.grand) || 0;
      const qRow = so.quotationId ? this.get("quotations", so.quotationId) : null;
      const inv = this.create("invoices", {
        no: this.nextNo("INV", todayISO()), date: todayISO(), type: "Tax Invoice",
        customerId: so.customerId, salesOrderId: soId, salesOrderNo: so.no,
        quotationId: so.quotationId || "", quotationNo: (qRow && qRow.no) || "",
        enquiryId: so.enquiryId || "", billing: so.billing, shipping: so.shipping,
        billingAddressId: so.billingAddressId || "", shippingAddressId: so.shippingAddressId || "",
        gstin: so.gstin, currency: so.currency || "INR", exchangeRate: so.exchangeRate != null ? so.exchangeRate : 1,
        lines: so.lines || [], totals: t, paymentTermsId: so.paymentTermsId || "", deliveryTermsId: so.deliveryTermsId || "",
        amount: grand, amountPaid: 0, dueDate: extraDueDate(30), status: "Posted", preparedBy: actor,
        eInvoiceStatus: "", ewayBillNo: "",
      }, actor);
      this._setSOStage(soId, "Invoiced", actor, "Tax invoice " + inv.no);
      (DB.shipments || []).filter((s) => s.salesOrderId === soId && !s.invoiceId).forEach((s) => {
        this.update("shipments", s.id, { invoiceId: inv.id, invoiceNo: inv.no }, actor);
      });
      return inv;
    },
    _randToken(len) {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let s = "";
      for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
      return s;
    },
    generateEInvoice(invoiceId, actor) {
      const inv = this.get("invoices", invoiceId);
      if (!inv) return null;
      if (inv.eInvoice && inv.eInvoice.irn) return inv;
      const co = this.company();
      const irn = this._randToken(64);
      const ackNo = String(Math.floor(1e11 + Math.random() * 9e11));
      const now = new Date();
      const ackDate = now.toISOString().slice(0, 19).replace("T", " ");
      const qrPayload = {
        Irn: irn, AckNo: ackNo, AckDt: ackDate,
        SellerGstin: co.gstin || "", BuyerGstin: inv.gstin || "",
        DocNo: inv.no, DocTyp: "INV", DocDt: inv.date,
        TotInvVal: Number(inv.amount) || 0,
      };
      const eInvoice = {
        status: "Generated", irn, ackNo, ackDate,
        signedQrCode: "data:application/json;base64," + (typeof btoa !== "undefined" ? btoa(JSON.stringify(qrPayload)) : ""),
        generatedAt: Date.now(), generatedBy: actor, portal: "NIC IRP", mode: "simulated",
      };
      this.update("invoices", invoiceId, { eInvoice, irn, ackNo, eInvoiceStatus: "Generated" }, actor);
      this.audit(actor, "e-invoice", "invoices", inv.no, "E-Invoice generated · IRN " + irn.slice(0, 16) + "…");
      notify();
      return this.get("invoices", invoiceId);
    },
    generateEwayBill(invoiceId, actor, extra) {
      const inv = this.get("invoices", invoiceId);
      if (!inv) return null;
      const ex = extra || {};
      if (inv.ewayBill && inv.ewayBill.no && !ex.regenerate) return inv;
      const sh = (DB.shipments || []).find((s) => s.salesOrderId === inv.salesOrderId);
      const ewbNo = String(Math.floor(1e11 + Math.random() * 9e11));
      const validFrom = todayISO();
      const validUntil = (() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10); })();
      const ewayBill = {
        no: ewbNo, status: "Active", validFrom, validUntil,
        vehicle: ex.vehicle || (sh && sh.vehicle) || "",
        driver: ex.driver || (sh && sh.driver) || "",
        distance: Number(ex.distance) || 0,
        transporter: ex.transporter || "",
        generatedAt: Date.now(), generatedBy: actor, portal: "NIC e-Way Bill", mode: "simulated",
      };
      this.update("invoices", invoiceId, { ewayBill, ewayBillNo: ewbNo }, actor);
      if (sh) this.update("shipments", sh.id, { ewayBill: ewbNo, invoiceId: inv.id, invoiceNo: inv.no }, actor);
      this.audit(actor, "eway", "invoices", inv.no, "E-way bill " + ewbNo + " generated");
      notify();
      return this.get("invoices", invoiceId);
    },
    recordPayment(invoiceId, amount, actor) {
      const inv = this.get("invoices", invoiceId);
      if (!inv) return null;
      const amt = Number(amount) || 0;
      const paid = (Number(inv.amountPaid) || 0) + amt;
      const status = paid >= (Number(inv.amount) || 0) ? "Paid" : paid > 0 ? "Partially Paid" : inv.status;
      this.create("payments", { date: todayISO(), invoiceId, invoiceNo: inv.no, customerId: inv.customerId, amount: amt, mode: "NEFT", ref: "", recordedBy: actor }, actor);
      this.update("invoices", invoiceId, { amountPaid: paid, status, lastPaymentAt: Date.now() }, actor);
      return inv;
    },

    /* ----- HR workflow (Leave → Attendance → Payroll → Salary slip) ----- */
    approveLeave(leaveId, actor) {
      const lv = this.get("leaveRequests", leaveId);
      if (!lv) return null;
      this.update("leaveRequests", leaveId, { status: "Approved", approvedBy: actor, approvedAt: Date.now() }, actor);
      const month = (lv.from || todayISO()).slice(0, 7);
      let rec = (DB.attendanceRecords || []).find((a) => a.employeeId === lv.employeeId && a.month === month);
      if (!rec) rec = this.create("attendanceRecords", { employeeId: lv.employeeId, month, present: 0, leave: 0, absent: 0, otHours: 0, locked: false }, actor);
      if (!rec.locked) this.update("attendanceRecords", rec.id, { leave: (Number(rec.leave) || 0) + (Number(lv.days) || 1) }, actor);
      return lv;
    },
    rejectLeave(leaveId, actor) {
      return this.update("leaveRequests", leaveId, { status: "Rejected", approvedBy: actor, approvedAt: Date.now() }, actor);
    },
    lockAttendanceMonth(month, actor) {
      (DB.attendanceRecords || []).filter((a) => a.month === month).forEach((a) => {
        this.update("attendanceRecords", a.id, { locked: true }, actor);
      });
      this.audit(actor, "lock", "attendanceRecords", month, "Attendance locked for " + month);
      notify();
    },
    runPayroll(month, actor) {
      const run = this.create("payrollRuns", {
        no: this.nextNo("PAY", todayISO()), month, status: "Processed", processedAt: Date.now(), processedBy: actor,
      }, actor);
      let totalNet = 0;
      (DB.employees || []).filter((e) => e.status === "Active").forEach((emp) => {
        const att = (DB.attendanceRecords || []).find((a) => a.employeeId === emp.id && a.month === month) || { present: 22, leave: 0, absent: 0 };
        const monthly = Math.round((Number(emp.ctc) || 0) / 12);
        const basic = Math.round(monthly * 0.5);
        const hra = Math.round(monthly * 0.25);
        const other = monthly - basic - hra;
        const leaveDed = Math.round((monthly / 22) * (Number(att.leave) || 0));
        const absentDed = Math.round((monthly / 22) * (Number(att.absent) || 0));
        const deductions = leaveDed + absentDed;
        const net = monthly - deductions;
        totalNet += net;
        this.create("salarySlips", {
          payrollRunId: run.id, payrollNo: run.no, employeeId: emp.id, employeeCode: emp.code, employeeName: emp.name,
          month, department: emp.department, designation: emp.designation,
          present: att.present, leaveDays: att.leave, absent: att.absent,
          basic, hra, other, gross: monthly, leaveDeduction: leaveDed, absentDeduction: absentDed, deductions, net,
          status: "Generated",
        }, actor);
      });
      this.update("payrollRuns", run.id, { totalNet, employeeCount: (DB.employees || []).filter((e) => e.status === "Active").length }, actor);
      return run;
    },

    /* ----- settings / company ----- */
    settings() { return DB.settings || (DB.settings = defaultSettings()); },
    saveCompany(patch, actor) { DB.company = { ...DB.company, ...patch }; this.audit(actor, "update", "company", "profile", "Company profile updated"); notify(); },
    saveBackupConfig(patch, actor) {
      const b = this.settings().backup;
      DB.settings.backup = {
        ...b,
        cloud: { ...b.cloud, ...(patch.cloud || {}) },
        local: { ...b.local, ...(patch.local || {}) },
        schedule: { ...b.schedule, ...(patch.schedule || {}) },
      };
      this.audit(actor, "update", "settings", "backup", "Backup configuration updated");
      notify();
    },

    /* ----- backup / restore ----- */
    exportSnapshot() { return JSON.stringify(DB); },
    backupSummary() {
      const json = this.exportSnapshot();
      const entities = ["customers", "suppliers", "items", "quotations", "salesOrders", "materialReceipts", "materialIssues", "stockLedger"];
      const records = entities.reduce((s, k) => s + (DB[k] ? DB[k].length : 0), 0);
      return { bytes: json.length, records };
    },
    recordBackup(entry, actor) {
      const rec = { id: uid("B"), ts: Date.now(), by: actor || "system", status: "Success", ...entry };
      DB.backups = (DB.backups || []).concat(rec);
      DB.settings.backup.lastBackupAt = rec.ts;
      const ret = (DB.settings.backup.schedule.retention || 30) * 3;
      if (DB.backups.length > Math.max(ret, 60)) DB.backups = DB.backups.slice(-Math.max(ret, 60));
      this.audit(actor, "backup", "system", rec.filename || rec.type, (rec.type || "Backup") + " → " + (rec.destination || ""));
      notify();
      return rec;
    },
    async saveLocalSnapshot(label, actor) {
      const payload = JSON.parse(this.exportSnapshot());
      if (_usePostgres) {
        try {
          await fetch(apiBase() + "/api/snapshots", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: label || "Manual snapshot", createdBy: actor || "system", data: payload }),
          });
        } catch (e) { console.warn("[store] snapshot API failed", e); }
      }
      let snaps = [];
      try { snaps = JSON.parse(localStorage.getItem(SNAP_KEY) || "[]"); } catch (e) {}
      snaps.push({ ts: Date.now(), label: label || "Manual snapshot", by: actor || "system", db: this.exportSnapshot() });
      const keep = (DB.settings.backup.schedule.retention || 7);
      snaps = snaps.slice(-Math.max(keep, 5));
      try { localStorage.setItem(SNAP_KEY, JSON.stringify(snaps)); } catch (e) {}
      return snaps;
    },
    async listSnapshots() {
      if (_usePostgres) {
        try {
          const res = await fetch(apiBase() + "/api/snapshots");
          if (res.ok) {
            const rows = await res.json();
            return rows.map((s) => ({
              id: s.id, ts: new Date(s.created_at).getTime(), label: s.label, by: s.created_by, bytes: Number(s.bytes) || 0,
            }));
          }
        } catch (e) { /* fall through */ }
      }
      try { return JSON.parse(localStorage.getItem(SNAP_KEY) || "[]").map((s) => ({ ts: s.ts, label: s.label, by: s.by, bytes: (s.db || "").length })); } catch (e) { return []; }
    },
    async restoreSnapshot(tsOrId) {
      if (_usePostgres && typeof tsOrId === "number" && tsOrId < 1e12) {
        try {
          const res = await fetch(apiBase() + "/api/snapshots/" + tsOrId);
          if (res.ok) return this.restore(await res.json());
        } catch (e) { /* fall through */ }
      }
      try {
        const snaps = JSON.parse(localStorage.getItem(SNAP_KEY) || "[]");
        const s = snaps.find((x) => x.ts === tsOrId);
        if (!s) return false;
        return this.restore(JSON.parse(s.db));
      } catch (e) { return false; }
    },
    restore(obj) {
      if (!obj || typeof obj !== "object" || !obj._v) return false;
      DB = migrate(obj);
      notify();
      return true;
    },
    dbVersion: VERSION,
    isReady: () => _ready,
    backend: () => (_usePostgres ? "postgresql" : "localStorage"),

    async init() {
      const base = apiBase();
      try {
        const res = await fetch(base + "/api/state");
        if (res.status === 404) {
          DB = load();
          _usePostgres = true;
          await pushStateToApi();
        } else if (res.ok) {
          DB = migrate(await res.json());
          _usePostgres = true;
          try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) {}
        } else {
          DB = load();
        }
      } catch (e) {
        console.warn("[Veraglo store] API unreachable — using localStorage:", e.message || e);
        DB = load();
        _usePostgres = false;
      }
      if (typeof VG !== "undefined" && VG.ROLES) this.syncAllRolesToRuntime();
      _ready = true;
      notify();
      return { backend: this.backend() };
    },

    /* ----- Admin / RBAC ----- */
    getRole(key) {
      return (DB.customRoles || []).find((r) => r.key === key) || null;
    },
    listRoles() { return (DB.customRoles || []).slice().sort((a, b) => (a.hierarchy || 0) - (b.hierarchy || 0)); },
    saveRole(role, actor) {
      const existing = (DB.customRoles || []).find((r) => r.id === role.id || (role.key && r.key === role.key));
      if (existing) {
        this.update("customRoles", existing.id, role, actor);
        this.syncRoleToRuntime(role.key);
        return existing.id;
      }
      const rec = this.create("customRoles", role, actor);
      this.syncRoleToRuntime(role.key);
      return rec.id;
    },
    deleteRole(id, actor) {
      const r = this.get("customRoles", id);
      if (!r || r.builtIn) return false;
      if ((DB.erpUsers || []).some((u) => u.roleKey === r.key)) return false;
      this.remove("customRoles", id, actor);
      return true;
    },
    syncRoleToRuntime(key) {
      if (typeof VG === "undefined" || !VG.ROLES) return;
      const r = this.getRole(key);
      if (!r) return;
      VG.ROLES[key] = {
        label: r.label, tag: r.tag, avatar: r.avatar, color: r.color,
        modules: r.moduleAccess, actions: r.actions || ["view"], home: VG.ROLES[key] && VG.ROLES[key].home,
      };
    },
    syncAllRolesToRuntime() {
      (DB.customRoles || []).forEach((r) => { if (r.active !== false) this.syncRoleToRuntime(r.key); });
    },
    licenseAllowsModule(moduleId) {
      const lic = this.getActiveLicense();
      if (!lic || !lic.modules || lic.modules[0] === "all") return true;
      const list = lic.modules || [];
      return list.includes(moduleId) || list.includes("admin");
    },
    getRoleSections(roleKey, modId) {
      const r = this.getRole(roleKey);
      const sa = r && r.sectionAccess;
      if (!sa || !Object.prototype.hasOwnProperty.call(sa, modId)) return null;
      return sa[modId] || [];
    },

    canAction(roleKey, action, moduleId) {
      if (moduleId && !this.licenseAllowsModule(moduleId)) return false;
      const r = this.getRole(roleKey);
      const actions = (r && r.actions) || (VG.ROLES[roleKey] && VG.ROLES[roleKey].actions) || [];
      if (!actions.includes(action)) return false;
      if (!moduleId) return true;
      const perms = (r && r.permissions) || {};
      const mod = perms[moduleId];
      if (mod && mod[action] === false) return false;
      if (mod && mod[action] === true) return true;
      const access = r ? r.moduleAccess : (VG.ROLES[roleKey] && VG.ROLES[roleKey].modules);
      if (access === "all") return true;
      const list = Array.isArray(access) ? access : [];
      const appIds = { quotation: "sales", proforma: "sales", salesOrder: "sales", customer: "sales", purchaseRequest: "purchase", purchaseOrder: "purchase", item: "inventory", workOrder: "production", qcInspection: "quality", deliveryChallan: "dispatch", invoice: "accounts", salarySlip: "hr", leave: "hr", employee: "hr", templates: "admin", masterData: "admin", backup: "admin" };
      const mapped = appIds[moduleId] || moduleId;
      return list.includes(mapped) || list.includes(moduleId);
    },
    modulesForRole(roleKey) {
      const r = this.getRole(roleKey);
      const access = r ? r.moduleAccess : (VG.ROLES[roleKey] && VG.ROLES[roleKey].modules);
      if (!VG.MODULES) return [];
      const lic = this.getActiveLicense();
      const licMods = lic && lic.modules && lic.modules[0] !== "all" ? lic.modules : null;
      let mods;
      if (access === "all") mods = VG.MODULES.slice();
      else {
        const list = Array.isArray(access) ? access : [];
        mods = VG.MODULES.filter((m) => list.includes(m.id));
      }
      if (licMods) mods = mods.filter((m) => licMods.includes(m.id));
      return mods;
    },
    adminStats() {
      const users = (DB.erpUsers || []).filter((u) => !u.isDeleted);
      const active = users.filter((u) => u.status === "Active" && u.loginAllowed !== false);
      const pendingApprovals = (DB.quotations || []).filter((q) => q.status === "Pending Approval").length
        + (DB.purchaseRequests || []).filter((p) => p.status === "Pending").length
        + (DB.leaveRequests || []).filter((l) => l.status === "Pending").length;
      const log = DB.loginLog || [];
      const failed = log.filter((l) => !l.success).length;
      const sum = this.backupSummary();
      return {
        totalUsers: users.length, activeUsers: active.length, inactiveUsers: users.filter((u) => u.status !== "Active").length,
        pendingApprovals, recentUsers: users.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5),
        loginToday: log.filter((l) => l.success && new Date(l.ts).toDateString() === new Date().toDateString()).length,
        failedLogins: failed, backupStatus: sum.bytes ? "Configured" : "Empty", storageBytes: sum.bytes, records: sum.records,
        license: (DB.settings.license || {}), roles: (DB.customRoles || []).length,
      };
    },
    recordLogin(loginId, roleKey, success, extra) {
      const user = extra && extra.user ? extra.user : this.findErpUserByLogin(loginId);
      const email = (user && user.email) || loginId || "";
      const rk = (user && user.roleKey) || roleKey || "";
      const entry = {
        id: uid("LG"), ts: Date.now(), email, roleKey: rk, userId: (user && user.userId) || "",
        success: !!success, reason: (extra && extra.reason) || "",
        ip: (extra && extra.ip) || "",
        device: (extra && extra.device) || (typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : ""),
      };
      DB.loginLog = (DB.loginLog || []).concat(entry);
      if (DB.loginLog.length > 300) DB.loginLog = DB.loginLog.slice(-300);
      if (success && user) {
        this.update("erpUsers", user.id, { lastLogin: entry.ts, failedLogins: 0 }, rk);
      } else if (user) {
        const sec = this.settings().security || {};
        const max = sec.maxLoginAttempts || 5;
        const failed = (Number(user.failedLogins) || 0) + 1;
        const patch = { failedLogins: failed };
        if (failed >= max) patch.status = "Locked";
        this.update("erpUsers", user.id, patch, "system");
        if (user.isDeleted || user.status === "Inactive") {
          this.audit("system", "login-failed", "auth", user.userId || email, "Failed login after account removal/deactivation · " + (extra && extra.reason || ""));
        }
      }
      this.audit(rk || "system", success ? "login" : "login-failed", "auth", user ? user.userId : email, (success ? "Signed in" : "Failed sign-in") + (entry.reason ? " · " + entry.reason : "") + (entry.device ? " · " + entry.device.slice(0, 40) : ""));
      notify();
    },

    hasLoginUsers() {
      return (DB.erpUsers || []).some((u) =>
        !u.isDeleted && u.status === "Active" && u.loginAllowed !== false && u.passwordHash && String(u.passwordHash).length > 8
      );
    },

    async createInitialAdmin(payload) {
      if (this.hasLoginUsers()) return { ok: false, reason: "An administrator account already exists." };
      const email = String(payload.email || "").trim().toLowerCase();
      const name = String(payload.name || "").trim();
      const password = String(payload.password || "");
      if (!name || !email) return { ok: false, reason: "Name and email are required." };
      if (!email.includes("@")) return { ok: false, reason: "Enter a valid email address." };
      const roleKey = "admin";
      if (!this.getRole(roleKey) && !(VG.ROLES && VG.ROLES[roleKey])) {
        return { ok: false, reason: "Admin role is not configured." };
      }
      const rec = this.create("erpUsers", {
        userId: this.nextUserId(),
        name,
        email,
        username: email.split("@")[0],
        roleKey,
        department: "Administration",
        designation: "Administrator",
        locationId: (DB.locations && DB.locations[0] && DB.locations[0].id) || "",
        mobile: "",
        status: "Active",
        loginAllowed: true,
        isDeleted: false,
        forcePasswordChange: false,
        twoFactor: false,
        failedLogins: 0,
        createdAt: Date.now(),
      }, "system");
      const pw = await this.setUserPassword(rec.id, password, "system");
      if (!pw.ok) {
        this.deleteErpUser(rec.id, "system");
        return pw;
      }
      this.audit("system", "create", "erpUsers", rec.userId, "Initial administrator: " + email);
      notify();
      return { ok: true, user: this.get("erpUsers", rec.id), email, roleKey };
    },

    findErpUserByLogin(loginId) {
      const q = String(loginId || "").trim().toLowerCase();
      if (!q) return null;
      return (DB.erpUsers || []).find((u) => !u.isDeleted && (
        String(u.userId || "").toLowerCase() === q
        || String(u.email || "").toLowerCase() === q
        || String(u.username || "").toLowerCase() === q
      )) || null;
    },

    roleForUser(user) {
      if (!user || !user.roleKey) return null;
      return (DB.customRoles || []).find((r) => r.key === user.roleKey && r.active !== false) || null;
    },

    isUserLoginEligible(user) {
      if (!user || user.isDeleted) return { ok: false, reason: AUTH_INACTIVE_MSG };
      if (user.status !== "Active") return { ok: false, reason: AUTH_INACTIVE_MSG };
      if (user.loginAllowed === false) return { ok: false, reason: AUTH_INACTIVE_MSG };
      if (!user.roleKey) return { ok: false, reason: "No role assigned — contact your administrator." };
      const role = this.roleForUser(user);
      if (!role) return { ok: false, reason: "Role is inactive or missing — contact your administrator." };
      const sec = this.settings().security || {};
      if ((user.failedLogins || 0) >= (sec.maxLoginAttempts || 5) || user.status === "Locked") {
        return { ok: false, reason: "Account locked after too many failed attempts." };
      }
      if (!user.passwordHash) return { ok: false, reason: "Password not set — ask an administrator to reset your password." };
      return { ok: true, role };
    },

    async setUserPassword(userId, password, actor) {
      const u = this.get("erpUsers", userId);
      if (!u) return { ok: false, reason: "User not found" };
      const sec = this.settings().security || {};
      const min = sec.minPasswordLength || 8;
      if (String(password || "").length < min) return { ok: false, reason: "Password must be at least " + min + " characters" };
      const salt = newPasswordSalt();
      const passwordHash = await hashPassword(password, salt);
      this.update("erpUsers", userId, { passwordSalt: salt, passwordHash, forcePasswordChange: false, failedLogins: 0, status: u.status === "Locked" ? "Active" : u.status }, actor);
      this.audit(actor, "password-reset", "erpUsers", u.userId, "Password reset for " + u.email);
      return { ok: true };
    },

    deactivateErpUser(id, actor) {
      const u = this.get("erpUsers", id);
      if (!u || u.isDeleted) return;
      this.update("erpUsers", id, { status: "Inactive", loginAllowed: false, deactivatedAt: Date.now(), deactivatedBy: actor }, actor);
      this.forceLogoutUser(id, actor, "deactivated");
      this.audit(actor, "deactivate", "erpUsers", u.userId, "User deactivated: " + u.email);
    },

    reactivateErpUser(id, actor) {
      const u = this.get("erpUsers", id);
      if (!u || u.isDeleted) return;
      this.update("erpUsers", id, { status: "Active", loginAllowed: true, deactivatedAt: null, deactivatedBy: null }, actor);
      this.audit(actor, "reactivate", "erpUsers", u.userId, "User reactivated: " + u.email);
    },

    deleteErpUser(id, actor) {
      const u = this.get("erpUsers", id);
      if (!u) return;
      this.update("erpUsers", id, {
        isDeleted: true, status: "Deleted", loginAllowed: false,
        deletedAt: Date.now(), deletedBy: actor,
      }, actor);
      this.forceLogoutUser(id, actor, "deleted");
      this.audit(actor, "delete", "erpUsers", u.userId, "User deleted (soft): " + u.email);
    },

    forceLogoutUser(userId, actor, reason) {
      const u = this.get("erpUsers", userId);
      if (!u) return;
      const stamp = Date.now();
      const sessions = (DB.connectedSessions || []).filter((s) => s.userId === userId || s.email === u.email);
      sessions.forEach((s) => {
        DB.revokedSessions = (DB.revokedSessions || []).concat({
          id: uid("rv"), sessionId: s.sessionId, userId, email: u.email, revokedAt: stamp, by: actor || "system", reason: reason || "force-logout",
        });
      });
      DB.revokedSessions = (DB.revokedSessions || []).concat({
        id: uid("rv"), sessionId: "*", userId, email: u.email, revokedAt: stamp, by: actor || "system", reason: reason || "force-logout-all",
      });
      if (DB.revokedSessions.length > 500) DB.revokedSessions = DB.revokedSessions.slice(-500);
      DB.connectedSessions = (DB.connectedSessions || []).filter((s) => s.userId !== userId && s.email !== u.email);
      this.audit(actor || "system", "session-revoke", "auth", u.userId, "All sessions revoked" + (reason ? " (" + reason + ")" : ""));
      notify();
    },

    revokeSession(sessionId, actor) {
      const s = (DB.connectedSessions || []).find((x) => x.sessionId === sessionId);
      DB.revokedSessions = (DB.revokedSessions || []).concat({
        id: uid("rv"), sessionId, userId: (s && s.userId) || "", email: (s && s.email) || "",
        revokedAt: Date.now(), by: actor || "system", reason: "admin-revoke",
      });
      DB.connectedSessions = (DB.connectedSessions || []).filter((x) => x.sessionId !== sessionId);
      this.audit(actor, "session-revoke", "auth", sessionId, "Session revoked" + (s ? " for " + s.email : ""));
      notify();
    },

    isSessionRevoked(session) {
      if (!session) return true;
      return (DB.revokedSessions || []).some((r) =>
        r.userId === "*" || r.sessionId === "*global*"
        || r.sessionId === session.sessionId
        || (r.sessionId === "*" && r.userId && session.userId === r.userId)
        || (r.email && session.email && r.email === session.email && r.sessionId === "*")
      );
    },

    revokeAllSessions(actor) {
      const stamp = Date.now();
      DB.revokedSessions = (DB.revokedSessions || []).concat({
        id: uid("rv"), sessionId: "*global*", userId: "*", email: "", revokedAt: stamp, by: actor || "system", reason: "force-logout-all",
      });
      DB.connectedSessions = [];
      this.audit(actor || "system", "session-revoke", "auth", "all", "All sessions revoked");
      notify();
    },

    validateSession(session) {
      if (!session || !session.userId) return { ok: false, reason: AUTH_INACTIVE_MSG };
      if (this.isSessionRevoked(session)) return { ok: false, reason: AUTH_INACTIVE_MSG };
      const sec = this.settings().security || {};
      const timeoutMs = (sec.sessionTimeoutMins || 60) * 60000;
      if (session.since && Date.now() - session.since > timeoutMs) {
        return { ok: false, reason: "Session expired — sign in again." };
      }
      const user = this.get("erpUsers", session.userId);
      const elig = this.isUserLoginEligible(user);
      if (!elig.ok) return elig;
      if (user.roleKey !== session.roleKey || user.email !== session.email) {
        return { ok: false, reason: AUTH_INACTIVE_MSG };
      }
      return { ok: true, user };
    },

    endSession(sessionId) {
      DB.connectedSessions = (DB.connectedSessions || []).filter((s) => s.sessionId !== sessionId);
      notify();
    },

    sessionsForUser(userId) {
      const u = this.get("erpUsers", userId);
      if (!u) return [];
      return (DB.connectedSessions || []).filter((s) => s.userId === userId || s.email === u.email);
    },

    async validateLogin(loginId, password) {
      const id = String(loginId || "").trim();
      const pwd = String(password || "");
      if (!id || !pwd) return { ok: false, reason: "Enter User ID / email and password." };
      const user = this.findErpUserByLogin(id);
      if (!user) return { ok: false, reason: AUTH_INACTIVE_MSG };
      if (user.isDeleted) {
        this.recordLogin(id, "", false, { reason: "deleted-account", user });
        return { ok: false, reason: AUTH_INACTIVE_MSG };
      }
      const elig = this.isUserLoginEligible(user);
      if (!elig.ok) {
        this.recordLogin(id, user.roleKey, false, { reason: elig.reason, user });
        return elig;
      }
      const hash = await hashPassword(pwd, user.passwordSalt || "");
      if (hash !== user.passwordHash) {
        this.recordLogin(id, user.roleKey, false, { reason: "invalid-password", user });
        return { ok: false, reason: "Invalid User ID or password." };
      }
      return { ok: true, user, roleKey: user.roleKey, email: user.email };
    },
    nextUserId() {
      DB.seq.USR = (DB.seq.USR || 0) + 1;
      return "USR-" + String(DB.seq.USR).padStart(4, "0");
    },
    saveAdminSettings(patch, actor) {
      const sec = patch.security;
      if (sec && sec.forceLogoutAll) {
        this.revokeAllSessions(actor);
        patch = { ...patch, security: { ...sec, forceLogoutAll: false } };
      }
      DB.settings = { ...DB.settings, ...patch };
      if (patch.theme && patch.theme.accent && typeof document !== "undefined") {
        document.documentElement.style.setProperty("--accent", patch.theme.accent);
      }
      if (patch.typography && typeof VG !== "undefined" && VG.applyTypography) {
        VG.applyTypography(patch.typography, DB.settings.theme);
      }
      this.audit(actor, "update", "settings", "admin", "System settings updated");
      notify();
    },
    exportMasterSnapshot() {
      const keys = ["customers", "suppliers", "manufacturers", "items", "categories", "locations", "employees", "units", "taxes", "paymentTerms", "deliveryTerms"];
      const out = {};
      keys.forEach((k) => { out[k] = DB[k] || []; });
      return JSON.stringify(out, null, 2);
    },

    importMasterSnapshot(json, actor) {
      let data;
      try { data = typeof json === "string" ? JSON.parse(json) : json; } catch (e) { return { ok: false, error: "Invalid JSON file" }; }
      const errors = [];
      ["manufacturers", "categories", "locations", "units", "taxes", "paymentTerms", "deliveryTerms", "customers", "suppliers"].forEach((coll) => {
        if (!Array.isArray(data[coll])) return;
        data[coll].forEach((row) => {
          const existing = (DB[coll] || []).find((x) => x.id === row.id || (row.code && x.code === row.code));
          if (existing) this.update(coll, existing.id, row, actor);
          else this.create(coll, row, actor);
        });
      });
      if (Array.isArray(data.items)) {
        const seenSkus = new Set();
        data.items.forEach((row) => {
          if (typeof VG !== "undefined" && VG.skuEngine) {
            const res = VG.skuEngine.importItemRow(row, actor, { seenSkus, allowUpdate: true });
            if (!res.ok) errors.push((row.sku || row.name || row.id || "item") + ": " + res.error);
            return;
          }
          const existing = (DB.items || []).find((x) => x.id === row.id || (row.sku && x.sku === row.sku));
          if (existing) {
            const v = this.validateItemMfrDuplicate({ ...existing, ...row }, existing.id);
            if (!v.ok) errors.push(row.sku || row.id || "item: " + v.message);
            else this.update("items", existing.id, v.data, actor);
          } else {
            const rec = this.create("items", row, actor);
            if (!rec) errors.push(row.sku || row.id || "item: duplicate manufacturer + part number");
          }
        });
      }
      notify();
      return { ok: errors.length === 0, errors, imported: true };
    },

    fieldRule(roleKey, module, field) {
      const base = { visible: true, editable: true, mandatory: false, approvalRequired: false, masked: false };
      (DB.fieldPermissions || []).filter((r) => r.module === module && r.field === field && (!r.roleKey || r.roleKey === roleKey))
        .forEach((r) => {
          if (r.visible === false) base.visible = false;
          if (r.editable === false) base.editable = false;
          if (r.mandatory) base.mandatory = true;
          if (r.approvalRequired) base.approvalRequired = true;
          if (r.masked) base.masked = true;
        });
      return base;
    },

    getDefaultTemplate(docType) {
      return (DB.documentTemplates || []).find((t) => t.docType === docType && t.isDefault && t.active !== false)
        || (DB.documentTemplates || []).find((t) => t.docType === docType && t.active !== false);
    },

    dashboardPrefs(roleKey) {
      const all = (DB.settings && DB.settings.dashboard) || {};
      const perUser = (all.byRole && all.byRole[roleKey]) || {};
      return {
        pinnedModules: perUser.pinnedModules || all.pinnedModules || [],
        hiddenModules: perUser.hiddenModules || [],
        moduleOrder: perUser.moduleOrder || all.moduleOrder || [],
        recentModules: perUser.recentModules || all.recentModules || [],
        lastModuleId: perUser.lastModuleId || all.lastModuleId || "",
      };
    },
    recordModuleOpen(roleKey, moduleId, actor) {
      if (!roleKey || !moduleId) return;
      const prefs = this.dashboardPrefs(roleKey);
      let recent = (prefs.recentModules || []).filter((id) => id !== moduleId);
      recent.unshift(moduleId);
      recent = recent.slice(0, 6);
      this.saveDashboardPrefs(roleKey, { recentModules: recent, lastModuleId: moduleId }, actor || roleKey);
    },
    saveDashboardPrefs(roleKey, patch, actor) {
      const dash = { ...(DB.settings.dashboard || {}), byRole: { ...((DB.settings.dashboard || {}).byRole || {}) } };
      dash.byRole[roleKey] = { ...(dash.byRole[roleKey] || {}), ...patch };
      DB.settings.dashboard = dash;
      this.saveAdminSettings({ dashboard: dash }, actor);
    },

    setDefaultDocumentTemplate(templateId, actor) {
      const t = this.get("documentTemplates", templateId);
      if (!t) return;
      (DB.documentTemplates || []).forEach((x) => {
        if (x.docType === t.docType && x.id !== templateId) this.update("documentTemplates", x.id, { isDefault: false }, actor);
      });
      this.update("documentTemplates", templateId, { isDefault: true, active: true }, actor);
    },

    isSuperAdmin(roleKey) {
      return roleKey === "admin" || roleKey === "super_admin";
    },

    getActiveLicense() {
      const act = (DB.settings && DB.settings.activation) || {};
      if (act.licenseKeyId) {
        const lic = this.get("licenseKeys", act.licenseKeyId);
        if (lic) return lic;
      }
      if (act.serial) return (DB.licenseKeys || []).find((l) => l.serial === act.serial) || null;
      return null;
    },

    startEvaluationTrial(actor) {
      const act = (DB.settings && DB.settings.activation) || {};
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);
      DB.settings.activation = {
        ...act,
        status: "Trial",
        licenseKeyId: "",
        serial: "",
        trialEndsAt: act.trialEndsAt && act.trialEndsAt >= todayISO()
          ? act.trialEndsAt
          : trialEnd.toISOString().slice(0, 10),
      };
      this.audit(actor || "installer", "update", "license", "trial", "Evaluation trial started");
      notify();
      return { ok: true, trialEndsAt: DB.settings.activation.trialEndsAt };
    },

    isLicensed() {
      const act = (DB.settings && DB.settings.activation) || {};
      const trialEnd = act.trialEndsAt;
      const trialValid = trialEnd && trialEnd >= todayISO();
      if (!act.licenseKeyId && trialValid) {
        return { ok: true, trial: true, trialEndsAt: trialEnd };
      }
      if (act.status === "Trial") {
        if (trialEnd && trialEnd < todayISO()) {
          return { ok: false, reason: "Trial expired — activate with a license", expired: true };
        }
        return { ok: true, trial: true, trialEndsAt: trialEnd };
      }
      if (act.status === "Active" && act.licenseKeyId) {
        const lic = this.get("licenseKeys", act.licenseKeyId);
        if (lic && lic.status === "Blocked") return { ok: false, reason: "License is blocked" };
        if (lic && lic.status === "Suspended") return { ok: false, reason: "License is suspended" };
        if (lic && this.isLicenseExpired(lic)) return { ok: false, reason: "License expired — renew to continue", expired: true };
        const machineId = typeof VG !== "undefined" && VG.getMachineId ? VG.getMachineId() : act.machineId;
        const activations = (DB.licenseActivations || []).filter((a) => a.licenseKeyId === act.licenseKeyId && a.status === "Active");
        const mine = activations.find((a) => a.machineId === machineId);
        if (!mine && activations.length >= (Number(lic.maxDevices) || 1)) {
          return { ok: false, reason: "Device limit reached (" + activations.length + "/" + lic.maxDevices + ")" };
        }
        return { ok: true, license: lic, activation: act };
      }
      if (act.status === "Trial") {
        const end = act.trialEndsAt;
        if (end && end < todayISO()) return { ok: false, reason: "Trial expired — activate with a license", expired: true };
        return { ok: true, trial: true };
      }
      return { ok: false, reason: "ERP not activated — enter serial number and license code" };
    },

    isLicenseExpired(lic) {
      if (!lic || lic.licenseType === "Lifetime") return false;
      if (!lic.expiryDate) return false;
      return lic.expiryDate < todayISO();
    },

    logLicenseHistory(entry, actor) {
      const rec = { id: uid("lh"), ts: Date.now(), by: actor || "system", ...entry };
      DB.licenseHistory = (DB.licenseHistory || []).concat(rec);
      notify();
      return rec;
    },

    generateLicense(opts, actor) {
      const serial = (typeof VG !== "undefined" && VG.generateSerial) ? VG.generateSerial() : ("VG-" + Date.now());
      const payload = {
        companyId: opts.companyId || (DB.company && DB.company.id) || "",
        companyName: opts.companyName || (DB.company && DB.company.name) || "",
        licenseType: opts.licenseType || "Annual",
        maxUsers: Number(opts.maxUsers) || 10,
        maxDevices: Number(opts.maxDevices) || 2,
        modules: opts.modules || ["all"],
        startDate: opts.startDate || todayISO(),
        expiryDate: opts.expiryDate || "",
        status: opts.status || "Active",
        remarks: opts.remarks || "",
      };
      if (payload.licenseType === "Trial" && !payload.expiryDate) {
        const d = new Date(); d.setDate(d.getDate() + 30);
        payload.expiryDate = d.toISOString().slice(0, 10);
      }
      if (payload.licenseType === "Annual" && !payload.expiryDate) {
        const d = new Date(); d.setFullYear(d.getFullYear() + 1);
        payload.expiryDate = d.toISOString().slice(0, 10);
      }
      if (payload.licenseType === "Monthly" && !payload.expiryDate) {
        const d = new Date(); d.setMonth(d.getMonth() + 1);
        payload.expiryDate = d.toISOString().slice(0, 10);
      }
      if (payload.licenseType === "Lifetime") payload.expiryDate = "";
      const activationCode = VG.generateActivationCode(serial, payload);
      const rec = this.create("licenseKeys", { serial, activationCode, ...payload, isDefault: false }, actor);
      this.logLicenseHistory({ action: "Generated", serial, licenseKeyId: rec.id, details: payload.licenseType + " · " + payload.maxUsers + " users" }, actor);
      return rec;
    },

    activateLicense(serial, code, actor, opts) {
      const lic = (DB.licenseKeys || []).find((l) => String(l.serial).toUpperCase() === String(serial).toUpperCase());
      if (!lic) return { ok: false, reason: "Invalid serial number" };
      if (lic.status === "Blocked") return { ok: false, reason: "License is blocked" };
      if (lic.status === "Suspended") return { ok: false, reason: "License is suspended" };
      const offline = opts && opts.offlineResponse;
      const machineId = (opts && opts.machineId) || (typeof VG !== "undefined" && VG.getMachineId ? VG.getMachineId() : "");
      const validCode = offline
        ? String(code).toUpperCase().replace(/\s/g, "") === VG.generateOfflineResponseCode(serial, lic, machineId).toUpperCase().replace(/\s/g, "")
        : VG.verifyActivationCode(serial, code, lic);
      if (!validCode && code !== lic.activationCode) {
        this.logLicenseHistory({ action: "Validation failed", serial, machineId, details: "Invalid activation code" }, actor);
        return { ok: false, reason: "Invalid license code" };
      }
      if (this.isLicenseExpired(lic)) {
        this.logLicenseHistory({ action: "Validation failed", serial, machineId, details: "Expired" }, actor);
        return { ok: false, reason: "License expired — use Renew in Admin", expired: true };
      }
      const activeOnDevice = (DB.licenseActivations || []).filter((a) => a.licenseKeyId === lic.id && a.status === "Active");
      const existing = activeOnDevice.find((a) => a.machineId === machineId);
      if (!existing && activeOnDevice.length >= (Number(lic.maxDevices) || 1)) {
        return { ok: false, reason: "Maximum devices (" + lic.maxDevices + ") already activated. Deactivate an old device or transfer license." };
      }
      let actRec = existing;
      if (!actRec) {
        actRec = this.create("licenseActivations", {
          licenseKeyId: lic.id, serial: lic.serial, machineId,
          machineName: (opts && opts.machineName) || (VG.getMachineLabel && VG.getMachineLabel()) || "Device",
          companyId: lic.companyId, companyName: lic.companyName,
          activatedAt: Date.now(), activatedBy: actor || "installer",
          status: "Active", lastSeenAt: Date.now(),
        }, actor);
      } else {
        this.update("licenseActivations", actRec.id, { lastSeenAt: Date.now(), status: "Active" }, actor);
      }
      DB.settings.activation = {
        status: "Active", serial: lic.serial, licenseKeyId: lic.id, machineId,
        activatedAt: Date.now(), activatedBy: actor || "installer",
      };
      DB.settings.license = {
        plan: lic.licenseType + " · " + (lic.companyName || ""),
        seats: lic.maxUsers, validUntil: lic.expiryDate || "Lifetime", status: "Active",
      };
      if (typeof VG !== "undefined" && VG.saveLocalActivation) {
        VG.saveLocalActivation({ serial: lic.serial, licenseKeyId: lic.id, machineId, activatedAt: Date.now() });
      }
      this.logLicenseHistory({ action: "Activated", serial, licenseKeyId: lic.id, machineId, activationId: actRec.id, details: actRec.machineName }, actor);
      this.audit(actor, "activate", "license", lic.serial, "License activated on " + machineId);
      notify();
      return { ok: true, license: lic, activation: actRec };
    },

    deactivateLicense(activationId, actor, remarks) {
      const act = this.get("licenseActivations", activationId);
      if (!act) return { ok: false, reason: "Activation not found" };
      this.update("licenseActivations", activationId, { status: "Deactivated", deactivatedAt: Date.now(), remarks: remarks || "" }, actor);
      const cur = (DB.settings.activation || {});
      if (cur.machineId === act.machineId && cur.licenseKeyId === act.licenseKeyId) {
        DB.settings.activation = { ...cur, status: "Inactive", licenseKeyId: "", serial: "" };
        if (typeof VG !== "undefined" && VG.clearLocalActivation) VG.clearLocalActivation();
      }
      this.logLicenseHistory({ action: "Deactivated", serial: act.serial, machineId: act.machineId, activationId, details: remarks || "" }, actor);
      notify();
      return { ok: true };
    },

    transferLicense(activationId, newMachineId, serial, code, actor) {
      const act = this.get("licenseActivations", activationId);
      if (!act) return { ok: false, reason: "Source activation not found" };
      this.update("licenseActivations", activationId, { status: "Transferred", deactivatedAt: Date.now() }, actor);
      this.logLicenseHistory({ action: "Transfer out", serial: act.serial, machineId: act.machineId, details: "To " + newMachineId }, actor);
      return this.activateLicense(serial || act.serial, code, actor, { machineId: newMachineId, machineName: "Transferred device" });
    },

    renewLicense(licenseKeyId, patch, actor) {
      const lic = this.get("licenseKeys", licenseKeyId);
      if (!lic) return { ok: false, reason: "License not found" };
      const expiryDate = patch.expiryDate || lic.expiryDate;
      const status = patch.status || "Active";
      const activationCode = VG.generateActivationCode(lic.serial, { ...lic, expiryDate, status, licenseType: patch.licenseType || lic.licenseType });
      this.update("licenseKeys", licenseKeyId, { ...patch, expiryDate, status, activationCode }, actor);
      this.logLicenseHistory({ action: "Renewed", serial: lic.serial, licenseKeyId, details: "New expiry " + expiryDate }, actor);
      notify();
      return { ok: true, activationCode };
    },

    validateDataPath(path, actor) {
      const p = String(path || "").trim();
      const result = { path: p, readOk: !!p, writeOk: !!p, type: p.indexOf("\\\\") === 0 || p.startsWith("//") ? "network" : "local", at: Date.now() };
      if (_usePostgres && typeof fetch !== "undefined") {
        return fetch(apiBase() + "/api/datapath/validate", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: p }),
        }).then((r) => r.json()).then((j) => ({ ...result, ...j })).catch(() => result);
      }
      return Promise.resolve(result);
    },

    async setDataPath(path, opts, actor) {
      if (!this.isSuperAdmin(actor)) return { ok: false, reason: "Only Super Admin or Admin can change data path" };
      const prev = (DB.settings.dataPath || {}).current || "";
      const next = String(path || "").trim();
      if (!next) return { ok: false, reason: "Enter a folder path" };
      const validation = await this.validateDataPath(next, actor);
      if (!validation.writeOk && !validation.readOk) return { ok: false, reason: "Path validation failed — check permissions" };
      if (opts && opts.backupFirst) {
        await this.saveLocalSnapshot("Pre data-path migration", actor);
      }
      const companies = (opts && opts.companies) || validation.companies || [{ id: "default", name: (DB.company && DB.company.name) || "Company", folder: next }];
      DB.settings.dataPath = {
        ...(DB.settings.dataPath || {}),
        current: next, type: validation.type || "local",
        lastValidatedAt: Date.now(), readOk: validation.readOk, writeOk: validation.writeOk,
        companies, encryptAtRest: opts && opts.encryptAtRest != null ? opts.encryptAtRest : true,
      };
      DB.dataPathHistory = (DB.dataPathHistory || []).concat({
        id: uid("dp"), ts: Date.now(), by: actor, from: prev, to: next,
        migrated: !!(opts && opts.migrateCopy), backupId: opts && opts.backupId,
        remarks: (opts && opts.remarks) || "",
      });
      if (opts && opts.migrateCopy) {
        DB.migrationLogs = (DB.migrationLogs || []).concat({
          id: uid("mg"), ts: Date.now(), by: actor, from: prev, to: next, status: "Completed",
          recordCount: Object.keys(DB).length, encrypted: DB.settings.dataPath.encryptAtRest,
        });
      }
      this.audit(actor, "update", "dataPath", "settings", "Data path: " + prev + " → " + next);
      notify();
      return { ok: true, validation };
    },

    sessionHeartbeat(info) {
      const session = {
        sessionId: info.sessionId, userId: info.userId, email: info.email, roleKey: info.roleKey,
      };
      if (session.sessionId) {
        const v = this.validateSession(session);
        if (!v.ok) return { ok: false, reason: v.reason };
      }
      const sid = info.sessionId || uid("ses");
      const machineId = info.machineId || (typeof VG !== "undefined" && VG.getMachineId ? VG.getMachineId() : "");
      const row = {
        sessionId: sid, email: info.email || "", roleKey: info.roleKey || "", userId: info.userId || "",
        machineId, machineName: info.machineName || "", moduleId: info.moduleId || "",
        dataPath: (DB.settings.dataPath && DB.settings.dataPath.current) || "browser-local",
        lastSeenAt: Date.now(), since: info.since || Date.now(),
      };
      const list = (DB.connectedSessions || []).filter((s) => s.sessionId !== sid && Date.now() - (s.lastSeenAt || 0) < 120000);
      DB.connectedSessions = list.concat(row);
      notify();
      if (_usePostgres && typeof fetch !== "undefined") {
        fetch(apiBase() + "/api/sessions/heartbeat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(row),
        }).catch(() => {});
      }
      return sid;
    },

    pruneSessions() {
      DB.connectedSessions = (DB.connectedSessions || []).filter((s) => Date.now() - (s.lastSeenAt || 0) < 180000);
    },

    acquireRecordLock(coll, id, actor) {
      if (!(DB.settings.dataPath && DB.settings.dataPath.lockEnabled)) return { ok: true };
      const key = coll + ":" + id;
      const existing = (DB.recordLocks || []).find((l) => l.key === key && l.by !== actor && Date.now() - (l.at || 0) < 300000);
      if (existing) return { ok: false, reason: "Record locked by " + (existing.by || "another user") };
      DB.recordLocks = (DB.recordLocks || []).filter((l) => l.key !== key || l.by === actor);
      DB.recordLocks.push({ id: uid("lk"), key, coll, recordId: id, by: actor, at: Date.now() });
      notify();
      return { ok: true };
    },

    releaseRecordLock(coll, id, actor) {
      const key = coll + ":" + id;
      DB.recordLocks = (DB.recordLocks || []).filter((l) => !(l.key === key && l.by === actor));
      notify();
    },

    checkRecordLock(coll, id, actor) {
      if (!(DB.settings.dataPath && DB.settings.dataPath.lockEnabled)) return null;
      const key = coll + ":" + id;
      const existing = (DB.recordLocks || []).find((l) => l.key === key && l.by !== actor && Date.now() - (l.at || 0) < 300000);
      if (existing) {
        if (typeof VG !== "undefined" && VG.toast) VG.toast("Record is being edited by " + existing.by, "warn");
        return existing;
      }
      return null;
    },

    licenseReport(type) {
      const keys = DB.licenseKeys || [];
      const acts = DB.licenseActivations || [];
      const hist = DB.licenseHistory || [];
      const dph = DB.dataPathHistory || [];
      const sess = DB.connectedSessions || [];
      if (type === "active") return keys.filter((l) => l.status === "Active" && !this.isLicenseExpired(l));
      if (type === "expired") return keys.filter((l) => this.isLicenseExpired(l) || l.status === "Expired");
      if (type === "devices") return acts.filter((a) => a.status === "Active");
      if (type === "transfers") return hist.filter((h) => (h.action || "").indexOf("Transfer") >= 0);
      if (type === "datapath") return dph;
      if (type === "connected") return sess;
      if (type === "migrations") return DB.migrationLogs || [];
      return keys;
    },

    upsertPincode(p, actor) {
      const existing = DB.pincodes.find((x) => x.pin === p.pin && x.city === p.city);
      if (existing) return existing;
      return this.create("pincodes", p, actor || "system");
    },

    resetDemo() { DB = seed(); notify(); },

    // utility re-exports
    fyCode, inr, todayISO,
  };

  function summarize(coll, rec) {
    if (!rec) return "";
    return rec.name || rec.subject || rec.title || rec.no || rec.code || rec.sku || rec.id || coll;
  }

  /* ---------------- React hooks ---------------- */
  function useDB() {
    const [, setV] = useState(0);
    useEffect(() => store.subscribe(() => setV((v) => v + 1)), []);
    return store;
  }

  VG.store = store;
  VG.useDB = useDB;
  VG.fmt = { inr, todayISO, fyCode };
  VG.CATEGORY_TYPE_CODES = [
    { code: "RWM", label: "Raw Material" },
    { code: "FNG", label: "Finished Goods" },
    { code: "WIP", label: "Work in Progress" },
    { code: "SFG", label: "Semi-Finished Goods" },
    { code: "PKG", label: "Packaging" },
    { code: "SPR", label: "Spares" },
    { code: "CON", label: "Consumables" },
    { code: "OTH", label: "Other" },
  ];
})(window.VG);
