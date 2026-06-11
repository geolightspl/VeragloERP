/* Veraglo ERP — shared form & data UI: modals, toasts, confirm dialogs,
   master-data dropdowns (with inline create), validated fields, the record
   table (search / filter / export / print), and printable documents. VG.fx */
(function (VG) {
  const { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } = React;
  const { Icon, Button, Pill, Card } = VG.ui;
  const store = VG.store;

  /* ============ Toasts ============ */
  const toastBus = { items: [], subs: new Set() };
  function emitToasts() { toastBus.subs.forEach((f) => f()); }
  VG.toast = function (message, type = "success") {
    const id = "t" + Math.random().toString(36).slice(2);
    toastBus.items = toastBus.items.concat({ id, message, type });
    emitToasts();
    setTimeout(() => { toastBus.items = toastBus.items.filter((t) => t.id !== id); emitToasts(); }, 3200);
  };
  function Toaster() {
    const [, set] = useState(0);
    useEffect(() => { const f = () => set((v) => v + 1); toastBus.subs.add(f); return () => toastBus.subs.delete(f); }, []);
    const color = { success: "#34d399", error: "#f87171", info: "#60a5fa", warn: "#f59e0b" };
    return (
      <div className="fixed bottom-5 right-5 z-[100] space-y-2 w-[min(92vw,360px)]">
        {toastBus.items.map((t) => (
          <div key={t.id} className="vg-toast-item glass-dark rounded-xl shadow-glass p-3 flex items-start gap-2.5 animate-fade-up">
            <Icon name={t.type === "error" ? "alert" : t.type === "warn" ? "alert" : "check"} size={16} style={{ color: color[t.type] }} />
            <div className="flex-1">{t.message}</div>
          </div>
        ))}
      </div>
    );
  }

  /* ============ Confirm ============ */
  let confirmState = null;
  const confirmSubs = new Set();
  VG.confirm = function (opts) {
    return new Promise((resolve) => {
      confirmState = { title: "Are you sure?", message: "", confirmLabel: "Confirm", cancelLabel: "Cancel", danger: false, ...opts, resolve };
      confirmSubs.forEach((f) => f());
    });
  };
  function Confirmer() {
    const [, set] = useState(0);
    useEffect(() => { const f = () => set((v) => v + 1); confirmSubs.add(f); return () => confirmSubs.delete(f); }, []);
    if (!confirmState) return null;
    const s = confirmState;
    const done = (val) => { const r = s.resolve; confirmState = null; set((v) => v + 1); r(val); };
    return (
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[120] w-[min(92vw,420px)] animate-fade-up" role="dialog" aria-live="polite">
        <div className={"vg-confirm-panel glass-dark rounded-xl shadow-glass border p-4 " + (s.danger ? "border-rose-500/35" : "border-white/10")}>
          <div className="flex items-start gap-3">
            <span className="grid place-items-center w-8 h-8 rounded-lg shrink-0" style={{ background: s.danger ? "rgba(239,68,68,.2)" : "var(--accent-soft)" }}>
              <Icon name={s.danger ? "alert" : "shield"} size={16} style={{ color: s.danger ? "#f87171" : "var(--accent)" }} />
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold font-display">{s.title}</h3>
              {s.message && <p className="mt-1 leading-relaxed">{s.message}</p>}
              <div className="flex justify-end gap-2 mt-3">
                <Button variant="soft" className="!py-1.5" onClick={() => done(false)}>{s.cancelLabel || "Cancel"}</Button>
                <button type="button" onClick={() => done(true)} className="inline-flex items-center gap-2 rounded-xl font-medium px-3 py-1.5 text-white" style={{ background: s.danger ? "#ef4444" : "var(--accent)", fontSize: "var(--vg-fs-button)" }}>{s.confirmLabel}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ============ Success / info banner (non-modal) ============ */
  let bannerState = null;
  const bannerSubs = new Set();
  VG.showBanner = function (opts) {
    return new Promise((resolve) => {
      bannerState = {
        type: opts.type || "success",
        title: opts.title || "",
        message: opts.message || "",
        duration: opts.duration != null ? opts.duration : 5000,
        resolve,
      };
      bannerSubs.forEach((f) => { try { f(); } catch (e) {} });
      if (opts.toast !== false && opts.message) VG.toast(opts.message, opts.type === "error" ? "error" : opts.type === "warn" ? "warn" : "success");
      if (bannerState.duration > 0) {
        setTimeout(() => {
          if (bannerState && bannerState.resolve === resolve) {
            const r = bannerState.resolve;
            bannerState = null;
            bannerSubs.forEach((f) => { try { f(); } catch (e) {} });
            r(true);
          }
        }, bannerState.duration);
      }
    });
  };
  function BannerHost() {
    const [, setTick] = useState(0);
    useEffect(() => {
      const bump = () => setTick((t) => t + 1);
      bannerSubs.add(bump);
      return () => bannerSubs.delete(bump);
    }, []);
    if (!bannerState) return null;
    const s = bannerState;
    const dismiss = () => {
      const r = s.resolve;
      bannerState = null;
      setTick((t) => t + 1);
      if (r) r(true);
    };
    const colors = { success: "border-emerald-500/35", error: "border-rose-500/35", warn: "border-amber-500/35", info: "border-indigo-500/25" };
    const iconColor = { success: "#34d399", error: "#f87171", warn: "#f59e0b", info: "#60a5fa" };
    return (
      <div className={"fixed top-5 right-5 z-[118] w-[min(92vw,380px)] animate-fade-up glass-dark rounded-xl shadow-glass border p-3 " + (colors[s.type] || colors.info)}>
        <div className="flex items-start gap-2.5">
          <Icon name={s.type === "success" ? "check" : s.type === "error" ? "alert" : "info"} size={16} style={{ color: iconColor[s.type] || iconColor.info }} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-sm">
            {s.title && <div className="font-semibold text-xs">{s.title}</div>}
            {s.message && <div className={"text-xs opacity-85 " + (s.title ? "mt-0.5" : "")}>{s.message}</div>}
          </div>
          <button type="button" onClick={dismiss} className="p-1 rounded-lg opacity-70 hover:opacity-100 shrink-0" title="Dismiss"><Icon name="x" size={14} /></button>
        </div>
      </div>
    );
  }

  /* Full-page workspace UI — Modal is an alias for inline InternalScreen (no portal overlay). */
  VG._uiLayout = "premium-full-page";

  /* ============ Modal (legacy name — inline full-width InternalScreen in main workspace) ============ */
  function Modal({ open, onClose, title, subtitle, children, footer, dirty = false, breadcrumbs, backLabel, actions, className = "" }) {
    if (!open) return null;
    const Screen = VG.InternalScreen;
    if (Screen) {
      return (
        <Screen
          onBack={onClose}
          backLabel={backLabel || "Back"}
          title={title}
          subtitle={subtitle}
          footer={footer}
          actions={actions}
          dirty={dirty}
          breadcrumbs={breadcrumbs}
          className={"w-full min-h-0 " + className}
          bodyClassName="w-full min-w-0"
        >
          {children}
        </Screen>
      );
    }
    return (
      <div className="vg-internal-screen w-full min-h-0">
        <div className="flex items-center gap-3 mb-4 border-b border-white/10 pb-3">
          <div className="flex-1 min-w-0"><h2 className="text-lg font-semibold">{title}</h2>{subtitle && <p className="text-xs opacity-60">{subtitle}</p>}</div>
          <div className="flex gap-2 shrink-0">{actions}<Button variant="soft" icon="chevronLeft" onClick={onClose}>{backLabel || "Back"}</Button></div>
        </div>
        <div className="w-full">{children}</div>
        {footer && <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-white/10">{footer}</div>}
      </div>
    );
  }

  /* ============ Fields ============ */
  function Field({ label, required, error, children, hint, className = "" }) {
    return (
      <label className={"block " + className}>
        <span className="text-[11px] font-medium opacity-70">{label}{required && <span className="text-rose-400"> *</span>}</span>
        <div className="mt-1">{children}</div>
        {error ? <span className="text-[11px] text-rose-400 mt-1 block">{error}</span> : hint ? <span className="text-[11px] opacity-45 mt-1 block">{hint}</span> : null}
      </label>
    );
  }
  const baseInput = "vg-input w-full rounded-lg glass px-3 py-2 text-sm outline-none focus:ring-2 placeholder:opacity-40 disabled:opacity-65";
  const ring = { "--tw-ring-color": "var(--accent)" };

  function Text({ value, onChange, error, ...p }) {
    return <input className={baseInput} style={ring} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...p} />;
  }
  function Area({ value, onChange, rows = 3, ...p }) {
    return <textarea rows={rows} className={baseInput} style={ring} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...p} />;
  }
  function Num({ value, onChange, ...p }) {
    return <input type="number" className={baseInput} style={ring} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} {...p} />;
  }
  function DateF({ value, onChange, ...p }) {
    return <input type="date" className={baseInput} style={ring} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...p} />;
  }
  function Checkbox({ checked, onChange, label, disabled }) {
    return (
      <label className={"flex items-center gap-2 text-sm " + (disabled ? "opacity-50" : "cursor-pointer")}>
        <span onClick={() => !disabled && onChange(!checked)}
          className={"w-5 h-5 rounded-md border flex items-center justify-center shrink-0 " + (checked ? "text-white" : "opacity-70")}
          style={checked ? { background: "var(--accent)", borderColor: "var(--accent)" } : { borderColor: "rgba(148,163,184,.4)" }}>
          {checked && <Icon name="check" size={13} />}
        </span>
        {label && <span>{label}</span>}
      </label>
    );
  }
  function Select({ value, onChange, options, placeholder = "Select…", ...p }) {
    return (
      <div className="relative">
        <select className={baseInput + " appearance-none pr-9"} style={ring} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...p}>
          <option value="" className="vg-option">{placeholder}</option>
          {options.map((o) => <option key={o.value} value={o.value} className="vg-option">{o.label}</option>)}
        </select>
        <Icon name="chevron" size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-55" />
      </div>
    );
  }

  /* ---- quick-create configs for masters ---- */
  VG.quickCreate = {
    categories: {
      label: "Category",
      auto: { categoryCode: true, typeCode: "RWM" },
      fields: [
        { k: "code", l: "Category code", req: true, readonly: true },
        { k: "typeCode", l: "Stock type (SKU)", req: true, select: (VG.CATEGORY_TYPE_CODES || []).map((t) => t.code) },
        { k: "name", l: "Name", req: true },
      ],
    },
    locations: { label: "Location", fields: [{ k: "code", l: "Code", req: true }, { k: "name", l: "Name", req: true }] },
    itemLocations: {
      label: "Item Location",
      fields: [
        { k: "locationId", l: "Storage location", master: "locations", req: true },
        { k: "name", l: "Item location name", req: true },
        { k: "rack", l: "Rack" },
        { k: "shelf", l: "Shelf" },
        { k: "bin", l: "Bin" },
        { k: "zone", l: "Zone" },
        { k: "description", l: "Description", type: "area" },
        { k: "status", l: "Status", select: ["Active", "Inactive"], req: true },
      ],
    },
    units: { label: "Unit", fields: [{ k: "name", l: "Unit name", req: true }] },
    paymentTerms: { label: "Payment Term", fields: [{ k: "name", l: "Term", req: true }] },
    deliveryTerms: { label: "Delivery Term", fields: [{ k: "name", l: "Term", req: true }] },
    /* customers: full form via VG.CustomerForm — no quick-create */
    suppliers: { label: "Supplier / Vendor", auto: { code: "SUPP" }, fields: [
      { k: "name", l: "Company name", req: true }, { k: "contact", l: "Contact person", req: true }, { k: "phone", l: "Phone" }, { k: "email", l: "Email", type: "email" },
      { k: "gstin", l: "GSTIN", req: true }, { k: "address", l: "Address", type: "area" } ] },
    manufacturers: {
      label: "Manufacturer",
      fields: [
        { k: "code", l: "Code", readonly: true },
        { k: "name", l: "Manufacturer name", req: true },
        { k: "brand", l: "Brand name" },
        { k: "country", l: "Country" },
        { k: "website", l: "Website" },
        { k: "contact", l: "Contact" },
        { k: "email", l: "Email", type: "email" },
      ],
    },
    items: { label: "Item", auto: { skuFromCategory: true }, fields: [
      { k: "categoryId", l: "Category", master: "categories", req: true },
      { k: "skuPreview", l: "SKU (auto-generated)", readonly: true },
      { k: "name", l: "Item Name", req: true },
      { k: "description", l: "Item Description", type: "area" },
      { k: "unit", l: "Unit", select: "units", req: true }, { k: "hsn", l: "HSN / SAC" }, { k: "rate", l: "Rate (₹)", type: "number", req: true },
      { k: "taxId", l: "GST", select: "taxes", req: true }, { k: "reorder", l: "Reorder level", type: "number" }, { k: "minStock", l: "Min stock", type: "number" },
      { k: "locationId", l: "Default location", master: "locations" }, { k: "warranty", l: "Warranty" } ] },
  };

  const ReactDOM = window.ReactDOM;

  function itemSearchHaystack(rec) {
    if (VG.itemDisplay && VG.itemDisplay.searchHaystack) return VG.itemDisplay.searchHaystack(rec);
    const im = VG.itemMfr;
    const cat = store.get("categories", rec.categoryId);
    return [
      rec.sku, rec.name, rec.description, rec.hsn, rec.unit,
      im && im.manufacturerName(rec), im && im.partNumber(rec),
      cat && cat.name, cat && cat.code, cat && cat.typeCode,
    ].filter(Boolean).join(" ").toLowerCase();
  }
  function itemOnHand(rec) {
    return store.onHand ? Number(store.onHand(rec.id)) || 0 : 0;
  }
  function itemCategoryLabel(rec) {
    const cat = store.get("categories", rec.categoryId);
    return cat ? (cat.code || "") + " " + (cat.name || "") : "";
  }
  function itemDropdownLine(rec) {
    if (VG.itemDisplay && VG.itemDisplay.dropdownLine) return VG.itemDisplay.dropdownLine(rec);
    const im = VG.itemMfr;
    const mfr = (im && im.manufacturerName(rec)) || "—";
    const part = (im && im.partNumber(rec)) || "—";
    const stock = itemOnHand(rec);
    const unit = rec.unit || "Nos";
    return rec.sku + " | " + rec.name + " | " + mfr + " | " + part + " | Stock: " + stock + " " + unit;
  }
  function matchMasterRow(coll, rec, q) {
    if (!q || !String(q).trim()) return true;
    const ql = String(q).toLowerCase().trim();
    const tokens = ql.split(/\s+/).filter(Boolean);
    const hay = coll === "items" ? itemSearchHaystack(rec) : labelOf(coll, rec).toLowerCase();
    return tokens.every((t) => hay.includes(t));
  }

  function labelOf(coll, rec) {
    if (!rec) return "";
    if (coll === "items") {
      if (VG.itemDisplay && VG.itemDisplay.tableLabel) return VG.itemDisplay.tableLabel(rec);
      if (VG.itemMfr && VG.itemMfr.label) return VG.itemMfr.label(rec);
      return rec.sku + " — " + (rec.name || "");
    }
    if (coll === "manufacturers") return (rec.code ? rec.code + " · " : "") + (rec.name || rec.id) + (rec.brand ? " (" + rec.brand + ")" : "");
    if (coll === "taxes" || coll === "units" || coll === "paymentTerms" || coll === "deliveryTerms") return rec.name;
    if (coll === "salesOrders" || coll === "quotations") {
      const c = store.get("customers", rec.customerId);
      return rec.no + (c ? " · " + c.name : "");
    }
    if (coll === "categories") return (rec.code || "") + " · " + (rec.typeCode || "") + " · " + (rec.name || rec.id);
    if (coll === "itemLocations") {
      const loc = store.get("locations", rec.locationId);
      return (rec.code ? rec.code + " · " : "") + (rec.name || "") + (loc ? " @ " + loc.name : "");
    }
    if (coll === "customers") return (rec.code ? rec.code + " · " : "") + (rec.legalName || rec.name || rec.id);
    return (rec.code ? rec.code + " · " : "") + (rec.name || rec.id);
  }

  function QuickCreate({ collection, open, onClose, onCreated, actorRole }) {
    const cfg = VG.quickCreate[collection];
    const [form, setForm] = useState({});
    const [err, setErr] = useState({});
    const [dirty, setDirty] = useState(false);
    useEffect(() => {
      if (!open) return;
      const init = {};
      if (cfg.auto && cfg.auto.categoryCode) init.code = store.nextCategoryCode();
      if (cfg.auto && cfg.auto.typeCode) init.typeCode = cfg.auto.typeCode;
      if (collection === "manufacturers") init.code = store.nextManufacturerCode();
      setForm(init);
      setErr({});
      setDirty(false);
    }, [open]);
    if (!cfg) return null;
    const set = (k, v) => { setDirty(true); setForm((f) => ({ ...f, [k]: v })); };
    function save() {
      const e = {};
      cfg.fields.forEach((f) => { if (f.req && (form[f.k] === undefined || form[f.k] === "")) e[f.k] = "Required"; });
      if (Object.keys(e).length) { setErr(e); return; }
      const payload = { ...form };
      if (cfg.auto && cfg.auto.code) payload.code = store.nextMasterCode ? store.nextMasterCode(cfg.auto.code) : store.nextNo(cfg.auto.code);
      if (collection === "categories") {
        if (!payload.code) payload.code = store.nextCategoryCode();
        payload.typeCode = String(payload.typeCode || "RWM").toUpperCase();
      }
      if (collection === "manufacturers") {
        if (!payload.code) payload.code = store.nextManufacturerCode();
        payload.active = payload.active !== false;
      }
      if (collection === "itemLocations") {
        if (!payload.code) payload.code = store.nextMasterCode ? store.nextMasterCode("ILOC", { collection: "itemLocations", field: "code", pad: 3 }) : ("ILOC" + String((store.list("itemLocations").length || 0) + 1).padStart(3, "0"));
        payload.status = payload.status || "Active";
      }
      const rec = store.create(collection, payload, actorRole);
      VG.toast(cfg.label + " added");
      onCreated(rec);
      onClose();
    }
    return (
      <Modal open={open} onClose={onClose} title={"New " + cfg.label} size="md" dirty={dirty}
        actions={<Button icon="check" onClick={save}>Save {cfg.label}</Button>}>
        <div className="grid sm:grid-cols-2 gap-3">
          {cfg.fields.map((f) => (
            <Field key={f.k} label={f.l} required={f.req} error={err[f.k]} className={f.type === "area" ? "sm:col-span-2" : ""}>
              {f.k === "skuPreview" ? <Text value={form.categoryId ? store.nextSku(form.categoryId) : "Select category…"} onChange={() => {}} disabled />
                : f.master ? <MasterSelect collection={f.master} value={form[f.k]} onChange={(v) => { set(f.k, v); if (collection === "items" && f.k === "categoryId") set("skuPreview", store.nextSku(v)); }} actorRole={actorRole} allowCreate={false} />
                : f.select ? <Select value={form[f.k]} onChange={(v) => set(f.k, v)} options={Array.isArray(f.select)
                  ? f.select.map((o) => ({ value: o, label: (VG.CATEGORY_TYPE_CODES || []).find((t) => t.code === o) ? o + " — " + VG.CATEGORY_TYPE_CODES.find((t) => t.code === o).label : o }))
                  : store.list(f.select).map((o) => ({ value: f.select === "units" ? o.name : o.id, label: o.name }))} />
                : f.type === "area" ? <Area value={form[f.k]} onChange={(v) => set(f.k, v)} />
                : f.type === "number" ? <Num value={form[f.k]} onChange={(v) => set(f.k, v)} />
                : <Text type={f.type || "text"} value={form[f.k]} onChange={(v) => set(f.k, v)} disabled={f.readonly} />}
            </Field>
          ))}
        </div>
      </Modal>
    );
  }

  /* ---- MasterSelect: portal dropdown, smart flip, rich item search ---- */
  function ItemOptionRow({ rec, hi, idx, value, onPick, query, onHover }) {
    const im = VG.itemMfr;
    const id = VG.itemDisplay;
    const mfr = (im && im.manufacturerName(rec)) || "—";
    const part = (im && im.partNumber(rec)) || "—";
    const stock = itemOnHand(rec);
    const cat = (id && id.categoryName(rec)) || itemCategoryLabel(rec).replace(/^CAT-\d+\s*/, "") || "—";
    const q = (query || "").trim().toLowerCase();
    const mark = (text) => {
      if (!q || !text) return text;
      const t = String(text);
      const i = t.toLowerCase().indexOf(q);
      if (i < 0) return t;
      return <>{t.slice(0, i)}<mark className="rounded px-0.5" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{t.slice(i, i + q.length)}</mark>{t.slice(i + q.length)}</>;
    };
    return (
      <button type="button" data-idx={idx} onClick={() => onPick(rec)} onMouseEnter={() => onHover(idx)}
        className={"w-full text-left rounded-lg px-3 py-2.5 border border-transparent " + (hi ? "vg-master-option-hi" : "chrome-hover") + (rec.id === value ? " ring-1 ring-white/20" : "")}>
        <div className="text-[11px] opacity-70 font-mono leading-snug">{mark([rec.sku, rec.name || "—", cat, mfr, part, "Stock: " + stock + " " + (rec.unit || "Nos")].join(" | "))}</div>
        <div className="text-sm mt-1 font-medium leading-snug">{mark(rec.name || "—")}</div>
        <div className="text-[11px] opacity-55 mt-0.5 font-mono">{mark(rec.sku)}</div>
      </button>
    );
  }

  function MasterSelect({ collection, value, onChange, placeholder, actorRole, allowCreate = true, can = true, filterFn, variant = "default", onAfterSelect }) {
    const db = VG.useDB();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const [hi, setHi] = useState(0);
    const [creating, setCreating] = useState(false);
    const [pos, setPos] = useState(null);
    const anchorRef = useRef(null);
    const listRef = useRef(null);
    const searchRef = useRef(null);
    const isLineItem = collection === "items" && variant === "line";
    let rows = db.list(collection);
    if (filterFn) rows = rows.filter(filterFn);
    const selected = rows.find((r) => r.id === value) || db.get(collection, value);
    const filtered = useMemo(() => rows.filter((r) => matchMasterRow(collection, r, q)), [rows.length, collection, q, value]);
    const cfg = VG.quickCreate[collection];

    function layoutPanel() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const baseW = isLineItem ? 560 : 300;
      const w = Math.min(Math.max(baseW, rect.width), vw - 16);
      let left = rect.left;
      if (left + w > vw - 8) left = Math.max(8, vw - w - 8);
      const estH = 340;
      const spaceBelow = vh - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
      const maxHeight = Math.min(360, openUp ? spaceAbove : spaceBelow);
      const top = openUp ? Math.max(8, rect.top - maxHeight - 4) : rect.bottom + 4;
      setPos({ top, left, width: w, maxHeight, openUp });
    }

    useLayoutEffect(() => {
      if (!open) { setPos(null); return; }
      layoutPanel();
    }, [open, filtered.length, isLineItem]);
    useEffect(() => {
      if (!open) return;
      const onScroll = () => layoutPanel();
      const onResize = () => layoutPanel();
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onResize);
      return () => { window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", onResize); };
    }, [open]);

    useEffect(() => {
      if (!open) return;
      const h = (e) => {
        const panel = document.getElementById("vg-master-dropdown-root");
        if (anchorRef.current && anchorRef.current.contains(e.target)) return;
        if (panel && panel.contains(e.target)) return;
        setOpen(false);
      };
      document.addEventListener("mousedown", h);
      return () => document.removeEventListener("mousedown", h);
    }, [open]);

    useEffect(() => { if (open) { setHi(0); setTimeout(() => searchRef.current && searchRef.current.focus(), 0); } else setQ(""); }, [open]);
    useEffect(() => { setHi(0); }, [q]);
    useEffect(() => {
      if (!open || !listRef.current) return;
      const el = listRef.current.querySelector('[data-idx="' + hi + '"]');
      if (el) el.scrollIntoView({ block: "nearest" });
    }, [hi, open, filtered.length]);

    function focusNextField() {
      requestAnimationFrame(() => {
        const row = anchorRef.current && anchorRef.current.closest("tr");
        const qty = row && row.querySelector("[data-line-qty]");
        if (qty) { qty.focus(); qty.select && qty.select(); return; }
        const next = anchorRef.current && anchorRef.current.closest("td") && anchorRef.current.closest("td").parentElement && anchorRef.current.closest("td").parentElement.querySelector("input,select,textarea,button");
        if (next && next !== anchorRef.current) next.focus();
      });
    }

    function choose(r) {
      onChange(r.id);
      setOpen(false);
      setQ("");
      onAfterSelect && onAfterSelect(r);
      if (collection === "items") focusNextField();
    }

    const onKey = (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => Math.min(i + 1, Math.max(0, filtered.length - 1))); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); if (filtered[hi]) choose(filtered[hi]); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !open) { setOpen(true); setQ(e.key); }
    };

    function triggerText() {
      if (!selected) return placeholder || (collection === "items" ? "Search SKU, item name, description, category, MFR…" : "Select from master…");
      if (isLineItem) return (
        <span className="flex flex-col items-start min-w-0 leading-tight">
          <span className="truncate font-medium text-sm w-full">{selected.name || "—"}</span>
          <span className="font-mono text-[10px] opacity-55 truncate w-full">SKU: {selected.sku || "—"}</span>
        </span>
      );
      return labelOf(collection, selected);
    }

    const dropdownPanel = open && pos && (
      <div id="vg-master-dropdown-root" className="vg-master-dropdown-panel fixed glass-dark rounded-xl p-2 flex flex-col" style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight, zIndex: 120 }}>
        <div className="relative mb-1.5 shrink-0">
          <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" />
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder={collection === "items" ? "SKU · item name · description · category · MFR · HSN…  ↑↓ Enter" : "Search…  ↑↓ Enter"}
            className="w-full rounded-lg glass pl-8 pr-2 py-2 text-sm bg-transparent outline-none focus:ring-2" style={ring} />
        </div>
        <div ref={listRef} className="overflow-y-auto overflow-x-hidden flex-1 min-h-0 scroll-smooth space-y-0.5">
          {filtered.length === 0 && <div className="text-xs opacity-50 px-2 py-3 text-center">No matches — try SKU, item name, description, category, or manufacturer</div>}
          {filtered.map((r, i) => (
            collection === "items" ? (
              <ItemOptionRow key={r.id} rec={r} hi={i === hi} idx={i} value={value} query={q} onPick={choose} onHover={setHi} />
            ) : (
              <button key={r.id} type="button" data-idx={i} onClick={() => choose(r)}
                className={"w-full text-left text-sm rounded-lg px-2.5 py-2 " + (i === hi ? "vg-master-option-hi" : "chrome-hover") + (r.id === value ? " font-semibold" : "")}>
                {labelOf(collection, r)}
              </button>
            )
          ))}
        </div>
        {allowCreate && (cfg || (collection === "customers" && VG.CustomerForm)) && (
          <button type="button" disabled={!can} onClick={() => { 
            setOpen(false);
            if (collection === "customers" && VG.openCustomerFormWithContext) {
              VG.openCustomerFormWithContext({
                source: "transaction",
                sourceFieldKey: "customerId",
              });
            }
            setCreating(true);
          }}
            className="w-full text-left text-sm rounded-lg px-2.5 py-2 mt-1 border-t border-white/10 flex items-center gap-2 shrink-0 disabled:opacity-40" style={{ color: "var(--accent)" }}>
            <Icon name="plus" size={14} /> Add new {collection === "customers" ? "Customer" : cfg.label}{!can && " (no permission)"}
          </button>
        )}
      </div>
    );

    return (
      <div className={"relative min-w-0 " + (isLineItem ? "w-full" : "")} ref={anchorRef}>
        <button type="button" onClick={() => setOpen((o) => !o)} onKeyDown={onKey}
          className={baseInput + " flex items-center justify-between text-left gap-2 " + (isLineItem ? "min-h-[2.75rem] py-2.5" : "")}
          style={ring}>
          <span className={"flex-1 min-w-0 flex items-center " + (selected ? "" : "opacity-40")}>{triggerText()}</span>
          <Icon name="chevron" size={15} className={"opacity-55 shrink-0 transition " + (open && pos && pos.openUp ? "rotate-180" : "")} />
        </button>
        {ReactDOM && ReactDOM.createPortal ? ReactDOM.createPortal(dropdownPanel, document.body) : dropdownPanel}
        {collection === "customers" && VG.CustomerForm ? (
          <VG.CustomerForm open={creating} onClose={() => { setCreating(false); VG.closeCustomerFormContext(); }} record={null} roleKey={actorRole}
            can={(a) => (a === "add" || a === "edit" || a === "approve") && !!can}
            onSaved={(rec) => { if (rec && rec.id) onChange(rec.id); }} />
        ) : (
          <QuickCreate collection={collection} open={creating} onClose={() => setCreating(false)} actorRole={actorRole} onCreated={(rec) => onChange(rec.id)} />
        )}
      </div>
    );
  }

  /* ---- Transaction line table shell (quotation, SO, PO, etc.) ---- */
  function TransactionLinesShell({ title, onAddLine, addLabel, headerRow, children, minWidth = 1120 }) {
    return (
      <div className="vg-line-table-wrap rounded-xl glass overflow-hidden mb-4 border border-white/5">
        <div className="vg-line-table-toolbar flex items-center justify-between px-4 py-2.5 sticky top-0 z-20 backdrop-blur-md">
          <span className="text-sm font-semibold">{title || "Line items"}</span>
          {onAddLine && <Button variant="soft" icon="plus" onClick={onAddLine} className="!py-1.5">{addLabel || "Add line"}</Button>}
        </div>
        <div className="overflow-x-auto overflow-y-auto max-h-[min(58vh,540px)] scroll-smooth">
          <table className="vg-line-table w-full text-sm border-separate border-spacing-0" style={{ minWidth }}>
            <thead className="vg-sticky-thead">
              {headerRow}
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ============ Record table ============ */
  function exportCSV(filename, columns, rows) {
    const head = columns.map((c) => '"' + (c.label || c.key) + '"').join(",");
    const body = rows.map((r) => columns.map((c) => {
      const v = c.csv ? c.csv(r) : r[c.key];
      return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    }).join(",")).join("\n");
    const blob = new Blob([head + "\n" + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
    VG.toast("Exported " + filename + ".csv");
  }

  function RecordTable({
    tableId, title, columns, rows, search = true, searchKeys, filters, can, onView, onEdit, onDelete, onNew,
    newLabel = "New", extra, printTitle, empty = "No records yet", pageSize = 75, columnToggle = true,
    stickyHeader = true, defaultDensity = "comfortable", embedded = false, suppressNew = false,
  }) {
    const stateKey = tableId || (title ? "tbl-" + String(title).replace(/\s+/g, "-").toLowerCase() : "");
    const saved = stateKey && VG.getTableState ? VG.getTableState(stateKey) : {};
    const [q, setQ] = useState(saved.q || "");
    const [fil, setFil] = useState(saved.fil || {});
    const [page, setPage] = useState(saved.page || 0);
    const [density, setDensity] = useState(saved.density || defaultDensity);
    const [hiddenCols, setHiddenCols] = useState(saved.hiddenCols || {});
    const [colWidths, setColWidths] = useState(saved.colWidths || {});
    const [colMenu, setColMenu] = useState(false);
    const scrollRef = useRef(null);
    const resizeRef = useRef(null);

    const persist = useCallback((patch) => {
      if (!stateKey || !VG.saveTableState) return;
      VG.saveTableState(stateKey, {
        q, fil, page, density, hiddenCols, colWidths,
        scrollTop: scrollRef.current ? scrollRef.current.scrollTop : 0,
        ...patch,
      });
    }, [stateKey, q, fil, page, density, hiddenCols, colWidths]);

    useEffect(() => {
      if (scrollRef.current && saved.scrollTop) scrollRef.current.scrollTop = saved.scrollTop;
    }, [stateKey]);

    useEffect(() => { persist(); }, [q, fil, page, density, hiddenCols, colWidths]);

    const ql = q.toLowerCase();
    let data = rows;
    if (q) data = data.filter((r) => (searchKeys ? searchKeys.map((k) => r[k]) : Object.values(r)).join(" ").toLowerCase().includes(ql));
    (filters || []).forEach((f) => { if (fil[f.key]) data = data.filter((r) => String(f.get ? f.get(r) : r[f.key]) === fil[f.key]); });

    const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
    const safePage = Math.min(page, totalPages - 1);
    useEffect(() => { if (safePage !== page) setPage(safePage); }, [safePage, page]);

    const pageData = data.slice(safePage * pageSize, (safePage + 1) * pageSize);
    const visibleCols = columns.filter((c) => !hiddenCols[c.key]);
    const showActions = onView || onEdit || onDelete;
    const cellPy = density === "compact" ? "py-1.5" : "py-3";
    const headPy = density === "compact" ? "py-1.5" : "py-2.5";

    function startResize(key, e) {
      e.preventDefault();
      const startX = e.clientX;
      const startW = colWidths[key] || 120;
      resizeRef.current = { key, startX, startW };
      const onMove = (ev) => {
        if (!resizeRef.current) return;
        const w = Math.max(60, resizeRef.current.startW + (ev.clientX - resizeRef.current.startX));
        setColWidths((s) => ({ ...s, [resizeRef.current.key]: w }));
      };
      const onUp = () => {
        resizeRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }

    function openViewSafe(r) {
      if (!onView) return;
      if (stateKey && VG.getOpenRecord && VG.registerOpenRecord) {
        const openId = VG.getOpenRecord(stateKey);
        if (openId === r.id) {
          onView(r);
          return;
        }
        VG.registerOpenRecord(stateKey, r.id);
      }
      persist({ scrollTop: scrollRef.current ? scrollRef.current.scrollTop : 0 });
      onView(r);
    }

    const showNew = onNew && can && can("add") && !suppressNew;

    return (
      <div className={"vg-record-table w-full max-w-none" + (embedded ? " vg-record-table--embedded" : "")}>
        <div className={"vg-record-table-toolbar flex flex-wrap items-center gap-2 py-2.5 " + (embedded ? "vg-list-page-toolbar" : "vg-workspace-inset py-3")}>
          {title && <div className="font-semibold text-sm mr-auto text-[var(--vg-heading)]">{title}</div>}
          {search && (
            <div className="relative">
              <Icon name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="rounded-lg glass pl-8 pr-3 py-2 text-sm bg-transparent outline-none placeholder:opacity-40 w-40 sm:w-56" placeholder="Search…" />
            </div>
          )}
          {(filters || []).map((f) => (
            <select key={f.key} value={fil[f.key] || ""} onChange={(e) => { setFil((s) => ({ ...s, [f.key]: e.target.value })); setPage(0); }} className="vg-input rounded-lg glass px-2.5 py-2 text-sm outline-none">
              <option value="" className="vg-option">{f.label}</option>
              {f.options.map((o) => <option key={o.value || o} value={o.value || o} className="vg-option">{o.label || o}</option>)}
            </select>
          ))}
          <div className="flex items-center gap-1.5 ml-auto flex-wrap justify-end">
            <div className="flex rounded-lg glass overflow-hidden text-[11px]">
              <button type="button" onClick={() => setDensity("compact")} className={"px-2 py-1.5 " + (density === "compact" ? "bg-white/15" : "opacity-55")} title="Compact rows">Compact</button>
              <button type="button" onClick={() => setDensity("comfortable")} className={"px-2 py-1.5 " + (density === "comfortable" ? "bg-white/15" : "opacity-55")} title="Comfortable rows">Comfort</button>
            </div>
            {columnToggle && columns.length > 2 && (
              <div className="relative">
                <Button variant="ghost" icon="grid" className="!py-1.5 !text-xs" onClick={() => setColMenu((v) => !v)}>Columns</Button>
                {colMenu && (
                  <div className="absolute right-0 top-full mt-1 z-30 glass-dark rounded-xl shadow-glass p-2 min-w-[160px] text-xs" onMouseLeave={() => setColMenu(false)}>
                    {columns.map((c) => (
                      <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
                        <input type="checkbox" checked={!hiddenCols[c.key]} onChange={() => setHiddenCols((s) => ({ ...s, [c.key]: !s[c.key] }))} />
                        {c.label || c.key}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            {extra}
            {can && can("export") && <Button variant="soft" icon="download" className="hidden sm:inline-flex" onClick={() => exportCSV((printTitle || title || "export").replace(/\s+/g, "-"), visibleCols, data)}>Export</Button>}
            {can && can("print") && <Button variant="ghost" icon="printer" className="hidden md:inline-flex" onClick={() => printTable(printTitle || title, visibleCols, data)}>Print</Button>}
            {showNew && <Button icon="plus" onClick={onNew}>{newLabel}</Button>}
          </div>
        </div>
        <div
          ref={scrollRef}
          className={"overflow-auto vg-record-table-scroll " + (stickyHeader ? "max-h-[min(72vh,calc(100dvh-14rem))]" : "")}
          onScroll={() => { if (stateKey) persist(); }}
        >
          <table className="w-full text-sm vg-data-table" style={{ minWidth: "100%" }}>
            <thead className={stickyHeader ? "vg-sticky-thead" : ""}>
              <tr className="vg-table-head-row text-left text-[11px] uppercase tracking-wider">
                {visibleCols.map((c) => (
                  <th
                    key={c.key}
                    className={"px-3 sm:px-4 font-medium relative select-none " + headPy + " " + (c.thClass || "")}
                    style={colWidths[c.key] ? { width: colWidths[c.key], minWidth: colWidths[c.key] } : undefined}
                  >
                    <span className="pr-2">{c.label}</span>
                    <span
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/20"
                      onMouseDown={(e) => startResize(c.key, e)}
                      title="Resize column"
                    />
                  </th>
                ))}
                {showActions && <th className={"px-3 sm:px-4 font-medium text-right " + headPy}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 && <tr><td colSpan={visibleCols.length + (showActions ? 1 : 0)} className="px-4 py-10 text-center opacity-50">{empty}</td></tr>}
              {pageData.map((r) => (
                <tr key={r.id} className="vg-table-row border-b border-white/5">
                  {visibleCols.map((c) => <td key={c.key} className={"px-3 sm:px-4 " + cellPy + " " + (c.tdClass || "")} style={colWidths[c.key] ? { width: colWidths[c.key], minWidth: colWidths[c.key] } : undefined}>{c.render ? c.render(r) : r[c.key]}</td>)}
                  {showActions && (
                    <td className={"px-3 sm:px-4 " + cellPy}>
                      <div className="flex items-center justify-end gap-1.5 opacity-80">
                        {onView && <button title="View" onClick={() => openViewSafe(r)} className="p-1 rounded chrome-hover"><Icon name="eye" size={15} /></button>}
                        {onEdit && can && can("edit") && <button title="Edit" onClick={() => onEdit(r)} className="p-1 rounded chrome-hover"><Icon name="edit" size={15} /></button>}
                        {onDelete && can && can("delete") && <button title="Delete" onClick={() => onDelete(r)} className="p-1 rounded chrome-hover hover:text-rose-400"><Icon name="trash" size={15} /></button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={(embedded ? "vg-list-page-footer" : "vg-workspace-inset") + " px-0 py-2.5 text-[11px] opacity-50 border-t border-white/10 flex flex-wrap items-center gap-2 justify-between"}>
          <span>{data.length} record{data.length !== 1 ? "s" : ""}{data.length !== rows.length ? " (filtered)" : ""}</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button type="button" disabled={safePage <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="px-2 py-1 rounded glass disabled:opacity-30">Prev</button>
              <span>Page {safePage + 1} / {totalPages}</span>
              <button type="button" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} className="px-2 py-1 rounded glass disabled:opacity-30">Next</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ============ Print / PDF ============ */
  function companyHeader() {
    const c = store.company();
    const addr = [c.address1 || c.address, c.address2, [c.city, c.state, c.pin].filter(Boolean).join(", ")].filter(Boolean).join("<br>");
    const logo = c.letterheadLogo || c.logo;
    return `
      <div class="vg-head">
        <div class="vg-brand">
          <img src="${logo && logo.indexOf("data:") === 0 ? logo : location.origin + "/" + (logo || "")}" onerror="this.style.display='none'"/>
          <div><div class="vg-co">${c.tradeName || c.name}</div><div class="vg-tag">${c.legalName || c.name}${c.tagline ? " · " + c.tagline : ""}</div></div>
        </div>
        <div class="vg-meta">
          <div>${addr}</div>
          <div>GSTIN: ${c.gstin || "—"} · PAN: ${c.pan || "—"}${c.cin ? " · CIN: " + c.cin : ""}</div>
          <div>${c.phone || ""} · ${c.salesEmail || c.email || ""} · ${c.website || ""}</div>
        </div>
      </div>`;
  }
  function companyFooter() {
    const c = store.company();
    const terms = c.terms || c.docFooter || "";
    return `<div class="vg-foot vg-foot-document-end"><div>${terms}</div><div>© ${new Date().getFullYear()} ${c.legalName || c.name}${c.jurisdiction ? " · " + c.jurisdiction : ""}</div></div>`;
  }
  function buildPrintCSS() {
    const base = VG.printBaseCSS ? VG.printBaseCSS() : "*{box-sizing:border-box;font-family:Inter,Arial,sans-serif}";
    const footerCss = VG.printFooterRepeatCSS ? VG.printFooterRepeatCSS(10.5, 14) : "";
    return `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');` + base + footerCss + `
    body{margin:0;color:#0f172a}
    .vg-page{padding:28px 32px}
    .vg-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #6366f1;padding-bottom:14px;margin-bottom:18px}
    .vg-brand{display:flex;gap:12px;align-items:center}
    .vg-brand img{height:46px}
    .vg-co{font-size:18px;font-weight:800;color:#111827}
    .vg-tag{font-size:11px;color:#6b7280}
    .vg-meta{font-size:10.5px;color:#4b5563;text-align:right;line-height:1.5}
    h1.vg-title{font-size:18px;margin:8px 0 2px;letter-spacing:.04em;text-transform:uppercase}
    .vg-sub{font-size:11px;color:#6b7280;margin-bottom:14px}
    table.vg-tbl{width:100%;border-collapse:collapse;font-size:11px;margin:8px 0}
    table.vg-tbl th{background:#f1f5f9;text-align:left;padding:7px 8px;border:1px solid #e2e8f0;text-transform:uppercase;font-size:9.5px;letter-spacing:.03em}
    table.vg-tbl td{padding:7px 8px;border:1px solid #e2e8f0}
    .vg-right{text-align:right}
    .vg-cols{display:flex;gap:18px;font-size:11px;margin-bottom:12px}
    .vg-card{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px}
    .vg-card b{display:block;font-size:9.5px;text-transform:uppercase;color:#6b7280;margin-bottom:4px}
    .vg-totals{width:280px;margin-left:auto;font-size:12px}
    .vg-totals div{display:flex;justify-content:space-between;padding:3px 0}
    .vg-totals .grand{border-top:2px solid #111827;margin-top:6px;padding-top:6px;font-weight:800;font-size:14px}
    .vg-terms{font-size:10.5px;color:#374151;margin-top:14px;line-height:1.6}
    .vg-sign{display:flex;justify-content:space-between;margin-top:34px;font-size:11px}
    .vg-foot{border-top:1px solid #e2e8f0;margin-top:22px;padding-top:8px;font-size:9.5px;color:#6b7280;display:flex;justify-content:space-between}
    .vg-bar{position:sticky;top:0;z-index:9;background:#0b1120;color:#fff;padding:10px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .vg-bar button{background:#6366f1;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer}
    .vg-bar button.ghost{background:rgba(255,255,255,.14)}
    .vg-bar .tip{opacity:.75;font-size:12px}
    @media print{.vg-page{padding:0;padding-bottom:26mm!important}.vg-bar{display:none!important}}
  `;
  }
  const printCSS = buildPrintCSS();
  function openPrint(title, inner, mode) {
    const w = window.open("", "_blank", "width=920,height=1040");
    if (!w) { VG.toast("Pop-up blocked — allow pop-ups to view/print the document", "warn"); return; }
    const auto = mode === "print";
    const tip = mode === "download" ? '<span class="tip">To download: choose <b>“Save as PDF”</b> as the destination.</span>' : '<span class="tip">Use your browser’s print dialog to print or save as PDF.</span>';
    const bar = `<div class="vg-bar"><button onclick="window.print()">🖨 Print / Save as PDF</button><button class="ghost" onclick="window.close()">Close</button>${tip}</div>`;
    const css = buildPrintCSS();
    const repeatFooter = VG.buildRepeatingPrintFooter
      ? VG.buildRepeatingPrintFooter({}, { docType: title, subtitle: "" })
      : "";
    w.document.write(`<!doctype html><html><head><title>${title}</title><style>${css}</style></head><body>${bar}<div class="vg-page">${companyHeader()}${inner}${companyFooter()}</div>${repeatFooter}<script>window.onload=function(){${auto ? "setTimeout(function(){window.print()},300)" : ""}}<\/script></body></html>`);
    w.document.close();
  }
  function printDocument({ title, subtitle, inner, docType, templateId, copies, useIntlLayout }, mode = "print") {
    let tid = templateId;
    if (!tid && docType && store.getSelectedTemplateId) tid = store.getSelectedTemplateId(docType);
    if (VG.printStyledDocument) {
      VG.printStyledDocument({ title, subtitle, inner, docType, templateId: tid, copies, useIntlLayout }, mode);
      return;
    }
    openPrint(title, `<h1 class="vg-title">${title}</h1>${subtitle ? `<div class="vg-sub">${subtitle}</div>` : ""}${inner}`, mode);
  }
  function printTable(title, columns, rows) {
    const cols = columns.filter((c) => c.key !== "_actions");
    const head = cols.map((c) => `<th>${c.label}</th>`).join("");
    const body = rows.map((r) => "<tr>" + cols.map((c) => `<td>${c.print ? c.print(r) : (c.csv ? c.csv(r) : (r[c.key] ?? ""))}</td>`).join("") + "</tr>").join("");
    printDocument({ title: title || "Report", subtitle: "Generated " + (VG.fmt.formatDateTime ? VG.fmt.formatDateTime(new Date()) : new Date().toLocaleString("en-IN")), inner: `<table class="vg-tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` });
  }

  /* ============ small atoms ============ */
  function StatusTag({ value, map }) {
    const defaults = {
      Created: "#60a5fa", Pending: "#f59e0b", Approved: "#22c55e", Rejected: "#ef4444",
      "In Progress": "#a855f7", Completed: "#34d399", Delayed: "#f97316", Closed: "#64748b",
      Open: "#60a5fa", Won: "#22c55e", Lost: "#ef4444", Active: "#34d399", Inactive: "#94a3b8",
    };
    const color = (map && map[value]) || defaults[value] || "#94a3b8";
    return <Pill color={color}>{value}</Pill>;
  }
  function CollapsibleSection({ title, subtitle, defaultOpen = true, children, className = "" }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
      <Card className={"mb-3 overflow-hidden " + className}>
        <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 p-3 sm:p-4 text-left chrome-hover">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{title}</div>
            {subtitle && <div className="text-[11px] opacity-55 mt-0.5">{subtitle}</div>}
          </div>
          <Icon name={open ? "chevronUp" : "chevronDown"} size={16} className="shrink-0 opacity-60" />
        </button>
        {open && <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t border-white/10 pt-3">{children}</div>}
      </Card>
    );
  }

  function PrintTemplatePicker({ open, onClose, docType, mode, onConfirm }) {
    const templates = useMemo(
      () => (store.listActiveDocumentTemplates ? store.listActiveDocumentTemplates() : (store.list("documentTemplates") || []).filter((t) => t.active !== false)),
      [open, store.list("documentTemplates").length]
    );
    const defaultId = store.getSelectedTemplateId ? store.getSelectedTemplateId(docType) : (templates[0] && templates[0].id);
    const [tplId, setTplId] = useState(defaultId || "");
    useEffect(() => {
      if (open) setTplId(store.getSelectedTemplateId ? store.getSelectedTemplateId(docType) || (templates[0] && templates[0].id) || "" : "");
    }, [open, docType, templates.length]);
    const modeLabel = mode === "print" ? "Print" : mode === "download" ? "Download PDF" : "Preview";
    return (
      <Modal open={open} onClose={onClose} title={modeLabel + " — " + (docType || "Document")}
        subtitle="Choose the PDF template for this document"
        footer={<>
          <Button variant="soft" onClick={onClose}>Cancel</Button>
          <Button icon={mode === "download" ? "download" : mode === "print" ? "printer" : "eye"} onClick={() => onConfirm(tplId)}>{modeLabel}</Button>
        </>}>
        <Field label="Select Template">
          <Select value={tplId} onChange={setTplId} options={templates.map((t) => ({ value: t.id, label: t.name }))} />
        </Field>
      </Modal>
    );
  }

  /* Standard document action set for any printable transaction. `build` returns
     a { title, subtitle, inner } document object (lazy so it always reflects latest data). */
  function DocActions({ build, onEmail, onDocument, label, docType, showTemplatePicker = true }) {
    const [picker, setPicker] = useState(null);
    const run = (mode, templateId) => {
      try {
        const doc = build();
        const dt = docType || doc.docType;
        const tid = templateId || (store.getSelectedTemplateId && store.getSelectedTemplateId(dt)) || doc.templateId;
        printDocument({ ...doc, docType: dt, templateId: tid }, mode);
        onDocument && onDocument(mode);
      } catch (e) { VG.toast("Could not generate document", "error"); }
    };
    const request = (mode) => {
      if (showTemplatePicker && docType) {
        setPicker({ mode, docType });
        return;
      }
      run(mode);
    };
    return (
      <>
        <Button variant="soft" icon="eye" onClick={() => request("preview")}>{label || "Preview"}</Button>
        <Button variant="soft" icon="printer" onClick={() => request("print")}>Print</Button>
        <Button variant="soft" icon="download" onClick={() => request("download")}>PDF</Button>
        {onEmail && <Button variant="soft" icon="message" onClick={onEmail}>Email</Button>}
        {picker && (
          <PrintTemplatePicker open docType={picker.docType} mode={picker.mode} onClose={() => setPicker(null)}
            onConfirm={(tplId) => { setPicker(null); run(picker.mode, tplId); }} />
        )}
      </>
    );
  }
  function PageHead({ title, desc, icon, accent, children, integrated, onNew, newLabel, can, breadcrumbs }) {
    const Crumbs = VG.Breadcrumbs;
    const addBtn = onNew && (!can || can("add")) ? <Button key="vg-add" icon="plus" onClick={onNew}>{newLabel || "Add new"}</Button> : null;
    const actions = [children, addBtn].filter(Boolean);
    return (
      <header className={"vg-page-head animate-fade-up" + (integrated ? " vg-page-head--integrated" : " vg-workspace-inset mb-4 pt-2")}>
        {breadcrumbs && Crumbs ? <div className="vg-page-head-crumb"><Crumbs items={breadcrumbs} /></div> : null}
        <div className={"vg-page-head-inner flex flex-wrap items-center justify-between gap-3" + (integrated ? " vg-page-head-inner--integrated" : "")}>
          <div className="flex items-start gap-3 min-w-0">
            {icon && (
              <span className="vg-page-head-icon" style={{ background: accent || "var(--accent)" }}>
                <Icon name={icon} size={18} />
              </span>
            )}
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold font-display leading-tight text-[var(--vg-heading)]">{title}</h2>
              {desc && <p className="text-xs text-[var(--vg-text-muted)] mt-1 leading-snug max-w-3xl">{desc}</p>}
            </div>
          </div>
          {actions.length ? <div className="vg-page-head-actions flex items-center gap-2 shrink-0 flex-wrap justify-end">{actions}</div> : null}
        </div>
      </header>
    );
  }

  /** Integrated list page: header card + list/table body, equal width, minimal gap. */
  function ListPage({ title, desc, icon, accent, breadcrumbs, onNew, newLabel, can, headerExtra, children, className = "" }) {
    return (
      <div className={"vg-list-page w-full max-w-none animate-fade-up " + className}>
        <div className="vg-list-page-panel">
          <PageHead integrated title={title} desc={desc} icon={icon} accent={accent} breadcrumbs={breadcrumbs}
            onNew={onNew} newLabel={newLabel} can={can}>{headerExtra}</PageHead>
          <div className="vg-list-page-body">{children}</div>
        </div>
      </div>
    );
  }

  VG.fx = {
    Toaster, Confirmer, BannerHost, Modal, Field, Text, Area, Num, DateF, Select, Checkbox, MasterSelect, QuickCreate,
    RecordTable, exportCSV, printDocument, printTable, StatusTag, PageHead, ListPage, DocActions, CollapsibleSection, labelOf,
    TransactionLinesShell, itemDropdownLine, itemSearchHaystack,
  };
})(window.VG);
