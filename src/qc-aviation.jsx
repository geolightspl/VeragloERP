/* Veraglo ERP — Aviation Warning Lights QC module (extended pages & forms) */
(function (VG) {
  const { useState } = React;
  const ui = VG.ui, fx = VG.fx, store = VG.store, today = VG.fmt.todayISO;
  const { Icon, Button, Pill, Card } = ui;
  const { Field, Text, Area, Num, Select, Modal, InternalScreen, RecordTable, PageHead, ListPage, StatusTag, printDocument, DocActions } = fx;
  const QA = VG.QC_AVIATION || {};

  const itemName = (id) => (VG.itemDisplay && VG.itemDisplay.tableLabel(id)) || (VG.itemMfr && VG.itemMfr.label(id)) || "—";
  const suppName = (id) => (store.get("suppliers", id) || {}).name || "—";
  const custName = (id) => (store.get("customers", id) || {}).name || "—";
  const woLabel = (id) => { const w = store.get("workOrders", id); return w ? w.no : "—"; };

  const QC_STATUS = { Pending: "#f59e0b", Accepted: "#34d399", Rejected: "#ef4444", Partial: "#22d3ee", Hold: "#94a3b8" };
  const IP_STATUS = { Pending: "#f59e0b", Pass: "#34d399", Fail: "#ef4444", Rework: "#f97316", Hold: "#94a3b8" };
  const NCR_STATUS = { Open: "#ef4444", "In Progress": "#f59e0b", Closed: "#34d399" };
  const CAPA_STATUS = { Open: "#f59e0b", "In Progress": "#6366f1", Closed: "#34d399" };
  const DISPOSITIONS = ["Supplier Return", "Rework", "Scrap", "Use-as-is (deviation)"];
  const SEVERITIES = ["Minor", "Major", "Critical"];

  function ChecklistForm({ template, checklist, onChange, readOnly }) {
    if (!template || !template.fields) return null;
    const cl = checklist || QA.blankChecklist(template);
    const setField = (fid, key, val) => {
      if (readOnly) return;
      const next = { ...cl, [fid]: { ...(cl[fid] || {}), [key]: val } };
      onChange && onChange(next);
    };
    return (
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase opacity-55">{template.name || template.title}</div>
        <div className="grid sm:grid-cols-2 gap-2">
          {template.fields.map((f) => {
            const row = cl[f.id] || { value: "Pass", remark: "" };
            return (
              <div key={f.id} className="rounded-lg border border-[var(--vg-border)] p-2.5 text-sm">
                <div className="font-medium text-xs mb-1.5">{f.label}{f.unit ? " (" + f.unit + ")" : ""}</div>
                {f.type === "measure" || f.type === "text" ? (
                  <input className="vg-input w-full rounded-lg text-xs mb-1" readOnly={readOnly} value={row.value || ""} onChange={(e) => setField(f.id, "value", e.target.value)} placeholder={f.criteria || ""} />
                ) : (
                  <Select value={row.value || "Pass"} onChange={(v) => setField(f.id, "value", v)} options={["Pass", "Fail", "N/A"].map((x) => ({ value: x, label: x }))} disabled={readOnly} />
                )}
                {f.criteria && <div className="text-[10px] opacity-50 mb-1">{f.criteria}</div>}
                <input className="vg-input w-full rounded-lg text-[11px]" readOnly={readOnly} value={row.remark || ""} onChange={(e) => setField(f.id, "remark", e.target.value)} placeholder="Remark" />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function FinalChecklistForm({ sections, checklist, onChange, readOnly, customerPlan }) {
    const cl = checklist || QA.blankFinalChecklist();
    const extra = customerPlan && customerPlan.extraCheckpoints ? [{ id: "customer", title: "Customer-specific (" + customerPlan.name + ")", fields: customerPlan.extraCheckpoints }] : [];
    const allSections = (sections || QA.FINAL_INSPECTION_SECTIONS || []).concat(extra);
    const setSection = (secId, nextSec) => {
      if (readOnly) return;
      onChange && onChange({ ...cl, [secId]: nextSec });
    };
    return (
      <div className="space-y-4">
        {allSections.map((sec) => (
          <Card key={sec.id} className="p-3">
            <ChecklistForm template={sec} checklist={cl[sec.id]} onChange={(n) => setSection(sec.id, n)} readOnly={readOnly} />
          </Card>
        ))}
      </div>
    );
  }

  function buildQcPdf(doc, type) {
    const co = store.company();
    let checklistHtml = "";
    if (doc.checklist && typeof doc.checklist === "object") {
      const rows = [];
      const walk = (cl, prefix) => {
        Object.keys(cl || {}).forEach((k) => {
          const v = cl[k];
          if (v && typeof v === "object" && "value" in v) rows.push("<tr><td>" + prefix + k + "</td><td>" + (v.value || "—") + "</td><td>" + (v.remark || "") + "</td></tr>");
          else if (v && typeof v === "object") walk(v, prefix + k + " / ");
        });
      };
      walk(doc.checklist, "");
      checklistHtml = rows.length ? "<table class='vg-tbl'><thead><tr><th>Checkpoint</th><th>Result</th><th>Remark</th></tr></thead><tbody>" + rows.join("") + "</tbody></table>" : "";
    }
    const inner = `
      <div class="vg-head"><div><div class="vg-co">${co.name || "Veraglo"}</div><div class="vg-sub">${type} Report · ${doc.no}</div></div></div>
      <div class="vg-cols">
        <div class="vg-card"><b>Report</b>No: ${doc.no}<br>Date: ${doc.inspectionDate || doc.date || today()}<br>Status: ${doc.status || doc.result || "—"}</div>
        <div class="vg-card"><b>Reference</b>${doc.workOrderNo ? "WO: " + doc.workOrderNo + "<br>" : ""}${doc.receiptNo ? "GRN: " + doc.receiptNo + "<br>" : ""}${doc.sku ? "SKU: " + doc.sku : itemName(doc.itemId)}</div>
        <div class="vg-card"><b>Inspector</b>${doc.inspectorName || doc.inspectedBy || "—"}<br>Revision: ${doc.revision || "1"}</div>
      </div>
      ${checklistHtml}
      <div class="vg-terms">${doc.remarks ? "<b>Remarks:</b> " + doc.remarks : ""}</div>
      <div class="vg-sign"><div>Inspected by: <b>${doc.inspectorName || doc.inspectedBy || "—"}</b></div><div>Approved by: <b>—</b></div><div>Date: ${today()}</div></div>`;
    return { title: type + " Report", subtitle: doc.no + " · Aviation Warning Light QC", inner };
  }

  function IncomingInspectScreen({ insp, onClose, roleKey, can }) {
    const recvd = Number(insp.qtyReceived) || 0;
    const tplKey = insp.templateId || "general";
    const tpl = (QA.INCOMING_MATERIAL_TEMPLATES && QA.INCOMING_MATERIAL_TEMPLATES[tplKey]) || QA.detectIncomingTemplate(insp.itemId, store);
    const [f, setF] = useState({
      result: "Accepted", sampleSize: insp.sampleSize || "", qtySampled: insp.qtySampled || "",
      acceptQty: recvd, rejectQty: 0, holdQty: 0, disposition: "Supplier Return",
      remarks: insp.remarks || "", severity: "Major", checklist: insp.checklist || QA.blankChecklist(tpl),
    });
    const set = (k, v) => setF((p) => {
      const n = { ...p, [k]: v };
      if (k === "result") {
        if (v === "Accepted") { n.acceptQty = recvd; n.rejectQty = 0; n.holdQty = 0; }
        else if (v === "Rejected") { n.acceptQty = 0; n.rejectQty = recvd; n.holdQty = 0; }
        else if (v === "Hold") { n.acceptQty = 0; n.rejectQty = 0; n.holdQty = recvd; }
      }
      if (k === "acceptQty") n.rejectQty = Math.max(0, recvd - (Number(v) || 0) - (Number(n.holdQty) || 0));
      return n;
    });
    const decided = insp.status !== "Pending";
    function submit() {
      if (!can("approve") && !can("edit")) return VG.toast("No permission", "error");
      const acc = Number(f.acceptQty) || 0, rej = Number(f.rejectQty) || 0;
      const result = f.result === "Hold" ? "Hold" : acc > 0 && rej > 0 ? "Partial" : acc > 0 ? "Accepted" : "Rejected";
      store.decideInspection(insp.id, result, { ...f, qtySampled: f.qtySampled || f.sampleSize, templateId: tpl.id, autoCapa: rej > 0 }, roleKey);
      VG.toast("Incoming inspection " + result);
      onClose();
    }
    return (
      <InternalScreen onBack={onClose} backLabel="Back" title={"Incoming " + insp.no} subtitle={itemName(insp.itemId)}
        footer={<><DocActions build={() => buildQcPdf({ ...insp, ...f, checklist: f.checklist }, "Incoming Inspection")} />{!decided && <Button icon="check" onClick={submit}>Submit result</Button>}</>}>
        <div className="grid sm:grid-cols-4 gap-3 mb-4 text-sm">
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55">GRN</div>{insp.receiptNo || "—"}</Card>
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55">PO</div>{insp.poNo || "—"}</Card>
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Supplier</div>{suppName(insp.supplierId)}</Card>
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Batch</div>{insp.batch || "—"} · Qty {recvd}</Card>
        </div>
        {!decided && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Field label="Result"><Select value={f.result} onChange={(v) => set("result", v)} options={["Accepted", "Rejected", "Partial", "Hold"].map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Qty sampled"><Text value={f.qtySampled} onChange={(v) => set("qtySampled", v)} /></Field>
            <Field label="Accepted qty"><Num value={f.acceptQty} onChange={(v) => set("acceptQty", v)} /></Field>
            <Field label="Rejected qty"><Num value={f.rejectQty} onChange={(v) => set("rejectQty", v)} /></Field>
            {Number(f.rejectQty) > 0 && <Field label="Disposition"><Select value={f.disposition} onChange={(v) => set("disposition", v)} options={DISPOSITIONS.map((x) => ({ value: x, label: x }))} /></Field>}
            <Field label="Remarks" className="sm:col-span-2"><Area value={f.remarks} onChange={(v) => set("remarks", v)} rows={2} /></Field>
          </div>
        )}
        <Card className="p-3 mb-4"><ChecklistForm template={tpl} checklist={f.checklist} onChange={(c) => set("checklist", c)} readOnly={decided} /></Card>
        {decided && <div className="text-sm"><StatusTag value={insp.status} map={QC_STATUS} /> · Accepted {insp.acceptQty || 0} · Rejected {insp.rejectQty || 0}</div>}
      </InternalScreen>
    );
  }

  function IncomingInspectionPage({ roleKey, can }) {
    VG.useDB();
    const [view, setView] = useState(null);
    const rows = store.list("qcInspections").filter((x) => (x.source || "").indexOf("Incoming") >= 0 || x.inspectionType === "incoming").slice().reverse();
    const cols = [
      { key: "no", label: "Inspection #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "receiptNo", label: "GRN" },
      { key: "itemId", label: "Material", render: (r) => itemName(r.itemId) },
      { key: "supplierId", label: "Supplier", render: (r) => suppName(r.supplierId) },
      { key: "batch", label: "Batch/Lot" },
      { key: "qtyReceived", label: "Qty recd" },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={QC_STATUS} /> },
    ];
    if (view) return <IncomingInspectScreen insp={store.get("qcInspections", view.id) || view} onClose={() => setView(null)} roleKey={roleKey} can={can} />;
    return (
      <ListPage title="Incoming Inspection" desc="GRN-triggered raw material inspection — LED, driver, battery, solar, glass, casting, hardware" can={can}>
        <RecordTable embedded suppressNew tableId="qc-incoming" title="Incoming Inspection List" columns={cols} rows={rows} can={can} printTitle="Incoming Inspection Register"
          filters={[{ key: "status", label: "Status", options: ["Pending", "Accepted", "Rejected", "Partial", "Hold"] }]}
          onView={(r) => setView(r)} empty="No incoming inspections — created automatically from QC-required GRNs" />
      </ListPage>
    );
  }

  function InProcessInspectScreen({ insp, onClose, roleKey, can }) {
    const stage = insp.stageId || "pcb_assembly";
    const tpl = (QA.IN_PROCESS_STAGES && QA.IN_PROCESS_STAGES[stage]) || { name: insp.operationStage, fields: [] };
    const [f, setF] = useState({
      result: "Pass", sampleQty: insp.sampleQty || 1, observation: insp.observation || "",
      acceptanceCriteria: insp.acceptanceCriteria || "", remarks: insp.remarks || "",
      checklist: insp.checklist || QA.blankChecklist(tpl),
    });
    const decided = insp.status !== "Pending";
    function submit() {
      store.decideInProcessInspection(insp.id, { ...f, status: f.result }, roleKey);
      VG.toast("In-process inspection recorded");
      onClose();
    }
    return (
      <InternalScreen onBack={onClose} title={"In-Process " + insp.no} subtitle={insp.operationStage + " · WO " + insp.workOrderNo}
        footer={<><DocActions build={() => buildQcPdf({ ...insp, ...f }, "In-Process Inspection")} />{!decided && <Button icon="check" onClick={submit}>Record result</Button>}</>}>
        <div className="grid sm:grid-cols-3 gap-3 mb-4 text-sm">
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Work Order</div>{insp.workOrderNo}</Card>
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Stage</div>{insp.operationStage}</Card>
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Inspector</div>{insp.inspectorName || roleKey}</Card>
        </div>
        {!decided && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Field label="Result"><Select value={f.result} onChange={(v) => setF((p) => ({ ...p, result: v }))} options={["Pass", "Fail", "Rework", "Hold"].map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Sample qty"><Num value={f.sampleQty} onChange={(v) => setF((p) => ({ ...p, sampleQty: v }))} /></Field>
            <Field label="Observation" className="sm:col-span-2"><Area value={f.observation} onChange={(v) => setF((p) => ({ ...p, observation: v }))} rows={2} /></Field>
            <Field label="Acceptance criteria" className="sm:col-span-2"><Text value={f.acceptanceCriteria} onChange={(v) => setF((p) => ({ ...p, acceptanceCriteria: v }))} /></Field>
          </div>
        )}
        <Card className="p-3"><ChecklistForm template={tpl} checklist={f.checklist} onChange={(c) => setF((p) => ({ ...p, checklist: c }))} readOnly={decided} /></Card>
      </InternalScreen>
    );
  }

  function InProcessInspectionPage({ roleKey, can }) {
    VG.useDB();
    const [view, setView] = useState(null);
    const [modal, setModal] = useState(false);
    const [newInsp, setNewInsp] = useState({ workOrderId: "", stageId: "pcb_assembly", sampleQty: 1 });
    const rows = store.list("qcInProcessInspections").slice().reverse();
    const wos = store.list("workOrders").filter((w) => w.status !== "Cancelled");
    const cols = [
      { key: "no", label: "Inspection #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "workOrderNo", label: "WO" },
      { key: "operationStage", label: "Stage" },
      { key: "sampleQty", label: "Sample" },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={IP_STATUS} /> },
    ];
    if (view) return <InProcessInspectScreen insp={store.get("qcInProcessInspections", view.id) || view} onClose={() => setView(null)} roleKey={roleKey} can={can} />;
    return (
      <ListPage title="In-Process Inspection" desc="PCB, driver, LED, mechanical, enclosure & control panel stages" can={can}>
        {can("add") && <div className="mb-3"><Button icon="plus" onClick={() => setModal(true)}>New in-process inspection</Button></div>}
        <RecordTable embedded suppressNew tableId="qc-inprocess" title="In-Process Inspection List" columns={cols} rows={rows} can={can} printTitle="In-Process Inspection Register"
          onView={(r) => setView(r)} empty="No in-process inspections yet" />
        {modal && (
          <Modal open title="New In-Process Inspection" onClose={() => setModal(false)} footer={<Button onClick={() => {
            if (!newInsp.workOrderId) return VG.toast("Select work order", "warn");
            store.createInProcessInspection(newInsp, roleKey);
            setModal(false); VG.toast("Inspection created");
          }}>Create</Button>}>
            <div className="grid gap-3">
              <Field label="Work order"><Select value={newInsp.workOrderId} onChange={(v) => setNewInsp((p) => ({ ...p, workOrderId: v }))} options={wos.map((w) => ({ value: w.id, label: w.no + " · " + (w.product || w.sku || "") }))} /></Field>
              <Field label="Operation stage"><Select value={newInsp.stageId} onChange={(v) => setNewInsp((p) => ({ ...p, stageId: v }))} options={Object.values(QA.IN_PROCESS_STAGES || {}).map((s) => ({ value: s.id, label: s.name }))} /></Field>
              <Field label="Sample qty"><Num value={newInsp.sampleQty} onChange={(v) => setNewInsp((p) => ({ ...p, sampleQty: v }))} /></Field>
            </div>
          </Modal>
        )}
      </ListPage>
    );
  }

  function FinalInspectScreen({ qc, onClose, roleKey, can }) {
    const so = qc.salesOrderId ? store.get("salesOrders", qc.salesOrderId) : null;
    const customerName = qc.customerName || (so && custName(so.customerId)) || "";
    const plan = QA.matchCustomerPlan ? QA.matchCustomerPlan(customerName, store.list("qcCustomerPlans")) : null;
    const [f, setF] = useState({
      status: "Accepted", qtyInspected: qc.qtyForQc, acceptQty: qc.qtyForQc, rejectQty: 0, reworkQty: 0,
      testReportNo: qc.testReportNo || "", serialNumbers: qc.serialNumbers || "", remarks: qc.remarks || "",
      checklist: qc.checklist || QA.blankFinalChecklist(), customerPlanId: (plan && plan.id) || "",
    });
    const decided = !["Pending Inspection", "Under Inspection"].includes(qc.status);
    function submit(result) {
      const payload = { ...f, status: result, inspectorName: roleKey, customerName, projectName: so && so.projectName, revision: so && so.revisionNo };
      store.recordFinalQcResult(qc.id, payload, roleKey);
      VG.toast("Final inspection " + result);
      onClose();
    }
    return (
      <InternalScreen onBack={onClose} title={"Final Inspection " + qc.no} subtitle={qc.sku + " · WO " + qc.workOrderNo}
        footer={<>
          <DocActions build={() => buildQcPdf({ ...qc, ...f, checklist: f.checklist }, plan ? "Customer Inspection" : "Final Inspection")} />
          {!decided && can("approve") && <>
            <Button icon="check" onClick={() => submit("Accepted")}>Accepted</Button>
            <Button variant="soft" onClick={() => submit("Conditional Release")}>Conditional</Button>
            <Button variant="soft" onClick={() => submit("Rework Required")}>Rework</Button>
            <Button variant="ghost" onClick={() => submit("Rejected")}>Rejected</Button>
          </>}
        </>}>
        <div className="grid sm:grid-cols-4 gap-3 mb-4 text-sm">
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Product</div>{qc.sku}</Card>
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Customer</div>{customerName || "—"}</Card>
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Qty for QC</div>{qc.qtyForQc}</Card>
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Revision</div>{(so && so.revisionNo) || "—"}</Card>
        </div>
        {!decided && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Field label="Test report no"><Text value={f.testReportNo} onChange={(v) => setF((p) => ({ ...p, testReportNo: v }))} /></Field>
            <Field label="Serial numbers"><Text value={f.serialNumbers} onChange={(v) => setF((p) => ({ ...p, serialNumbers: v }))} placeholder="Comma-separated" /></Field>
            <Field label="Remarks" className="sm:col-span-2"><Area value={f.remarks} onChange={(v) => setF((p) => ({ ...p, remarks: v }))} rows={2} /></Field>
          </div>
        )}
        {plan && <div className="text-xs mb-2 rounded-lg p-2" style={{ background: "var(--accent-soft)" }}>Customer plan: <b>{plan.name}</b></div>}
        <FinalChecklistForm checklist={f.checklist} onChange={(c) => setF((p) => ({ ...p, checklist: c }))} readOnly={decided} customerPlan={plan} />
      </InternalScreen>
    );
  }

  function FinalInspectionPage({ roleKey, can }) {
    VG.useDB();
    const [view, setView] = useState(null);
    const rows = store.list("qcIssues").slice().reverse();
    const cols = [
      { key: "no", label: "Final Insp #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "workOrderNo", label: "WO" },
      { key: "sku", label: "Product SKU" },
      { key: "qtyForQc", label: "Qty" },
      { key: "priority", label: "Priority", render: (r) => <Pill color="#6366f1">{r.priority || "Normal"}</Pill> },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={{ "Pending Inspection": "#f59e0b", Accepted: "#34d399", Rejected: "#ef4444", "Rework Required": "#f97316", Hold: "#94a3b8" }} /> },
    ];
    if (view) return <FinalInspectScreen qc={store.get("qcIssues", view.id) || view} onClose={() => setView(null)} roleKey={roleKey} can={can} />;
    return (
      <ListPage title="Final Inspection" desc="Aviation warning light final QC — optical, electrical, functional, environmental & documentation" can={can}>
        <RecordTable embedded suppressNew tableId="qc-final-awl" title="Final Inspection Queue" columns={cols} rows={rows} can={can} printTitle="Final Inspection Register"
          onView={(r) => setView(r)} empty="Finished goods appear here after Stores issues to QC" />
      </ListPage>
    );
  }

  function NcrPage({ roleKey, can, go }) {
    VG.useDB();
    const rows = store.list("ncrs").slice().reverse();
    const cols = [
      { key: "no", label: "NCR #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "date", label: "Date" },
      { key: "source", label: "Source" },
      { key: "itemId", label: "Item", render: (r) => itemName(r.itemId) },
      { key: "severity", label: "Severity", render: (r) => <Pill color={r.severity === "Critical" ? "#ef4444" : "#f59e0b"}>{r.severity || "Major"}</Pill> },
      { key: "disposition", label: "Disposition" },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={NCR_STATUS} /> },
      { key: "act", label: "", render: (r) => can("edit") && r.status !== "Closed" ? <Button variant="soft" className="!py-1" onClick={() => {
        const next = r.status === "Open" ? "In Progress" : "Closed";
        store.update("ncrs", r.id, { status: next }, roleKey);
        if (next === "In Progress" && !(store.list("qcCapa") || []).some((c) => c.ncrId === r.id)) store.createCapaFromNcr(r.id, roleKey);
        VG.toast("NCR → " + next);
      }}>{r.status === "Open" ? "Start" : "Close"}</Button> : null },
    ];
    return (
      <ListPage title="Non-Conformance Reports (NCR)" desc="Rejected lots from incoming, in-process & final inspection" can={can}>
        {can("add") && <div className="mb-3 flex gap-2"><Button icon="plus" onClick={() => {
          store.create("ncrs", { no: store.nextNo("NCR", today()), date: today(), source: "Manual", itemId: "", qty: 1, severity: "Major", disposition: "Rework", status: "Open", raisedBy: roleKey }, roleKey);
          VG.toast("NCR created");
        }}>Create NCR</Button>{go && <Button variant="soft" onClick={() => go("capa")}>View CAPA</Button>}</div>}
        <RecordTable embedded suppressNew title="NCR Register" columns={cols} rows={rows} can={can} printTitle="NCR Register" />
      </ListPage>
    );
  }

  function CapaPage({ roleKey, can }) {
    VG.useDB();
    const rows = store.list("qcCapa").slice().reverse();
    const cols = [
      { key: "no", label: "CAPA #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "ncrNo", label: "NCR" },
      { key: "rootCause", label: "Root cause" },
      { key: "responsiblePerson", label: "Responsible" },
      { key: "dueDate", label: "Due" },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={CAPA_STATUS} /> },
      { key: "act", label: "", render: (r) => can("edit") && r.status !== "Closed" ? <Button variant="soft" className="!py-1" onClick={() => { store.closeCapa(r.id, { correctiveAction: r.correctiveAction, preventiveAction: r.preventiveAction }, roleKey); VG.toast("CAPA closed"); }}>Close</Button> : null },
    ];
    return (
      <ListPage title="Corrective & Preventive Actions (CAPA)" desc="Linked to NCRs — root cause, corrective & preventive actions" can={can}>
        <RecordTable embedded suppressNew title="CAPA Register" columns={cols} rows={rows} can={can} printTitle="CAPA Register" empty="CAPA records appear when NCRs are actioned" />
      </ListPage>
    );
  }

  function CalibrationPage({ roleKey, can }) {
    VG.useDB();
    const eq = store.list("qcTestEquipment");
    const cal = store.list("qcCalibration").slice().reverse();
    const due = eq.filter((e) => e.nextCalibrationDue && e.nextCalibrationDue <= today());
    return (
      <div>
        <PageHead title="Calibration Management" desc="Lux meter, multimeter, oscilloscope, power analyzer, vernier, micrometer" />
        {due.length > 0 && <Card className="p-3 mb-4 border-amber-500/40"><div className="text-sm font-semibold text-amber-400">{due.length} equipment due for calibration</div></Card>}
        <RecordTable embedded suppressNew title="Test Equipment" columns={[
          { key: "no", label: "Asset #" }, { key: "name", label: "Equipment" }, { key: "make", label: "Make" }, { key: "serialNo", label: "Serial" },
          { key: "lastCalibrationDate", label: "Last cal" }, { key: "nextCalibrationDue", label: "Due", render: (r) => <span className={r.nextCalibrationDue <= today() ? "text-rose-400 font-semibold" : ""}>{r.nextCalibrationDue || "—"}</span> },
          { key: "act", label: "", render: (r) => can("edit") ? <Button variant="soft" className="!py-1" onClick={() => { store.saveCalibrationRecord(r.id, { calibrationDate: today(), certificateRef: "CAL-" + Date.now() }, roleKey); VG.toast("Calibration recorded"); }}>Record cal</Button> : null },
        ]} rows={eq} can={can} printTitle="Test Equipment Master" />
        <div className="mt-6"><RecordTable embedded suppressNew title="Calibration History" columns={[
          { key: "no", label: "Cal #" }, { key: "date", label: "Date" }, { key: "equipmentName", label: "Equipment" }, { key: "certificateRef", label: "Certificate" }, { key: "nextDueDate", label: "Next due" },
        ]} rows={cal.slice(0, 50)} can={can} /></div>
      </div>
    );
  }

  function TemplatesPage() {
    VG.useDB();
    const tpls = store.list("qcInspectionTemplates");
    return (
      <ListPage title="Inspection Templates" desc="Incoming material, in-process stage & final inspection checklists for aviation warning lights">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tpls.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="text-xs uppercase opacity-50">{t.type || "template"} · rev {t.revision || 1}</div>
              <div className="font-semibold mt-1">{t.name}</div>
              <div className="text-xs opacity-60 mt-1">{(t.fields || []).length || (t.sections || []).length || 0} checkpoints</div>
            </Card>
          ))}
        </div>
      </ListPage>
    );
  }

  function TestEquipmentPage({ roleKey, can }) {
    return <CalibrationPage roleKey={roleKey} can={can} />;
  }

  function CustomerPlansPage() {
    VG.useDB();
    const plans = store.list("qcCustomerPlans");
    return (
      <ListPage title="Customer-Specific Inspection Plans" desc="PGCIL, AAI, NTPC, KEC, Tata Projects & international requirements">
        <div className="grid sm:grid-cols-2 gap-4">
          {plans.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div><div className="font-semibold">{p.name}</div><div className="text-xs opacity-60">{p.region || p.customerKey}</div></div>
                <Pill color="#6366f1">{((p.extraCheckpoints || []).length)} extra checks</Pill>
              </div>
              <ul className="mt-3 text-xs space-y-1 opacity-75">{(p.extraReports || []).map((r) => <li key={r}>· {r}</li>)}</ul>
            </Card>
          ))}
        </div>
      </ListPage>
    );
  }

  function AnalyticsPage() {
    VG.useDB();
    const insp = store.list("qcInspections");
    const ip = store.list("qcInProcessInspections");
    const fin = store.list("qcIssues");
    const decided = insp.filter((x) => x.status !== "Pending");
    const passRate = decided.length ? Math.round(decided.filter((x) => x.status === "Accepted").length / decided.length * 100) : 0;
    const finDecided = fin.filter((x) => !["Pending Inspection", "Under Inspection"].includes(x.status));
    const finPass = finDecided.length ? Math.round(finDecided.filter((x) => x.status === "Accepted").length / finDecided.length * 100) : 0;
    return (
      <div>
        <PageHead title="Quality Analytics" desc="Inspection pass rates, NCR trends & calibration compliance" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Card className="p-4"><div className="text-xs opacity-55">Incoming pass %</div><div className="text-2xl font-display font-bold">{passRate}%</div></Card>
          <Card className="p-4"><div className="text-xs opacity-55">Final pass %</div><div className="text-2xl font-display font-bold">{finPass}%</div></Card>
          <Card className="p-4"><div className="text-xs opacity-55">Open NCRs</div><div className="text-2xl font-display font-bold">{store.list("ncrs").filter((x) => x.status !== "Closed").length}</div></Card>
          <Card className="p-4"><div className="text-xs opacity-55">Open CAPA</div><div className="text-2xl font-display font-bold">{store.list("qcCapa").filter((x) => x.status !== "Closed").length}</div></Card>
        </div>
        <Card className="p-4"><div className="text-sm font-semibold mb-2">Inspection volume</div>
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <div>Incoming: <b>{insp.length}</b></div>
            <div>In-process: <b>{ip.length}</b></div>
            <div>Final: <b>{fin.length}</b></div>
          </div>
        </Card>
      </div>
    );
  }

  function QcReportsPage({ roleKey, can }) {
    VG.useDB();
    const reports = [
      { n: "Incoming Inspection Report", type: "Incoming Inspection", rows: store.list("qcInspections").filter((x) => (x.source || "").indexOf("Incoming") >= 0) },
      { n: "In-Process Inspection Report", type: "In-Process Inspection", rows: store.list("qcInProcessInspections") },
      { n: "Final Inspection Report", type: "Final Inspection", rows: store.list("qcIssues") },
      { n: "FAT Report", type: "FAT", rows: store.list("qcIssues").filter((x) => x.status === "Accepted") },
      { n: "NCR Summary", type: "NCR", rows: store.list("ncrs") },
      { n: "Type Test Summary", type: "Type Test", rows: store.list("qcIssues").filter((x) => x.testReportNo) },
    ];
    return (
      <div>
        <PageHead title="QC Reports" desc="Professional PDF reports — incoming, in-process, final, FAT, customer inspection & type test" />
        <div className="grid sm:grid-cols-2 gap-4">
          {reports.map((r) => (
            <Card key={r.n} className="p-4 flex items-center gap-4">
              <span className="grid place-items-center w-11 h-11 rounded-xl text-white shrink-0" style={{ background: "var(--accent)" }}><Icon name="chart" size={18} /></span>
              <div className="flex-1"><div className="font-medium text-sm">{r.n}</div><div className="text-[11px] opacity-55">{(r.rows || []).length} records</div></div>
              <Button variant="soft" icon="eye" onClick={() => {
                const sample = (r.rows || [])[0];
                if (sample) printDocument(buildQcPdf(sample, r.type), "preview");
                else printDocument({ title: r.n, subtitle: store.company().name, inner: "<p>No records yet.</p>" }, "preview");
              }}>Preview</Button>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  VG.QC_AVIATION_PAGES = {
    IncomingInspectionPage,
    InProcessInspectionPage,
    FinalInspectionPage,
    NcrPage,
    CapaPage,
    CalibrationPage,
    TemplatesPage,
    TestEquipmentPage,
    CustomerPlansPage,
    AnalyticsPage,
    QcReportsPage,
    buildQcPdf,
  };
})(window.VG);
