/* Veraglo ERP — Inventory Management module (fully functional, stock-ledger driven). */
(function (VG) {
  const { useState, useMemo, useEffect, useRef } = React;
  const ui = VG.ui, fx = VG.fx, store = VG.store, inr = VG.fmt.inr, today = VG.fmt.todayISO;
  const { Icon, Button, Pill, Card } = ui;
  const { Field, Text, Area, Num, DateF, Select, MasterSelect, Modal, InternalScreen, RecordTable, PageHead, ListPage, StatusTag, printDocument, DocActions, TransactionLinesShell, exportCSV } = fx;
  const MasterForm = VG.MasterForm;

  const itemName = (id) => (VG.itemDisplay && VG.itemDisplay.tableLabel(id)) || (VG.itemMfr && VG.itemMfr.label(id)) || "—";
  const itemNameSkuPdf = (id) => (VG.itemDisplay && VG.itemDisplay.itemNameSkuCell(id)) || itemName(id);
  const mfrCols = () => (VG.itemMfr && VG.itemMfr.tableColumns()) || [];
  const PartNumberSuggest = (VG.itemMfr && VG.itemMfr.PartNumberSuggest) || function () { return null; };
  const readDatasheet = (VG.itemMfr && VG.itemMfr.readDatasheet) || function (file, done) { done(null, null); };
  const locName = (id) => (store.get("locations", id) || {}).name || "—";
  const itemLocName = (id) => (store.itemLocationLabel ? store.itemLocationLabel(id) : (store.get("itemLocations", id) || {}).name) || "—";
  const suppName = (id) => (store.get("suppliers", id) || {}).name || "—";
  const unitsOpt = () => store.list("units").map((u) => u.name);
  const taxRate = (id) => (store.get("taxes", id) || {}).rate || 0;
  const typeCodeOptions = () => (VG.CATEGORY_TYPE_CODES || []).map((t) => ({ value: t.code, label: t.code + " — " + t.label }));
  const typeCodeLabel = (code) => {
    const t = (VG.CATEGORY_TYPE_CODES || []).find((x) => x.code === code);
    return t ? t.code + " — " + t.label : code || "—";
  };

  const ISSUE_TYPES = [
    "Issue for Invoicing", "Internal Use / Production", "Vendor Returnable Challan", "Vendor Non-Returnable Challan",
  ];

  /* Resize uploaded reference images so localStorage stays reliable. */
  function readItemImage(file, done) {
    if (!file || !file.type.startsWith("image/")) return done(null, "Please choose an image file (JPG, PNG, WebP)");
    if (file.size > 4 * 1024 * 1024) return done(null, "Image must be under 4 MB");
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 480;
        let w = img.width, h = img.height;
        if (w > max || h > max) {
          if (w >= h) { h = Math.round(h * (max / w)); w = max; }
          else { w = Math.round(w * (max / h)); h = max; }
        }
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        done(c.toDataURL("image/jpeg", 0.82), null);
      };
      img.onerror = () => done(null, "Could not read image");
      img.src = reader.result;
    };
    reader.onerror = () => done(null, "Could not read file");
    reader.readAsDataURL(file);
  }

  function ItemForm({ open, onClose, record, roleKey, can, onSaved }) {
    const isEdit = !!(record && record.id);
    const disabled = isEdit && !can("edit");
    const [form, setForm] = useState(() => ({
      unit: "Nos", taxId: "gst18", batchTracked: "No", reorder: 0, minStock: 0, rate: 0,
      ...record,
      batchTracked: record && record.batchTracked === true ? "Yes" : record && record.batchTracked === false ? "No" : (record && record.batchTracked) || "No",
    }));
    const [err, setErr] = useState({});
    const [dirty, setDirty] = useState(false);
    const fileRef = useRef(null);
    const sheetRef = useRef(null);
    const set = (k, v) => { setDirty(true); setForm((f) => ({ ...f, [k]: v })); };
    const pickCategory = (categoryId) => {
      setDirty(true);
      setForm((f) => {
        const next = { ...f, categoryId };
        if (!isEdit) next.sku = store.nextSku(categoryId);
        return next;
      });
    };
    useEffect(() => {
      if (!open) return;
      const base = {
        unit: "Nos", taxId: "gst18", batchTracked: "No", reorder: 0, minStock: 0, rate: 0,
        ...record,
        batchTracked: record && record.batchTracked === true ? "Yes" : record && record.batchTracked === false ? "No" : (record && record.batchTracked) || "No",
      };
      if (!record || !record.id) base.sku = record && record.categoryId ? store.nextSku(record.categoryId) : "";
      setForm(base);
      setErr({});
      setDirty(false);
    }, [open, record && record.id]);
    function onImagePick(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      readItemImage(file, (dataUrl, msg) => {
        if (msg) return VG.toast(msg, "error");
        set("image", dataUrl);
        VG.toast("Reference image attached");
      });
      e.target.value = "";
    }
    function onDatasheetPick(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      readDatasheet(file, (doc, msg) => {
        if (msg) return VG.toast(msg, "error");
        if (doc) {
          set("datasheetName", doc.name);
          set("datasheetData", doc.data);
          VG.toast("Datasheet attached");
        }
      });
      e.target.value = "";
    }
    function save() {
      if (disabled) return onClose();
      const e = {};
      if (!form.name || !String(form.name).trim()) e.name = "Required";
      if (!form.categoryId) e.categoryId = "Required";
      if (form.rate === "" || form.rate == null) e.rate = "Required";
      if (VG.itemDisplay && form.description) {
        const dv = VG.itemDisplay.validateDescription(form.description);
        if (!dv.ok) return VG.toast(dv.message, "error");
      }
      const mfrId = form.manufacturerId;
      const partNo = String(form.manufacturerPartNumber || "").trim();
      if (mfrId && partNo) {
        const dup = store.findDuplicateItemMfr({ manufacturerId: mfrId, manufacturerPartNumber: partNo }, isEdit ? form.id : null);
        if (dup) {
          VG.toast(VG.ITEM_MFR_DUP_MSG || store.validateItemMfrDuplicate({ manufacturerId: mfrId, manufacturerPartNumber: partNo }).message, "error");
          return;
        }
      }
      if (Object.keys(e).length) { setErr(e); return VG.toast("Please fill required fields", "error"); }
      const payload = {
        ...form,
        batchTracked: form.batchTracked === "Yes",
        rate: Number(form.rate) || 0,
        reorder: Number(form.reorder) || 0,
        minStock: Number(form.minStock) || 0,
        manufacturerPartNumber: partNo,
      };
      if (!isEdit) {
        payload._skuModule = "Item Master";
        if (!(VG.skuEngine && VG.skuEngine.canManualOverride(roleKey))) delete payload.sku;
        const rec = store.create("items", payload, roleKey);
        if (!rec) return;
        VG.toast("Item " + rec.sku + " created");
      } else {
        if (!(VG.skuEngine && VG.skuEngine.canManualOverride(roleKey))) delete payload.sku;
        const rec = store.update("items", form.id, payload, roleKey);
        if (!rec) return;
        VG.toast("Item " + rec.sku + " updated");
      }
      onSaved();
    }
    return (
      <InternalScreen onBack={onClose} backLabel="Back to items" dirty={dirty && !disabled}
        title={isEdit ? "Edit Item · " + (form.sku || "") : "Add New Item"}
        subtitle={isEdit ? form.name : "SKU auto-generated from Admin numbering rules — select category first"}
        actions={!disabled ? <Button icon="check" onClick={save}>{isEdit ? "Save changes" : "Create item"}</Button> : null}>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider opacity-50 mb-3">Basic details</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="SKU / Item code" hint={isEdit ? "SKU is locked — Super Admin may override if enabled in Admin → SKU Numbering" : "Auto-generated — unique across ERP"}>
                  <Text
                    value={form.sku || (form.categoryId && !isEdit ? store.nextSku(form.categoryId) : "")}
                    onChange={(v) => { if (VG.skuEngine && VG.skuEngine.canManualOverride(roleKey)) set("sku", v); }}
                    disabled={!(VG.skuEngine && VG.skuEngine.canManualOverride(roleKey) && !isEdit)}
                    placeholder="Select category to generate SKU"
                  />
                </Field>
                <Field label="Category" required error={err.categoryId}>
                  <MasterSelect collection="categories" value={form.categoryId} onChange={pickCategory} actorRole={roleKey} can={can("add")} />
                  {form.categoryId && !isEdit && (
                    <p className="text-[11px] opacity-50 mt-1">Type: {typeCodeLabel((store.get("categories", form.categoryId) || {}).typeCode)} → next SKU {store.nextSku(form.categoryId)}</p>
                  )}
                </Field>
                <Field label="Item Name" required error={err.name} className="sm:col-span-2">
                  <Text value={form.name} onChange={(v) => set("name", v)} disabled={disabled} placeholder="e.g. OSRAM Red LED 3W" />
                </Field>
                <Field label="Item Description" hint="Detailed technical/commercial description · up to ~5000 words" className="sm:col-span-2">
                  <Area value={form.description || ""} onChange={(v) => set("description", v)} disabled={disabled} rows={5} placeholder="Make, model, voltage, application, compliance, notes…" />
                </Field>
                <Field label="HSN / SAC"><Text value={form.hsn} onChange={(v) => set("hsn", v)} disabled={disabled} placeholder="85044090" /></Field>
                <Field label="Warranty"><Text value={form.warranty} onChange={(v) => set("warranty", v)} disabled={disabled} placeholder="e.g. 24 months" /></Field>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider opacity-50 mb-3">Manufacturer details</h4>
              <p className="text-[11px] opacity-50 mb-3">Manufacturer + part number must be unique in Item Master (case and spacing normalized).</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Manufacturer" hint="From Manufacturer Master — add new only with permission">
                  <MasterSelect collection="manufacturers" value={form.manufacturerId} onChange={(v) => set("manufacturerId", v)} actorRole={roleKey} can={can("add")} filterFn={(m) => m.active !== false} />
                </Field>
                <Field label="Manufacturer part number" hint="Searchable — shows matching existing items while typing">
                  <PartNumberSuggest value={form.manufacturerPartNumber} onChange={(v) => set("manufacturerPartNumber", v)} manufacturerId={form.manufacturerId} excludeItemId={isEdit ? form.id : null} disabled={disabled} />
                </Field>
                <Field label="Manufacturer item description" className="sm:col-span-2">
                  <Area value={form.manufacturerDesc} onChange={(v) => set("manufacturerDesc", v)} disabled={disabled} placeholder="As per manufacturer catalogue / datasheet" />
                </Field>
                <Field label="Manufacturer model number"><Text value={form.manufacturerModel} onChange={(v) => set("manufacturerModel", v)} disabled={disabled} placeholder="If applicable" /></Field>
                <Field label="Brand name"><Text value={form.brandName} onChange={(v) => set("brandName", v)} disabled={disabled} placeholder="If applicable" /></Field>
                <Field label="Datasheet / document" className="sm:col-span-2">
                  <input ref={sheetRef} type="file" accept=".pdf,image/*" className="hidden" onChange={onDatasheetPick} />
                  <div className="flex flex-wrap items-center gap-2">
                    {form.datasheetName ? <Pill color="var(--accent)">{form.datasheetName}</Pill> : <span className="text-xs opacity-50">No file attached</span>}
                    {!disabled && <>
                      <Button variant="soft" icon="upload" className="!py-1" onClick={() => sheetRef.current && sheetRef.current.click()}>Upload</Button>
                      {form.datasheetName && <Button variant="ghost" icon="trash" className="!py-1" onClick={() => { set("datasheetName", ""); set("datasheetData", ""); }}>Remove</Button>}
                      {form.datasheetData && <Button variant="ghost" icon="eye" className="!py-1" onClick={() => window.open(form.datasheetData, "_blank")}>View</Button>}
                    </>}
                  </div>
                  <p className="text-[11px] opacity-45 mt-1">PDF or image · max 3 MB</p>
                </Field>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider opacity-50 mb-3">Stock & pricing</h4>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Field label="Unit of measure"><Select value={form.unit} onChange={(v) => set("unit", v)} options={unitsOpt().map((u) => ({ value: u, label: u }))} /></Field>
                <Field label="Rate (₹)" required error={err.rate}><Num value={form.rate} onChange={(v) => set("rate", v)} disabled={disabled} /></Field>
                <Field label="GST">
                  <Select value={form.taxId} onChange={(v) => set("taxId", v)} options={store.list("taxes").map((t) => ({ value: t.id, label: t.name }))} />
                </Field>
                <Field label="Reorder level"><Num value={form.reorder} onChange={(v) => set("reorder", v)} disabled={disabled} /></Field>
                <Field label="Minimum stock"><Num value={form.minStock} onChange={(v) => set("minStock", v)} disabled={disabled} /></Field>
                <Field label="Batch / lot tracked">
                  <Select value={form.batchTracked} onChange={(v) => set("batchTracked", v)} options={["Yes", "No"].map((x) => ({ value: x, label: x }))} />
                </Field>
                <Field label="Default storage location" className="sm:col-span-2">
                  <MasterSelect collection="locations" value={form.locationId} onChange={(v) => { setDirty(true); setForm((f) => ({ ...f, locationId: v, itemLocationId: "" })); }} actorRole={roleKey} can={can("add")} />
                </Field>
                <Field label="Default item location" hint="Rack / shelf / bin under the storage location" className="sm:col-span-2">
                  <MasterSelect
                    collection="itemLocations"
                    value={form.itemLocationId}
                    onChange={(v) => set("itemLocationId", v)}
                    actorRole={roleKey}
                    can={can("add")}
                    filterFn={(il) => !form.locationId || il.locationId === form.locationId}
                  />
                </Field>
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider opacity-50 mb-3">Reference image</h4>
            <Card className="p-4 flex flex-col items-center">
              <div className="w-full aspect-square max-h-[280px] rounded-xl glass overflow-hidden grid place-items-center mb-3 bg-black/20">
                {form.image ? (
                  <img src={form.image} alt="Reference" className="w-full h-full object-contain" />
                ) : (
                  <div className="text-center p-6 opacity-50">
                    <Icon name="box" size={48} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No reference image</p>
                    <p className="text-xs mt-1">Upload a photo or drawing for stores &amp; purchase</p>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onImagePick} />
              {!disabled && (
                <div className="flex flex-wrap gap-2 w-full justify-center">
                  <Button variant="soft" icon="upload" onClick={() => fileRef.current && fileRef.current.click()}>Upload image</Button>
                  {form.image && <Button variant="ghost" icon="trash" onClick={() => set("image", "")}>Remove</Button>}
                </div>
              )}
              <p className="text-[11px] opacity-45 mt-3 text-center">JPG or PNG · max 4 MB · resized for storage</p>
            </Card>
          </div>
        </div>
      </InternalScreen>
    );
  }

  /* ================= Masters ================= */
  function ManufacturerForm({ open, onClose, record, roleKey, can, onSaved }) {
    const isEdit = !!(record && record.id);
    const disabled = isEdit && !can("edit");
    const [form, setForm] = useState(() => ({ active: true, ...record }));
    const [err, setErr] = useState({});
    const [dirty, setDirty] = useState(false);
    const set = (k, v) => { setDirty(true); setForm((f) => ({ ...f, [k]: v })); };
    useEffect(() => {
      if (!open) return;
      const base = { active: true, ...record };
      if (!record || !record.id) base.code = store.nextManufacturerCode();
      setForm(base);
      setErr({});
      setDirty(false);
    }, [open, record && record.id]);
    function save() {
      if (disabled) return onClose();
      const e = {};
      if (!form.name) e.name = "Required";
      if (Object.keys(e).length) { setErr(e); return VG.toast("Please fill required fields", "error"); }
      const payload = { ...form, active: form.active !== false };
      if (!isEdit) {
        payload.code = form.code || store.nextManufacturerCode();
        store.create("manufacturers", payload, roleKey);
        VG.toast("Manufacturer " + payload.name + " created");
      } else {
        store.update("manufacturers", form.id, payload, roleKey);
        VG.toast("Manufacturer updated");
      }
      onSaved();
    }
    return (
      <Modal open={open} onClose={onClose} size="lg" dirty={dirty && !disabled}
        title={isEdit ? "Edit Manufacturer · " + (form.code || "") : "New Manufacturer"}
        subtitle="Used on Item Master — duplicate prevention uses manufacturer name + part number"
        actions={!disabled ? <Button icon="check" onClick={save}>{isEdit ? "Save changes" : "Create manufacturer"}</Button> : null}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Code"><Text value={form.code || (!isEdit ? store.nextManufacturerCode() : "")} onChange={() => {}} disabled /></Field>
          <Field label="Manufacturer name" required error={err.name}><Text value={form.name} onChange={(v) => set("name", v)} disabled={disabled} /></Field>
          <Field label="Brand name"><Text value={form.brand} onChange={(v) => set("brand", v)} disabled={disabled} /></Field>
          <Field label="Country"><Text value={form.country} onChange={(v) => set("country", v)} disabled={disabled} /></Field>
          <Field label="Website"><Text value={form.website} onChange={(v) => set("website", v)} disabled={disabled} /></Field>
          <Field label="Contact"><Text value={form.contact} onChange={(v) => set("contact", v)} disabled={disabled} /></Field>
          <Field label="Email" className="sm:col-span-2"><Text type="email" value={form.email} onChange={(v) => set("email", v)} disabled={disabled} /></Field>
        </div>
      </Modal>
    );
  }

  function ManufacturersPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const rows = store.list("manufacturers");
    const cols = [
      { key: "code", label: "Code", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
      { key: "name", label: "Manufacturer" },
      { key: "brand", label: "Brand" },
      { key: "country", label: "Country" },
      { key: "items", label: "Items", render: (r) => store.list("items").filter((i) => i.manufacturerId === r.id).length },
      { key: "active", label: "Status", render: (r) => <Pill color={r.active !== false ? "#34d399" : "#94a3b8"}>{r.active !== false ? "Active" : "Inactive"}</Pill> },
    ];
    if (edit !== null) {
      return <ManufacturerForm open onClose={() => setEdit(null)} record={edit} roleKey={roleKey} can={can} onSaved={() => setEdit(null)} />;
    }
    return (
      <ListPage title="Manufacturer Master" desc="Canonical manufacturer list for Item Master and purchase traceability" onNew={() => setEdit({ active: true })} newLabel="Add Manufacturer" can={can}>
        <RecordTable embedded suppressNew title="Manufacturer List" columns={cols} rows={rows} can={can} printTitle="Manufacturer Master" searchKeys={["name", "code", "brand", "country"]}
          onNew={() => setEdit({ active: true })} onEdit={can("edit") ? (r) => setEdit(r) : null}
          onDelete={can("delete") ? async (r) => {
            const used = store.list("items").some((i) => i.manufacturerId === r.id);
            if (used) return VG.toast("Manufacturer is linked to items — cannot delete", "error");
            if (await VG.confirm({ title: "Delete " + r.name + "?", danger: true, confirmLabel: "Delete" })) { store.remove("manufacturers", r.id, roleKey); VG.toast("Deleted"); }
          } : null} />
      </ListPage>
    );
  }

  function ItemsPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const rows = store.stockSummary();
    const cols = [
      { key: "sku", label: "SKU", render: (r) => <span className="font-mono text-xs">{r.sku}</span> },
      { key: "name", label: "Item Name", render: (r) => (
        <span className="flex items-center gap-2 min-w-0">
          {r.image ? <img src={r.image} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0 border border-white/10" /> : <span className="w-8 h-8 rounded-lg glass shrink-0 grid place-items-center opacity-40"><Icon name="box" size={14} /></span>}
          <span className="truncate">{r.name}</span>
        </span>
      ), csv: (r) => r.name },
      { key: "category", label: "Category", render: (r) => (store.get("categories", r.categoryId) || {}).name, csv: (r) => (store.get("categories", r.categoryId) || {}).name },
      ...mfrCols(),
      { key: "unit", label: "Unit" }, { key: "hsn", label: "HSN" },
      { key: "rate", label: "Rate", render: (r) => inr(r.rate), csv: (r) => r.rate },
      { key: "qty", label: "On hand", render: (r) => <span className={r.below ? "text-rose-400 font-medium" : ""}>{r.qty}</span> },
      { key: "bom", label: "BOM", render: (r) => { const b = store.getDefaultBom && store.getDefaultBom(r.id); return b ? <span className="font-mono text-[10px] opacity-80">{b.no}</span> : "—"; } },
    ];
    if (edit !== null) {
      return <ItemForm open onClose={() => setEdit(null)} record={edit} roleKey={roleKey} can={can} onSaved={() => setEdit(null)} />;
    }
    return (
      <ListPage title="Item Master" desc="Central catalogue — SKU auto-generated · reference images supported" onNew={() => setEdit({ unit: "Nos", taxId: "gst18", batchTracked: "No" })} newLabel="Add Item" can={can}>
        <RecordTable embedded suppressNew title="Item List" columns={cols} rows={rows} can={can} printTitle="Item Master" searchKeys={["sku", "name", "description", "hsn", "manufacturerName", "manufacturerPartNumber", "brandName"]}
          onNew={() => setEdit({ unit: "Nos", taxId: "gst18", batchTracked: "No" })} onView={(r) => setEdit(r)} onEdit={can("edit") ? (r) => setEdit(r) : null}
          onDelete={can("delete") ? async (r) => { if (await VG.confirm({ title: "Delete " + r.sku + "?", danger: true, confirmLabel: "Delete" })) { store.remove("items", r.id, roleKey); VG.toast("Deleted"); } } : null} />
      </ListPage>
    );
  }

  function CategoryForm({ open, onClose, record, roleKey, can, onSaved }) {
    const isEdit = !!(record && record.id);
    const disabled = isEdit && !can("edit");
    const [form, setForm] = useState(() => ({ typeCode: "RWM", ...record }));
    const [err, setErr] = useState({});
    const [dirty, setDirty] = useState(false);
    const set = (k, v) => { setDirty(true); setForm((f) => ({ ...f, [k]: v })); };
    useEffect(() => {
      if (!open) return;
      const base = { typeCode: "RWM", ...record };
      if (!record || !record.id) base.code = store.nextCategoryCode();
      setForm(base);
      setErr({});
      setDirty(false);
    }, [open, record && record.id]);
    function save() {
      if (disabled) return onClose();
      const e = {};
      if (!form.name) e.name = "Required";
      if (!form.typeCode) e.typeCode = "Required";
      if (Object.keys(e).length) { setErr(e); return VG.toast("Please fill required fields", "error"); }
      const payload = { ...form, typeCode: String(form.typeCode).toUpperCase() };
      if (!isEdit) {
        payload.code = form.code || store.nextCategoryCode();
        store.create("categories", payload, roleKey);
        VG.toast("Category " + payload.code + " created");
      } else {
        store.update("categories", form.id, payload, roleKey);
        VG.toast("Category " + form.code + " updated");
      }
      onSaved();
    }
    return (
      <Modal open={open} onClose={onClose} size="lg" dirty={dirty && !disabled}
        title={isEdit ? "Edit Category · " + (form.code || "") : "New Category"}
        subtitle={isEdit ? form.name : "Category code continues automatically (CAT-8 → CAT-9)"}
        actions={!disabled ? <Button icon="check" onClick={save}>{isEdit ? "Save changes" : "Create category"}</Button> : null}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Category code" hint={isEdit ? "Master category code" : "Auto-assigned from last saved code"}>
            <Text value={form.code || (!isEdit ? store.nextCategoryCode() : "")} onChange={() => {}} disabled />
          </Field>
          <Field label="Stock type code (for SKU)" required error={err.typeCode} hint="Used in item SKU after GLS — e.g. RWM, FNG">
            <Select value={form.typeCode || "RWM"} onChange={(v) => set("typeCode", v)} options={typeCodeOptions()} disabled={disabled} />
          </Field>
          <Field label="Category name" required error={err.name} className="sm:col-span-2">
            <Text value={form.name} onChange={(v) => set("name", v)} disabled={disabled} placeholder="e.g. Raw Material — Aluminium" />
          </Field>
          {!isEdit && form.typeCode && (
            <div className="sm:col-span-2 text-xs rounded-lg p-2.5" style={{ background: "var(--accent-soft)" }}>
              New items in this category will get SKU like <b>{store.nextSkuByType(form.typeCode)}</b> (next available number for this type).
            </div>
          )}
        </div>
      </Modal>
    );
  }

  function CategoriesPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const rows = store.list("categories").map((c) => ({ ...c, count: store.list("items").filter((i) => i.categoryId === c.id).length }));
    const cols = [
      { key: "code", label: "Code", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
      { key: "typeCode", label: "SKU type", render: (r) => <Pill color="var(--accent)">{r.typeCode || "RWM"}</Pill>, csv: (r) => r.typeCode },
      { key: "name", label: "Category" },
      { key: "count", label: "Items" },
    ];
    if (edit !== null) {
      return <CategoryForm open onClose={() => setEdit(null)} record={edit} roleKey={roleKey} can={can} onSaved={() => setEdit(null)} />;
    }
    return (
      <ListPage title="Category Master" desc="Category code CAT-n auto · SKU type RWM, FNG, PKG…" onNew={() => setEdit({ typeCode: "RWM" })} newLabel="Add Category" can={can}>
        <RecordTable embedded suppressNew title="Category List" columns={cols} rows={rows} can={can} printTitle="Categories" searchKeys={["name", "code", "typeCode"]}
          onNew={() => setEdit({ typeCode: "RWM" })} onEdit={can("edit") ? (r) => setEdit(r) : null}
          onDelete={can("delete") ? async (r) => { if (await VG.confirm({ title: "Delete category?", danger: true, confirmLabel: "Delete" })) { store.remove("categories", r.id, roleKey); VG.toast("Deleted"); } } : null} />
      </ListPage>
    );
  }

  function SuppliersPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const rows = store.list("suppliers");
    const cols = [{ key: "code", label: "Code", render: (r) => <span className="font-mono text-xs">{r.code}</span> }, { key: "name", label: "Supplier" }, { key: "contact", label: "Contact" }, { key: "gstin", label: "GSTIN", render: (r) => <span className="font-mono text-xs">{r.gstin}</span> }, { key: "category", label: "Grade", render: (r) => <Pill color="#14b8a6">{r.category}</Pill> }, { key: "rating", label: "Rating" }];
    function save(form) { if (!form.name || !form.gstin) return VG.toast("Name & GSTIN required", "error"); if (form.id) store.update("suppliers", form.id, form, roleKey); else store.create("suppliers", { ...form, code: store.nextSupplierCode ? store.nextSupplierCode() : store.nextMasterCode("SUPP") }, roleKey); VG.toast("Saved"); setEdit(null); }
    const supplierFields = [{ k: "name", l: "Company name", req: true }, { k: "contact", l: "Contact person" }, { k: "phone", l: "Phone" }, { k: "email", l: "Email" }, { k: "gstin", l: "GSTIN", req: true }, { k: "category", l: "Grade", select: ["A-grade", "B-grade", "C-grade", "Watch"] }, { k: "rating", l: "Rating", num: true }, { k: "address", l: "Address", area: true, full: true }];
    if (edit) {
      return <MasterForm title="Supplier" open onClose={() => setEdit(null)} record={edit} onSave={save} roleKey={roleKey} can={can} fields={supplierFields} />;
    }
    return (
      <ListPage title="Supplier / Vendor Master" desc="Shared across Purchase, Inventory & Material Issue" onNew={() => setEdit({ category: "A-grade", rating: 4 })} newLabel="Add Supplier" can={can}>
        <RecordTable embedded suppressNew title="Supplier List" columns={cols} rows={rows} can={can} printTitle="Supplier Master" searchKeys={["name", "code", "gstin"]}
          onNew={() => setEdit({ category: "A-grade", rating: 4 })} onView={(r) => setEdit(r)} onEdit={can("edit") ? (r) => setEdit(r) : null}
          onDelete={can("delete") ? async (r) => { if (await VG.confirm({ title: "Delete supplier?", danger: true, confirmLabel: "Delete" })) { store.remove("suppliers", r.id, roleKey); VG.toast("Deleted"); } } : null} />
      </ListPage>
    );
  }

  function LocationsPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const rows = store.list("locations");
    const cols = [{ key: "code", label: "Code", render: (r) => <span className="font-mono text-xs">{r.code}</span> }, { key: "name", label: "Storage location" }, { key: "locType", label: "Type", render: (r) => r.locType || "—" }];
    function save(form) { if (!form.name) return VG.toast("Name required", "error"); if (form.id) store.update("locations", form.id, form, roleKey); else store.create("locations", form, roleKey); VG.toast("Saved"); setEdit(null); }
    const locFields = [{ k: "code", l: "Code", req: true }, { k: "name", l: "Storage location name", req: true }];
    if (edit) {
      return <MasterForm title="Storage Location" open onClose={() => setEdit(null)} record={edit} onSave={save} fields={locFields} roleKey={roleKey} can={can} />;
    }
    return (
      <ListPage title="Storage Location Master" desc="Warehouses and stores — item locations (rack / shelf / bin) are managed separately" onNew={() => setEdit({})} newLabel="Add Storage Location" can={can}>
        <RecordTable embedded suppressNew title="Storage Location List" columns={cols} rows={rows} can={can} printTitle="Storage Locations" searchKeys={["name", "code"]}
          onNew={() => setEdit({})} onEdit={can("edit") ? (r) => setEdit(r) : null}
          onDelete={can("delete") ? async (r) => { if (await VG.confirm({ title: "Delete location?", danger: true, confirmLabel: "Delete" })) { store.remove("locations", r.id, roleKey); VG.toast("Deleted"); } } : null} />
      </ListPage>
    );
  }

  function ItemLocationsPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const rows = store.list("itemLocations");
    const cols = [
      { key: "code", label: "Code", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
      { key: "locationId", label: "Storage location", render: (r) => locName(r.locationId), csv: (r) => locName(r.locationId) },
      { key: "name", label: "Item location" },
      { key: "rack", label: "Rack" },
      { key: "shelf", label: "Shelf" },
      { key: "bin", label: "Bin" },
      { key: "zone", label: "Zone" },
      { key: "status", label: "Status", render: (r) => <Pill color={r.status === "Inactive" ? "#94a3b8" : "#34d399"}>{r.status || "Active"}</Pill> },
    ];
    function save(form) {
      if (!form.name || !form.locationId) return VG.toast("Storage location and name required", "error");
      const payload = { ...form, status: form.status || "Active", code: form.code || (store.nextMasterCode ? store.nextMasterCode("ILOC", { collection: "itemLocations", field: "code", pad: 3 }) : ("ILOC" + String(store.list("itemLocations").length + 1).padStart(3, "0"))) };
      if (form.id) store.update("itemLocations", form.id, payload, roleKey);
      else store.create("itemLocations", payload, roleKey);
      VG.toast("Item location saved");
      setEdit(null);
    }
    const fields = [
      { k: "locationId", l: "Storage location", req: true },
      { k: "name", l: "Item location name", req: true },
      { k: "rack", l: "Rack" },
      { k: "shelf", l: "Shelf" },
      { k: "bin", l: "Bin" },
      { k: "zone", l: "Zone" },
      { k: "description", l: "Description" },
      { k: "status", l: "Status" },
    ];
    if (edit !== null) {
      return (
        <InternalScreen onBack={() => setEdit(null)} backLabel="Back to item locations" title={edit.id ? "Edit Item Location" : "New Item Location"} dirty={false}
          actions={<Button icon="check" onClick={() => {
            const form = edit;
            save(form);
          }}>Save</Button>}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Code"><Text value={edit.code || ""} onChange={(v) => setEdit((p) => ({ ...p, code: v }))} /></Field>
            <Field label="Status"><Select value={edit.status || "Active"} onChange={(v) => setEdit((p) => ({ ...p, status: v }))} options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]} /></Field>
            <Field label="Storage location" required className="sm:col-span-2"><MasterSelect collection="locations" value={edit.locationId} onChange={(v) => setEdit((p) => ({ ...p, locationId: v }))} actorRole={roleKey} can={can("add")} /></Field>
            <Field label="Item location name" required className="sm:col-span-2"><Text value={edit.name || ""} onChange={(v) => setEdit((p) => ({ ...p, name: v }))} placeholder="Rack A / Shelf 2 / Bin 05" /></Field>
            <Field label="Rack"><Text value={edit.rack || ""} onChange={(v) => setEdit((p) => ({ ...p, rack: v }))} /></Field>
            <Field label="Shelf"><Text value={edit.shelf || ""} onChange={(v) => setEdit((p) => ({ ...p, shelf: v }))} /></Field>
            <Field label="Bin"><Text value={edit.bin || ""} onChange={(v) => setEdit((p) => ({ ...p, bin: v }))} /></Field>
            <Field label="Zone"><Text value={edit.zone || ""} onChange={(v) => setEdit((p) => ({ ...p, zone: v }))} /></Field>
            <Field label="Description" className="sm:col-span-2"><Area value={edit.description || ""} onChange={(v) => setEdit((p) => ({ ...p, description: v }))} rows={2} /></Field>
          </div>
        </InternalScreen>
      );
    }
    return (
      <ListPage title="Item Location Master" desc="Rack, shelf, bin and zone under each storage location" onNew={() => setEdit({ status: "Active" })} newLabel="Add Item Location" can={can}>
        <RecordTable embedded suppressNew title="Item Location List" columns={cols} rows={rows} can={can} printTitle="Item Locations" searchKeys={["name", "code", "rack", "bin", "zone"]}
          onNew={() => setEdit({ status: "Active" })} onEdit={can("edit") ? (r) => setEdit(r) : null}
          onDelete={can("delete") ? async (r) => { if (await VG.confirm({ title: "Delete item location?", danger: true, confirmLabel: "Delete" })) { store.remove("itemLocations", r.id, roleKey); VG.toast("Deleted"); } } : null} />
      </ListPage>
    );
  }

  /* ================= Stock ledger ================= */
  const LEDGER_TYPE_COLOR = { opening: "#64748b", "opening-balance": "#64748b", receipt: "#34d399", issue: "#f87171", "transfer-in": "#60a5fa", "transfer-out": "#f59e0b", return: "#22d3ee", scrap: "#ef4444", adjustment: "#a78bfa" };
  const LEDGER_TYPE_OPTS = ["opening", "opening-balance", "receipt", "issue", "transfer-in", "transfer-out", "return", "scrap", "adjustment"];

  function ItemLedgerDetail({ itemId, roleKey, can, onBack }) {
    VG.useDB();
    const meta = store.itemLedgerMeta ? store.itemLedgerMeta(itemId) : { available: 0 };
    const [filters, setFilters] = useState({});
    const setF = (k, v) => setFilters((p) => ({ ...p, [k]: v }));
    const rows = store.itemLedgerRows ? store.itemLedgerRows(itemId, filters) : [];
    const fmtDate = (d) => (VG.fmt.formatDate ? VG.fmt.formatDate(d) : d);
    const cols = [
      { key: "date", label: "Date", render: (r) => fmtDate(r.date), csv: (r) => r.date },
      { key: "typeLabel", label: "Transaction", render: (r) => <Pill color={LEDGER_TYPE_COLOR[r.type] || "#94a3b8"}>{r.typeLabel || r.type}</Pill>, csv: (r) => r.typeLabel || r.type },
      { key: "qty", label: "In/Out", render: (r) => <span className={r.qty < 0 ? "text-rose-400" : "text-emerald-400"}>{r.qty > 0 ? "+" : ""}{r.qty}</span> },
      { key: "balance", label: "Balance", render: (r) => <span className="font-medium">{r.balance}</span> },
      { key: "locationId", label: "Store", render: (r) => locName(r.locationId), csv: (r) => locName(r.locationId) },
      { key: "itemLocationId", label: "Item loc.", render: (r) => itemLocName(r.itemLocationId), csv: (r) => itemLocName(r.itemLocationId) },
      { key: "ref", label: "Document" },
      { key: "batch", label: "Batch" },
      { key: "by", label: "By" },
    ];
    function printLedger() {
      fx.printTable("Item Ledger — " + meta.sku, cols.map((c) => ({ key: c.key, label: c.label, csv: c.csv })), rows, { subtitle: meta.name });
    }
    function exportLedger() {
      if (exportCSV) exportCSV("item-ledger-" + meta.sku, cols, rows);
      else printLedger();
    }
    function viewLinked(r) {
      const link = store.linkedDocForLedger ? store.linkedDocForLedger(r) : null;
      if (!link || !link.rec) return VG.toast("No linked document for " + (r.ref || "entry"), "info");
      VG.toast("Linked: " + (link.rec.no || link.rec.id) + " (" + (link.coll || "doc") + ")");
    }
    return (
      <div className="space-y-4">
        <PageHead title={"Item Ledger — " + meta.sku} desc={meta.name}>
          <div className="flex gap-2 flex-wrap">
            <Button variant="soft" onClick={onBack}>Back to stock ledger</Button>
            {can("print") && <Button variant="soft" icon="printer" onClick={printLedger}>Print</Button>}
            {can("export") && <Button variant="soft" icon="download" onClick={exportLedger}>Export Excel</Button>}
          </div>
        </PageHead>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[["Opening", meta.opening], ["Stock in", meta.stockIn], ["Stock out", meta.stockOut], ["Closing", meta.closing]].map(([l, v]) => (
            <Card key={l} className="p-4"><div className="text-[11px] uppercase opacity-60">{l}</div><div className="text-xl font-semibold mt-1">{v} {meta.unit}</div></Card>
          ))}
        </div>
        <Card className="p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div><span className="opacity-60">Available</span><div className="font-semibold">{meta.available} {meta.unit}</div></div>
          <div><span className="opacity-60">Reserved</span><div className="font-semibold">{meta.reserved} {meta.unit}</div></div>
          <div><span className="opacity-60">Rejected / scrap</span><div className="font-semibold">{meta.rejected} {meta.unit}</div></div>
          <div><span className="opacity-60">Valuation</span><div className="font-semibold">{inr(meta.value)}</div></div>
          <div className="sm:col-span-2"><span className="opacity-60">Store location</span><div>{locName(meta.locationId)}</div></div>
          <div className="sm:col-span-2"><span className="opacity-60">Item location</span><div>{itemLocName(meta.itemLocationId)}</div></div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase opacity-60 mb-3">Filters</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Date from"><DateF value={filters.dateFrom || ""} onChange={(v) => setF("dateFrom", v)} /></Field>
            <Field label="Date to"><DateF value={filters.dateTo || ""} onChange={(v) => setF("dateTo", v)} /></Field>
            <Field label="Month (YYYY-MM)"><Text value={filters.month || ""} onChange={(v) => setF("month", v)} placeholder="2026-06" /></Field>
            <Field label="Financial year"><Text value={filters.fy || ""} onChange={(v) => setF("fy", v)} placeholder="2627" /></Field>
            <Field label="Transaction type"><Select value={filters.type || ""} onChange={(v) => setF("type", v)} options={[{ value: "", label: "All" }].concat(LEDGER_TYPE_OPTS.map((t) => ({ value: t, label: store.ledgerTypeLabel ? store.ledgerTypeLabel(t) : t })))} /></Field>
            <Field label="Document no."><Text value={filters.ref || ""} onChange={(v) => setF("ref", v)} /></Field>
            <Field label="Store location"><MasterSelect collection="locations" value={filters.locationId || ""} onChange={(v) => setF("locationId", v)} actorRole={roleKey} allowCreate={false} /></Field>
            <Field label="Item location"><Select value={filters.itemLocationId || ""} onChange={(v) => setF("itemLocationId", v)} options={[{ value: "", label: "All" }].concat((store.itemLocationsForStorage ? store.itemLocationsForStorage(filters.locationId, false) : store.list("itemLocations")).map((il) => ({ value: il.id, label: itemLocName(il.id) })))} /></Field>
            <Field label="Batch / lot"><Text value={filters.batch || ""} onChange={(v) => setF("batch", v)} /></Field>
            <Field label="Category"><MasterSelect collection="categories" value={filters.categoryId || ""} onChange={(v) => setF("categoryId", v)} actorRole={roleKey} allowCreate={false} /></Field>
            <Field label="Created by"><Text value={filters.createdBy || ""} onChange={(v) => setF("createdBy", v)} /></Field>
          </div>
          <div className="mt-3"><Button variant="ghost" onClick={() => setFilters({})}>Clear filters</Button></div>
        </Card>
        <RecordTable title="Stock movements" columns={cols} rows={rows.slice().reverse()} can={can} printTitle={"Item Ledger " + meta.sku} searchKeys={["ref", "batch"]}
          onView={can("view") ? viewLinked : null} empty="No movements for selected filters" />
      </div>
    );
  }

  function LedgerPage({ roleKey, can }) {
    VG.useDB();
    const [viewItem, setViewItem] = useState("");
    const [filters, setFilters] = useState({});
    const setF = (k, v) => setFilters((p) => ({ ...p, [k]: v }));
    const summary = store.stockSummary();
    if (viewItem) return <ItemLedgerDetail itemId={viewItem} roleKey={roleKey} can={can} onBack={() => setViewItem("")} />;
    let entries = store.filterLedgerEntries ? store.filterLedgerEntries(store.list("stockLedger"), filters) : store.list("stockLedger");
    entries = entries.slice().reverse();
    const ecols = [
      { key: "date", label: "Date" }, { key: "itemId", label: "Item", render: (r) => itemName(r.itemId), csv: (r) => itemName(r.itemId) },
      { key: "locationId", label: "Storage", render: (r) => locName(r.locationId), csv: (r) => locName(r.locationId) },
      { key: "itemLocationId", label: "Item location", render: (r) => itemLocName(r.itemLocationId), csv: (r) => itemLocName(r.itemLocationId) },
      { key: "type", label: "Type", render: (r) => <Pill color={LEDGER_TYPE_COLOR[r.type] || "#94a3b8"}>{store.ledgerTypeLabel ? store.ledgerTypeLabel(r.type) : r.type}</Pill>, csv: (r) => r.type },
      { key: "qty", label: "Qty", render: (r) => <span className={r.qty < 0 ? "text-rose-400" : "text-emerald-400"}>{r.qty > 0 ? "+" : ""}{r.qty}</span> },
      { key: "ref", label: "Reference" }, { key: "batch", label: "Batch" }, { key: "by", label: "By" },
    ];
    return (
      <div className="space-y-4">
        <PageHead title="Stock Ledger" desc="Click any item row to open full item ledger with stock in/out history">
          {can("settings") && store.reconcileStock && (
            <Button variant="soft" icon="refresh" onClick={async () => {
              const res = store.reconcileStock(roleKey);
              if (res.ok) VG.toast("Stock reconciliation OK — all balances match ledger");
              else VG.toast("Stock mismatch detected in " + res.count + " item(s). Check admin report.", "warn");
            }}>Recalculate stock balance</Button>
          )}
        </PageHead>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[["SKUs", summary.length], ["Stock value", inr(summary.reduce((s, x) => s + x.value, 0))], ["Below min", summary.filter((x) => x.below).length], ["Reorder due", summary.filter((x) => x.reorderNeeded).length]].map(([l, v]) => (
            <Card key={l} className="p-4"><div className="text-[11px] uppercase tracking-wider opacity-60">{l}</div><div className="text-2xl font-semibold font-display mt-1">{v}</div></Card>
          ))}
        </div>
        <Card className="p-0 overflow-hidden">
          <div className="p-4 font-semibold text-sm border-b border-white/10">Stock summary — click a row for item ledger</div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase opacity-55 border-b border-white/10"><th className="px-4 py-2">SKU</th><th className="px-4 py-2">Item</th><th className="px-4 py-2 text-right">On hand</th><th className="px-4 py-2 text-right">Min</th><th className="px-4 py-2 text-right">Reorder</th><th className="px-4 py-2 text-right">Value</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody>{summary.map((s) => <tr key={s.id} className="border-b border-white/5 chrome-hover cursor-pointer" onClick={() => setViewItem(s.id)}><td className="px-4 py-2.5 font-mono text-xs">{s.sku}</td><td className="px-4 py-2.5">{s.name}</td><td className="px-4 py-2.5 text-right font-medium">{s.qty}</td><td className="px-4 py-2.5 text-right opacity-60">{s.minStock}</td><td className="px-4 py-2.5 text-right opacity-60">{s.reorder}</td><td className="px-4 py-2.5 text-right">{inr(s.value)}</td><td className="px-4 py-2.5">{s.below ? <Pill color="#ef4444">Below min</Pill> : s.reorderNeeded ? <Pill color="#f59e0b">Reorder</Pill> : <Pill color="#34d399">OK</Pill>}</td></tr>)}</tbody>
          </table></div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase opacity-60 mb-3">Global ledger filters</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Date from"><DateF value={filters.dateFrom || ""} onChange={(v) => setF("dateFrom", v)} /></Field>
            <Field label="Date to"><DateF value={filters.dateTo || ""} onChange={(v) => setF("dateTo", v)} /></Field>
            <Field label="Item"><MasterSelect collection="items" value={filters.itemId || ""} onChange={(v) => setF("itemId", v)} actorRole={roleKey} allowCreate={false} /></Field>
            <Field label="Transaction type"><Select value={filters.type || ""} onChange={(v) => setF("type", v)} options={[{ value: "", label: "All" }].concat(LEDGER_TYPE_OPTS.map((t) => ({ value: t, label: store.ledgerTypeLabel ? store.ledgerTypeLabel(t) : t })))} /></Field>
            <Field label="Store location"><MasterSelect collection="locations" value={filters.locationId || ""} onChange={(v) => setF("locationId", v)} actorRole={roleKey} allowCreate={false} /></Field>
            <Field label="Document no."><Text value={filters.ref || ""} onChange={(v) => setF("ref", v)} /></Field>
          </div>
        </Card>
        <RecordTable title="All stock movements" columns={ecols} rows={entries} can={can} printTitle="Stock Ledger" searchKeys={["ref", "batch"]} />
      </div>
    );
  }

  /* ================= Material Receipt ================= */
  function blankGrnLine() {
    return { key: Math.random().toString(36).slice(2), itemId: "", qtyInvoiced: "", qtyReceived: "", unit: "", qtyAccepted: "", qtyRejected: "", locationId: "", itemLocationId: "", remarks: "", rate: 0, taxId: "" };
  }
  const GRN_TABLE_HEAD = (
    <tr className="text-left border-b border-white/10 text-[11px] uppercase opacity-70">
      <th className="w-10 px-2">Sr.</th>
      <th className="min-w-[200px] px-2">Item SKU</th>
      <th className="min-w-[160px] px-2">Description</th>
      <th className="w-20 px-2">HSN/SAC</th>
      <th className="w-24 px-2">Qty Invoiced</th>
      <th className="w-24 px-2">Qty Received</th>
      <th className="w-16 px-2">Unit</th>
      <th className="w-24 px-2">Accepted</th>
      <th className="w-24 px-2">Rejected</th>
      <th className="min-w-[140px] px-2">Storage Location</th>
      <th className="min-w-[140px] px-2">Item Location</th>
      <th className="min-w-[120px] px-2">Remarks</th>
      <th className="w-10" />
    </tr>
  );
  function grnLineDesc(itemId) {
    if (!itemId) return "";
    if (VG.itemDisplay && VG.itemDisplay.itemDescription) return VG.itemDisplay.itemDescription(itemId);
    const it = store.get("items", itemId) || {};
    return it.description || it.name || "";
  }
  function grnItemsLabel(r) {
    const lines = store.normalizeReceiptLines ? store.normalizeReceiptLines(r) : [];
    if (lines.length <= 1) return itemName(lines[0] ? lines[0].itemId : r.itemId);
    return itemName(lines[0].itemId) + " +" + (lines.length - 1) + " more";
  }
  function ReceiptBuilder({ open, onClose, roleKey, can }) {
    const [f, setF] = useState({ date: today(), qcRequired: "Yes", qcStatus: "Pending" });
    const [lines, setLines] = useState([blankGrnLine()]);
    const [dirty, setDirty] = useState(false);
    const canEditUnit = can("approve");
    const set = (k, v) => { setDirty(true); setF((p) => ({ ...p, [k]: v })); };
    const setLine = (key, patch) => { setDirty(true); setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r))); };
    const addLine = () => setLines((rows) => [...rows, blankGrnLine()]);
    const delLine = (key) => { if (lines.length <= 1) return; setLines((rows) => rows.filter((r) => r.key !== key)); };
    function pickItem(key, id) {
      const it = store.get("items", id) || {};
      setLine(key, { itemId: id, unit: it.unit || "Nos", rate: it.rate || 0, taxId: it.taxId || "gst18", locationId: it.locationId || "", itemLocationId: it.itemLocationId || "" });
    }
    function pickStorage(key, locationId) { setLine(key, { locationId, itemLocationId: "" }); }
    const lineTotals = lines.map((l) => {
      const acc = l.qtyAccepted === "" ? (Number(l.qtyReceived) || 0) : (Number(l.qtyAccepted) || 0);
      return acc * (Number(l.rate) || 0) * (1 + taxRate(l.taxId) / 100);
    });
    const total = lineTotals.reduce((s, v) => s + v, 0);
    function validateLines() {
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const n = i + 1;
        if (!ln.itemId) return "Row " + n + ": select item SKU.";
        if (!ln.locationId) return "Row " + n + ": select storage location.";
        const qi = Number(ln.qtyInvoiced);
        const qr = Number(ln.qtyReceived);
        if (!Number.isFinite(qi) || qi < 0) return "Row " + n + ": qty invoiced must be ≥ 0.";
        if (!Number.isFinite(qr) || qr <= 0) return "Row " + n + ": qty received must be > 0.";
        const acc = ln.qtyAccepted === "" ? qr : Number(ln.qtyAccepted);
        const rej = ln.qtyRejected === "" ? 0 : Number(ln.qtyRejected);
        if (!Number.isFinite(acc) || acc < 0 || !Number.isFinite(rej) || rej < 0) return "Row " + n + ": invalid accepted/rejected qty.";
        if (Math.abs(acc + rej - qr) > 0.0001) return "Row " + n + ": accepted + rejected must equal qty received.";
        const locOpts = store.itemLocationsForStorage ? store.itemLocationsForStorage(ln.locationId) : [];
        if (ln.itemLocationId && locOpts.length && !locOpts.some((x) => x.id === ln.itemLocationId)) return "Row " + n + ": item location does not belong to selected storage.";
      }
      return "";
    }
    function save() {
      if (!f.supplierId) return VG.toast("Select supplier from master", "error");
      const lineErr = validateLines();
      if (lineErr) return VG.toast(lineErr, "error");
      const payload = {
        ...f,
        lines: lines.map((ln, idx) => {
          const qr = Number(ln.qtyReceived) || 0;
          const acc = ln.qtyAccepted === "" ? qr : Number(ln.qtyAccepted);
          const rej = ln.qtyRejected === "" ? 0 : Number(ln.qtyRejected);
          return {
            lineNo: idx + 1, itemId: ln.itemId, qtyInvoiced: Number(ln.qtyInvoiced) || 0, qtyReceived: qr, qtyAccepted: acc, qtyRejected: rej,
            unit: ln.unit || (store.get("items", ln.itemId) || {}).unit || "Nos", rate: Number(ln.rate) || 0, taxId: ln.taxId,
            locationId: ln.locationId, itemLocationId: ln.itemLocationId || "", remarks: ln.remarks || "",
          };
        }),
        totalValue: total,
      };
      const rec = store.postReceipt(payload, roleKey);
      if (!rec) return VG.toast("Could not post receipt", "error");
      if (f.qcRequired === "Yes") VG.toast("Receipt " + rec.no + " posted · sent to Quality for inspection", "success");
      else VG.toast("Receipt " + rec.no + " posted · stock updated");
      onClose();
    }
    function previewDoc() {
      printDocument(receiptDoc({
        ...f, no: f.no || "DRAFT", totalValue: total,
        lines: lines.map((ln, idx) => ({
          lineNo: idx + 1, itemId: ln.itemId, qtyInvoiced: Number(ln.qtyInvoiced) || 0, qtyReceived: Number(ln.qtyReceived) || 0,
          qtyAccepted: ln.qtyAccepted === "" ? Number(ln.qtyReceived) || 0 : Number(ln.qtyAccepted),
          qtyRejected: ln.qtyRejected === "" ? 0 : Number(ln.qtyRejected), unit: ln.unit, rate: ln.rate,
          locationId: ln.locationId, itemLocationId: ln.itemLocationId, remarks: ln.remarks, lineValue: lineTotals[idx] || 0,
        })),
      }), "preview");
    }
    return (
      <InternalScreen onBack={onClose} backLabel="Back to receipts" dirty={dirty} title="Material Receipt (GRN)" subtitle="Multi-item GRN · stock ledger updates on post"
        footer={<><Button variant="soft" icon="eye" onClick={previewDoc}>Preview GRN</Button><Button icon="check" onClick={save}>Post receipt</Button></>}>
        <div className="grid lg:grid-cols-3 gap-3">
          <Field label="Receipt date" required><DateF value={f.date} onChange={(v) => set("date", v)} /></Field>
          <Field label="Supplier (master)" required><MasterSelect collection="suppliers" value={f.supplierId} onChange={(v) => set("supplierId", v)} actorRole={roleKey} can={can("add")} /></Field>
          <Field label="PO reference"><Text value={f.poRef} onChange={(v) => set("poRef", v)} placeholder="PO-xxxx" /></Field>
          <Field label="Invoice number"><Text value={f.invoiceNo} onChange={(v) => set("invoiceNo", v)} /></Field>
          <Field label="Invoice date"><DateF value={f.invoiceDate} onChange={(v) => set("invoiceDate", v)} /></Field>
          <Field label="Challan number"><Text value={f.challanNo} onChange={(v) => set("challanNo", v)} /></Field>
          <Field label="Transporter"><Text value={f.transporter} onChange={(v) => set("transporter", v)} /></Field>
          <Field label="Vehicle number"><Text value={f.vehicleNo} onChange={(v) => set("vehicleNo", v)} /></Field>
          <Field label="LR number"><Text value={f.lrNo} onChange={(v) => set("lrNo", v)} /></Field>
          <Field label="QC required"><Select value={f.qcRequired} onChange={(v) => set("qcRequired", v)} options={[{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }]} /></Field>
          <Field label="Header remarks" className="lg:col-span-3"><Area value={f.remarks} onChange={(v) => set("remarks", v)} rows={2} /></Field>
        </div>
        <TransactionLinesShell title="GRN line items" onAddLine={addLine} addLabel="Add item" minWidth={1380} headerRow={GRN_TABLE_HEAD}>
          {lines.map((l, idx) => {
            const item = store.get("items", l.itemId) || {};
            const ilOpts = store.itemLocationsForStorage ? store.itemLocationsForStorage(l.locationId) : [];
            return (
              <tr key={l.key} className="border-b border-white/5 align-top">
                <td className="px-2 py-1.5 text-xs opacity-70">{idx + 1}</td>
                <td className="min-w-[200px] px-2 py-1.5"><MasterSelect variant="line" collection="items" value={l.itemId} onChange={(id) => pickItem(l.key, id)} actorRole={roleKey} can={can("add")} /></td>
                <td className="min-w-[160px] px-2 py-1.5"><div className="text-sm leading-snug py-1 pr-2 whitespace-pre-wrap">{grnLineDesc(l.itemId) || <span className="opacity-40">—</span>}</div></td>
                <td className="font-mono text-xs px-2 py-1.5">{item.hsn || "—"}</td>
                <td className="px-2 py-1.5"><Num data-line-qty value={l.qtyInvoiced} onChange={(v) => setLine(l.key, { qtyInvoiced: v })} /></td>
                <td className="px-2 py-1.5"><Num value={l.qtyReceived} onChange={(v) => setLine(l.key, { qtyReceived: v })} /></td>
                <td className="px-2 py-1.5">{canEditUnit ? <Text value={l.unit} onChange={(v) => setLine(l.key, { unit: v })} /> : <span className="text-sm opacity-80 py-2 inline-block">{l.unit || "—"}</span>}</td>
                <td className="px-2 py-1.5"><Num value={l.qtyAccepted} onChange={(v) => setLine(l.key, { qtyAccepted: v })} placeholder={l.qtyReceived || "0"} /></td>
                <td className="px-2 py-1.5"><Num value={l.qtyRejected} onChange={(v) => setLine(l.key, { qtyRejected: v })} placeholder="0" /></td>
                <td className="min-w-[140px] px-2 py-1.5"><MasterSelect collection="locations" value={l.locationId} onChange={(v) => pickStorage(l.key, v)} actorRole={roleKey} can={can("add")} /></td>
                <td className="min-w-[140px] px-2 py-1.5">
                  <select className="vg-input w-full text-xs" value={l.itemLocationId || ""} disabled={!l.locationId} onChange={(e) => setLine(l.key, { itemLocationId: e.target.value })}>
                    <option value="">—</option>
                    {ilOpts.map((il) => <option key={il.id} value={il.id}>{itemLocName(il.id)}</option>)}
                  </select>
                </td>
                <td className="min-w-[120px] px-2 py-1.5"><Text value={l.remarks} onChange={(v) => setLine(l.key, { remarks: v })} placeholder="Row note…" /></td>
                <td className="px-2 py-1.5"><button type="button" onClick={() => delLine(l.key)} disabled={lines.length <= 1} className="p-1 rounded chrome-hover hover:text-rose-400 disabled:opacity-30" title="Remove row"><Icon name="trash" size={14} /></button></td>
              </tr>
            );
          })}
        </TransactionLinesShell>
        <div className="text-right text-sm">Total value: <b>{inr(total)}</b> · {lines.length} item row(s)</div>
      </InternalScreen>
    );
  }
  function receiptDoc(r) {
    const supp = store.get("suppliers", r.supplierId) || {};
    const docLines = store.normalizeReceiptLines ? store.normalizeReceiptLines(r) : [];
    const rowsHtml = docLines.map((ln) => {
      const acc = ln.qtyAccepted != null ? ln.qtyAccepted : ln.qtyReceived;
      return `<tr>
        <td>${ln.lineNo || ""}</td>
        <td>${itemNameSkuPdf(ln.itemId)}</td>
        <td>${(VG.itemDisplay && VG.itemDisplay.nl2br(VG.itemDisplay.itemDescription(ln.itemId))) || ln.description || ""}</td>
        <td>${ln.hsn || (store.get("items", ln.itemId) || {}).hsn || ""}</td>
        <td class="vg-right">${ln.qtyInvoiced != null ? ln.qtyInvoiced : "—"}</td>
        <td class="vg-right">${ln.qtyReceived || 0} ${ln.unit || ""}</td>
        <td class="vg-right">${acc || 0}</td>
        <td class="vg-right">${ln.qtyRejected || 0}</td>
        <td>${locName(ln.locationId)}</td>
        <td>${itemLocName(ln.itemLocationId)}</td>
        <td>${ln.remarks || "—"}</td>
      </tr>`;
    }).join("");
    const inner = `
      <div class="vg-cols">
        <div class="vg-card"><b>Supplier</b>${supp.name || "—"}<br>${supp.address || ""}<br>GSTIN: ${supp.gstin || "—"}</div>
        <div class="vg-card"><b>Receipt (GRN)</b>No: ${r.no}<br>Date: ${r.date}<br>PO Ref: ${r.poRef || "—"}<br>Invoice: ${r.invoiceNo || "—"}</div>
        <div class="vg-card"><b>Transport</b>Challan: ${r.challanNo || "—"}<br>Transporter: ${r.transporter || "—"}<br>Vehicle: ${r.vehicleNo || "—"}<br>LR: ${r.lrNo || "—"}</div>
      </div>
      <table class="vg-tbl"><thead><tr><th>Sr.</th><th>Item SKU</th><th>Description</th><th>HSN/SAC</th><th class="vg-right">Invoiced</th><th class="vg-right">Received</th><th class="vg-right">Accepted</th><th class="vg-right">Rejected</th><th>Storage</th><th>Item location</th><th>Remarks</th></tr></thead>
      <tbody>${rowsHtml || "<tr><td colspan='11'>No lines</td></tr>"}</tbody></table>
      <div class="vg-totals"><div><span>Line count</span><span>${docLines.length}</span></div><div><span>QC status</span><span>${r.qcStatus || "—"}</span></div><div class="grand"><span>Total Value</span><span>${inr(r.totalValue || 0)}</span></div></div>
      <div class="vg-terms">${r.remarks ? "<b>Remarks:</b> " + r.remarks : ""}</div>
      <div class="vg-sign"><div>Received by: <b>${r.createdBy || "—"}</b></div><div>Checked by: <b>—</b></div><div>Approved by: <b>—</b></div><div>For ${store.company().name}</div></div>`;
    return { title: "Material Receipt (GRN)", subtitle: r.no + " · " + r.date, inner };
  }
  function ReceiptPage({ roleKey, can }) {
    VG.useDB();
    const [build, setBuild] = useState(false);
    const rows = store.list("materialReceipts").slice().reverse();
    const cols = [
      { key: "no", label: "MRN", render: (r) => <span className="font-mono text-xs">{r.no}</span> }, { key: "date", label: "Date" },
      { key: "supplierId", label: "Supplier", render: (r) => suppName(r.supplierId), csv: (r) => suppName(r.supplierId) },
      { key: "lineCount", label: "Items", render: (r) => (r.lineCount || (store.normalizeReceiptLines ? store.normalizeReceiptLines(r).length : 1)), csv: (r) => r.lineCount || 1 },
      { key: "itemId", label: "Item(s)", render: (r) => grnItemsLabel(r), csv: (r) => grnItemsLabel(r) },
      { key: "qtyInvoiced", label: "Qty invoiced", render: (r) => r.qtyInvoiced != null ? r.qtyInvoiced : "—" },
      { key: "qtyReceived", label: "Qty received", render: (r) => (r.qtyReceived || 0) + (r.unit ? " " + r.unit : "") },
      { key: "qtyAccepted", label: "Accepted", render: (r) => (r.qtyAccepted ?? r.qtyReceived) + (r.unit ? " " + r.unit : "") },
      { key: "qcStatus", label: "QC", render: (r) => <StatusTag value={r.qcStatus} map={{ Pending: "#f59e0b", Passed: "#34d399", Failed: "#ef4444", "Not required": "#94a3b8" }} /> },
      { key: "totalValue", label: "Value", render: (r) => inr(r.totalValue), csv: (r) => r.totalValue },
    ];
    if (build) {
      return <ReceiptBuilder open onClose={() => setBuild(false)} roleKey={roleKey} can={can} />;
    }
    return (
      <ListPage title="Material Receipt" desc="Multi-item GRN with qty invoiced vs received and storage → item location" onNew={() => setBuild(true)} newLabel="Add Receipt" can={can}>
        <RecordTable embedded suppressNew title="Receipt List" columns={cols} rows={rows} can={can} printTitle="Material Receipts" searchKeys={["no", "invoiceNo"]}
          filters={[{ key: "qcStatus", label: "All QC", options: ["Pending", "Passed", "Failed", "Not required"] }]}
          onView={(r) => printDocument(receiptDoc(r), "preview")}
          onNew={() => setBuild(true)} empty="No receipts yet" />
      </ListPage>
    );
  }

  /* ================= Material Issue ================= */
  function blankMinLine() {
    return { key: Math.random().toString(36).slice(2), itemId: "", qtyRequested: "", qtyIssued: "", unit: "", locationId: "", itemLocationId: "", batch: "", remarks: "" };
  }
  function issueLineDesc(itemId) {
    if (!itemId) return "";
    if (VG.itemDisplay && VG.itemDisplay.itemDescription) return VG.itemDisplay.itemDescription(itemId);
    const it = store.get("items", itemId) || {};
    return it.description || it.name || "";
  }
  function issueItemsLabel(r) {
    return store.issueItemsLabel ? store.issueItemsLabel(r) : itemName(r.itemId);
  }
  function issueStockAvail(line) {
    if (!line || !line.itemId || !store.stockAvailability) return null;
    return store.stockAvailability(line.itemId, {
      locationId: line.locationId || null,
      itemLocationId: line.itemLocationId || null,
      batch: line.batch || null,
      unit: line.unit || null,
    });
  }
  const MIN_TABLE_HEAD = (
    <tr className="text-left border-b border-white/10 text-[11px] uppercase opacity-70">
      <th className="w-10 px-2">Sr.</th>
      <th className="min-w-[180px] px-2">Item SKU</th>
      <th className="min-w-[140px] px-2">Description</th>
      <th className="w-24 px-2">Qty Requested</th>
      <th className="w-24 px-2">Qty Issued</th>
      <th className="w-16 px-2">Unit</th>
      <th className="w-24 px-2">Free Avail.</th>
      <th className="min-w-[130px] px-2">Store Location</th>
      <th className="min-w-[130px] px-2">Item Location</th>
      <th className="w-20 px-2">Pending</th>
      <th className="min-w-[100px] px-2">Remarks</th>
      <th className="w-10" />
    </tr>
  );
  function IssueBuilder({ open, onClose, roleKey, can, initialType }) {
    const [f, setF] = useState({ date: today(), type: initialType || ISSUE_TYPES[0], approval: "Pending" });
    const [lines, setLines] = useState([blankMinLine()]);
    const [dirty, setDirty] = useState(false);
    const canEditLocation = can("edit");
    const set = (k, v) => { setDirty(true); setF((p) => ({ ...p, [k]: v })); };
    const setLine = (key, patch) => { setDirty(true); setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r))); };
    const addLine = () => setLines((rows) => [...rows, blankMinLine()]);
    const delLine = (key) => { if (lines.length <= 1) return; setLines((rows) => rows.filter((r) => r.key !== key)); };
    function pickItem(key, id) {
      const it = store.get("items", id) || {};
      let locationId = it.locationId || "";
      let itemLocationId = it.itemLocationId || "";
      if (store.stockAvailability) {
        const atBin = itemLocationId && locationId
          ? store.stockAvailability(id, { locationId, itemLocationId }).totalStock
          : 0;
        const atStore = locationId ? store.stockAvailability(id, { locationId }).totalStock : 0;
        const global = store.stockAvailability(id, {}).totalStock;
        if (!locationId && global > 0) {
          const ledgerRows = (store.list("stockLedger") || []).filter((e) => e.itemId === id);
          const locQty = {};
          ledgerRows.forEach((e) => { locQty[e.locationId] = (locQty[e.locationId] || 0) + (Number(e.qty) || 0); });
          const best = Object.entries(locQty).sort((a, b) => b[1] - a[1])[0];
          if (best && best[1] > 0) locationId = best[0];
        }
        if (itemLocationId && atBin <= 0 && atStore > 0) itemLocationId = "";
      }
      setLine(key, { itemId: id, unit: it.unit || "Nos", locationId, itemLocationId });
    }
    function pickStorage(key, locationId) { setLine(key, { locationId, itemLocationId: "" }); }
    function pickOrder(id) { const o = store.get("salesOrders", id) || {}; setF((p) => ({ ...p, salesOrderId: id, customerId: o.customerId })); }
    function validateLines() {
      let issuedAny = false;
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const n = i + 1;
        if (!ln.itemId) return "Row " + n + ": select item SKU.";
        if (!ln.locationId) return "Row " + n + ": select store location.";
        const req = Number(ln.qtyRequested);
        const iss = Number(ln.qtyIssued);
        if (ln.qtyRequested !== "" && (!Number.isFinite(req) || req < 0)) return "Row " + n + ": invalid qty requested.";
        if (!Number.isFinite(iss) || iss < 0) return "Row " + n + ": invalid qty issued.";
        if (iss > 0) issuedAny = true;
        if (iss > 0) {
          const stk = issueStockAvail(ln);
          if (!stk) return "Row " + n + ": could not read stock.";
          if (stk.unitWarning) return "Row " + n + ": " + stk.unitWarning;
          if (iss > stk.available) {
            if (stk.mismatchMessage) return "Row " + n + ": " + stk.mismatchMessage;
            return "Row " + n + ": qty issued exceeds free available (" + stk.available + "). On hand: " + stk.totalStock + ", reserved: " + stk.reserved + ".";
          }
          if (req > 0 && iss > req) return "Row " + n + ": qty issued cannot exceed qty requested.";
        }
        const locOpts = store.itemLocationsForStorage ? store.itemLocationsForStorage(ln.locationId) : [];
        if (ln.itemLocationId && locOpts.length && !locOpts.some((x) => x.id === ln.itemLocationId)) return "Row " + n + ": item location does not belong to store.";
      }
      if (!issuedAny) return "Enter qty issued on at least one line.";
      return "";
    }
    function buildPayload() {
      return {
        ...f,
        lines: lines.map((ln, idx) => {
          const it = store.get("items", ln.itemId) || {};
          const req = ln.qtyRequested === "" ? Number(ln.qtyIssued) || 0 : Number(ln.qtyRequested) || 0;
          const iss = Number(ln.qtyIssued) || 0;
          return {
            lineNo: idx + 1, itemId: ln.itemId, qtyRequested: req, qtyIssued: iss,
            unit: it.unit || ln.unit || "Nos", locationId: ln.locationId, itemLocationId: ln.itemLocationId || "",
            batch: ln.batch || "", remarks: ln.remarks || "",
          };
        }),
      };
    }
    function save() {
      const lineErr = validateLines();
      if (lineErr) return VG.toast(lineErr, "error");
      if (f.type === "Issue for Invoicing" && !f.salesOrderId) return VG.toast("Select sales order", "error");
      if ((f.type === "Vendor Returnable Challan" || f.type === "Vendor Non-Returnable Challan") && !f.vendorId) return VG.toast("Select vendor", "error");
      const rec = store.postIssue(buildPayload(), roleKey);
      if (!rec) return VG.toast("Could not post issue", "error");
      if (rec.error) return VG.toast(rec.error, "error");
      VG.toast("Issue " + rec.no + " posted · " + (rec.lineCount || 1) + " line(s)");
      onClose();
    }
    return (
      <InternalScreen onBack={onClose} backLabel="Back to issues" dirty={dirty} title="Material Issue" subtitle="Multi-item issue · unit auto-fetched from Item Master (read-only)"
        footer={<><Button variant="soft" icon="eye" onClick={() => printDocument(issueChallanDoc({ ...buildPayload(), no: "DRAFT", issuedBy: roleKey }), "preview")}>Preview challan</Button><Button icon="check" onClick={save}>Post issue</Button></>}>
        <div className="grid lg:grid-cols-3 gap-3">
          <Field label="Issue date" required><DateF value={f.date} onChange={(v) => set("date", v)} /></Field>
          <Field label="Issue type" required className="lg:col-span-2"><Select value={f.type} onChange={(v) => set("type", v)} options={ISSUE_TYPES.map((t) => ({ value: t, label: t }))} /></Field>
          <Field label="Received by"><Text value={f.receivedBy} onChange={(v) => set("receivedBy", v)} /></Field>
          <Field label="Approval status"><Select value={f.approval} onChange={(v) => set("approval", v)} options={["Pending", "Approved"].map((x) => ({ value: x, label: x }))} /></Field>
          <Field label="Documents"><Text value={f.documents} onChange={(v) => set("documents", v)} placeholder="challan.pdf" /></Field>
        </div>
        <div className="my-3 h-px bg-white/10" />
        <div className="text-[11px] uppercase tracking-wider opacity-55 mb-2">{f.type} — reference</div>
        <div className="grid lg:grid-cols-3 gap-3 mb-4">
          {f.type === "Issue for Invoicing" && <>
            <Field label="Sales order" required><MasterSelect collection="salesOrders" value={f.salesOrderId} onChange={pickOrder} actorRole={roleKey} allowCreate={false} /></Field>
            <Field label="Customer"><div className="rounded-lg glass px-3 py-2 text-sm opacity-80">{f.customerId ? (store.get("customers", f.customerId) || {}).name : "—"}</div></Field>
            <Field label="Invoice number"><Text value={f.invoiceNo} onChange={(v) => set("invoiceNo", v)} /></Field>
          </>}
          {f.type === "Internal Use / Production" && <>
            <Field label="Work order #"><Text value={f.productionOrder} onChange={(v) => set("productionOrder", v)} /></Field>
            <Field label="Department"><Text value={f.department} onChange={(v) => set("department", v)} /></Field>
            <Field label="Purpose"><Text value={f.purpose} onChange={(v) => set("purpose", v)} /></Field>
          </>}
          {(f.type === "Vendor Returnable Challan" || f.type === "Vendor Non-Returnable Challan") && <>
            <Field label="Vendor" required><MasterSelect collection="suppliers" value={f.vendorId} onChange={(v) => set("vendorId", v)} actorRole={roleKey} can={can("add")} /></Field>
            <Field label="Challan #"><Text value={f.challanNo} onChange={(v) => set("challanNo", v)} /></Field>
          </>}
        </div>
        <TransactionLinesShell title="Issue line items" onAddLine={addLine} addLabel="Add line item" minWidth={1320} headerRow={MIN_TABLE_HEAD}>
          {lines.map((l, idx) => {
            const stk = issueStockAvail(l);
            const avail = stk ? stk.available : null;
            const req = l.qtyRequested === "" ? null : Number(l.qtyRequested);
            const iss = Number(l.qtyIssued) || 0;
            const pending = req != null && Number.isFinite(req) ? Math.max(0, req - iss) : "—";
            const ilOpts = store.itemLocationsForStorage ? store.itemLocationsForStorage(l.locationId) : [];
            const availTitle = stk
              ? ("On hand: " + stk.totalStock + " · Reserved: " + stk.reserved + " · Free: " + stk.available
                + (stk.globalStock !== stk.totalStock ? " · Global: " + stk.globalStock : "")
                + (stk.mismatchMessage ? " · " + stk.mismatchMessage : ""))
              : "";
            return (
              <tr key={l.key} className="border-b border-white/5 align-top">
                <td className="px-2 py-1.5 text-xs opacity-70">{idx + 1}</td>
                <td className="min-w-[180px] px-2 py-1.5"><MasterSelect variant="line" collection="items" value={l.itemId} onChange={(id) => pickItem(l.key, id)} actorRole={roleKey} can={can("add")} /></td>
                <td className="min-w-[140px] px-2 py-1.5"><div className="text-sm leading-snug py-1 pr-2 whitespace-pre-wrap">{issueLineDesc(l.itemId) || <span className="opacity-40">—</span>}</div></td>
                <td className="px-2 py-1.5"><Num data-line-qty value={l.qtyRequested} onChange={(v) => setLine(l.key, { qtyRequested: v })} /></td>
                <td className="px-2 py-1.5"><Num data-line-qty value={l.qtyIssued} onChange={(v) => setLine(l.key, { qtyIssued: v })} /></td>
                <td className="px-2 py-1.5"><span className="text-sm opacity-80 py-2 inline-block">{l.unit || "—"}</span></td>
                <td className="px-2 py-1.5 text-sm" title={availTitle}>
                  {!l.itemId ? "—" : (
                    <div>
                      <span className={avail != null && avail <= 0 ? "text-rose-400" : "text-emerald-400 font-medium"}>{avail != null ? avail : "…"}</span>
                      {stk && stk.reserved > 0 && <div className="text-[10px] opacity-50">Rsv {stk.reserved}</div>}
                      {stk && stk.mismatch && avail <= 0 && stk.globalStock > 0 && (
                        <div className="text-[10px] text-amber-400">Check stock</div>
                      )}
                    </div>
                  )}
                </td>
                <td className="min-w-[130px] px-2 py-1.5">
                  {canEditLocation ? <MasterSelect collection="locations" value={l.locationId} onChange={(v) => pickStorage(l.key, v)} actorRole={roleKey} can={can("add")} />
                    : <span className="text-sm opacity-80 py-2 inline-block">{locName(l.locationId)}</span>}
                </td>
                <td className="min-w-[130px] px-2 py-1.5">
                  {canEditLocation ? (
                    <select className="vg-input w-full text-xs" value={l.itemLocationId || ""} disabled={!l.locationId} onChange={(e) => setLine(l.key, { itemLocationId: e.target.value })}>
                      <option value="">—</option>
                      {ilOpts.map((il) => <option key={il.id} value={il.id}>{itemLocName(il.id)}</option>)}
                    </select>
                  ) : <span className="text-sm opacity-80 py-2 inline-block">{itemLocName(l.itemLocationId)}</span>}
                </td>
                <td className="px-2 py-1.5 text-xs opacity-70">{pending}</td>
                <td className="min-w-[100px] px-2 py-1.5"><Text value={l.remarks} onChange={(v) => setLine(l.key, { remarks: v })} placeholder="Note…" /></td>
                <td className="px-2 py-1.5"><button type="button" onClick={() => delLine(l.key)} disabled={lines.length <= 1} className="p-1 rounded chrome-hover hover:text-rose-400 disabled:opacity-30" title="Remove row"><Icon name="trash" size={14} /></button></td>
              </tr>
            );
          })}
        </TransactionLinesShell>
        <Field label="Header remarks" className="mt-3"><Area value={f.remarks} onChange={(v) => set("remarks", v)} rows={2} /></Field>
        <p className="text-[11px] opacity-55 mt-2">Free available = stock ledger balance − reserved qty. Unit is read-only from Item Master. Select store/item location to narrow stock scope; leave item location blank to use store-level pool.</p>
      </InternalScreen>
    );
  }
  function issueChallanPDF(m, mode) { printDocument(issueChallanDoc(m), mode); }
  function issueChallanDoc(m) {
    const cust = m.customerId ? (store.get("customers", m.customerId) || {}) : null;
    const ship = cust && VG.customerAddr ? VG.customerAddr(cust, "shipping").text : "";
    const docLines = store.normalizeIssueLines ? store.normalizeIssueLines(m) : [];
    const rowsHtml = docLines.map((ln) => `<tr>
      <td>${itemNameSkuPdf(ln.itemId)}</td>
      <td class="vg-right">${ln.qtyRequested != null ? ln.qtyRequested : "—"}</td>
      <td class="vg-right">${ln.qtyIssued || 0}</td>
      <td>${ln.unit || ""}</td>
      <td>${locName(ln.locationId)}</td>
      <td>${itemLocName(ln.itemLocationId)}</td>
      <td>${ln.batch || "—"}</td>
      <td>${ln.remarks || "—"}</td>
    </tr>`).join("");
    const inner = `
      <div class="vg-cols">
        <div class="vg-card"><b>Issue / Challan</b>No: ${m.no}<br>Date: ${m.date}<br>Type: ${m.type}</div>
        <div class="vg-card"><b>Reference</b>${m.salesOrderId ? "SO: " + (store.get("salesOrders", m.salesOrderId) || {}).no : m.vendorId ? "Vendor: " + suppName(m.vendorId) : m.productionOrder ? "WO: " + m.productionOrder : "—"}</div>
        ${cust ? `<div class="vg-card"><b>Ship To</b>${cust.name || ""}<br>${ship || ""}</div>` : ""}
      </div>
      <table class="vg-tbl"><thead><tr><th>Item SKU</th><th class="vg-right">Requested</th><th class="vg-right">Issued</th><th>Unit</th><th>Store</th><th>Item location</th><th>Batch</th><th>Remarks</th></tr></thead>
      <tbody>${rowsHtml || "<tr><td colspan='8'>No lines</td></tr>"}</tbody></table>
      <div class="vg-terms">${m.remarks ? "<b>Remarks:</b> " + m.remarks : ""}</div>
      <div class="vg-sign"><div>Issued by: <b>${m.issuedBy || "—"}</b></div><div>Received by: <b>${m.receivedBy || "—"}</b></div><div>For ${store.company().name}</div></div>`;
    return { title: m.type || "Material Issue", subtitle: m.no + " · " + m.date, inner };
  }
  function IssuePage({ roleKey, can, defaultType }) {
    VG.useDB();
    const [build, setBuild] = useState(false);
    const rows = store.list("materialIssues").slice().reverse().filter((r) => !defaultType || r.type === defaultType);
    const cols = [
      { key: "no", label: "MIN", render: (r) => <span className="font-mono text-xs">{r.no}</span> }, { key: "date", label: "Date" },
      { key: "type", label: "Type", render: (r) => <Pill color="#6366f1">{r.type.replace(" Challan", "").replace("Issue for ", "")}</Pill>, csv: (r) => r.type },
      { key: "lineCount", label: "Lines", render: (r) => r.lineCount || (store.normalizeIssueLines ? store.normalizeIssueLines(r).length : 1) },
      { key: "itemId", label: "Item(s)", render: (r) => issueItemsLabel(r), csv: (r) => issueItemsLabel(r) },
      { key: "qtyRequested", label: "Requested", render: (r) => r.qtyRequested != null ? r.qtyRequested : "—" },
      { key: "qtyIssued", label: "Issued", render: (r) => (r.qtyIssued || 0) + (r.unit ? " " + r.unit : "") },
      { key: "ref", label: "Reference", render: (r) => r.salesOrderId ? (store.get("salesOrders", r.salesOrderId) || {}).no : r.vendorId ? suppName(r.vendorId) : r.productionOrder || "—" },
      { key: "pendingReturn", label: "Return", render: (r) => r.type === "Vendor Returnable Challan" ? (r.pendingReturn ? <Pill color="#f59e0b">Pending</Pill> : <Pill color="#34d399">Returned</Pill>) : "—" },
    ];
    if (build) {
      return <IssueBuilder open onClose={() => setBuild(false)} roleKey={roleKey} can={can} initialType={defaultType} />;
    }
    return (
      <ListPage title={defaultType === "Vendor Returnable Challan" ? "Returnable Challan" : defaultType === "Vendor Non-Returnable Challan" ? "Non-Returnable Challan" : "Material Issue"} desc="Multi-item tabular issue · qty requested & issued · store + item location" onNew={() => setBuild(true)} newLabel="Add Issue" can={can}>
        <RecordTable embedded suppressNew title="Issue List" columns={cols} rows={rows} can={can} printTitle="Material Issues" searchKeys={["no", "type"]}
          filters={defaultType ? [] : [{ key: "type", label: "All types", options: ISSUE_TYPES }]}
          onNew={() => setBuild(true)} onView={(r) => issueChallanPDF(r, "preview")} empty="No issues yet" />
      </ListPage>
    );
  }

  function MaterialReqPage({ roleKey, can }) {
    VG.useDB();
    const [view, setView] = useState(null);
    const rows = store.list("materialRequirements").slice().reverse();
    const fgRows = store.list("finishedGoodsTransfers").slice().reverse();
    const cols = [
      { key: "no", label: "MR #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "workOrderNo", label: "WO" },
      { key: "requiredByDate", label: "Required by" },
      { key: "bomNo", label: "BOM", render: (r) => (r.bomNo ? (r.bomNo + " · " + (r.bomRevision || "Rev-00")) : "—") },
      { key: "priority", label: "Priority", render: (r) => <Pill color={r.priority === "Critical" ? "#ef4444" : r.priority === "High Priority" ? "#f59e0b" : "#6366f1"}>{r.priority || "Normal"}</Pill> },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={{ Open: "#f59e0b", "Partially Issued": "#22d3ee", "Fully Issued": "#34d399", "Shortage Pending": "#ef4444" }} /> },
      { key: "act", label: "Action", render: (r) => can("edit") ? <div className="flex gap-1">
        <Button variant="soft" className="!py-1" onClick={() => setView(r)}>BOM run</Button>
        <Button variant="soft" className="!py-1" onClick={() => {
        const issued = {};
        (r.lines || []).forEach((ln) => { issued[ln.itemId] = Number(ln.requiredQty) || 0; });
        const out = store.issueMaterialAgainstRequirement(r.id, { issued, remarks: "Issued from stores", receivedBy: roleKey }, roleKey);
        if (out) VG.toast("Issue status: " + out.issueStatus, out.shortages && out.shortages.length ? "warn" : "success");
      }}>Issue material</Button>
      </div> : "—" },
    ];
    const fgCols = [
      { key: "no", label: "FG #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "workOrderNo", label: "WO" },
      { key: "sku", label: "SKU" },
      { key: "qtyTransferred", label: "Qty" },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={{ "Pending Stores Acceptance": "#f59e0b", "Accepted by Stores": "#34d399", "Issued to QC": "#22d3ee" }} /> },
      { key: "act", label: "Action", render: (r) => (
        <div className="flex gap-1">
          {r.status === "Pending Stores Acceptance" && can("edit") && <Button variant="soft" className="!py-1" onClick={() => { store.acceptFinishedGoodsTransfer(r.id, roleKey); VG.toast("FG accepted"); }}>Accept</Button>}
          {r.status === "Accepted by Stores" && can("edit") && <Button variant="soft" className="!py-1" onClick={() => { const q = store.issueFinishedGoodsToQC(r.id, { receivedByQc: "", priority: "Normal" }, roleKey); if (q) VG.toast("Issued to QC: " + q.no); }}>Issue to QC</Button>}
        </div>
      ) },
    ];
    if (view) {
      return (
          <InternalScreen onBack={() => setView(null)} backLabel="Back to requirements" title={"Material Availability & Shortage · " + view.no} subtitle={view.workOrderNo}
            breadcrumbs={[{ label: "Material requirements", onClick: () => setView(null) }, { label: view.no }]}>
            <div className="text-xs opacity-70 mb-3">WO: {view.workOrderNo} · SO: {view.salesOrderNo || "—"} · BOM: {view.bomNo || "—"} {view.bomRevision || ""}</div>
            <div className="overflow-x-auto rounded-xl glass">
              <table className="w-full text-xs">
                <thead><tr className="opacity-55 text-[10px] uppercase border-b border-white/10">
                  <th className="text-left px-2 py-2">SKU</th><th className="text-left px-2 py-2">Description</th><th className="text-left px-2 py-2">Category</th>
                  <th className="text-right px-2 py-2">Required</th><th className="text-right px-2 py-2">Available</th><th className="text-right px-2 py-2">Reserved</th>
                  <th className="text-right px-2 py-2">Free</th><th className="text-right px-2 py-2">Issue now</th><th className="text-right px-2 py-2">Shortage</th><th className="text-left px-2 py-2">PR</th>
                </tr></thead>
                <tbody>
                  {(store.materialAvailabilityReportForMR(view.id) || []).map((ln, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="px-2 py-1.5 font-mono">{ln.sku}</td><td className="px-2 py-1.5">{ln.description}</td><td className="px-2 py-1.5">{ln.category}</td>
                      <td className="px-2 py-1.5 text-right">{ln.requiredQty}</td><td className="px-2 py-1.5 text-right">{ln.availableStock}</td><td className="px-2 py-1.5 text-right">{ln.reservedStock}</td>
                      <td className="px-2 py-1.5 text-right">{ln.freeStock}</td><td className="px-2 py-1.5 text-right">{ln.qtyCanIssueNow}</td><td className="px-2 py-1.5 text-right">{ln.shortageQty}</td>
                      <td className="px-2 py-1.5">{ln.purchaseRequestStatus || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </InternalScreen>
      );
    }
    return (
      <ListPage title="Material Requirement & FG Handover" desc="Stores queue: issue materials to production and route finished goods to QC" can={can}>
        <RecordTable embedded suppressNew title="Material Requirement List" columns={cols} rows={rows} can={can} printTitle="Material Requirements" searchKeys={["no", "workOrderNo"]} empty="No material requirements pending" />
        <RecordTable embedded suppressNew title="Finished Goods Transfer List" columns={fgCols} rows={fgRows} can={can} printTitle="Finished Goods Transfer" searchKeys={["no", "workOrderNo"]} empty="No finished goods transfers" />
      </ListPage>
    );
  }

  /* ================= Stock transfer ================= */
  function TransferPage({ roleKey, can }) {
    VG.useDB();
    const [build, setBuild] = useState(false);
    const rows = store.list("stockTransfers").slice().reverse();
    const cols = [
      { key: "no", label: "Transfer #", render: (r) => <span className="font-mono text-xs">{r.no}</span> }, { key: "date", label: "Date" },
      { key: "itemId", label: "Item", render: (r) => itemName(r.itemId), csv: (r) => itemName(r.itemId) },
      { key: "from", label: "From", render: (r) => locName(r.fromId), csv: (r) => locName(r.fromId) },
      { key: "to", label: "To", render: (r) => locName(r.toId), csv: (r) => locName(r.toId) },
      { key: "qty", label: "Qty" },
    ];
    if (build) {
      return <TxnBuilder open onClose={() => setBuild(false)} roleKey={roleKey} can={can} title="Stock Transfer" seq="TRF" coll="stockTransfers"
        fields={[{ k: "fromId", l: "From location", master: "locations", req: true }, { k: "toId", l: "To location", master: "locations", req: true }, { k: "qty", l: "Quantity", num: true, req: true }, { k: "reason", l: "Reason" }]}
        onPost={(f, no) => { const q = Number(f.qty); store.postLedger({ itemId: f.itemId, locationId: f.fromId, type: "transfer-out", qty: -q, ref: no, date: f.date }, roleKey); store.postLedger({ itemId: f.itemId, locationId: f.toId, type: "transfer-in", qty: q, ref: no, date: f.date }, roleKey); }} />;
    }
    return (
      <ListPage title="Stock Transfer" desc="Move stock between locations / racks / bins" onNew={() => setBuild(true)} newLabel="Add Transfer" can={can}>
        <RecordTable embedded suppressNew title="Transfer List" columns={cols} rows={rows} can={can} printTitle="Stock Transfers" searchKeys={["no"]} onNew={() => setBuild(true)} empty="No transfers yet" />
      </ListPage>
    );
  }

  /* ================= Returns ================= */
  function ReturnsPage({ roleKey, can }) {
    VG.useDB();
    const [build, setBuild] = useState(false);
    const rows = store.list("returns").slice().reverse();
    const cols = [
      { key: "no", label: "Return #", render: (r) => <span className="font-mono text-xs">{r.no}</span> }, { key: "date", label: "Date" },
      { key: "kind", label: "Type", render: (r) => <Pill color="#22d3ee">{r.kind}</Pill> },
      { key: "itemId", label: "Item", render: (r) => itemName(r.itemId), csv: (r) => itemName(r.itemId) },
      { key: "qty", label: "Qty" }, { key: "reason", label: "Reason" },
    ];
    if (build) {
      return <TxnBuilder open onClose={() => setBuild(false)} roleKey={roleKey} can={can} title="Return" seq="RET" coll="returns"
        fields={[{ k: "kind", l: "Return type", select: ["Customer Return", "Vendor Returnable In"], req: true }, { k: "locationId", l: "To location", master: "locations", req: true }, { k: "qty", l: "Quantity", num: true, req: true }, { k: "reason", l: "Reason" }]}
        onPost={(f, no) => { store.postLedger({ itemId: f.itemId, locationId: f.locationId, type: "return", qty: Number(f.qty), ref: no, date: f.date }, roleKey); }} />;
    }
    return (
      <ListPage title="Return Management" desc="Customer returns & vendor returnable receipts (stock-in)" onNew={() => setBuild(true)} newLabel="Add Return" can={can}>
        <RecordTable embedded suppressNew title="Return List" columns={cols} rows={rows} can={can} printTitle="Returns" searchKeys={["no", "reason"]} onNew={() => setBuild(true)} empty="No returns yet" />
      </ListPage>
    );
  }

  /* ================= Scrap ================= */
  function ScrapPage({ roleKey, can }) {
    VG.useDB();
    const [build, setBuild] = useState(false);
    const rows = store.list("scrap").slice().reverse();
    const cols = [
      { key: "no", label: "Scrap #", render: (r) => <span className="font-mono text-xs">{r.no}</span> }, { key: "date", label: "Date" },
      { key: "itemId", label: "Item", render: (r) => itemName(r.itemId), csv: (r) => itemName(r.itemId) }, { key: "qty", label: "Qty" }, { key: "reason", label: "Reason" },
    ];
    if (build) {
      return <TxnBuilder open onClose={() => setBuild(false)} roleKey={roleKey} can={can} title="Scrap" seq="SCR" coll="scrap"
        fields={[{ k: "locationId", l: "From location", master: "locations", req: true }, { k: "qty", l: "Quantity", num: true, req: true }, { k: "reason", l: "Reason", req: true }]}
        onPost={(f, no) => { store.postLedger({ itemId: f.itemId, locationId: f.locationId, type: "scrap", qty: -Number(f.qty), ref: no, date: f.date }, roleKey); }} />;
    }
    return (
      <ListPage title="Scrap / Rejection Entry" desc="Write off rejected / damaged stock" onNew={() => setBuild(true)} newLabel="Add Scrap Entry" can={can}>
        <RecordTable embedded suppressNew title="Scrap List" columns={cols} rows={rows} can={can} printTitle="Scrap" searchKeys={["no", "reason"]} onNew={() => setBuild(true)} empty="No scrap entries" />
      </ListPage>
    );
  }

  /* ================= Opening Balance ================= */
  function blankObLine() {
    return { key: Math.random().toString(36).slice(2), itemId: "", qty: "", unit: "", locationId: "", itemLocationId: "", rate: "", batch: "", remarks: "" };
  }
  const OB_TABLE_HEAD = (
    <tr className="text-left border-b border-white/10 text-[11px] uppercase opacity-70">
      <th className="w-10 px-2">Sr.</th>
      <th className="min-w-[180px] px-2">Item SKU</th>
      <th className="min-w-[140px] px-2">Description</th>
      <th className="w-24 px-2">Opening Qty</th>
      <th className="w-16 px-2">Unit</th>
      <th className="min-w-[130px] px-2">Store Location</th>
      <th className="min-w-[130px] px-2">Item Location</th>
      <th className="w-24 px-2">Rate</th>
      <th className="w-24 px-2">Value</th>
      <th className="w-20 px-2">Batch</th>
      <th className="min-w-[90px] px-2">Remarks</th>
      <th className="w-10" />
    </tr>
  );
  function OpeningBalanceBuilder({ open, onClose, roleKey, can, record }) {
    const isEdit = !!(record && record.id);
    const locked = record && (record.status === "Approved" || record.locked);
    const [f, setF] = useState(() => ({ date: today(), remarks: "", ...(record || {}) }));
    const [lines, setLines] = useState(() => (record && record.lines && record.lines.length)
      ? record.lines.map((ln) => ({ ...blankObLine(), ...ln, key: Math.random().toString(36).slice(2) }))
      : [blankObLine()]);
    const [dirty, setDirty] = useState(false);
    const set = (k, v) => { if (!locked) { setDirty(true); setF((p) => ({ ...p, [k]: v })); } };
    const setLine = (key, patch) => { if (!locked) { setDirty(true); setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r))); } };
    const addLine = () => { if (!locked) setLines((rows) => [...rows, blankObLine()]); };
    const delLine = (key) => { if (!locked && lines.length > 1) setLines((rows) => rows.filter((r) => r.key !== key)); };
    function pickItem(key, id) {
      const it = store.get("items", id) || {};
      setLine(key, { itemId: id, unit: it.unit || "Nos", rate: it.rate || 0, locationId: it.locationId || "", itemLocationId: it.itemLocationId || "" });
    }
    function pickStorage(key, locationId) { setLine(key, { locationId, itemLocationId: "" }); }
    const lineValues = lines.map((l) => (Number(l.qty) || 0) * (Number(l.rate) || 0));
    const totalValue = lineValues.reduce((s, v) => s + v, 0);
    function validateLines() {
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const n = i + 1;
        if (!ln.itemId) return "Row " + n + ": select item SKU.";
        if (!ln.locationId) return "Row " + n + ": select store location.";
        const qty = Number(ln.qty);
        if (!Number.isFinite(qty) || qty <= 0) return "Row " + n + ": opening qty must be > 0.";
      }
      return "";
    }
    function persist(submit) {
      if (!can("add") && !isEdit) return VG.toast("No permission", "error");
      if (locked) return VG.toast("Approved opening balance is locked", "error");
      const err = validateLines();
      if (err) return VG.toast(err, "error");
      const payload = {
        id: record && record.id,
        date: f.date,
        remarks: f.remarks,
        submit: !!submit,
        lines: lines.map((ln, idx) => ({
          lineNo: idx + 1, itemId: ln.itemId, qty: Number(ln.qty) || 0,
          unit: (store.get("items", ln.itemId) || {}).unit || ln.unit,
          locationId: ln.locationId, itemLocationId: ln.itemLocationId || "",
          rate: Number(ln.rate) || 0, batch: ln.batch || "", remarks: ln.remarks || "",
        })),
      };
      const doc = store.saveOpeningBalance(payload, roleKey);
      if (!doc) return VG.toast("Could not save", "error");
      VG.toast(submit ? "Submitted for approval" : "Draft saved");
      onClose();
    }
    async function approveDoc() {
      if (!can("approve")) return VG.toast("Approval permission required", "error");
      const ok = await VG.confirm({ title: "Approve opening balance?", message: "Stock ledger will be updated. This cannot be edited after approval.", confirmLabel: "Approve" });
      if (!ok) return;
      let doc = record;
      if (dirty || !record) {
        const err = validateLines();
        if (err) return VG.toast(err, "error");
        doc = store.saveOpeningBalance({ id: record && record.id, date: f.date, remarks: f.remarks, submit: true, lines: lines.map((ln, idx) => ({ lineNo: idx + 1, itemId: ln.itemId, qty: Number(ln.qty), unit: ln.unit, locationId: ln.locationId, itemLocationId: ln.itemLocationId || "", rate: Number(ln.rate) || 0, batch: ln.batch || "", remarks: ln.remarks || "" })) }, roleKey);
      }
      if (!doc) return;
      const approved = store.approveOpeningBalance(doc.id, roleKey);
      if (!approved) return VG.toast("Could not approve", "error");
      VG.toast("Opening balance approved · stock updated");
      onClose();
    }
    return (
      <InternalScreen onBack={onClose} backLabel="Back to opening balance" dirty={dirty} title={isEdit ? "Edit Opening Balance" : "Opening Balance Entry"} subtitle={locked ? "Approved — locked" : "Initial stock setup · approval required"}
        footer={<>
          {!locked && can("add") && <Button variant="soft" onClick={() => persist(false)}>Save draft</Button>}
          {!locked && can("add") && <Button variant="soft" onClick={() => persist(true)}>Submit</Button>}
          {can("approve") && !locked && <Button icon="check" onClick={approveDoc}>Approve</Button>}
        </>}>
        <div className="grid lg:grid-cols-3 gap-3 mb-4">
          <Field label="Entry date" required><DateF value={f.date} onChange={(v) => set("date", v)} disabled={locked} /></Field>
          <Field label="Status"><div className="rounded-lg glass px-3 py-2 text-sm">{f.status || record?.status || "Draft"}</div></Field>
          <Field label="Total value"><div className="rounded-lg glass px-3 py-2 text-sm font-semibold">{inr(totalValue)}</div></Field>
          <Field label="Remarks" className="lg:col-span-3"><Area value={f.remarks || ""} onChange={(v) => set("remarks", v)} rows={2} disabled={locked} /></Field>
        </div>
        <TransactionLinesShell title="Opening balance lines" onAddLine={locked ? null : addLine} addLabel="Add line item" minWidth={1280} headerRow={OB_TABLE_HEAD}>
          {lines.map((l, idx) => {
            const ilOpts = store.itemLocationsForStorage ? store.itemLocationsForStorage(l.locationId) : [];
            const lv = (Number(l.qty) || 0) * (Number(l.rate) || 0);
            return (
              <tr key={l.key} className="border-b border-white/5 align-top">
                <td className="px-2 py-1.5 text-xs opacity-70">{idx + 1}</td>
                <td className="px-2 py-1.5"><MasterSelect variant="line" collection="items" value={l.itemId} onChange={(id) => pickItem(l.key, id)} actorRole={roleKey} can={can("add")} disabled={locked} /></td>
                <td className="px-2 py-1.5"><div className="text-sm py-1">{issueLineDesc(l.itemId) || "—"}</div></td>
                <td className="px-2 py-1.5"><Num value={l.qty} onChange={(v) => setLine(l.key, { qty: v })} disabled={locked} /></td>
                <td className="px-2 py-1.5"><span className="text-sm opacity-80">{l.unit || "—"}</span></td>
                <td className="px-2 py-1.5"><MasterSelect collection="locations" value={l.locationId} onChange={(v) => pickStorage(l.key, v)} actorRole={roleKey} can={can("add")} disabled={locked} /></td>
                <td className="px-2 py-1.5">
                  <select className="vg-input w-full text-xs" value={l.itemLocationId || ""} disabled={locked || !l.locationId} onChange={(e) => setLine(l.key, { itemLocationId: e.target.value })}>
                    <option value="">—</option>
                    {ilOpts.map((il) => <option key={il.id} value={il.id}>{itemLocName(il.id)}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5"><Num value={l.rate} onChange={(v) => setLine(l.key, { rate: v })} disabled={locked} /></td>
                <td className="px-2 py-1.5 text-sm opacity-80">{inr(lv)}</td>
                <td className="px-2 py-1.5"><Text value={l.batch} onChange={(v) => setLine(l.key, { batch: v })} disabled={locked} /></td>
                <td className="px-2 py-1.5"><Text value={l.remarks} onChange={(v) => setLine(l.key, { remarks: v })} disabled={locked} /></td>
                <td className="px-2 py-1.5">{!locked && <button type="button" onClick={() => delLine(l.key)} disabled={lines.length <= 1} className="p-1 rounded chrome-hover hover:text-rose-400 disabled:opacity-30"><Icon name="trash" size={14} /></button>}</td>
              </tr>
            );
          })}
        </TransactionLinesShell>
        <p className="text-[11px] opacity-55 mt-2">Only authorized users can approve. Approved entries update stock ledger and are locked.</p>
      </InternalScreen>
    );
  }
  function OpeningBalancePage({ roleKey, can }) {
    VG.useDB();
    const [build, setBuild] = useState(false);
    const [edit, setEdit] = useState(null);
    const rows = store.list("openingBalances").slice().reverse();
    const cols = [
      { key: "no", label: "OB No.", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "date", label: "Date" },
      { key: "lineCount", label: "Lines", render: (r) => r.lineCount || (r.lines || []).length },
      { key: "totalValue", label: "Value", render: (r) => inr(r.totalValue) },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status || "Draft"} map={{ Draft: "#94a3b8", Submitted: "#f59e0b", Approved: "#34d399", Reversed: "#ef4444" }} /> },
      { key: "createdBy", label: "Created by" },
      { key: "approvedBy", label: "Approved by", render: (r) => r.approvedBy || "—" },
    ];
    if (build || edit) {
      return <OpeningBalanceBuilder open onClose={() => { setBuild(false); setEdit(null); }} roleKey={roleKey} can={can} record={edit} />;
    }
    return (
      <ListPage title="Opening Balance Entry" desc="Initial stock setup in tabular form · draft, submit, approve workflow" onNew={can("add") ? () => setBuild(true) : null} newLabel="New opening balance" can={can}>
        <RecordTable embedded suppressNew title="Opening balance documents" columns={cols} rows={rows} can={can} printTitle="Opening Balance" searchKeys={["no", "status"]}
          onNew={can("add") ? () => setBuild(true) : null}
          onEdit={can("edit") ? (r) => { if (r.status === "Approved") return VG.toast("Approved document is locked", "error"); setEdit(r); } : null}
          onDelete={can("approve") ? async (r) => {
            if (r.status === "Approved") {
              const ok = await VG.confirm({ title: "Reverse opening balance?", danger: true, confirmLabel: "Reverse" });
              if (!ok) return;
              store.reverseOpeningBalance(r.id, roleKey);
              VG.toast("Opening balance reversed");
            } else if (can("delete")) {
              const ok = await VG.confirm({ title: "Delete draft?", danger: true, confirmLabel: "Delete" });
              if (ok) { store.remove("openingBalances", r.id, roleKey); VG.toast("Deleted"); }
            }
          } : null}
          empty="No opening balance entries yet" />
      </ListPage>
    );
  }

  /* ================= Physical verification ================= */
  function PhysicalPage({ roleKey, can }) {
    VG.useDB();
    const summary = store.stockSummary();
    const [counts, setCounts] = useState({});
    function postAdjust(it) {
      const counted = Number(counts[it.id]);
      if (Number.isNaN(counted)) return VG.toast("Enter counted qty", "error");
      const diff = counted - it.qty;
      if (diff === 0) return VG.toast("No difference for " + it.sku, "info");
      const no = store.nextNo("PV", today());
      store.postLedger({ itemId: it.id, locationId: it.locationId, type: "adjustment", qty: diff, ref: no, date: today() }, roleKey);
      store.create("physicalVerifications", { no, date: today(), itemId: it.id, system: it.qty, counted, diff, by: roleKey }, roleKey);
      VG.toast("Adjusted " + it.sku + " by " + (diff > 0 ? "+" : "") + diff);
      setCounts((c) => ({ ...c, [it.id]: "" }));
    }
    return (
      <div>
        <PageHead title="Physical Stock Verification" desc="Count vs system — posts adjustment entries to the ledger" />
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase opacity-55 border-b border-white/10"><th className="px-4 py-2">SKU</th><th className="px-4 py-2">Item</th><th className="px-4 py-2 text-right">System</th><th className="px-4 py-2 text-right w-28">Counted</th><th className="px-4 py-2 text-right">Diff</th><th className="px-4 py-2"></th></tr></thead>
            <tbody>{summary.map((it) => { const counted = counts[it.id]; const diff = counted === "" || counted === undefined ? null : Number(counted) - it.qty; return (
              <tr key={it.id} className="border-b border-white/5">
                <td className="px-4 py-2 font-mono text-xs">{it.sku}</td><td className="px-4 py-2">{it.name}</td><td className="px-4 py-2 text-right">{it.qty}</td>
                <td className="px-4 py-2"><input type="number" value={counts[it.id] ?? ""} onChange={(e) => setCounts((c) => ({ ...c, [it.id]: e.target.value }))} className="w-24 rounded-lg glass px-2 py-1 text-sm bg-transparent outline-none text-right" /></td>
                <td className={"px-4 py-2 text-right " + (diff ? (diff < 0 ? "text-rose-400" : "text-emerald-400") : "opacity-40")}>{diff === null ? "—" : (diff > 0 ? "+" : "") + diff}</td>
                <td className="px-4 py-2 text-right">{can("edit") && <Button variant="soft" className="!py-1" onClick={() => postAdjust(it)}>Adjust</Button>}</td>
              </tr>); })}</tbody>
          </table></div>
        </Card>
      </div>
    );
  }

  /* ================= Alerts, batches, reports ================= */
  function AlertsPage({ roleKey, can }) {
    VG.useDB();
    const low = store.stockSummary().filter((s) => s.reorderNeeded);
    const cols = [
      { key: "sku", label: "SKU", render: (r) => <span className="font-mono text-xs">{r.sku}</span> }, { key: "name", label: "Item" },
      { key: "qty", label: "On hand", render: (r) => <span className="text-rose-400 font-medium">{r.qty}</span> }, { key: "minStock", label: "Min" }, { key: "reorder", label: "Reorder level" },
      { key: "gap", label: "Shortfall", render: (r) => Math.max(0, r.reorder - r.qty), csv: (r) => Math.max(0, r.reorder - r.qty) },
    ];
    return (
      <ListPage title="Stock Alerts & Reorder" desc="Items at or below reorder level" can={can}>
        <RecordTable embedded suppressNew title="Reorder List" columns={cols} rows={low} can={can} printTitle="Reorder Report" searchKeys={["sku", "name"]} empty="All items above reorder level 🎉" />
      </ListPage>
    );
  }
  function BatchesPage({ roleKey, can }) {
    VG.useDB();
    const map = {};
    store.list("stockLedger").filter((e) => e.batch).forEach((e) => { const k = e.itemId + "|" + e.batch; map[k] = map[k] || { itemId: e.itemId, batch: e.batch, qty: 0, first: e.date }; map[k].qty += e.qty; });
    const rows = Object.values(map).map((r, i) => ({ id: "b" + i, ...r }));
    const cols = [
      { key: "batch", label: "Batch / Lot" }, { key: "itemId", label: "Item", render: (r) => itemName(r.itemId), csv: (r) => itemName(r.itemId) },
      { key: "qty", label: "Balance qty" }, { key: "first", label: "First seen" },
    ];
    return (
      <ListPage title="Batch / Lot Tracking" desc="Balances by batch for traceability" can={can}>
        <RecordTable embedded suppressNew title="Batch List" columns={cols} rows={rows} can={can} printTitle="Batch Tracking" searchKeys={["batch"]} empty="No batch-tracked stock yet" />
      </ListPage>
    );
  }
  function stockByLocationRows() {
    const map = {};
    store.list("stockLedger").forEach((e) => {
      const key = (e.itemId || "") + "|" + (e.locationId || "");
      if (!map[key]) map[key] = { itemId: e.itemId, locationId: e.locationId, qty: 0 };
      map[key].qty += Number(e.qty) || 0;
    });
    return Object.values(map).filter((r) => r.qty !== 0).map((r) => {
      const it = store.get("items", r.itemId) || {};
      return { ...r, sku: it.sku || "", name: it.name || "", unit: it.unit || "", value: r.qty * (it.rate || 0) };
    });
  }
  function stockByItemLocationRows() {
    const map = {};
    store.list("stockLedger").forEach((e) => {
      if (!e.itemLocationId) return;
      const key = (e.itemId || "") + "|" + (e.itemLocationId || "");
      if (!map[key]) map[key] = { itemId: e.itemId, locationId: e.locationId, itemLocationId: e.itemLocationId, qty: 0 };
      map[key].qty += Number(e.qty) || 0;
    });
    return Object.values(map).filter((r) => r.qty !== 0).map((r) => {
      const it = store.get("items", r.itemId) || {};
      return { ...r, sku: it.sku || "", name: it.name || "", unit: it.unit || "", value: r.qty * (it.rate || 0) };
    });
  }
  function ReportsPage({ roleKey, can }) {
    VG.useDB();
    const summary = store.stockSummary();
    const grnFlat = store.grnFlattenedLines ? store.grnFlattenedLines() : [];
    const grnItemRows = grnFlat.map(({ receipt, line, lineNo }) => ({
      mrn: receipt.no, date: receipt.date, supplier: suppName(receipt.supplierId), lineNo,
      item: itemName(line.itemId), sku: line.sku || (store.get("items", line.itemId) || {}).sku,
      qtyInvoiced: line.qtyInvoiced, qtyReceived: line.qtyReceived, qtyAccepted: line.qtyAccepted, qtyRejected: line.qtyRejected,
      unit: line.unit, storage: locName(line.locationId), itemLocation: itemLocName(line.itemLocationId), qc: receipt.qcStatus,
    }));
    const invVsRecvRows = grnItemRows.map((r) => ({
      ...r, variance: (Number(r.qtyReceived) || 0) - (Number(r.qtyInvoiced) || 0),
    }));
    const shortRecvRows = invVsRecvRows.filter((r) => (Number(r.qtyReceived) || 0) < (Number(r.qtyInvoiced) || 0));
    const pendingQcRows = store.list("qcInspections").filter((i) => i.status === "Pending").map((i) => ({
      qcNo: i.no, date: i.date, receiptNo: i.receiptNo || "", item: itemName(i.itemId),
      qty: i.qtyReceived, storage: locName(i.locationId), itemLocation: itemLocName(i.itemLocationId), supplier: suppName(i.supplierId),
    }));
    const mfrItemRows = store.list("items").map((it) => ({
      ...it,
      manufacturer: VG.itemMfr.manufacturerName(it),
      partNo: VG.itemMfr.partNumber(it),
    }));
    const dupGroups = store.scanMfrDuplicates();
    const dupRows = dupGroups.map((g, i) => ({
      id: "dup" + i,
      key: g.key,
      skus: g.items.map((it) => it.sku).join(", "),
      names: g.items.map((it) => it.name).join(" · "),
      count: g.items.length,
    }));
    const noPartRows = store.list("items").filter((it) => !String(it.manufacturerPartNumber || "").trim());
    const purchHist = store.manufacturerPurchaseHistory();
    const reports = [
      { n: "Stock Summary", run: () => fx.printTable("Stock Summary", [{ key: "sku", label: "SKU" }, { key: "name", label: "Item" }, ...mfrCols(), { key: "qty", label: "On hand" }, { key: "v", label: "Value", csv: (r) => inr(r.value) }], summary) },
      { n: "Reorder Report", run: () => fx.printTable("Reorder Report", [{ key: "sku", label: "SKU" }, { key: "name", label: "Item" }, ...mfrCols(), { key: "qty", label: "On hand" }, { key: "reorder", label: "Reorder" }], summary.filter((s) => s.reorderNeeded)) },
      { n: "Manufacturer-wise item list", run: () => fx.printTable("Manufacturer-wise Items", [{ key: "manufacturer", label: "Manufacturer" }, { key: "partNo", label: "Part no." }, { key: "sku", label: "SKU" }, { key: "name", label: "Item" }, { key: "rate", label: "Rate", csv: (r) => inr(r.rate) }], mfrItemRows.filter((r) => r.manufacturer).sort((a, b) => String(a.manufacturer).localeCompare(b.manufacturer))) },
      { n: "Part-number item search (all items)", run: () => fx.printTable("Items by Part Number", [{ key: "partNo", label: "Part no." }, { key: "manufacturer", label: "Manufacturer" }, { key: "sku", label: "SKU" }, { key: "name", label: "Item" }], mfrItemRows.filter((r) => r.partNo).sort((a, b) => String(a.partNo).localeCompare(b.partNo))) },
      { n: "Duplicate item warning report", run: () => fx.printTable("Duplicate Manufacturer + Part Number", [{ key: "key", label: "Normalized key" }, { key: "count", label: "Count" }, { key: "skus", label: "SKUs" }, { key: "names", label: "Items" }], dupRows) },
      { n: "Items without manufacturer part number", run: () => fx.printTable("Items Missing Mfr Part No.", [{ key: "sku", label: "SKU" }, { key: "name", label: "Item" }, { key: "manufacturer", label: "Manufacturer", csv: (r) => VG.itemMfr.manufacturerName(r) }], noPartRows) },
      { n: "Manufacturer-wise purchase history", run: () => fx.printTable("Manufacturer Purchase History", [{ key: "date", label: "Date" }, { key: "docType", label: "Type" }, { key: "docNo", label: "Document" }, { key: "manufacturer", label: "Manufacturer" }, { key: "partNo", label: "Part no." }, { key: "sku", label: "SKU" }, { key: "qty", label: "Qty" }, { key: "value", label: "Value", csv: (r) => inr(r.value) }], purchHist) },
      { n: "Stock Ledger", run: () => fx.printTable("Stock Ledger", [{ key: "date", label: "Date" }, { key: "i", label: "Item", csv: (r) => itemName(r.itemId) }, { key: "type", label: "Type" }, { key: "qty", label: "Qty" }, { key: "ref", label: "Ref" }], store.list("stockLedger")) },
      { n: "Material Receipts", run: () => fx.printTable("Material Receipts", [{ key: "no", label: "MRN" }, { key: "date", label: "Date" }, { key: "s", label: "Supplier", csv: (r) => suppName(r.supplierId) }, { key: "i", label: "Item", csv: (r) => grnItemsLabel(r) }, { key: "v", label: "Value", csv: (r) => inr(r.totalValue) }], store.list("materialReceipts")) },
      { n: "GRN item-wise report", run: () => fx.printTable("GRN Item-wise", [{ key: "mrn", label: "MRN" }, { key: "date", label: "Date" }, { key: "lineNo", label: "Line" }, { key: "sku", label: "SKU" }, { key: "item", label: "Item" }, { key: "qtyInvoiced", label: "Qty invoiced" }, { key: "qtyReceived", label: "Qty received" }, { key: "qtyAccepted", label: "Accepted" }, { key: "storage", label: "Storage" }, { key: "itemLocation", label: "Item location" }], grnItemRows) },
      { n: "Qty invoiced vs qty received", run: () => fx.printTable("Invoiced vs Received", [{ key: "mrn", label: "MRN" }, { key: "item", label: "Item" }, { key: "qtyInvoiced", label: "Invoiced" }, { key: "qtyReceived", label: "Received" }, { key: "variance", label: "Variance" }, { key: "unit", label: "Unit" }], invVsRecvRows) },
      { n: "Short received material", run: () => fx.printTable("Short Received", [{ key: "mrn", label: "MRN" }, { key: "date", label: "Date" }, { key: "item", label: "Item" }, { key: "qtyInvoiced", label: "Invoiced" }, { key: "qtyReceived", label: "Received" }, { key: "variance", label: "Short qty" }], shortRecvRows) },
      { n: "Location-wise stock", run: () => fx.printTable("Location-wise Stock", [{ key: "sku", label: "SKU" }, { key: "name", label: "Item" }, { key: "locationId", label: "Storage", csv: (r) => locName(r.locationId) }, { key: "qty", label: "On hand" }, { key: "unit", label: "Unit" }, { key: "value", label: "Value", csv: (r) => inr(r.value) }], stockByLocationRows()) },
      { n: "Item location-wise stock", run: () => fx.printTable("Item Location Stock", [{ key: "sku", label: "SKU" }, { key: "name", label: "Item" }, { key: "locationId", label: "Storage", csv: (r) => locName(r.locationId) }, { key: "itemLocationId", label: "Item location", csv: (r) => itemLocName(r.itemLocationId) }, { key: "qty", label: "On hand" }, { key: "value", label: "Value", csv: (r) => inr(r.value) }], stockByItemLocationRows()) },
      { n: "Pending QC by location", run: () => fx.printTable("Pending QC by Location", [{ key: "qcNo", label: "QC no." }, { key: "receiptNo", label: "GRN" }, { key: "item", label: "Item" }, { key: "qty", label: "Qty" }, { key: "storage", label: "Storage" }, { key: "itemLocation", label: "Item location" }, { key: "supplier", label: "Supplier" }], pendingQcRows) },
      { n: "Material Issues", run: () => fx.printTable("Material Issues", [{ key: "no", label: "MIN" }, { key: "date", label: "Date" }, { key: "type", label: "Type" }, { key: "i", label: "Item", csv: (r) => itemName(r.itemId) }, { key: "qtyIssued", label: "Qty" }], store.list("materialIssues")) },
    ];
    return (
      <div>
        <PageHead title="Inventory Reports" desc="All reports carry company header & footer" />
        <div className="grid sm:grid-cols-2 gap-3">{reports.map((r) => (
          <Card key={r.n} className="p-4 flex items-center gap-4"><span className="grid place-items-center w-11 h-11 rounded-xl text-white shrink-0" style={{ background: "var(--accent)" }}><Icon name="chart" size={18} /></span><div className="flex-1"><div className="font-medium text-sm">{r.n}</div></div>{can("print") && <Button variant="soft" icon="printer" onClick={r.run}>Print</Button>}{can("export") && <Button variant="ghost" icon="download" onClick={r.run}>{""}</Button>}</Card>
        ))}</div>
      </div>
    );
  }

  function Dashboard(props) {
    return VG.ModuleDashboard ? <VG.ModuleDashboard modId="inventory" {...props} /> : null;
  }

  /* generic transaction builder (transfer / return / scrap) */
  function TxnBuilder({ open, onClose, roleKey, can, title, seq, coll, fields, onPost }) {
    const [f, setF] = useState({ date: today() });
    const [dirty, setDirty] = useState(false);
    const set = (k, v) => { setDirty(true); setF((p) => ({ ...p, [k]: v })); };
    const avail = f.itemId ? store.onHand(f.itemId, f.fromId || f.locationId) : 0;
    function save() {
      if (!f.itemId) return VG.toast("Select item from master", "error");
      for (const fl of fields) if (fl.req && (f[fl.k] === undefined || f[fl.k] === "")) return VG.toast(fl.l + " required", "error");
      const out = (f.fromId || f.locationId) && (seq === "TRF" || seq === "SCR");
      if (out && Number(f.qty) > avail) return VG.toast("Insufficient stock — only " + avail + " available", "error");
      const no = store.nextNo(seq, f.date);
      store.create(coll, { ...f, no, itemId: f.itemId, by: roleKey }, roleKey);
      onPost(f, no);
      VG.toast(title + " " + no + " posted · stock updated");
      onClose();
    }
    return (
      <Modal open={open} onClose={onClose} size="lg" dirty={dirty} title={"New " + title} subtitle="Updates stock ledger"
        actions={<Button icon="check" onClick={save}>Post</Button>}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Date"><DateF value={f.date} onChange={(v) => set("date", v)} /></Field>
          <Field label="Item (master)" required><MasterSelect variant="line" collection="items" value={f.itemId} onChange={(v) => set("itemId", v)} actorRole={roleKey} can={can("add")} /></Field>
          {fields.map((fl) => (
            <Field key={fl.k} label={fl.l} required={fl.req}>
              {fl.master ? <MasterSelect collection={fl.master} value={f[fl.k]} onChange={(v) => set(fl.k, v)} actorRole={roleKey} can={can("add")} />
                : fl.select ? <Select value={f[fl.k]} onChange={(v) => set(fl.k, v)} options={fl.select.map((o) => ({ value: o, label: o }))} />
                : fl.num ? <Num value={f[fl.k]} onChange={(v) => set(fl.k, v)} /> : <Text value={f[fl.k]} onChange={(v) => set(fl.k, v)} />}
            </Field>
          ))}
          {f.itemId && (f.fromId || f.locationId) && <div className="sm:col-span-2 text-xs opacity-60">Available at source: <b>{avail}</b></div>}
        </div>
      </Modal>
    );
  }

  const SECTIONS = [
    { id: "dashboard", label: "Dashboard", icon: "chart", group: "Overview" },
    { id: "items", label: "Item Master", icon: "box", group: "Inventory" },
    { id: "receipt", label: "Material Receipt", icon: "download", group: "Inventory" },
    { id: "issue", label: "Material Issue", icon: "logout", group: "Inventory" },
    { id: "requirements", label: "Material Requirement", icon: "inbox", group: "Inventory" },
    { id: "ledger", label: "Stock Ledger", icon: "activity", group: "Inventory" },
    { id: "issue-ret", label: "Returnable Challan", icon: "truck", group: "Inventory" },
    { id: "issue-nr", label: "Non-Returnable Challan", icon: "truck", group: "Inventory" },
    { id: "manufacturers", label: "Manufacturers", icon: "database", group: "Masters" },
    { id: "bom", label: "Bill of Materials", icon: "flow", group: "Masters" },
    { id: "categories", label: "Categories", icon: "folder", group: "Masters" },
    { id: "suppliers", label: "Supplier Master", icon: "handshake", group: "Masters" },
    { id: "locations", label: "Storage Locations", icon: "grid", group: "Masters" },
    { id: "itemLocations", label: "Item Locations", icon: "grid", group: "Masters" },
    { id: "transfer", label: "Stock Transfer", icon: "truck", group: "Operations" },
    { id: "returns", label: "Returns", icon: "chevronLeft", group: "Operations" },
    { id: "scrap", label: "Scrap / Rejection", icon: "trash", group: "Operations" },
    { id: "openingBalance", label: "Opening Balance", icon: "database", group: "Operations" },
    { id: "physical", label: "Physical Verification", icon: "check", group: "Operations" },
    { id: "alerts", label: "Stock Alerts", icon: "alert", group: "Reports" },
    { id: "batches", label: "Batch / Lot", icon: "box", group: "Reports" },
    { id: "reports", label: "Reports", icon: "chart", group: "Reports" },
  ];
  if (VG.registerModuleSections) VG.registerModuleSections("inventory", SECTIONS);
  function BomPage(props) {
    return VG.BomListPage ? <VG.BomListPage {...props} mode="inventory" /> : <div className="opacity-60">BOM module not loaded.</div>;
  }

  const PAGES = {
    dashboard: Dashboard, items: ItemsPage, manufacturers: ManufacturersPage, bom: BomPage, categories: CategoriesPage,
    suppliers: SuppliersPage, locations: LocationsPage, itemLocations: ItemLocationsPage, ledger: LedgerPage, receipt: ReceiptPage, issue: IssuePage, requirements: MaterialReqPage,
    "issue-ret": (p) => React.createElement(IssuePage, { ...p, defaultType: "Vendor Returnable Challan" }),
    "issue-nr": (p) => React.createElement(IssuePage, { ...p, defaultType: "Vendor Non-Returnable Challan" }),
    transfer: TransferPage, returns: ReturnsPage, scrap: ScrapPage, openingBalance: OpeningBalancePage, physical: PhysicalPage, alerts: AlertsPage, batches: BatchesPage, reports: ReportsPage,
  };

  VG.modules = VG.modules || {};
  VG.modules.inventory = function InventoryModule({ mod, roleKey }) {
    const can = (a) => VG.can(roleKey, a);
    const [section, setSection] = useState("dashboard");
    const Page = PAGES[section] || Dashboard;
    return (
      <VG.ModuleScaffold mod={mod} sections={SECTIONS} section={section} setSection={setSection} roleKey={roleKey}>
        <Page roleKey={roleKey} can={can} go={setSection} mod={mod} />
      </VG.ModuleScaffold>
    );
  };
})(window.VG);
