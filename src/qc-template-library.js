/* Veraglo ERP — master QC inspection template library (seed data, engine v3) */
(function (VG) {
  const PL = VG.QC_PARAM_LIB;

  function fld(list) {
    return (list || []).map((f, i) => ({
      id: f.id || ("f" + (i + 1)),
      label: f.label,
      type: f.type || "passfail",
      unit: f.unit || "",
      criteria: f.criteria || "",
      required: f.required !== false,
      critical: f.critical || f.severity === "critical",
      severity: f.severity || (f.critical ? "critical" : "major"),
      group: f.group || "mandatory",
      mandatory: f.mandatory !== false && f.group !== "optional",
      enabled: f.enabled !== false,
      options: f.options || null,
    }));
  }

  function tpl(base) {
    return {
      active: true,
      revision: 1,
      department: "Quality Control",
      engineVersion: 3,
      assignCategoryKeywords: base.assignCategoryKeywords || [],
      assignSkuPatterns: base.assignSkuPatterns || [],
      assignProductTypes: base.assignProductTypes || [],
      assignCustomerKeys: base.assignCustomerKeys || [],
      assignStageIds: base.assignStageIds || [],
      passLogic: base.passLogic || "severity_weighted",
      headerFields: base.headerFields || ["inspectionNo", "date", "inspector", "grnRef", "sku", "qtyReceived", "qtyInspected", "batch", "result"],
      ...base,
      fields: fld(base.fields),
    };
  }

  function richTpl(base) {
    const enriched = PL && PL.buildRichTemplate ? PL.buildRichTemplate(base) : base;
    const out = tpl(enriched);
    if (enriched.sections) {
      out.sections = enriched.sections.map((sec) => ({
        id: sec.id,
        title: sec.title,
        fields: fld(sec.fields),
      }));
      out.fields = fld(PL && PL.flattenSections ? PL.flattenSections(out.sections) : enriched.fields);
    }
    return out;
  }

  const INCOMING_MATERIALS = [
    { key: "led", name: "LED Incoming Inspection", category: "LED / Optics", keywords: ["led", "optic", "lamp"] },
    { key: "driver", name: "LED Driver / Power Supply Incoming", keywords: ["driver", "smps", "power supply"] },
    { key: "pcb", name: "PCB / Electronic Assembly Incoming", keywords: ["pcb", "electronic", "assembly"] },
    { key: "battery", name: "Battery Incoming Inspection", keywords: ["battery", "lithium", "lipo"] },
    { key: "solar", name: "Solar Panel Incoming Inspection", keywords: ["solar", "panel", "pv"] },
    { key: "aluminum", name: "Aluminum / Die Cast Housing Incoming", keywords: ["aluminum", "casting", "housing", "enclosure"] },
    { key: "glass", name: "Borosilicate Glass / Lens Incoming", keywords: ["glass", "borosilicate", "lens"] },
    { key: "hardware", name: "Hardware / Fasteners Incoming", keywords: ["hardware", "fastener", "bolt", "screw", "nut"] },
  ];

  const INCOMING = INCOMING_MATERIALS.map((m) => richTpl({
    id: "qtpl-in-" + m.key,
    templateKey: m.key,
    type: "incoming",
    name: m.name,
    category: m.category || "Raw Material",
    assignCategoryKeywords: m.keywords,
  }));

  INCOMING.push(richTpl({
    id: "qtpl-in-general",
    templateKey: "general",
    type: "incoming",
    name: "General Incoming Inspection",
    category: "General",
    assignCategoryKeywords: ["general", "misc"],
  }));

  const IN_PROCESS_STAGES = [
    { key: "pcb_assembly", id: "qtpl-ip-pcb", name: "PCB Assembly In-Process", stage: "PCB Assembly" },
    { key: "led_assembly", id: "qtpl-ip-led", name: "LED Assembly In-Process", stage: "LED Assembly" },
    { key: "control_panel", id: "qtpl-ip-control", name: "Control Panel Assembly In-Process", stage: "Control Panel Assembly" },
    { key: "mechanical_assembly", id: "qtpl-ip-mechanical", name: "Mechanical Assembly In-Process", stage: "Mechanical Assembly" },
    { key: "solar_assembly", id: "qtpl-ip-solar", name: "Solar System Assembly In-Process", stage: "Solar System Assembly" },
  ];

  const IN_PROCESS = IN_PROCESS_STAGES.map((s) => richTpl({
    id: s.id,
    templateKey: s.key,
    type: "in-process",
    name: s.name,
    operationStage: s.stage,
    assignStageIds: [s.key],
  }));

  const FINAL_PRODUCTS = [
    { key: "li_awl", name: "Low Intensity Aviation Warning Light", patterns: ["low intensity", "li-", "li "] },
    { key: "mi_awl", name: "Medium Intensity Aviation Warning Light", patterns: ["medium intensity", "mi-", "mi "] },
    { key: "hi_awl", name: "High Intensity Aviation Warning Light", patterns: ["high intensity", "hi-", "hi "] },
    { key: "solar_awl", name: "Solar Aviation Warning Light", patterns: ["solar"] },
    { key: "sphere", name: "Aviation Warning Sphere", patterns: ["sphere", "obstruction"] },
    { key: "control_panel", name: "Control Panel", patterns: ["control panel", "controller"] },
    { key: "system", name: "Complete Aviation Warning Light System", patterns: ["system", "complete"] },
  ];

  const FINAL = FINAL_PRODUCTS.map((p) => richTpl({
    id: "qtpl-final-" + p.key,
    templateKey: p.key,
    type: "final",
    name: "Final Inspection — " + p.name,
    assignProductTypes: [p.key],
    assignSkuPatterns: p.patterns,
  }));

  const FAT = richTpl({
    id: "qtpl-fat-standard",
    templateKey: "fat",
    type: "fat",
    name: "Factory Acceptance Test (FAT) Report",
  });

  const CUSTOMER_FAT_KEYS = [
    { key: "PGCIL", label: "PGCIL FAT", patterns: ["pgcil", "power grid"] },
    { key: "AAI", label: "AAI FAT", patterns: ["aai", "airports authority", "icao"] },
    { key: "NTPC", label: "NTPC FAT", patterns: ["ntpc"] },
    { key: "KEC", label: "KEC FAT", patterns: ["kec", "kalpataru"] },
    { key: "International", label: "International Export FAT", patterns: ["export", "international"] },
  ];

  const CUSTOMER_FAT = CUSTOMER_FAT_KEYS.map((c) => richTpl({
    id: "qtpl-fat-" + c.key.toLowerCase(),
    templateKey: c.key.toLowerCase(),
    type: "fat",
    name: c.label,
    assignCustomerKeys: [c.key],
    assignSkuPatterns: c.patterns,
  }));

  const MQP_STAGES = [
    "Raw material inspection", "Component inspection", "PCB assembly inspection", "LED module assembly",
    "Mechanical assembly inspection", "Control panel wiring", "Functional inspection", "Optical verification",
    "Burn-in test", "Final inspection", "Packing inspection", "Dispatch clearance",
  ];

  const MQP = tpl({
    id: "qtpl-mqp-standard",
    templateKey: "mqp",
    type: "mqp",
    name: "Manufacturing Quality Plan (MQP)",
    engineVersion: 3,
    mqpStages: MQP_STAGES.map((stage, i) => ({
      id: "mqp_s" + (i + 1),
      manufacturingStage: stage,
      inspectionPoint: stage,
      testParameter: "As per product datasheet & ICAO Annex 14",
      acceptanceCriteria: "Zero critical defect; major defects trigger hold/rework",
      frequency: i < 2 ? "100%" : i < 8 ? "100% / sampling per MQP" : "100%",
      responsibility: i < 4 ? "QC Inspector" : i < 10 ? "QC Supervisor" : "QC Manager",
      recordGenerated: "ERP QC module PDF + signed hard copy",
      holdPoint: i % 3 === 0,
      witnessPoint: i === MQP_STAGES.length - 2 || i === 5,
      reviewPoint: i === MQP_STAGES.length - 1,
      documentRef: "MQP-" + String(i + 1).padStart(2, "0"),
      reportFormat: "Incoming / In-Process / Final / FAT report",
    })),
    fields: fld([
      { id: "projectName", label: "Project name", type: "text", group: "mandatory" },
      { id: "customerName", label: "Customer name", type: "text", group: "mandatory" },
      { id: "productName", label: "Product name", type: "text", group: "mandatory" },
      { id: "applicableStandards", label: "Applicable standards", type: "text", group: "standard" },
      { id: "manufacturingStages", label: "Manufacturing stages documented", type: "yesno" },
      { id: "inspectionStages", label: "Inspection stages documented", type: "yesno" },
    ]),
  });

  const CUSTOMER_REPORT = tpl({
    id: "qtpl-customer-report",
    templateKey: "customer",
    type: "customer-report",
    name: "Customer Inspection Report",
    fields: fld([
      { id: "customerName", label: "Customer name", type: "text" },
      { id: "projectName", label: "Project name", type: "text" },
      { id: "inspectionScope", label: "Inspection scope", type: "text" },
      { id: "witnessPoints", label: "Witness points completed", type: "yesno" },
      { id: "complianceStatement", label: "Compliance statement", type: "text" },
      { id: "finalResult", label: "Final result", type: "passfail", severity: "critical" },
    ]),
  });

  VG.QC_TEMPLATE_LIBRARY = {
    MASTER: INCOMING.concat(IN_PROCESS, FINAL, [FAT], CUSTOMER_FAT, [MQP, CUSTOMER_REPORT]),
    INCOMING, IN_PROCESS, FINAL, FAT, CUSTOMER_FAT, MQP, CUSTOMER_REPORT, MQP_STAGES, FINAL_PRODUCTS,
    richTpl, tpl,
  };
})(window.VG);
