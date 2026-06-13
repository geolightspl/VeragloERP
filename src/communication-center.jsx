/* Veraglo ERP — unified communication center (inbox, email API, WhatsApp). */
(function (VG) {
  const { useState, useMemo } = React;
  const { Icon, Button, Pill, Card } = VG.ui;
  const store = VG.store;
  const inr = VG.fmt.inr;
  const today = VG.fmt.todayISO;
  const { Field, Text, Area, Select, MasterSelect, Modal, PageHead } = VG.fx;

  function custName(id) {
    return (store.get("customers", id) || {}).name || "—";
  }

  function phoneDigits(phone) {
    return String(phone || "").replace(/\D/g, "");
  }

  function whatsappUrl(phone, text) {
    const n = phoneDigits(phone);
    if (!n) return "";
    const num = n.length === 10 ? "91" + n : n;
    return "https://wa.me/" + num + (text ? "?text=" + encodeURIComponent(text) : "");
  }

  async function sendEmailApi({ to, subject, text, html }) {
    const base = VG.apiBase || "";
    try {
      const res = await fetch(base + "/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, text, html }),
      });
      return await res.json();
    } catch (e) {
      return { ok: false, error: e.message || "Network error" };
    }
  }

  function CommunicationCenterPage({ roleKey, can }) {
    VG.useDB();
    const [tab, setTab] = useState("inbox");
    const [compose, setCompose] = useState(null);
    const [filter, setFilter] = useState("all");

    const inbox = useMemo(() => {
      const items = [];
      store.list("communications").forEach((c) => {
        items.push({
          id: "comm-" + c.id,
          ts: new Date(c.date || 0).getTime() || Date.now(),
          date: c.date,
          type: "communication",
          mode: c.mode || "Call",
          customerId: c.customerId,
          subject: c.subject || c.note || "",
          body: c.note || "",
          by: c.by,
        });
      });
      store.list("followups").forEach((f) => {
        items.push({
          id: "fu-" + f.id,
          ts: new Date(f.date || 0).getTime() || Date.now(),
          date: f.date,
          type: "followup",
          mode: f.mode || "Call",
          customerId: f.customerId,
          subject: (f.refType || "Follow-up") + (f.status === "Pending" ? " (due)" : ""),
          body: f.note || "",
          by: f.owner,
          status: f.status,
        });
      });
      (store.listNotifications ? store.listNotifications(roleKey) : []).forEach((n) => {
        if (n.read) return;
        items.push({
          id: "n-" + n.id,
          ts: n.at || Date.now(),
          date: new Date(n.at || Date.now()).toISOString().slice(0, 10),
          type: "notification",
          mode: "Alert",
          customerId: "",
          subject: n.title,
          body: n.body || "",
          by: "system",
          ref: n,
        });
      });
      return items.sort((a, b) => b.ts - a.ts);
    }, [roleKey]);

    const filtered = filter === "all" ? inbox : inbox.filter((i) => i.type === filter || i.mode === filter);

    function logCommunication(form) {
      if (!form.customerId) return VG.toast("Select customer", "error");
      store.create("communications", { ...form, by: roleKey, date: form.date || today() }, roleKey);
      VG.toast("Communication logged");
      setCompose(null);
    }

    async function sendComposed(form) {
      if (!form.customerId || !form.to) return VG.toast("Customer and email required", "error");
      const c = store.get("customers", form.customerId) || {};
      const co = store.company().name || "Veraglo";
      const subject = form.subject || ("Message from " + co);
      const text = form.body || "";
      const result = await sendEmailApi({ to: form.to, subject, text });
      store.create("communications", {
        customerId: form.customerId,
        date: today(),
        mode: "Email",
        subject,
        note: text + (result.ok ? "\n[Sent via SMTP]" : "\n[SMTP: " + (result.skipped ? "not configured" : result.error || "failed") + "]"),
        by: roleKey,
        emailTo: form.to,
        emailStatus: result.ok ? "sent" : (result.skipped ? "skipped" : "failed"),
      }, roleKey);
      if (result.ok) VG.toast("Email sent to " + form.to);
      else if (result.skipped) VG.toast("SMTP not configured — logged locally (check server console)", "warn");
      else VG.toast(result.error || "Email failed", "error");
      setCompose(null);
    }

    function openWhatsApp(customerId, template) {
      const c = store.get("customers", customerId) || {};
      const phone = c.phone || c.mobile || c.contactPhone || "";
      const url = whatsappUrl(phone, template || ("Hello from " + (store.company().name || "Veraglo")));
      if (!url) return VG.toast("No phone number on customer master", "warn");
      window.open(url, "_blank", "noopener");
      store.create("communications", {
        customerId,
        date: today(),
        mode: "WhatsApp",
        subject: "WhatsApp message",
        note: template || "Opened WhatsApp chat",
        by: roleKey,
      }, roleKey);
      VG.toast("Opening WhatsApp");
    }

    const tabs = [
      { id: "inbox", label: "Unified inbox" },
      { id: "compose", label: "Send email" },
    ];

    return (
      <div>
        <PageHead title="Communication Center" desc="Unified inbox — calls, emails, follow-ups, WhatsApp" />
        <div className="flex flex-wrap gap-2 mb-4">
          {tabs.map((t) => (
            <Button key={t.id} variant={tab === t.id ? "primary" : "soft"} onClick={() => setTab(t.id)}>{t.label}</Button>
          ))}
          <Select className="ml-auto !w-40" value={filter} onChange={setFilter} options={[
            { value: "all", label: "All items" },
            { value: "communication", label: "Communications" },
            { value: "followup", label: "Follow-ups" },
            { value: "notification", label: "Alerts" },
            { value: "Email", label: "Email only" },
            { value: "WhatsApp", label: "WhatsApp" },
          ]} />
        </div>

        {tab === "inbox" && (
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <Card className="p-10 text-center opacity-60">No communications yet</Card>
            ) : filtered.map((item) => (
              <Card key={item.id} className="p-3 flex flex-wrap items-start gap-3">
                <span className="grid place-items-center w-10 h-10 rounded-xl shrink-0 text-white" style={{ background: item.type === "notification" ? "#f59e0b" : item.mode === "WhatsApp" ? "#22c55e" : item.mode === "Email" ? "#60a5fa" : "#8b5cf6" }}>
                  <Icon name={item.mode === "Email" ? "message" : item.mode === "WhatsApp" ? "message" : "headset"} size={18} />
                </span>
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{item.subject || "—"}</span>
                    <Pill color="#64748b">{item.mode}</Pill>
                    {item.status === "Pending" && <Pill color="#f59e0b">Due</Pill>}
                  </div>
                  <div className="text-xs opacity-55 mt-1">{item.date} · {item.customerId ? custName(item.customerId) : "System"} · {item.by}</div>
                  {item.body && <div className="text-sm opacity-75 mt-2 line-clamp-2">{item.body}</div>}
                </div>
                {item.customerId && can("edit") && (
                  <div className="flex gap-2">
                    <Button variant="soft" className="!py-1" onClick={() => openWhatsApp(item.customerId)}>WhatsApp</Button>
                    <Button variant="soft" className="!py-1" onClick={() => setCompose({ customerId: item.customerId, to: (store.get("customers", item.customerId) || {}).email || "" })}>Email</Button>
                  </div>
                )}
                {item.ref && store.markNotificationRead && (
                  <Button variant="ghost" className="!py-1" onClick={() => store.markNotificationRead(item.ref.id, roleKey)}>Dismiss</Button>
                )}
              </Card>
            ))}
          </div>
        )}

        {tab === "compose" && (
          <Card className="p-4 max-w-xl">
            <ComposeForm
              roleKey={roleKey}
              can={can}
              onSend={sendComposed}
              onWhatsApp={openWhatsApp}
            />
          </Card>
        )}

        {compose && (
          <Modal open onClose={() => setCompose(null)} title="Send email" size="md"
            actions={<Button icon="send" onClick={() => sendComposed(compose)}>Send</Button>}>
            <ComposeFields form={compose} setForm={setCompose} roleKey={roleKey} can={can} />
          </Modal>
        )}
      </div>
    );
  }

  function ComposeFields({ form, setForm, roleKey, can }) {
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
    return (
      <div className="grid gap-3">
        <Field label="Customer" required>
          <MasterSelect collection="customers" value={form.customerId} onChange={(v) => {
            const c = store.get("customers", v) || {};
            setForm((f) => ({ ...f, customerId: v, to: c.email || c.contactEmail || "" }));
          }} actorRole={roleKey} can={can && can("add")} />
        </Field>
        <Field label="To (email)" required><Text value={form.to} onChange={(v) => set("to", v)} /></Field>
        <Field label="Subject"><Text value={form.subject} onChange={(v) => set("subject", v)} placeholder="Quotation / follow-up" /></Field>
        <Field label="Message"><Area value={form.body} onChange={(v) => set("body", v)} rows={5} /></Field>
      </div>
    );
  }

  function ComposeForm({ roleKey, can, onSend, onWhatsApp }) {
    const [form, setForm] = useState({ customerId: "", to: "", subject: "", body: "" });
    return (
      <div>
        <ComposeFields form={form} setForm={setForm} roleKey={roleKey} can={can} />
        <div className="flex flex-wrap gap-2 mt-4">
          <Button icon="send" onClick={() => onSend(form)}>Send via SMTP</Button>
          <Button variant="soft" onClick={() => form.customerId && onWhatsApp(form.customerId, form.body)}>WhatsApp instead</Button>
        </div>
        <p className="text-[11px] opacity-45 mt-3">Configure SMTP in Admin → Notifications. When SMTP is off, emails are logged to the server console.</p>
      </div>
    );
  }

  VG.CommunicationCenterPage = CommunicationCenterPage;
  VG.sendNotificationEmail = sendEmailApi;
})(window.VG);
