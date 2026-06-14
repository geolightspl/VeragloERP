/* Veraglo ERP — master QC inspection parameter library (maximum checkpoints) */
(function (VG) {
  const GROUPS = {
    mandatory: "Mandatory tests",
    optional: "Optional tests",
    customer: "Customer-specific tests",
    product: "Product-specific tests",
    standard: "Standard / compliance tests",
    custom: "User-added tests",
  };

  function p(spec) {
    return {
      id: spec.id,
      label: spec.label,
      type: spec.type || "passfail",
      unit: spec.unit || "",
      criteria: spec.criteria || "",
      group: spec.group || "mandatory",
      severity: spec.severity || (spec.critical ? "critical" : "major"),
      mandatory: spec.mandatory !== false && spec.group !== "optional",
      enabled: spec.enabled !== false,
      options: spec.options || null,
    };
  }

  const COMMON_INCOMING = [
    p({ id: "materialCode", label: "Material code", type: "text", group: "mandatory" }),
    p({ id: "manufacturer", label: "Manufacturer", type: "text", group: "mandatory" }),
    p({ id: "mfrPartNo", label: "Manufacturer part number", type: "text", group: "mandatory" }),
    p({ id: "lotNumber", label: "Lot number", type: "text", group: "mandatory" }),
    p({ id: "batchNumber", label: "Batch number", type: "text", group: "mandatory" }),
    p({ id: "qtyReceived", label: "Quantity received", type: "number", group: "mandatory" }),
    p({ id: "qtyInspected", label: "Quantity inspected", type: "number", group: "mandatory" }),
    p({ id: "qtyAccepted", label: "Quantity accepted", type: "number", group: "mandatory" }),
    p({ id: "qtyRejected", label: "Quantity rejected", type: "number", group: "mandatory" }),
    p({ id: "datasheetRef", label: "Datasheet reference", type: "text", group: "standard" }),
    p({ id: "drawingRef", label: "Drawing reference", type: "text", group: "standard" }),
    p({ id: "poRef", label: "Purchase Order reference", type: "text", group: "mandatory" }),
    p({ id: "grnRef", label: "GRN reference", type: "text", group: "mandatory" }),
    p({ id: "certReceived", label: "Certificate received", type: "yesno", group: "standard" }),
    p({ id: "cocReceived", label: "CoC received", type: "yesno", group: "standard" }),
    p({ id: "testReportReceived", label: "Test report received", type: "yesno", group: "standard" }),
  ];

  const VISUAL = [
    p({ id: "physicalDamage", label: "Physical damage", severity: "critical" }),
    p({ id: "corrosion", label: "Corrosion", severity: "major" }),
    p({ id: "surfaceDefects", label: "Surface defects", severity: "major" }),
    p({ id: "labelVerification", label: "Label verification", severity: "major" }),
    p({ id: "markingVerification", label: "Marking verification", severity: "minor" }),
    p({ id: "packagingCondition", label: "Packaging condition", severity: "minor" }),
  ];

  const DIMENSIONAL = [
    p({ id: "length", label: "Length", type: "number", unit: "mm", group: "optional" }),
    p({ id: "width", label: "Width", type: "number", unit: "mm", group: "optional" }),
    p({ id: "height", label: "Height", type: "number", unit: "mm", group: "optional" }),
    p({ id: "diameter", label: "Diameter", type: "number", unit: "mm", group: "optional" }),
    p({ id: "thickness", label: "Thickness", type: "number", unit: "mm", group: "optional" }),
    p({ id: "weight", label: "Weight", type: "number", unit: "kg", group: "optional" }),
    p({ id: "toleranceVerification", label: "Tolerance verification", group: "optional" }),
  ];

  const ELECTRICAL = [
    p({ id: "voltage", label: "Voltage", type: "number", unit: "V", group: "product" }),
    p({ id: "current", label: "Current", type: "number", unit: "A", group: "product" }),
    p({ id: "resistance", label: "Resistance", type: "number", unit: "Ω", group: "optional" }),
    p({ id: "continuity", label: "Continuity", group: "product", severity: "critical" }),
    p({ id: "insulationResistance", label: "Insulation resistance", type: "number", unit: "MΩ", group: "optional" }),
    p({ id: "powerConsumption", label: "Power consumption", type: "number", unit: "W", group: "optional" }),
  ];

  const FUNCTIONAL = [
    p({ id: "functionalOperation", label: "Functional operation", severity: "critical" }),
    p({ id: "responseTest", label: "Response test", group: "optional" }),
    p({ id: "stabilityTest", label: "Stability test", group: "optional" }),
  ];

  const DOCUMENTATION = [
    p({ id: "datasheet", label: "Datasheet", type: "yesno", group: "standard" }),
    p({ id: "testCertificate", label: "Test certificate", type: "yesno", group: "standard" }),
    p({ id: "calibrationCertificate", label: "Calibration certificate", type: "yesno", group: "optional" }),
    p({ id: "materialCertificate", label: "Material certificate", type: "yesno", group: "standard" }),
  ];

  const MATERIAL = {
    led: [
      p({ id: "forwardVoltage", label: "Forward voltage", type: "number", unit: "V", group: "product" }),
      p({ id: "forwardCurrent", label: "Forward current", type: "number", unit: "mA", group: "product" }),
      p({ id: "luminousIntensity", label: "Luminous intensity", type: "number", unit: "cd", group: "product" }),
      p({ id: "viewingAngle", label: "Viewing angle", type: "number", unit: "°", group: "optional" }),
      p({ id: "colorWavelength", label: "Color wavelength", type: "number", unit: "nm", group: "product" }),
      p({ id: "polarityVerification", label: "Polarity verification", severity: "critical" }),
      p({ id: "visualCondition", label: "Visual condition", severity: "major" }),
      p({ id: "solderability", label: "Solderability", group: "optional" }),
    ],
    driver: [
      p({ id: "inputVoltage", label: "Input voltage", type: "number", unit: "V" }),
      p({ id: "outputVoltage", label: "Output voltage", type: "number", unit: "V" }),
      p({ id: "outputCurrent", label: "Output current", type: "number", unit: "A" }),
      p({ id: "efficiency", label: "Efficiency", type: "number", unit: "%" }),
      p({ id: "surgeProtection", label: "Surge protection", severity: "critical" }),
      p({ id: "overloadProtection", label: "Overload protection", severity: "major" }),
      p({ id: "shortCircuitProtection", label: "Short-circuit protection", severity: "critical" }),
    ],
    battery: [
      p({ id: "batteryVoltage", label: "Voltage", type: "number", unit: "V" }),
      p({ id: "capacity", label: "Capacity", type: "number", unit: "Ah" }),
      p({ id: "internalResistance", label: "Internal resistance", type: "number", unit: "mΩ", group: "optional" }),
      p({ id: "mfgDate", label: "Manufacturing date", type: "date" }),
      p({ id: "chargingTest", label: "Charging test" }),
      p({ id: "leakageCheck", label: "Leakage check", severity: "critical" }),
    ],
    solar: [
      p({ id: "wattage", label: "Wattage", type: "number", unit: "W" }),
      p({ id: "voc", label: "Voc", type: "number", unit: "V" }),
      p({ id: "isc", label: "Isc", type: "number", unit: "A" }),
      p({ id: "vmp", label: "Vmp", type: "number", unit: "V" }),
      p({ id: "imp", label: "Imp", type: "number", unit: "A" }),
      p({ id: "frameCondition", label: "Frame condition" }),
      p({ id: "junctionBox", label: "Junction box condition" }),
    ],
    pcb: [
      p({ id: "pcbDimensions", label: "Dimensions", type: "number", unit: "mm" }),
      p({ id: "copperThickness", label: "Copper thickness", type: "number", unit: "μm", group: "optional" }),
      p({ id: "trackDamage", label: "Track damage", severity: "critical" }),
      p({ id: "holeAlignment", label: "Hole alignment", group: "optional" }),
      p({ id: "solderMaskQuality", label: "Solder mask quality" }),
    ],
    aluminum: [
      p({ id: "materialGrade", label: "Material grade", type: "text" }),
      p({ id: "castingWeight", label: "Weight", type: "number", unit: "kg" }),
      p({ id: "castingDimensions", label: "Dimensions", type: "number", unit: "mm" }),
      p({ id: "porosity", label: "Porosity", severity: "critical" }),
      p({ id: "crackInspection", label: "Crack inspection", severity: "critical" }),
      p({ id: "threadInspection", label: "Thread inspection" }),
      p({ id: "surfaceTreatment", label: "Surface treatment", group: "optional" }),
    ],
    glass: [
      p({ id: "glassDiameter", label: "Diameter", type: "number", unit: "mm" }),
      p({ id: "glassThickness", label: "Thickness", type: "number", unit: "mm" }),
      p({ id: "transparency", label: "Transparency" }),
      p({ id: "bubbleCheck", label: "Bubble check", severity: "critical" }),
      p({ id: "crackCheck", label: "Crack check", severity: "critical" }),
    ],
    hardware: [
      p({ id: "threadQuality", label: "Thread quality" }),
      p({ id: "coatingThickness", label: "Coating thickness", type: "number", unit: "μm", group: "optional" }),
      p({ id: "hwMaterialGrade", label: "Material grade", type: "text" }),
      p({ id: "corrosionResistance", label: "Corrosion resistance" }),
    ],
  };

  const IN_PROCESS = {
    production: [
      p({ id: "woNumber", label: "WO Number", type: "text", group: "mandatory" }),
      p({ id: "operationStage", label: "Operation stage", type: "text", group: "mandatory" }),
      p({ id: "operator", label: "Operator", type: "text" }),
      p({ id: "inspector", label: "Inspector", type: "text", group: "mandatory" }),
      p({ id: "shift", label: "Shift", type: "text", group: "optional" }),
      p({ id: "dateTime", label: "Date/time", type: "datetime", group: "mandatory" }),
    ],
    pcb_assembly: [
      p({ id: "componentPlacement", label: "Component placement" }),
      p({ id: "componentValueVerification", label: "Component value verification", severity: "major" }),
      p({ id: "solderQuality", label: "Solder quality", severity: "major" }),
      p({ id: "polarity", label: "Polarity", severity: "critical" }),
      p({ id: "ipContinuity", label: "Continuity" }),
      p({ id: "ipShortCircuit", label: "Short circuit", severity: "critical" }),
      p({ id: "ipFunctionalTest", label: "Functional test", severity: "critical" }),
    ],
    mechanical: [
      p({ id: "torqueVerification", label: "Torque verification", type: "number", unit: "Nm" }),
      p({ id: "fastenerCount", label: "Fastener count", type: "number" }),
      p({ id: "alignment", label: "Alignment" }),
      p({ id: "fitment", label: "Fitment" }),
      p({ id: "surfaceFinish", label: "Surface finish", group: "optional" }),
    ],
    led_module: [
      p({ id: "ledCount", label: "LED count", type: "number" }),
      p({ id: "ledColorVerification", label: "Color verification", severity: "critical" }),
      p({ id: "currentDraw", label: "Current draw", type: "number", unit: "mA" }),
      p({ id: "brightnessVerification", label: "Brightness verification" }),
      p({ id: "uniformity", label: "Uniformity" }),
    ],
    control_panel: [
      p({ id: "wiringVerification", label: "Wiring verification" }),
      p({ id: "terminalNumbering", label: "Terminal numbering" }),
      p({ id: "relayOperation", label: "Relay operation" }),
      p({ id: "alarmOperation", label: "Alarm operation", severity: "critical" }),
      p({ id: "gpsOperation", label: "GPS operation", severity: "critical" }),
      p({ id: "photocellSimulation", label: "Photocell simulation" }),
    ],
    solar_system: [
      p({ id: "chargeControllerOp", label: "Charge controller operation" }),
      p({ id: "batteryCharging", label: "Battery charging" }),
      p({ id: "solarCharging", label: "Solar charging" }),
      p({ id: "loadOutput", label: "Load output" }),
    ],
    documentation: [
      p({ id: "assemblyRecord", label: "Assembly record", type: "yesno", group: "standard" }),
      p({ id: "drawingRevision", label: "Drawing revision", type: "text", group: "standard" }),
      p({ id: "bomRevision", label: "BOM revision verification", type: "text", group: "standard" }),
    ],
  };

  const FINAL = {
    identification: [
      p({ id: "productCode", label: "Product code", type: "text", group: "mandatory" }),
      p({ id: "sku", label: "SKU", type: "text", group: "mandatory" }),
      p({ id: "serialNumber", label: "Serial number", type: "text", group: "mandatory" }),
      p({ id: "modelNumber", label: "Model number", type: "text" }),
      p({ id: "drawingRevision", label: "Drawing revision", type: "text" }),
      p({ id: "customerReference", label: "Customer reference", type: "text", group: "customer" }),
    ],
    visual: [
      p({ id: "paintFinish", label: "Paint finish" }), p({ id: "finalLabelVerification", label: "Label verification" }),
      p({ id: "nameplate", label: "Nameplate" }), p({ id: "surfaceDefectsFinal", label: "Surface defects" }),
      p({ id: "mechanicalCondition", label: "Mechanical condition" }),
    ],
    dimensional: DIMENSIONAL,
    electrical: [
      p({ id: "inputVoltage", label: "Input voltage", type: "number", unit: "V" }),
      p({ id: "inputCurrent", label: "Input current", type: "number", unit: "A" }),
      p({ id: "powerConsumption", label: "Power consumption", type: "number", unit: "W" }),
      p({ id: "earthContinuity", label: "Earth continuity", severity: "critical" }),
      p({ id: "insulationResistanceFinal", label: "Insulation resistance", type: "number", unit: "MΩ" }),
    ],
    optical: [
      p({ id: "colorVerification", label: "Color verification", severity: "critical" }),
      p({ id: "flashRate", label: "Flash rate", type: "number", unit: "fpm", severity: "critical" }),
      p({ id: "intensityMeasurement", label: "Intensity measurement", type: "number", unit: "cd", severity: "critical" }),
      p({ id: "beamPattern", label: "Beam pattern" }),
      p({ id: "synchronization", label: "Synchronization" }),
    ],
    functional: [
      p({ id: "dayMode", label: "Day mode" }), p({ id: "nightMode", label: "Night mode" }),
      p({ id: "photocellOperation", label: "Photocell operation", severity: "critical" }),
      p({ id: "gpsSynchronization", label: "GPS synchronization", severity: "critical" }),
      p({ id: "alarmOutput", label: "Alarm output" }), p({ id: "dryContactOutput", label: "Dry contact output" }),
      p({ id: "remoteMonitoring", label: "Remote monitoring", group: "optional" }),
    ],
    environmental: [
      p({ id: "ipSealing", label: "IP sealing", severity: "critical" }),
      p({ id: "gasketCondition", label: "Gasket condition" }),
      p({ id: "cableGlandVerification", label: "Cable gland verification" }),
    ],
    burnIn: [
      p({ id: "burnInDuration", label: "Duration", type: "text" }),
      p({ id: "burnInTemperature", label: "Temperature", type: "number", unit: "°C" }),
      p({ id: "burnInFailures", label: "Failures observed", type: "text" }),
    ],
    packing: [
      p({ id: "productQuantity", label: "Product quantity", type: "number" }),
      p({ id: "accessories", label: "Accessories", type: "yesno" }),
      p({ id: "userManual", label: "User manual", type: "yesno" }),
      p({ id: "warrantyCard", label: "Warranty card", type: "yesno" }),
      p({ id: "packingQuality", label: "Packing quality" }),
    ],
  };

  const FAT_TESTS = [
    p({ id: "fatCustomerDetails", label: "Customer details verified", type: "yesno", group: "mandatory" }),
    p({ id: "fatProjectDetails", label: "Project details verified", type: "yesno", group: "mandatory" }),
    p({ id: "fatProductDetails", label: "Product details verified", type: "yesno", group: "mandatory" }),
    p({ id: "fatQuantity", label: "Quantity tested", type: "number", group: "mandatory" }),
    p({ id: "fatTestEquipment", label: "Test equipment used", type: "text" }),
    p({ id: "fatCalCertRef", label: "Calibration certificate reference", type: "text" }),
    p({ id: "fatVisual", label: "Visual inspection" }),
    p({ id: "fatElectrical", label: "Electrical test", severity: "critical" }),
    p({ id: "fatOptical", label: "Optical test", severity: "critical" }),
    p({ id: "fatFlashRate", label: "Flash rate", type: "number", unit: "fpm", severity: "critical" }),
    p({ id: "fatIntensity", label: "Intensity", type: "number", unit: "cd" }),
    p({ id: "fatGpsSync", label: "GPS synchronization", severity: "critical" }),
    p({ id: "fatPhotocell", label: "Photocell" }),
    p({ id: "fatAlarm", label: "Alarm" }),
    p({ id: "fatControlPanel", label: "Control panel" }),
    p({ id: "fatBurnIn", label: "Burn-in" }),
    p({ id: "fatPacking", label: "Packing inspection" }),
    p({ id: "fatInspectorWitness", label: "Inspector witness", type: "signature", group: "mandatory" }),
    p({ id: "fatCustomerWitness", label: "Customer representative", type: "signature", group: "customer" }),
    p({ id: "fatQaManager", label: "QA Manager", type: "signature", group: "mandatory" }),
  ];

  const CUSTOMER_FAT = {
    PGCIL: [p({ id: "pgcilTypeTest", label: "Type test reference compliance", group: "customer", severity: "critical" }), p({ id: "pgcilEarthing", label: "Earthing test report", group: "customer" })],
    AAI: [p({ id: "aaiIcao", label: "ICAO Annex 14 compliance", group: "customer", severity: "critical" }), p({ id: "aaiPhotometric", label: "Photometric report", group: "customer" })],
    NTPC: [p({ id: "ntpcMaterialCert", label: "Material test certificates", group: "customer" })],
    KEC: [p({ id: "kecExportPack", label: "Export packaging standard", group: "customer" })],
    International: [p({ id: "intlExportDocs", label: "Export documentation complete", group: "customer", severity: "critical" })],
  };

  function section(id, title, fields) {
    return { id, title, fields: fields || [] };
  }

  function buildIncomingSections(materialKey) {
    const mat = MATERIAL[materialKey] || [];
    return [
      section("common", "Common parameters", COMMON_INCOMING),
      section("visual", "Visual inspection", VISUAL),
      section("dimensional", "Dimensional inspection", DIMENSIONAL),
      section("electrical", "Electrical inspection", ELECTRICAL),
      section("functional", "Functional inspection", FUNCTIONAL),
      section("documentation", "Documentation verification", DOCUMENTATION),
      section("material", "Material-specific — " + (materialKey || "general"), mat),
    ].filter((s) => s.fields.length);
  }

  function buildInProcessSections(stageKey) {
    const stageMap = {
      pcb_assembly: IN_PROCESS.pcb_assembly,
      led_assembly: IN_PROCESS.led_module,
      mechanical_assembly: IN_PROCESS.mechanical,
      control_panel: IN_PROCESS.control_panel,
      solar_assembly: IN_PROCESS.solar_system,
    };
    return [
      section("production", "Production information", IN_PROCESS.production),
      section("stage", "Stage-specific tests", stageMap[stageKey] || IN_PROCESS.pcb_assembly),
      section("documentation", "Documentation", IN_PROCESS.documentation),
    ];
  }

  function buildFinalSections() {
    return Object.keys(FINAL).map((k) => section(k, k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, " $1"), FINAL[k]));
  }

  function buildFatSections(customerKey) {
    const extra = CUSTOMER_FAT[customerKey] || [];
    return [
      section("fatTests", "FAT test parameters", FAT_TESTS),
      section("customerFat", "Customer-specific FAT — " + (customerKey || "Standard"), extra),
    ].filter((s) => s.fields.length);
  }

  function flattenSections(sections) {
    const out = [];
    (sections || []).forEach((sec) => {
      (sec.fields || []).forEach((f) => out.push({ ...f, sectionId: sec.id, sectionTitle: sec.title }));
    });
    return out;
  }

  function buildRichTemplate(base) {
    let sections = base.sections;
    if (!sections && base.templateKey && base.type === "incoming") sections = buildIncomingSections(base.templateKey);
    if (!sections && base.type === "in-process") sections = buildInProcessSections(base.templateKey || base.assignStageIds && base.assignStageIds[0]);
    if (!sections && base.type === "final") sections = buildFinalSections();
    if (!sections && base.type === "fat") sections = buildFatSections((base.assignCustomerKeys || [])[0]);
    const fields = sections ? flattenSections(sections) : (base.fields || []);
    return { ...base, sections: sections || null, fields, engineVersion: 3 };
  }

  VG.QC_PARAM_LIB = {
    GROUPS, COMMON_INCOMING, VISUAL, DIMENSIONAL, ELECTRICAL, FUNCTIONAL, DOCUMENTATION,
    MATERIAL, IN_PROCESS, FINAL, FAT_TESTS, CUSTOMER_FAT,
    buildIncomingSections, buildInProcessSections, buildFinalSections, buildFatSections,
    buildRichTemplate, flattenSections, section, p,
  };
})(window.VG);
