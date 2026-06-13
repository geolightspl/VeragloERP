/* Veraglo ERP — Global SKU / Item Code auto-generation engine */
(function (VG) {
  const { useState, useEffect } = React;
  const store = VG.store;

  const DEFAULT_CATEGORY_PREFIXES = {
    RWM: "RWM", FNG: "FGD", SFG: "SFG", CON: "CON", PKG: "PKM", SPR: "SPR", WIP: "WIP", OTH: "OTH",
  };

  function defaultSkuSettings() {
    return {
      enabled: true,
      companyPrefix: "GLS",
      separator: "",
      numberLength: 7,
      startNumber: 1,
      resetRule: "never",
      includeBranchCode: false,
      branchCode: "",
      includeCategoryCode: true,
      categoryPrefixes: { ...DEFAULT_CATEGORY_PREFIXES },
      manualOverrideAllowed: false,
      duplicateCheck: true,
      seriesCounters: {},
      auditLog: [],
    };
  }

  let _persisting = false;

  function readSavedSettings() {
    try {
      const db = store.db && store.db();
      if (db && db.settings && db.settings.skuNumbering) return db.settings.skuNumbering;
      if (store.settings) return (store.settings().skuNumbering) || {};
    } catch (e) { /* noop */ }
    return {};
  }

  function getSettings() {
    const base = defaultSkuSettings();
    const saved = readSavedSettings();
    return { ...base, ...saved, categoryPrefixes: { ...base.categoryPrefixes, ...(saved.categoryPrefixes || {}) } };
  }

  function writeSettings(patch, actor, opts) {
    if (_persisting) return getSettings();
    _persisting = true;
    try {
      const current = getSettings();
      const next = {
        ...current,
        ...patch,
        categoryPrefixes: { ...current.categoryPrefixes, ...(patch.categoryPrefixes || {}) },
      };
      const db = store.db && store.db();
      if (db) {
        db.settings = { ...(db.settings || {}), skuNumbering: next };
      }
      if (opts && opts.fullSave && store.saveAdminSettings) {
        store.saveAdminSettings({ skuNumbering: next }, actor || "admin");
      }
      return next;
    } finally {
      _persisting = false;
    }
  }

  function saveSettings(patch, actor) {
    return writeSettings(patch, actor, { fullSave: true });
  }

  function typeCodeForCategory(categoryId) {
    const cat = categoryId ? store.get("categories", categoryId) : null;
    return (cat && cat.typeCode) || "RWM";
  }

  function categoryPrefix(typeCode) {
    const cfg = getSettings();
    const tc = String(typeCode || "RWM").toUpperCase();
    return (cfg.categoryPrefixes && cfg.categoryPrefixes[tc]) || tc;
  }

  function seriesKey(typeCode) {
    const cfg = getSettings();
    const tc = categoryPrefix(typeCode);
    let key = String(cfg.companyPrefix || "GLS").toUpperCase();
    if (cfg.includeBranchCode && cfg.branchCode) key += String(cfg.branchCode).toUpperCase();
    key += tc;
    if (cfg.resetRule === "yearly" || cfg.includeYear) key += String(new Date().getFullYear());
    return key;
  }

  function buildStem(typeCode) {
    const cfg = getSettings();
    const parts = [String(cfg.companyPrefix || "GLS").toUpperCase()];
    if (cfg.includeBranchCode && cfg.branchCode) parts.push(String(cfg.branchCode).toUpperCase());
    if (cfg.includeCategoryCode !== false) parts.push(categoryPrefix(typeCode));
    if (cfg.resetRule === "yearly" || cfg.includeYear) parts.push(String(new Date().getFullYear()));
    return parts.join(cfg.separator || "");
  }

  function maxFromItems(stem) {
    const len = getSettings().numberLength || 7;
    let max = (getSettings().startNumber || 1) - 1;
    (store.list("items") || []).forEach((it) => {
      if (!it.sku) return;
      const u = String(it.sku).toUpperCase();
      if (!u.startsWith(stem.toUpperCase())) return;
      const tail = u.slice(stem.length);
      const m = tail.match(new RegExp("^(\\d{1," + len + "})$"));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return max;
  }

  function nextNumber(typeCode) {
    const cfg = getSettings();
    const stem = buildStem(typeCode);
    const key = seriesKey(typeCode);
    const fromItems = maxFromItems(stem);
    const fromCounter = Number((cfg.seriesCounters || {})[key]) || 0;
    const next = Math.max(fromItems, fromCounter, (cfg.startNumber || 1) - 1) + 1;
    return { stem, key, next, length: cfg.numberLength || 7 };
  }

  function formatSku(typeCode) {
    const { stem, next, length } = nextNumber(typeCode);
    return stem + String(next).padStart(length, "0");
  }

  function preview(typeCodeOrCategoryId, isCategoryId) {
    const tc = isCategoryId ? typeCodeForCategory(typeCodeOrCategoryId) : (typeCodeOrCategoryId || "RWM");
    return formatSku(tc);
  }

  function isDuplicate(sku, excludeItemId) {
    if (!sku || !getSettings().duplicateCheck) return false;
    const u = String(sku).trim().toUpperCase();
    return (store.list("items") || []).some((it) => {
      if (excludeItemId && it.id === excludeItemId) return false;
      return String(it.sku || "").trim().toUpperCase() === u;
    });
  }

  function canManualOverride(actor) {
    if (!store.isSuperAdmin || !store.isSuperAdmin(actor)) return false;
    return !!getSettings().manualOverrideAllowed;
  }

  function appendAudit(entry, countersPatch) {
    const cfg = getSettings();
    const log = (cfg.auditLog || []).concat({
      id: "sku" + Math.random().toString(36).slice(2, 10),
      ts: Date.now(),
      ...entry,
    }).slice(-500);
    const counters = { ...(cfg.seriesCounters || {}), ...(countersPatch || {}) };
    writeSettings({ auditLog: log, seriesCounters: counters }, entry.by || "system", { fullSave: false });
  }

  function generate(opts) {
    const o = opts || {};
    const cfg = getSettings();
    if (!cfg.enabled) return o.fallback || "";
    const typeCode = o.typeCode || typeCodeForCategory(o.categoryId);
    const { stem, key, next, length } = nextNumber(typeCode);
    let n = next;
    let sku = stem + String(n).padStart(length, "0");
    while (isDuplicate(sku, o.excludeItemId) && n < next + 10000) {
      n += 1;
      sku = stem + String(n).padStart(length, "0");
    }
    appendAudit({
      action: o.manualOverride ? "manual_override" : "generated",
      sku,
      by: o.actor || "system",
      module: o.module || "Item Master",
      categoryId: o.categoryId || "",
      typeCode,
      oldCode: o.oldCode || "",
      manualOverride: !!o.manualOverride,
      approvedBy: o.approvedBy || "",
    }, { [key]: n });
    return sku;
  }

  function prepareCreate(item, actor, meta) {
    const cfg = getSettings();
    const m = meta || {};
    let data = { ...item };
    const manual = String(data.sku || "").trim();
    const allowManual = canManualOverride(actor);

    if (manual && allowManual) {
      if (isDuplicate(manual)) return { ok: false, message: "SKU " + manual + " already exists in item master" };
      data.sku = manual;
      data.skuManualOverride = true;
      data.skuGeneratedBy = actor;
      data.skuGeneratedAt = Date.now();
      data.skuGeneratedModule = m.module || "Manual override";
      appendAudit({ action: "manual_override", sku: manual, by: actor, module: m.module, manualOverride: true, approvedBy: actor });
      return { ok: true, item: data };
    }

    if (manual && !allowManual) data.sku = "";

    if (!data.sku) {
      if (!cfg.enabled) return { ok: false, message: "SKU auto-generation is disabled in Admin settings" };
      if (!data.categoryId && !m.typeCode) return { ok: false, message: "Select category to auto-generate SKU" };
      data.sku = generate({ categoryId: data.categoryId, typeCode: m.typeCode, actor, module: m.module || "Item Master" });
      data.skuGeneratedBy = actor;
      data.skuGeneratedAt = Date.now();
      data.skuGeneratedModule = m.module || "Item Master";
      data.skuManualOverride = false;
    }

    if (!data.sku) return { ok: false, message: "SKU could not be generated" };
    if (isDuplicate(data.sku)) return { ok: false, message: "Duplicate SKU " + data.sku };

    return { ok: true, item: data };
  }

  function prepareUpdate(prev, patch, actor) {
    const out = { ...patch };
    if (patch.sku != null && String(patch.sku) !== String(prev.sku)) {
      if (!canManualOverride(actor)) {
        delete out.sku;
      } else if (isDuplicate(patch.sku, prev.id)) {
        return { ok: false, message: "SKU " + patch.sku + " already exists" };
      } else {
        appendAudit({ action: "revised", sku: patch.sku, oldCode: prev.sku, by: actor, module: "Item Master", manualOverride: true });
      }
    }
    return { ok: true, patch: out };
  }

  function importItemRow(row, actor, opts) {
    const o = opts || { seenSkus: new Set(), allowUpdate: true };
    const sku = String(row.sku || "").trim();
    const existing = (row.id && store.get("items", row.id))
      || (sku ? (store.list("items") || []).find((x) => String(x.sku).toUpperCase() === sku.toUpperCase()) : null);

    if (o.seenSkus && sku) {
      const k = sku.toUpperCase();
      if (o.seenSkus.has(k)) return { ok: false, error: "Duplicate SKU in import file: " + sku };
      o.seenSkus.add(k);
    }

    if (existing && !o.allowUpdate) return { ok: false, error: "SKU exists (update not allowed): " + (sku || existing.sku) };

    if (existing) {
      const upd = store.update("items", existing.id, row, actor);
      if (!upd) return { ok: false, error: "Update failed for " + (sku || existing.sku) };
      return { ok: true, action: "updated", sku: upd.sku };
    }

    if (sku && !canManualOverride(actor)) {
      return { ok: false, error: "Manual SKU not allowed in import: " + sku + " — leave blank to auto-generate" };
    }

    const rec = store.create("items", { ...row, _skuModule: "Import" }, actor);
    if (!rec) return { ok: false, error: "Could not create item" + (sku ? " (" + sku + ")" : "") };
    return { ok: true, action: "created", sku: rec.sku };
  }

  function lastGeneratedTable() {
    const cfg = getSettings();
    return (VG.CATEGORY_TYPE_CODES || []).map((t) => {
      const stem = buildStem(t.code);
      const key = seriesKey(t.code);
      return {
        typeCode: t.code,
        label: t.label,
        prefix: categoryPrefix(t.code),
        stem,
        lastNumber: (cfg.seriesCounters && cfg.seriesCounters[key]) || maxFromItems(stem),
        nextPreview: preview(t.code),
      };
    });
  }

  function SkuNumberingPage({ roleKey, can }) {
    VG.useDB();
    const [cfg, setCfg] = useState(() => getSettings());
    const [dirty, setDirty] = useState(false);
    const set = (k, v) => { setDirty(true); setCfg((p) => ({ ...p, [k]: v })); };
    const setPrefix = (code, v) => {
      setDirty(true);
      setCfg((p) => ({ ...p, categoryPrefixes: { ...p.categoryPrefixes, [code]: v } }));
    };

    useEffect(() => {
      setCfg(getSettings());
      setDirty(false);
    }, []);

    function save() {
      saveSettings(cfg, roleKey);
      setDirty(false);
      VG.toast("SKU numbering settings saved");
    }

    const previews = lastGeneratedTable();

    return (
      <div className="space-y-4">
        <VG.fx.PageHead title="SKU Numbering Settings" desc="Central control for auto-generated item codes across all ERP modules" />
        <div className="grid lg:grid-cols-2 gap-4">
          <VG.ui.Card className="p-4 border border-white/20 space-y-3">
            <h3 className="text-sm font-semibold">General</h3>
            <VG.fx.Field label="Enable auto SKU generation">
              <VG.fx.Checkbox checked={!!cfg.enabled} onChange={(v) => set("enabled", v)} label="Auto-generate SKU / item code everywhere" />
            </VG.fx.Field>
            <VG.fx.Field label="Company prefix"><VG.fx.Text value={cfg.companyPrefix} onChange={(v) => set("companyPrefix", String(v).toUpperCase())} /></VG.fx.Field>
            <VG.fx.Field label="Separator (optional)"><VG.fx.Text value={cfg.separator} onChange={(v) => set("separator", v)} placeholder="Leave blank for none" /></VG.fx.Field>
            <div className="grid grid-cols-2 gap-3">
              <VG.fx.Field label="Number length"><VG.fx.Num value={cfg.numberLength} onChange={(v) => set("numberLength", v)} /></VG.fx.Field>
              <VG.fx.Field label="Starting number"><VG.fx.Num value={cfg.startNumber} onChange={(v) => set("startNumber", v)} /></VG.fx.Field>
            </div>
            <VG.fx.Field label="Reset rule">
              <VG.fx.Select value={cfg.resetRule} onChange={(v) => set("resetRule", v)} options={[
                { value: "never", label: "Never reset" },
                { value: "yearly", label: "Yearly reset" },
                { value: "category", label: "Per category series" },
              ]} />
            </VG.fx.Field>
            <VG.fx.Checkbox checked={!!cfg.includeBranchCode} onChange={(v) => set("includeBranchCode", v)} label="Include branch / location code in SKU" />
            {cfg.includeBranchCode && <VG.fx.Field label="Branch code"><VG.fx.Text value={cfg.branchCode} onChange={(v) => set("branchCode", String(v).toUpperCase())} /></VG.fx.Field>}
            <VG.fx.Checkbox checked={!!cfg.duplicateCheck} onChange={(v) => set("duplicateCheck", v)} label="Enforce duplicate SKU check on save" />
            <VG.fx.Checkbox checked={!!cfg.manualOverrideAllowed} onChange={(v) => set("manualOverrideAllowed", v)} label="Allow manual SKU entry (Super Admin only)" />
          </VG.ui.Card>

          <VG.ui.Card className="p-4 border border-white/20">
            <h3 className="text-sm font-semibold mb-3">Category prefix mapping</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto text-xs">
              {(VG.CATEGORY_TYPE_CODES || []).map((t) => (
                <div key={t.code} className="grid grid-cols-3 gap-2 items-center">
                  <span className="font-mono opacity-70">{t.code}</span>
                  <span className="opacity-55 truncate">{t.label}</span>
                  <VG.fx.Text value={(cfg.categoryPrefixes || {})[t.code] || t.code} onChange={(v) => setPrefix(t.code, String(v).toUpperCase())} />
                </div>
              ))}
            </div>
          </VG.ui.Card>
        </div>

        <VG.ui.Card className="p-4 border border-white/20 overflow-x-auto">
          <h3 className="text-sm font-semibold mb-3">SKU preview & last generated number</h3>
          <table className="w-full text-xs">
            <thead className="opacity-55 text-[10px] uppercase border-b border-white/15">
              <tr><th className="text-left py-2">Type</th><th className="text-left py-2">Prefix</th><th className="text-left py-2">Series stem</th><th className="text-right py-2">Last #</th><th className="text-left py-2">Next SKU preview</th></tr>
            </thead>
            <tbody>
              {previews.map((p) => (
                <tr key={p.typeCode} className="border-b border-white/10">
                  <td className="py-2">{p.typeCode} — {p.label}</td>
                  <td className="py-2 font-mono">{p.prefix}</td>
                  <td className="py-2 font-mono opacity-70">{p.stem}</td>
                  <td className="py-2 text-right">{p.lastNumber}</td>
                  <td className="py-2 font-mono text-emerald-300/90">{p.nextPreview}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </VG.ui.Card>

        <VG.ui.Card className="p-4 border border-white/20">
          <h3 className="text-sm font-semibold mb-2">SKU generation audit (recent)</h3>
          <ul className="text-xs space-y-1 max-h-40 overflow-y-auto opacity-80">
            {(cfg.auditLog || []).slice().reverse().slice(0, 30).map((a) => (
              <li key={a.id || a.ts} className="flex flex-wrap gap-2 border-b border-white/5 py-1">
                <span className="opacity-50">{new Date(a.ts).toLocaleString()}</span>
                <span className="font-mono">{a.sku}</span>
                <span>{a.action}</span>
                <span className="opacity-50">{a.module} · {a.by}</span>
                {a.oldCode && <span className="opacity-50">was {a.oldCode}</span>}
              </li>
            ))}
            {!(cfg.auditLog || []).length && <li className="opacity-50">No SKU audit entries yet</li>}
          </ul>
        </VG.ui.Card>

        <div className="flex gap-2">
          {can("edit") && <VG.ui.Button icon="check" onClick={save}>Save SKU settings</VG.ui.Button>}
          {can("edit") && (
            <VG.ui.Button variant="soft" onClick={async () => {
              if (await VG.confirm({ title: "Reset series counters?", message: "Last-generated counters will be cleared. Existing item SKUs are not affected.", confirmLabel: "Reset" })) {
                saveSettings({ seriesCounters: {} }, roleKey);
                setCfg(getSettings());
                VG.toast("Series counters reset");
              }
            }}>Reset series counters</VG.ui.Button>
          )}
        </div>
      </div>
    );
  }

  VG.skuEngine = {
    defaultSkuSettings,
    getSettings,
    saveSettings,
    settings: getSettings,
    preview,
    generate,
    formatSku,
    buildStem,
    categoryPrefix,
    typeCodeForCategory,
    isDuplicate,
    canManualOverride,
    prepareCreate,
    prepareUpdate,
    importItemRow,
    lastGeneratedTable,
  };
  VG.SkuNumberingPage = SkuNumberingPage;
})(window.VG = window.VG || {});
