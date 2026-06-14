/* Veraglo ERP — Aviation Warning Lights QC inspection templates & checklists */
(function (VG) {
  const CHECK_TYPES = { passfail: "Pass/Fail", measure: "Measurement", text: "Text", yesno: "Yes/No" };

  function fields(list) {
    return list.map((f, i) => ({
      id: f.id || ("f" + (i + 1)),
      label: f.label,
      type: f.type || "passfail",
      unit: f.unit || "",
      criteria: f.criteria || "",
      required: f.required !== false,
    }));
  }

  const INCOMING_MATERIAL_TEMPLATES = {
    led: {
      id: "led", name: "LED Inspection", category: "LED / Optics",
      fields: fields([
        { id: "manufacturer", label: "Manufacturer", type: "text" },
        { id: "partNumber", label: "Part Number", type: "text" },
        { id: "colorVerification", label: "Color verification", criteria: "Match PO / datasheet" },
        { id: "brightness", label: "Brightness check", criteria: "Within spec" },
        { id: "forwardVoltage", label: "Forward voltage (V)", type: "measure", unit: "V" },
        { id: "currentConsumption", label: "Current consumption (mA)", type: "measure", unit: "mA" },
        { id: "visualCondition", label: "Visual condition", criteria: "No damage / discoloration" },
        { id: "datasheetCompliance", label: "Datasheet compliance" },
        { id: "qtyVerification", label: "Quantity verification" },
      ]),
    },
    driver: {
      id: "driver", name: "Driver Inspection", category: "Electronics",
      fields: fields([
        { id: "inputVoltage", label: "Input voltage (V)", type: "measure", unit: "V" },
        { id: "outputVoltage", label: "Output voltage (V)", type: "measure", unit: "V" },
        { id: "outputCurrent", label: "Output current (A)", type: "measure", unit: "A" },
        { id: "efficiency", label: "Efficiency (%", type: "measure", unit: "%" },
        { id: "protectionFunctions", label: "Protection functions (OVP/OCP/OTP)" },
        { id: "visualInspection", label: "Visual inspection" },
      ]),
    },
    battery: {
      id: "battery", name: "Battery Inspection", category: "Power",
      fields: fields([
        { id: "voltage", label: "Voltage (V)", type: "measure", unit: "V" },
        { id: "capacity", label: "Capacity (Ah)", type: "measure", unit: "Ah" },
        { id: "mfgDate", label: "Manufacturing date", type: "text" },
        { id: "physicalCondition", label: "Physical condition" },
        { id: "leakageCheck", label: "Leakage check" },
      ]),
    },
    solar: {
      id: "solar", name: "Solar Panel Inspection", category: "Solar",
      fields: fields([
        { id: "ratedWattage", label: "Rated wattage (W)", type: "measure", unit: "W" },
        { id: "openCircuitVoltage", label: "Open circuit voltage (Voc)", type: "measure", unit: "V" },
        { id: "shortCircuitCurrent", label: "Short circuit current (Isc)", type: "measure", unit: "A" },
        { id: "frameCondition", label: "Frame condition" },
        { id: "junctionBox", label: "Junction box condition" },
      ]),
    },
    glass: {
      id: "glass", name: "Borosilicate Glass Inspection", category: "Optics",
      fields: fields([
        { id: "diameter", label: "Diameter (mm)", type: "measure", unit: "mm" },
        { id: "thickness", label: "Thickness (mm)", type: "measure", unit: "mm" },
        { id: "bubbleCheck", label: "Bubble check" },
        { id: "crackCheck", label: "Crack check" },
        { id: "transparency", label: "Transparency" },
      ]),
    },
    aluminum: {
      id: "aluminum", name: "Aluminum Casting Inspection", category: "Mechanical",
      fields: fields([
        { id: "dimensions", label: "Dimensions", type: "measure", unit: "mm" },
        { id: "weight", label: "Weight (kg)", type: "measure", unit: "kg" },
        { id: "surfaceFinish", label: "Surface finish" },
        { id: "porosity", label: "Porosity check" },
        { id: "threadInspection", label: "Thread inspection" },
      ]),
    },
    hardware: {
      id: "hardware", name: "Hardware Inspection", category: "Hardware",
      fields: fields([
        { id: "size", label: "Size / dimension", type: "text" },
        { id: "coating", label: "Coating / plating" },
        { id: "materialGrade", label: "Material grade", type: "text" },
        { id: "quantity", label: "Quantity verification" },
      ]),
    },
    general: {
      id: "general", name: "General Incoming Inspection", category: "General",
      fields: fields([
        { id: "visual", label: "Visual condition" },
        { id: "dimensions", label: "Dimensions / packaging" },
        { id: "qtyVerification", label: "Quantity verification" },
        { id: "documentation", label: "CoC / test report available" },
      ]),
    },
  };

  const IN_PROCESS_STAGES = {
    pcb_assembly: {
      id: "pcb_assembly", name: "PCB Assembly Inspection", operationStage: "PCB Assembly",
      fields: fields([
        { id: "solderQuality", label: "Solder quality" },
        { id: "componentPlacement", label: "Component placement" },
        { id: "componentValue", label: "Component value verification" },
        { id: "pcbCleanliness", label: "PCB cleanliness" },
        { id: "functionalTest", label: "Functional test" },
      ]),
    },
    driver_assembly: {
      id: "driver_assembly", name: "Driver Assembly Inspection", operationStage: "Driver Assembly",
      fields: fields([
        { id: "wiringCheck", label: "Wiring check" },
        { id: "polarity", label: "Polarity verification" },
        { id: "functionalTest", label: "Functional test" },
        { id: "voltageVerification", label: "Voltage verification", type: "measure", unit: "V" },
      ]),
    },
    led_assembly: {
      id: "led_assembly", name: "LED Assembly Inspection", operationStage: "LED Assembly",
      fields: fields([
        { id: "ledPlacement", label: "LED placement" },
        { id: "colorVerification", label: "Color verification" },
        { id: "lightOutput", label: "Light output check" },
        { id: "uniformity", label: "Uniformity" },
      ]),
    },
    mechanical_assembly: {
      id: "mechanical_assembly", name: "Mechanical Assembly Inspection", operationStage: "Mechanical Assembly",
      fields: fields([
        { id: "fasteners", label: "Fasteners" },
        { id: "torqueCheck", label: "Torque check", type: "measure", unit: "Nm" },
        { id: "sealPlacement", label: "Seal placement" },
        { id: "gasketFitment", label: "Gasket fitment" },
      ]),
    },
    enclosure: {
      id: "enclosure", name: "Enclosure Inspection", operationStage: "Enclosure",
      fields: fields([
        { id: "powderCoating", label: "Powder coating" },
        { id: "surfaceFinish", label: "Surface finish" },
        { id: "labelPlacement", label: "Label placement" },
        { id: "dimensions", label: "Dimensions", type: "measure", unit: "mm" },
      ]),
    },
    control_panel: {
      id: "control_panel", name: "Control Panel Assembly Inspection", operationStage: "Control Panel Assembly",
      fields: fields([
        { id: "wiring", label: "Wiring" },
        { id: "relayOperation", label: "Relay operation" },
        { id: "mcbVerification", label: "MCB verification" },
        { id: "alarmFunctionality", label: "Alarm functionality" },
        { id: "gpsSync", label: "GPS synchronization" },
      ]),
    },
  };

  const FINAL_INSPECTION_SECTIONS = [
    {
      id: "general", title: "General Checks",
      fields: fields([
        { id: "productId", label: "Product identification" },
        { id: "serialNumber", label: "Serial number", type: "text" },
        { id: "labelVerification", label: "Label verification" },
        { id: "drawingRevision", label: "Drawing revision verification", type: "text" },
        { id: "visualCondition", label: "Visual condition" },
      ]),
    },
    {
      id: "electrical", title: "Electrical Checks",
      fields: fields([
        { id: "inputVoltage", label: "Input voltage (V)", type: "measure", unit: "V" },
        { id: "inputCurrent", label: "Input current (A)", type: "measure", unit: "A" },
        { id: "powerConsumption", label: "Power consumption (W)", type: "measure", unit: "W" },
        { id: "surgeProtection", label: "Surge protection verification" },
        { id: "grounding", label: "Grounding verification" },
      ]),
    },
    {
      id: "optical", title: "Optical Checks",
      fields: fields([
        { id: "lightColor", label: "Light color verification" },
        { id: "flashRate", label: "Flash rate (fpm)", type: "measure", unit: "fpm" },
        { id: "intensity", label: "Intensity verification (cd)", type: "measure", unit: "cd" },
        { id: "beamPattern", label: "Beam pattern" },
        { id: "dayNightMode", label: "Day/Night mode operation" },
      ]),
    },
    {
      id: "functional", title: "Functional Checks",
      fields: fields([
        { id: "gpsSync", label: "GPS synchronization" },
        { id: "photocell", label: "Photocell operation" },
        { id: "alarmOutput", label: "Alarm output" },
        { id: "dryContact", label: "Dry contact operation" },
        { id: "remoteMonitoring", label: "Remote monitoring" },
        { id: "controlPanelComm", label: "Control panel communication" },
      ]),
    },
    {
      id: "mechanical", title: "Mechanical Checks",
      fields: fields([
        { id: "housing", label: "Housing condition" },
        { id: "fasteners", label: "Fastener verification" },
        { id: "gasket", label: "Gasket condition" },
        { id: "glass", label: "Glass condition" },
        { id: "paintFinish", label: "Paint finish" },
      ]),
    },
    {
      id: "environmental", title: "Environmental Checks",
      fields: fields([
        { id: "ipSealing", label: "IP sealing verification" },
        { id: "drainage", label: "Drainage check" },
        { id: "cableGland", label: "Cable gland verification" },
      ]),
    },
    {
      id: "documentation", title: "Documentation Checks",
      fields: fields([
        { id: "testCertificate", label: "Test certificate" },
        { id: "userManual", label: "User manual" },
        { id: "warrantyCard", label: "Warranty card" },
        { id: "packingList", label: "Packing list" },
      ]),
    },
  ];

  const CUSTOMER_INSPECTION_PLANS = [
    {
      id: "pgcil", customerKey: "PGCIL", name: "PGCIL", region: "India",
      extraCheckpoints: fields([
        { id: "typeTestRef", label: "Type test reference compliance", type: "text" },
        { id: "fatWitness", label: "FAT witness points documented" },
        { id: "earthingTest", label: "Earthing test report attached" },
      ]),
      extraReports: ["FAT Report", "Type Test Summary"],
    },
    {
      id: "aai", customerKey: "AAI", name: "Airports Authority of India (AAI)", region: "India",
      extraCheckpoints: fields([
        { id: "icaoCompliance", label: "ICAO Annex 14 compliance" },
        { id: "photometricReport", label: "Photometric test report" },
        { id: "frangibility", label: "Frangibility (if applicable)" },
      ]),
      extraReports: ["Customer Inspection Report", "Photometric Report"],
    },
    {
      id: "ntpc", customerKey: "NTPC", name: "NTPC", region: "India",
      extraCheckpoints: fields([
        { id: "materialTestCert", label: "Material test certificates" },
        { id: "warrantyTerms", label: "Warranty terms verified" },
      ]),
      extraReports: ["Incoming Inspection Report", "Final Inspection Report"],
    },
    {
      id: "kec", customerKey: "KEC", name: "KEC International", region: "India",
      extraCheckpoints: fields([
        { id: "projectSpec", label: "Project specification compliance", type: "text" },
        { id: "packagingStandard", label: "Export packaging standard" },
      ]),
      extraReports: ["FAT Report", "Packing Inspection Report"],
    },
    {
      id: "tata", customerKey: "Tata Projects", name: "Tata Projects", region: "India",
      extraCheckpoints: fields([
        { id: "drawingApproval", label: "Drawing approval reference", type: "text" },
        { id: "siteInstallation", label: "Site installation manual included" },
      ]),
      extraReports: ["Final Inspection Report", "Installation Checklist"],
    },
    {
      id: "intl", customerKey: "International", name: "International Customers", region: "Export",
      extraCheckpoints: fields([
        { id: "exportDocs", label: "Export documentation complete" },
        { id: "voltageRating", label: "Voltage rating per destination", type: "text" },
        { id: "languageManual", label: "Manual language requirement met" },
      ]),
      extraReports: ["FAT Report", "Export QC Certificate"],
    },
  ];

  const DEFAULT_TEST_EQUIPMENT = [
    { name: "Lux Meter", make: "Testo", model: "540", serialNo: "LM-001", calibrationIntervalDays: 365, location: "QC Lab" },
    { name: "Digital Multimeter", make: "Fluke", model: "117", serialNo: "DMM-001", calibrationIntervalDays: 365, location: "QC Lab" },
    { name: "Oscilloscope", make: "Rigol", model: "DS1054Z", serialNo: "OSC-001", calibrationIntervalDays: 730, location: "Electronics QC" },
    { name: "Power Analyzer", make: "Hioki", model: "PW3337", serialNo: "PA-001", calibrationIntervalDays: 365, location: "QC Lab" },
    { name: "Vernier Caliper", make: "Mitutoyo", model: "500-196", serialNo: "VC-001", calibrationIntervalDays: 180, location: "Mechanical QC" },
    { name: "Micrometer", make: "Mitutoyo", model: "103-137", serialNo: "MIC-001", calibrationIntervalDays: 180, location: "Mechanical QC" },
  ];

  function blankChecklist(template) {
    const out = {};
    (template.fields || []).forEach((f) => {
      out[f.id] = { value: f.type === "measure" ? "" : f.type === "text" ? "" : "Pass", remark: "" };
    });
    return out;
  }

  function blankFinalChecklist() {
    const out = {};
    FINAL_INSPECTION_SECTIONS.forEach((sec) => {
      out[sec.id] = blankChecklist(sec);
    });
    return out;
  }

  function detectIncomingTemplate(itemId, store) {
    const it = store && store.get ? store.get("items", itemId) : null;
    if (!it) return INCOMING_MATERIAL_TEMPLATES.general;
    const hay = ((it.name || "") + " " + (it.description || "") + " " + (it.sku || "")).toLowerCase();
    const cat = it.categoryId && store.get ? store.get("categories", it.categoryId) : null;
    const catName = ((cat && cat.name) || "").toLowerCase();
    if (/led|optic|lamp/i.test(hay + catName)) return INCOMING_MATERIAL_TEMPLATES.led;
    if (/driver|smps|power supply/i.test(hay + catName)) return INCOMING_MATERIAL_TEMPLATES.driver;
    if (/battery|lithium|lipo/i.test(hay + catName)) return INCOMING_MATERIAL_TEMPLATES.battery;
    if (/solar|panel|pv/i.test(hay + catName)) return INCOMING_MATERIAL_TEMPLATES.solar;
    if (/glass|borosilicate|lens/i.test(hay + catName)) return INCOMING_MATERIAL_TEMPLATES.glass;
    if (/alumin|casting|enclosure|housing/i.test(hay + catName)) return INCOMING_MATERIAL_TEMPLATES.aluminum;
    if (/bolt|nut|screw|hardware|fastener/i.test(hay + catName)) return INCOMING_MATERIAL_TEMPLATES.hardware;
    return INCOMING_MATERIAL_TEMPLATES.general;
  }

  function matchCustomerPlan(customerName, plans) {
    const name = (customerName || "").toLowerCase();
    const list = plans || CUSTOMER_INSPECTION_PLANS;
    if (!name) return null;
    return list.find((p) => name.indexOf(p.customerKey.toLowerCase()) >= 0 || name.indexOf(p.name.toLowerCase()) >= 0) || null;
  }

  function checklistSummary(checklist) {
    if (!checklist || typeof checklist !== "object") return { pass: 0, fail: 0, total: 0 };
    let pass = 0, fail = 0, total = 0;
    Object.keys(checklist).forEach((k) => {
      const v = checklist[k];
      if (v && typeof v === "object" && "value" in v) {
        total++;
        if (String(v.value).toLowerCase() === "fail" || String(v.value).toLowerCase() === "no") fail++;
        else if (v.value) pass++;
      } else if (v && typeof v === "object") {
        const sub = checklistSummary(v);
        pass += sub.pass; fail += sub.fail; total += sub.total;
      }
    });
    return { pass, fail, total };
  }

  VG.QC_AVIATION = {
    CHECK_TYPES,
    INCOMING_MATERIAL_TEMPLATES,
    IN_PROCESS_STAGES,
    FINAL_INSPECTION_SECTIONS,
    CUSTOMER_INSPECTION_PLANS,
    DEFAULT_TEST_EQUIPMENT,
    blankChecklist,
    blankFinalChecklist,
    detectIncomingTemplate,
    matchCustomerPlan,
    checklistSummary,
  };
})(window.VG);
