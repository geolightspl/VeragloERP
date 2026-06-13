/* Veraglo ERP — Global date & time formatting */
(function (VG) {
  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function parseInput(value) {
    if (value == null || value === "") return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === "number") {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const s = String(value).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s.length === 10 ? s + "T12:00:00" : s);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function pad4(n) { return String(n).padStart(4, "0"); }

  const DATE_FORMAT_PRESETS = [
    { id: "DDMMYYYY", label: "DDMMYYYY", example: "10062026", fmt: (d) => pad2(d.getDate()) + pad2(d.getMonth() + 1) + pad4(d.getFullYear()) },
    { id: "DDMMYY", label: "DDMMYY", example: "100626", fmt: (d) => pad2(d.getDate()) + pad2(d.getMonth() + 1) + String(d.getFullYear()).slice(-2) },
    { id: "MMDDYYYY", label: "MMDDYYYY", example: "06102026", fmt: (d) => pad2(d.getMonth() + 1) + pad2(d.getDate()) + pad4(d.getFullYear()) },
    { id: "YYYYMMDD", label: "YYYYMMDD", example: "20260610", fmt: (d) => pad4(d.getFullYear()) + pad2(d.getMonth() + 1) + pad2(d.getDate()) },
    { id: "DD_MMM_YYYY", label: "DD-MMM-YYYY", example: "10-Jun-2026", fmt: (d) => pad2(d.getDate()) + "-" + MONTHS_SHORT[d.getMonth()] + "-" + d.getFullYear() },
    { id: "DD_MM_YYYY", label: "DD/MM/YYYY", example: "10/06/2026", fmt: (d) => pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear() },
    { id: "MM_DD_YYYY", label: "MM/DD/YYYY", example: "06/10/2026", fmt: (d) => pad2(d.getMonth() + 1) + "/" + pad2(d.getDate()) + "/" + d.getFullYear() },
    { id: "YYYY_MM_DD", label: "YYYY-MM-DD", example: "2026-06-10", fmt: (d) => pad4(d.getFullYear()) + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) },
    { id: "DD_MONTH_YYYY", label: "DD Month YYYY", example: "10 June 2026", fmt: (d) => d.getDate() + " " + MONTHS_LONG[d.getMonth()] + " " + d.getFullYear() },
    { id: "DD_MMM_YYYY_SPACE", label: "10 Jun 2026", example: "10 Jun 2026", fmt: (d) => d.getDate() + " " + MONTHS_SHORT[d.getMonth()] + " " + d.getFullYear() },
    { id: "DD_MM_YYYY_DASH", label: "10-06-2026", example: "10-06-2026", fmt: (d) => pad2(d.getDate()) + "-" + pad2(d.getMonth() + 1) + "-" + d.getFullYear() },
    { id: "COMPACT", label: "20260610", example: "20260610", fmt: (d) => pad4(d.getFullYear()) + pad2(d.getMonth() + 1) + pad2(d.getDate()) },
  ];

  const PRESET_BY_ID = DATE_FORMAT_PRESETS.reduce((m, p) => { m[p.id] = p; return m; }, {});

  function settings() {
    try {
      return (VG.store && VG.store.settings && VG.store.settings().dateFormat) || null;
    } catch (e) { return null; }
  }

  function formatDate(value, opts) {
    const d = parseInput(value);
    if (!d) return "—";
    const cfg = { ...(settings() || {}), ...(opts || {}) };
    const preset = PRESET_BY_ID[cfg.formatId] || PRESET_BY_ID.DD_MMM_YYYY_SPACE;
    let out = preset.fmt(d);
    if (cfg.includeWeekday) {
      const wd = d.toLocaleDateString(cfg.locale || "en-IN", { weekday: "short" });
      out = wd + ", " + out;
    }
    return out;
  }

  function formatTime(value, opts) {
    const d = parseInput(value);
    if (!d) return "—";
    const cfg = { ...(settings() || {}), ...(opts || {}) };
    const hour12 = cfg.timeFormat !== "24";
    return d.toLocaleTimeString(cfg.locale || "en-IN", { hour: "2-digit", minute: "2-digit", hour12 });
  }

  function formatDateTime(value, opts) {
    const d = parseInput(value);
    if (!d) return "—";
    return formatDate(d, opts) + " " + formatTime(d, opts);
  }

  function previewDate(formatId, refDate) {
    const d = parseInput(refDate) || new Date();
    return formatDate(d, { formatId });
  }

  function defaultDateFormatSettings() {
    return { formatId: "DD_MMM_YYYY_SPACE", locale: "en-IN", timeFormat: "12", includeWeekday: false };
  }

  VG.DATE_FORMAT_PRESETS = DATE_FORMAT_PRESETS;
  VG.defaultDateFormatSettings = defaultDateFormatSettings;
  VG.dateFormat = { formatDate, formatTime, formatDateTime, previewDate, parseInput, defaultDateFormatSettings };

  if (VG.fmt) {
    VG.fmt.formatDate = formatDate;
    VG.fmt.formatTime = formatTime;
    VG.fmt.formatDateTime = formatDateTime;
  }
})(window.VG);
