/* Veraglo ERP — Customer Master (comprehensive, world-class). */
(function (VG) {
  const { useState, useEffect, useRef, useMemo } = React;
  const ui = VG.ui, fx = VG.fx, store = VG.store, today = VG.fmt.todayISO, inr = VG.fmt.inr;
  const { Icon, Button, Pill, Card } = ui;
  const { Field, Text, Area, Num, DateF, Select, Checkbox, Modal, RecordTable, PageHead, ListPage, StatusTag, printDocument, DocActions } = fx;

  /* ---------- reference data ---------- */
  const CUST_TYPES = ["Individual", "Company", "Government", "Dealer", "Export", "Other"];
  const STATUSES = ["Active", "Inactive", "On Hold", "Blacklisted"];
  const STATUS_COLOR = { Active: "#34d399", Inactive: "#94a3b8", "On Hold": "#f59e0b", Blacklisted: "#ef4444" };
  const APPROVAL_COLOR = { Approved: "#34d399", Pending: "#f59e0b", Rejected: "#ef4444" };
  const CONTACT_ROLES = ["Primary", "Accounts", "Purchase", "Technical", "Other"];
  const ADDR_TYPES = ["Billing", "Shipping", "Registered Office", "Site", "Warehouse", "Other"];
  const DISCOUNT_CATS = ["None", "Tier-1", "Tier-2", "Tier-3", "Project"];
  const TAX_CATS = ["Registered", "Unregistered", "Composition", "SEZ", "Export / Overseas"];
  const GST_REG_TYPES = ["Regular", "Composition", "Unregistered", "SEZ", "Deemed Export", "Overseas / Export"];
  const TCS_TDS = ["Not applicable", "TCS applicable", "TDS applicable"];
  const INCOTERMS = ["", "EXW", "FOB", "CIF", "CFR", "DAP", "DDP"];
  const PRICE_LISTS = ["Standard", "Dealer", "Distributor", "Project", "Export"];
  const STATE_CODE = {
    "Jammu & Kashmir": "01", "Himachal Pradesh": "02", Punjab: "03", Chandigarh: "04", Uttarakhand: "05",
    Haryana: "06", Delhi: "07", Rajasthan: "08", "Uttar Pradesh": "09", Bihar: "10", Sikkim: "11",
    "Arunachal Pradesh": "12", Nagaland: "13", Manipur: "14", Mizoram: "15", Tripura: "16", Meghalaya: "17",
    Assam: "18", "West Bengal": "19", Jharkhand: "20", Odisha: "21", Chhattisgarh: "22", "Madhya Pradesh": "23",
    Gujarat: "24", Maharashtra: "27", Karnataka: "29", Goa: "30", Lakshadweep: "31", Kerala: "32",
    "Tamil Nadu": "33", Puducherry: "34", Telangana: "36", "Andhra Pradesh": "37", Ladakh: "38",
  };

  /* ---------- validators ---------- */
  const RX = {
    gstin: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/,
    pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
    ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
    pin: /^[0-9]{6}$/,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  };
  const uid = () => "a" + Math.random().toString(36).slice(2, 8);

  /* ---------- normalize (migrate old flat records) ---------- */
  function normalize(rec) {
    const c = rec ? JSON.parse(JSON.stringify(rec)) : {};
    c.legalName = c.legalName || c.name || "";
    c.tradeName = c.tradeName || "";
    c.type = c.type || "Company";
    c.status = c.status || "Active";
    c.currency = c.currency || "INR";
    c.gstRegType = c.gstRegType || (c.gstin ? "Regular" : "Unregistered");
    c.priceList = c.priceList || "Standard";
    c.approvalStatus = c.approvalStatus || (rec && rec.id ? "Approved" : "Pending");
    c.bank = c.bank || {};
    c.documents = Array.isArray(c.documents) ? c.documents : [];
    if (!Array.isArray(c.contacts) || !c.contacts.length) {
      c.contacts = c.contact || c.phone || c.email
        ? [{ name: c.contact || "", designation: "", role: "Primary", mobile: c.phone || "", altPhone: "", email: c.email || "" }]
        : [{ name: "", designation: "", role: "Primary", mobile: "", altPhone: "", email: "" }];
    }
    if (!Array.isArray(c.addresses) || !c.addresses.length) {
      const a = [];
      if (c.billing) a.push({ id: uid(), type: "Billing", line1: c.billing, line2: "", landmark: "", city: "", district: "", state: c.state || "", country: "India", pin: "", stateCode: STATE_CODE[c.state] || "", gstin: c.gstin || "", contact: c.contact || "", mobile: c.phone || "", email: c.email || "", defaultBilling: true, defaultShipping: !c.shipping });
      if (c.shipping) a.push({ id: uid(), type: "Shipping", line1: c.shipping, line2: "", landmark: "", city: "", district: "", state: "", country: "India", pin: "", stateCode: "", gstin: "", contact: "", mobile: "", email: "", defaultBilling: false, defaultShipping: true });
      if (!a.length) a.push({ id: uid(), type: "Billing", line1: "", line2: "", landmark: "", city: "", district: "", state: "", country: "India", pin: "", stateCode: "", gstin: "", contact: "", mobile: "", email: "", defaultBilling: true, defaultShipping: true });
      c.addresses = a;
    }
    return c;
  }
  function formatAddress(a) {
    if (!a) return "";
    return [a.line1, a.line2, a.landmark, a.city, a.state, a.country, a.pin].filter(Boolean).join(", ");
  }
  function customerAddr(c, kind, addressId) {
    const nc = c && c.addresses ? c : normalize(c || {});
    if (Array.isArray(nc.addresses) && nc.addresses.length) {
      let a = addressId ? nc.addresses.find((x) => x.id === addressId) : null;
      if (!a) {
        const flag = kind === "shipping" ? "defaultShipping" : "defaultBilling";
        a = nc.addresses.find((x) => x[flag]) || nc.addresses[0];
      }
      return { text: formatAddress(a), gstin: a.gstin || nc.gstin || "", addr: a, addressId: a.id };
    }
    return { text: (kind === "shipping" ? nc.shipping : nc.billing) || "", gstin: nc.gstin || "", addr: null, addressId: "" };
  }
  function customerAddressOptions(c) {
    const nc = normalize(c || {});
    return (nc.addresses || []).map((a) => ({
      value: a.id,
      label: [a.type, formatAddress(a)].filter(Boolean).join(" — ")
        + (a.defaultBilling ? " · def. billing" : "") + (a.defaultShipping ? " · def. shipping" : ""),
    }));
  }
  function applyCustomerToTransaction(c, prev, opts) {
    const nc = normalize(c || {});
    const bill = customerAddr(nc, "billing", opts && opts.billingAddressId);
    const ship = customerAddr(nc, "shipping", opts && opts.shippingAddressId);
    const primary = (nc.contacts || []).find((x) => x.role === "Primary") || (nc.contacts || [])[0] || {};
    const curRow = store.list("currencies").find((x) => x.code === (nc.currency || "INR"));
    return {
      ...prev,
      customerId: nc.id,
      contact: (primary && primary.name) || nc.contact || "",
      billing: bill.text,
      shipping: ship.text,
      billingAddressId: bill.addressId || "",
      shippingAddressId: ship.addressId || "",
      gstin: bill.gstin || nc.gstin || "",
      paymentTermsId: prev.paymentTermsId || nc.paymentTermsId || "",
      deliveryTermsId: prev.deliveryTermsId || nc.deliveryTermsId || "",
      currency: prev.currency || nc.currency || "INR",
      exchangeRate: prev.exchangeRate != null ? prev.exchangeRate : (curRow ? curRow.rate : 1),
      placeOfSupply: prev.placeOfSupply || (bill.addr && bill.addr.state) || nc.state || "",
    };
  }

  /* ---------- PIN code lookup (master → India Post API → manual) ---------- */
  async function lookupPin(pin) {
    const local = store.list("pincodes").filter((p) => p.pin === pin);
    if (local.length) return { source: "master", options: local };
    try {
      const r = await fetch("https://api.postalpincode.in/pincode/" + pin);
      const j = await r.json();
      if (j && j[0] && j[0].Status === "Success" && j[0].PostOffice) {
        const seen = {};
        const options = j[0].PostOffice.map((o) => ({
          pin, city: o.Block && o.Block !== "NA" ? o.Block : o.District, locality: o.Name,
          district: o.District, state: o.State, country: o.Country || "India", stateCode: STATE_CODE[o.State] || "",
        })).filter((o) => (seen[o.locality] ? false : (seen[o.locality] = true)));
        return { source: "api", options };
      }
    } catch (e) { /* offline / blocked */ }
    return null;
  }

  /* ---------- duplicate detection ---------- */
  function findDuplicates(c, excludeId) {
    const norm = (s) => (s || "").toString().trim().toLowerCase();
    const mobiles = (c.contacts || []).map((x) => norm(x.mobile)).filter(Boolean);
    const emails = (c.contacts || []).map((x) => norm(x.email)).filter(Boolean);
    const out = [];
    store.list("customers").forEach((e) => {
      if (e.id === excludeId) return;
      const hits = [];
      if (c.legalName && norm(e.legalName || e.name) === norm(c.legalName)) hits.push("name");
      if (c.pan && norm(e.pan) === norm(c.pan)) hits.push("PAN");
      if (c.gstin && norm(e.gstin) === norm(c.gstin)) hits.push("GSTIN");
      const eMob = (e.contacts || [{ mobile: e.phone }]).map((x) => norm(x.mobile));
      const eMail = (e.contacts || [{ email: e.email }]).map((x) => norm(x.email));
      if (mobiles.some((m) => eMob.includes(m))) hits.push("mobile");
      if (emails.some((m) => eMail.includes(m))) hits.push("email");
      if (hits.length) out.push({ name: e.legalName || e.name, code: e.code, on: hits.join(", ") });
    });
    return out;
  }

  /* ================= Address card ================= */
  function AddressCard({ a, idx, onChange, onRemove, onSetDefault, disabled }) {
    const [busy, setBusy] = useState(false);
    const [opts, setOpts] = useState(null);
    const set = (k, v) => onChange({ ...a, [k]: v });
    async function doLookup() {
      if (!RX.pin.test(a.pin || "")) return VG.toast("Enter a valid 6-digit PIN", "warn");
      setBusy(true); setOpts(null);
      const res = await lookupPin(a.pin);
      setBusy(false);
      if (!res) {
        onChange({ ...a, verifyPending: true });
        return VG.toast("PIN not found — enter city/state manually (flagged for admin verification)", "warn");
      }
      if (res.options.length === 1) { applyPin(res.options[0]); VG.toast("Location auto-filled from " + res.source); }
      else setOpts(res.options);
    }
    function applyPin(o) {
      onChange({ ...a, city: o.city, district: o.district, state: o.state, country: o.country, stateCode: o.stateCode, verifyPending: false });
      store.upsertPincode({ pin: o.pin, city: o.city, district: o.district, state: o.state, country: o.country, stateCode: o.stateCode });
      setOpts(null);
    }
    return (
      <Card className="p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <Pill color="#6366f1">#{idx + 1}</Pill>
          <select disabled={disabled} value={a.type} onChange={(e) => set("type", e.target.value)} className="rounded-lg glass px-2 py-1.5 text-sm bg-transparent outline-none">
            {ADDR_TYPES.map((t) => <option key={t} value={t} className="vg-option">{t}</option>)}
          </select>
          {a.verifyPending && <Pill color="#f59e0b">verify pending</Pill>}
          {!disabled && <button onClick={onRemove} className="ml-auto p-1 rounded chrome-hover hover:text-rose-400"><Icon name="trash" size={15} /></button>}
        </div>
        <div className="vg-customer-form-grid">
          <Field label="Address Line 1"><Text disabled={disabled} value={a.line1} onChange={(v) => set("line1", v)} /></Field>
          <Field label="Address Line 2"><Text disabled={disabled} value={a.line2} onChange={(v) => set("line2", v)} /></Field>
          <Field label="Landmark"><Text disabled={disabled} value={a.landmark} onChange={(v) => set("landmark", v)} /></Field>
          <Field label="PIN / ZIP" hint="Enter PIN then Auto-fill">
            <div className="vg-pin-row">
              <Text disabled={disabled} value={a.pin} onChange={(v) => set("pin", v)} placeholder="6-digit" />
              {!disabled && <button type="button" onClick={doLookup} className="shrink-0 rounded-lg px-3 py-2 text-white text-xs font-medium whitespace-nowrap" style={{ background: "var(--accent)" }}>{busy ? "…" : "Auto-fill"}</button>}
            </div>
          </Field>
          <Field label="City"><Text disabled={disabled} value={a.city} onChange={(v) => set("city", v)} /></Field>
          <Field label="District"><Text disabled={disabled} value={a.district} onChange={(v) => set("district", v)} /></Field>
          <Field label="State"><Text disabled={disabled} value={a.state} onChange={(v) => set("state", v)} /></Field>
          <Field label="State code"><Text disabled={disabled} value={a.stateCode} onChange={(v) => set("stateCode", v)} placeholder="GST code" /></Field>
          <Field label="Country"><Text disabled={disabled} value={a.country} onChange={(v) => set("country", v)} /></Field>
          <Field label="GSTIN for this address (optional)"><Text disabled={disabled} value={a.gstin} onChange={(v) => set("gstin", v.toUpperCase())} /></Field>
          <Field label="Contact person"><Text disabled={disabled} value={a.contact} onChange={(v) => set("contact", v)} /></Field>
          <Field label="Mobile"><Text disabled={disabled} value={a.mobile} onChange={(v) => set("mobile", v)} /></Field>
          <Field label="Email"><Text disabled={disabled} value={a.email} onChange={(v) => set("email", v)} /></Field>
        </div>
        {opts && (
          <div className="rounded-lg glass p-2">
            <div className="text-[11px] opacity-60 mb-1">Multiple localities for {a.pin} — choose one:</div>
            <div className="flex flex-wrap gap-1.5">{opts.map((o, i) => <button key={i} onClick={() => applyPin(o)} className="text-xs rounded-lg px-2 py-1 glass chrome-hover">{o.locality} · {o.city}, {o.state}</button>)}</div>
          </div>
        )}
        <div className="flex flex-wrap gap-4 pt-1">
          <Checkbox disabled={disabled} checked={!!a.defaultBilling} onChange={() => onSetDefault("billing")} label="Default billing" />
          <Checkbox disabled={disabled} checked={!!a.defaultShipping} onChange={() => onSetDefault("shipping")} label="Default shipping" />
        </div>
      </Card>
    );
  }

  /* ================= Customer form ================= */
  function CustomerForm({ open, onClose, record, roleKey, can, onSaved }) {
    const isEdit = !!(record && record.id);
    const [tab, setTab] = useState("basic");
    const [c, setC] = useState(() => normalize(record));
    const [err, setErr] = useState({});
    const [shipSame, setShipSame] = useState(false);
    const [dirty, setDirty] = useState(false);
    const firstRef = useRef(true);
    useEffect(() => {
      if (!open) return;
      setTab("basic");
      setC(normalize(record));
      setErr({});
      setShipSame(false);
      setDirty(false);
      firstRef.current = true;
    }, [open, record && record.id]);
    useEffect(() => { if (firstRef.current) { firstRef.current = false; return; } setDirty(true); }, [c]);
    const disabled = isEdit && !can("edit");
    const set = (k, v) => setC((p) => ({ ...p, [k]: v }));

    /* contacts */
    const setContact = (i, patch) => setC((p) => ({ ...p, contacts: p.contacts.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
    const addContact = () => setC((p) => ({ ...p, contacts: p.contacts.concat({ name: "", designation: "", role: "Other", mobile: "", altPhone: "", email: "" }) }));
    const delContact = (i) => setC((p) => ({ ...p, contacts: p.contacts.filter((_, j) => j !== i) }));

    /* addresses */
    const setAddr = (i, next) => setC((p) => ({ ...p, addresses: p.addresses.map((x, j) => (j === i ? next : x)) }));
    const addAddr = () => setC((p) => ({ ...p, addresses: p.addresses.concat({ id: uid(), type: "Shipping", line1: "", line2: "", landmark: "", city: "", district: "", state: "", country: "India", pin: "", stateCode: "", gstin: "", contact: "", mobile: "", email: "", defaultBilling: false, defaultShipping: false }) }));
    const delAddr = (i) => setC((p) => ({ ...p, addresses: p.addresses.filter((_, j) => j !== i) }));
    function setDefault(i, kind) {
      const flag = kind === "billing" ? "defaultBilling" : "defaultShipping";
      setC((p) => ({ ...p, addresses: p.addresses.map((x, j) => ({ ...x, [flag]: j === i })) }));
    }
    function copyBillToShip(on) {
      setShipSame(on);
      if (!on) return;
      const bill = c.addresses.find((x) => x.defaultBilling) || c.addresses[0];
      if (!bill) return;
      const ship = { ...bill, id: uid(), type: "Shipping", defaultBilling: false, defaultShipping: true };
      setC((p) => {
        const addrs = p.addresses.map((x) => ({ ...x, defaultShipping: false }));
        const exIdx = addrs.findIndex((x) => x.type === "Shipping");
        if (exIdx >= 0) addrs[exIdx] = ship; else addrs.push(ship);
        return { ...p, addresses: addrs };
      });
      VG.toast("Billing address copied to shipping");
    }

    /* documents */
    const addDoc = () => setC((p) => ({ ...p, documents: p.documents.concat({ type: "Other KYC", name: "" }) }));
    const setDoc = (i, patch) => setC((p) => ({ ...p, documents: p.documents.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
    const delDoc = (i) => setC((p) => ({ ...p, documents: p.documents.filter((_, j) => j !== i) }));

    function validate() {
      const e = {};
      if (!c.legalName) e.legalName = "Legal name is required";
      if (c.gstin && !RX.gstin.test(c.gstin)) e.gstin = "Invalid GSTIN format (15 chars, e.g. 27ABCDE1234F1Z5)";
      if (c.pan && !RX.pan.test(c.pan)) e.pan = "Invalid PAN (e.g. ABCDE1234F)";
      if (c.bank && c.bank.ifsc && !RX.ifsc.test(c.bank.ifsc)) e.ifsc = "Invalid IFSC";
      (c.contacts || []).forEach((ct) => { if (ct.email && !RX.email.test(ct.email)) e.contactEmail = "A contact email is invalid"; });
      setErr(e);
      return e;
    }

    async function save() {
      const e = validate();
      if (Object.keys(e).length) {
        VG.toast("Please fix the highlighted fields", "error");
        if (e.legalName || e.gstin || e.pan) setTab("basic");
        else if (e.contactEmail) setTab("contacts");
        else if (e.ifsc) setTab("banking");
        return;
      }
      // ensure one default billing & shipping
      const addrs = c.addresses.slice();
      if (addrs.length) {
        if (!addrs.some((a) => a.defaultBilling)) addrs[0].defaultBilling = true;
        if (!addrs.some((a) => a.defaultShipping)) addrs[0].defaultShipping = true;
      }
      // duplicate check (new)
      if (!isEdit) {
        const dupes = findDuplicates(c);
        if (dupes.length) {
          const ok = await VG.confirm({
            title: "Possible duplicate customer", danger: true, confirmLabel: "Create anyway",
            message: "Matches existing: " + dupes.map((d) => d.name + " (" + d.code + ") on " + d.on).join("; ") + ".",
          });
          if (!ok) return;
        }
      }
      const billDef = addrs.find((a) => a.defaultBilling) || addrs[0];
      const shipDef = addrs.find((a) => a.defaultShipping) || billDef;
      const primary = (c.contacts || []).find((x) => x.role === "Primary") || (c.contacts || [])[0] || {};
      const payload = {
        ...c, addresses: addrs,
        // compat flat fields used across quotation/order/proforma/reports
        name: c.legalName, contact: primary.name || "", phone: primary.mobile || "", email: primary.email || "",
        gstin: c.gstin || (billDef && billDef.gstin) || "", state: billDef ? billDef.state : c.state,
        billing: formatAddress(billDef), shipping: formatAddress(shipDef),
      };
      let saved;
      if (isEdit) {
        payload.modifiedBy = roleKey; payload.modifiedAt = today();
        store.update("customers", c.id, payload, roleKey);
        saved = { ...payload, id: c.id };
        VG.toast("Customer updated");
      } else {
        payload.code = store.nextCustomerCode ? store.nextCustomerCode() : store.nextMasterCode("CUST");
        payload.createdBy = roleKey;
        payload.approvalStatus = can("approve") ? "Approved" : "Pending";
        payload.approvedBy = can("approve") ? roleKey : "";
        saved = store.create("customers", payload, roleKey);
        VG.toast(payload.approvalStatus === "Pending" ? "Customer created — pending approval" : "Customer created & approved");
      }
      onSaved && onSaved(saved);
      onClose();
    }

    const TABS = [
      ["basic", "Basic"], ["contacts", "Contacts"], ["addresses", "Addresses"],
      ["commercial", "Commercial"], ["banking", "Banking"], ["documents", "Documents"], ["system", "System"],
    ];
    const currencies = store.list("currencies");
    const primary = (c.contacts || [])[0] || { name: "", mobile: "", email: "" };
    function setPrimary(patch) {
      setC((p) => {
        const contacts = (p.contacts || []).slice();
        if (!contacts.length) contacts.push({ name: "", designation: "", role: "Primary", mobile: "", altPhone: "", email: "" });
        contacts[0] = { ...contacts[0], role: "Primary", ...patch };
        return { ...p, contacts };
      });
    }
    return (
      <Modal open={open} onClose={onClose} dirty={dirty && !disabled} title={isEdit ? "Edit Customer " + (c.code || "") : "Add New Customer"}
        subtitle="GSTIN is optional · contacts, addresses and commercial terms"
        backLabel="Back to customers"
        className="vg-customer-form"
        footer={!disabled ? (
          <Button icon="check" onClick={save}>{isEdit ? "Save changes" : "Create customer"}</Button>
        ) : null}>
        {disabled && <div className="mb-3 text-xs rounded-lg p-2.5" style={{ background: "#f59e0b22", color: "#f59e0b" }}><Icon name="lock" size={12} className="inline mr-1" />You have view-only access — editing requires permission.</div>}
        <div className="vg-customer-form-tabs" role="tablist" aria-label="Customer form sections">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={"text-sm px-3 py-1.5 rounded-lg transition " + (tab === id ? "text-white shadow-sm" : "glass opacity-70 hover:opacity-100")} style={tab === id ? { background: "var(--accent)" } : undefined}>{label}</button>
          ))}
        </div>

        {tab === "basic" && (
          <div className="vg-customer-form-grid">
            <Field label="Customer code"><Text disabled value={c.code || "Auto-generated on save"} onChange={() => {}} /></Field>
            <Field label="Legal name" required error={err.legalName}><Text disabled={disabled} value={c.legalName} onChange={(v) => set("legalName", v)} /></Field>
            <Field label="Display / trade name"><Text disabled={disabled} value={c.tradeName} onChange={(v) => set("tradeName", v)} /></Field>
            <Field label="Customer type"><Select value={c.type} onChange={(v) => set("type", v)} options={CUST_TYPES.map((t) => ({ value: t, label: t }))} /></Field>
            <Field label="Customer category"><Text disabled={disabled} value={c.category} onChange={(v) => set("category", v)} placeholder="Key Account, Retail…" /></Field>
            <Field label="Status"><Select value={c.status} onChange={(v) => set("status", v)} options={STATUSES.map((t) => ({ value: t, label: t }))} /></Field>
            <Field label="PAN number" error={err.pan} hint="Optional"><Text disabled={disabled} value={c.pan} onChange={(v) => set("pan", v.toUpperCase())} placeholder="ABCDE1234F" /></Field>
            <Field label="GST number" error={err.gstin} hint="Optional — validated if entered"><Text disabled={disabled} value={c.gstin} onChange={(v) => set("gstin", v.toUpperCase())} placeholder="27ABCDE1234F1Z5" /></Field>
            <Field label="GST registration type"><Select value={c.gstRegType} onChange={(v) => set("gstRegType", v)} options={GST_REG_TYPES.map((t) => ({ value: t, label: t }))} /></Field>
            <Field label="Contact person"><Text disabled={disabled} value={primary.name} onChange={(v) => setPrimary({ name: v })} /></Field>
            <Field label="Mobile number"><Text disabled={disabled} value={primary.mobile} onChange={(v) => setPrimary({ mobile: v })} /></Field>
            <Field label="Email"><Text disabled={disabled} value={primary.email} onChange={(v) => setPrimary({ email: v })} /></Field>
            <Field label="CIN / registration no." hint="Optional"><Text disabled={disabled} value={c.cin} onChange={(v) => set("cin", v)} /></Field>
            <Field label="Website"><Text disabled={disabled} value={c.website} onChange={(v) => set("website", v)} /></Field>
            <Field label="Default currency"><Select value={c.currency} onChange={(v) => set("currency", v)} options={currencies.map((x) => ({ value: x.code, label: x.code + " — " + x.name }))} /></Field>
            <Field label="Lead source"><Text disabled={disabled} value={c.source} onChange={(v) => set("source", v)} placeholder="Website, Referral…" /></Field>
            <Field label="Assigned sales person"><Text disabled={disabled} value={c.salesPerson} onChange={(v) => set("salesPerson", v)} /></Field>
          </div>
        )}

        {tab === "contacts" && (
          <div className="space-y-3">
            {c.contacts.map((ct, i) => (
              <Card key={i} className="p-3 sm:p-4">
                <div className="vg-customer-form-grid">
                  <Field label="Contact person"><Text disabled={disabled} value={ct.name} onChange={(v) => setContact(i, { name: v })} /></Field>
                  <Field label="Designation"><Text disabled={disabled} value={ct.designation} onChange={(v) => setContact(i, { designation: v })} /></Field>
                  <Field label="Role"><Select value={ct.role} onChange={(v) => setContact(i, { role: v })} options={CONTACT_ROLES.map((r) => ({ value: r, label: r }))} /></Field>
                  <Field label="Mobile"><Text disabled={disabled} value={ct.mobile} onChange={(v) => setContact(i, { mobile: v })} /></Field>
                  <Field label="Alternate phone"><Text disabled={disabled} value={ct.altPhone} onChange={(v) => setContact(i, { altPhone: v })} /></Field>
                  <Field label="Email" error={i === 0 && err.contactEmail}><Text disabled={disabled} value={ct.email} onChange={(v) => setContact(i, { email: v })} /></Field>
                </div>
                {!disabled && c.contacts.length > 1 && <button onClick={() => delContact(i)} className="mt-2 text-xs flex items-center gap-1 opacity-70 hover:text-rose-400"><Icon name="trash" size={13} /> Remove contact</button>}
              </Card>
            ))}
            {!disabled && <Button variant="soft" icon="plus" onClick={addContact}>Add contact person</Button>}
          </div>
        )}

        {tab === "addresses" && (
          <div className="space-y-3">
            {!disabled && <div className="flex flex-wrap items-center gap-4"><Checkbox checked={shipSame} onChange={copyBillToShip} label="Shipping address same as billing" /><span className="text-xs opacity-50">Copies the default billing address into shipping (still editable).</span></div>}
            {c.addresses.map((a, i) => (
              <AddressCard key={a.id || i} a={a} idx={i} disabled={disabled} onChange={(next) => setAddr(i, next)} onRemove={() => delAddr(i)} onSetDefault={(kind) => setDefault(i, kind)} />
            ))}
            {!disabled && <Button variant="soft" icon="plus" onClick={addAddr}>Add address</Button>}
          </div>
        )}

        {tab === "commercial" && (
          <div className="vg-customer-form-grid">
            <Field label="Default currency"><Select value={c.currency} onChange={(v) => set("currency", v)} options={currencies.map((x) => ({ value: x.code, label: x.code + " — " + x.name }))} /></Field>
            <Field label="Multi-currency allowed" className="flex flex-col justify-end"><Checkbox disabled={disabled} checked={!!c.multiCurrency} onChange={(v) => set("multiCurrency", v)} label="Enable multi-currency transactions" /></Field>
            <Field label="Price list"><Select value={c.priceList} onChange={(v) => set("priceList", v)} options={PRICE_LISTS.map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Payment terms"><Select value={c.paymentTermsId} onChange={(v) => set("paymentTermsId", v)} options={store.list("paymentTerms").map((t) => ({ value: t.id, label: t.name }))} /></Field>
            <Field label="Delivery terms"><Select value={c.deliveryTermsId} onChange={(v) => set("deliveryTermsId", v)} options={store.list("deliveryTerms").map((t) => ({ value: t.id, label: t.name }))} /></Field>
            <Field label="Credit limit (₹)"><Num value={c.creditLimit} onChange={(v) => set("creditLimit", v)} /></Field>
            <Field label="Credit days"><Num value={c.creditDays} onChange={(v) => set("creditDays", v)} /></Field>
            <Field label="Outstanding balance (₹)"><Num value={c.outstanding} onChange={(v) => set("outstanding", v)} /></Field>
            <Field label="Discount category"><Select value={c.discountCategory} onChange={(v) => set("discountCategory", v)} options={DISCOUNT_CATS.map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Tax category"><Select value={c.taxCategory} onChange={(v) => set("taxCategory", v)} options={TAX_CATS.map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="TCS / TDS"><Select value={c.tcsTds} onChange={(v) => set("tcsTds", v)} options={TCS_TDS.map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Incoterms (export)"><Select value={c.incoterms} onChange={(v) => set("incoterms", v)} options={INCOTERMS.map((x) => ({ value: x, label: x || "—" }))} /></Field>
            <Field label="Preferred freight terms"><Text disabled={disabled} value={c.freightTerms} onChange={(v) => set("freightTerms", v)} /></Field>
          </div>
        )}

        {tab === "banking" && (
          <div className="vg-customer-form-grid">
            <Field label="Bank name"><Text disabled={disabled} value={c.bank.name} onChange={(v) => set("bank", { ...c.bank, name: v })} /></Field>
            <Field label="Account holder name"><Text disabled={disabled} value={c.bank.holder} onChange={(v) => set("bank", { ...c.bank, holder: v })} /></Field>
            <Field label="Account number"><Text disabled={disabled} value={c.bank.account} onChange={(v) => set("bank", { ...c.bank, account: v })} /></Field>
            <Field label="IFSC / SWIFT" error={err.ifsc}><Text disabled={disabled} value={c.bank.ifsc} onChange={(v) => set("bank", { ...c.bank, ifsc: v.toUpperCase() })} /></Field>
            <Field label="Branch"><Text disabled={disabled} value={c.bank.branch} onChange={(v) => set("bank", { ...c.bank, branch: v })} /></Field>
            <Field label="Country"><Text disabled={disabled} value={c.bank.country} onChange={(v) => set("bank", { ...c.bank, country: v })} /></Field>
            <Field label="Bank documents" className="vg-field-full"><Text disabled={disabled} value={c.bank.docs} onChange={(v) => set("bank", { ...c.bank, docs: v })} placeholder="cancelled-cheque.pdf" /></Field>
          </div>
        )}

        {tab === "documents" && (
          <div className="space-y-2">
            {c.documents.length === 0 && <div className="text-sm opacity-50">No KYC documents added.</div>}
            {c.documents.map((d, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select disabled={disabled} value={d.type} onChange={(e) => setDoc(i, { type: e.target.value })} className="rounded-lg glass px-2.5 py-2 text-sm bg-transparent outline-none">
                  {["GST Certificate", "PAN Card", "Company Registration", "Purchase Terms", "Customer Approval", "Other KYC"].map((t) => <option key={t} value={t} className="vg-option">{t}</option>)}
                </select>
                <input disabled={disabled} value={d.name} onChange={(e) => setDoc(i, { name: e.target.value })} placeholder="file name / reference" className="flex-1 min-w-[180px] rounded-lg glass px-3 py-2 text-sm bg-transparent outline-none" />
                {!disabled && <button onClick={() => delDoc(i)} className="p-1.5 rounded chrome-hover hover:text-rose-400"><Icon name="trash" size={15} /></button>}
              </div>
            ))}
            {!disabled && <Button variant="soft" icon="upload" onClick={addDoc}>Add document</Button>}
          </div>
        )}

        {tab === "system" && (
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <Card className="p-4"><div className="text-[11px] uppercase opacity-55 mb-2">Approval</div>
              <div className="flex items-center gap-2"><StatusTag value={c.approvalStatus} map={APPROVAL_COLOR} />{c.approvedBy && <span className="opacity-60 text-xs">by {c.approvedBy}</span>}</div>
              <div className="text-xs opacity-60 mt-2">New customers added by users without approval rights enter a <b>Pending</b> approval queue.</div>
            </Card>
            <Card className="p-4"><div className="text-[11px] uppercase opacity-55 mb-2">Audit</div>
              <div className="space-y-1 text-xs opacity-70">
                <div>Created by: <b>{c.createdBy || "—"}</b></div>
                <div>Modified by: <b>{c.modifiedBy || "—"}</b> {c.modifiedAt ? "· " + c.modifiedAt : ""}</div>
              </div>
            </Card>
            <Card className="p-4 sm:col-span-2"><div className="text-[11px] uppercase opacity-55 mb-2">Duplicate check</div>
              <div className="text-xs opacity-70">On save we match against existing customers by <b>name, mobile, email, PAN and GSTIN</b> and warn before creating a duplicate.</div>
            </Card>
          </div>
        )}
      </Modal>
    );
  }

  function daysBetween(a, b) {
    const d1 = new Date(a);
    const d2 = new Date(b);
    if (isNaN(d1) || isNaN(d2)) return 0;
    return Math.floor((d2 - d1) / 86400000);
  }

  function invoiceBalance(inv) {
    return Math.max(0, (Number(inv.amount) || Number((inv.totals || {}).grand) || 0) - (Number(inv.amountPaid) || 0));
  }

  function invoiceStatus(inv) {
    const bal = invoiceBalance(inv);
    const paid = Number(inv.amountPaid) || 0;
    if (bal <= 0 && paid > 0) return "Paid";
    if (paid > 0 && bal > 0) return "Partially Paid";
    if (inv.dueDate && inv.dueDate < today() && bal > 0) return "Overdue";
    if (bal > 0) return "Due";
    return inv.status || "Due";
  }

  VG.buildCustomer360 = function (customerId) {
    const c = normalize(store.get("customers", customerId) || {});
    const primary = (c.contacts || []).find((x) => x.role === "Primary") || (c.contacts || [])[0] || {};
    const bill = customerAddr(c, "billing");
    const ship = customerAddr(c, "shipping");
    const byCust = (coll) => (store.list(coll) || []).filter((x) => x.customerId === customerId);

    const enquiries = byCust("enquiries");
    const quotations = byCust("quotations");
    const proformas = byCust("proformas");
    const salesOrders = byCust("salesOrders");
    const invoices = byCust("invoices");
    const shipments = byCust("shipments");
    const payments = byCust("payments");
    const followups = byCust("followups");
    const communications = byCust("communications");
    const complaints = byCust("complaints");
    const serviceRecords = byCust("serviceRecords");
    const creditNotes = byCust("creditNotes");
    const debitNotes = byCust("debitNotes");
    const leads = byCust("leads");
    const deliveryChallans = shipments.filter((s) => s.status === "Delivered" || s.status === "In-transit" || s.no);

    const txnValue = salesOrders.reduce((s, o) => s + (Number((o.totals || {}).grand) || 0), 0)
      || quotations.reduce((s, q) => s + (Number((q.totals || {}).grand) || 0), 0);
    const totalInvoiced = invoices.reduce((s, i) => s + (Number(i.amount) || Number((i.totals || {}).grand) || 0), 0);
    const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const balance = invoices.reduce((s, i) => s + invoiceBalance(i), 0);
    const creditLimit = Number(c.creditLimit) || 0;
    const availableCredit = Math.max(0, creditLimit - balance);

    const openInvs = invoices.filter((i) => invoiceBalance(i) > 0);
    const overdueAmt = openInvs.filter((i) => i.dueDate && i.dueDate < today()).reduce((s, i) => s + invoiceBalance(i), 0);
    const oldestPending = openInvs.slice().sort((a, b) => (a.dueDate || a.date || "").localeCompare(b.dueDate || b.date || ""))[0] || null;

    const delays = [];
    payments.forEach((p) => {
      const inv = invoices.find((i) => i.id === p.invoiceId);
      if (inv && inv.date && p.date) delays.push(Math.max(0, daysBetween(inv.date, p.date)));
    });
    const avgPaymentDelay = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0;

    const ageing = { b0_30: 0, b31_60: 0, b61_90: 0, b90p: 0 };
    const ageingRows = openInvs.map((inv) => {
      const bal = invoiceBalance(inv);
      const due = inv.dueDate || inv.date || today();
      const daysOver = Math.max(0, daysBetween(due, today()));
      const st = invoiceStatus(inv);
      if (daysOver <= 30) ageing.b0_30 += bal;
      else if (daysOver <= 60) ageing.b31_60 += bal;
      else if (daysOver <= 90) ageing.b61_90 += bal;
      else ageing.b90p += bal;
      return { inv, balance: bal, daysOver, status: st };
    });

    const timeline = [];
    if (c.createdAt) timeline.push({ ts: c.createdAt, type: "Customer created", detail: c.legalName, icon: "user" });
    enquiries.forEach((e) => timeline.push({ ts: Date.parse(e.date) || 0, type: "Enquiry received", detail: e.no + " · " + (e.subject || ""), icon: "inbox" }));
    quotations.forEach((q) => timeline.push({ ts: Date.parse(q.date) || 0, type: "Quotation " + (q.status || ""), detail: q.no + " · " + inr((q.totals || {}).grand || 0), icon: "cart" }));
    proformas.forEach((p) => timeline.push({ ts: Date.parse(p.date) || 0, type: "Proforma invoice", detail: p.no, icon: "rupee" }));
    salesOrders.forEach((o) => timeline.push({ ts: Date.parse(o.date) || 0, type: "Sales order", detail: o.no + " · " + (o.stage || o.status || ""), icon: "cart" }));
    invoices.forEach((i) => timeline.push({ ts: Date.parse(i.date) || 0, type: "Tax invoice", detail: i.no + " · " + inr(i.amount || 0), icon: "rupee" }));
    shipments.forEach((s) => timeline.push({ ts: Date.parse(s.dispatchDate || s.date) || 0, type: "Dispatch / shipment", detail: s.no + " · " + (s.status || ""), icon: "truck" }));
    payments.forEach((p) => timeline.push({ ts: Date.parse(p.date) || 0, type: "Payment received", detail: inr(p.amount) + " · " + (p.invoiceNo || ""), icon: "check" }));
    followups.forEach((f) => timeline.push({ ts: Date.parse(f.date) || 0, type: "Follow-up", detail: f.note || f.mode, icon: "bell" }));
    complaints.forEach((x) => timeline.push({ ts: Date.parse(x.date) || 0, type: "Complaint", detail: x.subject || x.no, icon: "alert" }));
    (c.documents || []).forEach((d) => timeline.push({ ts: d.uploadedAt || 0, type: "Document uploaded", detail: d.name || d.type || "File", icon: "folder" }));
    timeline.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    const modules = [
      { key: "enquiries", label: "View Enquiries", module: "sales", section: "enquiries", count: enquiries.length, icon: "inbox" },
      { key: "quotations", label: "View Quotations", module: "sales", section: "quotations", count: quotations.length, icon: "cart" },
      { key: "proformas", label: "View Proforma Invoices", module: "sales", section: "proformas", count: proformas.length, icon: "rupee" },
      { key: "orders", label: "View Sales Orders", module: "sales", section: "orders", count: salesOrders.length, icon: "cart" },
      { key: "invoices", label: "View Invoices", module: "accounts", section: "receivables", count: invoices.length, icon: "rupee", finance: true },
      { key: "challans", label: "View Delivery Challans", module: "dispatch", section: "shipments", count: deliveryChallans.length, icon: "truck" },
      { key: "dispatch", label: "View Dispatches", module: "dispatch", section: "shipments", count: shipments.length, icon: "truck" },
      { key: "payments", label: "View Payments", module: "accounts", section: "payments", count: payments.length, icon: "check", finance: true },
      { key: "followups", label: "View Follow-ups", module: "sales", section: "followups", count: followups.length, icon: "bell" },
      { key: "complaints", label: "View Complaints", module: "sales", section: "comms", count: complaints.length, icon: "alert" },
      { key: "credit", label: "Credit Notes", module: "accounts", section: "receivables", count: creditNotes.length, icon: "rupee", finance: true },
      { key: "debit", label: "Debit Notes", module: "accounts", section: "receivables", count: debitNotes.length, icon: "rupee", finance: true },
      { key: "service", label: "Service Records", module: "sales", section: "comms", count: serviceRecords.length, icon: "headset" },
      { key: "documents", label: "View Documents", module: "sales", section: "customers", count: (c.documents || []).length, icon: "folder", local: true },
    ];

    const transactions = []
      .concat(enquiries.map((r) => ({ kind: "Enquiry", no: r.no, date: r.date, amount: null, status: r.status })))
      .concat(quotations.map((r) => ({ kind: "Quotation", no: r.no, date: r.date, amount: (r.totals || {}).grand, status: r.status })))
      .concat(proformas.map((r) => ({ kind: "Proforma", no: r.no, date: r.date, amount: (r.totals || {}).grand, status: r.status })))
      .concat(salesOrders.map((r) => ({ kind: "Sales Order", no: r.no, date: r.date, amount: (r.totals || {}).grand, status: r.stage || r.status })))
      .concat(invoices.map((r) => ({ kind: "Tax Invoice", no: r.no, date: r.date, amount: r.amount, status: r.status })))
      .concat(shipments.map((r) => ({ kind: "Delivery Challan / Dispatch", no: r.no, date: r.date, amount: null, status: r.status })))
      .concat(payments.map((r) => ({ kind: "Payment Received", no: r.invoiceNo || r.id, date: r.date, amount: r.amount, status: "Received" })))
      .concat(followups.map((r) => ({ kind: "Follow-up", no: r.refId || r.id, date: r.date, amount: null, status: r.status })))
      .concat(communications.map((r) => ({ kind: "Communication", no: r.mode, date: r.date, amount: null, status: r.subject || "" })))
      .concat(complaints.map((r) => ({ kind: "Complaint", no: r.no || r.id, date: r.date, amount: null, status: r.status })))
      .concat(serviceRecords.map((r) => ({ kind: "Service", no: r.no || r.id, date: r.date, amount: null, status: r.status })))
      .concat(creditNotes.map((r) => ({ kind: "Credit Note", no: r.no, date: r.date, amount: r.amount, status: r.status })))
      .concat(debitNotes.map((r) => ({ kind: "Debit Note", no: r.no, date: r.date, amount: r.amount, status: r.status })))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    return {
      customer: c,
      primary,
      bill,
      ship,
      modules,
      transactions,
      timeline,
      ageing,
      ageingRows,
      counts: { leads: leads.length, enquiries: enquiries.length, quotations: quotations.length, proformas: proformas.length, salesOrders: salesOrders.length, invoices: invoices.length, shipments: shipments.length, payments: payments.length, followups: followups.length, complaints: complaints.length, serviceRecords: serviceRecords.length, creditNotes: creditNotes.length, debitNotes: debitNotes.length },
      finance: { txnValue, totalInvoiced, totalPaid, balance, overdueAmt, creditLimit, availableCredit, oldestPending, avgPaymentDelay },
    };
  };

  VG.goToCustomerRecords = function (module, section, customerId, label) {
    if (VG.goTo) VG.goTo(module, section, { customerId, label });
  };

  function customerTxnSummaryDoc(c, data) {
    const rows = data.transactions.map((t) =>
      `<tr><td>${t.kind}</td><td>${t.no || ""}</td><td>${t.date || ""}</td><td class="vg-right">${t.amount != null ? inr(t.amount) : "—"}</td><td>${t.status || ""}</td></tr>`
    ).join("");
    return {
      title: "Customer Transaction Summary",
      subtitle: c.code + " · " + c.legalName,
      inner: `
        <div class="vg-cols">
          <div class="vg-card"><b>Customer</b>${c.legalName}<br>${c.tradeName || ""}<br>Status: ${c.status}</div>
          <div class="vg-card"><b>Activity counts</b>Quotations: ${data.counts.quotations}<br>Orders: ${data.counts.salesOrders}<br>Invoices: ${data.counts.invoices}</div>
          <div class="vg-card"><b>Generated</b>${new Date().toLocaleString("en-IN")}</div>
        </div>
        <table class="vg-tbl"><thead><tr><th>Type</th><th>Number</th><th>Date</th><th class="vg-right">Amount</th><th>Status</th></tr></thead><tbody>${rows || "<tr><td colspan='5'>No transactions</td></tr>"}</tbody></table>`,
    };
  }

  function customerStatementDoc(c, data) {
    const f = data.finance;
    const rows = data.ageingRows.map(({ inv, balance, daysOver, status }) =>
      `<tr><td>${inv.no}</td><td>${inv.date || ""}</td><td>${inv.dueDate || ""}</td><td class="vg-right">${inr(inv.amount || 0)}</td><td class="vg-right">${inr(inv.amountPaid || 0)}</td><td class="vg-right">${inr(balance)}</td><td class="vg-right">${daysOver}</td><td>${status}</td></tr>`
    ).join("");
    return {
      title: "Customer Statement",
      subtitle: c.code + " · " + c.legalName,
      inner: `
        <div class="vg-cols">
          <div class="vg-card"><b>Customer</b>${c.legalName}<br>GSTIN: ${c.gstin || "—"}<br>PAN: ${c.pan || "—"}</div>
          <div class="vg-card"><b>Summary</b>Invoiced: ${inr(f.totalInvoiced)}<br>Received: ${inr(f.totalPaid)}<br>Balance: ${inr(f.balance)}<br>Overdue: ${inr(f.overdueAmt)}</div>
          <div class="vg-card"><b>Credit</b>Limit: ${inr(f.creditLimit)}<br>Available: ${inr(f.availableCredit)}</div>
        </div>
        <h3 style="font-size:12px;margin:12px 0 6px">Outstanding invoices</h3>
        <table class="vg-tbl"><thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th class="vg-right">Amount</th><th class="vg-right">Paid</th><th class="vg-right">Balance</th><th class="vg-right">Days</th><th>Status</th></tr></thead><tbody>${rows || "<tr><td colspan='8'>No outstanding invoices</td></tr>"}</tbody></table>`,
    };
  }

  function exportCustomerCsv(c, data) {
    const lines = ["Type,Number,Date,Amount,Status"];
    data.transactions.forEach((t) => lines.push([t.kind, t.no, t.date, t.amount != null ? t.amount : "", t.status || ""].map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (c.code || "customer") + "-transactions.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  VG.useCustomerFilter = function () {
    const [f, setF] = useState(() => (VG.peekCustomerFilter ? VG.peekCustomerFilter() : null));
    useEffect(() => {
      const consumed = VG.consumeCustomerFilter ? VG.consumeCustomerFilter() : null;
      if (consumed) setF(consumed);
    }, []);
    return { filter: f, customerId: f && f.customerId, label: f && f.label, clear: () => setF(null) };
  };

  VG.filterRowsByCustomer = function (rows, customerId) {
    if (!customerId) return rows || [];
    return (rows || []).filter((r) => r.customerId === customerId);
  };

  function useFilteredCustomerRows(rows) {
    const { customerId } = VG.useCustomerFilter();
    return useMemo(() => VG.filterRowsByCustomer(rows, customerId), [rows, customerId]);
  }

  function CustomerFilterBanner() {
    const { customerId, label, clear } = VG.useCustomerFilter();
    if (!customerId) return null;
    const c = store.get("customers", customerId);
    return (
      <Card className="p-3 mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Icon name="filter" size={16} className="opacity-60" />
        <span>Filtered for customer: <b>{label || (c && (c.legalName || c.name)) || customerId}</b></span>
        <Button variant="soft" className="!py-1 !text-xs ml-auto" onClick={clear}>Clear filter</Button>
      </Card>
    );
  }

  function Customer360Page({ id, onBack, roleKey, can, onEdit }) {
    VG.useDB();
    const data = useMemo(() => VG.buildCustomer360(id), [
      id,
      store.list("customers").length,
      store.list("invoices").length,
      store.list("quotations").length,
      store.list("salesOrders").length,
      store.list("payments").length,
      store.list("shipments").length,
      store.list("enquiries").length,
      store.list("followups").length,
    ]);
    const c = data.customer;
    const primary = data.primary;
    const bill = data.bill;
    const ship = data.ship;
    if (!c.id) return null;
    const canFinance = VG.can(roleKey, "view", "accounts") || VG.can(roleKey, "view", "admin") || roleKey === "admin" || roleKey === "super_admin";
    const canSales = VG.can(roleKey, "view", "sales") || canFinance;
    const [tab, setTab] = useState("overview");
    const f = data.finance;
    const cur = store.list("currencies").find((x) => x.code === c.currency);

    function openModule(m) {
      if (m.finance && !canFinance) return VG.toast("Accounts permission required", "warn");
      if (!canSales && !m.finance && !m.local) return VG.toast("Sales permission required", "warn");
      if (m.local || m.key === "documents") { setTab("documents"); return; }
      VG.goToCustomerRecords(m.module, m.section, c.id, c.legalName);
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-start gap-3">
          <Button variant="soft" icon="chevronLeft" onClick={onBack}>Back to list</Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold truncate">{c.legalName}</h1>
            <div className="text-sm opacity-60">{c.code} · {c.type}{c.tradeName ? " · " + c.tradeName : ""}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <DocActions build={() => customerDoc(c)} />
            <Button variant="soft" icon="download" onClick={() => printDocument(customerTxnSummaryDoc(c, data), "download")}>Transaction summary</Button>
            {canFinance && <Button variant="soft" icon="download" onClick={() => printDocument(customerStatementDoc(c, data), "download")}>Statement PDF</Button>}
            {canFinance && <Button variant="soft" icon="download" onClick={() => exportCustomerCsv(c, data)}>Export Excel</Button>}
            {canFinance && <Button variant="soft" icon="printer" onClick={() => printDocument(customerStatementDoc(c, data), "print")}>Print ledger</Button>}
            {canFinance && primary.email && <Button variant="soft" icon="message" onClick={() => { window.location.href = "mailto:" + primary.email + "?subject=Account statement " + c.code + "&body=Dear " + (primary.name || "Sir/Madam") + ",%0D%0A%0D%0APlease find your account summary. Balance: " + inr(f.balance); }}>Email statement</Button>}
            {can("edit") && <Button icon="edit" onClick={() => onEdit(c)}>Edit customer</Button>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusTag value={c.status} map={STATUS_COLOR} />
          <StatusTag value={c.approvalStatus} map={APPROVAL_COLOR} />
          {c.gstin ? <Pill color="#64748b">GSTIN {c.gstin}</Pill> : <Pill color="#94a3b8">Unregistered</Pill>}
        </div>

        {canFinance ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {[
              ["Total transaction value", f.txnValue], ["Total invoiced", f.totalInvoiced], ["Payment received", f.totalPaid],
              ["Balance payment", f.balance], ["Overdue amount", f.overdueAmt],
            ].map(([k, v]) => (
              <Card key={k} className="p-3"><div className="text-[10px] uppercase opacity-50 mb-1">{k}</div><div className="text-lg font-semibold">{inr(v)}</div></Card>
            ))}
            <Card className="p-3"><div className="text-[10px] uppercase opacity-50 mb-1">Credit limit</div><div className="text-lg font-semibold">{inr(f.creditLimit)}</div></Card>
            <Card className="p-3"><div className="text-[10px] uppercase opacity-50 mb-1">Available credit</div><div className="text-lg font-semibold">{inr(f.availableCredit)}</div></Card>
            <Card className="p-3 sm:col-span-2"><div className="text-[10px] uppercase opacity-50 mb-1">Oldest pending invoice</div><div className="text-sm font-medium">{f.oldestPending ? f.oldestPending.no + " · due " + (f.oldestPending.dueDate || "—") : "—"}</div></Card>
            <Card className="p-3"><div className="text-[10px] uppercase opacity-50 mb-1">Avg. payment delay</div><div className="text-lg font-semibold">{f.avgPaymentDelay} days</div></Card>
          </div>
        ) : canSales && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ["Enquiries", data.counts.enquiries], ["Quotations", data.counts.quotations],
              ["Sales orders", data.counts.salesOrders], ["Follow-ups", data.counts.followups],
            ].map(([k, v]) => (
              <Card key={k} className="p-3"><div className="text-[10px] uppercase opacity-50 mb-1">{k}</div><div className="text-lg font-semibold">{v}</div></Card>
            ))}
            <Card className="p-3 sm:col-span-4 text-xs opacity-55">Financial summary (invoiced, balance, ageing) is visible to Accounts / Admin users.</Card>
          </div>
        )}

        <div className="flex flex-wrap gap-1 border-b border-white/10 pb-2">
          {["overview", "transactions", "ageing", "timeline", "documents"].map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={"px-3 py-1.5 rounded-lg text-xs font-medium capitalize " + (tab === t ? "bg-white/15" : "opacity-55 hover:opacity-90")}>{t}</button>
          ))}
        </div>

        {tab === "overview" && (
          <>
            <div className="grid lg:grid-cols-3 gap-3 text-sm">
              <Card className="p-4 lg:col-span-2">
                <div className="text-[11px] uppercase opacity-55 mb-3">Customer profile</div>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                  <div><span className="opacity-50">Contact</span><div className="font-medium">{primary.name || "—"}</div></div>
                  <div><span className="opacity-50">Mobile</span><div>{primary.mobile || c.phone || "—"}</div></div>
                  <div><span className="opacity-50">Email</span><div>{primary.email || c.email || "—"}</div></div>
                  <div><span className="opacity-50">Category</span><div>{c.category || "—"}</div></div>
                  <div><span className="opacity-50">Currency</span><div>{c.currency}{cur ? " · rate " + cur.rate : ""}</div></div>
                  <div><span className="opacity-50">Sales person</span><div>{c.salesPerson || "—"}</div></div>
                  <div><span className="opacity-50">PAN</span><div className="font-mono text-xs">{c.pan || "—"}</div></div>
                  <div><span className="opacity-50">GST reg.</span><div>{c.gstRegType || "—"}</div></div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-[11px] uppercase opacity-55 mb-2">Address summary</div>
                <div className="text-xs space-y-3 opacity-80">
                  <div><b className="opacity-60">Billing</b><br />{bill.text || "—"}</div>
                  <div><b className="opacity-60">Shipping</b><br />{ship.text || "—"}</div>
                </div>
              </Card>
            </div>

            <div>
              <div className="text-[11px] uppercase opacity-55 mb-2">Module usage — click to open filtered records</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {data.modules.map((m) => (
                  <button key={m.key} type="button" onClick={() => openModule(m)} disabled={m.finance && !canFinance}
                    className={"text-left rounded-xl border border-white/10 p-3 chrome-hover transition " + (m.finance && !canFinance ? "opacity-40 cursor-not-allowed" : "")}>
                    <div className="flex items-center gap-2 mb-1"><Icon name={m.icon} size={16} /><span className="text-xs font-medium">{m.label}</span></div>
                    <div className="text-2xl font-semibold">{m.count}</div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "transactions" && (
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase opacity-55 border-b border-white/10"><tr className="text-left">
                  <th className="px-3 py-2">Type</th><th className="px-3 py-2">Number</th><th className="px-3 py-2">Date</th>
                  {canFinance && <th className="px-3 py-2 text-right">Amount</th>}<th className="px-3 py-2">Status</th>
                </tr></thead>
                <tbody>
                  {data.transactions.length === 0 && <tr><td colSpan={canFinance ? 5 : 4} className="px-3 py-6 text-center opacity-50">No transactions yet</td></tr>}
                  {data.transactions.map((t, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="px-3 py-2">{t.kind}</td>
                      <td className="px-3 py-2 font-mono">{t.no}</td>
                      <td className="px-3 py-2">{t.date}</td>
                      {canFinance && <td className="px-3 py-2 text-right">{t.amount != null ? inr(t.amount) : "—"}</td>}
                      <td className="px-3 py-2"><Pill color="#64748b">{t.status}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === "ageing" && (
          canFinance ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {[["0–30 days", data.ageing.b0_30], ["31–60 days", data.ageing.b31_60], ["61–90 days", data.ageing.b61_90], ["90+ days", data.ageing.b90p]].map(([k, v]) => (
                  <Card key={k} className="p-3"><div className="text-[10px] uppercase opacity-50">{k}</div><div className="text-lg font-semibold">{inr(v)}</div></Card>
                ))}
              </div>
              <Card className="p-0 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase opacity-55 border-b border-white/10"><tr className="text-left">
                    <th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2 text-right">Days overdue</th><th className="px-3 py-2">Status</th>
                  </tr></thead>
                  <tbody>
                    {data.ageingRows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center opacity-50">No pending invoices</td></tr>}
                    {data.ageingRows.map(({ inv, balance, daysOver, status }, i) => (
                      <tr key={i} className="border-b border-white/5">
                        <td className="px-3 py-2 font-mono">{inv.no}</td>
                        <td className="px-3 py-2">{inv.date}</td>
                        <td className="px-3 py-2">{inv.dueDate || "—"}</td>
                        <td className="px-3 py-2 text-right">{inr(inv.amount || 0)}</td>
                        <td className="px-3 py-2 text-right">{inr(inv.amountPaid || 0)}</td>
                        <td className="px-3 py-2 text-right font-medium">{inr(balance)}</td>
                        <td className="px-3 py-2 text-right">{daysOver}</td>
                        <td className="px-3 py-2"><Pill color={status === "Overdue" ? "#ef4444" : status === "Paid" ? "#34d399" : "#f59e0b"}>{status}</Pill></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          ) : <Card className="p-6 text-sm opacity-60 text-center">Payment ageing is visible to Accounts / Admin users only.</Card>
        )}

        {tab === "timeline" && (
          <Card className="p-4">
            <ul className="space-y-3 max-h-[480px] overflow-auto pr-1">
              {data.timeline.length === 0 && <li className="text-sm opacity-50 text-center py-6">No activity recorded</li>}
              {data.timeline.map((e, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="grid place-items-center w-8 h-8 rounded-lg shrink-0 glass"><Icon name={e.icon || "dot"} size={14} /></span>
                  <div className="flex-1 border-b border-white/5 pb-2">
                    <div className="font-medium">{e.type}</div>
                    <div className="text-xs opacity-60 mt-0.5">{e.detail}</div>
                    {e.ts ? <div className="text-[10px] opacity-40 mt-1">{new Date(e.ts).toLocaleString()}</div> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {tab === "documents" && (
          <Card className="p-4">
            {(c.documents || []).length === 0 ? <div className="text-sm opacity-50 text-center py-6">No documents uploaded — attach files in customer edit form.</div> : (
              <ul className="space-y-2 text-sm">{(c.documents || []).map((d, i) => (
                <li key={i} className="flex items-center gap-2 glass rounded-lg px-3 py-2"><Icon name="folder" size={14} /><span>{d.name || d.type || "Document"}</span>{d.uploadedAt && <span className="text-xs opacity-50 ml-auto">{VG.fmt.formatDate ? VG.fmt.formatDate(d.uploadedAt) : new Date(d.uploadedAt).toLocaleDateString()}</span>}</li>
              ))}</ul>
            )}
          </Card>
        )}
      </div>
    );
  }

  function CustomerView(props) {
    return <Customer360Page {...props} onBack={props.onClose} />;
  }

  function customerPDF(c, mode) { printDocument(customerDoc(c), mode); }
  function customerDoc(c) {
    const contacts = c.contacts.map((ct) => `<tr><td>${ct.name || ""}</td><td>${ct.role}</td><td>${ct.designation || ""}</td><td>${ct.mobile || ""}</td><td>${ct.email || ""}</td></tr>`).join("");
    const addrs = c.addresses.map((a) => `<tr><td>${a.type}${a.defaultBilling ? " (def. billing)" : ""}${a.defaultShipping ? " (def. shipping)" : ""}</td><td>${formatAddress(a)}</td><td>${a.gstin || ""}</td></tr>`).join("");
    return {
      title: "Customer Profile", subtitle: c.code + " · " + c.legalName,
      inner: `
      <div class="vg-cols">
        <div class="vg-card"><b>Customer</b>${c.legalName}<br>${c.tradeName ? "Trade: " + c.tradeName + "<br>" : ""}Type: ${c.type}<br>Status: ${c.status}</div>
        <div class="vg-card"><b>Statutory</b>PAN: ${c.pan || "—"}<br>GSTIN: ${c.gstin || "— (unregistered)"}<br>CIN: ${c.cin || "—"}</div>
        <div class="vg-card"><b>Commercial</b>Currency: ${c.currency}<br>Price list: ${c.priceList}<br>Credit: ${inr(c.creditLimit || 0)} / ${c.creditDays || 0}d</div>
      </div>
      <h3 style="font-size:12px;margin:10px 0 4px">Contacts</h3>
      <table class="vg-tbl"><thead><tr><th>Name</th><th>Role</th><th>Designation</th><th>Mobile</th><th>Email</th></tr></thead><tbody>${contacts}</tbody></table>
      <h3 style="font-size:12px;margin:10px 0 4px">Addresses</h3>
      <table class="vg-tbl"><thead><tr><th>Type</th><th>Address</th><th>GSTIN</th></tr></thead><tbody>${addrs}</tbody></table>`,
    };
  }

  /* ================= Customers page ================= */
  function CustomersPage({ roleKey, can }) {
    VG.useDB();
    const [form, setForm] = useState(null); // record or {}
    const [view, setView] = useState(null); // id
    const rows = store.list("customers").map((c) => normalize(c));
    const cols = [
      { key: "code", label: "Code", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
      { key: "legalName", label: "Customer", render: (r) => (
        <button type="button" className="text-left hover:underline group" onClick={() => setView(r.id)}>
          <div className="font-medium group-hover:text-[var(--accent)]">{r.legalName}</div>
          {r.tradeName && <div className="text-[11px] opacity-50">{r.tradeName}</div>}
        </button>
      ), csv: (r) => r.legalName },
      { key: "type", label: "Type", render: (r) => <Pill color="#6366f1">{r.type}</Pill> },
      { key: "gstin", label: "GSTIN", render: (r) => r.gstin ? <span className="font-mono text-xs">{r.gstin}</span> : <span className="opacity-40 text-xs">unregistered</span>, csv: (r) => r.gstin || "" },
      { key: "currency", label: "Curr." },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={STATUS_COLOR} /> },
      { key: "approvalStatus", label: "Approval", render: (r) => <StatusTag value={r.approvalStatus} map={APPROVAL_COLOR} /> },
    ];
    function approve(r) { store.update("customers", r.id, { approvalStatus: "Approved", approvedBy: roleKey }, roleKey); VG.toast(r.legalName + " approved"); }
    if (view) {
      return (
        <Customer360Page id={view} roleKey={roleKey} can={can} onBack={() => setView(null)} onEdit={(c) => { setView(null); setForm(c); }} />
      );
    }
    if (form) {
      return <CustomerForm key={form.id || "new"} open record={form.id ? form : null} roleKey={roleKey} can={can} onClose={() => setForm(null)} onSaved={() => {}} />;
    }
    return (
      <ListPage title="Customer Master" desc="Manage customer profiles, contacts, addresses and commercial terms. Click a name for the 360° dashboard."
        icon="users" onNew={() => setForm({})} newLabel="Add New Customer" can={can}
        headerExtra={can("approve") && rows.some((r) => r.approvalStatus === "Pending") ? <Pill color="#f59e0b">{rows.filter((r) => r.approvalStatus === "Pending").length} pending</Pill> : null}>
        <RecordTable embedded suppressNew tableId="customers" title="Customer List" columns={cols} rows={rows} can={can} printTitle="Customer Master"
          searchKeys={["code", "legalName", "tradeName", "gstin", "pan"]}
          filters={[{ key: "type", label: "All types", options: CUST_TYPES }, { key: "status", label: "All status", options: STATUSES }, { key: "approvalStatus", label: "All approval", options: ["Approved", "Pending", "Rejected"] }]}
          onNew={() => setForm({})} onView={(r) => setView(r.id)}
          onEdit={can("edit") ? (r) => setForm(r) : null}
          onDelete={can("delete") ? async (r) => { if (await VG.confirm({ title: "Delete " + r.legalName + "?", danger: true, confirmLabel: "Delete" })) { store.remove("customers", r.id, roleKey); VG.toast("Deleted"); } } : null} />
        {can("approve") && rows.some((r) => r.approvalStatus === "Pending") && (
          <div className="vg-list-page-aux px-4 pb-4">
            <div className="text-sm font-semibold mb-2 pt-1">Pending customer approvals</div>
            <div className="space-y-2">{rows.filter((r) => r.approvalStatus === "Pending").map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-sm glass rounded-lg p-2.5"><span className="flex-1">{r.code} · {r.legalName}</span><Button variant="soft" onClick={() => setView(r.id)}>360° View</Button><Button icon="check" onClick={() => approve(r)}>Approve</Button></div>
            ))}</div>
          </div>
        )}
      </ListPage>
    );
  }

  /* ================= Currency & PIN masters ================= */
  function CurrenciesPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const rows = store.list("currencies");
    const cols = [
      { key: "code", label: "Code", render: (r) => <span className="font-mono">{r.code}</span> }, { key: "name", label: "Currency" },
      { key: "symbol", label: "Symbol" }, { key: "rate", label: "Rate (→ INR)", render: (r) => r.rate }, { key: "base", label: "Base", render: (r) => r.base ? <Pill color="#34d399">base</Pill> : "" },
    ];
    function save(form) { if (!form.code) return VG.toast("Code required", "error"); if (form.id) store.update("currencies", form.id, form, roleKey); else store.create("currencies", form, roleKey); VG.toast("Saved"); setEdit(null); }
    const currencyFields = [{ k: "code", l: "Code (INR, USD…)", req: true }, { k: "name", l: "Name", req: true }, { k: "symbol", l: "Symbol" }, { k: "rate", l: "Rate to INR", num: true, req: true }];
    if (edit) {
      return <VG.MasterForm title="Currency" open onClose={() => setEdit(null)} record={edit} roleKey={roleKey} can={can} fields={currencyFields} onSave={save} />;
    }
    return (
      <ListPage title="Currency Master" desc="Multi-currency support for customer transactions" onNew={() => setEdit({})} newLabel="Add Currency" can={can}>
        <RecordTable embedded suppressNew title="Currency List" columns={cols} rows={rows} can={can} printTitle="Currency Master" searchKeys={["code", "name"]}
          onNew={() => setEdit({})} onEdit={can("edit") ? (r) => setEdit(r) : null}
          onDelete={can("delete") ? async (r) => { if (await VG.confirm({ title: "Delete currency?", danger: true, confirmLabel: "Delete" })) { store.remove("currencies", r.id, roleKey); VG.toast("Deleted"); } } : null} />
      </ListPage>
    );
  }
  function PincodesPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const rows = store.list("pincodes");
    const cols = [
      { key: "pin", label: "PIN", render: (r) => <span className="font-mono">{r.pin}</span> }, { key: "city", label: "City" },
      { key: "district", label: "District" }, { key: "state", label: "State" }, { key: "stateCode", label: "State code" }, { key: "country", label: "Country" },
    ];
    function save(form) { if (!form.pin) return VG.toast("PIN required", "error"); if (form.id) store.update("pincodes", form.id, form, roleKey); else store.create("pincodes", { country: "India", ...form, stateCode: form.stateCode || STATE_CODE[form.state] || "" }, roleKey); VG.toast("Saved"); setEdit(null); }
    const pinFields = [{ k: "pin", l: "PIN / ZIP", req: true }, { k: "city", l: "City", req: true }, { k: "district", l: "District" }, { k: "state", l: "State", req: true }, { k: "stateCode", l: "State code" }, { k: "country", l: "Country" }];
    if (edit) {
      return <VG.MasterForm title="PIN code" open onClose={() => setEdit(null)} record={edit} roleKey={roleKey} can={can} fields={pinFields} onSave={save} />;
    }
    return (
      <ListPage title="PIN Code Master" desc="Auto-populated from lookups; used to auto-fill city/state/code" onNew={() => setEdit({ country: "India" })} newLabel="Add PIN" can={can}>
        <RecordTable embedded suppressNew title="PIN Code List" columns={cols} rows={rows} can={can} printTitle="PIN Code Master" searchKeys={["pin", "city", "state"]}
          onNew={() => setEdit({ country: "India" })} onEdit={can("edit") ? (r) => setEdit(r) : null}
          onDelete={can("delete") ? async (r) => { if (await VG.confirm({ title: "Delete PIN?", danger: true, confirmLabel: "Delete" })) { store.remove("pincodes", r.id, roleKey); VG.toast("Deleted"); } } : null} />
      </ListPage>
    );
  }

  VG.CustomerForm = CustomerForm;
  VG.CustomerView = CustomerView;
  VG.Customer360Page = Customer360Page;
  VG.CustomersPage = CustomersPage;
  VG.CustomerFilterBanner = CustomerFilterBanner;
  VG.useFilteredCustomerRows = useFilteredCustomerRows;
  VG.CustomerPages = { currencies: CurrenciesPage, pincodes: PincodesPage };
  /* ================= Transaction address & currency (quotation / SO / PI) ================= */
  function TransactionAddressCurrency({ customerId, values, onChange, roleKey, canEditCurrency, showAddresses = true, showExchangeMeta = false }) {
    const c = customerId ? normalize(store.get("customers", customerId)) : null;
    const opts = c ? customerAddressOptions(c) : [];
    const currencies = store.list("currencies");
    const cur = values.currency || "INR";
    const custCur = (c && c.currency) || values.customerDefaultCurrency || "INR";
    const isForeign = cur !== "INR";
    function pickBill(id) {
      const bill = customerAddr(c, "billing", id);
      onChange({ billingAddressId: id, billing: bill.text, gstin: bill.gstin || values.gstin });
    }
    function pickShip(id) {
      const ship = customerAddr(c, "shipping", id);
      onChange({ shippingAddressId: id, shipping: ship.text });
    }
    function pickCurrency(code) {
      const row = currencies.find((x) => x.code === code);
      onChange({
        currency: code,
        exchangeRate: row ? row.rate : 1,
        exchangeRateDate: today(),
        exchangeRateSource: "currency_master",
        customerDefaultCurrency: custCur,
      });
    }
    function setExchangeRate(v) {
      onChange({
        exchangeRate: v,
        exchangeRateDate: values.exchangeRateDate || today(),
        exchangeRateSource: "manual",
      });
    }
    async function updateCustomerDefault() {
      if (!c || !customerId) return;
      const ok = await VG.confirm({ title: "Update customer default currency?", message: "Set " + cur + " as the default currency on " + (c.legalName || c.name) + " in Customer Master.", confirmLabel: "Update default" });
      if (!ok) return;
      store.update("customers", customerId, { currency: cur }, roleKey);
      VG.toast("Customer default currency updated to " + cur);
    }
    if (!customerId) return <div className="text-xs opacity-50 lg:col-span-3">Select a customer to load {showAddresses ? "addresses and " : ""}currency.</div>;
    return (
      <>
        {showAddresses && <>
          <Field label="Billing address" className="lg:col-span-1">
            {opts.length > 1 ? <Select value={values.billingAddressId || ""} onChange={pickBill} options={[{ value: "", label: "— Default billing —" }].concat(opts)} /> : null}
            <Area value={values.billing || ""} onChange={(v) => onChange({ billing: v })} rows={2} />
          </Field>
          <Field label="Shipping address" className="lg:col-span-1">
            {opts.length > 1 ? <Select value={values.shippingAddressId || ""} onChange={pickShip} options={[{ value: "", label: "— Default shipping —" }].concat(opts)} /> : null}
            <Area value={values.shipping || ""} onChange={(v) => onChange({ shipping: v })} rows={2} />
          </Field>
        </>}
        <div className={"grid grid-cols-2 gap-3 content-start" + (showAddresses ? "" : " lg:col-span-3")}>
          {showExchangeMeta && (
            <Field label="Customer default currency">
              <Text value={custCur} onChange={() => {}} disabled />
            </Field>
          )}
          <Field label={showExchangeMeta ? "Invoice currency" : "Transaction currency"}>
            <Select value={cur} onChange={pickCurrency} disabled={!canEditCurrency}
              options={currencies.map((x) => ({ value: x.code, label: x.code + " — " + x.name }))} />
          </Field>
          {(isForeign || showExchangeMeta) && (
            <Field label="Exchange rate (→ INR)"><Num value={values.exchangeRate} onChange={setExchangeRate} disabled={!canEditCurrency} /></Field>
          )}
          {showExchangeMeta && (
            <>
              <Field label="Exchange rate date"><DateF value={values.exchangeRateDate || today()} onChange={(v) => onChange({ exchangeRateDate: v })} /></Field>
              <Field label="Rate source"><Text value={values.exchangeRateSource === "manual" ? "Manual entry" : "Currency master"} onChange={() => {}} disabled /></Field>
            </>
          )}
          {canEditCurrency && isForeign && c.currency !== cur && (
            <div className="col-span-2"><Button variant="soft" className="!text-xs !py-1.5" onClick={updateCustomerDefault}>Update customer default to {cur}</Button></div>
          )}
        </div>
      </>
    );
  }

  VG.customerAddr = customerAddr;
  VG.formatAddress = formatAddress;
  VG.normalizeCustomer = normalize;
  VG.customerAddressOptions = customerAddressOptions;
  VG.applyCustomerToTransaction = applyCustomerToTransaction;
  VG.TransactionAddressCurrency = TransactionAddressCurrency;
})(window.VG);
