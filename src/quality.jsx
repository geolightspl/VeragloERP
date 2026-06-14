/* Veraglo ERP — Quality Control module (Aviation Warning Lights manufacturing) */
(function (VG) {
  const { useState } = React;
  const pages = VG.QC_AVIATION_PAGES || {};

  const SECTIONS = [
    { id: "dashboard", label: "QC Dashboard", icon: "chart", group: "Overview" },
    { id: "inspections", label: "Incoming Inspection", icon: "shield", group: "Inspection" },
    { id: "in-process", label: "In-Process Inspection", icon: "factory", group: "Inspection" },
    { id: "final-qc", label: "Final Inspection", icon: "check", group: "Inspection" },
    { id: "calibration", label: "Calibration Management", icon: "settings", group: "Compliance" },
    { id: "ncr", label: "Non-Conformance (NCR)", icon: "alert", group: "Compliance" },
    { id: "capa", label: "CAPA", icon: "refresh", group: "Compliance" },
    { id: "templates", label: "Inspection Templates", icon: "folder", group: "Masters" },
    { id: "reports", label: "QC Reports", icon: "download", group: "Reports" },
    { id: "equipment", label: "Test Equipment Master", icon: "box", group: "Masters" },
    { id: "customer-plans", label: "Customer Inspection Plans", icon: "users", group: "Masters" },
    { id: "analytics", label: "Quality Analytics", icon: "activity", group: "Reports" },
  ];

  if (VG.registerModuleSections) VG.registerModuleSections("quality", SECTIONS);

  function Dashboard(props) {
    return VG.ModuleDashboard ? <VG.ModuleDashboard modId="quality" {...props} /> : null;
  }

  const PAGES = {
    dashboard: Dashboard,
    inspections: pages.IncomingInspectionPage || Dashboard,
    "in-process": pages.InProcessInspectionPage || Dashboard,
    "final-qc": pages.FinalInspectionPage || Dashboard,
    calibration: pages.CalibrationPage || Dashboard,
    ncr: pages.NcrPage || Dashboard,
    capa: pages.CapaPage || Dashboard,
    templates: pages.TemplatesPage || Dashboard,
    reports: pages.QcReportsPage || Dashboard,
    equipment: pages.TestEquipmentPage || pages.CalibrationPage || Dashboard,
    "customer-plans": pages.CustomerPlansPage || Dashboard,
    analytics: pages.AnalyticsPage || Dashboard,
  };

  VG.modules = VG.modules || {};
  VG.modules.quality = function QualityModule({ mod, roleKey }) {
    const can = (a) => VG.can(roleKey, a);
    const [section, setSection] = useState(() => VG.consumeSection("quality", "dashboard"));
    const Page = PAGES[section] || Dashboard;
    const actions = [
      { label: "Incoming inspection", icon: "shield", primary: true, onClick: () => setSection("inspections") },
      { label: "In-process inspection", icon: "factory", onClick: () => setSection("in-process") },
      { label: "Final inspection", icon: "check", onClick: () => setSection("final-qc") },
      { label: "Create NCR", icon: "alert", onClick: () => setSection("ncr") },
      { label: "Create CAPA", icon: "refresh", onClick: () => setSection("capa") },
      { label: "QC reports", icon: "download", onClick: () => setSection("reports") },
    ];
    return (
      <VG.ModuleScaffold mod={mod} sections={SECTIONS} section={section} setSection={setSection} actions={actions} roleKey={roleKey}>
        <Page roleKey={roleKey} can={can} go={setSection} mod={mod} />
      </VG.ModuleScaffold>
    );
  };
})(window.VG);
