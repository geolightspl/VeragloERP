/* Veraglo ERP — the per-module workspace: internal tabs + dashboard widgets.
   Each module renders the same rich layout but with its own accent, content,
   and RBAC-gated actions, so every department feels it owns a dedicated app. */
(function (VG) {
  const { useState, useMemo, useEffect } = React;
  const { Icon, Sparkline, Bars, Donut, Card, SectionTitle, KpiCard, Pill, Button } = VG.ui;

  const PRIORITY = { high: "#f87171", med: "#f59e0b", low: "#34d399" };

  function WorkflowStrip({ steps }) {
    return (
      <Card className="p-4">
        <SectionTitle icon="flow" title="Workflow" />
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <div className="flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 glass text-xs font-medium">
                <span
                  className="grid place-items-center w-5 h-5 rounded-full text-[10px] text-white"
                  style={{ background: "var(--accent)" }}
                >
                  {i + 1}
                </span>
                {s}
              </div>
              {i < steps.length - 1 && <Icon name="chevronRight" size={14} className="opacity-40 shrink-0" />}
            </React.Fragment>
          ))}
        </div>
      </Card>
    );
  }

  function TaskList({ tasks }) {
    return (
      <Card className="p-4 h-full">
        <SectionTitle icon="check" title="Pending Tasks" action={<Pill color="var(--accent)">{tasks.length} open</Pill>} />
        <ul className="space-y-2.5">
          {tasks.map((t, i) => (
            <li key={i} className="flex items-start gap-3 group">
              <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: PRIORITY[t.p] }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-snug">{t.t}</div>
                <div className="text-[11px] opacity-55 mt-0.5">Due {t.due}</div>
              </div>
              <button className="opacity-0 group-hover:opacity-70 transition" title="Complete">
                <Icon name="check" size={15} />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  function ApprovalQueue({ approvals, canApprove }) {
    return (
      <Card className="p-4 h-full">
        <SectionTitle
          icon="shield"
          title="Approval Queue"
          action={<Pill color="#f59e0b">{approvals.length} waiting</Pill>}
        />
        <ul className="space-y-3">
          {approvals.map((a, i) => (
            <li key={i} className="rounded-xl glass p-3">
              <div className="text-sm font-medium leading-snug">{a.t}</div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] opacity-60">{a.who} · {a.amt}</span>
                {canApprove ? (
                  <div className="flex gap-1.5">
                    <button className="text-[11px] px-2 py-1 rounded-lg text-white" style={{ background: "#34d399" }}>
                      Approve
                    </button>
                    <button className="text-[11px] px-2 py-1 rounded-lg glass">Reject</button>
                  </div>
                ) : (
                  <Pill>view only</Pill>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  function ActivityFeed({ activities }) {
    return (
      <Card className="p-4 h-full">
        <SectionTitle icon="activity" title="Recent Activity" />
        <ul className="space-y-3">
          {activities.map((a, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
              <div className="flex-1">
                <div className="leading-snug">{a}</div>
                <div className="text-[11px] opacity-50 mt-0.5">{["2m", "18m", "1h", "3h"][i % 4]} ago</div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  function Shortcuts({ shortcuts }) {
    return (
      <Card className="p-4">
        <SectionTitle icon="sparkle" title="Shortcuts" />
        <div className="grid grid-cols-2 gap-2">
          {shortcuts.map((s) => (
            <button
              key={s}
              className="text-left text-xs font-medium rounded-xl px-3 py-2.5 glass hover:bg-white/10 transition flex items-center gap-2"
            >
              <span className="grid place-items-center w-6 h-6 rounded-lg text-white" style={{ background: "var(--accent)" }}>
                <Icon name="plus" size={13} />
              </span>
              {s}
            </button>
          ))}
        </div>
      </Card>
    );
  }

  function QuickEntry({ entry, canAdd }) {
    return (
      <Card className="p-4">
        <SectionTitle icon="edit" title={entry.title} action={<Pill color="var(--accent)">quick add</Pill>} />
        <div className="space-y-2.5">
          {entry.fields.map((f) => (
            <div key={f}>
              <label className="text-[11px] opacity-60">{f}</label>
              <input
                className="mt-1 w-full rounded-lg glass px-3 py-2 text-sm bg-transparent outline-none focus:ring-2 placeholder:opacity-40"
                style={{ "--tw-ring-color": "var(--accent)" }}
                placeholder={f}
                disabled={!canAdd}
              />
            </div>
          ))}
          <Button icon="check" className="w-full mt-1" disabled={!canAdd}>
            {canAdd ? "Save record" : "No add permission"}
          </Button>
        </div>
      </Card>
    );
  }

  function AlertBanner({ items, icon, tone }) {
    if (!items || !items.length) return null;
    return (
      <Card className="p-4" glow>
        <SectionTitle icon={icon} title="Alerts" />
        <ul className="space-y-2">
          {items.map((a, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <Icon name="alert" size={15} style={{ color: tone }} />
              {a}
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  function ProductionStatus({ status }) {
    return (
      <Card className="p-4">
        <SectionTitle icon="factory" title="Production Status" />
        <div className="space-y-3">
          {status.map((s) => (
            <div key={s.line}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium">{s.line}</span>
                <Pill color={s.state === "Running" ? "#34d399" : "#f59e0b"}>{s.state}</Pill>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: s.pct + "%", background: "var(--accent)" }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  function ChartPanel({ mod }) {
    return (
      <Card className="p-5 lg:col-span-2">
        <SectionTitle
          icon="chart"
          title="Performance — last 12 periods"
          action={<Pill color="var(--accent)">live</Pill>}
        />
        <Sparkline data={mod.series} id={mod.id} />
        <div className="mt-4 grid grid-cols-4 gap-3">
          {mod.kpis.map((k) => (
            <div key={k.label} className="text-center">
              <div className="text-[10px] uppercase tracking-wider opacity-50">{k.label}</div>
              <div className="text-sm font-semibold mt-0.5">{k.value}</div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  function BreakdownPanel({ mod }) {
    return (
      <Card className="p-5">
        <SectionTitle icon="dot" title="Breakdown" />
        <div className="flex items-center gap-4">
          <Donut data={mod.donut} />
          <ul className="space-y-2 flex-1">
            {mod.donut.map((d) => (
              <li key={d.label} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                  {d.label}
                </span>
                <span className="font-semibold">{d.value}%</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    );
  }

  /* ----- Generic data table used by non-overview tabs ----- */
  function DataTable({ mod, can }) {
    const rows = useMemo(() => {
      const base = mod.activities.concat(mod.tasks.map((t) => t.t)).concat(mod.shortcuts);
      return base.slice(0, 8).map((label, i) => ({
        id: mod.id.toUpperCase().slice(0, 3) + "-" + (1000 + i),
        label,
        owner: ["R. Kapoor", "S. Nair", "A. Sharma", "N. Verma"][i % 4],
        status: ["Open", "In Progress", "Completed", "Pending"][i % 4],
        date: `2026-05-${10 + (i % 18)}`,
      }));
    }, [mod.id]);
    const tone = { Open: "#22d3ee", "In Progress": "#f59e0b", Completed: "#34d399", Pending: "#f87171" };
    return (
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Icon name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" />
              <input
                className="rounded-lg glass pl-8 pr-3 py-2 text-sm bg-transparent outline-none placeholder:opacity-40 w-44 sm:w-56"
                placeholder="Search records…"
              />
            </div>
            <Button variant="soft" icon="filter" className="hidden sm:inline-flex">Filter</Button>
          </div>
          <div className="flex items-center gap-2">
            {can("add") && <Button icon="plus">New</Button>}
            {can("export") && <Button variant="soft" icon="download" className="hidden sm:inline-flex">Export</Button>}
            {can("print") && <Button variant="ghost" icon="printer" className="hidden md:inline-flex">Print</Button>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="vg-table-head-row text-left text-[11px] uppercase tracking-wider">
                <th className="px-4 py-2.5 font-medium">ID</th>
                <th className="px-4 py-2.5 font-medium">Description</th>
                <th className="px-4 py-2.5 font-medium hidden md:table-cell">Owner</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Date</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="px-4 py-3 font-mono text-xs opacity-70">{r.id}</td>
                  <td className="px-4 py-3 max-w-[280px] truncate">{r.label}</td>
                  <td className="px-4 py-3 hidden md:table-cell opacity-75">{r.owner}</td>
                  <td className="px-4 py-3"><Pill color={tone[r.status]}>{r.status}</Pill></td>
                  <td className="px-4 py-3 hidden sm:table-cell opacity-60 text-xs">{r.date}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5 opacity-70">
                      <button title="View"><Icon name="eye" size={15} /></button>
                      {can("edit") && <button title="Edit"><Icon name="edit" size={15} /></button>}
                      {can("delete") && <button title="Delete" className="hover:text-red-400"><Icon name="trash" size={15} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  function ReportsView({ mod, can }) {
    const reports = [
      { n: `${mod.name} — Summary`, d: "Auto-generated · daily" },
      { n: "Monthly Performance", d: "Trend + variance" },
      { n: "Exception Report", d: "Outliers & breaches" },
      { n: "Audit Trail", d: "All changes logged" },
    ];
    return (
      <div className="grid sm:grid-cols-2 gap-4">
        {reports.map((r) => (
          <Card key={r.n} className="p-4 flex items-center gap-4 hover:bg-white/5 transition">
            <span className="grid place-items-center w-11 h-11 rounded-xl text-white shrink-0" style={{ background: "var(--accent)" }}>
              <Icon name="chart" size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{r.n}</div>
              <div className="text-[11px] opacity-55">{r.d}</div>
            </div>
            <div className="flex gap-1.5">
              {can("export") && <Button variant="soft" icon="download" className="!px-2.5">{""}</Button>}
              {can("print") && <Button variant="ghost" icon="printer" className="!px-2.5">{""}</Button>}
            </div>
          </Card>
        ))}
      </div>
    );
  }

  function AnalyticsView({ mod }) {
    return (
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle icon="chart" title="Trend analysis" />
          <Sparkline data={mod.series} id={mod.id + "a"} height={120} />
        </Card>
        <BreakdownPanel mod={mod} />
        <Card className="p-5 lg:col-span-3">
          <SectionTitle icon="activity" title="Volume by period" />
          <Bars data={mod.series} />
        </Card>
      </div>
    );
  }

  /* Per-module banner palette + scene description (acts like a photographic hero). */
  const BANNERS = {
    sales: { c1: "#4f46e5", c2: "#06b6d4", desc: "Win more deals — manage leads, quotations, orders and customer relationships in one place." },
    enquiry: { c1: "#0284c7", c2: "#22d3ee", desc: "Capture every enquiry and nurture it into a qualified opportunity." },
    inventory: { c1: "#059669", c2: "#10b981", desc: "Real-time stock across stores, racks and bins with auto reorder alerts." },
    purchase: { c1: "#d97706", c2: "#f59e0b", desc: "From requisition to purchase order to goods receipt — fully tracked procurement." },
    supplier: { c1: "#0d9488", c2: "#14b8a6", desc: "Vendor master, ratings and contracts in a single trusted source." },
    production: { c1: "#dc2626", c2: "#f97316", desc: "Plan work orders, issue material and track output on the shop floor." },
    quality: { c1: "#7c3aed", c2: "#a855f7", desc: "Aviation warning light QC — incoming, in-process & final inspection, NCR, CAPA, calibration & customer plans." },
    hr: { c1: "#db2777", c2: "#f472b6", desc: "People, attendance, leave and payroll — one connected HR workspace." },
    attendance: { c1: "#16a34a", c2: "#22c55e", desc: "Shifts, biometrics and regularisation feeding straight into payroll." },
    dispatch: { c1: "#ea580c", c2: "#f97316", desc: "Pack, load and deliver — shipments tracked from gate to door." },
    accounts: { c1: "#0e7490", c2: "#06b6d4", desc: "Invoices, receivables, payables and GST with live cash visibility." },
    reports: { c1: "#2563eb", c2: "#3b82f6", desc: "Cross-module analytics, scheduled reports and exportable insights." },
    admin: { c1: "#475569", c2: "#64748b", desc: "Users, roles, company profile, backups and the full system audit trail." },
  };
  function isDashboardSection(sectionId) {
    return sectionId === "dashboard";
  }
  VG.isDashboardSection = isDashboardSection;

  function ModuleBreadcrumb({ mod, sectionLabel, groupLabel, onHome }) {
    return (
      <nav className="vg-module-crumb vg-workspace-inset flex flex-wrap items-center gap-1.5 text-[11px] pt-2 pb-1 opacity-60" aria-label="Breadcrumb">
        <button type="button" onClick={onHome} className="hover:opacity-100 transition font-medium" style={{ color: "var(--accent)" }}>
          {mod.name}
        </button>
        <Icon name="chevronRight" size={12} className="opacity-35 shrink-0" />
        {groupLabel && groupLabel !== "Overview" && (
          <>
            <span>{groupLabel}</span>
            <Icon name="chevronRight" size={12} className="opacity-35 shrink-0" />
          </>
        )}
        <span className="font-semibold opacity-90">{sectionLabel}</span>
      </nav>
    );
  }
  VG.ModuleBreadcrumb = ModuleBreadcrumb;

  
  function CompactModuleHeader({ mod, actions }) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 animate-fade-up">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="grid place-items-center w-10 h-10 rounded-xl text-white shrink-0" style={{ background: mod.accent }}>
            <Icon name={mod.icon} size={18} />
          </span>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-display font-bold truncate">{mod.name}</h1>
            <p className="text-[11px] opacity-55 truncate">{mod.tagline}</p>
          </div>
        </div>
        {actions && actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {actions.slice(0, 3).map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                className={"inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition " + (a.primary ? "text-white shadow-md" : "glass chrome-hover")}
                style={a.primary ? { background: mod.accent } : undefined}
              >
                {a.icon && <Icon name={a.icon} size={14} />}
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  VG.CompactModuleHeader = CompactModuleHeader;

  /* ----- Section registry for left sidebar accordion ----- */
  VG.moduleSections = VG.moduleSections || {};
  VG._navListeners = VG._navListeners || [];
  VG.registerModuleSections = function (modId, sections) {
    VG.moduleSections[modId] = sections || [];
    VG.notifyModuleNav();
  };
  VG.notifyModuleNav = function () {
    (VG._navListeners || []).forEach((fn) => { try { fn(); } catch (e) {} });
  };
  VG.publishModuleNav = function (modId, section, setSection) {
    VG._activeModuleNav = { modId, section, setSection };
    VG.notifyModuleNav();
  };

  /* ----- In-module scaffold: banner + sidebar-driven navigation ----- */
  function ModuleScaffold({ mod, sections, section, setSection, children, actions, roleKey }) {
    const visibleSections = React.useMemo(() => {
      if (!roleKey || !VG.store || !VG.store.getRoleSections) return sections;
      const allowed = VG.store.getRoleSections(roleKey, mod.id);
      if (allowed === null) return sections;
      if (!allowed.length) return sections.filter((s) => s.id === "dashboard");
      return sections.filter((s) => s.id === "dashboard" || allowed.includes(s.id));
    }, [sections, roleKey, mod.id]);

    useEffect(() => {
      VG.registerModuleSections(mod.id, visibleSections);
    }, [mod.id, visibleSections]);

    useEffect(() => {
      if (visibleSections.length && !visibleSections.some((s) => s.id === section)) {
        setSection(visibleSections[0].id);
      }
    }, [visibleSections, section, setSection]);

    useEffect(() => {
      VG.publishModuleNav(mod.id, section, setSection);
      return () => {
        if (VG._activeModuleNav && VG._activeModuleNav.modId === mod.id) VG._activeModuleNav = null;
      };
    }, [mod.id, section, setSection]);

    const current = visibleSections.find((s) => s.id === section);
    const isDashboard = isDashboardSection(section);
    return (
      <div className={"animate-fade-up vg-full-width-workspace" + (isDashboard ? "" : " vg-internal-workspace")}>
        {isDashboard ? null : current ? (
          <ModuleBreadcrumb
            mod={mod}
            sectionLabel={current.label}
            groupLabel={current.group}
            onHome={() => setSection("dashboard")}
          />
        ) : null}
        {children}
      </div>
    );
  }
  VG.ModuleScaffold = ModuleScaffold;

  /* Cross-module deep-linking: VG.goTo("quality","inspections") opens that
     module on that section. Modules call VG.consumeSection(id, fallback). */
  VG.goTo = function (module, section, opts) {
    VG._pendingSection = { module, section };
    if (opts && opts.customerId) {
      VG._pendingCustomerFilter = { customerId: opts.customerId, label: opts.label || "" };
    }
    if (VG._openModule) VG._openModule(module);
    if (VG._activeModuleNav && VG._activeModuleNav.modId === module && VG._activeModuleNav.setSection) {
      VG._activeModuleNav.setSection(section);
      VG.publishModuleNav(module, section, VG._activeModuleNav.setSection);
    }
  };
  VG.consumeSection = function (modId, fallback) {
    const p = VG._pendingSection;
    if (p && p.module === modId) { VG._pendingSection = null; return p.section; }
    return fallback;
  };
  VG.consumeCustomerFilter = function () {
    const f = VG._pendingCustomerFilter || null;
    VG._pendingCustomerFilter = null;
    return f;
  };
  VG.peekCustomerFilter = function () {
    return VG._pendingCustomerFilter || null;
  };

  /* ----- The full module workspace ----- */
  function ModuleWorkspace({ mod, roleKey }) {
    if (VG.modules && VG.modules[mod.id]) {
      const Custom = VG.modules[mod.id];
      return <Custom mod={mod} roleKey={roleKey} />;
    }
    const can = (a, modId) => VG.can(roleKey, a, modId || mod.id);
    const [tab, setTab] = useState(mod.tabs[0]);
    const tabSections = useMemo(
      () => (mod.tabs || []).map((t, i) => ({ id: "tab-" + i, label: t, icon: i === 0 ? "chart" : "grid", group: "Views" })),
      [mod.id, mod.tabs]
    );

    useEffect(() => {
      VG.registerModuleSections(mod.id, tabSections);
    }, [mod.id, tabSections]);

    useEffect(() => {
      const idx = mod.tabs.indexOf(tab);
      VG.publishModuleNav(mod.id, "tab-" + (idx >= 0 ? idx : 0), (sid) => {
        const n = parseInt(String(sid).replace("tab-", ""), 10);
        if (!isNaN(n) && mod.tabs[n]) setTab(mod.tabs[n]);
      });
      return () => {
        if (VG._activeModuleNav && VG._activeModuleNav.modId === mod.id) VG._activeModuleNav = null;
      };
    }, [mod.id, tab, mod.tabs]);

    const isOverview = tab === mod.tabs[0];
    const isReports = /report/i.test(tab);
    const isAnalytics = /analytic/i.test(tab);

    return (
      <div className={"animate-fade-up vg-full-width-workspace" + (isOverview ? "" : " vg-internal-workspace")}>
        {isOverview ? null : (
          <ModuleBreadcrumb
            mod={mod}
            sectionLabel={tab}
            groupLabel="Views"
            onHome={() => setTab(mod.tabs[0])}
          />
        )}

        {isOverview && (
          <div className="space-y-6 w-full max-w-none">
            <div>
              <h2 className="text-xl font-display font-bold">{mod.name}</h2>
              <p className="text-sm opacity-55 mt-0.5">{mod.tagline}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {mod.kpis.map((k, i) => (
                <KpiCard key={k.label} kpi={k} delay={i * 60} />
              ))}
            </div>
            {mod.workflow && <WorkflowStrip steps={mod.workflow} />}
            <div className="grid lg:grid-cols-2 gap-5">
              {mod.tasks && mod.tasks.length > 0 && <TaskList tasks={mod.tasks} />}
              {mod.alerts && mod.alerts.length > 0 && <AlertBanner items={mod.alerts} icon="alert" tone="#f59e0b" />}
              {mod.reminders && mod.reminders.length > 0 && <AlertBanner items={mod.reminders} icon="rupee" tone="#f87171" />}
              {mod.status && <ProductionStatus status={mod.status} />}
            </div>
            {mod.activities && mod.activities.length > 0 && (
              <Card className="p-5">
                <SectionTitle icon="activity" title="Recent activity" />
                <div className="mt-3"><ActivityFeed activities={mod.activities} /></div>
              </Card>
            )}
          </div>
        )}

        {!isOverview && isReports && <ReportsView mod={mod} can={can} />}
        {!isOverview && isAnalytics && <AnalyticsView mod={mod} />}
        {!isOverview && !isReports && !isAnalytics && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {mod.kpis.map((k, i) => (
                <KpiCard key={k.label} kpi={k} delay={i * 50} />
              ))}
            </div>
            <DataTable mod={mod} can={can} />
          </div>
        )}
      </div>
    );
  }

  VG.ModuleWorkspace = ModuleWorkspace;
})(window.VG);
