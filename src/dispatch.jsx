/* Veraglo ERP — Dispatch & Logistics (functional, SO → Shipment → Deliver). */
(function (VG) {
  const { useState } = React;
  const ui = VG.ui, fx = VG.fx, store = VG.store, inr = VG.fmt.inr, today = VG.fmt.todayISO;
  const { Icon, Button, Pill, Card } = ui;
  const { Field, Text, Area, DateF, Modal, InternalScreen, RecordTable, PageHead, ListPage, StatusTag, printDocument, DocActions } = fx;

  const custName = (id) => (store.get("customers", id) || {}).name || "—";
  const SH_STATUS = { Pending: "#f59e0b", Packing: "#a78bfa", "In-transit": "#22d3ee", Delivered: "#34d399", Cancelled: "#ef4444" };

  function shDoc(sh) {
    const inner = `
      <div class="vg-cols">
        <div class="vg-card"><b>Shipment</b>No: ${sh.no}<br>Date: ${sh.date}<br>Status: ${sh.status}</div>
        <div class="vg-card"><b>Customer</b>${custName(sh.customerId)}<br>SO: ${sh.salesOrderNo || "—"}</div>
        <div class="vg-card"><b>Logistics</b>Vehicle: ${sh.vehicle || "—"}<br>Driver: ${sh.driver || "—"}<br>E-way: ${sh.ewayBill || "—"}</div>
      </div>
      <div class="vg-terms"><b>Destination:</b> ${sh.destination || "—"}<br>${sh.dispatchDate ? "<b>Dispatched:</b> " + sh.dispatchDate : ""}${sh.deliveredDate ? " · <b>Delivered:</b> " + sh.deliveredDate : ""}</div>
      <div class="vg-sign"><div>Prepared by: <b>${sh.preparedBy || "—"}</b></div><div>Gate pass: <b>—</b></div><div>Received by: <b>${sh.podStatus || "—"}</b></div></div>`;
    return { title: "Dispatch Note / Gate Pass", subtitle: sh.no, inner };
  }

  function ShipmentForm({ open, onClose, so, roleKey }) {
    const [f, setF] = useState({ destination: (so && so.shipping) || "", vehicle: "", driver: "", ewayBill: "" });
    async function submit() {
      if (!so) return;
      const existing = store.list("shipments").find((s) => s.salesOrderId === so.id && s.status !== "Cancelled");
      await VG.forwardDocument({
        action: "sales_order:dispatch",
        fromType: "Sales Order", fromNo: so.no, fromId: so.id,
        toType: "Shipment", actor: roleKey,
        duplicate: existing ? { exists: true, no: existing.no, label: "Shipment" } : null,
        run: () => store.createShipmentFromSO(so.id, f, roleKey),
        statusChange: "Dispatch Planned",
        onDone: () => onClose(true),
      });
    }
    return (
      <Modal open={open} onClose={() => onClose(false)} size="lg" title="Create shipment" subtitle={so ? so.no + " · " + custName(so.customerId) : ""}
        actions={<Button icon="truck" onClick={submit}>Create shipment</Button>}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Destination" className="sm:col-span-2"><Text value={f.destination} onChange={(v) => setF((p) => ({ ...p, destination: v }))} /></Field>
          <Field label="Vehicle"><Text value={f.vehicle} onChange={(v) => setF((p) => ({ ...p, vehicle: v }))} /></Field>
          <Field label="Driver"><Text value={f.driver} onChange={(v) => setF((p) => ({ ...p, driver: v }))} /></Field>
          <Field label="E-way bill" className="sm:col-span-2"><Text value={f.ewayBill} onChange={(v) => setF((p) => ({ ...p, ewayBill: v }))} /></Field>
        </div>
      </Modal>
    );
  }

  function Dashboard(props) {
    return VG.ModuleDashboard ? <VG.ModuleDashboard modId="dispatch" {...props} /> : null;
  }

  function ShipmentsPage({ roleKey, can }) {
    VG.useDB();
    const [view, setView] = useState(null);
    const [createSO, setCreateSO] = useState(null);
    const rowsAll = store.list("shipments").slice().reverse();
    const rows = VG.useFilteredCustomerRows ? VG.useFilteredCustomerRows(rowsAll) : rowsAll;
    const readySOs = store.list("salesOrders").filter((s) => (s.stage === "Ready for Dispatch" || s.stage === "Dispatch Planned") && !(store.list("shipments").some((sh) => sh.salesOrderId === s.id && sh.status !== "Cancelled")));
    const qcReady = store.list("dispatchQueue").filter((q) => q.status === "Ready");
    const cols = [
      { key: "no", label: "Shipment #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "date", label: "Date" },
      { key: "salesOrderNo", label: "Sales order" },
      { key: "customerId", label: "Customer", render: (r) => custName(r.customerId), csv: (r) => custName(r.customerId) },
      { key: "destination", label: "Destination" },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={SH_STATUS} /> },
      { key: "act", label: "Action", render: (r) => (
        <div className="flex gap-1 flex-wrap">
          {(r.status === "Pending" || r.status === "Packing") && can("edit") && <Button variant="soft" className="!py-1" onClick={async () => {
            await VG.forwardStatus({
              fromType: "Shipment", fromNo: r.no, fromId: r.id, actor: roleKey,
              action: "shipment:dispatch",
              confirmMessage: "Are you sure you want to mark Shipment " + r.no + " as dispatched?",
              successMessage: "Shipment " + r.no + " dispatched successfully.",
              statusChange: "In-transit",
              run: () => store.dispatchShipment(r.id, roleKey),
            });
          }}>Dispatch</Button>}
          {r.status === "In-transit" && can("edit") && <Button variant="soft" className="!py-1" onClick={async () => {
            await VG.forwardStatus({
              fromType: "Shipment", fromNo: r.no, fromId: r.id, actor: roleKey,
              confirmMessage: "Are you sure you want to confirm delivery for Shipment " + r.no + "?",
              successMessage: "Shipment " + r.no + " marked as delivered.",
              statusChange: "Delivered",
              run: () => store.deliverShipment(r.id, roleKey),
            });
          }}>POD OK</Button>}
          {r.status === "Delivered" && <Button variant="soft" className="!py-1" onClick={() => VG.goTo("accounts", "receivables")}>Invoice</Button>}
        </div>
      ) },
    ];
    if (view) {
      return <ShipmentDetailPage view={view} onBack={() => setView(null)} roleKey={roleKey} can={can} />;
    }
    if (createSO) {
      return <ShipmentForm open so={createSO} roleKey={roleKey} onClose={() => setCreateSO(null)} />;
    }
    return (
      <ListPage title="Shipments" desc="Create from ready sales orders · dispatch · confirm delivery" can={can}>
        {VG.CustomerFilterBanner ? <VG.CustomerFilterBanner /> : null}
        {(readySOs.length > 0 || qcReady.length > 0) && can("add") && (
          <Card className="p-3 mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="opacity-70">Ready to ship:</span>
            {readySOs.map((s) => <Button key={s.id} variant="soft" className="!py-1" onClick={() => setCreateSO(s)}>{s.no}</Button>)}
            {qcReady.map((q) => <Button key={q.id} variant="soft" className="!py-1" onClick={() => {
              const so = store.get("salesOrders", q.salesOrderId);
              if (so) setCreateSO(so);
            }}>{q.workOrderNo} · QC</Button>)}
          </Card>
        )}
        <RecordTable embedded suppressNew tableId="dispatch-shipments" title="Shipment List" columns={cols} rows={rows} can={can} printTitle="Shipments" searchKeys={["no", "salesOrderNo", "destination"]}
          filters={[{ key: "status", label: "All status", options: ["Pending", "Packing", "In-transit", "Delivered"] }]}
          onView={(r) => setView(r)} empty="No shipments — create from a sales order ready to dispatch" />
      </ListPage>
    );
  }

  function ShipmentDetailPage({ view, onBack, roleKey, can }) {
    VG.useDB();
    const sh = store.get("shipments", view.id) || view;
    return (
      <InternalScreen onBack={onBack} backLabel="Back to shipments" title={"Shipment " + sh.no} subtitle={custName(sh.customerId)}
        footer={<><DocActions build={() => shDoc(sh)} />
          {(sh.status === "Pending" || sh.status === "Packing") && can("edit") && <Button icon="truck" onClick={async () => {
            await VG.forwardStatus({
              fromType: "Shipment", fromNo: sh.no, fromId: sh.id, actor: roleKey,
              confirmMessage: "Are you sure you want to mark Shipment " + sh.no + " as dispatched?",
              successMessage: "Shipment " + sh.no + " dispatched successfully.",
              statusChange: "In-transit",
              run: () => store.dispatchShipment(sh.id, roleKey),
            });
          }}>Mark dispatched</Button>}
          {sh.status === "In-transit" && can("edit") && <Button icon="check" onClick={async () => {
            await VG.forwardStatus({
              fromType: "Shipment", fromNo: sh.no, fromId: sh.id, actor: roleKey,
              confirmMessage: "Are you sure you want to confirm delivery for Shipment " + sh.no + "?",
              successMessage: "Shipment " + sh.no + " marked as delivered.",
              statusChange: "Delivered",
              run: () => store.deliverShipment(sh.id, roleKey),
            });
          }}>Confirm delivery</Button>}
        </>}>
        <StatusTag value={sh.status} map={SH_STATUS} />
        <div className="grid sm:grid-cols-3 gap-3 mt-4 text-sm">
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55">SO</div>{sh.salesOrderNo}</Card>
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Vehicle</div>{sh.vehicle || "—"}</Card>
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Destination</div>{sh.destination || "—"}</Card>
        </div>
      </InternalScreen>
    );
  }

  function DeliveryPage() {
    VG.useDB();
    const rowsAll = store.list("shipments").filter((s) => s.status === "In-transit" || s.status === "Delivered").slice().reverse();
    const rows = VG.useFilteredCustomerRows ? VG.useFilteredCustomerRows(rowsAll) : rowsAll;
    return (
      <ListPage title="Delivery tracking" desc="In-transit and completed deliveries with POD status" can={() => true}>
        {VG.CustomerFilterBanner ? <VG.CustomerFilterBanner /> : null}
        <RecordTable embedded suppressNew title="Delivery List" columns={[
          { key: "no", label: "#", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
          { key: "salesOrderNo", label: "SO" },
          { key: "customerId", label: "Customer", render: (r) => custName(r.customerId) },
          { key: "dispatchDate", label: "Dispatched" },
          { key: "deliveredDate", label: "Delivered" },
          { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={SH_STATUS} /> },
          { key: "podStatus", label: "POD" },
        ]} rows={rows} can={() => true} printTitle="Deliveries" />
      </ListPage>
    );
  }

  function ReportsPage() {
    VG.useDB();
    const ships = store.list("shipments");
    const run = (title, rows) => printDocument({ title, subtitle: store.company().name, inner: `<table class="vg-tbl"><thead><tr><th>SH</th><th>SO</th><th>Customer</th><th>Status</th></tr></thead><tbody>${rows.map((s) => `<tr><td>${s.no}</td><td>${s.salesOrderNo || ""}</td><td>${custName(s.customerId)}</td><td>${s.status}</td></tr>`).join("")}</tbody></table>` }, "preview");
    return (
      <div>
        <PageHead title="Dispatch Reports" />
        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="p-4 flex items-center gap-4"><Icon name="truck" size={22} /><div className="flex-1"><div className="font-medium text-sm">Shipment register</div></div><Button variant="soft" onClick={() => run("Shipments", ships)}>Open</Button></Card>
          <Card className="p-4 flex items-center gap-4"><Icon name="check" size={22} /><div className="flex-1"><div className="font-medium text-sm">Delivered (MTD)</div></div><Button variant="soft" onClick={() => run("Delivered", ships.filter((s) => s.status === "Delivered"))}>Open</Button></Card>
        </div>
      </div>
    );
  }

  const SECTIONS = [
    { id: "dashboard", label: "Dashboard", icon: "chart", group: "Overview" },
    { id: "shipments", label: "Shipments", icon: "truck", group: "Dispatch" },
    { id: "delivery", label: "Delivery", icon: "activity", group: "Dispatch" },
    { id: "reports", label: "Reports", icon: "chart", group: "Reports" },
  ];
  if (VG.registerModuleSections) VG.registerModuleSections("dispatch", SECTIONS);
  const PAGES = { dashboard: Dashboard, shipments: ShipmentsPage, delivery: DeliveryPage, reports: ReportsPage };

  VG.modules = VG.modules || {};
  VG.modules.dispatch = function DispatchModule({ mod, roleKey }) {
    const can = (a) => VG.can(roleKey, a);
    const [section, setSection] = useState(() => VG.consumeSection("dispatch", "dashboard"));
    const Page = PAGES[section] || Dashboard;
    return (
      <VG.ModuleScaffold mod={mod} sections={SECTIONS} section={section} setSection={setSection} roleKey={roleKey}
        actions={[{ label: "New shipment", icon: "truck", primary: true, onClick: () => setSection("shipments") }]}>
        <Page roleKey={roleKey} can={can} go={setSection} mod={mod} />
      </VG.ModuleScaffold>
    );
  };
})(window.VG);
