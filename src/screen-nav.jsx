/* Veraglo ERP — internal screen navigation: full-page views, breadcrumbs, list state. */
(function (VG) {
  const { useState, useEffect, useRef, useCallback, useMemo } = React;
  const ui = VG.ui;
  const { Icon, Button } = ui;

  const _tableStates = {};
  const _openRecords = {};

  function getTableState(tableId) {
    if (!tableId) return {};
    if (_tableStates[tableId]) return { ..._tableStates[tableId] };
    try {
      const raw = sessionStorage.getItem("vg-tbl:" + tableId);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveTableState(tableId, patch) {
    if (!tableId) return;
    const next = { ...getTableState(tableId), ...patch, ts: Date.now() };
    _tableStates[tableId] = next;
    try {
      sessionStorage.setItem("vg-tbl:" + tableId, JSON.stringify(next));
    } catch (e) { /* quota */ }
  }

  function registerOpenRecord(screenKey, recordId) {
    if (!screenKey) return;
    _openRecords[screenKey] = recordId || null;
  }

  function getOpenRecord(screenKey) {
    return screenKey ? _openRecords[screenKey] : null;
  }

  function useListDetail(screenKey, resolveRecord) {
    const [viewId, setViewId] = useState(null);
    const [tick, setTick] = useState(0);

    const openView = useCallback((recordOrId) => {
      const id = recordOrId && typeof recordOrId === "object" ? recordOrId.id : recordOrId;
      if (!id) return;
      registerOpenRecord(screenKey, id);
      setViewId((prev) => {
        if (prev === id) {
          setTick((t) => t + 1);
          return prev;
        }
        return id;
      });
    }, [screenKey]);

    const closeView = useCallback(() => {
      registerOpenRecord(screenKey, null);
      setViewId(null);
    }, [screenKey]);

    const refreshView = useCallback(() => setTick((t) => t + 1), []);

    const viewRecord = useMemo(() => {
      if (!viewId) return null;
      if (typeof resolveRecord === "function") return resolveRecord(viewId);
      return null;
    }, [viewId, tick, resolveRecord]);

    return { viewId, viewRecord, openView, closeView, refreshView, isOpen: !!viewId };
  }

  function Breadcrumbs({ items }) {
    if (!items || !items.length) return null;
    return (
      <nav className="vg-breadcrumbs flex flex-wrap items-center gap-1.5 text-[11px] opacity-65 mb-2" aria-label="Breadcrumb">
        {items.map((item, i) => (
          <React.Fragment key={item.label + i}>
            {i > 0 && <Icon name="chevronRight" size={11} className="opacity-35 shrink-0" />}
            {item.onClick ? (
              <button type="button" onClick={item.onClick} className="hover:text-[var(--accent)] hover:opacity-100 transition truncate max-w-[200px]">
                {item.label}
              </button>
            ) : (
              <span className={i === items.length - 1 ? "text-[var(--accent)] opacity-90 font-medium truncate max-w-[240px]" : "truncate max-w-[200px]"}>{item.label}</span>
            )}
          </React.Fragment>
        ))}
      </nav>
    );
  }

  function FullPage({ when, screen, children }) {
    return when ? screen : children;
  }

  function mainOverlayTarget() {
    if (typeof document === "undefined") return null;
    return document.getElementById("vg-main-content") || document.getElementById("vg-app-root");
  }

  function InternalScreen({
    onBack,
    backLabel = "Back",
    title,
    subtitle,
    children,
    footer,
    dirty = false,
    className = "",
    bodyClassName = "",
    breadcrumbs,
    actions,
  }) {
    const [guard, setGuard] = useState(false);
    useEffect(() => { setGuard(false); }, [title]);

    useEffect(() => {
      const h = (e) => {
        if (e.key !== "Escape" || !onBack) return;
        e.preventDefault();
        if (!dirty) onBack();
        else setGuard((g) => { if (g) { onBack(); return false; } return true; });
      };
      document.addEventListener("keydown", h);
      return () => document.removeEventListener("keydown", h);
    }, [dirty, onBack]);

    const requestBack = () => {
      if (dirty) setGuard(true);
      else onBack && onBack();
    };

    return (
      <div className={"vg-internal-screen flex flex-col w-full min-h-0 animate-fade-up " + className}>
        <div className="vg-internal-screen-head vg-form-page-head flex flex-wrap items-start justify-between gap-3 mb-3 pb-3 border-b border-white/10 shrink-0">
          <div className="flex-1 min-w-0">
            {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
            {title && <h2 className="text-base sm:text-lg font-semibold font-display leading-tight truncate">{title}</h2>}
            {subtitle && <p className="text-xs opacity-60 mt-0.5 leading-snug">{subtitle}</p>}
          </div>
          <div className="vg-internal-screen-actions flex flex-wrap items-center gap-2 shrink-0 justify-end">
            {actions}
            {onBack && (
              <Button variant="soft" icon="chevronLeft" onClick={requestBack} className="shrink-0">
                {backLabel}
              </Button>
            )}
          </div>
        </div>
        {guard && (
          <div className="mb-4 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 animate-fade-up">
            <div className="flex items-start gap-3">
              <Icon name="alert" size={18} style={{ color: "#f59e0b" }} className="shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm">Unsaved changes</h4>
                <p className="text-sm opacity-70 mt-1">Go back without saving your changes?</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button variant="soft" onClick={() => setGuard(false)}>Keep editing</Button>
                  <button
                    type="button"
                    onClick={() => { setGuard(false); onBack && onBack(); }}
                    className="inline-flex items-center gap-2 rounded-xl text-sm font-medium px-3.5 py-2 text-white"
                    style={{ background: "#ef4444" }}
                  >
                    Discard & go back
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className={"vg-internal-screen-body flex-1 min-h-0 overflow-y-auto overflow-x-hidden " + bodyClassName}>
          {children}
        </div>
        {footer && (
          <div className="vg-internal-screen-foot vg-sticky-action-bar flex flex-wrap justify-end gap-2 pt-3 mt-auto border-t border-white/10 shrink-0 sticky bottom-0 z-10 bg-[color-mix(in_srgb,var(--vg-bg)_92%,transparent)] backdrop-blur-sm pb-2 px-1">
            {footer}
          </div>
        )}
      </div>
    );
  }

  /** Renders a full-width inline page in the main workspace (no overlay portal). */
  function MainFullPage({ open, onClose, children, className = "" }) {
    if (!open) return null;
    return (
      <div className={"vg-main-fullpage w-full max-w-none animate-fade-up " + className}>
        <div className="w-full">{children}</div>
      </div>
    );
  }

  VG.getTableState = getTableState;
  VG.saveTableState = saveTableState;
  VG.registerOpenRecord = registerOpenRecord;
  VG.getOpenRecord = getOpenRecord;
  VG.useListDetail = useListDetail;
  VG.InternalScreen = InternalScreen;
  VG.Breadcrumbs = Breadcrumbs;
  VG.FullPage = FullPage;
  VG.MainFullPage = MainFullPage;
  VG.mainOverlayTarget = mainOverlayTarget;

  if (VG.fx) {
    VG.fx.InternalScreen = InternalScreen;
    VG.fx.useListDetail = useListDetail;
    VG.fx.Breadcrumbs = Breadcrumbs;
    VG.fx.FullPage = FullPage;
    VG.fx.MainFullPage = MainFullPage;
  }
})(window.VG);
