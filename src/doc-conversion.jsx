/* Veraglo ERP — Document conversion / status-forward confirmation & success notifications. */
(function (VG) {
  const FORWARD_LABELS = {
    "quotation:proforma": {
      confirm: (no) => "Are you sure you want to convert this Quotation" + (no ? " (" + no + ")" : "") + " to Proforma Invoice?",
      success: (no) => "Proforma Invoice " + no + " generated successfully.",
    },
    "quotation:sales_order": {
      confirm: (no) => "Do you want to generate Sales Order from this Quotation" + (no ? " (" + no + ")" : "") + "?",
      success: () => "Sales Order form opened — review details and save when ready.",
    },
    "quotation:invoice": {
      confirm: (no) => "Are you sure you want to convert this Quotation" + (no ? " (" + no + ")" : "") + " to Tax Invoice?",
      success: (no) => "Tax Invoice " + no + " generated successfully.",
    },
    "quotation:dispatch": {
      confirm: (no) => "Are you sure you want to create Dispatch for this Quotation" + (no ? " (" + no + ")" : "") + "?",
      success: (no) => "Dispatch " + no + " created successfully.",
    },
    "proforma:sales_order": {
      confirm: (no) => "Do you want to generate Sales Order from this Proforma Invoice" + (no ? " (" + no + ")" : "") + "?",
      success: () => "Sales Order form opened — review details and save when ready.",
    },
    "sales_order:proforma": {
      confirm: (no) => "Are you sure you want to generate a Proforma Invoice from Sales Order" + (no ? " (" + no + ")" : "") + "?",
      success: (no) => "Proforma Invoice " + no + " generated successfully.",
    },
    "sales_order:production": {
      confirm: (no) => "Are you sure you want to send Sales Order" + (no ? " (" + no + ")" : "") + " to Production?",
      success: (no) => "Document sent to Production successfully." + (no ? " Work order linked to " + no + "." : ""),
    },
    "sales_order:invoice": {
      confirm: (no) => "Are you sure you want to generate Tax Invoice from Sales Order" + (no ? " (" + no + ")" : "") + "?",
      success: (no) => "Tax Invoice " + no + " generated successfully.",
    },
    "sales_order:dispatch": {
      confirm: (no) => "Are you sure you want to create Dispatch / Shipment for Sales Order" + (no ? " (" + no + ")" : "") + "?",
      success: (no) => "Dispatch " + no + " created successfully.",
    },
    "sales_order:stage": {
      confirm: (no, extra) => "Are you sure you want to advance Sales Order" + (no ? " (" + no + ")" : "") + (extra ? " to \"" + extra + "\"?" : "?"),
      success: () => "Status updated successfully.",
    },
    "enquiry:sales_order": {
      confirm: (no) => "Are you sure you want to convert this Enquiry" + (no ? " (" + no + ")" : "") + " to Sales Order?",
      success: (no) => "Sales Order " + no + " generated successfully.",
    },
    "shipment:dispatch": {
      confirm: (no) => "Are you sure you want to mark Shipment" + (no ? " (" + no + ")" : "") + " as dispatched?",
      success: (no) => "Shipment " + no + " dispatched successfully.",
    },
    "work_order:complete": {
      confirm: (no) => "Mark Work Order" + (no ? " (" + no + ")" : "") + " as production complete?",
      success: (no) => "Work Order " + no + " marked complete.",
    },
    "purchase_order:grn": {
      confirm: (no) => "Create GRN from Purchase Order" + (no ? " (" + no + ")" : "") + "?",
      success: (no) => "GRN created successfully.",
    },
    "packing_list:dispatch": {
      confirm: (no) => "Create dispatch from packing list" + (no ? " (" + no + ")" : "") + "?",
      success: (no) => "Dispatch " + no + " created.",
    },
  };

  VG.DOC_FORWARD_LABELS = FORWARD_LABELS;

  VG.confirmForward = function (opts) {
    return VG.confirm({
      title: opts.title || "Confirm",
      message: opts.message || "",
      confirmLabel: opts.confirmLabel || "Yes, Continue",
      cancelLabel: opts.cancelLabel || "Cancel",
      danger: !!opts.danger,
    });
  };

  VG.showSuccess = function (opts) {
    const message = opts.message || "Operation completed successfully.";
    if (VG.showBanner) {
      return VG.showBanner({ type: "success", title: opts.title || "Success", message, duration: 4500, toast: true });
    }
    VG.toast(message, "success");
    return Promise.resolve(true);
  };

  VG.DocSuccessPopup = function () { return null; };

  VG.forwardDocument = async function (opts) {
    if (!opts || typeof opts.run !== "function") return null;
    const dup = opts.duplicate;
    if (dup && dup.exists) {
      VG.toast(dup.message || (dup.label || "Document") + " " + (dup.no || "") + " already exists for this record.", "warn");
      return dup.linked || null;
    }
    const labels = opts.action && FORWARD_LABELS[opts.action];
    const confirmMsg = opts.confirmMessage
      || (labels && labels.confirm(opts.fromNo, opts.confirmExtra))
      || ("Are you sure you want to proceed with this " + (opts.toType || "conversion") + "?");
    const ok = await VG.confirmForward({
      title: opts.confirmTitle || "Confirm conversion",
      message: confirmMsg,
    });
    if (!ok) return null;
    let result = null;
    try {
      result = opts.run();
      if (result && typeof result.then === "function") result = await result;
    } catch (e) {
      VG.toast((e && e.message) || "Conversion failed", "error");
      return null;
    }
    if (!result) {
      if (opts.failMessage) VG.toast(opts.failMessage, "error");
      return null;
    }
    const store = VG.store;
    if (store && store.flushPersist) await store.flushPersist();
    const docNo = result.no || result.docNo || result.salesOrderNo || "";
    const successMsg = typeof opts.successMessage === "function"
      ? opts.successMessage(result)
      : (opts.successMessage
        || (labels && labels.success(docNo, opts.successExtra))
        || ((opts.toType || "Document") + " " + docNo + " generated successfully."));
    if (store && store.recordDocumentConversion) {
      store.recordDocumentConversion({
        fromType: opts.fromType,
        fromNo: opts.fromNo,
        fromId: opts.fromId,
        toType: opts.toType,
        toNo: docNo,
        toId: result.id,
        actor: opts.actor,
        statusChange: opts.statusChange,
        confirmed: true,
      });
    }
    await VG.showSuccess({ message: successMsg });
    if (opts.onDone) opts.onDone(result);
    return result;
  };

  VG.forwardStatus = async function (opts) {
    if (!opts || typeof opts.run !== "function") return null;
    const ok = await VG.confirmForward({
      title: opts.confirmTitle || "Confirm",
      message: opts.confirmMessage || "Are you sure you want to update this status?",
    });
    if (!ok) return null;
    let result = null;
    try {
      result = opts.run();
      if (result && typeof result.then === "function") result = await result;
    } catch (e) {
      VG.toast((e && e.message) || "Update failed", "error");
      return null;
    }
    if (!result) {
      if (opts.failMessage) VG.toast(opts.failMessage, "error");
      return null;
    }
    const store = VG.store;
    if (store && store.flushPersist) await store.flushPersist();
    if (VG.store && VG.store.recordDocumentConversion) {
      VG.store.recordDocumentConversion({
        fromType: opts.fromType,
        fromNo: opts.fromNo,
        fromId: opts.fromId,
        toType: opts.toType || "Status",
        toNo: opts.toNo || opts.statusChange || "",
        toId: opts.toId || "",
        actor: opts.actor,
        statusChange: opts.statusChange,
        confirmed: true,
      });
    }
    await VG.showSuccess({ message: opts.successMessage || "Status updated successfully." });
    if (opts.onDone) opts.onDone(result);
    return result;
  };
})(window.VG = window.VG || {});
