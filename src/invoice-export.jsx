/* Veraglo ERP — Tax Invoice export & multi-currency helpers. */
(function (VG) {
  const store = VG.store;
  const inr = VG.fmt.inr;
  const today = VG.fmt.todayISO;

  const INVOICE_TYPES = [
    { value: "domestic", label: "Domestic Tax Invoice" },
    { value: "export", label: "Export Invoice" },
    { value: "sez", label: "SEZ Invoice" },
    { value: "deemed_export", label: "Deemed Export Invoice" },
  ];

  const EXPORT_GST_TREATMENTS = [
    { value: "lut_without_igst", label: "Export without payment of IGST under LUT/Bond" },
    { value: "with_igst", label: "Export with payment of IGST" },
    { value: "zero_rated", label: "Zero-rated supply (export)" },
    { value: "sez_without", label: "SEZ supply without payment of tax" },
    { value: "sez_with", label: "SEZ supply with payment of tax" },
    { value: "deemed_export", label: "Deemed export supply" },
  ];

  const EXPORT_SUPPLY_TYPES = [
    { value: "lut_without_igst", label: "Without payment of IGST under LUT" },
    { value: "with_igst", label: "With payment of IGST" },
  ];

  const INCOTERMS = ["", "EXW", "FOB", "CIF", "CFR", "DAP", "DDP"];
  const SHIPMENT_MODES = ["", "Air", "Sea", "Road", "Courier"];

  const EXPORT_DECLARATIONS = {
    lut_without_igst: "Supply meant for export under LUT/Bond without payment of IGST.",
    with_igst: "Supply meant for export with payment of integrated tax (IGST).",
    zero_rated: "Supply treated as zero-rated export supply under Section 16 of the IGST Act.",
    sez_without: "Supply to SEZ unit/developer without payment of tax.",
    sez_with: "Supply to SEZ unit/developer with payment of tax.",
    deemed_export: "Supply treated as deemed export under applicable GST notifications.",
  };

  const INVOICE_TYPE_LABEL = Object.fromEntries(INVOICE_TYPES.map((x) => [x.value, x.label]));

  function isExportInvoiceType(t) {
    return t === "export" || t === "sez" || t === "deemed_export";
  }

  function computeLine(l) {
    const amt = (Number(l.qty) || 0) * (Number(l.rate) || 0);
    const disc = amt * (Number(l.discountPct) || 0) / 100;
    const taxable = amt - disc;
    const tax = taxable * (Number(l.taxPct) || 0) / 100;
    return { amt, disc, taxable, tax, total: taxable + tax };
  }

  function computeInvoiceTotals(q) {
    let sub = 0, discount = 0, taxable = 0, tax = 0;
    (q.lines || []).forEach((l) => {
      const c = computeLine(l);
      sub += c.amt;
      discount += c.disc;
      taxable += c.taxable;
      tax += c.tax;
    });
    const charges = (Number(q.freight) || 0) + (Number(q.packing) || 0) + (Number(q.insurance) || 0);
    const grand = taxable + tax + charges;
    const roundEnabled = q.roundOffEnabled !== false;
    let roundOff = q.roundOff != null ? Number(q.roundOff) : 0;
    if (roundEnabled && (q.roundOffMode === "auto" || (!q.roundOffMode && q.roundOff == null))) {
      const rounded = Math.round(grand);
      roundOff = Math.round((rounded - grand) * 100) / 100;
    }
    if (!roundEnabled) roundOff = 0;
    if (Math.abs(roundOff) < 0.001) roundOff = 0;
    return { sub, discount, taxable, tax, charges, grand, roundOff, final: grand + roundOff };
  }

  function defaultGstTreatment(invoiceType) {
    if (invoiceType === "sez") return "sez_without";
    if (invoiceType === "deemed_export") return "deemed_export";
    if (invoiceType === "export") return "lut_without_igst";
    return "";
  }

  function gstTreatmentZerosTax(treatment) {
    return ["lut_without_igst", "zero_rated", "sez_without", "deemed_export"].includes(treatment);
  }

  function applyGstTreatmentToLines(lines, gstTreatment) {
    if (!gstTreatmentZerosTax(gstTreatment)) return lines;
    return (lines || []).map((l) => ({ ...l, taxPct: 0 }));
  }

  function inferInvoiceTypeFromCustomer(c) {
    const nc = VG.normalizeCustomer ? VG.normalizeCustomer(c || {}) : (c || {});
    if (nc.type === "Export" || nc.gstRegType === "Overseas / Export" || nc.taxCategory === "Export / Overseas") return "export";
    if (nc.gstRegType === "SEZ" || nc.taxCategory === "SEZ") return "sez";
    if (nc.gstRegType === "Deemed Export") return "deemed_export";
    return "domestic";
  }

  function emptyExportFields() {
    return {
      buyerCountry: "", consigneeCountry: "", portOfLoading: "", portOfDischarge: "",
      finalDestination: "", countryOfOrigin: "India", countryOfFinalDestination: "",
      iecCode: "", lutBondDetails: "", lutNumber: "", lutValidity: "",
      exportSupplyType: "lut_without_igst", shippingBillNo: "", shippingBillDate: "",
      adCode: "", remittanceBank: "", remittanceAccount: "", swiftCode: "",
      incoterms: "", packingDetails: "", netWeight: "", grossWeight: "", packages: "",
      shipmentMode: "", exportFreight: 0, exportInsurance: 0,
    };
  }

  function normalizeInvoice(inv) {
    const x = inv ? JSON.parse(JSON.stringify(inv)) : {};
    x.invoiceType = x.invoiceType || "domestic";
    x.gstTreatment = x.gstTreatment || defaultGstTreatment(x.invoiceType);
    x.currency = x.currency || "INR";
    x.exchangeRate = x.exchangeRate != null ? Number(x.exchangeRate) : 1;
    x.exchangeRateDate = x.exchangeRateDate || x.date || today();
    x.exchangeRateSource = x.exchangeRateSource || "currency_master";
    x.customerDefaultCurrency = x.customerDefaultCurrency || "INR";
    x.roundOffMode = x.roundOffMode || "auto";
    x.roundOffEnabled = x.roundOffEnabled !== false;
    Object.assign(x, emptyExportFields(), x);
    if (!x.exportDeclaration && x.gstTreatment) x.exportDeclaration = EXPORT_DECLARATIONS[x.gstTreatment] || "";
    return x;
  }

  function buildInvoiceDraft(source) {
    const src = source || {};
    const c = VG.normalizeCustomer
      ? VG.normalizeCustomer(store.get("customers", src.customerId) || {})
      : (store.get("customers", src.customerId) || {});
    const curRow = store.list("currencies").find((x) => x.code === (src.currency || c.currency || "INR"));
    const invoiceType = src.invoiceType || inferInvoiceTypeFromCustomer(c);
    const gstTreatment = src.gstTreatment || defaultGstTreatment(invoiceType);
    let lines = (src.lines || []).map((l) => ({ ...l, key: l.key || Math.random().toString(36).slice(2) }));
    lines = applyGstTreatmentToLines(lines, gstTreatment);
    const co = store.company();
    const base = {
      date: today(),
      dueDate: (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); })(),
      type: "Tax Invoice",
      invoiceType,
      gstTreatment,
      exportDeclaration: EXPORT_DECLARATIONS[gstTreatment] || "",
      customerId: src.customerId || "",
      contact: src.contact || "",
      billing: src.billing || "",
      shipping: src.shipping || "",
      billingAddressId: src.billingAddressId || "",
      shippingAddressId: src.shippingAddressId || "",
      gstin: src.gstin || "",
      placeOfSupply: src.placeOfSupply || "",
      currency: src.currency || c.currency || "INR",
      customerDefaultCurrency: c.currency || "INR",
      exchangeRate: src.exchangeRate != null ? src.exchangeRate : (curRow ? curRow.rate : 1),
      exchangeRateDate: src.exchangeRateDate || today(),
      exchangeRateSource: src.exchangeRateSource || "currency_master",
      lines: lines.length ? lines : [{ key: Math.random().toString(36).slice(2), itemId: "", sku: "", name: "", desc: "", hsn: "", qty: 1, unit: "Nos", rate: 0, discountPct: 0, taxPct: invoiceType === "domestic" ? 18 : 0 }],
      freight: src.freight || 0,
      packing: src.packing || 0,
      insurance: src.insurance || 0,
      paymentTermsId: src.paymentTermsId || "",
      deliveryTermsId: src.deliveryTermsId || "",
      salesOrderId: src.salesOrderId || src.id && src.no && src.quotationId != null ? src.id : "",
      salesOrderNo: src.salesOrderNo || src.no || "",
      quotationId: src.quotationId || "",
      quotationNo: src.quotationNo || "",
      enquiryId: src.enquiryId || "",
      preparedBy: src.preparedBy || "",
      remarks: src.remarks || "",
      terms: src.terms || "",
      warranty: src.warranty || "Warranty: 12 months from the date of invoice.",
      templateId: src.templateId || (isExportInvoiceType(invoiceType) ? "tpl2exp" : ""),
      ...emptyExportFields(),
      iecCode: src.iecCode || co.iec || c.iec || "",
      incoterms: src.incoterms || c.incoterms || "",
      lutNumber: src.lutNumber || co.lutNumber || "",
      lutValidity: src.lutValidity || co.lutValidity || "",
      ...(store.applyDefaultBankToDoc ? store.applyDefaultBankToDoc(src) : {
        remittanceBank: src.remittanceBank || co.bank || "",
        remittanceAccount: src.remittanceAccount || co.accountNo || "",
        swiftCode: src.swiftCode || co.swiftCode || "",
        ifsc: src.ifsc || co.ifsc || "",
      }),
      exportSupplyType: src.exportSupplyType || (gstTreatment === "with_igst" ? "with_igst" : "lut_without_igst"),
      buyerCountry: src.buyerCountry || (c.addresses && c.addresses[0] && c.addresses[0].country) || "",
      consigneeCountry: src.consigneeCountry || src.buyerCountry || "",
      countryOfFinalDestination: src.countryOfFinalDestination || src.buyerCountry || "",
    };
    if (src.id && src.no && (src.type === "Tax Invoice" || src.amount != null)) {
      return normalizeInvoice({ ...src, lines });
    }
    return normalizeInvoice(base);
  }

  function computeFxTotals(inv, totals) {
    const t = totals || computeInvoiceTotals(inv);
    const cur = (inv.currency || "INR").toUpperCase();
    const fx = cur !== "INR" && inv.exchangeRate != null ? Number(inv.exchangeRate) : 1;
    const grand = Number(t.final != null ? t.final : t.grand) || 0;
    const taxable = Number(t.taxable) || 0;
    const toInr = (n) => (cur === "INR" ? n : Math.round(n * fx * 100) / 100);
    return {
      foreignCurrencyAmount: grand,
      taxableValueForeign: taxable,
      taxableValueInr: toInr(taxable),
      grandTotalForeign: grand,
      grandTotalInr: toInr(grand),
      inrEquivalent: toInr(grand),
    };
  }

  function fmtInvoiceMoney(n, currency) {
    const cur = (currency || "INR").toUpperCase();
    if (cur === "INR") return inr(n);
    return cur + " " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function invoiceTypeLabel(inv) {
    return INVOICE_TYPE_LABEL[inv.invoiceType] || "Tax Invoice";
  }

  function exportReportRows(invoices, filter) {
    const rows = (invoices || []).filter(filter || (() => true));
    return rows.map((inv) => {
      const c = store.get("customers", inv.customerId) || {};
      const fx = inv.fxTotals || computeFxTotals(inv, inv.totals);
      return {
        inv,
        customerName: c.legalName || c.name || "—",
        fx,
      };
    });
  }

  VG.INVOICE_TYPES = INVOICE_TYPES;
  VG.EXPORT_GST_TREATMENTS = EXPORT_GST_TREATMENTS;
  VG.EXPORT_SUPPLY_TYPES = EXPORT_SUPPLY_TYPES;
  VG.INVOICE_INCOTERMS = INCOTERMS;
  VG.SHIPMENT_MODES = SHIPMENT_MODES;
  VG.EXPORT_DECLARATIONS = EXPORT_DECLARATIONS;
  VG.isExportInvoiceType = isExportInvoiceType;
  VG.computeInvoiceTotals = computeInvoiceTotals;
  VG.computeInvoiceLine = computeLine;
  VG.defaultGstTreatment = defaultGstTreatment;
  VG.applyGstTreatmentToLines = applyGstTreatmentToLines;
  VG.inferInvoiceTypeFromCustomer = inferInvoiceTypeFromCustomer;
  VG.emptyExportFields = emptyExportFields;
  VG.normalizeInvoice = normalizeInvoice;
  VG.buildInvoiceDraft = buildInvoiceDraft;
  VG.computeFxTotals = computeFxTotals;
  VG.fmtInvoiceMoney = fmtInvoiceMoney;
  VG.invoiceTypeLabel = invoiceTypeLabel;
  VG.exportReportRows = exportReportRows;
  VG.gstTreatmentZerosTax = gstTreatmentZerosTax;
})(window.VG);
