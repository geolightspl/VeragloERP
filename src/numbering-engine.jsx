/* Veraglo ERP — Global alphanumeric document & master numbering engine */
(function (VG) {
  const PREFIX_DOC_TYPE = {
    QT: "Quotation", QTN: "Quotation",
    PI: "Proforma Invoice",
    SO: "Sales Order",
    PO: "Purchase Order",
    PR: "Purchase Request",
    RFQ: "RFQ",
    ENQ: "Enquiry",
    LEAD: "Lead",
    MRN: "Material Receipt Note",
    GRN: "Material Receipt Note",
    MIS: "Material Issue Slip",
    MIN: "Material Issue Slip",
    RC: "Returnable Challan",
    NRC: "Non-Returnable Challan",
    INV: "Tax Invoice",
    CN: "Credit Note",
    DN: "Debit Note",
    QC: "QC Report",
    NCR: "QC Report",
    WO: "Work Order",
    BOM: "BOM",
    MR: "Material Requirement",
    FG: "Finished Goods Transfer",
    QCI: "QC Inspection",
    SH: "Delivery Challan",
    LP: "Leave",
    PAY: "Payroll Run",
    VB: "Vendor Bill",
    VP: "Vendor Payment",
    RET: "Return",
    PV: "Physical Verification",
    TRF: "Stock Transfer",
    SCR: "Scrap",
    CUST: "Customer",
    SUPP: "Supplier",
    EMP: "Employee",
  };

  const DEFAULT_SERIES_DEFS = [
    ["Quotation", "QT"], ["Proforma Invoice", "PI"], ["Sales Order", "SO"], ["Tax Invoice", "INV"],
    ["Purchase Order", "PO"], ["Purchase Request", "PR"], ["RFQ", "RFQ"], ["Enquiry", "ENQ"], ["Lead", "LEAD"],
    ["Material Receipt Note", "GRN"], ["Material Issue Slip", "MIN"], ["Returnable Challan", "RC"],
    ["Non-Returnable Challan", "NRC"], ["Delivery Challan", "SH"], ["Work Order", "WO"], ["BOM", "BOM"],
    ["QC Report", "QC"], ["Credit Note", "CN"], ["Debit Note", "DN"], ["Leave", "LP"], ["Payroll Run", "PAY"],
    ["Vendor Bill", "VB"], ["Vendor Payment", "VP"],
  ];

  const DOC_TYPE_ALIASES = {
    "Material Receipt": "Material Receipt Note",
    "Material Issue": "Material Issue Slip",
    "Salary Slip": "Payroll Run",
  };

  const STANDARD_PREFIX_BY_DOC = DEFAULT_SERIES_DEFS.reduce((m, [doc, prefix]) => {
    m[doc] = prefix;
    return m;
  }, {});

  const MASTER_DEFS = {
    CUST: { collection: "customers", field: "code", pad: 6 },
    SUPP: { collection: "suppliers", field: "code", pad: 6 },
    EMP: { collection: "employees", field: "code", pad: 6 },
    CAT: { collection: "categories", field: "code", pad: 3 },
    MFR: { collection: "manufacturers", field: "code", pad: 3 },
    LOC: { collection: "locations", field: "code", pad: 3 },
    ILOC: { collection: "itemLocations", field: "code", pad: 3 },
  };

  function db() {
    return (VG.store && VG.store.db && VG.store.db()) || null;
  }

  function sanitizeAlphaNum(s) {
    return String(s || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  }

  function calendarYear(d) {
    const dt = d ? new Date(d) : new Date();
    return String(dt.getFullYear());
  }

  function financialYearShort(d) {
    const dt = d ? new Date(d) : new Date();
    const y = dt.getFullYear();
    const start = dt.getMonth() >= 3 ? y : y - 1;
    return String(start % 100) + String((start + 1) % 100);
  }

  function isAlphanumericOnly(value) {
    const s = String(value || "").trim();
    return !s || /^[A-Za-z0-9]+$/.test(s);
  }

  function defaultSeriesRow(docType, prefix) {
    return {
      docType,
      prefix: sanitizeAlphaNum(prefix),
      useCalendarYear: true,
      useFy: false,
      padding: 5,
      startSequence: 1,
      reset: "Yearly",
      branchWise: false,
      manualOverride: false,
      active: true,
    };
  }

  function normalizeSeriesRow(s, opts) {
    if (!s) return s;
    const upgrade = !!(opts && opts.upgrade);
    if (DOC_TYPE_ALIASES[s.docType]) s.docType = DOC_TYPE_ALIASES[s.docType];
    const stdPrefix = STANDARD_PREFIX_BY_DOC[s.docType];
    if (upgrade && stdPrefix) s.prefix = sanitizeAlphaNum(stdPrefix);
    else s.prefix = sanitizeAlphaNum(s.prefix || stdPrefix || "");
    if (upgrade) {
      s.useCalendarYear = true;
      s.useFy = false;
    } else {
      if (s.useCalendarYear == null && s.useFy == null) {
        s.useCalendarYear = true;
        s.useFy = false;
      }
      if (s.useCalendarYear && s.useFy) s.useFy = false;
      if (!s.useCalendarYear && !s.useFy) s.useCalendarYear = true;
    }
    if (s.startSequence == null) s.startSequence = 1;
    if (!s.padding || Number(s.padding) < 5) s.padding = 5;
    if (s.active == null) s.active = true;
    if (!s.reset) s.reset = "Yearly";
    return s;
  }

  function ensureDefaultSeries(database, opts) {
    if (!database) return;
    if (!Array.isArray(database.numberSeries)) database.numberSeries = [];
    database.numberSeries.forEach((s) => normalizeSeriesRow(s, opts));
    const activeByDoc = {};
    database.numberSeries.forEach((s) => {
      if (s.active === false) return;
      const doc = s.docType;
      if (!activeByDoc[doc]) activeByDoc[doc] = s;
      else s.active = false;
    });
    DEFAULT_SERIES_DEFS.forEach(([docType, prefix], i) => {
      if (!database.numberSeries.some((s) => s.docType === docType && s.active !== false)) {
        database.numberSeries.push({ id: "ns" + (database.numberSeries.length + i + 1), ...defaultSeriesRow(docType, prefix) });
      }
    });
    database.numberSeries.forEach((s) => normalizeSeriesRow(s, opts));
  }

  function seriesForPrefix(prefix) {
    const database = db();
    if (!database) return null;
    ensureDefaultSeries(database);
    const docType = PREFIX_DOC_TYPE[prefix];
    if (!docType) return null;
    return (database.numberSeries || []).find((s) => s.active !== false && s.docType === docType) || null;
  }

  function periodKey(series, dateRef) {
    const dt = dateRef ? new Date(dateRef) : new Date();
    if (!series || series.reset === "Never") return "ALL";
    if (series.reset === "Monthly") return dt.getFullYear() + String(dt.getMonth() + 1).padStart(2, "0");
    if (series.useCalendarYear) return "Y" + calendarYear(dateRef);
    if (series.useFy) return "FY" + financialYearShort(dateRef);
    return "Y" + calendarYear(dateRef);
  }

  function formatNumber(series, seq, dateRef) {
    const s = series || {};
    const parts = [sanitizeAlphaNum(s.prefix)];
    if (s.useCalendarYear) parts.push(calendarYear(dateRef));
    else if (s.useFy) parts.push(financialYearShort(dateRef));
    parts.push(String(seq).padStart(Number(s.padding) || 5, "0"));
    return parts.join("");
  }

  function previewSeries(series, dateRef) {
    const start = Number(series && series.startSequence) || 1;
    return formatNumber(series, start, dateRef || new Date().toISOString().slice(0, 10));
  }

  function tailSeqFromNo(no, prefix, series) {
    const raw = String(no || "");
    const p = sanitizeAlphaNum(prefix);
    if (!raw || !p) return 0;
    if (/[^A-Za-z0-9]/.test(raw)) {
      const parts = raw.split(/[\/\-\s]+/).filter(Boolean);
      if (parts.length >= 2) {
        const head = sanitizeAlphaNum(parts.slice(0, -1).join(""));
        const last = parts[parts.length - 1];
        if (head.startsWith(p) && /^\d+$/.test(last)) return parseInt(last, 10);
      }
      return 0;
    }
    const clean = sanitizeAlphaNum(raw);
    if (!clean.startsWith(p)) return 0;
    const tail = clean.slice(p.length);
    const pad = Number((series && series.padding) || 5);
    if (series && (series.useCalendarYear || series.useFy) && tail.length > pad) {
      const seqPart = tail.slice(-pad);
      const yearPart = tail.slice(0, tail.length - pad);
      if (/^\d+$/.test(yearPart) && /^\d+$/.test(seqPart)) return parseInt(seqPart, 10);
    }
    const m = tail.match(/(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function seqStoreKey(prefix, series, dateRef) {
    if (series) return "NS_" + series.id + "_" + periodKey(series, dateRef);
    return "DOC_" + sanitizeAlphaNum(prefix) + "_" + periodKey({ reset: "Yearly", useCalendarYear: true }, dateRef);
  }

  function bumpSeq(key, startAt) {
    const database = db();
    if (!database) return startAt || 1;
    database.seq = database.seq || {};
    const cur = Number(database.seq[key]) || 0;
    const next = Math.max(cur, (Number(startAt) || 1) - 1) + 1;
    database.seq[key] = next;
    return next;
  }

  function isDuplicateDocNo(no, prefix) {
    const database = db();
    if (!database || !no) return false;
    const docType = PREFIX_DOC_TYPE[prefix];
    const collectionsByType = {
      Quotation: ["quotations"], "Proforma Invoice": ["proformas"], "Sales Order": ["salesOrders"],
      "Tax Invoice": ["invoices"], "Purchase Order": ["purchaseOrders"], "Purchase Request": ["purchaseRequests"],
      RFQ: ["rfqs"], Enquiry: ["enquiries"], Lead: ["leads"], "Material Receipt Note": ["materialReceipts"],
      "Material Issue Slip": ["materialIssues"], "Delivery Challan": ["shipments"], "Work Order": ["workOrders"],
      BOM: ["boms"], "QC Report": ["qcInspections", "ncrs"], Leave: ["leaveRequests"], "Payroll Run": ["payrollRuns"],
      "Vendor Bill": ["vendorBills"], "Vendor Payment": ["vendorPayments"],
    };
    const cols = collectionsByType[docType] || [];
    const target = sanitizeAlphaNum(no);
    return cols.some((coll) => (database[coll] || []).some((r) => sanitizeAlphaNum(r.no) === target));
  }

  function nextDocumentNo(prefix, dateRef) {
    const database = db();
    if (!database) return sanitizeAlphaNum(prefix) + "00001";
    ensureDefaultSeries(database);
    const ser = seriesForPrefix(prefix);
    const date = dateRef || new Date().toISOString().slice(0, 10);
    const key = seqStoreKey(prefix, ser, date);
    let seq = bumpSeq(key, ser ? ser.startSequence : 1);
    let no = formatNumber(ser || { prefix: sanitizeAlphaNum(prefix), padding: 5, useCalendarYear: true }, seq, date);
    let guard = 0;
    while (isDuplicateDocNo(no, prefix) && guard < 500) {
      seq = bumpSeq(key, seq + 1);
      no = formatNumber(ser || { prefix: sanitizeAlphaNum(prefix), padding: 5, useCalendarYear: true }, seq, date);
      guard++;
    }
    return no;
  }

  function maxMasterSeq(prefix, collection, field) {
    const database = db();
    if (!database) return 0;
    const p = sanitizeAlphaNum(prefix);
    let max = 0;
    (database[collection] || []).forEach((rec) => {
      const raw = String(rec[field] || "").toUpperCase();
      const clean = sanitizeAlphaNum(raw);
      if (clean.startsWith(p)) {
        const tail = clean.slice(p.length);
        const m = tail.match(/^(\d+)$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      }
      const legacy = raw.match(new RegExp("^" + p + "[\\-_]?(\\d+)$"));
      if (legacy) max = Math.max(max, parseInt(legacy[1], 10));
    });
    return max;
  }

  function masterFormatConfig(prefix) {
    const database = db();
    const p = sanitizeAlphaNum(prefix);
    const custom = database && database.settings && database.settings.numbering
      && database.settings.numbering.masterFormats
      && database.settings.numbering.masterFormats[p];
    return custom || null;
  }

  function nextMasterCode(prefix, opts) {
    const def = MASTER_DEFS[prefix] || opts || {};
    const custom = masterFormatConfig(prefix);
    const collection = (opts && opts.collection) || def.collection;
    const field = (opts && opts.field) || def.field || "code";
    const pad = (custom && custom.pad) || (opts && opts.pad) || def.pad || 6;
    const p = sanitizeAlphaNum((custom && custom.prefix) || prefix);
    const max = maxMasterSeq(p, collection, field);
    return p + String(max + 1).padStart(pad, "0");
  }

  function seriesRowFromRule(docType, prefix, rule) {
    const row = defaultSeriesRow(docType, prefix);
    if (!rule) return row;
    if (rule.padding != null) row.padding = Number(rule.padding) || 5;
    if (rule.startSequence != null) row.startSequence = Number(rule.startSequence) || 1;
    if (rule.reset) row.reset = rule.reset;
    if (rule.yearMode === "fy") { row.useFy = true; row.useCalendarYear = false; }
    else if (rule.yearMode === "calendar") { row.useCalendarYear = true; row.useFy = false; }
    else if (rule.yearMode === "none") { row.useCalendarYear = false; row.useFy = false; }
    if (rule.branchWise != null) row.branchWise = !!rule.branchWise;
    if (rule.manualOverride != null) row.manualOverride = !!rule.manualOverride;
    if (rule.active != null) row.active = !!rule.active;
    return normalizeSeriesRow(row);
  }

  function previewFromRule(prefix, rule, dateRef) {
    const ser = seriesRowFromRule("Preview", prefix, rule);
    const sampleSeq = Number(rule && rule.previewSeq) || 125;
    return formatNumber(ser, sampleSeq, dateRef || new Date().toISOString().slice(0, 10));
  }

  function applyBulkNumbering(database, selections, rule) {
    if (!database || !selections) return database;
    const targets = (typeof VG !== "undefined" && VG.NUMBERING_APPLY_TARGETS) || [];
    if (!database.settings) database.settings = {};
    database.settings.numbering = database.settings.numbering || {};
    database.settings.numbering.masterFormats = database.settings.numbering.masterFormats || {};
    ensureDefaultSeries(database);

    targets.forEach((target) => {
      const sel = selections[target.key];
      if (!sel || !sel.selected) return;
      const prefix = sanitizeAlphaNum(sel.prefix || target.defaultPrefix || "");
      if (target.type === "sku") {
        database.settings.skuNumbering = {
          ...(database.settings.skuNumbering || {}),
          companyPrefix: prefix || database.settings.skuNumbering?.companyPrefix || "GLS",
          separator: "",
          numberLength: Number(rule.padding) || database.settings.skuNumbering?.numberLength || 7,
          includeCategoryCode: rule.includeCategoryCode !== false,
        };
        if (rule.yearMode === "calendar" || rule.yearMode === "fy") {
          database.settings.skuNumbering.includeYear = true;
          database.settings.skuNumbering.yearMode = rule.yearMode;
          database.settings.skuNumbering.resetRule = "yearly";
        } else if (rule.yearMode === "none") {
          database.settings.skuNumbering.includeYear = false;
          database.settings.skuNumbering.resetRule = "never";
        }
      } else if (target.type === "master") {
        database.settings.numbering.masterFormats[sanitizeAlphaNum(target.masterPrefix)] = {
          prefix,
          pad: Number(rule.padding) || 6,
        };
      } else if (target.type === "doc") {
        let ser = (database.numberSeries || []).find((s) => s.docType === target.docType && s.active !== false);
        if (!ser) {
          ser = { id: "ns" + Date.now() + Math.random().toString(36).slice(2, 6), ...defaultSeriesRow(target.docType, prefix) };
          database.numberSeries.push(ser);
        }
        Object.assign(ser, seriesRowFromRule(target.docType, prefix, rule));
        ser.prefix = prefix;
        normalizeSeriesRow(ser);
      }
    });

    if (rule) {
      database.settings.numbering.defaultPadding = Number(rule.padding) || database.settings.numbering.defaultPadding || 5;
      database.settings.numbering.defaultYearMode = rule.yearMode || database.settings.numbering.defaultYearMode || "calendar";
      database.settings.numbering.defaultReset = rule.reset || database.settings.numbering.defaultReset || "Yearly";
    }
    syncCountersFromData(database);
    return database;
  }

  function syncCountersFromData(database) {
    if (!database) return;
    ensureDefaultSeries(database);
    database.seq = database.seq || {};
    database.numberSeries.forEach((ser) => {
      if (ser.active === false) return;
      const prefix = sanitizeAlphaNum(ser.prefix);
      const docType = ser.docType;
      const collectionsByType = {
        Quotation: ["quotations"], "Proforma Invoice": ["proformas"], "Sales Order": ["salesOrders"],
        "Tax Invoice": ["invoices"], "Purchase Order": ["purchaseOrders"], "Purchase Request": ["purchaseRequests"],
        RFQ: ["rfqs"], Enquiry: ["enquiries"], Lead: ["leads"], "Material Receipt Note": ["materialReceipts"],
        "Material Issue Slip": ["materialIssues"], "Delivery Challan": ["shipments"], "Work Order": ["workOrders"],
        BOM: ["boms"], "QC Report": ["qcInspections", "ncrs"], Leave: ["leaveRequests"], "Payroll Run": ["payrollRuns"],
        "Vendor Bill": ["vendorBills"], "Vendor Payment": ["vendorPayments"],
      };
      let max = Number(ser.startSequence) || 1;
      (collectionsByType[docType] || []).forEach((coll) => {
        (database[coll] || []).forEach((rec) => {
          max = Math.max(max, tailSeqFromNo(rec.no, prefix, ser));
        });
      });
      const key = "NS_" + ser.id + "_" + periodKey(ser, new Date().toISOString().slice(0, 10));
      database.seq[key] = Math.max(Number(database.seq[key]) || 0, max);
    });
    Object.keys(PREFIX_DOC_TYPE).forEach((prefix) => {
      const ser = (database.numberSeries || []).find((s) => sanitizeAlphaNum(s.prefix) === sanitizeAlphaNum(prefix));
      if (ser) return;
      const key = "DOC_" + sanitizeAlphaNum(prefix);
      let max = Number(database.seq[prefix]) || 0;
      const cols = ["quotations", "proformas", "salesOrders", "invoices", "purchaseOrders", "purchaseRequests",
        "rfqs", "enquiries", "leads", "materialReceipts", "materialIssues", "shipments", "workOrders",
        "boms", "qcInspections", "ncrs", "leaveRequests", "payrollRuns", "vendorBills", "vendorPayments",
        "finishedGoodsTransfers", "materialRequirements", "qcIssues", "returns", "physicalVerifications"];
      cols.forEach((coll) => {
        (database[coll] || []).forEach((rec) => {
          if (rec.no) max = Math.max(max, tailSeqFromNo(rec.no, prefix, ser));
        });
      });
      database.seq[key] = max;
    });
  }

  function migrateNumbering(database) {
    if (!database) return database;
    if (!database.settings) database.settings = {};
    database.settings.numbering = database.settings.numbering || {};
    const curVer = Number(database.settings.numbering.engineVersion) || 0;
    const upgrade = curVer < 2;
    database.numberMappings = database.numberMappings || [];
    if (upgrade) {
      database.seq = database.seq || {};
      Object.keys(database.seq).forEach((k) => {
        if (k.startsWith("NS_") || k.startsWith("DOC_")) delete database.seq[k];
      });
      (database.numberSeries || []).forEach((s) => {
        const oldPrefix = s.prefix;
        const oldDoc = s.docType;
        normalizeSeriesRow(s, { upgrade: true });
        if (oldPrefix !== s.prefix || oldDoc !== s.docType) {
          database.numberMappings.push({
            ts: Date.now(), type: "series_normalize", oldPrefix, newPrefix: s.prefix, oldDocType: oldDoc, docType: s.docType,
          });
        }
      });
    }
    ensureDefaultSeries(database, upgrade ? { upgrade: true } : null);
    database.settings.numbering = {
      ...database.settings.numbering,
      alphanumericOnly: true,
      preserveLegacyNumbers: true,
      defaultPadding: 5,
      defaultYearMode: database.settings.numbering.defaultYearMode || "calendar",
      engineVersion: 2,
    };
    syncCountersFromData(database);
    return database;
  }

  VG.numberingEngine = {
    sanitizeAlphaNum,
    isAlphanumericOnly,
    calendarYear,
    financialYearShort,
    formatNumber,
    previewSeries,
    previewFromRule,
    seriesRowFromRule,
    applyBulkNumbering,
    nextDocumentNo,
    nextMasterCode,
    seriesForPrefix,
    defaultSeriesRow,
    normalizeSeriesRow,
    ensureDefaultSeries,
    migrateNumbering,
    syncCountersFromData,
    tailSeqFromNo,
    PREFIX_DOC_TYPE,
    DEFAULT_SERIES_DEFS,
    MASTER_DEFS,
  };
})(window.VG);
