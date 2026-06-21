/* Veraglo ERP — Admin: multi-tenant organization management */
(function (VG) {
  const { useState, useEffect } = React;
  const ui = VG.ui;
  const fx = VG.fx;
  const { Icon, Button, Card } = ui;
  const { Field, Text, PageHead } = fx;

  function TenantsPage({ roleKey, can }) {
    const [tenants, setTenants] = useState([]);
    const [defaultSlug, setDefaultSlug] = useState("default");
    const [slug, setSlug] = useState("");
    const [name, setName] = useState("");
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const isSuper = VG.store && VG.store.isSuperAdmin && VG.store.isSuperAdmin(roleKey);
    const current = VG.tenant ? VG.tenant.currentSlug() : "default";

    useEffect(() => {
      if (!VG.tenant || !VG.tenant.listLoginOrganizations) {
        if (VG.tenant && VG.tenant.listTenants) {
          VG.tenant.listTenants().then(setTenants).catch(() => setTenants([]));
        }
        return;
      }
      VG.tenant.listLoginOrganizations().then((data) => {
        setTenants(data.organizations || []);
        setDefaultSlug(data.defaultTenantSlug || "default");
      }).catch(() => setTenants([]));
    }, []);

    async function setDefaultOrg(slugValue) {
      try {
        const res = await VG.tenant.fetchApi("/api/tenants/default", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: slugValue }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Could not set default");
        setDefaultSlug(body.defaultTenantSlug || slugValue);
        VG.toast("Default organization set to " + slugValue);
      } catch (e) {
        VG.toast(e.message || "Failed to set default organization", "error");
      }
    }

    async function createOrg() {
      setErr("");
      if (!slug.trim()) return setErr("Organization code is required");
      setBusy(true);
      try {
        const res = await VG.tenant.fetchApi("/api/tenants", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Platform-Key": "test" },
          body: JSON.stringify({ slug: slug.trim(), name: name.trim() || slug.trim() }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Create failed");
        setSlug("");
        setName("");
        const list = await VG.tenant.listTenants();
        setTenants(list);
        VG.toast("Organization " + body.tenant.slug + " created");
      } catch (e) {
        setErr(e.message || "Could not create organization");
      } finally {
        setBusy(false);
      }
    }

    return (
      <div className="space-y-4">
        <PageHead
          title="Organizations (Multi-tenant)"
          desc="Each organization has isolated data — users, items, transactions, and settings. Switch organization to manage a different tenant."
        />
        <Card className="p-4 border border-white/20">
          <div className="text-sm font-medium mb-2">Default organization for login</div>
          <div className="text-xs opacity-70 mb-3">New sign-in sessions pre-select this organization when multiple companies exist.</div>
          <div className="flex flex-wrap gap-2">
            {(tenants || []).map((t) => (
              <Button
                key={t.slug}
                variant={t.slug === defaultSlug ? "primary" : "soft"}
                className="!py-1.5"
                disabled={!can("edit")}
                onClick={() => setDefaultOrg(t.slug)}
              >
                {t.name || t.slug}{t.slug === defaultSlug ? " · default" : ""}
              </Button>
            ))}
          </div>
        </Card>
        <Card className="p-4 border border-white/20">
          <div className="text-sm font-medium mb-2">Active organization (admin session)</div>
          <div className="text-xs opacity-70 font-mono">{current}</div>
          {tenants.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {tenants.map((t) => (
                <Button
                  key={t.id}
                  variant={t.slug === current ? "primary" : "soft"}
                  className="!py-1.5"
                  onClick={() => VG.tenant.switchTenant(t.slug)}
                >
                  {t.name || t.slug}
                </Button>
              ))}
            </div>
          )}
        </Card>
        {isSuper && can("edit") && (
          <Card className="p-4 border border-white/20 space-y-3">
            <h3 className="text-sm font-semibold">Create organization</h3>
            <p className="text-xs opacity-60">Requires platform key on the server (<code className="font-mono">VERAGLO_PLATFORM_KEY</code>). In test mode, creation is allowed without a key.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Organization code" hint="Lowercase, e.g. acme-factory">
                <Text value={slug} onChange={setSlug} placeholder="acme" />
              </Field>
              <Field label="Display name">
                <Text value={name} onChange={setName} placeholder="Acme Manufacturing" />
              </Field>
            </div>
            {err && <p className="text-xs text-rose-400">{err}</p>}
            <Button icon="plus" onClick={createOrg} disabled={busy}>{busy ? "Creating…" : "Create organization"}</Button>
          </Card>
        )}
        <Card className="p-4 border border-white/20">
          <h3 className="text-sm font-semibold mb-3">Registered organizations</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left opacity-55 border-b border-white/10">
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Configured</th>
                  <th className="py-2 pr-3">Users</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(tenants || []).map((t) => (
                  <tr key={t.id} className="border-b border-white/5">
                    <td className="py-2 pr-3 font-mono">{t.slug}</td>
                    <td className="py-2 pr-3">{t.name}</td>
                    <td className="py-2 pr-3">{t.status || "active"}</td>
                    <td className="py-2 pr-3">{t.configured === false ? "No" : "Yes"}</td>
                    <td className="py-2 pr-3">{t.hasUsers ? "Yes" : "—"}</td>
                    <td className="py-2 text-right">
                      {t.slug !== current && (
                        <Button variant="soft" className="!py-1" onClick={() => VG.tenant.switchTenant(t.slug)}>Switch</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  VG.AdminTenantsPage = TenantsPage;
})(window.VG);
