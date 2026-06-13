/* Veraglo ERP — Admin: Licensing & Data Path Management */
(function (VG) {
  const { useState, useEffect, useMemo } = React;
  const ui = VG.ui, fx = VG.fx, store = VG.store;
  const { Icon, Button, Pill, Card } = ui;
  const { Field, Text, Area, Num, DateF, Select, Checkbox, RecordTable, PageHead, ListPage, StatusTag, Modal, printDocument } = fx;
  const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
  const LIC_STATUS = { Active: "#34d399", Expired: "#ef4444", Suspended: "#f59e0b", Trial: "#6366f1", Blocked: "#94a3b8" };

  const MODULE_OPTS = () => (VG.MODULES || []).map((m) => ({ value: m.id, label: m.name }));

  function ActivationForm({ onDone, compact }) {
    const [serial, setSerial] = useState("");
    const [code, setCode] = useState("");
    const [offline, setOffline] = useState(false);
    const [reqCode, setReqCode] = useState("");
    const [machineId] = useState(() => VG.getMachineId());
    function activate() {
      const res = store.activateLicense(serial.trim(), code.trim(), "installer", offline ? { offlineResponse: true } : null);
      if (!res.ok) return VG.toast(res.reason, res.expired ? "warn" : "error");
      VG.toast("License activated successfully", "success");
      onDone && onDone(true);
    }
    function genRequest() {
      setReqCode(VG.generateOfflineRequestCode(serial.trim(), machineId));
    }
    function applyOffline() {
      const lic = store.list("licenseKeys").find((l) => l.serial.toUpperCase() === serial.trim().toUpperCase());
      if (!lic) return VG.toast("Enter valid serial first", "error");
      const expected = VG.generateOfflineResponseCode(serial.trim(), lic, machineId);
      if (code.trim().toUpperCase().replace(/\s/g, "") !== expected.replace(/\s/g, "")) {
        return VG.toast("Offline response code does not match — generate from Admin with request code", "error");
      }
      activate();
    }
    return (
      <div className={compact ? "space-y-3" : "space-y-4 max-w-lg"}>
        <Card className="p-4 text-sm">
          <div className="text-[11px] uppercase opacity-55 mb-1">This device</div>
          <div className="font-mono text-xs">{machineId}</div>
          <div className="text-xs opacity-60 mt-1">{VG.getMachineLabel()}</div>
        </Card>
        <Field label="Serial number" required><Text value={serial} onChange={setSerial} placeholder="VG-XXXX-XXXX-XXXX" /></Field>
        <Field label={offline ? "Offline response code" : "License activation code"} required>
          <Text value={code} onChange={setCode} placeholder={offline ? "VGO-XXXX-..." : "VGL-XXXX-..."} />
        </Field>
        <Checkbox checked={offline} onChange={setOffline} label="Offline activation (no internet)" />
        {offline && (
          <div className="glass rounded-xl p-3 space-y-2 text-sm">
            <Button variant="soft" className="!py-1.5" onClick={genRequest} disabled={!serial.trim()}>Generate request code</Button>
            {reqCode && <div className="font-mono text-xs break-all">Request: <b>{reqCode}</b></div>}
            <p className="text-xs opacity-55">Send request code to your vendor. Enter the response code they provide, then activate.</p>
            <Button variant="soft" onClick={applyOffline}>Validate offline response</Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button icon="check" onClick={activate}>Activate ERP</Button>
          {!compact && <Button variant="soft" onClick={() => onDone && onDone(false)}>Back</Button>}
        </div>
      </div>
    );
  }

  function LicenseDashboard({ roleKey, can, go }) {
    VG.useDB();
    const lic = store.isLicensed();
    const keys = store.list("licenseKeys");
    const acts = store.list("licenseActivations").filter((a) => a.status === "Active");
    const dp = store.settings().dataPath || {};
    const active = keys.filter((l) => l.status === "Active" && !store.isLicenseExpired(l));
    return (
      <div className="space-y-4">
        <PageHead title="License Dashboard" desc="Activation status, devices and data path overview" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4"><div className="text-[11px] uppercase opacity-55">This installation</div>
            <div className="mt-1 font-semibold">{lic.ok ? (lic.trial ? "Trial" : "Licensed") : "Not active"}</div>
            {!lic.ok && <p className="text-xs text-rose-400 mt-1">{lic.reason}</p>}
          </Card>
          <Card className="p-4"><div className="text-[11px] uppercase opacity-55">License keys</div><div className="mt-1 text-2xl font-display font-semibold">{keys.length}</div></Card>
          <Card className="p-4"><div className="text-[11px] uppercase opacity-55">Active devices</div><div className="mt-1 text-2xl font-display font-semibold">{acts.length}</div></Card>
          <Card className="p-4"><div className="text-[11px] uppercase opacity-55">Valid licenses</div><div className="mt-1 text-2xl font-display font-semibold">{active.length}</div></Card>
        </div>
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">Data path</h3>
          <p className="text-sm font-mono opacity-80 break-all">{dp.current || "Browser local storage / PostgreSQL API"}</p>
          <p className="text-xs opacity-55 mt-2">Type: {dp.type || "local"} · Read: {dp.readOk ? "OK" : "—"} · Write: {dp.writeOk ? "OK" : "—"}</p>
          {can("settings") && <Button variant="soft" className="mt-3" onClick={() => go("dataPath")}>Manage data path</Button>}
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button icon="plus" onClick={() => go("licGenerate")}>Generate license</Button>
          <Button variant="soft" onClick={() => go("licActivate")}>Activate on device</Button>
          <Button variant="soft" onClick={() => go("connectedUsers")}>Connected users</Button>
          <Button variant="soft" onClick={() => go("licReports")}>Reports</Button>
        </div>
      </div>
    );
  }

  function LicenseGeneratePage({ roleKey, can }) {
    VG.useDB();
    const [show, setShow] = useState(false);
    const [created, setCreated] = useState(null);
    const [f, setF] = useState({
      companyName: store.company().name, licenseType: "Annual", maxUsers: 10, maxDevices: 2,
      startDate: VG.fmt.todayISO(), expiryDate: "", modules: ["all"], status: "Active", remarks: "",
    });
    const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
    const modIds = VG.MODULES ? VG.MODULES.map((m) => m.id) : [];
    const [selMods, setSelMods] = useState(["all"]);
    function toggleMod(id) {
      if (id === "all") setSelMods(["all"]);
      else setSelMods((prev) => {
        const next = prev.filter((x) => x !== "all");
        return next.includes(id) ? next.filter((x) => x !== id) : next.concat(id);
      });
    }
    function generate() {
      const rec = store.generateLicense({ ...f, modules: selMods[0] === "all" ? ["all"] : selMods }, roleKey);
      setCreated(rec);
      setShow(true);
      VG.toast("License " + rec.serial + " generated");
    }
    const rows = store.list("licenseKeys").slice().reverse();
    return (
      <div className="space-y-4">
        <PageHead title="Generate License" desc="Create serial number + activation code for customer installation" />
        <Card className="p-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Company name"><Text value={f.companyName} onChange={(v) => set("companyName", v)} /></Field>
            <Field label="License type"><Select value={f.licenseType} onChange={(v) => set("licenseType", v)} options={(VG.LICENSE_TYPES || []).map((t) => ({ value: t, label: t }))} /></Field>
            <Field label="Status"><Select value={f.status} onChange={(v) => set("status", v)} options={(VG.LICENSE_STATUSES || []).map((t) => ({ value: t, label: t }))} /></Field>
            <Field label="Max users"><Num value={f.maxUsers} onChange={(v) => set("maxUsers", v)} /></Field>
            <Field label="Max devices"><Num value={f.maxDevices} onChange={(v) => set("maxDevices", v)} /></Field>
            <Field label="Start date"><DateF value={f.startDate} onChange={(v) => set("startDate", v)} /></Field>
            <Field label="Expiry date" hint="Leave blank for Lifetime"><DateF value={f.expiryDate} onChange={(v) => set("expiryDate", v)} /></Field>
            <Field label="Remarks" className="sm:col-span-2"><Text value={f.remarks} onChange={(v) => set("remarks", v)} /></Field>
          </div>
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase opacity-55 mb-2">Licensed modules</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => toggleMod("all")} className={"px-2.5 py-1 rounded-lg text-xs " + (selMods[0] === "all" ? "bg-white/15" : "glass")}>All modules</button>
              {modIds.map((id) => (
                <button key={id} type="button" onClick={() => toggleMod(id)} className={"px-2.5 py-1 rounded-lg text-xs " + (selMods.includes(id) ? "bg-white/15" : "glass")}>{id}</button>
              ))}
            </div>
          </div>
          {can("add") && <Button className="mt-4" icon="plus" onClick={generate}>Generate serial & code</Button>}
        </Card>
        {show && created && (
          <Modal open onClose={() => setShow(false)} title="License created" subtitle="Provide these to the customer — treat activation code as confidential">
            <div className="space-y-3 text-sm font-mono">
              <div><span className="opacity-55">Serial:</span> <b className="text-base">{created.serial}</b></div>
              <div><span className="opacity-55">Activation code:</span> <b className="text-base text-emerald-400">{created.activationCode}</b></div>
              <div className="text-xs opacity-60 font-sans">{created.licenseType} · {created.maxUsers} users · {created.maxDevices} devices · expires {created.expiryDate || "never"}</div>
            </div>
          </Modal>
        )}
        <RecordTable title="Issued licenses" columns={[
          { key: "serial", label: "Serial", render: (r) => <span className="font-mono text-xs">{r.serial}</span> },
          { key: "companyName", label: "Company" },
          { key: "licenseType", label: "Type" },
          { key: "expiryDate", label: "Expires", render: (r) => r.expiryDate || "Lifetime" },
          { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={LIC_STATUS} /> },
        ]} rows={rows} can={can} searchKeys={["serial", "companyName"]} onView={(r) => { setCreated(r); setShow(true); }} />
      </div>
    );
  }

  function LicenseActivatePage({ roleKey }) {
    return (
      <div className="space-y-4">
        <PageHead title="Activate License" desc="Enter serial + code on this computer after installation" />
        <ActivationForm onDone={() => VG.toast("Reload app to apply", "info")} />
      </div>
    );
  }

  function LicenseRenewPage({ roleKey, can }) {
    VG.useDB();
    const [id, setId] = useState("");
    const [expiry, setExpiry] = useState("");
    const lic = id ? store.get("licenseKeys", id) : null;
    function renew() {
      if (!id) return;
      const res = store.renewLicense(id, { expiryDate: expiry, status: "Active" }, roleKey);
      if (!res.ok) return VG.toast(res.reason, "error");
      VG.toast("Renewed — new code: " + res.activationCode, "success");
    }
    return (
      <div className="space-y-4">
        <PageHead title="Renew License" desc="Extend expiry and regenerate activation code" />
        <Card className="p-4 grid sm:grid-cols-2 gap-3 max-w-xl">
          <Field label="License">
            <Select value={id} onChange={setId} options={[{ value: "", label: "Select…" }].concat(store.list("licenseKeys").map((l) => ({ value: l.id, label: l.serial + " · " + l.companyName })))} />
          </Field>
          <Field label="New expiry date"><DateF value={expiry} onChange={setExpiry} /></Field>
          {lic && <p className="sm:col-span-2 text-xs opacity-60">Current: {lic.expiryDate || "Lifetime"} · {lic.licenseType}</p>}
          <Button icon="refresh" onClick={renew} disabled={!can("edit")}>Renew license</Button>
        </Card>
      </div>
    );
  }

  function LicenseTransferPage({ roleKey, can }) {
    VG.useDB();
    const [actId, setActId] = useState("");
    const [newMid, setNewMid] = useState("");
    const [serial, setSerial] = useState("");
    const [code, setCode] = useState("");
    const acts = store.list("licenseActivations").filter((a) => a.status === "Active");
    function transfer() {
      const res = store.transferLicense(actId, newMid.trim() || VG.getMachineId(), serial, code, roleKey);
      if (!res.ok) return VG.toast(res.reason, "error");
      VG.toast("License transferred to new device", "success");
    }
    return (
      <div className="space-y-4">
        <PageHead title="Transfer License" desc="Move activation from old laptop to new laptop" />
        <Card className="p-4 grid sm:grid-cols-2 gap-3 max-w-2xl">
          <Field label="Current activation (old device)" className="sm:col-span-2">
            <Select value={actId} onChange={setActId} options={[{ value: "", label: "Select…" }].concat(acts.map((a) => ({
              value: a.id, label: a.serial + " · " + a.machineId + " · " + a.machineName,
            })))} />
          </Field>
          <Field label="New machine ID"><Text value={newMid} onChange={setNewMid} placeholder={VG.getMachineId()} /></Field>
          <Field label="Serial"><Text value={serial} onChange={setSerial} /></Field>
          <Field label="License code" className="sm:col-span-2"><Text value={code} onChange={setCode} /></Field>
          <Button icon="truck" onClick={transfer} disabled={!can("edit")}>Transfer license</Button>
        </Card>
      </div>
    );
  }

  function LicenseDeactivatePage({ roleKey, can }) {
    VG.useDB();
    const acts = store.list("licenseActivations").filter((a) => a.status === "Active");
    return (
      <ListPage title="Deactivate License" desc="Release a device slot or revoke installation" can={can}>
        <RecordTable embedded suppressNew title="Activation List" columns={[
          { key: "serial", label: "Serial" },
          { key: "machineId", label: "Machine ID", render: (r) => <span className="font-mono text-xs">{r.machineId}</span> },
          { key: "machineName", label: "Device" },
          { key: "activatedAt", label: "Activated", render: (r) => fmtTime(r.activatedAt) },
          { key: "act", label: "", render: (r) => can("delete") && (
            <Button variant="soft" className="!py-1 text-xs" onClick={async () => {
              if (await VG.confirm({ title: "Deactivate " + r.machineId + "?", danger: true, confirmLabel: "Deactivate" })) {
                store.deactivateLicense(r.id, roleKey, "Admin deactivation");
                VG.toast("Deactivated");
              }
            }}>Deactivate</Button>
          ) },
        ]} rows={acts} can={can} empty="No active device activations" />
      </ListPage>
    );
  }

  function LicenseHistoryPage() {
    VG.useDB();
    const rows = store.list("licenseHistory").slice().reverse();
    return (
      <ListPage title="License History" desc="Validation, activation, transfer and renewal audit">
        <RecordTable embedded suppressNew title="Event List" columns={[
          { key: "ts", label: "When", render: (r) => fmtTime(r.ts) },
          { key: "action", label: "Action", render: (r) => <Pill color="#6366f1">{r.action}</Pill> },
          { key: "serial", label: "Serial" },
          { key: "machineId", label: "Machine" },
          { key: "by", label: "By" },
          { key: "details", label: "Details" },
        ]} rows={rows} searchKeys={["serial", "action", "details"]} />
      </ListPage>
    );
  }

  function DataPathPage({ roleKey, can }) {
    VG.useDB();
    const dp = store.settings().dataPath || {};
    const [path, setPath] = useState(dp.current || "");
    const [type, setType] = useState(dp.type || "local");
    const [migrate, setMigrate] = useState(false);
    const [backupFirst, setBackupFirst] = useState(true);
    const [valid, setValid] = useState(null);
    const superOk = store.isSuperAdmin(roleKey);
    async function validate() {
      const v = await store.validateDataPath(path, roleKey);
      setValid(v);
      VG.toast(v.writeOk ? "Path looks writable" : "Could not validate write access", v.writeOk ? "success" : "warn");
    }
    async function apply() {
      if (!superOk) return VG.toast("Only Admin / Super Admin can change data path", "error");
      const ok = await VG.confirm({
        title: "Change company data path?",
        danger: true,
        confirmLabel: "Change path",
        message: "Previous: " + (dp.current || "default") + "\nNew: " + path + (migrate ? "\n\nData will be copied/migrated." : ""),
      });
      if (!ok) return;
      const res = await store.setDataPath(path, { migrateCopy: migrate, backupFirst, encryptAtRest: true, type }, roleKey);
      if (!res.ok) return VG.toast(res.reason, "error");
      VG.toast("Data path updated");
    }
    async function exportToPath() {
      await store.saveLocalSnapshot("Manual backup before path change", roleKey);
      const blob = JSON.stringify(store.db(), null, 2);
      const enc = dp.encryptAtRest && VG.encryptStateBlob ? VG.encryptStateBlob(blob) : blob;
      download("veraglo-company-data" + (dp.encryptAtRest ? ".vge" : ".json"), enc);
      VG.toast("Downloaded company data file — copy to your shared folder", "success");
    }
    function download(filename, text) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "application/octet-stream" }));
      a.download = filename; a.click();
      URL.revokeObjectURL(a.href);
    }
    const hist = store.list("dataPathHistory").slice().reverse();
    return (
      <div className="space-y-4">
        <PageHead title="Data Path Settings" desc="Tally-style shared folder for multi-user company data (network or local)" />
        {!superOk && <Card className="p-4 border border-amber-500/40 text-sm">Only <b>Admin</b> or <b>Super Admin</b> can change the data path.</Card>}
        <Card className="p-4 space-y-3">
          <div className="text-sm"><span className="opacity-55">Current path:</span><div className="font-mono text-xs mt-1 break-all">{dp.current || "(browser / PostgreSQL default)"}</div></div>
          <Field label="New data path" hint="e.g. C:\\Veraglo\\Data or \\\\SERVER\\Veraglo\\Company">
            <Text value={path} onChange={setPath} disabled={!superOk} />
          </Field>
          <Field label="Path type"><Select value={type} onChange={setType} options={[{ value: "local", label: "Local folder" }, { value: "network", label: "Network / shared folder" }]} /></Field>
          <div className="flex flex-wrap gap-3">
            <Checkbox checked={backupFirst} onChange={setBackupFirst} label="Automatic backup before change" />
            <Checkbox checked={migrate} onChange={setMigrate} label="Copy/migrate existing data to new path" />
            <Checkbox checked={dp.encryptAtRest !== false} onChange={() => {}} label="Encrypt data files at rest (export)" disabled />
          </div>
          {valid && <p className="text-xs opacity-60">Validation: read {valid.readOk ? "OK" : "fail"} · write {valid.writeOk ? "OK" : "fail"}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="soft" onClick={validate}>Validate access</Button>
            <Button variant="soft" icon="download" onClick={exportToPath}>Export / backup data file</Button>
            <Button icon="folder" onClick={apply} disabled={!superOk}>Apply data path</Button>
          </div>
          <p className="text-xs opacity-50">In browser mode, data syncs via localStorage or PostgreSQL API. Export the company file and place it on your shared drive; point all workstations to the same folder path and use the same database server for true multi-user access.</p>
        </Card>
        <RecordTable title="Data path change history" columns={[
          { key: "ts", label: "When", render: (r) => fmtTime(r.ts) },
          { key: "by", label: "By" },
          { key: "from", label: "Previous path" },
          { key: "to", label: "New path" },
          { key: "migrated", label: "Migrated", render: (r) => r.migrated ? "Yes" : "—" },
        ]} rows={hist} empty="No path changes yet" />
      </div>
    );
  }

  function ConnectedUsersPage({ roleKey }) {
    VG.useDB();
    useEffect(() => {
      store.pruneSessions();
      const t = setInterval(() => store.pruneSessions(), 30000);
      return () => clearInterval(t);
    }, []);
    const rows = store.list("connectedSessions").slice().sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
    const dp = store.settings().dataPath || {};
    return (
      <ListPage title="Connected Users" desc="Sessions using the same company data path (heartbeat every 60s)">
        <Card className="p-3 mb-4 text-sm opacity-80">Shared data path: <span className="font-mono">{dp.current || "local"}</span></Card>
        <RecordTable embedded suppressNew title="Session List" columns={[
          { key: "email", label: "User" },
          { key: "roleKey", label: "Role" },
          { key: "moduleId", label: "Module" },
          { key: "machineId", label: "Machine", render: (r) => <span className="font-mono text-[10px]">{r.machineId}</span> },
          { key: "lastSeenAt", label: "Last seen", render: (r) => fmtTime(r.lastSeenAt) },
          { key: "revoke", label: "", render: (r) => (
            <Button variant="ghost" className="!py-1" onClick={() => { store.revokeSession(r.sessionId, roleKey); VG.toast("Session revoked"); }}>Revoke</Button>
          ) },
        ]} rows={rows} empty="No other users connected — open ERP on another PC with same data path" />
      </ListPage>
    );
  }

  function LicenseReportsPage({ roleKey, can }) {
    VG.useDB();
    function printReport(title, rows, cols) {
      const head = cols.map((c) => "<th>" + c.label + "</th>").join("");
      const body = rows.map((r) => "<tr>" + cols.map((c) => "<td>" + (c.render ? c.render(r) : (r[c.key] || "")) + "</td>").join("") + "</tr>").join("");
      printDocument({ title, subtitle: store.company().name, inner: `<table class="vg-tbl"><thead><tr>${head}</tr></thead><tbody>${body || "<tr><td colspan=6>No data</td></tr>"}</tbody></table>` }, "preview");
    }
    const reports = [
      { n: "Active licenses", t: "active", cols: [{ key: "serial", label: "Serial" }, { key: "companyName", label: "Company" }, { key: "licenseType", label: "Type" }] },
      { n: "Expired licenses", t: "expired", cols: [{ key: "serial", label: "Serial" }, { key: "expiryDate", label: "Expired" }] },
      { n: "Device activations", t: "devices", cols: [{ key: "serial", label: "Serial" }, { key: "machineId", label: "Machine" }, { key: "machineName", label: "Device" }] },
      { n: "License transfer history", t: "transfers", cols: [{ key: "action", label: "Action" }, { key: "serial", label: "Serial" }, { key: "details", label: "Details" }] },
      { n: "Data path change history", t: "datapath", cols: [{ key: "from", label: "From" }, { key: "to", label: "To" }, { key: "by", label: "By" }] },
      { n: "Connected users", t: "connected", cols: [{ key: "email", label: "User" }, { key: "roleKey", label: "Role" }, { key: "machineId", label: "Machine" }] },
      { n: "Backup / migration log", t: "migrations", cols: [{ key: "from", label: "From" }, { key: "to", label: "To" }, { key: "status", label: "Status" }] },
    ];
    return (
      <div>
        <PageHead title="Licensing & Data Reports" />
        <div className="grid sm:grid-cols-2 gap-4">
          {reports.map((r) => (
            <Card key={r.t} className="p-4 flex items-center gap-3">
              <Icon name="chart" size={20} style={{ color: "var(--accent)" }} />
              <div className="flex-1 text-sm font-medium">{r.n}</div>
              <Button variant="soft" icon="eye" onClick={() => printReport(r.n, store.licenseReport(r.t), r.cols)}>Open</Button>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  VG.AdminLicensePages = {
    licDashboard: LicenseDashboard,
    licGenerate: LicenseGeneratePage,
    licActivate: LicenseActivatePage,
    licRenew: LicenseRenewPage,
    licTransfer: LicenseTransferPage,
    licDeactivate: LicenseDeactivatePage,
    licHistory: LicenseHistoryPage,
    dataPath: DataPathPage,
    connectedUsers: ConnectedUsersPage,
    licReports: LicenseReportsPage,
  };
  VG.ActivationForm = ActivationForm;
})(window.VG);
