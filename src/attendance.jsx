/* Veraglo ERP — Attendance (functional, feeds HR payroll). */
(function (VG) {
  const { useState } = React;
  const ui = VG.ui, fx = VG.fx, store = VG.store, today = VG.fmt.todayISO;
  const { Icon, Button, Pill, Card } = ui;
  const { Field, Text, Num, Modal, RecordTable, PageHead, ListPage, StatusTag } = fx;

  const empName = (id) => (store.get("employees", id) || {}).name || "—";
  const monthNow = () => today().slice(0, 7);

  function ensureRecords(month, roleKey) {
    store.list("employees").filter((e) => e.status === "Active").forEach((emp) => {
      if (!store.list("attendanceRecords").some((a) => a.employeeId === emp.id && a.month === month)) {
        store.create("attendanceRecords", { employeeId: emp.id, month, present: 22, leave: 0, absent: 0, otHours: 0, locked: false }, roleKey);
      }
    });
  }

  function AttendanceEditModal({ record, onClose, roleKey }) {
    const [f, setF] = useState({ ...record });
    function save() {
      if (f.locked) return VG.toast("Month locked", "error");
      store.update("attendanceRecords", f.id, { present: f.present, leave: f.leave, absent: f.absent, otHours: f.otHours }, roleKey);
      VG.toast("Attendance updated");
      onClose(true);
    }
    return (
      <Modal open onClose={() => onClose(false)} title={empName(f.employeeId)} subtitle={f.month}
        actions={<Button icon="check" onClick={save}>Save</Button>}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Present days"><Num value={f.present} onChange={(v) => setF((p) => ({ ...p, present: v }))} /></Field>
          <Field label="Leave days"><Num value={f.leave} onChange={(v) => setF((p) => ({ ...p, leave: v }))} /></Field>
          <Field label="Absent days"><Num value={f.absent} onChange={(v) => setF((p) => ({ ...p, absent: v }))} /></Field>
          <Field label="OT hours"><Num value={f.otHours} onChange={(v) => setF((p) => ({ ...p, otHours: v }))} /></Field>
        </div>
        <p className="text-xs opacity-60 mt-3">Approved leave requests auto-increment leave days. Payroll uses these figures for deductions.</p>
      </Modal>
    );
  }

  function Dashboard(props) {
    return VG.ModuleDashboard ? <VG.ModuleDashboard modId="attendance" {...props} /> : null;
  }

  function RegisterPage({ roleKey, can }) {
    VG.useDB();
    const [month, setMonth] = useState(monthNow());
    const [edit, setEdit] = useState(null);
    React.useEffect(() => { ensureRecords(month, roleKey); }, [month]);
    const rows = store.list("attendanceRecords").filter((a) => a.month === month);
    if (edit) {
      return <AttendanceEditModal record={edit} roleKey={roleKey} onClose={() => setEdit(null)} />;
    }
    return (
      <ListPage title="Monthly register" can={can}>
        <div className="flex flex-wrap gap-3 mb-4 items-end">
          <Field label="Month (YYYY-MM)"><Text value={month} onChange={setMonth} /></Field>
          {can("edit") && <Button variant="soft" onClick={() => { store.lockAttendanceMonth(month, roleKey); VG.toast("Locked " + month); }}>Lock for payroll</Button>}
        </div>
        <RecordTable embedded suppressNew title={"Attendance List · " + month} columns={[
          { key: "employeeId", label: "Employee", render: (r) => empName(r.employeeId), csv: (r) => empName(r.employeeId) },
          { key: "present", label: "Present" },
          { key: "leave", label: "Leave" },
          { key: "absent", label: "Absent" },
          { key: "otHours", label: "OT" },
          { key: "locked", label: "Status", render: (r) => <StatusTag value={r.locked ? "Locked" : "Open"} map={{ Locked: "#94a3b8", Open: "#34d399" }} /> },
        ]} rows={rows} can={can} printTitle="Attendance" onEdit={can("edit") ? (r) => !r.locked && setEdit(r) : null} />
      </ListPage>
    );
  }

  const SECTIONS = [
    { id: "dashboard", label: "Dashboard", icon: "chart", group: "Overview" },
    { id: "register", label: "Monthly Register", icon: "clock", group: "Attendance" },
    { id: "reports", label: "Reports", icon: "chart", group: "Reports" },
  ];
  if (VG.registerModuleSections) VG.registerModuleSections("attendance", SECTIONS);
  const PAGES = { dashboard: Dashboard, register: RegisterPage, reports: () => <PageHead title="Reports" desc="Use monthly register print/export" /> };

  VG.modules = VG.modules || {};
  VG.modules.attendance = function AttendanceModule({ mod, roleKey }) {
    const can = (a) => VG.can(roleKey, a);
    const [section, setSection] = useState(() => VG.consumeSection("attendance", "dashboard"));
    const Page = PAGES[section] || Dashboard;
    return (
      <VG.ModuleScaffold mod={mod} sections={SECTIONS} section={section} setSection={setSection} roleKey={roleKey}
        actions={[{ label: "Monthly register", icon: "clock", primary: true, onClick: () => setSection("register") }]}>
        <Page roleKey={roleKey} can={can} go={setSection} mod={mod} />
      </VG.ModuleScaffold>
    );
  };
})(window.VG);
