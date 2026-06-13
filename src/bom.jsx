/* Veraglo ERP — Bill of Materials (shared Inventory + Production). */
(function (VG) {
  const { useState, useEffect, useMemo, useRef } = React;
  const ui = VG.ui, fx = VG.fx, store = VG.store, inr = VG.fmt.inr, today = VG.fmt.todayISO;
  const { Icon, Button, Pill, Card } = ui;
  const { Field, Text, Area, Num, DateF, Select, Checkbox, MasterSelect, Modal, InternalScreen, RecordTable, PageHead, ListPage, StatusTag, printDocument, DocActions } = fx;

  const itemLabel = (id) => (VG.itemMfr && VG.itemMfr.label(id)) || "—";
  const itemSku = (id) => (store.get("items", id) || {}).sku || "—";
  const itemMfr = (id) => (VG.itemMfr && VG.itemMfr.manufacturerName(store.get("items", id))) || "—";
  const itemPart = (id) => (VG.itemMfr && VG.itemMfr.partNumber(store.get("items", id))) || "—";
  const itemCat = (id) => {
    const it = store.get("items", id) || {};
    const cat = store.get("categories", it.categoryId);
    return (cat && cat.name) || it.category || "—";
  };

  const BOM_STATUS = { Draft: "#94a3b8", Active: "#34d399", Obsolete: "#ef4444" };

  function blankLine() {
    return {
      key: Math.random().toString(36).slice(2), itemId: "", qty: 1, unit: "Nos", scrapPct: 0,
      issueMethod: "Manual", alternateAllowed: false, altItemId: "", processStage: "", remarks: "",
    };
  }

  function fgCategories() {
    const all = store.list("categories");
    const fg = all.filter((c) => ["FNG", "SFG"].includes(c.typeCode));
    return fg.length ? fg : all;
  }

  function normalizeBomForm(record) {
    const fg = record && record.finishedItemId ? store.get("items", record.finishedItemId) : null;
    return {
      date: today(), revision: "Rev-00", revisionNo: 0, status: "Draft", approvalStatus: "Pending",
      qtyOutput: 1, unit: "Nos", isDefault: false, department: "Assembly", line: "Line 1", cycleTimeMin: 30,
      fgCategoryId: "", fgSku: "", fgName: "", fgDescription: "", revisionHistory: [],
      ...record,
      fgSku: record && (record.fgSku || (fg && fg.sku)) || "",
      fgName: record && (record.fgName || (fg && fg.name)) || "",
      fgDescription: record && (record.fgDescription || (fg && (fg.description || fg.name))) || "",
      fgCategoryId: record && (record.fgCategoryId || (fg && fg.categoryId)) || "",
      lines: (record && record.lines && record.lines.length ? record.lines : [blankLine()]).map((l) => ({
        ...l, key: l.key || Math.random().toString(36).slice(2),
      })),
    };
  }

  function BomSection({ title, children, className }) {
    return (
      <div className={"rounded-xl border border-white/25 bg-white/[0.03] shadow-sm " + (className || "")}>
        <div className="px-4 py-2.5 border-b border-white/25 bg-white/[0.06]">
          <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{title}</span>
        </div>
        <div className="p-4">{children}</div>
      </div>
    );
  }

  function bomDoc(bom) {
    const fg = store.get("items", bom.finishedItemId) || {};
    const sku = bom.fgSku || fg.sku || "";
    const cost = store.calcBomCost ? store.calcBomCost(bom.id) : 0;
    const rows = (bom.lines || []).map((l, i) => {
      const it = store.get("items", l.itemId) || {};
      const lineCost = (Number(l.qty) || 0) * (Number(it.rate) || 0);
      const nameCell = VG.itemDisplay ? VG.itemDisplay.itemNameSkuCell(it) : ((it.sku || "") + " — " + (it.name || ""));
      const desc = VG.itemDisplay ? VG.itemDisplay.nl2br(VG.itemDisplay.itemDescription(it)) : "";
      return `<tr><td>${i + 1}</td><td>${nameCell}</td><td>${desc}</td><td>${itemMfr(l.itemId)}</td><td class="vg-right">${l.qty}</td><td>${l.unit || it.unit || ""}</td><td class="vg-right">${l.scrapPct || 0}%</td><td>${l.issueMethod || "Manual"}</td><td class="vg-right">${inr(lineCost)}</td></tr>`;
    }).join("");
    const fgNameCell = VG.itemDisplay ? VG.itemDisplay.itemNameSkuCell(fg) : (sku + " — " + (bom.fgName || fg.name || ""));
    const inner = `
      <div class="vg-cols">
        <div class="vg-card"><b>Finished product</b>${fgNameCell}<br>${bom.fgDescription || (VG.itemDisplay && VG.itemDisplay.nl2br(VG.itemDisplay.itemDescription(fg))) || ""}<br>Output: ${bom.qtyOutput || 1} ${bom.unit || fg.unit || "Nos"}</div>
        <div class="vg-card"><b>BOM</b>${bom.no}<br>${bom.revision || "Rev-00"} · ${bom.status}<br>${bom.isDefault ? "Default BOM" : ""}</div>
        <div class="vg-card"><b>Routing</b>${bom.department || "—"} · ${bom.line || "—"}<br>Cycle: ${bom.cycleTimeMin || "—"} min</div>
      </div>
      <table class="vg-tbl"><thead><tr><th>#</th><th>Item Name / SKU</th><th>Item Description</th><th>Mfr</th><th class="vg-right">Qty</th><th>Unit</th><th class="vg-right">Wastage</th><th>Issue</th><th class="vg-right">Cost</th></tr></thead><tbody>${rows || "<tr><td colspan=9>No components</td></tr>"}</tbody></table>
      <div class="vg-totals"><div class="grand"><span>Std material cost / unit</span><span>${inr(cost)}</span></div></div>
      ${bom.remarks ? `<div class="vg-terms"><b>Remarks:</b> ${bom.remarks}</div>` : ""}`;
    return { title: "Bill of Materials", subtitle: bom.no + " · " + (bom.revision || "Rev-00"), inner, docType: "BOM" };
  }

  function validateBom(f, isEdit, excludeId) {
    if (!isEdit) {
      if (!f.fgCategoryId) return "Select finished goods category";
      if (!f.fgSku) return "SKU could not be generated — select category";
      if (!f.fgName) return "Finished item name is required";
      if ((store.findItemBySku && store.findItemBySku(f.fgSku)) || (VG.skuEngine && VG.skuEngine.isDuplicate(f.fgSku))) return "SKU " + f.fgSku + " already exists in item master";
    }
    if (!f.name) return "BOM name is required";
    if (!f.lines.length) return "Add at least one component";
    if (f.lines.some((l) => !l.itemId)) return "Every component must be selected from item master";
    if (f.lines.some((l) => (Number(l.qty) || 0) <= 0)) return "Component quantity must be greater than zero";
    const fgId = f.finishedItemId;
    if (f.lines.some((l) => l.itemId === fgId)) return "Finished product cannot be its own component";
    const seen = new Set();
    for (const l of f.lines) {
      const it = store.get("items", l.itemId) || {};
      const sku = it.sku || l.itemId;
      const stage = (l.processStage || "").trim();
      const key = sku + "::" + stage;
      if (seen.has(key)) {
        return "Duplicate component " + sku + (stage ? " (stage " + stage + ")" : "") + " — use a different process stage to allow the same SKU twice";
      }
      seen.add(key);
    }
    return null;
  }

  function BomRevisionModal({ open, onClose, onSubmit }) {
    const [reason, setReason] = useState("");
    const [remarks, setRemarks] = useState("");
    function submit() {
      if (!reason.trim()) return VG.toast("Revision reason is required", "error");
      onSubmit({ reason: reason.trim(), remarks: remarks.trim() });
      onClose();
    }
    return (
      <Modal open={open} onClose={onClose} size="sm" title="BOM Revision"
        actions={<Button icon="check" onClick={submit}>Save revision</Button>}>
        <div className="space-y-3">
          <Field label="Reason for revision" required><Area value={reason} onChange={setReason} rows={3} placeholder="Why are components being changed?" /></Field>
          <Field label="Remarks"><Area value={remarks} onChange={setRemarks} rows={2} /></Field>
        </div>
      </Modal>
    );
  }

  function BomForm({ open, onClose, record, roleKey, can, onSaved }) {
    const isEdit = !!(record && record.id);
    const canStructure = can("approve");
    const [dirty, setDirty] = useState(false);
    const [revising, setRevising] = useState(false);
    const [showRevModal, setShowRevModal] = useState(false);
    const [f, setF] = useState(() => normalizeBomForm(record || {}));
    const baselineLines = useRef(null);

    const componentsLocked = isEdit && !revising;
    const canEditComponents = !isEdit || revising;

    const set = (k, v) => { setDirty(true); setF((p) => ({ ...p, [k]: v })); };
    const setLine = (key, patch) => { setDirty(true); setF((p) => ({ ...p, lines: p.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) })); };
    const addLine = () => { setDirty(true); setF((p) => ({ ...p, lines: p.lines.concat(blankLine()) })); };
    const delLine = (key) => { setDirty(true); setF((p) => ({ ...p, lines: p.lines.filter((x) => x.key !== key) })); };

    const pickComponent = (key, itemId) => {
      const it = store.get("items", itemId) || {};
      setLine(key, { itemId, unit: it.unit || "Nos" });
    };

    const pickFgCategory = (categoryId) => {
      setDirty(true);
      setF((p) => ({
        ...p,
        fgCategoryId: categoryId,
        fgSku: isEdit ? p.fgSku : store.nextSku(categoryId),
        name: p.name || (p.fgName ? p.fgName + " BOM" : p.name),
      }));
    };

    useEffect(() => {
      if (!open) return;
      const base = normalizeBomForm(record || {});
      setF(base);
      baselineLines.current = JSON.stringify((base.lines || []).map(({ key, ...l }) => l));
      setDirty(false);
      setRevising(false);
      if (!isEdit && !base.fgCategoryId) {
        const cats = fgCategories();
        const def = cats.find((c) => c.typeCode === "FNG") || cats[0];
        if (def) setF((p) => ({ ...p, fgCategoryId: def.id, fgSku: store.nextSku(def.id) }));
      }
    }, [open, record && record.id]);

    const stdCost = useMemo(() => {
      if (!f.lines.some((l) => l.itemId)) return 0;
      return (f.lines || []).reduce((s, l) => {
        const it = store.get("items", l.itemId) || {};
        const scrap = 1 + (Number(l.scrapPct) || 0) / 100;
        return s + (Number(l.qty) || 0) * scrap * (Number(it.rate) || 0);
      }, 0) / (Number(f.qtyOutput) || 1);
    }, [f.lines, f.qtyOutput]);

    const linesChanged = isEdit && baselineLines.current !== JSON.stringify(f.lines.map(({ key, ...l }) => l));
    const catOptions = fgCategories().map((c) => ({ value: c.id, label: c.name + " (" + c.typeCode + ")" }));

    async function persist(revisionMeta) {
      const err = validateBom(f, isEdit, f.id);
      if (err) return VG.toast(err, "error");

      if (isEdit && linesChanged && !revising) {
        return VG.toast("Component changes require Revise BOM — components are locked after save", "error");
      }
      if (isEdit && revising && !revisionMeta) {
        setShowRevModal(true);
        return;
      }

      const cleanLines = f.lines.map(({ key, ...l }) => l);

      if (!isEdit) {
        const dupBom = store.findBomByFgSku && store.findBomByFgSku(f.fgSku);
        if (dupBom) {
          const ok = await VG.confirm({ title: "Duplicate BOM warning", message: "A BOM already exists for SKU " + f.fgSku + " (" + dupBom.no + "). Create another?", confirmLabel: "Continue" });
          if (!ok) return;
        }
        const cat = store.get("categories", f.fgCategoryId) || {};
        const fgSku = (VG.skuEngine && VG.skuEngine.generate)
          ? VG.skuEngine.generate({ categoryId: f.fgCategoryId, actor: roleKey, module: "BOM" })
          : (f.fgSku || store.nextSku(f.fgCategoryId));
        const fgItem = store.create("items", {
          sku: fgSku,
          skuGeneratedAt: Date.now(),
          skuGeneratedBy: roleKey,
          skuGeneratedModule: "BOM",
          skuManualOverride: false,
          _skuPrepared: true,
          name: f.fgName,
          description: f.fgDescription || f.fgName,
          categoryId: f.fgCategoryId,
          category: cat.name || "Finished Goods",
          unit: f.unit || "Nos",
          taxId: "gst18",
          rate: 0,
          reorder: 0,
          minStock: 0,
          batchTracked: false,
        }, roleKey);
        if (!fgItem) return;
        const payload = {
          ...f,
          finishedItemId: fgItem.id,
          fgSku: fgSku,
          lines: cleanLines,
          qtyOutput: Number(f.qtyOutput) || 1,
          cycleTimeMin: Number(f.cycleTimeMin) || 0,
          revision: "Rev-00",
          revisionNo: 0,
          revisionHistory: [],
          status: "Draft",
          approvalStatus: "Pending",
          no: store.nextNo("BOM", f.date),
        };
        store.create("boms", payload, roleKey);
        VG.toast("BOM " + payload.no + " saved · FG SKU " + fgSku + " created in item master — approve to activate");
      } else if (revising && revisionMeta) {
        const updated = store.reviseBom(f.id, {
          lines: cleanLines,
          reason: revisionMeta.reason,
          remarks: revisionMeta.remarks,
          qtyOutput: Number(f.qtyOutput) || 1,
          unit: f.unit,
        }, roleKey);
        if (!updated) return VG.toast("Revision failed", "error");
        store.update("boms", f.id, {
          name: f.name, department: f.department, line: f.line, cycleTimeMin: Number(f.cycleTimeMin) || 0,
          isDefault: f.isDefault, remarks: f.remarks, date: f.date,
        }, roleKey);
        VG.toast("BOM revised to " + updated.revision);
        setRevising(false);
        baselineLines.current = JSON.stringify(cleanLines);
      } else {
        store.update("boms", f.id, {
          name: f.name, department: f.department, line: f.line, cycleTimeMin: Number(f.cycleTimeMin) || 0,
          isDefault: f.isDefault, remarks: f.remarks, date: f.date, qtyOutput: Number(f.qtyOutput) || 1, unit: f.unit,
        }, roleKey);
        VG.toast("BOM " + f.no + " updated");
      }
      onSaved && onSaved();
      onClose();
    }

    function approveBom() {
      if (!canStructure) return VG.toast("Approval permission required", "error");
      store.approveBom(f.id, roleKey);
      if (f.isDefault && store.setDefaultBom) store.setDefaultBom(f.id, roleKey);
      VG.toast("BOM " + f.revision + " approved and active");
      onSaved && onSaved();
      onClose();
    }

    if (showRevModal) {
      return <BomRevisionModal open onClose={() => setShowRevModal(false)} onSubmit={(meta) => persist(meta)} />;
    }
    return (
        <InternalScreen onBack={onClose} backLabel="Back to BOM list" dirty={dirty}
          title={isEdit ? "BOM " + (f.no || "") + " · " + (f.revision || "Rev-00") : "New Bill of Materials"}
          subtitle={isEdit ? (componentsLocked ? "Components locked — authorized revision required" : "Controlled manufacturing master document") : "Finished goods SKU auto-generated · saved to item master"}
          footer={<>
            <Button variant="soft" icon="eye" onClick={() => printDocument(bomDoc({ ...f, no: f.no || "DRAFT" }), "preview")}>Preview</Button>
            {isEdit && canStructure && f.approvalStatus === "Pending" && (
              <Button variant="soft" icon="shield" onClick={approveBom}>Approve revision</Button>
            )}
            {isEdit && canStructure && !revising && (
              <Button variant="soft" icon="edit" onClick={() => { setRevising(true); VG.toast("Revision mode — changes will create new revision on save"); }}>Revise BOM</Button>
            )}
            {(!isEdit && can("add")) || (isEdit && revising && canStructure) || (isEdit && !revising && can("edit")) ? (
              <Button icon="check" onClick={() => persist(null)}>{isEdit && revising ? "Save revision" : "Save BOM"}</Button>
            ) : null}
          </>}>
          <div className="space-y-4">
            {/* Header */}
            <BomSection title="BOM Header">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {isEdit && <Field label="BOM number"><Text value={f.no || ""} onChange={() => {}} disabled /></Field>}
                <Field label="Effective date"><DateF value={f.date} onChange={(v) => set("date", v)} /></Field>
                <Field label="Revision"><Text value={f.revision || "Rev-00"} onChange={() => {}} disabled /></Field>
                <Field label="Status"><Text value={f.status + (f.approvalStatus === "Pending" ? " (pending approval)" : "")} onChange={() => {}} disabled /></Field>
                <Field label="BOM name" required className="sm:col-span-2"><Text value={f.name} onChange={(v) => set("name", v)} placeholder="e.g. Driver 50W — Standard" /></Field>
                <Field label="Department"><Text value={f.department} onChange={(v) => set("department", v)} /></Field>
                <Field label="Production line"><Text value={f.line} onChange={(v) => set("line", v)} /></Field>
                <Field label="Cycle time (min)"><Num value={f.cycleTimeMin} onChange={(v) => set("cycleTimeMin", v)} /></Field>
              </div>
            </BomSection>

            {/* Finished goods SKU section */}
            <BomSection title="Finished Goods SKU & Details">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Field label="Product category" required hint="Drives SKU prefix per item master rules">
                  <Select value={f.fgCategoryId} onChange={pickFgCategory} disabled={isEdit}
                    options={[{ value: "", label: "Select category…" }].concat(catOptions)} />
                </Field>
                <Field label="Finished goods SKU" hint="Auto-generated · unique · saved to item master">
                  <Text value={f.fgSku || (f.fgCategoryId && !isEdit ? store.nextSku(f.fgCategoryId) : "")} onChange={() => {}} disabled />
                </Field>
                <Field label="Output unit"><Text value={f.unit} onChange={(v) => set("unit", v)} disabled={isEdit && componentsLocked} /></Field>
                <Field label="Finished item name" required className="sm:col-span-2">
                  <Text value={f.fgName} onChange={(v) => { set("fgName", v); if (!isEdit) set("name", v + " BOM"); }} disabled={isEdit} />
                </Field>
                <Field label="BOM output quantity" required>
                  <Num value={f.qtyOutput} onChange={(v) => set("qtyOutput", v)} disabled={componentsLocked && !revising} />
                </Field>
                <Field label="Finished item description" className="sm:col-span-3">
                  <Area value={f.fgDescription} onChange={(v) => set("fgDescription", v)} rows={2} disabled={isEdit} />
                </Field>
                <div className="sm:col-span-3 flex flex-wrap gap-4 items-center">
                  <Checkbox checked={!!f.isDefault} onChange={(v) => set("isDefault", v)} label="Default BOM for this finished goods SKU" />
                  {isEdit && f.fgSku && <Pill color="#6366f1">FG SKU: {f.fgSku}</Pill>}
                </div>
              </div>
            </BomSection>

            {/* Component list */}
            <BomSection title="Component List">
              {componentsLocked && (
                <div className="mb-3 text-xs text-amber-300/90 flex items-center gap-2">
                  <Icon name="lock" size={14} /> Components are locked after save. Authorized users must use <b>Revise BOM</b> to change components.
                </div>
              )}
              <div className="overflow-x-auto border border-white/15 rounded-lg">
                <table className="w-full text-xs min-w-[1100px]">
                  <thead className="text-[10px] uppercase tracking-wider opacity-60 bg-white/[0.04]">
                    <tr className="text-left border-b border-white/20">
                      <th className="px-2 py-2 w-56">Component SKU</th>
                      <th className="px-2 py-2 w-40">Description</th>
                      <th className="px-2 py-2 w-28">Category</th>
                      <th className="px-2 py-2 w-28">Manufacturer</th>
                      <th className="px-2 py-2 w-28">Part no.</th>
                      <th className="px-2 py-2 w-20">Qty</th>
                      <th className="px-2 py-2 w-16">Unit</th>
                      <th className="px-2 py-2 w-16">Wastage %</th>
                      <th className="px-2 py-2 w-24">Issue</th>
                      <th className="px-2 py-2 w-20">Stage</th>
                      <th className="px-2 py-2 w-16">Alt?</th>
                      <th className="px-2 py-2">Remarks</th>
                      {canEditComponents && <th className="w-8" />}
                    </tr>
                  </thead>
                  <tbody>
                    {f.lines.map((l) => (
                      <tr key={l.key} className="border-b border-white/10 align-top hover:bg-white/[0.02]">
                        <td className="px-2 py-2">
                          {canEditComponents ? (
                            <MasterSelect variant="line" collection="items" value={l.itemId} onChange={(v) => pickComponent(l.key, v)} actorRole={roleKey} can={can("add")} />
                          ) : (
                            <span className="font-mono">{itemSku(l.itemId)}</span>
                          )}
                        </td>
                        <td className="px-2 py-2 opacity-80">{l.itemId ? (store.get("items", l.itemId) || {}).name : "—"}</td>
                        <td className="px-2 py-2 opacity-70">{l.itemId ? itemCat(l.itemId) : "—"}</td>
                        <td className="px-2 py-2 opacity-70">{l.itemId ? itemMfr(l.itemId) : "—"}</td>
                        <td className="px-2 py-2 opacity-70 font-mono text-[10px]">{l.itemId ? itemPart(l.itemId) : "—"}</td>
                        <td className="px-2 py-2">{canEditComponents ? <Num value={l.qty} onChange={(v) => setLine(l.key, { qty: v })} /> : l.qty}</td>
                        <td className="px-2 py-2">{canEditComponents ? <Text value={l.unit} onChange={(v) => setLine(l.key, { unit: v })} /> : l.unit}</td>
                        <td className="px-2 py-2">{canEditComponents ? <Num value={l.scrapPct} onChange={(v) => setLine(l.key, { scrapPct: v })} /> : (l.scrapPct || 0) + "%"}</td>
                        <td className="px-2 py-2">
                          {canEditComponents ? (
                            <Select value={l.issueMethod || "Manual"} onChange={(v) => setLine(l.key, { issueMethod: v })}
                              options={["Manual", "Backflush"].map((x) => ({ value: x, label: x }))} />
                          ) : (l.issueMethod || "Manual")}
                        </td>
                        <td className="px-2 py-2">{canEditComponents ? <Text value={l.processStage} onChange={(v) => setLine(l.key, { processStage: v })} placeholder="Optional" /> : (l.processStage || "—")}</td>
                        <td className="px-2 py-2">
                          {canEditComponents ? (
                            <div className="space-y-1">
                              <Checkbox checked={!!l.alternateAllowed} onChange={(v) => setLine(l.key, { alternateAllowed: v, altItemId: v ? l.altItemId : "" })} label="Yes" />
                              {l.alternateAllowed && <MasterSelect variant="line" collection="items" value={l.altItemId} onChange={(v) => setLine(l.key, { altItemId: v })} actorRole={roleKey} can={can("add")} />}
                            </div>
                          ) : (l.alternateAllowed ? "Yes" + (l.altItemId ? " · " + itemSku(l.altItemId) : "") : "No")}
                        </td>
                        <td className="px-2 py-2">{canEditComponents ? <Text value={l.remarks} onChange={(v) => setLine(l.key, { remarks: v })} /> : (l.remarks || "—")}</td>
                        {canEditComponents && (
                          <td className="px-2 py-2">
                            {f.lines.length > 1 && (
                              <button type="button" className="p-1 rounded chrome-hover text-rose-400" onClick={() => delLine(l.key)} title="Remove"><Icon name="trash" size={14} /></button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canEditComponents && (
                <div className="mt-3 flex justify-start">
                  <Button variant="soft" icon="plus" onClick={addLine}>Add component</Button>
                </div>
              )}
            </BomSection>

            {/* Costing summary */}
            <BomSection title="Costing / Quantity Summary">
              <div className="grid sm:grid-cols-3 gap-4 text-sm">
                <div><span className="text-[11px] uppercase opacity-50">Components</span><div className="text-xl font-bold">{f.lines.length}</div></div>
                <div><span className="text-[11px] uppercase opacity-50">Output per BOM</span><div className="text-xl font-bold">{f.qtyOutput || 1} {f.unit}</div></div>
                <div><span className="text-[11px] uppercase opacity-50">Std material cost / unit</span><div className="text-xl font-bold">{inr(stdCost)}</div></div>
              </div>
              <Field label="BOM remarks" className="mt-3"><Area value={f.remarks} onChange={(v) => set("remarks", v)} rows={2} /></Field>
            </BomSection>

            {/* Revision history */}
            {isEdit && (f.revisionHistory || []).length > 0 && (
              <BomSection title="Revision History">
                <ul className="space-y-3 max-h-48 overflow-y-auto text-xs">
                  {(f.revisionHistory || []).slice().reverse().map((h, i) => (
                    <li key={i} className="border border-white/15 rounded-lg p-3">
                      <div className="flex flex-wrap gap-2 items-center mb-1">
                        <Pill color="#a78bfa">{h.revision}</Pill>
                        <span className="opacity-60">{new Date(h.revisedAt).toLocaleString()}</span>
                        <span className="opacity-50">by {h.revisedBy}</span>
                        {h.approvedBy && <Pill color="#34d399">Approved: {h.approvedBy}</Pill>}
                      </div>
                      <div className="opacity-80"><b>Reason:</b> {h.reason}</div>
                      {h.remarks && <div className="opacity-60 mt-1">{h.remarks}</div>}
                      <div className="opacity-50 mt-1">Components: {(h.oldLines || h.snapshot && h.snapshot.lines || []).length} → {(h.newLines || []).length}</div>
                    </li>
                  ))}
                </ul>
              </BomSection>
            )}

            {/* Approval section */}
            {isEdit && (
              <BomSection title="Approval">
                <div className="grid sm:grid-cols-3 gap-3 text-sm">
                  <div><span className="text-[11px] uppercase opacity-50">Approval status</span><div className="mt-1"><StatusTag value={f.approvalStatus || "Pending"} map={{ Pending: "#f59e0b", Approved: "#22c55e", Rejected: "#ef4444" }} /></div></div>
                  <div><span className="text-[11px] uppercase opacity-50">Revised by</span><div className="mt-1 opacity-80">{f.revisedBy || "—"}</div></div>
                  <div><span className="text-[11px] uppercase opacity-50">Approved by</span><div className="mt-1 opacity-80">{f.approvedBy || "—"}</div></div>
                </div>
                {f.approvalStatus === "Pending" && canStructure && (
                  <div className="mt-3"><Button icon="shield" onClick={approveBom}>Approve BOM for production use</Button></div>
                )}
              </BomSection>
            )}
          </div>
        </InternalScreen>
    );
  }

  function BomListPage({ roleKey, can, mode }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const [view, setView] = useState(null);
    const rows = store.list("boms").slice().reverse();
    const cols = [
      { key: "no", label: "BOM #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "fgSku", label: "FG SKU", render: (r) => <span className="font-mono text-xs">{r.fgSku || itemSku(r.finishedItemId)}</span> },
      { key: "fgName", label: "Finished product", render: (r) => r.fgName || itemLabel(r.finishedItemId), csv: (r) => r.fgName || itemLabel(r.finishedItemId) },
      { key: "name", label: "BOM name" },
      { key: "revision", label: "Rev" },
      { key: "lines", label: "Components", render: (r) => (r.lines || []).length },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={BOM_STATUS} /> },
      { key: "isDefault", label: "Default", render: (r) => r.isDefault ? <Pill color="#34d399">Yes</Pill> : "—" },
    ];
    if (mode === "production") {
      cols.push({
        key: "cost",
        label: "Std cost",
        render: (r) => inr(store.calcBomCost ? store.calcBomCost(r.id) : 0),
      });
    }
    if (edit) {
      return <BomForm open record={edit.id ? edit : null} onClose={() => setEdit(null)} roleKey={roleKey} can={can} />;
    }
    if (view) {
      const bom = store.get("boms", view.id) || view;
      return (
        <InternalScreen onBack={() => setView(null)} backLabel="Back to BOM list" title={"BOM " + bom.no} subtitle={(bom.fgSku || "") + " · " + (bom.revision || "Rev-00")}
          footer={<>
            <DocActions docType="BOM" build={() => bomDoc(bom)} />
            {(can("edit") || can("approve")) && <Button onClick={() => { setView(null); setEdit(bom); }}>Open BOM</Button>}
          </>}>
          <div className="flex flex-wrap gap-2 mb-4">
            <StatusTag value={bom.status} map={BOM_STATUS} />
            <Pill color="#6366f1">{bom.fgSku || itemSku(bom.finishedItemId)}</Pill>
            {bom.approvalStatus === "Pending" && <Pill color="#f59e0b">Pending approval</Pill>}
          </div>
          <div className="text-sm grid sm:grid-cols-3 gap-3 mb-4">
            <Card className="p-3 border border-white/20"><div className="text-[11px] uppercase opacity-55">Finished product</div>{bom.fgName || itemLabel(bom.finishedItemId)}</Card>
            <Card className="p-3 border border-white/20"><div className="text-[11px] uppercase opacity-55">Components</div>{(bom.lines || []).length}</Card>
            <Card className="p-3 border border-white/20"><div className="text-[11px] uppercase opacity-55">Std cost / unit</div>{inr(store.calcBomCost(bom.id))}</Card>
          </div>
          <div className="overflow-x-auto border border-white/20 rounded-xl">
            <table className="w-full text-xs">
              <thead className="opacity-55 text-[10px] uppercase border-b border-white/20 vg-sticky-thead"><tr>
                <th className="text-left py-2 px-3">SKU</th><th className="text-left py-2 px-3">Component</th><th className="text-right py-2 px-3">Qty</th><th className="py-2 px-3">Unit</th><th className="text-right py-2 px-3">Wastage</th><th className="py-2 px-3">Issue</th>
              </tr></thead>
              <tbody>
                {(bom.lines || []).map((l, i) => (
                  <tr key={i} className="border-t border-white/10">
                    <td className="py-2 px-3 font-mono">{itemSku(l.itemId)}</td>
                    <td className="py-2 px-3">{itemLabel(l.itemId)}</td>
                    <td className="text-right py-2 px-3">{l.qty}</td>
                    <td className="py-2 px-3">{l.unit}</td>
                    <td className="text-right py-2 px-3">{l.scrapPct || 0}%</td>
                    <td className="py-2 px-3">{l.issueMethod || "Manual"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </InternalScreen>
      );
    }
    return (
      <ListPage
        title={mode === "production" ? "BOM & Material Requirements" : "Bill of Materials"}
        desc={mode === "production"
          ? "Active approved BOMs linked to work orders · issue components from shop floor"
          : "Controlled manufacturing master — auto SKU · revision control · component locking"}
        onNew={can("add") ? () => setEdit({}) : null}
        newLabel="Add BOM"
        can={can}>
        <RecordTable embedded suppressNew tableId="bom-register" title="BOM List" columns={cols} rows={rows} can={can} printTitle="BOM Register" searchKeys={["no", "name", "revision", "fgSku", "fgName"]}
          filters={[{ key: "status", label: "All status", options: ["Draft", "Active", "Obsolete"] }]}
          onNew={can("add") ? () => setEdit({}) : null}
          onEdit={can("edit") || can("approve") ? (r) => setEdit(r) : null}
          onView={(r) => setView(r)}
          onDelete={can("delete") ? async (r) => {
            if (await VG.confirm({ title: "Delete BOM " + r.no + "?", danger: true, confirmLabel: "Delete" })) {
              store.remove("boms", r.id, roleKey);
              VG.toast("Deleted");
            }
          } : null}
        />
      </ListPage>
    );
  }

  function BomRequirementsPage({ roleKey, can }) {
    VG.useDB();
    const [woId, setWoId] = useState("");
    const wos = store.list("workOrders").filter((w) => w.status === "Released" || w.status === "Running" || w.status === "Planned");
    const wo = woId ? store.get("workOrders", woId) : null;
    const fgId = wo && (wo.finishedItemId || ((store.findItemBySku && store.findItemBySku(wo.sku)) || {}).id);
    const bom = wo && ((wo.bomId && store.get("boms", wo.bomId)) || (fgId && store.getDefaultBom && store.getDefaultBom(fgId)));
    const mult = wo ? Number(wo.qtyPlanned) || 1 : 1;
    const reqs = bom && store.explodeBom ? store.explodeBom(bom.id, mult) : [];

    function issueMaterials(allowPartial) {
      if (!wo) return;
      const res = store.issueBomForWorkOrder(wo.id, roleKey, { allowPartial: !!allowPartial });
      if (!res.ok) return VG.toast(res.reason || "Could not issue", "error");
      if (res.skipped && res.skipped.length) {
        VG.toast("Issued " + res.issued.length + " lines · " + res.skipped.length + " short on stock", "warn");
      } else {
        VG.toast("Materials issued for " + wo.no + " (" + res.issued.length + " lines)", "success");
      }
    }

    return (
      <div className="space-y-4">
        <PageHead title="Material requirements (MRP)" desc="Explode approved BOM for a work order and post component issues to stock" />
        <Card className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3 border border-white/20">
          <Field label="Work order">
            <Select value={woId} onChange={setWoId} options={[{ value: "", label: "Select work order…" }].concat(wos.map((w) => ({ value: w.id, label: w.no + " · " + (w.product || "") + " (" + w.status + ")" })))} />
          </Field>
          {wo && (
            <>
              <div className="text-sm"><div className="text-[11px] uppercase opacity-55">Planned qty</div><b>{wo.qtyPlanned}</b></div>
              <div className="text-sm"><div className="text-[11px] uppercase opacity-55">BOM</div>{bom ? <span className="font-mono text-xs">{bom.no} {bom.revision}</span> : <span className="text-rose-400">No approved BOM</span>}</div>
            </>
          )}
        </Card>
        {wo && bom && (
          <>
            <div className="flex flex-wrap gap-2">
              {can("add") && <>
                <Button icon="logout" onClick={() => issueMaterials(false)}>Issue all materials</Button>
                <Button variant="soft" onClick={() => issueMaterials(true)}>Issue available only</Button>
              </>}
              <Button variant="soft" icon="eye" onClick={() => printDocument(bomDoc(bom), "preview")}>Print BOM</Button>
            </div>
            <Card className="p-0 overflow-hidden border border-white/20">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase opacity-55 border-b border-white/20">
                  <th className="px-4 py-2">Component</th><th className="px-4 py-2 text-right">Required</th><th className="px-4 py-2 text-right">On hand</th><th className="px-4 py-2">Status</th>
                </tr></thead>
                <tbody>
                  {reqs.map((r, i) => {
                    const avail = store.onHand(r.itemId);
                    const ok = avail >= r.qty;
                    return (
                      <tr key={i} className="border-b border-white/10">
                        <td className="px-4 py-2">{itemLabel(r.itemId)}</td>
                        <td className="px-4 py-2 text-right">{r.qty} {r.unit}</td>
                        <td className="px-4 py-2 text-right">{avail}</td>
                        <td className="px-4 py-2">{ok ? <Pill color="#34d399">OK</Pill> : <Pill color="#f59e0b">Short {Math.max(0, r.qty - avail)}</Pill>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </>
        )}
        {wo && !bom && <Card className="p-6 text-sm opacity-60 text-center border border-white/20">No active approved BOM for SKU <b>{wo.sku || "—"}</b>. Create and approve one in Inventory → BOM.</Card>}
        {!wo && <Card className="p-6 text-sm opacity-50 text-center border border-white/20">Select a work order to view exploded requirements.</Card>}
      </div>
    );
  }

  VG.BomListPage = BomListPage;
  VG.BomRequirementsPage = BomRequirementsPage;
  VG.BomForm = BomForm;
  VG.bomDoc = bomDoc;
})(window.VG);
