/* Veraglo ERP — QC inspection template engine (CRUD, matching, dynamic checklist, PDF) */
(function (VG) {
  const { useState, useMemo } = React;
  const ui = VG.ui, fx = VG.fx, store = VG.store, today = VG.fmt.todayISO;
  const { Icon, Button, Pill, Card, Toggle } = ui;
  const { Field, Text, Area, Num, Select, Modal, InternalScreen, RecordTable, PageHead, ListPage, StatusTag, printDocument, DocActions } = fx;
  const LIB = VG.QC_TEMPLATE_LIBRARY || {};
  const PL = VG.QC_PARAM_LIB || {};
  const GROUPS = PL.GROUPS || { mandatory: "Mandatory", optional: "Optional", custom: "Custom" };

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
    { value: "datetime", label: "Date/Time" },
    { value: "remarks", label: "Remarks" },
    { value: "signature", label: "Signature" },
  ];

  const SEVERITY_OPTS = [
    { value: "critical", label: "Critical" },
    { value: "major", label: "Major" },
    { value: "minor", label: "Minor" },
  ];

  function fieldSeverity(f) {
    if (f && f.severity) return f.severity;
    if (f && f.critical) return "critical";
    if (f && (f.group === "optional" || f.mandatory === false)) return "minor";
    return "major";
  }

  function normalizeTemplate(t) {
    if (!t) return null;
    return {
      active: t.active !== false,
      revision: t.revision || 1,
      department: t.department || "Quality Control",
      engineVersion: t.engineVersion || (t.sections ? 3 : 2),
      assignCategoryKeywords: t.assignCategoryKeywords || [],
      assignSkuPatterns: t.assignSkuPatterns || [],
      assignProductTypes: t.assignProductTypes || [],
      assignCustomerKeys: t.assignCustomerKeys || [],
      assignStageIds: t.assignStageIds || (t.templateKey ? [t.templateKey] : []),
      passLogic: t.passLogic || "severity_weighted",
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

  function defaultFieldValue(f) {
    if (f.type === "number" || f.type === "measure") return "";
    if (f.type === "text" || f.type === "date" || f.type === "time" || f.type === "datetime" || f.type === "signature") return "";
    if (f.type === "yesno") return "Yes";
    if (f.type === "dropdown" && f.options && f.options.length) return f.options[0];
    return "Pass";
  }

  function blankFieldRow(f) {
    return {
      value: defaultFieldValue(f),
      remark: "",
      mode: "perform",
      enabled: f.enabled !== false,
      attachment: "",
      observations: "",
    };
  }

  function blankChecklist(tpl) {
    const out = { _meta: { customFields: [] } };
    if (tpl && tpl.sections) {
      tpl.sections.forEach((sec) => {
        out[sec.id] = {};
        (sec.fields || []).forEach((f) => { out[sec.id][f.id] = blankFieldRow(f); });
      });
      return out;
    }
    delete out._meta;
    templateFields(tpl).forEach((f) => { out[f.id] = blankFieldRow(f); });
    return out;
  }

  function isRowActive(row) {
    if (!row || typeof row !== "object") return false;
    if ("value" in row && row.enabled === false) return false;
    if (row.mode === "skip" || row.mode === "na") return false;
    return true;
  }

  function isRowFail(row) {
    const v = String(row.value || "").toLowerCase();
    return v === "fail" || v === "no" || v === "rejected";
  }

  function evaluateChecklist(tpl, checklist, overrideFail) {
    const fields = templateFields(tpl);
    let pass = 0, fail = 0, total = 0, skipped = 0, na = 0;
    let criticalFail = false, majorFail = false, minorFail = false;

    function processField(f, row) {
      if (!row || typeof row !== "object" || !("value" in row)) return;
      if (row.enabled === false) return;
      if (row.mode === "skip") { skipped++; return; }
      if (row.mode === "na") { na++; return; }
      total++;
      const sev = fieldSeverity(f);
      if (isRowFail(row)) {
        fail++;
        if (sev === "critical") criticalFail = true;
        else if (sev === "major") majorFail = true;
        else minorFail = true;
      } else if (row.value !== "" && row.value != null) pass++;
    }

    function walkFields(cl, fieldList) {
      (fieldList || fields).forEach((f) => processField(f, cl && cl[f.id]));
      if (cl && typeof cl === "object") {
        Object.keys(cl).forEach((k) => {
          if (k === "_meta") return;
          const sub = cl[k];
          if (sub && typeof sub === "object" && !("value" in sub)) walkFields(sub, null);
        });
      }
    }

    if (tpl && tpl.sections && checklist) {
      tpl.sections.forEach((sec) => walkFields(checklist[sec.id], sec.fields));
      const custom = (checklist._meta && checklist._meta.customFields) || [];
      custom.forEach((cf) => {
        const secCl = checklist[cf.sectionId] || checklist;
        processField(cf, secCl[cf.id]);
      });
    } else {
      walkFields(checklist, fields);
    }

    let suggested = "Accepted";
    if (criticalFail && !overrideFail) suggested = "Rejected";
    else if (majorFail && !overrideFail) suggested = "Hold";
    else if (minorFail && !overrideFail) suggested = "Conditional Acceptance";
    else if (fail > 0 && overrideFail) suggested = "Accepted";

    return {
      pass, fail, total, skipped, na,
      criticalFail, majorFail, minorFail, suggested,
      passRate: total ? Math.round((pass / total) * 100) : 100,
      failRate: total ? Math.round((fail / total) * 100) : 0,
    };
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

  function qrPlaceholder(text) {
    const safe = String(text || "QC").slice(0, 80);
    return "<div style='float:right;width:72px;height:72px;border:1px solid #ccc;display:grid;place-items:center;font-size:8px;text-align:center;padding:4px'>QR<br/>" + safe + "</div>";
  }

  function buildNcrPdf(ncr) {
    const co = store.company();
    const inner = `
      ${qrPlaceholder(ncr.no)}
      <div class="vg-head"><div><div class="vg-co">${co.name || "Veraglo"}</div><div class="vg-sub">Non-Conformance Report (NCR)</div></div></div>
      <table class="vg-tbl"><tbody>
        <tr><th>NCR #</th><td>${ncr.no || "—"}</td></tr>
        <tr><th>Date</th><td>${ncr.date || today()}</td></tr>
        <tr><th>Source</th><td>${ncr.source || "—"}</td></tr>
        <tr><th>Severity</th><td>${ncr.severity || "Major"}</td></tr>
        <tr><th>Disposition</th><td>${ncr.disposition || "—"}</td></tr>
        <tr><th>Status</th><td>${ncr.status || "Open"}</td></tr>
        <tr><th>Raised by</th><td>${ncr.raisedBy || "—"}</td></tr>
      </table>
      <div class="vg-terms">${ncr.remarks ? "<b>Remarks:</b> " + ncr.remarks : ""}</div>`;
    return { title: "NCR Report", subtitle: ncr.no + " · " + (co.name || ""), inner };
  }

  function buildInspectionPdf(doc, tpl, reportType) {
    const co = store.company();
    const tplName = (tpl && tpl.name) || reportType || "QC Inspection";
    const evalResult = tpl ? evaluateChecklist(tpl, doc.checklist) : null;
    const reportNo = doc.no || doc.testReportNo || "—";
    const headerRows = [
      ["Report number", reportNo], ["Date", doc.inspectionDate || doc.date || today()],
      ["Inspector", doc.inspectorName || doc.inspectedBy || "—"], ["Approver", doc.approvedBy || "—"],
      ["Department", doc.department || "Quality Control"], ["Report type", reportType || tplName],
      ["GRN/WO/SO", doc.receiptNo || doc.workOrderNo || doc.salesOrderNo || "—"],
      ["SKU / Product", doc.sku || "—"], ["Description", doc.itemDescription || "—"],
      ["Qty received/produced", doc.qtyReceived || doc.qtyForQc || "—"], ["Qty inspected", doc.qtySampled || doc.qtyInspected || "—"],
      ["Qty accepted", doc.acceptQty || "—"], ["Qty rejected", doc.rejectQty || "—"],
      ["Batch/Lot", doc.batch || doc.batchNo || "—"], ["Revision", doc.revision || doc.drawingRevision || "—"],
      ["Customer/Project", doc.customerName || doc.projectName || "—"], ["Final result", doc.status || doc.result || evalResult && evalResult.suggested || "—"],
    ];
    const headerHtml = qrPlaceholder(reportNo) + "<table class='vg-tbl'><tbody>" + headerRows.map((r) => "<tr><th style='width:38%'>" + r[0] + "</th><td>" + r[1] + "</td></tr>").join("") + "</tbody></table>";

    const checklistRows = [];
    function rowHtml(f, row, prefix) {
      if (!row) return;
      const mode = row.mode || "perform";
      const modeLabel = mode === "skip" ? "Skipped" : mode === "na" ? "N/A" : "";
      const result = modeLabel || (row.value || "—");
      const sev = fieldSeverity(f);
      checklistRows.push("<tr><td>" + prefix + (row.label || f.label) + (f.unit ? " (" + f.unit + ")" : "") + "</td><td>" + result + "</td><td>" + (f.criteria || "") + "</td><td>" + sev + "</td><td>" + (row.remark || row.observations || "") + (row.attachment ? " · 📎 " + row.attachment : "") + "</td></tr>");
    }

    function walkFlat(cl, prefix, fieldList) {
      (fieldList || templateFields(tpl)).forEach((f) => rowHtml(f, cl && cl[f.id], prefix));
    }

    if (doc.checklist && tpl && tpl.sections) {
      tpl.sections.forEach((sec) => {
        checklistRows.push("<tr><td colspan='5' style='font-weight:600;background:#f1f5f9'>" + sec.title + "</td></tr>");
        (sec.fields || []).forEach((f) => rowHtml(f, doc.checklist[sec.id] && doc.checklist[sec.id][f.id], ""));
      });
      const custom = (doc.checklist._meta && doc.checklist._meta.customFields) || [];
      if (custom.length) {
        checklistRows.push("<tr><td colspan='5' style='font-weight:600;background:#f1f5f9'>User-added tests</td></tr>");
        custom.forEach((cf) => rowHtml(cf, (doc.checklist[cf.sectionId] || doc.checklist)[cf.id], ""));
      }
    } else walkFlat(doc.checklist, "", tpl && tpl.fields);

    const summaryHtml = evalResult
      ? "<p><b>Checklist:</b> " + evalResult.pass + " pass / " + evalResult.fail + " fail / " + evalResult.skipped + " skipped / " + evalResult.na + " N/A of " + (evalResult.total + evalResult.skipped + evalResult.na) + " checkpoints (" + evalResult.passRate + "% pass, " + evalResult.failRate + "% fail). <b>Suggested:</b> " + evalResult.suggested + "</p>"
      : "";
    const checklistHtml = checklistRows.length
      ? "<table class='vg-tbl'><thead><tr><th>Checkpoint</th><th>Reading/Result</th><th>Criteria</th><th>Severity</th><th>Remark / Photo</th></tr></thead><tbody>" + checklistRows.join("") + "</tbody></table>"
      : "";

    const inner = `
      <div class="vg-head"><div><div class="vg-co">${co.name || "Veraglo"}</div><div class="vg-sub">${tplName}</div></div></div>
      <h3 style="margin:12px 0 6px;font-size:13px">Inspection Header</h3>${headerHtml}
      ${summaryHtml}
      <h3 style="margin:12px 0 6px;font-size:13px">Inspection Checklist</h3>${checklistHtml || "<p>No checklist data recorded.</p>"}
      <div class="vg-terms">${doc.remarks ? "<b>Remarks:</b> " + doc.remarks : ""}</div>
      <div class="vg-sign"><div>Inspected by: <b>${doc.inspectorName || doc.inspectedBy || "—"}</b></div><div>Approved by: <b>${doc.approvedBy || "—"}</b></div><div>Date: ${today()}</div></div>`;
    return { title: tplName, subtitle: reportNo + " · " + (co.name || ""), inner };
  }

  function ModeToggle({ value, onChange, readOnly }) {
    const modes = [{ v: "perform", l: "Perform" }, { v: "skip", l: "Skip" }, { v: "na", l: "N/A" }];
    return (
      <div className="flex gap-1 mb-1.5">
        {modes.map((m) => (
          <label key={m.v} className={"flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border cursor-pointer " + (value === m.v ? "border-indigo-400 bg-indigo-500/10" : "border-[var(--vg-border)] opacity-60")}>
            <input type="radio" className="sr-only" checked={(value || "perform") === m.v} disabled={readOnly} onChange={() => onChange(m.v)} />
            {m.l}
          </label>
        ))}
      </div>
    );
  }

  function FieldCard({ f, row, readOnly, allowCustomize, onPatch, onRemove }) {
    const r = row || blankFieldRow(f);
    const inactive = r.mode === "skip" || r.mode === "na" || r.enabled === false;
    const fail = !inactive && isRowFail(r);
    const sev = fieldSeverity(f);
    const canRemove = allowCustomize && !readOnly && (f.group === "optional" || f.group === "custom" || String(f.id).indexOf("custom_") === 0);

    return (
      <div className={"rounded-lg border p-2.5 text-sm " + (fail ? "border-rose-500/40" : inactive ? "border-[var(--vg-border)] opacity-50" : "border-[var(--vg-border)]")}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="font-medium text-xs">{r.label || f.label}{f.unit ? " (" + f.unit + ")" : ""}</div>
          <Pill color={sev === "critical" ? "#ef4444" : sev === "major" ? "#f59e0b" : "#94a3b8"}>{sev}</Pill>
        </div>
        {allowCustomize && !readOnly && <ModeToggle value={r.mode || "perform"} onChange={(v) => onPatch({ mode: v })} readOnly={readOnly} />}
        {!inactive && (
          <>
            {(f.type === "number" || f.type === "measure" || f.type === "text" || f.type === "date" || f.type === "time" || f.type === "datetime" || f.type === "signature") && (
              <input type={f.type === "number" || f.type === "measure" ? "number" : f.type === "date" ? "date" : f.type === "time" ? "time" : "text"}
                className="vg-input w-full rounded-lg text-xs mb-1" readOnly={readOnly} value={r.value || ""}
                onChange={(e) => onPatch({ value: e.target.value })} placeholder={f.criteria || ""} />
            )}
            {(f.type === "passfail" || !f.type) && (
              <Select value={r.value || "Pass"} onChange={(v) => onPatch({ value: v })} disabled={readOnly}
                options={["Pass", "Fail", "N/A"].map((x) => ({ value: x, label: x }))} />
            )}
            {f.type === "yesno" && (
              <Select value={r.value || "Yes"} onChange={(v) => onPatch({ value: v })} disabled={readOnly}
                options={["Yes", "No"].map((x) => ({ value: x, label: x }))} />
            )}
            {f.type === "dropdown" && (
              <Select value={r.value || (f.options && f.options[0]) || ""} onChange={(v) => onPatch({ value: v })} disabled={readOnly}
                options={(f.options || []).map((x) => ({ value: x, label: x }))} />
            )}
          </>
        )}
        {f.criteria && <div className="text-[10px] opacity-50 mb-1">{f.criteria}</div>}
        <input className="vg-input w-full rounded-lg text-[11px] mb-1" readOnly={readOnly} value={r.remark || ""}
          onChange={(e) => onPatch({ remark: e.target.value })} placeholder="Remark" />
        <input className="vg-input w-full rounded-lg text-[11px] mb-1" readOnly={readOnly} value={r.attachment || ""}
          onChange={(e) => onPatch({ attachment: e.target.value })} placeholder="Photo / attachment ref" />
        <input className="vg-input w-full rounded-lg text-[11px]" readOnly={readOnly} value={r.observations || ""}
          onChange={(e) => onPatch({ observations: e.target.value })} placeholder="Additional observations" />
        {canRemove && <Button variant="ghost" className="!py-0.5 mt-1 text-rose-400 text-[10px]" onClick={onRemove}>Remove</Button>}
      </div>
    );
  }

  function DynamicChecklistForm({ template, checklist, onChange, readOnly, onEval, allowCustomize }) {
    const tpl = normalizeTemplate(template);
    if (!tpl) return null;
    const customize = allowCustomize !== false && !readOnly;
    const cl = checklist || blankChecklist(tpl);

    const pushEval = (next) => {
      onChange && onChange(next);
      if (onEval) onEval(evaluateChecklist(tpl, next));
    };

    const setField = (secId, fid, patch) => {
      if (readOnly) return;
      let next;
      if (secId) {
        next = { ...cl, [secId]: { ...(cl[secId] || {}), [fid]: { ...(cl[secId] && cl[secId][fid] || {}), ...patch } } };
      } else {
        next = { ...cl, [fid]: { ...(cl[fid] || {}), ...patch } };
      }
      pushEval(next);
    };

    const addCustom = (secId) => {
      const id = "custom_" + Date.now();
      const cf = { id, label: "Custom checkpoint", type: "passfail", group: "custom", severity: "minor", sectionId: secId || null };
      const meta = { ...(cl._meta || {}), customFields: ((cl._meta && cl._meta.customFields) || []).concat([cf]) };
      const targetSec = secId || "_custom";
      const secData = { ...(cl[targetSec] || {}), [id]: { ...blankFieldRow(cf), label: cf.label, custom: true } };
      pushEval({ ...cl, _meta: meta, [targetSec]: secData });
    };

    const removeCustom = (secId, fid) => {
      const meta = { ...(cl._meta || {}), customFields: ((cl._meta && cl._meta.customFields) || []).filter((x) => x.id !== fid) };
      const targetSec = secId || "_custom";
      const secData = { ...(cl[targetSec] || {}) };
      delete secData[fid];
      pushEval({ ...cl, _meta: meta, [targetSec]: secData });
    };

    const evalResult = evaluateChecklist(tpl, cl);
    const renderFields = (fieldList, secId) => (
      <div className="grid sm:grid-cols-2 gap-2">
        {(fieldList || []).map((f) => (
          <FieldCard key={f.id} f={f} row={secId ? (cl[secId] && cl[secId][f.id]) : cl[f.id]} readOnly={readOnly} allowCustomize={customize}
            onPatch={(patch) => setField(secId, f.id, patch)}
            onRemove={() => removeCustom(secId, f.id)} />
        ))}
        {customize && secId && ((cl._meta && cl._meta.customFields) || []).filter((cf) => cf.sectionId === secId).map((cf) => (
          <FieldCard key={cf.id} f={cf} row={cl[secId] && cl[secId][cf.id]} readOnly={readOnly} allowCustomize={customize}
            onPatch={(patch) => setField(secId, cf.id, patch)}
            onRemove={() => removeCustom(secId, cf.id)} />
        ))}
      </div>
    );

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs font-semibold uppercase opacity-55">{tpl.name}</div>
          <div className="flex gap-2 text-[11px] flex-wrap">
            <Pill color="#34d399">Pass {evalResult.pass}</Pill>
            <Pill color="#ef4444">Fail {evalResult.fail}</Pill>
            <Pill color="#6366f1">{evalResult.passRate}%</Pill>
            {evalResult.skipped > 0 && <Pill color="#94a3b8">Skip {evalResult.skipped}</Pill>}
            {evalResult.na > 0 && <Pill color="#94a3b8">N/A {evalResult.na}</Pill>}
            {evalResult.criticalFail && <Pill color="#ef4444">Critical</Pill>}
            {evalResult.majorFail && <Pill color="#f59e0b">Major</Pill>}
            {evalResult.minorFail && <Pill color="#22d3ee">Minor</Pill>}
          </div>
        </div>
        {tpl.sections ? tpl.sections.map((sec) => (
          <Card key={sec.id} className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">{sec.title}</div>
              {customize && <Button variant="soft" className="!py-0.5 text-[10px]" onClick={() => addCustom(sec.id)}>Add parameter</Button>}
            </div>
            {renderFields(sec.fields, sec.id)}
          </Card>
        )) : renderFields(templateFields(tpl), null)}
        {customize && !tpl.sections && (
          <Button variant="soft" className="!py-1 text-xs" onClick={() => addCustom(null)}>Add custom parameter</Button>
        )}
        {(evalResult.criticalFail || evalResult.majorFail) && (
          <div className="text-xs text-rose-400 rounded-lg p-2 border border-rose-500/30">
            {evalResult.criticalFail ? "Critical failure — inspection will be Rejected." : "Major failure — inspection will be placed on Hold/Rework."}
            {evalResult.minorFail ? " Minor failures may result in Conditional Acceptance." : ""}
          </div>
        )}
      </div>
    );
  }

  function ChecklistForm(props) {
    return <DynamicChecklistForm {...props} />;
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

  function paramLibraryOptions(type, templateKey) {
    if (!PL.buildIncomingSections) return [];
    let sections = [];
    if (type === "incoming") sections = PL.buildIncomingSections(templateKey || "general");
    else if (type === "in-process") sections = PL.buildInProcessSections(templateKey || "pcb_assembly");
    else if (type === "final") sections = PL.buildFinalSections();
    else if (type === "fat") sections = PL.buildFatSections(templateKey);
    return PL.flattenSections ? PL.flattenSections(sections) : [];
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
        <InternalScreen onBack={() => setView(null)} title={t.name} subtitle={t.type + " · rev " + (t.revision || 1) + " · v" + (t.engineVersion || 2)}
          footer={<>
            <DocActions build={() => buildInspectionPdf({ no: "PREVIEW", date: today(), checklist: blankChecklist(t) }, t, t.type)} />
            {can("edit") && <Button variant="soft" onClick={() => setView(t)}>Edit</Button>}
            {can("add") && <Button variant="soft" onClick={() => { store.duplicateQcTemplate(t.id, roleKey); VG.toast("Template duplicated"); }}>Duplicate</Button>}
          </>}>
          <div className="flex flex-wrap gap-2 mb-4">
            <Pill color={t.active !== false ? "#34d399" : "#94a3b8"}>{t.active !== false ? "Active" : "Inactive"}</Pill>
            <Pill color="#6366f1">{templateFields(t).length} parameters</Pill>
            {t.sections && <Pill color="#22d3ee">{t.sections.length} sections</Pill>}
          </div>
          <Card className="p-3 mb-4 text-sm">
            <div className="grid sm:grid-cols-2 gap-2 text-xs opacity-80">
              <div>Category keywords: {(t.assignCategoryKeywords || []).join(", ") || "—"}</div>
              <div>SKU patterns: {(t.assignSkuPatterns || []).join(", ") || "—"}</div>
              <div>Customer keys: {(t.assignCustomerKeys || []).join(", ") || "—"}</div>
              <div>Stages: {(t.assignStageIds || []).join(", ") || "—"}</div>
            </div>
          </Card>
          {t.type === "mqp" && t.mqpStages ? (
            <RecordTable embedded suppressNew title="MQP Stages" columns={[
              { key: "manufacturingStage", label: "Stage" }, { key: "inspectionPoint", label: "Inspection point" },
              { key: "testParameter", label: "Test parameter" }, { key: "acceptanceCriteria", label: "Acceptance" },
              { key: "frequency", label: "Frequency" }, { key: "responsibility", label: "Responsibility" },
              { key: "recordGenerated", label: "Record" },
              { key: "holdPoint", label: "Hold", render: (r) => r.holdPoint ? "Yes" : "—" },
              { key: "witnessPoint", label: "Witness", render: (r) => r.witnessPoint ? "Yes" : "—" },
            ]} rows={t.mqpStages} can={can} />
          ) : (
            <DynamicChecklistForm template={t} checklist={blankChecklist(t)} readOnly allowCustomize={false} />
          )}
        </InternalScreen>
      );
    }

    return (
      <ListPage title="Inspection Templates" desc="Dynamic templates with maximum parameters — incoming, in-process, final, FAT, MQP & customer plans" can={can}>
        <div className="flex flex-wrap gap-2 mb-4">
          {can("add") && <Button icon="plus" onClick={() => setView("new")}>Create template</Button>}
          {can("edit") && <Button variant="soft" onClick={() => { store.seedQcTemplates(true, roleKey); VG.toast("Master library refreshed (v3)"); }}>Refresh master library</Button>}
          <Select value={filter} onChange={setFilter} options={[{ value: "", label: "All types" }].concat(TEMPLATE_TYPES)} />
        </div>
        <RecordTable embedded suppressNew tableId="qc-templates" title="Template Library" columns={[
          { key: "name", label: "Template" },
          { key: "type", label: "Type", render: (r) => <Pill color="#6366f1">{(TEMPLATE_TYPES.find((x) => x.value === r.type) || {}).label || r.type}</Pill> },
          { key: "revision", label: "Rev" },
          { key: "engineVersion", label: "Engine", render: (r) => "v" + (r.engineVersion || 2) },
          { key: "active", label: "Status", render: (r) => <StatusTag value={r.active !== false ? "Active" : "Inactive"} map={{ Active: "#34d399", Inactive: "#94a3b8" }} /> },
          { key: "fields", label: "Params", render: (r) => templateFields(r).length },
        ]} rows={filtered} can={can} onView={(r) => setView(r)} printTitle="QC Template Register"
          empty="No templates — click Refresh master library or Create template" />
      </ListPage>
    );
  }

  function TemplateEditor({ roleKey, can, record, onClose }) {
    const isNew = !record || !record.id;
    const [t, setT] = useState(() => normalizeTemplate(record || {
      type: "incoming", name: "New Inspection Template", templateKey: "general",
      fields: [{ id: "f1", label: "Visual inspection", type: "passfail", severity: "major", group: "mandatory" }],
      assignCategoryKeywords: [], assignSkuPatterns: [], active: true, revision: 1, engineVersion: 3,
    }));
    const [importId, setImportId] = useState("");
    const set = (k, v) => setT((p) => ({ ...p, [k]: v }));
    const fields = t.fields || [];

    const setField = (idx, patch) => setT((p) => {
      const fs = (p.fields || []).slice();
      fs[idx] = { ...fs[idx], ...patch };
      return { ...p, fields: fs };
    });

    const moveField = (idx, dir) => setT((p) => {
      const fs = (p.fields || []).slice();
      const j = idx + dir;
      if (j < 0 || j >= fs.length) return p;
      const tmp = fs[idx]; fs[idx] = fs[j]; fs[j] = tmp;
      return { ...p, fields: fs };
    });

    function importFromLibrary() {
      const libField = paramLibraryOptions(t.type, t.templateKey).find((f) => f.id === importId);
      if (!libField) return VG.toast("Select a parameter", "warn");
      if (fields.some((f) => f.id === libField.id)) return VG.toast("Already in template", "warn");
      set("fields", fields.concat([{ ...libField }]));
      setImportId("");
      VG.toast("Parameter added");
    }

    function rebuildFromLibrary() {
      if (!PL.buildRichTemplate) return VG.toast("Parameter library not loaded", "error");
      const rich = PL.buildRichTemplate({ type: t.type, templateKey: t.templateKey || "general", name: t.name, id: t.id });
      setT((p) => normalizeTemplate({ ...p, ...rich, fields: rich.fields, sections: rich.sections, engineVersion: 3 }));
      VG.toast("Template rebuilt from master library");
    }

    function save() {
      if (!can("edit") && !can("add")) return VG.toast("No permission", "error");
      store.saveQcTemplate(t, roleKey);
      VG.toast("Template saved");
      onClose();
    }

    const libOpts = paramLibraryOptions(t.type, t.templateKey);

    return (
      <InternalScreen onBack={onClose} title={isNew ? "Create template" : "Edit template"} subtitle={t.type + " · engine v" + (t.engineVersion || 3)}
        footer={<>{can("edit") || can("add") ? <Button icon="check" onClick={save}>Save template</Button> : null}</>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <Field label="Template name" required><Text value={t.name} onChange={(v) => set("name", v)} /></Field>
          <Field label="Type"><Select value={t.type} onChange={(v) => set("type", v)} options={TEMPLATE_TYPES} disabled={!isNew && !can("settings")} /></Field>
          <Field label="Material/stage key"><Text value={t.templateKey || ""} onChange={(v) => set("templateKey", v)} placeholder="led, pcb_assembly, PGCIL…" /></Field>
          <Field label="Department"><Text value={t.department} onChange={(v) => set("department", v)} /></Field>
          <Field label="Category keywords (comma)"><Text value={(t.assignCategoryKeywords || []).join(", ")} onChange={(v) => set("assignCategoryKeywords", v.split(",").map((x) => x.trim()).filter(Boolean))} /></Field>
          <Field label="Customer keys (comma)"><Text value={(t.assignCustomerKeys || []).join(", ")} onChange={(v) => set("assignCustomerKeys", v.split(",").map((x) => x.trim()).filter(Boolean))} /></Field>
          <Field label="SKU patterns (comma)"><Text value={(t.assignSkuPatterns || []).join(", ")} onChange={(v) => set("assignSkuPatterns", v.split(",").map((x) => x.trim()).filter(Boolean))} /></Field>
          <Field label="Stage IDs (comma)"><Text value={(t.assignStageIds || []).join(", ")} onChange={(v) => set("assignStageIds", v.split(",").map((x) => x.trim()).filter(Boolean))} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={t.active !== false} onChange={(e) => set("active", e.target.checked)} /> Active template</label>
        </div>
        {can("edit") && PL.buildRichTemplate && (
          <div className="flex flex-wrap gap-2 mb-4">
            <Button variant="soft" className="!py-1" onClick={rebuildFromLibrary}>Rebuild from parameter library</Button>
            <Select value={importId} onChange={setImportId} options={[{ value: "", label: "Import parameter…" }].concat(libOpts.map((f) => ({ value: f.id, label: f.label + " (" + f.id + ")" })))} />
            <Button variant="soft" className="!py-1" onClick={importFromLibrary} disabled={!importId}>Add parameter</Button>
          </div>
        )}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Checklist parameters ({fields.length})</h3>
          {can("edit") && <Button variant="soft" className="!py-1" onClick={() => set("fields", fields.concat([{ id: "f" + Date.now(), label: "New checkpoint", type: "passfail", severity: "major", group: "optional" }]))}>Add field</Button>}
        </div>
        <div className="space-y-2 max-h-[50vh] overflow-auto">
          {fields.map((f, idx) => (
            <Card key={f.id || idx} className="p-3 grid sm:grid-cols-6 gap-2">
              <Field label="Label"><Text value={f.label} onChange={(v) => setField(idx, { label: v })} /></Field>
              <Field label="Type"><Select value={f.type || "passfail"} onChange={(v) => setField(idx, { type: v })} options={FIELD_TYPES} /></Field>
              <Field label="Group"><Select value={f.group || "mandatory"} onChange={(v) => setField(idx, { group: v })} options={Object.keys(GROUPS).map((k) => ({ value: k, label: GROUPS[k] }))} /></Field>
              <Field label="Severity"><Select value={fieldSeverity(f)} onChange={(v) => setField(idx, { severity: v, critical: v === "critical" })} options={SEVERITY_OPTS} /></Field>
              <Field label="Unit"><Text value={f.unit || ""} onChange={(v) => setField(idx, { unit: v })} /></Field>
              <Field label="Criteria"><Text value={f.criteria || ""} onChange={(v) => setField(idx, { criteria: v })} /></Field>
              <div className="sm:col-span-6 flex gap-1">
                {can("edit") && <Button variant="ghost" className="!py-0.5 text-[10px]" onClick={() => moveField(idx, -1)}>↑</Button>}
                {can("edit") && <Button variant="ghost" className="!py-0.5 text-[10px]" onClick={() => moveField(idx, 1)}>↓</Button>}
                {can("delete") && <Button variant="ghost" className="!py-0.5 text-rose-400" onClick={() => set("fields", fields.filter((_, i) => i !== idx))}>Remove</Button>}
              </div>
            </Card>
          ))}
        </div>
      </InternalScreen>
    );
  }

  VG.QC_TEMPLATE = {
    TEMPLATE_TYPES, FIELD_TYPES, GROUPS,
    normalizeTemplate, getTemplateById, templateFields, blankChecklist, blankFieldRow,
    fieldSeverity, evaluateChecklist, resolveTemplates, buildInspectionPdf, buildNcrPdf,
    ChecklistForm, DynamicChecklistForm, TemplatePicker, TemplatesPage,
  };
})(window.VG);
