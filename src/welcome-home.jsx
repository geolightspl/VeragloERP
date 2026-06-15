/* Veraglo ERP — post-login module home (5×3 grid, no vertical list). */
(function (VG) {
  const { useState, useMemo, useEffect } = React;
  const { Icon } = VG.ui;
  const store = VG.store;
  const LOGO = "assets/veraglo-logo.png";
  const MODULE_HERO = "assets/module-home-hero.png";

  function moduleHomeRank(id, homeOrder) {
    const idx = (homeOrder || []).indexOf(id);
    return idx >= 0 ? idx : 999;
  }

  function sortModulesForHome(mods, prefs) {
    const homeOrder = VG.MODULE_HOME_ORDER || [];
    const customOrder = prefs.moduleOrder || [];
    return mods.slice().sort((a, b) => {
      const ac = customOrder.indexOf(a.id);
      const bc = customOrder.indexOf(b.id);
      if (ac >= 0 && bc >= 0) return ac - bc;
      if (ac >= 0) return -1;
      if (bc >= 0) return 1;
      return moduleHomeRank(a.id, homeOrder) - moduleHomeRank(b.id, homeOrder);
    });
  }

  function ModuleHomeCard({ mod, onOpen, i, pinned, onTogglePin, highlight }) {
    return (
      <button
        type="button"
        onClick={() => onOpen(mod.id)}
        className={
          "group relative w-full h-full text-left rounded-xl p-4 sm:p-5 min-h-[148px] flex flex-col transition-all duration-200 "
          + "hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99] animate-fade-up overflow-hidden vg-home-module-card "
          + (highlight ? "ring-2 ring-indigo-400/40" : "")
          + (pinned ? " ring-1 ring-amber-400/25" : "")
        }
        style={{ animationDelay: Math.min(i, 14) * 30 + "ms", "--mod-accent": mod.accent }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="relative flex items-start justify-between gap-2">
          <span
            className="grid place-items-center w-11 h-11 sm:w-12 sm:h-12 rounded-xl text-white shadow-md shrink-0 transition-transform group-hover:scale-105"
            style={{ background: mod.accent }}
          >
            <Icon name={mod.icon} size={22} />
          </span>
          {onTogglePin && (
            <span
              role="button"
              tabIndex={0}
              title={pinned ? "Remove from favorites" : "Add to favorites"}
              onClick={(e) => { e.stopPropagation(); onTogglePin(mod.id); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onTogglePin(mod.id); } }}
              className={
                "p-1.5 rounded-lg transition shrink-0 "
                + (pinned ? "text-amber-400 bg-amber-400/15" : "opacity-35 hover:opacity-100 hover:bg-white/10")
              }
            >
              <Icon name="star" size={15} />
            </span>
          )}
        </div>
        <div className="relative mt-3 flex-1 flex flex-col min-h-0">
          <div className="font-display font-semibold text-sm sm:text-[15px] leading-snug text-balance break-words">{mod.name}</div>
          {(mod.tagline || mod.category) && (
            <div className="mt-1 text-[11px] sm:text-xs opacity-55 leading-relaxed line-clamp-2">{mod.tagline || mod.category}</div>
          )}
        </div>
        <div className="relative mt-2 flex items-center justify-end text-[10px] font-medium opacity-0 group-hover:opacity-70 transition">
          <span className="inline-flex items-center gap-0.5">
            Open <Icon name="chevronRight" size={12} className="group-hover:translate-x-0.5 transition-transform" />
          </span>
        </div>
      </button>
    );
  }

  function WelcomeHome({ roleKey, email, userId, name, onOpen, onLogout, theme, setTheme, onOpenSearch }) {
    const dbTick = VG.useDB();
    const role = VG.ROLES[roleKey] || {};
    const company = store.company();
    const mods = VG.modulesForRole(roleKey);
    const prefs = store.dashboardPrefs(roleKey);
    const pinnedSet = useMemo(() => new Set(prefs.pinnedModules || []), [prefs.pinnedModules, roleKey]);
    const [query, setQuery] = useState("");
    const [entered, setEntered] = useState(false);

    useEffect(() => {
      const t = setTimeout(() => setEntered(true), 40);
      return () => clearTimeout(t);
    }, []);

    function togglePin(id) {
      const cur = prefs.pinnedModules || [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat(id);
      store.saveDashboardPrefs(roleKey, { pinnedModules: next }, roleKey);
      VG.toast(next.includes(id) ? "Added to favorites" : "Removed from favorites");
    }

    const sortedMods = useMemo(() => sortModulesForHome(mods, prefs), [mods, prefs.moduleOrder, dbTick]);
    const modById = useMemo(() => {
      const map = {};
      mods.forEach((m) => { map[m.id] = m; });
      return map;
    }, [mods.length]);

    const filteredMods = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return sortedMods;
      return sortedMods.filter((m) =>
        (m.name + " " + m.tagline + " " + m.category + " " + m.id).toLowerCase().includes(q)
      );
    }, [sortedMods, query]);

    const gridMods = useMemo(() => {
      if (query.trim()) return filteredMods;
      const pinned = filteredMods.filter((m) => pinnedSet.has(m.id));
      const rest = filteredMods.filter((m) => !pinnedSet.has(m.id));
      return pinned.concat(rest);
    }, [filteredMods, pinnedSet, query]);

    const recentMods = useMemo(() => {
      return (prefs.recentModules || [])
        .map((id) => modById[id])
        .filter(Boolean)
        .filter((m) => !query.trim() || filteredMods.some((x) => x.id === m.id))
        .slice(0, 5);
    }, [prefs.recentModules, modById, filteredMods, query]);

    const lastMod = prefs.lastModuleId && modById[prefs.lastModuleId] ? modById[prefs.lastModuleId] : null;
    const displayName = (name && String(name).trim()) || (email || "").split("@")[0].replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const pinnedCount = gridMods.filter((m) => pinnedSet.has(m.id)).length;

    return (
      <div className={"relative min-h-screen overflow-x-hidden text-slate-100 vg-module-home " + (entered ? "vg-welcome-in" : "opacity-0")}>
        <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-indigo-950/90 to-slate-900" />
        <div className="fixed inset-0 vg-module-home-bg" style={{ backgroundImage: "url(" + MODULE_HERO + ")" }} aria-hidden="true" />
        <div className="fixed inset-0 vg-welcome-bg pointer-events-none" aria-hidden="true" />

        <div className="relative z-10 min-h-screen flex flex-col">
          <header className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-8 py-3 border-b border-white/[0.08] bg-black/25 backdrop-blur-md">
            <button type="button" onClick={() => {}} className="flex items-center gap-3 min-w-0 text-left" title="Home Dashboard">
              <img src={company.logo || LOGO} alt="" className="h-8 w-auto shrink-0" />
              <div className="min-w-0 hidden sm:block">
                <div className="font-display font-semibold text-sm truncate">{company.tradeName || company.name || "Veraglo ERP"}</div>
              </div>
            </button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onOpenSearch} className="hidden sm:flex items-center gap-2 rounded-xl px-3 py-2 text-xs bg-white/[0.06] border border-white/10 hover:bg-white/10 transition">
                <Icon name="search" size={15} />
                <span className="opacity-70">Search ERP</span>
                <kbd className="opacity-35 text-[10px]">⌘K</kbd>
              </button>
              {VG.AppUserMenu ? (
                <VG.AppUserMenu roleKey={roleKey} email={email} userId={userId} name={name} theme={theme} setTheme={setTheme} onLogout={onLogout} showHome={false} compact />
              ) : (
                <button type="button" onClick={onLogout} className="rounded-xl p-2 bg-white/[0.06] border border-white/10 hover:bg-white/10" title="Sign out">
                  <Icon name="logout" size={17} />
                </button>
              )}
            </div>
          </header>

          <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-5 sm:py-6">
            <div className="max-w-[1440px] mx-auto space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="text-xl sm:text-2xl font-display font-bold text-white">
                    {VG.greeting()}, {displayName}
                  </h1>
                  <p className="mt-1 text-sm text-white/55">
                    {role.label} · {mods.length} module{mods.length === 1 ? "" : "s"} available
                  </p>
                </div>
                {lastMod && !query && (
                  <button
                    type="button"
                    onClick={() => onOpen(lastMod.id)}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium bg-white text-slate-900 shadow-md hover:shadow-lg transition"
                  >
                    <Icon name={lastMod.icon} size={16} />
                    Continue {lastMod.name}
                  </button>
                )}
              </div>

              <div className="vg-module-home-hero animate-fade-up">
                <img src={MODULE_HERO} alt="Team collaborating in a modern manufacturing workspace" className="vg-module-home-hero-img" loading="eager" />
                <div className="vg-module-home-hero-shade" aria-hidden="true" />
                <div className="vg-module-home-hero-copy">
                  <span className="vg-module-home-hero-badge">Ready when you are</span>
                  <h2 className="vg-module-home-hero-title">Choose a module and make today count.</h2>
                  <p className="vg-module-home-hero-text">Sales, production, quality, inventory and more — every module is built for focused, high-energy work.</p>
                </div>
              </div>

              {mods.length > 5 && (
                <div className="relative max-w-md">
                  <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter modules…"
                    className="w-full rounded-xl pl-10 pr-3 py-2.5 text-sm bg-white/[0.06] border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:border-indigo-400/50"
                  />
                </div>
              )}

              <section>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider opacity-45">
                    {query ? `Results (${gridMods.length})` : "Modules"}
                  </h2>
                  {!query && pinnedCount > 0 && (
                    <span className="text-[10px] opacity-40 flex items-center gap-1">
                      <Icon name="star" size={11} className="text-amber-400" /> {pinnedCount} favorite{pinnedCount === 1 ? "" : "s"} shown first
                    </span>
                  )}
                </div>
                {gridMods.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-12 text-center text-sm opacity-55">
                    No modules match your search.
                  </div>
                ) : (
                  <div className="vg-home-module-grid">
                    {gridMods.map((m, i) => (
                      <ModuleHomeCard
                        key={m.id}
                        mod={m}
                        onOpen={onOpen}
                        i={i}
                        pinned={pinnedSet.has(m.id)}
                        onTogglePin={togglePin}
                        highlight={!query && m.id === prefs.lastModuleId}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          </main>
        </div>
      </div>
    );
  }

  VG.WelcomeHome = WelcomeHome;
  VG.sortModulesForHome = sortModulesForHome;
})(window.VG);
