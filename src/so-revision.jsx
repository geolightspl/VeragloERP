/* Veraglo ERP — Sales Order revision utilities (reason, diff, labels). */
(function (VG) {
  const REVISION_REASONS = [
    "Customer specification changed",
    "Quantity changed",
    "Price revised",
    "Delivery date changed",
    "Technical details changed",
    "Payment terms changed",
    "Item added",
    "Item removed",
    "Address changed",
    "Tax correction",
    "Internal correction",
    "Other",
  ];

  function revLabel(n) {
    return "R" + String(Number(n) || 0).padStart(2, "0");
  }

  function lineKey(l) {
    return [l.itemId || l.sku, l.qty, l.rate, l.discountPct, l.taxPct].join("|");
  }

  function computeSalesOrderChanges(before, after) {
    const changes = [];
    const scalarFields = [
      { key: "date", label: "Order date" },
      { key: "deliveryDate", label: "Delivery date" },
      { key: "priority", label: "Priority" },
      { key: "customerPoRef", label: "Customer PO ref" },
      { key: "technicalSpec", label: "Technical specification" },
      { key: "specialInstructions", label: "Special instructions" },
      { key: "internalRemarks", label: "Internal remarks" },
      { key: "contact", label: "Contact person" },
      { key: "remarks", label: "Remarks" },
      { key: "freight", label: "Freight" },
      { key: "packing", label: "Packing" },
      { key: "insurance", label: "Insurance" },
    ];
    scalarFields.forEach((f) => {
      const o = before[f.key];
      const n = after[f.key];
      if (String(o ?? "") !== String(n ?? "")) {
        changes.push({ field: f.label, oldValue: o ?? "—", newValue: n ?? "—" });
      }
    });
    const bl = (before.lines || []).map(lineKey).join(";;");
    const al = (after.lines || []).map(lineKey).join(";;");
    if (bl !== al) {
      changes.push({
        field: "Line items",
        oldValue: (before.lines || []).length + " line(s)",
        newValue: (after.lines || []).length + " line(s) — qty/rate/items changed",
      });
    }
    return changes;
  }

  function hasSalesOrderChanges(before, after) {
    if (!before || !after) return false;
    return computeSalesOrderChanges(before, after).length > 0;
  }

  function soSentToProduction(so) {
    const st = so.stage || so.status || "";
    return st !== "Created / Saved" && st !== "" && st != null;
  }

  /** Modal: mandatory revision reason before SO save. */
  function RevisionReasonModal({ open, onClose, onConfirm, title, subtitle }) {
    const { useState } = React;
    const { Modal, Field, Select, Area, Button } = VG.fx;
    const [reason, setReason] = useState(REVISION_REASONS[0]);
    const [other, setOther] = useState("");
    const [err, setErr] = useState("");

    function submit() {
      const text = reason === "Other" ? (other || "").trim() : reason;
      if (!text) { setErr("Revision reason is required"); return; }
      onConfirm(text);
      setReason(REVISION_REASONS[0]);
      setOther("");
      setErr("");
    }

    if (!open) return null;
    return (
      <Modal open={open} onClose={onClose} title={title || "Document revision"} subtitle={subtitle || "A revision reason is required before saving changes"}
        actions={<Button icon="check" onClick={submit}>Save revision</Button>}>
        <Field label="Revision reason" required error={err}>
          <Select value={reason} onChange={setReason} options={REVISION_REASONS.map((r) => ({ value: r, label: r }))} />
        </Field>
        {reason === "Other" && (
          <Field label="Describe change" required className="mt-3">
            <Area value={other} onChange={setOther} rows={3} placeholder="Explain what changed and why" />
          </Field>
        )}
        <p className="text-xs opacity-50 mt-3">Revision number will increment automatically. Previous data is preserved in revision history.</p>
      </Modal>
    );
  }

  VG.soRevision = {
    REVISION_REASONS,
    revLabel,
    computeSalesOrderChanges,
    hasSalesOrderChanges,
    soSentToProduction,
    RevisionReasonModal,
  };
})(window.VG);
