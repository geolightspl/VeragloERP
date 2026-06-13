/* Veraglo ERP — global typography & font standardization system. */
(function (VG) {
  const SIZE_SCALE = {
    small: { base: 13, table: 12, form: 13, button: 12, heading: 18, subheading: 15, label: 11 },
    medium: { base: 14, table: 13, form: 14, button: 13, heading: 20, subheading: 16, label: 12 },
    large: { base: 15, table: 14, form: 15, button: 14, heading: 22, subheading: 17, label: 13 },
  };

  const LINE_SPACING = { compact: 1.4, comfortable: 1.5, relaxed: 1.65 };

  const FONT_WEIGHT = {
    normal: { normal: 400, medium: 500, semibold: 600, heading: 600 },
    medium: { normal: 400, medium: 500, semibold: 600, heading: 650 },
  };

  const COLOR_DEFAULTS = {
    lightTextColor: "#334155",
    darkTextColor: "#e2e8f0",
    lightHeadingColor: "#0f172a",
    darkHeadingColor: "#f8fafc",
    lightMutedColor: "#64748b",
    darkMutedColor: "#94a3b8",
  };

  VG.FONT_PRESETS = {
    inter: {
      id: "inter",
      label: "Inter (recommended)",
      css: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      pdf: "Inter, 'Segoe UI', Arial, sans-serif",
      google: "Inter:wght@300;400;500;600;700;800",
    },
    poppins: {
      id: "poppins",
      label: "Poppins",
      css: "Poppins, ui-sans-serif, system-ui, sans-serif",
      pdf: "Poppins, Arial, sans-serif",
      google: "Poppins:wght@300;400;500;600;700",
    },
    manrope: {
      id: "manrope",
      label: "Manrope",
      css: "Manrope, ui-sans-serif, system-ui, sans-serif",
      pdf: "Manrope, Arial, sans-serif",
      google: "Manrope:wght@400;500;600;700;800",
    },
    sourceSans: {
      id: "sourceSans",
      label: "Source Sans Pro",
      css: "'Source Sans 3', 'Source Sans Pro', ui-sans-serif, system-ui, sans-serif",
      pdf: "'Source Sans 3', Arial, sans-serif",
      google: "Source+Sans+3:wght@400;500;600;700",
    },
    segoe: {
      id: "segoe",
      label: "Segoe UI",
      css: "'Segoe UI', Inter, ui-sans-serif, system-ui, sans-serif",
      pdf: "'Segoe UI', Arial, sans-serif",
      google: null,
    },
    roboto: {
      id: "roboto",
      label: "Roboto",
      css: "Roboto, ui-sans-serif, system-ui, sans-serif",
      pdf: "Roboto, Arial, sans-serif",
      google: "Roboto:wght@300;400;500;700",
    },
  };

  VG.TYPOGRAPHY_DEFAULTS = {
    fontFamily: "inter",
    bodySize: "medium",
    headingSize: "medium",
    tableSize: "medium",
    formSize: "medium",
    buttonSize: "medium",
    labelSize: "medium",
    pdfFontFamily: "inter",
    fontWeight: "medium",
    lineSpacing: "comfortable",
    density: "comfortable",
    ...COLOR_DEFAULTS,
  };

  function normColor(value, fallback) {
    const s = String(value || "").trim();
    return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : fallback;
  }

  function defaultTypography(theme) {
    const legacy = theme && theme.fontSize;
    const density = legacy === "small" ? "compact" : legacy === "large" ? "relaxed" : "comfortable";
    const size = legacy === "small" ? "small" : legacy === "large" ? "large" : "medium";
    return {
      ...VG.TYPOGRAPHY_DEFAULTS,
      bodySize: size,
      headingSize: size,
      tableSize: size,
      formSize: size,
      buttonSize: size,
      labelSize: size,
      lineSpacing: density === "compact" ? "compact" : density === "relaxed" ? "relaxed" : "comfortable",
      density: density === "compact" ? "compact" : "comfortable",
    };
  }

  function normalizeTypography(raw, theme) {
    const base = defaultTypography(theme);
    const t = { ...base, ...(raw || {}) };
    if (!VG.FONT_PRESETS[t.fontFamily]) t.fontFamily = "inter";
    if (!VG.FONT_PRESETS[t.pdfFontFamily]) t.pdfFontFamily = t.fontFamily;
    ["bodySize", "headingSize", "tableSize", "formSize", "buttonSize", "labelSize"].forEach((k) => {
      if (!SIZE_SCALE[t[k]]) t[k] = "medium";
    });
    if (!t.bodySize) t.bodySize = t.headingSize || "medium";
    if (!t.buttonSize) t.buttonSize = t.formSize || "medium";
    if (!t.labelSize) t.labelSize = t.formSize || "medium";
    if (!LINE_SPACING[t.lineSpacing]) t.lineSpacing = "comfortable";
    if (!FONT_WEIGHT[t.fontWeight]) t.fontWeight = "medium";
    if (t.density !== "compact") t.density = "comfortable";
    Object.keys(COLOR_DEFAULTS).forEach((k) => {
      t[k] = normColor(t[k], COLOR_DEFAULTS[k]);
    });
    return t;
  }

  function getTypography() {
    const settings = typeof VG.store !== "undefined" && VG.store.settings ? VG.store.settings() : {};
    return normalizeTypography(settings.typography, settings.theme);
  }

  function presetFor(key) {
    return VG.FONT_PRESETS[key] || VG.FONT_PRESETS.inter;
  }

  function applyTypography(typography, theme) {
    if (typeof document === "undefined") return;
    const t = normalizeTypography(typography, theme);
    const preset = presetFor(t.fontFamily);
    const pdfPreset = presetFor(t.pdfFontFamily);
    const body = SIZE_SCALE[t.bodySize] || SIZE_SCALE.medium;
    const heading = SIZE_SCALE[t.headingSize] || SIZE_SCALE.medium;
    const table = SIZE_SCALE[t.tableSize] || SIZE_SCALE.medium;
    const form = SIZE_SCALE[t.formSize] || SIZE_SCALE.medium;
    const button = SIZE_SCALE[t.buttonSize] || SIZE_SCALE.medium;
    const label = SIZE_SCALE[t.labelSize] || SIZE_SCALE.medium;
    const lh = LINE_SPACING[t.lineSpacing] || 1.5;
    const fw = FONT_WEIGHT[t.fontWeight] || FONT_WEIGHT.medium;
    const root = document.documentElement;

    root.style.setProperty("--vg-font-family", preset.css);
    root.style.setProperty("--vg-font-pdf", pdfPreset.pdf);
    root.style.setProperty("--vg-fs-base", body.base + "px");
    root.style.setProperty("--vg-fs-heading", heading.heading + "px");
    root.style.setProperty("--vg-fs-subheading", heading.subheading + "px");
    root.style.setProperty("--vg-fs-table", table.table + "px");
    root.style.setProperty("--vg-fs-table-head", Math.max(10, table.table - 1) + "px");
    root.style.setProperty("--vg-fs-form", form.form + "px");
    root.style.setProperty("--vg-fs-button", button.button + "px");
    root.style.setProperty("--vg-fs-label", label.label + "px");
    root.style.setProperty("--vg-lh", String(lh));
    root.style.setProperty("--vg-lh-tight", String(Math.max(1.25, lh - 0.15)));
    root.style.setProperty("--vg-fw-normal", String(fw.normal));
    root.style.setProperty("--vg-fw-medium", String(fw.medium));
    root.style.setProperty("--vg-fw-semibold", String(fw.semibold));
    root.style.setProperty("--vg-fw-heading", String(fw.heading));
    root.style.setProperty("--vg-letter-spacing", t.density === "compact" ? "-0.01em" : "-0.015em");

    root.style.setProperty("--vg-text-light", t.lightTextColor);
    root.style.setProperty("--vg-text-dark", t.darkTextColor);
    root.style.setProperty("--vg-heading-light", t.lightHeadingColor);
    root.style.setProperty("--vg-heading-dark", t.darkHeadingColor);
    root.style.setProperty("--vg-muted-light", t.lightMutedColor);
    root.style.setProperty("--vg-muted-dark", t.darkMutedColor);
    root.style.setProperty("--vg-pdf-text", t.lightTextColor);
    root.style.setProperty("--vg-pdf-muted", t.lightMutedColor);

    root.classList.toggle("vg-typo-compact", t.density === "compact");
    root.classList.toggle("vg-typo-comfortable", t.density !== "compact");
    root.dataset.vgFont = t.fontFamily;
    root.dataset.vgPdfFont = t.pdfFontFamily;
  }

  function resolvePdfFontFamily(typography, templateFont) {
    const t = normalizeTypography(typography);
    if (templateFont && String(templateFont).trim() && !/inherit/i.test(templateFont)) {
      return templateFont;
    }
    return presetFor(t.pdfFontFamily).pdf;
  }

  function resolvePdfTextColors(typography, template) {
    const t = normalizeTypography(typography);
    const tpl = template || {};
    return {
      text: tpl.textColor && String(tpl.textColor).trim() && !/inherit/i.test(tpl.textColor) ? tpl.textColor : t.lightTextColor,
      muted: tpl.mutedColor && String(tpl.mutedColor).trim() && !/inherit/i.test(tpl.mutedColor) ? tpl.mutedColor : t.lightMutedColor,
    };
  }

  function printBaseCSS() {
    const t = getTypography();
    const pdfFont = presetFor(t.pdfFontFamily).pdf;
    const body = SIZE_SCALE[t.bodySize] || SIZE_SCALE.medium;
    const tablePt = (SIZE_SCALE[t.tableSize] || SIZE_SCALE.medium).table * 0.75;
    const formPt = (SIZE_SCALE[t.formSize] || SIZE_SCALE.medium).form * 0.75;
    const labelPt = (SIZE_SCALE[t.labelSize] || SIZE_SCALE.medium).label * 0.75;
    const lh = LINE_SPACING[t.lineSpacing] || 1.5;
    const colors = resolvePdfTextColors(t);
    return `
    *{box-sizing:border-box;font-family:${pdfFont};-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
    body{margin:0;color:${colors.text};font-size:${formPt}pt;line-height:${lh}}
    .vg-muted,.muted{color:${colors.muted}}
    .vg-mono,.vg-doc-no,table .sku,table .mono{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}
    table.vg-tbl{font-size:${tablePt}pt;line-height:${lh}}
    label,.vg-label{font-size:${labelPt}pt;color:${colors.muted}}
    `;
  }

  function fontOptions() {
    return Object.values(VG.FONT_PRESETS).map((p) => ({ value: p.id, label: p.label }));
  }

  function sizeOptions() {
    return ["small", "medium", "large"].map((x) => ({ value: x, label: x.charAt(0).toUpperCase() + x.slice(1) }));
  }

  VG.defaultTypography = defaultTypography;
  VG.normalizeTypography = normalizeTypography;
  VG.getTypography = getTypography;
  VG.applyTypography = applyTypography;
  VG.resolvePdfFontFamily = resolvePdfFontFamily;
  VG.resolvePdfTextColors = resolvePdfTextColors;
  VG.printBaseCSS = printBaseCSS;
  VG.typographyFontOptions = fontOptions;
  VG.typographySizeOptions = sizeOptions;
  VG.TYPOGRAPHY_COLOR_DEFAULTS = COLOR_DEFAULTS;
})(window.VG);
