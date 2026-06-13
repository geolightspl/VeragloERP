/* Veraglo ERP — Simplified module-based navigation with dropdown selector. */
(function (VG) {
  const { useState, useEffect, useRef } = React;
  const { Icon } = VG.ui;

  VG.MODULE_BANNER_IMG = {}; // All banner images disabled

  /* Simple horizontal navigation with all sections visible */
  function SimpleModuleNav({ sections, section, setSection, mod }) {
    const accent = mod?.accent || "#6366f1";

    useEffect(() => {
      document.documentElement.style.setProperty("--accent", accent);
    }, [accent]);

    function selectSection(id) {
      setSection(id);
    }

    const current = sections.find((s) => s.id === section);
    const dash = sections.find((s) => s.id === "dashboard");

    return (
      <nav className="vg-simple-nav sticky top-0 z-30 bg-white/[0.05] border-b border-white/10 backdrop-blur-md">
        <div className="max-w-full px-4 sm:px-6 py-3 flex items-center gap-2 overflow-x-auto">
          {/* Dashboard button */}
          {dash && (
            <button
              type="button"
              onClick={() => selectSection("dashboard")}
              className={"inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap " + (section === "dashboard" ? "text-white shadow-md" : "text-white/70 hover:text-white hover:bg-white/10")}
              style={section === "dashboard" ? { background: accent } : undefined}
            >
              <Icon name="chart" size={16} />
              <span>Dashboard</span>
            </button>
          )}

          {/* Module sections as clean buttons */}
          {sections.filter((s) => s.id !== "dashboard").map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectSection(s.id)}
              className={"inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap " + (s.id === section ? "text-white shadow-md" : "text-white/60 hover:text-white/80 hover:bg-white/10")}
              style={s.id === section ? { background: accent } : undefined}
              title={s.label}
            >
              <Icon name={s.icon || "grid"} size={15} />
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
        </div>
      </nav>
    );
  }

  VG.SimpleModuleNav = SimpleModuleNav;
  VG.ModuleNav = SimpleModuleNav; // For backward compatibility
})(window.VG);
