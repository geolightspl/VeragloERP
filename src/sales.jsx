/* Veraglo ERP — Sales & CRM module (fully functional). */
(function (VG) {
  const { useState, useMemo, useEffect } = React;
  const ui = VG.ui, fx = VG.fx, store = VG.store, inr = VG.fmt.inr, today = VG.fmt.todayISO;
  const { Icon, Button, Pill, Card } = ui;
  const { Field, Text, Area, Num, DateF, Select, Checkbox, MasterSelect, Modal, InternalScreen, RecordTable, PageHead, ListPage, StatusTag, printDocument, DocActions, CollapsibleSection, TransactionLinesShell } = fx;

  const QUO_STATUS = { Draft: "#94a3b8", "Pending Approval": "#f59e0b", Approved: "#34d399", Sent: "#60a5fa", Won: "#22c55e", Lost: "#ef4444", Revised: "#a78bfa" };
  const QUO_LIFECYCLE = {
    Draft: "#94a3b8", "Pending Approval": "#f59e0b", Approved: "#34d399", "Quote Sent": "#60a5fa",
    "Proforma Issued": "#8b5cf6", "Sales Order Generated": "#10b981", "Tax Invoice Generated": "#f59e0b",
    Dispatched: "#06b6d4", Won: "#22c55e", Lost: "#ef4444", Revised: "#a78bfa",
  };
  const QUO_LIFECYCLE_FILTER = Object.keys(QUO_LIFECYCLE);
  const ORD_STATUS = {
    Draft: "#64748b",
    "Created / Saved": "#94a3b8", "Sent to Production": "#60a5fa", "Accepted by Production": "#22d3ee",
    "BOM Finalized": "#6366f1", "Material Requirement Generated": "#8b5cf6", "Material Shortage Pending": "#ef4444",
    "Material Required": "#a78bfa", "Material Partially Issued": "#f59e0b", "Material Fully Issued": "#34d399",
    "Production In Progress": "#f97316", "Production Completed": "#10b981", "Sent to Finished Goods Store": "#14b8a6",
    "Sent to Quality": "#8b5cf6", "QC Pending": "#f59e0b", "QC Accepted": "#22c55e", "Ready for Dispatch": "#06b6d4",
    "Partially Dispatched": "#f97316", "Fully Dispatched": "#34d399", Closed: "#64748b", "On Hold": "#94a3b8", Cancelled: "#ef4444",
  };
  const ORDER_FLOW = Object.keys(ORD_STATUS);
  const DISCOUNT_LIMIT = 10;
  const INV_STATUS = { Posted: "#22d3ee", "Partially Paid": "#f59e0b", Paid: "#34d399", Cancelled: "#ef4444" };
  const INV_DOC_STATUS = { Posted: "#94a3b8", "E-Invoice Generated": "#60a5fa", "E-way Generated": "#8b5cf6", "E-Invoice + E-way": "#22c55e", "Partially Paid": "#f59e0b", Paid: "#34d399", Cancelled: "#ef4444" };
  const INVOICE_SO_STAGES = ["Ready to Dispatch", "Ready for Dispatch", "Dispatch Planned", "Partially Dispatched", "Fully Dispatched", "Dispatched", "Invoiced"];

  const custName = (id) => (store.get("customers", id) || {}).name || "—";
  const fmtRev = (n) => (VG.soRevision && VG.soRevision.revLabel ? VG.soRevision.revLabel(n) : ("R" + String(Number(n) || 0).padStart(2, "0")));
  const docNoLinkCls = "font-mono text-xs text-left text-black/90 dark:text-white/90 hover:underline underline-offset-2 cursor-pointer";
  function invMoney(inv, n) {
    return VG.fmtInvoiceMoney ? VG.fmtInvoiceMoney(n, inv && inv.currency) : inr(n);
  }

  /* ---------- quotation math ---------- */
  function computeLine(l) {
    const amt = (Number(l.qty) || 0) * (Number(l.rate) || 0);
    const disc = amt * (Number(l.discountPct) || 0) / 100;
    const taxable = amt - disc;
    const tax = taxable * (Number(l.taxPct) || 0) / 100;
    return { amt, disc, taxable, tax, total: taxable + tax };
  }
  const DEFAULT_WARRANTY = "Warranty: 12 months from the date of invoice.";
  function computeQuote(q) {
    let sub = 0, discount = 0, taxable = 0, tax = 0;
    (q.lines || []).forEach((l) => { const c = computeLine(l); sub += c.amt; discount += c.disc; taxable += c.taxable; tax += c.tax; });
    const charges = (Number(q.freight) || 0) + (Number(q.packing) || 0) + (Number(q.insurance) || 0);
    const grand = taxable + tax + charges;
    const roundEnabled = q.roundOffEnabled !== false;
    let roundOff = q.roundOff != null ? Number(q.roundOff) : 0;
    if (roundEnabled && (q.roundOffMode === "auto" || (!q.roundOffMode && q.roundOff == null))) {
      const rounded = Math.round(grand);
      roundOff = Math.round((rounded - grand) * 100) / 100;
    }
    if (!roundEnabled) roundOff = 0;
    if (Math.abs(roundOff) < 0.001) roundOff = 0;
    return { sub, discount, taxable, tax, charges, grand, roundOff, final: grand + roundOff };
  }
  function lineMargin(l) {
    const qty = Number(l.qty) || 0;
    const cost = store.itemUnitCost ? store.itemUnitCost(l.itemId) : 0;
    const c = computeLine(l);
    const costTotal = cost * qty;
    const margin = c.taxable - costTotal;
    const marginPct = c.taxable > 0 ? Math.round((margin / c.taxable) * 1000) / 10 : 0;
    return { cost, costTotal, margin, marginPct };
  }
  function computeQuoteMargins(q) {
    let revenue = 0, cost = 0;
    (q.lines || []).forEach((l) => {
      if (!l.itemId) return;
      revenue += computeLine(l).taxable;
      cost += lineMargin(l).costTotal;
    });
    const margin = revenue - cost;
    const marginPct = revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : 0;
    return { revenue, cost, margin, marginPct };
  }
  function needsApproval(q) {
    const t = computeQuote(q);
    const overall = t.sub ? (t.discount / t.sub) * 100 : 0;
    return overall > DISCOUNT_LIMIT || (q.lines || []).some((l) => (Number(l.discountPct) || 0) > DISCOUNT_LIMIT);
  }

  /* ================= Quotation builder ================= */
  function blankLine() { return { key: Math.random().toString(36).slice(2), itemId: "", sku: "", name: "", desc: "", hsn: "", qty: 1, unit: "Nos", rate: 0, discountPct: 0, taxPct: 18 }; }
  const idsp = () => VG.itemDisplay;
  function pickItemLine(itemId, extras) {
    const it = store.get("items", itemId);
    if (!it) return { itemId, ...(extras || {}) };
    const pl = store.list("priceList").find((x) => x.itemId === itemId);
    const tax = store.get("taxes", it.taxId);
    const base = { rate: pl ? pl.listRate : it.rate, taxPct: tax ? tax.rate : 18, ...(extras || {}) };
    const d = idsp();
    return d ? d.pickLineFields(it, base) : { itemId, sku: it.sku, name: it.name, desc: it.description || it.manufacturerDesc || "", hsn: it.hsn, unit: it.unit, ...base };
  }
  function lineDescUi(l) {
    if (l && l.desc) return l.desc;
    const d = idsp();
    return d ? d.lineDescription(l, l.itemId) : (l.desc || "");
  }
  function LineDescriptionEditor({ line, onChange, compact }) {
    const d = idsp();
    const max = (d && d.DESC_MAX_CHARS) || 5000;
    const placeholder = compact
      ? "Optional — auto-filled from item master; shorten for invoice if needed"
      : "Auto-filled from item master — edit before sending to customer";
    return (
      <Area
        value={line.desc || ""}
        onChange={(v) => {
          if (v.length > max) return VG.toast("Description exceeds " + max + " characters", "warn");
          onChange(v);
        }}
        rows={compact ? 2 : 3}
        placeholder={placeholder}
        className="!text-sm !py-1.5 min-h-[2.75rem] w-full resize-y"
      />
    );
  }
  function BankAccountSection({ doc, onChange }) {
    const accounts = store.listBankAccounts ? store.listBankAccounts() : [];
    if (!accounts.length) return null;
    function apply(patch) { onChange(patch); }
    function pickAccount(id) {
      const ba = store.getBankAccount(id);
      if (!ba) return;
      const f = store.formatBankAccount(ba);
      apply({
        bankAccountId: id,
        remittanceBank: f.bankName,
        remittanceAccount: f.accountNo,
        swiftCode: f.swiftCode || "",
        ifsc: f.ifsc || "",
      });
    }
    const curId = doc.bankAccountId || (store.defaultBankAccount() || {}).id || "";
    return (
      <Card className="p-4 mb-4">
        <div className="text-sm font-semibold mb-1">Bank details</div>
        <p className="text-xs opacity-55 mb-3">Shown on proforma &amp; tax invoice PDFs. Default account from Admin — change per document if needed.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Bank account">
            <Select value={curId} onChange={pickAccount} options={accounts.map((ba) => ({
              value: ba.id,
              label: (ba.label || ba.bankName || "Account") + (ba.isDefault ? " · default" : "") + (ba.accountNo ? " ····" + String(ba.accountNo).slice(-4) : ""),
            }))} />
          </Field>
          <Field label="Bank name"><Text value={doc.remittanceBank || ""} onChange={(v) => apply({ remittanceBank: v })} /></Field>
          <Field label="Account number"><Text value={doc.remittanceAccount || ""} onChange={(v) => apply({ remittanceAccount: v })} /></Field>
          <Field label="IFSC / SWIFT"><Text value={doc.ifsc || doc.swiftCode || ""} onChange={(v) => apply({ ifsc: v, swiftCode: v })} /></Field>
        </div>
      </Card>
    );
  }
  function mapIndustrialDocLines(lines, fmt) {
    const d = idsp();
    if (d) return d.mapIndustrialLines(lines, fmt ? (r) => fmt(r) : null, fmt ? (l) => fmt(computeLine(l).total) : null);
    return (lines || []).map((l, i) => {
      const cc = computeLine(l);
      return { no: i + 1, sku: l.sku, name: l.name || l.desc, desc: l.desc, itemNameSku: `<b>${l.name || l.desc || ""}</b><br><span class="vg-muted" style="font-size:8pt">SKU: ${l.sku || ""}</span>`, hsn: l.hsn, qty: String(l.qty), unit: l.unit, rate: fmt ? fmt(l.rate) : l.rate, disc: (l.discountPct || 0) + "%", tax: (l.taxPct || 0) + "%", amount: fmt ? fmt(cc.total) : inr(cc.total) };
    });
  }
  const LINE_TABLE_HEAD = (
    <tr className="text-left border-b border-white/10">
      <th className="min-w-[230px]">Item Name / SKU</th>
      <th className="min-w-[380px]">Item Description</th>
      <th className="w-20">HSN/SAC</th>
      <th className="w-24">Qty</th>
      <th className="w-16">Unit</th>
      <th className="w-28">Rate</th>
      <th className="w-20">Disc%</th>
      <th className="w-20">Tax%</th>
      <th className="w-24 text-right">Margin%</th>
      <th className="w-28 text-right">Amount</th>
      <th className="w-10" />
    </tr>
  );
  function QuotationBuilder({ open, onClose, roleKey, can, initial, onSaved }) {
    const isEdit = !!(initial && initial.id);
    const [q, setQ] = useState(() => init());
    function init() {
      if (initial) return { ...initial, lines: (initial.lines || []).map((l) => ({ ...l, key: Math.random().toString(36).slice(2) })) };
      return { date: today(), validity: 15, customerId: "", contact: "", billing: "", shipping: "", billingAddressId: "", shippingAddressId: "", gstin: "", currency: "INR", exchangeRate: 1, lines: [blankLine()], freight: 0, packing: 0, insurance: 0, paymentTermsId: "", deliveryTermsId: "", warranty: DEFAULT_WARRANTY, roundOffMode: "auto", roundOffEnabled: true, roundOff: null, remarks: "", terms: "", preparedBy: roleKey };
    }
    const [dirty, setDirty] = useState(false);
    const [revModal, setRevModal] = useState(false);
    const [pendingSubmit, setPendingSubmit] = useState(false);
    const QuoteRevModal = VG.soRevision && VG.soRevision.RevisionReasonModal;
    function quoteHasLinkedChildren() {
      return !!(findSOFromQuotation(q) || findProformaFromQuotation(q) || findInvoiceFromQuotation(q) || findShipmentFromQuotation(q));
    }
    function quoteIsRevisionControlled() {
      return isEdit && (((q.rev || 0) > 0) || ["Sent", "Approved", "Won", "Lost"].includes(q.status) || quoteHasLinkedChildren());
    }
    const set = (k, v) => { setDirty(true); setQ((p) => ({ ...p, [k]: v })); };
    function pickCustomer(id) {
      setDirty(true);
      const c = store.get("customers", id) || {};
      setQ((p) => (VG.applyCustomerToTransaction ? VG.applyCustomerToTransaction(c, { ...p, customerId: id }) : p));
    }
    function patchCustomerFields(patch) { setDirty(true); setQ((p) => ({ ...p, ...patch })); }
    function setLine(key, patch) { setDirty(true); setQ((p) => ({ ...p, lines: p.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) })); }
    function pickItem(key, itemId) {
      setLine(key, pickItemLine(itemId));
    }
    const addLine = () => { setDirty(true); setQ((p) => ({ ...p, lines: p.lines.concat(blankLine()) })); };
    const delLine = (key) => { setDirty(true); setQ((p) => ({ ...p, lines: p.lines.filter((l) => l.key !== key) })); };
    const totals = computeQuote(q);
    const margins = computeQuoteMargins(q);
    const clauseLibrary = store.listQuotationClauses ? store.listQuotationClauses() : [];

    function insertClause(clauseId) {
      const cl = clauseLibrary.find((c) => c.id === clauseId);
      if (!cl) return;
      setDirty(true);
      setQ((p) => ({ ...p, terms: (p.terms ? p.terms.trim() + "\n\n" : "") + cl.text }));
      VG.toast("Clause inserted: " + cl.name, "info");
    }

    function save(submit) {
      if (!q.customerId) return VG.toast("Select a customer from master", "error");
      if (!q.lines.length || q.lines.some((l) => !l.itemId)) return VG.toast("Every line must have an item from master", "error");
      // Mandatory revision reason for any edit of a forwarded / sent quotation.
      if (quoteIsRevisionControlled() && QuoteRevModal) {
        setPendingSubmit(submit);
        setRevModal(true);
        return;
      }
      commitQuote(submit, null);
    }
    function commitQuote(submit, reason) {
      const cleanLines = q.lines.map(({ key, ...l }) => l);
      const willNeed = needsApproval({ ...q });
      let status = q.status || "Draft";
      if (submit) status = willNeed ? "Pending Approval" : "Approved";
      const payload = { ...q, lines: cleanLines, status, needsDiscountApproval: willNeed, totals };
      let saved;
      if (isEdit) {
        const controlled = ((q.rev || 0) > 0) || ["Sent", "Approved", "Won", "Lost"].includes(q.status) || quoteHasLinkedChildren();
        const prevRev = q.rev || 0;
        const newRev = controlled ? prevRev + 1 : prevRev;
        payload.rev = newRev;
        const revText = fmtRev(newRev);
        const note = (submit ? "Submitted" : "Saved") + " (" + revText + ")" + (reason ? " — " + reason : "");
        payload.history = (q.history || []).concat({ rev: newRev, date: today(), by: roleKey, note, reason: reason || "" });
        if (reason) payload.lastRevisionReason = reason;
        store.update("quotations", q.id, payload, roleKey);
        saved = { ...payload, id: q.id };
        // Re-open the workflow: flag dependent documents so their next-step
        // buttons re-enable and they show "Source Quotation Revised".
        if (controlled && newRev > prevRev) {
          [["salesOrders", findSOFromQuotation(q)], ["proformas", findProformaFromQuotation(q)],
           ["invoices", findInvoiceFromQuotation(q)], ["shipments", findShipmentFromQuotation(q)]]
            .forEach(([coll, child]) => {
              if (child) store.update(coll, child.id, { sourceRevised: true, sourceRevisedAt: Date.now(), sourceRevisedReason: reason || "" }, roleKey);
            });
          store.audit(roleKey, "revise", "quotations", q.no, "Quotation " + q.no + " revised to " + revText + (reason ? " · " + reason : ""), { module: "sales", newValue: revText });
        }
        VG.toast("Quotation " + q.no + " updated (" + revText + ")");
      } else {
        payload.no = store.nextNo("QT", q.date);
        payload.rev = 0;
        payload.history = [{ rev: 0, date: today(), by: roleKey, note: submit ? "Created & submitted" : "Created as draft" }];
        saved = store.create("quotations", payload, roleKey);
        VG.toast("Quotation " + payload.no + " created");
      }
      if (saved && saved.enquiryId && VG.enquiryOnQuotationSaved) VG.enquiryOnQuotationSaved(saved, roleKey);
      if (submit && willNeed && VG.approvalEngine) VG.approvalEngine.onQuotationSubmitted(saved, roleKey, totals.grand);
      onSaved && onSaved();
      onClose();
    }

    const formActions = <>
      <Button variant="soft" icon="eye" onClick={() => quotationPDF({ ...q, no: q.no || "DRAFT", rev: q.rev || 0, status: q.status || "Draft", totals }, "preview")}>Preview PDF</Button>
      <Button variant="soft" icon="check" onClick={() => save(false)}>Save as Draft</Button>
      <Button icon="shield" onClick={() => save(true)}>Submit{needsApproval(q) ? " for approval" : ""}</Button>
    </>;

    return (
      <InternalScreen onBack={onClose} backLabel="Back to list" dirty={dirty} title={isEdit ? "Edit Quotation " + q.no : (q.clonedFromNo ? "New Quotation (from " + q.clonedFromNo + ")" : "New Quotation")} subtitle="All parties & items are selected from master data only"
        footer={formActions}>
        {QuoteRevModal && <QuoteRevModal open={revModal} onClose={() => setRevModal(false)} title="Quotation revision" subtitle="A revision reason is required before saving changes to this quotation" onConfirm={(reason) => { setRevModal(false); commitQuote(pendingSubmit, reason); }} />}
        <CollapsibleSection title="Customer & commercial" subtitle="Party, dates, terms" defaultOpen>
          <div className="grid lg:grid-cols-3 gap-3">
            <Field label="Customer (from master)" required className="lg:col-span-1">
              <MasterSelect collection="customers" value={q.customerId} onChange={pickCustomer} actorRole={roleKey} can={can("add")} />
            </Field>
            <Field label="Contact person"><Text value={q.contact} onChange={(v) => set("contact", v)} placeholder="Auto from master" /></Field>
            <Field label="GSTIN"><Text value={q.gstin} onChange={(v) => set("gstin", v)} placeholder="Auto from master" /></Field>
            <Field label="Date" required><DateF value={q.date} onChange={(v) => set("date", v)} /></Field>
            <Field label="Validity (days)"><Num value={q.validity} onChange={(v) => set("validity", v)} /></Field>
            <Field label="Warranty" hint="Shown on PDF commercial offer"><Text value={q.warranty} onChange={(v) => set("warranty", v)} placeholder={DEFAULT_WARRANTY} /></Field>
            <div className="grid grid-cols-2 gap-3 content-start lg:col-span-3">
              <Field label="Payment terms"><Select value={q.paymentTermsId} onChange={(v) => set("paymentTermsId", v)} options={store.list("paymentTerms").map((t) => ({ value: t.id, label: t.name }))} /></Field>
              <Field label="Delivery terms"><Select value={q.deliveryTermsId} onChange={(v) => set("deliveryTermsId", v)} options={store.list("deliveryTerms").map((t) => ({ value: t.id, label: t.name }))} /></Field>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Project & references" subtitle="Subject, RFQ, location" defaultOpen={!!(q.subject || q.projectName || q.rfqRef)}>
          <div className="grid lg:grid-cols-3 gap-3">
            <Field label="Subject"><Text value={q.subject} onChange={(v) => set("subject", v)} placeholder="Offer subject / scope headline" /></Field>
            <Field label="Project name"><Text value={q.projectName} onChange={(v) => set("projectName", v)} /></Field>
            <Field label="Project reference"><Text value={q.projectRef} onChange={(v) => set("projectRef", v)} /></Field>
            <Field label="RFQ / Inquiry ref."><Text value={q.rfqRef} onChange={(v) => set("rfqRef", v)} /></Field>
            <Field label="Project location"><Text value={q.projectLocation} onChange={(v) => set("projectLocation", v)} placeholder="City, state, country" /></Field>
            {VG.TransactionAddressCurrency ? (
              <VG.TransactionAddressCurrency customerId={q.customerId} values={q} onChange={patchCustomerFields} roleKey={roleKey} canEditCurrency={can("edit")} showAddresses={false} className="lg:col-span-3" />
            ) : (
              <>
                <Field label="Billing address" className="lg:col-span-1"><Area value={q.billing} onChange={(v) => set("billing", v)} rows={2} /></Field>
                <Field label="Shipping address" className="lg:col-span-1"><Area value={q.shipping} onChange={(v) => set("shipping", v)} rows={2} /></Field>
              </>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Line items" subtitle="Items, rates, margin visibility" defaultOpen>
        <TransactionLinesShell title="" onAddLine={addLine} addLabel="Add line" minWidth={1280}
          headerRow={LINE_TABLE_HEAD}>
          {q.lines.map((l) => {
            const c = computeLine(l);
            const m = lineMargin(l);
            const pl = store.list("priceList").find((x) => x.itemId === l.itemId);
            const below = pl && Number(l.rate) < pl.minRate;
            const rateRule = VG.fieldRule(roleKey, "quotation", "rate");
            const discRule = VG.fieldRule(roleKey, "quotation", "discountPct");
            return (
              <tr key={l.key} className="border-b border-white/5 align-top">
                <td className="min-w-[230px]">
                  <MasterSelect variant="line" collection="items" value={l.itemId} onChange={(id) => pickItem(l.key, id)} actorRole={roleKey} can={can("add")} />
                </td>
                <td className="min-w-[380px] vg-line-desc"><LineDescriptionEditor line={l} onChange={(v) => setLine(l.key, { desc: v })} /></td>
                <td className="font-mono text-xs">{l.hsn || "—"}</td>
                <td><Num data-line-qty value={l.qty} onChange={(v) => setLine(l.key, { qty: v })} /></td>
                <td className="text-sm opacity-80">{l.unit}</td>
                <td>{rateRule.editable ? <Num value={l.rate} onChange={(v) => setLine(l.key, { rate: v })} /> : <span className="opacity-70">{inr(l.rate)}</span>}{below && <div className="text-[9px] text-rose-400 mt-0.5">below floor</div>}</td>
                <td>{discRule.editable ? <Num value={l.discountPct} onChange={(v) => setLine(l.key, { discountPct: v })} /> : <span className="opacity-70">{l.discountPct || 0}%</span>}{discRule.approvalRequired && <div className="text-[9px] text-amber-400">needs approval</div>}</td>
                <td><Num value={l.taxPct} onChange={(v) => setLine(l.key, { taxPct: v })} /></td>
                <td className={"text-right text-xs font-medium " + (m.marginPct < 15 ? "text-amber-400" : "text-emerald-400")}>{l.itemId ? m.marginPct + "%" : "—"}</td>
                <td className="text-right font-medium">{inr(c.total)}</td>
                <td><button type="button" onClick={() => delLine(l.key)} className="p-1 rounded chrome-hover hover:text-rose-400"><Icon name="trash" size={14} /></button></td>
              </tr>
            );
          })}
        </TransactionLinesShell>
        </CollapsibleSection>

        <CollapsibleSection title="Charges, terms & summary" subtitle="Freight, clauses, totals" defaultOpen>
        <div className="grid lg:grid-cols-3 gap-3">
          <div className="grid grid-cols-3 gap-3 lg:col-span-2 content-start">
            <Field label="Freight (₹)"><Num value={q.freight} onChange={(v) => set("freight", v)} /></Field>
            <Field label="Packing (₹)"><Num value={q.packing} onChange={(v) => set("packing", v)} /></Field>
            <Field label="Insurance (₹)"><Num value={q.insurance} onChange={(v) => set("insurance", v)} /></Field>
            <Field label="Round-off mode"><Select value={q.roundOffMode || "auto"} onChange={(v) => set("roundOffMode", v)} options={[{ value: "auto", label: "Automatic" }, { value: "manual", label: "Manual" }]} /></Field>
            <Field label="Round-off (±)" hint="Manual adjustment"><Num value={q.roundOff != null ? q.roundOff : totals.roundOff} onChange={(v) => set("roundOff", v)} disabled={q.roundOffMode !== "manual"} /></Field>
            <Checkbox checked={q.roundOffEnabled !== false} onChange={(v) => set("roundOffEnabled", v)} label="Apply round-off on total" />
            <Field label="Remarks" className="col-span-3"><Area value={q.remarks} onChange={(v) => set("remarks", v)} rows={2} /></Field>
            {clauseLibrary.length > 0 && (
              <Field label="Insert reusable clause" className="col-span-3">
                <Select value="" onChange={insertClause} options={[{ value: "", label: "— Select clause to insert —" }].concat(clauseLibrary.map((c) => ({ value: c.id, label: c.name })))} />
              </Field>
            )}
            <Field label="Terms & conditions" className="col-span-3"><Area value={q.terms} onChange={(v) => set("terms", v)} rows={4} /></Field>
          </div>
          <Card className="p-4 h-max">
            <div className="text-sm font-semibold mb-2">Summary</div>
            {[["Sub total", totals.sub], ["Discount", -totals.discount], ["Taxable", totals.taxable], ["GST", totals.tax], ["Freight/Packing/Ins.", totals.charges]].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm py-0.5"><span className="opacity-60">{k}</span><span>{inr(v)}</span></div>
            ))}
            <div className="flex justify-between text-sm font-semibold border-t border-white/10 mt-2 pt-2"><span>Grand total</span><span>{inr(totals.grand)}</span></div>
            {totals.roundOff ? <div className="flex justify-between text-sm py-0.5"><span className="opacity-60">Round off</span><span>{totals.roundOff > 0 ? "+" : ""}{inr(totals.roundOff)}</span></div> : null}
            {totals.roundOff ? <div className="flex justify-between text-base font-semibold border-t border-white/10 mt-1 pt-1"><span>Final amount</span><span>{inr(totals.final)}</span></div> : null}
            <div className="mt-3 pt-3 border-t border-white/10 space-y-1 text-sm">
              <div className="flex justify-between"><span className="opacity-60">Est. cost</span><span>{inr(margins.cost)}</span></div>
              <div className="flex justify-between font-medium"><span className="opacity-60">Gross margin</span><span className={margins.marginPct < 15 ? "text-amber-400" : "text-emerald-400"}>{inr(margins.margin)} ({margins.marginPct}%)</span></div>
            </div>
            {needsApproval(q) && <div className="mt-3 text-[11px] rounded-lg p-2" style={{ background: "#f59e0b22", color: "#f59e0b" }}><Icon name="alert" size={12} className="inline mr-1" />Discount &gt; {DISCOUNT_LIMIT}% — needs approval</div>}
          </Card>
        </div>
        </CollapsibleSection>
      </InternalScreen>
    );
  }

  /* ================= Sales order builder ================= */
  function SalesOrderBuilder({ open, onClose, roleKey, can, initial, onSaved }) {
    const isEdit = !!(initial && initial.id);
    const fromQuotation = !!(initial && (initial._fromQuotation || initial._quotationId));
    const fromProforma = !!(initial && initial._fromProforma);
    const backToQuotationId = initial && (initial._backToQuotationId || initial._quotationId);
    const lockedAfterSend = isEdit && !["Created / Saved", "Draft", "", null, undefined].includes(initial.stage || initial.status);
    const [o, setO] = useState(() => init());
    function init() {
      if (initial) return { ...initial, lines: (initial.lines || []).map((l) => ({ ...l, key: Math.random().toString(36).slice(2) })) };
      return {
        date: today(), customerId: "", quotationId: "", contact: "", billing: "", shipping: "", billingAddressId: "", shippingAddressId: "", gstin: "",
        currency: "INR", exchangeRate: 1, customerPoRef: "", customerPoDate: "", customerPoCopy: "", drawingsUpload: "", techDocsUpload: "",
        deliverySchedule: "", dispatchInstructions: "", packingInstructions: "",
        deliveryDate: today(), priority: "Normal", priorityCustom: "",
        technicalSpec: "", specialInstructions: "", internalRemarks: "", documents: "",
        lines: [blankLine()], freight: 0, packing: 0, insurance: 0,
        paymentTermsId: "", deliveryTermsId: "", remarks: "", preparedBy: roleKey,
      };
    }
    const [dirty, setDirty] = useState(false);
    const [revModal, setRevModal] = useState(false);
    const set = (k, v) => { setDirty(true); setO((p) => ({ ...p, [k]: v })); };
    function pickCustomer(id) {
      setDirty(true);
      const c = store.get("customers", id) || {};
      setO((p) => (VG.applyCustomerToTransaction ? VG.applyCustomerToTransaction(c, { ...p, customerId: id }) : p));
    }
    function patchOrderFields(patch) { setDirty(true); setO((p) => ({ ...p, ...patch })); }
    function loadFromQuotation(qid) {
      if (!qid) return;
      const q = store.get("quotations", qid);
      if (!q) return;
      setDirty(true);
      const t = computeQuote(q);
      setO((p) => ({
        ...p, quotationId: qid, customerId: q.customerId, contact: q.contact, billing: q.billing, shipping: q.shipping, gstin: q.gstin,
        billingAddressId: q.billingAddressId || "", shippingAddressId: q.shippingAddressId || "",
        currency: q.currency || p.currency || "INR", exchangeRate: q.exchangeRate != null ? q.exchangeRate : p.exchangeRate,
        lines: (q.lines || []).map((l) => ({ ...l, key: Math.random().toString(36).slice(2) })),
        freight: q.freight || 0, packing: q.packing || 0, insurance: q.insurance || 0,
        paymentTermsId: q.paymentTermsId || p.paymentTermsId, deliveryTermsId: q.deliveryTermsId || p.deliveryTermsId,
        remarks: q.remarks || p.remarks, totals: t,
      }));
    }
    function setLine(key, patch) { setDirty(true); setO((p) => ({ ...p, lines: p.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) })); }
    function pickItem(key, itemId) {
      setLine(key, pickItemLine(itemId));
    }
    const addLine = () => { setDirty(true); setO((p) => ({ ...p, lines: p.lines.concat(blankLine()) })); };
    const delLine = (key) => { setDirty(true); setO((p) => ({ ...p, lines: p.lines.filter((l) => l.key !== key) })); };
    const totals = computeQuote(o);
    const approvedQuotes = store.list("quotations").filter((q) => ["Approved", "Sent", "Won"].includes(q.status));

    function commitSave(payload, revisionReason, asDraft) {
      const finalStatus = asDraft ? "Draft" : "Created / Saved";
      payload.status = isEdit && asDraft ? "Draft" : (asDraft ? "Draft" : (isEdit ? (payload.status || "Created / Saved") : "Created / Saved"));
      payload.stage = payload.status;
      if (isEdit) {
        const sr = VG.soRevision;
        const before = initial;
        let hasChanges = sr && sr.hasSalesOrderChanges(before, payload);
        if (hasChanges) {
          const revNo = (Number(before.revisionNo) || 0) + 1;
          const changes = sr.computeSalesOrderChanges(before, payload);
          const revLabel = sr.revLabel(revNo);
          payload.revisionNo = revNo;
          payload.revisionLabel = revLabel;
          payload.revisionReason = revisionReason;
          payload.lastRevisionReason = revisionReason;
          payload.revisionHistory = (before.revisionHistory || []).concat({
            rev: revNo,
            revLabel,
            date: today(),
            ts: Date.now(),
            by: roleKey,
            reason: revisionReason,
            changes,
            snapshot: {
              deliveryDate: before.deliveryDate,
              priority: before.priority,
              technicalSpec: before.technicalSpec,
              specialInstructions: before.specialInstructions,
              lines: before.lines,
            },
          });
          if (sr.soSentToProduction(before)) {
            payload.revisionPendingApproval = true;
            payload.needsProductionSync = true;
          }
          store._soTimeline && store._soTimeline(o.id, "revision", roleKey, revLabel + " — " + revisionReason);
        }
        store.update("salesOrders", o.id, payload, roleKey);
        VG.toast("Sales order " + o.no + " updated" + (hasChanges ? " (" + (VG.soRevision && VG.soRevision.revLabel(payload.revisionNo)) + ")" : ""));
      } else {
        payload.no = store.nextNo("SO", o.date);
        payload.revisionNo = 0;
        payload.revisionLabel = VG.soRevision ? VG.soRevision.revLabel(0) : "Rev00";
        payload.revisionHistory = [];
        const created = store.create("salesOrders", payload, roleKey);
        if (o.quotationId && !asDraft) {
          const q = store.get("quotations", o.quotationId);
          if (q && q.status !== "Won") {
            store.update("quotations", o.quotationId, { status: "Won" }, roleKey);
          }
          if (q && q.enquiryId && VG.enquiryOnConverted) VG.enquiryOnConverted(q, created, roleKey);
        }
        if (o.quotationId) {
          store.audit(roleKey, asDraft ? "draft" : "create", "salesOrders", created.no, "Sales order " + created.no + (asDraft ? " saved as draft" : " created") + " from quotation " + (o._quotationNo || o.quotationId));
        }
        if (VG.workflowReview && VG.workflowReview.recordReview) {
          VG.workflowReview.recordReview({ event: asDraft ? "draft_saved" : "forwarded", action: fromQuotation ? "quotation:sales_order" : fromProforma ? "proforma:sales_order" : "sales_order:create", actor: roleKey, sourceNo: o._quotationNo || o._proformaNo, targetType: "Sales Order", note: "SO " + created.no });
        }
        VG.toast(asDraft ? "Sales order draft saved — complete and save when ready" : "Sales order " + created.no + " saved");
        onSaved && onSaved();
        onClose();
        return;
      }
      onSaved && onSaved();
      onClose();
    }

    function save(revisionReason, asDraft) {
      if (!o.customerId) return VG.toast("Select a customer from master", "error");
      if (!o.lines.length || o.lines.some((l) => !l.itemId)) return VG.toast("Every line must have an item from master", "error");
      const cleanLines = o.lines.map(({ key, ...l }) => l);
      const payload = {
        ...o, lines: cleanLines, totals,
        status: asDraft ? "Draft" : (isEdit ? (o.status || "Created / Saved") : "Created / Saved"),
        stage: asDraft ? "Draft" : (isEdit ? (o.stage || o.status || "Created / Saved") : "Created / Saved"),
        deliveryDate: o.deliveryDate || o.date,
        priority: o.priority === "Custom" ? (o.priorityCustom || "Custom") : (o.priority || "Normal"),
        preparedBy: o.preparedBy || roleKey,
        revisionNo: o.revisionNo != null ? o.revisionNo : 0,
        revisionHistory: o.revisionHistory || [],
        timeline: o.timeline || [{ ts: Date.now(), action: "create", by: roleKey, note: asDraft ? "Sales order draft started" : "Sales order created" }],
        sourceQuotationRev: o.sourceQuotationRev != null ? o.sourceQuotationRev : undefined,
      };
      delete payload._fromQuotation;
      delete payload._fromProforma;
      delete payload._quotationNo;
      delete payload._quotationId;
      delete payload._proformaNo;
      delete payload._backToQuotationId;
      if (isEdit && VG.soRevision && VG.soRevision.hasSalesOrderChanges(initial, payload) && !revisionReason) {
        setRevModal(true);
        return;
      }
      commitSave(payload, revisionReason, asDraft);
    }

    function backToQuotation() {
      if (backToQuotationId) {
        VG._pendingQuotationView = backToQuotationId;
        onClose();
        if (VG.goTo) VG.goTo("sales", "quotations");
      } else {
        onClose();
      }
    }

    const RevModal = VG.soRevision && VG.soRevision.RevisionReasonModal;

    return (
      <>
      {RevModal && <RevModal open={revModal} onClose={() => setRevModal(false)} onConfirm={(reason) => { setRevModal(false); save(reason, false); }} />}
      <InternalScreen onBack={onClose} backLabel="Back to list" dirty={dirty}
        title={isEdit ? "Edit Sales Order " + o.no + (o.revisionNo != null ? " · " + fmtRev(o.revisionNo) : "") : (fromQuotation ? "Sales Order from Quotation " + (o._quotationNo || "") : fromProforma ? "Sales Order from Proforma " + (o._proformaNo || "") : "New Sales Order")}
        subtitle={fromQuotation || fromProforma ? "Review quotation data and add sales-order details before saving" : "Create a confirmed order — items from item master"}
        footer={<>
          <Button variant="soft" icon="eye" onClick={() => orderPDF({ ...o, no: o.no || "DRAFT", status: o.status || "Draft", totals }, "preview")}>Preview PDF</Button>
          {(fromQuotation || fromProforma) && <Button variant="soft" icon="chevronLeft" onClick={backToQuotation}>{fromQuotation ? "Back to Quotation" : "Back"}</Button>}
          <Button variant="soft" icon="check" onClick={() => save(null, true)}>Save as Draft</Button>
          <Button icon="check" onClick={() => save(null, false)}>{isEdit ? "Save Sales Order" : "Save Sales Order"}</Button>
        </>}>
        <div className="grid lg:grid-cols-3 gap-3 mb-4">
          <Field label="Customer (from master)" required>
            <MasterSelect collection="customers" value={o.customerId} onChange={pickCustomer} actorRole={roleKey} can={can("add")} />
          </Field>
          <Field label="Contact person"><Text value={o.contact} onChange={(v) => set("contact", v)} /></Field>
          <Field label="GSTIN"><Text value={o.gstin} onChange={(v) => set("gstin", v)} /></Field>
          <Field label="Order date" required><DateF value={o.date} onChange={(v) => set("date", v)} /></Field>
          <Field label="Customer PO number"><Text value={o.customerPoRef} onChange={(v) => set("customerPoRef", v)} /></Field>
          <Field label="Customer PO date"><DateF value={o.customerPoDate || ""} onChange={(v) => set("customerPoDate", v)} /></Field>
          <Field label="Delivery date" required><DateF value={o.deliveryDate} onChange={(v) => set("deliveryDate", v)} /></Field>
          <Field label="Production priority"><Select value={o.priority} onChange={(v) => set("priority", v)} options={["Normal", "Urgent", "High Priority", "Critical", "Custom"].map((x) => ({ value: x, label: x }))} /></Field>
          {o.priority === "Custom" && <Field label="Custom priority"><Text value={o.priorityCustom} onChange={(v) => set("priorityCustom", v)} /></Field>}
          {!fromQuotation && !fromProforma && (
            <Field label="Link quotation (optional)" className="lg:col-span-2">
              <Select value={o.quotationId || ""} onChange={(v) => loadFromQuotation(v)} placeholder="None — start blank"
                options={[{ value: "", label: "— None —" }].concat(approvedQuotes.map((q) => ({ value: q.id, label: q.no + " · " + custName(q.customerId) })))} />
            </Field>
          )}
          {(fromQuotation || fromProforma) && o.quotationId && (
            <Field label="Source quotation" className="lg:col-span-2">
              <Text value={o._quotationNo || (store.get("quotations", o.quotationId) || {}).no || o.quotationId} onChange={() => {}} disabled />
            </Field>
          )}
          {VG.TransactionAddressCurrency ? (
            <VG.TransactionAddressCurrency customerId={o.customerId} values={o} onChange={patchOrderFields} roleKey={roleKey} canEditCurrency={can("edit")} />
          ) : (
            <>
              <Field label="Billing address" className="lg:col-span-1"><Area value={o.billing} onChange={(v) => set("billing", v)} rows={2} /></Field>
              <Field label="Dispatch address" className="lg:col-span-1"><Area value={o.shipping} onChange={(v) => set("shipping", v)} rows={2} /></Field>
            </>
          )}
          <div className="grid grid-cols-2 gap-3 content-start lg:col-span-3">
            <Field label="Payment terms"><Select value={o.paymentTermsId} onChange={(v) => set("paymentTermsId", v)} options={store.list("paymentTerms").map((t) => ({ value: t.id, label: t.name }))} /></Field>
            <Field label="Delivery terms"><Select value={o.deliveryTermsId} onChange={(v) => set("deliveryTermsId", v)} options={store.list("deliveryTerms").map((t) => ({ value: t.id, label: t.name }))} /></Field>
          </div>
          <Field label="Technical specifications / manufacturing instructions" className="lg:col-span-2"><Area value={o.technicalSpec} onChange={(v) => set("technicalSpec", v)} rows={2} placeholder="Special manufacturing instructions" /></Field>
          <Field label="Delivery schedule" className="lg:col-span-1"><Area value={o.deliverySchedule} onChange={(v) => set("deliverySchedule", v)} rows={2} placeholder="Phased delivery dates, milestones" /></Field>
          <Field label="Dispatch instructions" className="lg:col-span-1"><Area value={o.dispatchInstructions} onChange={(v) => set("dispatchInstructions", v)} rows={2} /></Field>
          <Field label="Packing instructions" className="lg:col-span-1"><Area value={o.packingInstructions} onChange={(v) => set("packingInstructions", v)} rows={2} /></Field>
          <Field label="Special instructions" className="lg:col-span-1"><Area value={o.specialInstructions} onChange={(v) => set("specialInstructions", v)} rows={2} /></Field>
          <Field label="Internal remarks" className="lg:col-span-1"><Area value={o.internalRemarks} onChange={(v) => set("internalRemarks", v)} rows={2} /></Field>
          <Field label="Customer PO copy (file ref)" className="lg:col-span-1"><Text value={o.customerPoCopy} onChange={(v) => set("customerPoCopy", v)} placeholder="po-copy.pdf" /></Field>
          <Field label="Drawings upload (file ref)" className="lg:col-span-1"><Text value={o.drawingsUpload} onChange={(v) => set("drawingsUpload", v)} placeholder="drawing.pdf" /></Field>
          <Field label="Technical documents (file ref)" className="lg:col-span-1"><Text value={o.techDocsUpload} onChange={(v) => set("techDocsUpload", v)} placeholder="spec.xlsx" /></Field>
          <Field label="Other document refs" className="lg:col-span-1"><Text value={o.documents} onChange={(v) => set("documents", v)} placeholder="Additional attachments" /></Field>
        </div>
        {lockedAfterSend && <div className="text-xs rounded-lg p-2.5 mb-3" style={{ background: "#f59e0b22", color: "#f59e0b" }}>This order was sent to production. Any save creates a new revision (mandatory reason), requires approval, then <b>Push Updated Revision to Production</b> to sync the work order.</div>}
        {isEdit && (o.revisionHistory || []).length > 0 && (
          <Card className="p-3 mb-3">
            <div className="text-xs font-semibold uppercase opacity-60 mb-2">Revision history</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left opacity-50 border-b border-white/10"><th className="py-1 pr-2">Rev</th><th className="py-1 pr-2">Date</th><th className="py-1 pr-2">By</th><th className="py-1 pr-2">Reason</th><th className="py-1">Changes</th></tr></thead>
                <tbody>
                  {(o.revisionHistory || []).slice().reverse().map((h, i) => (
                    <tr key={i} className="border-b border-white/5 align-top">
                      <td className="py-1.5 font-mono">{h.revLabel || ("Rev" + String(h.rev || 0).padStart(2, "0"))}</td>
                      <td className="py-1.5">{h.date || (h.ts ? new Date(h.ts).toLocaleDateString() : "—")}</td>
                      <td className="py-1.5">{h.by}</td>
                      <td className="py-1.5">{h.reason || h.note || "—"}</td>
                      <td className="py-1.5 opacity-80">{(h.changes || []).map((c) => c.field).join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <TransactionLinesShell title="Line items" onAddLine={addLine} addLabel="Add line" minWidth={1180}
          headerRow={LINE_TABLE_HEAD}>
          {o.lines.map((l) => {
            const c = computeLine(l);
            return (
              <tr key={l.key} className="border-b border-white/5 align-top">
                <td className="min-w-[230px]">
                  <MasterSelect variant="line" collection="items" value={l.itemId} onChange={(id) => pickItem(l.key, id)} actorRole={roleKey} can={can("add")} />
                </td>
                <td className="min-w-[380px]"><div className="text-sm leading-snug py-1 pr-2 whitespace-pre-wrap">{lineDescUi(l) || <span className="opacity-40">—</span>}</div></td>
                <td className="font-mono text-xs">{l.hsn || "—"}</td>
                <td><Num data-line-qty value={l.qty} onChange={(v) => setLine(l.key, { qty: v })} /></td>
                <td className="text-sm opacity-80">{l.unit}</td>
                <td><Num value={l.rate} onChange={(v) => setLine(l.key, { rate: v })} /></td>
                <td><Num value={l.discountPct} onChange={(v) => setLine(l.key, { discountPct: v })} /></td>
                <td><Num value={l.taxPct} onChange={(v) => setLine(l.key, { taxPct: v })} /></td>
                <td className="text-right font-medium">{inr(c.total)}</td>
                <td><button type="button" onClick={() => delLine(l.key)} className="p-1 rounded chrome-hover hover:text-rose-400"><Icon name="trash" size={14} /></button></td>
              </tr>
            );
          })}
        </TransactionLinesShell>

        <div className="grid lg:grid-cols-3 gap-3">
          <div className="grid grid-cols-3 gap-3 lg:col-span-2 content-start">
            <Field label="Freight (₹)"><Num value={o.freight} onChange={(v) => set("freight", v)} /></Field>
            <Field label="Packing (₹)"><Num value={o.packing} onChange={(v) => set("packing", v)} /></Field>
            <Field label="Insurance (₹)"><Num value={o.insurance} onChange={(v) => set("insurance", v)} /></Field>
            <Field label="Remarks" className="col-span-3"><Area value={o.remarks} onChange={(v) => set("remarks", v)} rows={2} /></Field>
          </div>
          <Card className="p-4 h-max">
            <div className="text-sm font-semibold mb-2">Order total</div>
            {[["Sub total", totals.sub], ["Discount", -totals.discount], ["Taxable", totals.taxable], ["GST", totals.tax], ["Charges", totals.charges]].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm py-0.5"><span className="opacity-60">{k}</span><span>{inr(v)}</span></div>
            ))}
            <div className="flex justify-between text-base font-semibold border-t border-white/10 mt-2 pt-2"><span>Grand total</span><span>{inr(totals.grand)}</span></div>
          </Card>
        </div>
      </InternalScreen>
      </>
    );
  }

  function findSOFromQuotation(q) {
    return store.list("salesOrders").find((o) => o.quotationId === q.id);
  }
  function findProformaFromQuotation(q) {
    return store.list("proformas").find((p) => p.quotationId === q.id);
  }
  function findInvoiceFromQuotation(q) {
    if (!q) return null;
    const byQuote = store.list("invoices").find((i) => i.quotationId === q.id && i.status !== "Cancelled");
    if (byQuote) return byQuote;
    const so = findSOFromQuotation(q);
    return so ? store.list("invoices").find((i) => i.salesOrderId === so.id && i.status !== "Cancelled") : null;
  }
  function openInvoiceFromQuotation(inv, onClose, go) {
    if (!inv) return;
    onClose && onClose();
    VG._pendingInvoiceView = inv.id;
    if (VG.goTo) VG.goTo("sales", "invoices");
    else if (go) go("invoices");
  }
  function findShipmentFromQuotation(q) {
    const so = findSOFromQuotation(q);
    return so ? store.list("shipments").find((s) => s.salesOrderId === so.id) : null;
  }
  function quotationLifecycleStatus(q) {
    if (!q) return { label: "—", color: "#94a3b8" };
    if (q.status === "Lost") return { label: "Lost", color: QUO_LIFECYCLE.Lost };
    if (q.status === "Revised") return { label: "Revised", color: QUO_LIFECYCLE.Revised };
    const sh = findShipmentFromQuotation(q);
    const inv = findInvoiceFromQuotation(q);
    const so = findSOFromQuotation(q);
    const pi = findProformaFromQuotation(q);
    if (sh) return { label: "Dispatched", color: QUO_LIFECYCLE.Dispatched, detail: sh.no };
    if (inv) return { label: "Tax Invoice Generated", color: QUO_LIFECYCLE["Tax Invoice Generated"], detail: inv.no };
    if (so) return { label: "Sales Order Generated", color: QUO_LIFECYCLE["Sales Order Generated"], detail: so.no };
    if (pi) return { label: "Proforma Issued", color: QUO_LIFECYCLE["Proforma Issued"], detail: pi.no };
    if (q.status === "Sent" || q.sentAt || q.lastOfferMode) return { label: "Quote Sent", color: QUO_LIFECYCLE["Quote Sent"] };
    if (q.status === "Won") return { label: "Won", color: QUO_LIFECYCLE.Won };
    if (q.status === "Approved") return { label: "Approved", color: QUO_LIFECYCLE.Approved };
    if (q.status === "Pending Approval") return { label: "Pending Approval", color: QUO_LIFECYCLE["Pending Approval"] };
    return { label: q.status || "Draft", color: QUO_LIFECYCLE.Draft };
  }
  function markQuotationOfferSent(q, roleKey, mode, contact) {
    if (!q || mode === "preview") return;
    const keepDraft = q.status === "Draft" || q.status === "Pending Approval";
    store.update("quotations", q.id, {
      status: keepDraft ? q.status : "Sent",
      sentAt: keepDraft ? q.sentAt : (q.sentAt || today()),
      lastOfferMode: mode, lastOfferAt: Date.now(),
    }, roleKey);
    if (VG.enquiryOnOfferSent && q.enquiryId) VG.enquiryOnOfferSent(q, roleKey, mode, contact || q.contact || "");
  }
  function quotationEmailOffer(q, roleKey, onChange) {
    if (!q) return;
    const c = store.get("customers", q.customerId) || {};
    const t = computeQuote(q);
    const email = (c.email || q.contact || "").trim();
    const co = store.company().name || "Veraglo";
    const subj = encodeURIComponent("Quotation " + q.no + " from " + co);
    const body = encodeURIComponent("Dear " + (q.contact || "Sir/Madam") + ",\n\nPlease find our quotation " + q.no + " (" + fmtRev(q.rev || 0) + "), grand total " + inr(t.grand) + ".\n\nRegards,\n" + co);
    window.location.href = "mailto:" + encodeURIComponent(email) + "?subject=" + subj + "&body=" + body;
    markQuotationOfferSent(q, roleKey, "Email", email);
    VG.toast(email ? "Opening email to " + email : "Opening email — add customer email in master");
    onChange && onChange();
  }
  function quotationOfferDocument(q, roleKey, mode, onChange) {
    quotationPDF(q, mode);
    if (mode === "print" || mode === "download") markQuotationOfferSent(q, roleKey, mode === "print" ? "Print" : "Download", q.contact || "");
    onChange && onChange();
  }
  function quotationConvertPayload(q, roleKey) {
    const c = VG.normalizeCustomer ? VG.normalizeCustomer(store.get("customers", q.customerId) || {}) : (store.get("customers", q.customerId) || {});
    const t = computeQuote(q);
    const base = {
      quotationId: q.id, customerId: q.customerId, contact: q.contact,
      currency: q.currency || c.currency || "INR", exchangeRate: q.exchangeRate != null ? q.exchangeRate : 1,
      lines: q.lines, totals: q.totals || t,
      paymentTermsId: q.paymentTermsId, deliveryTermsId: q.deliveryTermsId,
      freight: q.freight, packing: q.packing, insurance: q.insurance,
      remarks: q.remarks, terms: q.terms, warranty: q.warranty,
      projectName: q.projectName, projectRef: q.projectRef, rfqRef: q.rfqRef, enquiryId: q.enquiryId,
      templateId: q.templateId, preparedBy: roleKey,
    };
    return VG.applyCustomerToTransaction ? VG.applyCustomerToTransaction(c, base) : { ...base, billing: q.billing || c.billing, shipping: q.shipping || c.shipping, gstin: q.gstin || c.gstin };
  }
  function buildSalesOrderDraftFromQuotation(q, roleKey) {
    const payload = quotationConvertPayload(q, roleKey);
    const t = computeQuote(q);
    return {
      ...payload,
      date: today(),
      deliveryDate: today(),
      priority: "Normal",
      priorityCustom: "",
      customerPoRef: "",
      customerPoDate: "",
      customerPoCopy: "",
      drawingsUpload: "",
      techDocsUpload: "",
      deliverySchedule: "",
      dispatchInstructions: "",
      packingInstructions: "",
      technicalSpec: "",
      specialInstructions: "",
      internalRemarks: "",
      documents: "",
      lines: (q.lines || []).map((l) => ({ ...l })),
      totals: t,
      sourceQuotationRev: q.rev || 0,
      _fromQuotation: true,
      _quotationNo: q.no,
      _quotationId: q.id,
    };
  }
  function buildSalesOrderDraftFromProforma(p, roleKey) {
    const t = p.totals || computeQuote(p);
    return {
      date: today(),
      customerId: p.customerId,
      contact: p.contact || "",
      billing: p.billing || "",
      shipping: p.shipping || "",
      billingAddressId: p.billingAddressId || "",
      shippingAddressId: p.shippingAddressId || "",
      gstin: p.gstin || "",
      currency: p.currency || "INR",
      exchangeRate: p.exchangeRate != null ? p.exchangeRate : 1,
      quotationId: p.quotationId || "",
      proformaId: p.id,
      lines: (p.lines || []).map((l) => ({ ...l })),
      totals: t,
      paymentTermsId: p.paymentTermsId || "",
      deliveryTermsId: p.deliveryTermsId || "",
      freight: p.freight || 0,
      packing: p.packing || 0,
      insurance: p.insurance || 0,
      remarks: p.remarks || "",
      deliveryDate: today(),
      priority: "Normal",
      customerPoRef: "",
      customerPoDate: "",
      customerPoCopy: "",
      drawingsUpload: "",
      techDocsUpload: "",
      deliverySchedule: "",
      dispatchInstructions: "",
      packingInstructions: "",
      technicalSpec: "",
      specialInstructions: "",
      internalRemarks: "",
      documents: "",
      preparedBy: roleKey,
      _fromProforma: true,
      _proformaNo: p.no,
    };
  }
  function buildProformaDraftFromQuotation(q, roleKey) {
    const payload = quotationConvertPayload(q, roleKey);
    const t = computeQuote(q);
    return {
      ...payload,
      date: today(),
      dueDate: today(),
      validityDays: q.validity || 15,
      quotationId: q.id,
      lines: (q.lines || []).map((l) => ({ ...l })),
      totals: t,
      sourceQuotationRev: q.rev || 0,
      _fromQuotation: true,
      _quotationNo: q.no,
      by: roleKey,
    };
  }
  function buildProformaDraftFromSO(so, roleKey) {
    return {
      date: today(),
      dueDate: today(),
      validityDays: 15,
      orderId: so.id,
      salesOrderId: so.id,
      customerId: so.customerId,
      contact: so.contact || "",
      billing: so.billing || "",
      shipping: so.shipping || "",
      billingAddressId: so.billingAddressId || "",
      shippingAddressId: so.shippingAddressId || "",
      gstin: so.gstin || "",
      currency: so.currency || "INR",
      exchangeRate: so.exchangeRate != null ? so.exchangeRate : 1,
      customerPoRef: so.customerPoRef || "",
      paymentTermsId: so.paymentTermsId || "",
      deliveryTermsId: so.deliveryTermsId || "",
      freight: so.freight || 0,
      packing: so.packing || 0,
      insurance: so.insurance || 0,
      lines: (so.lines || []).map((l) => ({ ...l })),
      totals: so.totals || computeQuote(so),
      quotationId: so.quotationId || "",
      _fromSalesOrder: true,
      _salesOrderNo: so.no,
      by: roleKey,
    };
  }
  function buildQuotationCloneDraft(q, roleKey) {
    const lines = (q.lines || []).map((l) => {
      const { key, ...rest } = l;
      return { ...rest };
    });
    return {
      date: today(),
      validity: q.validity != null ? q.validity : 15,
      customerId: q.customerId || "",
      contact: q.contact || "",
      billing: q.billing || "",
      shipping: q.shipping || "",
      billingAddressId: q.billingAddressId || "",
      shippingAddressId: q.shippingAddressId || "",
      gstin: q.gstin || "",
      currency: q.currency || "INR",
      exchangeRate: q.exchangeRate != null ? q.exchangeRate : 1,
      lines: lines.length ? lines : undefined,
      freight: q.freight || 0,
      packing: q.packing || 0,
      insurance: q.insurance || 0,
      paymentTermsId: q.paymentTermsId || "",
      deliveryTermsId: q.deliveryTermsId || "",
      warranty: q.warranty || DEFAULT_WARRANTY,
      roundOffMode: q.roundOffMode || "auto",
      roundOffEnabled: q.roundOffEnabled !== false,
      roundOff: q.roundOff,
      remarks: q.remarks || "",
      terms: q.terms || "",
      subject: q.subject || "",
      projectName: q.projectName || "",
      projectRef: q.projectRef || "",
      rfqRef: q.rfqRef || "",
      projectLocation: q.projectLocation || "",
      templateId: q.templateId || "",
      enquiryId: q.enquiryId || "",
      preparedBy: roleKey,
      status: "Draft",
      rev: 0,
      clonedFrom: q.id,
      clonedFromNo: q.no,
    };
  }
  async function openSalesOrderFromQuotation(q, roleKey, opts) {
    if (!q) return false;
    const existing = findSOFromQuotation(q);
    const qRevNo = q.rev || 0;
    const qRevText = fmtRev(qRevNo);
    if (existing && (existing.sourceQuotationRev ?? 0) >= qRevNo && !existing.sourceRevised) {
      VG.toast("Sales Order " + existing.no + " is already up to date", "info");
      return false;
    }
    if (existing) {
      const ok = await VG.confirmForward({
        title: "Forward latest revision",
        message: "This quotation has been revised (" + qRevText + "). Update existing Sales Order " + existing.no + " to the latest revision?",
        confirmLabel: "Yes, update " + existing.no,
      });
      if (!ok) return false;
      const payload = quotationConvertPayload(q, roleKey);
      store.update("salesOrders", existing.id, { ...payload, sourceQuotationRev: qRevNo, sourceRevised: false, sourceRevisedAt: null }, roleKey);
      store.audit(roleKey, "revise-forward", "salesOrders", existing.no, "Sales Order " + existing.no + " updated from Quotation " + q.no + " " + qRevText);
      VG.toast("Sales Order " + existing.no + " updated to latest revision");
      opts && opts.onDone && opts.onDone();
      return true;
    }
    return VG.workflowReview.start({
      action: "quotation:sales_order",
      fromType: "Quotation", fromNo: q.no, fromId: q.id,
      toType: "Sales Order", actor: roleKey, module: "sales",
      confirmMessage: "Do you want to generate Sales Order from this Quotation?",
      confirmLabel: "Yes, Generate SO",
      buildReview: () => buildSalesOrderDraftFromQuotation(q, roleKey),
      backToQuotationId: q.id,
      onDone: opts && opts.onDone,
      run: async () => null,
    }).then((r) => { if (r) { opts && opts.onClose && opts.onClose(); return true; } return false; });
  }
  async function openSalesOrderFromProforma(p, roleKey) {
    if (!p) return false;
    const existing = store.list("salesOrders").find((o) => o.proformaId === p.id || (p.quotationId && o.quotationId === p.quotationId));
    if (existing) {
      VG.toast("Sales Order " + existing.no + " already exists", "info");
      VG._pendingSalesOrderView = existing.id;
      if (VG.goTo) VG.goTo("sales", "orders");
      return false;
    }
    if (!VG.workflowReview) return false;
    return VG.workflowReview.start({
      action: "proforma:sales_order",
      fromType: "Proforma Invoice", fromNo: p.no, fromId: p.id,
      toType: "Sales Order", actor: roleKey, module: "sales",
      confirmMessage: "Do you want to generate Sales Order from this Proforma Invoice?",
      confirmLabel: "Yes, Generate SO",
      buildReview: () => buildSalesOrderDraftFromProforma(p, roleKey),
      run: async () => null,
    }).then(Boolean);
  }
  async function openProformaFromQuotation(q, roleKey, opts) {
    if (!q || !VG.workflowReview) return false;
    return VG.workflowReview.start({
      action: "quotation:proforma",
      fromType: "Quotation", fromNo: q.no, fromId: q.id,
      toType: "Proforma Invoice", actor: roleKey, module: "sales",
      buildReview: () => buildProformaDraftFromQuotation(q, roleKey),
      backToQuotationId: q.id,
      onDone: opts && opts.onDone,
      run: async () => null,
    }).then((r) => !!r);
  }
  function openQuotationClone(q, roleKey) {
    if (!q) return;
    VG._pendingQuotationClone = buildQuotationCloneDraft(q, roleKey);
    if (VG.goTo) VG.goTo("sales", "quotations");
  }
  VG.buildSalesOrderDraftFromQuotation = buildSalesOrderDraftFromQuotation;
  VG.buildProformaDraftFromQuotation = buildProformaDraftFromQuotation;
  VG.buildProformaDraftFromSO = buildProformaDraftFromSO;
  VG.openProformaFromQuotation = openProformaFromQuotation;
  VG.openSalesOrderFromQuotation = openSalesOrderFromQuotation;
  VG.openSalesOrderFromProforma = openSalesOrderFromProforma;
  VG.buildQuotationCloneDraft = buildQuotationCloneDraft;
  VG.openQuotationClone = openQuotationClone;
  VG.ensureSOFromQuotation = ensureSOFromQuotation;
  function ensureSOFromQuotation(q, roleKey) {
    const existing = findSOFromQuotation(q);
    if (!existing) return null;
    if (store._ensureSOAddresses) return store._ensureSOAddresses(existing, roleKey);
    return existing;
  }

  /* ---------- quotation PDF ---------- */
  function quotationPDF(q, mode) {
    const doc = quotationDoc(q);
    const tid = q.templateId || (store.getSelectedTemplateId && store.getSelectedTemplateId("Quotation"));
    printDocument({ ...doc, docType: "Quotation", templateId: tid }, mode);
  }
  function quotationDoc(q) {
    const c = VG.normalizeCustomer ? VG.normalizeCustomer(store.get("customers", q.customerId) || {}) : (store.get("customers", q.customerId) || {});
    const t = computeQuote(q);
    const pt = (store.get("paymentTerms", q.paymentTermsId) || {}).name || "—";
    const dt = (store.get("deliveryTerms", q.deliveryTermsId) || {}).name || "—";
    const cur = q.currency || c.currency || "INR";
    const fmt = (n) => (cur === "INR" ? inr(n) : (cur + " " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })));
    if (VG.buildQuotationDocument) {
      const tpl = VG.resolveDocTemplate ? VG.resolveDocTemplate("Quotation", q.templateId) : {};
      const usePremium = tpl.themeId === "industrial" || tpl.docVariant === "quotation-international" || !q.templateId || !["minimal", "classic"].includes(tpl.themeId);
      if (usePremium) {
        return VG.buildQuotationDocument({
          quotation: q,
          customer: c,
          totals: t,
          paymentTerms: pt,
          deliveryTerms: dt,
          templateId: q.templateId,
          lines: mapIndustrialDocLines(q.lines, fmt),
        });
      }
    }
    if (VG.buildTransactionDocument) {
      return VG.buildTransactionDocument({
        docType: "Quotation",
        docTitle: "Quotation",
        subtitle: store.company().name,
        meta: [
          ["Quotation No.", (q.no || "") + (q.rev != null ? " · " + fmtRev(q.rev) : "")],
          ["Date", q.date || ""],
          ["Valid for", (q.validity || "—") + " days"],
          ["Status", q.status || ""],
          ["Currency", cur],
        ],
        parties: {
          billTo: `${c.legalName || c.name || ""}<br>${(q.billing || "").replace(/\n/g, "<br>")}<br><span class="vg-muted">GSTIN ${q.gstin || "—"} · ${q.contact || ""}</span>`,
          shipTo: `${c.legalName || c.name || ""}<br>${(q.shipping || "").replace(/\n/g, "<br>")}`,
        },
        columns: [
          { key: "no", label: "Sr. No." }, { key: "itemNameSku", label: "Item Name / SKU" }, { key: "desc", label: "Item Description" }, { key: "hsn", label: "HSN/SAC" },
          { key: "qty", label: "Qty", align: "right" }, { key: "unit", label: "Unit" }, { key: "rate", label: "Rate", align: "right" },
          { key: "disc", label: "Disc %", align: "right" }, { key: "tax", label: "Tax %", align: "right" },
          { key: "amount", label: "Amount", align: "right" },
        ],
        lines: mapIndustrialDocLines(q.lines, fmt),
        totals: { sub: t.sub, discount: t.discount, taxable: t.taxable, tax: t.tax, charges: t.charges, grand: t.grand },
        taxBreakdown: t.tax ? [{ label: "GST", amount: t.tax }] : [],
        termsBlock: `<b>Payment:</b> ${pt} &nbsp;|&nbsp; <b>Delivery:</b> ${dt} &nbsp;|&nbsp; <b>Warranty:</b> ${q.warranty || "—"}<br>${q.remarks ? "<b>Remarks:</b> " + q.remarks + "<br>" : ""}<b>Terms &amp; Conditions:</b><br>${(q.terms || "").replace(/\n/g, "<br>")}`,
        signatories: { prepared: q.preparedBy, checked: q.checkedBy, approved: q.approvedBy || "Pending" },
        templateId: q.templateId,
      });
    }
    const rows = (q.lines || []).map((l, i) => {
      const cc = computeLine(l);
      const name = l.name || l.desc || "";
      const sku = l.sku || "";
      return `<tr><td>${i + 1}</td><td><b>${name}</b><br><span style="color:#6b7280;font-size:8pt">SKU: ${sku}</span></td><td>${(lineDescUi(l) || "").replace(/\n/g, "<br>")}</td><td>${l.hsn || ""}</td><td class="vg-right">${l.qty} ${l.unit}</td><td class="vg-right">${inr(l.rate)}</td><td class="vg-right">${l.discountPct || 0}%</td><td class="vg-right">${l.taxPct}%</td><td class="vg-right">${inr(cc.total)}</td></tr>`;
    }).join("");
    const inner = `<div class="vg-cols"><div class="vg-card"><b>Bill To</b>${c.name || ""}<br>${q.billing || ""}</div></div><table class="vg-tbl"><thead><tr><th>#</th><th>Item</th><th class="vg-right">Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="vg-totals"><div class="grand"><span>Grand Total</span><span>${inr(t.grand)}</span></div></div>`;
    return { title: "Quotation", subtitle: q.no + " · " + fmtRev(q.rev || 0), inner, docType: "Quotation" };
  }

  /* ---------- quotation view ---------- */
  function QuotationView({ q, onClose, roleKey, can, onChange, onEdit, go }) {
    if (!q) return null;
    const t = computeQuote(q);
    const act = (patch, msg) => { store.update("quotations", q.id, patch, roleKey); VG.toast(msg); onChange(); };
    function approve() {
      if (!can("approve")) return VG.toast("You don't have approval rights", "error");
      const remarks = window.prompt("Approval remarks (optional):", "") || "";
      if (VG.approvalEngine) {
        const r = VG.approvalEngine.approveQuotation(q.id, roleKey, remarks);
        if (r.reason === "remarks_required") return VG.toast("Remarks are mandatory for this workflow", "warn");
        if (!r.ok && r.reason === "no_rights") return VG.toast("You don't have approval rights", "error");
      } else {
        act({ status: "Approved", approvedBy: roleKey, discountApproved: true }, "Quotation approved");
        return;
      }
      VG.toast("Quotation approved");
      onChange();
    }
    const linkedPI = findProformaFromQuotation(q);
    const linkedShip = findShipmentFromQuotation(q);
    const qRevNo = q.rev || 0;
    const qRevText = fmtRev(qRevNo);
    async function convertSO() {
      await openSalesOrderFromQuotation(q, roleKey, { onClose, onDone: onChange });
    }
    async function convertProforma() {
      if (linkedPI && (linkedPI.sourceQuotationRev ?? 0) >= qRevNo && !linkedPI.sourceRevised) {
        VG.toast("Proforma " + linkedPI.no + " is already up to date", "info");
        return;
      }
      if (linkedPI) {
        const ok = await VG.confirmForward({
          title: "Forward latest revision",
          message: "This quotation has been revised (" + qRevText + "). Update existing Proforma Invoice " + linkedPI.no + " to the latest revision?",
          confirmLabel: "Yes, update " + linkedPI.no,
        });
        if (!ok) return;
        const payload = quotationConvertPayload(q, roleKey);
        store.update("proformas", linkedPI.id, { ...payload, sourceQuotationRev: qRevNo, sourceRevised: false, sourceRevisedAt: null }, roleKey);
        store.audit(roleKey, "revise-forward", "proformas", linkedPI.no, "Proforma " + linkedPI.no + " updated from Quotation " + q.no + " " + qRevText);
        VG.toast("Proforma " + linkedPI.no + " updated to latest revision");
        onChange();
        return;
      }
      await VG.forwardDocument({
        action: "quotation:proforma",
        fromType: "Quotation", fromNo: q.no, fromId: q.id,
        toType: "Proforma Invoice", actor: roleKey, module: "sales",
        buildReview: () => buildProformaDraftFromQuotation(q, roleKey),
        run: (draft) => {
          const d = draft || buildProformaDraftFromQuotation(q, roleKey);
          const clean = (d.lines || []).map(({ key, ...l }) => l);
          return store.create("proformas", {
            no: store.nextNo("PI", today()), date: today(), quotationId: q.id,
            ...d, lines: clean, status: "Issued", by: roleKey, sourceQuotationRev: qRevNo,
          }, roleKey);
        },
        onDone: () => onChange(),
      });
    }
    async function convertInvoice() {
      if (!can("add")) return VG.toast("You don't have permission to create invoices", "error");
      const existing = findInvoiceFromQuotation(q);
      if (existing) {
        VG.toast("Invoice " + existing.no + " already exists — opening", "warn");
        openInvoiceFromQuotation(existing, onClose, go);
        return;
      }
      await VG.forwardDocument({
        action: "quotation:invoice",
        fromType: "Quotation", fromNo: q.no, fromId: q.id,
        toType: "Tax Invoice", actor: roleKey, module: "sales",
        buildReview: () => {
          const so = findSOFromQuotation(q);
          if (!so) return null;
          return store.buildInvoiceDraftFromSO ? store.buildInvoiceDraftFromSO(so.id) : null;
        },
        run: async (draft) => {
          const so = findSOFromQuotation(q);
          if (!so) {
            VG.toast("Create a sales order first — opening sales order form", "warn");
            await openSalesOrderFromQuotation(q, roleKey, { onClose });
            return null;
          }
          if (VG.openInvoiceBuilder) {
            const invDraft = draft || store.buildInvoiceDraftFromSO(so.id);
            if (invDraft) { VG.openInvoiceBuilder(invDraft); onClose && onClose(); }
            return invDraft ? { id: so.id, no: "(draft opened)" } : null;
          }
          const inv = store.createInvoiceFromSO(so.id, roleKey);
          if (inv) { onChange(); openInvoiceFromQuotation(inv, onClose, go); }
          return inv;
        },
        failMessage: "Could not create invoice — add customer billing address in Customer master",
        onDone: () => onChange(),
      });
    }
    async function convertDispatch() {
      const soForShip = findSOFromQuotation(q);
      const existingShip = linkedShip || (soForShip ? store.list("shipments").find((s) => s.salesOrderId === soForShip.id && s.status !== "Cancelled") : null);
      await VG.forwardDocument({
        action: "quotation:dispatch",
        fromType: "Quotation", fromNo: q.no, fromId: q.id,
        toType: "Dispatch", actor: roleKey, module: "sales",
        sourceCollection: "quotations",
        duplicate: existingShip ? { exists: true, no: existingShip.no, label: "Shipment", linked: existingShip } : null,
        buildReview: (src) => {
          const so = findSOFromQuotation(q);
          return { destination: (so && so.shipping) || src.shipping || "", dispatchNotes: "" };
        },
        run: (draft) => {
          const so = findSOFromQuotation(q);
          if (!so) { VG.toast("Create a sales order first before dispatch", "error"); return null; }
          const dest = (draft && draft.destination) || so.shipping;
          if (!dest) { VG.toast("Set customer shipping address before dispatch", "error"); return null; }
          return store.createShipmentFromSO(so.id, { destination: dest, dispatchNotes: draft && draft.dispatchNotes }, roleKey);
        },
        statusChange: "Dispatch Planned",
        onDone: () => onChange(),
      });
    }
    const cust = VG.normalizeCustomer ? VG.normalizeCustomer(store.get("customers", q.customerId) || {}) : (store.get("customers", q.customerId) || {});
    const billAddr = VG.customerAddr ? VG.customerAddr(cust, "billing") : {};
    const custRegion = billAddr.addr
      ? [billAddr.addr.city, billAddr.addr.state, billAddr.addr.country].filter(Boolean).join(", ")
      : (q.projectLocation || cust.state || "");
    const linkedSO = findSOFromQuotation(q);
    const linkedInv = findInvoiceFromQuotation(q);
    const lifecycle = quotationLifecycleStatus(q);
    const canConvert = q.status === "Approved" || q.status === "Sent" || q.status === "Won";
    return (
      <InternalScreen onBack={onClose} backLabel="Back to quotations" title={"Quotation " + q.no} subtitle={fmtRev(q.rev || 0) + " · " + custName(q.customerId)}
        footer={<>
          <DocActions docType="Quotation" build={() => quotationDoc(q)}
            onDocument={(mode) => { markQuotationOfferSent(q, roleKey, mode === "print" ? "Print" : mode === "download" ? "Download" : mode, q.contact || ""); onChange(); }}
            onEmail={() => quotationEmailOffer(q, roleKey, onChange)} />
          {can("edit") && <Button variant="soft" icon="edit" onClick={() => onEdit(q)}>Edit / Revise</Button>}
          {q.status === "Pending Approval" && can("approve") && <Button icon="check" onClick={approve}>Approve</Button>}
          {can("edit") && VG.customerPortal && (
            <Button variant="soft" icon="link" onClick={async () => {
              const link = VG.customerPortal.createQuotationPortalLink(q.id, roleKey);
              if (!link) return VG.toast("Could not create portal link", "error");
              await VG.customerPortal.copyPortalUrl(link.url);
              onChange();
            }} title="Customer portal link">Share portal</Button>
          )}
          {canConvert && can("add") && (() => {
            const piStale = !!linkedPI && ((linkedPI.sourceQuotationRev ?? 0) < qRevNo || linkedPI.sourceRevised);
            const soStale = !!linkedSO && ((linkedSO.sourceQuotationRev ?? 0) < qRevNo || linkedSO.sourceRevised);
            return <>
              <Button variant="soft" icon="rupee" onClick={convertProforma} disabled={!!linkedPI && !piStale} title={linkedPI ? (piStale ? "Quotation revised — update Proforma " + linkedPI.no : "Proforma " + linkedPI.no + " already exists") : ""}>{piStale ? "Update Proforma" : "Proforma Invoice"}</Button>
              <Button icon="cart" onClick={convertSO} disabled={!!linkedSO && !soStale} title={linkedSO ? (soStale ? "Quotation revised — update Sales Order " + linkedSO.no : "SO " + linkedSO.no + " already exists") : ""}>{soStale ? "Update Sales Order" : "Sales Order"}</Button>
              <Button variant="soft" icon="rupee" onClick={convertInvoice} disabled={!!linkedInv} title={linkedInv ? "Invoice " + linkedInv.no + " already exists" : ""}>Tax Invoice</Button>
              <Button variant="soft" icon="truck" onClick={convertDispatch} disabled={!!linkedShip} title={linkedShip ? "Shipment " + linkedShip.no + " already exists" : ""}>Dispatch</Button>
            </>;
          })()}
          {q.status !== "Won" && q.status !== "Lost" && <><Button variant="ghost" onClick={() => act({ status: "Lost" }, "Marked Lost")}>Lost</Button><Button variant="ghost" onClick={() => act({ status: "Won" }, "Marked Won")}>Won</Button></>}
        </>}>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <StatusTag value={lifecycle.label} map={QUO_LIFECYCLE} />
          <Pill color="#64748b">{qRevText}</Pill>
          {lifecycle.detail && <span className="text-xs opacity-60 font-mono">{lifecycle.detail}</span>}
          {q.needsDiscountApproval && <Pill color="#f59e0b">discount approval</Pill>}
          {q.lastOfferMode && <span className="text-xs opacity-50">via {q.lastOfferMode}</span>}
          {q.portalViews > 0 && <Pill color="#60a5fa">Client viewed ×{q.portalViews}</Pill>}
          <span className="text-sm opacity-60 ml-auto">{q.date} · valid {q.validity} days</span>
        </div>
        {(() => {
          const stale = [linkedPI, linkedSO].filter((c) => c && ((c.sourceQuotationRev ?? 0) < qRevNo || c.sourceRevised));
          if (!stale.length) return null;
          return (
            <div className="mb-3 text-xs rounded-lg p-2.5 flex items-center gap-2" style={{ background: "#f59e0b22", color: "#f59e0b" }}>
              <Icon name="alert" size={13} />
              Quotation revised ({qRevText}). {stale.map((c) => c.no).join(", ")} need update — use the Update button(s) below to forward the latest revision.
            </div>
          );
        })()}
        {canConvert && (
          <Card className="p-3 mb-4 text-xs">
            <div className="text-[11px] uppercase opacity-55 mb-2">Conversion workflow</div>
            <div className="flex flex-wrap items-center gap-1 opacity-80">
              <Pill color="#3b82f6">Quotation</Pill><Icon name="chevronRight" size={12} className="opacity-40" />
              <Pill color="#8b5cf6">Proforma</Pill><Icon name="chevronRight" size={12} className="opacity-40" />
              <Pill color="#10b981">Sales Order</Pill><Icon name="chevronRight" size={12} className="opacity-40" />
              <Pill color="#f59e0b">Tax Invoice</Pill><Icon name="chevronRight" size={12} className="opacity-40" />
              <Pill color="#06b6d4">Dispatch</Pill>
            </div>
            {linkedSO && <div className="mt-2 opacity-60">Linked SO: <span className="font-mono">{linkedSO.no}</span></div>}
            {linkedInv && (
              <div className="mt-2 flex items-center gap-2">
                <span className="opacity-60">Linked Invoice:</span>
                <button type="button" onClick={() => openInvoiceFromQuotation(linkedInv, onClose, go)} className={"font-mono " + docNoLinkCls}>{linkedInv.no}</button>
              </div>
            )}
            <div className="mt-2 opacity-50">Tax Invoice pulls billing/shipping from customer master when converting from quotation.</div>
          </Card>
        )}
        <Card className="p-3 mb-4 text-sm">
          <div className="text-[11px] uppercase opacity-55 mb-1">Customer</div>
          <div className="font-medium">{custName(q.customerId)}</div>
          {q.contact && <div className="opacity-60 text-xs mt-1">Attention: {q.contact}</div>}
          {custRegion && <div className="opacity-60 text-xs mt-1">{custRegion}</div>}
          {(q.projectName || q.rfqRef) && <div className="opacity-60 text-xs mt-1">{q.projectName ? "Project: " + q.projectName : ""}{q.rfqRef ? " · RFQ: " + q.rfqRef : ""}</div>}
        </Card>
        <div className="overflow-x-auto rounded-xl glass mb-3">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase opacity-55"><tr className="text-left border-b border-white/10"><th className="px-3 py-2">Item Name / SKU</th><th className="px-3 py-2">Item Description</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Disc</th><th className="px-3 py-2 text-right">Tax</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
            <tbody>{(q.lines || []).map((l, i) => { const c = computeLine(l); return <tr key={i} className="border-b border-white/5"><td className="px-3 py-2"><div className="font-medium">{l.name || l.desc || "—"}</div><div className="font-mono text-[10px] opacity-50">SKU: {l.sku || "—"}</div></td><td className="px-3 py-2 text-sm whitespace-pre-wrap opacity-80">{lineDescUi(l) || "—"}</td><td className="px-3 py-2 text-right">{l.qty} {l.unit}</td><td className="px-3 py-2 text-right">{inr(l.rate)}</td><td className="px-3 py-2 text-right">{l.discountPct || 0}%</td><td className="px-3 py-2 text-right">{l.taxPct}%</td><td className="px-3 py-2 text-right font-medium">{inr(c.total)}</td></tr>; })}</tbody>
          </table>
        </div>
        <div className="flex justify-end"><div className="w-64 text-sm space-y-1">
          <div className="flex justify-between opacity-70"><span>Taxable</span><span>{inr(t.taxable)}</span></div>
          <div className="flex justify-between opacity-70"><span>GST</span><span>{inr(t.tax)}</span></div>
          <div className="flex justify-between opacity-70"><span>Charges</span><span>{inr(t.charges)}</span></div>
          <div className="flex justify-between font-semibold text-sm border-t border-white/10 pt-1"><span>Grand total</span><span>{inr(t.grand)}</span></div>
          {t.roundOff ? <div className="flex justify-between opacity-70 text-sm"><span>Round off</span><span>{t.roundOff > 0 ? "+" : ""}{inr(t.roundOff)}</span></div> : null}
          {t.roundOff ? <div className="flex justify-between font-semibold text-base border-t border-white/10 pt-1"><span>Final amount</span><span>{inr(t.final)}</span></div> : null}
        </div></div>
        {q.history && q.history.length > 0 && (
          <div className="mt-4"><div className="text-[11px] uppercase opacity-55 mb-2">Revision history</div>
            <ul className="space-y-1 text-xs">{q.history.slice().reverse().map((h, i) => {
              const label = fmtRev(h.rev == null ? 0 : h.rev);
              const note = (h.note || "").replace(/\bby\s+[\w.@+-]+/gi, "").replace(/\(rev\s*\d+\)/gi, "").trim();
              return <li key={i} className="flex gap-2"><Pill color="#a78bfa">{label}</Pill><span className="opacity-70">{h.date}{note ? " — " + note : ""}</span></li>;
            })}</ul></div>
        )}
      </InternalScreen>
    );
  }

  /* ================= Sections ================= */
  function QuotationsPage({ roleKey, can, go }) {
    VG.useDB();
    const [builder, setBuilder] = useState(null); // {} or record
    const [view, setView] = useState(null);
    useEffect(() => {
      if (VG._pendingQuotationFromEnquiry) {
        const seed = VG._pendingQuotationFromEnquiry;
        VG._pendingQuotationFromEnquiry = null;
        const lines = (seed.lines || []).map((l) => ({ ...l, key: Math.random().toString(36).slice(2) }));
        setBuilder({ date: today(), validity: 15, currency: "INR", exchangeRate: 1, ...seed, lines: lines.length ? lines : undefined });
      }
      if (VG._pendingQuotationClone) {
        const draft = VG._pendingQuotationClone;
        VG._pendingQuotationClone = null;
        const lines = (draft.lines || [{ ...blankLine(), key: Math.random().toString(36).slice(2) }]).map((l) => ({ ...l, key: l.key || Math.random().toString(36).slice(2) }));
        setBuilder({ ...draft, lines });
      }
      if (VG._pendingQuotationView) {
        const id = VG._pendingQuotationView;
        VG._pendingQuotationView = null;
        const q = store.get("quotations", id);
        if (q) setView(q);
      }
    }, []);
    const rowsAll = store.list("quotations").slice().reverse();
    const rows = VG.useFilteredCustomerRows ? VG.useFilteredCustomerRows(rowsAll) : rowsAll;
    const cols = [
      {
        key: "no", label: "Quotation #",
        render: (r) => (
          <button type="button" onClick={() => setView(r)} className={docNoLinkCls}>
            {r.no}<span className="opacity-50 no-underline"> {fmtRev(r.rev || 0)}</span>
          </button>
        ),
        csv: (r) => r.no + " " + fmtRev(r.rev || 0),
      },
      { key: "customerId", label: "Customer", render: (r) => custName(r.customerId), csv: (r) => custName(r.customerId) },
      { key: "date", label: "Date" },
      { key: "grand", label: "Value", render: (r) => inr((r.totals || computeQuote(r)).grand), csv: (r) => (r.totals || computeQuote(r)).grand },
      {
        key: "status", label: "Status",
        render: (r) => {
          const st = quotationLifecycleStatus(r);
          return <span title={st.detail || undefined}><StatusTag value={st.label} map={QUO_LIFECYCLE} /></span>;
        },
        csv: (r) => quotationLifecycleStatus(r).label,
      },
      VG.wfColumn((r) => VG.workflow.quotation(r, {
        roleKey, can,
        onRefresh: () => {},
        quotationPDF,
        quotationEmailOffer,
        quotationConvertPayload,
        ensureSOFromQuotation,
      }), {
        can, maxVisible: 6,
        onView: (r) => setView(r),
        onEdit: can("edit") ? (r) => setBuilder(r) : null,
        onDelete: can("delete") ? async (r) => {
          if (await VG.confirm({ title: "Delete quotation " + r.no + "?", danger: true, confirmLabel: "Delete" })) {
            store.remove("quotations", r.id, roleKey);
            VG.toast("Deleted");
          }
        } : null,
      }),
    ];
    if (builder) {
      return <QuotationBuilder open onClose={() => setBuilder(null)} roleKey={roleKey} can={can} initial={builder && (builder.id || builder.clonedFrom || Object.keys(builder).length) ? builder : null} onSaved={() => {}} />;
    }
    if (view) {
      const qLive = store.get("quotations", view.id) || view;
      return (
        <QuotationView q={qLive} onClose={() => setView(null)} roleKey={roleKey} can={can} go={go}
          onChange={() => setView(store.get("quotations", view.id) || view)}
          onEdit={(q) => { setView(null); setBuilder(q); }} />
      );
    }
    return (
      <ListPage title="Quotations" desc="Click quotation number to open · PDF, print, and email from Actions" onNew={() => setBuilder({})} newLabel="Add Quotation" can={can}>
        {VG.CustomerFilterBanner ? <VG.CustomerFilterBanner /> : null}
        <RecordTable embedded suppressNew tableId="sales-quotations" title="Quotation List" columns={cols} rows={rows} can={can} printTitle="Quotations"
          searchKeys={["no", "status"]} filters={[{ key: "status", label: "All status", get: (r) => quotationLifecycleStatus(r).label, options: QUO_LIFECYCLE_FILTER }]}
          onNew={() => setBuilder({})} />
      </ListPage>
    );
  }

  function LeadsPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const rows = store.list("leads").slice().reverse();
    const cols = [
      { key: "no", label: "Lead #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "customerId", label: "Customer", render: (r) => custName(r.customerId), csv: (r) => custName(r.customerId) },
      { key: "title", label: "Title" }, { key: "value", label: "Est. value", render: (r) => inr(r.value), csv: (r) => r.value },
      { key: "stage", label: "Stage", render: (r) => <Pill color="#6366f1">{r.stage}</Pill> },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={{ Open: "#60a5fa", Won: "#22c55e", Lost: "#ef4444" }} /> },
    ];
    function save(form) {
      if (!form.customerId) return VG.toast("Select customer from master", "error");
      if (form.id) { store.update("leads", form.id, form, roleKey); VG.toast("Lead updated"); }
      else { store.create("leads", { ...form, no: store.nextNo("LEAD", form.date || today()), owner: roleKey }, roleKey); VG.toast("Lead created"); }
      setEdit(null);
    }
    const leadFields = [{ k: "customerId", l: "Customer", master: "customers", req: true }, { k: "title", l: "Title", req: true }, { k: "value", l: "Est. value (₹)", num: true }, { k: "date", l: "Date", date: true }, { k: "source", l: "Source", select: ["Website", "Referral", "Exhibition", "Cold call"] }, { k: "stage", l: "Stage", select: ["New", "Qualified", "Proposal", "Negotiation"] }, { k: "status", l: "Status", select: ["Open", "Won", "Lost"] }, { k: "remarks", l: "Remarks", area: true, full: true }];
    if (edit) {
      return <MasterForm title="Lead" open onClose={() => setEdit(null)} record={edit} onSave={save} fields={leadFields} roleKey={roleKey} can={can} />;
    }
    return (
      <ListPage title="Lead Management" desc="Capture, qualify, and progress leads to orders" onNew={() => setEdit({ date: today(), stage: "New", status: "Open" })} newLabel="Add Lead" can={can}>
        <RecordTable embedded suppressNew title="Lead List" columns={cols} rows={rows} can={can} printTitle="Leads" searchKeys={["no", "title", "stage"]}
          filters={[{ key: "status", label: "All status", options: ["Open", "Won", "Lost"] }, { key: "stage", label: "All stages", options: ["New", "Qualified", "Proposal", "Negotiation"] }]}
          onNew={() => setEdit({ date: today(), stage: "New", status: "Open" })} onView={(r) => setEdit(r)} onEdit={can("edit") ? (r) => setEdit(r) : null}
          onDelete={can("delete") ? async (r) => { if (await VG.confirm({ title: "Delete lead?", danger: true, confirmLabel: "Delete" })) { store.remove("leads", r.id, roleKey); VG.toast("Deleted"); } } : null} />
      </ListPage>
    );
  }

  function FollowupsPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const rowsAll = store.list("followups").slice().reverse();
    const rows = VG.useFilteredCustomerRows ? VG.useFilteredCustomerRows(rowsAll) : rowsAll;
    const td = today();
    const overdue = (r) => r.status === "Pending" && (r.date || "") < td;
    const dueToday = rows.filter((r) => r.status === "Pending" && r.date === td);
    const enqNo = (r) => r.refType === "Enquiry" && r.refId ? ((store.get("enquiries", r.refId) || {}).no || r.refId) : "—";
    const cols = [
      { key: "date", label: "Due", render: (r) => <span className={overdue(r) ? "text-rose-400 font-medium" : ""}>{r.date}{r.time ? " " + r.time : ""}{overdue(r) && " ⚠"}</span> },
      { key: "customerId", label: "Customer", render: (r) => custName(r.customerId), csv: (r) => custName(r.customerId) },
      { key: "refId", label: "Enquiry", render: (r) => r.refType === "Enquiry" ? <span className="font-mono text-xs">{enqNo(r)}</span> : <span className="opacity-40">—</span> },
      { key: "mode", label: "Mode", render: (r) => <Pill color="#0ea5e9">{r.mode}</Pill> },
      { key: "note", label: "Remarks" },
      { key: "nextDate", label: "Next follow-up", render: (r) => r.nextDate || "—" },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={{ Pending: "#f59e0b", Done: "#22c55e" }} /> },
    ];
    function save(form) {
      if (!form.customerId) return VG.toast("Select customer from master", "error");
      const prev = form.id ? store.get("followups", form.id) : null;
      if (form.id) { store.update("followups", form.id, form, roleKey); VG.toast("Follow-up updated"); }
      else { store.create("followups", { ...form, owner: roleKey }, roleKey); VG.toast("Follow-up scheduled"); }
      if (form.status === "Done" && form.refType === "Enquiry" && form.refId && VG.enquiryOnFollowupDone) {
        VG.enquiryOnFollowupDone(form.refId, form, roleKey);
      } else if (prev && prev.status === "Pending" && form.status === "Done" && form.refType === "Enquiry" && form.refId && VG.enquiryOnFollowupDone) {
        VG.enquiryOnFollowupDone(form.refId, form, roleKey);
      }
      setEdit(null);
    }
    const followFields = [{ k: "customerId", l: "Customer", master: "customers", req: true }, { k: "date", l: "Follow-up date", date: true, req: true }, { k: "time", l: "Time" }, { k: "mode", l: "Mode", select: ["Call", "Email", "WhatsApp", "Meeting", "Visit"] }, { k: "nextDate", l: "Next follow-up date", date: true }, { k: "status", l: "Status", select: ["Pending", "Done"] }, { k: "note", l: "Remarks", area: true, full: true, req: true }];
    if (edit) {
      return <MasterForm title="Follow-up" open onClose={() => setEdit(null)} record={edit} onSave={save} fields={followFields} roleKey={roleKey} can={can} />;
    }
    return (
      <ListPage title="Follow-up System" desc="Schedule calls, emails and meetings — linked to enquiries where applicable" onNew={() => setEdit({ date: today(), time: "10:00", mode: "Call", status: "Pending" })} newLabel="Add Follow-up" can={can}>
        {VG.CustomerFilterBanner ? <VG.CustomerFilterBanner /> : null}
        <div className="flex flex-wrap gap-2 mb-3">
          <Pill color="#f59e0b">{rows.filter(overdue).length} overdue</Pill>
          <Pill color="#60a5fa">{dueToday.length} due today</Pill>
        </div>
        <RecordTable embedded suppressNew title="Follow-up List" columns={cols} rows={rows} can={can} printTitle="Follow-ups" searchKeys={["note", "mode"]}
          filters={[{ key: "status", label: "All status", options: ["Pending", "Done"] }, { key: "refType", label: "All types", options: ["Enquiry", ""] }]}
          onNew={() => setEdit({ date: today(), time: "10:00", mode: "Call", status: "Pending" })} onView={(r) => setEdit(r)} onEdit={can("edit") ? (r) => setEdit(r) : null}
          onDelete={can("delete") ? async (r) => { if (await VG.confirm({ title: "Delete follow-up?", danger: true, confirmLabel: "Delete" })) { store.remove("followups", r.id, roleKey); VG.toast("Deleted"); } } : null} />
      </ListPage>
    );
  }

  function OrdersPage({ roleKey, can }) {
    VG.useDB();
    const [view, setView] = useState(null);
    const [builder, setBuilder] = useState(null);
    useEffect(() => {
      if (VG._pendingSalesOrderCreate) {
        VG._pendingSalesOrderCreate = false;
        setBuilder({});
      }
      if (VG._pendingSalesOrderFromQuotation) {
        const pending = VG._pendingSalesOrderFromQuotation;
        VG._pendingSalesOrderFromQuotation = null;
        const draft = pending.draft || {};
        const lines = (draft.lines || []).map((l) => ({ ...l, key: Math.random().toString(36).slice(2) }));
        setBuilder({ ...draft, lines: lines.length ? lines : [blankLine()], _backToQuotationId: pending.backToQuotationId || draft._quotationId });
      }
    }, []);
    useEffect(() => {
      if (VG._pendingSalesOrderView) {
        const id = VG._pendingSalesOrderView;
        VG._pendingSalesOrderView = null;
        const so = store.get("salesOrders", id);
        if (so) setView(so);
      }
    }, []);
    const rowsAll = store.list("salesOrders").slice().reverse();
    const rows = VG.useFilteredCustomerRows ? VG.useFilteredCustomerRows(rowsAll) : rowsAll;
    const cols = [
      { key: "no", label: "Order #", render: (r) => <button type="button" onClick={() => setView(r)} className={docNoLinkCls}>{r.no}{r.revisionNo != null ? <span className="opacity-50 no-underline"> {fmtRev(r.revisionNo)}</span> : null}</button> },
      { key: "customerId", label: "Customer", render: (r) => custName(r.customerId), csv: (r) => custName(r.customerId) },
      { key: "date", label: "Date" },
      { key: "grand", label: "Value", render: (r) => inr((r.totals || {}).grand || 0), csv: (r) => (r.totals || {}).grand || 0 },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={ORD_STATUS} /> },
      VG.wfColumn((r) => VG.workflow.salesOrder(r, {
        roleKey, can,
        onRefresh: () => setView((v) => v && store.get("salesOrders", v.id)),
        advance,
        makeProforma,
        findProformaFromSO,
        findInvoiceFromSO,
        findShipmentFromSO,
        findWOFromSO,
      }), {
        can, maxVisible: 6,
        onView: (r) => setView(r),
      }),
    ];
    async function advance(r) {
      const i = ORDER_FLOW.indexOf(r.stage || r.status);
      if (i < 0 || i >= ORDER_FLOW.length - 1) return;
      const next = ORDER_FLOW[i + 1];
      await VG.forwardStatus({
        action: "sales_order:stage",
        fromType: "Sales Order", fromNo: r.no, fromId: r.id,
        toType: "Sales Order", statusChange: next, actor: roleKey, module: "sales",
        sourceCollection: "salesOrders",
        confirmMessage: "Are you sure you want to advance Sales Order " + r.no + " to \"" + next + "\"?",
        buildReview: () => ({ stageNotes: "", nextStage: next }),
        run: (draft) => {
          if (next === "Sent to Production") {
            const wo = store.sendSalesOrderToProduction(r.id, roleKey);
            return wo ? store.get("salesOrders", r.id) : null;
          }
          if (next === "Accepted by Production") {
            const wo = store.ensureWorkOrderForSalesOrder(r.id, roleKey);
            if (!wo) return null;
            store.acceptWorkOrder(wo.id, roleKey);
            return store.get("salesOrders", r.id);
          }
          store._setSOStage(r.id, next, roleKey, (draft && draft.stageNotes) || ("Manual stage advance to " + next));
          return store.get("salesOrders", r.id);
        },
        successMessage: "Document successfully forwarded to next stage.",
        onDone: () => setView((v) => v && ({ ...store.get("salesOrders", r.id) })),
      });
    }
    function findProformaFromSO(so) {
      return store.list("proformas").find((p) => p.orderId === so.id || (p.quotationId && so.quotationId && p.quotationId === so.quotationId));
    }
    function findShipmentFromSO(so) {
      return store.list("shipments").find((s) => s.salesOrderId === so.id && s.status !== "Cancelled");
    }
    function findInvoiceFromSO(so) {
      return store.list("invoices").find((i) => i.salesOrderId === so.id && i.status !== "Cancelled");
    }
    function findWOFromSO(so) {
      return store.list("workOrders").find((w) => w.salesOrderId === so.id && w.status !== "Cancelled");
    }
    async function makeProforma(r) {
      const existing = findProformaFromSO(r);
      await VG.forwardDocument({
        action: "sales_order:proforma",
        fromType: "Sales Order", fromNo: r.no, fromId: r.id,
        toType: "Proforma Invoice", actor: roleKey, module: "sales",
        duplicate: existing ? { exists: true, no: existing.no, label: "Proforma Invoice", linked: existing } : null,
        buildReview: () => buildProformaDraftFromSO(r, roleKey),
        run: (draft) => {
          const d = draft || buildProformaDraftFromSO(r, roleKey);
          const clean = (d.lines || []).map(({ key, ...l }) => l);
          return store.create("proformas", {
            no: store.nextNo("PI", today()), ...d, lines: clean, status: "Issued", by: roleKey,
          }, roleKey);
        },
        onDone: () => setView((v) => v && store.get("salesOrders", r.id)),
      });
    }
    const liveOrder = view ? (store.get("salesOrders", view.id) || view) : null;
    if (builder) {
      return (
        <SalesOrderBuilder open onClose={() => setBuilder(null)} roleKey={roleKey} can={can}
          initial={builder && (builder.id || builder._fromQuotation || builder._fromProforma || Object.keys(builder).length) ? builder : null} onSaved={() => {}} />
      );
    }
    if (liveOrder) {
      const view = liveOrder;
      const linkedWo = findWOFromSO(view);
      const dispatchRows = store.listDispatchReadyRows ? store.listDispatchReadyRows().filter((r) => r.salesOrderId === view.id) : [];
      const packingLists = store.list("dispatchPackingLists").filter((p) => p.salesOrderId === view.id);
      const shipments = store.list("shipments").filter((s) => s.salesOrderId === view.id && s.status !== "Cancelled");
      const challans = store.list("deliveryChallans").filter((c) => c.salesOrderId === view.id);
      const revLabel = fmtRev(view.revisionNo || 0);
      const needsSync = store.salesOrderNeedsProductionSync && store.salesOrderNeedsProductionSync(view);
      async function pushRevisionToProduction() {
        const res = store.pushSalesOrderRevisionToProduction(view.id, roleKey);
        if (!res.ok) {
          if (res.reason === "pending_approval") return VG.toast("Revision must be approved before pushing to production", "warn");
          return VG.toast("Could not push revision", "error");
        }
        VG.toast("Work order " + (res.workOrder && res.workOrder.no) + " updated to " + revLabel);
        setView(store.get("salesOrders", view.id));
      }
      return (
          <InternalScreen onBack={() => setView(null)} backLabel="Back to sales orders" title={"Sales Order " + view.no} subtitle={custName(view.customerId) + " · " + revLabel}
            footer={<>
              <DocActions docType="Sales Order" build={() => orderDoc(view)} />
              {can("add") && <Button variant="soft" icon="rupee" onClick={() => makeProforma(view)} disabled={!!findProformaFromSO(view)} title={findProformaFromSO(view) ? "Proforma already exists" : ""}>Generate Proforma</Button>}
              {(view.stage === "Created / Saved" || view.status === "Created / Saved") && can("approve") && !linkedWo && (
                <Button variant="soft" icon="factory" onClick={async () => {
                  await VG.forwardDocument({
                    action: "sales_order:production", fromType: "Sales Order", fromNo: view.no, fromId: view.id,
                    toType: "Work Order", actor: roleKey, module: "sales",
                    sourceCollection: "salesOrders",
                    confirmMessage: "Are you sure you want to send this Sales Order to Production?",
                    buildReview: () => ({
                      priority: view.priority || "Normal",
                      requiredCompletionDate: view.deliveryDate || today(),
                      technicalNotes: view.technicalSpec || "",
                      drawingRefs: view.drawingsUpload || view.documents || "",
                      specialInstructions: view.specialInstructions || "",
                    }),
                    run: (draft) => {
                      if (draft) {
                        store.update("salesOrders", view.id, {
                          priority: draft.priority || view.priority,
                          deliveryDate: draft.requiredCompletionDate || view.deliveryDate,
                          technicalSpec: draft.technicalNotes || view.technicalSpec,
                          specialInstructions: draft.specialInstructions || view.specialInstructions,
                        }, roleKey);
                      }
                      return store.sendSalesOrderToProduction(view.id, roleKey);
                    },
                    statusChange: "Sent to Production",
                    successMessage: (wo) => (wo && wo.no ? "Work Order " + wo.no + " created successfully." : "Document sent to Production successfully."),
                    onDone: () => setView(store.get("salesOrders", view.id)),
                  });
                }}>Push to Production</Button>
              )}
              {needsSync && linkedWo && can("approve") && (
                <Button icon="factory" onClick={pushRevisionToProduction}>Push Updated Revision to Production</Button>
              )}
              {(view.stage === "Ready for Dispatch" || view.stage === "Dispatch Planned") && can("add") && (
                <Button variant="soft" icon="truck" disabled={!!findShipmentFromSO(view)} title={findShipmentFromSO(view) ? "Shipment already exists" : ""} onClick={async () => {
                  await VG.forwardDocument({
                    action: "sales_order:dispatch",
                    fromType: "Sales Order", fromNo: view.no, fromId: view.id,
                    toType: "Shipment", actor: roleKey, module: "sales",
                    sourceCollection: "salesOrders",
                    duplicate: findShipmentFromSO(view) ? { exists: true, no: findShipmentFromSO(view).no, label: "Shipment" } : null,
                    buildReview: () => ({
                      destination: view.shipping || "",
                      carrier: "",
                      dispatchInstructions: view.dispatchInstructions || "",
                    }),
                    run: (draft) => {
                      const dest = (draft && draft.destination) || view.shipping;
                      if (!dest) { VG.toast("Set shipping address before dispatch", "error"); return null; }
                      const check = store.validateDispatchEligibility && store.validateDispatchEligibility({ salesOrderId: view.id });
                      if (check && !check.ok) { VG.toast(check.reason || "Dispatch not eligible — complete QC first", "error"); return null; }
                      return store.createShipmentFromSO(view.id, { destination: dest, carrier: draft && draft.carrier, dispatchInstructions: draft && draft.dispatchInstructions }, roleKey);
                    },
                    statusChange: "Dispatch Planned",
                    onDone: () => setView(store.get("salesOrders", view.id)),
                  });
                }}>Create shipment</Button>
              )}
              {(view.stage === "Partially Dispatched" || view.stage === "Ready for Dispatch" || view.stage === "Fully Dispatched") && can("add") && (
                <Button variant="soft" icon="rupee" disabled={!!findInvoiceFromSO(view)} title={findInvoiceFromSO(view) ? "Invoice already exists" : ""} onClick={async () => {
                  const existingInv = findInvoiceFromSO(view);
                  if (existingInv) return VG.toast("Invoice " + existingInv.no + " already exists", "warn");
                  await VG.forwardDocument({
                    action: "sales_order:invoice",
                    fromType: "Sales Order", fromNo: view.no, fromId: view.id,
                    toType: "Tax Invoice", actor: roleKey, module: "sales",
                    buildReview: () => store.buildInvoiceDraftFromSO ? store.buildInvoiceDraftFromSO(view.id) : {},
                    run: (draft) => {
                      if (VG.openInvoiceBuilder) {
                        const invDraft = draft || store.buildInvoiceDraftFromSO(view.id);
                        if (invDraft) VG.openInvoiceBuilder(invDraft);
                        return invDraft ? { id: view.id, no: "(draft opened)" } : null;
                      }
                      return store.createInvoiceFromSO(view.id, roleKey);
                    },
                    onDone: () => setView(store.get("salesOrders", view.id)),
                  });
                }}>Post invoice</Button>
              )}
              {view.status !== "Closed" && can("edit") && <Button icon="chevronRight" onClick={() => advance(view)}>Advance stage</Button>}
            </>}>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <StatusTag value={view.stage || view.status} map={ORD_STATUS} />
              <Pill color="#6366f1">{revLabel}</Pill>
              {view.sourceRevised && <Pill color="#f59e0b">Source Quotation Revised</Pill>}
              {view.revisionPendingApproval && <Pill color="#f59e0b">Revision pending approval</Pill>}
              {needsSync && !view.revisionPendingApproval && <Pill color="#22d3ee">WO sync required</Pill>}
              {linkedWo && <span className="text-xs opacity-50 font-mono">WO {linkedWo.no}</span>}
              <span className="text-sm opacity-60 ml-auto">{view.date} · Stage: {view.stage || view.status}</span>
            </div>
            {view.sourceRevised && (
              <div className="mb-4 text-xs rounded-lg p-2.5 flex items-center gap-2" style={{ background: "#f59e0b22", color: "#f59e0b" }}>
                <Icon name="alert" size={13} />
                The source quotation was revised{view.sourceRevisedReason ? " (" + view.sourceRevisedReason + ")" : ""}. Open the quotation and use “Update Sales Order” to forward the latest revision.
              </div>
            )}
            {needsSync && !view.revisionPendingApproval && (
              <Card className="p-3 mb-4 border border-sky-500/30" style={{ background: "rgba(34,211,238,0.08)" }}>
                <div className="text-sm font-medium">Work Order requires synchronization with latest Sales Order revision.</div>
                <div className="text-xs opacity-70 mt-1">Production has not yet received {revLabel}. Use <b>Push Updated Revision to Production</b> to update work order {linkedWo && linkedWo.no}.</div>
              </Card>
            )}
            {view.revisionPendingApproval && (
              <Card className="p-3 mb-4 border border-amber-500/30" style={{ background: "rgba(245,158,11,0.1)" }}>
                <div className="text-sm">Revision {revLabel} is awaiting approval in the Approval Center before it can be pushed to production.</div>
              </Card>
            )}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar mb-4">
              {ORDER_FLOW.map((s, i) => {
                const cur = view.stage || view.status;
                const idx = ORDER_FLOW.indexOf(cur);
                const active = idx >= i;
                return (
                <React.Fragment key={s}>
                  <div className={"whitespace-nowrap text-xs rounded-lg px-2.5 py-1.5 " + (active ? "text-white" : "glass opacity-60")} style={active ? { background: "var(--accent)" } : undefined}>{s}</div>
                  {i < ORDER_FLOW.length - 1 && <Icon name="chevronRight" size={12} className="opacity-40 shrink-0" />}
                </React.Fragment>
              );})}
            </div>
            {(dispatchRows.length || packingLists.length || shipments.length) ? (
              <Card className="p-4 mb-4">
                <div className="text-sm font-semibold mb-3">Dispatch tracking</div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-lg border border-white/10 p-3">
                    <div className="opacity-55 uppercase text-[10px] mb-1">QC ready balance</div>
                    <div>{dispatchRows.length ? dispatchRows.map((r) => (r.sku || "Item") + ": " + (r.balanceQty || 0)).join(" · ") : "—"}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 p-3">
                    <div className="opacity-55 uppercase text-[10px] mb-1">Packing lists</div>
                    <div>{packingLists.length ? packingLists.map((p) => p.no + " (" + p.status + ")").join(", ") : "None"}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 p-3">
                    <div className="opacity-55 uppercase text-[10px] mb-1">Shipments</div>
                    <div>{shipments.length ? shipments.map((s) => s.no + " · " + (s.trackingStatus || s.status)).join(", ") : "None"}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 p-3">
                    <div className="opacity-55 uppercase text-[10px] mb-1">Delivery challans</div>
                    <div>{challans.length ? challans.map((c) => c.no).join(", ") : "None"}</div>
                  </div>
                </div>
              </Card>
            ) : null}
            <OrderLineTable o={view} />
            {(view.revisionHistory || []).length > 0 && (
              <Card className="p-4 mt-4">
                <div className="text-sm font-semibold mb-3">Revision history</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left opacity-50 border-b border-white/10"><th className="py-2 pr-2">Rev</th><th className="py-2 pr-2">Date</th><th className="py-2 pr-2">By</th><th className="py-2 pr-2">Reason</th><th className="py-2 pr-2">Field</th><th className="py-2 pr-2">Old</th><th className="py-2">New</th></tr></thead>
                    <tbody>
                      {(view.revisionHistory || []).slice().reverse().flatMap((h, hi) => {
                        const changes = (h.changes && h.changes.length) ? h.changes : [{ field: "—", oldValue: "—", newValue: h.note || "—" }];
                        return changes.map((c, ci) => (
                          <tr key={hi + "-" + ci} className="border-b border-white/5">
                            {ci === 0 && <td className="py-2 font-mono align-top" rowSpan={changes.length}>{h.revLabel || ("Rev" + String(h.rev || 0).padStart(2, "0"))}</td>}
                            {ci === 0 && <td className="py-2 align-top" rowSpan={changes.length}>{h.date || (h.ts ? new Date(h.ts).toLocaleDateString() : "—")}</td>}
                            {ci === 0 && <td className="py-2 align-top" rowSpan={changes.length}>{h.by}</td>}
                            {ci === 0 && <td className="py-2 align-top" rowSpan={changes.length}>{h.reason || "—"}</td>}
                            <td className="py-2">{c.field}</td>
                            <td className="py-2 opacity-70 max-w-[120px] truncate">{String(c.oldValue ?? "—")}</td>
                            <td className="py-2 max-w-[120px] truncate">{String(c.newValue ?? "—")}</td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
            <div className="mt-4 rounded-xl glass p-3">
              <div className="text-sm font-semibold mb-2">Order timeline</div>
              <div className="space-y-2 max-h-56 overflow-auto pr-1">
                {(view.timeline || []).slice().reverse().map((e, i) => (
                  <div key={i} className="text-xs rounded-lg border border-white/10 p-2.5">
                    <div className="font-medium">{e.note || e.action}</div>
                    <div className="opacity-60 mt-1">{new Date(e.ts || Date.now()).toLocaleString()} · {e.by || "system"}</div>
                  </div>
                ))}
                {!(view.timeline || []).length && <div className="text-xs opacity-55">No timeline entries yet.</div>}
              </div>
            </div>
          </InternalScreen>
      );
    }
    return (
      <ListPage title="Sales Orders" desc="Create and review in Sales. Send to Production only when ready." onNew={can("add") ? () => setBuilder({}) : null} newLabel="Add Sales Order" can={can}>
        {VG.CustomerFilterBanner ? <VG.CustomerFilterBanner /> : null}
        <RecordTable embedded suppressNew tableId="sales-orders" title="Sales Order List" columns={cols} rows={rows} can={can} printTitle="Sales Orders" searchKeys={["no"]}
          filters={[{ key: "status", label: "All status", options: ORDER_FLOW }]}
          onNew={can("add") ? () => setBuilder({}) : null}
          empty="No sales orders yet — click New Sales Order or convert a quotation" />
      </ListPage>
    );
  }
  function OrderLineTable({ o }) {
    return (
      <div className="overflow-x-auto rounded-xl glass">
        <table className="w-full text-xs"><thead className="text-[10px] uppercase opacity-55"><tr className="text-left border-b border-white/10"><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
          <tbody>{(o.lines || []).map((l, i) => { const c = computeLine(l); return <tr key={i} className="border-b border-white/5"><td className="px-3 py-2"><div className="font-medium">{l.name || l.desc || "—"}</div><div className="font-mono text-[10px] opacity-50">SKU: {l.sku || "—"}</div></td><td className="px-3 py-2 text-right">{l.qty} {l.unit}</td><td className="px-3 py-2 text-right">{inr(l.rate)}</td><td className="px-3 py-2 text-right">{inr(c.total)}</td></tr>; })}</tbody>
        </table>
      </div>
    );
  }
  function orderPDF(o, mode) { printDocument(orderDoc(o), mode); }
  function orderDoc(o) {
    const c = VG.normalizeCustomer ? VG.normalizeCustomer(store.get("customers", o.customerId) || {}) : (store.get("customers", o.customerId) || {});
    const t = o.totals || {};
    const pt = (store.get("paymentTerms", o.paymentTermsId) || {}).name || "—";
    const dt = (store.get("deliveryTerms", o.deliveryTermsId) || {}).name || "—";
    const cur = o.currency || c.currency || "INR";
    const fmt = (n) => (cur === "INR" ? inr(n) : (cur + " " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })));
    if (VG.buildIndustrialDocument) {
      const tpl = VG.resolveDocTemplate ? VG.resolveDocTemplate("Sales Order", o.templateId) : {};
      const usePremium = tpl.themeId === "industrial" || tpl.docVariant === "quotation-international" || !o.templateId;
      if (usePremium) {
        return VG.buildIndustrialDocument({
          docType: "Sales Order",
          document: o,
          customer: c,
          totals: t,
          paymentTerms: pt,
          deliveryTerms: dt,
          lines: mapIndustrialDocLines(o.lines, fmt),
        });
      }
    }
    const rows = (o.lines || []).map((l, i) => {
      const c2 = computeLine(l);
      const name = l.name || l.desc || "";
      return `<tr><td>${i + 1}</td><td><b>${name}</b><br><span style="color:#6b7280;font-size:8pt">SKU: ${l.sku || ""}</span></td><td class="vg-right">${l.qty} ${l.unit}</td><td class="vg-right">${inr(l.rate)}</td><td class="vg-right">${inr(c2.total)}</td></tr>`;
    }).join("");
    const inner = `<div class="vg-cols"><div class="vg-card"><b>Bill To</b>${custName(o.customerId)}<br>${o.billing || ""}<br>GSTIN ${o.gstin || ""}</div><div class="vg-card"><b>Ship To</b>${custName(o.customerId)}<br>${o.shipping || o.billing || ""}</div><div class="vg-card"><b>Order</b>No: ${o.no}<br>Date: ${o.date}<br>Status: ${o.status}</div></div><table class="vg-tbl"><thead><tr><th>#</th><th>Item</th><th class="vg-right">Qty</th><th class="vg-right">Rate</th><th class="vg-right">Total</th></tr></thead><tbody>${rows}</tbody></table><div class="vg-totals"><div><span>Taxable</span><span>${inr(t.taxable || 0)}</span></div><div><span>GST</span><span>${inr(t.tax || 0)}</span></div><div class="grand"><span>Grand Total</span><span>${inr(t.grand || 0)}</span></div></div><div class="vg-sign"><div>Prepared by: <b>${o.preparedBy || "—"}</b></div><div>Checked by: <b>${o.checkedBy || "—"}</b></div><div>Approved by: <b>${o.approvedBy || "—"}</b></div><div>For ${store.company().name}</div></div>`;
    return { title: "Sales Order", subtitle: o.no + " · " + custName(o.customerId), inner };
  }

  function ProformaBuilder({ open, onClose, roleKey, can, initial, onSaved }) {
    const isEdit = !!(initial && initial.id);
    const fromQuotation = !!(initial && initial._fromQuotation);
    const fromSO = !!(initial && initial._fromSalesOrder);
    const backToQuotationId = initial && initial._quotationId;
    const [dirty, setDirty] = useState(false);
    const [p, setP] = useState(() => {
      if (initial) return { ...initial, lines: (initial.lines || []).map((l) => ({ ...l, key: Math.random().toString(36).slice(2) })) };
      return {
        date: today(), dueDate: today(), customerId: "", contact: "", gstin: "", salesOrderId: "", customerPoRef: "",
        billing: "", shipping: "", billingAddressId: "", shippingAddressId: "", paymentTermsId: "", deliveryTermsId: "", validityDays: 15, currency: "INR", exchangeRate: 1,
        placeOfSupply: "", freight: 0, packing: 0, insurance: 0, remarks: "", by: roleKey, lines: [blankLine()],
        ...(store.applyDefaultBankToDoc ? store.applyDefaultBankToDoc({}) : {}),
      };
    });
    const set = (k, v) => { setDirty(true); setP((x) => ({ ...x, [k]: v })); };
    const setLine = (key, patch) => { setDirty(true); setP((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) })); };
    const addLine = () => { setDirty(true); setP((x) => ({ ...x, lines: x.lines.concat(blankLine()) })); };
    const delLine = (key) => { setDirty(true); setP((x) => ({ ...x, lines: x.lines.filter((l) => l.key !== key) })); };
    const totals = computeQuote(p);
    const soList = store.list("salesOrders");
    function pickCustomer(id) {
      setDirty(true);
      const c = store.get("customers", id) || {};
      setP((x) => (VG.applyCustomerToTransaction ? VG.applyCustomerToTransaction(c, { ...x, customerId: id }) : x));
    }
    function patchProformaFields(patch) { setDirty(true); setP((x) => ({ ...x, ...patch })); }
    function pickItem(key, itemId) {
      setLine(key, pickItemLine(itemId));
    }
    function loadFromSO(id) {
      if (!id) return;
      const o = store.get("salesOrders", id);
      if (!o) return;
      setDirty(true);
      setP((x) => ({
        ...x, salesOrderId: id, customerId: o.customerId, contact: o.contact || x.contact, gstin: o.gstin || x.gstin,
        billing: o.billing || x.billing, shipping: o.shipping || x.shipping,
        billingAddressId: o.billingAddressId || "", shippingAddressId: o.shippingAddressId || "",
        currency: o.currency || x.currency, exchangeRate: o.exchangeRate != null ? o.exchangeRate : x.exchangeRate,
        customerPoRef: o.customerPoRef || "",
        paymentTermsId: o.paymentTermsId || x.paymentTermsId, deliveryTermsId: o.deliveryTermsId || x.deliveryTermsId,
        freight: o.freight || 0, packing: o.packing || 0, insurance: o.insurance || 0,
        lines: (o.lines || []).map((l) => ({ ...l, key: Math.random().toString(36).slice(2) })),
      }));
    }
    function save(asDraft) {
      if (!p.customerId) return VG.toast("Select customer", "error");
      if (!p.lines.length || p.lines.some((l) => !l.itemId)) return VG.toast("Add valid line items", "error");
      const clean = p.lines.map(({ key, ...l }) => l);
      const payload = { ...p, lines: clean, totals, status: asDraft ? "Draft" : "Issued", by: p.by || roleKey };
      delete payload._fromQuotation;
      delete payload._fromSalesOrder;
      delete payload._quotationNo;
      delete payload._salesOrderNo;
      let saved;
      if (isEdit) {
        store.update("proformas", p.id, payload, roleKey);
        saved = { ...payload, id: p.id };
        VG.toast("Proforma updated");
      } else {
        payload.no = store.nextNo("PI", p.date);
        saved = store.create("proformas", payload, roleKey);
        if (p.quotationId && !asDraft) {
          const q = store.get("quotations", p.quotationId);
          if (q && q.status !== "Won" && q.status !== "Sent") store.update("quotations", p.quotationId, { status: q.status }, roleKey);
        }
        VG.toast(asDraft ? "Proforma draft saved" : "Proforma " + saved.no + " created");
        if (VG.workflowReview && VG.workflowReview.recordReview) {
          VG.workflowReview.recordReview({ event: asDraft ? "draft_saved" : "forwarded", action: fromQuotation ? "quotation:proforma" : "sales_order:proforma", actor: roleKey, sourceNo: p._quotationNo || p._salesOrderNo, targetType: "Proforma Invoice", note: "Proforma " + saved.no + (asDraft ? " draft" : " issued") });
        }
      }
      onSaved && onSaved(saved);
      onClose();
    }
    function backToSource() {
      if (backToQuotationId) {
        VG._pendingQuotationView = backToQuotationId;
        onClose();
        if (VG.goTo) VG.goTo("sales", "quotations");
      } else onClose();
    }
    return (
      <InternalScreen onBack={onClose} backLabel="Back to list" dirty={dirty}
        title={isEdit ? "Edit Proforma " + p.no : (fromQuotation ? "Proforma from Quotation " + (p._quotationNo || "") : fromSO ? "Proforma from SO " + (p._salesOrderNo || "") : "Add Proforma Invoice")}
        subtitle={fromQuotation || fromSO ? "Review and confirm details before issuing proforma" : "Create proforma manually with customer, commercial and tax details"}
        footer={<>
          <Button variant="soft" icon="eye" onClick={() => proformaPDF({ ...p, no: p.no || "DRAFT", totals }, "preview")}>Preview PDF</Button>
          {(fromQuotation || fromSO) && <Button variant="soft" icon="chevronLeft" onClick={backToSource}>{fromQuotation ? "Back to Quotation" : "Back to SO"}</Button>}
          <Button variant="soft" icon="check" onClick={() => save(true)}>Save as Draft</Button>
          <Button icon="check" onClick={() => save(false)}>{isEdit ? "Save Proforma" : "Forward / Generate"}</Button>
        </>}>
        <div className="grid lg:grid-cols-3 gap-3 mb-4">
          <Field label="Customer" required><MasterSelect collection="customers" value={p.customerId} onChange={pickCustomer} actorRole={roleKey} can={can("add")} /></Field>
          <Field label="Contact person"><Text value={p.contact} onChange={(v) => set("contact", v)} /></Field>
          <Field label="GSTIN"><Text value={p.gstin} onChange={(v) => set("gstin", v)} /></Field>
          <Field label="Proforma date" required><DateF value={p.date} onChange={(v) => set("date", v)} /></Field>
          <Field label="Due / validity date"><DateF value={p.dueDate} onChange={(v) => set("dueDate", v)} /></Field>
          <Field label="Validity (days)"><Num value={p.validityDays} onChange={(v) => set("validityDays", v)} /></Field>
          <Field label="Linked sales order"><Select value={p.salesOrderId || ""} onChange={(v) => loadFromSO(v)} options={[{ value: "", label: "— None —" }].concat(soList.map((o) => ({ value: o.id, label: o.no + " · " + custName(o.customerId) })))} /></Field>
          <Field label="Customer PO ref"><Text value={p.customerPoRef} onChange={(v) => set("customerPoRef", v)} /></Field>
          <Field label="Place of supply"><Text value={p.placeOfSupply} onChange={(v) => set("placeOfSupply", v)} /></Field>
          <Field label="Payment terms"><Select value={p.paymentTermsId} onChange={(v) => set("paymentTermsId", v)} options={store.list("paymentTerms").map((t) => ({ value: t.id, label: t.name }))} /></Field>
          <Field label="Delivery terms"><Select value={p.deliveryTermsId} onChange={(v) => set("deliveryTermsId", v)} options={store.list("deliveryTerms").map((t) => ({ value: t.id, label: t.name }))} /></Field>
          {VG.TransactionAddressCurrency ? (
            <VG.TransactionAddressCurrency customerId={p.customerId} values={p} onChange={patchProformaFields} roleKey={roleKey} canEditCurrency={can("edit")} />
          ) : (
            <>
              <Field label="Billing address" className="lg:col-span-1"><Area value={p.billing} onChange={(v) => set("billing", v)} rows={2} /></Field>
              <Field label="Shipping address" className="lg:col-span-1"><Area value={p.shipping} onChange={(v) => set("shipping", v)} rows={2} /></Field>
            </>
          )}
          <Field label="Remarks / notes" className="lg:col-span-1"><Area value={p.remarks} onChange={(v) => set("remarks", v)} rows={2} /></Field>
        </div>
        <BankAccountSection doc={p} onChange={(patch) => { setDirty(true); setP((x) => ({ ...x, ...patch })); }} />
        <TransactionLinesShell title="Line items" onAddLine={addLine} addLabel="Add line" minWidth={1180}
          headerRow={LINE_TABLE_HEAD}>
          {p.lines.map((l) => {
            const c = computeLine(l);
            return (
              <tr key={l.key} className="border-b border-white/5 align-top">
                <td className="min-w-[230px]"><MasterSelect variant="line" collection="items" value={l.itemId} onChange={(id) => pickItem(l.key, id)} actorRole={roleKey} can={can("add")} /></td>
                <td className="min-w-[380px] vg-line-desc"><LineDescriptionEditor line={l} compact onChange={(v) => setLine(l.key, { desc: v })} /></td>
                <td className="font-mono text-xs">{l.hsn || "—"}</td>
                <td><Num data-line-qty value={l.qty} onChange={(v) => setLine(l.key, { qty: v })} /></td>
                <td className="text-sm opacity-80">{l.unit}</td>
                <td><Num value={l.rate} onChange={(v) => setLine(l.key, { rate: v })} /></td>
                <td><Num value={l.discountPct} onChange={(v) => setLine(l.key, { discountPct: v })} /></td>
                <td><Num value={l.taxPct} onChange={(v) => setLine(l.key, { taxPct: v })} /></td>
                <td className="text-right font-medium">{inr(c.total)}</td>
                <td><button type="button" onClick={() => delLine(l.key)} className="p-1 rounded chrome-hover hover:text-rose-400"><Icon name="trash" size={14} /></button></td>
              </tr>
            );
          })}
        </TransactionLinesShell>
        <div className="grid lg:grid-cols-3 gap-3">
          <div className="grid grid-cols-3 gap-3 lg:col-span-2 content-start">
            <Field label="Freight (₹)"><Num value={p.freight} onChange={(v) => set("freight", v)} /></Field>
            <Field label="Packing (₹)"><Num value={p.packing} onChange={(v) => set("packing", v)} /></Field>
            <Field label="Insurance (₹)"><Num value={p.insurance} onChange={(v) => set("insurance", v)} /></Field>
          </div>
          <Card className="p-4 h-max">
            <div className="text-sm font-semibold mb-2">Proforma total</div>
            {[["Sub total", totals.sub], ["Discount", -totals.discount], ["Taxable", totals.taxable], ["GST", totals.tax], ["Charges", totals.charges]].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm py-0.5"><span className="opacity-60">{k}</span><span>{inr(v)}</span></div>
            ))}
            <div className="flex justify-between text-base font-semibold border-t border-white/10 mt-2 pt-2"><span>Grand total</span><span>{inr(totals.grand)}</span></div>
          </Card>
        </div>
      </InternalScreen>
    );
  }

  function invoiceDisplayStatus(inv) {
    if (!inv) return { label: "—", color: "#94a3b8" };
    if (inv.status === "Cancelled") return { label: "Cancelled", color: INV_DOC_STATUS.Cancelled };
    if (inv.status === "Paid") return { label: "Paid", color: INV_DOC_STATUS.Paid };
    if (inv.status === "Partially Paid") return { label: "Partially Paid", color: INV_DOC_STATUS["Partially Paid"] };
    const hasEinv = !!(inv.eInvoice && inv.eInvoice.irn);
    const hasEway = !!(inv.ewayBill && inv.ewayBill.no);
    if (hasEinv && hasEway) return { label: "E-Invoice + E-way", color: INV_DOC_STATUS["E-Invoice + E-way"] };
    if (hasEinv) return { label: "E-Invoice Generated", color: INV_DOC_STATUS["E-Invoice Generated"] };
    if (hasEway) return { label: "E-way Generated", color: INV_DOC_STATUS["E-way Generated"] };
    return { label: inv.status || "Posted", color: INV_STATUS[inv.status] || "#94a3b8" };
  }
  const INVOICE_COPY_OPTIONS = [
    { id: "original", label: "ORIGINAL COPY", default: true },
    { id: "duplicate", label: "DUPLICATE COPY", default: true },
    { id: "triplicate", label: "TRIPLICATE COPY", default: false },
    { id: "transporter", label: "TRANSPORTER COPY", default: true },
    { id: "office", label: "OFFICE COPY", default: false },
    { id: "recipient", label: "RECIPIENT COPY", default: false },
  ];

  function invoiceDoc(inv) {
    const fresh = inv && inv.id ? (store.get("invoices", inv.id) || inv) : inv;
    if (VG.accountsInvDoc) return VG.accountsInvDoc(fresh);
    const c = VG.normalizeCustomer ? VG.normalizeCustomer(store.get("customers", inv.customerId) || {}) : (store.get("customers", inv.customerId) || {});
    const t = inv.totals || {};
    const rows = (inv.lines || []).map((l, i) => {
      const amt = (Number(l.qty) || 0) * (Number(l.rate) || 0);
      return `<tr><td>${i + 1}</td><td><b>${l.name || l.desc || ""}</b><br><span style="color:#6b7280;font-size:8pt">SKU: ${l.sku || ""}</span></td><td class="vg-right">${l.qty}</td><td class="vg-right">${inr(l.rate)}</td><td class="vg-right">${inr(amt)}</td></tr>`;
    }).join("");
    return {
      title: "Tax Invoice", subtitle: inv.no,
      inner: `<div class="vg-cols"><div class="vg-card"><b>Bill To</b>${custName(inv.customerId)}<br>${inv.billing || ""}</div><div class="vg-card"><b>Invoice</b>${inv.no}<br>${inv.date}</div></div><table class="vg-tbl"><thead><tr><th>#</th><th>Item</th><th class="vg-right">Qty</th><th class="vg-right">Rate</th><th class="vg-right">Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="vg-totals"><div class="grand"><span>Total</span><span>${inr(t.grand || inv.amount || 0)}</span></div></div>`,
      useIntlLayout: false,
    };
  }
  function printInvoiceDocument(inv, mode, copyLabels) {
    const doc = invoiceDoc(inv);
    const copies = copyLabels && copyLabels.length ? copyLabels : null;
    printDocument({ ...doc, docType: "Tax Invoice", copies }, mode);
  }

  function InvoicePrintCopiesModal({ inv, mode, onClose }) {
    const [sel, setSel] = useState(() => INVOICE_COPY_OPTIONS.filter((x) => x.default).map((x) => x.id));
    const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.concat(id)));
    function run() {
      if (!sel.length) return VG.toast("Select at least one copy", "warn");
      const labels = INVOICE_COPY_OPTIONS.filter((x) => sel.includes(x.id)).map((x) => x.label);
      printInvoiceDocument(inv, mode, labels);
      onClose();
    }
    return (
      <Modal open onClose={onClose} title="Print / Download Invoice" subtitle={(inv && inv.no) || ""}
        actions={<Button icon={mode === "preview" ? "eye" : mode === "download" ? "download" : "printer"} onClick={run}>{mode === "preview" ? "Preview" : mode === "download" ? "Download PDF" : "Print"}</Button>}>
        <p className="text-sm opacity-70 mb-3">Select invoice copies. Each copy is printed on a separate page with the copy type shown at the top right.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {INVOICE_COPY_OPTIONS.map((opt) => (
            <label key={opt.id} className="flex items-center gap-2 rounded-lg glass px-3 py-2.5 text-sm cursor-pointer chrome-hover">
              <input type="checkbox" checked={sel.includes(opt.id)} onChange={() => toggle(opt.id)} className="accent-sky-500" />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
        <p className="text-xs opacity-50 mt-3">{sel.length} cop{sel.length !== 1 ? "ies" : "y"} selected</p>
      </Modal>
    );
  }

  function InvoiceDocActions({ inv, onPrintPick }) {
    return (
      <>
        <Button variant="soft" icon="eye" onClick={() => onPrintPick && onPrintPick({ inv, mode: "preview" })}>Preview</Button>
        <Button variant="soft" icon="printer" onClick={() => onPrintPick && onPrintPick({ inv, mode: "print" })}>Print</Button>
        <Button variant="soft" icon="download" onClick={() => onPrintPick && onPrintPick({ inv, mode: "download" })}>PDF</Button>
      </>
    );
  }

  function ordersReadyToInvoice() {
    const invoiced = new Set(store.list("invoices").filter((i) => i.status !== "Cancelled").map((i) => i.salesOrderId));
    return store.list("salesOrders").filter((s) => INVOICE_SO_STAGES.includes(s.stage || s.status) && !invoiced.has(s.id));
  }

  function EwayBillModal({ inv, regenerate, onClose, roleKey, onDone }) {
    const sh = store.list("shipments").find((s) => s.salesOrderId === inv.salesOrderId);
    const [f, setF] = useState({ vehicle: (sh && sh.vehicle) || inv.ewayBill?.vehicle || (sh && sh.vehicle) || "", driver: (sh && sh.driver) || inv.ewayBill?.driver || "", distance: inv.ewayBill?.distance || 0, transporter: inv.ewayBill?.transporter || "" });
    function submit() {
      store.generateEwayBill(inv.id, roleKey, { ...f, regenerate: !!regenerate });
      VG.toast("E-way bill generated for " + inv.no, "success");
      onDone && onDone();
      onClose();
    }
    return (
      <Modal open onClose={onClose} title="Generate E-way Bill" subtitle={inv.no + " · " + custName(inv.customerId)}
        actions={<Button icon="truck" onClick={submit}>Generate E-way Bill</Button>}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Vehicle number"><Text value={f.vehicle} onChange={(v) => setF((p) => ({ ...p, vehicle: v }))} placeholder="e.g. MH12AB1234" /></Field>
          <Field label="Driver name"><Text value={f.driver} onChange={(v) => setF((p) => ({ ...p, driver: v }))} /></Field>
          <Field label="Distance (km)"><Num value={f.distance} onChange={(v) => setF((p) => ({ ...p, distance: v }))} /></Field>
          <Field label="Transporter"><Text value={f.transporter} onChange={(v) => setF((p) => ({ ...p, transporter: v }))} /></Field>
        </div>
        <p className="text-xs opacity-55 mt-3">Generates a NIC e-Way Bill reference (simulated). Connect GST credentials in Admin for live IRP integration.</p>
      </Modal>
    );
  }

  function InvoiceView({ inv, onClose, roleKey, can, onChange, onEdit }) {
    if (!inv) return null;
    const [ewayOpen, setEwayOpen] = useState(false);
    const [printPick, setPrintPick] = useState(null);
    const st = invoiceDisplayStatus(inv);
    const balance = (Number(inv.amount) || 0) - (Number(inv.amountPaid) || 0);
    function genEinv() {
      if (!can("add")) return VG.toast("You don't have permission", "error");
      const co = store.company();
      if (!co.gstin) return VG.toast("Set company GSTIN in Admin → Company profile before E-Invoice", "warn");
      if (!inv.gstin) return VG.toast("Customer GSTIN required for E-Invoice", "warn");
      store.generateEInvoice(inv.id, roleKey);
      VG.toast("E-Invoice IRN generated", "success");
      onChange();
    }
    if (printPick) {
      return <InvoicePrintCopiesModal inv={printPick.inv} mode={printPick.mode} onClose={() => setPrintPick(null)} />;
    }
    if (ewayOpen) {
      return <EwayBillModal inv={inv} regenerate={!!(inv.ewayBill && inv.ewayBill.no)} roleKey={roleKey} onClose={() => setEwayOpen(false)} onDone={onChange} />;
    }
    return (
        <InternalScreen onBack={onClose} backLabel="Back to invoices" title={(VG.invoiceTypeLabel ? VG.invoiceTypeLabel(inv) : "Tax Invoice") + " " + inv.no} subtitle={custName(inv.customerId) + (inv.salesOrderNo ? " · SO " + inv.salesOrderNo : "") + (inv.currency && inv.currency !== "INR" ? " · " + inv.currency : "")}
          footer={<>
            <InvoiceDocActions inv={inv} onPrintPick={setPrintPick} />
            {onEdit && <Button variant="soft" icon="edit" onClick={onEdit}>Edit invoice</Button>}
            {can("add") && !(inv.eInvoice && inv.eInvoice.irn) && <Button variant="soft" icon="shield" onClick={genEinv}>Generate E-Invoice</Button>}
            {can("add") && <Button variant="soft" icon="truck" onClick={() => setEwayOpen(true)}>{inv.ewayBill && inv.ewayBill.no ? "Regenerate E-way" : "Generate E-way Bill"}</Button>}
            {inv.status !== "Paid" && balance > 0 && can("edit") && <Button icon="rupee" onClick={() => { const amt = balance; store.recordPayment(inv.id, amt, roleKey); VG.toast("Payment recorded"); onChange(); }}>Mark paid</Button>}
          </>}>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <StatusTag value={st.label} map={INV_DOC_STATUS} />
            <StatusTag value={inv.status} map={INV_STATUS} />
            {inv.invoiceType && inv.invoiceType !== "domestic" && <Pill color="#f59e0b">{VG.invoiceTypeLabel ? VG.invoiceTypeLabel(inv) : inv.invoiceType}</Pill>}
            <span className="text-sm opacity-60 ml-auto">{inv.date}{inv.dueDate ? " · Due " + inv.dueDate : ""}</span>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 mb-4 text-sm">
            <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Invoice amount</div><div className="font-semibold">{invMoney(inv, inv.amount)}</div>{inv.currency !== "INR" && inv.fxTotals && <div className="text-xs opacity-55 mt-1">INR {inr(inv.fxTotals.grandTotalInr)} @ {inv.exchangeRate}</div>}</Card>
            <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Paid</div><div className="font-semibold">{invMoney(inv, inv.amountPaid || 0)}</div></Card>
            <Card className="p-3"><div className="text-[11px] uppercase opacity-55">Balance</div><div className="font-semibold">{invMoney(inv, balance)}</div></Card>
          </div>
          {VG.isExportInvoiceType && VG.isExportInvoiceType(inv.invoiceType) && (
            <Card className="p-3 mb-3 text-xs">
              <div className="text-[11px] uppercase opacity-55 mb-2">Export details</div>
              <div className="grid sm:grid-cols-3 gap-2">
                {inv.iecCode && <div><span className="opacity-50">IEC</span><div>{inv.iecCode}</div></div>}
                {inv.incoterms && <div><span className="opacity-50">Incoterms</span><div>{inv.incoterms}</div></div>}
                {inv.buyerCountry && <div><span className="opacity-50">Buyer country</span><div>{inv.buyerCountry}</div></div>}
                {inv.portOfLoading && <div><span className="opacity-50">Port of loading</span><div>{inv.portOfLoading}</div></div>}
                {inv.lutNumber && <div><span className="opacity-50">LUT</span><div>{inv.lutNumber}{inv.lutValidity ? " · valid " + inv.lutValidity : ""}</div></div>}
                {inv.swiftCode && <div><span className="opacity-50">SWIFT</span><div>{inv.swiftCode}</div></div>}
              </div>
              {inv.exportDeclaration && <div className="mt-2 opacity-80 italic">{inv.exportDeclaration}</div>}
            </Card>
          )}
          {(inv.eInvoice && inv.eInvoice.irn) && (
            <Card className="p-3 mb-3 text-xs">
              <div className="text-[11px] uppercase opacity-55 mb-2">E-Invoice (IRP)</div>
              <div className="grid sm:grid-cols-2 gap-2 font-mono">
                <div><span className="opacity-50">IRN</span><div className="break-all text-[10px] mt-0.5">{inv.eInvoice.irn}</div></div>
                <div><span className="opacity-50">Ack No.</span><div className="mt-0.5">{inv.eInvoice.ackNo}</div></div>
                <div><span className="opacity-50">Ack Date</span><div className="mt-0.5">{inv.eInvoice.ackDate}</div></div>
                <div><span className="opacity-50">Portal</span><div className="mt-0.5">{inv.eInvoice.portal || "NIC IRP"}</div></div>
              </div>
            </Card>
          )}
          {(inv.ewayBill && inv.ewayBill.no) && (
            <Card className="p-3 mb-3 text-xs">
              <div className="text-[11px] uppercase opacity-55 mb-2">E-way Bill</div>
              <div className="grid sm:grid-cols-2 gap-2">
                <div><span className="opacity-50">E-way No.</span><div className="font-mono font-semibold mt-0.5">{inv.ewayBill.no}</div></div>
                <div><span className="opacity-50">Valid until</span><div className="mt-0.5">{inv.ewayBill.validUntil}</div></div>
                <div><span className="opacity-50">Vehicle</span><div className="mt-0.5">{inv.ewayBill.vehicle || "—"}</div></div>
                <div><span className="opacity-50">Driver</span><div className="mt-0.5">{inv.ewayBill.driver || "—"}</div></div>
              </div>
            </Card>
          )}
          <Card className="p-3 text-sm">
            <div className="text-[11px] uppercase opacity-55 mb-2">Line items</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="opacity-55 border-b border-white/10"><tr className="text-left"><th className="py-1 pr-2">SKU</th><th className="py-1 pr-2">Description</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Amount</th></tr></thead>
                <tbody>{(inv.lines || []).map((l, i) => {
                  const amt = computeLine(l).total;
                  return <tr key={i} className="border-b border-white/5"><td className="py-1.5"><div className="font-medium">{l.name || l.desc || "—"}</div><div className="font-mono text-[10px] opacity-50">SKU: {l.sku || "—"}</div></td><td className="py-1.5 text-sm whitespace-pre-wrap opacity-80">{lineDescUi(l) || "—"}</td><td className="py-1.5 text-right">{l.qty} {l.unit}</td><td className="py-1.5 text-right">{inr(amt)}</td></tr>;
                })}</tbody>
              </table>
            </div>
          </Card>
        </InternalScreen>
    );
  }

  function InvoiceBuilder({ open, onClose, roleKey, can, initial, onSaved }) {
    const isEdit = !!(initial && initial.id);
    const [dirty, setDirty] = useState(false);
    const [inv, setInv] = useState(() => {
      if (initial && initial.id) return VG.buildInvoiceDraft ? VG.buildInvoiceDraft(initial) : { ...initial, lines: (initial.lines || []).map((l) => ({ ...l, key: Math.random().toString(36).slice(2) })) };
      return VG.buildInvoiceDraft ? VG.buildInvoiceDraft(initial || {}) : { date: today(), invoiceType: "domestic", currency: "INR", exchangeRate: 1, lines: [blankLine()] };
    });
    const set = (k, v) => { setDirty(true); setInv((x) => ({ ...x, [k]: v })); };
    const patch = (p) => { setDirty(true); setInv((x) => ({ ...x, ...p })); };
    const setLine = (key, patchLine) => { setDirty(true); setInv((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, ...patchLine } : l)) })); };
    const addLine = () => { setDirty(true); setInv((x) => ({ ...x, lines: x.lines.concat(blankLine()) })); };
    const delLine = (key) => { setDirty(true); setInv((x) => ({ ...x, lines: x.lines.filter((l) => l.key !== key) })); };
    const totals = VG.computeInvoiceTotals ? VG.computeInvoiceTotals(inv) : computeQuote(inv);
    const fxTotals = VG.computeFxTotals ? VG.computeFxTotals(inv, totals) : {};
    const isExport = VG.isExportInvoiceType && VG.isExportInvoiceType(inv.invoiceType);
    const soList = store.list("salesOrders");
    function pickCustomer(id) {
      const c = store.get("customers", id) || {};
      const draft = VG.buildInvoiceDraft ? VG.buildInvoiceDraft({ ...inv, customerId: id }) : inv;
      setDirty(true);
      setInv((x) => (VG.applyCustomerToTransaction ? { ...VG.applyCustomerToTransaction(c, { ...draft, customerId: id }), customerDefaultCurrency: (VG.normalizeCustomer ? VG.normalizeCustomer(c) : c).currency || "INR" } : { ...x, customerId: id }));
    }
    function pickInvoiceType(t) {
      const gst = VG.defaultGstTreatment ? VG.defaultGstTreatment(t) : "";
      patch({ invoiceType: t, gstTreatment: gst, exportDeclaration: (VG.EXPORT_DECLARATIONS && VG.EXPORT_DECLARATIONS[gst]) || "", templateId: VG.isExportInvoiceType && VG.isExportInvoiceType(t) ? "tpl2exp" : inv.templateId, lines: VG.applyGstTreatmentToLines ? VG.applyGstTreatmentToLines(inv.lines, gst) : inv.lines });
    }
    function pickGstTreatment(gst) {
      patch({ gstTreatment: gst, exportDeclaration: (VG.EXPORT_DECLARATIONS && VG.EXPORT_DECLARATIONS[gst]) || "", exportSupplyType: gst === "with_igst" ? "with_igst" : "lut_without_igst", lines: VG.applyGstTreatmentToLines ? VG.applyGstTreatmentToLines(inv.lines, gst) : inv.lines });
    }
    function pickItem(key, itemId) {
      const it = store.get("items", itemId);
      if (!it) return setLine(key, { itemId });
      const tax = store.get("taxes", it.taxId);
      const taxPct = VG.gstTreatmentZerosTax && VG.gstTreatmentZerosTax(inv.gstTreatment) ? 0 : (tax ? tax.rate : 18);
      setLine(key, pickItemLine(itemId, { taxPct }));
    }
    function loadFromSO(id) {
      if (!id || !store.buildInvoiceDraftFromSO) return;
      const draft = store.buildInvoiceDraftFromSO(id);
      if (draft) { setDirty(true); setInv({ ...draft, lines: (draft.lines || []).map((l) => ({ ...l, key: l.key || Math.random().toString(36).slice(2) })) }); }
    }
    function save() {
      if (!inv.customerId) return VG.toast("Select customer", "error");
      if (!inv.lines.length || inv.lines.some((l) => !l.itemId)) return VG.toast("Add valid line items", "error");
      if (!store.saveInvoice) return VG.toast("Invoice save unavailable", "error");
      const rec = store.saveInvoice({ ...inv, preparedBy: inv.preparedBy || roleKey }, roleKey, isEdit ? inv.id : null);
      if (!rec) return VG.toast("Could not save invoice", "error");
      VG.toast(isEdit ? "Invoice updated" : "Invoice " + rec.no + " posted");
      onSaved && onSaved(rec);
      onClose(true);
    }
    const chargeLabel = inv.currency === "INR" ? " (₹)" : " (" + inv.currency + ")";
    return (
      <InternalScreen onBack={onClose} backLabel="Back to list" dirty={dirty} title={isEdit ? "Edit " + (VG.invoiceTypeLabel ? VG.invoiceTypeLabel(inv) : "Tax Invoice") + " " + inv.no : "Create Tax Invoice"} subtitle="Domestic & export invoices · multi-currency · LUT/Bond · Incoterms"
        footer={<>{can("print") && <Button variant="soft" icon="eye" onClick={() => printInvoiceDocument({ ...inv, totals, fxTotals }, "preview")}>Preview PDF</Button>}<Button icon="check" onClick={save}>{isEdit ? "Save invoice" : "Post invoice"}</Button></>}>
        <div className="grid lg:grid-cols-4 gap-3 mb-4">
          <Field label="Invoice type" required><Select value={inv.invoiceType || "domestic"} onChange={pickInvoiceType} options={VG.INVOICE_TYPES || [{ value: "domestic", label: "Domestic Tax Invoice" }]} /></Field>
          <Field label="GST treatment"><Select value={inv.gstTreatment || ""} onChange={pickGstTreatment} options={[{ value: "", label: "— Standard domestic —" }].concat(VG.EXPORT_GST_TREATMENTS || [])} /></Field>
          <Field label="Customer" required><MasterSelect collection="customers" value={inv.customerId} onChange={pickCustomer} actorRole={roleKey} can={can("add")} /></Field>
          <Field label="Invoice date" required><DateF value={inv.date} onChange={(v) => set("date", v)} /></Field>
          <Field label="Due date"><DateF value={inv.dueDate} onChange={(v) => set("dueDate", v)} /></Field>
          <Field label="Contact"><Text value={inv.contact} onChange={(v) => set("contact", v)} /></Field>
          <Field label="GSTIN"><Text value={inv.gstin} onChange={(v) => set("gstin", v)} /></Field>
          <Field label="Place of supply"><Text value={inv.placeOfSupply} onChange={(v) => set("placeOfSupply", v)} /></Field>
          <Field label="Linked sales order"><Select value={inv.salesOrderId || ""} onChange={loadFromSO} options={[{ value: "", label: "— None —" }].concat(soList.map((o) => ({ value: o.id, label: o.no + " · " + custName(o.customerId) })))} /></Field>
          <Field label="Payment terms"><Select value={inv.paymentTermsId} onChange={(v) => set("paymentTermsId", v)} options={store.list("paymentTerms").map((t) => ({ value: t.id, label: t.name }))} /></Field>
          <Field label="Delivery terms"><Select value={inv.deliveryTermsId} onChange={(v) => set("deliveryTermsId", v)} options={store.list("deliveryTerms").map((t) => ({ value: t.id, label: t.name }))} /></Field>
        </div>
        {VG.TransactionAddressCurrency ? <div className="grid lg:grid-cols-3 gap-3 mb-4"><VG.TransactionAddressCurrency customerId={inv.customerId} values={inv} onChange={patch} roleKey={roleKey} canEditCurrency={can("edit")} showExchangeMeta /></div> : null}
        <BankAccountSection doc={inv} onChange={patch} />
        {isExport && (
          <Card className="p-4 mb-4">
            <div className="text-sm font-semibold mb-3">Export invoice details</div>
            <div className="grid lg:grid-cols-4 gap-3">
              <Field label="Buyer country"><Text value={inv.buyerCountry} onChange={(v) => set("buyerCountry", v)} /></Field>
              <Field label="Consignee country"><Text value={inv.consigneeCountry} onChange={(v) => set("consigneeCountry", v)} /></Field>
              <Field label="Port of loading"><Text value={inv.portOfLoading} onChange={(v) => set("portOfLoading", v)} /></Field>
              <Field label="Port of discharge"><Text value={inv.portOfDischarge} onChange={(v) => set("portOfDischarge", v)} /></Field>
              <Field label="Final destination"><Text value={inv.finalDestination} onChange={(v) => set("finalDestination", v)} /></Field>
              <Field label="Country of origin"><Text value={inv.countryOfOrigin} onChange={(v) => set("countryOfOrigin", v)} /></Field>
              <Field label="Country of final destination"><Text value={inv.countryOfFinalDestination} onChange={(v) => set("countryOfFinalDestination", v)} /></Field>
              <Field label="IEC code"><Text value={inv.iecCode} onChange={(v) => set("iecCode", v)} /></Field>
              <Field label="LUT / Bond details"><Text value={inv.lutBondDetails} onChange={(v) => set("lutBondDetails", v)} /></Field>
              <Field label="LUT number"><Text value={inv.lutNumber} onChange={(v) => set("lutNumber", v)} /></Field>
              <Field label="LUT validity"><DateF value={inv.lutValidity} onChange={(v) => set("lutValidity", v)} /></Field>
              <Field label="Export supply type"><Select value={inv.exportSupplyType || "lut_without_igst"} onChange={(v) => { set("exportSupplyType", v); pickGstTreatment(v === "with_igst" ? "with_igst" : "lut_without_igst"); }} options={VG.EXPORT_SUPPLY_TYPES || []} /></Field>
              <Field label="Shipping bill no."><Text value={inv.shippingBillNo} onChange={(v) => set("shippingBillNo", v)} /></Field>
              <Field label="Shipping bill date"><DateF value={inv.shippingBillDate} onChange={(v) => set("shippingBillDate", v)} /></Field>
              <Field label="AD code"><Text value={inv.adCode} onChange={(v) => set("adCode", v)} /></Field>
              <Field label="Incoterms"><Select value={inv.incoterms || ""} onChange={(v) => set("incoterms", v)} options={(VG.INVOICE_INCOTERMS || ["EXW", "FOB", "CIF"]).map((x) => ({ value: x, label: x || "—" }))} /></Field>
              <Field label="Mode of shipment"><Select value={inv.shipmentMode || ""} onChange={(v) => set("shipmentMode", v)} options={(VG.SHIPMENT_MODES || ["Air", "Sea"]).map((x) => ({ value: x, label: x || "—" }))} /></Field>
              <Field label="Net weight (kg)"><Num value={inv.netWeight} onChange={(v) => set("netWeight", v)} /></Field>
              <Field label="Gross weight (kg)"><Num value={inv.grossWeight} onChange={(v) => set("grossWeight", v)} /></Field>
              <Field label="No. of packages"><Num value={inv.packages} onChange={(v) => set("packages", v)} /></Field>
              <Field label="Packing details" className="lg:col-span-2"><Area value={inv.packingDetails} onChange={(v) => set("packingDetails", v)} rows={2} /></Field>
              <Field label={"Freight" + chargeLabel}><Num value={inv.exportFreight || inv.freight} onChange={(v) => patch({ exportFreight: v, freight: v })} /></Field>
              <Field label={"Insurance" + chargeLabel}><Num value={inv.exportInsurance || inv.insurance} onChange={(v) => patch({ exportInsurance: v, insurance: v })} /></Field>
            </div>
            <Field label="Export declaration" className="mt-3"><Area value={inv.exportDeclaration} onChange={(v) => set("exportDeclaration", v)} rows={2} /></Field>
          </Card>
        )}
        <TransactionLinesShell title="Line items" onAddLine={addLine} addLabel="Add line" minWidth={1180} headerRow={LINE_TABLE_HEAD}>
          {inv.lines.map((l) => { const c = computeLine(l); return (
            <tr key={l.key} className="border-b border-white/5 align-top">
              <td className="min-w-[230px]"><MasterSelect variant="line" collection="items" value={l.itemId} onChange={(id) => pickItem(l.key, id)} actorRole={roleKey} can={can("add")} /></td>
              <td className="min-w-[380px] vg-line-desc"><LineDescriptionEditor line={l} compact onChange={(v) => setLine(l.key, { desc: v })} /></td>
              <td className="font-mono text-xs">{l.hsn || "—"}</td>
              <td><Num value={l.qty} onChange={(v) => setLine(l.key, { qty: v })} /></td>
              <td className="text-sm opacity-80">{l.unit}</td>
              <td><Num value={l.rate} onChange={(v) => setLine(l.key, { rate: v })} /></td>
              <td><Num value={l.discountPct} onChange={(v) => setLine(l.key, { discountPct: v })} /></td>
              <td><Num value={l.taxPct} onChange={(v) => setLine(l.key, { taxPct: v })} /></td>
              <td className="text-right font-medium">{invMoney(inv, c.total)}</td>
              <td><button type="button" onClick={() => delLine(l.key)} className="p-1 rounded chrome-hover hover:text-rose-400"><Icon name="trash" size={14} /></button></td>
            </tr>
          ); })}
        </TransactionLinesShell>
        <div className="grid lg:grid-cols-3 gap-3 mt-4">
          <div className="grid grid-cols-3 gap-3 lg:col-span-2 content-start">
            <Field label={"Freight" + chargeLabel}><Num value={inv.freight} onChange={(v) => set("freight", v)} /></Field>
            <Field label={"Packing" + chargeLabel}><Num value={inv.packing} onChange={(v) => set("packing", v)} /></Field>
            <Field label={"Insurance" + chargeLabel}><Num value={inv.insurance} onChange={(v) => set("insurance", v)} /></Field>
          </div>
          <Card className="p-4 h-max">
            <div className="text-sm font-semibold mb-2">Invoice total ({inv.currency || "INR"})</div>
            {[["Sub total", totals.sub], ["Discount", -totals.discount], ["Taxable", totals.taxable], ["GST", totals.tax], ["Charges", totals.charges]].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm py-0.5"><span className="opacity-60">{k}</span><span>{invMoney(inv, v)}</span></div>
            ))}
            <div className="flex justify-between text-base font-semibold border-t border-white/10 mt-2 pt-2"><span>Grand total</span><span>{invMoney(inv, totals.grand)}</span></div>
            {inv.currency !== "INR" && (
              <div className="mt-3 pt-2 border-t border-white/10 text-xs space-y-1">
                <div className="flex justify-between"><span className="opacity-60">INR equivalent</span><span>{inr(fxTotals.grandTotalInr || 0)}</span></div>
                <div className="flex justify-between"><span className="opacity-60">Taxable (INR)</span><span>{inr(fxTotals.taxableValueInr || 0)}</span></div>
                <div className="opacity-50">Rate: 1 {inv.currency} = ₹{inv.exchangeRate} · {inv.exchangeRateDate || inv.date}</div>
              </div>
            )}
          </Card>
        </div>
      </InternalScreen>
    );
  }

  function InvoicesPage({ roleKey, can }) {
    VG.useDB();
    const [view, setView] = useState(null);
    const [build, setBuild] = useState(null);
    const [printPick, setPrintPick] = useState(null);
    const readySO = ordersReadyToInvoice();
    useEffect(() => {
      VG.openInvoiceBuilder = (draft) => setBuild(draft || {});
      if (VG._pendingInvoiceBuild) {
        setBuild(VG._pendingInvoiceBuild);
        VG._pendingInvoiceBuild = null;
      }
      return () => { delete VG.openInvoiceBuilder; };
    }, []);
    useEffect(() => {
      if (VG._pendingInvoiceView) {
        const id = VG._pendingInvoiceView;
        VG._pendingInvoiceView = null;
        const inv = store.get("invoices", id);
        if (inv) setView(inv);
      }
    }, []);
    const rowsAll = store.list("invoices").slice().reverse();
    const rows = VG.useFilteredCustomerRows ? VG.useFilteredCustomerRows(rowsAll) : rowsAll;
    const cols = [
      {
        key: "no", label: "Invoice #",
        render: (r) => (
          <button type="button" onClick={() => setView(r)} className={docNoLinkCls}>{r.no}</button>
        ),
      },
      { key: "invoiceType", label: "Type", render: (r) => <span className="text-xs">{VG.invoiceTypeLabel ? VG.invoiceTypeLabel(r) : "Tax Invoice"}</span> },
      { key: "date", label: "Date" },
      { key: "currency", label: "Curr.", render: (r) => <span className="font-mono text-xs">{r.currency || "INR"}</span> },
      { key: "quotationNo", label: "Quotation", render: (r) => <span className="font-mono text-xs">{r.quotationNo || (r.quotationId ? (store.get("quotations", r.quotationId) || {}).no : null) || "—"}</span> },
      { key: "salesOrderNo", label: "SO", render: (r) => <span className="font-mono text-xs">{r.salesOrderNo || "—"}</span> },
      { key: "customerId", label: "Customer", render: (r) => custName(r.customerId), csv: (r) => custName(r.customerId) },
      { key: "amount", label: "Amount", render: (r) => invMoney(r, r.amount), csv: (r) => r.amount },
      {
        key: "status", label: "Status",
        render: (r) => { const st = invoiceDisplayStatus(r); return <StatusTag value={st.label} map={INV_DOC_STATUS} />; },
        csv: (r) => invoiceDisplayStatus(r).label,
      },
      VG.wfColumn((r) => VG.workflow.invoice(r, {
        can,
        onPay: (inv) => setPay(inv),
        printInvoice: (inv, mode) => setPrintPick({ inv, mode: mode || "preview" }),
      }), {
        can, maxVisible: 6,
        onView: (r) => setView(r),
        onEdit: can("edit") ? (r) => setBuild(r) : null,
      }),
    ];
    if (build != null) {
      return <InvoiceBuilder open onClose={() => setBuild(null)} roleKey={roleKey} can={can} initial={build} onSaved={(rec) => setView(rec)} />;
    }
    if (view) {
      const invLive = store.get("invoices", view.id) || view;
      return (
        <InvoiceView inv={invLive} onClose={() => setView(null)} roleKey={roleKey} can={can}
          onChange={() => { const fresh = store.get("invoices", view.id); if (fresh) setView(fresh); }}
          onEdit={can("edit") ? () => { setBuild(store.get("invoices", view.id)); setView(null); } : null} />
      );
    }
    if (printPick) {
      return <InvoicePrintCopiesModal inv={printPick.inv} mode={printPick.mode} onClose={() => setPrintPick(null)} />;
    }
    return (
      <ListPage title="Tax Invoices" desc="Domestic & export invoices · multi-currency · LUT/Bond · E-Invoice & E-way" onNew={can("add") ? () => setBuild({}) : null} newLabel="Add Tax Invoice" can={can}>
        {VG.CustomerFilterBanner ? <VG.CustomerFilterBanner /> : null}
        {readySO.length > 0 && can("add") && (
          <Card className="p-3 mb-4">
            <div className="text-[11px] uppercase opacity-55 mb-2">Create invoice from sales order</div>
            <div className="flex flex-wrap gap-2">
              {readySO.slice(0, 8).map((s) => (
                <Button key={s.id} variant="soft" className="!py-1" icon="rupee" onClick={() => setBuild(store.buildInvoiceDraftFromSO ? store.buildInvoiceDraftFromSO(s.id) : {})}>{s.no} · {invMoney(s, (s.totals || {}).final || (s.totals || {}).grand || 0)}</Button>
              ))}
              {readySO.length > 8 && <span className="text-xs opacity-50 self-center">+{readySO.length - 8} more orders ready</span>}
            </div>
          </Card>
        )}
        <RecordTable embedded suppressNew tableId="sales-invoices" title="Tax Invoice List" columns={cols} rows={rows} can={can} printTitle="Tax Invoices"
          searchKeys={["no", "salesOrderNo", "status", "invoiceType", "currency"]}
          filters={[
            { key: "status", label: "All status", get: (r) => invoiceDisplayStatus(r).label, options: Object.keys(INV_DOC_STATUS) },
            { key: "invoiceType", label: "All types", get: (r) => r.invoiceType || "domestic", options: (VG.INVOICE_TYPES || []).map((x) => x.value) },
          ]}
          onNew={can("add") ? () => setBuild({}) : null}
          empty="No invoices yet — create from a sales order or click New Tax Invoice" />
      </ListPage>
    );
  }

  VG.printInvoiceDocument = printInvoiceDocument;
  VG.INVOICE_COPY_OPTIONS = INVOICE_COPY_OPTIONS;
  VG.InvoiceDocActions = InvoiceDocActions;
  VG.InvoicePrintCopiesModal = InvoicePrintCopiesModal;

  function ProformasPage({ roleKey, can }) {
    VG.useDB();
    const [build, setBuild] = useState(null);
    useEffect(() => {
      if (VG._pendingProformaView) {
        const id = VG._pendingProformaView;
        VG._pendingProformaView = null;
        const p = store.get("proformas", id);
        if (p) proformaPDF(p, "preview");
      }
      if (VG._pendingProformaFromQuotation) {
        const pending = VG._pendingProformaFromQuotation;
        VG._pendingProformaFromQuotation = null;
        const draft = pending.draft || {};
        const lines = (draft.lines || []).map((l) => ({ ...l, key: Math.random().toString(36).slice(2) }));
        setBuild({ ...draft, lines: lines.length ? lines : undefined });
      }
      if (VG._pendingProformaFromSO) {
        const pending = VG._pendingProformaFromSO;
        VG._pendingProformaFromSO = null;
        const draft = pending.draft || {};
        const lines = (draft.lines || []).map((l) => ({ ...l, key: Math.random().toString(36).slice(2) }));
        setBuild({ ...draft, lines: lines.length ? lines : undefined });
      }
    }, []);
    const rowsAll = store.list("proformas").slice().reverse();
    const rows = VG.useFilteredCustomerRows ? VG.useFilteredCustomerRows(rowsAll) : rowsAll;
    const cols = [
      { key: "no", label: "Proforma #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "customerId", label: "Customer", render: (r) => custName(r.customerId), csv: (r) => custName(r.customerId) },
      { key: "date", label: "Date" }, { key: "grand", label: "Value", render: (r) => inr((r.totals || {}).grand || 0), csv: (r) => (r.totals || {}).grand },
      VG.wfColumn((r) => VG.workflow.proforma(r, {
        roleKey, can,
        proformaPDF,
      }), {
        can, maxVisible: 6,
        onView: (p) => proformaPDF(p, "preview"),
        onEdit: can("edit") ? (p) => setBuild(p) : null,
      }),
    ];
    if (build) {
      return <ProformaBuilder open onClose={() => setBuild(null)} roleKey={roleKey} can={can} initial={build && (build.id || build._fromQuotation || build._fromSalesOrder || Object.keys(build).length) ? build : null} onSaved={() => {}} />;
    }
    return (
      <ListPage title="Proforma Invoices" desc="Generate from sales orders or add proforma manually with full details" onNew={can("add") ? () => setBuild({}) : null} newLabel="Add Proforma Invoice" can={can}>
        {VG.CustomerFilterBanner ? <VG.CustomerFilterBanner /> : null}
        <RecordTable embedded suppressNew tableId="sales-proformas" title="Proforma List" columns={cols} rows={rows} can={can} printTitle="Proforma Invoices" searchKeys={["no"]}
          onNew={can("add") ? () => setBuild({}) : null}
          empty="No proforma invoices — click Add Proforma Invoice" />
      </ListPage>
    );
  }
  function proformaPDF(p, mode) { printDocument(proformaDoc(p), mode); }
  function proformaDoc(p) {
    const c = VG.normalizeCustomer ? VG.normalizeCustomer(store.get("customers", p.customerId) || {}) : (store.get("customers", p.customerId) || {});
    const t = p.totals || computeQuote(p);
    const pt = (store.get("paymentTerms", p.paymentTermsId) || {}).name || "—";
    const dt = (store.get("deliveryTerms", p.deliveryTermsId) || {}).name || "—";
    const cur = p.currency || c.currency || "INR";
    const fmt = (n) => (cur === "INR" ? inr(n) : (cur + " " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })));
    if (VG.buildIndustrialDocument) {
      const tpl = VG.resolveDocTemplate ? VG.resolveDocTemplate("Proforma Invoice", p.templateId) : {};
      const usePremium = tpl.themeId === "industrial" || tpl.docVariant === "quotation-international" || !p.templateId;
      if (usePremium) {
        return VG.buildIndustrialDocument({
          docType: "Proforma Invoice",
          document: { ...p, preparedBy: p.by },
          customer: c,
          totals: t,
          paymentTerms: pt,
          deliveryTerms: dt,
          templateId: p.templateId,
          lines: mapIndustrialDocLines(p.lines, fmt),
        });
      }
    }
    const rows = (p.lines || []).map((l, i) => {
      const c2 = computeLine(l);
      const name = l.name || l.desc || "";
      return `<tr><td>${i + 1}</td><td><b>${name}</b><br><span style="color:#6b7280;font-size:8pt">SKU: ${l.sku || ""}</span></td><td class="vg-right">${l.qty} ${l.unit}</td><td class="vg-right">${inr(l.rate)}</td><td class="vg-right">${l.taxPct}%</td><td class="vg-right">${inr(c2.total)}</td></tr>`;
    }).join("");
    const inner = `<div class="vg-cols"><div class="vg-card"><b>Bill To</b>${custName(p.customerId)}<br>${p.billing || ""}<br>GSTIN ${p.gstin || ""}</div><div class="vg-card"><b>Ship To</b>${custName(p.customerId)}<br>${p.shipping || p.billing || ""}</div><div class="vg-card"><b>Proforma</b>No: ${p.no}<br>Date: ${p.date}</div></div><table class="vg-tbl"><thead><tr><th>#</th><th>Item</th><th class="vg-right">Qty</th><th class="vg-right">Rate</th><th class="vg-right">Tax</th><th class="vg-right">Total</th></tr></thead><tbody>${rows}</tbody></table><div class="vg-totals"><div><span>Taxable</span><span>${inr(t.taxable)}</span></div><div><span>GST</span><span>${inr(t.tax)}</span></div><div class="grand"><span>Grand Total</span><span>${inr(t.grand)}</span></div></div><div class="vg-sign"><div>Prepared by: <b>${p.by || "—"}</b></div><div>Checked by: <b>—</b></div><div>Approved by: <b>—</b></div><div>For ${store.company().name}</div></div>`;
    return { title: "Proforma Invoice", subtitle: p.no + " · " + custName(p.customerId), inner };
  }

  function TrackingPage({ roleKey }) {
    VG.useDB();
    const orders = store.list("salesOrders");
    const [popup, setPopup] = useState(null);
    const closePopup = () => setPopup(null);
    function stageRows(stage) {
      return orders.filter((o) => (o.stage || o.status) === stage);
    }
    if (popup && popup.type === "stage") {
      return (
        <InternalScreen onBack={closePopup} backLabel="Back to tracking" title={"Stage · " + popup.stage} subtitle={(popup.rows || []).length + " order(s)"}
          breadcrumbs={[{ label: "Order Tracking", onClick: closePopup }, { label: popup.stage }]}>
          <div className="space-y-2">
            {(popup.rows || []).map((o) => (
              <div key={o.id} className="rounded-lg border border-white/10 p-3 text-sm flex flex-wrap items-center gap-3">
                <button type="button" className="font-mono hover:underline" onClick={() => setPopup({ type: "order", order: o })}>{o.no}</button>
                <button type="button" className="hover:underline opacity-75" onClick={() => setPopup({ type: "customer", order: o })}>{custName(o.customerId)}</button>
                <button type="button" className="ml-auto hover:underline opacity-65" onClick={() => setPopup({ type: "value", order: o })}>{inr((o.totals || {}).grand || 0)}</button>
              </div>
            ))}
            {!(popup.rows || []).length && <div className="text-sm opacity-60 text-center py-8">No orders in this stage.</div>}
          </div>
        </InternalScreen>
      );
    }
    if (popup && popup.type === "order") {
      const o = popup.order;
      const wo = store.list("workOrders").find((w) => w.salesOrderId === o.id);
      const mr = wo && wo.materialRequirementId ? store.get("materialRequirements", wo.materialRequirementId) : null;
      const sh = store.list("shipments").filter((x) => x.salesOrderId === o.id);
      const pls = store.list("dispatchPackingLists").filter((x) => x.salesOrderId === o.id);
      const chs = store.list("deliveryChallans").filter((x) => x.salesOrderId === o.id);
      return (
        <InternalScreen onBack={closePopup} backLabel="Back to tracking" title={"Order · " + o.no} subtitle={custName(o.customerId)}
          breadcrumbs={[{ label: "Order Tracking", onClick: closePopup }, { label: o.no }]}>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <Card className="p-3"><div className="opacity-55 uppercase text-[10px]">Current stage</div><div className="mt-1">{o.stage || o.status}</div></Card>
            <Card className="p-3"><div className="opacity-55 uppercase text-[10px]">Order value</div><div className="mt-1">{inr((o.totals || {}).grand || 0)}</div></Card>
            <Card className="p-3"><div className="opacity-55 uppercase text-[10px]">Work order</div><div className="mt-1">{wo ? wo.no + " · " + (wo.status || "") : "Not created"}</div></Card>
            <Card className="p-3"><div className="opacity-55 uppercase text-[10px]">Material requirement</div><div className="mt-1">{mr ? mr.no + " · " + (mr.status || "") : "Not generated"}</div></Card>
            <Card className="p-3"><div className="opacity-55 uppercase text-[10px]">Dispatch</div><div className="mt-1">{sh.length ? sh.map((x) => x.no + " (" + (x.trackingStatus || x.status) + ")").join(", ") : "No shipment yet"}</div></Card>
            <Card className="p-3"><div className="opacity-55 uppercase text-[10px]">Packing lists</div><div className="mt-1">{pls.length ? pls.map((x) => x.no + " (" + x.status + ")").join(", ") : "None"}</div></Card>
            <Card className="p-3"><div className="opacity-55 uppercase text-[10px]">Challans</div><div className="mt-1">{chs.length ? chs.map((x) => x.no).join(", ") : "None"}</div></Card>
            <Card className="p-3"><div className="opacity-55 uppercase text-[10px]">Timeline events</div><div className="mt-1">{(o.timeline || []).length}</div></Card>
          </div>
        </InternalScreen>
      );
    }
    if (popup && popup.type === "customer") {
      const o = popup.order;
      const c = store.get("customers", o.customerId) || {};
      return (
        <InternalScreen onBack={closePopup} backLabel="Back to tracking" title={"Customer · " + (c.name || c.legalName || "—")} subtitle={o.no}
          breadcrumbs={[{ label: "Order Tracking", onClick: closePopup }, { label: o.no, onClick: () => setPopup({ type: "order", order: o }) }, { label: "Customer" }]}>
          <div className="space-y-2 text-sm w-full">
            <div><b>Code:</b> {c.code || "—"}</div>
            <div><b>Contact:</b> {c.contact || "—"}</div>
            <div><b>Email:</b> {c.email || "—"}</div>
            <div><b>GSTIN:</b> {c.gstin || "—"}</div>
            <div><b>City/State:</b> {(c.city || "—") + " / " + (c.state || "—")}</div>
          </div>
        </InternalScreen>
      );
    }
    if (popup && popup.type === "value") {
      const o = popup.order;
      const t = o.totals || {};
      return (
        <InternalScreen onBack={closePopup} backLabel="Back to tracking" title={"Order Value · " + o.no} subtitle={custName(o.customerId)}
          breadcrumbs={[{ label: "Order Tracking", onClick: closePopup }, { label: o.no, onClick: () => setPopup({ type: "order", order: o }) }, { label: "Value" }]}>
          <div className="space-y-2 text-sm w-full max-w-xl">
            <div className="flex justify-between"><span>Taxable</span><b>{inr(t.taxable || 0)}</b></div>
            <div className="flex justify-between"><span>Tax</span><b>{inr(t.tax || 0)}</b></div>
            <div className="flex justify-between"><span>Discount</span><b>{inr(t.discount || 0)}</b></div>
            <div className="flex justify-between"><span>Charges</span><b>{inr(t.charges || 0)}</b></div>
            <div className="flex justify-between pt-2 border-t border-white/10"><span>Grand Total</span><b>{inr(t.grand || 0)}</b></div>
          </div>
        </InternalScreen>
      );
    }
    return (
      <div>
        <PageHead title="Order Tracking" desc="Live pipeline across the fulfilment workflow" />
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {ORDER_FLOW.filter((s) => s !== "Closed").map((stage) => {
            const list = stageRows(stage);
            return (
              <Card key={stage} className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <button type="button" className="text-xs font-semibold uppercase tracking-wide opacity-70 hover:opacity-100" onClick={() => setPopup({ type: "stage", stage, rows: list })}>{stage}</button>
                  <button type="button" onClick={() => setPopup({ type: "stage", stage, rows: list })}><Pill color={ORD_STATUS[stage]}>{list.length}</Pill></button>
                </div>
                <div className="space-y-2">
                  {list.length === 0 && <div className="text-xs opacity-40 py-3 text-center">—</div>}
                  {list.map((o) => (
                    <div key={o.id} className="glass rounded-lg p-2.5 text-xs">
                      <button type="button" className="font-mono hover:underline" onClick={() => setPopup({ type: "order", order: o })}>{o.no}</button>
                      <div className="opacity-70 mt-0.5 truncate">
                        <button type="button" className="hover:underline" onClick={() => setPopup({ type: "customer", order: o })}>{custName(o.customerId)}</button>
                      </div>
                      <div className="opacity-50 mt-0.5">
                        <button type="button" className="hover:underline" onClick={() => setPopup({ type: "value", order: o })}>{inr((o.totals || {}).grand || 0)}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  function OrderHistoryPage({ roleKey, can }) {
    VG.useDB();
    const rows = store.list("orderHistory").slice().reverse();
    return (
      <ListPage title="Order History" desc="Closed orders with full lifecycle timeline and activity log" can={can}>
        <RecordTable embedded suppressNew title="Order History List" columns={[
          { key: "salesOrderNo", label: "Sales Order", render: (r) => <span className="font-mono text-xs">{r.salesOrderNo}</span> },
          { key: "closureDate", label: "Closure date" },
          { key: "customerId", label: "Customer", render: (r) => custName(r.customerId), csv: (r) => custName(r.customerId) },
          { key: "finalStatus", label: "Status", render: (r) => <StatusTag value={r.finalStatus || "Closed"} map={{ Closed: "#34d399", Cancelled: "#ef4444" }} /> },
          { key: "timeline", label: "Lifecycle", render: (r) => <span className="text-xs opacity-80">{(r.timeline || []).length} events</span> },
        ]} rows={rows} can={can} printTitle="Order History" searchKeys={["salesOrderNo"]} onView={(r) => {
          const html = (r.timeline || []).slice().reverse().map((e) => `<tr><td>${new Date(e.ts || Date.now()).toLocaleString("en-IN")}</td><td>${e.action || ""}</td><td>${e.by || ""}</td><td>${e.note || ""}</td></tr>`).join("");
          printDocument({
            title: "Order History " + r.salesOrderNo,
            subtitle: custName(r.customerId) + " · closed " + (r.closureDate || ""),
            inner: `<table class="vg-tbl"><thead><tr><th>Time</th><th>Action</th><th>User</th><th>Details</th></tr></thead><tbody>${html || "<tr><td colspan='4'>No timeline entries</td></tr>"}</tbody></table>`,
          }, "preview");
        }} empty="No closed orders yet" />
      </ListPage>
    );
  }

  function PriceListPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const rows = store.list("priceList").map((p) => ({ ...p, item: store.get("items", p.itemId) })).filter((p) => p.item);
    const cols = [
      { key: "sku", label: "SKU", render: (r) => <span className="font-mono text-xs">{r.item.sku}</span>, csv: (r) => r.item.sku },
      { key: "name", label: "Item", render: (r) => r.item.name, csv: (r) => r.item.name },
      { key: "listRate", label: "List rate", render: (r) => inr(r.listRate), csv: (r) => r.listRate },
      { key: "minRate", label: "Floor rate", render: (r) => inr(r.minRate), csv: (r) => r.minRate },
      { key: "effective", label: "Effective" },
    ];
    function save(form) {
      if (!form.itemId) return VG.toast("Select item from master", "error");
      if (form.id) { store.update("priceList", form.id, form, roleKey); VG.toast("Price updated"); }
      else { store.create("priceList", { ...form, currency: "INR" }, roleKey); VG.toast("Price added"); }
      setEdit(null);
    }
    const priceFields = [{ k: "itemId", l: "Item", master: "items", req: true }, { k: "listRate", l: "List rate (₹)", num: true, req: true }, { k: "minRate", l: "Floor rate (₹)", num: true }, { k: "effective", l: "Effective date", date: true }];
    if (edit) {
      return <MasterForm title="Price" open onClose={() => setEdit(null)} record={edit} onSave={save} fields={priceFields} roleKey={roleKey} can={can} />;
    }
    return (
      <ListPage title="Price List Management" desc="Approved list & floor rates per item" onNew={() => setEdit({ effective: today() })} newLabel="Add Price" can={can}>
        <RecordTable embedded suppressNew title="Price List" columns={cols} rows={rows} can={can} printTitle="Price List" searchKeys={["item"]}
          onNew={() => setEdit({ effective: today() })} onEdit={can("edit") ? (r) => setEdit(r) : null}
          onDelete={can("delete") ? async (r) => { if (await VG.confirm({ title: "Delete price?", danger: true, confirmLabel: "Delete" })) { store.remove("priceList", r.id, roleKey); VG.toast("Deleted"); } } : null} />
      </ListPage>
    );
  }

  function DiscountsPage({ roleKey, can, go }) {
    return <ApprovalCenterPage roleKey={roleKey} can={can} go={go} filter="quotations" />;
  }

  function ApprovalCenterPage({ roleKey, can, go, filter }) {
    VG.useDB();
    const [remarks, setRemarks] = useState({});
    const engine = VG.approvalEngine;
    const requests = engine ? engine.listPending(filter) : [];
    const legacyQuotes = (!filter || filter === "quotations") ? store.list("quotations").filter((q) => q.status === "Pending Approval" && !(engine && engine.findOpenRequest("quotations", q.id))) : [];
    const legacyRevs = (!filter || filter === "revisions") ? store.list("salesOrders").filter((o) => o.revisionPendingApproval) : [];

    function approveReq(req) {
      const rm = remarks[req.id] || "";
      const r = engine.approveRequest(req.id, roleKey, rm);
      if (r.reason === "remarks_required") return VG.toast("Remarks required", "warn");
      if (!r.ok) return VG.toast("Cannot approve", "error");
      VG.toast(req.entityNo + (r.done ? " approved" : " — level " + (r.level || "") + " pending"));
    }
    function rejectReq(req) {
      const rm = remarks[req.id] || window.prompt("Rejection reason:", "") || "";
      engine.rejectRequest(req.id, roleKey, rm);
      VG.toast("Rejected", "warn");
    }
    function approveQuote(q) {
      const rm = remarks[q.id] || "";
      if (engine) engine.approveQuotation(q.id, roleKey, rm);
      else store.update("quotations", q.id, { status: "Approved", approvedBy: roleKey, discountApproved: true }, roleKey);
      VG.toast("Approved " + q.no);
    }
    function rejectQuote(q) {
      const rm = remarks[q.id] || window.prompt("Reason:", "") || "";
      if (engine) engine.rejectQuotation(q.id, roleKey, rm);
      else store.update("quotations", q.id, { status: "Draft" }, roleKey);
      VG.toast("Sent back to draft", "warn");
    }

    const total = requests.length + legacyQuotes.length + legacyRevs.length;
    return (
      <div>
        <PageHead title="Approval Center" desc="Multi-level quotation discount and sales order revision approvals" />
        <div className="flex flex-wrap gap-2 mb-4">
          <Pill color="#f59e0b">{total} pending</Pill>
          {go && <Button variant="soft" onClick={() => go("discounts")}>Discount queue</Button>}
          {go && <Button variant="soft" onClick={() => go("revisions")}>Revision queue</Button>}
        </div>
        {total === 0 ? <Card className="p-10 text-center opacity-60">No pending approvals</Card> : (
          <div className="space-y-3">
            {requests.map((req) => {
              const wf = engine.workflowFor(req.process);
              const q = req.entityType === "quotations" ? store.get("quotations", req.entityId) : null;
              const t = q ? computeQuote(q) : null;
              return (
                <Card key={req.id} className="p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-[220px]">
                      <div className="font-mono text-sm">{req.entityNo || req.entityId}</div>
                      <div className="opacity-70 text-sm mt-1">{req.process} · {inr(req.amount)}</div>
                      <div className="opacity-55 text-xs mt-1">Level {req.currentLevel} of {req.levels} · {req.status}{q ? " · " + custName(q.customerId) : ""}</div>
                      {t && <Pill color="#f59e0b" className="mt-2">discount {t.sub ? (t.discount / t.sub * 100).toFixed(1) : 0}%</Pill>}
                    </div>
                    {can("approve") && engine.canApprove(roleKey, wf) ? (
                      <div className="flex flex-col gap-2 min-w-[200px]">
                        <Text value={remarks[req.id] || ""} onChange={(v) => setRemarks((m) => ({ ...m, [req.id]: v }))} placeholder={wf && wf.remarksMandatory ? "Remarks required" : "Remarks (optional)"} />
                        <div className="flex gap-2">
                          <Button icon="check" onClick={() => approveReq(req)}>Approve</Button>
                          <Button variant="soft" onClick={() => rejectReq(req)}>Reject</Button>
                        </div>
                      </div>
                    ) : <Pill>view only</Pill>}
                  </div>
                  {(req.trail || []).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/10 text-xs opacity-60 space-y-1">
                      {(req.trail || []).slice(-3).map((h, i) => (
                        <div key={i}>L{h.level} {h.action} · {h.by} · {new Date(h.at).toLocaleString()}</div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
            {legacyQuotes.map((q) => {
              const t = computeQuote(q);
              const dpct = t.sub ? (t.discount / t.sub * 100).toFixed(1) : 0;
              return (
                <Card key={q.id} className="p-4 flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-[200px]"><div className="font-mono text-sm">{q.no}</div><div className="opacity-70 text-sm">{custName(q.customerId)} · {inr(t.grand)}</div></div>
                  <Pill color="#f59e0b">discount {dpct}%</Pill>
                  {can("approve") ? <div className="flex gap-2"><Button icon="check" onClick={() => approveQuote(q)}>Approve</Button><Button variant="soft" onClick={() => rejectQuote(q)}>Reject</Button></div> : <Pill>view only</Pill>}
                </Card>
              );
            })}
            {legacyRevs.map((o) => (
              <Card key={o.id} className="p-4 flex flex-wrap items-center gap-4">
                <div className="flex-1"><div className="font-mono text-sm">{o.no}</div><div className="opacity-70 text-sm">{custName(o.customerId)} · Rev {o.revisionNo || 0}</div></div>
                <Pill color="#f59e0b">SO revision</Pill>
                {can("approve") ? (
                  <div className="flex gap-2">
                    <Button icon="check" onClick={() => { store.approveSalesOrderRevision(o.id, roleKey); VG.toast("Approved"); }}>Approve</Button>
                    <Button variant="soft" onClick={() => { store.rejectSalesOrderRevision(o.id, roleKey, ""); VG.toast("Rejected", "warn"); }}>Reject</Button>
                  </div>
                ) : <Pill>view only</Pill>}
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  function RevisionApprovalPage({ roleKey, can, go }) {
    return <ApprovalCenterPage roleKey={roleKey} can={can} go={go} filter="revisions" />;
  }

  function CommsPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const rowsAll = store.list("communications").slice().reverse();
    const rows = VG.useFilteredCustomerRows ? VG.useFilteredCustomerRows(rowsAll) : rowsAll;
    const cols = [
      { key: "date", label: "Date" }, { key: "customerId", label: "Customer", render: (r) => custName(r.customerId), csv: (r) => custName(r.customerId) },
      { key: "mode", label: "Mode", render: (r) => <Pill color="#a855f7">{r.mode}</Pill> }, { key: "subject", label: "Subject" }, { key: "note", label: "Note" },
    ];
    function save(form) {
      if (!form.customerId) return VG.toast("Select customer from master", "error");
      store.create("communications", { ...form, by: roleKey }, roleKey); VG.toast("Logged"); setEdit(null);
    }
    const commFields = [{ k: "customerId", l: "Customer", master: "customers", req: true }, { k: "date", l: "Date", date: true }, { k: "mode", l: "Mode", select: ["Call", "Email", "Visit", "Meeting", "WhatsApp"] }, { k: "subject", l: "Subject", full: true }, { k: "note", l: "Note", area: true, full: true }];
    if (edit) {
      return <MasterForm title="Communication" open onClose={() => setEdit(null)} record={edit} onSave={save} fields={commFields} roleKey={roleKey} can={can} />;
    }
    return (
      <ListPage title="Communication History" desc="Every customer interaction, logged" onNew={() => setEdit({ date: today(), mode: "Call" })} newLabel="Log Communication" can={can}>
        {VG.CustomerFilterBanner ? <VG.CustomerFilterBanner /> : null}
        <RecordTable embedded suppressNew title="Communication List" columns={cols} rows={rows} can={can} printTitle="Communication History" searchKeys={["subject", "note", "mode"]}
          onNew={() => setEdit({ date: today(), mode: "Call" })} />
      </ListPage>
    );
  }

  function ReportsPage({ roleKey, can }) {
    VG.useDB();
    const quotes = store.list("quotations"), orders = store.list("salesOrders");
    const reports = [
      { n: "Quotation Register", run: () => fx.printTable("Quotation Register", [{ key: "no", label: "No" }, { key: "c", label: "Customer", csv: (r) => custName(r.customerId) }, { key: "date", label: "Date" }, { key: "v", label: "Value", csv: (r) => inr((r.totals || computeQuote(r)).grand) }, { key: "status", label: "Status" }], quotes) },
      { n: "Sales Order Register", run: () => fx.printTable("Sales Order Register", [{ key: "no", label: "No" }, { key: "c", label: "Customer", csv: (r) => custName(r.customerId) }, { key: "date", label: "Date" }, { key: "v", label: "Value", csv: (r) => inr((r.totals || {}).grand || 0) }, { key: "status", label: "Status" }], orders) },
      { n: "Tax Invoice Register", run: () => fx.printTable("Tax Invoice Register", [{ key: "no", label: "No" }, { key: "type", label: "Type", csv: (r) => VG.invoiceTypeLabel ? VG.invoiceTypeLabel(r) : "Domestic" }, { key: "curr", label: "Currency", csv: (r) => r.currency || "INR" }, { key: "so", label: "SO", csv: (r) => r.salesOrderNo }, { key: "c", label: "Customer", csv: (r) => custName(r.customerId) }, { key: "date", label: "Date" }, { key: "v", label: "Amount", csv: (r) => r.amount }, { key: "inr", label: "INR Eq.", csv: (r) => (r.fxTotals && r.fxTotals.grandTotalInr) || r.amount }, { key: "fx", label: "FX Rate", csv: (r) => r.exchangeRate || 1 }, { key: "einv", label: "E-Invoice", csv: (r) => (r.eInvoice && r.eInvoice.irn) ? "Yes" : "No" }, { key: "status", label: "Status" }], store.list("invoices")) },
      { n: "Export Invoice Register", run: () => fx.printTable("Export Invoice Register", [{ key: "no", label: "No" }, { key: "c", label: "Customer", csv: (r) => custName(r.customerId) }, { key: "country", label: "Buyer country", csv: (r) => r.buyerCountry }, { key: "curr", label: "Currency", csv: (r) => r.currency }, { key: "v", label: "Amount (FCY)", csv: (r) => r.amount }, { key: "inr", label: "INR Eq.", csv: (r) => (r.fxTotals && r.fxTotals.grandTotalInr) || "" }, { key: "lut", label: "LUT", csv: (r) => r.lutNumber || "—" }, { key: "inc", label: "Incoterms", csv: (r) => r.incoterms || "—" }], store.list("invoices").filter((i) => VG.isExportInvoiceType && VG.isExportInvoiceType(i.invoiceType))) },
      { n: "Currency-wise Sales Report", run: () => { const m = {}; store.list("invoices").forEach((i) => { const c = i.currency || "INR"; m[c] = (m[c] || 0) + (Number(i.amount) || 0); }); fx.printTable("Currency-wise Sales", [{ key: "c", label: "Currency" }, { key: "v", label: "Total (FCY)" }], Object.keys(m).map((c) => ({ c, v: m[c] }))); } },
      { n: "Exchange Rate Report", run: () => fx.printTable("Exchange Rate Report", [{ key: "no", label: "Invoice" }, { key: "curr", label: "Currency", csv: (r) => r.currency }, { key: "rate", label: "Rate", csv: (r) => r.exchangeRate }, { key: "date", label: "Rate date", csv: (r) => r.exchangeRateDate }, { key: "src", label: "Source", csv: (r) => r.exchangeRateSource }], store.list("invoices").filter((i) => i.currency && i.currency !== "INR")) },
      { n: "LUT-wise Export Report", run: () => fx.printTable("LUT-wise Export Report", [{ key: "lut", label: "LUT No.", csv: (r) => r.lutNumber || "—" }, { key: "no", label: "Invoice" }, { key: "c", label: "Customer", csv: (r) => custName(r.customerId) }, { key: "v", label: "Amount", csv: (r) => r.amount }, { key: "decl", label: "Declaration", csv: (r) => (r.exportDeclaration || "").slice(0, 60) }], store.list("invoices").filter((i) => i.lutNumber || i.gstTreatment === "lut_without_igst")) },
      { n: "Country-wise Export Sales", run: () => { const m = {}; store.list("invoices").filter((i) => VG.isExportInvoiceType && VG.isExportInvoiceType(i.invoiceType)).forEach((i) => { const k = i.buyerCountry || i.countryOfFinalDestination || "—"; m[k] = (m[k] || 0) + (Number((i.fxTotals && i.fxTotals.grandTotalInr) || i.amount) || 0); }); fx.printTable("Country-wise Export Sales (INR)", [{ key: "country", label: "Country" }, { key: "inr", label: "INR Total" }], Object.keys(m).map((country) => ({ country, inr: m[country] }))); } },
      { n: "Customer-wise Export Sales", run: () => fx.printTable("Customer-wise Export Sales", [{ key: "c", label: "Customer", csv: (r) => custName(r.customerId) }, { key: "no", label: "Invoice" }, { key: "curr", label: "Currency", csv: (r) => r.currency }, { key: "fcy", label: "FCY Amount", csv: (r) => r.amount }, { key: "inr", label: "INR Eq.", csv: (r) => (r.fxTotals && r.fxTotals.grandTotalInr) || "" }], store.list("invoices").filter((i) => VG.isExportInvoiceType && VG.isExportInvoiceType(i.invoiceType))) },
      { n: "Foreign Currency Receivables", run: () => fx.printTable("Foreign Currency Receivables", [{ key: "no", label: "Invoice" }, { key: "c", label: "Customer", csv: (r) => custName(r.customerId) }, { key: "curr", label: "Currency", csv: (r) => r.currency }, { key: "bal", label: "Balance (FCY)", csv: (r) => (Number(r.amount) || 0) - (Number(r.amountPaid) || 0) }, { key: "inr", label: "INR Eq.", csv: (r) => { const bal = (Number(r.amount) || 0) - (Number(r.amountPaid) || 0); const fx = r.exchangeRate || 1; return Math.round(bal * fx * 100) / 100; } }], store.list("invoices").filter((i) => i.currency && i.currency !== "INR" && i.status !== "Paid")) },
      { n: "Won / Lost Analysis", run: () => fx.printTable("Won / Lost Analysis", [{ key: "no", label: "No" }, { key: "c", label: "Customer", csv: (r) => custName(r.customerId) }, { key: "status", label: "Status" }], quotes.filter((q) => q.status === "Won" || q.status === "Lost")) },
      { n: "Customer Master", run: () => fx.printTable("Customer Master", [{ key: "code", label: "Code" }, { key: "name", label: "Name" }, { key: "gstin", label: "GSTIN" }, { key: "state", label: "State" }], store.list("customers")) },
    ];
    return (
      <div>
        <PageHead title="Sales Reports" desc="All reports carry company header & footer" />
        <div className="grid sm:grid-cols-2 gap-3">
          {reports.map((r) => (
            <Card key={r.n} className="p-4 flex items-center gap-4">
              <span className="grid place-items-center w-11 h-11 rounded-xl text-white shrink-0" style={{ background: "var(--accent)" }}><Icon name="chart" size={18} /></span>
              <div className="flex-1"><div className="font-medium text-sm">{r.n}</div></div>
              {can("print") && <Button variant="soft" icon="printer" onClick={r.run}>Print</Button>}
            </Card>
          ))}
        </div>
        {VG.EnquiryReports && (
          <div className="mt-8">
            <h3 className="text-sm font-semibold mb-3 opacity-80">Enquiry reports</h3>
            <VG.EnquiryReports can={can} />
          </div>
        )}
      </div>
    );
  }

  function Dashboard(props) {
    return VG.ModuleDashboard ? <VG.ModuleDashboard modId="sales" {...props} /> : null;
  }

  /* ---------- generic master form (shared) ---------- */
  function MasterForm({ title, open, onClose, record, onSave, fields, roleKey, can }) {
    const [form, setForm] = useState(record || {});
    const [err, setErr] = useState({});
    const [dirty, setDirty] = useState(false);
    const set = (k, v) => { setDirty(true); setForm((f) => ({ ...f, [k]: v })); };
    function submit() {
      const e = {};
      fields.forEach((f) => { if (f.req && (form[f.k] === undefined || form[f.k] === "")) e[f.k] = "Required"; });
      if (Object.keys(e).length) { setErr(e); return; }
      onSave(form);
    }
    return (
      <Modal open={open} onClose={onClose} size="md" dirty={dirty} title={(record && record.id ? "Edit " : "New ") + title}
        actions={<Button icon="check" onClick={submit}>Save</Button>}>
        <div className="grid sm:grid-cols-2 gap-3">
          {fields.map((f) => (
            <Field key={f.k} label={f.l} required={f.req} error={err[f.k]} className={f.full || f.area ? "sm:col-span-2" : ""}>
              {f.master ? <MasterSelect collection={f.master} value={form[f.k]} onChange={(v) => set(f.k, v)} actorRole={roleKey} can={can && can("add")} />
                : f.select ? <Select value={form[f.k]} onChange={(v) => set(f.k, v)} options={f.select.map((o) => ({ value: o, label: o }))} />
                : f.area ? <Area value={form[f.k]} onChange={(v) => set(f.k, v)} />
                : f.num ? <Num value={form[f.k]} onChange={(v) => set(f.k, v)} />
                : f.date ? <DateF value={form[f.k]} onChange={(v) => set(f.k, v)} />
                : <Text value={form[f.k]} onChange={(v) => set(f.k, v)} />}
            </Field>
          ))}
        </div>
      </Modal>
    );
  }
  VG.MasterForm = MasterForm;

  /* ================= module entry ================= */
  const SECTIONS = [
    { id: "dashboard", label: "Dashboard", icon: "chart", group: "Overview" },
    { id: "customers", label: "Customers", icon: "users", group: "Sales & CRM" },
    { id: "enquiries", label: "Enquiries", icon: "message", group: "Sales & CRM" },
    { id: "leads", label: "Leads", icon: "inbox", group: "Sales & CRM" },
    { id: "followups", label: "Follow-ups", icon: "bell", group: "Sales & CRM" },
    { id: "commcenter", label: "Comm. Center", icon: "message", group: "Sales & CRM" },
    { id: "comms", label: "Communication", icon: "headset", group: "Sales & CRM" },
    { id: "approvals", label: "Approval Center", icon: "shield", group: "Sales & CRM" },
    { id: "quotations", label: "Quotations", icon: "edit", group: "Sales & CRM" },
    { id: "proformas", label: "Proforma Invoice", icon: "rupee", group: "Sales & CRM" },
    { id: "invoices", label: "Tax Invoices", icon: "rupee", group: "Sales & CRM" },
    { id: "orders", label: "Sales Orders", icon: "cart", group: "Sales & CRM" },
    { id: "tracking", label: "Order Tracking", icon: "truck", group: "Sales & CRM" },
    { id: "history", label: "Order History", icon: "activity", group: "Sales & CRM" },
    { id: "discounts", label: "Discount Approval", icon: "shield", group: "Sales & CRM" },
    { id: "revisions", label: "Revision Approval", icon: "shield", group: "Sales & CRM" },
    { id: "pricelist", label: "Price List", icon: "rupee", group: "Setup" },
    { id: "currencies", label: "Currencies", icon: "rupee", group: "Setup" },
    { id: "pincodes", label: "PIN Codes", icon: "grid", group: "Setup" },
    { id: "intelligence", label: "AI Intelligence", icon: "sparkle", group: "Intelligence" },
    { id: "analytics", label: "Analytics", icon: "trending", group: "Reports" },
    { id: "forecast", label: "Forecasting", icon: "chart", group: "Intelligence" },
    { id: "reports", label: "Reports", icon: "chart", group: "Reports" },
  ];
  if (VG.registerModuleSections) VG.registerModuleSections("sales", SECTIONS);
  const PAGES = {
    dashboard: Dashboard,
    customers: (p) => React.createElement(VG.CustomersPage, p),
    currencies: (p) => React.createElement(VG.CustomerPages.currencies, p),
    pincodes: (p) => React.createElement(VG.CustomerPages.pincodes, p),
    pricelist: PriceListPage, leads: LeadsPage, enquiries: (p) => React.createElement(VG.EnquiriesPage, p), followups: FollowupsPage,
    commcenter: (p) => React.createElement(VG.CommunicationCenterPage, p),
    comms: CommsPage, approvals: ApprovalCenterPage, quotations: QuotationsPage, discounts: DiscountsPage, revisions: RevisionApprovalPage,
    proformas: ProformasPage, invoices: InvoicesPage, orders: OrdersPage, tracking: TrackingPage, history: OrderHistoryPage,
    intelligence: (p) => React.createElement(VG.SalesIntelligencePage, p),
    analytics: (p) => React.createElement(VG.SalesAnalyticsPage, p),
    forecast: (p) => React.createElement(VG.SalesForecastingPage, p),
    reports: ReportsPage,
  };

  VG.modules = VG.modules || {};
  VG.modules.sales = function SalesModule({ mod, roleKey }) {
    const can = (a) => VG.can(roleKey, a, "sales");
    const [section, setSection] = useState(() => VG.consumeSection("sales", "dashboard"));
    const Page = PAGES[section] || Dashboard;
    const actions = [
      { label: "New Sales Order", icon: "cart", primary: true, onClick: () => { VG._pendingSalesOrderCreate = true; setSection("orders"); } },
      { label: "Create Quotation", icon: "edit", onClick: () => setSection("quotations") },
      { label: "Tax Invoices", icon: "rupee", onClick: () => setSection("invoices") },
      { label: "Add Customer", icon: "users", onClick: () => setSection("customers") },
    ];
    return (
      <VG.ModuleScaffold mod={mod} sections={SECTIONS} section={section} setSection={setSection} actions={actions} roleKey={roleKey}>
        <Page roleKey={roleKey} can={can} go={setSection} mod={mod} />
      </VG.ModuleScaffold>
    );
  };
  if (VG.fmt) VG.fmt.rev = (n) => (VG.soRevision && VG.soRevision.revLabel ? VG.soRevision.revLabel(n) : ("R" + String(Number(n) || 0).padStart(2, "0")));
})(window.VG);
