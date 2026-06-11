/* Veraglo ERP — Admin Control Panel (full module). */
(function (VG) {
  const { useState, useRef, useEffect, useMemo } = React;
  const ui = VG.ui, fx = VG.fx, store = VG.store;
  const { Icon, Button, Pill, Card } = ui;
  const { Field, Text, Area, Num, Select, Checkbox, RecordTable, PageHead, ListPage, StatusTag, Modal, MasterSelect, printDocument } = fx;

  const today = VG.fmt.todayISO;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const fmtBytes = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  const fmtTime = (ts) => (ts ? (VG.fmt.formatDateTime ? VG.fmt.formatDateTime(ts) : new Date(ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })) : "Never");
  function download(filename, text) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    URL.revokeObjectURL(a.href);
  }
  function stamp() { return new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16); }
  function readImageFile(file, done) {
    if (!file || !file.type.startsWith("image/")) return done(null, "Please choose an image file (JPG, PNG, WebP)");
    if (file.size > 4 * 1024 * 1024) return done(null, "Image must be under 4 MB");
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 480;
        let w = img.width, h = img.height;
        if (w > max || h > max) {
          if (w >= h) { h = Math.round(h * (max / w)); w = max; }
          else { w = Math.round(w * (max / h)); h = max; }
        }
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        done(c.toDataURL("image/jpeg", 0.82), null);
      };
      img.onerror = () => done(null, "Could not read image");
      img.src = reader.result;
    };
    reader.onerror = () => done(null, "Could not read file");
    reader.readAsDataURL(file);
  }

  const PROVIDERS = ["Google Drive", "Dropbox", "OneDrive", "Amazon S3", "Box", "Other"];
  const FREQ = ["Manual", "Every hour", "Daily", "Weekly"];
  const LOC_TYPES = ["Head office", "Factory", "Warehouse", "Store", "Branch", "Site"];
  const ALL_ACTIONS = ["view", "add", "edit", "delete", "approve", "reject", "print", "export", "import", "email", "settings"];
  const COMPANY_TABS = [
    { id: "legal", label: "Legal & trade" },
    { id: "brand", label: "Logos" },
    { id: "address", label: "Addresses" },
    { id: "tax", label: "Tax & registration" },
    { id: "contact", label: "Contact" },
    { id: "bank", label: "Bank" },
    { id: "sign", label: "Signatory & seal" },
    { id: "terms", label: "Terms & policies" },
  ];
  function nextDue(cfg) {
    if (!cfg.lastBackupAt || cfg.schedule.frequency === "Manual") return null;
    const ms = { "Every hour": 36e5, Daily: 864e5, Weekly: 7 * 864e5 }[cfg.schedule.frequency] || 864e5;
    return cfg.lastBackupAt + ms;
  }
  const isDue = (cfg) => { const d = nextDue(cfg); return d && Date.now() > d; };
  const roleLabel = (key) => (store.getRole(key) || VG.ROLES[key] || {}).label || key;
  const locName = (id) => (store.get("locations", id) || {}).name || "—";

  function ImageUploadField({ label, value, onChange, hint }) {
    const ref = useRef(null);
    function pick(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      readImageFile(file, (dataUrl, msg) => {
        if (msg) return VG.toast(msg, "error");
        onChange(dataUrl);
        VG.toast(label + " attached");
      });
      e.target.value = "";
    }
    return (
      <Field label={label} hint={hint}>
        <div className="flex items-start gap-3">
          <div className="w-20 h-20 rounded-xl glass grid place-items-center overflow-hidden shrink-0">
            {value ? <img src={value} alt="" className="w-full h-full object-contain" /> : <Icon name="box" size={22} className="opacity-40" />}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="soft" icon="upload" onClick={() => ref.current && ref.current.click()}>Upload</Button>
            {value && <Button variant="ghost" icon="trash" onClick={() => onChange("")}>Remove</Button>}
            <input ref={ref} type="file" accept="image/*" className="hidden" onChange={pick} />
          </div>
        </div>
      </Field>
    );
  }

  /* ================= Backup & Restore ================= */
  function BackupRestore({ roleKey, can }) {
    VG.useDB();
    const live = store.settings().backup;
    const [cfg, setCfg] = useState(() => clone(live));
    const [snaps, setSnaps] = useState([]);
    const setCloud = (p) => setCfg((c) => ({ ...c, cloud: { ...c.cloud, ...p } }));
    const setLocal = (p) => setCfg((c) => ({ ...c, local: { ...c.local, ...p } }));
    const setSched = (p) => setCfg((c) => ({ ...c, schedule: { ...c.schedule, ...p } }));
    const sum = store.backupSummary();
    const due = isDue(live);

    function refreshSnaps() {
      Promise.resolve(store.listSnapshots()).then((list) => setSnaps((list || []).slice().reverse()));
    }
    useEffect(() => { refreshSnaps(); }, []);

    async function backupNow() {
      const json = store.exportSnapshot();
      const filename = "veraglo-backup-" + stamp() + ".json";
      download(filename, json);
      await store.saveLocalSnapshot("Manual backup", roleKey);
      refreshSnaps();
      store.recordBackup({ type: "Local file", destination: "This computer · Downloads", filename, size: json.length, status: "Success" }, roleKey);
      if (cfg.cloud.enabled) store.recordBackup({ type: "Cloud", destination: cfg.cloud.provider + " · " + cfg.cloud.folder, filename, size: json.length, status: cfg.cloud.connected ? "Uploaded" : "Queued — connect cloud" }, roleKey);
      if (cfg.local.enabled) store.recordBackup({ type: "Local/Server", destination: cfg.local.path || cfg.local.server || "configured path", filename, size: json.length, status: cfg.local.connected ? "Saved to folder" : "Configured" }, roleKey);
      VG.toast("Backup created — saved to your Downloads folder");
    }
    function saveCloud() {
      if (cfg.cloud.enabled && !cfg.cloud.folder) return VG.toast("Enter a backup folder/path", "warn");
      store.saveBackupConfig({ cloud: cfg.cloud }, roleKey); VG.toast("Cloud backup settings saved");
    }
    function testCloud() {
      const ok = !!(cfg.cloud.account || cfg.cloud.token);
      setCloud({ connected: ok });
      store.saveBackupConfig({ cloud: { ...cfg.cloud, connected: ok } }, roleKey);
      VG.toast(ok ? "Connected to " + cfg.cloud.provider + " ✔" : "Add an account email or access key first", ok ? "success" : "warn");
    }
    function saveLocal() {
      if (cfg.local.enabled && !cfg.local.path) return VG.toast("Enter the backup folder path", "warn");
      store.saveBackupConfig({ local: cfg.local }, roleKey); VG.toast("Local/server backup settings saved");
    }
    function testLocal() {
      const ok = !!(cfg.local.path || cfg.local.share);
      setLocal({ connected: ok });
      store.saveBackupConfig({ local: { ...cfg.local, connected: ok } }, roleKey);
      VG.toast(ok ? "Backup folder looks good ✔" : "Enter a folder path first", ok ? "success" : "warn");
    }
    function saveSchedule() { store.saveBackupConfig({ schedule: cfg.schedule }, roleKey); VG.toast("Auto-backup schedule saved"); }

    function onRestoreFile(e) {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = async () => {
        let obj; try { obj = JSON.parse(reader.result); } catch (x) { return VG.toast("That file isn’t a valid Veraglo backup", "error"); }
        const mismatch = obj._v !== store.dbVersion;
        const ok = await VG.confirm({ title: "Restore this backup?", danger: true, confirmLabel: "Restore & replace", message: "This replaces ALL current data with the backup file." + (mismatch ? " (Note: backup is from a different version.)" : "") });
        if (!ok) return;
        if (store.restore(obj)) { VG.toast("Backup restored — reloading…"); setTimeout(() => location.reload(), 900); }
        else VG.toast("This file isn’t a valid backup", "error");
      };
      reader.readAsText(f); e.target.value = "";
    }
    async function restoreSnap(s) {
      const ok = await VG.confirm({ title: "Restore this in-app snapshot?", danger: true, confirmLabel: "Restore", message: "This replaces all current data with the selected snapshot." });
      if (!ok) return;
      const key = s.id != null ? s.id : s.ts;
      if (await store.restoreSnapshot(key)) { VG.toast("Snapshot restored — reloading…"); setTimeout(() => location.reload(), 900); }
    }

    const Step = ({ n, title, desc }) => (
      <div className="flex items-start gap-3 mb-3">
        <span className="grid place-items-center w-7 h-7 rounded-full text-white text-sm font-semibold shrink-0" style={{ background: "var(--accent)" }}>{n}</span>
        <div><div className="font-semibold text-sm">{title}</div>{desc && <div className="text-xs opacity-60">{desc}</div>}</div>
      </div>
    );

    return (
      <div className="space-y-4">
        <PageHead title="Backup & Restore" desc="Keep your business data safe — no technical knowledge needed" />
        <Card className="p-4 flex flex-wrap items-center gap-4" style={due ? { borderColor: "#f59e0b" } : undefined}>
          <span className="grid place-items-center w-12 h-12 rounded-2xl text-white shrink-0" style={{ background: due ? "#f59e0b" : "#22c55e" }}>
            <Icon name={due ? "alert" : "shield"} size={22} />
          </span>
          <div className="flex-1 min-w-[200px]">
            <div className="font-semibold">{due ? "A backup is due" : "Your data is protected"}</div>
            <div className="text-sm opacity-60">Last backup: {fmtTime(live.lastBackupAt)} · {sum.records.toLocaleString("en-IN")} records · about {fmtBytes(sum.bytes)}</div>
          </div>
          {can("export") && <Button icon="download" onClick={backupNow}>Back up now</Button>}
        </Card>
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3"><Icon name="cloud" size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Online (Cloud) backup</h3>{cfg.cloud.connected ? <Pill color="#34d399">connected</Pill> : <Pill color="#94a3b8">not connected</Pill>}</div>
            <p className="text-xs opacity-60 mb-3">Save a copy to the internet so it’s safe even if your computer is lost or damaged.</p>
            <div className="mb-3"><Checkbox checked={cfg.cloud.enabled} onChange={(v) => setCloud({ enabled: v })} label="Turn on cloud backup" /></div>
            <div className={"grid gap-3 " + (cfg.cloud.enabled ? "" : "opacity-50 pointer-events-none")}>
              <Field label="Where to save (choose your service)"><Select value={cfg.cloud.provider} onChange={(v) => setCloud({ provider: v })} options={PROVIDERS.map((p) => ({ value: p, label: p }))} /></Field>
              <Field label="Folder / path inside the service" hint="Example: Veraglo ERP/Backups"><Text value={cfg.cloud.folder} onChange={(v) => setCloud({ folder: v })} placeholder="Veraglo ERP/Backups" /></Field>
              <Field label="Account email / bucket name"><Text value={cfg.cloud.account} onChange={(v) => setCloud({ account: v })} placeholder="you@company.com" /></Field>
              <Field label="Access key / token" hint="Paste the key from your provider, or leave blank for your IT team to fill in"><Text type="password" value={cfg.cloud.token} onChange={(v) => setCloud({ token: v })} placeholder="••••••••" /></Field>
              <div className="flex gap-2"><Button variant="soft" icon="refresh" onClick={testCloud}>Test connection</Button><Button icon="check" onClick={saveCloud}>Save</Button></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3"><Icon name="server" size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Local / Office Server backup</h3>{cfg.local.connected ? <Pill color="#34d399">ready</Pill> : <Pill color="#94a3b8">not set</Pill>}</div>
            <p className="text-xs opacity-60 mb-3">Save a copy to a folder on this computer or your office server / NAS.</p>
            <div className="mb-3"><Checkbox checked={cfg.local.enabled} onChange={(v) => setLocal({ enabled: v })} label="Turn on local/server backup" /></div>
            <div className={"grid gap-3 " + (cfg.local.enabled ? "" : "opacity-50 pointer-events-none")}>
              <Field label="Backup folder" hint="Example: C:\\Veraglo\\Backups or /srv/veraglo/backups"><Text value={cfg.local.path} onChange={(v) => setLocal({ path: v })} placeholder="C:\\Veraglo\\Backups" /></Field>
              <Field label="Server name or IP (optional)"><Text value={cfg.local.server} onChange={(v) => setLocal({ server: v })} placeholder="192.168.1.10 / OFFICE-NAS" /></Field>
              <Field label="Network share (optional)" hint="Example: \\\\NAS\\backups"><Text value={cfg.local.share} onChange={(v) => setLocal({ share: v })} placeholder="\\\\NAS\\backups" /></Field>
              <div className="flex gap-2"><Button variant="soft" icon="refresh" onClick={testLocal}>Test folder</Button><Button icon="check" onClick={saveLocal}>Save</Button></div>
            </div>
          </Card>
        </div>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3"><Icon name="clock" size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Automatic backup schedule</h3></div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="How often?"><Select value={cfg.schedule.frequency} onChange={(v) => setSched({ frequency: v })} options={FREQ.map((f) => ({ value: f, label: f }))} /></Field>
            <Field label="Time of day"><Text type="time" value={cfg.schedule.time} onChange={(v) => setSched({ time: v })} /></Field>
            <Field label="Keep how many backups?" hint="Older ones are removed"><Num value={cfg.schedule.retention} onChange={(v) => setSched({ retention: v })} /></Field>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Button icon="check" onClick={saveSchedule}>Save schedule</Button>
            <span className="text-xs opacity-60">{cfg.schedule.frequency === "Manual" ? "Backups run only when you click “Back up now”." : "Next backup due: " + (live.schedule.frequency === "Manual" ? "—" : fmtTime(nextDue(live)))}</span>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3"><Icon name="upload" size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Restore from a backup</h3></div>
          <Step n="1" title="Pick a backup file from your computer" desc="Choose a .json file you downloaded earlier." />
          <label className="inline-flex items-center gap-2 rounded-xl text-sm font-medium px-3.5 py-2 text-white cursor-pointer" style={{ background: "var(--accent)" }}>
            <Icon name="upload" size={16} /> Choose backup file…
            <input type="file" accept="application/json,.json" className="hidden" onChange={onRestoreFile} />
          </label>
          <div className="text-[11px] mt-2" style={{ color: "#f59e0b" }}><Icon name="alert" size={12} className="inline mr-1" />Restoring replaces all current data. We’ll ask you to confirm first.</div>
          {snaps.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-wider opacity-55 mb-2">Or restore a recent in-app snapshot</div>
              <div className="space-y-2">{snaps.map((s) => (
                <div key={s.id || s.ts} className="flex flex-wrap items-center gap-3 text-sm glass rounded-lg p-2.5">
                  <Icon name="database" size={15} className="opacity-70" />
                  <span className="flex-1">{s.label} · <span className="opacity-60">{fmtTime(s.ts)} · {fmtBytes(s.bytes)}</span></span>
                  <Button variant="soft" icon="refresh" onClick={() => restoreSnap(s)}>Restore</Button>
                </div>
              ))}</div>
            </div>
          )}
        </Card>
        <RecordTable title="Backup history" can={can} printTitle="Backup History" search={false}
          rows={store.list("backups").slice().reverse()}
          columns={[
            { key: "ts", label: "When", render: (r) => fmtTime(r.ts), csv: (r) => fmtTime(r.ts) },
            { key: "type", label: "Type", render: (r) => <Pill color="#6366f1">{r.type}</Pill> },
            { key: "destination", label: "Destination" },
            { key: "size", label: "Size", render: (r) => fmtBytes(r.size || 0), csv: (r) => r.size },
            { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={{ Success: "#34d399", "Saved to folder": "#34d399", Uploaded: "#34d399", Configured: "#60a5fa", "Queued — connect cloud": "#f59e0b" }} /> },
            { key: "by", label: "By" },
          ]} empty="No backups yet — click “Back up now”." />
      </div>
    );
  }

  /* ================= Audit Trail ================= */
  function AuditTrail({ roleKey, can }) {
    VG.useDB();
    const rows = store.list("auditLog").slice().reverse();
    const showIp = rows.some((r) => r.ip);
    const cols = [
      { key: "ts", label: "When", render: (r) => fmtTime(r.ts), csv: (r) => fmtTime(r.ts) },
      { key: "actor", label: "User", render: (r) => <Pill color="#6366f1">{r.actor}</Pill> },
      { key: "action", label: "Action" },
      { key: "entity", label: "Module" },
      { key: "refId", label: "Reference" },
      { key: "oldValue", label: "Old value", render: (r) => <span className="text-xs opacity-80 max-w-[140px] truncate block">{r.oldValue || "—"}</span> },
      { key: "newValue", label: "New value", render: (r) => <span className="text-xs opacity-80 max-w-[140px] truncate block">{r.newValue || "—"}</span> },
      ...(showIp ? [{ key: "ip", label: "IP", render: (r) => r.ip || "—" }] : []),
      { key: "summary", label: "Details" },
    ];
    const actions = Array.from(new Set(rows.map((r) => r.action)));
    const entities = Array.from(new Set(rows.map((r) => r.entity)));
    return (
      <ListPage title="Audit Trail" desc="Every change across the ERP, who made it and when" can={can}>
        <RecordTable embedded suppressNew title="Audit Log List" columns={cols} rows={rows} can={can} printTitle="Audit Trail" searchKeys={["actor", "action", "entity", "summary", "refId", "ip"]}
          filters={[{ key: "action", label: "All actions", options: actions }, { key: "entity", label: "All modules", options: entities }]} />
      </ListPage>
    );
  }

  function BankAccountForm({ initial, isNew, onCancel, onSave, can }) {
    const [e, setE] = useState(() => ({ ...initial }));
    const set = (k, v) => setE((p) => ({ ...p, [k]: v }));
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="soft" icon="chevronLeft" onClick={onCancel}>Back to list</Button>
          <span className="text-sm font-semibold">{isNew ? "Add bank account" : "Edit bank account"}</span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Label / nickname" required><Text value={e.label} onChange={(v) => set("label", v)} placeholder="HDFC Current · Export" /></Field>
          <Field label="Bank name" required><Text value={e.bankName} onChange={(v) => set("bankName", v)} /></Field>
          <Field label="Account holder"><Text value={e.accountName} onChange={(v) => set("accountName", v)} /></Field>
          <Field label="Account number" required><Text value={e.accountNo} onChange={(v) => set("accountNo", v)} /></Field>
          <Field label="IFSC"><Text value={e.ifsc} onChange={(v) => set("ifsc", v.toUpperCase())} /></Field>
          <Field label="SWIFT (export)"><Text value={e.swiftCode} onChange={(v) => set("swiftCode", v.toUpperCase())} /></Field>
          <Field label="Branch"><Text value={e.branch} onChange={(v) => set("branch", v)} /></Field>
          <Field label="PDF line (optional)" className="lg:col-span-2"><Text value={e.bankLine} onChange={(v) => set("bankLine", v)} placeholder="Auto-built from fields if blank" /></Field>
          <div className="flex items-end"><Checkbox checked={!!e.isDefault} onChange={(v) => set("isDefault", v)} label="Default for invoices" /></div>
        </div>
        {can("edit") && <Button icon="check" onClick={() => onSave({ ...e, label: e.label || e.bankName })}>Save account</Button>}
      </div>
    );
  }

  function BankAccountsTab({ c, setC, can }) {
    const accounts = Array.isArray(c.bankAccounts) ? c.bankAccounts : [];
    const [editId, setEditId] = useState(null);
    const blank = () => ({
      id: "ba" + Math.random().toString(36).slice(2, 10),
      label: "",
      bankName: "",
      accountName: c.legalName || c.name || "",
      accountNo: "",
      ifsc: "",
      swiftCode: "",
      branch: "",
      bankLine: "",
      isDefault: !accounts.length,
      active: true,
    });
    const editing = editId === "new" ? blank() : accounts.find((b) => b.id === editId);
    function syncLegacy(list, defaultId) {
      const def = list.find((b) => b.id === defaultId) || list.find((b) => b.isDefault) || list[0];
      const f = store.formatBankAccount ? store.formatBankAccount(def) : def;
      setC((p) => ({
        ...p,
        bankAccounts: list,
        defaultBankAccountId: defaultId || (def && def.id) || "",
        bankName: (f && f.bankName) || "",
        accountNo: (f && f.accountNo) || "",
        ifsc: (f && f.ifsc) || "",
        swiftCode: (f && f.swiftCode) || "",
        bank: (f && f.bankLine) || "",
      }));
    }
    function saveAccount(form) {
      if (!form.bankName || !form.accountNo) return VG.toast("Bank name and account number are required", "error");
      const line = form.bankLine || [form.bankName, form.accountNo && "A/c " + form.accountNo, form.ifsc && "IFSC " + form.ifsc].filter(Boolean).join(" · ");
      const row = { ...form, bankLine: line };
      let list = accounts.slice();
      const idx = list.findIndex((b) => b.id === row.id);
      if (idx >= 0) list[idx] = row; else list.push(row);
      if (row.isDefault) {
        list = list.map((b) => ({ ...b, isDefault: b.id === row.id }));
      }
      const defaultId = (list.find((b) => b.isDefault) || list[0] || {}).id;
      syncLegacy(list, defaultId);
      setEditId(null);
      VG.toast("Bank account saved");
    }
    function removeAccount(id) {
      const list = accounts.filter((b) => b.id !== id);
      if (!list.length) return VG.toast("At least one bank account is required", "warn");
      if (!list.some((b) => b.isDefault)) list[0].isDefault = true;
      syncLegacy(list, (list.find((b) => b.isDefault) || list[0]).id);
      VG.toast("Bank account removed");
    }
    function setDefault(id) {
      const list = accounts.map((b) => ({ ...b, isDefault: b.id === id }));
      syncLegacy(list, id);
      VG.toast("Default bank updated");
    }
    if (editing) {
      return (
        <BankAccountForm
          initial={editing}
          isNew={editId === "new"}
          onCancel={() => setEditId(null)}
          onSave={saveAccount}
          can={can}
        />
      );
    }
    return (
      <div className="space-y-4">
        <p className="text-xs opacity-60">Manage multiple company bank accounts. The default account auto-fills on proforma &amp; tax invoices; users can pick another account per document.</p>
        {can("edit") && <Button icon="plus" onClick={() => setEditId("new")}>Add bank account</Button>}
        <div className="space-y-2">
          {accounts.length === 0 && <div className="text-sm opacity-50 py-6 text-center">No bank accounts — add your first account.</div>}
          {accounts.map((ba) => (
            <div key={ba.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 p-3 glass">
              <div className="flex-1 min-w-[200px]">
                <div className="font-medium text-sm">{ba.label || ba.bankName}</div>
                <div className="text-xs opacity-60 mt-0.5">{ba.bankName} · A/c {ba.accountNo}{ba.ifsc ? " · IFSC " + ba.ifsc : ""}</div>
              </div>
              {ba.isDefault && <Pill color="#34d399">Default</Pill>}
              {can("edit") && !ba.isDefault && <Button variant="soft" className="!py-1.5 !text-xs" onClick={() => setDefault(ba.id)}>Set default</Button>}
              {can("edit") && <Button variant="soft" icon="edit" className="!py-1.5" onClick={() => setEditId(ba.id)}>Edit</Button>}
              {can("delete") && accounts.length > 1 && <Button variant="soft" icon="trash" className="!py-1.5 hover:text-rose-400" onClick={() => removeAccount(ba.id)}>Remove</Button>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ================= Company Profile ================= */
  function CompanyProfile({ roleKey, can }) {
    VG.useDB();
    const [tab, setTab] = useState("legal");
    const [c, setC] = useState(() => ({ ...store.company() }));
    const set = (k, v) => setC((p) => ({ ...p, [k]: v }));
    function setReg(k, v) { setC((p) => ({ ...p, registeredAddress: { ...(p.registeredAddress || {}), [k]: v } })); }
    function setOffice(k, v) { setC((p) => ({ ...p, officeAddress: { ...(p.officeAddress || {}), [k]: v } })); }
    function setFactory(k, v) { setC((p) => ({ ...p, factoryAddress: { ...(p.factoryAddress || {}), [k]: v } })); }
    function copyRegToOffice(on) {
      set("officeSameAsRegistered", on);
      if (!on) return;
      const r = c.registeredAddress || {};
      setC((p) => ({
        ...p, officeSameAsRegistered: true,
        officeAddress: { line1: r.line1, line2: r.line2, city: r.city, state: r.state, country: r.country, pin: r.pin },
      }));
    }
    function save() {
      if (!c.legalName && !c.name) return VG.toast("Legal / company name is required", "error");
      const reg = c.registeredAddress || {};
      let office = c.officeAddress || {};
      if (c.officeSameAsRegistered) {
        office = { line1: reg.line1, line2: reg.line2, city: reg.city, state: reg.state, country: reg.country, pin: reg.pin };
      }
      const regText = [reg.line1, reg.line2, reg.city, reg.state, reg.country, reg.pin].filter(Boolean).join(", ");
      const patch = {
        ...c, officeAddress: office, name: c.name || c.legalName,
        address: regText, address1: reg.line1, address2: reg.line2, city: reg.city, state: reg.state, pin: reg.pin, country: reg.country,
        gstin: reg.gstin || c.gstin, phone: reg.phone || c.phone, email: reg.email || c.email,
      };
      store.saveCompany(patch, roleKey);
      VG.toast("Company profile saved — used on all reports & PDFs");
    }
    const reg = c.registeredAddress || {};
    const off = c.officeAddress || {};
    const fac = c.factoryAddress || {};
    return (
      <div>
        <PageHead title="Company Profile" desc="Legal entity, branding, tax IDs and document footer — appears on every PDF">
          {can("edit") && <Button icon="check" onClick={save}>Save profile</Button>}
        </PageHead>
        <div className="flex flex-wrap gap-1 mb-4 glass-dark rounded-2xl p-1.5">
          {COMPANY_TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={"whitespace-nowrap text-sm font-medium px-3 py-2 rounded-xl transition-all " + (tab === t.id ? "text-white shadow" : "opacity-65 hover:opacity-100 chrome-hover")} style={tab === t.id ? { background: "var(--accent)" } : undefined}>{t.label}</button>
          ))}
        </div>
        <Card className="p-4">
          {tab === "legal" && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label="Legal name" required><Text value={c.legalName} onChange={(v) => set("legalName", v)} /></Field>
              <Field label="Trade / display name"><Text value={c.tradeName} onChange={(v) => set("tradeName", v)} /></Field>
              <Field label="Registered name (reports)"><Text value={c.name} onChange={(v) => set("name", v)} /></Field>
              <Field label="Tagline" className="lg:col-span-3"><Text value={c.tagline} onChange={(v) => set("tagline", v)} /></Field>
            </div>
          )}
          {tab === "brand" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <ImageUploadField label="Main logo" value={c.logo} onChange={(v) => set("logo", v)} hint="Used on dashboard and documents" />
              <ImageUploadField label="Letterhead logo" value={c.letterheadLogo} onChange={(v) => set("letterheadLogo", v)} hint="Wide format for PDF headers" />
              <ImageUploadField label="Favicon" value={c.favicon} onChange={(v) => set("favicon", v)} hint="Browser tab icon" />
            </div>
          )}
          {tab === "address" && (
            <div className="space-y-6">
              <div>
                <div className="text-sm font-semibold mb-3">A. Registered address</div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <Field label="Address line 1"><Text value={reg.line1} onChange={(v) => setReg("line1", v)} /></Field>
                  <Field label="Address line 2"><Text value={reg.line2} onChange={(v) => setReg("line2", v)} /></Field>
                  <Field label="City"><Text value={reg.city} onChange={(v) => setReg("city", v)} /></Field>
                  <Field label="District"><Text value={reg.district} onChange={(v) => setReg("district", v)} /></Field>
                  <Field label="State"><Text value={reg.state} onChange={(v) => setReg("state", v)} /></Field>
                  <Field label="State code"><Text value={reg.stateCode} onChange={(v) => setReg("stateCode", v)} /></Field>
                  <Field label="Country"><Text value={reg.country} onChange={(v) => setReg("country", v)} /></Field>
                  <Field label="PIN / ZIP"><Text value={reg.pin} onChange={(v) => setReg("pin", v)} /></Field>
                  <Field label="GSTIN (registered)"><Text value={reg.gstin} onChange={(v) => setReg("gstin", v)} /></Field>
                  <Field label="Phone"><Text value={reg.phone} onChange={(v) => setReg("phone", v)} /></Field>
                  <Field label="Email"><Text value={reg.email} onChange={(v) => setReg("email", v)} /></Field>
                </div>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <div className="text-sm font-semibold">B. Corporate / office address</div>
                  <Checkbox checked={!!c.officeSameAsRegistered} onChange={copyRegToOffice} label="Office address same as registered address" />
                </div>
                {!c.officeSameAsRegistered && (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <Field label="Address line 1"><Text value={off.line1} onChange={(v) => setOffice("line1", v)} /></Field>
                    <Field label="Address line 2"><Text value={off.line2} onChange={(v) => setOffice("line2", v)} /></Field>
                    <Field label="City"><Text value={off.city} onChange={(v) => setOffice("city", v)} /></Field>
                    <Field label="State"><Text value={off.state} onChange={(v) => setOffice("state", v)} /></Field>
                    <Field label="Country"><Text value={off.country} onChange={(v) => setOffice("country", v)} /></Field>
                    <Field label="PIN / ZIP"><Text value={off.pin} onChange={(v) => setOffice("pin", v)} /></Field>
                  </div>
                )}
                {c.officeSameAsRegistered && <div className="text-xs opacity-50">Using registered address for office correspondence.</div>}
              </div>
              <div>
                <div className="text-sm font-semibold mb-3">C. Factory / warehouse address</div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <Field label="Address line 1"><Text value={fac.line1} onChange={(v) => setFactory("line1", v)} /></Field>
                  <Field label="Address line 2"><Text value={fac.line2} onChange={(v) => setFactory("line2", v)} /></Field>
                  <Field label="City"><Text value={fac.city} onChange={(v) => setFactory("city", v)} /></Field>
                  <Field label="State"><Text value={fac.state} onChange={(v) => setFactory("state", v)} /></Field>
                  <Field label="Country"><Text value={fac.country} onChange={(v) => setFactory("country", v)} /></Field>
                  <Field label="PIN / ZIP"><Text value={fac.pin} onChange={(v) => setFactory("pin", v)} /></Field>
                </div>
              </div>
            </div>
          )}
          {tab === "tax" && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label="GSTIN"><Text value={c.gstin} onChange={(v) => set("gstin", v)} /></Field>
              <Field label="PAN"><Text value={c.pan} onChange={(v) => set("pan", v)} /></Field>
              <Field label="CIN"><Text value={c.cin} onChange={(v) => set("cin", v)} /></Field>
              <Field label="Udyam"><Text value={c.udyam} onChange={(v) => set("udyam", v)} /></Field>
              <Field label="IEC (export)"><Text value={c.iec} onChange={(v) => set("iec", v)} /></Field>
            </div>
          )}
          {tab === "contact" && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label="Primary phone"><Text value={c.phone} onChange={(v) => set("phone", v)} /></Field>
              <Field label="Alternate phone"><Text value={c.altPhone} onChange={(v) => set("altPhone", v)} /></Field>
              <Field label="General email"><Text value={c.email} onChange={(v) => set("email", v)} /></Field>
              <Field label="Sales email"><Text value={c.salesEmail} onChange={(v) => set("salesEmail", v)} /></Field>
              <Field label="Accounts email"><Text value={c.accountsEmail} onChange={(v) => set("accountsEmail", v)} /></Field>
              <Field label="Support email"><Text value={c.supportEmail} onChange={(v) => set("supportEmail", v)} /></Field>
              <Field label="Website" className="lg:col-span-3"><Text value={c.website} onChange={(v) => set("website", v)} /></Field>
            </div>
          )}
          {tab === "bank" && (
            <BankAccountsTab c={c} setC={setC} can={can} />
          )}
          {tab === "sign" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Signatory name"><Text value={c.signatoryName} onChange={(v) => set("signatoryName", v)} /></Field>
              <Field label="Signatory title"><Text value={c.signatoryTitle} onChange={(v) => set("signatoryTitle", v)} /></Field>
              <ImageUploadField label="Signature image" value={c.signatureImage} onChange={(v) => set("signatureImage", v)} />
              <ImageUploadField label="Company seal" value={c.sealImage} onChange={(v) => set("sealImage", v)} />
            </div>
          )}
          {tab === "terms" && (
            <div className="grid gap-3">
              <Field label="Standard terms"><Area value={c.terms} onChange={(v) => set("terms", v)} rows={2} /></Field>
              <Field label="Warranty"><Area value={c.warranty} onChange={(v) => set("warranty", v)} rows={2} /></Field>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Default payment terms"><Text value={c.paymentTermsDefault} onChange={(v) => set("paymentTermsDefault", v)} /></Field>
                <Field label="Default delivery terms"><Text value={c.deliveryTermsDefault} onChange={(v) => set("deliveryTermsDefault", v)} /></Field>
              </div>
              <Field label="Jurisdiction"><Text value={c.jurisdiction} onChange={(v) => set("jurisdiction", v)} /></Field>
              <Field label="Document footer line"><Text value={c.docFooter} onChange={(v) => set("docFooter", v)} /></Field>
            </div>
          )}
        </Card>
      </div>
    );
  }

  /* ================= Admin Dashboard ================= */
  function AdminDashboard(props) {
    return VG.ModuleDashboard ? <VG.ModuleDashboard modId="admin" {...props} /> : null;
  }

  /* ================= Locations ================= */
  function LocationForm({ open, onClose, record, roleKey, can }) {
    const isEdit = !!(record && record.id);
    const [f, setF] = useState(() => ({ status: "Active", locType: "Warehouse", defaultWarehouse: false, country: "India", ...record }));
    const [dirty, setDirty] = useState(false);
    const set = (k, v) => { setDirty(true); setF((p) => ({ ...p, [k]: v })); };
    useEffect(() => { if (open) { setF({ status: "Active", locType: "Warehouse", defaultWarehouse: false, country: "India", ...record }); setDirty(false); } }, [open, record && record.id]);
    function save() {
      if (!f.name) return VG.toast("Location name is required", "error");
      const payload = { ...f, defaultWarehouse: !!f.defaultWarehouse };
      if (isEdit) { store.update("locations", f.id, payload, roleKey); VG.toast("Location updated"); }
      else { store.create("locations", payload, roleKey); VG.toast("Location created"); }
      onClose();
    }
    return (
      <Modal open={open} onClose={onClose} dirty={dirty} title={isEdit ? "Edit Location" : "New Location"} subtitle="Plants, warehouses, racks and bins"
        actions={<Button icon="check" onClick={save}>Save</Button>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Code"><Text value={f.code} onChange={(v) => set("code", v)} /></Field>
          <Field label="Name" required><Text value={f.name} onChange={(v) => set("name", v)} /></Field>
          <Field label="Type"><Select value={f.locType} onChange={(v) => set("locType", v)} options={LOC_TYPES.map((x) => ({ value: x, label: x }))} /></Field>
          <Field label="Address line 1"><Text value={f.line1} onChange={(v) => set("line1", v)} /></Field>
          <Field label="City"><Text value={f.city} onChange={(v) => set("city", v)} /></Field>
          <Field label="State"><Text value={f.state} onChange={(v) => set("state", v)} /></Field>
          <Field label="PIN"><Text value={f.pin} onChange={(v) => set("pin", v)} /></Field>
          <Field label="Contact person"><Text value={f.contact} onChange={(v) => set("contact", v)} /></Field>
          <Field label="Phone"><Text value={f.phone} onChange={(v) => set("phone", v)} /></Field>
          <Field label="Email"><Text value={f.email} onChange={(v) => set("email", v)} /></Field>
          <Field label="GSTIN"><Text value={f.gstin} onChange={(v) => set("gstin", v)} /></Field>
          <Field label="Status"><Select value={f.status} onChange={(v) => set("status", v)} options={["Active", "Inactive"].map((x) => ({ value: x, label: x }))} /></Field>
          <div className="flex items-end pb-1"><Checkbox checked={!!f.defaultWarehouse} onChange={(v) => set("defaultWarehouse", v)} label="Default warehouse" /></div>
        </div>
      </Modal>
    );
  }

  function LocationsPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const rows = store.list("locations");
    const cols = [
      { key: "code", label: "Code", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
      { key: "name", label: "Location" },
      { key: "locType", label: "Type", render: (r) => <Pill color="#6366f1">{r.locType}</Pill> },
      { key: "city", label: "City" },
      { key: "contact", label: "Contact" },
      { key: "gstin", label: "GSTIN", render: (r) => <span className="font-mono text-xs">{r.gstin || "—"}</span> },
      { key: "defaultWarehouse", label: "Default WH", render: (r) => r.defaultWarehouse ? <Pill color="#34d399">Yes</Pill> : "—" },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={{ Active: "#34d399", Inactive: "#94a3b8" }} /> },
    ];
    if (edit) {
      return <LocationForm open onClose={() => setEdit(null)} record={edit.id ? edit : null} roleKey={roleKey} can={can} />;
    }
    return (
      <ListPage title="Locations" desc="Plants, branches, warehouses, stores and rack/bin locations" onNew={can("add") ? () => setEdit({}) : null} newLabel="Add Location" can={can}>
        <RecordTable embedded suppressNew title="Location List" columns={cols} rows={rows} can={can} printTitle="Locations" searchKeys={["name", "code", "city", "contact"]}
          onNew={can("add") ? () => setEdit({}) : null} onEdit={can("edit") ? (r) => setEdit(r) : null}
          onDelete={can("delete") ? async (r) => { if (await VG.confirm({ title: "Delete " + r.name + "?", danger: true, confirmLabel: "Delete" })) { store.remove("locations", r.id, roleKey); VG.toast("Deleted"); } } : null} />
      </ListPage>
    );
  }

  /* ================= Users ================= */
  function UserForm({ open, onClose, record, roleKey, can }) {
    const isEdit = !!(record && record.id);
    const [f, setF] = useState(() => ({ status: "Active", loginAllowed: true, isDeleted: false, forcePasswordChange: false, twoFactor: false, failedLogins: 0, ...record }));
    const [dirty, setDirty] = useState(false);
    const [history, setHistory] = useState(false);
    const [sessionsOpen, setSessionsOpen] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const roles = store.listRoles().filter((r) => r.active !== false);
    const depts = store.list("departments");
    const set = (k, v) => { setDirty(true); setF((p) => ({ ...p, [k]: v })); };
    useEffect(() => {
      if (open) {
        setF({ status: "Active", loginAllowed: true, isDeleted: false, forcePasswordChange: false, twoFactor: false, failedLogins: 0, ...record });
        setDirty(false); setHistory(false); setSessionsOpen(false); setNewPassword("");
      }
    }, [open, record && record.id]);
    async function save() {
      if (!f.name || !f.email) return VG.toast("Name and email are required", "error");
      if (!f.roleKey) return VG.toast("Select a role", "error");
      const payload = {
        ...f,
        email: String(f.email || "").trim().toLowerCase(),
        username: f.username || String(f.email || "").trim().toLowerCase().split("@")[0],
        loginAllowed: !!f.loginAllowed,
        forcePasswordChange: !!f.forcePasswordChange,
        twoFactor: !!f.twoFactor,
        isDeleted: !!f.isDeleted,
        status: f.status || "Active",
      };
      delete payload.password;
      delete payload.passwordHash;
      delete payload.passwordSalt;
      setBusy(true);
      try {
        if (isEdit) {
          store.update("erpUsers", f.id, payload, roleKey);
          if (newPassword) {
            const res = await store.setUserPassword(f.id, newPassword, roleKey);
            if (!res.ok) return VG.toast(res.reason || "Password not saved", "error");
          }
          const saved = store.get("erpUsers", f.id);
          const elig = store.isUserLoginEligible(saved);
          if (!elig.ok && saved && saved.loginAllowed !== false && saved.status === "Active") {
            return VG.toast(elig.reason || "User saved but login may be blocked", "warn");
          }
          VG.toast("User " + f.userId + " updated");
        } else {
          const res = await store.createErpUser({
            ...payload,
            userId: store.nextUserId(),
            createdAt: Date.now(),
            isDeleted: false,
          }, newPassword, roleKey);
          if (!res.ok) return VG.toast(res.reason || "User not created", "error");
          VG.toast("User created successfully and login is enabled.");
        }
        onClose();
      } finally {
        setBusy(false);
      }
    }
    async function resetPassword() {
      if (!isEdit || !f.id) return;
      if (!newPassword) return VG.toast("Enter a new password in the field below", "error");
      setBusy(true);
      try {
        const res = await store.setUserPassword(f.id, newPassword, roleKey);
        if (!res.ok) return VG.toast(res.reason || "Reset failed", "error");
        setNewPassword("");
        VG.toast("Password reset for " + f.userId);
      } finally {
        setBusy(false);
      }
    }
    const loginRows = (f.email ? store.list("loginLog").filter((l) => l.email === f.email || l.roleKey === f.roleKey) : []).slice().reverse();
    return (
      <Modal open={open} onClose={onClose} size="lg" dirty={dirty} title={isEdit ? "Edit User · " + f.userId : "New User"} subtitle="ERP login accounts linked to roles"
        actions={<Button icon="check" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>}
        footer={<>{isEdit && <Button variant="soft" icon="activity" onClick={() => setHistory((h) => !h)}>{history ? "Hide history" : "Login history"}</Button>}{isEdit && <Button variant="soft" icon="users" onClick={() => setSessionsOpen((s) => !s)}>{sessionsOpen ? "Hide sessions" : "Active sessions"}</Button>}{isEdit && can("edit") && <Button variant="soft" onClick={() => { store.update("erpUsers", f.id, { failedLogins: 0, status: f.status === "Locked" ? "Active" : f.status }, roleKey); set("failedLogins", 0); VG.toast("Failed login count reset"); }}>Reset failed logins</Button>}{isEdit && can("edit") && <Button variant="soft" onClick={resetPassword} disabled={busy}>Reset password</Button>}</>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {isEdit && <Field label="User ID"><Text value={f.userId} disabled /></Field>}
          <Field label="Full name" required><Text value={f.name} onChange={(v) => set("name", v)} /></Field>
          <Field label="Email" required><Text value={f.email} onChange={(v) => set("email", v)} /></Field>
          <Field label="Username"><Text value={f.username} onChange={(v) => set("username", v)} /></Field>
          <Field label="Mobile"><Text value={f.mobile} onChange={(v) => set("mobile", v)} /></Field>
          <Field label="Role" required><Select value={f.roleKey} onChange={(v) => set("roleKey", v)} options={roles.map((r) => ({ value: r.key, label: r.label }))} /></Field>
          <Field label="Department"><Select value={f.department} onChange={(v) => set("department", v)} options={depts.map((d) => ({ value: d.name, label: d.name }))} /></Field>
          <Field label="Designation"><Text value={f.designation} onChange={(v) => set("designation", v)} /></Field>
          <Field label="Location"><MasterSelect collection="locations" value={f.locationId} onChange={(v) => set("locationId", v)} actorRole={roleKey} can={can("add")} /></Field>
          <Field label="Employee (HR master)"><MasterSelect collection="employees" value={f.employeeId} onChange={(v) => set("employeeId", v)} actorRole={roleKey} can={can("add")} /></Field>
          <Field label={isEdit ? "New password (optional)" : "Initial password"} required={!isEdit} hint="Min length per Security settings · stored encrypted">
            <Text type="password" value={newPassword} onChange={setNewPassword} />
          </Field>
          <Field label="Status"><Select value={f.status} onChange={(v) => set("status", v)} options={["Active", "Inactive", "Locked"].map((x) => ({ value: x, label: x }))} /></Field>
          <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap gap-4 pt-1">
            <Checkbox checked={!!f.loginAllowed} onChange={(v) => set("loginAllowed", v)} label="Login allowed" />
            <Checkbox checked={!!f.forcePasswordChange} onChange={(v) => set("forcePasswordChange", v)} label="Force password change" />
            <Checkbox checked={!!f.twoFactor} onChange={(v) => set("twoFactor", v)} label="Two-factor required" />
            {isEdit && <span className="text-xs opacity-60 self-center">Failed logins: {f.failedLogins || 0} · Last login: {fmtTime(f.lastLogin)}</span>}
          </div>
        </div>
        {sessionsOpen && isEdit && (
          <div className="mt-4 border-t border-white/10 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider opacity-50">Active sessions</h4>
              {can("edit") && (
                <Button variant="soft" className="!py-1" onClick={() => { store.forceLogoutUser(f.id, roleKey, "admin-force"); VG.toast("All sessions revoked for " + f.userId); }}>Force logout all</Button>
              )}
            </div>
            {(store.sessionsForUser(f.id) || []).length === 0 ? <div className="text-sm opacity-50">No active sessions</div> : (
              <ul className="space-y-1 max-h-32 overflow-y-auto">{store.sessionsForUser(f.id).map((s) => (
                <li key={s.sessionId} className="flex gap-2 text-xs items-center">
                  <span className="flex-1 font-mono truncate">{s.machineId || "—"} · {fmtTime(s.lastSeenAt)}</span>
                  {can("edit") && <Button variant="ghost" className="!py-0.5" onClick={() => { store.revokeSession(s.sessionId, roleKey); VG.toast("Session revoked"); }}>Revoke</Button>}
                </li>
              ))}</ul>
            )}
          </div>
        )}
        {history && (
          <div className="mt-4 border-t border-white/10 pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider opacity-50 mb-2">Login history</h4>
            {loginRows.length === 0 ? <div className="text-sm opacity-50">No login events</div> : (
              <ul className="space-y-1 max-h-40 overflow-y-auto">{loginRows.map((l) => (
                <li key={l.id} className="flex gap-2 text-xs flex-wrap"><Pill color={l.success ? "#34d399" : "#ef4444"}>{l.success ? "OK" : "Fail"}</Pill><span className="flex-1">{fmtTime(l.ts)}</span>{l.reason && <span className="opacity-60">{l.reason}</span>}{l.ip && <span className="font-mono opacity-60">{l.ip}</span>}</li>
              ))}</ul>
            )}
          </div>
        )}
      </Modal>
    );
  }

  function UsersPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const [showDeleted, setShowDeleted] = useState(false);
    const rows = store.list("erpUsers", { includeDeleted: showDeleted }).slice().reverse();
    const cols = [
      { key: "userId", label: "User ID", render: (r) => <span className="font-mono text-xs">{r.userId}{r.isDeleted ? " · deleted" : ""}</span> },
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "roleKey", label: "Role", render: (r) => <Pill color="#6366f1">{roleLabel(r.roleKey)}</Pill>, csv: (r) => roleLabel(r.roleKey) },
      { key: "department", label: "Department" },
      { key: "locationId", label: "Location", render: (r) => locName(r.locationId), csv: (r) => locName(r.locationId) },
      { key: "status", label: "Status", render: (r) => <StatusTag value={r.isDeleted ? "Deleted" : r.status} map={{ Active: "#34d399", Inactive: "#94a3b8", Locked: "#ef4444", Deleted: "#ef4444" }} /> },
      { key: "lastLogin", label: "Last login", render: (r) => fmtTime(r.lastLogin), csv: (r) => fmtTime(r.lastLogin) },
      { key: "act", label: "Actions", render: (r) => can("edit") && !r.isDeleted ? (
        <div className="flex gap-1 flex-wrap">
          {r.status === "Locked" && <Button variant="soft" className="!py-1" onClick={() => { store.update("erpUsers", r.id, { status: "Active", failedLogins: 0 }, roleKey); VG.toast("Account unlocked"); }}>Unlock</Button>}
          {r.status === "Active" && <Button variant="ghost" className="!py-1" onClick={() => { store.deactivateErpUser(r.id, roleKey); VG.toast("User deactivated — login blocked"); }}>Deactivate</Button>}
          {r.status === "Inactive" && <Button variant="soft" className="!py-1" onClick={() => { store.reactivateErpUser(r.id, roleKey); VG.toast("User reactivated"); }}>Activate</Button>}
          <Button variant="ghost" className="!py-1" onClick={() => { store.forceLogoutUser(r.id, roleKey, "admin"); VG.toast("Sessions revoked"); }}>Force logout</Button>
        </div>
      ) : null },
    ];
    if (edit) {
      return <UserForm open onClose={() => setEdit(null)} record={edit.id ? edit : null} roleKey={roleKey} can={can} />;
    }
    return (
      <ListPage title="Users" desc="ERP user accounts — login requires active user, role and password in this database" onNew={can("add") ? () => setEdit({}) : null} newLabel="Add User" can={can}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Checkbox checked={showDeleted} onChange={setShowDeleted} label="Show deleted users" />
        </div>
        <RecordTable embedded suppressNew title="User List" columns={cols} rows={rows} can={can} printTitle="ERP Users" searchKeys={["userId", "name", "email", "department"]}
          filters={[{ key: "status", label: "All status", options: ["Active", "Inactive", "Locked", "Deleted"] }]}
          onNew={can("add") ? () => setEdit({}) : null} onEdit={can("edit") ? (r) => setEdit(r) : null}
          onDelete={can("delete") ? async (r) => {
            if (r.isDeleted) return;
            if (await VG.confirm({ title: "Delete user " + r.userId + "?", message: "Login will be blocked immediately and all sessions ended.", danger: true, confirmLabel: "Delete" })) {
              store.deleteErpUser(r.id, roleKey);
              VG.toast("User deleted — login disabled");
            }
          } : null} />
      </ListPage>
    );
  }

  /* ================= Roles ================= */
  function RoleForm({ open, onClose, record, roleKey, duplicate }) {
    const isEdit = !!(record && record.id && !duplicate);
    const [f, setF] = useState(() => ({ actions: ["view"], moduleAccess: [], permissions: {}, sectionAccess: {}, hierarchy: 100, active: true, ...record }));
    const [dirty, setDirty] = useState(false);
    const [showMatrix, setShowMatrix] = useState(false);
    const set = (k, v) => { setDirty(true); setF((p) => ({ ...p, [k]: v })); };
    const setDraft = (fn) => { setDirty(true); setF((p) => (typeof fn === "function" ? fn(p) : fn)); };
    useEffect(() => {
      if (!open) return;
      const base = duplicate ? { ...clone(record), id: undefined, key: (record.key || "role") + "_copy", label: (record.label || "") + " (Copy)", builtIn: false } : { actions: ["view"], moduleAccess: [], permissions: {}, sectionAccess: {}, hierarchy: 100, active: true, ...record };
      setF({ ...base, sectionAccess: base.sectionAccess || {} });
      setDirty(false);
      setShowMatrix(false);
    }, [open, record && record.id, duplicate]);
    function save() {
      if (!f.label || !f.key) return VG.toast("Label and key are required", "error");
      if (f.builtIn && isEdit) { store.saveRole(f, roleKey); VG.toast("Role updated"); onClose(); return; }
      if (!isEdit) { f.id = "role_" + f.key.replace(/\W+/g, "_"); f.builtIn = false; }
      store.saveRole(f, roleKey);
      VG.toast(isEdit ? "Role updated" : "Role created");
      onClose();
    }
    const AccessPanel = VG.RoleAccessPanel;
    return (
      <Modal open={open} onClose={onClose} size="xl" dirty={dirty} title={duplicate ? "Duplicate Role" : isEdit ? "Edit Role · " + f.label : "New Role"} subtitle="Module access, actions, tabs and permission matrix"
        actions={<Button icon="check" onClick={save}>Save role</Button>}
        footer={<Button variant="soft" onClick={() => setShowMatrix((s) => !s)}>{showMatrix ? "Hide matrix" : "Fine-grained matrix"}</Button>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <Field label="Role key" required><Text value={f.key} onChange={(v) => set("key", v)} disabled={isEdit && f.builtIn} /></Field>
          <Field label="Display label" required><Text value={f.label} onChange={(v) => set("label", v)} /></Field>
          <Field label="Tagline"><Text value={f.tag} onChange={(v) => set("tag", v)} /></Field>
          <Field label="Avatar (2 chars)"><Text value={f.avatar} onChange={(v) => set("avatar", v)} /></Field>
          <Field label="Colour"><Text type="color" value={f.color || "#6366f1"} onChange={(v) => set("color", v)} /></Field>
          <Field label="Hierarchy (lower = higher)"><Num value={f.hierarchy} onChange={(v) => set("hierarchy", v)} /></Field>
          <div className="flex items-end pb-1"><Checkbox checked={f.active !== false} onChange={(v) => set("active", v)} label="Active" /></div>
        </div>
        {AccessPanel ? <AccessPanel draft={f} setDraft={setDraft} canEdit={true} showMatrix={showMatrix} /> : <p className="text-sm opacity-50">Permission UI not loaded</p>}
      </Modal>
    );
  }

  function RolesPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const [dup, setDup] = useState(false);
    const rows = store.listRoles();
    const cols = [
      { key: "label", label: "Role", render: (r) => <div className="flex items-center gap-2"><Pill color={r.color || "#6366f1"}>{r.avatar || r.key.slice(0, 2).toUpperCase()}</Pill><span>{r.label}</span>{r.builtIn && <Pill color="#94a3b8">built-in</Pill>}</div> },
      { key: "key", label: "Key", render: (r) => <span className="font-mono text-xs">{r.key}</span> },
      { key: "moduleAccess", label: "Modules", render: (r) => r.moduleAccess === "all" ? "All" : (r.moduleAccess || []).length },
      { key: "actions", label: "Actions", render: (r) => (r.actions || []).join(", ") },
      { key: "hierarchy", label: "Hierarchy" },
      { key: "act", label: "", render: (r) => (
        <div className="flex gap-1">
          {can("edit") && <Button variant="soft" className="!py-1" onClick={() => { setDup(false); setEdit(r); }}>Edit</Button>}
          {can("add") && <Button variant="ghost" className="!py-1" onClick={() => { setDup(true); setEdit(r); }}>Duplicate</Button>}
          {can("delete") && !r.builtIn && <Button variant="ghost" className="!py-1" onClick={async () => { if (await VG.confirm({ title: "Delete role " + r.label + "?", danger: true, confirmLabel: "Delete" })) { if (store.deleteRole(r.id, roleKey)) VG.toast("Deleted"); else VG.toast("Role in use or protected", "error"); } }}>Delete</Button>}
        </div>
      ) },
    ];
    if (edit) {
      return <RoleForm open onClose={() => { setEdit(null); setDup(false); }} record={edit} roleKey={roleKey} duplicate={dup} />;
    }
    return (
      <ListPage title="Roles" desc="Custom roles with module access, actions and hierarchy" onNew={can("add") ? () => { setDup(false); setEdit({ key: "custom_" + Date.now().toString(36).slice(-4), label: "New Role", avatar: "NR", color: "#6366f1" }); } : null} newLabel="Add Role" can={can}>
        <RecordTable embedded suppressNew title="Role List" columns={cols} rows={rows} can={can} printTitle="Roles" searchKeys={["label", "key", "tag"]} search={false}
          onNew={can("add") ? () => { setDup(false); setEdit({ key: "custom_" + Date.now().toString(36).slice(-4), label: "New Role", avatar: "NR", color: "#6366f1" }); } : null} />
      </ListPage>
    );
  }

  /* ================= Permissions matrix ================= */
  function PermissionsPage({ roleKey, can }) {
    VG.useDB();
    const roles = store.listRoles();
    const [sel, setSel] = useState(roles[0] && roles[0].key);
    const [draft, setDraft] = useState(null);
    const role = store.getRole(sel);
    useEffect(() => {
      if (!sel) return;
      const r = store.getRole(sel);
      if (r) setDraft(clone({
        permissions: r.permissions || {}, actions: r.actions || ["view"],
        moduleAccess: r.moduleAccess, sectionAccess: r.sectionAccess || {},
      }));
    }, [sel]);
    if (!role || !draft) return <div className="text-sm opacity-50 p-8 text-center">No roles configured</div>;
    const Matrix = VG.PermissionMatrixEditor;
    function save() {
      const updated = {
        ...role,
        permissions: draft.permissions,
        actions: draft.actions,
        moduleAccess: draft.moduleAccess,
        sectionAccess: draft.sectionAccess || {},
      };
      store.saveRole(updated, roleKey);
      store.syncRoleToRuntime(role.key);
      VG.toast("Permissions saved for " + role.label);
    }
    return (
      <div>
        <PageHead title="Permission Matrix" desc="Grant all access, module groups, tabs and per-action controls with select-all">
          {can("edit") && <Button icon="check" onClick={save}>Save permissions</Button>}
        </PageHead>
        <Card className="p-4 mb-4">
          <Field label="Role"><Select value={sel} onChange={setSel} options={roles.map((r) => ({ value: r.key, label: r.label }))} /></Field>
        </Card>
        {Matrix ? <Matrix draft={draft} setDraft={setDraft} canEdit={can("edit")} /> : <p className="opacity-50">Permission matrix UI not loaded</p>}
      </div>
    );
  }

  /* ================= Field Permissions ================= */
  function FieldPermForm({ open, onClose, record, roleKey }) {
    const isEdit = !!(record && record.id);
    const [f, setF] = useState(() => ({ visible: true, editable: true, mandatory: false, approvalRequired: false, ...record }));
    const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
    useEffect(() => { if (open) setF({ visible: true, editable: true, mandatory: false, approvalRequired: false, ...record }); }, [open, record && record.id]);
    function save() {
      if (!f.module || !f.field) return VG.toast("Module and field are required", "error");
      const payload = { ...f, visible: !!f.visible, editable: !!f.editable, mandatory: !!f.mandatory, approvalRequired: !!f.approvalRequired };
      if (isEdit) store.update("fieldPermissions", f.id, payload, roleKey);
      else store.create("fieldPermissions", payload, roleKey);
      VG.toast("Field rule saved");
      onClose();
    }
    const modOpts = (VG.ADMIN_MODULES || []).map((m) => ({ value: m.id, label: m.label }));
    return (
      <Modal open={open} onClose={onClose} title={isEdit ? "Edit Field Rule" : "New Field Rule"}
        actions={<Button icon="check" onClick={save}>Save</Button>}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Module" required><Select value={f.module} onChange={(v) => set("module", v)} options={modOpts} /></Field>
          <Field label="Field name" required hint="e.g. discount, rate, creditLimit"><Text value={f.field} onChange={(v) => set("field", v)} /></Field>
          <Field label="Role (optional)"><Select value={f.roleKey || ""} onChange={(v) => set("roleKey", v)} options={[{ value: "", label: "All roles" }].concat(store.listRoles().map((r) => ({ value: r.key, label: r.label })))} /></Field>
          <div className="sm:col-span-2 flex flex-wrap gap-2 mb-1">
            <Button variant="soft" className="!py-1" onClick={() => setF((p) => ({ ...p, visible: true, editable: true, mandatory: true, approvalRequired: true }))}>Select all</Button>
            <Button variant="ghost" className="!py-1" onClick={() => setF((p) => ({ ...p, visible: false, editable: false, mandatory: false, approvalRequired: false }))}>Deselect all</Button>
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-4">
            <Checkbox checked={!!f.visible} onChange={(v) => { set("visible", v); if (!v) { set("editable", false); set("mandatory", false); } }} label="Visible" />
            <Checkbox checked={!!f.editable} onChange={(v) => { if (v && !f.visible) return VG.toast("Enable Visible first", "warn"); set("editable", v); }} label="Editable" />
            <Checkbox checked={!!f.mandatory} onChange={(v) => { if (v && !f.visible) return VG.toast("Enable Visible first", "warn"); set("mandatory", v); }} label="Mandatory" />
            <Checkbox checked={!!f.approvalRequired} onChange={(v) => set("approvalRequired", v)} label="Approval required" />
          </div>
        </div>
      </Modal>
    );
  }

  function FieldPermissionsPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const rows = store.list("fieldPermissions");
    const modLabel = (id) => ((VG.ADMIN_MODULES || []).find((m) => m.id === id) || {}).label || id;
    const cols = [
      { key: "module", label: "Module", render: (r) => modLabel(r.module) },
      { key: "field", label: "Field" },
      { key: "roleKey", label: "Role", render: (r) => r.roleKey ? roleLabel(r.roleKey) : "All" },
      { key: "visible", label: "Visible", render: (r) => r.visible !== false ? "✓" : "—" },
      { key: "editable", label: "Editable", render: (r) => r.editable !== false ? "✓" : "—" },
      { key: "mandatory", label: "Mandatory", render: (r) => r.mandatory ? "✓" : "—" },
      { key: "approvalRequired", label: "Approval", render: (r) => r.approvalRequired ? "✓" : "—" },
    ];
    if (edit) {
      return <FieldPermForm open onClose={() => setEdit(null)} record={edit.id ? edit : null} roleKey={roleKey} />;
    }
    return (
      <ListPage title="Field Permissions" desc="Control visibility, editability and mandatory rules per module field" onNew={can("add") ? () => setEdit({}) : null} newLabel="Add Rule" can={can}>
        <RecordTable embedded suppressNew title="Field Rule List" columns={cols} rows={rows} can={can} printTitle="Field Permissions" searchKeys={["module", "field"]}
          onNew={can("add") ? () => setEdit({}) : null} onEdit={can("edit") ? (r) => setEdit(r) : null}
          onDelete={can("delete") ? async (r) => { if (await VG.confirm({ title: "Delete this rule?", danger: true, confirmLabel: "Delete" })) { store.remove("fieldPermissions", r.id, roleKey); VG.toast("Deleted"); } } : null} />
      </ListPage>
    );
  }

  /* ================= Approvals ================= */
  function ApprovalForm({ open, onClose, record, roleKey }) {
    const isEdit = !!(record && record.id);
    const [f, setF] = useState(() => ({ levels: 1, amountThreshold: 0, departmentBased: false, roleApprovers: ["admin"], autoApproveBelow: 0, escalationHours: 24, remarksMandatory: true, active: true, ...record }));
    const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
    useEffect(() => { if (open) setF({ levels: 1, amountThreshold: 0, departmentBased: false, roleApprovers: ["admin"], autoApproveBelow: 0, escalationHours: 24, remarksMandatory: true, active: true, ...record }); }, [open, record && record.id]);
    function save() {
      if (!f.process) return VG.toast("Process type is required", "error");
      const payload = { ...f, departmentBased: !!f.departmentBased, remarksMandatory: !!f.remarksMandatory, active: !!f.active, roleApprovers: Array.isArray(f.roleApprovers) ? f.roleApprovers : [f.roleApprovers].filter(Boolean) };
      if (isEdit) store.update("approvalWorkflows", f.id, payload, roleKey);
      else store.create("approvalWorkflows", payload, roleKey);
      VG.toast("Workflow saved");
      onClose();
    }
    const types = VG.ADMIN_APPROVAL_TYPES || [];
    const roleOpts = store.listRoles().map((r) => ({ value: r.key, label: r.label }));
    return (
      <Modal open={open} onClose={onClose} title={isEdit ? "Edit Workflow" : "New Approval Workflow"}
        actions={<Button icon="check" onClick={save}>Save</Button>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Process" required className="lg:col-span-2"><Select value={f.process} onChange={(v) => set("process", v)} options={types.map((t) => ({ value: t, label: t }))} /></Field>
          <Field label="Approval levels"><Num value={f.levels} onChange={(v) => set("levels", v)} /></Field>
          <Field label="Amount threshold (₹)"><Num value={f.amountThreshold} onChange={(v) => set("amountThreshold", v)} /></Field>
          <Field label="Auto-approve below (₹)"><Num value={f.autoApproveBelow} onChange={(v) => set("autoApproveBelow", v)} /></Field>
          <Field label="Escalation (hours)"><Num value={f.escalationHours} onChange={(v) => set("escalationHours", v)} /></Field>
          <Field label="Primary approver role"><Select value={(f.roleApprovers || [])[0] || "admin"} onChange={(v) => set("roleApprovers", [v])} options={roleOpts} /></Field>
          <div className="lg:col-span-3 flex flex-wrap gap-4">
            <Checkbox checked={!!f.departmentBased} onChange={(v) => set("departmentBased", v)} label="Department-based routing" />
            <Checkbox checked={!!f.remarksMandatory} onChange={(v) => set("remarksMandatory", v)} label="Remarks mandatory" />
            <Checkbox checked={f.active !== false} onChange={(v) => set("active", v)} label="Active" />
          </div>
        </div>
      </Modal>
    );
  }

  function ApprovalsPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const rows = store.list("approvalWorkflows");
    const cols = [
      { key: "process", label: "Process" },
      { key: "levels", label: "Levels" },
      { key: "amountThreshold", label: "Threshold", render: (r) => r.amountThreshold ? "₹" + Number(r.amountThreshold).toLocaleString("en-IN") : "—" },
      { key: "roleApprovers", label: "Approvers", render: (r) => (r.roleApprovers || []).map(roleLabel).join(", ") },
      { key: "escalationHours", label: "Escalation (h)" },
      { key: "active", label: "Status", render: (r) => <StatusTag value={r.active !== false ? "Active" : "Inactive"} map={{ Active: "#34d399", Inactive: "#94a3b8" }} /> },
    ];
    if (edit) {
      return <ApprovalForm open onClose={() => setEdit(null)} record={edit.id ? edit : null} roleKey={roleKey} />;
    }
    return (
      <ListPage title="Approval Workflows" desc="Multi-level approval rules by process type and amount" onNew={can("add") ? () => setEdit({}) : null} newLabel="Add Workflow" can={can}>
        <RecordTable embedded suppressNew title="Workflow List" columns={cols} rows={rows} can={can} printTitle="Approval Workflows" searchKeys={["process"]}
          onNew={can("add") ? () => setEdit({}) : null} onEdit={can("edit") ? (r) => setEdit(r) : null}
          onDelete={can("delete") ? async (r) => { if (await VG.confirm({ title: "Delete workflow?", danger: true, confirmLabel: "Delete" })) { store.remove("approvalWorkflows", r.id, roleKey); VG.toast("Deleted"); } } : null} />
      </ListPage>
    );
  }

  /* ================= Master Data ================= */
  function MasterDataPage({ roleKey, can }) {
    VG.useDB();
    const links = VG.ADMIN_MASTER_LINKS || [];
    return (
      <div>
        <PageHead title="Master Data Hub" desc="Jump to master registers across modules with live record counts" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {links.map((l) => {
            const count = (store.list(l.collection) || []).length;
            return (
              <Card key={l.collection + l.section} className="p-4 flex items-center gap-4">
                <span className="grid place-items-center w-11 h-11 rounded-xl text-white shrink-0" style={{ background: "var(--accent)" }}><Icon name="database" size={18} /></span>
                <div className="flex-1 min-w-0"><div className="font-medium text-sm">{l.label}</div><div className="text-[11px] opacity-55">{count.toLocaleString("en-IN")} records · {l.module}</div></div>
                <Button variant="soft" icon="chevronRight" onClick={() => VG.goTo(l.module, l.section)}>Open</Button>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  /* ================= Document Template Designer (see doc-template-designer.jsx) ================= */
  const DocumentTemplatesPage = function (props) {
    return VG.DocumentTemplatesPage ? React.createElement(VG.DocumentTemplatesPage, props) : (
      <div className="p-6 text-sm opacity-60">Document Template Designer module not loaded.</div>
    );
  };

  /* ================= Numbering Settings ================= */
  function defaultNumberingSelections(targets, rows) {
    const map = {};
    (targets || []).forEach((t) => {
      let prefix = t.defaultPrefix || "";
      if (t.type === "doc") {
        const ser = (rows || []).find((r) => r.docType === t.docType && r.active !== false);
        if (ser && ser.prefix) prefix = ser.prefix;
      }
      map[t.key] = { selected: false, prefix };
    });
    return map;
  }

  function GlobalNumberingPanel({ roleKey, can, rows, onApplied }) {
    const ne = VG.numberingEngine || {};
    const targets = VG.NUMBERING_APPLY_TARGETS || [];
    const [rule, setRule] = useState(() => {
      const n = store.settings().numbering || {};
      return {
        padding: n.defaultPadding || 5,
        startSequence: 1,
        reset: n.defaultReset || "Yearly",
        yearMode: n.defaultYearMode || "calendar",
        previewSeq: 125,
        branchWise: false,
        manualOverride: false,
      };
    });
    const [selections, setSelections] = useState(() => defaultNumberingSelections(targets, rows));
    const [previewKey, setPreviewKey] = useState("quotation");
    const setRuleField = (k, v) => setRule((p) => ({ ...p, [k]: v }));
    const allSelected = targets.length > 0 && targets.every((t) => selections[t.key] && selections[t.key].selected);
    const someSelected = targets.some((t) => selections[t.key] && selections[t.key].selected);

    useEffect(() => {
      setSelections(defaultNumberingSelections(targets, rows));
    }, [rows.length]);

    function toggleAll(v) {
      setSelections((p) => {
        const next = { ...p };
        targets.forEach((t) => { next[t.key] = { ...(next[t.key] || {}), selected: v }; });
        return next;
      });
    }

    function toggleOne(key, v) {
      setSelections((p) => ({ ...p, [key]: { ...(p[key] || {}), selected: v } }));
    }

    function setPrefix(key, v) {
      const clean = ne.sanitizeAlphaNum ? ne.sanitizeAlphaNum(v) : String(v || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      setSelections((p) => ({ ...p, [key]: { ...(p[key] || {}), prefix: clean } }));
    }

    const previewTarget = targets.find((t) => t.key === previewKey) || targets[0];
    const previewPrefix = previewTarget && selections[previewTarget.key] ? selections[previewTarget.key].prefix : "";
    const livePreview = ne.previewFromRule
      ? ne.previewFromRule(previewPrefix || previewTarget?.defaultPrefix || "QT", rule, today())
      : "";

    const selectedPreviews = targets
      .filter((t) => selections[t.key] && selections[t.key].selected)
      .slice(0, 6)
      .map((t) => {
        const pfx = (selections[t.key] && selections[t.key].prefix) || t.defaultPrefix;
        const sample = ne.previewFromRule ? ne.previewFromRule(pfx, rule, today()) : pfx;
        return { label: t.label, sample };
      });

    async function applySelected() {
      if (!someSelected) return VG.toast("Select at least one module or category", "error");
      if (!can("edit")) return VG.toast("No permission to edit numbering", "error");
      const ok = await VG.confirm({
        title: "Apply numbering changes?",
        message: "New settings apply to selected modules only. Existing document numbers are preserved.",
        confirmLabel: "Apply",
      });
      if (!ok) return;
      if (ne.applyBulkNumbering && store.db) ne.applyBulkNumbering(store.db(), selections, rule);
      store.audit(roleKey, "settings", "numbering", "bulk_apply", "Applied numbering to " + Object.keys(selections).filter((k) => selections[k].selected).length + " modules");
      await store.flushPersist();
      VG.toast("Numbering applied to selected modules");
      if (onApplied) onApplied();
    }

    return (
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-semibold text-sm">Global Numbering Control</h3>
            <p className="text-xs opacity-60 mt-1">Configure format once, then apply to all or selected modules using checkboxes below.</p>
          </div>
          {can("edit") && <Button icon="check" onClick={applySelected} disabled={!someSelected}>Apply to selected</Button>}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Field label="Sequence length (padding)"><Num value={rule.padding} onChange={(v) => setRuleField("padding", v)} /></Field>
          <Field label="Starting sequence"><Num value={rule.startSequence} onChange={(v) => setRuleField("startSequence", v)} /></Field>
          <Field label="Reset cycle"><Select value={rule.reset} onChange={(v) => setRuleField("reset", v)} options={["Never", "Yearly", "Monthly"].map((x) => ({ value: x, label: x }))} /></Field>
          <Field label="Year in number"><Select value={rule.yearMode} onChange={(v) => setRuleField("yearMode", v)} options={[
            { value: "calendar", label: "Calendar year (2026)" },
            { value: "fy", label: "Financial year (2627)" },
            { value: "none", label: "No year segment" },
          ]} /></Field>
          <Field label="Preview module"><Select value={previewKey} onChange={setPreviewKey} options={targets.map((t) => ({ value: t.key, label: t.label }))} /></Field>
          <Field label="Live preview"><Text value={livePreview || "—"} onChange={() => {}} disabled /></Field>
          <div className="lg:col-span-2 flex flex-wrap items-end gap-4 pb-1">
            <Checkbox checked={!!rule.branchWise} onChange={(v) => setRuleField("branchWise", v)} label="Branch-wise series" />
            <Checkbox checked={!!rule.manualOverride} onChange={(v) => setRuleField("manualOverride", v)} label="Allow manual override" />
          </div>
        </div>
        {selectedPreviews.length > 0 && (
          <div className="mb-4 p-3 rounded-xl glass text-xs">
            <div className="font-medium mb-2 opacity-80">Selected module previews</div>
            <div className="flex flex-wrap gap-3">
              {selectedPreviews.map((p) => (
                <span key={p.label}><span className="opacity-60">{p.label}:</span> <span className="font-mono">{p.sample}</span></span>
              ))}
            </div>
          </div>
        )}
        <div className="border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center gap-4 mb-3">
            <Checkbox checked={allSelected} onChange={toggleAll} label="Select All" />
            <span className="text-xs opacity-50">{someSelected ? targets.filter((t) => selections[t.key]?.selected).length + " selected" : "No modules selected"}</span>
            <Button variant="ghost" onClick={() => toggleAll(false)}>Clear selection</Button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {targets.map((t) => (
              <div key={t.key} className="flex items-center gap-2 glass rounded-lg px-3 py-2">
                <Checkbox checked={!!(selections[t.key] && selections[t.key].selected)} onChange={(v) => toggleOne(t.key, v)} label="" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{t.label}</div>
                  <div className="font-mono text-[11px]"><Text value={(selections[t.key] && selections[t.key].prefix) || t.defaultPrefix} onChange={(v) => setPrefix(t.key, v)} placeholder="Prefix" /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  function SeriesForm({ open, onClose, record, roleKey }) {
    const isEdit = !!(record && record.id);
    const ne = VG.numberingEngine || {};
    const [f, setF] = useState(() => ({ useCalendarYear: true, useFy: false, padding: 5, startSequence: 1, reset: "Yearly", branchWise: false, manualOverride: false, active: true, ...record }));
    const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
    useEffect(() => { if (open) setF({ useCalendarYear: true, useFy: false, padding: 5, startSequence: 1, reset: "Yearly", branchWise: false, manualOverride: false, active: true, ...record }); }, [open, record && record.id]);
    const preview = ne.previewSeries ? ne.previewSeries(f, today()) : "";
    function save() {
      if (!f.prefix || !f.docType) return VG.toast("Prefix and document type required", "error");
      const prefix = ne.sanitizeAlphaNum ? ne.sanitizeAlphaNum(f.prefix) : String(f.prefix).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (!prefix) return VG.toast("Prefix must contain letters or numbers only", "error");
      const payload = {
        ...f, prefix, useFy: !!f.useFy, useCalendarYear: f.useFy ? false : f.useCalendarYear !== false,
        branchWise: !!f.branchWise, manualOverride: !!f.manualOverride, active: !!f.active,
        padding: Number(f.padding) || 5, startSequence: Number(f.startSequence) || 1,
      };
      if (isEdit) store.update("numberSeries", f.id, payload, roleKey);
      else store.create("numberSeries", payload, roleKey);
      if (ne.syncCountersFromData && store.db) ne.syncCountersFromData(store.db());
      VG.toast("Numbering series saved");
      onClose();
    }
    const types = VG.ADMIN_DOC_TYPES || [];
    return (
      <Modal open={open} onClose={onClose} title={isEdit ? "Edit Numbering Series" : "New Numbering Series"}
        actions={<Button icon="check" onClick={save}>Save</Button>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Document type" required><Select value={f.docType} onChange={(v) => set("docType", v)} options={types.map((t) => ({ value: t, label: t }))} /></Field>
          <Field label="Prefix" required hint="Letters & numbers only · e.g. QT, SO, INV"><Text value={f.prefix} onChange={(v) => set("prefix", (ne.sanitizeAlphaNum ? ne.sanitizeAlphaNum(v) : v.replace(/[^A-Za-z0-9]/g, "").toUpperCase()))} /></Field>
          <Field label="Sequence padding"><Num value={f.padding} onChange={(v) => set("padding", v)} /></Field>
          <Field label="Starting sequence"><Num value={f.startSequence} onChange={(v) => set("startSequence", v)} /></Field>
          <Field label="Reset cycle"><Select value={f.reset} onChange={(v) => set("reset", v)} options={["Never", "Yearly", "Monthly"].map((x) => ({ value: x, label: x }))} /></Field>
          <Field label="Format preview"><Text value={preview || "—"} onChange={() => {}} disabled /></Field>
          <div className="lg:col-span-3 flex flex-wrap gap-4">
            <Checkbox checked={f.useCalendarYear !== false && !f.useFy} onChange={(v) => { set("useCalendarYear", v); if (v) set("useFy", false); }} label="Include calendar year (e.g. 2026)" />
            <Checkbox checked={!!f.useFy} onChange={(v) => { set("useFy", v); if (v) set("useCalendarYear", false); }} label="Include financial year (e.g. 2627)" />
            <Checkbox checked={!!f.branchWise} onChange={(v) => set("branchWise", v)} label="Branch-wise series" />
            <Checkbox checked={!!f.manualOverride} onChange={(v) => set("manualOverride", v)} label="Allow manual override" />
            <Checkbox checked={f.active !== false} onChange={(v) => set("active", v)} label="Active" />
          </div>
          <p className="lg:col-span-3 text-[11px] opacity-55">Alphanumeric only — no slash, dash, dot or special characters. Example: QT202600001</p>
        </div>
      </Modal>
    );
  }

  function NumberSeriesPage({ roleKey, can }) {
    VG.useDB();
    const ne = VG.numberingEngine || {};
    const [edit, setEdit] = useState(null);
    const [tick, setTick] = useState(0);
    if (ne.ensureDefaultSeries && store.db) ne.ensureDefaultSeries(store.db());
    const rows = store.list("numberSeries");
    const cols = [
      { key: "docType", label: "Document" },
      { key: "prefix", label: "Prefix", render: (r) => <span className="font-mono text-xs">{r.prefix}</span> },
      { key: "preview", label: "Preview", render: (r) => <span className="font-mono text-[10px] opacity-70">{ne.previewSeries ? ne.previewSeries(r, today()) : "—"}</span> },
      { key: "year", label: "Year", render: (r) => r.useFy ? "FY" : r.useCalendarYear !== false ? "Cal" : "—" },
      { key: "padding", label: "Pad" },
      { key: "reset", label: "Reset" },
      { key: "active", label: "Status", render: (r) => <StatusTag value={r.active !== false ? "Active" : "Inactive"} map={{ Active: "#34d399", Inactive: "#94a3b8" }} /> },
    ];
    if (edit) {
      return <SeriesForm open onClose={() => setEdit(null)} record={edit.id ? edit : null} roleKey={roleKey} />;
    }
    return (
      <ListPage title="Numbering Settings" desc="Centrally control prefixes, sequence length, year logic, and numbering patterns — apply globally or per module" onNew={can("add") ? () => setEdit({}) : null} newLabel="Add Series" can={can}>
        <GlobalNumberingPanel roleKey={roleKey} can={can} rows={rows} onApplied={() => setTick((t) => t + 1)} key={tick} />
        <Card className="p-4 mb-4 text-sm opacity-75">
          Alphanumeric only — no slash, dash or special characters. Examples: <span className="font-mono">QT202600125</span>, <span className="font-mono">GLSFG202600001</span> (SKU), <span className="font-mono">PO202600001</span>.
          Historical numbers are preserved; only new transactions use updated rules.
        </Card>
        <RecordTable embedded suppressNew title="Document Numbering Series (per module)" columns={cols} rows={rows} can={can} printTitle="Numbering Settings" searchKeys={["prefix", "docType"]}
          onNew={can("add") ? () => setEdit({}) : null} onEdit={can("edit") ? (r) => setEdit(r) : null}
          onDelete={can("delete") ? async (r) => { if (await VG.confirm({ title: "Delete series?", danger: true, confirmLabel: "Delete" })) { store.remove("numberSeries", r.id, roleKey); VG.toast("Deleted"); } } : null} />
      </ListPage>
    );
  }

  /* ================= Date Format Settings ================= */
  function DateFormatSettingsPage({ roleKey, can }) {
    VG.useDB();
    const df = VG.dateFormat || {};
    const presets = VG.DATE_FORMAT_PRESETS || [];
    const live = store.settings().dateFormat || (df.defaultDateFormatSettings ? df.defaultDateFormatSettings() : {});
    const [s, setS] = useState(() => clone(live));
    const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
    const sampleDate = today();
    const datePreview = df.previewDate ? df.previewDate(s.formatId, sampleDate) : "—";
    const timePreview = df.formatTime ? df.formatTime(new Date(), s) : "—";

    function save() {
      store.saveAdminSettings({ dateFormat: s }, roleKey);
      VG.toast("Date & time format applied globally");
    }

    return (
      <div>
        <PageHead title="Date Format Settings" desc="Control how dates and times appear across dashboards, forms, reports, PDFs, timelines, logs, and all modules.">
          {can("edit") && <Button icon="check" onClick={save}>Save & apply globally</Button>}
        </PageHead>
        <Card className="p-4 mb-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Date format" className="lg:col-span-2">
              <Select value={s.formatId} onChange={(v) => set("formatId", v)} options={presets.map((p) => ({ value: p.id, label: p.label + " · e.g. " + p.example }))} />
            </Field>
            <Field label="Locale"><Select value={s.locale || "en-IN"} onChange={(v) => set("locale", v)} options={[
              { value: "en-IN", label: "English (India)" },
              { value: "en-GB", label: "English (UK)" },
              { value: "en-US", label: "English (US)" },
            ]} /></Field>
            <Field label="Time format"><Select value={s.timeFormat || "12"} onChange={(v) => set("timeFormat", v)} options={[
              { value: "12", label: "12-hour (e.g. 3:45 PM)" },
              { value: "24", label: "24-hour (e.g. 15:45)" },
            ]} /></Field>
            <div className="flex items-end pb-1"><Checkbox checked={!!s.includeWeekday} onChange={(v) => set("includeWeekday", v)} label="Include weekday in dates" /></div>
          </div>
          <div className="mt-4 p-4 rounded-xl glass grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs opacity-60 mb-1">Today (date preview)</div>
              <div className="text-lg font-semibold">{datePreview}</div>
              <div className="text-[11px] opacity-50 mt-1">Sample ISO: {sampleDate}</div>
            </div>
            <div>
              <div className="text-xs opacity-60 mb-1">Time preview</div>
              <div className="text-lg font-semibold">{timePreview}</div>
              <div className="text-[11px] opacity-50 mt-1">Applies to timelines, logs, audit trail, notifications</div>
            </div>
          </div>
          <p className="text-[11px] opacity-55 mt-3">Internal storage remains ISO (YYYY-MM-DD). Display format applies to UI, print, and PDF output.</p>
        </Card>
      </div>
    );
  }

  /* ================= Security ================= */
  function SecurityPage({ roleKey, can, go }) {
    VG.useDB();
    const live = store.settings().security;
    const resetLogs = (store.db().passwordResetLog || []).slice().reverse().slice(0, 50);
    const [s, setS] = useState(() => clone(live));
    const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
    function save() { store.saveAdminSettings({ security: s }, roleKey); VG.toast("Security settings saved"); }
    return (
      <div className="space-y-4">
        <PageHead title="Security Settings" desc="Password policy, session timeout, login lockout, forgot password and audit retention">
          {can("edit") && <Button icon="check" onClick={save}>Save settings</Button>}
        </PageHead>
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Forgot password (self-service)</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <div className="lg:col-span-3">
              <Checkbox checked={s.forgotPasswordEnabled !== false} onChange={(v) => set("forgotPasswordEnabled", v)} label="Enable forgot password on login screen" />
            </div>
            <Field label="OTP expiry (minutes)"><Num value={s.forgotPasswordOtpExpiryMins || 10} onChange={(v) => set("forgotPasswordOtpExpiryMins", v)} min={5} max={60} /></Field>
            <Field label="Reset link expiry (minutes)"><Num value={s.forgotPasswordLinkExpiryMins || 60} onChange={(v) => set("forgotPasswordLinkExpiryMins", v)} min={15} max={1440} /></Field>
            <Field label="Max attempts per hour"><Num value={s.forgotPasswordMaxAttemptsPerHour || 5} onChange={(v) => set("forgotPasswordMaxAttemptsPerHour", v)} min={3} max={20} /></Field>
            <Field label="Delivery method" className="lg:col-span-2">
              <Select
                value={s.forgotPasswordDelivery || "both"}
                onChange={(v) => set("forgotPasswordDelivery", v)}
                options={[
                  { value: "email", label: "Email only" },
                  { value: "sms", label: "SMS only" },
                  { value: "both", label: "Email and SMS" },
                ]}
              />
            </Field>
          </div>
          <p className="text-xs opacity-55">Configure SMTP and SMS under Notifications. Set VERAGLO_DEBUG_RESET=1 on the server to log OTP/link to console during development.</p>
        </Card>
        <Card className="p-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Min password length"><Num value={s.minPasswordLength} onChange={(v) => set("minPasswordLength", v)} /></Field>
            <Field label="Password expiry (days)"><Num value={s.passwordExpiryDays} onChange={(v) => set("passwordExpiryDays", v)} /></Field>
            <Field label="Session timeout (mins)"><Num value={s.sessionTimeoutMins} onChange={(v) => set("sessionTimeoutMins", v)} /></Field>
            <Field label="Max login attempts"><Num value={s.maxLoginAttempts} onChange={(v) => set("maxLoginAttempts", v)} /></Field>
            <Field label="Lockout duration (mins)"><Num value={s.lockoutMins} onChange={(v) => set("lockoutMins", v)} /></Field>
            <Field label="Audit retention (days)"><Num value={s.auditRetentionDays} onChange={(v) => set("auditRetentionDays", v)} /></Field>
            <Field label="Allowed IPs" hint="Comma-separated, if restriction enabled" className="lg:col-span-2"><Text value={s.allowedIps} onChange={(v) => set("allowedIps", v)} /></Field>
            <div className="lg:col-span-3 flex flex-wrap gap-4">
              <Checkbox checked={!!s.twoFactorRequired} onChange={(v) => set("twoFactorRequired", v)} label="Two-factor required (all users)" />
              <Checkbox checked={!!s.loginOtp} onChange={(v) => set("loginOtp", v)} label="Email OTP on login" />
              <Checkbox checked={!!s.ipRestriction} onChange={(v) => set("ipRestriction", v)} label="IP restriction" />
              <Checkbox checked={!!s.exportRestricted} onChange={(v) => set("exportRestricted", v)} label="Restrict data export" />
              <Checkbox checked={!!s.forceLogoutAll} onChange={(v) => set("forceLogoutAll", v)} label="Force logout all sessions on save" />
            </div>
          </div>
        </Card>
        <RecordTable
          title="Password reset activity log"
          columns={[
            { key: "ts", label: "When", render: (r) => fmtTime(r.ts) },
            { key: "action", label: "Action", render: (r) => r.action || "—" },
            { key: "email", label: "User", render: (r) => r.email || "—" },
            { key: "ip", label: "IP", render: (r) => (r.ip || "—").slice(0, 24) },
            { key: "detail", label: "Detail", render: (r) => (r.detail || "").slice(0, 60) },
          ]}
          rows={resetLogs}
          can={can}
          empty="No password reset activity yet"
          searchKeys={["email", "action", "detail"]}
        />
        <Card className="p-4 flex flex-wrap items-center gap-3">
          <Icon name="users" size={20} style={{ color: "var(--accent)" }} />
          <span className="text-sm flex-1">Manual password reset: open Admin → Users, edit a user, and set a new password.</span>
          {go && <Button variant="soft" onClick={() => go("users")}>Open Users</Button>}
        </Card>
        {can("edit") && (
          <Card className="p-4 border border-amber-500/25">
            <h3 className="text-sm font-semibold mb-2">Emergency auth repair</h3>
            <p className="text-xs opacity-65 mb-3">Rebuild user index, validate roles, reconnect data path metadata, and reload from server. Use when login users appear missing but company data still exists.</p>
            <Button variant="soft" icon="shield" onClick={async () => {
              const res = await store.repairAuthState(roleKey);
              VG.toast(res.message || "Auth repair completed", res.ok ? "success" : "error");
            }}>Run auth repair</Button>
          </Card>
        )}
      </div>
    );
  }

  /* ================= Notifications ================= */
  function NotificationsPage({ roleKey, can }) {
    VG.useDB();
    const live = store.settings().notifications;
    const [n, setN] = useState(() => clone(live));
    const set = (k, v) => setN((p) => ({ ...p, [k]: v }));
    function save() { store.saveAdminSettings({ notifications: n }, roleKey); VG.toast("Notification settings saved"); }
    return (
      <div>
        <PageHead title="Notifications" desc="SMTP configuration and system alert toggles">
          {can("edit") && <Button icon="check" onClick={save}>Save settings</Button>}
        </PageHead>
        <Card className="p-4 mb-4">
          <h3 className="text-sm font-semibold mb-3">SMTP (outbound email)</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="SMTP host"><Text value={n.smtpHost} onChange={(v) => set("smtpHost", v)} placeholder="smtp.gmail.com" /></Field>
            <Field label="Port"><Num value={n.smtpPort} onChange={(v) => set("smtpPort", v)} /></Field>
            <Field label="From address"><Text value={n.smtpFrom} onChange={(v) => set("smtpFrom", v)} /></Field>
            <Field label="Username"><Text value={n.smtpUser} onChange={(v) => set("smtpUser", v)} /></Field>
            <Field label="Password"><Text type="password" value={n.smtpPass} onChange={(v) => set("smtpPass", v)} /></Field>
            <div className="flex items-end pb-1"><Checkbox checked={n.smtpTls !== false} onChange={(v) => set("smtpTls", v)} label="Use TLS" /></div>
          </div>
        </Card>
        <Card className="p-4 mb-4">
          <h3 className="text-sm font-semibold mb-3">SMS (password reset & alerts)</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-3"><Checkbox checked={!!n.smsEnabled} onChange={(v) => set("smsEnabled", v)} label="Enable SMS delivery" /></div>
            <Field label="Provider"><Select value={n.smsProvider || "Twilio"} onChange={(v) => set("smsProvider", v)} options={["Twilio", "MSG91", "AWS SNS", "Other"].map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="API key"><Text type="password" value={n.smsApiKey || ""} onChange={(v) => set("smsApiKey", v)} /></Field>
            <Field label="Sender ID"><Text value={n.smsFrom || ""} onChange={(v) => set("smsFrom", v)} placeholder="VERAGLO" /></Field>
          </div>
          <p className="text-xs opacity-55 mt-2">SMS requires provider configuration. Without it, reset codes are sent by email when SMTP is configured.</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Alert toggles</h3>
          <div className="flex flex-wrap gap-4">
            <Checkbox checked={!!n.lowStockAlert} onChange={(v) => set("lowStockAlert", v)} label="Low stock alerts" />
            <Checkbox checked={!!n.approvalAlerts} onChange={(v) => set("approvalAlerts", v)} label="Pending approval alerts" />
            <Checkbox checked={!!n.paymentReminders} onChange={(v) => set("paymentReminders", v)} label="Payment reminders" />
            <Checkbox checked={!!n.followupReminders} onChange={(v) => set("followupReminders", v)} label="CRM follow-up reminders" />
          </div>
        </Card>
      </div>
    );
  }

  /* ================= UI Settings / Typography ================= */
  function UiSettingsPage({ roleKey, can }) {
    VG.useDB();
    const liveTheme = store.settings().theme || {};
    const live = store.settings().typography || (VG.defaultTypography ? VG.defaultTypography(liveTheme) : {});
    const [t, setT] = useState(() => clone(live));
    const set = (k, v) => setT((p) => ({ ...p, [k]: v }));
    const fontOpts = VG.typographyFontOptions ? VG.typographyFontOptions() : [];
    const sizeOpts = VG.typographySizeOptions ? VG.typographySizeOptions() : ["small", "medium", "large"].map((x) => ({ value: x, label: x.charAt(0).toUpperCase() + x.slice(1) }));
    const preset = (VG.FONT_PRESETS && VG.FONT_PRESETS[t.fontFamily]) || (VG.FONT_PRESETS && VG.FONT_PRESETS.inter) || { label: "Inter" };
    const colorDefaults = VG.TYPOGRAPHY_COLOR_DEFAULTS || {};

    useEffect(() => {
      if (VG.applyTypography) VG.applyTypography(t, liveTheme);
    }, [t]);

    function save() {
      const themePatch = { ...liveTheme, fontSize: t.bodySize || t.headingSize || liveTheme.fontSize || "medium" };
      store.saveAdminSettings({ typography: t, theme: themePatch }, roleKey);
      VG.toast("Typography applied across the ERP");
    }

    function resetDefaults() {
      const d = VG.defaultTypography ? VG.defaultTypography(liveTheme) : live;
      setT(d);
      if (VG.applyTypography) VG.applyTypography(d, liveTheme);
      VG.toast("Reset to Inter defaults — save to persist");
    }

    return (
      <div>
        <PageHead
          title="Typography"
          desc="Centrally control font family, sizes, weight, line height, and text colors for dashboards, menus, sidebar, forms, tables, buttons, reports, popups, PDFs, and every module screen."
        >
          <div className="flex gap-2 flex-wrap">
            {can("edit") && <Button variant="soft" onClick={resetDefaults}>Reset defaults</Button>}
            {can("edit") && <Button icon="check" onClick={save}>Save & apply globally</Button>}
          </div>
        </PageHead>

        <Card className="p-4 mb-4">
          <h3 className="text-sm font-semibold mb-1">Font family</h3>
          <p className="text-xs opacity-60 mb-3">Inter is recommended — clean, balanced, and comfortable for long office sessions.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Screen font"><Select value={t.fontFamily || "inter"} onChange={(v) => set("fontFamily", v)} options={fontOpts} /></Field>
            <Field label="PDF / print font"><Select value={t.pdfFontFamily || "inter"} onChange={(v) => set("pdfFontFamily", v)} options={fontOpts} /></Field>
            <Field label="Font weight"><Select value={t.fontWeight || "medium"} onChange={(v) => set("fontWeight", v)} options={[{ value: "normal", label: "Normal" }, { value: "medium", label: "Medium (recommended)" }]} /></Field>
          </div>
        </Card>

        <Card className="p-4 mb-4">
          <h3 className="text-sm font-semibold mb-3">Font sizes</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Body / general text" hint="Dashboards, menus, default screen text"><Select value={t.bodySize || "medium"} onChange={(v) => set("bodySize", v)} options={sizeOpts} /></Field>
            <Field label="Heading size"><Select value={t.headingSize || "medium"} onChange={(v) => set("headingSize", v)} options={sizeOpts} /></Field>
            <Field label="Table size"><Select value={t.tableSize || "medium"} onChange={(v) => set("tableSize", v)} options={sizeOpts} /></Field>
            <Field label="Button size"><Select value={t.buttonSize || "medium"} onChange={(v) => set("buttonSize", v)} options={sizeOpts} /></Field>
            <Field label="Form input size"><Select value={t.formSize || "medium"} onChange={(v) => set("formSize", v)} options={sizeOpts} /></Field>
            <Field label="Form label size"><Select value={t.labelSize || "medium"} onChange={(v) => set("labelSize", v)} options={sizeOpts} /></Field>
          </div>
        </Card>

        <Card className="p-4 mb-4">
          <h3 className="text-sm font-semibold mb-3">Spacing & density</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Line height"><Select value={t.lineSpacing || "comfortable"} onChange={(v) => set("lineSpacing", v)} options={[{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Comfortable" }, { value: "relaxed", label: "Relaxed" }]} /></Field>
            <Field label="Density"><Select value={t.density || "comfortable"} onChange={(v) => set("density", v)} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact mode" }]} /></Field>
          </div>
        </Card>

        <Card className="p-4 mb-4">
          <h3 className="text-sm font-semibold mb-1">Text colors</h3>
          <p className="text-xs opacity-60 mb-3">Body, heading, and muted tones for light and dark workspace modes.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Light mode — body text"><Text type="color" value={t.lightTextColor || colorDefaults.lightTextColor || "#334155"} onChange={(v) => set("lightTextColor", v)} /></Field>
            <Field label="Light mode — headings"><Text type="color" value={t.lightHeadingColor || colorDefaults.lightHeadingColor || "#0f172a"} onChange={(v) => set("lightHeadingColor", v)} /></Field>
            <Field label="Light mode — muted text"><Text type="color" value={t.lightMutedColor || colorDefaults.lightMutedColor || "#64748b"} onChange={(v) => set("lightMutedColor", v)} /></Field>
            <Field label="Dark mode — body text"><Text type="color" value={t.darkTextColor || colorDefaults.darkTextColor || "#e2e8f0"} onChange={(v) => set("darkTextColor", v)} /></Field>
            <Field label="Dark mode — headings"><Text type="color" value={t.darkHeadingColor || colorDefaults.darkHeadingColor || "#f8fafc"} onChange={(v) => set("darkHeadingColor", v)} /></Field>
            <Field label="Dark mode — muted text"><Text type="color" value={t.darkMutedColor || colorDefaults.darkMutedColor || "#94a3b8"} onChange={(v) => set("darkMutedColor", v)} /></Field>
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-[11px] uppercase opacity-55 mb-3">Live preview · {preset.label}</div>
          <div className="space-y-4">
            <div>
              <div className="vg-h1 font-semibold">Sales Dashboard</div>
              <div className="text-sm opacity-70 mt-1">Quotation pipeline, orders, and tax invoices</div>
            </div>
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <table className="w-full text-left vg-tbl">
                <thead><tr className="border-b border-white/10"><th className="px-3 py-2">Quotation #</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
                <tbody>
                  <tr className="border-b border-white/5"><td className="px-3 py-2 vg-doc-no">QTN-2026-0142</td><td className="px-3 py-2">Acme Industries Pvt Ltd</td><td className="px-3 py-2 text-right vg-doc-no">₹ 12,45,680.00</td></tr>
                  <tr><td className="px-3 py-2 vg-doc-no">QTN-2026-0143</td><td className="px-3 py-2">Bharat Engineering Works</td><td className="px-3 py-2 text-right vg-doc-no">₹ 8,92,150.00</td></tr>
                </tbody>
              </table>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="vg-label block mb-1">Customer name</label><input className="vg-input w-full rounded-xl px-3 py-2" readOnly value="Sample customer" /></div>
              <div><label className="vg-label block mb-1">Document number</label><input className="vg-input w-full rounded-xl px-3 py-2 vg-doc-no" readOnly value="INV-2026-0088" /></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button icon="check">Primary action</Button>
              <Button variant="soft">Secondary</Button>
            </div>
            <p className="text-xs opacity-50">Changes apply instantly while you edit. Save to persist across all users and modules. Quotation numbers use tabular numerals in the same font family.</p>
          </div>
        </Card>
      </div>
    );
  }

  const WEATHER_CONDITIONS = [
    { id: "clear", label: "Clear / sunny" },
    { id: "cloudy", label: "Cloudy" },
    { id: "rain", label: "Rain" },
    { id: "fog", label: "Fog / haze" },
    { id: "storm", label: "Storm / thunder" },
    { id: "night", label: "Night" },
    { id: "snow", label: "Snow" },
  ];

  /* ================= Login weather theme ================= */
  function WeatherLoginPage({ roleKey, can }) {
    VG.useDB();
    const live = store.settings().weatherLogin || {};
    const companyCity = (store.company() || {}).city
      || ((store.company() || {}).registeredAddress || {}).city
      || ((store.company() || {}).officeAddress || {}).city
      || "";
    const [w, setW] = useState(() => clone({ ...store.settings().weatherLogin }));
    const [preview, setPreview] = useState(null);
    const [previewBusy, setPreviewBusy] = useState(false);
    const set = (k, v) => setW((p) => ({ ...p, [k]: v }));
    const setWall = (cond, v) => setW((p) => ({ ...p, wallpapers: { ...(p.wallpapers || {}), [cond]: v } }));

    async function fetchPreview() {
      if (previewBusy) return;
      setPreviewBusy(true);
      try {
        const params = new URLSearchParams({ source: w.locationSource || "company" });
        if (w.locationSource === "manual" && w.manualCity) params.set("city", w.manualCity);
        const res = await fetch((VG.apiBase || "") + "/api/weather/current?" + params.toString());
        const data = await res.json();
        setPreview(data);
        if (data.ok) VG.toast("Weather preview loaded");
        else VG.toast(data.error || "Weather unavailable", "warn");
      } catch (e) {
        VG.toast("Could not reach weather service", "error");
      } finally {
        setPreviewBusy(false);
      }
    }

    function save() {
      store.saveAdminSettings({ weatherLogin: w }, roleKey);
      try { localStorage.removeItem("veraglo-weather-login-cache"); } catch (e) {}
      VG.toast("Login weather settings saved");
    }

    const stock = (VG.WEATHER_LOGIN_WALLPAPERS || {});

    return (
      <div className="space-y-4">
        <PageHead
          title="Login Weather Theme"
          desc="Dynamic login wallpaper and colours from live weather. Loads asynchronously — never blocks sign-in."
        >
          {can("edit") && (
            <div className="flex flex-wrap gap-2">
              <Button variant="soft" icon="refresh" onClick={fetchPreview} disabled={previewBusy || !w.enabled}>
                {previewBusy ? "Loading…" : "Preview weather"}
              </Button>
              <Button icon="check" onClick={save}>Save settings</Button>
            </div>
          )}
        </PageHead>

        <Card className="p-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="sm:col-span-2 lg:col-span-3">
              <Checkbox checked={w.enabled !== false} onChange={(v) => set("enabled", v)} label="Enable weather-based login theme" />
            </div>
            <Field label="Location source" hint="Where to fetch weather for the login page">
              <Select
                value={w.locationSource || "company"}
                onChange={(v) => set("locationSource", v)}
                options={[
                  { value: "company", label: "Company city (Admin → Company Profile)" },
                  { value: "browser", label: "Visitor current location (browser permission)" },
                  { value: "manual", label: "Manual city" },
                ]}
              />
            </Field>
            {w.locationSource === "manual" ? (
              <Field label="Manual city" hint="City name for geocoding, e.g. Mumbai, India">
                <Text value={w.manualCity || ""} onChange={(v) => set("manualCity", v)} placeholder="Mumbai" />
              </Field>
            ) : (
              <Field label="Company city (reference)" hint={companyCity ? "Using: " + companyCity : "Set city in Company Profile → Addresses"}>
                <Text value={companyCity || "— not set —"} readOnly />
              </Field>
            )}
            <Field label="Refresh interval (minutes)" hint="Client cache + background refresh">
              <Num value={w.refreshIntervalMins || 30} onChange={(v) => set("refreshIntervalMins", Math.max(5, Number(v) || 30))} min={5} max={180} />
            </Field>
            <Field label="OpenWeather API key (optional)" hint="Open-Meteo is used by default (no key). Reserve for future fallback." className="lg:col-span-2">
              <Text type="password" value={w.openWeatherApiKey || ""} onChange={(v) => set("openWeatherApiKey", v)} placeholder="Leave blank to use Open-Meteo" />
            </Field>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-1">Wallpapers</h3>
          <p className="text-xs opacity-60 mb-4">Upload an image or paste a URL/path. Empty fields use curated stock photos per condition.</p>
          <Field label="Default fallback wallpaper" className="mb-4">
            <div className="grid sm:grid-cols-2 gap-3 items-start">
              <Text value={w.defaultWallpaper || "assets/happy-employees.png"} onChange={(v) => set("defaultWallpaper", v)} />
              <ImageUploadField label="Upload default" value={w.defaultWallpaper} onChange={(v) => set("defaultWallpaper", v)} />
            </div>
          </Field>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {WEATHER_CONDITIONS.map((c) => (
              <div key={c.id} className="rounded-xl border border-white/10 p-3 space-y-2">
                <div className="text-xs font-medium">{c.label}</div>
                <div className="vg-weather-preview">
                  <img src={(w.wallpapers || {})[c.id] || stock[c.id] || w.defaultWallpaper} alt="" />
                </div>
                <Text
                  value={((w.wallpapers || {})[c.id]) || ""}
                  onChange={(v) => setWall(c.id, v)}
                  placeholder={stock[c.id] ? "Stock photo (leave empty)" : "URL or assets/…"}
                />
                <ImageUploadField label={"Upload " + c.label} value={(w.wallpapers || {})[c.id]} onChange={(v) => setWall(c.id, v)} />
              </div>
            ))}
          </div>
        </Card>

        {preview && (
          <Card className="p-4">
            <div className="text-[11px] uppercase tracking-wider opacity-55 mb-2">Live preview</div>
            {preview.ok ? (
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="text-2xl font-display font-bold">{preview.temperature}°C</span>
                <div>
                  <div className="font-medium">{preview.location}</div>
                  <div className="text-xs opacity-70">{preview.conditionLabel} · Theme: {preview.condition}</div>
                  {preview.forecastSummary && <div className="text-xs opacity-55 mt-1">{preview.forecastSummary}</div>}
                </div>
              </div>
            ) : (
              <p className="text-sm opacity-60">{preview.error || preview.reason || "Weather unavailable"}</p>
            )}
          </Card>
        )}
      </div>
    );
  }

  /* ================= Theme ================= */
  function ThemePage({ roleKey, can }) {
    VG.useDB();
    const live = store.settings().theme;
    const [t, setT] = useState(() => clone(live));
    const set = (k, v) => setT((p) => ({ ...p, [k]: v }));
    function save() {
      store.saveAdminSettings({ theme: t }, roleKey);
      if (t.accent && typeof document !== "undefined") document.documentElement.style.setProperty("--accent", t.accent);
      const root = document.documentElement;
      if (t.defaultMode === "dark") {
        root.classList.add("dark");
        root.classList.remove("light");
      } else if (t.defaultMode === "light") {
        root.classList.remove("dark");
        root.classList.add("light");
      }
      if (VG.applyTypography) VG.applyTypography(store.settings().typography, t);
      VG.toast("Theme applied");
    }
    return (
      <div>
        <PageHead title="Theme & Appearance" desc="Accent colour and default light/dark mode. Font family, sizes, and text colors are managed in Typography (UI Settings).">
          {can("edit") && <Button icon="check" onClick={save}>Save & apply</Button>}
        </PageHead>
        <Card className="p-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Accent colour"><Text type="color" value={t.accent || "#6366f1"} onChange={(v) => set("accent", v)} /></Field>
            <Field label="Default mode"><Select value={t.defaultMode || "dark"} onChange={(v) => set("defaultMode", v)} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} /></Field>
            <Field label="Font size (legacy)"><Select value={t.fontSize || "medium"} onChange={(v) => set("fontSize", v)} options={["small", "medium", "large"].map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Login background" className="lg:col-span-2"><Text value={t.loginBackground} onChange={(v) => set("loginBackground", v)} /></Field>
            <div className="flex items-end pb-1"><Checkbox checked={!!t.sidebarCollapsed} onChange={(v) => set("sidebarCollapsed", v)} label="Sidebar collapsed by default" /></div>
          </div>
          <div className="mt-4 p-4 rounded-xl glass flex items-center gap-4">
            <span className="w-12 h-12 rounded-xl" style={{ background: t.accent || "#6366f1" }} />
            <div><div className="font-medium text-sm">Preview</div><div className="text-xs opacity-60">Accent applies to buttons, pills and highlights via --accent CSS variable</div></div>
          </div>
        </Card>
      </div>
    );
  }

  /* ================= Import / Export ================= */
  function ImportExportPage({ roleKey, can }) {
    VG.useDB();
    function exportMasters() {
      const json = store.exportMasterSnapshot();
      download("veraglo-masters-" + stamp() + ".json", json);
      VG.toast("Master data exported");
    }
    function onImport(e) {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      e.target.value = "";
      const reader = new FileReader();
      reader.onload = () => {
        const res = store.importMasterSnapshot(reader.result, roleKey);
        if (!res.ok) {
          VG.toast("Import completed with " + res.errors.length + " error(s) — duplicates blocked", "warn");
          console.warn("[Import errors]", res.errors);
        } else VG.toast("Master data imported successfully");
      };
      reader.onerror = () => VG.toast("Could not read file", "error");
      reader.readAsText(f);
    }
    return (
      <div>
        <PageHead title="Import / Export" desc="Master data snapshot for migration, backup or integration" />
        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="p-4">
            <Icon name="download" size={22} style={{ color: "var(--accent)" }} />
            <h3 className="font-semibold mt-2 mb-1">Export master data</h3>
            <p className="text-xs opacity-60 mb-3">Customers, suppliers, manufacturers, items, locations, employees, units, taxes and terms as JSON. Item SKUs follow Admin SKU Numbering rules; blank SKU on import is auto-generated; duplicates are rejected.</p>
            {can("export") && <Button icon="download" onClick={exportMasters}>Download JSON</Button>}
          </Card>
          <Card className="p-4">
            <Icon name="upload" size={22} style={{ color: "var(--accent)" }} />
            <h3 className="font-semibold mt-2 mb-1">Import master data</h3>
            <p className="text-xs opacity-60 mb-3">Upload a Veraglo master JSON export. Leave item SKU blank to auto-generate; duplicate SKUs in file or database are rejected with an error report in the console.</p>
            <label className="inline-flex items-center gap-2 rounded-xl text-sm font-medium px-3.5 py-2 text-white cursor-pointer" style={{ background: "var(--accent)" }}>
              <Icon name="upload" size={16} /> Choose file…
              <input type="file" accept="application/json,.json" className="hidden" onChange={onImport} />
            </label>
          </Card>
        </div>
      </div>
    );
  }

  /* ================= Admin Reports ================= */
  function AdminReportsPage({ roleKey, can, go }) {
    VG.useDB();
    const loginRows = store.list("loginLog").slice().reverse();
    const roles = store.listRoles();
    const mods = VG.ADMIN_MODULES || [];
    const cols = VG.ADMIN_PERM_COLS || [];
    function printLoginReport() {
      const body = loginRows.map((l) => `<tr><td>${fmtTime(l.ts)}</td><td>${l.email || l.roleKey}</td><td>${l.success ? "Success" : "Failed"}</td><td>${l.ip || "—"}</td><td>${(l.device || "").slice(0, 60)}</td></tr>`).join("");
      printDocument({ title: "Login Activity Report", subtitle: store.company().name, inner: `<table class="vg-tbl"><thead><tr><th>When</th><th>User</th><th>Result</th><th>IP</th><th>Device</th></tr></thead><tbody>${body || "<tr><td colspan=5>No data</td></tr>"}</tbody></table>` }, "preview");
    }
    function printPermMatrix() {
      const head = "<th>Role</th>" + mods.slice(0, 12).map((m) => "<th>" + m.label + "</th>").join("");
      const body = roles.map((r) => {
        const cells = mods.slice(0, 12).map((m) => {
          const ok = store.canAction(r.key, "view", m.id);
          return "<td>" + (ok ? "✓" : "—") + "</td>";
        }).join("");
        return "<tr><td>" + r.label + "</td>" + cells + "</tr>";
      }).join("");
      printDocument({ title: "Permission Matrix", subtitle: store.company().name + " · view access sample", inner: `<table class="vg-tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` }, "preview");
    }
    function downloadFeatures(fmt) {
      const cat = VG.erpFeaturesCatalog;
      if (!cat) return VG.toast("Features catalog not loaded", "error");
      const n = fmt === "csv" ? cat.downloadFeaturesCsv() : cat.downloadFeaturesMarkdown();
      VG.toast("Downloaded " + n + " feature rows (" + (fmt === "csv" ? "CSV" : "Markdown") + ")");
    }
    const reports = [
      { n: "ERP Module Features (CSV)", d: "Download module-wise features list for all 15 modules", icon: "download", action: () => downloadFeatures("csv") },
      { n: "ERP Module Features (Markdown)", d: "Download features list as .md document", icon: "folder", action: () => downloadFeatures("md") },
      { n: "Audit Trail", d: "Full system change log", icon: "activity", action: () => go("audit") },
      { n: "Login Activity Report", d: loginRows.length + " events · includes IP when recorded", icon: "users", action: printLoginReport },
      { n: "Permission Matrix", d: "Roles × modules view access", icon: "lock", action: printPermMatrix },
      { n: "Licensing & data path reports", d: "Active/expired licenses, devices, migrations", icon: "shield", action: () => go("licReports") },
    ];
    return (
      <div>
        <PageHead title="Admin Reports" desc="Audit, login activity and permission matrix for compliance" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {reports.map((r) => (
            <Card key={r.n} className="p-4 flex items-center gap-4">
              <span className="grid place-items-center w-11 h-11 rounded-xl text-white shrink-0" style={{ background: "var(--accent)" }}><Icon name={r.icon} size={18} /></span>
              <div className="flex-1 min-w-0"><div className="font-medium text-sm">{r.n}</div><div className="text-[11px] opacity-55">{r.d}</div></div>
              <Button variant="soft" icon="eye" onClick={r.action}>Open</Button>
            </Card>
          ))}
        </div>
        <RecordTable title="Recent login activity" columns={[
          { key: "ts", label: "When", render: (r) => fmtTime(r.ts) },
          { key: "email", label: "User", render: (r) => r.email || r.roleKey },
          { key: "success", label: "Result", render: (r) => <StatusTag value={r.success ? "Success" : "Failed"} map={{ Success: "#34d399", Failed: "#ef4444" }} /> },
          { key: "ip", label: "IP", render: (r) => r.ip || "—" },
        ]} rows={loginRows.slice(0, 50)} can={can} printTitle="Login Report" searchKeys={["email", "roleKey", "ip"]} />
      </div>
    );
  }

  /* ================= System Health ================= */
  function SystemHealthPage({ roleKey, can, go }) {
    VG.useDB();
    const stats = store.adminStats();
    const live = store.settings().backup;
    const due = isDue(live);
    const failed = store.list("loginLog").filter((l) => !l.success).slice().reverse().slice(0, 20);
    const kpis = [
      { label: "Database size", value: fmtBytes(stats.storageBytes), icon: "database" },
      { label: "Indexed records", value: stats.records.toLocaleString("en-IN"), icon: "box" },
      { label: "Backup status", value: due ? "Due" : "OK", icon: "shield", warn: due },
      { label: "Active sessions", value: "—", icon: "users", hint: "Requires server session store" },
    ];
    return (
      <div className="space-y-4">
        <PageHead title="System Health" desc="Storage, backup status, sessions and error indicators" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k, i) => (
            <Card key={k.label} className="p-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-60"><Icon name={k.icon} size={14} />{k.label}</div>
              <div className="mt-1.5 text-2xl font-semibold font-display" style={k.warn ? { color: "#f59e0b" } : undefined}>{k.value}</div>
              {k.hint && <div className="text-[10px] opacity-45 mt-1">{k.hint}</div>}
            </Card>
          ))}
        </div>
        <Card className="p-4 flex flex-wrap items-center gap-3" style={due ? { borderColor: "#f59e0b" } : undefined}>
          <Icon name={due ? "alert" : "shield"} size={20} style={{ color: due ? "#f59e0b" : "#22c55e" }} />
          <span className="text-sm flex-1">Storage: {fmtBytes(stats.storageBytes)} in localStorage · Last backup: {fmtTime(live.lastBackupAt)}</span>
          <Button variant="soft" onClick={() => go("backup")}>Backup settings</Button>
        </Card>
        <RecordTable title="Failed login log (error indicator)" columns={[
          { key: "ts", label: "When", render: (r) => fmtTime(r.ts) },
          { key: "email", label: "Email", render: (r) => r.email || "—" },
          { key: "roleKey", label: "Role", render: (r) => roleLabel(r.roleKey) },
          { key: "ip", label: "IP", render: (r) => r.ip || "—" },
          { key: "device", label: "Device", render: (r) => (r.device || "").slice(0, 50) },
        ]} rows={failed} can={can} printTitle="Failed Logins" searchKeys={["email", "ip"]} empty="No failed login attempts — good sign!" />
      </div>
    );
  }

  const SECTIONS = [
    { id: "dashboard", label: "Dashboard", icon: "grid", group: "Overview" },
    { id: "health", label: "System Health", icon: "activity", group: "Overview" },
    { id: "reports", label: "Reports", icon: "chart", group: "Reports" },
    { id: "company", label: "Company Profile", icon: "settings", group: "Organization" },
    { id: "locations", label: "Locations", icon: "grid", group: "Organization" },
    { id: "users", label: "Users", icon: "users", group: "Access" },
    { id: "roles", label: "Roles", icon: "shield", group: "Access" },
    { id: "permissions", label: "Permissions", icon: "lock", group: "Access" },
    { id: "fieldPermissions", label: "Field Permissions", icon: "edit", group: "Access" },
    { id: "approvals", label: "Approvals", icon: "check", group: "Workflow" },
    { id: "masterData", label: "Master Data", icon: "database", group: "Masters" },
    { id: "importExport", label: "Import / Export", icon: "download", group: "Masters" },
    { id: "templates", label: "Document Templates", icon: "folder", group: "Documents" },
    { id: "numberSeries", label: "Numbering Settings", icon: "grid", group: "Documents" },
    { id: "skuNumbering", label: "SKU Numbering", icon: "box", group: "Masters" },
    { id: "security", label: "Security", icon: "shield", group: "System" },
    { id: "dateFormat", label: "Date Format", icon: "calendar", group: "System" },
    { id: "notifications", label: "Notifications", icon: "bell", group: "System" },
    { id: "uiSettings", label: "Typography", icon: "settings", group: "System" },
    { id: "theme", label: "Theme", icon: "sparkle", group: "System" },
    { id: "weatherLogin", label: "Login Weather", icon: "cloud", group: "System" },
    { id: "backup", label: "Backup & Restore", icon: "cloud", group: "System" },
    { id: "audit", label: "Audit Trail", icon: "activity", group: "System" },
    { id: "licDashboard", label: "License Dashboard", icon: "shield", group: "Licensing & Data" },
    { id: "licGenerate", label: "Generate License", icon: "plus", group: "Licensing & Data" },
    { id: "licActivate", label: "Activate License", icon: "check", group: "Licensing & Data" },
    { id: "licRenew", label: "Renew License", icon: "refresh", group: "Licensing & Data" },
    { id: "licTransfer", label: "Transfer License", icon: "truck", group: "Licensing & Data" },
    { id: "licDeactivate", label: "Deactivate License", icon: "x", group: "Licensing & Data" },
    { id: "licHistory", label: "License History", icon: "activity", group: "Licensing & Data" },
    { id: "dataPath", label: "Data Path", icon: "folder", group: "Licensing & Data" },
    { id: "connectedUsers", label: "Connected Users", icon: "users", group: "Licensing & Data" },
    { id: "licReports", label: "License Reports", icon: "chart", group: "Licensing & Data" },
  ];
  if (VG.registerModuleSections) VG.registerModuleSections("admin", SECTIONS);
  const licensePages = VG.AdminLicensePages || {};
  const PAGES = {
    dashboard: AdminDashboard, health: SystemHealthPage, reports: AdminReportsPage,
    company: CompanyProfile, locations: LocationsPage, users: UsersPage, roles: RolesPage,
    permissions: PermissionsPage, fieldPermissions: FieldPermissionsPage, approvals: ApprovalsPage,
    masterData: MasterDataPage, importExport: ImportExportPage, templates: DocumentTemplatesPage,
    numberSeries: NumberSeriesPage, skuNumbering: (p) => VG.SkuNumberingPage ? React.createElement(VG.SkuNumberingPage, p) : null,
    security: SecurityPage, dateFormat: DateFormatSettingsPage, notifications: NotificationsPage,
    uiSettings: UiSettingsPage, theme: ThemePage, weatherLogin: WeatherLoginPage, backup: BackupRestore, audit: AuditTrail,
    licDashboard: licensePages.licDashboard, licGenerate: licensePages.licGenerate,
    licActivate: licensePages.licActivate, licRenew: licensePages.licRenew,
    licTransfer: licensePages.licTransfer, licDeactivate: licensePages.licDeactivate,
    licHistory: licensePages.licHistory, dataPath: licensePages.dataPath,
    connectedUsers: licensePages.connectedUsers, licReports: licensePages.licReports,
  };

  VG.modules = VG.modules || {};
  VG.modules.admin = function AdminModule({ mod, roleKey }) {
    const can = (a) => VG.can(roleKey, a, "admin");
    const [section, setSection] = useState(() => VG.consumeSection("admin", "dashboard"));
    if (!VG.can(roleKey, "view", "admin")) {
      return (
        <Card className="p-10 text-center">
          <Icon name="lock" size={32} className="mx-auto opacity-40 mb-3" />
          <h2 className="font-semibold">Access denied</h2>
          <p className="text-sm opacity-60 mt-2">Your role does not include Admin Control Panel access. Contact an administrator.</p>
        </Card>
      );
    }
    const Page = PAGES[section] || AdminDashboard;
    const actions = [
      { label: "Add user", icon: "users", onClick: () => setSection("users") },
      { label: "Backup", icon: "cloud", primary: true, onClick: () => setSection("backup") },
      { label: "Audit trail", icon: "activity", onClick: () => setSection("audit") },
    ];
    return (
      <VG.ModuleScaffold mod={mod} sections={SECTIONS} section={section} setSection={setSection} actions={actions} roleKey={roleKey}>
        <Page roleKey={roleKey} can={can} go={setSection} mod={mod} />
      </VG.ModuleScaffold>
    );
  };
})(window.VG);
