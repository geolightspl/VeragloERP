/* Veraglo ERP — Enterprise HR & Payroll (Leave → Attendance → Statutory Payroll → Salary slip). */
(function (VG) {
  const { useState, useMemo } = React;
  const ui = VG.ui, fx = VG.fx, store = VG.store, inr = VG.fmt.inr, today = VG.fmt.todayISO;
  const { Icon, Button, Pill, Card } = ui;
  const { Field, Text, Area, Num, DateF, Select, MasterSelect, InternalScreen, RecordTable, PageHead, ListPage, StatusTag, printDocument, DocActions } = fx;

  const empName = (id) => (store.get("employees", id) || {}).name || "—";
  const LV_STATUS = { Pending: "#f59e0b", Approved: "#34d399", Rejected: "#ef4444" };
  const LEAVE_TYPES = ["Casual Leave", "Sick Leave", "Earned Leave", "Half Day", "Comp Off", "Maternity Leave", "Paternity Leave"];
  const monthNow = () => today().slice(0, 7);
  const DEPTS = ["Production", "Quality", "Sales", "Accounts", "HR", "Dispatch", "Stores", "Maintenance", "Admin"];

  function slipDoc(slip) {
    const co = store.company();
    const inner = `
      <div style="text-align:center;margin-bottom:16px"><b>${co.name || co.legalName}</b><br>${co.address || ""}</div>
      <div class="vg-cols">
        <div class="vg-card"><b>Employee</b>${slip.employeeName}<br>${slip.employeeCode}<br>${slip.department} · ${slip.designation}</div>
        <div class="vg-card"><b>Pay period</b>${slip.month}<br>Run: ${slip.payrollNo || "—"}</div>
        <div class="vg-card"><b>Attendance</b>Present: ${slip.present}<br>Leave: ${slip.leaveDays}<br>Absent: ${slip.absent}<br>OT: ${slip.otHours || 0} hrs</div>
      </div>
      <table class="vg-tbl"><thead><tr><th>Earnings</th><th class="vg-right">Amount</th><th>Deductions</th><th class="vg-right">Amount</th></tr></thead>
        <tbody>
          <tr><td>Basic</td><td class="vg-right">${inr(slip.basic)}</td><td>PF (Employee)</td><td class="vg-right">${inr(slip.pf || 0)}</td></tr>
          <tr><td>HRA</td><td class="vg-right">${inr(slip.hra)}</td><td>ESI</td><td class="vg-right">${inr(slip.esi || 0)}</td></tr>
          <tr><td>Conveyance</td><td class="vg-right">${inr(slip.conveyance || 0)}</td><td>Professional Tax</td><td class="vg-right">${inr(slip.pt || 0)}</td></tr>
          <tr><td>Other / Bonus</td><td class="vg-right">${inr((slip.other || 0) + (slip.bonus || 0))}</td><td>TDS</td><td class="vg-right">${inr(slip.tds || 0)}</td></tr>
          <tr><td>Overtime</td><td class="vg-right">${inr(slip.overtime || 0)}</td><td>Leave / Absent</td><td class="vg-right">${inr((slip.leaveDeduction || 0) + (slip.absentDeduction || 0))}</td></tr>
        </tbody></table>
      <div class="vg-totals"><div><span>Gross earnings</span><span>${inr(slip.gross)}</span></div><div><span>Total deductions</span><span>${inr(slip.deductions)}</span></div><div class="grand"><span>Net pay</span><span>${inr(slip.net)}</span></div></div>
      <div class="vg-sign"><div>This is a computer-generated salary slip.</div><div>For ${co.name}</div><div><b>${co.signatoryName || "Authorized Signatory"}</b><br>${co.signatoryTitle || ""}</div></div>`;
    return { title: "Salary Slip", subtitle: slip.employeeName + " · " + slip.month, inner };
  }

  function empDoc(emp) {
    return {
      title: "Employee Profile", subtitle: emp.code,
      inner: `<div class="vg-cols"><div class="vg-card"><b>${emp.name}</b>${emp.department}<br>${emp.designation}<br>DOJ: ${emp.doj}</div>
        <div class="vg-card">CTC: ${inr(emp.ctc)}<br>PAN: ${emp.pan || "—"}<br>UAN: ${emp.uan || "—"}</div>
        <div class="vg-card">Mobile: ${emp.mobile || "—"}<br>Email: ${emp.email || "—"}</div></div>`,
    };
  }

  function Dashboard(props) {
    return VG.ModuleDashboard ? <VG.ModuleDashboard modId="hr" {...props} /> : null;
  }

  /* ================= Employee Master ================= */
  function EmployeeFormScreen({ record, onClose, roleKey, can }) {
    const isEdit = !!(record && record.id);
    const [f, setF] = useState(() => record || { status: "Active", doj: today(), salaryStructure: { basicPct: 50, hraPct: 25, conveyance: 1600, pfApplicable: true, esiApplicable: true, ptApplicable: true, tdsApplicable: false }, leaveBalance: { casual: 12, sick: 12, earned: 15, compOff: 0 } });
    const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
    const setSS = (k, v) => setF((p) => ({ ...p, salaryStructure: { ...(p.salaryStructure || {}), [k]: v } }));
    function save() {
      if (!f.name) return VG.toast("Name required", "error");
      if (isEdit) { store.update("employees", f.id, f, roleKey); VG.toast("Employee updated"); }
      else {
        const code = store.nextEmployeeCode ? store.nextEmployeeCode() : (store.nextMasterCode ? store.nextMasterCode("EMP") : ("EMP" + String(store.list("employees").length + 1).padStart(6, "0")));
        store.create("employees", { ...f, code }, roleKey);
        VG.toast("Employee " + code + " added");
      }
      onClose();
    }
    return (
      <InternalScreen onBack={onClose} backLabel="Back to employees" title={isEdit ? "Edit " + f.name : "New Employee"} subtitle="Complete employee master · statutory · salary structure"
        actions={<Button icon="check" onClick={save}>Save employee</Button>}>
        <div className="space-y-6">
          <section><h3 className="text-sm font-semibold mb-3 opacity-80">Personal & employment</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label="Full name" required><Text value={f.name} onChange={(v) => set("name", v)} /></Field>
              <Field label="Employee ID"><Text value={f.code || (store.nextEmployeeCode && store.nextEmployeeCode())} onChange={(v) => set("code", v)} /></Field>
              <Field label="Department"><Select value={f.department} onChange={(v) => set("department", v)} options={DEPTS.map((x) => ({ value: x, label: x }))} /></Field>
              <Field label="Designation"><Text value={f.designation} onChange={(v) => set("designation", v)} /></Field>
              <Field label="Reporting manager"><MasterSelect collection="employees" value={f.reportingManagerId} onChange={(v) => set("reportingManagerId", v)} actorRole={roleKey} can={can("add")} /></Field>
              <Field label="Joining date"><DateF value={f.doj} onChange={(v) => set("doj", v)} /></Field>
              <Field label="Date of birth"><DateF value={f.dob} onChange={(v) => set("dob", v)} /></Field>
              <Field label="Gender"><Select value={f.gender} onChange={(v) => set("gender", v)} options={["", "Male", "Female", "Other"].map((x) => ({ value: x, label: x || "Select" }))} /></Field>
              <Field label="Blood group"><Select value={f.bloodGroup} onChange={(v) => set("bloodGroup", v)} options={["", "A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map((x) => ({ value: x, label: x || "Select" }))} /></Field>
              <Field label="Mobile"><Text value={f.mobile} onChange={(v) => set("mobile", v)} /></Field>
              <Field label="Email"><Text value={f.email} onChange={(v) => set("email", v)} /></Field>
              <Field label="Status"><Select value={f.status} onChange={(v) => set("status", v)} options={["Active", "Inactive", "On Notice", "Exited"].map((x) => ({ value: x, label: x }))} /></Field>
              <Field label="Address" className="sm:col-span-2 lg:col-span-3"><Area value={f.address} onChange={(v) => set("address", v)} rows={2} /></Field>
              <Field label="Emergency contact"><Text value={f.emergencyContact} onChange={(v) => set("emergencyContact", v)} /></Field>
            </div>
          </section>
          <section><h3 className="text-sm font-semibold mb-3 opacity-80">Statutory & bank</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label="Aadhaar"><Text value={f.aadhaar} onChange={(v) => set("aadhaar", v)} /></Field>
              <Field label="PAN"><Text value={f.pan} onChange={(v) => set("pan", v)} /></Field>
              <Field label="UAN (PF)"><Text value={f.uan} onChange={(v) => set("uan", v)} /></Field>
              <Field label="ESI number"><Text value={f.esiNo} onChange={(v) => set("esiNo", v)} /></Field>
              <Field label="Bank name"><Text value={f.bankName} onChange={(v) => set("bankName", v)} /></Field>
              <Field label="Account no."><Text value={f.bankAccount} onChange={(v) => set("bankAccount", v)} /></Field>
              <Field label="IFSC"><Text value={f.ifsc} onChange={(v) => set("ifsc", v)} /></Field>
            </div>
          </section>
          <section><h3 className="text-sm font-semibold mb-3 opacity-80">Salary structure (monthly CTC basis)</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="Annual CTC (₹)"><Num value={f.ctc} onChange={(v) => set("ctc", v)} /></Field>
              <Field label="Basic %"><Num value={(f.salaryStructure || {}).basicPct || 50} onChange={(v) => setSS("basicPct", v)} /></Field>
              <Field label="HRA %"><Num value={(f.salaryStructure || {}).hraPct || 25} onChange={(v) => setSS("hraPct", v)} /></Field>
              <Field label="Conveyance (₹)"><Num value={(f.salaryStructure || {}).conveyance || 1600} onChange={(v) => setSS("conveyance", v)} /></Field>
              <Field label="Monthly gross (est.)"><Text value={inr(Math.round((Number(f.ctc) || 0) / 12))} onChange={() => {}} /></Field>
              <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-4 text-sm">
                {[["PF applicable", "pfApplicable"], ["ESI applicable", "esiApplicable"], ["PT applicable", "ptApplicable"], ["TDS applicable", "tdsApplicable"]].map(([lbl, k]) => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={(f.salaryStructure || {})[k] !== false} onChange={(e) => setSS(k, e.target.checked)} />{lbl}</label>
                ))}
              </div>
            </div>
          </section>
          <section><h3 className="text-sm font-semibold mb-3 opacity-80">Leave balance (opening)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[["Casual", "casual"], ["Sick", "sick"], ["Earned", "earned"], ["Comp off", "compOff"]].map(([lbl, k]) => (
                <Field key={k} label={lbl}><Num value={(f.leaveBalance || {})[k] || 0} onChange={(v) => setF((p) => ({ ...p, leaveBalance: { ...(p.leaveBalance || {}), [k]: v } }))} /></Field>
              ))}
            </div>
          </section>
        </div>
      </InternalScreen>
    );
  }

  function EmployeesPage({ roleKey, can }) {
    VG.useDB();
    const [edit, setEdit] = useState(null);
    const [view, setView] = useState(null);
    const rows = store.list("employees");
    if (edit !== null) return <EmployeeFormScreen record={edit.id ? edit : null} onClose={() => setEdit(null)} roleKey={roleKey} can={can} />;
    if (view) {
      const slips = store.list("salarySlips").filter((s) => s.employeeId === view.id).slice(-6).reverse();
      const leaves = store.list("leaveRequests").filter((l) => l.employeeId === view.id).slice(-5).reverse();
      return (
        <InternalScreen onBack={() => setView(null)} backLabel="Back to employees" title={view.name} subtitle={view.code}
          footer={<><DocActions build={() => empDoc(view)} />{can("edit") && <Button variant="soft" onClick={() => { setView(null); setEdit(view); }}>Edit</Button>}</>}
          breadcrumbs={[{ label: "Employees", onClick: () => setView(null) }, { label: view.name }]}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card className="p-3">{view.department} · {view.designation}</Card>
            <Card className="p-3">CTC {inr(view.ctc)} · DOJ {view.doj}</Card>
            <Card className="p-3">CL {(view.leaveBalance || {}).casual || 0} · SL {(view.leaveBalance || {}).sick || 0} · EL {(view.leaveBalance || {}).earned || 0}</Card>
            <Card className="p-3">UAN {view.uan || "—"} · ESI {view.esiNo || "—"}</Card>
          </div>
          <RecordTable embedded suppressNew title="Recent leave" columns={[
            { key: "from", label: "From" }, { key: "to", label: "To" }, { key: "type", label: "Type" }, { key: "days", label: "Days" },
            { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={LV_STATUS} /> },
          ]} rows={leaves} can={can} printTitle="Leave history" searchKeys={[]} />
          <div className="mt-4"><RecordTable embedded suppressNew title="Salary slips" columns={[
            { key: "month", label: "Month" }, { key: "gross", label: "Gross", render: (r) => inr(r.gross) }, { key: "net", label: "Net", render: (r) => inr(r.net) },
          ]} rows={slips} can={can} printTitle="Salary history" searchKeys={[]} /></div>
        </InternalScreen>
      );
    }
    return (
      <ListPage title="Employee Master" desc="Complete HR master · statutory · salary structure · documents" onNew={() => setEdit({})} newLabel="Add Employee" can={can}>
        <RecordTable embedded suppressNew title="Employee List" columns={[
          { key: "code", label: "Code", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
          { key: "name", label: "Name" },
          { key: "department", label: "Dept" },
          { key: "designation", label: "Role" },
          { key: "ctc", label: "CTC", render: (r) => inr(r.ctc) },
          { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={{ Active: "#34d399", Inactive: "#94a3b8", "On Notice": "#f59e0b", Exited: "#64748b" }} /> },
        ]} rows={rows} can={can} printTitle="Employees" searchKeys={["name", "code", "department", "pan"]}
          onNew={() => setEdit({})} onView={(r) => setView(r)} onEdit={can("edit") ? (r) => setEdit(r) : null} />
      </ListPage>
    );
  }

  /* ================= Leave ================= */
  function LeavePage({ roleKey, can }) {
    VG.useDB();
    const [apply, setApply] = useState(null);
    const rows = store.list("leaveRequests").slice().reverse();
    if (apply !== null) {
      const f = apply;
      const set = (k, v) => setApply((p) => ({ ...p, [k]: v }));
      function save() {
        if (!f.employeeId || !f.from) return VG.toast("Employee and dates required", "error");
        store.applyLeave(f, roleKey);
        VG.toast("Leave application submitted");
        setApply(null);
      }
      return (
        <InternalScreen onBack={() => setApply(null)} backLabel="Back to leave" title="Apply for leave" subtitle="Leave balance checked on approval"
          actions={<Button icon="check" onClick={save}>Submit application</Button>}>
          <div className="grid sm:grid-cols-2 gap-3 max-w-2xl">
            <Field label="Employee" required><MasterSelect collection="employees" value={f.employeeId} onChange={(v) => set("employeeId", v)} actorRole={roleKey} can={can("add")} /></Field>
            <Field label="Leave type"><Select value={f.type || "Casual Leave"} onChange={(v) => set("type", v)} options={LEAVE_TYPES.map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="From" required><DateF value={f.from} onChange={(v) => set("from", v)} /></Field>
            <Field label="To"><DateF value={f.to || f.from} onChange={(v) => set("to", v)} /></Field>
            <Field label="Days"><Num value={f.days || 1} onChange={(v) => set("days", v)} /></Field>
            <Field label="Half day"><Select value={f.halfDay ? "Yes" : "No"} onChange={(v) => set("halfDay", v === "Yes")} options={[{ value: "No", label: "No" }, { value: "Yes", label: "Yes" }]} /></Field>
            <Field label="Reason" className="sm:col-span-2"><Area value={f.reason} onChange={(v) => set("reason", v)} rows={2} /></Field>
          </div>
        </InternalScreen>
      );
    }
    return (
      <ListPage title="Leave Management" desc="Apply · approve · balance · encashment ready" onNew={() => setApply({ from: today(), days: 1, type: "Casual Leave" })} newLabel="Apply leave" can={can}>
        <RecordTable embedded suppressNew title="Leave Request List" columns={[
          { key: "no", label: "#", render: (r) => <span className="font-mono text-xs">{r.no}</span> },
          { key: "employeeId", label: "Employee", render: (r) => empName(r.employeeId) },
          { key: "from", label: "From" }, { key: "to", label: "To" }, { key: "days", label: "Days" }, { key: "type", label: "Type" },
          { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={LV_STATUS} /> },
          { key: "act", label: "Action", render: (r) => r.status === "Pending" && can("approve") ? (
            <div className="flex gap-1">
              <Button variant="soft" className="!py-1" onClick={() => { store.approveLeave(r.id, roleKey); VG.toast("Leave approved"); }}>Approve</Button>
              <Button variant="ghost" className="!py-1" onClick={() => { store.rejectLeave(r.id, roleKey); VG.toast("Rejected"); }}>Reject</Button>
            </div>
          ) : null },
        ]} rows={rows} can={can} printTitle="Leave register" filters={[{ key: "status", label: "All", options: ["Pending", "Approved", "Rejected"] }]} />
      </ListPage>
    );
  }

  /* ================= Attendance ================= */
  function AttendancePage({ roleKey, can }) {
    VG.useDB();
    const [month, setMonth] = useState(monthNow());
    const [edit, setEdit] = useState(null);
    const rows = store.list("attendanceRecords").filter((a) => a.month === month).map((a) => ({ ...a, emp: store.get("employees", a.employeeId) || {} }));
    if (edit !== null) {
      const f = edit;
      const set = (k, v) => setEdit((p) => ({ ...p, [k]: v }));
      function save() {
        if (!f.employeeId) return VG.toast("Select employee", "error");
        const existing = store.list("attendanceRecords").find((a) => a.employeeId === f.employeeId && a.month === month);
        if (existing) store.update("attendanceRecords", existing.id, { ...f, month }, roleKey);
        else store.create("attendanceRecords", { ...f, month, locked: false }, roleKey);
        VG.toast("Attendance saved");
        setEdit(null);
      }
      return (
        <InternalScreen onBack={() => setEdit(null)} backLabel="Back to attendance" title="Daily / monthly attendance" subtitle={month}
          actions={<Button icon="check" onClick={save}>Save</Button>}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl">
            <Field label="Employee" required><MasterSelect collection="employees" value={f.employeeId} onChange={(v) => set("employeeId", v)} actorRole={roleKey} can={can("add")} /></Field>
            <Field label="Present days"><Num value={f.present} onChange={(v) => set("present", v)} /></Field>
            <Field label="Leave days"><Num value={f.leave} onChange={(v) => set("leave", v)} /></Field>
            <Field label="Absent days"><Num value={f.absent} onChange={(v) => set("absent", v)} /></Field>
            <Field label="OT hours"><Num value={f.otHours} onChange={(v) => set("otHours", v)} /></Field>
            <Field label="Late coming"><Num value={f.lateComing} onChange={(v) => set("lateComing", v)} /></Field>
            <Field label="Early exit"><Num value={f.earlyExit} onChange={(v) => set("earlyExit", v)} /></Field>
          </div>
        </InternalScreen>
      );
    }
    return (
      <ListPage title="Attendance" desc="Daily register · OT · late/early · lock before payroll" onNew={() => setEdit({ present: 22, leave: 0, absent: 0, otHours: 0 })} newLabel="Mark attendance" can={can}>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Field label="Month"><Text value={month} onChange={setMonth} placeholder="YYYY-MM" /></Field>
          {can("edit") && <Button variant="soft" onClick={() => { store.lockAttendanceMonth(month, roleKey); VG.toast("Attendance locked for " + month); }}>Lock month</Button>}
          <Button variant="soft" onClick={() => VG.goTo("attendance", "dashboard")}>Attendance module</Button>
        </div>
        <RecordTable embedded suppressNew title={"Attendance · " + month} columns={[
          { key: "emp", label: "Employee", render: (r) => r.emp.name || empName(r.employeeId) },
          { key: "present", label: "Present" }, { key: "leave", label: "Leave" }, { key: "absent", label: "Absent" },
          { key: "otHours", label: "OT hrs" }, { key: "lateComing", label: "Late" }, { key: "earlyExit", label: "Early" },
          { key: "locked", label: "Locked", render: (r) => r.locked ? <Pill color="#94a3b8">Yes</Pill> : <Pill color="#34d399">Open</Pill> },
        ]} rows={rows} can={can} printTitle="Attendance" onEdit={can("edit") ? (r) => setEdit(r) : null} empty="No records — mark attendance" />
      </ListPage>
    );
  }

  /* ================= Payroll ================= */
  function PayrollPage({ roleKey, can }) {
    VG.useDB();
    const month = monthNow();
    const runs = store.list("payrollRuns").slice().reverse();
    const slips = store.list("salarySlips").filter((s) => s.month === month);
    const [viewSlip, setViewSlip] = useState(null);
    const [selMonth, setSelMonth] = useState(month);
    const monthSlips = store.list("salarySlips").filter((s) => s.month === selMonth);
    function runPayroll() {
      const run = store.runPayroll(selMonth, roleKey);
      VG.toast("Payroll " + run.no + " processed · " + (run.employeeCount || 0) + " slips", "success");
    }
    if (viewSlip) {
      return (
        <InternalScreen onBack={() => setViewSlip(null)} backLabel="Back to payroll" title="Salary slip" subtitle={viewSlip.employeeName + " · " + viewSlip.month}
          footer={<DocActions build={() => slipDoc(viewSlip)} />}
          breadcrumbs={[{ label: "Payroll", onClick: () => setViewSlip(null) }, { label: viewSlip.employeeName }]}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm w-full mb-4">
            <Card className="p-3">Gross {inr(viewSlip.gross)}</Card>
            <Card className="p-3">PF {inr(viewSlip.pf || 0)} · ESI {inr(viewSlip.esi || 0)}</Card>
            <Card className="p-3">PT {inr(viewSlip.pt || 0)} · TDS {inr(viewSlip.tds || 0)}</Card>
            <Card className="p-3 font-semibold">Net {inr(viewSlip.net)}</Card>
          </div>
          <Card className="p-4 text-sm opacity-80">Present {viewSlip.present} · Leave {viewSlip.leaveDays} · Absent {viewSlip.absent} · OT {viewSlip.otHours || 0} hrs</Card>
        </InternalScreen>
      );
    }
    const lastRun = runs[0];
    return (
      <ListPage title="Payroll Processing" desc="Statutory PF · ESI · PT · TDS · salary slips" can={can}>
        {can("add") && (
          <Card className="p-4 flex flex-wrap items-center gap-3 mb-4">
            <Field label="Payroll month"><Text value={selMonth} onChange={setSelMonth} placeholder="YYYY-MM" /></Field>
            <Button icon="rupee" onClick={runPayroll}>Process payroll</Button>
            <Button variant="soft" onClick={() => store.lockAttendanceMonth(selMonth, roleKey)}>Lock attendance first</Button>
          </Card>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Card className="p-3"><div className="text-[10px] uppercase opacity-50">Last run</div><div className="font-semibold">{lastRun ? lastRun.no : "—"}</div></Card>
          <Card className="p-3"><div className="text-[10px] uppercase opacity-50">Net payout</div><div className="font-semibold">{lastRun ? inr(lastRun.totalNet) : "—"}</div></Card>
          <Card className="p-3"><div className="text-[10px] uppercase opacity-50">Total PF</div><div className="font-semibold">{lastRun ? inr(lastRun.totalPf || 0) : "—"}</div></Card>
          <Card className="p-3"><div className="text-[10px] uppercase opacity-50">Total ESI</div><div className="font-semibold">{lastRun ? inr(lastRun.totalEsi || 0) : "—"}</div></Card>
        </div>
        <RecordTable embedded suppressNew title="Payroll runs" columns={[
          { key: "no", label: "Run #" }, { key: "month", label: "Month" }, { key: "status", label: "Status" },
          { key: "totalNet", label: "Net payout", render: (r) => inr(r.totalNet) }, { key: "employeeCount", label: "Employees" },
        ]} rows={runs} can={can} printTitle="Payroll runs" />
        <div className="mt-4"><RecordTable embedded suppressNew title={"Salary slips · " + selMonth} columns={[
          { key: "employeeCode", label: "Code" }, { key: "employeeName", label: "Name" },
          { key: "gross", label: "Gross", render: (r) => inr(r.gross) }, { key: "deductions", label: "Deductions", render: (r) => inr(r.deductions) },
          { key: "net", label: "Net", render: (r) => inr(r.net) },
        ]} rows={monthSlips} can={can} printTitle="Salary slips" onView={(r) => setViewSlip(r)} /></div>
      </ListPage>
    );
  }

  /* ================= Self Service ================= */
  function SelfServicePage({ roleKey, can }) {
    VG.useDB();
    const emp = store.employeeForUser ? store.employeeForUser(roleKey) : null;
    const month = monthNow();
    if (!emp) {
      return (
        <ListPage title="Employee Self-Service" desc="Link your user account to an employee record in Admin → Users" can={can}>
          <Card className="p-8 text-center opacity-60">No employee profile linked to your login. Ask HR to link your user account in Admin → Users → Employee field.</Card>
        </ListPage>
      );
    }
    const slips = store.list("salarySlips").filter((s) => s.employeeId === emp.id).slice(-6).reverse();
    const leaves = store.list("leaveRequests").filter((l) => l.employeeId === emp.id).slice(-5).reverse();
    const att = store.list("attendanceRecords").find((a) => a.employeeId === emp.id && a.month === month);
    return (
      <ListPage title="My HR Portal" desc={"Welcome, " + emp.name} can={can}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Card className="p-4"><div className="text-[10px] uppercase opacity-50">Leave balance</div><div className="text-sm mt-1">CL {(emp.leaveBalance || {}).casual || 0} · SL {(emp.leaveBalance || {}).sick || 0} · EL {(emp.leaveBalance || {}).earned || 0}</div></Card>
          <Card className="p-4"><div className="text-[10px] uppercase opacity-50">This month</div><div className="text-sm mt-1">Present {att ? att.present : "—"} · Leave {att ? att.leave : "—"}</div></Card>
          <Card className="p-4"><div className="text-[10px] uppercase opacity-50">Department</div><div className="text-sm mt-1">{emp.department} · {emp.designation}</div></Card>
          <Card className="p-4"><div className="text-[10px] uppercase opacity-50">CTC (annual)</div><div className="text-sm mt-1">{inr(emp.ctc)}</div></Card>
        </div>
        <RecordTable embedded suppressNew title="My salary slips" columns={[
          { key: "month", label: "Month" }, { key: "gross", label: "Gross", render: (r) => inr(r.gross) }, { key: "net", label: "Net", render: (r) => inr(r.net) },
          { key: "act", label: "", render: (r) => <Button variant="soft" className="!py-1" onClick={() => printDocument(slipDoc(r), "preview")}>PDF</Button> },
        ]} rows={slips} can={can} printTitle="My slips" searchKeys={[]} />
        <div className="mt-4"><RecordTable embedded suppressNew title="My leave requests" columns={[
          { key: "from", label: "From" }, { key: "to", label: "To" }, { key: "type", label: "Type" }, { key: "days", label: "Days" },
          { key: "status", label: "Status", render: (r) => <StatusTag value={r.status} map={LV_STATUS} /> },
        ]} rows={leaves} can={can} printTitle="My leave" searchKeys={[]} /></div>
      </ListPage>
    );
  }

  /* ================= Reports ================= */
  function ReportsPage({ roleKey, can }) {
    VG.useDB();
    const month = monthNow();
    const emps = store.list("employees").filter((e) => e.status === "Active");
    const slips = store.list("salarySlips").filter((s) => s.month === month);
    const att = store.list("attendanceRecords").filter((a) => a.month === month);
    const reports = [
      { n: "Attendance Report", d: "Monthly register", rows: att, kind: "att" },
      { n: "Salary Register", d: "Payroll for " + month, rows: slips, kind: "sal" },
      { n: "PF Report", d: "Provident fund deductions", rows: slips, kind: "pf" },
      { n: "ESI Report", d: "ESI contributions", rows: slips, kind: "esi" },
      { n: "Leave Report", d: "All leave applications", rows: store.list("leaveRequests"), kind: "lv" },
      { n: "Employee Master Report", d: "Active headcount", rows: emps, kind: "emp" },
      { n: "Department-wise Salary", d: "By department", rows: slips, kind: "dept" },
    ];
    function print(r) {
      let body = "", head = "";
      if (r.kind === "att") { head = "<th>Employee</th><th>Present</th><th>Leave</th><th>Absent</th><th>OT</th>"; body = r.rows.map((x) => `<tr><td>${empName(x.employeeId)}</td><td>${x.present}</td><td>${x.leave}</td><td>${x.absent}</td><td>${x.otHours || 0}</td></tr>`).join(""); }
      else if (r.kind === "sal") { head = "<th>Code</th><th>Name</th><th>Gross</th><th>Deductions</th><th>Net</th>"; body = r.rows.map((x) => `<tr><td>${x.employeeCode}</td><td>${x.employeeName}</td><td>${inr(x.gross)}</td><td>${inr(x.deductions)}</td><td>${inr(x.net)}</td></tr>`).join(""); }
      else if (r.kind === "pf") { head = "<th>Employee</th><th>Basic</th><th>PF</th>"; body = r.rows.map((x) => `<tr><td>${x.employeeName}</td><td>${inr(x.basic)}</td><td>${inr(x.pf || 0)}</td></tr>`).join(""); }
      else if (r.kind === "esi") { head = "<th>Employee</th><th>Gross</th><th>ESI</th>"; body = r.rows.map((x) => `<tr><td>${x.employeeName}</td><td>${inr(x.gross)}</td><td>${inr(x.esi || 0)}</td></tr>`).join(""); }
      else if (r.kind === "lv") { head = "<th>Employee</th><th>Type</th><th>Days</th><th>Status</th>"; body = r.rows.map((x) => `<tr><td>${empName(x.employeeId)}</td><td>${x.type}</td><td>${x.days}</td><td>${x.status}</td></tr>`).join(""); }
      else if (r.kind === "emp") { head = "<th>Code</th><th>Name</th><th>Dept</th><th>CTC</th>"; body = r.rows.map((x) => `<tr><td>${x.code}</td><td>${x.name}</td><td>${x.department}</td><td>${inr(x.ctc)}</td></tr>`).join(""); }
      else { head = "<th>Dept</th><th>Employees</th><th>Net pay</th>"; const byDept = {}; r.rows.forEach((s) => { byDept[s.department] = byDept[s.department] || { c: 0, n: 0 }; byDept[s.department].c++; byDept[s.department].n += Number(s.net) || 0; }); body = Object.keys(byDept).map((d) => `<tr><td>${d}</td><td>${byDept[d].c}</td><td>${inr(byDept[d].n)}</td></tr>`).join(""); }
      printDocument({ title: r.n, subtitle: store.company().name, inner: `<table class="vg-tbl"><thead><tr>${head}</tr></thead><tbody>${body || '<tr><td colspan=5>No data</td></tr>'}</tbody></table>` }, "preview");
    }
    return (
      <div>
        <PageHead title="HR & Payroll Reports" desc="Attendance · salary register · PF · ESI · leave · statutory" />
        <div className="grid sm:grid-cols-2 gap-4">{reports.map((r) => (
          <Card key={r.n} className="p-4 flex items-center gap-4">
            <span className="grid place-items-center w-11 h-11 rounded-xl text-white shrink-0" style={{ background: "var(--accent)" }}><Icon name="chart" size={18} /></span>
            <div className="flex-1 min-w-0"><div className="font-medium text-sm">{r.n}</div><div className="text-[11px] opacity-55">{r.d} · {(r.rows || []).length} rows</div></div>
            <Button variant="soft" icon="eye" onClick={() => print(r)}>Open</Button>
          </Card>
        ))}</div>
      </div>
    );
  }

  const SECTIONS = [
    { id: "dashboard", label: "Dashboard", icon: "chart", group: "Overview" },
    { id: "employees", label: "Employees", icon: "users", group: "People" },
    { id: "leave", label: "Leave", icon: "clock", group: "People" },
    { id: "attendance", label: "Attendance", icon: "activity", group: "People" },
    { id: "payroll", label: "Payroll", icon: "rupee", group: "Payroll" },
    { id: "selfservice", label: "Self-Service", icon: "user", group: "People" },
    { id: "reports", label: "Reports", icon: "chart", group: "Reports" },
  ];
  if (VG.registerModuleSections) VG.registerModuleSections("hr", SECTIONS);
  const PAGES = {
    dashboard: Dashboard, employees: EmployeesPage, leave: LeavePage,
    attendance: AttendancePage, payroll: PayrollPage, selfservice: SelfServicePage, reports: ReportsPage,
  };

  VG.modules = VG.modules || {};
  VG.modules.hr = function HRModule({ mod, roleKey }) {
    const can = (a) => VG.can(roleKey, a);
    const [section, setSection] = useState(() => VG.consumeSection("hr", "dashboard"));
    const Page = PAGES[section] || Dashboard;
    return (
      <VG.ModuleScaffold mod={mod} sections={SECTIONS} section={section} setSection={setSection} roleKey={roleKey}
        actions={[
          { label: "Add employee", icon: "plus", primary: true, onClick: () => setSection("employees") },
          { label: "Process payroll", icon: "rupee", onClick: () => setSection("payroll") },
          { label: "Leave approval", icon: "clock", onClick: () => setSection("leave") },
          { label: "Attendance", icon: "activity", onClick: () => setSection("attendance") },
        ]}>
        <Page roleKey={roleKey} can={can} go={setSection} mod={mod} />
      </VG.ModuleScaffold>
    );
  };

  VG.hrSlipDoc = slipDoc;
})(window.VG);
