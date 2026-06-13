/* Veraglo ERP — Quality Control module (functional, interconnected with Stores). */
(function (VG) {
  const { useState } = React;
  const ui = VG.ui, fx = VG.fx, store = VG.store, inr = VG.fmt.inr, today = VG.fmt.todayISO;
  const { Icon, Button, Pill, Card } = ui;
  const { Field, Text, Area, Num, Select, Modal, InternalScreen, RecordTable, PageHead, ListPage, StatusTag, printDocument, DocActions } = fx;

  const itemName = (id) => (VG.itemDisplay && VG.itemDisplay.tableLabel(id)) || (VG.itemMfr && VG.itemMfr.label(id)) || "—";
  const itemNameSkuPdf = (id) => (VG.itemDisplay && VG.itemDisplay.itemNameSkuCell(id)) || itemName(id);
  const suppName = (id) => (store.get("suppliers", id) || {}).name || "—";
  const locName = (id) => (store.get("locations", id) || {}).name || "—";

  const QC_STATUS = { Pending: "#f59e0b", Accepted: "#34d399", Rejected: "#ef4444", Partial: "#22d3ee" };
  const NCR_STATUS = { Open: "#ef4444", "In Progress": "#f59e0b", Closed: "#34d399" };
  const DISPOSITIONS = ["Supplier Return", "Rework", "Scrap", "Use-as-is (deviation)"];

  /* ---------- QC report PDF ---------- */
  function qcReportDoc(q) {
    const inner = `
      <div class="vg-cols">
        <div class="vg-card"><b>Inspection</b>No: ${q.no}<br>Date: ${q.date}<br>Source: ${q.source || "Incoming"}<br>Status: ${q.status}</div>
        <div class="vg-card"><b>Material</b>${itemNameSkuPdf(q.itemId)}<br>Batch: ${q.batch || "—"}<br>GRN: ${q.receiptNo || "—"}</div>
        <div class="vg-card"><b>Supplier</b>${suppName(q.supplierId)}</div>
      </div>
      <table class="vg-tbl"><thead><tr><th>Received Qty</th><th>Sample</th><th class="vg-right">Accepted</th><th class="vg-right">Rejected</th><th>Result</th></tr></thead>
      <tbody><tr><td>${q.qtyReceived || 0}</td><td>${q.sampleSize || "—"}</td><td class="vg-right">${q.acceptQty || 0}</td><td class="vg-right">${q.rejectQty || 0}</td><td>${q.result || q.status}</td></tr></tbody></table>
      <div class="vg-terms">${q.remarks ? "<b>Observations:</b> " + q.remarks : "No observations recorded."}</div>
      <div class="vg-sign"><div>Inspected by: <b>${q.inspectedBy || "—"}</b></div><div>Checked by: <b>—</b></div><div>Approved by: <b>—</b></div><div>For ${store.company().name}</div></div>`;
    return { title: "QC Inspection Report", subtitle: q.no + " · " + q.date, inner };
  }

  /* ---------- inspect modal ---------- */
  function InspectModal({ insp, onClose, roleKey, can }) {
    const recvd = Number(insp.qtyReceived) || 0;
    const [f, setF] = useState({ result: "Accepted", sampleSize: "", acceptQty: recvd, rejectQty: 0, disposition: "Supplier Return", remarks: "" });
    const [dirty, setDirty] = useState(false);
    const set = (k, v) => {
      setDirty(true);
      setF((p) => {
        const n = { ...p, [k]: v };
        if (k === "result") {
          if (v === "Accepted") { n.acceptQty = recvd; n.rejectQty = 0; }
          else if (v === "Rejected") { n.acceptQty = 0; n.rejectQty = recvd; }
        }
        if (k === "acceptQty") n.rejectQty = Math.max(0, recvd - (Number(v) || 0));
        if (k === "rejectQty") n.acceptQty = Math.max(0, recvd - (Number(v) || 0));
        return n;
      });
    };
    function submit() {
      if (!can("approve") && !can("edit")) return VG.toast("You don't have permission to record QC results", "error");
      const acc = Number(f.acceptQty) || 0, rej = Number(f.rejectQty) || 0;
      if (acc + rej <= 0) return VG.toast("Enter accepted and/or rejected quantity", "error");
      const result = acc > 0 && rej > 0 ? "Partial" : acc > 0 ? "Accepted" : "Rejected";
      store.decideInspection(insp.id, result, { acceptQty: acc, rejectQty: rej, disposition: f.disposition, remarks: f.remarks }, roleKey);
      VG.toast("Inspection " + insp.no + " " + result + (acc > 0 ? " · " + acc + " posted to stock" : "") + (rej > 0 ? " · NCR raised" : ""), rej > 0 ? "warn" : "success");
      onClose();
    }
    const decided = insp.status !== "Pending";
    return (
      <InternalScreen onBack={onClose} backLabel="Back to inspections" dirty={dirty && !decided} title={"Inspection " + insp.no} subtitle={itemName(insp.itemId)}
        footer={<><DocActions build={() => qcReportDoc({ ...insp, ...f })} />{!decided && <Button icon="check" onClick={submit}>Record result</Button>}</>}>
        <div className="grid sm:grid-cols-3 gap-3 mb-4 text-sm">
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55 mb-1">Material</div>{itemName(insp.itemId)}<div className="opacity-60 text-xs mt-1">Batch {insp.batch || "—"}</div></Card>
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55 mb-1">Source</div>{insp.source}<div className="opacity-60 text-xs mt-1">GRN {insp.receiptNo || "—"}</div></Card>
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55 mb-1">Supplier</div>{suppName(insp.supplierId)}<div className="opacity-60 text-xs mt-1">Recd qty {recvd}</div></Card>
        </div>
        {decided ? (
          <div className="rounded-xl glass p-4 text-sm">
            <div className="flex items-center gap-2 mb-2"><StatusTag value={insp.status} map={QC_STATUS} /><span className="opacity-60">decided {insp.decidedAt ? new Date(insp.decidedAt).toLocaleString("en-IN") : ""}</span></div>
            Accepted <b>{insp.acceptQty || 0}</b> · Rejected <b>{insp.rejectQty || 0}</b> · by {insp.inspectedBy || "—"}
            {insp.remarks && <div className="opacity-70 mt-2">{insp.remarks}</div>}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Result" required><Select value={f.result} onChange={(v) => set("result", v)} options={["Accepted", "Rejected", "Partial"].map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Sample size"><Text value={f.sampleSize} onChange={(v) => set("sampleSize", v)} placeholder="e.g. 32 of 250 (AQL 1.0)" /></Field>
            <div />
            <Field label="Accepted qty"><Num value={f.acceptQty} onChange={(v) => set("acceptQty", v)} /></Field>
            <Field label="Rejected qty"><Num value={f.rejectQty} onChange={(v) => set("rejectQty", v)} /></Field>
            {Number(f.rejectQty) > 0 && <Field label="Rejection disposition"><Select value={f.disposition} onChange={(v) => set("disposition", v)} options={DISPOSITIONS.map((x) => ({ value: x, label: x }))} /></Field>}
            <Field label="Observations / remarks" className="sm:col-span-2 lg:col-span-3"><Area value={f.remarks} onChange={(v) => set("remarks", v)} rows={3} /></Field>
            <div className="sm:col-span-2 lg:col-span-3 text-xs rounded-lg p-2.5" style={{ background: "var(--accent-soft)" }}>
              <Icon name="flow" size={12} className="inline mr-1" />Accepted quantity is posted to stock automatically. Rejected quantity raises an NCR for {f.disposition.toLowerCase()}.
            </div>
          </div>
        )}
      </InternalScreen>
    );
  }

  /* ================= Sections ================= */
  function Dashboard(props) {
    return VG.ModuleDashboard ? <VG.ModuleDashboard modId="quality" {...props} /> : null;
  }

  function InspectionsPage({ roleKey, can, title }) {
    VG.useDB();
    const [view, setView] = useState(null);
    const [filter, setFilter] = useState("Pending");
    const rows = store.list("qcInspections").slice().reverse();
    const cols = [
      { key: "no", label: "Inspection #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "date", label: "Date" },
      { key: "itemId", label: "Material", render: (r) => itemName(r.itemId), csv: (r) => itemName(r.itemId) },
      { key: "supplierId", label: "Supplier", render: (r) => suppName(r.supplierId), csv: (r) => suppName(r.supplierId) },
      { key: "qtyReceived", label: "Qty" },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={QC_STATUS} /> },
    ];
    if (view) {
      const insp = store.get("qcInspections", view.id) || view;
      return <InspectModal insp={insp} onClose={() => setView(null)} roleKey={roleKey} can={can} />;
    }
    return (
      <ListPage title={title || "Incoming Inspection"} desc="Material held from Stores awaiting quality clearance" can={can}>
        <RecordTable embedded suppressNew tableId="qc-inspections" title="Inspection List" columns={cols} rows={rows} can={can} printTitle="QC Inspections" searchKeys={["no", "receiptNo"]}
          filters={[{ key: "status", label: "All status", options: ["Pending", "Accepted", "Rejected", "Partial"] }]}
          onView={(r) => setView(r)} empty="No inspections yet — they appear automatically when Stores receive QC-required material" />
      </ListPage>
    );
  }

  function NcrPage({ roleKey, can }) {
    VG.useDB();
    const rows = store.list("ncrs").slice().reverse();
    const cols = [
      { key: "no", label: "NCR #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "date", label: "Date" },
      { key: "itemId", label: "Material", render: (r) => itemName(r.itemId), csv: (r) => itemName(r.itemId) },
      { key: "supplierId", label: "Supplier", render: (r) => suppName(r.supplierId), csv: (r) => suppName(r.supplierId) },
      { key: "qty", label: "Qty" },
      { key: "disposition", label: "Disposition", render: (r) => <Pill color="#f59e0b">{r.disposition}</Pill> },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={NCR_STATUS} /> },
      { key: "act", label: "Action", render: (r) => (can("edit") && r.status !== "Closed") ? <Button variant="soft" className="!py-1" onClick={() => advance(r)}>{r.status === "Open" ? "Start action" : "Close"}</Button> : <span className="opacity-40 text-xs">—</span> },
    ];
    function advance(r) {
      const next = r.status === "Open" ? "In Progress" : "Closed";
      store.update("ncrs", r.id, { status: next }, roleKey);
      VG.toast("NCR " + r.no + " → " + next);
    }
    return (
      <ListPage title="Non-Conformance (NCR)" desc="Rejected material — routed to supplier return, rework or scrap" can={can}>
        <RecordTable embedded suppressNew title="NCR List" columns={cols} rows={rows} can={can} printTitle="NCR Register" searchKeys={["no"]}
          filters={[{ key: "status", label: "All status", options: ["Open", "In Progress", "Closed"] }]}
          empty="No non-conformances raised" />
      </ListPage>
    );
  }

  function ReportsPage({ roleKey, can }) {
    VG.useDB();
    const insp = store.list("qcInspections");
    const reports = [
      { n: "QC Pending Report", d: "All inspections awaiting decision", rows: insp.filter((x) => x.status === "Pending") },
      { n: "Rejection Analysis", d: "Rejected lots & NCR dispositions", rows: store.list("ncrs") },
      { n: "Inspection Register", d: "All inspections with outcomes", rows: insp },
    ];
    function print(r) {
      const body = (r.rows || []).map((x) => `<tr><td>${x.no}</td><td>${x.date}</td><td>${itemName(x.itemId)}</td><td>${x.status || x.disposition || ""}</td></tr>`).join("");
      printDocument({ title: r.n, subtitle: store.company().name, inner: `<table class="vg-tbl"><thead><tr><th>#</th><th>Date</th><th>Material</th><th>Status</th></tr></thead><tbody>${body || '<tr><td colspan=4>No data</td></tr>'}</tbody></table>` }, "preview");
    }
    return (
      <div>
        <PageHead title="Quality Reports" desc="Carry company header & footer · preview, print or save as PDF" />
        <div className="grid sm:grid-cols-2 gap-4">{reports.map((r) => (
          <Card key={r.n} className="p-4 flex items-center gap-4">
            <span className="grid place-items-center w-11 h-11 rounded-xl text-white shrink-0" style={{ background: "var(--accent)" }}><Icon name="chart" size={18} /></span>
            <div className="flex-1 min-w-0"><div className="font-medium text-sm">{r.n}</div><div className="text-[11px] opacity-55">{r.d} · {(r.rows || []).length} rows</div></div>
            <Button variant="soft" icon="eye" onClick={() => print(r)}>Open</Button>
          </Card>
        ))}</div>
      </div>
    );
  }

  function FinalQcPage({ roleKey, can }) {
    VG.useDB();
    const [view, setView] = useState(null);
    const rows = store.list("qcIssues").slice().reverse();
    const cols = [
      { key: "no", label: "QC Issue #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "workOrderNo", label: "WO" },
      { key: "sku", label: "SKU" },
      { key: "qtyForQc", label: "Qty for QC" },
      { key: "priority", label: "Priority", render: (r) => <Pill color={r.priority === "Critical" ? "#ef4444" : r.priority === "High Priority" ? "#f59e0b" : "#6366f1"}>{r.priority || "Normal"}</Pill> },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={{ "Pending Inspection": "#f59e0b", "Under Inspection": "#a855f7", Accepted: "#34d399", Rejected: "#ef4444", "Partially Accepted": "#22d3ee", "Rework Required": "#f97316", Hold: "#94a3b8" }} /> },
    ];
    if (view) {
      const qc = store.get("qcIssues", view.id) || view;
      return (
        <InternalScreen onBack={() => setView(null)} backLabel="Back to final QC" title={"Final QC " + qc.no} subtitle={qc.workOrderNo}
          footer={<>
            {can("approve") && <Button icon="check" onClick={() => { store.recordFinalQcResult(qc.id, { status: "Accepted", qtyInspected: qc.qtyForQc, acceptQty: qc.qtyForQc, inspectorName: roleKey }, roleKey); setView(null); VG.toast("QC accepted · sent to dispatch"); }}>Accept</Button>}
            {can("approve") && <Button variant="soft" onClick={() => { store.recordFinalQcResult(qc.id, { status: "Rework Required", qtyInspected: qc.qtyForQc, reworkQty: qc.qtyForQc, inspectorName: roleKey, remarks: "Rework required" }, roleKey); setView(null); VG.toast("Marked rework required"); }}>Rework</Button>}
            {can("approve") && <Button variant="ghost" onClick={() => { store.recordFinalQcResult(qc.id, { status: "Rejected", qtyInspected: qc.qtyForQc, rejectQty: qc.qtyForQc, inspectorName: roleKey, remarks: "Rejected in final QC" }, roleKey); setView(null); VG.toast("Rejected"); }}>Reject</Button>}
          </>}>
          <div className="space-y-2 text-sm">
            <div>WO: <b>{qc.workOrderNo}</b></div>
            <div>SKU: <b>{qc.sku || "—"}</b></div>
            <div>Qty received: <b>{qc.qtyForQc}</b></div>
            <div>Required dispatch date: <b>{qc.requiredDispatchDate || "—"}</b></div>
            <div className="text-xs opacity-65">Accepted moves to Dispatch queue automatically.</div>
          </div>
        </InternalScreen>
      );
    }
    return (
      <ListPage title="Final QC Inspection" desc="Finished goods inspection before dispatch handover" can={can}>
        <RecordTable embedded suppressNew tableId="qc-final" title="Final QC List" columns={cols} rows={rows} can={can} printTitle="Final QC" searchKeys={["no", "workOrderNo", "sku"]}
          onView={(r) => setView(r)} empty="No final QC queue yet" />
      </ListPage>
    );
  }

  const SECTIONS = [
    { id: "dashboard", label: "Dashboard", icon: "chart", group: "Overview" },
    { id: "inspections", label: "Incoming Inspection", icon: "shield", group: "Inspection" },
    { id: "inspections-prod", label: "Production Inspection", icon: "factory", group: "Inspection" },
    { id: "final-qc", label: "Final QC", icon: "check", group: "Inspection" },
    { id: "ncr", label: "Rejection", icon: "alert", group: "Rejection" },
    { id: "reports", label: "QC Reports", icon: "chart", group: "Reports" },
  ];
  if (VG.registerModuleSections) VG.registerModuleSections("quality", SECTIONS);
  const PAGES = {
    dashboard: Dashboard, inspections: InspectionsPage,
    "inspections-prod": (p) => React.createElement(InspectionsPage, { ...p, title: "Production Inspection" }),
    "final-qc": FinalQcPage, ncr: NcrPage, reports: ReportsPage,
  };

  VG.modules = VG.modules || {};
  VG.modules.quality = function QualityModule({ mod, roleKey }) {
    const can = (a) => VG.can(roleKey, a);
    const [section, setSection] = useState(() => VG.consumeSection("quality", "dashboard"));
    const Page = PAGES[section] || Dashboard;
    const actions = [
      { label: "Pending inspections", icon: "shield", primary: true, onClick: () => setSection("inspections") },
      { label: "NCR register", icon: "alert", onClick: () => setSection("ncr") },
      { label: "Reports", icon: "chart", onClick: () => setSection("reports") },
    ];
    return (
      <VG.ModuleScaffold mod={mod} sections={SECTIONS} section={section} setSection={setSection} actions={actions} roleKey={roleKey}>
        <Page roleKey={roleKey} can={can} go={setSection} mod={mod} />
      </VG.ModuleScaffold>
    );
  };
})(window.VG);
