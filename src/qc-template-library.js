/* Veraglo ERP — master QC inspection template library (seed data) */
(function (VG) {
  function fld(list) {
    return list.map((f, i) => ({
      id: f.id || ("f" + (i + 1)),
      label: f.label,
      type: f.type || "passfail",
      unit: f.unit || "",
      criteria: f.criteria || "",
      required: f.required !== false,
      critical: !!f.critical,
      options: f.options || null,
    }));
  }

  function tpl(base) {
    return {
      active: true,
      revision: 1,
      department: "Quality Control",
      assignCategoryKeywords: base.assignCategoryKeywords || [],
      assignSkuPatterns: base.assignSkuPatterns || [],
      assignProductTypes: base.assignProductTypes || [],
      assignCustomerKeys: base.assignCustomerKeys || [],
      assignStageIds: base.assignStageIds || [],
      passLogic: base.passLogic || "all_required_pass",
      headerFields: base.headerFields || ["inspectionNo", "date", "inspector", "grnRef", "sku", "qtyReceived", "qtyInspected", "batch", "result"],
      ...base,
    };
  }

  const INCOMING = [
    tpl({ id: "qtpl-in-led", templateKey: "led", type: "incoming", name: "LED Incoming Inspection", category: "LED / Optics",
      assignCategoryKeywords: ["led", "optic", "lamp"],
      fields: fld([
        { id: "manufacturer", label: "Manufacturer", type: "text" },
        { id: "partNumber", label: "Manufacturer part number", type: "text" },
        { id: "datasheetRef", label: "Datasheet reference", type: "text" },
        { id: "ledColor", label: "LED color", type: "dropdown", options: ["Red", "White", "Amber", "Green", "Blue"] },
        { id: "forwardVoltage", label: "Forward voltage", type: "number", unit: "V" },
        { id: "forwardCurrent", label: "Forward current", type: "number", unit: "mA" },
        { id: "luminousIntensity", label: "Luminous intensity", type: "number", unit: "cd" },
        { id: "visualDamage", label: "Visual damage", critical: true },
        { id: "leadCondition", label: "Lead condition" },
        { id: "polarityMarking", label: "Polarity marking" },
        { id: "qtyVerification", label: "Quantity verification" },
        { id: "acceptanceCriteria", label: "Acceptance criteria met" },
        { id: "result", label: "Result", type: "passfail", critical: true },
      ]),
    }),
    tpl({ id: "qtpl-in-driver", templateKey: "driver", type: "incoming", name: "LED Driver / Power Supply Incoming",
      assignCategoryKeywords: ["driver", "smps", "power supply"],
      fields: fld([
        { id: "manufacturer", label: "Manufacturer", type: "text" },
        { id: "modelNumber", label: "Model number", type: "text" },
        { id: "inputVoltage", label: "Input voltage", type: "number", unit: "V" },
        { id: "outputVoltage", label: "Output voltage", type: "number", unit: "V" },
        { id: "outputCurrent", label: "Output current", type: "number", unit: "A" },
        { id: "wattage", label: "Wattage", type: "number", unit: "W" },
        { id: "efficiency", label: "Efficiency", type: "number", unit: "%" },
        { id: "protectionSc", label: "Short circuit protection" },
        { id: "protectionOl", label: "Overload protection" },
        { id: "protectionSurge", label: "Surge protection" },
        { id: "terminalCondition", label: "Terminal condition" },
        { id: "labelVerification", label: "Label verification" },
        { id: "functionalTest", label: "Functional test result", critical: true },
      ]),
    }),
    tpl({ id: "qtpl-in-pcb", templateKey: "pcb", type: "incoming", name: "PCB / Electronic Assembly Incoming",
      assignCategoryKeywords: ["pcb", "electronic", "assembly"],
      fields: fld([
        { id: "pcbPartNo", label: "PCB part number", type: "text" },
        { id: "revision", label: "Revision", type: "text" },
        { id: "componentPlacement", label: "Component placement" },
        { id: "solderQuality", label: "Solder quality" },
        { id: "trackDamage", label: "Track damage", critical: true },
        { id: "continuityTest", label: "Continuity test" },
        { id: "shortCircuitTest", label: "Short circuit test", critical: true },
        { id: "conformalCoating", label: "Conformal coating" },
        { id: "functionalTest", label: "Functional test" },
        { id: "visualInspection", label: "Visual inspection" },
      ]),
    }),
    tpl({ id: "qtpl-in-battery", templateKey: "battery", type: "incoming", name: "Battery Incoming Inspection",
      assignCategoryKeywords: ["battery", "lithium", "lipo"],
      fields: fld([
        { id: "batteryType", label: "Battery type", type: "text" },
        { id: "voltage", label: "Voltage", type: "number", unit: "V" },
        { id: "capacityAh", label: "Capacity Ah", type: "number", unit: "Ah" },
        { id: "mfgDate", label: "Manufacturing date", type: "date" },
        { id: "physicalCondition", label: "Physical condition" },
        { id: "terminalCondition", label: "Terminal condition" },
        { id: "leakageCheck", label: "Leakage check", critical: true },
        { id: "chargingTest", label: "Charging test" },
        { id: "acceptanceCriteria", label: "Acceptance criteria met" },
      ]),
    }),
    tpl({ id: "qtpl-in-solar", templateKey: "solar", type: "incoming", name: "Solar Panel Incoming Inspection",
      assignCategoryKeywords: ["solar", "panel", "pv"],
      fields: fld([
        { id: "wattage", label: "Wattage", type: "number", unit: "W" },
        { id: "voc", label: "Voc", type: "number", unit: "V" },
        { id: "isc", label: "Isc", type: "number", unit: "A" },
        { id: "vmp", label: "Vmp", type: "number", unit: "V" },
        { id: "imp", label: "Imp", type: "number", unit: "A" },
        { id: "frameCondition", label: "Frame condition" },
        { id: "junctionBox", label: "Junction box condition" },
        { id: "cableCondition", label: "Cable condition" },
        { id: "glassCondition", label: "Glass condition" },
        { id: "labelVerification", label: "Label verification" },
      ]),
    }),
    tpl({ id: "qtpl-in-aluminum", templateKey: "aluminum", type: "incoming", name: "Aluminum / Die Cast Housing Incoming",
      assignCategoryKeywords: ["aluminum", "casting", "housing", "enclosure"],
      fields: fld([
        { id: "materialGrade", label: "Material grade", type: "text" },
        { id: "castingFinish", label: "Casting finish" },
        { id: "porosity", label: "Porosity", critical: true },
        { id: "crack", label: "Crack", critical: true },
        { id: "threadCondition", label: "Thread condition" },
        { id: "dimensions", label: "Dimensions", type: "number", unit: "mm" },
        { id: "weight", label: "Weight", type: "number", unit: "kg" },
        { id: "surfaceTreatment", label: "Surface treatment" },
        { id: "powderCoating", label: "Powder coating suitability" },
      ]),
    }),
    tpl({ id: "qtpl-in-glass", templateKey: "glass", type: "incoming", name: "Borosilicate Glass / Lens Incoming",
      assignCategoryKeywords: ["glass", "borosilicate", "lens"],
      fields: fld([
        { id: "diameter", label: "Diameter", type: "number", unit: "mm" },
        { id: "thickness", label: "Thickness", type: "number", unit: "mm" },
        { id: "transparency", label: "Transparency" },
        { id: "crack", label: "Crack", critical: true },
        { id: "bubble", label: "Bubble", critical: true },
        { id: "edgeCondition", label: "Edge condition" },
        { id: "fitmentCheck", label: "Fitment check" },
      ]),
    }),
    tpl({ id: "qtpl-in-cable", templateKey: "cable", type: "incoming", name: "Cable / Wire Incoming",
      assignCategoryKeywords: ["cable", "wire", "conductor"],
      fields: fld([
        { id: "size", label: "Size", type: "text" },
        { id: "insulationType", label: "Insulation type", type: "text" },
        { id: "length", label: "Length", type: "number", unit: "m" },
        { id: "continuity", label: "Continuity" },
        { id: "insulationResistance", label: "Insulation resistance", type: "number", unit: "MΩ" },
        { id: "marking", label: "Marking" },
        { id: "physicalDamage", label: "Physical damage", critical: true },
      ]),
    }),
    tpl({ id: "qtpl-in-hardware", templateKey: "hardware", type: "incoming", name: "Hardware / Fasteners Incoming",
      assignCategoryKeywords: ["hardware", "fastener", "bolt", "screw", "nut"],
      fields: fld([
        { id: "materialGrade", label: "Material grade", type: "text" },
        { id: "size", label: "Size", type: "text" },
        { id: "threadCondition", label: "Thread condition" },
        { id: "coating", label: "Coating" },
        { id: "quantity", label: "Quantity" },
        { id: "corrosion", label: "Corrosion", critical: true },
        { id: "visualCondition", label: "Visual condition" },
      ]),
    }),
    tpl({ id: "qtpl-in-general", templateKey: "general", type: "incoming", name: "General Incoming Inspection", category: "General",
      fields: fld([
        { id: "visual", label: "Visual condition" }, { id: "dimensions", label: "Dimensions / packaging" },
        { id: "qtyVerification", label: "Quantity verification" }, { id: "documentation", label: "CoC / test report available" },
      ]),
    }),
  ];

  const IN_PROCESS = [
    tpl({ id: "qtpl-ip-pcb", templateKey: "pcb_assembly", type: "in-process", name: "PCB Assembly In-Process", operationStage: "PCB Assembly", assignStageIds: ["pcb_assembly"],
      fields: fld([
        { id: "bomVerification", label: "BOM verification" }, { id: "componentPlacement", label: "Component placement" },
        { id: "solderingQuality", label: "Soldering quality" }, { id: "polarityCheck", label: "Polarity check", critical: true },
        { id: "continuity", label: "Continuity" }, { id: "shortCircuit", label: "Short circuit test", critical: true },
        { id: "cleaning", label: "Cleaning" }, { id: "functionalTest", label: "Functional test", critical: true },
      ]),
    }),
    tpl({ id: "qtpl-ip-led", templateKey: "led_assembly", type: "in-process", name: "LED Assembly In-Process", operationStage: "LED Assembly", assignStageIds: ["led_assembly"],
      fields: fld([
        { id: "ledOrientation", label: "LED orientation", critical: true }, { id: "ledColor", label: "LED color" },
        { id: "wiringPolarity", label: "Wiring polarity", critical: true }, { id: "thermalPaste", label: "Thermal paste" },
        { id: "mechanicalFitment", label: "Mechanical fitment" }, { id: "lightGlowTest", label: "Light glow test", critical: true },
      ]),
    }),
    tpl({ id: "qtpl-ip-control", templateKey: "control_panel", type: "in-process", name: "Control Panel Assembly In-Process", operationStage: "Control Panel Assembly", assignStageIds: ["control_panel"],
      fields: fld([
        { id: "wiringLayout", label: "Wiring layout" }, { id: "terminalNumbering", label: "Terminal numbering" },
        { id: "mcbFuseRating", label: "MCB/fuse rating" }, { id: "relayOperation", label: "Relay operation" },
        { id: "photocellInput", label: "Photocell input" }, { id: "gpsInput", label: "GPS input" },
        { id: "alarmOutput", label: "Alarm output" }, { id: "earthingContinuity", label: "Earthing continuity", critical: true },
        { id: "labeling", label: "Labeling" },
      ]),
    }),
    tpl({ id: "qtpl-ip-mechanical", templateKey: "mechanical_assembly", type: "in-process", name: "Mechanical Assembly In-Process", operationStage: "Mechanical Assembly", assignStageIds: ["mechanical_assembly"],
      fields: fld([
        { id: "housingFitment", label: "Housing fitment" }, { id: "gasketPlacement", label: "Gasket placement" },
        { id: "cableGlandTorque", label: "Cable gland tightening" }, { id: "fastenerTorque", label: "Fastener torque", type: "number", unit: "Nm" },
        { id: "glassLensFitment", label: "Glass/lens fitment" }, { id: "sealantApplication", label: "Sealant application" },
        { id: "visualFinish", label: "Visual finish" },
      ]),
    }),
    tpl({ id: "qtpl-ip-solar", templateKey: "solar_assembly", type: "in-process", name: "Solar System Assembly In-Process", operationStage: "Solar System Assembly", assignStageIds: ["solar_assembly"],
      fields: fld([
        { id: "solarWiring", label: "Solar panel wiring" }, { id: "batteryConnection", label: "Battery connection" },
        { id: "chargeControllerTest", label: "Charge controller test" }, { id: "polarity", label: "Polarity", critical: true },
        { id: "chargingVoltage", label: "Charging voltage", type: "number", unit: "V" }, { id: "loadOutputTest", label: "Load output test" },
      ]),
    }),
  ];

  const FINAL_PRODUCTS = [
    { key: "li_awl", name: "Low Intensity Aviation Warning Light", patterns: ["low intensity", "li-", "li "] },
    { key: "mi_awl", name: "Medium Intensity Aviation Warning Light", patterns: ["medium intensity", "mi-", "mi "] },
    { key: "hi_awl", name: "High Intensity Aviation Warning Light", patterns: ["high intensity", "hi-", "hi "] },
    { key: "solar_awl", name: "Solar Aviation Warning Light", patterns: ["solar"] },
    { key: "sphere", name: "Aviation Warning Sphere", patterns: ["sphere", "obstruction"] },
    { key: "control_panel", name: "Control Panel", patterns: ["control panel", "controller"] },
    { key: "system", name: "Complete Aviation Warning Light System", patterns: ["system", "complete"] },
  ];

  function finalFields() {
    return fld([
      { id: "productSku", label: "Product SKU", type: "text" }, { id: "productModel", label: "Product model", type: "text" },
      { id: "serialNumber", label: "Serial number", type: "text" }, { id: "quantity", label: "Quantity", type: "number" },
      { id: "drawingRevision", label: "Drawing revision", type: "text" }, { id: "visualInspection", label: "Visual inspection" },
      { id: "inputVoltage", label: "Input voltage", type: "number", unit: "V" }, { id: "inputCurrent", label: "Input current", type: "number", unit: "A" },
      { id: "powerConsumption", label: "Power consumption", type: "number", unit: "W" }, { id: "flashRate", label: "Flash rate", type: "number", unit: "fpm" },
      { id: "lightColor", label: "Light color" }, { id: "photocellOperation", label: "Photocell operation" },
      { id: "gpsSynchronization", label: "GPS synchronization", critical: true }, { id: "dayNightMode", label: "Day/night mode" },
      { id: "alarmOutput", label: "Alarm output" }, { id: "earthingContinuity", label: "Earthing continuity", critical: true },
      { id: "cableGlandSealing", label: "Cable gland sealing" }, { id: "ipSealingCheck", label: "IP sealing check", critical: true },
      { id: "labelVerification", label: "Label verification" }, { id: "burnInDuration", label: "Burn-in test duration", type: "text" },
      { id: "finalResult", label: "Final result", type: "passfail", critical: true },
    ]);
  }

  const FINAL = FINAL_PRODUCTS.map((p) => tpl({
    id: "qtpl-final-" + p.key,
    templateKey: p.key,
    type: "final",
    name: "Final Inspection — " + p.name,
    assignProductTypes: [p.key],
    assignSkuPatterns: p.patterns,
    fields: finalFields(),
  }));

  const FAT = tpl({
    id: "qtpl-fat-standard", templateKey: "fat", type: "fat", name: "Factory Acceptance Test (FAT) Report",
    fields: fld([
      { id: "customerName", label: "Customer name", type: "text" }, { id: "projectName", label: "Project name", type: "text" },
      { id: "soWoRef", label: "SO/WO reference", type: "text" }, { id: "productModel", label: "Product model", type: "text" },
      { id: "serialRange", label: "Serial number range", type: "text" }, { id: "qtyTested", label: "Quantity tested", type: "number" },
      { id: "testDate", label: "Test date", type: "date" }, { id: "testLocation", label: "Testing location", type: "text" },
      { id: "customerWitness", label: "Customer witness name", type: "text" }, { id: "testEquipmentUsed", label: "Test equipment used", type: "text" },
      { id: "calibrationCertRef", label: "Calibration certificate reference", type: "text" },
      { id: "visualInspection", label: "Visual inspection" }, { id: "electricalTest", label: "Electrical test", critical: true },
      { id: "opticalFunctionalTest", label: "Optical/functional test", critical: true }, { id: "controllerTest", label: "Controller test" },
      { id: "photocellTest", label: "Photocell test" }, { id: "gpsSyncTest", label: "GPS synchronization test", critical: true },
      { id: "alarmTest", label: "Alarm test" }, { id: "burnInTest", label: "Burn-in test" },
      { id: "packingVerification", label: "Packing verification" }, { id: "finalFatResult", label: "Final FAT result", type: "passfail", critical: true },
      { id: "customerRemarks", label: "Customer remarks", type: "text" },
      { id: "inspectorSignature", label: "Inspector signature", type: "signature" },
      { id: "witnessSignature", label: "Customer/witness signature", type: "signature" },
      { id: "authorizedSignatory", label: "Authorized signatory", type: "signature" },
    ]),
  });

  const MQP_STAGES = [
    "Raw material inspection", "Component inspection", "Assembly inspection", "Wiring inspection",
    "Functional inspection", "Burn-in test", "Final inspection", "Packing inspection", "Dispatch clearance",
  ];

  const MQP = tpl({
    id: "qtpl-mqp-standard", templateKey: "mqp", type: "mqp", name: "Manufacturing Quality Plan (MQP)",
    mqpStages: MQP_STAGES.map((stage, i) => ({
      id: "mqp_s" + (i + 1), stage, applicableStandards: "ICAO Annex 14 / Customer spec",
      inspectionStages: stage, testParameters: "As per product datasheet", acceptanceCriteria: "Zero critical defect",
      responsibility: "QC Manager", documentRef: "MQP-" + (i + 1), reportFormat: "QC Report PDF",
      holdPoint: i % 3 === 0, witnessPoint: i === MQP_STAGES.length - 2, reviewPoint: i === MQP_STAGES.length - 1,
      frequency: "100%", recordsMaintained: "ERP QC module + PDF archive",
    })),
    fields: fld([
      { id: "projectName", label: "Project name", type: "text" }, { id: "customerName", label: "Customer name", type: "text" },
      { id: "productName", label: "Product name", type: "text" }, { id: "applicableStandards", label: "Applicable standards", type: "text" },
      { id: "manufacturingStages", label: "Manufacturing stages documented", type: "yesno" },
      { id: "inspectionStages", label: "Inspection stages documented", type: "yesno" },
    ]),
  });

  const CUSTOMER_REPORT = tpl({
    id: "qtpl-customer-report", templateKey: "customer", type: "customer-report", name: "Customer Inspection Report",
    fields: fld([
      { id: "customerName", label: "Customer name", type: "text" }, { id: "projectName", label: "Project name", type: "text" },
      { id: "inspectionScope", label: "Inspection scope", type: "text" }, { id: "witnessPoints", label: "Witness points completed", type: "yesno" },
      { id: "complianceStatement", label: "Compliance statement", type: "text" }, { id: "finalResult", label: "Final result", type: "passfail", critical: true },
    ]),
  });

  VG.QC_TEMPLATE_LIBRARY = {
    MASTER: INCOMING.concat(IN_PROCESS, FINAL, [FAT, MQP, CUSTOMER_REPORT]),
    INCOMING, IN_PROCESS, FINAL, FAT, MQP, CUSTOMER_REPORT, MQP_STAGES, FINAL_PRODUCTS,
  };
})(window.VG);
