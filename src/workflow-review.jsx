/* Veraglo ERP — Mandatory confirm → review → forward workflow for all stage advancements */
(function (VG) {
  const { useState, useEffect } = React;
  const ui = VG.ui;
  const fx = VG.fx;
  const store = VG.store;
  const { Icon, Button, Card, Pill } = ui;
  const { InternalScreen, Field, Text, Area, Num, DateF, Select } = fx;
  const today = VG.fmt.todayISO;
  const inr = VG.fmt.inr;

  let handlerSeq = 0;
  VG._workflowReviewHandlers = VG._workflowReviewHandlers || {};

  function fmtRev(n) {
    return VG.soRevision && VG.soRevision.revLabel
      ? VG.soRevision.revLabel(n)
      : ("R" + String(Number(n) || 0).padStart(2, "0"));
  }

  function registerHandler(fn) {
    const id = "wfr_" + (++handlerSeq) + "_" + Date.now();
    VG._workflowReviewHandlers[id] = fn;
    return id;
  }

  function consumeHandler(id) {
    if (!id) return null;
    const fn = VG._workflowReviewHandlers[id];
    delete VG._workflowReviewHandlers[id];
    return fn;
  }

  const FIELD_SCHEMAS = {
    "sales_order:production": [
      { key: "priority", label: "Production priority", type: "select", options: ["Normal", "Urgent", "High Priority", "Critical"] },
      { key: "requiredCompletionDate", label: "Required production completion date", type: "date" },
      { key: "technicalNotes", label: "Technical notes", type: "area", rows: 2 },
      { key: "drawingRefs", label: "Drawing / reference documents", type: "text" },
      { key: "specialInstructions", label: "Special production instructions", type: "area", rows: 2 },
    ],
    "work_order:material_requirement": [
      { key: "priority", label: "Material planning priority", type: "select", options: ["Normal", "Urgent", "Critical"] },
      { key: "requiredDate", label: "Material required by", type: "date" },
      { key: "planningNotes", label: "Planning notes", type: "area", rows: 2 },
    ],
    "work_order:bom": [
      { key: "bomName", label: "BOM name", type: "text" },
      { key: "qtyOutput", label: "Output quantity", type: "num" },
      { key: "remarks", label: "BOM remarks", type: "area", rows: 2 },
    ],
    "material_requirement:issue": [
      { key: "issueDate", label: "Issue date", type: "date" },
      { key: "issuedTo", label: "Issued to / department", type: "text" },
      { key: "issueNotes", label: "Issue notes", type: "area", rows: 2 },
    ],
    "production:finished_goods": [
      { key: "fgLocation", label: "Finished goods location", type: "text" },
      { key: "completionNotes", label: "Completion notes", type: "area", rows: 2 },
    ],
    "qc:dispatch": [
      { key: "dispatchPriority", label: "Dispatch priority", type: "select", options: ["Normal", "Urgent"] },
      { key: "packingInstructions", label: "Packing instructions", type: "area", rows: 2 },
      { key: "dispatchNotes", label: "Dispatch notes", type: "area", rows: 2 },
    ],
    "sales_order:dispatch": [
      { key: "destination", label: "Dispatch destination", type: "area", rows: 2 },
      { key: "carrier", label: "Carrier / transporter", type: "text" },
      { key: "dispatchInstructions", label: "Dispatch instructions", type: "area", rows: 2 },
    ],
    "purchase_request:rfq": [
      { key: "dueDate", label: "RFQ due date", type: "date" },
      { key: "remarks", label: "RFQ remarks", type: "area", rows: 2 },
    ],
    "rfq:purchase_order": [
      { key: "supplierNotes", label: "Supplier notes", type: "area", rows: 2 },
      { key: "deliveryDate", label: "Expected delivery", type: "date" },
    ],
    "purchase_order:grn": [
      { key: "receivedDate", label: "Receipt date", type: "date" },
      { key: "vehicleNo", label: "Vehicle / LR number", type: "text" },
      { key: "receiptNotes", label: "Receipt notes", type: "area", rows: 2 },
    ],
    "grn:incoming_qc": [
      { key: "inspectionNotes", label: "Inspection notes", type: "area", rows: 2 },
      { key: "sampleQty", label: "Sample quantity", type: "num" },
    ],
    "attendance:payroll": [
      { key: "payrollMonth", label: "Payroll month", type: "text" },
      { key: "payrollNotes", label: "Processing notes", type: "area", rows: 2 },
    ],
    "payroll:salary_slip": [
      { key: "slipNotes", label: "Salary slip notes", type: "area", rows: 2 },
    ],
    "sales_order:stage": [
      { key: "stageNotes", label: "Stage advance notes", type: "area", rows: 2 },
    ],
    "shipment:dispatch": [
      { key: "dispatchNotes", label: "Dispatch confirmation notes", type: "area", rows: 2 },
    ],
    "quotation:dispatch": [
      { key: "destination", label: "Dispatch destination", type: "area", rows: 2 },
      { key: "dispatchNotes", label: "Dispatch notes", type: "area", rows: 2 },
    ],
  };

  const BUILDER_ROUTES = {
    "quotation:sales_order": { module: "sales", section: "orders", kind: "sales_order_builder", pendingKey: "_pendingSalesOrderFromQuotation" },
    "proforma:sales_order": { module: "sales", section: "orders", kind: "sales_order_builder", pendingKey: "_pendingSalesOrderFromQuotation" },
    "quotation:proforma": { module: "sales", section: "proformas", kind: "proforma_builder", pendingKey: "_pendingProformaFromQuotation" },
    "sales_order:proforma": { module: "sales", section: "proformas", kind: "proforma_builder", pendingKey: "_pendingProformaFromSO" },
    "sales_order:invoice": { module: "sales", section: "invoices", kind: "invoice_builder", pendingKey: "_pendingInvoiceBuild" },
    "quotation:invoice": { module: "sales", section: "invoices", kind: "invoice_builder", pendingKey: "_pendingInvoiceBuild" },
    "enquiry:quotation": { module: "sales", section: "quotations", kind: "quotation_builder", pendingKey: "_pendingQuotationFromEnquiry" },
  };

  function recordReview(entry) {
    if (store.recordWorkflowReview) return store.recordWorkflowReview(entry);
    if (store.audit) {
      store.audit(entry.actor || "system", entry.event || "workflow-review", entry.action || "workflow", entry.sourceNo || "-", entry.note || entry.event || "", {
        module: entry.module || "sales",
        action: entry.action,
        event: entry.event,
        sourceType: entry.sourceType,
        sourceNo: entry.sourceNo,
        sourceId: entry.sourceId,
        targetType: entry.targetType,
        revision: entry.revision,
        fieldsModified: entry.fieldsModified,
      });
    }
  }

  function sourceSummary(source, action) {
    if (!source) return {};
    const rev = source.rev != null ? source.rev : (source.revisionNo != null ? source.revisionNo : 0);
    const lines = source.lines || [];
    return {
      no: source.no || source.docNo || "—",
      rev: fmtRev(rev),
      status: source.status || source.stage || "—",
      customer: source.customerId ? ((store.get("customers", source.customerId) || {}).name || source.customerId) : (source.supplierId ? ((store.get("suppliers", source.supplierId) || {}).name || "") : (source.employeeName || "")),
      date: source.date || source.month || "",
      lineCount: lines.length,
      grand: (source.totals || {}).grand,
    };
  }

  function renderField(field, draft, setDraft) {
    const val = draft[field.key];
    const set = (v) => setDraft((p) => ({ ...p, [field.key]: v }));
    if (field.type === "area") return <Area value={val || ""} onChange={set} rows={field.rows || 2} />;
    if (field.type === "date") return <DateF value={val || ""} onChange={set} />;
    if (field.type === "num") return <Num value={val != null ? val : ""} onChange={set} />;
    if (field.type === "select") return <Select value={val || field.options[0]} onChange={set} options={(field.options || []).map((o) => ({ value: o, label: o }))} />;
    return <Text value={val || ""} onChange={set} />;
  }

  function WorkflowReviewScreen({ review, onClose }) {
    VG.useDB();
    const [draft, setDraft] = useState(() => ({ ...(review.draft || {}) }));
    const [busy, setBusy] = useState(false);
    const source = review.sourceRecord || (review.sourceId && review.sourceCollection ? store.get(review.sourceCollection, review.sourceId) : null) || {};
    const sum = sourceSummary(source, review.action);
    const fields = review.fields || FIELD_SCHEMAS[review.action] || [];
    const lines = source.lines || draft.lines || [];

    async function forward(asDraft) {
      setBusy(true);
      try {
        const handler = consumeHandler(review.handlerId);
        if (!handler) {
          VG.toast("Forward handler missing — reopen the action", "error");
          return;
        }
        recordReview({
          event: asDraft ? "draft_saved" : "forwarded",
          action: review.action,
          actor: review.actor,
          sourceType: review.fromType,
          sourceNo: review.fromNo,
          sourceId: review.fromId,
          targetType: review.toType,
          revision: sum.rev,
          fieldsModified: Object.keys(draft),
          note: (asDraft ? "Draft saved during review" : "Forwarded after review") + " · " + review.action,
          module: review.module,
        });
        const result = await handler({ draft, asDraft, source, review });
        if (result === false || result === null) return;
        if (!asDraft) {
          const labels = VG.DOC_FORWARD_LABELS && VG.DOC_FORWARD_LABELS[review.action];
          const docNo = result && (result.no || result.docNo || result.salesOrderNo || "");
          const msg = review.successMessage
            || (labels && typeof labels.success === "function" ? labels.success(docNo) : null)
            || review.toType + (docNo ? " " + docNo : "") + " generated successfully."
            || "Document successfully forwarded to next stage.";
          if (store.recordDocumentConversion && !review.skipConversionLog) {
            store.recordDocumentConversion({
              fromType: review.fromType, fromNo: review.fromNo, fromId: review.fromId,
              toType: review.toType, toNo: docNo, toId: result && result.id,
              actor: review.actor, statusChange: review.statusChange, confirmed: true, module: review.module,
            });
          }
          await VG.showSuccess({ message: msg });
        } else {
          VG.toast("Draft saved — complete and forward when ready", "info");
        }
        if (review.onDone) review.onDone(result);
        onClose();
      } catch (e) {
        VG.toast((e && e.message) || "Forward failed", "error");
      } finally {
        setBusy(false);
      }
    }

    function back() {
      recordReview({ event: "review_cancelled", action: review.action, actor: review.actor, sourceNo: review.fromNo, note: "User returned without forwarding" });
      if (review.onBack) review.onBack();
      onClose();
    }

    return (
      <InternalScreen onBack={back} backLabel={review.backLabel || "Back"} dirty={false}
        title={review.title || ("Review: " + (review.fromType || "Document") + " → " + (review.toType || "Next stage"))}
        subtitle={review.subtitle || ("Verify details before forwarding " + (review.fromNo || ""))}
        footer={<>
          <Button variant="soft" icon="chevronLeft" onClick={back}>Back</Button>
          <Button variant="soft" icon="check" disabled={busy} onClick={() => forward(true)}>Save as Draft</Button>
          <Button icon="chevronRight" disabled={busy} onClick={() => forward(false)}>{review.forwardLabel || "Forward / Generate"}</Button>
        </>}>
        <div className="grid lg:grid-cols-3 gap-3 mb-4">
          <Card className="p-3 lg:col-span-1">
            <div className="text-[11px] uppercase opacity-55 mb-2">Source document</div>
            <div className="font-mono text-sm font-semibold">{sum.no}</div>
            <div className="text-xs opacity-70 mt-1">Revision {sum.rev} · {sum.status}</div>
            {sum.customer && <div className="text-sm mt-2">{sum.customer}</div>}
            {sum.date && <div className="text-xs opacity-60 mt-1">Date: {sum.date}</div>}
          </Card>
          <Card className="p-3 lg:col-span-1">
            <div className="text-[11px] uppercase opacity-55 mb-2">Target stage</div>
            <div className="text-sm font-semibold">{review.toType || "Next stage"}</div>
            {review.statusChange && <div className="text-xs opacity-70 mt-1">Status: {review.statusChange}</div>}
          </Card>
          <Card className="p-3 lg:col-span-1">
            <div className="text-[11px] uppercase opacity-55 mb-2">Summary</div>
            <div className="text-sm">{sum.lineCount} line item(s)</div>
            {sum.grand != null && <div className="text-sm font-medium mt-1">{inr(sum.grand)}</div>}
          </Card>
        </div>

        {review.revisionDiff && review.revisionDiff.length > 0 && (
          <Card className="p-3 mb-4 border border-amber-500/30">
            <div className="text-xs font-semibold uppercase opacity-60 mb-2">Revision differences</div>
            <ul className="text-xs space-y-1">
              {review.revisionDiff.map((c, i) => (
                <li key={i}><b>{c.field}</b>: {String(c.oldValue ?? "—")} → {String(c.newValue ?? "—")}</li>
              ))}
            </ul>
          </Card>
        )}

        {lines.length > 0 && (
          <Card className="p-3 mb-4 overflow-x-auto">
            <div className="text-xs font-semibold uppercase opacity-60 mb-2">Line items</div>
            <table className="w-full text-xs">
              <thead><tr className="text-left opacity-50 border-b border-white/10"><th className="py-1 pr-2">Item</th><th className="py-1 pr-2 text-right">Qty</th><th className="py-1 text-right">Rate</th></tr></thead>
              <tbody>
                {lines.slice(0, 12).map((l, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-1 pr-2">{l.name || l.desc || l.itemId || "—"}</td>
                    <td className="py-1 pr-2 text-right">{l.qty} {l.unit || ""}</td>
                    <td className="py-1 text-right">{l.rate != null ? inr(l.rate) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lines.length > 12 && <div className="text-[10px] opacity-50 mt-1">+{lines.length - 12} more lines</div>}
          </Card>
        )}

        {fields.length > 0 && (
          <Card className="p-3 mb-4">
            <div className="text-xs font-semibold uppercase opacity-60 mb-3">Details for next stage</div>
            <div className="grid lg:grid-cols-2 gap-3">
              {fields.map((f) => (
                <Field key={f.key} label={f.label} className={f.type === "area" ? "lg:col-span-2" : ""}>
                  {renderField(f, draft, setDraft)}
                </Field>
              ))}
            </div>
          </Card>
        )}

        {(source.remarks || source.specialInstructions || source.technicalSpec) && (
          <Card className="p-3 mb-4 text-sm">
            <div className="text-xs font-semibold uppercase opacity-60 mb-2">Source notes</div>
            {source.remarks && <div className="mb-1"><span className="opacity-60">Remarks:</span> {source.remarks}</div>}
            {source.specialInstructions && <div className="mb-1"><span className="opacity-60">Instructions:</span> {source.specialInstructions}</div>}
            {source.technicalSpec && <div><span className="opacity-60">Technical:</span> {source.technicalSpec}</div>}
          </Card>
        )}
      </InternalScreen>
    );
  }

  function defaultDraft(action, source, extra) {
    extra = extra || {};
    const base = { date: today() };
    if (action === "sales_order:production") {
      return { ...base, priority: source.priority || "Normal", requiredCompletionDate: source.deliveryDate || today(), technicalNotes: source.technicalSpec || "", specialInstructions: source.specialInstructions || "" };
    }
    if (action === "sales_order:dispatch") {
      return { ...base, destination: source.shipping || "", dispatchInstructions: source.dispatchInstructions || "" };
    }
    if (action === "work_order:material_requirement") {
      return { ...base, priority: source.priority || "Normal", requiredDate: source.deliveryDate || today() };
    }
    if (action === "purchase_order:grn") {
      return { ...base, receivedDate: today(), purchaseOrderId: source.id, poNo: source.no };
    }
    if (action === "purchase_request:rfq") {
      return { ...base, dueDate: today(), remarks: source.remarks || "" };
    }
    return { ...base, ...(extra.draft || {}) };
  }

  async function start(opts) {
    if (!opts) return null;
    const labels = VG.DOC_FORWARD_LABELS && opts.action && VG.DOC_FORWARD_LABELS[opts.action];
    const dup = opts.duplicate;
    if (dup && dup.exists) {
      VG.toast(dup.message || (dup.label || "Document") + " " + (dup.no || "") + " already exists for this record.", "warn");
      return dup.linked || null;
    }
    const confirmMsg = opts.confirmMessage
      || (labels && labels.confirm(opts.fromNo, opts.confirmExtra))
      || ("Are you sure you want to advance this document to the next stage?");
    const ok = await VG.confirmForward({
      title: opts.confirmTitle || "Confirm advancement",
      message: confirmMsg,
      confirmLabel: opts.confirmLabel || "Yes, Continue",
    });
    if (!ok) return null;

    recordReview({
      event: "confirmed",
      action: opts.action,
      actor: opts.actor,
      sourceType: opts.fromType,
      sourceNo: opts.fromNo,
      sourceId: opts.fromId,
      targetType: opts.toType,
      note: "User confirmed workflow advancement",
      module: opts.module,
    });

    const handlerId = registerHandler(opts.run);
    const sourceRecord = opts.sourceRecord
      || (opts.sourceCollection && opts.sourceId ? store.get(opts.sourceCollection, opts.sourceId) : null)
      || (opts.fromId && opts.sourceCollection ? store.get(opts.sourceCollection, opts.fromId) : null);

    const draft = typeof opts.buildReview === "function"
      ? opts.buildReview(sourceRecord)
      : defaultDraft(opts.action, sourceRecord || {}, opts);

    const builderRoute = opts.builderRoute || (opts.action && BUILDER_ROUTES[opts.action]);
    if (builderRoute) {
      recordReview({ event: "review_opened", action: opts.action, actor: opts.actor, sourceNo: opts.fromNo, note: "Opened dedicated builder review", module: opts.module });
      const pendingPayload = {
        draft,
        backToQuotationId: opts.backToQuotationId,
        backToSource: opts.backToSource,
        reviewMeta: { action: opts.action, fromType: opts.fromType, fromNo: opts.fromNo, fromId: opts.fromId, toType: opts.toType, actor: opts.actor, statusChange: opts.statusChange, module: opts.module, onDone: opts.onDone },
      };
      if (builderRoute.pendingKey === "_pendingSalesOrderFromQuotation") {
        VG._pendingSalesOrderFromQuotation = pendingPayload;
      } else if (builderRoute.pendingKey === "_pendingProformaFromQuotation") {
        VG._pendingProformaFromQuotation = pendingPayload;
      } else if (builderRoute.pendingKey === "_pendingProformaFromSO") {
        VG._pendingProformaFromSO = pendingPayload;
      } else if (builderRoute.pendingKey === "_pendingInvoiceBuild") {
        VG._pendingInvoiceBuild = { ...draft, _workflowReview: pendingPayload };
      } else if (builderRoute.pendingKey === "_pendingQuotationFromEnquiry") {
        VG._pendingQuotationFromEnquiry = { ...draft, _workflowReview: pendingPayload };
      }
      if (VG.goTo) VG.goTo(builderRoute.module, builderRoute.section);
      return { pending: true, kind: "builder" };
    }

    recordReview({ event: "review_opened", action: opts.action, actor: opts.actor, sourceNo: opts.fromNo, note: "Opened generic workflow review", module: opts.module });
    VG._pendingWorkflowReview = {
      action: opts.action,
      fromType: opts.fromType,
      fromNo: opts.fromNo,
      fromId: opts.fromId,
      toType: opts.toType,
      toId: opts.toId,
      actor: opts.actor,
      statusChange: opts.statusChange,
      module: opts.module,
      sourceRecord,
      sourceCollection: opts.sourceCollection,
      sourceId: opts.sourceId || opts.fromId,
      draft,
      fields: opts.fields || FIELD_SCHEMAS[opts.action],
      handlerId,
      title: opts.reviewTitle,
      subtitle: opts.reviewSubtitle,
      forwardLabel: opts.forwardLabel,
      successMessage: opts.successMessage,
      revisionDiff: opts.revisionDiff,
      onDone: opts.onDone,
      onBack: opts.onBack,
      backLabel: opts.backLabel,
      skipConversionLog: opts.skipConversionLog,
    };
    if (opts.openReview) opts.openReview();
    else if (VG._openWorkflowReview) {
      const r = VG._pendingWorkflowReview;
      VG._pendingWorkflowReview = null;
      VG._openWorkflowReview(r);
    } else if (VG.goTo && opts.reviewModule) VG.goTo(opts.reviewModule, opts.reviewSection || "dashboard");
    return { pending: true, kind: "generic" };
  }

  async function startFromForward(opts) {
    const sourceRecord = opts.sourceRecord
      || (opts.sourceCollection && opts.fromId ? store.get(opts.sourceCollection, opts.fromId) : null);
    return start({
      action: opts.action,
      fromType: opts.fromType,
      fromNo: opts.fromNo,
      fromId: opts.fromId,
      toType: opts.toType,
      toId: opts.toId,
      actor: opts.actor,
      statusChange: opts.statusChange,
      module: opts.module,
      confirmMessage: opts.confirmMessage,
      confirmTitle: opts.confirmTitle,
      confirmLabel: opts.confirmLabel,
      buildReview: opts.buildReview || (() => defaultDraft(opts.action, sourceRecord || {}, opts)),
      fields: opts.reviewFields,
      revisionDiff: opts.revisionDiff,
      sourceCollection: opts.sourceCollection,
      sourceRecord,
      successMessage: opts.successMessage,
      onDone: opts.onDone,
      onBack: opts.onBack,
      duplicate: opts.duplicate,
      run: async (ctx) => {
        if (opts.duplicate && opts.duplicate.exists) return null;
        if (opts.run) return opts.run(ctx && ctx.draft, ctx);
        return null;
      },
      builderRoute: opts.builderRoute,
      reviewModule: opts.reviewModule,
      reviewSection: opts.reviewSection,
      openReview: opts.openReview,
      skipConversionLog: opts.skipConversionLog,
      backToQuotationId: opts.backToQuotationId,
    });
  }

  function WorkflowReviewHost() {
    const [review, setReview] = useState(null);
    useEffect(() => {
      function sync() {
        if (VG._pendingWorkflowReview) {
          setReview(VG._pendingWorkflowReview);
          VG._pendingWorkflowReview = null;
        }
      }
      sync();
      VG._openWorkflowReview = (r) => { VG._pendingWorkflowReview = r; setReview(r); };
      return () => { delete VG._openWorkflowReview; };
    }, []);
    if (!review) return null;
    return <WorkflowReviewScreen review={review} onClose={() => setReview(null)} />;
  }

  VG.workflowReview = {
    start,
    startFromForward,
    WorkflowReviewScreen,
    WorkflowReviewHost,
    FIELD_SCHEMAS,
    BUILDER_ROUTES,
    defaultDraft,
    recordReview,
    fmtRev,
  };
})(window.VG = window.VG || {});
