/* Veraglo ERP — Universal workflow action shortcuts for list/grid pages */
(function (VG) {
  const { useState } = React;
  const ui = VG.ui;
  const { Icon, Button } = ui;
  const store = VG.store;
  const today = VG.fmt.todayISO;

  function wfPerm(can, perm) {
    if (!perm) return true;
    return can && can(perm);
  }

  function wfLinked(source, linked, opts) {
    opts = opts || {};
    const srcRev = Number(source[opts.sourceRevField || "rev"] || 0);
    if (!linked) return { exists: false, stale: false, linked: null };
    const linkRev = Number(linked[opts.linkRevField || "sourceQuotationRev"] ?? 0);
    const stale = !!linked.sourceRevised || linkRev < srcRev;
    return { exists: true, stale, linked, upToDate: !stale };
  }

  function wfAct(opts) {
    return {
      id: opts.id || opts.label,
      label: opts.label,
      icon: opts.icon,
      variant: opts.variant || "soft",
      primary: !!opts.primary,
      disabled: !!opts.disabled,
      title: opts.title || "",
      show: opts.show !== false,
      perm: opts.perm,
      onClick: opts.onClick,
    };
  }

  function WorkflowActions({ actions, can, maxVisible = 3, className = "" }) {
    const [open, setOpen] = useState(false);
    const list = (actions || []).filter((a) => a.show !== false && wfPerm(can, a.perm));
    if (!list.length) return <span className="text-xs opacity-40">—</span>;
    const primary = list.filter((a) => a.primary).concat(list.filter((a) => !a.primary)).slice(0, maxVisible);
    const overflow = list.filter((a) => !primary.includes(a));
    function run(a, e) {
      e && e.stopPropagation();
      if (a.disabled) return;
      setOpen(false);
      a.onClick && a.onClick(a);
    }
    return (
      <div className={"flex flex-wrap gap-1 items-center " + className} onClick={(e) => e.stopPropagation()}>
        {primary.map((a) => (
          <Button key={a.id} variant={a.variant || "soft"} className="!py-1 !px-2 !text-[11px]" icon={a.icon}
            disabled={a.disabled} title={a.title || a.label} onClick={(e) => run(a, e)}>{a.label}</Button>
        ))}
        {overflow.length > 0 && (
          <div className="relative">
            <Button variant="ghost" className="!py-1 !px-2 !text-[11px]" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>More ▾</Button>
            {open && (
              <div className="absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-lg border border-white/10 glass shadow-xl py-1">
                {overflow.map((a) => (
                  <button key={a.id} type="button" disabled={a.disabled} title={a.title || a.label}
                    className={"w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-40 " + (a.disabled ? "cursor-not-allowed" : "")}
                    onClick={(e) => run(a, e)}>{a.label}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function wfColumn(getActions, opts) {
    opts = opts || {};
    return {
      key: opts.key || "act",
      label: opts.label || "Actions",
      thClass: opts.thClass || "min-w-[220px]",
      tdClass: opts.tdClass || "",
      render: (r) => React.createElement(WorkflowActions, {
        actions: getActions(r),
        can: opts.can,
        maxVisible: opts.maxVisible != null ? opts.maxVisible : 3,
      }),
    };
  }

  const workflow = {
    linked: wfLinked,
    act: wfAct,

    quotation(q, ctx) {
      if (!q) return [];
      const { roleKey, can, onView, onEdit, onRefresh, quotationPDF, quotationEmailOffer, quotationConvertPayload, ensureSOFromQuotation, computeQuote } = ctx;
      const qRev = q.rev || 0;
      const pi = store.list("proformas").find((p) => p.quotationId === q.id);
      const so = store.list("salesOrders").find((o) => o.quotationId === q.id);
      const piLink = wfLinked(q, pi, { linkRevField: "sourceQuotationRev" });
      const soLink = wfLinked(q, so, { linkRevField: "sourceQuotationRev" });
      const canConvert = q.status === "Approved" || q.status === "Sent" || q.status === "Won";
      const acts = [];
      if (onView) acts.push(wfAct({ id: "view", label: "View", icon: "eye", perm: "view", onClick: () => onView(q) }));
      if (onEdit && can("edit")) acts.push(wfAct({ id: "edit", label: "Edit", icon: "edit", perm: "edit", onClick: () => onEdit(q) }));
      if (can("print")) {
        acts.push(wfAct({ id: "print", label: "Print", icon: "print", perm: "print", onClick: () => quotationPDF && quotationPDF(q, "print") }));
        acts.push(wfAct({ id: "pdf", label: "PDF", icon: "download", perm: "print", onClick: () => quotationPDF && quotationPDF(q, "download") }));
      }
      acts.push(wfAct({ id: "email", label: "Email", icon: "message", onClick: () => quotationEmailOffer && quotationEmailOffer(q, roleKey, onRefresh) }));
      if (piLink.exists && piLink.upToDate) {
        acts.push(wfAct({ id: "view-pi", label: "View PI", icon: "file", onClick: () => { VG._pendingProformaView = pi.id; VG.goTo && VG.goTo("sales", "proformas"); } }));
        acts.push(wfAct({ id: "gen-pi", label: "Gen PI", icon: "rupee", perm: "add", disabled: true, title: "Proforma " + pi.no + " exists", onClick: () => {} }));
      } else if (canConvert && can("add")) {
        acts.push(wfAct({
          id: "gen-pi", label: piLink.exists ? "Update PI" : "Gen PI", icon: "rupee", perm: "add",
          onClick: async () => {
            if (piLink.exists && pi) {
              const ok = await VG.confirmForward({ title: "Forward revision", message: "Update Proforma " + pi.no + " to latest quotation revision?" });
              if (!ok) return;
              store.update("proformas", pi.id, { ...(quotationConvertPayload ? quotationConvertPayload(q, roleKey) : {}), sourceQuotationRev: qRev, sourceRevised: false }, roleKey);
              VG.toast("Proforma updated");
              onRefresh && onRefresh();
              return;
            }
            await VG.forwardDocument({
              action: "quotation:proforma", fromType: "Quotation", fromNo: q.no, fromId: q.id,
              toType: "Proforma Invoice", actor: roleKey,
              run: () => store.create("proformas", {
                no: store.nextNo("PI", today()), date: today(), quotationId: q.id,
                ...(quotationConvertPayload ? quotationConvertPayload(q, roleKey) : {}),
                status: "Issued", by: roleKey, sourceQuotationRev: qRev,
              }, roleKey),
              onDone: onRefresh,
            });
          },
        }));
      }
      if (soLink.exists && soLink.upToDate) {
        acts.push(wfAct({ id: "view-so", label: "View SO", icon: "file", onClick: () => { VG._pendingSalesOrderView = so.id; VG.goTo && VG.goTo("sales", "orders"); } }));
        acts.push(wfAct({ id: "gen-so", label: "Gen SO", icon: "chevronRight", perm: "add", disabled: true, title: "Sales Order " + so.no + " exists", onClick: () => {} }));
      } else if (canConvert && can("add")) {
        acts.push(wfAct({
          id: "gen-so", label: soLink.exists ? "Update SO" : "Gen SO", icon: "chevronRight", perm: "add",
          onClick: async () => {
            if (soLink.exists && so) {
              const ok = await VG.confirmForward({ title: "Forward revision", message: "Update Sales Order " + so.no + " to latest quotation revision?" });
              if (!ok) return;
              store.update("salesOrders", so.id, { ...(quotationConvertPayload ? quotationConvertPayload(q, roleKey) : {}), sourceQuotationRev: qRev, sourceRevised: false }, roleKey);
              VG.toast("Sales Order updated");
              onRefresh && onRefresh();
              return;
            }
            await VG.forwardDocument({
              action: "quotation:sales_order", fromType: "Quotation", fromNo: q.no, fromId: q.id,
              toType: "Sales Order", actor: roleKey,
              run: () => {
                const order = ensureSOFromQuotation ? ensureSOFromQuotation(q, roleKey) : null;
                if (order) store.update("quotations", q.id, { status: "Won" }, roleKey);
                return order;
              },
              onDone: onRefresh,
            });
          },
        }));
      }
      if (can("add")) acts.push(wfAct({
        id: "clone", label: "Clone", icon: "copy", perm: "add",
        onClick: () => {
          const payload = { ...q, lines: (q.lines || []).map((l) => ({ ...l })), rev: 0, status: "Draft", clonedFrom: q.id, date: today() };
          delete payload.id;
          const n = store.create("quotations", { ...payload, no: store.nextNo("QT", today()) }, roleKey);
          VG.toast("Cloned as " + n.no);
          onRefresh && onRefresh();
        },
      }));
      acts.push(wfAct({
        id: "history", label: "History", icon: "activity",
        title: (q.revisionHistory || []).length + " revision entries",
        onClick: () => { onView ? onView(q) : VG.toast((q.revisionHistory || []).length ? "Open quotation for revision history" : "No revisions yet"); },
      }));
      return acts;
    },

    salesOrder(so, ctx) {
      const { roleKey, can, onView, onRefresh, advance, makeProforma, findProformaFromSO, findInvoiceFromSO, findShipmentFromSO, findWOFromSO } = ctx;
      if (!so) return [];
      const stage = so.stage || so.status;
      const pi = findProformaFromSO ? findProformaFromSO(so) : null;
      const inv = findInvoiceFromSO ? findInvoiceFromSO(so) : null;
      const sh = findShipmentFromSO ? findShipmentFromSO(so) : null;
      const wo = findWOFromSO ? findWOFromSO(so) : null;
      const acts = [];
      if (onView) acts.push(wfAct({ id: "view", label: "View", icon: "eye", onClick: () => onView(so) }));
      if (!pi && can("add")) acts.push(wfAct({ id: "pi", label: "Gen PI", icon: "rupee", perm: "add", onClick: () => makeProforma && makeProforma(so) }));
      else if (pi) acts.push(wfAct({ id: "view-pi", label: "View PI", icon: "file", onClick: () => { VG._pendingProformaView = pi.id; VG.goTo && VG.goTo("sales", "proformas"); } }));
      if ((stage === "Created / Saved") && can("approve") && !wo) acts.push(wfAct({
        id: "prod", label: "To Production", icon: "factory", perm: "approve",
        onClick: async () => {
          await VG.forwardDocument({
            action: "sales_order:production", fromType: "Sales Order", fromNo: so.no, fromId: so.id,
            toType: "Work Order", actor: roleKey,
            run: () => store.sendSalesOrderToProduction(so.id, roleKey),
            statusChange: "Sent to Production",
            onDone: onRefresh,
          });
        },
      }));
      if (wo) acts.push(wfAct({ id: "view-wo", label: "View WO", icon: "factory", onClick: () => { VG._pendingWorkOrderView = wo.id; VG.goTo && VG.goTo("production", "orders"); } }));
      if (!inv && can("add") && ["Partially Dispatched", "Ready for Dispatch", "Fully Dispatched", "Dispatch Planned", "QC Accepted"].includes(stage)) acts.push(wfAct({
        id: "inv", label: "Invoice", icon: "rupee", perm: "add",
        onClick: async () => {
          await VG.forwardDocument({
            action: "sales_order:invoice", fromType: "Sales Order", fromNo: so.no, fromId: so.id,
            toType: "Tax Invoice", actor: roleKey,
            run: () => {
              if (VG.openInvoiceBuilder) { const d = store.buildInvoiceDraftFromSO(so.id); if (d) VG.openInvoiceBuilder(d); return d ? { no: "(draft)" } : null; }
              return store.createInvoiceFromSO(so.id, roleKey);
            },
            onDone: onRefresh,
          });
        },
      }));
      else if (inv) acts.push(wfAct({ id: "view-inv", label: "View Inv", icon: "file", onClick: () => { VG._pendingInvoiceView = inv.id; VG.goTo && VG.goTo("sales", "invoices"); } }));
      if (sh) acts.push(wfAct({ id: "dispatch", label: "Dispatch", icon: "truck", onClick: () => VG.goTo && VG.goTo("dispatch", "tracking") }));
      else if (can("add") && ["Ready for Dispatch", "Dispatch Planned"].includes(stage)) acts.push(wfAct({
        id: "ship", label: "Shipment", icon: "truck", perm: "add",
        onClick: async () => {
          await VG.forwardDocument({
            action: "sales_order:dispatch", fromType: "Sales Order", fromNo: so.no, fromId: so.id,
            toType: "Shipment", actor: roleKey,
            run: () => store.createShipmentFromSO(so.id, { destination: so.shipping }, roleKey),
            onDone: onRefresh,
          });
        },
      }));
      if (so.status !== "Closed" && can("edit") && advance) acts.push(wfAct({ id: "advance", label: "Advance", icon: "chevronRight", perm: "edit", onClick: () => advance(so) }));
      return acts;
    },

    proforma(p, ctx) {
      const { roleKey, can, onView, onEdit, proformaPDF } = ctx;
      if (!p) return [];
      const so = store.list("salesOrders").find((o) => o.id === p.orderId || (p.quotationId && o.quotationId === p.quotationId));
      const inv = so ? store.list("invoices").find((i) => i.salesOrderId === so.id && i.status !== "Cancelled") : null;
      const q = p.quotationId ? store.get("quotations", p.quotationId) : null;
      const stale = q && wfLinked(q, p, { linkRevField: "sourceQuotationRev" }).stale;
      const acts = [];
      if (onView) acts.push(wfAct({ id: "view", label: "View", icon: "eye", onClick: () => onView(p) }));
      if (onEdit && can("edit")) acts.push(wfAct({ id: "edit", label: "Edit", icon: "edit", perm: "edit", onClick: () => onEdit(p) }));
      if (can("print")) {
        acts.push(wfAct({ id: "print", label: "Print", icon: "print", perm: "print", onClick: () => proformaPDF && proformaPDF(p, "print") }));
        acts.push(wfAct({ id: "pdf", label: "PDF", icon: "download", perm: "print", onClick: () => proformaPDF && proformaPDF(p, "download") }));
      }
      if (!so && can("add")) acts.push(wfAct({
        id: "gen-so", label: "Gen SO", icon: "chevronRight", perm: "add",
        onClick: async () => {
          await VG.forwardDocument({
            action: "proforma:sales_order", fromType: "Proforma Invoice", fromNo: p.no, fromId: p.id,
            toType: "Sales Order", actor: roleKey,
            run: () => store.create("salesOrders", {
              no: store.nextNo("SO", today()), date: today(), customerId: p.customerId,
              billing: p.billing, shipping: p.shipping, gstin: p.gstin, currency: p.currency || "INR",
              lines: p.lines, totals: p.totals, proformaId: p.id, status: "Created / Saved", stage: "Created / Saved", by: roleKey,
            }, roleKey),
          });
        },
      }));
      else if (so) acts.push(wfAct({ id: "view-so", label: "View SO", icon: "file", onClick: () => { VG._pendingSalesOrderView = so.id; VG.goTo && VG.goTo("sales", "orders"); } }));
      if (!inv && so && can("add")) acts.push(wfAct({
        id: "gen-inv", label: "Tax Invoice", icon: "rupee", perm: "add", disabled: !!stale, title: stale ? "Update proforma from revised quotation first" : "",
        onClick: async () => {
          await VG.forwardDocument({
            action: "sales_order:invoice", fromType: "Sales Order", fromNo: so.no, fromId: so.id,
            toType: "Tax Invoice", actor: roleKey,
            run: () => store.createInvoiceFromSO(so.id, roleKey),
          });
        },
      }));
      return acts;
    },

    enquiry(e, ctx) {
      const { roleKey, can, onView, onEdit, onQuote, onFollowup, onWon, onLost, onEmail } = ctx;
      if (!e) return [];
      const acts = [];
      if (onView) acts.push(wfAct({ id: "view", label: "View", icon: "eye", onClick: () => onView(e) }));
      if (onEdit && can("edit")) acts.push(wfAct({ id: "edit", label: "Edit", icon: "edit", perm: "edit", onClick: () => onEdit(e) }));
      if (can("add") && onQuote) acts.push(wfAct({ id: "quote", label: "Quotation", icon: "file", perm: "add", onClick: () => onQuote(e) }));
      if (can("edit") && onFollowup) acts.push(wfAct({ id: "followup", label: "Follow-up", icon: "bell", perm: "edit", onClick: () => onFollowup(e) }));
      if (can("edit") && e.status !== "Won / Converted to Sales Order" && onWon) acts.push(wfAct({ id: "won", label: "Won", icon: "check", perm: "edit", onClick: () => onWon(e) }));
      if (can("edit") && e.status !== "Lost" && onLost) acts.push(wfAct({ id: "lost", label: "Lost", icon: "x", perm: "edit", onClick: () => onLost(e) }));
      if (onEmail) acts.push(wfAct({ id: "email", label: "Email", icon: "message", onClick: () => onEmail(e) }));
      if (onView) acts.push(wfAct({ id: "history", label: "History", icon: "activity", onClick: () => onView(e) }));
      return acts;
    },

    workOrder(wo, ctx) {
      const { roleKey, can, onView, onComplete, onRefresh } = ctx;
      if (!wo) return [];
      const acts = [];
      if (onView) acts.push(wfAct({ id: "view", label: "View", icon: "eye", onClick: () => onView(wo) }));
      if (can("print")) acts.push(wfAct({ id: "print", label: "Print", icon: "print", perm: "print", onClick: () => onView && onView(wo) }));
      if (wo.revisionPendingAck && can("edit")) acts.push(wfAct({ id: "ack", label: "Ack Rev", perm: "edit", onClick: () => { store.acknowledgeWorkOrderRevision(wo.id, roleKey); onRefresh && onRefresh(); VG.toast("Revision acknowledged"); } }));
      if (["Received from Sales", "BOM Pending", "Planned"].includes(wo.status) && can("edit")) acts.push(wfAct({ id: "accept", label: "Accept", perm: "edit", onClick: () => { store.acceptWorkOrder(wo.id, roleKey); onRefresh && onRefresh(); VG.toast("WO accepted"); } }));
      if (!wo.bomId && can("edit")) acts.push(wfAct({ id: "bom", label: "BOM", perm: "edit", onClick: () => VG.goTo && VG.goTo("production", "bom") }));
      if (!wo.materialRequirementId && can("edit")) acts.push(wfAct({ id: "mr", label: "Plan MR", perm: "edit", onClick: () => { const mr = store.planMaterialRequirement(wo.id, { priority: wo.priority }, roleKey); if (mr) VG.toast("MR " + mr.no); onRefresh && onRefresh(); } }));
      if (["Material Fully Issued", "Production Planned", "Released", "Running", "Production In Progress"].includes(wo.status) && can("edit")) acts.push(wfAct({ id: "start", label: "Start", perm: "edit", onClick: () => { store.update("workOrders", wo.id, { status: "Production In Progress" }, roleKey); onRefresh && onRefresh(); } }));
      if (["Production In Progress", "Released", "Running"].includes(wo.status) && can("edit") && onComplete) acts.push(wfAct({ id: "complete", label: "Complete", perm: "edit", onClick: () => onComplete(wo) }));
      if (wo.status === "Completed") acts.push(wfAct({ id: "fg", label: "FG Store", icon: "box", onClick: () => VG.goTo && VG.goTo("inventory", "transfer") }));
      if (wo.status === "Completed") acts.push(wfAct({ id: "dispatch", label: "Dispatch", icon: "truck", onClick: () => VG.goTo && VG.goTo("dispatch", "ready") }));
      return acts;
    },

    shipment(sh, ctx) {
      const { roleKey, can, onView, onRefresh } = ctx;
      if (!sh) return [];
      const pl = sh.packingListId ? store.get("dispatchPackingLists", sh.packingListId) : null;
      const queue = (store.listDispatchReadyRows && store.listDispatchReadyRows().find((q) => q.salesOrderId === sh.salesOrderId)) || null;
      const acts = [];
      if (onView) acts.push(wfAct({ id: "view", label: "View", icon: "eye", onClick: () => onView && onView(sh) }));
      if (!pl && queue && can("add")) acts.push(wfAct({
        id: "pl", label: "Packing list", icon: "box", perm: "add",
        onClick: () => {
          const res = store.createPackingList({ dispatchQueueId: queue.id, salesOrderId: sh.salesOrderId, packingQty: queue.balanceQty }, roleKey);
          if (res && res.ok) VG.toast("PL " + res.record.no + " created");
          else VG.toast((res && res.reason) || "Cannot create PL", "error");
          onRefresh && onRefresh();
        },
      }));
      if (pl && can("print")) acts.push(wfAct({ id: "print-pl", label: "Print PL", icon: "print", perm: "print", onClick: () => { VG.goTo && VG.goTo("dispatch", "packing"); } }));
      if (pl && can("print")) acts.push(wfAct({ id: "labels", label: "Labels", icon: "print", perm: "print", onClick: () => { VG.goTo && VG.goTo("dispatch", "labels"); } }));
      if (["Ready for Dispatch", "Pending", "Packed"].includes(sh.status) && can("edit")) acts.push(wfAct({
        id: "dispatch", label: "Dispatch", icon: "truck", perm: "edit",
        onClick: async () => {
          await VG.forwardStatus({
            fromType: "Dispatch", fromNo: sh.no, fromId: sh.id, actor: roleKey,
            confirmMessage: "Confirm dispatch of " + sh.no + "? Stock will be deducted.",
            run: () => store.dispatchShipment(sh.id, roleKey),
            onDone: onRefresh,
          });
        },
      }));
      if (sh.status === "In-transit" && can("edit")) acts.push(wfAct({ id: "pod", label: "POD", icon: "check", perm: "edit", onClick: () => { VG.goTo && VG.goTo("dispatch", "tracking"); } }));
      if (sh.challanNo) acts.push(wfAct({ id: "challan", label: "Challan", icon: "file", onClick: () => VG.goTo && VG.goTo("dispatch", "challan") }));
      if (!["Closed", "Cancelled", "Delivered"].includes(sh.status) && can("edit")) acts.push(wfAct({
        id: "close", label: "Close", perm: "edit",
        onClick: async () => {
          const ok = await VG.confirm({ title: "Close dispatch " + sh.no + "?", confirmLabel: "Close" });
          if (ok) { store.closeDispatch(sh.id, roleKey); onRefresh && onRefresh(); }
        },
      }));
      return acts;
    },

    grn(r, ctx) {
      const { roleKey, can, onView, receiptDoc, onRefresh } = ctx;
      const insp = (store.list("qcInspections") || []).find((i) => i.grnId === r.id || i.receiptId === r.id);
      const acts = [];
      if (onView) acts.push(wfAct({ id: "view", label: "View", icon: "eye", onClick: () => onView && onView(r) }));
      if (can("print")) acts.push(wfAct({ id: "print", label: "Print GRN", icon: "print", perm: "print", onClick: () => receiptDoc && VG.fx.printDocument(receiptDoc(r), "preview") }));
      if (!insp && r.qcStatus === "Pending" && can("add")) acts.push(wfAct({
        id: "qc-start", label: "Incoming QC", perm: "add",
        onClick: () => { VG.goTo && VG.goTo("quality", "incoming"); VG.toast("Create incoming inspection for GRN " + r.no); },
      }));
      if (insp) acts.push(wfAct({ id: "qc-view", label: "QC Report", onClick: () => VG.goTo && VG.goTo("quality", "incoming") }));
      if (can("approve") && r.qcStatus === "Pending") {
        acts.push(wfAct({ id: "accept", label: "Accept", perm: "approve", onClick: () => { store.update("materialReceipts", r.id, { qcStatus: "Passed", qtyAccepted: r.qtyReceived }, roleKey); onRefresh && onRefresh(); } }));
        acts.push(wfAct({ id: "hold", label: "Hold", perm: "approve", onClick: () => { store.update("materialReceipts", r.id, { qcStatus: "Pending", hold: true }, roleKey); onRefresh && onRefresh(); } }));
        acts.push(wfAct({ id: "reject", label: "Reject", perm: "approve", onClick: () => { store.update("materialReceipts", r.id, { qcStatus: "Failed" }, roleKey); onRefresh && onRefresh(); } }));
      }
      return acts;
    },

    materialIssue(m, ctx) {
      const { can, onView, issueChallanPDF } = ctx;
      const wo = m.workOrderId ? store.get("workOrders", m.workOrderId) : null;
      const acts = [];
      if (onView) acts.push(wfAct({ id: "view", label: "View", icon: "eye", onClick: () => onView && onView(m) }));
      if (can("print")) acts.push(wfAct({ id: "print", label: "Print", icon: "print", perm: "print", onClick: () => issueChallanPDF && issueChallanPDF(m, "preview") }));
      acts.push(wfAct({ id: "ledger", label: "Ledger", icon: "chart", onClick: () => VG.goTo && VG.goTo("inventory", "ledger") }));
      if (wo) acts.push(wfAct({ id: "wo", label: "View WO", icon: "factory", onClick: () => { VG._pendingWorkOrderView = wo.id; VG.goTo && VG.goTo("production", "orders"); } }));
      return acts;
    },

    qcIncoming(insp, ctx) {
      const { can, onInspect } = ctx;
      const acts = [];
      acts.push(wfAct({ id: "inspect", label: "Inspect", icon: "check", onClick: () => onInspect && onInspect(insp) }));
      if (insp.status === "Pending" && can("approve")) {
        acts.push(wfAct({ id: "approve", label: "Approve", perm: "approve", onClick: () => onInspect && onInspect(insp) }));
        acts.push(wfAct({ id: "reject", label: "Reject", perm: "approve", onClick: () => onInspect && onInspect(insp) }));
        acts.push(wfAct({ id: "hold", label: "Hold", perm: "approve", onClick: () => onInspect && onInspect(insp) }));
      }
      if (can("add")) acts.push(wfAct({ id: "ncr", label: "NCR", perm: "add", onClick: () => VG.goTo && VG.goTo("quality", "ncr") }));
      if (can("print")) acts.push(wfAct({ id: "report", label: "Report", icon: "print", perm: "print", onClick: () => onInspect && onInspect(insp) }));
      return acts;
    },

    qcInProcess(insp, ctx) {
      const { can, onInspect } = ctx;
      const acts = [];
      acts.push(wfAct({ id: "inspect", label: "Inspect", onClick: () => onInspect && onInspect(insp) }));
      if (insp.status === "Pending" && can("edit")) acts.push(wfAct({ id: "observe", label: "Observe", perm: "edit", onClick: () => onInspect && onInspect(insp) }));
      if (can("approve") && insp.status === "Pending") acts.push(wfAct({ id: "approve", label: "Approve", perm: "approve", onClick: () => onInspect && onInspect(insp) }));
      if (can("edit") && insp.status === "Pending") acts.push(wfAct({ id: "rework", label: "Rework", perm: "edit", onClick: () => onInspect && onInspect(insp) }));
      if (can("print")) acts.push(wfAct({ id: "report", label: "Report", icon: "print", perm: "print", onClick: () => onInspect && onInspect(insp) }));
      return acts;
    },

    qcFinal(q, ctx) {
      const { can, onInspect, roleKey, onRefresh } = ctx;
      const acts = [];
      acts.push(wfAct({ id: "inspect", label: "Inspect", onClick: () => onInspect && onInspect(q) }));
      if (q.status === "Pending Inspection" && can("approve")) acts.push(wfAct({
        id: "release", label: "Release", perm: "approve",
        onClick: () => onInspect && onInspect(q),
      }));
      if (q.status === "Accepted" && can("add")) acts.push(wfAct({
        id: "dispatch", label: "To Dispatch", perm: "add",
        onClick: () => { VG.goTo && VG.goTo("dispatch", "ready"); VG.toast("QC accepted — ready for dispatch"); },
      }));
      if (can("print")) acts.push(wfAct({ id: "fat", label: "FAT Report", icon: "print", perm: "print", onClick: () => onInspect && onInspect(q) }));
      return acts;
    },

    purchasePO(po, ctx) {
      const { roleKey, can, onView, onRefresh } = ctx;
      const grn = (store.list("materialReceipts") || []).find((g) => g.purchaseOrderId === po.id);
      const acts = [];
      if (onView) acts.push(wfAct({ id: "view", label: "View", icon: "eye", onClick: () => onView && onView(po) }));
      if (can("print")) acts.push(wfAct({ id: "print", label: "Print PO", icon: "print", perm: "print", onClick: () => onView && onView(po) }));
      if (po.status === "Draft" && can("edit")) acts.push(wfAct({ id: "submit", label: "Submit", perm: "edit", onClick: () => { store.submitPO && store.submitPO(po.id, roleKey); onRefresh && onRefresh(); } }));
      if (po.status === "Pending Approval" && can("approve")) acts.push(wfAct({ id: "approve", label: "Approve", perm: "approve", onClick: () => { store.approvePO(po.id, roleKey); onRefresh && onRefresh(); } }));
      if (["Approved", "Sent"].includes(po.status) && !grn && can("add")) acts.push(wfAct({ id: "grn", label: "Create GRN", perm: "add", onClick: () => { VG._pendingGRNFromPO = po.id; VG.goTo && VG.goTo("purchase", "grn"); } }));
      if (grn) acts.push(wfAct({ id: "view-grn", label: "View GRN", onClick: () => VG.goTo && VG.goTo("purchase", "grn") }));
      return acts;
    },

    purchaseRFQ(rfq, ctx) {
      const { roleKey, can, onView, onRefresh } = ctx;
      const acts = [];
      if (onView) acts.push(wfAct({ id: "view", label: "View", icon: "eye", onClick: () => onView && onView(rfq) }));
      if (rfq.status === "Draft" && can("edit")) acts.push(wfAct({ id: "send", label: "Send RFQ", perm: "edit", onClick: () => { store.update("rfqs", rfq.id, { status: "Sent", sentAt: Date.now() }, roleKey); onRefresh && onRefresh(); VG.toast("RFQ sent"); } }));
      acts.push(wfAct({ id: "compare", label: "Compare", onClick: () => VG.goTo && VG.goTo("purchase", "comparison") }));
      if (can("add")) acts.push(wfAct({ id: "po", label: "Create PO", perm: "add", onClick: () => VG.goTo && VG.goTo("purchase", "orders") }));
      return acts;
    },

    invoice(inv, ctx) {
      const { can, onView, onPay, printInvoice } = ctx;
      const acts = [];
      if (onView) acts.push(wfAct({ id: "view", label: "View", icon: "eye", onClick: () => onView && onView(inv) }));
      if (can("print")) acts.push(wfAct({ id: "print", label: "Print", icon: "print", perm: "print", onClick: () => printInvoice && printInvoice(inv, "preview") }));
      if (can("print")) acts.push(wfAct({ id: "pdf", label: "PDF", icon: "download", perm: "print", onClick: () => printInvoice && printInvoice(inv, "download") }));
      if (inv.status !== "Paid" && can("edit") && onPay) acts.push(wfAct({ id: "pay", label: "Payment", icon: "rupee", perm: "edit", onClick: () => onPay(inv) }));
      acts.push(wfAct({ id: "ledger", label: "Ledger", icon: "chart", onClick: () => VG.goTo && VG.goTo("accounts", "ledger") }));
      return acts;
    },

    customer(c, ctx) {
      const { can, onView, onQuote, onEnquiry } = ctx;
      const acts = [];
      if (onView) acts.push(wfAct({ id: "view", label: "View", icon: "eye", onClick: () => onView && onView(c) }));
      acts.push(wfAct({ id: "txns", label: "Transactions", onClick: () => onView && onView(c) }));
      acts.push(wfAct({ id: "outstanding", label: "Outstanding", onClick: () => VG.goTo && VG.goTo("accounts", "receivables") }));
      if (can("add") && onQuote) acts.push(wfAct({ id: "quote", label: "Quotation", perm: "add", onClick: () => onQuote(c) }));
      if (can("add") && onEnquiry) acts.push(wfAct({ id: "enquiry", label: "Enquiry", perm: "add", onClick: () => onEnquiry(c) }));
      acts.push(wfAct({ id: "so", label: "SOs", onClick: () => { if (VG.setCustomerFilter) VG.setCustomerFilter(c.id); VG.goTo && VG.goTo("sales", "orders"); } }));
      return acts;
    },

    supplier(s, ctx) {
      const { can, onView } = ctx;
      const acts = [];
      if (onView) acts.push(wfAct({ id: "view", label: "View", icon: "eye", onClick: () => onView && onView(s) }));
      acts.push(wfAct({ id: "po", label: "View PO", onClick: () => VG.goTo && VG.goTo("purchase", "orders") }));
      acts.push(wfAct({ id: "grn", label: "View GRN", onClick: () => VG.goTo && VG.goTo("purchase", "grn") }));
      if (can("add")) acts.push(wfAct({ id: "rfq", label: "Create RFQ", perm: "add", onClick: () => VG.goTo && VG.goTo("purchase", "rfq") }));
      return acts;
    },

    inventoryItem(it, ctx) {
      const { onView } = ctx;
      const acts = [];
      if (onView) acts.push(wfAct({ id: "view", label: "View", icon: "eye", onClick: () => onView && onView(it) }));
      acts.push(wfAct({ id: "ledger", label: "Ledger", onClick: () => { VG._pendingLedgerItemId = it.id; VG.goTo && VG.goTo("inventory", "ledger"); } }));
      acts.push(wfAct({ id: "move", label: "Movements", onClick: () => VG.goTo && VG.goTo("inventory", "ledger") }));
      acts.push(wfAct({ id: "purchase", label: "Purchases", onClick: () => VG.goTo && VG.goTo("purchase", "grn") }));
      return acts;
    },

    employee(emp, ctx) {
      const { onView } = ctx;
      const acts = [];
      if (onView) acts.push(wfAct({ id: "profile", label: "Profile", icon: "eye", onClick: () => onView && onView(emp) }));
      acts.push(wfAct({ id: "attendance", label: "Attendance", onClick: () => VG.goTo && VG.goTo("attendance", "records") }));
      acts.push(wfAct({ id: "leave", label: "Leave", onClick: () => VG.goTo && VG.goTo("hr", "leave") }));
      acts.push(wfAct({ id: "payroll", label: "Payroll", onClick: () => VG.goTo && VG.goTo("hr", "payroll") }));
      return acts;
    },

    bom(b, ctx) {
      const { can, onView, onEdit, onClone, onRevise, onPrint } = ctx;
      const acts = [];
      if (onView) acts.push(wfAct({ id: "view", label: "View", icon: "eye", onClick: () => onView(b) }));
      if (onEdit && can("edit")) acts.push(wfAct({ id: "edit", label: "Edit", icon: "edit", perm: "edit", onClick: () => onEdit(b) }));
      if (onClone && can("add")) acts.push(wfAct({ id: "clone", label: "Clone", perm: "add", onClick: () => onClone(b) }));
      if (onRevise && can("approve")) acts.push(wfAct({ id: "revise", label: "Revise", perm: "approve", onClick: () => onRevise(b) }));
      if (onPrint && can("print")) acts.push(wfAct({ id: "print", label: "Print", icon: "print", perm: "print", onClick: () => onPrint(b) }));
      return acts;
    },
  };

  VG.WorkflowActions = WorkflowActions;
  VG.wfColumn = wfColumn;
  VG.workflow = workflow;
  VG.wfLinked = wfLinked;
  VG.wfAct = wfAct;
})(window.VG = window.VG || {});
