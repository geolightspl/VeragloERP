/* Veraglo ERP — app shell: theme + auth/session state, hero login,
   glassmorphism launcher, collapsible sidebar + top status bar, routing. */
(function (VG) {
  const { useState, useEffect, useMemo, useRef } = React;
  const { Icon, Card, Button, Pill, Toggle, useClock } = VG.ui;

  const HERO = "assets/happy-employees.png";
  const LOGO = "assets/veraglo-logo.png";
  const STORE = "veraglo-erp-session";
  const UI_REV = "2026-06-auth-db-users";
  const SIDEBAR_KEY = "veraglo-sidebar-collapsed";

  function setAccent(hex) {
    const root = document.documentElement;
    root.style.setProperty("--accent", hex || "#6366f1");
    root.style.setProperty("--accent-soft", (hex || "#6366f1") + "29");
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
  }

  function clearAuthCache() {
    try {
      const cur = JSON.parse(localStorage.getItem(STORE) || "{}");
      localStorage.setItem(STORE, JSON.stringify({ theme: cur.theme }));
      sessionStorage.clear();
    } catch (e) {}
  }
  VG.clearAuthCache = clearAuthCache;

  /* ---------------- First-time setup (no pre-seeded users) ---------------- */
  function InitialSetup({ onComplete, theme, setTheme }) {
    VG.useDB();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);

    async function submit(e) {
      e.preventDefault();
      if (busy) return;
      if (password !== confirm) return VG.toast("Passwords do not match", "error");
      setBusy(true);
      try {
        const res = await VG.store.createInitialAdmin({ name: name.trim(), email: email.trim(), password });
        if (!res.ok) return VG.toast(res.reason || "Setup failed", "error");
        VG.toast("Administrator account created — signing you in…");
        await onComplete(res.email, password);
      } finally {
        setBusy(false);
      }
    }

    return (
      <div className="relative min-h-screen w-full overflow-hidden">
        <img src={HERO} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(110deg, rgba(8,13,24,.92) 0%, rgba(8,13,24,.72) 38%, rgba(8,13,24,.30) 100%)" }} />
        <div className="relative z-10 min-h-screen flex flex-col">
          <header className="flex items-center justify-between px-6 sm:px-10 py-6">
            <img src={LOGO} alt="Veraglo" className="h-9 w-auto drop-shadow" />
            <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="glass rounded-xl p-2.5 text-white/90">
              <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
            </button>
          </header>
          <div className="flex-1 flex items-center justify-center px-6 pb-14">
            <div className="login-panel rounded-2xl p-7 sm:p-8 w-full max-w-md">
              <h2 className="text-2xl font-display font-semibold text-slate-900">Create administrator</h2>
              <p className="text-sm login-muted mt-1">No default users or passwords. Set up the first account for this installation.</p>
              <form onSubmit={submit} className="mt-6 space-y-4">
                <div>
                  <label className="text-xs login-label">Full name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} required className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm" />
                </div>
                <div>
                  <label className="text-xs login-label">Work email</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required
                    placeholder="you@company.com" className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm" />
                </div>
                <div>
                  <label className="text-xs login-label">Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required
                    className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm" />
                </div>
                <div>
                  <label className="text-xs login-label">Confirm password</label>
                  <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required
                    className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm" />
                </div>
                <Button type="submit" icon="check" className="w-full !py-3" disabled={busy}>{busy ? "Creating…" : "Create account & continue"}</Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- Login ---------------- */
  function Login({ onLogin, theme, setTheme, needsSetup }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [authHint, setAuthHint] = useState("");

    useEffect(() => {
      fetch((VG.apiBase || "") + "/api/auth/status")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (!data) return;
          if (data.needsSetup) setAuthHint("First launch on this server — close this screen and use Create administrator, or ask your IT team to run: cd server && npm run db:reset-admin");
          else if (!data.licensed) setAuthHint("License not active — return to the activation screen and start the evaluation trial or enter your license.");
          else setAuthHint("");
        })
        .catch(() => {});
    }, []);

    function submit(e) {
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      Promise.resolve(onLogin(email.trim(), password)).finally(() => setBusy(false));
    }

    return (
      <div className="relative min-h-screen w-full overflow-hidden">
        <img src={HERO} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(110deg, rgba(8,13,24,.92) 0%, rgba(8,13,24,.72) 38%, rgba(8,13,24,.30) 100%)" }} />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-transparent to-ink-950/40" />

        <div className="relative z-10 min-h-screen flex flex-col">
          <header className="flex items-center justify-between px-6 sm:px-10 py-6">
            <div className="flex items-center gap-3">
              <img src={LOGO} alt="Veraglo" className="h-9 w-auto drop-shadow" />
              <span className="text-white/90 font-display font-semibold tracking-wide hidden sm:block">Veraglo ERP</span>
            </div>
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="glass rounded-xl p-2.5 text-white/90 hover:bg-white/15 transition">
              <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
            </button>
          </header>

          <div className="flex-1 grid lg:grid-cols-2 items-center gap-10 px-6 sm:px-10 pb-14">
            {/* Left: brand promise */}
            <div className="min-w-0 max-w-xl text-white animate-fade-up hidden lg:block">
              <Pill color="#a5b4fc">Enterprise Resource Planning</Pill>
              <h1 className="mt-4 text-4xl xl:text-5xl font-display font-bold leading-[1.1] text-balance">
                One workspace for your whole factory floor.
              </h1>
              <p className="mt-4 text-white/70 text-lg leading-relaxed">
                Sales, production, quality, inventory, dispatch, accounts and people —
                each team gets its own focused, premium environment with role-based access.
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {["Role-based access", "15 modules", "Light & dark", "Real-time KPIs"].map((f) => (
                  <span key={f} className="glass rounded-full px-3.5 py-1.5 text-sm text-white/85">{f}</span>
                ))}
              </div>
            </div>

            {/* Right: login card — light panel for readable inputs on dark hero */}
            <div className="min-w-0 w-full max-w-md justify-self-center lg:justify-self-end animate-scale-in">
              <div className="login-panel rounded-2xl p-7 sm:p-8">
                <div className="lg:hidden flex items-center gap-2 mb-5">
                  <img src={LOGO} alt="" className="h-8 w-auto" />
                  <span className="font-display font-semibold text-slate-900">Veraglo ERP</span>
                </div>
                <h2 className="text-2xl font-display font-semibold text-slate-900">Welcome back</h2>
                <p className="text-sm login-muted mt-1">Sign in to your workspace</p>

                <form onSubmit={submit} className="mt-6 space-y-4">
                  <div>
                    <label className="text-xs login-label">Email</label>
                    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" required
                      placeholder="you@company.com"
                      className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm focus:ring-2"
                      style={{ "--tw-ring-color": "var(--accent)" }} />
                  </div>
                  <div>
                    <label className="text-xs login-label">Password</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                      placeholder="Enter password"
                      className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm focus:ring-2"
                      style={{ "--tw-ring-color": "var(--accent)" }} />
                  </div>

                  <Button type="submit" icon="logout" className="w-full !py-3" disabled={busy}>{busy ? "Signing in…" : "Sign in to workspace"}</Button>
                  {needsSetup ? (
                    <p className="text-[11px] text-center text-amber-700">No administrator exists yet — refresh the page to open <b>Create administrator</b>.</p>
                  ) : (
                    <p className="text-[11px] text-center login-muted">Use the email and password from your administrator setup. Dev credentials from other machines do not carry over after deploy.</p>
                  )}
                  {authHint && <p className="text-[11px] text-center text-amber-700 mt-2">{authHint}</p>}
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- Launcher (module home) ---------------- */
  function ModuleCard({ mod, onOpen, i, pinned, onTogglePin }) {
    return (
      <button
        onClick={() => onOpen(mod.id)}
        className="group relative text-left glass rounded-3xl p-5 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-glow animate-fade-up overflow-hidden"
        style={{ animationDelay: i * 45 + "ms", "--accent": mod.accent }}
      >
        <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full blur-2xl opacity-0 group-hover:opacity-40 transition-opacity duration-500" style={{ background: mod.accent }} />
        <div className="flex items-start justify-between">
          <span className="grid place-items-center w-12 h-12 rounded-2xl text-white shadow-lg transition-transform duration-300 group-hover:scale-110" style={{ background: mod.accent }}>
            <Icon name={mod.icon} size={22} />
          </span>
          <div className="flex items-center gap-1">
            {onTogglePin && (
              <span
                role="button"
                tabIndex={0}
                title={pinned ? "Unpin from dashboard" : "Pin to dashboard"}
                onClick={(e) => { e.stopPropagation(); onTogglePin(mod.id); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onTogglePin(mod.id); } }}
                className={"p-1.5 rounded-lg transition " + (pinned ? "text-amber-300" : "opacity-30 hover:opacity-80")}
              >
                <Icon name="star" size={16} />
              </span>
            )}
            <Icon name="chevronRight" size={18} className="opacity-30 group-hover:opacity-80 group-hover:translate-x-1 transition" />
          </div>
        </div>
        <h3 className="mt-4 font-display font-semibold text-[15px] leading-tight">{mod.name}</h3>
        <p className="text-xs opacity-60 mt-1">{mod.tagline}</p>
        <div className="mt-3"><Pill color={mod.accent}>{mod.category}</Pill></div>
      </button>
    );
  }

  function Launcher(props) {
    if (VG.WelcomeHome) return <VG.WelcomeHome {...props} />;
    const { roleKey, email, onOpen, onLogout, theme, setTheme, onOpenSearch } = props;
    VG.useDB();
    const role = VG.ROLES[roleKey];
    const mods = VG.modulesForRole(roleKey);
    const now = useClock();
    const prefs = VG.store.dashboardPrefs(roleKey);
    const pinnedSet = useMemo(() => new Set(prefs.pinnedModules || []), [prefs.pinnedModules, roleKey]);

    function togglePin(id) {
      const cur = prefs.pinnedModules || [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat(id);
      VG.store.saveDashboardPrefs(roleKey, { pinnedModules: next }, roleKey);
      VG.toast(next.includes(id) ? "Pinned to dashboard" : "Unpinned");
    }

    function sortMods(list) {
      const order = prefs.moduleOrder || [];
      const pin = prefs.pinnedModules || [];
      return list.slice().sort((a, b) => {
        const ap = pin.indexOf(a.id), bp = pin.indexOf(b.id);
        if (ap >= 0 && bp < 0) return -1;
        if (bp >= 0 && ap < 0) return 1;
        if (ap >= 0 && bp >= 0) return ap - bp;
        const ao = order.indexOf(a.id), bo = order.indexOf(b.id);
        if (ao >= 0 && bo >= 0) return ao - bo;
        if (ao >= 0) return -1;
        if (bo >= 0) return 1;
        return a.name.localeCompare(b.name);
      });
    }

    const pinnedMods = sortMods(mods.filter((m) => pinnedSet.has(m.id)));
    const cats = useMemo(() => {
      const map = {};
      sortMods(mods).forEach((m) => { (map[m.category] = map[m.category] || []).push(m); });
      return map;
    }, [roleKey, prefs.pinnedModules, prefs.moduleOrder, mods.length]);

    return (
      <div className="relative min-h-screen w-full overflow-hidden">
        <img src={HERO} alt="" className="fixed inset-0 w-full h-full object-cover" />
        <div className="fixed inset-0" style={{ background: "linear-gradient(180deg, rgba(8,13,24,.82), rgba(8,13,24,.92))" }} />

        <div className="relative z-10 min-h-screen flex flex-col">
          {/* slim top bar */}
          <header className="flex items-center justify-between px-5 sm:px-8 py-4">
            <div className="flex items-center gap-3 text-white">
              <img src={LOGO} alt="Veraglo" className="h-8 w-auto" />
              <span className="font-display font-semibold tracking-wide hidden sm:block">Veraglo ERP</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 text-white/90">
              <button type="button" onClick={onOpenSearch} className="hidden sm:flex items-center gap-2 glass rounded-xl px-3 py-2 text-sm opacity-80 hover:opacity-100 transition min-w-[200px]">
                <Icon name="search" size={15} className="opacity-60" />
                <span className="opacity-60">Search…</span>
                <kbd className="ml-auto text-[10px] opacity-40">⌘K</kbd>
              </button>
              <div className="hidden md:flex items-center gap-2 glass rounded-xl px-3 py-2 text-sm">
                <Icon name="calendar" size={15} className="opacity-70" />
                {now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                <span className="opacity-60">·</span>
                {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <button className="relative glass rounded-xl p-2.5 hover:bg-white/15 transition"><Icon name="bell" size={18} /><span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-400" /></button>
              <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="glass rounded-xl p-2.5 hover:bg-white/15 transition"><Icon name={theme === "dark" ? "sun" : "moon"} size={18} /></button>
              <div className="flex items-center gap-2 glass rounded-xl pl-1 pr-3 py-1">
                <span className="grid place-items-center w-8 h-8 rounded-lg text-white text-xs font-bold" style={{ background: role.color }}>{role.avatar}</span>
                <div className="hidden sm:block leading-tight">
                  <div className="text-xs font-medium">{role.label}</div>
                  <div className="text-[10px] opacity-60">{email}</div>
                </div>
              </div>
              <button onClick={onLogout} className="glass rounded-xl p-2.5 hover:bg-white/15 transition" title="Sign out"><Icon name="logout" size={18} /></button>
            </div>
          </header>

          <div className="flex-1 px-5 sm:px-8 py-6 sm:py-10 text-white">
            <div className="max-w-6xl mx-auto">
              <div className="animate-fade-up">
                <Pill color="#a5b4fc">{role.tag}</Pill>
                <h1 className="mt-3 text-3xl sm:text-4xl font-display font-bold text-balance">
                  {VG.greeting()} — choose your workspace
                </h1>
                <p className="mt-2 text-white/65 max-w-2xl">
                  You have access to <b className="text-white">{mods.length}</b> {mods.length === 1 ? "module" : "modules"}.
                  Each opens its own dedicated, focused environment.
                </p>
              </div>

              <div className="mt-9 space-y-9">
                {pinnedMods.length > 0 && (
                  <section>
                    <div className="flex items-center gap-3 mb-3.5">
                      <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">Pinned</h2>
                      <Icon name="star" size={14} className="text-amber-300/80" />
                      <div className="h-px flex-1 bg-white/10" />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      {pinnedMods.map((m, i) => (
                        <ModuleCard key={"pin-" + m.id} mod={m} onOpen={onOpen} i={i} pinned onTogglePin={togglePin} />
                      ))}
                    </div>
                  </section>
                )}
                {Object.keys(cats).map((cat) => (
                  <section key={cat}>
                    <div className="flex items-center gap-3 mb-3.5">
                      <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">{cat}</h2>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      {cats[cat].map((m, i) => (
                        <ModuleCard key={m.id} mod={m} onOpen={onOpen} i={i} pinned={pinnedSet.has(m.id)} onTogglePin={togglePin} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- App shell (sidebar + topbar + workspace) ---------------- */
  function Sidebar({ roleKey, activeId, onOpen, onHome, collapsed, setCollapsed, hoverExpand, setHoverExpand, mobileOpen, setMobileOpen }) {
    const mods = VG.modulesForRole(roleKey);
    const narrow = collapsed && !hoverExpand;
    const w = narrow ? "lg:w-[72px]" : "lg:w-[272px]";
    const [, setNavTick] = useState(0);
    const [expandedId, setExpandedId] = useState(activeId);

    useEffect(() => {
      if (activeId) setExpandedId(activeId);
    }, [activeId]);

    useEffect(() => {
      if (!VG._navListeners) VG._navListeners = [];
      const bump = () => setNavTick((t) => t + 1);
      VG._navListeners.push(bump);
      return () => { VG._navListeners = (VG._navListeners || []).filter((f) => f !== bump); };
    }, []);

    const activeSection = activeId && VG._activeModuleNav && VG._activeModuleNav.modId === activeId
      ? VG._activeModuleNav.section
      : null;

    function navToSection(modId, sectionId) {
      if (activeId === modId && VG._activeModuleNav && VG._activeModuleNav.modId === modId) {
        VG._activeModuleNav.setSection(sectionId);
        VG.publishModuleNav(modId, sectionId, VG._activeModuleNav.setSection);
      } else {
        VG.goTo(modId, sectionId);
        onOpen(modId);
        setExpandedId(modId);
      }
      setMobileOpen(false);
    }

    function onModuleClick(m) {
      const sections = (VG.moduleSections && VG.moduleSections[m.id]) || [];
      if (narrow && sections.length) setCollapsed(false);
      if (activeId === m.id && sections.length) {
        setExpandedId((cur) => (cur === m.id ? null : m.id));
        return;
      }
      onOpen(m.id);
      setExpandedId(sections.length ? m.id : null);
      setMobileOpen(false);
    }

    return (
      <>
        {mobileOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />}
        <aside
          onMouseEnter={() => { if (collapsed) setHoverExpand(true); }}
          onMouseLeave={() => setHoverExpand(false)}
          className={
            "fixed lg:sticky top-0 z-40 h-screen shrink-0 app-chrome border-r transition-all duration-300 flex flex-col " +
            w + " " +
            (mobileOpen ? "left-0 w-[272px]" : "-left-72 w-[272px]") + " lg:left-0"
          }
        >
          <div className={"flex items-center gap-2.5 h-16 border-b border-white/10 " + (narrow ? "justify-center px-2" : "px-4")}>
            <img src={LOGO} alt="" className="h-8 w-8 object-contain shrink-0" />
            {!narrow && <span className="font-display font-semibold tracking-wide truncate">Veraglo ERP</span>}
          </div>

          <nav className="flex-1 overflow-y-auto no-scrollbar py-3 px-2 space-y-0.5">
            <button type="button" onClick={() => { onHome(); setMobileOpen(false); }} title="All workspaces"
              className={"w-full flex items-center rounded-xl text-sm opacity-75 hover:opacity-100 chrome-hover transition " + (narrow ? "justify-center p-2.5" : "gap-3 px-3 py-2.5")}>
              <Icon name="grid" size={20} className="shrink-0" />
              {!narrow && <span>All Workspaces</span>}
            </button>
            {!narrow && <div className="text-[10px] uppercase tracking-wider opacity-40 px-3 pt-3 pb-1">Modules</div>}
            {mods.map((m) => {
              const active = m.id === activeId;
              const expanded = expandedId === m.id && !narrow;
              const sections = (VG.moduleSections && VG.moduleSections[m.id]) || [];
              const hasChildren = sections.length > 0;
              return (
                <div key={m.id} className="vg-sidebar-module">
                  <button
                    type="button"
                    onClick={() => onModuleClick(m)}
                    title={m.name}
                    className={"w-full flex items-center rounded-xl text-sm transition-all " + (narrow ? "justify-center p-2.5" : "gap-2 px-3 py-2.5") + " " + (active ? "text-white shadow-md" : "opacity-75 hover:opacity-100 chrome-hover")}
                    style={active ? { background: m.accent } : undefined}
                    aria-expanded={expanded}
                  >
                    <Icon name={m.icon} size={20} className="shrink-0" />
                    {!narrow && (
                      <>
                        <span className="text-left leading-snug flex-1 min-w-0">{m.name}</span>
                        {hasChildren && (
                          <Icon name="chevron" size={16} className={"shrink-0 opacity-70 transition-transform " + (expanded ? "rotate-180" : "")} />
                        )}
                      </>
                    )}
                  </button>
                  {expanded && hasChildren && (
                    <ul className="vg-sidebar-sections mt-0.5 mb-1 ml-2 pl-2 border-l-2 space-y-0.5 animate-fade-up" style={{ borderColor: active ? m.accent + "88" : "rgba(255,255,255,0.12)" }}>
                      {sections.map((s) => {
                        const isCur = active && activeSection === s.id;
                        return (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => navToSection(m.id, s.id)}
                              className={"w-full flex items-center gap-2 rounded-lg text-left text-[12px] leading-snug py-2 px-2 transition " + (isCur ? "font-semibold text-white" : "opacity-70 hover:opacity-100 chrome-hover")}
                              style={isCur ? { background: m.accent + "cc" } : undefined}
                            >
                              <Icon name={s.icon || "grid"} size={14} className="shrink-0 opacity-80" />
                              <span className="break-words">{s.label}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="border-t border-white/10 p-2">
            <button type="button" onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={"hidden lg:flex w-full items-center rounded-xl text-sm opacity-70 hover:opacity-100 chrome-hover transition " + (narrow ? "justify-center p-2.5" : "gap-3 px-3 py-2.5")}>
              <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={18} className="shrink-0" />
              {!narrow && <span>{collapsed ? "Collapsed" : "Collapse menu"}</span>}
            </button>
          </div>
        </aside>
      </>
    );
  }

  function Popover({ open, onClose, children, align = "right" }) {
    const ref = useRef(null);
    useEffect(() => {
      if (!open) return;
      const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
      document.addEventListener("mousedown", h);
      return () => document.removeEventListener("mousedown", h);
    }, [open]);
    if (!open) return null;
    return (
      <div ref={ref} className={"absolute top-12 z-50 w-72 glass-dark rounded-2xl shadow-glass p-3 animate-scale-in " + (align === "right" ? "right-0" : "left-0")}>
        {children}
      </div>
    );
  }

  function Topbar({ roleKey, email, mod, onHome, onToggleMobile, theme, setTheme, onLogout, onOpenSearch }) {
    const role = VG.ROLES[roleKey];
    const now = useClock();
    const [open, setOpen] = useState(null);
    const db = VG.useDB ? VG.useDB() : VG.store;
    const allowed = useMemo(() => new Set(VG.modulesForRole(roleKey).map((m) => m.id)), [roleKey]);
    const tasks = (db.openTasks ? db.openTasks() : []).filter((t) => allowed.has(t.module));
    const taskCount = tasks.reduce((s, t) => s + t.count, 0);
    return (
      <header className="sticky top-0 z-30 h-16 app-chrome border-b flex items-center gap-3 px-4 sm:px-6">
        <button className="lg:hidden -ml-1 p-2 rounded-lg hover:bg-white/10" onClick={onToggleMobile}><Icon name="menu" size={20} /></button>
        {onOpenSearch && (
          <button type="button" className="md:hidden p-2 rounded-lg hover:bg-white/10" onClick={onOpenSearch} title="Search (⌘K)"><Icon name="search" size={20} /></button>
        )}

        <div className="flex items-center gap-2 min-w-0">
          <span className="grid place-items-center w-8 h-8 rounded-lg text-white shrink-0" style={{ background: "var(--accent)" }}>
            <Icon name={mod ? mod.icon : "grid"} size={16} />
          </span>
          <div className="leading-tight min-w-0">
            <div className="text-sm font-semibold truncate">{mod ? mod.name : "Workspace"}</div>
            <div className="text-[11px] opacity-55 truncate">Veraglo ERP · {role.label}</div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 ml-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
            <input
              readOnly
              onFocus={onOpenSearch}
              onClick={onOpenSearch}
              className="w-full rounded-xl glass pl-9 pr-3 py-2.5 text-sm bg-transparent outline-none placeholder:opacity-45 focus:ring-2 cursor-pointer"
              style={{ "--tw-ring-color": "var(--accent)" }}
              placeholder="Search anything…  ⌘K"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <div className="hidden xl:flex items-center gap-1.5 glass rounded-xl px-3 py-2 text-xs mr-1">
            <Icon name="clock" size={14} className="opacity-60" />
            {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </div>

          <div className="relative">
            <button onClick={() => setOpen(open === "n" ? null : "n")} className="relative p-2.5 rounded-xl hover:bg-white/10 transition" title="Notifications">
              <Icon name="bell" size={18} />
              {taskCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center">{taskCount > 99 ? "99+" : taskCount}</span>}
            </button>
            <Popover open={open === "n"} onClose={() => setOpen(null)}>
              <div className="flex items-center justify-between px-1 pb-2"><span className="text-sm font-semibold">Notifications</span><Pill color="var(--accent)">{taskCount} pending</Pill></div>
              <ul className="space-y-1 max-h-80 overflow-auto">
                {tasks.length === 0 && <li className="text-sm opacity-50 p-2">You're all caught up 🎉</li>}
                {tasks.map((t, i) => (
                  <li key={i}>
                    <button onClick={() => { setOpen(null); VG.goTo(t.module, t.section); }} className="w-full flex items-center gap-2 text-sm rounded-lg p-2 chrome-hover text-left">
                      <span className="mt-0.5 w-2 h-2 rounded-full shrink-0" style={{ background: t.tone }} />
                      <span className="flex-1">{t.label}</span>
                      <Pill color={t.tone}>{t.count}</Pill>
                    </button>
                  </li>
                ))}
              </ul>
            </Popover>
          </div>

          <button className="relative p-2.5 rounded-xl hover:bg-white/10 transition hidden sm:block"><Icon name="message" size={18} /><span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-sky-400" /></button>
          <button className="relative p-2.5 rounded-xl hover:bg-white/10 transition hidden sm:block" title="System alerts"><Icon name="alert" size={18} /></button>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="p-2.5 rounded-xl hover:bg-white/10 transition"><Icon name={theme === "dark" ? "sun" : "moon"} size={18} /></button>

          <div className="relative">
            <button onClick={() => setOpen(open === "p" ? null : "p")} className="flex items-center gap-2 rounded-xl pl-1 pr-2 py-1 hover:bg-white/10 transition">
              <span className="grid place-items-center w-8 h-8 rounded-lg text-white text-xs font-bold" style={{ background: role.color }}>{role.avatar}</span>
              <Icon name="chevron" size={14} className="opacity-50 hidden sm:block" />
            </button>
            <Popover open={open === "p"} onClose={() => setOpen(null)}>
              <div className="flex items-center gap-3 p-2">
                <span className="grid place-items-center w-10 h-10 rounded-xl text-white font-bold" style={{ background: role.color }}>{role.avatar}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{role.label}</div>
                  <div className="text-[11px] opacity-60 truncate">{email}</div>
                </div>
              </div>
              <div className="my-2 h-px bg-white/10" />
              <button onClick={onHome} className="w-full flex items-center gap-3 rounded-lg px-2 py-2 text-sm chrome-hover"><Icon name="grid" size={16} />All workspaces</button>
              <div className="flex items-center justify-between rounded-lg px-2 py-2 text-sm">
                <span className="flex items-center gap-3"><Icon name={theme === "dark" ? "moon" : "sun"} size={16} />Theme</span>
                <Toggle on={theme === "dark"} onChange={(v) => setTheme(v ? "dark" : "light")} />
              </div>
              <button onClick={onLogout} className="w-full flex items-center gap-3 rounded-lg px-2 py-2 text-sm chrome-hover text-rose-400"><Icon name="logout" size={16} />Sign out</button>
            </Popover>
          </div>
        </div>
      </header>
    );
  }

  function Workspace({ roleKey, email, moduleId, onOpen, onHome, onLogout, theme, setTheme, onOpenSearch }) {
    const mod = VG.MODULE_BY_ID[moduleId];
    const [collapsed, setCollapsed] = useState(() => {
      try { return localStorage.getItem(SIDEBAR_KEY) === "1"; } catch (e) { return false; }
    });
    const [hoverExpand, setHoverExpand] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => { setAccent(mod ? mod.accent : "#6366f1"); }, [moduleId]);
    useEffect(() => { setMobileOpen(false); }, [moduleId]);
    useEffect(() => {
      try { localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0"); } catch (e) {}
    }, [collapsed]);

    return (
      <div className={"min-h-screen flex vg-app-shell " + (theme === "light" ? "text-slate-800" : "text-slate-100")}
        style={{ background: theme === "light"
          ? "radial-gradient(1200px 600px at 80% -10%, #e9eefb, #f4f6fc)"
          : "radial-gradient(1200px 600px at 80% -10%, #131c33, #0b1120)" }}>
        <Sidebar roleKey={roleKey} activeId={moduleId} onOpen={onOpen} onHome={onHome}
          collapsed={collapsed} setCollapsed={setCollapsed} hoverExpand={hoverExpand} setHoverExpand={setHoverExpand}
          mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
        <div className="flex-1 min-w-0 flex flex-col">
          <Topbar roleKey={roleKey} email={email} mod={mod} onHome={onHome} onToggleMobile={() => setMobileOpen(true)}
            theme={theme} setTheme={setTheme} onLogout={onLogout} onOpenSearch={onOpenSearch} />
          <main className="flex-1 p-4 sm:p-6 max-w-[1500px] w-full mx-auto">
            {mod ? <VG.ModuleWorkspace key={moduleId} mod={mod} roleKey={roleKey} /> : <div className="opacity-60">Module not found.</div>}
          </main>
        </div>
      </div>
    );
  }

  /* ---------------- License activation gate ---------------- */
  function ActivationScreen({ onActivated }) {
    VG.useDB();
    const lic = VG.store.isLicensed();
    const trialEnd = (VG.store.settings().activation || {}).trialEndsAt;
    const [startingTrial, setStartingTrial] = useState(false);
    useEffect(() => {
      if (lic.ok && onActivated) onActivated();
    }, [lic.ok]);
    function beginTrial() {
      if (startingTrial || !VG.store.startEvaluationTrial) return;
      setStartingTrial(true);
      try {
        const res = VG.store.startEvaluationTrial("installer");
        if (res && res.ok) {
          VG.toast("14-day evaluation trial started", "success");
          onActivated && onActivated();
        }
      } finally {
        setStartingTrial(false);
      }
    }
    if (lic.ok) return null;
    return (
      <div className="relative min-h-screen flex items-center justify-center p-6">
        <img src={HERO} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-ink-950/90" />
        <div className="relative z-10 w-full max-w-lg glass-dark rounded-2xl p-8 animate-scale-in">
          <div className="flex items-center gap-3 mb-6">
            <img src={LOGO} alt="" className="h-10" />
            <div>
              <h1 className="text-xl font-display font-bold">Activate Veraglo ERP</h1>
              <p className="text-sm opacity-60">Install on this computer with your license</p>
            </div>
          </div>
          {lic.expired && <Card className="p-3 mb-4 border border-amber-500/40 text-sm text-amber-200">{lic.reason}</Card>}
          <Card className="p-4 mb-4 border border-indigo-500/30 text-sm">
            <p className="font-medium text-indigo-100">New installation?</p>
            <p className="text-xs opacity-70 mt-1">Start the built-in evaluation trial to reach login and create your administrator account.</p>
            <Button className="mt-3 !py-2" icon="check" onClick={beginTrial} disabled={startingTrial}>
              {startingTrial ? "Starting…" : "Continue with 14-day evaluation trial"}
            </Button>
          </Card>
          {VG.ActivationForm ? <VG.ActivationForm onDone={() => onActivated && onActivated()} compact /> : <p className="text-sm opacity-60">Loading activation…</p>}
          {trialEnd && (
            <p className="text-xs opacity-45 mt-4 text-center">Evaluation trial available until {trialEnd}.</p>
          )}
        </div>
      </div>
    );
  }

  /* ---------------- Root ---------------- */
  function App() {
    const [theme, setThemeState] = useState(() => {
      try { return JSON.parse(localStorage.getItem(STORE) || "{}").theme || "dark"; } catch (e) { return "dark"; }
    });
    const [session, setSession] = useState(() => {
      try {
        const s = JSON.parse(localStorage.getItem(STORE) || "{}");
        if (!s.roleKey || !s.userId) return null;
        if (s.uiRev !== UI_REV) {
          s.uiRev = UI_REV;
          s.moduleId = null;
          localStorage.setItem(STORE, JSON.stringify(s));
        }
        return s;
      } catch (e) { return null; }
    });
    const [moduleId, setModuleId] = useState(() => {
      try {
        const s = JSON.parse(localStorage.getItem(STORE) || "{}");
        if (s.roleKey && s.uiRev === UI_REV) return s.moduleId || null;
      } catch (e) {}
      return null;
    });
    const [searchOpen, setSearchOpen] = useState(false);
    const [licensed, setLicensed] = useState(true);
    const [needsSetup, setNeedsSetup] = useState(false);

    useEffect(() => {
      if (!VG.store) return;
      const check = () => setNeedsSetup(!VG.store.hasLoginUsers());
      check();
      return VG.store.subscribe(check);
    }, []);

    const setTheme = (t) => { setThemeState(t); applyTheme(t); persist({ theme: t }); };
    function persist(patch) {
      try {
        const cur = JSON.parse(localStorage.getItem(STORE) || "{}");
        localStorage.setItem(STORE, JSON.stringify({ ...cur, ...patch }));
      } catch (e) {}
    }

    useEffect(() => { applyTheme(theme); }, []);

    useEffect(() => {
      if (!VG.store) return;
      const check = () => setLicensed(VG.store.isLicensed().ok);
      check();
      return VG.store.subscribe(check);
    }, []);

    useEffect(() => {
      if (!session || !VG.store) return;
      const check = () => {
        const v = VG.store.validateSession(session);
        if (!v.ok) {
          VG.toast(v.reason || "Session ended", "error");
          logout(true);
        }
      };
      check();
      const unsub = VG.store.subscribe(check);
      return () => unsub();
    }, [session]);

    useEffect(() => {
      if (!session || !VG.store) return;
      const sid = session.sessionId || ("ses-" + Date.now());
      if (!session.sessionId) persist({ ...session, sessionId: sid });
      const beat = () => {
        const res = VG.store.sessionHeartbeat({
          sessionId: sid, userId: session.userId, email: session.email, roleKey: session.roleKey,
          moduleId: moduleId || "", machineId: VG.getMachineId && VG.getMachineId(),
          machineName: VG.getMachineLabel && VG.getMachineLabel(),
          since: session.since || Date.now(),
        });
        if (res && res.ok === false) logout(true);
      };
      beat();
      const t = setInterval(beat, 60000);
      return () => clearInterval(t);
    }, [session, moduleId]);

    async function login(loginId, password) {
      const lic = VG.store && VG.store.isLicensed ? VG.store.isLicensed() : { ok: true };
      if (!lic.ok) {
        VG.toast(lic.reason || "License required", "error");
        return;
      }
      const v = VG.store && VG.store.validateLogin
        ? await VG.store.validateLogin(loginId, password)
        : { ok: false, reason: "Authentication unavailable" };
      if (!v.ok) {
        VG.toast(v.reason || "Sign-in failed", "error");
        return;
      }
      if (VG.store && VG.store.recordLogin) VG.store.recordLogin(loginId, v.roleKey, true, { user: v.user, ip: "" });
      if (VG.store && VG.store.syncAllRolesToRuntime) VG.store.syncAllRolesToRuntime();
      const roleKey = v.roleKey;
      const role = VG.ROLES[roleKey];
      if (!role || !VG.modulesForRole(roleKey).length) {
        VG.toast("No module access for this role — check Admin → Roles", "error");
        return;
      }
      const s = {
        userId: v.user.id, roleKey, email: v.email, name: v.user.name, userIdLabel: v.user.userId,
        moduleId: null, uiRev: UI_REV, sessionId: "ses-" + Date.now(), since: Date.now(),
      };
      setSession(s); setModuleId(null); persist(s);
    }
    function logout(silent) {
      if (session && VG.store && VG.store.endSession) VG.store.endSession(session.sessionId);
      setSession(null); setModuleId(null);
      clearAuthCache();
      setAccent("#6366f1");
      if (!silent) VG.toast("Signed out", "info");
    }
    function openModule(id) {
      const allowed = VG.modulesForRole(session.roleKey).some((m) => m.id === id);
      if (!allowed || !VG.can(session.roleKey, "view", id)) {
        VG.toast("You do not have permission to open this module", "error");
        return;
      }
      if (VG.store && VG.store.recordModuleOpen) {
        VG.store.recordModuleOpen(session.roleKey, id, session.roleKey);
      }
      setModuleId(id); persist({ moduleId: id });
    }
    function goHome() { setModuleId(null); persist({ moduleId: null }); setAccent("#6366f1"); }
    VG._openModule = openModule;
    const openSearch = () => setSearchOpen(true);
    VG._openSearch = openSearch;

    let screen;
    if (!licensed) screen = <ActivationScreen onActivated={() => setLicensed(true)} />;
    else if (!session && needsSetup) screen = <InitialSetup onComplete={login} theme={theme} setTheme={setTheme} />;
    else if (!session) screen = <Login onLogin={login} theme={theme} setTheme={setTheme} needsSetup={needsSetup} />;
    else if (!moduleId) screen = (VG.WelcomeHome ? <VG.WelcomeHome roleKey={session.roleKey} email={session.email} onOpen={openModule} onLogout={logout} theme={theme} setTheme={setTheme} onOpenSearch={openSearch} /> : <Launcher roleKey={session.roleKey} email={session.email} onOpen={openModule} onLogout={logout} theme={theme} setTheme={setTheme} onOpenSearch={openSearch} />);
    else screen = <Workspace roleKey={session.roleKey} email={session.email} moduleId={moduleId} onOpen={openModule} onHome={goHome} onLogout={logout} theme={theme} setTheme={setTheme} onOpenSearch={openSearch} />;
    const SearchModal = VG.UniversalSearch;
    const FX = VG.fx;
    return (
      <>
        {screen}
        {session && SearchModal && <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} roleKey={session.roleKey} />}
        {FX && <FX.Toaster />}
        {FX && <FX.Confirmer />}
      </>
    );
  }

  class BootErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { err: null }; }
    static getDerivedStateFromError(err) { return { err }; }
    render() {
      if (this.state.err) {
        return (
          <div style={{ padding: 24, fontFamily: "Inter, sans-serif", color: "#fecaca", background: "#0b1120", minHeight: "100vh" }}>
            <h1 style={{ color: "#f8fafc", fontSize: 18, marginBottom: 8 }}>Veraglo ERP could not start</h1>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, opacity: 0.9 }}>{this.state.err.message || String(this.state.err)}</pre>
            <p style={{ fontSize: 12, opacity: 0.5, marginTop: 16 }}>Hard-refresh the page (Cmd+Shift+R). If this persists, check the browser console.</p>
          </div>
        );
      }
      return this.props.children;
    }
  }

  VG.bootApp = function bootApp() {
    const el = document.getElementById("root");
    const root = ReactDOM.createRoot(el);
    root.render(
      <BootErrorBoundary>
        <App />
      </BootErrorBoundary>
    );
  };
})(window.VG);
