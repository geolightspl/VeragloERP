/* Veraglo ERP — Item Name / SKU / Description display helpers (master, dropdowns, PDFs, reports). */
(function (VG) {
  const store = VG.store;
  const DESC_MAX_CHARS = 30000;

  function getItem(itemOrId) {
    if (!itemOrId) return null;
    if (typeof itemOrId === "object") return itemOrId;
    return store.get("items", itemOrId);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function nl2br(s) {
    return esc(s).replace(/\n/g, "<br>");
  }

  function itemName(itemOrId) {
    const it = getItem(itemOrId);
    return it && it.name ? String(it.name).trim() : "";
  }

  function itemDescription(itemOrId) {
    const it = getItem(itemOrId);
    if (!it) return "";
    if (it.description != null && String(it.description).trim()) return String(it.description).trim();
    if (it.manufacturerDesc) return String(it.manufacturerDesc).trim();
    return "";
  }

  function categoryName(itemOrId) {
    if (VG.itemCategoryDisplay) return VG.itemCategoryDisplay(itemOrId);
    const it = getItem(itemOrId);
    if (!it || !it.categoryId) return "";
    const cat = store.get("categories", it.categoryId);
    return cat ? (cat.name || cat.code || "") : "";
  }

  function onHand(itemOrId) {
    const it = getItem(itemOrId);
    if (!it) return 0;
    return store.onHand ? Number(store.onHand(it.id)) || 0 : 0;
  }

  function searchHaystack(itemOrId) {
    const it = getItem(itemOrId);
    if (!it) return "";
    const im = VG.itemMfr;
    const cat = store.get("categories", it.categoryId);
    return [
      it.sku, it.name, it.description, it.hsn, it.unit, it.brandName,
      im && im.manufacturerName(it), im && im.partNumber(it),
      cat && cat.name, cat && cat.code, cat && cat.typeCode,
      it.manufacturerDesc, it.manufacturerModel,
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function dropdownLine(itemOrId) {
    const it = getItem(itemOrId);
    if (!it) return "—";
    const im = VG.itemMfr;
    const mfr = (im && im.manufacturerName(it)) || "—";
    const part = (im && im.partNumber(it)) || "—";
    const cat = categoryName(it) || "—";
    const stock = onHand(it);
    const unit = it.unit || "Nos";
    return [it.sku, itemName(it) || "—", cat, mfr, part, "Stock: " + stock + " " + unit].join(" | ");
  }

  function pickLineFields(itemOrId, extras) {
    const it = getItem(itemOrId);
    if (!it) return { itemId: itemOrId || "", sku: "", name: "", desc: "", ...(extras || {}) };
    return {
      itemId: it.id,
      sku: it.sku || "",
      name: itemName(it),
      desc: itemDescription(it),
      hsn: it.hsn || "",
      unit: it.unit || "Nos",
      ...(extras || {}),
    };
  }

  function nameSkuHtml(name, sku) {
    const n = name || "—";
    const s = sku || "";
    if (!s) return "<b>" + esc(n) + "</b>";
    return "<b>" + esc(n) + "</b><br><span class=\"vg-muted\" style=\"font-size:8pt\">SKU: " + esc(s) + "</span>";
  }

  function lineNameSkuHtml(line, itemOrId) {
    const it = getItem(itemOrId);
    const name = (line && line.name) || itemName(it) || (line && line.desc) || "";
    const sku = (line && line.sku) || (it && it.sku) || "";
    return nameSkuHtml(name, sku);
  }

  function lineDescription(line, itemOrId) {
    const it = getItem(itemOrId);
    if (line && line.desc) return String(line.desc);
    return itemDescription(it);
  }

  function docLineRow(line, itemOrId, index, fmtRate, fmtAmount) {
    const it = getItem(itemOrId);
    const name = (line && line.name) || itemName(it) || "";
    const sku = (line && line.sku) || (it && it.sku) || "";
    const desc = lineDescription(line, it);
    return {
      no: index + 1,
      sku,
      name,
      itemNameSku: nameSkuHtml(name, sku),
      desc,
      descHtml: nl2br(desc),
      hsn: line.hsn || (it && it.hsn) || "",
      qty: String(line.qty != null ? line.qty : ""),
      unit: line.unit || (it && it.unit) || "",
      rate: fmtRate ? fmtRate(line.rate) : line.rate,
      rateHtml: fmtRate ? fmtRate(line.rate) : line.rate,
      disc: (line.discountPct || 0) + "%",
      tax: (line.taxPct || 0) + "%",
      amount: fmtAmount ? fmtAmount(line) : line.amount,
      amountHtml: fmtAmount ? fmtAmount(line) : line.amount,
    };
  }

  function tableLabel(itemOrId) {
    const it = getItem(itemOrId);
    if (!it) return "—";
    return (it.sku || "") + " — " + (itemName(it) || "—");
  }

  function reportCells(itemOrId) {
    const it = getItem(itemOrId);
    if (!it) return { sku: "", itemName: "", description: "" };
    return { sku: it.sku || "", itemName: itemName(it), description: itemDescription(it) };
  }

  function itemNameSkuCell(itemOrId) {
    const it = getItem(itemOrId);
    if (!it) return "—";
    return nameSkuHtml(itemName(it), it.sku || "");
  }

  function mapIndustrialLines(lines, fmtRate, fmtLineAmount) {
    return (lines || []).map((l, i) => {
      const row = docLineRow(l, l.itemId, i, fmtRate || null, fmtLineAmount || null);
      row.disc = (l.discountPct || 0) + "%";
      row.tax = (l.taxPct || 0) + "%";
      row.qty = String(l.qty != null ? l.qty : "");
      return row;
    });
  }

  function normalizeItemRecord(it) {
    if (!it || typeof it !== "object") return it;
    if (!it.description && it.manufacturerDesc) it.description = String(it.manufacturerDesc);
    if (it.description && String(it.description).length > DESC_MAX_CHARS) {
      it.description = String(it.description).slice(0, DESC_MAX_CHARS);
    }
    return it;
  }

  function validateDescription(text) {
    const s = String(text || "");
    if (s.length > DESC_MAX_CHARS) return { ok: false, message: "Item description exceeds " + DESC_MAX_CHARS + " characters (~5000 words)" };
    return { ok: true };
  }

  VG.itemDisplay = {
    DESC_MAX_CHARS,
    itemName,
    itemDescription,
    categoryName,
    onHand,
    searchHaystack,
    dropdownLine,
    pickLineFields,
    nameSkuHtml,
    lineNameSkuHtml,
    lineDescription,
    docLineRow,
    tableLabel,
    reportCells,
    itemNameSkuCell,
    mapIndustrialLines,
    normalizeItemRecord,
    validateDescription,
    nl2br,
  };
})(window.VG = window.VG || {});
