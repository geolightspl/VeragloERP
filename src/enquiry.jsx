/* Veraglo ERP — Enquiry Management: capture, status flow, offers, follow-ups, timeline */
(function (VG) {
  const { useState, useEffect, useMemo } = React;
  const ui = VG.ui, fx = VG.fx, store = VG.store, inr = VG.fmt.inr, today = VG.fmt.todayISO;
  const { Icon, Button, Pill, Card } = ui;
  const { Field, Text, Area, Num, DateF, Select, MasterSelect, Modal, InternalScreen, RecordTable, PageHead, ListPage, StatusTag } = fx;

  const uid = () => "enq" + Math.random().toString(36).slice(2, 10);
  const custName = (id) => (store.get("customers", id) || {}).name || "—";

  const ENQ_STATUSES = [
    "New Enquiry", "Under Review", "Clarification Required", "Quotation Under Preparation",
    "Offer Sent", "Follow-up Pending", "Negotiation", "Revised Offer Sent",
    "Won / Converted to Sales Order", "Lost", "Closed", "Cancelled",
  ];

  const ENQ_STATUS_COLORS = {
    "New Enquiry": "#60a5fa", "Under Review": "#818cf8", "Clarification Required": "#f59e0b",
    "Quotation Under Preparation": "#a78bfa", "Offer Sent": "#34d399", "Follow-up Pending": "#fbbf24",
    "Negotiation": "#f97316", "Revised Offer Sent": "#2dd4bf", "Won / Converted to Sales Order": "#22c55e",
    "Lost": "#ef4444", "Closed": "#64748b", "Cancelled": "#94a3b8",
  };

  const CUSTOMER_SOURCES = ["Website", "Email", "Phone", "Reference", "Tender", "Existing customer", "Other"];
  const PRIORITIES = ["Normal", "Urgent", "High Priority"];
  const FOLLOWUP_MODES = ["Call", "Email", "WhatsApp", "Meeting"];
  const OFFER_MODES = ["Email", "WhatsApp", "Print", "Download", "Manual"];

  const LEGACY_STATUS = { Open: "New Enquiry", Quoted: "Offer Sent", Converted: "Won / Converted to Sales Order", Closed: "Closed" };

  function blankLine() {
    return { key: Math.random().toString(36).slice(2), desc: "", category: "", qty: 1, unit: "Nos", techSpec: "", drawingFile: "", application: "", remarks: "" };
  }

  function normalizeEnquiry(e) {
    if (!e) return null;
    const status = ENQ_STATUSES.includes(e.status) ? e.status : (LEGACY_STATUS[e.status] || "New Enquiry");
    return {
      type: "Sales",
      customerType: "Existing",
      customerSource: "Website",
      priority: "Normal",
      lines: [],
      timeline: [],
      documents: [],
      followups: [],
      quotationIds: [],
      ...e,
      status,
      lines: ((e.lines && e.lines.length) ? e.lines : (e.items ? [{ desc: e.items, qty: 1, unit: "Nos" }] : [])).map((l) => (l.key ? l : { ...l, key: Math.random().toString(36).slice(2) })),
      timeline: Array.isArray(e.timeline) ? e.timeline : [],
      documents: Array.isArray(e.documents) ? e.documents : [],
      followups: Array.isArray(e.followups) ? e.followups : [],
      quotationIds: Array.isArray(e.quotationIds) ? e.quotationIds : (e.quotationId ? [e.quotationId] : []),
    };
  }

  function timelineLabel(action) {
    const map = {
      created: "Enquiry created", assigned: "Assigned to sales person", quotation_created: "Quotation created",
      offer_sent: "Offer sent", followup_added: "Follow-up added", reminder_sent: "Reminder sent",
      revised_offer_sent: "Revised offer sent", customer_response: "Customer response received",
      converted_so: "Converted to sales order", won: "Marked as won", lost: "Marked as lost",
      closed: "Enquiry closed", cancelled: "Enquiry cancelled", clarification: "Clarification requested",
      negotiation: "Negotiation", document_uploaded: "Document uploaded", status_change: "Status updated",
    };
    return map[action] || action;
  }

  function appendTimeline(enq, action, by, detail, extra) {
    return {
      ...enq,
      ...(extra || {}),
      timeline: (enq.timeline || []).concat({ id: uid(), ts: Date.now(), action, by, detail: detail || "" }),
    };
  }

  function applyEnquiryEvent(enq, event, meta, actor) {
    const m = meta || {};
    const statusMap = {
      created: "New Enquiry", assigned: "Under Review", clarification: "Clarification Required",
      quotation_created: "Quotation Under Preparation", offer_sent: "Offer Sent", revised_offer_sent: "Revised Offer Sent",
      followup_added: "Follow-up Pending", negotiation: "Negotiation", won: "Won / Converted to Sales Order",
      converted_so: "Won / Converted to Sales Order", lost: "Lost", closed: "Closed", cancelled: "Cancelled",
    };
    let next = { ...enq, status: statusMap[event] || enq.status };
    if (m.status) next.status = m.status;
    next = appendTimeline(next, event, actor, m.note || m.detail || "", {});
    if (event === "clarification") next.clarificationNote = m.note || next.clarificationNote;
    if (event === "assigned" && m.assignedTo) next.assignedTo = m.assignedTo;
    if (event === "offer_sent" || event === "revised_offer_sent") {
      next.offerSentDate = m.date || today();
      next.offerSentBy = actor;
      next.offerSentMode = m.mode || "Manual";
      next.offerSentContact = m.contact || "";
      if (m.quotationId) {
        next.latestQuotationId = m.quotationId;
        next.latestQuotationNo = m.quotationNo || next.latestQuotationNo;
        next.quotationIds = [...new Set((next.quotationIds || []).concat(m.quotationId))];
      }
      if (m.pdfDoc) next.documents = (next.documents || []).concat(m.pdfDoc);
    }
    if (event === "converted_so" || event === "won") {
      if (m.salesOrderId) next.salesOrderId = m.salesOrderId;
      if (m.salesOrderNo) next.salesOrderNo = m.salesOrderNo;
    }
    if (event === "followup_added" && m.followup) {
      next.followups = (next.followups || []).concat(m.followup);
      if (m.storeFollowup) {
        store.create("followups", {
          date: m.followup.date, time: m.followup.time || "", customerId: next.customerId,
          refType: "Enquiry", refId: next.id, mode: m.followup.mode, note: m.followup.note,
          status: "Pending", owner: actor, nextDate: m.followup.nextDate || "",
        }, actor);
      }
    }
    if (event === "document_uploaded" && m.doc) {
      next.documents = (next.documents || []).concat(m.doc);
    }
    return next;
  }

  function enquiryTransition(id, event, meta, actor) {
    const raw = store.get("enquiries", id);
    if (!raw) return null;
    const next = applyEnquiryEvent(normalizeEnquiry(raw), event, meta, actor);
    store.update("enquiries", id, next, actor);
    return next;
  }

  function enquiryStats() {
    const all = store.list("enquiries").map(normalizeEnquiry);
    const td = today();
    const pendingFollowups = store.list("followups").filter((f) => f.refType === "Enquiry" && f.status === "Pending");
    const dueToday = pendingFollowups.filter((f) => f.date === td);
    const overdue = pendingFollowups.filter((f) => (f.date || "") < td);
    const won = all.filter((e) => e.status === "Won / Converted to Sales Order");
    const lost = all.filter((e) => e.status === "Lost");
    const decided = won.length + lost.length;
    return {
      new: all.filter((e) => e.status === "New Enquiry").length,
      underReview: all.filter((e) => e.status === "Under Review").length,
      quotationPrep: all.filter((e) => e.status === "Quotation Under Preparation").length,
      offerSent: all.filter((e) => e.status === "Offer Sent" || e.status === "Revised Offer Sent").length,
      followupsDueToday: dueToday.length,
      overdueFollowups: overdue.length,
      won: won.length,
      lost: lost.length,
      conversionRatio: decided ? Math.round((won.length / decided) * 100) : 0,
      all,
    };
  }

  function fillCustomerFields(customerId, form) {
    const c = VG.normalizeCustomer ? VG.normalizeCustomer(store.get("customers", customerId) || {}) : (store.get("customers", customerId) || {});
    const primary = (c.contacts || [])[0] || {};
    const bill = VG.customerAddr ? VG.customerAddr(c, "billing") : {};
    const addr = bill.addr ? [bill.addr.line1, bill.addr.city, bill.addr.state, bill.addr.pin].filter(Boolean).join(", ") : (c.billing || "");
    return {
      ...form,
      customerId,
      customerType: "Existing",
      companyName: c.legalName || c.name || form.companyName,
      contactPerson: primary.name || c.contact || form.contactPerson,
      contactPhone: primary.mobile || c.phone || form.contactPhone,
      contactEmail: primary.email || c.email || form.contactEmail,
      altPhone: primary.altPhone || form.altPhone,
      billingAddress: addr,
      gstin: c.gstin || form.gstin,
      currency: c.currency || form.currency || "INR",
    };
  }

  /* ---------- Dashboard strip ---------- */
  function EnquiryDashboard({ onFilter }) {
    VG.useDB();
    const s = enquiryStats();
    const tiles = [
      { label: "New enquiries", value: s.new, color: "#60a5fa", status: "New Enquiry" },
      { label: "Under review", value: s.underReview, color: "#818cf8", status: "Under Review" },
      { label: "Quotation prep", value: s.quotationPrep, color: "#a78bfa", status: "Quotation Under Preparation" },
      { label: "Offers sent", value: s.offerSent, color: "#34d399", status: "Offer Sent" },
      { label: "Follow-ups today", value: s.followupsDueToday, color: "#fbbf24", key: "followups_today" },
      { label: "Overdue follow-ups", value: s.overdueFollowups, color: "#ef4444", key: "overdue" },
      { label: "Won", value: s.won, color: "#22c55e", status: "Won / Converted to Sales Order" },
      { label: "Lost", value: s.lost, color: "#f87171", status: "Lost" },
      { label: "Conversion %", value: s.conversionRatio + "%", color: "#6366f1", key: "conversion" },
    ];
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
        {tiles.map((t) => (
          <button key={t.label} type="button" onClick={() => onFilter && onFilter(t.status || t.key)} className="rounded-xl glass p-3 text-left chrome-hover">
            <div className="text-xl font-display font-bold" style={{ color: t.color }}>{t.value}</div>
            <div className="text-[11px] opacity-55 mt-0.5">{t.label}</div>
          </button>
        ))}
      </div>
    );
  }

  /* ---------- Builder ---------- */
  function EnquiryBuilder({ open, onClose, record, roleKey, can, onSaved }) {
    const isEdit = !!(record && record.id);
    const [tab, setTab] = useState("customer");
    const [e, setE] = useState(() => normalizeEnquiry(record || { date: today(), status: "New Enquiry", lines: [blankLine()] }));
    const [err, setErr] = useState({});
    const [dirty, setDirty] = useState(false);
    const [showNewCustomer, setShowNewCustomer] = useState(false);
    const set = (k, v) => { setDirty(true); setE((p) => ({ ...p, [k]: v })); };
    const categories = store.list("categories").map((c) => ({ value: c.name, label: c.name }));

    useEffect(() => {
      if (record) setE(normalizeEnquiry(record));
    }, [record && record.id]);

    function pickCustomer(id) {
      setDirty(true);
      setE((p) => fillCustomerFields(id, p));
    }

    function setLine(key, patch) {
      setDirty(true);
      setE((p) => ({ ...p, lines: p.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
    }
    const addLine = () => { setDirty(true); setE((p) => ({ ...p, lines: p.lines.concat(blankLine()) })); };
    const delLine = (key) => { setDirty(true); setE((p) => ({ ...p, lines: p.lines.filter((l) => l.key !== key) })); };

    function validate() {
      const errors = {};
      if (!e.customerId && e.customerType === "Existing") errors.customerId = "Select customer";
      if (!e.companyName) errors.companyName = "Company name required";
      if (!e.contactPerson) errors.contactPerson = "Contact person required";
      if (!e.projectName) errors.projectName = "Project name required";
      setErr(errors);
      return errors;
    }

    function save() {
      if (!can("add") && !isEdit) return VG.toast("No permission to create enquiry", "error");
      if (isEdit && !can("edit")) return VG.toast("No permission to edit enquiry", "error");
      const errors = validate();
      if (Object.keys(errors).length) {
        VG.toast("Fix highlighted fields", "error");
        if (errors.customerId || errors.companyName) setTab("customer");
        else setTab("project");
        return;
      }
      const cleanLines = e.lines.map(({ key, ...l }) => l);
      const subject = e.subject || e.projectName || (cleanLines[0] && cleanLines[0].desc) || "Enquiry";
      let payload = { ...e, subject, lines: cleanLines, items: cleanLines.map((l) => l.desc).filter(Boolean).join("; ") };
      if (isEdit) {
        if (e.assignedTo && e.assignedTo !== record.assignedTo && e.status === "New Enquiry") {
          payload = applyEnquiryEvent(normalizeEnquiry(record), "assigned", { assignedTo: e.assignedTo, note: "Assigned to " + e.assignedTo }, roleKey);
          payload = { ...payload, ...e, subject, lines: cleanLines };
        }
        store.update("enquiries", e.id, payload, roleKey);
        VG.toast("Enquiry " + e.no + " updated");
      } else {
        payload.no = store.nextNo("ENQ", e.date || today());
        payload.enquiryRef = payload.no;
        payload.owner = roleKey;
        payload.status = "New Enquiry";
        payload.timeline = [{ id: uid(), ts: Date.now(), action: "created", by: roleKey, detail: "Enquiry " + payload.no + " logged" }];
        if (e.assignedTo) {
          payload = applyEnquiryEvent(payload, "assigned", { assignedTo: e.assignedTo, note: "Assigned to " + e.assignedTo }, roleKey);
        }
        store.create("enquiries", payload, roleKey);
        VG.toast("Enquiry " + payload.no + " created");
      }
      onSaved && onSaved();
      onClose();
    }

    const tabs = [["customer", "Customer"], ["project", "Project"], ["items", "Requirements"], ["other", "Other"]];

    return (
      <>
        <InternalScreen onBack={onClose} backLabel="Back to enquiries" dirty={dirty} title={(isEdit ? "Edit " : "New ") + "Enquiry"} subtitle={isEdit ? e.no : "Complete customer, project & requirement details"}
          footer={<Button icon="check" onClick={save}>{isEdit ? "Update" : "Save Enquiry"}</Button>}>
          <div className="flex flex-wrap gap-1 mb-4">
            {tabs.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={"px-3 py-1.5 rounded-lg text-xs font-medium " + (tab === k ? "bg-white/15" : "opacity-55 hover:opacity-80")}>{l}</button>
            ))}
          </div>

          {tab === "customer" && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label="Customer type" className="sm:col-span-3">
                <Select value={e.customerType} onChange={(v) => set("customerType", v)} options={[{ value: "Existing", label: "Existing customer" }, { value: "New", label: "New customer" }]} />
              </Field>
              {e.customerType === "Existing" ? (
                <Field label="Customer (from master)" required error={err.customerId} className="lg:col-span-2">
                  <div className="flex gap-2">
                    <div className="flex-1"><MasterSelect collection="customers" value={e.customerId} onChange={pickCustomer} actorRole={roleKey} can={can("add")} /></div>
                    {can("add") && <Button variant="soft" icon="users" onClick={() => setShowNewCustomer(true)}>Add New Customer</Button>}
                  </div>
                </Field>
              ) : (
                can("add") && <div className="sm:col-span-3"><Button icon="users" onClick={() => setShowNewCustomer(true)}>Add New Customer to Master</Button></div>
              )}
              <Field label="Company name" required error={err.companyName}><Text value={e.companyName} onChange={(v) => set("companyName", v)} /></Field>
              <Field label="Contact person" required error={err.contactPerson}><Text value={e.contactPerson} onChange={(v) => set("contactPerson", v)} /></Field>
              <Field label="Contact number"><Text value={e.contactPhone} onChange={(v) => set("contactPhone", v)} /></Field>
              <Field label="Email"><Text value={e.contactEmail} onChange={(v) => set("contactEmail", v)} /></Field>
              <Field label="Alternate contact"><Text value={e.altPhone} onChange={(v) => set("altPhone", v)} /></Field>
              <Field label="Customer source"><Select value={e.customerSource} onChange={(v) => set("customerSource", v)} options={CUSTOMER_SOURCES.map((s) => ({ value: s, label: s }))} /></Field>
              <Field label="Billing / address" className="sm:col-span-2"><Area value={e.billingAddress} onChange={(v) => set("billingAddress", v)} rows={2} /></Field>
              <Field label="GSTIN"><Text value={e.gstin} onChange={(v) => set("gstin", v)} /></Field>
              <Field label="Currency"><Text value={e.currency || "INR"} onChange={(v) => set("currency", v)} /></Field>
              <Field label="Assign to sales user"><Text value={e.assignedTo} onChange={(v) => set("assignedTo", v)} placeholder={roleKey} /></Field>
            </div>
          )}

          {tab === "project" && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label="Project name" required error={err.projectName}><Text value={e.projectName} onChange={(v) => set("projectName", v)} /></Field>
              <Field label="Project location"><Text value={e.projectLocation} onChange={(v) => set("projectLocation", v)} /></Field>
              <Field label="Enquiry reference"><Text value={e.enquiryRef} onChange={(v) => set("enquiryRef", v)} placeholder="Auto on save" disabled /></Field>
              <Field label="Customer RFQ number"><Text value={e.customerRfqNo} onChange={(v) => set("customerRfqNo", v)} /></Field>
              <Field label="Enquiry date"><DateF value={e.date} onChange={(v) => set("date", v)} /></Field>
              <Field label="Required offer submission date"><DateF value={e.offerDueDate} onChange={(v) => set("offerDueDate", v)} /></Field>
              <Field label="Expected order date"><DateF value={e.expectedOrderDate} onChange={(v) => set("expectedOrderDate", v)} /></Field>
              <Field label="Priority"><Select value={e.priority} onChange={(v) => set("priority", v)} options={PRIORITIES.map((p) => ({ value: p, label: p }))} /></Field>
              <Field label="Subject / headline" className="sm:col-span-2"><Text value={e.subject} onChange={(v) => set("subject", v)} placeholder="Defaults to project name" /></Field>
            </div>
          )}

          {tab === "items" && (
            <div className="space-y-3">
              {e.lines.map((l, i) => (
                <Card key={l.key} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium opacity-60">Line {i + 1}</span>
                    {e.lines.length > 1 && <Button variant="ghost" icon="trash" onClick={() => delLine(l.key)} />}
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <Field label="Item description" className="sm:col-span-2"><Text value={l.desc} onChange={(v) => setLine(l.key, { desc: v })} /></Field>
                    <Field label="Product category"><Select value={l.category} onChange={(v) => setLine(l.key, { category: v })} options={[{ value: "", label: "—" }].concat(categories)} /></Field>
                    <Field label="Required quantity"><Num value={l.qty} onChange={(v) => setLine(l.key, { qty: v })} /></Field>
                    <Field label="Unit"><Text value={l.unit} onChange={(v) => setLine(l.key, { unit: v })} /></Field>
                    <Field label="Application area"><Text value={l.application} onChange={(v) => setLine(l.key, { application: v })} /></Field>
                    <Field label="Technical specification" className="sm:col-span-2"><Area value={l.techSpec} onChange={(v) => setLine(l.key, { techSpec: v })} rows={2} /></Field>
                    <Field label="Drawing / document"><Text value={l.drawingFile} onChange={(v) => setLine(l.key, { drawingFile: v })} placeholder="drawing.pdf" /></Field>
                    <Field label="Remarks" className="sm:col-span-2"><Area value={l.remarks} onChange={(v) => setLine(l.key, { remarks: v })} rows={2} /></Field>
                  </div>
                </Card>
              ))}
              <Button variant="soft" icon="plus" onClick={addLine}>Add requirement line</Button>
            </div>
          )}

          {tab === "other" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Enquiry type"><Select value={e.type} onChange={(v) => set("type", v)} options={[{ value: "Sales", label: "Sales" }, { value: "Purchase", label: "Purchase" }]} /></Field>
              {isEdit && <Field label="Status"><Select value={e.status} onChange={(v) => set("status", v)} options={ENQ_STATUSES.map((s) => ({ value: s, label: s }))} /></Field>}
              <Field label="General remarks" className="sm:col-span-2"><Area value={e.remarks} onChange={(v) => set("remarks", v)} rows={3} /></Field>
            </div>
          )}
        </InternalScreen>
        {showNewCustomer && VG.CustomerForm && (
          <VG.CustomerForm open record={null} roleKey={roleKey} can={can} onClose={() => setShowNewCustomer(false)}
            onSaved={(saved) => {
              setShowNewCustomer(false);
              if (saved && saved.id) {
                setDirty(true);
                setE((p) => fillCustomerFields(saved.id, { ...p, customerId: saved.id, customerType: "Existing" }));
                VG.toast("Customer saved — details auto-filled");
              }
            }} />
        )}
      </>
    );
  }

  /* ---------- Action modals ---------- */
  function OfferSentModal({ open, onClose, enquiry, roleKey, onDone }) {
    const [mode, setMode] = useState("Email");
    const [contact, setContact] = useState(enquiry ? (enquiry.contactEmail || enquiry.contactPhone || "") : "");
    const [quotationId, setQuotationId] = useState(enquiry ? (enquiry.latestQuotationId || "") : "");
    const quotes = enquiry ? store.list("quotations").filter((q) => q.enquiryId === enquiry.id || (enquiry.quotationIds || []).includes(q.id)) : [];
    useEffect(() => {
      if (enquiry) {
        setContact(enquiry.contactEmail || enquiry.contactPhone || "");
        setQuotationId(enquiry.latestQuotationId || (quotes[0] && quotes[0].id) || "");
      }
    }, [enquiry && enquiry.id]);
    function submit() {
      const q = store.get("quotations", quotationId);
      const isRevised = enquiry.status === "Offer Sent" || enquiry.status === "Revised Offer Sent";
      const event = isRevised ? "revised_offer_sent" : "offer_sent";
      const pdfDoc = q ? { type: "Offer PDF", name: (q.no || "quotation") + " Rev " + (q.rev || 0) + ".pdf", quotationId: q.id, uploadedAt: Date.now(), uploadedBy: roleKey } : null;
      enquiryTransition(enquiry.id, event, {
        mode, contact, quotationId, quotationNo: q && q.no, note: "Offer sent via " + mode + (q ? " — " + q.no : ""),
        pdfDoc,
      }, roleKey);
      if (q) store.update("quotations", q.id, { status: q.status === "Draft" ? "Draft" : "Sent" }, roleKey);
      VG.toast("Offer marked as sent");
      onDone && onDone();
      onClose();
    }
    return (
      <Modal open={open} onClose={onClose} size="sm" title="Mark Offer Sent"
        actions={<Button icon="send" onClick={submit}>Confirm sent</Button>}>
        <div className="space-y-3">
          <Field label="Sent mode"><Select value={mode} onChange={setMode} options={OFFER_MODES.map((m) => ({ value: m, label: m }))} /></Field>
          <Field label="Customer email / contact used"><Text value={contact} onChange={setContact} /></Field>
          <Field label="Linked quotation">
            <Select value={quotationId} onChange={setQuotationId} options={[{ value: "", label: "—" }].concat(quotes.map((q) => ({ value: q.id, label: q.no + " (Rev " + (q.rev || 0) + ")" })))} />
          </Field>
        </div>
      </Modal>
    );
  }

  function FollowupModal({ open, onClose, enquiry, roleKey, onDone }) {
    const [f, setF] = useState({ date: today(), time: "10:00", mode: "Call", note: "", nextDate: "" });
    const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
    function submit() {
      const followup = { id: uid(), ...f, status: "Pending", createdBy: roleKey, createdAt: Date.now() };
      enquiryTransition(enquiry.id, "followup_added", { followup, storeFollowup: true, note: f.mode + ": " + f.note }, roleKey);
      VG.toast("Follow-up scheduled");
      onDone && onDone();
      onClose();
    }
    return (
      <Modal open={open} onClose={onClose} size="sm" title="Add Follow-up"
        actions={<Button icon="bell" onClick={submit}>Save follow-up</Button>}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Follow-up date"><DateF value={f.date} onChange={(v) => set("date", v)} /></Field>
          <Field label="Time"><Text value={f.time} onChange={(v) => set("time", v)} placeholder="10:00" /></Field>
          <Field label="Mode"><Select value={f.mode} onChange={(v) => set("mode", v)} options={FOLLOWUP_MODES.map((m) => ({ value: m, label: m }))} /></Field>
          <Field label="Next follow-up date"><DateF value={f.nextDate} onChange={(v) => set("nextDate", v)} /></Field>
          <Field label="Remarks" className="sm:col-span-2"><Area value={f.note} onChange={(v) => set("note", v)} rows={3} /></Field>
        </div>
      </Modal>
    );
  }

  function ClarificationModal({ open, onClose, enquiry, roleKey, onDone }) {
    const [note, setNote] = useState("");
    function submit() {
      enquiryTransition(enquiry.id, "clarification", { note }, roleKey);
      VG.toast("Clarification requested");
      onDone && onDone();
      onClose();
    }
    return (
      <Modal open={open} onClose={onClose} size="sm" title="Request Clarification"
        actions={<Button icon="message" onClick={submit}>Submit</Button>}>
        <Field label="Clarification required"><Area value={note} onChange={setNote} rows={4} placeholder="What information is needed from customer?" /></Field>
      </Modal>
    );
  }

  function DocumentUploadModal({ open, onClose, enquiry, roleKey, onDone }) {
    const [name, setName] = useState("");
  const [type, setType] = useState("Drawing");
    function submit() {
      if (!name) return VG.toast("Enter document name", "error");
      enquiryTransition(enquiry.id, "document_uploaded", {
        doc: { type, name, uploadedAt: Date.now(), uploadedBy: roleKey },
        note: type + ": " + name,
      }, roleKey);
      VG.toast("Document recorded");
      onDone && onDone();
      onClose();
    }
    return (
      <Modal open={open} onClose={onClose} size="sm" title="Upload Documents"
        actions={<Button icon="upload" onClick={submit}>Attach</Button>}>
        <div className="space-y-3">
          <Field label="Document type"><Select value={type} onChange={setType} options={["Drawing", "Specification", "RFQ", "Offer PDF", "Other"].map((t) => ({ value: t, label: t }))} /></Field>
          <Field label="File name / reference"><Text value={name} onChange={setName} placeholder="drawing-v2.pdf" /></Field>
        </div>
      </Modal>
    );
  }

  /* ---------- Detail view ---------- */
  function EnquiryView({ enquiry: initial, onClose, roleKey, can, onChange }) {
    const [e, setE] = useState(() => normalizeEnquiry(initial));
    const [modal, setModal] = useState(null);
    const [highlightTimeline, setHighlightTimeline] = useState(false);
    const timelineRef = React.useRef(null);
    const refresh = () => { const n = normalizeEnquiry(store.get("enquiries", e.id)); setE(n); onChange && onChange(n); };
    useEffect(() => {
      if (highlightTimeline && timelineRef.current) {
        timelineRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        const t = setTimeout(() => setHighlightTimeline(false), 2000);
        return () => clearTimeout(t);
      }
    }, [highlightTimeline]);

    const linkedQuotes = store.list("quotations").filter((q) => q.enquiryId === e.id || (e.quotationIds || []).includes(q.id));
    const linkedSO = e.salesOrderId ? store.get("salesOrders", e.salesOrderId) : store.list("salesOrders").find((o) => o.enquiryId === e.id);

    function createQuotation() {
      if (!can("add")) return VG.toast("No permission", "error");
      const lines = (e.lines || []).map((l) => ({
        itemId: "", sku: "", desc: l.desc, hsn: "", qty: l.qty || 1, unit: l.unit || "Nos", rate: 0, discountPct: 0, taxPct: 18,
      }));
      VG._pendingQuotationFromEnquiry = {
        customerId: e.customerId, contact: e.contactPerson, enquiryId: e.id,
        subject: e.subject || e.projectName, projectName: e.projectName, projectLocation: e.projectLocation,
        rfqRef: e.customerRfqNo || e.enquiryRef, lines: lines.length ? lines : undefined,
      };
      enquiryTransition(e.id, "quotation_created", { note: "Quotation creation started" }, roleKey);
      VG.goTo("sales", "quotations");
      onClose();
    }

    async function convertSO() {
      if (!can("add")) return VG.toast("No permission", "error");
      const q = linkedQuotes.find((x) => x.status === "Approved" || x.status === "Sent" || x.status === "Won") || linkedQuotes[0];
      if (!q) return VG.toast("Create a quotation first", "warn");
      const existingSO = store.list("salesOrders").find((o) => o.quotationId === q.id && o.status !== "Cancelled");
      if (!VG.ensureSOFromQuotation) return VG.toast("Sales order conversion unavailable", "error");
      await VG.forwardDocument({
        action: "enquiry:sales_order",
        fromType: "Enquiry", fromNo: e.no, fromId: e.id,
        toType: "Sales Order", actor: roleKey,
        duplicate: existingSO ? { exists: true, no: existingSO.no, label: "Sales Order", linked: existingSO } : null,
        confirmMessage: "Are you sure you want to convert this Enquiry (" + e.no + ") to Sales Order?",
        run: () => {
          const so = VG.ensureSOFromQuotation(q, roleKey);
          if (!so) return null;
          store.update("salesOrders", so.id, { enquiryId: e.id }, roleKey);
          enquiryTransition(e.id, "converted_so", { salesOrderId: so.id, salesOrderNo: so.no, note: "Sales order " + so.no }, roleKey);
          return so;
        },
        statusChange: "Converted to Sales Order",
        onDone: () => refresh(),
      });
    }

    const actions = [
      { label: "Create Quotation", icon: "edit", perm: "add", onClick: createQuotation },
      { label: "Request Clarification", icon: "message", perm: "edit", onClick: () => setModal("clarification") },
      { label: "Add Follow-up", icon: "bell", perm: "add", onClick: () => setModal("followup") },
      { label: "Mark Offer Sent", icon: "send", perm: "edit", onClick: () => setModal("offer") },
      { label: "Create Revised Offer", icon: "edit", perm: "add", onClick: createQuotation },
      { label: "Mark Negotiation", icon: "message", perm: "edit", onClick: () => { enquiryTransition(e.id, "negotiation", { note: "Customer in negotiation" }, roleKey); refresh(); } },
      { label: "Convert to Sales Order", icon: "cart", perm: "add", onClick: convertSO },
      { label: "Mark as Won", icon: "check", perm: "edit", onClick: () => { enquiryTransition(e.id, "won", { note: "Customer confirmed order" }, roleKey); refresh(); } },
      { label: "Mark as Lost", icon: "alert", perm: "edit", onClick: () => { enquiryTransition(e.id, "lost", { note: "Enquiry not successful" }, roleKey); refresh(); } },
      { label: "Cancel Enquiry", icon: "trash", perm: "delete", onClick: async () => { if (await VG.confirm({ title: "Cancel enquiry " + e.no + "?", danger: true, confirmLabel: "Cancel enquiry" })) { enquiryTransition(e.id, "cancelled", { note: "Enquiry cancelled" }, roleKey); refresh(); } } },
      { label: "Close Enquiry", icon: "lock", perm: "delete", onClick: async () => { if (await VG.confirm({ title: "Close enquiry?", confirmLabel: "Close" })) { enquiryTransition(e.id, "closed", { note: "Enquiry closed" }, roleKey); refresh(); } } },
      { label: "Upload Documents", icon: "upload", perm: "edit", onClick: () => setModal("doc") },
      { label: "View Timeline", icon: "activity", perm: "view", onClick: () => setHighlightTimeline(true) },
    ];

    if (modal === "offer") {
      return <OfferSentModal open enquiry={e} roleKey={roleKey} onClose={() => setModal(null)} onDone={refresh} />;
    }
    if (modal === "followup") {
      return <FollowupModal open enquiry={e} roleKey={roleKey} onClose={() => setModal(null)} onDone={refresh} />;
    }
    if (modal === "clarification") {
      return <ClarificationModal open enquiry={e} roleKey={roleKey} onClose={() => setModal(null)} onDone={refresh} />;
    }
    if (modal === "doc") {
      return <DocumentUploadModal open enquiry={e} roleKey={roleKey} onClose={() => setModal(null)} onDone={refresh} />;
    }
    return (
      <InternalScreen onBack={onClose} backLabel="Back to enquiries" title={e.no} subtitle={e.projectName || e.subject}
        breadcrumbs={[{ label: "Enquiries", onClick: onClose }, { label: e.no }]}>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <StatusTag value={e.status} map={ENQ_STATUS_COLORS} />
            {e.priority && e.priority !== "Normal" && <Pill color={e.priority === "Urgent" ? "#ef4444" : "#f59e0b"}>{e.priority}</Pill>}
            <span className="text-xs opacity-50 ml-auto">{e.date}{e.assignedTo ? " · " + e.assignedTo : ""}</span>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {actions.map((a) => can(a.perm) && (
              <Button key={a.label} variant="soft" icon={a.icon} onClick={a.onClick}>{a.label}</Button>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-3 mb-4">
            <Card className="p-3 text-sm">
              <div className="text-[11px] uppercase opacity-55 mb-2">Customer</div>
              <div className="font-medium">{e.companyName || custName(e.customerId)}</div>
              <div className="opacity-60 text-xs mt-1">{e.contactPerson}{e.contactPhone ? " · " + e.contactPhone : ""}</div>
              {e.contactEmail && <div className="opacity-60 text-xs">{e.contactEmail}</div>}
              <div className="opacity-50 text-xs mt-1">{e.customerSource} · {e.customerType}</div>
            </Card>
            <Card className="p-3 text-sm">
              <div className="text-[11px] uppercase opacity-55 mb-2">Project</div>
              <div>{e.projectLocation || "—"}</div>
              <div className="opacity-60 text-xs mt-1">RFQ: {e.customerRfqNo || "—"} · Due: {e.offerDueDate || "—"}</div>
              {e.offerSentDate && <div className="opacity-60 text-xs mt-1">Offer sent {e.offerSentDate} via {e.offerSentMode} by {e.offerSentBy}</div>}
              {e.latestQuotationNo && <div className="opacity-60 text-xs">Quotation: {e.latestQuotationNo}</div>}
              {linkedSO && <div className="text-emerald-400 text-xs mt-1">SO: {linkedSO.no}</div>}
            </Card>
          </div>

          {(e.lines || []).length > 0 && (
            <Card className="p-3 mb-4 overflow-x-auto">
              <div className="text-[11px] uppercase opacity-55 mb-2">Requirements</div>
              <table className="w-full text-xs">
                <thead className="opacity-55"><tr><th className="text-left py-1">Description</th><th className="text-right py-1">Qty</th><th>Category</th></tr></thead>
                <tbody>{e.lines.map((l, i) => (
                  <tr key={i} className="border-t border-white/5"><td className="py-1.5">{l.desc}{l.techSpec && <div className="opacity-50">{l.techSpec}</div>}</td><td className="text-right">{l.qty} {l.unit}</td><td>{l.category || "—"}</td></tr>
                ))}</tbody>
              </table>
            </Card>
          )}

          {e.clarificationNote && (
            <Card className="p-3 mb-4 border border-amber-500/30 text-sm"><div className="text-[11px] uppercase text-amber-400 mb-1">Clarification required</div>{e.clarificationNote}</Card>
          )}

          <Card ref={timelineRef} className={"p-3 mb-4 transition-shadow " + (highlightTimeline ? "ring-2 ring-indigo-400/50" : "")}>
            <div className="text-[11px] uppercase opacity-55 mb-3">Activity timeline</div>
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {(e.timeline || []).slice().reverse().map((t) => (
                <li key={t.id || t.ts} className="flex gap-3 text-xs">
                  <span className="opacity-40 shrink-0 w-28">{new Date(t.ts).toLocaleString()}</span>
                  <Pill color={ENQ_STATUS_COLORS[e.status] || "#94a3b8"}>{timelineLabel(t.action)}</Pill>
                  <span className="opacity-70 flex-1">{t.detail}</span>
                  <span className="opacity-40">{t.by}</span>
                </li>
              ))}
            </ul>
          </Card>

          {(e.documents || []).length > 0 && (
            <Card className="p-3">
              <div className="text-[11px] uppercase opacity-55 mb-2">Documents</div>
              <ul className="text-xs space-y-1">{(e.documents || []).map((d, i) => (
                <li key={i} className="flex gap-2"><Icon name="folder" size={12} /><span>{d.name}</span><span className="opacity-50">{d.type}</span></li>
              ))}</ul>
            </Card>
          )}
      </InternalScreen>
    );
  }

  /* ---------- Reports ---------- */
  function runEnquiryReport(title, rows, cols) {
    fx.printTable(title, cols, rows);
  }

  function EnquiryReports({ can }) {
    const all = store.list("enquiries").map(normalizeEnquiry);
    const td = today();
    const reports = [
      { n: "Enquiry status report", run: () => runEnquiryReport("Enquiry Status Report", all, [
        { key: "no", label: "Enquiry #" }, { key: "customer", label: "Customer", csv: (r) => r.companyName || custName(r.customerId) },
        { key: "projectName", label: "Project" }, { key: "status", label: "Status" }, { key: "date", label: "Date" },
      ]) },
      { n: "Offer sent report", run: () => runEnquiryReport("Offer Sent Report", all.filter((e) => e.offerSentDate), [
        { key: "no", label: "Enquiry #" }, { key: "q", label: "Quotation", csv: (r) => r.latestQuotationNo || "—" },
        { key: "offerSentDate", label: "Sent date" }, { key: "offerSentMode", label: "Mode" }, { key: "offerSentBy", label: "Sent by" },
      ]) },
      { n: "Pending quotation report", run: () => runEnquiryReport("Pending Quotation", all.filter((e) => ["New Enquiry", "Under Review", "Clarification Required"].includes(e.status)), [
        { key: "no", label: "Enquiry #" }, { key: "status", label: "Status" }, { key: "offerDueDate", label: "Offer due" },
      ]) },
      { n: "Follow-up due report", run: () => runEnquiryReport("Follow-up Due", store.list("followups").filter((f) => f.refType === "Enquiry" && f.status === "Pending"), [
        { key: "date", label: "Due" }, { key: "enq", label: "Enquiry", csv: (r) => (store.get("enquiries", r.refId) || {}).no || r.refId },
        { key: "mode", label: "Mode" }, { key: "note", label: "Note" },
      ]) },
      { n: "Lost enquiry report", run: () => runEnquiryReport("Lost Enquiries", all.filter((e) => e.status === "Lost"), [
        { key: "no", label: "Enquiry #" }, { key: "projectName", label: "Project" }, { key: "date", label: "Date" },
      ]) },
      { n: "Won enquiry report", run: () => runEnquiryReport("Won Enquiries", all.filter((e) => e.status === "Won / Converted to Sales Order"), [
        { key: "no", label: "Enquiry #" }, { key: "so", label: "Sales order", csv: (r) => r.salesOrderNo || "—" },
      ]) },
      { n: "Salesperson-wise enquiry report", run: () => runEnquiryReport("Salesperson Enquiries", all, [
        { key: "assignedTo", label: "Salesperson", csv: (r) => r.assignedTo || r.owner || "—" },
        { key: "no", label: "Enquiry #" }, { key: "status", label: "Status" },
      ]) },
      { n: "Customer-wise enquiry report", run: () => runEnquiryReport("Customer Enquiries", all, [
        { key: "customer", label: "Customer", csv: (r) => r.companyName || custName(r.customerId) },
        { key: "no", label: "Enquiry #" }, { key: "status", label: "Status" },
      ]) },
      { n: "Product-wise enquiry report", run: () => {
        const flat = [];
        all.forEach((e) => (e.lines || []).forEach((l) => flat.push({ enquiry: e.no, desc: l.desc, category: l.category, qty: l.qty, unit: l.unit })));
        runEnquiryReport("Product-wise Enquiries", flat, [
          { key: "enquiry", label: "Enquiry" }, { key: "desc", label: "Item" }, { key: "category", label: "Category" }, { key: "qty", label: "Qty" },
        ]);
      } },
    ];
    return (
      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        {reports.map((r) => (
          <Card key={r.n} className="p-4 flex items-center gap-4">
            <span className="grid place-items-center w-11 h-11 rounded-xl text-white shrink-0" style={{ background: "var(--accent)" }}><Icon name="chart" size={18} /></span>
            <div className="flex-1 text-sm font-medium">{r.n}</div>
            {can("print") && <Button variant="soft" icon="printer" onClick={r.run}>Print</Button>}
          </Card>
        ))}
      </div>
    );
  }

  /* ---------- Main page ---------- */
  function EnquiriesPage({ roleKey, can }) {
    VG.useDB();
    const [builder, setBuilder] = useState(null);
    const [view, setView] = useState(null);
    const [statusFilter, setStatusFilter] = useState("");
    const [showReports, setShowReports] = useState(false);
    useEffect(() => {
      if (VG._pendingEnquiryFilter) {
        setStatusFilter(VG._pendingEnquiryFilter);
        VG._pendingEnquiryFilter = "";
      }
    }, []);
    const rowsAll = store.list("enquiries").map(normalizeEnquiry).slice().reverse();
    const rows = useMemo(() => {
      let r = VG.useFilteredCustomerRows ? VG.useFilteredCustomerRows(rowsAll) : rowsAll;
      if (statusFilter === "followups_today") {
        const ids = store.list("followups").filter((f) => f.refType === "Enquiry" && f.status === "Pending" && f.date === today()).map((f) => f.refId);
        r = r.filter((e) => ids.includes(e.id));
      } else if (statusFilter === "overdue") {
        const ids = store.list("followups").filter((f) => f.refType === "Enquiry" && f.status === "Pending" && (f.date || "") < today()).map((f) => f.refId);
        r = r.filter((e) => ids.includes(e.id));
      } else if (statusFilter) r = r.filter((e) => e.status === statusFilter);
      return r;
    }, [rowsAll, statusFilter]);

    const cols = [
      { key: "no", label: "Enquiry #", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
      { key: "companyName", label: "Customer", render: (r) => r.companyName || custName(r.customerId), csv: (r) => r.companyName || custName(r.customerId) },
      { key: "projectName", label: "Project" },
      { key: "priority", label: "Priority", render: (r) => r.priority !== "Normal" ? <Pill color={r.priority === "Urgent" ? "#ef4444" : "#f59e0b"}>{r.priority}</Pill> : <span className="opacity-40">Normal</span> },
      { key: "offerDueDate", label: "Offer due" },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={ENQ_STATUS_COLORS} /> },
      { key: "assignedTo", label: "Owner", render: (r) => <span className="text-xs opacity-70">{r.assignedTo || r.owner || "—"}</span> },
    ];

    if (builder) {
      return <EnquiryBuilder open onClose={() => setBuilder(null)} record={builder.id ? builder : null} roleKey={roleKey} can={can} onSaved={() => {}} />;
    }
    if (view) {
      const eLive = normalizeEnquiry(store.get("enquiries", view.id) || view);
      return (
        <EnquiryView enquiry={eLive} onClose={() => setView(null)} roleKey={roleKey} can={can}
          onChange={() => setView(normalizeEnquiry(store.get("enquiries", view.id)))} />
      );
    }
    return (
      <ListPage title="Enquiry Management" desc="Capture enquiries, track offers, follow-ups and conversion to sales orders" onNew={can("add") ? () => setBuilder({ date: today(), status: "New Enquiry", customerType: "Existing", lines: [blankLine()] }) : null} newLabel="Add Enquiry" can={can}>
        {VG.CustomerFilterBanner ? <VG.CustomerFilterBanner /> : null}
        <EnquiryDashboard onFilter={setStatusFilter} />
        {statusFilter && (
          <div className="mb-3 flex items-center gap-2 text-xs">
            <Pill color="#6366f1">Filter: {statusFilter}</Pill>
            <button type="button" className="opacity-50 hover:opacity-100" onClick={() => setStatusFilter("")}>Clear</button>
          </div>
        )}
        <RecordTable embedded suppressNew tableId="enquiries" title="Enquiry List" columns={cols} rows={rows} can={can} printTitle="Enquiries"
          searchKeys={["no", "projectName", "companyName", "subject", "customerRfqNo"]}
          filters={[{ key: "status", label: "All status", options: ENQ_STATUSES }, { key: "priority", label: "All priority", options: PRIORITIES }, { key: "type", label: "All types", options: ["Sales", "Purchase"] }]}
          onNew={can("add") ? () => setBuilder({ date: today(), status: "New Enquiry", customerType: "Existing", lines: [blankLine()] }) : null}
          onView={(r) => setView(r)} onEdit={can("edit") ? (r) => setBuilder(r) : null}
          onDelete={can("delete") ? async (r) => {
            if (await VG.confirm({ title: "Delete enquiry " + r.no + "?", danger: true, confirmLabel: "Delete" })) {
              store.remove("enquiries", r.id, roleKey);
              VG.toast("Deleted");
            }
          } : null} />
        <div className="mt-6">
          <button type="button" onClick={() => setShowReports((v) => !v)} className="text-sm font-medium opacity-70 hover:opacity-100 flex items-center gap-2">
            <Icon name="chart" size={16} /> Enquiry reports {showReports ? "▲" : "▼"}
          </button>
          {showReports && <EnquiryReports can={can} />}
        </div>
      </ListPage>
    );
  }

  /* ---------- Hooks for quotation / SO integration ---------- */
  VG.enquiryOnQuotationSaved = function (q, actor) {
    if (!q.enquiryId) return;
    const enq = normalizeEnquiry(store.get("enquiries", q.enquiryId));
    if (!enq) return;
    const hadQuote = (enq.quotationIds || []).includes(q.id);
    let next = { ...enq, latestQuotationId: q.id, latestQuotationNo: q.no, quotationIds: [...new Set((enq.quotationIds || []).concat(q.id))] };
    if (!hadQuote) next = appendTimeline(next, "quotation_created", actor, "Quotation " + q.no + " created");
    if (q.status === "Sent") {
      const ev = enq.status === "Offer Sent" || enq.status === "Revised Offer Sent" ? "revised_offer_sent" : "offer_sent";
      next = applyEnquiryEvent(next, ev, { quotationId: q.id, quotationNo: q.no, note: "Quotation " + q.no + " sent" }, actor);
    } else if (!["Offer Sent", "Revised Offer Sent", "Won / Converted to Sales Order"].includes(enq.status)) {
      next.status = "Quotation Under Preparation";
    }
    store.update("enquiries", enq.id, next, actor);
  };

  VG.enquiryOnOfferSent = function (q, actor, mode, contact) {
    if (!q.enquiryId) return;
    const enq = normalizeEnquiry(store.get("enquiries", q.enquiryId));
    if (!enq) return;
    const ev = enq.status === "Offer Sent" || enq.status === "Revised Offer Sent" ? "revised_offer_sent" : "offer_sent";
    enquiryTransition(enq.id, ev, {
      quotationId: q.id, quotationNo: q.no, mode: mode || "Email", contact: contact || "",
      pdfDoc: { type: "Offer PDF", name: q.no + " Rev " + (q.rev || 0) + ".pdf", quotationId: q.id, uploadedAt: Date.now(), uploadedBy: actor },
      note: "Offer " + q.no + " sent via " + (mode || "Email"),
    }, actor);
  };

  VG.enquiryOnConverted = function (q, so, actor) {
    if (!q.enquiryId || !so) return;
    enquiryTransition(q.enquiryId, "converted_so", { salesOrderId: so.id, salesOrderNo: so.no, note: "Converted to SO " + so.no }, actor);
  };

  VG.enquiryOnFollowupDone = function (enquiryId, followup, actor) {
    const enq = normalizeEnquiry(store.get("enquiries", enquiryId));
    if (!enq) return;
    const next = appendTimeline(enq, "customer_response", actor, (followup.mode || "Follow-up") + " completed: " + (followup.note || ""));
    store.update("enquiries", enquiryId, next, actor);
  };

  VG.enquiryStats = enquiryStats;
  VG.enquiryTransition = enquiryTransition;
  VG.normalizeEnquiry = normalizeEnquiry;
  VG.EnquiriesPage = EnquiriesPage;
  VG.EnquiryDashboard = EnquiryDashboard;
  VG.EnquiryReports = EnquiryReports;
})(window.VG = window.VG || {});
