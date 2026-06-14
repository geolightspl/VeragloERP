/* Veraglo ERP — dispatch document engine (packing list, challan, box labels, slips) */
(function (VG) {
  const store = VG.store;
  const today = VG.fmt.todayISO;
  const inr = VG.fmt.inr;

  const LABEL_SIZES = {
    A4: { width: "210mm", height: "297mm", fontSize: "12px", pad: "16mm" },
    A5: { width: "148mm", height: "210mm", fontSize: "11px", pad: "10mm" },
    "4x6": { width: "4in", height: "6in", fontSize: "10px", pad: "8px" },
    Custom: { width: "100mm", height: "150mm", fontSize: "10px", pad: "6mm" },
  };

  function co() { return store.company(); }

  function tbl(headers, rows) {
    return "<table class='vg-tbl'><thead><tr>" + headers.map((h) => "<th>" + h + "</th>").join("") + "</tr></thead><tbody>"
      + rows.map((r) => "<tr>" + r.map((c) => "<td>" + (c == null ? "—" : c) + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
  }

  function qrBlock(text) {
    return "<div style='float:right;width:64px;height:64px;border:1px solid #ccc;text-align:center;font-size:8px;padding:4px'>QR<br/>" + String(text || "").slice(0, 40) + "</div>";
  }

  function buildPackingListPdf(pl) {
    const c = co();
    const itemRows = (pl.items || []).map((it, i) => [
      it.sr || (i + 1), it.sku || "—", it.name || it.description || "—", it.hsn || "—",
      it.orderedQty || "—", it.packingQty || "—", it.unit || "Nos", it.boxNo || "—",
      it.packageType || "—", it.packages || "—", it.netWeight || "—", it.grossWeight || "—",
      it.dimensions || "—", it.volume || "—", it.batch || "—", it.serialRange || "—", it.accessories || "—", it.remark || it.remarks || "",
    ]);
    const pkgRows = (pl.packages || []).map((p) => [
      p.boxNo, p.packageType, p.description || "—", p.length, p.width, p.height, p.dimUnit || "cm",
      p.netWeight, p.grossWeight, p.weightUnit || "kg", p.volume || "—",
      p.fragile ? "Yes" : "No", p.thisSideUp ? "Yes" : "No", p.stackable ? "Yes" : "No", p.hazardous ? "Yes" : "No",
      p.handlingInstructions || "—",
    ]);
    const header = tbl(["Field", "Value"], [
      ["Packing List No.", pl.no], ["Date", pl.date], ["Sales Order", pl.salesOrderNo], ["Work Order", pl.workOrderNo || "—"],
      ["Customer PO", pl.customerPoNo || "—"], ["Customer", pl.customerName], ["Project", pl.projectName || "—"],
      ["Dispatch From", pl.dispatchFrom || "—"], ["Delivery Location", pl.deliveryLocation || "—"],
      ["Contact", pl.deliveryContact || "—"], ["Phone", pl.deliveryPhone || "—"], ["Email", pl.deliveryEmail || "—"],
      ["Transport Mode", pl.transportMode || "—"], ["Transporter", pl.transporterName || "—"], ["Vehicle", pl.vehicleNo || "—"],
      ["LR/GR", pl.lrGrNo || "—"], ["E-way Bill", pl.ewayBillNo || "—"], ["Invoice", pl.invoiceNo || "—"],
      ["Prepared By", pl.preparedBy || "—"], ["Checked By", pl.checkedBy || "—"], ["Approved By", pl.approvedBy || "—"],
    ]);
    const inner = qrBlock(pl.no)
      + "<div class='vg-head'><div><div class='vg-co'>" + (c.name || "Veraglo") + "</div><div class='vg-sub'>Packing List</div></div></div>"
      + "<h3>Packing List Header</h3>" + header
      + "<h3>Item Details</h3>" + tbl(["Sr", "SKU", "Item", "HSN", "Ord Qty", "Pack Qty", "Unit", "Box", "Pkg Type", "Pkgs", "Net Wt", "Gr Wt", "L×W×H", "CBM", "Batch", "Serial", "Accessories", "Remark"], itemRows)
      + "<h3>Package Details</h3>" + tbl(["Box", "Type", "Description", "L", "W", "H", "Unit", "Net", "Gross", "Wt Unit", "CBM", "Fragile", "↑", "Stack", "Haz", "Handling"], pkgRows)
      + (pl.remarks ? "<div class='vg-terms'><b>Remarks:</b> " + pl.remarks + "</div>" : "")
      + "<div class='vg-sign'><div>Prepared: <b>" + (pl.preparedBy || "—") + "</b></div><div>Checked: <b>" + (pl.checkedBy || "—") + "</b></div><div>Approved: <b>" + (pl.approvedBy || "—") + "</b></div></div>";
    return { title: "Packing List", subtitle: pl.no + " · " + (pl.customerName || ""), inner, docType: "Packing List" };
  }

  function buildDeliveryChallanPdf(ch, pl, sh) {
    const c = co();
    const lines = (ch.lines || pl && pl.items || sh && sh.lines || []).map((ln, i) => [
      i + 1, ln.sku || ln.itemSku || "—", ln.name || ln.description || "—", ln.hsn || "—", ln.qty || ln.packingQty || "—", ln.unit || "Nos",
    ]);
    const inner = qrBlock(ch.no)
      + "<div class='vg-head'><div><div class='vg-co'>" + (c.name || "Veraglo") + "</div><div class='vg-sub'>Delivery Challan</div></div></div>"
      + tbl(["Field", "Value"], [
        ["Challan No.", ch.no], ["Date", ch.date], ["Customer", ch.customerName || "—"], ["GSTIN", ch.gstin || c.gstin || "—"],
        ["Place of Supply", ch.placeOfSupply || "—"], ["Delivery Address", ch.deliveryAddress || "—"],
        ["Vehicle No.", ch.vehicleNo || sh && sh.vehicle || "—"], ["Transporter", ch.transporter || sh && sh.transporterName || "—"],
        ["SO Ref", ch.salesOrderNo || pl && pl.salesOrderNo || "—"], ["Reason", ch.reasonForMovement || "Supply of goods"],
      ])
      + "<h3>Items</h3>" + tbl(["Sr", "SKU", "Description", "HSN", "Qty", "Unit"], lines)
      + "<div class='vg-sign'><div>Prepared by: <b>" + (ch.preparedBy || "—") + "</b></div><div>Receiver signature: _______________</div></div>";
    return { title: "Delivery Challan", subtitle: ch.no, inner, docType: "Delivery Challan" };
  }

  function buildBoxLabelPdf(pl, box, opts) {
    opts = opts || {};
    const size = LABEL_SIZES[opts.size || "A5"] || LABEL_SIZES.A5;
    const pkg = (pl.packages || []).find((p) => String(p.boxNo) === String(box.boxNo)) || box;
    const itemsInBox = (pl.items || []).filter((it) => String(it.boxNo) === String(pkg.boxNo));
    const c = co();
    const totalBoxes = pl.totalBoxes || (pl.packages || []).length || 1;
    const watermark = opts.reprint ? "<div style='position:absolute;inset:0;display:grid;place-items:center;font-size:48px;opacity:0.08;transform:rotate(-25deg)'>DUPLICATE</div>" : "";
    const icons = [
      pkg.fragile ? "FRAGILE" : "",
      pkg.thisSideUp ? "THIS SIDE UP" : "",
      pkg.hazardous ? "HAZARD" : "",
    ].filter(Boolean).join(" · ");
    const inner = watermark
      + "<div style='padding:" + size.pad + ";font-size:" + size.fontSize + ";position:relative'>"
      + (c.logo ? "<img src='" + c.logo + "' alt='' style='height:28px;margin-bottom:6px'/>" : "<b>" + (c.name || "Veraglo") + "</b>")
      + qrBlock(pl.no + "-" + pkg.boxNo)
      + "<div><b>Dispatch Slip / Box Label</b></div>"
      + "<div>PL: " + pl.no + " · SO: " + pl.salesOrderNo + "</div>"
      + "<div><b>Customer:</b> " + (pl.customerName || "—") + "</div>"
      + "<div><b>Delivery:</b> " + (pl.deliveryLocation || "—") + "</div>"
      + "<div><b>Contact:</b> " + (pl.deliveryContact || "—") + " · " + (pl.deliveryPhone || "—") + "</div>"
      + "<div style='margin-top:8px;font-size:1.2em'><b>Box " + pkg.boxNo + " of " + totalBoxes + "</b></div>"
      + "<div>" + (pkg.packageType || "Box") + " · Net: " + (pkg.netWeight || "—") + " · Gross: " + (pkg.grossWeight || "—") + "</div>"
      + (itemsInBox.length ? "<div style='margin-top:6px'>" + itemsInBox.map((it) => (it.name || it.sku) + " × " + (it.packingQty || "—")).join("<br/>") + "</div>" : "")
      + (pkg.handlingInstructions ? "<div style='margin-top:6px'><i>" + pkg.handlingInstructions + "</i></div>" : "")
      + (icons ? "<div style='margin-top:8px;font-weight:700'>" + icons + "</div>" : "")
      + "<div style='margin-top:8px;font-size:9px;opacity:0.7'>" + today() + " " + new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) + "</div>"
      + "</div>";
    return { title: "Box Label " + pkg.boxNo, subtitle: pl.no, inner, labelSize: opts.size || "A5" };
  }

  function buildDispatchSlipPdf(sh, pl) {
    const c = co();
    const inner = qrBlock(sh.no)
      + "<div class='vg-head'><div><div class='vg-co'>" + (c.name || "Veraglo") + "</div><div class='vg-sub'>Dispatch Slip</div></div></div>"
      + tbl(["Field", "Value"], [
        ["Dispatch No.", sh.no], ["Date", sh.dispatchDate || sh.date], ["Packing List", pl && pl.no || sh.packingListNo || "—"],
        ["Sales Order", sh.salesOrderNo], ["Customer", sh.customerName || "—"], ["From", sh.dispatchFrom || pl && pl.dispatchFrom || "—"],
        ["Delivery", sh.destination || pl && pl.deliveryLocation || "—"], ["Mode", sh.transportMode || "—"],
        ["Transporter", sh.transporterName || "—"], ["Vehicle", sh.vehicle || "—"], ["Driver", sh.driver || "—"],
        ["LR/GR", sh.lrGrNo || "—"], ["E-way", sh.ewayBill || "—"], ["Freight", sh.freightPaidBy || "—"],
      ])
      + (sh.remarks ? "<div class='vg-terms'>" + sh.remarks + "</div>" : "")
      + "<div class='vg-sign'><div>Dispatched by: <b>" + (sh.dispatchedBy || "—") + "</b></div><div>Gate pass: __________</div></div>";
    return { title: "Dispatch Slip", subtitle: sh.no, inner, docType: "Delivery Challan" };
  }

  VG.DISPATCH_ENGINE = {
    LABEL_SIZES,
    buildPackingListPdf,
    buildDeliveryChallanPdf,
    buildBoxLabelPdf,
    buildDispatchSlipPdf,
  };
})(window.VG);
