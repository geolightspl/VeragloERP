/* Veraglo ERP — Industrial Dispatch Module (packing, labels, challan, tracking) */
(function (VG) {
  const { useState, useMemo } = React;
  const ui = VG.ui, fx = VG.fx, store = VG.store, today = VG.fmt.todayISO;
  const { Icon, Button, Pill, Card } = ui;
  const { Field, Text, Area, Num, Select, Modal, InternalScreen, RecordTable, PageHead, ListPage, StatusTag, printDocument, DocActions } = fx;
  const ENG = VG.DISPATCH_ENGINE || {};
  const custName = (id) => (store.get("customers", id) || {}).name || "—";
  const SH_STATUS = {
    "Ready for Dispatch": "#06b6d4", Pending: "#f59e0b", Packing: "#a78bfa", Packed: "#818cf8",
    "In-transit": "#22d3ee", "In Transit": "#22d3ee", Delivered: "#34d399", Closed: "#94a3b8", Cancelled: "#ef4444",
  };
  const PL_STATUS = { Draft: "#94a3b8", Approved: "#6366f1", "Packing in Progress": "#a78bfa", Packed: "#818cf8", Dispatched: "#22d3ee", Closed: "#34d399" };
  const TRACK_STATUS = ["Ready for Dispatch", "Packing in Progress", "Packed", "Dispatched", "In Transit", "Delivered", "Partially Delivered", "Returned", "Damaged in Transit", "Closed"];
  const PKG_TYPES = ["Box", "Wooden Crate", "Pallet", "Carton", "Bundle", "Drum", "Other"];
  const TRANSPORT_MODES = ["Road", "Air", "Sea", "Courier", "Hand Delivery"];

  function Dashboard(props) {
    return VG.ModuleDashboard ? <VG.ModuleDashboard modId="dispatch" {...props} /> : null;
  }

  function ReadyForDispatchPage({ roleKey, can, go }) {
    VG.useDB();
    const rows = store.listDispatchReadyRows ? store.listDispatchReadyRows().filter((r) => (r.balanceQty || 0) > 0) : [];
    const [plModal, setPlModal] = useState(null);
    return (
      <ListPage title="Ready for Dispatch" desc="QC-accepted finished goods cleared for packing and dispatch" can={can}>
        <RecordTable embedded suppressNew tableId="dispatch-ready" title="Ready for Dispatch" printTitle="Ready for Dispatch"
          columns={[
            { key: "salesOrderNo", label: "SO" }, { key: "workOrderNo", label: "WO" },
            { key: "customerName", label: "Customer" }, { key: "projectName", label: "Project" },
            { key: "sku", label: "SKU" }, { key: "itemDescription", label: "Description" },
            { key: "orderedQty", label: "Ordered" }, { key: "producedQty", label: "Produced" },
            { key: "qcAcceptedQty", label: "QC OK" }, { key: "alreadyDispatchedQty", label: "Dispatched" },
            { key: "balanceQty", label: "Balance" }, { key: "dispatchPriority", label: "Priority" },
            { key: "deliveryDate", label: "Delivery" }, { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={SH_STATUS} /> },
            { key: "act", label: "", render: (r) => can("add") ? <>
              <Button variant="soft" className="!py-1 mr-1" onClick={() => setPlModal(r)}>Packing list</Button>
              {go && <Button variant="ghost" className="!py-1" onClick={() => go("create")}>Dispatch</Button>}
            </> : null },
          ]} rows={rows} can={can} empty="No QC-accepted goods ready — complete final inspection first" />
        {plModal && (
          <Modal open title="Create Packing List" onClose={() => setPlModal(null)} footer={<Button onClick={() => {
            const res = store.createPackingList({ dispatchQueueId: plModal.id, salesOrderId: plModal.salesOrderId, packingQty: plModal.balanceQty }, roleKey);
            if (!res || !res.ok) return VG.toast((res && res.reason) || "Cannot create packing list", "error");
            VG.toast("Packing list " + res.record.no + " created");
            setPlModal(null);
            go && go("packing");
          }}>Create packing list</Button>}>
            <div className="text-sm space-y-2">
              <div>SO: <b>{plModal.salesOrderNo}</b> · WO: <b>{plModal.workOrderNo}</b></div>
              <div>Customer: {plModal.customerName} · Balance qty: <b>{plModal.balanceQty}</b></div>
            </div>
          </Modal>
        )}
      </ListPage>
    );
  }

  function PendingDispatchPage({ can, go }) {
    VG.useDB();
    const pendingPL = store.list("dispatchPackingLists").filter((p) => p.status === "Draft" || p.status === "Packing in Progress");
    const pendingSh = store.list("shipments").filter((s) => ["Ready for Dispatch", "Pending", "Packing", "Packed"].includes(s.status));
    const pendingTransport = store.list("shipments").filter((s) => s.status === "Packed" && !s.vehicle);
    return (
      <div className="space-y-6">
        <PageHead title="Dispatch Pending" desc="Packing lists, transport details and confirmations awaiting action" />
        <RecordTable embedded suppressNew title="Pending packing lists" columns={[
          { key: "no", label: "PL #" }, { key: "salesOrderNo", label: "SO" }, { key: "customerName", label: "Customer" },
          { key: "packingQty", label: "Qty" }, { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={PL_STATUS} /> },
          { key: "act", label: "", render: (r) => <Button variant="soft" className="!py-1" onClick={() => go && go("packing")}>Open</Button> },
        ]} rows={pendingPL} can={can} empty="No pending packing lists" />
        <RecordTable embedded suppressNew title="Pending dispatch confirmation" columns={[
          { key: "no", label: "Dispatch #" }, { key: "salesOrderNo", label: "SO" }, { key: "packingListNo", label: "PL" },
          { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={SH_STATUS} /> },
          { key: "act", label: "", render: (r) => <Button variant="soft" className="!py-1" onClick={() => go && go("create")}>Open</Button> },
        ]} rows={pendingSh} can={can} empty="No pending dispatches" />
        <RecordTable embedded suppressNew title="Pending transport details" columns={[
          { key: "no", label: "#" }, { key: "salesOrderNo", label: "SO" }, { key: "destination", label: "Destination" },
          { key: "act", label: "", render: (r) => <Button variant="soft" className="!py-1" onClick={() => go && go("transport")}>Add transport</Button> },
        ]} rows={pendingTransport} can={can} empty="All packed shipments have transport details" />
      </div>
    );
  }

  function PackingListPage({ roleKey, can, go }) {
    VG.useDB();
    const [view, setView] = useState(null);
    const [edit, setEdit] = useState(null);
    const rows = store.list("dispatchPackingLists").slice().reverse();
    if (view) {
      const pl = store.get("dispatchPackingLists", view.id) || view;
      return (
        <InternalScreen onBack={() => setView(null)} title={"Packing List " + pl.no} subtitle={pl.customerName}
          footer={<>
            <DocActions build={() => ENG.buildPackingListPdf ? ENG.buildPackingListPdf(pl) : { title: pl.no, subtitle: "", inner: "" }} docType="Packing List" />
            {can("edit") && pl.status === "Draft" && <Button variant="soft" onClick={() => setEdit(pl)}>Edit</Button>}
            {can("approve") && pl.status === "Draft" && <Button onClick={() => { store.approvePackingList(pl.id, roleKey); VG.toast("Approved"); setView(store.get("dispatchPackingLists", pl.id)); }}>Approve</Button>}
            {can("add") && (pl.status === "Approved" || pl.status === "Draft") && <Button icon="truck" onClick={() => {
              const res = store.createDispatchFromPackingList(pl.id, {}, roleKey);
              if (!res || !res.ok) return VG.toast((res && res.reason) || "Cannot create dispatch", "error");
              VG.toast("Dispatch " + res.record.no + " created");
              go && go("create");
            }}>Create dispatch</Button>}
          </>}>
          <StatusTag value={pl.status} map={PL_STATUS} />
          <div className="grid sm:grid-cols-3 gap-3 mt-4 text-sm">
            <Card className="p-3"><div className="text-[11px] uppercase opacity-55">SO / WO</div>{pl.salesOrderNo} · {pl.workOrderNo || "—"}</Card>
            <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Delivery</div>{pl.deliveryLocation || "—"}</Card>
            <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Boxes</div>{pl.totalBoxes || (pl.packages || []).length}</Card>
          </div>
          <div className="mt-4"><RecordTable embedded suppressNew title="Items" columns={[
            { key: "sr", label: "Sr" }, { key: "sku", label: "SKU" }, { key: "name", label: "Item" },
            { key: "packingQty", label: "Pack Qty" }, { key: "boxNo", label: "Box" }, { key: "batch", label: "Batch" },
          ]} rows={pl.items || []} can={can} /></div>
        </InternalScreen>
      );
    }
    if (edit) return <PackingListEditor pl={edit} roleKey={roleKey} can={can} onClose={() => setEdit(null)} onSaved={(pl) => { setEdit(null); setView(pl); }} />;
    return (
      <ListPage title="Packing Lists" desc="Generate and approve packing lists before dispatch" can={can}>
        {can("add") && <div className="mb-3"><Button icon="plus" onClick={() => go && go("ready")}>From ready list</Button></div>}
        <RecordTable embedded suppressNew tableId="dispatch-pl" title="Packing List Register" printTitle="Packing List Register"
          columns={[
            { key: "no", label: "PL #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
            { key: "date", label: "Date" }, { key: "salesOrderNo", label: "SO" }, { key: "customerName", label: "Customer" },
            { key: "packingQty", label: "Qty" }, { key: "totalBoxes", label: "Boxes" },
            { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={PL_STATUS} /> },
          ]} rows={rows} can={can} onView={(r) => setView(r)} empty="Create packing lists from Ready for Dispatch" />
      </ListPage>
    );
  }

  function PackingListEditor({ pl, roleKey, can, onClose, onSaved }) {
    const [f, setF] = useState(() => ({ ...pl, items: (pl.items || []).map((x) => ({ ...x })), packages: (pl.packages || []).map((x) => ({ ...x })), exportDetails: pl.exportDetails || {} }));
    const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
    const setExport = (k, v) => setF((p) => ({ ...p, exportDetails: { ...(p.exportDetails || {}), [k]: v } }));
    function patchItem(i, k, v) {
      setF((p) => {
        const items = (p.items || []).slice();
        items[i] = { ...items[i], [k]: v };
        return { ...p, items };
      });
    }
    function patchPkg(i, k, v) {
      setF((p) => {
        const packages = (p.packages || []).slice();
        packages[i] = { ...packages[i], [k]: v };
        return { ...p, totalBoxes: packages.length, items: (p.items || []).map((it) => ({ ...it, boxNo: it.boxNo || packages[0] && packages[0].boxNo || "1" })) };
      });
    }
    function addPackage() {
      setF((p) => {
        const n = String(((p.packages || []).length) + 1);
        const packages = (p.packages || []).concat([{
          boxNo: n, packageType: "Box", description: "", length: "", width: "", height: "",
          dimUnit: "cm", netWeight: "", grossWeight: "", weightUnit: "kg", volume: "",
          fragile: false, thisSideUp: false, stackable: true, hazardous: false, handlingInstructions: "", remarks: "",
        }]);
        return { ...p, packages, totalBoxes: packages.length };
      });
    }
    function save() {
      store.savePackingList(f.id, { ...f, totalBoxes: (f.packages || []).length }, roleKey);
      VG.toast("Packing list saved");
      onSaved && onSaved(store.get("dispatchPackingLists", f.id));
    }
    return (
      <InternalScreen onBack={onClose} title={"Edit " + f.no} footer={can("edit") ? <Button icon="check" onClick={save}>Save</Button> : null}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Dispatch from"><Text value={f.dispatchFrom} onChange={(v) => set("dispatchFrom", v)} /></Field>
          <Field label="Delivery location" className="sm:col-span-2"><Text value={f.deliveryLocation} onChange={(v) => set("deliveryLocation", v)} /></Field>
          <Field label="Contact person"><Text value={f.deliveryContact} onChange={(v) => set("deliveryContact", v)} /></Field>
          <Field label="Contact phone"><Text value={f.deliveryPhone} onChange={(v) => set("deliveryPhone", v)} /></Field>
          <Field label="Contact email"><Text value={f.deliveryEmail} onChange={(v) => set("deliveryEmail", v)} /></Field>
          <Field label="Transport mode"><Select value={f.transportMode || "Road"} onChange={(v) => set("transportMode", v)} options={TRANSPORT_MODES.map((x) => ({ value: x, label: x }))} /></Field>
          <Field label="Transporter"><Text value={f.transporterName} onChange={(v) => set("transporterName", v)} /></Field>
          <Field label="Vehicle no."><Text value={f.vehicleNo} onChange={(v) => set("vehicleNo", v)} /></Field>
          <Field label="LR/GR"><Text value={f.lrGrNo} onChange={(v) => set("lrGrNo", v)} /></Field>
          <Field label="E-way bill"><Text value={f.ewayBillNo} onChange={(v) => set("ewayBillNo", v)} /></Field>
          <Field label="Invoice no."><Text value={f.invoiceNo} onChange={(v) => set("invoiceNo", v)} /></Field>
          <Field label="Checked by"><Text value={f.checkedBy} onChange={(v) => set("checkedBy", v)} /></Field>
          <Field label="Remarks" className="sm:col-span-2"><Area value={f.remarks} onChange={(v) => set("remarks", v)} rows={2} /></Field>
        </div>
        <div className="mt-6">
          <div className="text-sm font-semibold mb-2">Packing items</div>
          <RecordTable embedded suppressNew title="Items" columns={[
            { key: "sr", label: "Sr" }, { key: "sku", label: "SKU" },
            { key: "packingQty", label: "Pack Qty", render: (r) => { const i = (f.items || []).indexOf(r); return <Num className="!w-20" value={r.packingQty} onChange={(v) => patchItem(i, "packingQty", v)} />; } },
            { key: "boxNo", label: "Box", render: (r) => { const i = (f.items || []).indexOf(r); return <Text className="!w-16" value={r.boxNo} onChange={(v) => patchItem(i, "boxNo", v)} />; } },
            { key: "packageType", label: "Pkg", render: (r) => { const i = (f.items || []).indexOf(r); return <Select className="!w-28" value={r.packageType || "Box"} onChange={(v) => patchItem(i, "packageType", v)} options={PKG_TYPES.map((x) => ({ value: x, label: x }))} />; } },
            { key: "batch", label: "Batch", render: (r) => { const i = (f.items || []).indexOf(r); return <Text className="!w-24" value={r.batch} onChange={(v) => patchItem(i, "batch", v)} />; } },
            { key: "netWeight", label: "Net Wt", render: (r) => { const i = (f.items || []).indexOf(r); return <Text className="!w-20" value={r.netWeight} onChange={(v) => patchItem(i, "netWeight", v)} />; } },
            { key: "grossWeight", label: "Gross Wt", render: (r) => { const i = (f.items || []).indexOf(r); return <Text className="!w-20" value={r.grossWeight} onChange={(v) => patchItem(i, "grossWeight", v)} />; } },
          ]} rows={f.items || []} can={can} />
        </div>
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-sm font-semibold">Packages</div>
            {can("edit") && <Button variant="soft" className="!py-1" onClick={addPackage}>Add box</Button>}
          </div>
          <RecordTable embedded suppressNew title="Package details" columns={[
            { key: "boxNo", label: "Box" }, { key: "packageType", label: "Type", render: (r) => { const i = (f.packages || []).indexOf(r); return <Select className="!w-28" value={r.packageType || "Box"} onChange={(v) => patchPkg(i, "packageType", v)} options={PKG_TYPES.map((x) => ({ value: x, label: x }))} />; } },
            { key: "description", label: "Description", render: (r) => { const i = (f.packages || []).indexOf(r); return <Text value={r.description} onChange={(v) => patchPkg(i, "description", v)} />; } },
            { key: "dims", label: "L×W×H", render: (r) => { const i = (f.packages || []).indexOf(r); return <div className="flex gap-1"><Text className="!w-12" value={r.length} onChange={(v) => patchPkg(i, "length", v)} /><Text className="!w-12" value={r.width} onChange={(v) => patchPkg(i, "width", v)} /><Text className="!w-12" value={r.height} onChange={(v) => patchPkg(i, "height", v)} /></div>; } },
            { key: "netWeight", label: "Net", render: (r) => { const i = (f.packages || []).indexOf(r); return <Text className="!w-16" value={r.netWeight} onChange={(v) => patchPkg(i, "netWeight", v)} />; } },
            { key: "grossWeight", label: "Gross", render: (r) => { const i = (f.packages || []).indexOf(r); return <Text className="!w-16" value={r.grossWeight} onChange={(v) => patchPkg(i, "grossWeight", v)} />; } },
            { key: "flags", label: "Flags", render: (r) => { const i = (f.packages || []).indexOf(r); return <div className="flex gap-2 text-[10px]"><label><input type="checkbox" checked={!!r.fragile} onChange={(e) => patchPkg(i, "fragile", e.target.checked)} /> Fragile</label><label><input type="checkbox" checked={!!r.thisSideUp} onChange={(e) => patchPkg(i, "thisSideUp", e.target.checked)} /> ↑</label></div>; } },
          ]} rows={f.packages || []} can={can} />
        </div>
        <Card className="p-4 mt-6">
          <div className="text-sm font-semibold mb-3">Export dispatch (optional)</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Port of loading"><Text value={(f.exportDetails || {}).portOfLoading || ""} onChange={(v) => setExport("portOfLoading", v)} /></Field>
            <Field label="Port of discharge"><Text value={(f.exportDetails || {}).portOfDischarge || ""} onChange={(v) => setExport("portOfDischarge", v)} /></Field>
            <Field label="Final destination"><Text value={(f.exportDetails || {}).finalDestination || ""} onChange={(v) => setExport("finalDestination", v)} /></Field>
            <Field label="Incoterms"><Text value={(f.exportDetails || {}).incoterms || ""} onChange={(v) => setExport("incoterms", v)} /></Field>
            <Field label="Container no."><Text value={(f.exportDetails || {}).containerNo || ""} onChange={(v) => setExport("containerNo", v)} /></Field>
            <Field label="Shipping bill no."><Text value={(f.exportDetails || {}).shippingBillNo || ""} onChange={(v) => setExport("shippingBillNo", v)} /></Field>
          </div>
        </Card>
      </InternalScreen>
    );
  }

  function CreateDispatchPage({ roleKey, can }) {
    VG.useDB();
    const [view, setView] = useState(null);
    const rows = store.list("shipments").filter((s) => s.status !== "Cancelled" && s.status !== "Closed").slice().reverse();
    const cols = [
      { key: "no", label: "Dispatch #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "date", label: "Date" }, { key: "packingListNo", label: "PL" }, { key: "salesOrderNo", label: "SO" },
      { key: "customerName", label: "Customer", render: (r) => r.customerName || custName(r.customerId) },
      { key: "dispatchQty", label: "Qty" }, { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={SH_STATUS} /> },
      { key: "act", label: "", render: (r) => (
        <div className="flex gap-1 flex-wrap">
          {(r.status === "Ready for Dispatch" || r.status === "Pending" || r.status === "Packed") && can("edit") && (
            <Button variant="soft" className="!py-1" onClick={async () => {
              await VG.forwardStatus({
                fromType: "Dispatch", fromNo: r.no, fromId: r.id, actor: roleKey,
                confirmMessage: "Confirm dispatch of " + r.no + "? Stock will be deducted.",
                successMessage: r.no + " dispatched.",
                statusChange: "In-transit",
                run: () => store.dispatchShipment(r.id, roleKey),
              });
            }}>Confirm dispatch</Button>
          )}
        </div>
      ) },
    ];
    if (view) return <DispatchDetail view={view} onBack={() => setView(null)} roleKey={roleKey} can={can} />;
    return (
      <ListPage title="Create Dispatch" desc="Confirm dispatch, deduct stock, and generate delivery challan" can={can}>
        <RecordTable embedded suppressNew tableId="dispatch-create" title="Dispatch Records" columns={cols} rows={rows} can={can}
          onView={(r) => setView(r)} empty="Create dispatch from an approved packing list" />
      </ListPage>
    );
  }

  function DispatchDetail({ view, onBack, roleKey, can }) {
    VG.useDB();
    const sh = store.get("shipments", view.id) || view;
    const pl = sh.packingListId ? store.get("dispatchPackingLists", sh.packingListId) : null;
    const ch = sh.challanId ? store.get("deliveryChallans", sh.challanId) : null;
    return (
      <InternalScreen onBack={onBack} title={"Dispatch " + sh.no} subtitle={sh.salesOrderNo}
        footer={<>
          <DocActions build={() => ENG.buildDispatchSlipPdf ? ENG.buildDispatchSlipPdf(sh, pl) : { title: sh.no, subtitle: "", inner: "" }} docType="Delivery Challan" />
          {ch && <DocActions build={() => ENG.buildDeliveryChallanPdf ? ENG.buildDeliveryChallanPdf(ch, pl, sh) : { title: ch.no, subtitle: "", inner: "" }} docType="Delivery Challan" />}
        </>}>
        <StatusTag value={sh.status} map={SH_STATUS} />
        <div className="grid sm:grid-cols-3 gap-3 mt-4 text-sm">
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Customer</div>{sh.customerName || custName(sh.customerId)}</Card>
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Packing list</div>{sh.packingListNo || "—"}</Card>
          <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Challan</div>{sh.challanNo || "—"}</Card>
        </div>
      </InternalScreen>
    );
  }

  function LabelsPage({ roleKey, can }) {
    VG.useDB();
    const [plId, setPlId] = useState("");
    const [boxNo, setBoxNo] = useState("1");
    const [size, setSize] = useState((store.settings().dispatch || {}).defaultLabelSize || "A5");
    const pls = store.list("dispatchPackingLists").filter((p) => p.status !== "Draft");
    const pl = plId ? store.get("dispatchPackingLists", plId) : null;
    const boxes = pl ? (pl.packages || [{ boxNo: "1" }]) : [];
    function printBox(b, reprint) {
      if (!pl || !ENG.buildBoxLabelPdf) return;
      store.recordLabelPrint(pl.id, b.boxNo, size, reprint, roleKey);
      printDocument(ENG.buildBoxLabelPdf(pl, b, { size, reprint }), "preview");
    }
    return (
      <div>
        <PageHead title="Dispatch Slip / Box Labels" desc="Print shipment labels for boxes — A4, A5, 4×6 or custom" />
        <Card className="p-4 mb-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Packing list"><Select value={plId} onChange={setPlId} options={[{ value: "", label: "Select…" }].concat(pls.map((p) => ({ value: p.id, label: p.no + " · " + p.salesOrderNo })))} /></Field>
          <Field label="Box no."><Select value={boxNo} onChange={setBoxNo} options={boxes.map((b) => ({ value: String(b.boxNo), label: "Box " + b.boxNo }))} /></Field>
          <Field label="Label size"><Select value={size} onChange={setSize} options={Object.keys(ENG.LABEL_SIZES || { A4: 1, A5: 1, "4x6": 1 }).map((k) => ({ value: k, label: k }))} /></Field>
          <div className="flex items-end gap-2">
            {can("print") && <Button icon="print" disabled={!pl} onClick={() => printBox(boxes.find((b) => String(b.boxNo) === String(boxNo)) || { boxNo }, false)}>Print label</Button>}
            {can("print") && <Button variant="soft" disabled={!pl} onClick={() => printBox(boxes.find((b) => String(b.boxNo) === String(boxNo)) || { boxNo }, true)}>Reprint</Button>}
          </div>
        </Card>
        {pl && can("print") && (
          <Card className="p-4">
            <div className="text-sm font-semibold mb-2">Print all box labels ({boxes.length})</div>
            <Button variant="soft" onClick={() => boxes.forEach((b) => printBox(b, false))}>Print all boxes</Button>
          </Card>
        )}
        <div className="mt-6"><RecordTable embedded suppressNew title="Label print history" columns={[
          { key: "date", label: "Date" }, { key: "packingListNo", label: "PL" }, { key: "boxNo", label: "Box" },
          { key: "labelSize", label: "Size" }, { key: "reprint", label: "Reprint", render: (r) => r.reprint ? "Yes" : "No" }, { key: "printedBy", label: "By" },
        ]} rows={store.list("dispatchLabelPrints").slice().reverse().slice(0, 50)} can={can} /></div>
      </div>
    );
  }

  function ChallanPage({ roleKey, can }) {
    VG.useDB();
    const rows = store.list("deliveryChallans").slice().reverse();
    return (
      <ListPage title="Delivery Challan" desc="GST delivery challans linked to dispatch records" can={can}>
        <RecordTable embedded suppressNew title="Delivery Challan Register" columns={[
          { key: "no", label: "Challan #" }, { key: "date", label: "Date" }, { key: "salesOrderNo", label: "SO" },
          { key: "customerName", label: "Customer" }, { key: "vehicleNo", label: "Vehicle" }, { key: "status", label: "Status" },
          { key: "act", label: "", render: (r) => {
            const sh = store.get("shipments", r.shipmentId);
            const pl = r.packingListId ? store.get("dispatchPackingLists", r.packingListId) : null;
            return <DocActions build={() => ENG.buildDeliveryChallanPdf ? ENG.buildDeliveryChallanPdf(r, pl, sh) : { title: r.no, subtitle: "", inner: "" }} docType="Delivery Challan" />;
          } },
        ]} rows={rows} can={can} printTitle="Delivery Challan Register" empty="Challans generate on dispatch confirmation" />
      </ListPage>
    );
  }

  function TransportPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const [f, setF] = useState({});
    const rows = store.list("shipments").filter((s) => !["Delivered", "Closed", "Cancelled"].includes(s.status)).slice().reverse();
    function open(r) { setEdit(r); setF({ transportMode: r.transportMode || "Road", transporterName: r.transporterName || "", vehicle: r.vehicle || "", driver: r.driver || "", driverMobile: r.driverMobile || "", lrGrNo: r.lrGrNo || "", courierDocket: r.courierDocket || "", freightPaidBy: r.freightPaidBy || "Seller", freightAmount: r.freightAmount || 0, ewayBill: r.ewayBill || "", ewayValidity: r.ewayValidity || "", trackingNo: r.trackingNo || "", transporterLink: r.transporterLink || "", expectedDeliveryDate: r.expectedDeliveryDate || "" }); }
    function save() {
      store.updateShipmentTracking(edit.id, f, roleKey);
      VG.toast("Transport details saved");
      setEdit(null);
    }
    return (
      <ListPage title="Transport Details" desc="Vehicle, driver, LR/GR, courier and freight information" can={can}>
        <RecordTable embedded suppressNew title="Shipments — transport" columns={[
          { key: "no", label: "#" }, { key: "salesOrderNo", label: "SO" }, { key: "transporterName", label: "Transporter" },
          { key: "vehicle", label: "Vehicle" }, { key: "driver", label: "Driver" }, { key: "lrGrNo", label: "LR/GR" },
          { key: "act", label: "", render: (r) => can("edit") ? <Button variant="soft" className="!py-1" onClick={() => open(r)}>Edit</Button> : null },
        ]} rows={rows} can={can} empty="No open shipments" />
        {edit && (
          <Modal open title={"Transport — " + edit.no} onClose={() => setEdit(null)} footer={<Button onClick={save}>Save</Button>}>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Mode"><Select value={f.transportMode} onChange={(v) => setF((p) => ({ ...p, transportMode: v }))} options={TRANSPORT_MODES.map((x) => ({ value: x, label: x }))} /></Field>
              <Field label="Transporter"><Text value={f.transporterName} onChange={(v) => setF((p) => ({ ...p, transporterName: v }))} /></Field>
              <Field label="Vehicle"><Text value={f.vehicle} onChange={(v) => setF((p) => ({ ...p, vehicle: v }))} /></Field>
              <Field label="Driver"><Text value={f.driver} onChange={(v) => setF((p) => ({ ...p, driver: v }))} /></Field>
              <Field label="Driver mobile"><Text value={f.driverMobile} onChange={(v) => setF((p) => ({ ...p, driverMobile: v }))} /></Field>
              <Field label="LR/GR"><Text value={f.lrGrNo} onChange={(v) => setF((p) => ({ ...p, lrGrNo: v }))} /></Field>
              <Field label="Courier docket"><Text value={f.courierDocket} onChange={(v) => setF((p) => ({ ...p, courierDocket: v }))} /></Field>
              <Field label="Freight paid by"><Select value={f.freightPaidBy} onChange={(v) => setF((p) => ({ ...p, freightPaidBy: v }))} options={["Seller", "Buyer", "To Pay"].map((x) => ({ value: x, label: x }))} /></Field>
              <Field label="Freight amount"><Num value={f.freightAmount} onChange={(v) => setF((p) => ({ ...p, freightAmount: v }))} /></Field>
              <Field label="E-way bill"><Text value={f.ewayBill} onChange={(v) => setF((p) => ({ ...p, ewayBill: v }))} /></Field>
              <Field label="E-way validity"><Text value={f.ewayValidity} onChange={(v) => setF((p) => ({ ...p, ewayValidity: v }))} /></Field>
              <Field label="Tracking no."><Text value={f.trackingNo} onChange={(v) => setF((p) => ({ ...p, trackingNo: v }))} /></Field>
              <Field label="Portal link"><Text value={f.transporterLink} onChange={(v) => setF((p) => ({ ...p, transporterLink: v }))} /></Field>
              <Field label="Expected delivery"><Text value={f.expectedDeliveryDate} onChange={(v) => setF((p) => ({ ...p, expectedDeliveryDate: v }))} /></Field>
            </div>
          </Modal>
        )}
      </ListPage>
    );
  }

  function TrackingPage({ roleKey, can }) {
    VG.useDB();
    const [pod, setPod] = useState(null);
    const [pf, setPf] = useState({ receiverName: "", receiverMobile: "", deliveryRemarks: "", podUpload: "" });
    const rows = store.list("shipments").slice().reverse();
    return (
      <ListPage title="Shipment Tracking" desc="Track in-transit deliveries and record POD" can={can}>
        <RecordTable embedded suppressNew title="Shipment Tracking" printTitle="Shipment Tracking" columns={[
          { key: "no", label: "#" }, { key: "salesOrderNo", label: "SO" }, { key: "customerName", label: "Customer", render: (r) => r.customerName || custName(r.customerId) },
          { key: "trackingStatus", label: "Tracking", render: (r) => <StatusTag value={r.trackingStatus || r.status} map={SH_STATUS} /> },
          { key: "dispatchDate", label: "Dispatched" }, { key: "expectedDeliveryDate", label: "ETA" }, { key: "actualDeliveryDate", label: "Delivered" },
          { key: "act", label: "", render: (r) => (
            <div className="flex gap-1">
              {r.status === "In-transit" && can("edit") && <Button variant="soft" className="!py-1" onClick={() => { setPod(r); setPf({ receiverName: "", receiverMobile: "", deliveryRemarks: "" }); }}>POD</Button>}
              {can("edit") && <Select value={r.trackingStatus || r.status} onChange={(v) => store.updateShipmentTracking(r.id, { trackingStatus: v, status: v === "Delivered" ? "Delivered" : r.status }, roleKey)} options={TRACK_STATUS.map((x) => ({ value: x, label: x }))} />}
            </div>
          ) },
        ]} rows={rows} can={can} empty="No shipments yet" />
        {pod && (
          <Modal open title={"POD — " + pod.no} onClose={() => setPod(null)} footer={<Button onClick={() => {
            store.deliverShipment(pod.id, pf, roleKey);
            VG.toast("Delivery confirmed");
            setPod(null);
          }}>Confirm delivery</Button>}>
            <div className="grid gap-3">
              <Field label="Receiver name"><Text value={pf.receiverName} onChange={(v) => setPf((p) => ({ ...p, receiverName: v }))} /></Field>
              <Field label="Receiver mobile"><Text value={pf.receiverMobile} onChange={(v) => setPf((p) => ({ ...p, receiverMobile: v }))} /></Field>
              <Field label="POD reference / upload"><Text value={pf.podUpload} onChange={(v) => setPf((p) => ({ ...p, podUpload: v }))} placeholder="File ref or note" /></Field>
              <Field label="Delivery remarks"><Area value={pf.deliveryRemarks} onChange={(v) => setPf((p) => ({ ...p, deliveryRemarks: v }))} rows={2} /></Field>
            </div>
          </Modal>
        )}
      </ListPage>
    );
  }

  function DocumentsPage({ roleKey, can }) {
    VG.useDB();
    const [shId, setShId] = useState("");
    const [docType, setDocType] = useState("Packing list");
    const [docRef, setDocRef] = useState("");
    const ships = store.list("shipments").slice().reverse();
    const docs = store.list("dispatchDocuments").slice().reverse();
    const DOC_TYPES = ["Packing list", "Invoice", "Delivery challan", "E-way bill", "LR/GR copy", "POD", "Insurance", "Transport receipt", "QC report", "Customer instruction", "Box photo", "Other"];
    return (
      <div>
        <PageHead title="Dispatch Documents" desc="Upload and link packing lists, challans, POD, e-way bills and photos" />
        <Card className="p-4 mb-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Shipment"><Select value={shId} onChange={setShId} options={[{ value: "", label: "Select…" }].concat(ships.map((s) => ({ value: s.id, label: s.no + " · " + s.salesOrderNo })))} /></Field>
          <Field label="Document type"><Select value={docType} onChange={setDocType} options={DOC_TYPES.map((x) => ({ value: x, label: x }))} /></Field>
          <Field label="Reference / file note"><Text value={docRef} onChange={setDocRef} /></Field>
          {can("add") && <div className="flex items-end"><Button disabled={!shId || !docRef} onClick={() => {
            store.saveDispatchDocument(shId, { type: docType, ref: docRef, name: docRef }, roleKey);
            setDocRef("");
            VG.toast("Document linked");
          }}>Attach</Button></div>}
        </Card>
        <RecordTable embedded suppressNew title="Document register" columns={[
          { key: "date", label: "Date", render: (r) => r.uploadedAt ? new Date(r.uploadedAt).toLocaleDateString("en-IN") : "—" },
          { key: "shipmentNo", label: "Shipment" }, { key: "type", label: "Type" }, { key: "name", label: "Reference" }, { key: "uploadedBy", label: "By" },
        ]} rows={docs} can={can} empty="No documents uploaded" />
      </div>
    );
  }

  function SettingsPage({ roleKey, can }) {
    VG.useDB();
    const s = store.settings().dispatch || {};
    const [f, setF] = useState({ ...s });
    const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
    function save() {
      if (!can("settings")) return VG.toast("No permission", "error");
      store.saveAdminSettings({ dispatch: f }, roleKey);
      VG.toast("Dispatch settings saved");
    }
    return (
      <div>
        <PageHead title="Dispatch Settings" desc="Workflow gates, label defaults and stock rules" />
        <Card className="p-4 grid sm:grid-cols-2 gap-3 max-w-3xl">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.requireQcBeforeDispatch !== false} onChange={(e) => set("requireQcBeforeDispatch", e.target.checked)} /> Require QC acceptance before dispatch</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.requireInvoiceBeforeDispatch} onChange={(e) => set("requireInvoiceBeforeDispatch", e.target.checked)} /> Require invoice before dispatch</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.autoDeductStockOnConfirm !== false} onChange={(e) => set("autoDeductStockOnConfirm", e.target.checked)} /> Auto deduct stock on dispatch confirm</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.autoGenerateChallan !== false} onChange={(e) => set("autoGenerateChallan", e.target.checked)} /> Auto generate delivery challan</label>
          <Field label="Default dispatch from"><Text value={f.defaultDispatchFrom || ""} onChange={(v) => set("defaultDispatchFrom", v)} /></Field>
          <Field label="Default label size"><Select value={f.defaultLabelSize || "A5"} onChange={(v) => set("defaultLabelSize", v)} options={["A4", "A5", "4x6", "Custom"].map((x) => ({ value: x, label: x }))} /></Field>
          {can("settings") && <div className="sm:col-span-2"><Button icon="check" onClick={save}>Save settings</Button></div>}
        </Card>
      </div>
    );
  }

  function ReportsPage({ can }) {
    VG.useDB();
    const ships = store.list("shipments");
    const pls = store.list("dispatchPackingLists");
    const queue = store.list("dispatchQueue");
    const labels = store.list("dispatchLabelPrints");
    const reports = [
      { n: "Dispatch register", rows: ships },
      { n: "Packing list register", rows: pls },
      { n: "Pending dispatch", rows: queue.filter((q) => q.status === "Ready" || q.status === "Partially Dispatched") },
      { n: "Partially dispatched", rows: ships.filter((s) => s.status === "Partially Dispatched" || s.trackingStatus === "Partially Delivered") },
      { n: "Delivered shipments", rows: ships.filter((s) => s.status === "Delivered") },
      { n: "In transit", rows: ships.filter((s) => s.status === "In-transit") },
      { n: "Box label print history", rows: labels },
      { n: "POD pending", rows: ships.filter((s) => s.status === "In-transit" && !s.podUpload) },
    ];
    function open(r) {
      printDocument({
        title: r.n, subtitle: store.company().name,
        inner: "<table class='vg-tbl'><thead><tr><th>#</th><th>SO</th><th>Customer/Ref</th><th>Status</th></tr></thead><tbody>"
          + (r.rows || []).slice(0, 200).map((x) => "<tr><td>" + (x.no || x.id) + "</td><td>" + (x.salesOrderNo || "") + "</td><td>" + (x.customerName || x.sku || "") + "</td><td>" + (x.status || "") + "</td></tr>").join("")
          + "</tbody></table>",
      }, "preview");
    }
    return (
      <div>
        <PageHead title="Dispatch Reports" desc="Registers, pending dispatch, transporter and export reports" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {reports.map((r) => (
            <Card key={r.n} className="p-4 flex items-center gap-3">
              <Icon name="chart" size={20} />
              <div className="flex-1"><div className="font-medium text-sm">{r.n}</div><div className="text-[11px] opacity-55">{(r.rows || []).length} records</div></div>
              <Button variant="soft" onClick={() => open(r)}>Open</Button>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const SECTIONS = [
    { id: "dashboard", label: "Dashboard", icon: "chart", group: "Overview" },
    { id: "pending", label: "Dispatch Pending", icon: "inbox", group: "Operations" },
    { id: "ready", label: "Ready for Dispatch", icon: "check", group: "Operations" },
    { id: "packing", label: "Packing List", icon: "box", group: "Operations" },
    { id: "create", label: "Create Dispatch", icon: "truck", group: "Operations" },
    { id: "labels", label: "Dispatch Slip / Box Label", icon: "print", group: "Documents" },
    { id: "challan", label: "Delivery Challan", icon: "file", group: "Documents" },
    { id: "transport", label: "Transport Details", icon: "activity", group: "Logistics" },
    { id: "tracking", label: "Shipment Tracking", icon: "truck", group: "Logistics" },
    { id: "documents", label: "Dispatch Documents", icon: "folder", group: "Documents" },
    { id: "reports", label: "Reports", icon: "chart", group: "Reports" },
    { id: "settings", label: "Settings", icon: "settings", group: "Admin" },
  ];
  if (VG.registerModuleSections) VG.registerModuleSections("dispatch", SECTIONS);

  const PAGES = {
    dashboard: Dashboard, pending: PendingDispatchPage, ready: ReadyForDispatchPage, packing: PackingListPage,
    create: CreateDispatchPage, labels: LabelsPage, challan: ChallanPage, transport: TransportPage,
    tracking: TrackingPage, documents: DocumentsPage, reports: ReportsPage, settings: SettingsPage,
  };

  VG.modules = VG.modules || {};
  VG.modules.dispatch = function DispatchModule({ mod, roleKey }) {
    const can = (a) => VG.can(roleKey, a);
    const [section, setSection] = useState(() => VG.consumeSection("dispatch", "dashboard"));
    const Page = PAGES[section] || Dashboard;
    return (
      <VG.ModuleScaffold mod={mod} sections={SECTIONS} section={section} setSection={setSection} roleKey={roleKey}
        actions={[
          { label: "Ready for dispatch", icon: "check", onClick: () => setSection("ready") },
          { label: "Create packing list", icon: "box", primary: true, perm: "add", onClick: () => setSection("ready") },
        ]}>
        <Page roleKey={roleKey} can={can} go={setSection} mod={mod} />
      </VG.ModuleScaffold>
    );
  };
})(window.VG);
