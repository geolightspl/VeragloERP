/* Veraglo ERP — Enterprise Purchase Department (PR → RFQ → PO → GRN → Bill → Payment). */
(function (VG) {
  const { useState, useMemo } = React;
  const ui = VG.ui, fx = VG.fx, store = VG.store, inr = VG.fmt.inr, today = VG.fmt.todayISO;
  const { Icon, Button, Pill, Card } = ui;
  const { Field, Text, Area, Num, DateF, Select, MasterSelect, InternalScreen, RecordTable, PageHead, ListPage, StatusTag, printDocument, DocActions, TransactionLinesShell } = fx;

  const itemName = (id) => (VG.itemDisplay && VG.itemDisplay.tableLabel(id)) || (VG.itemMfr && VG.itemMfr.label(id)) || "—";
  const itemNameSkuPdf = (id) => (VG.itemDisplay && VG.itemDisplay.itemNameSkuCell(id)) || itemName(id);
  const suppName = (id) => (store.get("suppliers", id) || {}).name || "—";

  const PR_STATUS = { Pending: "#f59e0b", Approved: "#34d399", RFQ: "#6366f1", Ordered: "#818cf8", Rejected: "#ef4444", Closed: "#94a3b8" };
  const PO_STATUS = {
    Draft: "#94a3b8", "Pending Approval": "#f59e0b", Approved: "#34d399", "Sent to Vendor": "#6366f1",
    "Partially Received": "#22d3ee", "Fully Received": "#10b981", Closed: "#64748b", Cancelled: "#ef4444",
    Open: "#22d3ee", Received: "#6366f1",
  };
  const RFQ_STATUS = { Draft: "#94a3b8", Sent: "#6366f1", "Quotations Received": "#34d399", Closed: "#64748b", Cancelled: "#ef4444" };
  const BILL_STATUS = { Open: "#f59e0b", "Partially Paid": "#6366f1", Paid: "#34d399", Cancelled: "#ef4444" };

  function poTotals(lines) {
    return (lines || []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
  }

  function poDoc(po) {
    const supp = store.get("suppliers", po.supplierId) || {};
    const rows = (po.lines || []).map((l, i) => {
      const amt = (Number(l.qty) || 0) * (Number(l.rate) || 0);
      const it = store.get("items", l.itemId) || {};
      const desc = l.desc || (VG.itemDisplay && VG.itemDisplay.itemDescription(it)) || "";
      return `<tr><td>${i + 1}</td><td>${itemNameSkuPdf(l.itemId)}</td><td>${(VG.itemDisplay && VG.itemDisplay.nl2br(desc)) || ""}</td><td>${it.hsn || ""}</td><td class="vg-right">${l.qty} ${l.uom || ""}</td><td class="vg-right">${inr(l.rate)}</td><td class="vg-right">${inr(amt)}</td></tr>`;
    }).join("");
    const inner = `
      <div class="vg-cols">
        <div class="vg-card"><b>Supplier</b>${supp.name || "—"}<br>${supp.address || (supp.addresses && supp.addresses[0] && supp.addresses[0].line1) || ""}<br>GSTIN: ${supp.gstin || "—"}<br>PAN: ${supp.pan || "—"}</div>
        <div class="vg-card"><b>Purchase Order</b>No: ${po.no}<br>Date: ${po.date}<br>Status: ${po.status}${po.prNo ? "<br>Ref PR: " + po.prNo : ""}<br>Currency: ${po.currency || "INR"}</div>
        <div class="vg-card"><b>Deliver To</b>${store.company().name}<br>${store.company().address}<br>Payment: ${po.paymentTerms || "—"}<br>Delivery: ${po.deliveryTerms || "—"}</div>
      </div>
      <table class="vg-tbl"><thead><tr><th>#</th><th>Item Name / SKU</th><th>Description</th><th>HSN/SAC</th><th class="vg-right">Qty</th><th class="vg-right">Rate</th><th class="vg-right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="vg-totals"><div><span>Subtotal</span><span>${inr(po.total || poTotals(po.lines))}</span></div>${po.tdsPct ? `<div><span>TDS (${po.tdsPct}%)</span><span>${inr((po.total || 0) * po.tdsPct / 100)}</span></div>` : ""}<div class="grand"><span>Total</span><span>${inr(po.total || 0)}</span></div></div>
      <div class="vg-terms"><b>Terms:</b> Goods subject to incoming quality inspection. Please quote PO number on all documents and invoices.</div>
      <div class="vg-sign"><div>Prepared by: <b>${po.preparedBy || "—"}</b></div><div>Approved by: <b>${po.approvedBy || "—"}</b></div><div>For ${store.company().name}</div></div>`;
    return { title: "Purchase Order", subtitle: po.no + " · " + suppName(po.supplierId), inner };
  }

  function rfqDoc(rfq) {
    const rows = (rfq.lines || []).map((l, i) => {
      const it = store.get("items", l.itemId) || {};
      return `<tr><td>${i + 1}</td><td>${itemNameSkuPdf(l.itemId)}</td><td>${l.desc || it.description || ""}</td><td class="vg-right">${l.qty} ${l.uom || it.unit || ""}</td><td>${l.techSpec || ""}</td></tr>`;
    }).join("");
    const vendors = (rfq.supplierIds || []).map((id) => suppName(id)).join(", ");
    return {
      title: "Request for Quotation", subtitle: rfq.no,
      inner: `<div class="vg-cols"><div class="vg-card"><b>RFQ</b>${rfq.no}<br>Date: ${rfq.date}<br>Due: ${rfq.dueDate || "—"}</div><div class="vg-card"><b>Vendors invited</b>${vendors || "—"}</div><div class="vg-card"><b>Remarks</b>${rfq.remarks || "—"}</div></div>
        <table class="vg-tbl"><thead><tr><th>#</th><th>Item</th><th>Description</th><th class="vg-right">Qty</th><th>Specification</th></tr></thead><tbody>${rows}</tbody></table>`,
    };
  }

  /* ================= Dashboard ================= */
  function Dashboard(props) {
    return VG.ModuleDashboard ? <VG.ModuleDashboard modId="purchase" {...props} /> : null;
  }

  /* ================= Vendor Master ================= */
  function VendorsPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const [view, setView] = useState(null);
    const rows = store.list("suppliers");
    const cols = [
      { key: "code", label: "Code", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
      { key: "name", label: "Vendor" },
      { key: "gstin", label: "GSTIN", render: (r) => <span className="font-mono text-xs">{r.gstin || "—"}</span> },
      { key: "category", label: "Category", render: (r) => <Pill color="#14b8a6">{r.category || r.vendorCategory || "—"}</Pill> },
      { key: "rating", label: "Rating", render: (r) => r.rating ? "★ " + r.rating : "—" },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status || "Active"} map={{ Active: "#34d399", Inactive: "#94a3b8" }} /> },
    ];
    if (edit !== null) {
      const f = edit;
      const set = (k, v) => setEdit((p) => ({ ...p, [k]: v }));
      function save() {
        if (!f.name) return VG.toast("Vendor name required", "error");
        const payload = { ...f, code: f.code || store.nextVendorCode(), status: f.status || "Active", currency: f.currency || "INR" };
        if (f.id) store.update("suppliers", f.id, payload, roleKey);
        else store.create("suppliers", payload, roleKey);
        VG.toast("Vendor saved");
        setEdit(null);
      }
      return (
        <InternalScreen onBack={() => setEdit(null)} backLabel="Back to vendors" title={f.id ? "Edit " + f.name : "New Vendor"} subtitle="Complete vendor master for procurement & compliance"
          actions={<Button icon="check" onClick={save}>Save vendor</Button>}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Vendor name" required><Text value={f.name} onChange={(v) => set("name", v)} /></Field>
            <Field label="Vendor code"><Text value={f.code || store.nextVendorCode()} onChange={(v) => set("code", v)} /></Field>
            <Field label="GSTIN"><Text value={f.gstin} onChange={(v) => set("gstin", v)} /></Field>
            <Field label="PAN"><Text value={f.pan} onChange={(v) => set("pan", v)} /></Field>
            <Field label="MSME status"><Select value={f.msmeStatus || ""} onChange={(v) => set("msmeStatus", v)} options={["", "Micro", "Small", "Medium", "Not Registered"].map((x) => ({ value: x, label: x || "Select" }))} /></Field>
            <Field label="Vendor category"><Select value={f.vendorCategory || f.category || "A-grade"} onChange={(v) => set("vendorCategory", v)} options={["A-grade", "B-grade", "C-grade", "Import", "MSME", "Watch"].map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Contact person"><Text value={f.contact} onChange={(v) => set("contact", v)} /></Field>
            <Field label="Mobile"><Text value={f.phone} onChange={(v) => set("phone", v)} /></Field>
            <Field label="Email"><Text value={f.email} onChange={(v) => set("email", v)} /></Field>
            <Field label="Website"><Text value={f.website} onChange={(v) => set("website", v)} /></Field>
            <Field label="Address line 1" className="sm:col-span-2"><Text value={f.address1 || f.address || ""} onChange={(v) => set("address1", v)} /></Field>
            <Field label="Address line 2"><Text value={f.address2} onChange={(v) => set("address2", v)} /></Field>
            <Field label="City"><Text value={f.city} onChange={(v) => set("city", v)} /></Field>
            <Field label="State"><Text value={f.state} onChange={(v) => set("state", v)} /></Field>
            <Field label="Country"><Text value={f.country || "India"} onChange={(v) => set("country", v)} /></Field>
            <Field label="PIN code"><Text value={f.pin} onChange={(v) => set("pin", v)} /></Field>
            <Field label="Bank name"><Text value={f.bankName} onChange={(v) => set("bankName", v)} /></Field>
            <Field label="Account no."><Text value={f.bankAccount} onChange={(v) => set("bankAccount", v)} /></Field>
            <Field label="IFSC"><Text value={f.ifsc} onChange={(v) => set("ifsc", v)} /></Field>
            <Field label="SWIFT"><Text value={f.swift} onChange={(v) => set("swift", v)} /></Field>
            <Field label="Currency"><Select value={f.currency || "INR"} onChange={(v) => set("currency", v)} options={(store.list("currencies") || [{ code: "INR" }]).map((c) => ({ value: c.code || c, label: c.code || c }))} /></Field>
            <Field label="Payment terms"><Text value={f.paymentTerms || "30 Days Credit"} onChange={(v) => set("paymentTerms", v)} /></Field>
            <Field label="Delivery terms"><Text value={f.deliveryTerms || "FOR Destination"} onChange={(v) => set("deliveryTerms", v)} /></Field>
            <Field label="Rating (1–5)"><Num value={f.rating} onChange={(v) => set("rating", v)} /></Field>
            <Field label="Status"><Select value={f.status || "Active"} onChange={(v) => set("status", v)} options={["Active", "Inactive"].map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Remarks" className="sm:col-span-2 lg:col-span-3"><Area value={f.remarks} onChange={(v) => set("remarks", v)} rows={2} /></Field>
          </div>
        </InternalScreen>
      );
    }
    if (view) {
      const ledger = store.vendorLedger(view.id);
      return (
        <InternalScreen onBack={() => setView(null)} backLabel="Back to vendors" title={view.name} subtitle={view.code + " · Vendor 360°"}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card className="p-3"><div className="text-[10px] uppercase opacity-50">Outstanding</div><div className="text-xl font-semibold">{inr(ledger.outstanding)}</div></Card>
            <Card className="p-3"><div className="text-[10px] uppercase opacity-50">Purchase orders</div><div className="text-xl font-semibold">{ledger.purchaseOrders.length}</div></Card>
            <Card className="p-3"><div className="text-[10px] uppercase opacity-50">Pending bills</div><div className="text-xl font-semibold">{ledger.bills.filter((b) => b.status !== "Paid").length}</div></Card>
            <Card className="p-3"><div className="text-[10px] uppercase opacity-50">Rating</div><div className="text-xl font-semibold">{view.rating ? "★ " + view.rating : "—"}</div></Card>
          </div>
          <Card className="p-4 text-sm opacity-80">{view.gstin && <>GSTIN: {view.gstin}<br /></>}{view.contact} · {view.phone}<br />{view.address1 || view.address}</Card>
        </InternalScreen>
      );
    }
    return (
      <ListPage title="Vendor Master" desc="Complete supplier register with GST, bank & compliance details" onNew={() => setEdit({ currency: "INR", country: "India", vendorCategory: "A-grade" })} newLabel="Add Vendor" can={can}>
        <RecordTable embedded suppressNew title="Vendor List" columns={cols} rows={rows} can={can} printTitle="Vendor Master" searchKeys={["name", "code", "gstin"]}
          onNew={() => setEdit({ currency: "INR", country: "India", vendorCategory: "A-grade" })} onView={(r) => setView(r)} onEdit={can("edit") ? (r) => setEdit(r) : null} empty="No vendors — add your first supplier" />
      </ListPage>
    );
  }

  /* ================= Purchase Request ================= */
  function RequestsPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const rows = store.list("purchaseRequests").slice().reverse();
    const prLineCount = (r) => (r.lines && r.lines.length) || (r.itemId ? 1 : 0);
    const prItems = (r) => {
      const lines = r.lines && r.lines.length ? r.lines : (r.itemId ? [{ itemId: r.itemId, qty: r.qty, uom: r.uom }] : []);
      return lines.map((l) => itemName(l.itemId)).join(", ");
    };
    const cols = [
      { key: "no", label: "PR #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "date", label: "Date" },
      { key: "department", label: "Department", render: (r) => r.department || "—" },
      { key: "items", label: "Items", render: (r) => <span className="truncate max-w-[200px] inline-block">{prItems(r)}</span>, csv: prItems },
      { key: "lines", label: "Lines", render: (r) => prLineCount(r) },
      { key: "priority", label: "Priority", render: (r) => <Pill color={r.priority === "Urgent" || r.priority === "High" ? "#f59e0b" : "#94a3b8"}>{r.priority || "Normal"}</Pill> },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={PR_STATUS} /> },
      { key: "act", label: "Action", render: (r) => {
        if (r.status === "Pending" && can("approve")) return (
          <div className="flex gap-1 flex-wrap">
            <Button variant="soft" className="!py-1" onClick={() => { store.approvePR(r.id, roleKey); VG.toast("PR " + r.no + " approved"); }}>Approve</Button>
            <Button variant="ghost" className="!py-1" onClick={() => { store.rejectPR(r.id, roleKey); VG.toast("PR rejected"); }}>Reject</Button>
          </div>
        );
        if (r.status === "Approved" && can("add")) return (
          <div className="flex gap-1 flex-wrap">
            <Button variant="soft" className="!py-1" onClick={() => { store.createRFQ({ prIds: [r.id], prNos: [r.no], lines: r.lines || [{ itemId: r.itemId, qty: r.qty, uom: r.uom }], supplierIds: r.supplierId ? [r.supplierId] : [] }, roleKey); VG.toast("RFQ created"); }}>Create RFQ</Button>
            <Button variant="ghost" className="!py-1" onClick={() => { store.poFromRequest(r.id, {}, roleKey); VG.toast("PO created"); }}>Direct PO</Button>
          </div>
        );
        if (r.status === "Ordered") return <span className="text-xs opacity-60">{r.poNo}</span>;
        return <span className="opacity-40 text-xs">—</span>;
      } },
    ];
    if (edit !== null) {
      const f = edit;
      const set = (k, v) => setEdit((p) => ({ ...p, [k]: v }));
      const lines = f.lines && f.lines.length ? f.lines : [{ itemId: "", qty: 1, uom: "Nos", desc: "", techSpec: "" }];
      function setLine(i, patch) { setEdit((p) => ({ ...p, lines: (p.lines || lines).map((l, j) => (j === i ? { ...l, ...patch } : l)) })); }
      function addLine() { setEdit((p) => ({ ...p, lines: [...(p.lines || lines), { itemId: "", qty: 1, uom: "Nos", desc: "", techSpec: "" }] })); }
      function save() {
        const valid = (f.lines || lines).filter((l) => l.itemId && Number(l.qty) > 0);
        if (!valid.length) return VG.toast("Add at least one item line", "error");
        const payload = { ...f, lines: valid, department: f.department || "Production", requestedBy: f.requestedBy || roleKey, requiredDate: f.requiredDate || f.neededBy, remarks: f.remarks || f.reason, status: f.status || "Pending" };
        if (f.id) { store.update("purchaseRequests", f.id, payload, roleKey); VG.toast("PR updated"); }
        else { store.create("purchaseRequests", { ...payload, no: store.nextNo("PR", f.date || today()), date: f.date || today(), raisedBy: roleKey }, roleKey); VG.toast("Purchase request created"); }
        setEdit(null);
      }
      return (
        <InternalScreen onBack={() => setEdit(null)} backLabel="Back to requests" title={f.id ? "Edit " + f.no : "New Purchase Request"} subtitle="Department indent · multi-item supported"
          actions={<Button icon="check" onClick={save}>{f.id ? "Save changes" : "Raise request"}</Button>}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <Field label="Date" required><DateF value={f.date || today()} onChange={(v) => set("date", v)} /></Field>
            <Field label="Department"><Select value={f.department || "Production"} onChange={(v) => set("department", v)} options={["Production", "Quality", "Stores", "Maintenance", "Admin", "Sales"].map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Requested by"><Text value={f.requestedBy || roleKey} onChange={(v) => set("requestedBy", v)} /></Field>
            <Field label="Required date"><DateF value={f.requiredDate || f.neededBy} onChange={(v) => set("requiredDate", v)} /></Field>
            <Field label="Priority"><Select value={f.priority || "Normal"} onChange={(v) => set("priority", v)} options={["Low", "Normal", "High", "Urgent"].map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Preferred vendor"><MasterSelect collection="suppliers" value={f.supplierId} onChange={(v) => set("supplierId", v)} actorRole={roleKey} can={can("add")} /></Field>
            <Field label="BOM / WO ref"><Text value={f.bomRef || f.woRef} onChange={(v) => set("bomRef", v)} /></Field>
            <Field label="Remarks" className="sm:col-span-2 lg:col-span-3"><Area value={f.remarks || f.reason} onChange={(v) => set("remarks", v)} rows={2} /></Field>
          </div>
          <TransactionLinesShell title="Request lines" onAddLine={addLine} addLabel="Add line"
            headerRow={<tr className="text-left border-b border-white/10"><th className="px-3 py-2">Item</th><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2">Tech spec</th></tr>}>
            {(f.lines || lines).map((l, i) => (
              <tr key={i} className="border-b border-white/5">
                <td className="px-3 py-2 min-w-[180px]"><MasterSelect variant="line" collection="items" value={l.itemId} onChange={(id) => { const it = store.get("items", id) || {}; setLine(i, { itemId: id, uom: it.unit, desc: it.description || it.name }); }} actorRole={roleKey} can={can("add")} /></td>
                <td className="px-3 py-2"><Text value={l.desc} onChange={(v) => setLine(i, { desc: v })} /></td>
                <td className="px-3 py-2 w-24"><Num value={l.qty} onChange={(v) => setLine(i, { qty: v })} /></td>
                <td className="px-3 py-2 w-24"><Text value={l.uom} onChange={(v) => setLine(i, { uom: v })} /></td>
                <td className="px-3 py-2"><Text value={l.techSpec} onChange={(v) => setLine(i, { techSpec: v })} /></td>
              </tr>
            ))}
          </TransactionLinesShell>
        </InternalScreen>
      );
    }
    return (
      <ListPage title="Purchase Requests" desc="Department indents · approval workflow · RFQ or direct PO" onNew={() => setEdit({ date: today(), priority: "Normal", lines: [{ itemId: "", qty: 1, uom: "Nos" }] })} newLabel="Add Request" can={can}>
        <RecordTable embedded suppressNew title="Request List" columns={cols} rows={rows} can={can} printTitle="Purchase Requests" searchKeys={["no", "department"]}
          filters={[{ key: "status", label: "All status", options: ["Pending", "Approved", "RFQ", "Ordered", "Rejected"] }]}
          onNew={() => setEdit({ date: today(), priority: "Normal", lines: [{ itemId: "", qty: 1, uom: "Nos" }] })} onEdit={(r) => setEdit(r)} empty="No purchase requests yet" />
      </ListPage>
    );
  }

  /* ================= RFQ ================= */
  function RFQPage({ roleKey, can, go }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const [view, setView] = useState(null);
    const rows = store.list("rfqs").slice().reverse();
    const cols = [
      { key: "no", label: "RFQ #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "date", label: "Date" },
      { key: "dueDate", label: "Due" },
      { key: "vendors", label: "Vendors", render: (r) => (r.supplierIds || []).length, csv: (r) => (r.supplierIds || []).length },
      { key: "lines", label: "Lines", render: (r) => (r.lines || []).length },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={RFQ_STATUS} /> },
    ];
    if (view) {
      const quotes = store.list("vendorQuotations").filter((q) => q.rfqId === view.id);
      return (
        <InternalScreen onBack={() => setView(null)} backLabel="Back to RFQ list" title={"RFQ " + view.no} subtitle={view.status}
          footer={<><DocActions build={() => rfqDoc(view)} />{can("add") && <Button variant="soft" onClick={() => go && go("comparison")}>Compare quotes</Button>}</>}>
          <div className="mb-4 text-sm opacity-70">Due: {view.dueDate || "—"} · Vendors: {(view.supplierIds || []).map(suppName).join(", ") || "—"}</div>
          <RecordTable embedded suppressNew title="Quotations received" columns={[
            { key: "supplierId", label: "Vendor", render: (r) => suppName(r.supplierId) },
            { key: "date", label: "Date" },
            { key: "total", label: "Total", render: (r) => inr(r.total) },
            { key: "leadTimeDays", label: "Lead time", render: (r) => (r.leadTimeDays || "—") + " days" },
            { key: "technicalCompliance", label: "Technical" },
          ]} rows={quotes} can={can} printTitle="Vendor quotations" searchKeys={[]} />
        </InternalScreen>
      );
    }
    if (edit !== null) {
      const f = edit;
      const set = (k, v) => setEdit((p) => ({ ...p, [k]: v }));
      const lines = f.lines && f.lines.length ? f.lines : [{ itemId: "", qty: 1, uom: "Nos" }];
      function save() {
        const rfq = store.createRFQ({ ...f, lines, date: f.date || today(), supplierIds: f.supplierIds || [] }, roleKey);
        if (rfq) { store.update("rfqs", rfq.id, { status: "Sent" }, roleKey); VG.toast("RFQ " + rfq.no + " sent"); }
        setEdit(null);
      }
      return (
        <InternalScreen onBack={() => setEdit(null)} backLabel="Back to RFQ list" title="Create RFQ" subtitle="Invite vendors for quotation"
          actions={<Button icon="check" onClick={save}>Create & send RFQ</Button>}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <Field label="Date"><DateF value={f.date || today()} onChange={(v) => set("date", v)} /></Field>
            <Field label="Response due"><DateF value={f.dueDate} onChange={(v) => set("dueDate", v)} /></Field>
            <Field label="Vendor (primary)"><MasterSelect collection="suppliers" value={(f.supplierIds || [])[0]} onChange={(v) => set("supplierIds", v ? [v] : [])} actorRole={roleKey} can={can("add")} /></Field>
            <Field label="Remarks" className="sm:col-span-2 lg:col-span-3"><Area value={f.remarks} onChange={(v) => set("remarks", v)} rows={2} /></Field>
          </div>
          <TransactionLinesShell title="RFQ lines" onAddLine={() => setEdit((p) => ({ ...p, lines: [...(p.lines || lines), { itemId: "", qty: 1, uom: "Nos" }] }))} addLabel="Add line"
            headerRow={<tr><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2">Spec</th></tr>}>
            {(f.lines || lines).map((l, i) => (
              <tr key={i} className="border-b border-white/5">
                <td className="px-3 py-2"><MasterSelect variant="line" collection="items" value={l.itemId} onChange={(id) => { const it = store.get("items", id) || {}; setEdit((p) => ({ ...p, lines: (p.lines || lines).map((x, j) => j === i ? { ...x, itemId: id, uom: it.unit } : x) })); }} actorRole={roleKey} can={can("add")} /></td>
                <td className="px-3 py-2 w-24"><Num value={l.qty} onChange={(v) => setEdit((p) => ({ ...p, lines: (p.lines || lines).map((x, j) => j === i ? { ...x, qty: v } : x) }))} /></td>
                <td className="px-3 py-2 w-24"><Text value={l.uom} onChange={(v) => setEdit((p) => ({ ...p, lines: (p.lines || lines).map((x, j) => j === i ? { ...x, uom: v } : x) }))} /></td>
                <td className="px-3 py-2"><Text value={l.techSpec} onChange={(v) => setEdit((p) => ({ ...p, lines: (p.lines || lines).map((x, j) => j === i ? { ...x, techSpec: v } : x) }))} /></td>
              </tr>
            ))}
          </TransactionLinesShell>
        </InternalScreen>
      );
    }
    return (
      <ListPage title="RFQ Management" desc="Request for quotation · vendor comparison · PO conversion" onNew={() => setEdit({ date: today(), lines: [{ itemId: "", qty: 1, uom: "Nos" }] })} newLabel="Create RFQ" can={can}>
        <RecordTable embedded suppressNew title="RFQ List" columns={cols} rows={rows} can={can} printTitle="RFQ Register" searchKeys={["no"]}
          filters={[{ key: "status", label: "All status", options: ["Draft", "Sent", "Quotations Received", "Closed"] }]}
          onNew={() => setEdit({ date: today(), lines: [{ itemId: "", qty: 1, uom: "Nos" }] })} onView={(r) => setView(r)} empty="No RFQs yet" />
      </ListPage>
    );
  }

  /* ================= Vendor Comparison ================= */
  function ComparisonPage({ roleKey, can }) {
    VG.useDB();
    const rfqs = store.list("rfqs").filter((r) => r.status === "Quotations Received" || r.status === "Sent");
    const [rfqId, setRfqId] = useState(rfqs[0] && rfqs[0].id);
    const cmp = useMemo(() => (rfqId ? store.vendorComparison(rfqId) : null), [rfqId, store.list("vendorQuotations").length]);
    function printMatrix() {
      if (!cmp || !cmp.quotes.length) return VG.toast("No quotations to compare", "error");
      const head = "<th>Vendor</th><th>Total</th><th>Lead time</th><th>Freight</th><th>Warranty</th><th>Technical</th><th>Rating</th><th>Prior POs</th>";
      const body = cmp.quotes.map((q) => `<tr><td>${q.supplierName}</td><td>${inr(q.total)}</td><td>${q.leadTimeDays || "—"} days</td><td>${inr(q.freight)}</td><td>${q.warranty || "—"}</td><td>${q.technicalCompliance}</td><td>${q.rating || "—"}</td><td>${q.priorOrders}</td></tr>`).join("");
      printDocument({ title: "Vendor Comparison — " + cmp.rfq.no, subtitle: store.company().name, inner: `<table class="vg-tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` }, "preview");
    }
    return (
      <div>
        <PageHead title="Vendor Comparison" desc="Price, lead time, tax, freight, warranty & technical compliance matrix" />
        <div className="flex flex-wrap gap-3 mb-4">
          <Field label="Select RFQ"><Select value={rfqId || ""} onChange={setRfqId} options={[{ value: "", label: "Select RFQ" }].concat(rfqs.map((r) => ({ value: r.id, label: r.no })))} /></Field>
          {cmp && cmp.quotes.length > 0 && <Button variant="soft" icon="eye" onClick={printMatrix}>Print comparison</Button>}
          {cmp && cmp.quotes[0] && can("add") && (
            <Button icon="cart" onClick={() => {
              const q = cmp.quotes[0];
              store.createPO({ supplierId: q.supplierId, rfqId: cmp.rfq.id, quotationId: q.id, lines: q.lines, currency: "INR", status: "Draft" }, roleKey);
              VG.toast("PO created from best quote");
            }}>Create PO from best quote</Button>
          )}
        </div>
        {!cmp || !cmp.quotes.length ? <Card className="p-8 text-center opacity-60">Select an RFQ with received quotations to compare vendors.</Card> : (
          <div className="overflow-x-auto rounded-xl glass">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase opacity-55 border-b border-white/10"><tr className="text-left">
                <th className="px-4 py-3">Vendor</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Lead time</th><th className="px-4 py-3 text-right">Freight</th><th className="px-4 py-3">Warranty</th><th className="px-4 py-3">Technical</th><th className="px-4 py-3">Rating</th><th className="px-4 py-3">History</th>
              </tr></thead>
              <tbody>{cmp.quotes.map((q) => (
                <tr key={q.id} className="border-b border-white/5 chrome-hover">
                  <td className="px-4 py-3 font-medium">{q.supplierName}</td>
                  <td className="px-4 py-3 text-right">{inr(q.total)}</td>
                  <td className="px-4 py-3">{q.leadTimeDays || "—"} days</td>
                  <td className="px-4 py-3 text-right">{inr(q.freight)}</td>
                  <td className="px-4 py-3">{q.warranty || "—"}</td>
                  <td className="px-4 py-3"><Pill color={q.technicalCompliance === "Compliant" ? "#34d399" : "#f59e0b"}>{q.technicalCompliance}</Pill></td>
                  <td className="px-4 py-3">{q.rating ? "★ " + q.rating : "—"}</td>
                  <td className="px-4 py-3">{q.priorOrders} PO(s)</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  /* ================= Purchase Orders ================= */
  function OrdersPage({ roleKey, can }) {
    VG.useDB();
    const [view, setView] = useState(null);
    const [edit, setEdit] = useState(null);
    const rows = store.list("purchaseOrders").slice().reverse();
    const cols = [
      { key: "no", label: "PO #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "date", label: "Date" },
      { key: "supplierId", label: "Vendor", render: (r) => suppName(r.supplierId), csv: (r) => suppName(r.supplierId) },
      { key: "total", label: "Value", render: (r) => inr(r.total), csv: (r) => r.total },
      { key: "currency", label: "Curr.", render: (r) => r.currency || "INR" },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={PO_STATUS} /> },
    ];
    if (edit !== null) {
      const f = edit;
      const set = (k, v) => setEdit((p) => ({ ...p, [k]: v }));
      const lines = f.lines && f.lines.length ? f.lines : [{ itemId: "", qty: 1, uom: "Nos", rate: 0 }];
      function save() {
        if (!f.supplierId) return VG.toast("Select vendor", "error");
        const valid = lines.filter((l) => l.itemId && Number(l.qty) > 0);
        if (!valid.length) return VG.toast("Add PO lines", "error");
        const total = poTotals(valid);
        if (f.id) store.update("purchaseOrders", f.id, { ...f, lines: valid, total }, roleKey);
        else store.createPO({ ...f, lines: valid, total, date: f.date || today() }, roleKey);
        VG.toast("PO saved");
        setEdit(null);
      }
      return (
        <InternalScreen onBack={() => setEdit(null)} backLabel="Back to PO list" title={f.id ? "Edit PO " + f.no : "New Purchase Order"} subtitle="Multi-item · multi-currency · GST/TDS"
          actions={<Button icon="check" onClick={save}>Save PO</Button>}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Field label="Vendor" required className="lg:col-span-2"><MasterSelect collection="suppliers" value={f.supplierId} onChange={(v) => set("supplierId", v)} actorRole={roleKey} can={can("add")} /></Field>
            <Field label="Date"><DateF value={f.date || today()} onChange={(v) => set("date", v)} /></Field>
            <Field label="Currency"><Select value={f.currency || "INR"} onChange={(v) => set("currency", v)} options={["INR", "USD", "EUR", "GBP"].map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Payment terms"><Text value={f.paymentTerms} onChange={(v) => set("paymentTerms", v)} /></Field>
            <Field label="Delivery terms"><Text value={f.deliveryTerms} onChange={(v) => set("deliveryTerms", v)} /></Field>
            <Field label="Delivery schedule"><DateF value={f.deliverySchedule} onChange={(v) => set("deliverySchedule", v)} /></Field>
            <Field label="TDS %"><Num value={f.tdsPct} onChange={(v) => set("tdsPct", v)} /></Field>
          </div>
          <TransactionLinesShell title="PO lines" onAddLine={() => setEdit((p) => ({ ...p, lines: [...(p.lines || lines), { itemId: "", qty: 1, uom: "Nos", rate: 0 }] }))} addLabel="Add line"
            headerRow={<tr><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Amount</th></tr>}>
            {(f.lines || lines).map((l, i) => (
              <tr key={i} className="border-b border-white/5">
                <td className="px-3 py-2"><MasterSelect variant="line" collection="items" value={l.itemId} onChange={(id) => { const it = store.get("items", id) || {}; setEdit((p) => ({ ...p, lines: (p.lines || lines).map((x, j) => j === i ? { ...x, itemId: id, uom: it.unit, rate: x.rate || it.rate } : x) })); }} actorRole={roleKey} can={can("add")} /></td>
                <td className="px-3 py-2 w-24"><Num value={l.qty} onChange={(v) => setEdit((p) => ({ ...p, lines: (p.lines || lines).map((x, j) => j === i ? { ...x, qty: v } : x) }))} /></td>
                <td className="px-3 py-2 w-20"><Text value={l.uom} onChange={(v) => setEdit((p) => ({ ...p, lines: (p.lines || lines).map((x, j) => j === i ? { ...x, uom: v } : x) }))} /></td>
                <td className="px-3 py-2 w-28"><Num value={l.rate} onChange={(v) => setEdit((p) => ({ ...p, lines: (p.lines || lines).map((x, j) => j === i ? { ...x, rate: v } : x) }))} /></td>
                <td className="px-3 py-2 text-right w-28">{inr((Number(l.qty) || 0) * (Number(l.rate) || 0))}</td>
              </tr>
            ))}
          </TransactionLinesShell>
          <div className="flex justify-end mt-3 font-semibold">Total: {inr(poTotals(f.lines || lines))}</div>
        </InternalScreen>
      );
    }
    const po = view ? (store.get("purchaseOrders", view.id) || view) : null;
    if (po) {
      return (
        <InternalScreen onBack={() => setView(null)} backLabel="Back to purchase orders" title={"Purchase Order " + po.no} subtitle={suppName(po.supplierId)}
          footer={<>
            <DocActions build={() => poDoc(po)} />
            {can("edit") && po.status === "Draft" && <Button variant="soft" onClick={() => { store.submitPOForApproval(po.id, roleKey); setView(store.get("purchaseOrders", po.id)); VG.toast("Submitted for approval"); }}>Submit for approval</Button>}
            {can("approve") && (po.status === "Pending Approval" || po.status === "Draft") && <Button variant="soft" icon="check" onClick={() => { store.approvePO(po.id, roleKey); setView(store.get("purchaseOrders", po.id)); VG.toast("PO approved"); }}>Approve</Button>}
            {can("edit") && po.status === "Approved" && <Button variant="soft" onClick={() => { store.sendPOToVendor(po.id, roleKey); setView(store.get("purchaseOrders", po.id)); VG.toast("PO sent to vendor"); }}>Send to vendor</Button>}
            <Button icon="download" onClick={() => VG.goTo("inventory", "receipt")}>Record GRN</Button>
          </>}>
          <div className="flex items-center gap-2 mb-4 flex-wrap"><StatusTag value={po.status} map={PO_STATUS} /><span className="text-sm opacity-60">{po.date}{po.prNo ? " · from " + po.prNo : ""} · {po.currency || "INR"}</span></div>
          <div className="overflow-x-auto rounded-xl glass mb-4">
            <table className="w-full text-xs"><thead className="text-[10px] uppercase opacity-55 vg-sticky-thead"><tr className="text-left border-b border-white/10">
              <th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Ordered</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2 text-right">Pending</th><th className="px-3 py-2 text-right">Rejected</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Amount</th>
            </tr></thead>
              <tbody>{(po.lines || []).map((l, i) => <tr key={i} className="border-b border-white/5">
                <td className="px-3 py-2">{itemName(l.itemId)}</td>
                <td className="px-3 py-2 text-right">{l.qty} {l.uom}</td>
                <td className="px-3 py-2 text-right text-emerald-400">{l.qtyReceived || 0}</td>
                <td className="px-3 py-2 text-right text-amber-400">{l.qtyPending != null ? l.qtyPending : Math.max(0, (Number(l.qty) || 0) - (Number(l.qtyReceived) || 0))}</td>
                <td className="px-3 py-2 text-right text-rose-400">{l.qtyRejected || 0}</td>
                <td className="px-3 py-2 text-right">{inr(l.rate)}</td>
                <td className="px-3 py-2 text-right font-medium">{inr((Number(l.qty) || 0) * (Number(l.rate) || 0))}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="flex justify-end text-sm"><div className="w-56"><div className="flex justify-between font-semibold text-base border-t border-white/10 pt-1"><span>Total</span><span>{inr(po.total || 0)}</span></div></div></div>
        </InternalScreen>
      );
    }
    return (
      <ListPage title="Purchase Orders" desc="Full PO lifecycle · approval · partial receipt · revision" onNew={() => setEdit({ date: today(), currency: "INR", lines: [{ itemId: "", qty: 1, uom: "Nos", rate: 0 }] })} newLabel="Create PO" can={can}>
        <RecordTable embedded suppressNew tableId="purchase-orders" title="Purchase Order List" columns={cols} rows={rows} can={can} printTitle="Purchase Orders" searchKeys={["no"]}
          filters={[{ key: "status", label: "All status", options: ["Draft", "Pending Approval", "Approved", "Sent to Vendor", "Partially Received", "Fully Received", "Closed", "Cancelled"] }]}
          onNew={() => setEdit({ date: today(), currency: "INR", lines: [{ itemId: "", qty: 1, uom: "Nos", rate: 0 }] })} onView={(r) => setView(r)} empty="No purchase orders" />
      </ListPage>
    );
  }

  /* ================= GRN / Receipt ================= */
  function GRNPage({ roleKey, can }) {
    VG.useDB();
    const pendingPO = store.list("purchaseOrders").filter((p) => ["Approved", "Sent to Vendor", "Partially Received"].includes(p.status));
    const grns = store.list("materialReceipts").slice().reverse();
    const cols = [
      { key: "no", label: "GRN #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "date", label: "Date" },
      { key: "poNo", label: "PO", render: (r) => r.poNo || "—" },
      { key: "supplierId", label: "Vendor", render: (r) => suppName(r.supplierId), csv: (r) => suppName(r.supplierId) },
      { key: "qty", label: "Qty", render: (r) => r.qtyReceived || r.qtyAccepted || "—" },
      { key: "status", label: "Status", render: (r) => <Pill color={r.posted ? "#34d399" : "#f59e0b"}>{r.qcStatus || (r.posted ? "Posted" : "Pending QC")}</Pill> },
    ];
    return (
      <ListPage title="GRN & Material Receipt" desc="PO-linked goods receipt · QC pending · stock posting" can={can}>
        <Card className="p-4 mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm">{pendingPO.length} PO(s) awaiting receipt</span>
          <Button icon="download" onClick={() => VG.goTo("inventory", "receipt")}>Post new GRN</Button>
          <Button variant="soft" onClick={() => VG.goTo("quality", "inspections")}>Pending QC inspections</Button>
        </Card>
        <RecordTable embedded suppressNew title="GRN Register" columns={cols} rows={grns} can={can} printTitle="GRN Report" searchKeys={["no", "poNo"]} empty="No GRNs posted yet" />
      </ListPage>
    );
  }

  /* ================= Vendor Bills ================= */
  function BillsPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const rows = store.list("vendorBills").slice().reverse();
    const cols = [
      { key: "no", label: "Bill #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "date", label: "Date" },
      { key: "vendorInvoiceNo", label: "Vendor inv." },
      { key: "supplierId", label: "Vendor", render: (r) => suppName(r.supplierId) },
      { key: "poNo", label: "PO" },
      { key: "amount", label: "Amount", render: (r) => inr(r.amount) },
      { key: "dueDate", label: "Due" },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={BILL_STATUS} /> },
    ];
    if (edit !== null) {
      const f = edit;
      const set = (k, v) => setEdit((p) => ({ ...p, [k]: v }));
      function save() {
        if (!f.supplierId) return VG.toast("Select vendor", "error");
        store.createVendorBill({ ...f, date: f.date || today(), lines: f.lines || [] }, roleKey);
        VG.toast("Vendor bill recorded");
        setEdit(null);
      }
      return (
        <InternalScreen onBack={() => setEdit(null)} backLabel="Back to bills" title="Vendor Bill Entry" subtitle="PO & GRN linkage · GST breakup · TDS"
          actions={<Button icon="check" onClick={save}>Save bill</Button>}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Vendor" required><MasterSelect collection="suppliers" value={f.supplierId} onChange={(v) => set("supplierId", v)} actorRole={roleKey} can={can("add")} /></Field>
            <Field label="Vendor invoice no."><Text value={f.vendorInvoiceNo} onChange={(v) => set("vendorInvoiceNo", v)} /></Field>
            <Field label="Bill date"><DateF value={f.date || today()} onChange={(v) => set("date", v)} /></Field>
            <Field label="PO reference"><Text value={f.poNo} onChange={(v) => set("poNo", v)} /></Field>
            <Field label="GRN reference"><Text value={f.grnNo} onChange={(v) => set("grnNo", v)} /></Field>
            <Field label="Due date"><DateF value={f.dueDate} onChange={(v) => set("dueDate", v)} /></Field>
            <Field label="Taxable amount"><Num value={f.taxable} onChange={(v) => set("taxable", v)} /></Field>
            <Field label="GST amount"><Num value={f.taxAmount} onChange={(v) => set("taxAmount", v)} /></Field>
            <Field label="TDS %"><Num value={f.tdsPct} onChange={(v) => set("tdsPct", v)} /></Field>
            <Field label="Total amount"><Num value={f.amount} onChange={(v) => set("amount", v)} /></Field>
          </div>
        </InternalScreen>
      );
    }
    return (
      <ListPage title="Vendor Bills" desc="Purchase invoice entry · GST · TDS · payment tracking" onNew={() => setEdit({ date: today() })} newLabel="Add Bill" can={can}>
        <RecordTable embedded suppressNew title="Vendor Bill List" columns={cols} rows={rows} can={can} printTitle="Vendor Bills" searchKeys={["no", "vendorInvoiceNo"]}
          filters={[{ key: "status", label: "All status", options: ["Open", "Partially Paid", "Paid"] }]}
          onNew={() => setEdit({ date: today() })} empty="No vendor bills" />
      </ListPage>
    );
  }

  /* ================= Vendor Ledger ================= */
  function LedgerPage({ roleKey, can }) {
    VG.useDB();
    const [vendorId, setVendorId] = useState("");
    const ledger = vendorId ? store.vendorLedger(vendorId) : null;
    return (
      <div>
        <PageHead title="Vendor Ledger" desc="360° vendor view · purchase history · outstanding · performance" />
        <div className="mb-4 max-w-md"><Field label="Select vendor"><MasterSelect collection="suppliers" value={vendorId} onChange={setVendorId} actorRole={roleKey} can={can("add")} /></Field></div>
        {!ledger ? <Card className="p-8 text-center opacity-60">Select a vendor to view ledger, outstanding balance and performance.</Card> : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <Card className="p-4"><div className="text-[10px] uppercase opacity-50">Outstanding</div><div className="text-2xl font-bold">{inr(ledger.outstanding)}</div></Card>
              <Card className="p-4"><div className="text-[10px] uppercase opacity-50">Total purchases</div><div className="text-2xl font-bold">{inr(ledger.totalPurchases)}</div></Card>
              <Card className="p-4"><div className="text-[10px] uppercase opacity-50">Open POs</div><div className="text-2xl font-bold">{ledger.purchaseOrders.filter((p) => !["Closed", "Cancelled", "Fully Received"].includes(p.status)).length}</div></Card>
              <Card className="p-4"><div className="text-[10px] uppercase opacity-50">Delayed deliveries</div><div className="text-2xl font-bold text-rose-400">{ledger.delayedPO.length}</div></Card>
            </div>
            <RecordTable embedded suppressNew title="Purchase orders" columns={[
              { key: "no", label: "PO #" }, { key: "date", label: "Date" }, { key: "total", label: "Value", render: (r) => inr(r.total) },
              { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={PO_STATUS} /> },
            ]} rows={ledger.purchaseOrders.slice().reverse()} can={can} printTitle="Vendor PO history" searchKeys={["no"]} />
            <div className="mt-4"><RecordTable embedded suppressNew title="Pending bills" columns={[
              { key: "no", label: "Bill #" }, { key: "vendorInvoiceNo", label: "Vendor inv." }, { key: "amount", label: "Amount", render: (r) => inr(r.amount) },
              { key: "amountPaid", label: "Paid", render: (r) => inr(r.amountPaid) }, { key: "dueDate", label: "Due" },
            ]} rows={ledger.bills.filter((b) => b.status !== "Paid")} can={can} printTitle="Outstanding bills" searchKeys={["no"]} /></div>
          </>
        )}
      </div>
    );
  }

  /* ================= Approvals ================= */
  function ApprovalsPage({ roleKey, can }) {
    VG.useDB();
    const prs = store.list("purchaseRequests").filter((p) => p.status === "Pending");
    const pos = store.list("purchaseOrders").filter((p) => p.status === "Pending Approval" || p.status === "Draft");
    const bills = store.list("vendorBills").filter((b) => b.status === "Open" && !b.approvedAt);
    return (
      <ListPage title="Purchase Approvals" desc="PR · PO · Bill approval hierarchy by amount, department & role" can={can}>
        <RecordTable embedded suppressNew title="Purchase requests pending" columns={[
          { key: "no", label: "PR #" }, { key: "department", label: "Dept" }, { key: "priority", label: "Priority" },
          { key: "act", label: "Action", render: (r) => can("approve") ? (
            <div className="flex gap-1"><Button variant="soft" className="!py-1" onClick={() => { store.approvePR(r.id, roleKey); VG.toast("Approved"); }}>Approve</Button><Button variant="ghost" className="!py-1" onClick={() => store.rejectPR(r.id, roleKey)}>Reject</Button></div>
          ) : null },
        ]} rows={prs} can={can} printTitle="Pending PR approvals" />
        <div className="mt-4"><RecordTable embedded suppressNew title="POs pending approval" columns={[
          { key: "no", label: "PO #" }, { key: "supplierId", label: "Vendor", render: (r) => suppName(r.supplierId) }, { key: "total", label: "Value", render: (r) => inr(r.total) },
          { key: "act", label: "Action", render: (r) => can("approve") ? <Button variant="soft" className="!py-1" onClick={() => { store.approvePO(r.id, roleKey); VG.toast("PO approved"); }}>Approve</Button> : null },
        ]} rows={pos} can={can} printTitle="Pending PO approvals" /></div>
      </ListPage>
    );
  }

  /* ================= Reports ================= */
  function ReportsPage({ roleKey, can }) {
    VG.useDB();
    const stats = store.purchaseStats ? store.purchaseStats() : {};
    const prs = store.list("purchaseRequests"), pos = store.list("purchaseOrders"), bills = store.list("vendorBills"), grns = store.list("materialReceipts");
    const reports = [
      { n: "Purchase Register", d: "All purchase requests", rows: prs, kind: "pr" },
      { n: "Vendor Ledger Summary", d: "Outstanding by vendor", rows: store.list("suppliers").map((s) => ({ ...s, outstanding: store.vendorLedger(s.id).outstanding })), kind: "vendor" },
      { n: "Pending PO Report", d: "Orders not fully received", rows: pos.filter((x) => !["Fully Received", "Closed", "Cancelled"].includes(x.status)), kind: "po" },
      { n: "GRN Report", d: "Material receipts register", rows: grns, kind: "grn" },
      { n: "Delayed Delivery Report", d: "POs past delivery schedule", rows: pos.filter((x) => x.deliverySchedule && x.deliverySchedule < today() && !["Fully Received", "Closed"].includes(x.status)), kind: "po" },
      { n: "Tax / AP Report", d: "Open vendor bills", rows: bills.filter((b) => b.status !== "Paid"), kind: "bill" },
      { n: "Vendor Performance", d: "Supplier rating summary", rows: store.list("suppliers"), kind: "vendorPerf" },
    ];
    function print(r) {
      let body = "", head = "";
      if (r.kind === "pr") { head = "<th>PR #</th><th>Date</th><th>Dept</th><th>Status</th>"; body = r.rows.map((x) => `<tr><td>${x.no}</td><td>${x.date}</td><td>${x.department || ""}</td><td>${x.status}</td></tr>`).join(""); }
      else if (r.kind === "po") { head = "<th>PO #</th><th>Date</th><th>Vendor</th><th>Value</th><th>Status</th>"; body = r.rows.map((x) => `<tr><td>${x.no}</td><td>${x.date}</td><td>${suppName(x.supplierId)}</td><td>${inr(x.total)}</td><td>${x.status}</td></tr>`).join(""); }
      else if (r.kind === "grn") { head = "<th>GRN #</th><th>Date</th><th>PO</th><th>Status</th>"; body = r.rows.map((x) => `<tr><td>${x.no}</td><td>${x.date}</td><td>${x.poNo || ""}</td><td>${x.qcStatus || ""}</td></tr>`).join(""); }
      else if (r.kind === "bill") { head = "<th>Bill #</th><th>Vendor</th><th>Amount</th><th>Due</th>"; body = r.rows.map((x) => `<tr><td>${x.no}</td><td>${suppName(x.supplierId)}</td><td>${inr(x.amount)}</td><td>${x.dueDate || ""}</td></tr>`).join(""); }
      else if (r.kind === "vendor") { head = "<th>Vendor</th><th>Outstanding</th>"; body = r.rows.map((x) => `<tr><td>${x.name}</td><td>${inr(x.outstanding)}</td></tr>`).join(""); }
      else { head = "<th>Vendor</th><th>Rating</th><th>Category</th>"; body = r.rows.map((x) => `<tr><td>${x.name}</td><td>${x.rating || ""}</td><td>${x.vendorCategory || x.category || ""}</td></tr>`).join(""); }
      printDocument({ title: r.n, subtitle: store.company().name, inner: `<table class="vg-tbl"><thead><tr>${head}</tr></thead><tbody>${body || '<tr><td colspan=5>No data</td></tr>'}</tbody></table>` }, "preview");
    }
    return (
      <div>
        <PageHead title="Purchase Reports" desc="Register · ledger · GRN · tax · vendor performance · preview, print or PDF" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[["Pending PR", stats.pendingPR], ["Open PO", stats.poPendingApproval], ["GRN pending", stats.grnPending], ["Bills due", stats.billsPending]].map(([l, v]) => (
            <Card key={l} className="p-3"><div className="text-[10px] uppercase opacity-50">{l}</div><div className="text-xl font-bold">{v != null ? v : "—"}</div></Card>
          ))}
        </div>
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

  /* ================= Quotation entry helper ================= */
  function QuotationEntryPage({ roleKey, can }) {
    VG.useDB();
    const rfqs = store.list("rfqs").filter((r) => r.status === "Sent" || r.status === "Draft");
    const [rfqId, setRfqId] = useState("");
    const [form, setForm] = useState({ supplierId: "", leadTimeDays: 7, freight: 0, warranty: "12 months", lines: [{ itemId: "", qty: 1, rate: 0 }] });
    const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
    function save() {
      if (!rfqId || !form.supplierId) return VG.toast("Select RFQ and vendor", "error");
      store.addVendorQuotation(rfqId, form, roleKey);
      VG.toast("Quotation recorded");
      setForm({ supplierId: "", leadTimeDays: 7, freight: 0, warranty: "12 months", lines: [{ itemId: "", qty: 1, rate: 0 }] });
    }
    return (
      <ListPage title="Vendor Quotation Entry" desc="Upload vendor response against RFQ" can={can}>
        <Card className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="RFQ"><Select value={rfqId} onChange={setRfqId} options={[{ value: "", label: "Select RFQ" }].concat(rfqs.map((r) => ({ value: r.id, label: r.no })))} /></Field>
          <Field label="Vendor"><MasterSelect collection="suppliers" value={form.supplierId} onChange={(v) => set("supplierId", v)} actorRole={roleKey} can={can("add")} /></Field>
          <Field label="Lead time (days)"><Num value={form.leadTimeDays} onChange={(v) => set("leadTimeDays", v)} /></Field>
          <Field label="Freight"><Num value={form.freight} onChange={(v) => set("freight", v)} /></Field>
          <Field label="Warranty"><Text value={form.warranty} onChange={(v) => set("warranty", v)} /></Field>
          <div className="flex items-end"><Button icon="check" onClick={save}>Save quotation</Button></div>
        </Card>
      </ListPage>
    );
  }

  const SECTIONS = [
    { id: "dashboard", label: "Dashboard", icon: "chart", group: "Overview" },
    { id: "vendors", label: "Vendor Master", icon: "handshake", group: "Masters" },
    { id: "requests", label: "Purchase Request", icon: "inbox", group: "Procurement" },
    { id: "rfq", label: "RFQ", icon: "mail", group: "Procurement" },
    { id: "quotations", label: "Vendor Quotations", icon: "file", group: "Procurement" },
    { id: "comparison", label: "Vendor Comparison", icon: "grid", group: "Procurement" },
    { id: "orders", label: "Purchase Order", icon: "cart", group: "Procurement" },
    { id: "grn", label: "GRN / Receipt", icon: "download", group: "Procurement" },
    { id: "bills", label: "Vendor Bills", icon: "rupee", group: "Finance" },
    { id: "ledger", label: "Vendor Ledger", icon: "book", group: "Finance" },
    { id: "approvals", label: "Approvals", icon: "shield", group: "Workflow" },
    { id: "reports", label: "Reports", icon: "chart", group: "Reports" },
  ];
  if (VG.registerModuleSections) VG.registerModuleSections("purchase", SECTIONS);
  const PAGES = {
    dashboard: Dashboard, vendors: VendorsPage, requests: RequestsPage, rfq: RFQPage,
    quotations: QuotationEntryPage, comparison: ComparisonPage, orders: OrdersPage,
    grn: GRNPage, bills: BillsPage, ledger: LedgerPage, approvals: ApprovalsPage, reports: ReportsPage,
  };

  VG.modules = VG.modules || {};
  VG.modules.purchase = function PurchaseModule({ mod, roleKey }) {
    const can = (a) => VG.can(roleKey, a);
    const [section, setSection] = useState(() => VG.consumeSection("purchase", "dashboard"));
    const Page = PAGES[section] || Dashboard;
    const actions = [
      { label: "New request", icon: "plus", primary: true, onClick: () => setSection("requests") },
      { label: "Create RFQ", icon: "mail", onClick: () => setSection("rfq") },
      { label: "Create PO", icon: "cart", onClick: () => setSection("orders") },
      { label: "Add vendor", icon: "handshake", onClick: () => setSection("vendors") },
      { label: "Reports", icon: "chart", onClick: () => setSection("reports") },
    ];
    return (
      <VG.ModuleScaffold mod={mod} sections={SECTIONS} section={section} setSection={setSection} actions={actions} roleKey={roleKey}>
        <Page roleKey={roleKey} can={can} go={setSection} mod={mod} />
      </VG.ModuleScaffold>
    );
  };
})(window.VG);
