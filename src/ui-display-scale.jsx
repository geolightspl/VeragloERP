/* Veraglo ERP — global interface size / UI scale control */
(function (VG) {
  const { useState, useEffect } = React;

  const PRESETS = {
    compact: 80,
    standard: 100,
    comfortable: 110,
    large: 120,
  };

  const SLIDER_MIN = 80;
  const SLIDER_MAX = 130;
  const SLIDER_STEP = 5;

  function defaultUiDisplay() {
    return {
      interfaceSizePercent: 100,
      interfaceSizePreset: "standard",
      allowUserOverride: true,
    };
  }

  function presetFromPercent(pct) {
    const n = Number(pct) || 100;
    if (n <= 85) return "compact";
    if (n <= 105) return "standard";
    if (n <= 115) return "comfortable";
    return "large";
  }

  function normalizeUiDisplay(raw) {
    const d = { ...defaultUiDisplay(), ...(raw || {}) };
    let pct = Number(d.interfaceSizePercent);
    if (!Number.isFinite(pct) && d.interfaceSizePreset && PRESETS[d.interfaceSizePreset]) {
      pct = PRESETS[d.interfaceSizePreset];
    }
    if (!Number.isFinite(pct)) pct = 100;
    pct = Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, Math.round(pct / SLIDER_STEP) * SLIDER_STEP));
    d.interfaceSizePercent = pct;
    d.interfaceSizePreset = presetFromPercent(pct);
    d.allowUserOverride = d.allowUserOverride !== false;
    return d;
  }

  function scaleFactor(uiDisplay) {
    return normalizeUiDisplay(uiDisplay).interfaceSizePercent / 100;
  }

  function applyInterfaceScale(uiDisplay) {
    if (typeof document === "undefined") return null;
    const d = normalizeUiDisplay(uiDisplay);
    const s = d.interfaceSizePercent / 100;
    const root = document.documentElement;
    root.style.setProperty("--vg-ui-scale", String(s));
    root.style.setProperty("--vg-field-py", (0.5 * s).toFixed(3) + "rem");
    root.style.setProperty("--vg-field-px", (0.75 * s).toFixed(3) + "rem");
    root.style.setProperty("--vg-btn-py", (0.625 * s).toFixed(3) + "rem");
    root.style.setProperty("--vg-btn-px", (1 * s).toFixed(3) + "rem");
    root.style.setProperty("--vg-table-cell-py", (0.55 * s).toFixed(3) + "rem");
    root.style.setProperty("--vg-table-cell-px", (0.75 * s).toFixed(3) + "rem");
    root.style.setProperty("--vg-kpi-min-h", (92 * s).toFixed(1) + "px");
    root.style.setProperty("--vg-icon-base", (16 * s).toFixed(1) + "px");
    root.style.setProperty("--vg-icon-lg", (18 * s).toFixed(1) + "px");
    root.style.setProperty("--vg-form-gap", (0.85 * s).toFixed(3) + "rem");
    root.style.setProperty("--vg-card-gap", (0.85 * s).toFixed(3) + "rem");
    root.style.setProperty("--vg-sidebar-fs", (14 * s).toFixed(2) + "px");
    root.style.setProperty("--vg-sidebar-fs-sm", (10 * s).toFixed(2) + "px");
    root.style.setProperty("--vg-quick-action-py", (0.6 * s).toFixed(3) + "rem");
    root.style.setProperty("--vg-quick-action-px", (0.95 * s).toFixed(3) + "rem");
    root.dataset.vgUiScale = String(d.interfaceSizePercent);
    return d;
  }

  function InterfaceSizePreview() {
    return (
      <div className="rounded-xl border border-[var(--vg-border)] overflow-hidden" style={{ background: "var(--vg-card-bg)" }}>
        <div className="px-3 py-2 text-[11px] uppercase opacity-55 border-b border-[var(--vg-border)]">Live preview</div>
        <div className="p-4 space-y-4" style={{ gap: "var(--vg-form-gap)" }}>
          <div className="grid sm:grid-cols-2 gap-3" style={{ gap: "var(--vg-form-gap)" }}>
            <div>
              <label className="vg-label block mb-1">Sample field</label>
              <input className="vg-input w-full rounded-lg" readOnly value="Customer name" />
            </div>
            <div>
              <label className="vg-label block mb-1">Dropdown</label>
              <select className="vg-input w-full rounded-lg"><option>Option A</option></select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" className="vg-btn-premium vg-btn-solid inline-flex items-center gap-2 rounded-xl font-semibold">Primary button</button>
            <button type="button" className="vg-btn-premium vg-btn-soft inline-flex items-center gap-2 rounded-xl font-semibold">Secondary</button>
          </div>
          <div className="vg-kpi-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--vg-card-gap)" }}>
            <div className="vg-panel vg-kpi-card vg-kpi-card-compact p-3">
              <div className="text-xl font-display font-bold tabular-nums">128</div>
              <div className="text-xs opacity-70 mt-2">Sample KPI</div>
            </div>
            <div className="vg-quick-action-card is-primary" style={{ "--accent": "var(--accent)" }}>
              <span className="vg-quick-action-icon" style={{ background: "var(--accent)" }}><VG.ui.Icon name="plus" size={18} /></span>
              <span className="vg-quick-action-label">Quick action</span>
            </div>
          </div>
          <table className="w-full text-left vg-data-table">
            <thead><tr><th>Item</th><th>Qty</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              <tr className="border-t border-[var(--vg-border)]"><td className="px-3">Steel rod 12mm</td><td className="px-3">24</td><td className="px-3 text-right font-mono">₹ 18,400</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function InterfaceSizeControls({ value, onChange, showAllowOverride, compact }) {
    const ui = normalizeUiDisplay(value || {});
    const setPct = (pct) => {
      const next = normalizeUiDisplay({ ...ui, interfaceSizePercent: pct, interfaceSizePreset: presetFromPercent(pct) });
      onChange && onChange(next);
    };
    const setPreset = (key) => {
      onChange && onChange(normalizeUiDisplay({ ...ui, interfaceSizePreset: key, interfaceSizePercent: PRESETS[key] }));
    };

    useEffect(() => {
      if (VG.applyInterfaceScale) VG.applyInterfaceScale(ui);
    }, [ui.interfaceSizePercent, ui.allowUserOverride]);

    return (
      <div className={"space-y-4 " + (compact ? "" : "")}>
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="text-sm font-semibold">Interface Size</label>
            <span className="text-sm font-display font-bold tabular-nums" style={{ color: "var(--accent)" }}>{ui.interfaceSizePercent}%</span>
          </div>
          <input
            type="range"
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            step={SLIDER_STEP}
            value={ui.interfaceSizePercent}
            onChange={(e) => setPct(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <div className="flex justify-between text-[10px] opacity-50 mt-1 px-0.5">
            <span>80%</span><span>100%</span><span>130%</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.keys(PRESETS).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPreset(key)}
              className={"rounded-lg px-3 py-1.5 text-xs font-semibold border transition " + (ui.interfaceSizePreset === key ? "text-white border-transparent" : "border-[var(--vg-border)] opacity-80 hover:opacity-100")}
              style={ui.interfaceSizePreset === key ? { background: "var(--accent)" } : undefined}
            >
              {key.charAt(0).toUpperCase() + key.slice(1)} ({PRESETS[key]}%)
            </button>
          ))}
        </div>
        {showAllowOverride && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={ui.allowUserOverride !== false}
              onChange={(e) => onChange && onChange({ ...ui, allowUserOverride: e.target.checked })}
            />
            Allow users to set their own display size
          </label>
        )}
      </div>
    );
  }

  VG.UI_SCALE_PRESETS = PRESETS;
  VG.UI_SCALE_MIN = SLIDER_MIN;
  VG.UI_SCALE_MAX = SLIDER_MAX;
  VG.defaultUiDisplay = defaultUiDisplay;
  VG.normalizeUiDisplay = normalizeUiDisplay;
  VG.presetFromPercent = presetFromPercent;
  VG.scaleFactor = scaleFactor;
  VG.applyInterfaceScale = applyInterfaceScale;
  VG.InterfaceSizeControls = InterfaceSizeControls;
  VG.InterfaceSizePreview = InterfaceSizePreview;
})(window.VG);
