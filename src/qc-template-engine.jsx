/* Veraglo ERP — QC inspection template engine (CRUD, matching, checklist, PDF) */
(function (VG) {
  const { useState, useMemo } = React;
  const ui = VG.ui, fx = VG.fx, store = VG.store, today = VG.fmt.todayISO;
  const { Icon, Button, Pill, Card, Toggle } = ui;
  const { Field, Text, Area, Num, Select, Modal, InternalScreen, RecordTable, PageHead, ListPage, StatusTag, printDocument, DocActions } = fx;
  const LIB = VG.QC_TEMPLATE_LIBRARY || {};
  const QA = VG.QC_AVIATION || {};

  const TEMPLATE_TYPES = [
    { value: "incoming", label: "Incoming Inspection" },
    { value: "in-process", label: "In-Process Inspection" },
    { value: "final", label: "Final Inspection" },
    { value: "fat", label: "FAT Report" },
    { value: "mqp", label: "MQP Report" },
    { value: "customer-report", label: "Customer Inspection Report" },
  ];

  const FIELD_TYPES = [
    { value: "passfail", label: "Pass/Fail" },
    { value: "yesno", label: "Yes/No" },
    { value: "text", label: "Text" },
    { value: "number", label: "Number" },
    { value: "measure", label: "Measurement" },
    { value: "dropdown", label: "Dropdown" },
    { value: "date", label: "Date" },
    { value: "time", label: "Time" },
    { value: "remarks", label: "Remarks" },
    { value: "signature", label: "Signature" },
  ];

  function normalizeTemplate(t) {
    if (!t) return null;
    return {
      active: t.active !== false,
      revision: t.revision || 1,
      department: t.department || "Quality Control",
      assignCategoryKeywords: t.assignCategoryKeywords || [],
      assignSkuPatterns: t.assignSkuPatterns || [],
      assignProductTypes: t.assignProductTypes || [],
      assignCustomerKeys: t.assignCustomerKeys || [],
      assignStageIds: t.assignStageIds || (t.templateKey ? [t.templateKey] : []),
      passLogic: t.passLogic || "all_required_pass",
      fields: t.fields || [],
      sections: t.sections || null,
      mqpStages: t.mqpStages || null,
      ...t,
    };
  }

  function getTemplateById(id) {
    if (!id) return null;
    if (store.getQcTemplate) {
      const rec = store.getQcTemplate(id);
      if (rec) return normalizeTemplate(rec);
    }
    const rec = store.get("qcInspectionTemplates", id);
    if (rec) return normalizeTemplate(rec);
    return (LIB.MASTER || []).find((t) => t.id === id || t.templateKey === id) || null;
  }

  function templateFields(tpl) {
    if (!tpl) return [];
    if (tpl.fields && tpl.fields.length) return tpl.fields;
    if (tpl.sections) return tpl.sections.reduce((a, s) => a.concat(s.fields || []), []);
    return [];
  }

  function blankChecklist(tpl) {
    const out = {};
    if (tpl && tpl.sections) {
      tpl.sections.forEach((sec) => { out[sec.id] = blankChecklist({ fields: sec.fields }); });
      return out;
    }
    templateFields(tpl).forEach((f) => {
      let val = "Pass";
      if (f.type === "number" || f.type === "measure") val = "";
      else if (f.type === "text" || f.type === "date" || f.type === "time" || f.type === "signature") val = "";
      else if (f.type === "yesno") val = "Yes";
      else if (f.type === "dropdown" && f.options && f.options.length) val = f.options[0];
      out[f.id] = { value: val, remark: "" };
    });
    return out;
  }

  function evaluateChecklist(tpl, checklist, overrideFail) {
    const fields = templateFields(tpl);
    let pass = 0, fail = 0, total = 0, criticalFail = false;
    const walk = (cl) => {
      fields.forEach((f) => {
        const row = cl && cl[f.id];
        if (!row) return;
        total++;
        const v = String(row.value || "").toLowerCase();
        const isFail = v === "fail" || v === "no" || v === "rejected";
        if (isFail) {
          fail++;
          if (f.critical) criticalFail = true;
        } else if (row.value) pass++;
      });
      if (cl && typeof cl === "object") {
        Object.keys(cl).forEach((k) => {
          if (cl[k] && typeof cl[k] === "object" && !("value" in cl[k])) walk(cl[k]);
        });
      }
    };
    walk(checklist);
    let suggested = "Accepted";
    if (criticalFail && !overrideFail) suggested = "Rejected";
    else if (fail > 0 && !overrideFail) suggested = "Hold";
    else if (fail > 0 && overrideFail) suggested = "Accepted";
    return { pass, fail, total, criticalFail, suggested, passRate: total ? Math.round((pass / total) * 100) : 100 };
  }

  function scoreMatches(hay, patterns) {
    if (!patterns || !patterns.length) return 0;
    const h = (hay || "").toLowerCase();
    let score = 0;
    patterns.forEach((p) => { if (h.indexOf(String(p).toLowerCase()) >= 0) score += 10; });
    return score;
  }

  function resolveTemplates(ctx) {
    ctx = ctx || {};
    const all = store.list("qcInspectionTemplates").filter((t) => t.active !== false);
    const type = ctx.type || ctx.inspectionType || "incoming";
    let pool = all.filter((t) => t.type === type);
    if (!pool.length && LIB.MASTER) pool = LIB.MASTER.filter((t) => t.type === type);

    const item = ctx.itemId ? store.get("items", ctx.itemId) : null;
    const cat = item && item.categoryId ? store.get("categories", item.categoryId) : null;
    const hay = [item && item.name, item && item.description, item && item.sku, cat && cat.name, ctx.sku, ctx.productName].filter(Boolean).join(" ");
    const customerHay = (ctx.customerName || "").toLowerCase();
    const stageId = ctx.stageId || ctx.operationStage || "";

    const scored = pool.map((t) => {
      let score = t.type === type ? 5 : 0;
      score += scoreMatches(hay, t.assignCategoryKeywords);
      score += scoreMatches(hay, t.assignSkuPatterns);
      score += scoreMatches(hay, t.assignProductTypes);
      if (stageId && (t.assignStageIds || []).some((s) => stageId.indexOf(s) >= 0 || s === stageId)) score += 25;
      if (customerHay && (t.assignCustomerKeys || []).some((c) => customerHay.indexOf(c.toLowerCase()) >= 0)) score += 15;
      if (ctx.templateId && (t.id === ctx.templateId || t.templateKey === ctx.templateId)) score += 100;
      return { template: normalizeTemplate(t), score };
    }).filter((x) => x.score > 0 || !hay).sort((a, b) => b.score - a.score);

    return scored.map((x) => x.template);
  }

  function buildInspectionPdf(doc, tpl, reportType) {
    const co = store.company();
    const tplName = (tpl && tpl.name) || reportType || "QC Inspection";
    const evalResult = tpl ? evaluateChecklist(tpl, doc.checklist) : null;
    const headerRows = [
      ["Inspection #", doc.no || "—"], ["Date", doc.inspectionDate || doc.date || today()],
      ["Inspector", doc.inspectorName || doc.inspectedBy || "—"], ["Department", doc.department || "Quality Control"],
      ["Type", reportType || tplName], ["GRN/WO/SO", doc.receiptNo || doc.workOrderNo || doc.salesOrderNo || "—"],
      ["SKU", doc.sku || "—"], ["Description", doc.itemDescription || "—"],
      ["Qty received/produced", doc.qtyReceived || doc.qtyForQc || "—"], ["Qty inspected", doc.qtySampled || doc.qtyInspected || "—"],
      ["Qty accepted", doc.acceptQty || "—"], ["Qty rejected", doc.rejectQty || "—"],
      ["Batch/Lot", doc.batch || doc.batchNo || "—"], ["Revision", doc.revision || doc.drawingRevision || "—"],
      ["Customer/Project", doc.customerName || doc.projectName || "—"], ["Final result", doc.status || doc.result || "—"],
    ];
    const headerHtml = "<table class='vg-tbl'><tbody>" + headerRows.map((r) => "<tr><th style='width:38%'>" + r[0] + "</th><td>" + r[1] + "</td></tr>").join("") + "</tbody></table>";

    const checklistRows = [];
    const walk = (cl, prefix, fields) => {
      (fields || templateFields(tpl)).forEach((f) => {
        const row = cl && cl[f.id];
        if (!row) return;
        checklistRows.push("<tr><td>" + prefix + f.label + "</td><td>" + (row.value || "—") + "</td><td>" + (f.criteria || "") + "</td><td>" + (row.remark || "") + "</td></tr>");
      });
      if (cl && typeof cl === "object") {
        Object.keys(cl).forEach((k) => {
          if (cl[k] && typeof cl[k] === "object" && !("value" in cl[k])) walk(cl[k], k + " / ", null);
        });
      }
    };
    if (doc.checklist && tpl && tpl.sections) {
      tpl.sections.forEach((sec) => walk(doc.checklist[sec.id], sec.title + " · ", sec.fields));
    } else walk(doc.checklist, "", tpl && tpl.fields);

    const summaryHtml = evalResult ? "<p><b>Checklist score:</b> " + evalResult.pass + " pass / " + evalResult.fail + " fail of " + evalResult.total + " (" + evalResult.passRate + "%)</p>" : "";
    const checklistHtml = checklistRows.length
      ? "<table class='vg-tbl'><thead><tr><th>Checkpoint</th><th>Reading/Result</th><th>Criteria</th><th>Remark</th></tr></thead><tbody>" + checklistRows.join("") + "</tbody></table>"
      : "";

    const inner = `
      <div class="vg-head"><div><div class="vg-co">${co.name || "Veraglo"}</div><div class="vg-sub">${tplName}</div></div></div>
      <h3 style="margin:12px 0 6px;font-size:13px">Inspection Header</h3>${headerHtml}
      ${summaryHtml}
      <h3 style="margin:12px 0 6px;font-size:13px">Inspection Checklist</h3>${checklistHtml || "<p>No checklist data recorded.</p>"}
      <div class="vg-terms">${doc.remarks ? "<b>Remarks:</b> " + doc.remarks : ""}</div>
      <div class="vg-sign"><div>Inspected by: <b>${doc.inspectorName || doc.inspectedBy || "—"}</b></div><div>Approved by: <b>${doc.approvedBy || "—"}</b></div><div>Date: ${today()}</div></div>`;
    return { title: tplName, subtitle: (doc.no || "") + " · " + (co.name || ""), inner };
  }

  function ChecklistForm({ template, checklist, onChange, readOnly, onEval }) {
    const tpl = normalizeTemplate(template);
    if (!tpl) return null;
    const cl = checklist || blankChecklist(tpl);
    const setField = (fid, key, val) => {
      if (readOnly) return;
      const next = { ...cl, [fid]: { ...(cl[fid] || {}), [key]: val } };
      onChange && onChange(next);
      if (onEval) onEval(evaluateChecklist(tpl, next));
    };
    const fields = templateFields(tpl);
    const evalResult = evaluateChecklist(tpl, cl);
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs font-semibold uppercase opacity-55">{tpl.name}</div>
          <div className="flex gap-2 text-[11px]">
            <Pill color="#34d399">Pass {evalResult.pass}</Pill>
            <Pill color="#ef4444">Fail {evalResult.fail}</Pill>
            <Pill color="#6366f1">{evalResult.passRate}%</Pill>
            {evalResult.criticalFail && <Pill color="#ef4444">Critical fail</Pill>}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {fields.map((f) => {
            const row = cl[f.id] || { value: "", remark: "" };
            const fail = String(row.value).toLowerCase() === "fail" || String(row.value).toLowerCase() === "no";
            return (
              <div key={f.id} className={"rounded-lg border p-2.5 text-sm " + (fail ? "border-rose-500/40" : "border-[var(--vg-border)]")}>
                <div className="font-medium text-xs mb-1.5">{f.label}{f.unit ? " (" + f.unit + ")" : ""}{f.critical ? " *" : ""}</div>
                {(f.type === "number" || f.type === "measure" || f.type === "text" || f.type === "date" || f.type === "time" || f.type === "signature") && (
                  <input type={f.type === "number" || f.type === "measure" ? "number" : f.type === "date" ? "date" : f.type === "time" ? "time" : "text"}
                    className="vg-input w-full rounded-lg text-xs mb-1" readOnly={readOnly} value={row.value || ""}
                    onChange={(e) => setField(f.id, "value", e.target.value)} placeholder={f.criteria || ""} />
                )}
                {(f.type === "passfail" || !f.type) && (
                  <Select value={row.value || "Pass"} onChange={(v) => setField(f.id, "value", v)} disabled={readOnly}
                    options={["Pass", "Fail", "N/A"].map((x) => ({ value: x, label: x }))} />
                )}
                {f.type === "yesno" && (
                  <Select value={row.value || "Yes"} onChange={(v) => setField(f.id, "value", v)} disabled={readOnly}
                    options={["Yes", "No"].map((x) => ({ value: x, label: x }))} />
                )}
                {f.type === "dropdown" && (
                  <Select value={row.value || (f.options && f.options[0]) || ""} onChange={(v) => setField(f.id, "value", v)} disabled={readOnly}
                    options={(f.options || []).map((x) => ({ value: x, label: x }))} />
                )}
                {f.criteria && <div className="text-[10px] opacity-50 mb-1">{f.criteria}</div>}
                <input className="vg-input w-full rounded-lg text-[11px]" readOnly={readOnly} value={row.remark || ""}
                  onChange={(e) => setField(f.id, "remark", e.target.value)} placeholder="Remark / photo ref" />
              </div>
            );
          })}
        </div>
        {evalResult.criticalFail && <div className="text-xs text-rose-400 rounded-lg p-2 border border-rose-500/30">Critical checkpoint failed — result will be Rejected/Hold unless authorized override.</div>}
      </div>
    );
  }

  function TemplatePicker({ ctx, value, onChange, label }) {
    const options = useMemo(() => resolveTemplates(ctx), [ctx.type, ctx.itemId, ctx.stageId, ctx.customerName, ctx.templateId, value]);
    const cur = value || (options[0] && options[0].id) || "";
    return (
      <Field label={label || "Inspection template"}>
        <Select value={cur} onChange={(v) => onChange && onChange(v, getTemplateById(v))}
          options={options.length ? options.map((t) => ({ value: t.id, label: t.name + " (rev " + (t.revision || 1) + ")" })) : [{ value: "", label: "No matching template" }]} />
        {options[0] && !value && onChange && <div className="text-[10px] opacity-50 mt-1">Auto-selected: {options[0].name}</div>}
      </Field>
    );
  }

  function TemplatesPage({ roleKey, can }) {
    VG.useDB();
    const [view, setView] = useState(null);
    const [filter, setFilter] = useState("");
    const rows = store.list("qcInspectionTemplates").slice().reverse();
    const filtered = filter ? rows.filter((t) => t.type === filter) : rows;

    if (view === "edit" || view === "new") {
      return <TemplateEditor roleKey={roleKey} can={can} record={view === "new" ? null : view} onClose={() => setView(null)} />;
    }
    if (view && view.id) {
      const t = getTemplateById(view.id) || view;
      return (
        <InternalScreen onBack={() => setView(null)} title={t.name} subtitle={t.type + " · rev " + (t.revision || 1)}
          footer={<>
            <DocActions build={() => buildInspectionPdf({ no: "PREVIEW", date: today(), checklist: blankChecklist(t) }, t, t.type)} />
            {can("edit") && <Button variant="soft" onClick={() => setView(t)}>Edit</Button>}
            {can("add") && <Button variant="soft" onClick={() => { store.duplicateQcTemplate(t.id, roleKey); VG.toast("Template duplicated"); }}>Duplicate</Button>}
          </>}>
          <div className="flex flex-wrap gap-2 mb-4">
            <Pill color={t.active !== false ? "#34d399" : "#94a3b8"}>{t.active !== false ? "Active" : "Inactive"}</Pill>
            <Pill color="#6366f1">{templateFields(t).length} fields</Pill>
          </div>
          <Card className="p-3 mb-4 text-sm">
            <div className="grid sm:grid-cols-2 gap-2 text-xs opacity-80">
              <div>Category keywords: {(t.assignCategoryKeywords || []).join(", ") || "—"}</div>
              <div>SKU patterns: {(t.assignSkuPatterns || []).join(", ") || "—"}</div>
              <div>Product types: {(t.assignProductTypes || []).join(", ") || "—"}</div>
              <div>Stages: {(t.assignStageIds || []).join(", ") || "—"}</div>
            </div>
          </Card>
          {t.type === "mqp" && t.mqpStages ? (
            <RecordTable embedded suppressNew title="MQP Stages" columns={[
              { key: "stage", label: "Stage" }, { key: "responsibility", label: "Responsibility" },
              { key: "frequency", label: "Frequency" }, { key: "holdPoint", label: "Hold", render: (r) => r.holdPoint ? "Yes" : "—" },
            ]} rows={t.mqpStages} can={can} />
          ) : (
            <ChecklistForm template={t} checklist={blankChecklist(t)} readOnly />
          )}
        </InternalScreen>
      );
    }

    return (
      <ListPage title="Inspection Templates" desc="Create, assign and use industry-ready QC templates for incoming, in-process, final, FAT & MQP" can={can}>
        <div className="flex flex-wrap gap-2 mb-4">
          {can("add") && <Button icon="plus" onClick={() => setView("new")}>Create template</Button>}
          {can("edit") && <Button variant="soft" onClick={() => { store.seedQcTemplates(false, roleKey); VG.toast("Master templates refreshed"); }}>Refresh master library</Button>}
          <Select value={filter} onChange={setFilter} options={[{ value: "", label: "All types" }].concat(TEMPLATE_TYPES)} />
        </div>
        <RecordTable embedded suppressNew tableId="qc-templates" title="Template Library" columns={[
          { key: "name", label: "Template" },
          { key: "type", label: "Type", render: (r) => <Pill color="#6366f1">{(TEMPLATE_TYPES.find((x) => x.value === r.type) || {}).label || r.type}</Pill> },
          { key: "revision", label: "Rev" },
          { key: "active", label: "Status", render: (r) => <StatusTag value={r.active !== false ? "Active" : "Inactive"} map={{ Active: "#34d399", Inactive: "#94a3b8" }} /> },
          { key: "fields", label: "Fields", render: (r) => templateFields(r).length },
        ]} rows={filtered} can={can} onView={(r) => setView(r)} printTitle="QC Template Register"
          empty="No templates — click Refresh master library or Create template" />
      </ListPage>
    );
  }

  function TemplateEditor({ roleKey, can, record, onClose }) {
    const isNew = !record || !record.id;
    const [t, setT] = useState(() => normalizeTemplate(record || {
      type: "incoming", name: "New Inspection Template", fields: [{ id: "f1", label: "Visual inspection", type: "passfail", required: true }],
      assignCategoryKeywords: [], assignSkuPatterns: [], active: true, revision: 1,
    }));
    const set = (k, v) => setT((p) => ({ ...p, [k]: v }));
    const setField = (idx, patch) => setT((p) => {
      const fields = (p.fields || []).slice();
      fields[idx] = { ...fields[idx], ...patch };
      return { ...p, fields };
    });
    function save() {
      if (!can("edit") && !can("add")) return VG.toast("No permission", "error");
      store.saveQcTemplate(t, roleKey);
      VG.toast("Template saved");
      onClose();
    }
    return (
      <InternalScreen onBack={onClose} title={isNew ? "Create template" : "Edit template"} subtitle={t.type}
        footer={<>{can("edit") || can("add") ? <Button icon="check" onClick={save}>Save template</Button> : null}</>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <Field label="Template name" required><Text value={t.name} onChange={(v) => set("name", v)} /></Field>
          <Field label="Type"><Select value={t.type} onChange={(v) => set("type", v)} options={TEMPLATE_TYPES} disabled={!isNew && !can("settings")} /></Field>
          <Field label="Department"><Text value={t.department} onChange={(v) => set("department", v)} /></Field>
          <Field label="Category keywords (comma)"><Text value={(t.assignCategoryKeywords || []).join(", ")} onChange={(v) => set("assignCategoryKeywords", v.split(",").map((x) => x.trim()).filter(Boolean))} /></Field>
          <Field label="SKU patterns (comma)"><Text value={(t.assignSkuPatterns || []).join(", ")} onChange={(v) => set("assignSkuPatterns", v.split(",").map((x) => x.trim()).filter(Boolean))} /></Field>
          <Field label="Stage IDs (comma)"><Text value={(t.assignStageIds || []).join(", ")} onChange={(v) => set("assignStageIds", v.split(",").map((x) => x.trim()).filter(Boolean))} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={t.active !== false} onChange={(e) => set("active", e.target.checked)} /> Active template</label>
        </div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Checklist fields</h3>
          {can("edit") && <Button variant="soft" className="!py-1" onClick={() => set("fields", (t.fields || []).concat([{ id: "f" + Date.now(), label: "New checkpoint", type: "passfail", required: true }]))}>Add field</Button>}
        </div>
        <div className="space-y-2 max-h-[50vh] overflow-auto">
          {(t.fields || []).map((f, idx) => (
            <Card key={f.id || idx} className="p-3 grid sm:grid-cols-4 gap-2">
              <Field label="Label"><Text value={f.label} onChange={(v) => setField(idx, { label: v })} /></Field>
              <Field label="Type"><Select value={f.type || "passfail"} onChange={(v) => setField(idx, { type: v })} options={FIELD_TYPES} /></Field>
              <Field label="Unit"><Text value={f.unit || ""} onChange={(v) => setField(idx, { unit: v })} /></Field>
              <Field label="Criteria"><Text value={f.criteria || ""} onChange={(v) => setField(idx, { criteria: v })} /></Field>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!f.critical} onChange={(e) => setField(idx, { critical: e.target.checked })} /> Critical</label>
              {can("delete") && <Button variant="ghost" className="!py-1 text-rose-400" onClick={() => set("fields", t.fields.filter((_, i) => i !== idx))}>Remove</Button>}
            </Card>
          ))}
        </div>
      </InternalScreen>
    );
  }

  VG.QC_TEMPLATE = {
    TEMPLATE_TYPES, FIELD_TYPES,
    normalizeTemplate, getTemplateById, templateFields, blankChecklist,
    evaluateChecklist, resolveTemplates, buildInspectionPdf,
    ChecklistForm, TemplatePicker, TemplatesPage,
  };
})(window.VG);
