/* Veraglo ERP — role permission matrix: select-all, groups, sections, dependencies. */
(function (VG) {
  const { useState, useMemo, useEffect, useRef } = React;
  const { Icon, Button, Pill, Card } = VG.ui;
  const { Field, Text, Checkbox } = VG.fx;

  const ALL_ACTIONS = ["view", "add", "edit", "delete", "approve", "reject", "print", "export", "import", "email", "settings"];
  const REQUIRES_VIEW = ["add", "edit", "delete", "approve", "reject", "print", "export", "import", "email", "settings"];

  const GROUP_TO_APP = {
    Sales: "sales", Procurement: "purchase", Inventory: "inventory", Manufacturing: "production",
    Operations: "dispatch", Finance: "accounts", People: "hr", System: "admin",
  };

  const clone = (x) => JSON.parse(JSON.stringify(x));

  function permCols() { return VG.ADMIN_PERM_COLS || []; }
  function permMods() { return VG.ADMIN_MODULES || []; }

  function groupModules(mods) {
    const map = {};
    mods.forEach((m) => {
      const g = m.group || "Other";
      if (!map[g]) map[g] = [];
      map[g].push(m);
    });
    return Object.keys(map).sort().map((name) => ({ name, modules: map[name], appId: GROUP_TO_APP[name] || null }));
  }

  function isModEnabled(draft, modId) {
    if (draft.moduleAccess === "all") return true;
    const list = Array.isArray(draft.moduleAccess) ? draft.moduleAccess : [];
    const appIds = { quotation: "sales", proforma: "sales", salesOrder: "sales", customer: "sales", purchaseRequest: "purchase", purchaseOrder: "purchase", item: "inventory", workOrder: "production", qcInspection: "quality", deliveryChallan: "dispatch", invoice: "accounts", salarySlip: "hr", leave: "hr", employee: "hr", templates: "admin", masterData: "admin", backup: "admin" };
    const mapped = appIds[modId] || modId;
    return list.includes(mapped) || list.includes(modId);
  }

  function setModEnabled(draft, modId, on) {
    if (draft.moduleAccess === "all" && !on) {
      const all = permMods().map((m) => m.id).filter((id) => id !== modId);
      return { ...draft, moduleAccess: all };
    }
    const list = draft.moduleAccess === "all" ? permMods().map((m) => m.id) : (Array.isArray(draft.moduleAccess) ? draft.moduleAccess.slice() : []);
    const appIds = { quotation: "sales", proforma: "sales", salesOrder: "sales", customer: "sales", purchaseRequest: "purchase", purchaseOrder: "purchase", item: "inventory", workOrder: "production", qcInspection: "quality", deliveryChallan: "dispatch", invoice: "accounts", salarySlip: "hr", leave: "hr", employee: "hr", templates: "admin", masterData: "admin", backup: "admin" };
    const mapped = appIds[modId] || modId;
    const ids = on
      ? Array.from(new Set(list.concat([modId, mapped])))
      : list.filter((id) => id !== modId && id !== mapped);
    return { ...draft, moduleAccess: ids };
  }

  function getModPerm(draft, modId, action) {
    const p = draft.permissions && draft.permissions[modId];
    if (p && p[action] === true) return true;
    if (p && p[action] === false) return false;
    if (!isModEnabled(draft, modId)) return false;
    return (draft.actions || []).includes(action);
  }

  function setModPerm(draft, modId, action, value) {
    const perms = clone(draft.permissions || {});
    if (!perms[modId]) perms[modId] = {};
    if (value) {
      if (REQUIRES_VIEW.includes(action)) perms[modId].view = true;
      perms[modId][action] = true;
      let d = setModEnabled(draft, modId, true);
      const actions = Array.from(new Set((d.actions || []).concat([action, "view"])));
      return { ...d, permissions: perms, actions };
    }
    if (action === "view") {
      REQUIRES_VIEW.forEach((a) => { delete perms[modId][a]; });
      perms[modId].view = false;
    } else {
      perms[modId][action] = false;
    }
    return { ...draft, permissions: perms };
  }

  function setAllModPerms(draft, modId, on) {
    const cols = permCols();
    let d = draft;
    if (on) {
      d = setModEnabled(d, modId, true);
      const perms = clone(d.permissions || {});
      if (!perms[modId]) perms[modId] = {};
      cols.forEach((c) => { perms[modId][c.key] = true; });
      const actions = Array.from(new Set((d.actions || []).concat(cols.map((c) => c.key))));
      return { ...d, permissions: perms, actions };
    }
    const perms = clone(d.permissions || {});
    delete perms[modId];
    return { ...d, permissions: perms };
  }

  function modPermState(draft, modId) {
    const cols = permCols();
    const n = cols.filter((c) => getModPerm(draft, modId, c.key)).length;
    if (n === 0) return "none";
    if (n === cols.length) return "all";
    return "some";
  }

  function groupPermState(draft, modules) {
    const states = modules.map((m) => modPermState(draft, m.id));
    if (states.every((s) => s === "all")) return "all";
    if (states.every((s) => s === "none")) return "none";
    return "some";
  }

  function colPermState(draft, modules, action) {
    const vis = modules.filter((m) => isModEnabled(draft, m.id) || getModPerm(draft, m.id, "view"));
    const list = vis.length ? vis : modules;
    const n = list.filter((m) => getModPerm(draft, m.id, action)).length;
    if (n === 0) return "none";
    if (n === list.length) return "all";
    return "some";
  }

  function grantAllAccess() {
    const mods = permMods();
    const cols = permCols();
    const perms = {};
    mods.forEach((m) => {
      perms[m.id] = {};
      cols.forEach((c) => { perms[m.id][c.key] = true; });
    });
    return {
      permissions: perms,
      actions: ALL_ACTIONS.slice(),
      moduleAccess: "all",
      sectionAccess: {},
    };
  }

  function clearAllAccess() {
    return { permissions: {}, actions: ["view"], moduleAccess: [], sectionAccess: {} };
  }

  function setAllActions(draft, on) {
    const cols = permCols();
    if (on) {
      const perms = clone(draft.permissions || {});
      permMods().forEach((m) => {
        if (!perms[m.id]) perms[m.id] = {};
        cols.forEach((c) => { perms[m.id][c.key] = true; });
      });
      return { ...draft, actions: ALL_ACTIONS.slice(), permissions: perms, moduleAccess: "all" };
    }
    return { ...draft, actions: ["view"], permissions: {} };
  }

  function setGroupPerms(draft, modules, on) {
    let d = draft;
    modules.forEach((m) => { d = setAllModPerms(d, m.id, on); });
    return d;
  }

  function setColPerms(draft, modules, action, on) {
    let d = draft;
    modules.forEach((m) => { d = setModPerm(d, m.id, action, on); });
    return d;
  }

  function sectionMode(draft, appId) {
    const sa = draft.sectionAccess || {};
    if (!Object.prototype.hasOwnProperty.call(sa, appId)) return "all";
    const list = sa[appId] || [];
    if (!list.length) return "none";
    return "restricted";
  }

  function isSectionOn(draft, appId, sectionId) {
    const mode = sectionMode(draft, appId);
    if (mode === "all") return true;
    if (mode === "none") return false;
    return (draft.sectionAccess[appId] || []).includes(sectionId);
  }

  function toggleSection(draft, appId, sectionId) {
    const sa = clone(draft.sectionAccess || {});
    const secs = ((VG.moduleSections && VG.moduleSections[appId]) || []).map((s) => s.id);
    let list;
    if (!Object.prototype.hasOwnProperty.call(sa, appId)) {
      list = secs.filter((id) => id !== sectionId);
    } else {
      list = (sa[appId] || []).slice();
      const i = list.indexOf(sectionId);
      if (i >= 0) list.splice(i, 1); else list.push(sectionId);
    }
    sa[appId] = list;
    return { ...draft, sectionAccess: sa };
  }

  function setAllSections(draft, appId, sectionIds, on) {
    const sa = clone(draft.sectionAccess || {});
    if (on) delete sa[appId];
    else sa[appId] = [];
    return { ...draft, sectionAccess: sa };
  }

  function sectionGroupState(draft, appId, sectionIds) {
    const mode = sectionMode(draft, appId);
    if (mode === "all") return "all";
    if (mode === "none") return "none";
    const allowed = draft.sectionAccess[appId] || [];
    const n = sectionIds.filter((id) => allowed.includes(id)).length;
    if (n === 0) return "none";
    if (n === sectionIds.length) return "all";
    return "some";
  }

  VG.PermUtils = {
    ALL_ACTIONS, REQUIRES_VIEW, grantAllAccess, clearAllAccess, getModPerm, setModPerm, setAllModPerms,
    setGroupPerms, setColPerms, setAllActions, isModEnabled, setModEnabled, groupModules,
  };

  function TriCheckbox({ checked, indeterminate, onChange, disabled, title, className }) {
    const ref = useRef(null);
    useEffect(() => {
      if (ref.current) ref.current.indeterminate = !!indeterminate;
    }, [indeterminate]);
    return (
      <input
        ref={ref}
        type="checkbox"
        title={title}
        checked={!!checked && !indeterminate}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className={"perm-cb " + (className || "")}
        aria-checked={indeterminate ? "mixed" : checked ? "true" : "false"}
      />
    );
  }

  function PermToolbar({ draft, setDraft, canEdit, filteredGroups, onWarn }) {
    const grantAll = draft.moduleAccess === "all" && (draft.actions || []).length >= ALL_ACTIONS.length;
    return (
      <div className="perm-toolbar sticky top-0 z-20 -mx-1 px-1 py-3 mb-3 rounded-xl border border-white/10 bg-[var(--card)]/95 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Pill color="#6366f1">Bulk selection</Pill>
          <span className="text-xs opacity-55">Assign or remove large permission sets in one click</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={grantAll ? "primary" : "soft"} className="!py-1.5" disabled={!canEdit}
            onClick={() => { setDraft(grantAllAccess()); VG.toast && VG.toast("Full access granted"); }}>
            Grant all access
          </Button>
          <Button variant="ghost" className="!py-1.5" disabled={!canEdit}
            onClick={() => { if (confirm("Clear all module and permission overrides for this role?")) { setDraft(clearAllAccess()); onWarn && onWarn("All access cleared"); } }}>
            Clear all
          </Button>
          <span className="w-px h-6 bg-white/10 self-center hidden sm:block" />
          <Button variant="soft" className="!py-1.5" disabled={!canEdit}
            onClick={() => setDraft((d) => ({ ...d, moduleAccess: "all" }))}>Select all modules</Button>
          <Button variant="ghost" className="!py-1.5" disabled={!canEdit}
            onClick={() => setDraft((d) => ({ ...d, moduleAccess: [] }))}>Deselect all modules</Button>
          <Button variant="soft" className="!py-1.5" disabled={!canEdit}
            onClick={() => setDraft((d) => setAllActions(d, true))}>Select all actions</Button>
          <Button variant="ghost" className="!py-1.5" disabled={!canEdit}
            onClick={() => setDraft((d) => setAllActions(d, false))}>Deselect all actions</Button>
        </div>
        {draft.moduleAccess === "all" && (
          <p className="text-[11px] mt-2 perm-hint">All application modules enabled. Fine-grained overrides below still apply where set.</p>
        )}
      </div>
    );
  }

  function SectionAccessRow({ draft, setDraft, appId, canEdit }) {
    const secs = (VG.moduleSections && VG.moduleSections[appId]) || [];
    if (!secs.length) return null;
    const ids = secs.map((s) => s.id);
    const st = sectionGroupState(draft, appId, ids);
    const mode = sectionMode(draft, appId);
    return (
      <tr className="perm-section-row">
        <td colSpan={permCols().length + 2} className="py-2 pl-6">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <TriCheckbox
              checked={st === "all"}
              indeterminate={st === "some"}
              disabled={!canEdit}
              title="Select all tabs in this module"
              onChange={(on) => setDraft((d) => setAllSections(d, appId, ids, on))}
            />
            <span className="text-xs font-medium opacity-80">Select all tabs / sections</span>
            {mode === "all" && <Pill color="#34d399">All tabs allowed</Pill>}
            {mode === "none" && <Pill color="#ef4444">No tabs (dashboard only)</Pill>}
          </div>
          <div className="flex flex-wrap gap-2">
            {secs.map((s) => {
              const on = isSectionOn(draft, appId, s.id);
              return (
                <label key={s.id} className={"perm-tab-chip " + (on ? "perm-tab-on" : "")}>
                  <TriCheckbox checked={on} disabled={!canEdit} onChange={() => setDraft((d) => toggleSection(d, appId, s.id))} />
                  <span className="text-xs">{s.label}</span>
                </label>
              );
            })}
          </div>
        </td>
      </tr>
    );
  }

  function PermissionMatrixEditor({ draft, setDraft, canEdit, search: searchProp }) {
    const [search, setSearch] = useState(searchProp || "");
    const [collapsed, setCollapsed] = useState({});
    const mods = permMods();
    const cols = permCols();
    const groups = useMemo(() => groupModules(mods), [mods.length]);

    const filteredGroups = useMemo(() => {
      const q = search.trim().toLowerCase();
      if (!q) return groups;
      return groups.map((g) => ({
        ...g,
        modules: g.modules.filter((m) =>
          m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || g.name.toLowerCase().includes(q)
        ),
      })).filter((g) => g.modules.length);
    }, [groups, search]);

    function toggleCollapse(name) {
      setCollapsed((c) => ({ ...c, [name]: !c[name] }));
    }

    return (
      <div className="perm-matrix-wrap">
        <PermToolbar draft={draft} setDraft={setDraft} canEdit={canEdit} filteredGroups={filteredGroups} />
        <div className="mb-3">
          <Field label="Search permissions" hint="Filter by module name, id or group">
            <Text value={search} onChange={setSearch} placeholder="e.g. inventory, sales order, approve…" />
          </Field>
        </div>
        <Card className="p-0 overflow-hidden perm-matrix-card">
          <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
            <table className="w-full text-xs perm-matrix-table">
              <thead className="perm-matrix-head sticky top-0 z-10">
                <tr>
                  <th className="text-left py-2.5 pl-3 pr-2 min-w-[200px]">Module / section</th>
                  <th className="py-2 px-1 text-center w-24">All</th>
                  {cols.map((c) => {
                    const visMods = filteredGroups.flatMap((g) => g.modules);
                    const st = colPermState(draft, visMods, c.key);
                    return (
                      <th key={c.key} className="py-2 px-1 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          <span>{c.label}</span>
                          <TriCheckbox
                            checked={st === "all"}
                            indeterminate={st === "some"}
                            disabled={!canEdit}
                            title={"Select all " + c.label}
                            onChange={(on) => setDraft((d) => {
                              let nd = d;
                              visMods.forEach((m) => { nd = setModPerm(nd, m.id, c.key, on); });
                              return nd;
                            })}
                          />
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map((g) => {
                  const gSt = groupPermState(draft, g.modules);
                  const isCollapsed = collapsed[g.name];
                  return (
                    <React.Fragment key={g.name}>
                      <tr className="perm-group-row">
                        <td colSpan={cols.length + 2} className="py-2 pl-2">
                          <button type="button" className="flex items-center gap-2 w-full text-left font-semibold text-[11px] uppercase tracking-wider perm-group-label" onClick={() => toggleCollapse(g.name)}>
                            <Icon name={isCollapsed ? "chevronRight" : "chevron"} size={14} />
                            <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                              <TriCheckbox
                                checked={gSt === "all"}
                                indeterminate={gSt === "some"}
                                disabled={!canEdit}
                                title={"Select all " + g.name + " permissions"}
                                onChange={(on) => setDraft((d) => setGroupPerms(d, g.modules, on))}
                              />
                            </span>
                            <span>{g.name}</span>
                            <Pill color="#94a3b8">{g.modules.length}</Pill>
                            <span className="ml-auto text-[10px] font-normal normal-case opacity-50">{isCollapsed ? "Expand" : "Collapse"}</span>
                          </button>
                        </td>
                      </tr>
                      {!isCollapsed && g.appId && <SectionAccessRow draft={draft} setDraft={setDraft} appId={g.appId} canEdit={canEdit} />}
                      {!isCollapsed && g.modules.map((m) => {
                        const mSt = modPermState(draft, m.id);
                        const enabled = isModEnabled(draft, m.id);
                        return (
                          <tr key={m.id} className={"perm-mod-row " + (enabled ? "perm-mod-on" : "")}>
                            <td className="py-2 pl-8 pr-2 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{m.label}</span>
                                <span className="font-mono text-[10px] opacity-40">{m.id}</span>
                              </div>
                            </td>
                            <td className="py-2 px-1 text-center">
                              <TriCheckbox
                                checked={mSt === "all"}
                                indeterminate={mSt === "some"}
                                disabled={!canEdit}
                                title="Select all permissions for this module"
                                onChange={(on) => setDraft((d) => setAllModPerms(d, m.id, on))}
                              />
                            </td>
                            {cols.map((c) => {
                              const on = getModPerm(draft, m.id, c.key);
                              const needsView = REQUIRES_VIEW.includes(c.key) && c.key !== "view";
                              const viewOff = needsView && !getModPerm(draft, m.id, "view");
                              return (
                                <td key={c.key} className={"py-2 px-1 text-center " + (viewOff && !on ? "perm-cell-off" : "")}>
                                  <TriCheckbox
                                    checked={on}
                                    disabled={!canEdit || (viewOff && !on)}
                                    title={viewOff && !on ? "Enable View first" : c.label}
                                    onChange={(v) => {
                                      if (viewOff && v) {
                                        VG.toast("Enable View before " + c.label, "warn");
                                        return;
                                      }
                                      setDraft((d) => setModPerm(d, m.id, c.key, v));
                                    }}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-[11px] opacity-50 mt-2 perm-hint">View is required for Add, Edit, Delete and other actions. Tab filters: unset = all tabs; empty list = dashboard only.</p>
      </div>
    );
  }

  function RoleAccessPanel({ draft, setDraft, canEdit, showMatrix }) {
    const modOpts = permMods().map((m) => ({ value: m.id, label: m.label }));
    const mods = draft.moduleAccess === "all" ? modOpts.map((m) => m.value) : (draft.moduleAccess || []);
    const allMods = draft.moduleAccess === "all";
    const allActs = ALL_ACTIONS.every((a) => (draft.actions || []).includes(a));

    function toggleAction(a) {
      setDraft((p) => {
        const list = (p.actions || []).slice();
        const i = list.indexOf(a);
        if (i >= 0) list.splice(i, 1); else list.push(a);
        return { ...p, actions: list.length ? list : ["view"] };
      });
    }

    return (
      <div className="space-y-4">
        <div className="perm-toolbar rounded-xl border border-white/10 p-3">
          <div className="flex flex-wrap gap-2 mb-3">
            <Checkbox checked={allMods} disabled={!canEdit} onChange={(v) => setDraft((p) => ({ ...p, moduleAccess: v ? "all" : [] }))} label="All modules" />
            <Checkbox checked={allActs} disabled={!canEdit} onChange={(v) => setDraft((p) => setAllActions(p, v))} label="All actions (role default)" />
            <Button variant="soft" className="!py-1" disabled={!canEdit} onClick={() => setDraft(grantAllAccess())}>Grant all access</Button>
            <Button variant="ghost" className="!py-1" disabled={!canEdit} onClick={() => setDraft((p) => setAllActions(p, true))}>Select all actions</Button>
            <Button variant="ghost" className="!py-1" disabled={!canEdit} onClick={() => setDraft((p) => setAllActions(p, false))}>Deselect all actions</Button>
          </div>
          <h4 className="text-xs font-semibold uppercase tracking-wider opacity-50 mb-2">Default actions for this role</h4>
          <div className="flex flex-wrap gap-3">
            {ALL_ACTIONS.map((a) => (
              <Checkbox key={a} checked={(draft.actions || []).includes(a)} disabled={!canEdit} onChange={() => toggleAction(a)} label={a} />
            ))}
          </div>
        </div>
        {!allMods && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button variant="soft" className="!py-1" disabled={!canEdit} onClick={() => setDraft((p) => ({ ...p, moduleAccess: modOpts.map((m) => m.value) }))}>Select all modules</Button>
              <Button variant="ghost" className="!py-1" disabled={!canEdit} onClick={() => setDraft((p) => ({ ...p, moduleAccess: [] }))}>Deselect all modules</Button>
            </div>
            <h4 className="text-xs font-semibold uppercase tracking-wider opacity-50 mb-2">Module access ({mods.length})</h4>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
              {modOpts.map((m) => (
                <Checkbox key={m.value} checked={mods.includes(m.value)} disabled={!canEdit}
                  onChange={() => setDraft((p) => setModEnabled(p, m.value, !mods.includes(m.value)))} label={m.label} />
              ))}
            </div>
          </>
        )}
        {showMatrix && (
          <div className="border-t border-white/10 pt-4 mt-4">
            <h4 className="text-sm font-semibold mb-2">Fine-grained permission matrix</h4>
            <PermissionMatrixEditor draft={draft} setDraft={setDraft} canEdit={canEdit} />
          </div>
        )}
      </div>
    );
  }

  VG.PermissionMatrixEditor = PermissionMatrixEditor;
  VG.RoleAccessPanel = RoleAccessPanel;
  VG.TriCheckbox = TriCheckbox;
})(window.VG);
