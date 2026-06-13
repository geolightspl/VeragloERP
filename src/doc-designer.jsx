/* Veraglo ERP — world-class document templates (Zoho-style themes + print engine). */
(function (VG) {
  const store = VG.store;
  const inr = VG.fmt.inr;

  function resolveDocFont(tpl) {
    const t = { ...DEFAULT_LAYOUT, ...(tpl || {}) };
    return VG.resolvePdfFontFamily
      ? VG.resolvePdfFontFamily(VG.getTypography ? VG.getTypography() : null, t.fontFamily)
      : (t.fontFamily || "Inter, 'Segoe UI', Arial, sans-serif");
  }

  const DEFAULT_LAYOUT = {
    themeId: "modern",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSize: 10.5,
    fontWeight: 400,
    lineHeight: 1.35,
    letterSpacing: "0",
    textColor: "#1a1a1a",
    mutedColor: "#6b7280",
    separatorColor: "#e5e7eb",
    logoSize: 72,
    logoPlacement: "left",
    logoMarginMm: 2,
    showLogo: true,
    showLogoOnly: true,
    showCompanyTagline: false,
    showCompanyNameInHeader: false,
    pageSize: "A4",
    accentColor: "#1a1a1a",
    secondaryColor: "#374151",
    tableHeaderBg: "#f5f5f5",
    marginMm: 9,
    headerHeightMm: 0,
    footerHeightMm: 0,
    watermark: "",
    showQr: false,
    showSignatures: true,
    showStamp: true,
    showBankBlock: false,
    showAmountInWords: true,
    headerLayout: "banner",
    headerStyle: "banner",
    footerOverride: "",
    termsOverride: "",
    tableStyle: "professional",
    titleTransform: "uppercase",
    titleFontFamily: "Inter, ui-sans-serif, system-ui, 'Segoe UI', sans-serif",
    titleFontSize: 13,
    titleFontWeight: 700,
    titleLetterSpacing: "0.02em",
    docTitleOverride: "",
    warrantyDefault: "Warranty: 12 months from the date of invoice.",
    roundOffEnabled: true,
    roundOffMode: "auto",
    showDocSubtitle: false,
    lineItemStriped: true,
    showDocRibbon: true,
    showColoredTableHeader: false,
    fieldConfig: null,
    tableColumns: null,
    footerConfig: null,
    signatureConfig: null,
    variant: "",
    assignCustomerCategory: "",
    assignModule: "",
  };

  /** Curated themes — organization picks one per template (like Zoho Books). */
  VG.DOC_THEME_PRESETS = [
    {
      id: "executive",
      name: "Executive",
      tagline: "Bold header band · boardroom-ready",
      accentColor: "#0f172a",
      secondaryColor: "#1e293b",
      headerLayout: "banner",
      headerStyle: "banner",
      tableStyle: "professional",
      fontFamily: "Inter, ui-sans-serif, system-ui, 'Segoe UI', Arial, sans-serif",
      fontSize: 10.5,
      titleTransform: "uppercase",
      lineItemStriped: true,
      showDocRibbon: true,
    },
    {
      id: "modern",
      name: "Modern",
      tagline: "Clean accent · international SaaS style",
      accentColor: "#2563eb",
      secondaryColor: "#1e3a8a",
      headerLayout: "standard",
      headerStyle: "split",
      tableStyle: "professional",
      fontFamily: "Inter, ui-sans-serif, system-ui, 'Segoe UI', Arial, sans-serif",
      fontSize: 10.5,
      titleTransform: "uppercase",
      lineItemStriped: true,
      showDocRibbon: true,
    },
    {
      id: "classic",
      name: "Classic",
      tagline: "Traditional bordered · audit-friendly",
      accentColor: "#374151",
      secondaryColor: "#111827",
      headerLayout: "standard",
      headerStyle: "standard",
      tableStyle: "bordered",
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontSize: 11,
      titleTransform: "none",
      lineItemStriped: false,
      showDocRibbon: false,
    },
    {
      id: "minimal",
      name: "Minimal",
      tagline: "Whitespace-first · premium understated",
      accentColor: "#18181b",
      secondaryColor: "#52525b",
      headerLayout: "centered",
      headerStyle: "minimal",
      tableStyle: "minimal",
      fontFamily: "Inter, Arial, sans-serif",
      fontSize: 10,
      titleTransform: "none",
      lineItemStriped: false,
      showDocRibbon: false,
    },
    {
      id: "corporate",
      name: "Corporate Blue",
      tagline: "Enterprise GST / export documents",
      accentColor: "#0369a1",
      secondaryColor: "#0c4a6e",
      headerLayout: "banner",
      headerStyle: "banner",
      tableStyle: "zebra",
      fontFamily: "Inter, ui-sans-serif, system-ui, 'Segoe UI', Roboto, Arial, sans-serif",
      fontSize: 10.5,
      titleTransform: "uppercase",
      lineItemStriped: true,
      showDocRibbon: true,
      showQr: true,
    },
    {
      id: "warm",
      name: "Warm Commerce",
      tagline: "Invoices & quotations · approachable",
      accentColor: "#b45309",
      secondaryColor: "#78350f",
      headerLayout: "standard",
      headerStyle: "split",
      tableStyle: "professional",
      fontFamily: "Inter, Arial, sans-serif",
      fontSize: 10.5,
      titleTransform: "uppercase",
      lineItemStriped: true,
      showDocRibbon: true,
    },
    {
      id: "industrial",
      name: "Industrial International",
      tagline: "SAP / Siemens-grade · EPC & export quotations",
      accentColor: "#c8102e",
      secondaryColor: "#4a4a4a",
      headerLayout: "banner",
      headerStyle: "banner",
      tableStyle: "zebra",
      fontFamily: "Inter, ui-sans-serif, system-ui, 'Segoe UI', Arial, sans-serif",
      fontSize: 9.5,
      titleTransform: "uppercase",
      lineItemStriped: true,
      showDocRibbon: true,
      showQr: true,
      showAmountInWords: true,
      docVariant: "quotation-international",
      marginMm: 9,
      logoSize: 72,
      showLogoOnly: true,
      showCompanyTagline: false,
      showCompanyNameInHeader: false,
      showDocSubtitle: false,
      accentColor: "#c8102e",
      secondaryColor: "#4a4a4a",
      textColor: "#1a1a1a",
      titleFontFamily: "'Helvetica Neue', 'Arial Narrow', Arial, sans-serif",
      titleFontSize: 13,
      titleLetterSpacing: "0.02em",
      showColoredTableHeader: false,
      warrantyDefault: "Warranty: 12 months from the date of invoice.",
      roundOffEnabled: true,
      roundOffMode: "auto",
    },
  ];

  VG.DOC_CUSTOMER_FIELDS = [
    { key: "customerName", label: "Customer name", default: true },
    { key: "contact", label: "Contact person", default: true },
    { key: "location", label: "City / State / Country", default: true },
    { key: "rfqRef", label: "RFQ / enquiry reference", default: true },
    { key: "projectRef", label: "Project reference", default: true },
    { key: "subject", label: "Subject", default: true },
    { key: "offerMeta", label: "Offer no. / date / validity", default: true },
  ];

  VG.DOC_TABLE_COLUMNS = [
    { key: "no", label: "Sr. No.", width: "28px", align: "right", default: true },
    { key: "itemNameSku", label: "Item Name / SKU", width: "120px", align: "left", default: true },
    { key: "desc", label: "Item Description", width: "", align: "left", default: true },
    { key: "hsn", label: "HSN/SAC", width: "52px", align: "right", default: true },
    { key: "qty", label: "Qty", width: "44px", align: "right", default: true },
    { key: "unit", label: "Unit", width: "40px", align: "left", default: true },
    { key: "rate", label: "Rate", width: "64px", align: "right", default: true },
    { key: "disc", label: "Disc %", width: "40px", align: "right", default: false },
    { key: "tax", label: "Tax %", width: "40px", align: "right", default: true },
    { key: "amount", label: "Amount", width: "72px", align: "right", default: true },
    { key: "sku", label: "SKU", width: "76px", align: "left", default: false },
    { key: "image", label: "Image", width: "48px", align: "left", default: false },
  ];

  function defaultFieldConfig() {
    const o = {};
    (VG.DOC_CUSTOMER_FIELDS || []).forEach((f) => { o[f.key] = f.default !== false; });
    return o;
  }

  function defaultTableColumns() {
    return (VG.DOC_TABLE_COLUMNS || []).map((c) => ({ ...c, visible: c.default !== false }));
  }

  function fieldVisible(tpl, key) {
    const fc = tpl.fieldConfig || defaultFieldConfig();
    if (fc[key] === false) return false;
    return fc[key] !== false;
  }

  function colVisible(tpl, key) {
    const cols = tpl.tableColumns;
    if (!cols || !cols.length) return (VG.DOC_TABLE_COLUMNS.find((c) => c.key === key) || {}).default !== false;
    const c = cols.find((x) => x.key === key);
    return c ? c.visible !== false : false;
  }

  function colLabel(tpl, key, fallback) {
    const cols = tpl.tableColumns;
    if (cols && cols.length) {
      const c = cols.find((x) => x.key === key);
      if (c && c.label) return c.label;
    }
    return fallback;
  }

  /** Which address/GST blocks appear per document type. */
  VG.DOC_FIELD_POLICY = {
    Quotation: { billing: false, shipping: false, gst: "optional", sellerTop: false, sellerFooter: true },
    "Proforma Invoice": { billing: "optional", shipping: "optional", gst: true, sellerTop: false, sellerFooter: true },
    "Sales Order": { billing: true, shipping: true, gst: true, sellerTop: false, sellerFooter: true },
    "Tax Invoice": { billing: true, shipping: true, gst: true, sellerTop: false, sellerFooter: true },
    "Delivery Challan": { billing: false, shipping: true, gst: true, sellerTop: false, sellerFooter: true },
  };

  VG.defaultDocLayout = () => ({ ...DEFAULT_LAYOUT });

  VG.applyDocThemePreset = function (presetId) {
    const p = VG.DOC_THEME_PRESETS.find((x) => x.id === presetId);
    if (!p) return { ...DEFAULT_LAYOUT };
    return { ...DEFAULT_LAYOUT, ...p, themeId: p.id };
  };

  VG.docTypeShowsBank = function (docType) {
    return docType === "Tax Invoice" || docType === "Proforma Invoice";
  };

  function documentBankHtml(doc, docType, tpl) {
    if (!VG.docTypeShowsBank(docType)) return "";
    const t = tpl || {};
    if (t.showBankBlock === false) return "";
    const bank = store.resolveDocumentBank ? store.resolveDocumentBank(doc || {}) : null;
    if (!bank || (!bank.bankName && !bank.accountNo && !bank.bankLine)) return "";
    const line = bank.bankLine || [bank.bankName, bank.accountNo && "A/c " + bank.accountNo, bank.ifsc && "IFSC " + bank.ifsc, bank.swiftCode && "SWIFT " + bank.swiftCode].filter(Boolean).join(" · ");
    return line;
  }

  VG.resolveDocTemplate = function (docType, templateId) {
    const list = store.list("documentTemplates") || [];
    let t = templateId ? list.find((x) => x.id === templateId && x.active !== false) : null;
    if (!t && docType && store.getSelectedTemplateId) {
      const selId = store.getSelectedTemplateId(docType);
      if (selId) t = list.find((x) => x.id === selId && x.active !== false);
    }
    if (!t && docType) t = store.getDefaultTemplate(docType);
    const base = { ...DEFAULT_LAYOUT, ...(t || {}) };
    if (base.themeId) {
      const preset = VG.DOC_THEME_PRESETS.find((x) => x.id === base.themeId);
      if (preset) Object.assign(base, preset, t || {});
    }
    if (docType && VG.docTypeShowsBank(docType)) {
      if (base.showBankBlock == null || base.showBankBlock === false) base.showBankBlock = true;
    } else if (docType) {
      base.showBankBlock = false;
    }
    if (!base.fieldConfig) base.fieldConfig = defaultFieldConfig();
    if (!base.tableColumns || !base.tableColumns.length) base.tableColumns = defaultTableColumns();
    return base;
  };

  VG.mergeTemplateDraft = function (draft) {
    const d = draft || {};
    const resolved = d.id ? VG.resolveDocTemplate(d.docType, d.id) : VG.resolveDocTemplate(d.docType, null);
    const merged = { ...resolved, ...d };
    if (!merged.fieldConfig) merged.fieldConfig = defaultFieldConfig();
    if (!merged.tableColumns || !merged.tableColumns.length) merged.tableColumns = defaultTableColumns();
    return merged;
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function amountInWords(n) {
    const num = Math.round(Number(n) || 0);
    if (num === 0) return "Zero rupees only";
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    function two(x) {
      if (x < 20) return ones[x];
      return tens[Math.floor(x / 10)] + (x % 10 ? " " + ones[x % 10] : "");
    }
    function three(x) {
      if (x < 100) return two(x);
      return ones[Math.floor(x / 100)] + " Hundred" + (x % 100 ? " " + two(x % 100) : "");
    }
    let r = "";
    let v = num;
    if (v >= 10000000) { r += three(Math.floor(v / 10000000)) + " Crore "; v %= 10000000; }
    if (v >= 100000) { r += three(Math.floor(v / 100000)) + " Lakh "; v %= 100000; }
    if (v >= 1000) { r += three(Math.floor(v / 1000)) + " Thousand "; v %= 1000; }
    if (v > 0) r += three(v);
    return r.trim() + " rupees only";
  }

  function amountInWordsIntl(n, currency) {
    const cur = (currency || "INR").toUpperCase();
    if (cur === "INR") return amountInWords(n);
    const v = Number(n) || 0;
    return v.toLocaleString("en-US") + " " + cur + " only";
  }

  function fmtMoney(n, currency) {
    const cur = (currency || "INR").toUpperCase();
    const v = Number(n) || 0;
    if (cur === "INR") return inr(v);
    const sym = { USD: "$", EUR: "€", GBP: "£", AED: "AED ", JPY: "¥" }[cur] || (cur + " ");
    return sym + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function nl2br(s) { return esc(String(s || "")).replace(/\n/g, "<br>"); }
  function addrBlock(lines) {
    return lines.filter(Boolean).map((x) => esc(x)).join("<br>");
  }

  function companyRegBlock(c) {
    const reg = c.registeredAddress || {};
    const off = c.officeAddress || {};
    const fac = c.factoryAddress || {};
    const regLines = reg.line1 ? [reg.line1, reg.line2, [reg.city, reg.state, reg.pin].filter(Boolean).join(", "), reg.country] : [c.address1, c.address2, [c.city, c.state, c.pin].filter(Boolean).join(", ")];
    return {
      registered: addrBlock(regLines.filter(Boolean)),
      corporate: off.line1 ? addrBlock([off.line1, off.line2, [off.city, off.state, off.pin].filter(Boolean).join(", "), off.country]) : "",
      factory: fac.line1 ? addrBlock([fac.line1, fac.line2, [fac.city, fac.state, fac.pin].filter(Boolean).join(", "), fac.country]) : "",
      gstin: reg.gstin || c.gstin || "",
      phone: reg.phone || c.phone || "",
      email: reg.email || c.email || "",
    };
  }

  /** CSS for company footer fixed at bottom of every printed page. */
  function printFooterRepeatCSS(fs, marginMm) {
    const m = Math.max(8, Number(marginMm) || 12);
    const fsz = Math.max(7, (Number(fs) || 10.5) - 2.5);
    return `
    @page{size:A4;margin:${m}mm ${m}mm 24mm ${m}mm}
    .vg-print-footer-repeat{display:none}
    @media print{
      .vg-print-footer-repeat{
        display:block;position:fixed;left:0;right:0;bottom:0;z-index:9999;
        padding:3mm ${m}mm 2.5mm;background:#fff;border-top:1.5px solid #334155;
        font-size:${fsz}pt;line-height:1.35;color:#64748b;
        -webkit-print-color-adjust:exact;print-color-adjust:exact
      }
      .vg-pfr-inner{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap}
      .vg-pfr-left{flex:1;min-width:40%;font-weight:600;color:#334155}
      .vg-pfr-left span{font-weight:400;color:#64748b}
      .vg-pfr-center{flex:1;text-align:center;font-style:italic;max-width:38%}
      .vg-pfr-right{text-align:right;white-space:nowrap}
      .vg-pfr-page::after{content:counter(page)}
      .vg-foot-document-end{display:none!important}
      .vg-page,.vg-quotation-intl{padding-bottom:26mm!important}
      .vg-print-copy{padding-bottom:26mm!important}
    }`;
  }

  /** Compact footer HTML repeated on every printed page. */
  function buildRepeatingPrintFooter(tpl, opts) {
    const c = store.company();
    const t = { ...DEFAULT_LAYOUT, ...(tpl || {}) };
    const reg = companyRegBlock(c);
    const foot = (t.footerOverride || c.docFooter || "").trim();
    const conf = foot || "Confidential — ERP-generated document. Unauthorised distribution prohibited.";
    const docLabel = (opts && opts.docType) ? String(opts.docType) : "";
    const ref = (opts && opts.subtitle) ? String(opts.subtitle) : "";
    const bankLine = VG.docTypeShowsBank(opts && opts.docType) && t.showBankBlock !== false
      ? documentBankHtml(opts && opts.document, opts && opts.docType, t)
      : "";
    const bank = bankLine ? esc(bankLine) : "";
    return `<div class="vg-print-footer-repeat" aria-hidden="true">
      <div class="vg-pfr-inner">
        <div class="vg-pfr-left">
          <strong>${esc(c.legalName || c.name)}</strong>
          <span> · GSTIN ${esc(reg.gstin || c.gstin || "—")} · PAN ${esc(c.pan || "—")}${c.iec ? " · IEC " + esc(c.iec) : ""}</span>
          ${bank ? `<div style="font-weight:400;margin-top:2px">${bank}</div>` : ""}
        </div>
        <div class="vg-pfr-center">${esc(conf).slice(0, 160)}${conf.length > 160 ? "…" : ""}</div>
        <div class="vg-pfr-right">
          ${docLabel ? esc(docLabel) + " · " : ""}${ref ? esc(ref) + " · " : ""}Page <span class="vg-pfr-page"></span>
          · © ${new Date().getFullYear()} ${esc(c.legalName || c.name)}
        </div>
      </div>
    </div>`;
  }

  VG.buildRepeatingPrintFooter = buildRepeatingPrintFooter;
  VG.printFooterRepeatCSS = printFooterRepeatCSS;

  VG.templatePrintCSS = function (tpl) {
    const t = { ...DEFAULT_LAYOUT, ...(tpl || {}) };
    const docFont = resolveDocFont(t);
    const globalTypo = VG.getTypography ? VG.getTypography() : null;
    const pdfColors = VG.resolvePdfTextColors ? VG.resolvePdfTextColors(globalTypo, t) : { text: t.textColor || "#0f172a", muted: t.mutedColor || "#64748b" };
    const bodyText = pdfColors.text;
    const mutedText = pdfColors.muted;
    const accent = t.accentColor || "#2563eb";
    const accent2 = t.secondaryColor || accent;
    const logoH = Number(t.logoSize) || 52;
    const fs = Number(t.fontSize) || 10.5;
    const margin = Number(t.marginMm) || 12;
    const theme = t.themeId || "modern";
    const striped = t.lineItemStriped !== false;
    const tblStyle = t.tableStyle || "professional";

    let tblRules = "";
    if (tblStyle === "minimal") {
      tblRules = `
        table.vg-tbl{border:none}
        table.vg-tbl th{background:transparent;border:none;border-bottom:2px solid ${accent};color:${accent2};font-weight:700;padding:10px 6px}
        table.vg-tbl td{border:none;border-bottom:1px solid #e5e7eb;padding:9px 6px}
      `;
    } else if (tblStyle === "bordered") {
      tblRules = `
        table.vg-tbl th{background:#f8fafc;border:1px solid #cbd5e1}
        table.vg-tbl td{border:1px solid #e2e8f0}
      `;
    } else if (tblStyle === "zebra") {
      tblRules = `
        table.vg-tbl th{background:${accent};color:#fff;border:none;padding:10px 8px}
        table.vg-tbl td{border:none;border-bottom:1px solid #e2e8f0;padding:9px 8px}
        table.vg-tbl tbody tr:nth-child(even) td{background:#f8fafc}
      `;
    } else {
      tblRules = `
        table.vg-tbl th{background:linear-gradient(180deg,${accent} 0%,${accent2} 100%);color:#fff;border:none;padding:10px 8px;font-weight:600;letter-spacing:.03em}
        table.vg-tbl td{border:none;border-bottom:1px solid #e8ecf1;padding:9px 8px;vertical-align:top}
        ${striped ? "table.vg-tbl tbody tr:nth-child(even) td{background:#f9fafb}" : ""}
      `;
    }

    const headerBanner = t.headerStyle === "banner" || t.headerLayout === "banner";
    const headerMinimal = t.headerStyle === "minimal";

    return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&family=Source+Sans+3:wght@400;500;600;700&family=Roboto:wght@400;500;700&display=swap');
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:${docFont};-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
    body{margin:0;color:${bodyText};font-size:${fs}pt;line-height:1.45;background:#fff;font-family:${docFont}}
    .vg-mono,.vg-doc-no,.mono,.sku{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}
    .vg-page{padding:${margin}mm;position:relative;max-width:210mm;margin:0 auto}
    .vg-theme-${theme}{}
    .vg-watermark{position:fixed;top:42%;left:50%;transform:translate(-50%,-50%) rotate(-32deg);font-size:72px;font-weight:800;color:rgba(15,23,42,.05);pointer-events:none;z-index:0;white-space:nowrap;letter-spacing:.08em}
    .vg-head{position:relative;z-index:1;margin-bottom:20px}
    .vg-head-banner{background:linear-gradient(135deg,${accent} 0%,${accent2} 100%);color:#fff;margin:-${margin}mm -${margin}mm 18px -${margin}mm;padding:${margin + 4}mm ${margin}mm 16px;border-radius:0}
    .vg-head-banner .vg-co,.vg-head-banner .vg-tag,.vg-head-banner .vg-meta{color:#fff}
    .vg-head-banner .vg-tag{opacity:.85}
    .vg-head-banner .vg-meta{opacity:.92}
    .vg-head-inner{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
    .vg-head.centered .vg-head-inner{flex-direction:column;text-align:center;align-items:center}
    .vg-head-minimal .vg-head-inner{border-bottom:1px solid #e2e8f0;padding-bottom:12px}
    .vg-brand{display:flex;gap:14px;align-items:center}
    .vg-brand img{height:${logoH}px;max-width:200px;object-fit:contain}
    .vg-head-banner .vg-brand img{filter:brightness(0) invert(1)}
    .vg-co{font-size:${fs + 8}pt;font-weight:800;letter-spacing:-.02em;line-height:1.15}
    .vg-tag{font-size:${fs - .5}pt;margin-top:2px;opacity:.75}
    .vg-meta{font-size:${fs - .5}pt;text-align:right;line-height:1.55;min-width:200px}
    .vg-head.centered .vg-meta{text-align:center;margin-top:10px}
    .vg-doc-ribbon{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px;gap:12px;flex-wrap:wrap}
    .vg-doc-badge{background:${accent};color:#fff;padding:10px 18px;border-radius:6px;font-size:${fs + 9}pt;font-weight:800;letter-spacing:.06em;text-transform:${t.titleTransform || "uppercase"}}
    .vg-doc-meta{text-align:right;font-size:${fs - .5}pt;color:#475569;line-height:1.6}
    .vg-doc-meta b{color:#0f172a;display:inline-block;min-width:88px}
    h1.vg-title{font-size:${fs + 6}pt;margin:0 0 4px;font-weight:800;color:${accent};letter-spacing:.05em;text-transform:${t.titleTransform || "uppercase"}}
    .vg-sub{font-size:${fs - .5}pt;color:#64748b;margin-bottom:16px}
    table.vg-tbl{width:100%;border-collapse:collapse;font-size:${fs - .5}pt;margin:12px 0 16px}
    table.vg-tbl th{text-align:left;text-transform:uppercase;font-size:${fs - 1.5}pt}
    .vg-right{text-align:right}
    .vg-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}
    @media (max-width:640px){.vg-cols{grid-template-columns:1fr}}
    .vg-card{border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;background:#fafbfc}
    .vg-card b{display:block;font-size:${fs - 1.5}pt;text-transform:uppercase;letter-spacing:.06em;color:${accent};margin-bottom:6px;font-weight:700}
    .vg-card .vg-muted{color:#64748b;font-size:${fs - 1}pt}
    .vg-summary-row{display:flex;gap:16px;align-items:flex-start;margin-top:8px}
    .vg-totals{width:300px;margin-left:auto;font-size:${fs}pt;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px}
    .vg-totals div{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dashed #e2e8f0}
    .vg-totals div:last-child{border-bottom:none}
    .vg-totals .grand{border-top:2px solid ${accent};margin-top:8px;padding-top:10px;font-weight:800;font-size:${fs + 4}pt;color:${accent2}}
    .vg-totals .grand span:last-child{color:${accent}}
    .vg-amount-words{font-size:${fs - .5}pt;color:#334155;margin:12px 0;padding:10px 12px;background:#f1f5f9;border-left:4px solid ${accent};border-radius:0 6px 6px 0}
    .vg-tax-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0;font-size:${fs - 1}pt}
    .vg-tax-box{border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px}
    .vg-tax-box b{display:block;color:#64748b;font-size:${fs - 2}pt;text-transform:uppercase;margin-bottom:4px}
    .vg-terms{font-size:${fs - .5}pt;color:#374151;margin-top:18px;line-height:1.65;white-space:pre-wrap;border-top:1px solid #e2e8f0;padding-top:14px}
    .vg-terms b{color:#0f172a}
    .vg-bank{margin-top:14px;padding:12px 14px;border:1px dashed #94a3b8;border-radius:8px;font-size:${fs - .5}pt;background:#fff}
    .vg-bank b{display:block;text-transform:uppercase;font-size:${fs - 2}pt;color:${accent};margin-bottom:6px;letter-spacing:.05em}
    .vg-sign{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:36px;padding-top:12px;font-size:${fs - 1}pt}
    .vg-sign > div{border-top:1px solid #94a3b8;padding-top:8px;min-height:56px}
    .vg-sign b{display:block;margin-top:4px;color:#0f172a}
    .vg-qr{float:right;width:80px;height:80px;border:1px solid #e2e8f0;border-radius:6px;padding:6px;font-size:8px;text-align:center;background:#fff}
    .vg-foot{margin-top:24px;padding-top:10px;border-top:2px solid ${accent};font-size:${fs - 1.5}pt;color:#64748b;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;position:relative;z-index:1}
    .vg-foot strong{color:#334155}
    .vg-page-num::after{content:counter(page)}
    .vg-bar{position:sticky;top:0;z-index:99;background:#0f172a;color:#fff;padding:12px 18px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;box-shadow:0 4px 20px rgba(0,0,0,.15)}
    .vg-bar button{background:${accent};color:#fff;border:0;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer}
    .vg-bar button.ghost{background:rgba(255,255,255,.12)}
    .vg-bar .tip{opacity:.8;font-size:12px;margin-left:auto}
    ${printFooterRepeatCSS(fs, margin)}
    @media print{.vg-page{padding:0;max-width:none}.vg-bar{display:none!important}body{background:#fff}}
    ${headerBanner ? "" : ".vg-head-banner{background:none;color:inherit;padding:0;margin:0}"}
    ${headerMinimal ? ".vg-doc-badge{background:transparent;color:" + accent + ";padding:0}" : ""}
    ${tblRules}
    ${t.docVariant === "quotation-international" || t.docVariant === "export_inv" ? quotationIntlCSS(t, fs, margin) : ""}`;
  };

  function customerRegion(c) {
    const nc = c || {};
    if (Array.isArray(nc.addresses) && nc.addresses.length) {
      const a = nc.addresses.find((x) => x.defaultBilling) || nc.addresses[0];
      return [a.city, a.state, a.country].filter(Boolean).join(", ") || nc.state || "";
    }
    return nc.state || "";
  }

  function customerDocAddress(c, q) {
    const nc = c || {};
    const name = nc.legalName || nc.name || "";
    if (VG.customerAddr) {
      const bill = VG.customerAddr(nc, "billing", q && q.billingAddressId);
      const a = bill.addr;
      if (a) {
        return {
          name,
          line1: a.line1 || "",
          line2: a.line2 || a.landmark || "",
          cityLine: [a.city, a.state, a.country].filter(Boolean).join(", ") + (a.pin ? " – " + a.pin : ""),
        };
      }
      if (bill.text) {
        const lines = bill.text.split(/\n/).map((s) => s.trim()).filter(Boolean);
        if (lines.length >= 3) return { name, line1: lines[0], line2: lines[1], cityLine: lines.slice(2).join(", ") };
        if (lines.length === 2) return { name, line1: lines[0], line2: "", cityLine: lines[1] };
        return { name, line1: lines[0] || "", line2: "", cityLine: q && q.projectLocation ? q.projectLocation : "" };
      }
    }
    if (q && q.billing) {
      const lines = q.billing.split(/\n/).map((s) => s.trim()).filter(Boolean);
      if (lines.length >= 3) return { name, line1: lines[0], line2: lines[1], cityLine: lines.slice(2).join(", ") };
      return { name, line1: lines[0] || "", line2: lines[1] || "", cityLine: lines[2] || (q.projectLocation || "") };
    }
    return { name, line1: "", line2: "", cityLine: customerRegion(nc) || (q && q.projectLocation) || "" };
  }

  function customerContactPhone(c) {
    const nc = c || {};
    const primary = (nc.contacts || []).find((x) => x.role === "Primary") || (nc.contacts || [])[0];
    return (primary && (primary.phone || primary.mobile)) || nc.phone || nc.mobile || "";
  }

  function formatRevLabel(rev) {
    const r = rev != null ? Number(rev) : 0;
    return r === 0 ? "Initial Issue" : "Rev-" + String(r).padStart(2, "0");
  }

  function revisionCustomerNote(note) {
    if (!note) return "";
    return String(note)
      .replace(/\b(created|submitted|saved)\s*(as\s*)?(draft)?/gi, "")
      .replace(/\bby\s+[\w.@+-]+/gi, "")
      .replace(/\(rev\s*\d+\)/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function revisionDocList(q) {
    const history = q.history || [];
    if (!history.length) {
      const note = revisionCustomerNote(q.initialRemarks || "");
      return `<li><b>Initial Issue</b> · ${esc(q.date || "")}${note ? " — " + esc(note) : ""}</li>`;
    }
    return history.map((h) => {
      const note = revisionCustomerNote(h.note);
      return `<li><b>${formatRevLabel(h.rev)}</b> · ${esc(h.date || "")}${note ? " — " + esc(note) : ""}</li>`;
    }).join("");
  }

  function defaultWarrantyText(tpl, q, co) {
    return (q.warranty || "").trim() || (tpl.warrantyDefault || "").trim() || (co.warrantyDefault || "").trim() || "Warranty: 12 months from the date of invoice.";
  }

  function resolveQuoteTotals(totals, q, tpl) {
    const t = { ...(totals || {}) };
    const grand = Number(t.grand != null ? t.grand : (Number(t.taxable || 0) + Number(t.tax || 0) + Number(t.charges || 0)));
    const enableRound = tpl.roundOffEnabled !== false && q.roundOffEnabled !== false;
    let roundOff = q.roundOff != null ? Number(q.roundOff) : (t.roundOff != null ? Number(t.roundOff) : null);
    if (enableRound) {
      const mode = q.roundOffMode || tpl.roundOffMode || "auto";
      if ((roundOff == null || (roundOff === 0 && mode === "auto")) && mode === "auto") {
        const rounded = Math.round(grand);
        roundOff = Math.round((rounded - grand) * 100) / 100;
      }
      roundOff = Number(roundOff) || 0;
      if (Math.abs(roundOff) < 0.001) roundOff = 0;
    } else {
      roundOff = 0;
    }
    const final = grand + roundOff;
    return { ...t, grand, roundOff, final };
  }

  function quotationQrPayload(q, c, totals, currency, validUntil, rev) {
    const verifyBase = typeof location !== "undefined" ? location.origin : "";
    const finalAmt = totals.final != null ? totals.final : totals.grand;
    return [
      "OFFER:" + (q.no || "DRAFT"),
      "REV:" + rev,
      "CUST:" + (c.legalName || c.name || "").slice(0, 40),
      "DATE:" + (q.date || ""),
      "VALID:" + (validUntil || ""),
      "AMT:" + finalAmt,
      "CUR:" + currency,
      verifyBase ? "URL:" + verifyBase + "/index.html#verify/" + encodeURIComponent(q.no || "") : "",
    ].filter(Boolean).join("|");
  }

  function quotationQrHtml(data, sizePx) {
    const px = sizePx || 68;
    const url = "https://api.qrserver.com/v1/create-qr-code/?size=" + px + "x" + px + "&ecc=M&margin=0&data=" + encodeURIComponent(data);
    const short = esc(String(data).slice(0, 48));
    return `<img class="vg-q-qr-img" src="${url}" width="${px}" height="${px}" alt="Scan to verify" title="Scan to verify offer" onerror="this.outerHTML='<div class=\\'vg-q-qr-fallback\\'><span>VERIFY</span><small>${short}</small></div>'"/>`;
  }

  function invoiceQrPayload(inv, einv, co) {
    if (einv && einv.irn) return "IRN:" + einv.irn + "|ACK:" + (einv.ackNo || "") + "|DT:" + (einv.ackDate || "") + "|SGSTIN:" + (co.gstin || "") + "|BGSTIN:" + (inv.gstin || "");
    return "INV:" + (inv.no || "") + "|DT:" + (inv.date || "") + "|AMT:" + (inv.amount || "");
  }

  function buildExportInvoiceBlock(q, co, currency, fx) {
    if (!q.invoiceType || q.invoiceType === "domestic") return "";
    const fxTotals = q.fxTotals || (VG.computeFxTotals ? VG.computeFxTotals(q, q.totals || {}) : {});
    const pairs = [
      ["Invoice type", VG.invoiceTypeLabel ? VG.invoiceTypeLabel(q) : q.invoiceType],
      ["Buyer country", q.buyerCountry],
      ["Consignee country", q.consigneeCountry],
      ["Port of loading", q.portOfLoading],
      ["Port of discharge", q.portOfDischarge],
      ["Final destination", q.finalDestination],
      ["Country of origin", q.countryOfOrigin],
      ["Country of final destination", q.countryOfFinalDestination],
      ["IEC code", q.iecCode || co.iec],
      ["LUT / Bond", [q.lutNumber, q.lutBondDetails].filter(Boolean).join(" · ")],
      ["LUT validity", q.lutValidity],
      ["Export supply", q.exportSupplyType === "with_igst" ? "With payment of IGST" : "Without payment of IGST under LUT"],
      ["Shipping bill", [q.shippingBillNo, q.shippingBillDate].filter(Boolean).join(" · ")],
      ["AD code", q.adCode],
      ["Incoterms", q.incoterms],
      ["Shipment mode", q.shipmentMode],
      ["Net / Gross weight", [q.netWeight, q.grossWeight].filter((x) => x != null && x !== "").join(" / ") + (q.netWeight || q.grossWeight ? " kg" : "")],
      ["Packages", q.packages],
      ["Packing", q.packingDetails],
    ].filter(([, v]) => v);
    const bankLine = documentBankHtml(q, "Tax Invoice", { showBankBlock: true });
    return `
      <div class="vg-q-section">
        <div class="vg-q-section-hdr">Export &amp; remittance details</div>
        <div class="vg-q-kv">${pairs.map(([k, v]) => `<span class="k">${esc(k)}</span><span>${esc(String(v))}</span>`).join("")}</div>
        ${currency !== "INR" ? `<div class="vg-q-kv" style="margin-top:8px">
          <span class="k">Exchange rate</span><span>1 ${esc(currency)} = ₹${esc(fx)} (as on ${esc(q.exchangeRateDate || q.date || "—")}, ${esc(q.exchangeRateSource === "manual" ? "manual" : "currency master")})</span>
          <span class="k">INR equivalent</span><span>${fmtMoney(fxTotals.grandTotalInr || 0, "INR")}</span>
          <span class="k">Taxable (INR)</span><span>${fmtMoney(fxTotals.taxableValueInr || 0, "INR")}</span>
        </div>` : ""}
        ${bankLine ? `<div class="vg-bank" style="margin-top:10px"><b>Bank details for remittance</b><br>${esc(bankLine)}</div>` : ""}
        ${q.exportDeclaration ? `<div class="vg-amount-words" style="margin-top:10px"><strong>Export declaration:</strong> ${esc(q.exportDeclaration)}</div>` : ""}
      </div>`;
  }

  function buildInvoiceComplianceBlock(inv, einv, eway, co) {
    let html = "";
    if (einv && einv.irn) {
      html += `
      <div class="vg-q-section vg-q-compliance">
        <div class="vg-q-section-hdr">E-Invoice Details (IRP)</div>
        <div class="vg-q-compliance-grid">
          <div class="vg-q-compliance-kv">
            <div class="row"><span class="k">IRN</span><span class="v mono">${esc(einv.irn)}</span></div>
            <div class="row"><span class="k">Acknowledgement No.</span><span class="v">${esc(einv.ackNo || "—")}</span></div>
            <div class="row"><span class="k">Acknowledgement Date</span><span class="v">${esc(einv.ackDate || "—")}</span></div>
            <div class="row"><span class="k">Seller GSTIN</span><span class="v">${esc(co.gstin || "—")}</span></div>
            <div class="row"><span class="k">Buyer GSTIN</span><span class="v">${esc(inv.gstin || "—")}</span></div>
            <div class="row"><span class="k">Portal</span><span class="v">${esc(einv.portal || "NIC IRP")}</span></div>
          </div>
          <div class="vg-q-compliance-qr">${quotationQrHtml(invoiceQrPayload(inv, einv, co), 72)}<div class="vg-q-qr-caption">E-Invoice QR</div></div>
        </div>
      </div>`;
    }
    if (eway && eway.no) {
      html += `
      <div class="vg-q-section vg-q-compliance">
        <div class="vg-q-section-hdr">E-Way Bill Details</div>
        <div class="vg-q-kv">
          <span class="k">E-way Bill No.</span><span>${esc(eway.no)}</span>
          <span class="k">Valid from</span><span>${esc(eway.validFrom || inv.date || "—")}</span>
          <span class="k">Valid until</span><span>${esc(eway.validUntil || "—")}</span>
          <span class="k">Vehicle No.</span><span>${esc(eway.vehicle || "—")}</span>
          <span class="k">Driver</span><span>${esc(eway.driver || "—")}</span>
          <span class="k">Transporter</span><span>${esc(eway.transporter || "—")}</span>
          <span class="k">Distance</span><span>${eway.distance ? esc(String(eway.distance)) + " km" : "—"}</span>
          <span class="k">Status</span><span>${esc(eway.status || "Active")}</span>
        </div>
      </div>`;
    }
    return html;
  }

  function industrialSellerFooter(co, tpl, qrPayload, rev, doc, docType) {
    const reg = companyRegBlock(co);
    const t = { ...DEFAULT_LAYOUT, ...(tpl || {}) };
    const bankLine = documentBankHtml(doc, docType, t);
    const bankCol = bankLine ? `<div class="vg-q-foot-col"><b>Banking</b><br>${esc(bankLine).replace(/ · /g, "<br>")}</div>` : "";
    return `
    <div class="vg-q-foot-seller vg-foot-document-end">
      <div class="vg-q-foot-grid">
        <div class="vg-q-foot-col">
          <div class="vg-q-foot-brand">${esc(co.legalName || co.name)}</div>
          <div>${reg.registered || nl2br(co.address)}</div>
          ${reg.corporate && reg.corporate !== reg.registered ? "<div style='margin-top:4px'><b>Office:</b> " + reg.corporate + "</div>" : ""}
        </div>
        <div class="vg-q-foot-col">
          <div><b>GSTIN</b> ${esc(reg.gstin)} &nbsp; <b>PAN</b> ${esc(co.pan || "—")}</div>
          <div><b>CIN</b> ${esc(co.cin || "—")} &nbsp; <b>IEC</b> ${esc(co.iec || "—")}</div>
          <div><b>Web</b> ${esc(co.website || "—")} &nbsp; <b>Email</b> ${esc(reg.email)}</div>
          <div><b>Phone</b> ${esc(reg.phone)}</div>
        </div>
        ${bankCol}
      </div>
      <div class="vg-q-foot-bar">
        <div class="conf">Confidential — ERP-generated document. Unauthorised distribution prohibited.</div>
        ${tpl.showQr !== false ? `<div class="vg-q-qr-box">VERIFY<br><span style="font-size:6pt">${qrPayload}</span></div>` : "<div></div>"}
        <div style="text-align:right">Rev ${rev} · ${VG.fmt.formatDateTime ? VG.fmt.formatDateTime(new Date()) : new Date().toLocaleString("en-IN")}</div>
      </div>
    </div>`;
  }

  function quotationIntlCSS(tpl, fs, margin) {
    const t = { ...DEFAULT_LAYOUT, ...(tpl || {}) };
    const docFont = resolveDocFont(t);
    const accent = t.accentColor || "#1a1a1a";
    const text = t.textColor || "#1a1a1a";
    const muted = t.mutedColor || "#6b7280";
    const sep = t.separatorColor || "#e5e7eb";
    const thBg = t.showColoredTableHeader ? (t.tableHeaderBg || "#f5f5f5") : "#fafafa";
    const titleFs = Number(t.titleFontSize) || 13;
    const titleFont = t.titleFontFamily || docFont;
    const titleLs = t.titleLetterSpacing != null ? t.titleLetterSpacing : "0.04em";
    const lh = Number(t.lineHeight) || 1.35;
    const logoH = Number(t.logoSize) || 56;
    const m = Math.max(8, Number(margin) || 9);
    return `
    .vg-quotation-intl{color:${text};font-family:${docFont};line-height:${lh}}
    .vg-quotation-intl .vg-page{padding:${m}mm 9mm;max-width:none}
    .vg-q-brand-row{display:flex;justify-content:space-between;align-items:center;gap:20px;padding-bottom:8px;margin-bottom:10px;border-bottom:1px solid ${sep}}
    .vg-q-brand-left{display:flex;align-items:center;min-width:0;flex:1;margin-left:${Number(t.logoMarginMm) || 0}mm;padding:4px 8px 4px 0}
    .vg-q-logo{height:${logoH}px;width:auto;max-width:280px;object-fit:contain;object-position:left center;display:block;image-rendering:-webkit-optimize-contrast}
    .vg-q-doc-side{text-align:right;flex-shrink:0;max-width:38%}
    .vg-q-doc-title{font-family:${titleFont};font-size:${titleFs}pt;font-weight:${t.titleFontWeight || 700};color:${accent};letter-spacing:${titleLs};text-transform:${t.titleTransform || "uppercase"};line-height:1.12;white-space:nowrap}
    .vg-q-doc-sub{font-size:${fs - 1.5}pt;color:${muted};margin-top:2px;font-weight:400;letter-spacing:0}
    .vg-q-customer-compact{margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid ${sep}}
    .vg-q-customer-row{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}
    .vg-q-customer-block{flex:1;min-width:0;font-size:${fs - 1}pt;line-height:1.32}
    .vg-q-cust-label{font-size:${fs - 2}pt;color:${muted};font-weight:500;margin-bottom:2px}
    .vg-q-cust-name{font-size:${fs}pt;font-weight:700;color:${accent};margin-bottom:3px}
    .vg-q-cust-addr{color:${text};font-size:${fs - 1}pt;line-height:1.35}
    .vg-q-qr-wrap{flex-shrink:0;text-align:center;padding-top:2px}
    .vg-q-qr-img{display:block;border:1px solid ${sep};border-radius:2px;background:#fff}
    .vg-q-qr-fallback{width:68px;height:68px;border:1px solid ${sep};font-size:6pt;display:flex;flex-direction:column;align-items:center;justify-content:center;color:${muted};padding:4px;text-align:center}
    .vg-q-qr-caption{font-size:${fs - 2.5}pt;color:${muted};margin-top:3px;letter-spacing:.02em}
    .vg-q-offer-inline{display:flex;flex-wrap:wrap;gap:4px 18px;margin-top:6px;padding-top:6px;border-top:1px solid ${sep};font-size:${fs - 1.5}pt}
    .vg-q-offer-inline span{color:${muted}}
    .vg-q-offer-inline b{color:${text};font-weight:600;margin-left:3px}
    .vg-q-contact-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin-top:6px;padding-top:6px;border-top:1px dashed ${sep};font-size:${fs - 1.5}pt;color:${text}}
    .vg-q-contact-row label{color:${muted};font-size:${fs - 2}pt;display:block;margin-bottom:1px}
    .vg-q-contact-row b{font-weight:600;color:${text}}
    .vg-q-contact-row .vg-q-sep{color:${sep};font-weight:300;user-select:none}
    .vg-q-section{margin-bottom:12px;page-break-inside:avoid}
    .vg-q-section-hdr{font-size:${fs - 1.5}pt;font-weight:700;color:${text};margin:0 0 6px;padding-bottom:4px;border-bottom:1px solid ${sep};letter-spacing:.02em}
    .vg-q-kv{display:grid;grid-template-columns:minmax(100px,26%) 1fr;gap:2px 10px;font-size:${fs - 1}pt;line-height:1.35}
    .vg-q-kv .k{color:${muted}}
    .vg-q-addr-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px;padding-top:8px;border-top:1px solid ${sep};font-size:${fs - 1}pt}
    .vg-q-addr-row .lbl{font-size:${fs - 2}pt;color:${muted};margin-bottom:3px}
    .vg-q-commercial{display:grid;grid-template-columns:1fr minmax(220px,30%);gap:20px;margin:12px 0;align-items:start}
    .vg-q-total-panel{padding:10px 12px;border:1px solid ${sep}}
    .vg-q-total-panel .row{display:flex;justify-content:space-between;padding:4px 0;font-size:${fs - 1}pt;border-bottom:1px solid ${sep}}
    .vg-q-total-panel .grand{border-bottom:none;border-top:1px solid ${sep};margin-top:4px;padding-top:6px;font-size:${fs}pt;font-weight:700;color:${text}}
    .vg-q-total-panel .final{border-bottom:none;border-top:1px solid ${accent};margin-top:4px;padding-top:6px;font-size:${fs + 0.5}pt;font-weight:700;color:${accent}}
    table.vg-q-lines{width:100%;border-collapse:collapse;font-size:${fs - 1.5}pt;margin:4px 0 10px}
    table.vg-q-lines thead{display:table-header-group}
    table.vg-q-lines th{background:${thBg};color:${text};padding:6px 6px;text-align:left;font-size:${fs - 2}pt;font-weight:600;border-bottom:1px solid ${text}}
    table.vg-q-lines td{padding:5px 6px;border-bottom:1px solid ${sep};vertical-align:top;color:${text}}
    table.vg-q-lines tbody tr:nth-child(even) td{background:${t.lineItemStriped !== false ? "#fafafa" : "transparent"}}
    table.vg-q-lines .sku{font-family:${docFont};font-variant-numeric:tabular-nums;font-weight:600;font-size:${fs - 1.5}pt;color:${text}}
    table.vg-q-lines .spec{font-size:${fs - 2}pt;color:${muted};margin-top:2px;line-height:1.35}
    table.vg-q-lines tr{page-break-inside:avoid}
    .vg-q-terms-cols{columns:2;column-gap:20px;font-size:${fs - 1.5}pt;line-height:1.42;color:${text}}
    .vg-q-terms-cols h4{font-size:${fs - 1.5}pt;color:${accent};margin:8px 0 3px;font-weight:700;letter-spacing:.01em}
    .vg-q-terms-cols ol{margin:0 0 6px 18px;padding:0}
    .vg-q-terms-cols li{margin-bottom:2px}
    .vg-q-rev-list{font-size:${fs - 2}pt;color:${muted};margin:0;padding:0;list-style:none}
    .vg-q-rev-list li{padding:3px 0;border-bottom:1px solid ${sep}}
    .vg-q-sign-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:20px}
    .vg-q-sign-grid .slot{border-top:1px solid ${sep};padding-top:8px;min-height:40px;font-size:${fs - 1.5}pt}
    .vg-q-sign-grid .role{font-size:${fs - 2.5}pt;color:${muted}}
    .vg-q-foot-seller{margin-top:20px;padding-top:10px;border-top:1px solid ${text}}
    .vg-q-foot-grid{display:grid;grid-template-columns:1.4fr 1fr 0.9fr;gap:12px;font-size:${fs - 2.5}pt;color:${muted};line-height:1.35}
    .vg-q-foot-brand{font-weight:700;color:${text};font-size:${fs - 1}pt;margin-bottom:3px}
    .vg-q-foot-bar{margin-top:8px;display:flex;justify-content:space-between;align-items:flex-end;gap:10px;font-size:${fs - 2.5}pt;color:${muted}}
    .vg-q-foot-bar .conf{max-width:55%;font-style:italic}
    .vg-q-qr-box{width:56px;height:56px;border:1px solid ${sep};display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:7pt}
    .vg-q-draft{position:fixed;top:40%;left:15%;transform:rotate(-24deg);font-size:72px;font-weight:800;color:rgba(0,0,0,.04);pointer-events:none;z-index:0}
    .vg-amount-words{font-size:${fs - 1}pt;color:${text};margin:8px 0 0}
    .vg-q-compliance{margin-top:8px}
    .vg-q-compliance-grid{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:start}
    .vg-q-compliance-kv{font-size:${fs - 1.5}pt;line-height:1.4}
    .vg-q-compliance-kv .row{display:grid;grid-template-columns:minmax(110px,34%) 1fr;gap:6px;padding:2px 0;border-bottom:1px solid ${sep}}
    .vg-q-compliance-kv .k{color:${muted}}
    .vg-q-compliance-kv .v{color:${text};font-weight:500}
    .vg-q-compliance-kv .mono{font-family:${docFont};font-variant-numeric:tabular-nums;font-size:${fs - 2}pt;word-break:break-all}
    .vg-q-compliance-qr{text-align:center}
    .vg-print-copy{position:relative;page-break-after:always;padding-top:2mm}
    .vg-print-copy:last-child{page-break-after:auto}
    .vg-copy-label{position:absolute;top:0;right:0;font-size:${fs - 2.5}pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${text};border:1px solid ${sep};padding:5px 12px;background:#fafafa;z-index:5;line-height:1.2}
    @media print{table.vg-q-lines thead{display:table-header-group}.vg-q-brand-row{break-after:avoid}.vg-print-copy{page-break-after:always}.vg-copy-label{background:#fff}}
    `;
  }

  function companyHeader(tpl) {
    const c = store.company();
    const t = { ...DEFAULT_LAYOUT, ...(tpl || {}) };
    const addr = [c.address1 || c.address, c.address2, [c.city, c.state, c.pin].filter(Boolean).join(", ")].filter(Boolean).join("<br>");
    const logo = c.letterheadLogo || c.logo;
    const logoSrc = logo && logo.indexOf("data:") === 0 ? logo : (typeof location !== "undefined" ? location.origin + "/" + (logo || "").replace(/^\//, "") : logo || "");
    const banner = t.headerStyle === "banner" || t.headerLayout === "banner";
    const centered = t.headerLayout === "centered";
    const minimal = t.headerStyle === "minimal";
    const headClass = "vg-head" + (banner ? " vg-head-banner" : "") + (centered ? " centered" : "") + (minimal ? " vg-head-minimal" : "");
    const brandOrder = t.logoPlacement === "right" ? "order:2;margin-left:auto" : t.logoPlacement === "center" ? "margin:0 auto" : "";
    return `
      <div class="${headClass}">
        <div class="vg-head-inner">
          <div class="vg-brand" style="${brandOrder}">
            <img src="${esc(logoSrc)}" alt="" onerror="this.style.display='none'"/>
            <div>
              <div class="vg-co">${esc(c.tradeName || c.name)}</div>
              <div class="vg-tag">${esc(c.legalName || c.name)}${c.tagline ? " · " + esc(c.tagline) : ""}</div>
              ${c.website ? `<div class="vg-tag">${esc(c.website)}</div>` : ""}
            </div>
          </div>
          <div class="vg-meta">
            <div>${addr}</div>
            <div><strong>GSTIN</strong> ${esc(c.gstin || "—")} &nbsp;·&nbsp; <strong>PAN</strong> ${esc(c.pan || "—")}</div>
            <div>${esc(c.phone || "")}${c.salesEmail || c.email ? " · " + esc(c.salesEmail || c.email) : ""}</div>
            ${c.cin ? `<div>CIN: ${esc(c.cin)}</div>` : ""}
          </div>
        </div>
      </div>`;
  }

  function docRibbon(tpl, title, metaRows) {
    const t = { ...DEFAULT_LAYOUT, ...(tpl || {}) };
    if (t.showDocRibbon === false) {
      return `<h1 class="vg-title">${esc(title)}</h1>`;
    }
    const metaHtml = (metaRows || []).map(([k, v]) => `<div><b>${esc(k)}</b> ${esc(v)}</div>`).join("");
    return `
      <div class="vg-doc-ribbon">
        <div class="vg-doc-badge">${esc(title)}</div>
        <div class="vg-doc-meta">${metaHtml}</div>
      </div>`;
  }

  function companyFooter(tpl, signatories, doc, docType) {
    const c = store.company();
    const t = { ...DEFAULT_LAYOUT, ...(tpl || {}) };
    const terms = t.termsOverride || c.terms || c.docFooter || "";
    const foot = t.footerOverride || "";
    const sig = signatories || {};
    let sign = "";
    if (t.showSignatures !== false) {
      sign = `<div class="vg-sign">
        <div>Prepared by<br><b>${esc(sig.prepared || c.signatoryName || "—")}</b></div>
        <div>Checked by<br><b>${esc(sig.checked || "—")}</b></div>
        <div>Approved by<br><b>${esc(sig.approved || "—")}</b></div>
        <div>For ${esc(c.legalName || c.name)}${t.showStamp !== false && c.sealImage ? `<br><img src="${esc(c.sealImage)}" style="height:48px;margin-top:6px" onerror="this.remove()"/>` : ""}</div>
      </div>`;
      if (c.signatureImage) {
        sign = sign.replace("</div></div>", `<br><img src="${esc(c.signatureImage)}" style="height:40px" onerror="this.remove()"/></div></div>`);
      }
    }
    const bankLine = documentBankHtml(doc, docType, t);
    const bank = bankLine ? `
      <div class="vg-bank"><b>Bank details for remittance</b><br>${esc(bankLine).replace(/ · /g, "<br>")}
      </div>` : "";
    const qr = t.showQr ? `<div class="vg-qr">SCAN<br><span style="font-size:7px">${esc((c.gstin || "DOC").slice(0, 15))}</span></div>` : "";
    return `${sign}${bank}<div class="vg-foot vg-foot-document-end">
      <div>${foot ? esc(foot) : ""}</div>
      <div>${terms ? "<strong>Terms:</strong> " + esc(terms).slice(0, 200) + (terms.length > 200 ? "…" : "") : ""}</div>
      <div>© ${new Date().getFullYear()} ${esc(c.legalName || c.name)}${c.jurisdiction ? " · " + esc(c.jurisdiction) : ""}</div>
    </div>${qr}`;
  }

  const DOC_TYPE_LABELS = {
    Quotation: { title: "Commercial Offer", subtitle: "Quotation / Price Proposal", offerLabel: "Offer No." },
    "Proforma Invoice": { title: "Proforma Invoice", subtitle: "Advance payment reference", offerLabel: "PI No." },
    "Sales Order": { title: "Sales Order", subtitle: "Order confirmation", offerLabel: "SO No." },
    "Tax Invoice": { title: "Tax Invoice", subtitle: "Statutory tax document", offerLabel: "Invoice No." },
    "Delivery Challan": { title: "Delivery Challan", subtitle: "Dispatch / shipment note", offerLabel: "Challan No." },
  };

  /** Premium international industrial document (quotation, PI, SO, invoice, dispatch). */
  VG.buildIndustrialDocument = function (opts) {
    const docType = opts.docType || "Quotation";
    const q = opts.document || opts.quotation || {};
    const c = opts.customer || {};
    const co = store.company();
    const tpl = opts._templateOverride || VG.resolveDocTemplate(docType, opts.templateId || q.templateId);
    const t = { ...DEFAULT_LAYOUT, ...tpl };
    const policy = VG.DOC_FIELD_POLICY[docType] || VG.DOC_FIELD_POLICY.Quotation;
    const labels = DOC_TYPE_LABELS[docType] || DOC_TYPE_LABELS.Quotation;
    const totalsRaw = opts.totals || {};
    const totals = resolveQuoteTotals(totalsRaw, q, t);
    const currency = (q.currency || c.currency || "INR").toUpperCase();
    const fx = q.exchangeRate != null && currency !== "INR" ? Number(q.exchangeRate) : 1;
    const pt = opts.paymentTerms || "—";
    const dt = opts.deliveryTerms || "—";
    const validUntil = q.date && q.validity ? (() => { const d = new Date(q.date); d.setDate(d.getDate() + Number(q.validity || 0)); return d.toISOString().slice(0, 10); })() : "—";
    const lines = opts.lines || [];
    const isDraft = (q.status || "").toLowerCase() === "draft";
    const rev = q.rev != null ? String(q.rev).padStart(2, "0") : "00";
    const logo = co.letterheadLogo || co.logo;
    const logoH = Number(t.logoSize) || 56;
    const logoSrc = (t.logoDataUrl || logo) && (t.logoDataUrl || logo).indexOf("data:") === 0 ? (t.logoDataUrl || logo) : (typeof location !== "undefined" ? location.origin + "/" + ((t.logoDataUrl || logo) || "").replace(/^\//, "") : (t.logoDataUrl || logo || ""));
    const reg = companyRegBlock(co);
    const custAddr = customerDocAddress(c, q);
    const contactPhone = customerContactPhone(c);
    const warrantyText = defaultWarrantyText(t, q, co);
    const subject = q.subject || q.projectName || (q.remarks ? String(q.remarks).split("\n")[0] : "") || "";
    let docTitle = (t.docTitleOverride || labels.title || "").trim();
    const isInvoice = docType === "Tax Invoice";
    if (isInvoice && q.invoiceType && q.invoiceType !== "domestic" && VG.invoiceTypeLabel) docTitle = VG.invoiceTypeLabel(q);
    const einv = q.eInvoice || {};
    const eway = q.ewayBill || {};
    const exportBlock = isInvoice ? buildExportInvoiceBlock(q, co, currency, fx) : "";
    const invoiceCompliance = isInvoice ? buildInvoiceComplianceBlock(q, einv, eway, co) : "";
    const fxTotals = q.fxTotals || (VG.computeFxTotals ? VG.computeFxTotals(q, totals) : {});

    const showBilling = policy.billing === true || (policy.billing === "optional" && (q.billing || "").trim());
    const showShipping = policy.shipping === true || (policy.shipping === "optional" && (q.shipping || "").trim());
    const showGst = policy.gst === true || (policy.gst === "optional" && (q.gstin || c.gstin));

    function lineCell(key, row) {
      if (!colVisible(t, key)) return "";
      const align = (VG.DOC_TABLE_COLUMNS.find((x) => x.key === key) || {}).align === "right" ? "vg-right" : "";
      if (key === "no") return `<td class="vg-right">${row.no}</td>`;
      if (key === "itemNameSku") {
        const html = row.itemNameSku || (VG.itemDisplay ? VG.itemDisplay.nameSkuHtml(row.name, row.sku) : esc(row.name || row.desc || ""));
        return `<td>${html}</td>`;
      }
      if (key === "sku") return `<td><span class="sku">${esc(row.sku || "")}</span></td>`;
      if (key === "image") return row.image ? `<td><img src="${esc(row.image)}" style="max-width:48px;max-height:40px" onerror="this.remove()"/></td>` : "<td></td>";
      if (key === "desc") return `<td>${row.descHtml || nl2br(row.desc || "")}${row.spec ? `<div class="spec">${row.spec}</div>` : ""}${row.tech ? `<div class="spec">${nl2br(row.tech)}</div>` : ""}</td>`;
      if (key === "hsn") return `<td class="vg-right">${esc(row.hsn || "")}</td>`;
      if (key === "qty") return `<td class="vg-right">${esc(row.qty || "")}</td>`;
      if (key === "unit") return `<td>${esc(row.unit || "")}</td>`;
      if (key === "rate") return `<td class="vg-right">${row.rateHtml || esc(row.rate || "")}</td>`;
      if (key === "disc") return `<td class="vg-right">${row.disc != null ? esc(row.disc) : "—"}</td>`;
      if (key === "tax") return `<td class="vg-right">${row.tax != null ? esc(row.tax) : "—"}</td>`;
      if (key === "amount") return `<td class="vg-right"><b>${row.amountHtml || esc(row.amount || "")}</b></td>`;
      return `<td class="${align}"></td>`;
    }

    const visibleCols = (t.tableColumns || defaultTableColumns()).filter((c) => colVisible(t, c.key));
    const theadCols = visibleCols.map((c) => {
      const cls = c.align === "right" ? "vg-right" : "";
      const w = c.width ? ` style="width:${c.width}"` : "";
      return `<th class="${cls}"${w}>${esc(colLabel(t, c.key, c.label))}</th>`;
    }).join("");
    const lineRows = lines.map((row) => `<tr>${visibleCols.map((c) => lineCell(c.key, row)).join("")}</tr>`).join("");

    const revList = revisionDocList(q);
    const termsSections = opts.termsSections || (isInvoice
      ? buildInvoiceTerms(q, pt, dt, co, t, warrantyText)
      : buildQuotationTerms(q, pt, dt, co, t, warrantyText));
    const qrData = quotationQrPayload(q, c, totals, currency, validUntil, rev);
    const headerQrData = isInvoice ? invoiceQrPayload(q, einv, co) : qrData;
    const qrPayload = esc((q.no || docType.slice(0, 2)) + "|Rev-" + rev);
    const showCustomerQr = t.showQr !== false && !isInvoice;
    const showInvoiceQr = isInvoice;
    const incoterms = q.incoterms || c.incoterms || "";

    const addrBlock = (showBilling || showShipping) ? `
      <div class="vg-q-addr-row">
        ${showBilling ? `<div><div class="lbl">Billing address</div>${nl2br(q.billing || "")}${showGst ? "<div style='margin-top:6px'><b>GSTIN</b> " + esc(q.gstin || c.gstin || "—") + "</div>" : ""}</div>` : ""}
        ${showShipping ? `<div><div class="lbl">Shipping / dispatch address</div>${nl2br(q.shipping || q.billing || "")}</div>` : ""}
      </div>` : "";

    const inner = `
    <div class="vg-quotation-intl">
      ${isDraft ? '<div class="vg-q-draft">DRAFT</div>' : ""}
      <div class="vg-q-brand-row">
        <div class="vg-q-brand-left">
          ${t.showLogo !== false && logoSrc ? `<img class="vg-q-logo" src="${esc(logoSrc)}" alt="" onerror="this.style.display='none'"/>` : ""}
        </div>
        <div class="vg-q-doc-side">
          <div class="vg-q-doc-title">${esc(docTitle)}</div>
          ${t.showDocSubtitle ? `<div class="vg-q-doc-sub">${esc(labels.subtitle)}</div>` : ""}
        </div>
      </div>

      <div class="vg-q-customer-compact">
        <div class="vg-q-customer-row">
          <div class="vg-q-customer-block">
            ${fieldVisible(t, "customerName") ? `
            <div class="vg-q-cust-label">Customer:</div>
            <div class="vg-q-cust-name">${esc(custAddr.name)}</div>
            <div class="vg-q-cust-addr">
              ${custAddr.line1 ? esc(custAddr.line1) + "<br>" : ""}
              ${custAddr.line2 ? esc(custAddr.line2) + "<br>" : ""}
              ${custAddr.cityLine ? esc(custAddr.cityLine) : ""}
            </div>` : ""}
            ${fieldVisible(t, "subject") && subject ? `<div style="margin-top:6px;font-size:${Number(t.fontSize || 9.5) - 1}pt"><span style="color:${t.mutedColor || "#6b7280"}">Subject:</span> <b>${esc(subject)}</b></div>` : ""}
          </div>
          ${showCustomerQr ? `<div class="vg-q-qr-wrap">${quotationQrHtml(qrData, 68)}<div class="vg-q-qr-caption">Scan to verify</div></div>` : ""}
          ${showInvoiceQr ? `<div class="vg-q-qr-wrap">${quotationQrHtml(headerQrData, 68)}<div class="vg-q-qr-caption">${einv.irn ? "E-Invoice QR" : "Invoice QR"}</div></div>` : ""}
        </div>
        ${fieldVisible(t, "offerMeta") ? (isInvoice ? `
        <div class="vg-q-offer-inline">
          <span>Invoice No.<b>${esc(q.no || "DRAFT")}</b></span>
          <span>Date<b>${esc(q.date || "")}</b></span>
          <span>Due Date<b>${esc(q.dueDate || "—")}</b></span>
          <span>SO Ref.<b>${esc(q.salesOrderNo || "—")}</b></span>
          <span>Currency<b>${esc(currency)}</b></span>
          ${currency !== "INR" ? `<span>Exchange rate<b>₹${esc(fx)} / ${esc(currency)}</b></span>` : ""}
          ${incoterms ? `<span>Incoterms<b>${esc(incoterms)}</b></span>` : ""}
          <span>Buyer GSTIN<b>${esc(q.gstin || c.gstin || "—")}</b></span>
        </div>
        <div class="vg-q-contact-row">
          <span><label>Place of supply</label><b>${esc(custAddr.cityLine || customerRegion(c) || "—")}</b></span>
          <span class="vg-q-sep">|</span>
          <span><label>Payment status</label><b>${esc(q.status || "Posted")}</b></span>
        </div>` : `
        <div class="vg-q-offer-inline">
          <span>${esc(labels.offerLabel)}<b>${esc(q.no || "DRAFT")}</b></span>
          <span>Date<b>${esc(q.date || "")}</b></span>
          <span>Valid until<b>${esc(validUntil)}</b></span>
          <span>Currency<b>${esc(currency)}</b></span>
          ${docType === "Quotation" ? `<span>Revision<b>${formatRevLabel(q.rev)}</b></span>` : ""}
        </div>
        <div class="vg-q-contact-row">
          ${fieldVisible(t, "contact") ? `<span><label>Contact Person</label><b>${esc(q.contact || c.contact || "—")}</b></span><span class="vg-q-sep">|</span>` : ""}
          <span><label>Contact Number</label><b>${esc(contactPhone || "—")}</b></span>
          ${fieldVisible(t, "rfqRef") ? `<span class="vg-q-sep">|</span><span><label>RFQ / Enquiry Ref.</label><b>${esc(q.rfqRef || "—")}</b></span>` : ""}
          ${fieldVisible(t, "projectRef") ? `<span class="vg-q-sep">|</span><span><label>Project Ref.</label><b>${esc(q.projectRef || "—")}</b></span>` : ""}
        </div>`) : ""}
        ${addrBlock}
      </div>

      ${q.projectName || q.scopeSummary ? `
      <div class="vg-q-section">
        <div class="vg-q-section-hdr">Project Summary</div>
        <div class="vg-q-kv">
          <span class="k">Scope</span><span>${nl2br(q.scopeSummary || q.remarks || "Supply as per schedule below")}</span>
          <span class="k">Delivery</span><span>${esc(dt)} · ${esc(q.deliverySchedule || "As mutually agreed")}</span>
        </div>
      </div>` : ""}

      <div class="vg-q-section">
        <div class="vg-q-section-hdr">${isInvoice ? "Tax Invoice — Line Items" : "Schedule of Quantities"}</div>
        <table class="vg-q-lines">
          <thead><tr>${theadCols}</tr></thead>
          <tbody>${lineRows || `<tr><td colspan="${visibleCols.length || 1}">No line items</td></tr>`}</tbody>
        </table>
      </div>

      <div class="vg-q-section vg-q-commercial">
        <div>
          <div class="vg-q-section-hdr">Commercial summary</div>
          <div class="vg-q-kv">
            <span class="k">Payment terms</span><span>${esc(pt)}</span>
            <span class="k">Delivery terms</span><span>${esc(dt)}</span>
            <span class="k">Warranty</span><span>${esc(warrantyText)}</span>
            ${incoterms ? `<span class="k">Incoterms</span><span>${esc(incoterms)}</span>` : ""}
          </div>
          ${t.showAmountInWords !== false ? `<div class="vg-amount-words"><strong>Amount in words (${esc(currency)}):</strong> ${esc(amountInWordsIntl(totals.final != null ? totals.final : totals.grand, currency))}</div>` : ""}
          ${currency !== "INR" && t.showAmountInWords !== false ? `<div class="vg-amount-words"><strong>Amount in words (INR):</strong> ${esc(amountInWordsIntl(fxTotals.grandTotalInr || totals.final * fx || totals.grand * fx, "INR"))}</div>` : ""}
        </div>
        <div class="vg-q-total-panel">
          <div class="row"><span>Basic amount</span><span>${fmtMoney(totals.sub, currency)}</span></div>
          ${totals.discount ? `<div class="row"><span>Discount</span><span>- ${fmtMoney(totals.discount, currency)}</span></div>` : ""}
          <div class="row"><span>Taxable value (${esc(currency)})</span><span>${fmtMoney(totals.taxable, currency)}</span></div>
          <div class="row"><span>Tax (GST)</span><span>${fmtMoney(totals.tax, currency)}</span></div>
          ${totals.charges ? `<div class="row"><span>Freight / charges</span><span>${fmtMoney(totals.charges, currency)}</span></div>` : ""}
          <div class="grand"><span>Grand total (${esc(currency)})</span><span>${fmtMoney(totals.grand, currency)}</span></div>
          ${currency !== "INR" ? `<div class="row"><span>INR equivalent</span><span>${fmtMoney(fxTotals.grandTotalInr || 0, "INR")}</span></div>` : ""}
          ${totals.roundOff ? `<div class="row"><span>Round off</span><span>${totals.roundOff > 0 ? "+" : ""}${fmtMoney(totals.roundOff, currency)}</span></div><div class="final"><span>Final amount</span><span>${fmtMoney(totals.final, currency)}</span></div>` : ""}
          ${isInvoice ? `<div class="row"><span>Amount paid</span><span>${fmtMoney(q.amountPaid || 0, currency)}</span></div><div class="row"><span>Balance due</span><span>${fmtMoney(Math.max(0, (Number(q.amount) || totals.final || totals.grand || 0) - (Number(q.amountPaid) || 0)), currency)}</span></div>` : ""}
        </div>
      </div>

      ${exportBlock}
      ${invoiceCompliance}

      ${!isInvoice ? `<div class="vg-q-section">
        <div class="vg-q-section-hdr">Revision history</div>
        <ul class="vg-q-rev-list">${revList}</ul>
      </div>` : ""}

      <div class="vg-q-section">
        <div class="vg-q-section-hdr">Terms &amp; conditions</div>
        <div class="vg-q-terms-cols">${termsSections}</div>
      </div>

      ${isInvoice ? `<div class="vg-q-section"><div class="vg-q-section-hdr">Statutory declaration</div><div class="vg-q-kv" style="font-size:${Number(t.fontSize || 9.5) - 1.5}pt"><span class="k">Declaration</span><span>${esc(q.exportDeclaration || ("We declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct. Subject to " + (co.jurisdiction || "Pune, Maharashtra") + " jurisdiction."))}</span></div></div>` : ""}

      <div class="vg-q-sign-grid">
        <div class="slot"><div class="role">Prepared by</div><b>${esc(q.preparedBy || "—")}</b></div>
        <div class="slot"><div class="role">Reviewed by</div><b>${esc(q.checkedBy || "—")}</b></div>
        <div class="slot"><div class="role">Approved by</div><b>${esc(q.approvedBy || "Pending")}</b></div>
        <div class="slot"><div class="role">Authorized signatory</div><b>${esc(co.signatoryName || co.legalName || co.name)}</b>
          ${co.signatureImage ? `<br><img src="${esc(co.signatureImage)}" style="height:36px;margin-top:4px" onerror="this.remove()"/>` : ""}
          ${t.showStamp !== false && co.sealImage ? `<br><img src="${esc(co.sealImage)}" style="height:44px;margin-top:4px" onerror="this.remove()"/>` : ""}
        </div>
      </div>

      ${policy.sellerFooter !== false ? industrialSellerFooter(co, t, qrPayload, rev, q, docType) : ""}
    </div>`;

    return {
      title: docType + " " + (q.no || ""),
      subtitle: (q.no || "") + (docType === "Quotation" ? " · Rev " + rev : ""),
      inner,
      docType,
      templateId: tpl.id || opts.templateId,
      useIntlLayout: true,
    };
  };

  VG.buildQuotationDocument = function (opts) {
    return VG.buildIndustrialDocument({ ...opts, docType: "Quotation", document: opts.quotation || opts.document });
  };

  /** Standard commercial T&amp;C for tax invoices (same clauses as quotations, invoice wording). */
  function buildInvoiceTerms(q, pt, dt, co, tpl, warrantyText) {
    const raw = (q.terms || "").trim();
    const override = (tpl && tpl.termsOverride) || "";
    if (override.trim()) return `<div class="vg-q-terms-custom">${nl2br(override)}</div>`;
    const warr = warrantyText || defaultWarrantyText(tpl || {}, q, co);
    const due = q.dueDate || "—";
    const blocks = [
      ["1. Payment Due", "Payment for this invoice is due on or before " + due + " unless otherwise agreed in writing. Late payments may attract interest as per agreed credit terms."],
      ["2. Delivery", (dt || co.deliveryTermsDefault || "Ex-works / FOR destination as mutually agreed") + ". Delivery schedule is indicative and subject to drawing approval, advance receipt, and material availability."],
      ["3. Freight & Logistics", "Freight, insurance, and transit arrangements apply as stated in the commercial summary. Risk transfer follows agreed Incoterms. Export documentation charges, if any, shall be borne as agreed."],
      ["4. Packing", "Standard export-worthy / industrial packing suitable for domestic or international transit unless special packing is quoted separately."],
      ["5. Taxes & Duties", "GST / IGST / cess extra as applicable under Indian law. For export orders, LUT / bond / refund conditions apply per statutory rules and customer instructions. Import duties and local taxes at destination are buyer's responsibility unless expressly included."],
      ["6. Warranty", warr],
      ["7. Installation & Commissioning", "Supply only unless explicitly mentioned. Installation, commissioning, calibration, civil works, cabling, and third-party integration are excluded unless specifically quoted."],
      ["8. Exclusions", "Any item, accessory, consumable, or service not listed in the schedule of quantities is excluded. Statutory fees, permits, and insurance beyond quoted scope are excluded unless specified."],
      ["9. Force Majeure", "Neither party is liable for delay or non-performance caused by events beyond reasonable control including natural calamities, war, strikes, pandemic restrictions, government actions, or supply-chain disruption."],
      ["10. Material Availability", "Supply is subject to raw material, component, and capacity availability at the time of dispatch. Alternate specifications of equivalent quality may be proposed if required."],
      ["11. Payment Terms", pt || co.paymentTermsDefault || "As per agreed credit terms. Title to goods remains with seller until full payment is received unless otherwise agreed in writing."],
      ["12. Dispatch & Readiness", "Dispatch shall be effected after clearance of payments as per agreed terms and readiness of goods. Partial dispatch may be made where mutually agreed."],
      ["13. Transit & Damage", "Transit damage claims must be notified within 48 hours of receipt with photographic evidence and carrier acknowledgement. Concealed damage claims within 7 days of delivery."],
      ["14. Testing & Inspection", "Standard factory inspection applies. Third-party inspection, if required, shall be at buyer's cost and arranged with reasonable advance notice."],
      ["15. Customer Dependencies", "Delays caused by pending approvals, drawings, site readiness, or information from buyer may extend delivery without penalty to seller."],
      ["16. Storage After Readiness", "If buyer fails to take delivery within 15 days of readiness notification, seller may store goods at buyer's risk and cost or invoice storage charges."],
      ["17. Cancellation", "Orders once confirmed may be cancelled only with written consent. Cancellation charges including material procurement, engineering, and restocking costs shall apply."],
      ["18. Price Variation", "Prices are based on current input costs. Seller reserves the right to revise pricing if significant currency, duty, freight, or raw-material variation occurs before dispatch, with prior notice."],
      ["19. Limitation of Liability", "Seller's liability is limited to repair, replacement, or credit of defective supplied goods. Consequential, indirect, or loss-of-profit claims are excluded to the maximum extent permitted by law."],
      ["20. Intellectual Property", "Drawings, designs, specifications, and technical data shared remain seller's property and shall not be reproduced or disclosed without consent."],
      ["21. Confidentiality", "Commercial terms, pricing, and technical information in this document are confidential and for recipient's internal use only."],
      ["22. Jurisdiction", co.jurisdiction || "Courts at Pune, Maharashtra, India shall have exclusive jurisdiction unless otherwise agreed in writing."],
      ["23. Acknowledgement", "Receipt of this tax invoice constitutes acknowledgement of supply as described. Disputes must be raised in writing within seven (7) days of invoice date."],
    ];
    let html = "";
    if (raw) html += `<h4>Additional Conditions</h4><ol><li>${nl2br(raw)}</li></ol>`;
    html += blocks.map(([h, t]) => `<h4>${esc(h)}</h4><ol><li>${esc(t)}</li></ol>`).join("");
    return html;
  }

  function buildQuotationTerms(q, pt, dt, co, tpl, warrantyText) {
    const raw = (q.terms || "").trim();
    const override = (tpl && tpl.termsOverride) || "";
    if (override.trim()) return `<div class="vg-q-terms-custom">${nl2br(override)}</div>`;
    const warr = warrantyText || defaultWarrantyText(tpl || {}, q, co);
    const blocks = [
      ["1. Validity", "This commercial offer is valid for " + (q.validity || "15") + " calendar days from the offer date unless extended in writing by the seller. Prices and availability are subject to reconfirmation after expiry."],
      ["2. Delivery", (dt || co.deliveryTermsDefault || "Ex-works / FOR destination as mutually agreed") + ". Delivery schedule is indicative and subject to drawing approval, advance receipt, and material availability."],
      ["3. Freight & Logistics", "Freight, insurance, and transit arrangements apply as stated in the commercial summary. Risk transfer follows agreed Incoterms. Export documentation charges, if any, shall be borne as agreed."],
      ["4. Packing", "Standard export-worthy / industrial packing suitable for domestic or international transit unless special packing is quoted separately."],
      ["5. Taxes & Duties", "GST / IGST / cess extra as applicable under Indian law. For export orders, LUT / bond / refund conditions apply per statutory rules and customer instructions. Import duties and local taxes at destination are buyer's responsibility unless expressly included."],
      ["6. Warranty", warr],
      ["7. Installation & Commissioning", "Supply only unless explicitly mentioned. Installation, commissioning, calibration, civil works, cabling, and third-party integration are excluded unless specifically quoted."],
      ["8. Exclusions", "Any item, accessory, consumable, or service not listed in the schedule of quantities is excluded. Statutory fees, permits, and insurance beyond quoted scope are excluded unless specified."],
      ["9. Force Majeure", "Neither party is liable for delay or non-performance caused by events beyond reasonable control including natural calamities, war, strikes, pandemic restrictions, government actions, or supply-chain disruption."],
      ["10. Material Availability", "Offer is subject to raw material, component, and capacity availability at the time of order confirmation. Alternate specifications of equivalent quality may be proposed if required."],
      ["11. Payment Terms", pt || co.paymentTermsDefault || "As per agreed credit terms. Title to goods remains with seller until full payment is received unless otherwise agreed in writing."],
      ["12. Dispatch & Readiness", "Dispatch shall be effected after clearance of payments as per agreed terms and readiness of goods. Partial dispatch may be made where mutually agreed."],
      ["13. Transit & Damage", "Transit damage claims must be notified within 48 hours of receipt with photographic evidence and carrier acknowledgement. Concealed damage claims within 7 days of delivery."],
      ["14. Testing & Inspection", "Standard factory inspection applies. Third-party inspection, if required, shall be at buyer's cost and arranged with reasonable advance notice."],
      ["15. Customer Dependencies", "Delays caused by pending approvals, drawings, site readiness, or information from buyer may extend delivery without penalty to seller."],
      ["16. Storage After Readiness", "If buyer fails to take delivery within 15 days of readiness notification, seller may store goods at buyer's risk and cost or invoice storage charges."],
      ["17. Cancellation", "Orders once confirmed may be cancelled only with written consent. Cancellation charges including material procurement, engineering, and restocking costs shall apply."],
      ["18. Price Variation", "Prices are based on current input costs. Seller reserves the right to revise pricing if significant currency, duty, freight, or raw-material variation occurs before dispatch, with prior notice."],
      ["19. Limitation of Liability", "Seller's liability is limited to repair, replacement, or credit of defective supplied goods. Consequential, indirect, or loss-of-profit claims are excluded to the maximum extent permitted by law."],
      ["20. Intellectual Property", "Drawings, designs, specifications, and technical data shared remain seller's property and shall not be reproduced or disclosed without consent."],
      ["21. Confidentiality", "Commercial terms, pricing, and technical information in this offer are confidential and for recipient's internal evaluation only."],
      ["22. Jurisdiction", co.jurisdiction || "Courts at Pune, Maharashtra, India shall have exclusive jurisdiction unless otherwise agreed in writing."],
      ["23. Acceptance", "Written order confirmation referencing this offer number and acceptance of these terms constitutes a binding commercial agreement."],
    ];
    let html = "";
    if (raw) html += `<h4>Additional Conditions</h4><ol><li>${nl2br(raw)}</li></ol>`;
    html += blocks.map(([h, t]) => `<h4>${esc(h)}</h4><ol><li>${esc(t)}</li></ol>`).join("");
    return html;
  }

  function currencyNote(q) {
    const cur = (q.currency || "INR").toUpperCase();
    return cur === "INR" ? "in Indian Rupees (INR)" : "in " + cur;
  }

  /** Build international-standard transaction body (quotation, invoice, PO, etc.). */
  VG.buildTransactionDocument = function (opts) {
    const o = opts || {};
    const tpl = VG.resolveDocTemplate(o.docType, o.templateId);
    const parties = o.parties || {};
    const lines = o.lines || [];
    const totals = o.totals || {};
    const title = o.docTitle || o.docType || "Document";

    const partyCards = [];
    if (parties.billTo) partyCards.push(`<div class="vg-card"><b>Bill To</b>${parties.billTo}</div>`);
    if (parties.shipTo) partyCards.push(`<div class="vg-card"><b>Ship To</b>${parties.shipTo}</div>`);
    (parties.extra || []).forEach((x) => partyCards.push(`<div class="vg-card"><b>${esc(x.label)}</b>${x.html || esc(x.value)}</div>`));

    const thead = (o.columns || [
      { key: "no", label: "#", align: "" },
      { key: "desc", label: "Description / SKU", align: "" },
      { key: "hsn", label: "HSN/SAC", align: "" },
      { key: "qty", label: "Qty", align: "right" },
      { key: "rate", label: "Rate", align: "right" },
      { key: "amount", label: "Amount", align: "right" },
    ]).map((c) => `<th class="${c.align === "right" ? "vg-right" : ""}">${esc(c.label)}</th>`).join("");

    const tbody = lines.map((row, i) => {
      const cells = (o.columns || [
        { key: "no" }, { key: "desc" }, { key: "hsn" }, { key: "qty", align: "right" }, { key: "rate", align: "right" }, { key: "amount", align: "right" },
      ]).map((c) => {
        const v = row[c.key] != null ? row[c.key] : (c.key === "no" ? i + 1 : "");
        const cls = c.align === "right" ? "vg-right" : "";
        return `<td class="${cls}">${typeof v === "string" && v.indexOf("<") >= 0 ? v : esc(v)}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    }).join("");

    const totalRows = [];
    if (totals.sub != null) totalRows.push(["Sub total", totals.sub]);
    if (totals.discount) totalRows.push(["Discount", -Math.abs(totals.discount)]);
    if (totals.taxable != null) totalRows.push(["Taxable value", totals.taxable]);
    if (totals.tax != null) totalRows.push(["Tax (GST)", totals.tax]);
    if (totals.charges) totalRows.push(["Other charges", totals.charges]);
    const totalsHtml = totalRows.map(([k, v]) =>
      `<div><span>${esc(k)}</span><span>${typeof v === "number" ? inr(v) : esc(v)}</span></div>`
    ).join("") + (totals.grand != null ? `<div class="grand"><span>Total payable</span><span>${inr(totals.grand)}</span></div>` : "");

    let taxGrid = "";
    if (o.taxBreakdown && o.taxBreakdown.length) {
      taxGrid = `<div class="vg-tax-grid">${o.taxBreakdown.map((x) =>
        `<div class="vg-tax-box"><b>${esc(x.label)}</b>${typeof x.amount === "number" ? inr(x.amount) : esc(x.amount)}</div>`
      ).join("")}</div>`;
    }

    const amountWords = tpl.showAmountInWords !== false && totals.grand != null
      ? `<div class="vg-amount-words"><strong>Amount in words:</strong> ${esc(amountInWords(totals.grand))}</div>` : "";

    const ribbon = docRibbon(tpl, title, o.meta || []);
    const inner = `
      ${ribbon}
      ${o.subtitle ? `<div class="vg-sub">${esc(o.subtitle)}</div>` : ""}
      <div class="vg-cols">${partyCards.join("")}</div>
      <table class="vg-tbl"><thead><tr>${thead}</tr></thead><tbody>${tbody || "<tr><td colspan='6' class='vg-muted'>No line items</td></tr>"}</tbody></table>
      <div class="vg-summary-row">
        ${taxGrid}
        <div class="vg-totals">${totalsHtml}</div>
      </div>
      ${amountWords}
      ${o.termsBlock ? `<div class="vg-terms">${o.termsBlock}</div>` : ""}
      ${companyFooter(tpl, o.signatories, o.document || o, o.docType)}`;

    return {
      title,
      subtitle: o.subtitle || "",
      inner,
      docType: o.docType,
      templateId: o.templateId || tpl.id,
    };
  };

  VG.printStyledDocument = function ({ title, subtitle, inner, docType, templateId, signatories, useIntlLayout, copies }, mode) {
    let tpl = VG.resolveDocTemplate(docType, templateId);
    const theme = tpl.themeId || "modern";
    const wm = tpl.watermark ? `<div class="vg-watermark">${esc(tpl.watermark)}</div>` : "";
    let content = inner || "";
    const intl = useIntlLayout || content.indexOf("vg-quotation-intl") >= 0;
    if (intl) tpl = { ...tpl, docVariant: "quotation-international" };
    if (!intl) {
      if (tpl.showDocRibbon !== false && content.indexOf("vg-doc-ribbon") < 0 && content.indexOf("vg-doc-badge") < 0) {
        content = docRibbon(tpl, title, [["Reference", subtitle || "—"]]) + (subtitle ? `<div class="vg-sub">${esc(subtitle)}</div>` : "") + content;
      } else if (subtitle && content.indexOf("vg-sub") < 0) {
        content = `<div class="vg-sub">${esc(subtitle)}</div>` + content;
      }
      if (content.indexOf("vg-foot") < 0 && content.indexOf("vg-q-foot-bar") < 0) content += companyFooter(tpl, signatories, null, docType);
    }
    const pageBody = intl ? `${wm}${content}` : `${wm}${companyHeader(tpl)}${content}`;
    const copyList = Array.isArray(copies) && copies.length ? copies : null;
    const body = copyList
      ? copyList.map((label) => `<div class="vg-print-copy">${label ? `<div class="vg-copy-label">${esc(label)}</div>` : ""}${pageBody}</div>`).join("")
      : pageBody;
    const bodyClass = intl ? "vg-quotation-intl" : "vg-theme-" + theme;
    const w = window.open("", "_blank", "width=960,height=1100");
    if (!w) { VG.toast("Pop-up blocked — allow pop-ups to print", "warn"); return; }
    const css = VG.templatePrintCSS(tpl);
    const auto = mode === "print";
    const copyTip = copyList ? '<span class="tip">' + copyList.length + " cop" + (copyList.length > 1 ? "ies" : "y") + " · " + esc(copyList.join(", ")) + "</span>" : "";
    const tip = mode === "download" ? '<span class="tip">Choose “Save as PDF” in the print dialog.</span>' + copyTip : '<span class="tip">Professional template · ' + esc(tpl.name || tpl.themeId || "default") + "</span>" + copyTip;
    const repeatFooter = buildRepeatingPrintFooter(tpl, { docType: docType || title, subtitle: subtitle || "" });
    const bar = `<div class="vg-bar"><button onclick="window.print()">Print / Save PDF</button><button class="ghost" onclick="window.close()">Close</button>${tip}</div>`;
    w.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${esc(title)}</title><style>${css}</style></head><body class="${bodyClass}">${bar}<div class="vg-page ${bodyClass}">${body}</div>${repeatFooter}<script>window.onload=function(){${auto ? "setTimeout(function(){window.print()},400)" : ""}}<\/script></body></html>`);
    w.document.close();
  };

  VG.getSampleQuotationData = function () {
    return {
      quotation: {
        no: "GLS/QTN/2526-0001", rev: 0, date: new Date().toISOString().slice(0, 10), validity: 30, status: "Approved",
        currency: "INR", contact: "Procurement Head", rfqRef: "RFQ-8842", projectRef: "PRJ-AURORA-26",
        subject: "Aviation obstruction lighting — supply scope",
        warranty: "Warranty: 12 months from the date of invoice.", preparedBy: "Sales", paymentTermsId: "", deliveryTermsId: "",
        terms: "", remarks: "Supply as per BOQ", projectName: "Project Aurora", projectLocation: "Maharashtra, India",
        roundOffMode: "auto", roundOffEnabled: true,
      },
      customer: {
        name: "Acme Industries Pvt. Ltd.", legalName: "Acme Industries Private Limited", gstin: "27AAAAA0000A1Z5", phone: "+91 22 4000 1234",
        contacts: [{ role: "Primary", name: "Procurement Head", phone: "+91 98 7654 3210" }],
        addresses: [{ defaultBilling: true, line1: "Plot 14, MIDC Industrial Area", line2: "Andheri East", city: "Mumbai", state: "Maharashtra", country: "India", pin: "400069" }],
      },
      totals: { sub: 105932, discount: 0, taxable: 105932, tax: 19068, charges: 0, grand: 124999.72, roundOff: 0.28, final: 125000 },
      paymentTerms: "30 Days Credit", deliveryTerms: "FOR Destination",
      lines: [
        { no: 1, sku: "GLSRWM000145", desc: "OSRAM LED Aviation Red 3W Module", spec: "ICAO compliant · IP65", hsn: "8539", qty: "100", unit: "Nos", rate: inr(1250), disc: "0%", tax: "18%", amount: inr(125000) },
        { no: 2, sku: "GLSRWM000088", desc: "Constant current driver 36W", hsn: "8504", qty: "100", unit: "Nos", rate: inr(620), disc: "2%", tax: "18%", amount: inr(62776) },
      ],
    };
  };

  VG.renderTemplatePreview = function (tplDraft, docType, mode) {
    const tpl = VG.mergeTemplateDraft ? VG.mergeTemplateDraft(tplDraft) : tplDraft;
    const dt = docType || tpl.docType || "Quotation";
    let doc;
    if (dt === "Quotation" && VG.buildIndustrialDocument) {
      const sample = VG.getSampleQuotationData();
      doc = VG.buildIndustrialDocument({
        docType: "Quotation",
        document: sample.quotation,
        customer: sample.customer,
        totals: sample.totals,
        paymentTerms: sample.paymentTerms,
        deliveryTerms: sample.deliveryTerms,
        lines: sample.lines,
        _templateOverride: tpl,
      });
    } else if (VG.sampleDocInner) {
      doc = { inner: VG.sampleDocInner(dt), docType: dt, title: dt, subtitle: tpl.name || "Preview", useIntlLayout: tpl.docVariant === "quotation-international" };
    } else {
      doc = { inner: "<p>Preview unavailable</p>", title: dt };
    }
    if (VG.printStyledDocument) {
      VG.printStyledDocument({
        title: doc.title || dt,
        subtitle: (tpl.name || "Template") + " · Preview",
        inner: doc.inner,
        docType: dt,
        templateId: tpl.id,
        useIntlLayout: doc.useIntlLayout,
      }, mode || "preview");
    }
    return doc.inner;
  };

  VG.auditTemplateChange = function (action, tpl, actor, detail) {
    if (!store.audit) return;
    store.audit(actor || "admin", action, "documentTemplates", (tpl && tpl.name) || (tpl && tpl.id) || "-", detail || "Document template " + action, { module: "templates", newValue: tpl ? tpl.name + " · " + tpl.docType : "" });
  };

  VG.sampleDocInner = function (docType, templateOverride) {
    if (docType === "Quotation" && VG.buildIndustrialDocument) {
      const sample = VG.getSampleQuotationData();
      const doc = VG.buildIndustrialDocument({
        docType: "Quotation",
        document: sample.quotation,
        customer: sample.customer,
        totals: sample.totals,
        paymentTerms: sample.paymentTerms,
        deliveryTerms: sample.deliveryTerms,
        lines: sample.lines,
        _templateOverride: templateOverride || null,
      });
      return doc.inner;
    }
    if (VG.buildTransactionDocument) {
      const doc = VG.buildTransactionDocument({
        docType,
        docTitle: docType,
        subtitle: "Template preview · " + store.company().name,
        meta: [["Document No.", "PREVIEW-2026-001"], ["Date", (VG.fmt.formatDate ? VG.fmt.formatDate(new Date()) : new Date().toLocaleDateString("en-IN"))], ["Currency", "INR"]],
        parties: {
          billTo: "Acme Industries Pvt. Ltd.<br>Andheri East, Mumbai 400069<br><span class='vg-muted'>GSTIN 27AAAAA0000A1Z5</span>",
          shipTo: "Acme Industries — Plant II<br>Pune, Maharashtra",
          extra: [{ label: "Reference", value: "RFQ-8842 / Project Aurora" }],
        },
        lines: [
          { no: 1, desc: "LED Driver Module 36W<br><span class='vg-muted'>SKU GLSRWM000142</span>", hsn: "8504", qty: "100 nos", rate: inr(1250), amount: inr(125000) },
          { no: 2, desc: "Aluminium heat sink assembly", hsn: "7616", qty: "100 nos", rate: inr(320), amount: inr(32000) },
        ],
        columns: [
          { key: "no", label: "#" }, { key: "desc", label: "Description" }, { key: "hsn", label: "HSN/SAC" },
          { key: "qty", label: "Qty", align: "right" }, { key: "rate", label: "Unit price", align: "right" }, { key: "amount", label: "Amount", align: "right" },
        ],
        totals: { sub: 157000, discount: 0, taxable: 157000, tax: 28260, charges: 0, grand: 185260 },
        taxBreakdown: [{ label: "CGST @ 9%", amount: 14130 }, { label: "SGST @ 9%", amount: 14130 }],
        termsBlock: "<b>Payment:</b> 30% advance, balance before dispatch.<br><b>Delivery:</b> Ex-works, 3–4 weeks ARO.<br><b>Note:</b> This preview reflects your selected template theme and company profile.",
        signatories: { prepared: "Sales", checked: "Finance", approved: "Director" },
      });
      return doc.inner;
    }
    return `<p>Preview unavailable</p>`;
  };
})(window.VG);
