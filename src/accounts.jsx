/* Veraglo ERP — Accounts & Finance (functional, Invoice & payments). */
(function (VG) {
  const { useState } = React;
  const ui = VG.ui, fx = VG.fx, store = VG.store, inr = VG.fmt.inr, today = VG.fmt.todayISO;
  const { Icon, Button, Pill, Card } = ui;
  const { Field, Num, Modal, InternalScreen, RecordTable, PageHead, ListPage, StatusTag, printDocument, DocActions } = fx;

  const custName = (id) => (store.get("customers", id) || {}).name || "—";
  const INV_STATUS = { Posted: "#22d3ee", "Partially Paid": "#f59e0b", Paid: "#34d399", Cancelled: "#ef4444" };

  function invDoc(inv) {
    const fresh = inv && inv.id ? (store.get("invoices", inv.id) || inv) : inv;
    const c = VG.normalizeCustomer ? VG.normalizeCustomer(store.get("customers", fresh.customerId) || {}) : (store.get("customers", fresh.customerId) || {});
    const t = fresh.totals || {};
    const cur = fresh.currency || c.currency || "INR";
    const fmt = (n) => (VG.fmtInvoiceMoney ? VG.fmtInvoiceMoney(n, cur) : (cur === "INR" ? inr(n) : (cur + " " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 }))));
    const pt = (store.get("paymentTerms", fresh.paymentTermsId) || {}).name || "—";
    const dt = (store.get("deliveryTerms", fresh.deliveryTermsId) || {}).name || "—";
    const computeInvLine = (l) => ({ total: (Number(l.qty) || 0) * (Number(l.rate) || 0) });
    if (VG.buildIndustrialDocument) {
      const tplId = fresh.templateId || (VG.isExportInvoiceType && VG.isExportInvoiceType(fresh.invoiceType) ? "tpl2exp" : "");
      const tpl = VG.resolveDocTemplate ? VG.resolveDocTemplate("Tax Invoice", tplId) : {};
      const usePremium = tpl.themeId === "industrial" || tpl.docVariant === "export_inv" || tpl.docVariant === "quotation-international" || !fresh.templateId || (VG.isExportInvoiceType && VG.isExportInvoiceType(fresh.invoiceType));
      if (usePremium) {
        const d = VG.itemDisplay;
        const lines = d ? d.mapIndustrialLines(fresh.lines, (r) => fmt(r), (l) => fmt(computeInvLine(l).total)) : (fresh.lines || []).map((l, i) => {
          const amt = computeInvLine(l).total;
          return { no: i + 1, sku: l.sku, name: l.name, desc: l.desc, itemNameSku: `<b>${l.name || l.desc || ""}</b><br><span class="vg-muted" style="font-size:8pt">SKU: ${l.sku || ""}</span>`, hsn: l.hsn, qty: String(l.qty), unit: l.unit || "", rate: fmt(l.rate), tax: (l.taxPct || 0) + "%", amount: fmt(amt) };
        });
        return VG.buildIndustrialDocument({
          docType: "Tax Invoice",
          document: { ...fresh, customerPoRef: fresh.salesOrderNo, projectRef: fresh.salesOrderNo },
          customer: c,
          totals: t,
          paymentTerms: pt,
          deliveryTerms: dt,
          templateId: tplId || fresh.templateId,
          lines,
        });
      }
    }
    const rows = (fresh.lines || []).map((l, i) => {
      const amt = computeInvLine(l).total;
      const name = l.name || l.desc || "";
      return `<tr><td>${i + 1}</td><td><b>${name}</b><br><span style="color:#6b7280;font-size:8pt">SKU: ${l.sku || ""}</span></td><td class="vg-right">${l.qty}</td><td class="vg-right">${inr(l.rate)}</td><td class="vg-right">${inr(amt)}</td></tr>`;
    }).join("");
    const einv = fresh.eInvoice || {};
    const eway = fresh.ewayBill || {};
    const compliance = (einv.irn ? `<div class="vg-card" style="margin-top:12px"><b>E-Invoice</b><br>IRN: ${einv.irn}<br>Ack: ${einv.ackNo || "—"} · ${einv.ackDate || ""}</div>` : "") +
      (eway.no ? `<div class="vg-card" style="margin-top:12px"><b>E-Way Bill</b><br>No: ${eway.no}<br>Valid: ${eway.validFrom || ""} – ${eway.validUntil || ""}<br>Vehicle: ${eway.vehicle || "—"}</div>` : "");
    const inner = `
      <div class="vg-cols">
        <div class="vg-card"><b>Bill To</b>${custName(fresh.customerId)}<br>${fresh.billing || ""}<br>GSTIN: ${fresh.gstin || "—"}</div>
        <div class="vg-card"><b>Tax Invoice</b>No: ${fresh.no}<br>Date: ${fresh.date}<br>Due: ${fresh.dueDate || "—"}</div>
        <div class="vg-card"><b>Reference</b>SO: ${fresh.salesOrderNo || "—"}<br>Status: ${fresh.status}</div>
      </div>
      ${compliance}
      <table class="vg-tbl"><thead><tr><th>#</th><th>Item</th><th class="vg-right">Qty</th><th class="vg-right">Rate</th><th class="vg-right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="vg-totals"><div><span>Taxable</span><span>${inr(t.taxable || 0)}</span></div><div><span>GST</span><span>${inr(t.tax || 0)}</span></div><div class="grand"><span>Grand Total</span><span>${inr(t.grand || fresh.amount || 0)}</span></div><div><span>Paid</span><span>${inr(fresh.amountPaid || 0)}</span></div></div>
      <div class="vg-sign"><div>For ${store.company().name}</div></div>`;
    return { title: "Tax Invoice", subtitle: fresh.no, inner, useIntlLayout: false };
  }

  function slipDoc(slip) {
    if (VG.hrSlipDoc) return VG.hrSlipDoc(slip);
    const inner = `
      <div class="vg-cols">
        <div class="vg-card"><b>Employee</b>${slip.employeeName}<br>${slip.employeeCode}<br>${slip.department} · ${slip.designation}</div>
        <div class="vg-card"><b>Pay period</b>${slip.month}<br>Run: ${slip.payrollNo || "—"}</div>
        <div class="vg-card"><b>Attendance</b>Present: ${slip.present}<br>Leave: ${slip.leaveDays}<br>Absent: ${slip.absent}</div>
      </div>
      <table class="vg-tbl"><thead><tr><th>Earning</th><th class="vg-right">Amount</th></tr></thead>
        <tbody><tr><td>Basic</td><td class="vg-right">${inr(slip.basic)}</td></tr><tr><td>HRA</td><td class="vg-right">${inr(slip.hra)}</td></tr><tr><td>Other</td><td class="vg-right">${inr(slip.other)}</td></tr></tbody></table>
      <div class="vg-totals"><div><span>Gross</span><span>${inr(slip.gross)}</span></div><div><span>Deductions</span><span>${inr(slip.deductions)}</span></div><div class="grand"><span>Net Pay</span><span>${inr(slip.net)}</span></div></div>`;
    return { title: "Salary Slip", subtitle: slip.employeeName + " · " + slip.month, inner };
  }

  function PaymentModal({ inv, onClose, roleKey }) {
    const [amt, setAmt] = useState(Math.max(0, (Number(inv.amount) || 0) - (Number(inv.amountPaid) || 0)));
    function submit() {
      if (!(Number(amt) > 0)) return VG.toast("Enter payment amount", "error");
      store.recordPayment(inv.id, amt, roleKey);
      VG.toast("Payment recorded for " + inv.no, "success");
      onClose(true);
    }
    return (
      <Modal open onClose={() => onClose(false)} title="Record payment" subtitle={inv.no + " · Balance " + inr((inv.amount || 0) - (inv.amountPaid || 0))}
        actions={<Button icon="rupee" onClick={submit}>Post payment</Button>}>
        <Field label="Amount (₹)" required><Num value={amt} onChange={setAmt} /></Field>
      </Modal>
    );
  }

  function Dashboard(props) {
    return VG.ModuleDashboard ? <VG.ModuleDashboard modId="accounts" {...props} /> : null;
  }

  function ReceivablesPage({ roleKey, can }) {
    VG.useDB();
    const [view, setView] = useState(null);
    const [pay, setPay] = useState(null);
    const [printPick, setPrintPick] = useState(null);
    const invRowsAll = store.list("invoices").slice().reverse();
    const invRows = VG.useFilteredCustomerRows ? VG.useFilteredCustomerRows(invRowsAll) : invRowsAll;
    const toInvoice = store.list("salesOrders").filter((s) => (s.stage === "Dispatched" || s.stage === "Ready to Dispatch") && !invRows.some((i) => i.salesOrderId === s.id));
    const cols = [
      { key: "no", label: "Invoice #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "date", label: "Date" },
      { key: "salesOrderNo", label: "SO" },
      { key: "customerId", label: "Customer", render: (r) => custName(r.customerId), csv: (r) => custName(r.customerId) },
      { key: "amount", label: "Amount", render: (r) => VG.fmtInvoiceMoney ? VG.fmtInvoiceMoney(r.amount, r.currency) : inr(r.amount), csv: (r) => r.amount },
      { key: "amountPaid", label: "Paid", render: (r) => inr(r.amountPaid || 0) },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={INV_STATUS} /> },
      { key: "act", label: "Action", render: (r) => r.status !== "Paid" && can("edit") ? <Button variant="soft" className="!py-1" onClick={() => setPay(r)}>Payment</Button> : null },
    ];
    if (view) {
      const inv = store.get("invoices", view.id) || view;
      if (pay) {
        return <PaymentModal inv={pay} roleKey={roleKey} onClose={() => { setPay(null); setView(store.get("invoices", inv.id)); }} />;
      }
      return (
          <InternalScreen onBack={() => setView(null)} backLabel="Back to receivables" title={"Invoice " + inv.no} subtitle={custName(inv.customerId)}
            footer={<><DocActions build={() => invDoc(inv)} />{inv.status !== "Paid" && can("edit") && <Button icon="rupee" onClick={() => setPay(inv)}>Record payment</Button>}</>}
            breadcrumbs={[{ label: "Receivables", onClick: () => setView(null) }, { label: inv.no }]}>
            <StatusTag value={inv.status} map={INV_STATUS} />
            <div className="mt-4 text-sm grid sm:grid-cols-3 gap-3 w-full">
              <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Amount</div>{inr(inv.amount)}</Card>
              <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Paid</div>{inr(inv.amountPaid || 0)}</Card>
              <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Due</div>{inv.dueDate || "—"}</Card>
            </div>
          </InternalScreen>
      );
    }
    if (pay) {
      return <PaymentModal inv={pay} roleKey={roleKey} onClose={() => setPay(null)} />;
    }
    if (printPick && VG.InvoicePrintCopiesModal) {
      return <VG.InvoicePrintCopiesModal inv={printPick.inv} mode={printPick.mode} onClose={() => setPrintPick(null)} />;
    }
    return (
      <ListPage title="Receivables" desc="Raise tax invoices from dispatched orders and record payments" can={can}>
        {VG.CustomerFilterBanner ? <VG.CustomerFilterBanner /> : null}
        {toInvoice.length > 0 && can("add") && (
          <Card className="p-3 mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="opacity-70">Create invoice from SO:</span>
            {toInvoice.map((s) => (
              <Button key={s.id} variant="soft" className="!py-1" onClick={async () => {
                const existingInv = store.list("invoices").find((i) => i.salesOrderId === s.id && i.status !== "Cancelled");
                if (existingInv) return VG.toast("Invoice " + existingInv.no + " already exists", "warn");
                await VG.forwardDocument({
                  action: "sales_order:invoice",
                  fromType: "Sales Order", fromNo: s.no, fromId: s.id,
                  toType: "Tax Invoice", actor: roleKey,
                  run: () => {
                    const draft = store.buildInvoiceDraftFromSO ? store.buildInvoiceDraftFromSO(s.id) : null;
                    if (VG.openInvoiceBuilder && draft) { VG.openInvoiceBuilder(draft); return { id: s.id, no: "(draft opened)" }; }
                    if (draft && VG.goTo) { VG._pendingInvoiceBuild = draft; VG.goTo("sales", "invoices"); return { id: s.id, no: "(draft opened)" }; }
                    return store.createInvoiceFromSO(s.id, roleKey);
                  },
                });
              }}>{s.no} · {VG.fmtInvoiceMoney ? VG.fmtInvoiceMoney((s.totals || {}).grand, s.currency) : inr((s.totals || {}).grand)}</Button>
            ))}
          </Card>
        )}
        <RecordTable embedded suppressNew tableId="accounts-receivables" title="Invoice List" columns={cols} rows={invRows} can={can} printTitle="Invoices" searchKeys={["no", "salesOrderNo"]}
          filters={[{ key: "status", label: "All status", options: ["Posted", "Partially Paid", "Paid"] }]} onView={(r) => setView(r)} />
      </ListPage>
    );
  }

  function PaymentsPage() {
    VG.useDB();
    const rowsAll = store.list("payments").slice().reverse();
    const rows = VG.useFilteredCustomerRows ? VG.useFilteredCustomerRows(rowsAll) : rowsAll;
    return (
      <ListPage title="Payments received" can={() => true}>
        {VG.CustomerFilterBanner ? <VG.CustomerFilterBanner /> : null}
        <RecordTable embedded suppressNew title="Payment List" columns={[
          { key: "date", label: "Date" },
          { key: "invoiceNo", label: "Invoice" },
          { key: "customerId", label: "Customer", render: (r) => custName(r.customerId) },
          { key: "amount", label: "Amount", render: (r) => inr(r.amount) },
          { key: "mode", label: "Mode" },
        ]} rows={rows} can={() => true} printTitle="Payments" />
      </ListPage>
    );
  }

  function ReportsPage() {
    VG.useDB();
    const invs = store.list("invoices");
    const run = () => printDocument({ title: "Receivables ageing", subtitle: store.company().name,
      inner: `<table class="vg-tbl"><thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th>Balance</th></tr></thead><tbody>${invs.filter((i) => i.status !== "Paid").map((i) => `<tr><td>${i.no}</td><td>${custName(i.customerId)}</td><td>${i.dueDate || ""}</td><td>${inr((i.amount || 0) - (i.amountPaid || 0))}</td></tr>`).join("")}</tbody></table>` }, "preview");
    return (
      <div>
        <PageHead title="Finance Reports" />
        <Card className="p-4 flex items-center gap-4"><Icon name="chart" size={22} /><div className="flex-1 font-medium text-sm">Receivables ageing</div><Button variant="soft" onClick={run}>Open</Button></Card>
      </div>
    );
  }

  const SECTIONS = [
    { id: "dashboard", label: "Dashboard", icon: "chart", group: "Overview" },
    { id: "receivables", label: "Receivables", icon: "rupee", group: "Finance" },
    { id: "payments", label: "Payments", icon: "check", group: "Finance" },
    { id: "reports", label: "Reports", icon: "chart", group: "Reports" },
  ];
  if (VG.registerModuleSections) VG.registerModuleSections("accounts", SECTIONS);
  const PAGES = { dashboard: Dashboard, receivables: ReceivablesPage, payments: PaymentsPage, reports: ReportsPage };

  VG.modules = VG.modules || {};
  VG.modules.accounts = function AccountsModule({ mod, roleKey }) {
    const can = (a) => VG.can(roleKey, a);
    const [section, setSection] = useState(() => VG.consumeSection("accounts", "dashboard"));
    const Page = PAGES[section] || Dashboard;
    return (
      <VG.ModuleScaffold mod={mod} sections={SECTIONS} section={section} setSection={setSection} roleKey={roleKey}
        actions={[{ label: "Receivables", icon: "rupee", primary: true, onClick: () => setSection("receivables") }]}>
        <Page roleKey={roleKey} can={can} go={setSection} mod={mod} />
      </VG.ModuleScaffold>
    );
  };

  /* Expose doc builders for other modules */
  VG.accountsSlipDoc = slipDoc;
  VG.accountsInvDoc = invDoc;
})(window.VG);
