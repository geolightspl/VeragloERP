/* Veraglo ERP — Email Integration Settings and Management */
(function (VG) {
  const { useState, useEffect } = React;
  const ui = VG.ui, fx = VG.fx, store = VG.store;
  const { Icon, Button, Card } = ui;
  const { Field, Text, Select, Checkbox } = fx;

  function apiHeaders(extra) {
    return VG.tenant && VG.tenant.headers ? VG.tenant.headers(extra) : Object.assign({ "Content-Type": "application/json" }, extra || {});
  }

  async function apiFetch(path, opts) {
    const o = opts || {};
    const h = apiHeaders(o.headers);
    const base = VG.apiBase != null ? String(VG.apiBase) : "";
    return fetch(base + path, Object.assign({}, o, { headers: h }));
  }

  /* ============ Email Integration Settings ============ */
  function EmailIntegrationSettings({ roleKey, can }) {
    const [settings, setSettings] = useState({
      provider: "",
      email: "",
      appPassword: "",
      imapHost: "",
      imapPort: 993,
      smtpHost: "",
      smtpPort: 587,
      tlsEnabled: true,
      syncFrequency: 15, // minutes
      defaultOwner: "",
      autoCreateEnquiry: true,
      enabled: false,
    });
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [lastSync, setLastSync] = useState(null);

    useEffect(() => {
      fetchSettings();
    }, []);

    async function fetchSettings() {
      try {
        const res = await apiFetch("/api/email-integration/settings");
        const data = await res.json();
        if (data.ok) {
          setSettings(data.settings);
          if (data.settings.lastSynced) setLastSync(new Date(data.settings.lastSynced));
        }
      } catch (e) {
        VG.toast("Failed to load email settings", "error");
      }
    }

    async function saveSettings() {
      setLoading(true);
      try {
        const res = await apiFetch("/api/email-integration/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        });
        const data = await res.json();
        if (data.ok) {
          VG.toast("Email settings saved");
          setSettings(data.settings);
        } else {
          VG.toast(data.error || "Failed to save", "error");
        }
      } catch (e) {
        VG.toast(e.message, "error");
      } finally {
        setLoading(false);
      }
    }

    async function testConnection() {
      setSyncing(true);
      try {
        const res = await apiFetch("/api/email-integration/sync", { method: "POST" });
        const data = await res.json();
        if (data.ok) {
          VG.toast(`Synced ${data.synced} email(s)`);
          setLastSync(new Date());
        } else {
          VG.toast(data.error || "Sync failed", "error");
        }
      } catch (e) {
        VG.toast(e.message, "error");
      } finally {
        setSyncing(false);
      }
    }

    const providerConfigs = {
      gmail: {
        label: "Gmail / Google Workspace",
        fields: [
          { key: "email", label: "Email address", type: "text", req: true },
          { key: "appPassword", label: "App password", type: "password", hint: "Generate in Google Account Settings > Security" },
        ],
      },
      outlook: {
        label: "Microsoft 365 / Outlook",
        fields: [
          { key: "email", label: "Email address", type: "text", req: true },
          { key: "appPassword", label: "App password", type: "password", hint: "Use account password or app-specific password" },
        ],
      },
      imap: {
        label: "Custom IMAP/SMTP Account",
        fields: [
          { key: "email", label: "Email address", type: "text", req: true },
          { key: "imapHost", label: "IMAP host", type: "text", req: true, hint: "e.g., imap.gmail.com" },
          { key: "imapPort", label: "IMAP port", type: "number", default: 993 },
          { key: "smtpHost", label: "SMTP host", type: "text", req: true, hint: "e.g., smtp.gmail.com" },
          { key: "smtpPort", label: "SMTP port", type: "number", default: 587 },
          { key: "appPassword", label: "Password", type: "password", req: true },
        ],
      },
    };

    const currentConfig = providerConfigs[settings.provider] || {};
    const defaultOwners = store.list("erpUsers") || [];

    return (
      <div className="space-y-4">
        <Card className="p-4 rounded-xl glass border border-white/10">
          <h3 className="text-base font-semibold mb-4">Email Integration Configuration</h3>

          <div className="space-y-3">
            <Field label="Email Service Provider" required>
              <Select
                value={settings.provider}
                onChange={(v) => setSettings({ ...settings, provider: v })}
                options={[
                  { value: "", label: "— Select provider —" },
                  { value: "gmail", label: "Gmail / Google Workspace" },
                  { value: "outlook", label: "Microsoft 365 / Outlook" },
                  { value: "imap", label: "Custom IMAP/SMTP Account" },
                ]}
              />
            </Field>

            {currentConfig.fields && currentConfig.fields.map((field) => (
              <Field key={field.key} label={field.label} required={field.req} hint={field.hint}>
                {field.type === "password" ? (
                  <input
                    type="password"
                    value={settings[field.key] || ""}
                    onChange={(e) => setSettings({ ...settings, [field.key]: e.target.value })}
                    className="w-full rounded-lg glass px-3 py-2 text-sm bg-transparent outline-none focus:ring-2"
                    placeholder={field.label}
                  />
                ) : field.type === "number" ? (
                  <input
                    type="number"
                    value={settings[field.key] || field.default || 0}
                    onChange={(e) => setSettings({ ...settings, [field.key]: Number(e.target.value) })}
                    className="w-full rounded-lg glass px-3 py-2 text-sm bg-transparent outline-none focus:ring-2"
                  />
                ) : (
                  <Text
                    value={settings[field.key] || ""}
                    onChange={(v) => setSettings({ ...settings, [field.key]: v })}
                  />
                )}
              </Field>
            ))}

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Sync Frequency (minutes)">
                <input
                  type="number"
                  value={settings.syncFrequency || 15}
                  onChange={(e) => setSettings({ ...settings, syncFrequency: Number(e.target.value) })}
                  className="w-full rounded-lg glass px-3 py-2 text-sm bg-transparent outline-none focus:ring-2"
                  min="5"
                  max="1440"
                />
              </Field>

              <Field label="Default Enquiry Owner">
                <Select
                  value={settings.defaultOwner || ""}
                  onChange={(v) => setSettings({ ...settings, defaultOwner: v })}
                  options={[{ value: "", label: "— Assign manually —" }].concat(
                    defaultOwners.map((u) => ({ value: u.id, label: u.name || u.email }))
                  )}
                />
              </Field>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.autoCreateEnquiry}
                  onChange={(e) => setSettings({ ...settings, autoCreateEnquiry: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">Auto-create enquiry from email</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.tlsEnabled}
                  onChange={(e) => setSettings({ ...settings, tlsEnabled: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">Use TLS encryption</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm font-medium">Enable email integration</span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/10">
            <Button icon="save" onClick={saveSettings} loading={loading}>
              Save Settings
            </Button>
            <Button variant="soft" icon="refresh" onClick={testConnection} loading={syncing}>
              Test & Sync Now
            </Button>
            {lastSync && <span className="text-xs opacity-60 py-2">Last synced: {lastSync.toLocaleString()}</span>}
          </div>
        </Card>

        <Card className="p-4 rounded-xl glass border border-white/10">
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Icon name="info" size={16} />
            Setup Instructions
          </h3>
          <div className="text-sm space-y-2 opacity-80">
            {settings.provider === "gmail" && (
              <>
                <p>1. Go to <code className="bg-white/10 px-1 rounded">myaccount.google.com/security</code></p>
                <p>2. Enable "2-Step Verification"</p>
                <p>3. Create an "App password" for mail</p>
                <p>4. Use the 16-character password above</p>
              </>
            )}
            {settings.provider === "outlook" && (
              <>
                <p>1. Go to <code className="bg-white/10 px-1 rounded">account.microsoft.com/security</code></p>
                <p>2. Create an app password (if 2FA enabled)</p>
                <p>3. Or use your account password</p>
              </>
            )}
            {settings.provider === "imap" && (
              <>
                <p>Contact your email provider for IMAP/SMTP host details</p>
                <p>Common hosts: mail.company.com, imap.example.com, etc.</p>
              </>
            )}
          </div>
        </Card>
      </div>
    );
  }

  /* ============ Pending Email Enquiries ============ */
  function PendingEmailEnquiries({ roleKey, can }) {
    const [pending, setPending] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      fetchPending();
    }, []);

    async function fetchPending() {
      // Would fetch from API
      setPending([]);
    }

    return (
      <div className="space-y-3">
        {pending.length === 0 ? (
          <Card className="p-8 text-center rounded-xl glass border border-white/10 opacity-60">
            <Icon name="mail" size={32} className="mx-auto mb-2" />
            <p>No pending email enquiries</p>
          </Card>
        ) : (
          pending.map((email) => (
            <Card key={email.id} className="p-4 rounded-xl glass border border-white/10">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{email.fromName}</p>
                  <p className="text-xs opacity-60">{email.from}</p>
                  <p className="text-sm mt-2">{email.subject}</p>
                  <p className="text-xs opacity-50 mt-1">{email.preview}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="soft" size="sm" icon="check">
                    Accept
                  </Button>
                  <Button variant="soft" size="sm" icon="x">
                    Skip
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    );
  }

  VG.EmailIntegrationSettings = EmailIntegrationSettings;
  VG.PendingEmailEnquiries = PendingEmailEnquiries;
})(window.VG);
