/* Veraglo ERP — module-wise features catalog + download helpers. */
(function (VG) {
  const PLATFORM_FEATURES = [
    { module: "Platform", section: "Authentication", feature: "Email/password login, first-time admin setup (once), forgot password OTP/link, session timeout, auth repair" },
    { module: "Platform", section: "Access control", feature: "RBAC modules, actions (view/add/edit/delete/approve/export/print), field permissions" },
    { module: "Platform", section: "Workspace", feature: "Module launcher, sidebar, universal search, light/dark theme, PWA" },
    { module: "Platform", section: "Data", feature: "PostgreSQL JSONB or file storage, backup/restore, audit trail" },
    { module: "Platform", section: "Documents", feature: "PDF preview/print, email, document templates, company branding" },
  ];

  const MODULE_FEATURES = {
    sales: [
      "Customer master & 360°, enquiries, leads, follow-ups",
      "Quotations, proforma, tax invoices, sales orders",
      "SO revision control, push to production, approval center",
      "Comm. center, analytics, forecasting, AI intelligence",
      "Price list, currencies, PIN codes, reports",
    ],
    inventory: [
      "Item master, SKU engine, manufacturers, categories, BOM",
      "Material receipt/issue, stock ledger, transfers",
      "Opening balance, physical verification, scrap, alerts",
      "Returnable/non-returnable challans, batch/lot",
    ],
    purchase: [
      "Purchase request, RFQ, vendor quotations, comparison",
      "Purchase orders, GRN, vendor bills, vendor ledger",
      "Approvals and procurement reports",
    ],
    production: [
      "Work orders from SO, full-width WO preview (7 sections)",
      "SO→WO revision sync, accept revision, shop floor",
      "BOM register, MRP, material control, reports",
    ],
    quality: [
      "Incoming, production, and final QC inspections",
      "NCR/rejection register, QC reports",
    ],
    dispatch: [
      "Shipments from SO, delivery tracking, dispatch reports",
    ],
    accounts: [
      "Receivables, payment recording, finance reports",
    ],
    hr: [
      "Employees, leave, attendance, payroll, self-service",
    ],
    attendance: [
      "Monthly attendance register, print/export",
    ],
    admin: [
      "Users, roles, permissions, company profile, security",
      "Document templates, numbering, backup, audit, licensing",
      "Auth repair, connected sessions, system health",
    ],
  };

  function rowsFromRegisteredSections() {
    const rows = PLATFORM_FEATURES.map((r) => ({
      moduleId: "platform",
      moduleName: r.module,
      sectionId: r.section.toLowerCase().replace(/\s+/g, "-"),
      sectionLabel: r.section,
      sectionGroup: "Platform",
      features: r.feature,
    }));
    const mods = VG.MODULES || [];
    mods.forEach((mod) => {
      const sections = (VG.moduleSections && VG.moduleSections[mod.id]) || [];
      const summary = (MODULE_FEATURES[mod.id] || []).join("; ") || mod.tagline || "";
      if (sections.length) {
        sections.forEach((s) => {
          rows.push({
            moduleId: mod.id,
            moduleName: mod.name,
            sectionId: s.id,
            sectionLabel: s.label,
            sectionGroup: s.group || "",
            features: summary,
          });
        });
      } else {
        rows.push({
          moduleId: mod.id,
          moduleName: mod.name,
          sectionId: "overview",
          sectionLabel: "Overview",
          sectionGroup: "Overview",
          features: summary || mod.tagline || "",
        });
      }
    });
    return rows;
  }

  function toCsv(rows) {
    const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const head = ["Module ID", "Module Name", "Section ID", "Section Label", "Section Group", "Features Summary"];
    const lines = [head.map(esc).join(",")];
    rows.forEach((r) => {
      lines.push([r.moduleId, r.moduleName, r.sectionId, r.sectionLabel, r.sectionGroup, r.features].map(esc).join(","));
    });
    return lines.join("\n");
  }

  function toMarkdown(rows) {
    const byMod = {};
    rows.forEach((r) => {
      const k = r.moduleId + "|" + r.moduleName;
      if (!byMod[k]) byMod[k] = { id: r.moduleId, name: r.moduleName, sections: [] };
      if (r.moduleId !== "platform") byMod[k].sections.push(r);
    });
    let md = "# Veraglo ERP — Module Features (exported)\n\n";
    md += "Exported: " + new Date().toLocaleString() + "\n\n";
    md += "## Platform\n\n";
    PLATFORM_FEATURES.forEach((p) => { md += "- **" + p.section + ":** " + p.feature + "\n"; });
    md += "\n---\n\n";
    Object.values(byMod).forEach((mod) => {
      md += "## " + mod.name + " (`" + mod.id + "`)\n\n";
      md += "| Section | Group | Features |\n|---------|-------|----------|\n";
      mod.sections.forEach((s) => {
        md += "| " + s.sectionLabel + " | " + (s.sectionGroup || "—") + " | " + (s.features || "—") + " |\n";
      });
      md += "\n";
    });
    return md;
  }

  function downloadBlob(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadFeaturesCsv() {
    const rows = rowsFromRegisteredSections();
    downloadBlob("Veraglo-ERP-Module-Features.csv", toCsv(rows), "text/csv;charset=utf-8");
    return rows.length;
  }

  function downloadFeaturesMarkdown() {
    const rows = rowsFromRegisteredSections();
    downloadBlob("Veraglo-ERP-Module-Features.md", toMarkdown(rows), "text/markdown;charset=utf-8");
    return rows.length;
  }

  VG.erpFeaturesCatalog = {
    rowsFromRegisteredSections,
    downloadFeaturesCsv,
    downloadFeaturesMarkdown,
    PLATFORM_FEATURES,
    MODULE_FEATURES,
  };
})(window.VG);
