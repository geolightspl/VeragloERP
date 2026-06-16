/* Veraglo ERP — app shell: theme + auth/session state, hero login,
   glassmorphism launcher, collapsible sidebar + top status bar, routing. */
(function (VG) {
  const { useState, useEffect, useMemo, useRef } = React;
  const { Icon, Card, Button, Pill, Toggle, useClock } = VG.ui;

  const HERO = (typeof VG !== "undefined" && VG.LOGIN_HERO_IMAGE) || "assets/happy-employees.png";
  const LOGO = "assets/veraglo-logo.png";
  const LOGIN_TAGLINE = "Bring your best energy today.";
  const LOGIN_SUBTAG = "Every login is a fresh start — sign in and lead your team to excellence.";
  const STORE = "veraglo-erp-session";
  const UI_REV = "2026-06-auth-integrity-v1";
  const SIDEBAR_KEY = "veraglo-sidebar-collapsed";

  function displayNameFromSession(email, name) {
    if (name && String(name).trim()) return String(name).trim();
    return (email || "").split("@")[0].replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function ForcePasswordChangeModal({ open, userId, email, roleKey, onComplete }) {
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => {
      if (!open) { setNext(""); setConfirm(""); setBusy(false); }
    }, [open]);
    if (!open) return null;
    const policy = VG.store && VG.store.settings ? VG.store.settings().security : {};
    async function submit() {
      if (!next) { VG.toast("Enter a new password", "warn"); return; }
      if (next !== confirm) { VG.toast("Passwords do not match", "warn"); return; }
      if (!VG.store || !VG.store.setUserPassword) return;
      const check = VG.store.validatePasswordPolicy ? VG.store.validatePasswordPolicy(next) : { ok: next.length >= 8 };
      if (!check.ok) { VG.toast(check.reason || check.errors?.[0] || "Password too weak", "error"); return; }
      setBusy(true);
      try {
        const res = await VG.store.setUserPassword(userId, next, roleKey || email);
        if (!res.ok) { VG.toast(res.reason || "Could not update password", "error"); return; }
        VG.toast("Password updated — welcome to Veraglo ERP", "success");
        onComplete && onComplete();
      } finally {
        setBusy(false);
      }
    }
    return (
      <div className="fixed inset-0 z-[200] grid place-items-center p-4 bg-black/55 backdrop-blur-sm" role="dialog" aria-modal="true">
        <div className="login-panel rounded-2xl shadow-glass p-6 w-[min(92vw,440px)] animate-scale-in">
          <h3 className="font-semibold font-display text-lg text-slate-900">Set your new password</h3>
          <p className="text-sm login-muted mt-1">Your administrator requires a password change before you can access the ERP.</p>
          <div className="space-y-3 mt-4">
            <label className="block text-sm"><span className="text-xs login-label">New password</span>
              <input type="password" className="login-input w-full rounded-xl px-3.5 py-3 text-sm mt-1" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </label>
            <label className="block text-sm"><span className="text-xs login-label">Confirm password</span>
              <input type="password" className="login-input w-full rounded-xl px-3.5 py-3 text-sm mt-1" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <Button icon="check" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Continue to ERP"}</Button>
          </div>
        </div>
      </div>
    );
  }

  function LoginCaptcha({ challenge, onChange }) {
    const [answer, setAnswer] = useState("");
    useEffect(() => { setAnswer(""); }, [challenge.a, challenge.b]);
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3.5 py-3">
        <label className="text-xs login-label text-amber-900">Security check</label>
        <p className="text-[11px] text-amber-800 mt-0.5">What is {challenge.a} + {challenge.b}?</p>
        <input value={answer} onChange={(e) => { const v = e.target.value; setAnswer(v); onChange(v); }}
          inputMode="numeric" required placeholder="Answer"
          className="login-input mt-2 w-full rounded-lg px-3 py-2 text-sm" />
      </div>
    );
  }

  function ChangePasswordModal({ open, onClose, userId, email, roleKey }) {
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => {
      if (!open) { setCurrent(""); setNext(""); setConfirm(""); setBusy(false); }
    }, [open]);
    if (!open) return null;
    async function submit() {
      if (!current || !next) { VG.toast("Enter current and new password", "warn"); return; }
      if (next !== confirm) { VG.toast("New passwords do not match", "warn"); return; }
      if (!VG.store || !VG.store.validateLogin || !VG.store.setUserPassword) return;
      setBusy(true);
      try {
        const v = await VG.store.validateLogin(email, current);
        if (!v.ok) { VG.toast(v.reason || "Current password is incorrect", "error"); return; }
        const res = await VG.store.setUserPassword(userId, next, roleKey || email);
        if (!res.ok) { VG.toast(res.reason || "Could not change password", "error"); return; }
        VG.toast("Password updated", "success");
        onClose();
      } finally {
        setBusy(false);
      }
    }
    return (
      <div className="fixed inset-0 z-[130] grid place-items-center p-4 bg-black/45 backdrop-blur-sm" role="dialog" aria-modal="true">
        <div className="glass-dark rounded-2xl shadow-glass border border-white/10 p-5 w-[min(92vw,420px)] animate-scale-in">
          <h3 className="font-semibold font-display text-base">Change password</h3>
          <p className="text-sm opacity-60 mt-1">Update your sign-in password for this account.</p>
          <div className="space-y-3 mt-4">
            <label className="block text-sm"><span className="text-[11px] font-medium opacity-70">Current password</span><input type="password" className="vg-input w-full rounded-lg px-3 py-2 text-sm mt-1" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></label>
            <label className="block text-sm"><span className="text-[11px] font-medium opacity-70">New password</span><input type="password" className="vg-input w-full rounded-lg px-3 py-2 text-sm mt-1" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></label>
            <label className="block text-sm"><span className="text-[11px] font-medium opacity-70">Confirm new password</span><input type="password" className="vg-input w-full rounded-lg px-3 py-2 text-sm mt-1" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></label>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="soft" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button icon="check" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Update password"}</Button>
          </div>
        </div>
      </div>
    );
  }

  function ProfileSettingsModal({ open, onClose, userId, email, roleKey, name, theme, setTheme }) {
    const db = VG.useDB ? VG.useDB() : VG.store;
    const role = VG.ROLES[roleKey] || {};
    const userRec = userId && db.get ? db.get("erpUsers", userId) : null;
    const displayName = displayNameFromSession(email, name || (userRec && userRec.name));
    const orgUi = db.settings().uiDisplay || (VG.defaultUiDisplay ? VG.defaultUiDisplay() : {});
    const allowDisplayOverride = VG.normalizeUiDisplay ? VG.normalizeUiDisplay(orgUi).allowUserOverride !== false : true;
    const userUiPref = userRec && userRec.displayPreferences && userRec.displayPreferences.uiDisplay;
    const hasDisplayOverride = !!(userUiPref && !userUiPref.useOrgDefault);
    const effectiveUi = db.getEffectiveUiDisplay ? db.getEffectiveUiDisplay(userId) : orgUi;
    if (!open) return null;
    function saveDisplayPref(patch) {
      if (!userId || !db.saveUserDisplayPreferences) return;
      const res = db.saveUserDisplayPreferences(userId, patch, email || roleKey);
      if (res.ok) VG.toast("Display preference saved");
      else VG.toast(res.error || "Could not save display preference", "warn");
    }
    return (
      <div className="fixed inset-0 z-[130] grid place-items-center p-4 bg-black/45 backdrop-blur-sm" role="dialog" aria-modal="true">
        <div className="glass-dark rounded-2xl shadow-glass border border-white/10 p-5 w-[min(92vw,460px)] animate-scale-in">
          <h3 className="font-semibold font-display text-base">Profile settings</h3>
          <p className="text-sm opacity-60 mt-1">Your account details and display preferences.</p>
          <div className="mt-4 rounded-xl border border-white/10 p-3 space-y-2 text-sm">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center w-10 h-10 rounded-xl text-white text-sm font-bold shrink-0" style={{ background: role.color || "var(--accent)" }}>{role.avatar || displayName.charAt(0)}</span>
              <div className="min-w-0">
                <div className="font-semibold truncate">{displayName}</div>
                <div className="text-xs opacity-60 truncate">{role.label || roleKey}</div>
              </div>
            </div>
            <div className="text-xs opacity-70 pt-1 border-t border-white/10">
              <div className="truncate">{email}</div>
              {userRec && userRec.userId && <div className="opacity-60 mt-0.5">User ID · {userRec.userId}</div>}
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between rounded-lg px-2 py-2 text-sm">
              <span className="flex items-center gap-3"><Icon name={theme === "dark" ? "moon" : "sun"} size={16} />Theme</span>
              <Toggle on={theme === "dark"} onChange={(v) => setTheme(v ? "dark" : "light")} />
            </div>
            {allowDisplayOverride && VG.InterfaceSizeControls && (
              <div className="rounded-lg px-2 py-2">
                <div className="text-xs font-semibold uppercase tracking-wider opacity-50 mb-2">Display size</div>
                <VG.InterfaceSizeControls compact value={hasDisplayOverride ? userUiPref : effectiveUi} onChange={(next) => saveDisplayPref(next)} />
                {hasDisplayOverride && (
                  <button type="button" onClick={() => saveDisplayPref({ useOrgDefault: true })} className="mt-2 text-[11px] opacity-70 hover:opacity-100 underline">Use organization default</button>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="soft" onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>
    );
  }

  function AppUserMenu({ roleKey, email, userId, name, theme, setTheme, onHome, onLogout, showHome = true, compact = false }) {
    const role = VG.ROLES[roleKey] || {};
    const [open, setOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [passwordOpen, setPasswordOpen] = useState(false);
    const displayName = displayNameFromSession(email, name);
    async function goHome() {
      setOpen(false);
      if (onHome) await onHome();
    }
    return (
      <>
        <div className="relative">
          <button type="button" onClick={() => setOpen(open === "menu" ? null : "menu")} className={"flex items-center gap-2 rounded-xl hover:bg-white/10 transition " + (compact ? "pl-1 pr-2 py-1" : "pl-1 pr-2 py-1 border border-transparent hover:border-white/10")} title="Account menu">
            <span className="grid place-items-center w-8 h-8 rounded-lg text-white text-xs font-bold shrink-0" style={{ background: role.color || "var(--accent)" }}>{role.avatar || displayName.charAt(0)}</span>
            {!compact && (
              <div className="hidden sm:block text-left min-w-0 max-w-[140px]">
                <div className="text-sm font-semibold truncate leading-tight">{displayName}</div>
                <div className="text-[10px] opacity-55 truncate leading-tight">{role.label || "User"}</div>
              </div>
            )}
            <Icon name="chevron" size={14} className="opacity-50 hidden sm:block shrink-0" />
          </button>
          <Popover open={open === "menu"} onClose={() => setOpen(null)}>
            <div className="flex items-center gap-3 p-2">
              <span className="grid place-items-center w-10 h-10 rounded-xl text-white font-bold shrink-0" style={{ background: role.color || "var(--accent)" }}>{role.avatar || displayName.charAt(0)}</span>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{displayName}</div>
                <div className="text-[11px] opacity-60 truncate">{role.label}</div>
                <div className="text-[11px] opacity-45 truncate">{email}</div>
              </div>
            </div>
            <div className="my-2 h-px bg-white/10" />
            {showHome && onHome && (
              <button type="button" onClick={goHome} className="w-full flex items-center gap-3 rounded-lg px-2 py-2 text-sm chrome-hover"><Icon name="grid" size={16} />Home Dashboard</button>
            )}
            <button type="button" onClick={() => { setOpen(null); setProfileOpen(true); }} className="w-full flex items-center gap-3 rounded-lg px-2 py-2 text-sm chrome-hover"><Icon name="users" size={16} />Profile settings</button>
            <button type="button" onClick={() => { setOpen(null); setPasswordOpen(true); }} className="w-full flex items-center gap-3 rounded-lg px-2 py-2 text-sm chrome-hover"><Icon name="shield" size={16} />Change password</button>
            <div className="my-2 h-px bg-white/10" />
            <button type="button" onClick={() => { setOpen(null); onLogout && onLogout(); }} className="w-full flex items-center gap-3 rounded-lg px-2 py-2 text-sm chrome-hover text-rose-400"><Icon name="logout" size={16} />Logout</button>
          </Popover>
        </div>
        <ProfileSettingsModal open={profileOpen} onClose={() => setProfileOpen(false)} userId={userId} email={email} roleKey={roleKey} name={name} theme={theme} setTheme={setTheme} />
        <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} userId={userId} email={email} roleKey={roleKey} />
      </>
    );
  }

  async function guardedNavigate(fn) {
    if (VG.requestNavigation) {
      const ok = await VG.requestNavigation();
      if (!ok) return false;
    }
    if (typeof fn === "function") fn();
    return true;
  }

  function setAccent(hex) {
    const root = document.documentElement;
    root.style.setProperty("--accent", hex || "#6366f1");
    root.style.setProperty("--accent-soft", (hex || "#6366f1") + "29");
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
    if (typeof VG !== "undefined" && VG.applyTypography && VG.store) {
      const st = VG.store.settings();
      const ui = VG.store.getEffectiveUiDisplay ? VG.store.getEffectiveUiDisplay(VG.activeUserId) : null;
      VG.applyTypography(st.typography, st.theme, ui);
    }
    if (typeof VG !== "undefined" && VG.applyOrganizationTheme && VG.store) {
      const st = VG.store.settings();
      const ts = st.themeSettings || (VG.defaultThemeSettings ? VG.defaultThemeSettings() : null);
      if (ts) VG.applyOrganizationTheme(ts, { mode: theme, customThemes: st.customThemes });
    }
  }

  function clearAuthCache() {
    try {
      const cur = JSON.parse(localStorage.getItem(STORE) || "{}");
      localStorage.setItem(STORE, JSON.stringify({ theme: cur.theme }));
      sessionStorage.clear();
    } catch (e) {}
  }
  VG.clearAuthCache = clearAuthCache;

  /* ---------------- Data integrity / missing data warnings ---------------- */
  function DataIntegrityScreen({ theme, setTheme, onRetry, onRepair }) {
    const [busy, setBusy] = useState(false);
    const Shell = VG.LoginWeatherShell || (({ children, header }) => (
      <div className="relative min-h-screen"><div className="relative z-10">{header}{children}</div></div>
    ));
    return (
      <Shell header={(
        <header className="flex items-center justify-between">
          <img src={LOGO} alt="Veraglo" className="h-9 w-auto" />
          <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="vg-sun-chip rounded-xl p-2.5">
            <Icon name={theme === "dark" ? "sun" : "moon"} size={18} className="text-slate-600" />
          </button>
        </header>
      )}>
        <div className="login-panel rounded-2xl p-7 sm:p-8 w-full max-w-lg border border-rose-500/30">
          <h2 className="text-2xl font-display font-semibold text-rose-700">User database integrity warning</h2>
          <p className="text-sm login-muted mt-2 leading-relaxed">
            Transactional company data exists (sales orders, work orders, or master records) but no active login users were found.
            <b> Do not run first-time administrator setup</b> — it could conflict with existing data.
          </p>
          <p className="text-sm login-muted mt-3">Use Admin repair to rebuild the user index, reconnect the data path, or restore the latest backup.</p>
          <div className="flex flex-wrap gap-2 mt-6">
            <Button icon="refresh" onClick={onRetry}>Reload from server</Button>
            {onRepair && <Button variant="soft" icon="shield" disabled={busy} onClick={async () => { setBusy(true); try { await onRepair(); } finally { setBusy(false); } }}>{busy ? "Repairing…" : "Run auth repair"}</Button>}
          </div>
        </div>
      </Shell>
    );
  }

  function DataMissingScreen({ theme, setTheme, onRetry }) {
    const Shell = VG.LoginWeatherShell || (({ children, header }) => (
      <div className="relative min-h-screen"><div className="relative z-10">{header}{children}</div></div>
    ));
    return (
      <Shell header={(
        <header className="flex items-center justify-between">
          <img src={LOGO} alt="Veraglo" className="h-9 w-auto" />
          <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="vg-sun-chip rounded-xl p-2.5">
            <Icon name={theme === "dark" ? "sun" : "moon"} size={18} className="text-slate-600" />
          </button>
        </header>
      )}>
        <div className="login-panel rounded-2xl p-7 sm:p-8 w-full max-w-lg border border-amber-500/30">
          <h2 className="text-2xl font-display font-semibold text-amber-800">Company data not found</h2>
          <p className="text-sm login-muted mt-2 leading-relaxed">
            Existing company data not found. Please verify data path before continuing.
            The system will not create a blank database automatically.
          </p>
          <Button icon="refresh" className="mt-6" onClick={onRetry}>Retry connection</Button>
        </div>
      </Shell>
    );
  }

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

    const Shell = VG.LoginWeatherShell || (({ children, header }) => (
      <div className="relative min-h-screen"><div className="relative z-10">{header}{children}</div></div>
    ));
    return (
      <Shell
        header={(
          <header className="flex items-center justify-between">
            <img src={LOGO} alt="Veraglo" className="h-9 w-auto" />
            <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="vg-sun-chip rounded-xl p-2.5">
              <Icon name={theme === "dark" ? "sun" : "moon"} size={18} className="text-slate-600" />
            </button>
          </header>
        )}
      >
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
      </Shell>
    );
  }

  function LoginHeroVisual({ compact }) {
    return (
      <div className={"vg-login-hero-visual" + (compact ? " vg-login-hero-visual--compact" : "")}>
        <img src={HERO} alt="Motivated team ready to start the workday" className="vg-login-hero-img" loading="eager" />
        <div className="vg-login-hero-shade" aria-hidden="true" />
        <div className="vg-login-hero-caption">
          <span className="vg-login-energy-badge">Full energy · Let&apos;s go</span>
          <p className="vg-login-hero-quote">{LOGIN_TAGLINE}</p>
          {!compact && <p className="vg-login-hero-sub">{LOGIN_SUBTAG}</p>}
        </div>
      </div>
    );
  }

  /* ---------------- Login ---------------- */
  function Login({ onLogin, theme, setTheme, needsSetup, onForgotPassword }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [orgCode, setOrgCode] = useState(() => (VG.tenant && VG.tenant.currentSlug()) || "default");
    const [busy, setBusy] = useState(false);
    const [authHint, setAuthHint] = useState("");
    const [forgotEnabled, setForgotEnabled] = useState(true);
    const [failedAttempts, setFailedAttempts] = useState(0);
    const [captchaAnswer, setCaptchaAnswer] = useState("");
    const [captchaAfter, setCaptchaAfter] = useState(3);
    const captchaChallenge = useMemo(() => ({
      a: 2 + Math.floor(Math.random() * 8),
      b: 1 + Math.floor(Math.random() * 8),
    }), [failedAttempts >= captchaAfter]);
    const showCaptcha = captchaAfter > 0 && failedAttempts >= captchaAfter;

    useEffect(() => {
      const headers = VG.tenant ? VG.tenant.headers() : {};
      fetch((VG.apiBase || "") + "/api/auth/forgot-password/settings", { headers })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (!data) return;
          setForgotEnabled(data.enabled !== false);
          if (data.loginCaptchaAfterFailures != null) setCaptchaAfter(Number(data.loginCaptchaAfterFailures) || 0);
        })
        .catch(() => {});
      fetch((VG.apiBase || "") + "/api/auth/status", { headers })
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
      if (showCaptcha && String(captchaAnswer).trim() !== String(captchaChallenge.a + captchaChallenge.b)) {
        VG.toast("Incorrect security check answer", "error");
        return;
      }
      setBusy(true);
      if (VG.tenant && orgCode) VG.tenant.setSlug(orgCode);
      Promise.resolve(onLogin(email.trim(), password))
        .then((ok) => { if (ok !== false) setFailedAttempts(0); else setFailedAttempts((n) => n + 1); })
        .catch(() => setFailedAttempts((n) => n + 1))
        .finally(() => setBusy(false));
    }

    const Shell = VG.LoginWeatherShell || (({ children, header, hero }) => (
      <div className="relative min-h-screen w-full overflow-hidden">
        <img src={HERO} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(110deg, rgba(8,13,24,.92) 0%, rgba(8,13,24,.72) 38%, rgba(8,13,24,.30) 100%)" }} />
        <div className="relative z-10 min-h-screen flex flex-col px-6 sm:px-10 py-6">{header}{hero}{children}</div>
      </div>
    ));
    return (
      <Shell
        heroImage={HERO}
        header={(
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={LOGO} alt="Veraglo" className="h-9 w-auto" />
              <span className="text-slate-800 font-display font-semibold tracking-wide hidden sm:block">Veraglo ERP</span>
            </div>
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="vg-sun-chip rounded-xl p-2.5 transition">
              <Icon name={theme === "dark" ? "sun" : "moon"} size={18} className="text-slate-600" />
            </button>
          </header>
        )}
        hero={(
          <div className="space-y-6">
            <LoginHeroVisual />
            <div>
              <span className="vg-login-hero-pill">Enterprise Resource Planning</span>
              <h1 className="mt-4 text-4xl xl:text-5xl font-display font-bold leading-[1.1] text-balance text-slate-900">
                One workspace for your whole factory floor.
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                Sales, production, quality, inventory, dispatch, accounts and people —
                each team gets its own focused, premium environment with role-based access.
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {["Role-based access", "15 modules", "Premium workspace", "Real-time KPIs"].map((f) => (
                  <span key={f} className="vg-login-hero-chip">{f}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      >
        <div className="login-panel rounded-2xl p-7 sm:p-8">
          <div className="lg:hidden mb-5">
            <LoginHeroVisual compact />
          </div>
          <div className="lg:hidden flex items-center gap-2 mb-5">
            <img src={LOGO} alt="" className="h-8 w-auto" />
            <span className="font-display font-semibold text-slate-900">Veraglo ERP</span>
          </div>
          <h2 className="text-2xl font-display font-semibold text-slate-900">Welcome back</h2>
          <p className="text-sm login-muted mt-1">Sign in to continue to your ERP workspace</p>
          <p className="text-xs login-muted mt-3 leading-relaxed opacity-80">
            Manage sales, inventory, production, quality, dispatch, accounts and people from one connected platform.
          </p>
          <p className="text-[11px] login-muted mt-2 italic opacity-65">Designed for smarter manufacturing operations.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="text-xs login-label">Organization code</label>
              <input value={orgCode} onChange={(e) => setOrgCode(e.target.value)} type="text" autoComplete="organization"
                placeholder="default"
                className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm focus:ring-2 font-mono"
                style={{ "--tw-ring-color": "var(--login-accent, var(--accent))" }} />
              <p className="text-[10px] login-muted mt-1 opacity-70">Use <b>default</b> for single-company installs. SaaS users enter their org code (e.g. acme).</p>
            </div>
            <div>
              <label className="text-xs login-label">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" required
                placeholder="you@company.com"
                className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm focus:ring-2"
                style={{ "--tw-ring-color": "var(--login-accent, var(--accent))" }} />
            </div>
            <div>
              <label className="text-xs login-label">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                placeholder="Enter password"
                className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm focus:ring-2"
                style={{ "--tw-ring-color": "var(--login-accent, var(--accent))" }} />
              {onForgotPassword && forgotEnabled && (
                <div className="mt-2.5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => { if (VG.tenant && orgCode) VG.tenant.setSlug(orgCode); onForgotPassword(orgCode); }}
                    className="login-forgot-link text-sm font-semibold transition"
                  >
                    Forgot Password?
                  </button>
                </div>
              )}
            </div>

            {showCaptcha && (
              <LoginCaptcha challenge={captchaChallenge} onChange={setCaptchaAnswer} />
            )}

            <Button type="submit" icon="logout" className="w-full !py-3" disabled={busy}>{busy ? "Signing in…" : "Sign in to workspace"}</Button>
            {needsSetup ? (
              <p className="text-[11px] text-center text-amber-700">No administrator exists yet — refresh the page to open <b>Create administrator</b>.</p>
            ) : (
              <p className="text-[11px] text-center login-muted">Use the email and password from your administrator setup. Dev credentials from other machines do not carry over after deploy.</p>
            )}
            {authHint && <p className="text-[11px] text-center text-amber-700 mt-2">{authHint}</p>}
          </form>
          <div className="mt-6 pt-4 border-t border-slate-200/80 text-center text-[10px] login-muted space-y-1">
            <div>Veraglo ERP {VG.buildId || VG_BUILD || "2.0"}</div>
            <a href="mailto:support@veraglo.com" className="hover:text-indigo-600 transition">support@veraglo.com</a>
          </div>
        </div>
      </Shell>
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
                {VG.fmt.formatDate ? VG.fmt.formatDate(now, { includeWeekday: true }) : now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
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
    const w = narrow ? "lg:w-[76px]" : "lg:w-[280px]";
    const [selectedModule, setSelectedModule] = useState(activeId || (mods.length > 0 ? mods[0].id : null));
    const [, setNavTick] = useState(0);
    const company = VG.store && VG.store.company ? VG.store.company() : {};
    const brandLogo = company.logo || LOGO;

    const currentModule = mods.find((m) => m.id === (activeId || selectedModule));
    const sections = currentModule ? ((VG.moduleSections && VG.moduleSections[currentModule.id]) || []) : [];

    useEffect(() => {
      if (activeId && activeId !== selectedModule) {
        setSelectedModule(activeId);
      }
    }, [activeId]);

    useEffect(() => {
      if (!VG._navListeners) VG._navListeners = [];
      const bump = () => setNavTick((t) => t + 1);
      VG._navListeners.push(bump);
      return () => { VG._navListeners = (VG._navListeners || []).filter((f) => f !== bump); };
    }, []);

    useEffect(() => {
      function onKey(e) {
        if ((e.metaKey || e.ctrlKey) && e.key === "b") {
          e.preventDefault();
          setCollapsed((c) => !c);
        }
      }
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [setCollapsed]);

    async function selectModule(modId) {
      if (modId === activeId) return;
      const ok = await guardedNavigate();
      if (!ok) return;
      setSelectedModule(modId);
      onOpen(modId);
      setMobileOpen(false);
    }

    async function navToSection(sectionId) {
      if (!currentModule) return;
      const isSame = activeId === currentModule.id && VG._activeModuleNav && VG._activeModuleNav.section === sectionId;
      if (isSame) { setMobileOpen(false); return; }
      const ok = await guardedNavigate();
      if (!ok) return;
      if (activeId === currentModule.id && VG._activeModuleNav && VG._activeModuleNav.modId === currentModule.id) {
        VG._activeModuleNav.setSection(sectionId);
        VG.publishModuleNav(currentModule.id, sectionId, VG._activeModuleNav.setSection);
      } else {
        VG.goTo(currentModule.id, sectionId);
        onOpen(currentModule.id);
      }
      setMobileOpen(false);
    }

    async function handleLogoHome() {
      const ok = await guardedNavigate(() => { onHome(); setMobileOpen(false); });
      if (!ok) return;
    }

    return (
      <>
        {mobileOpen && <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />}
        <aside
          onMouseEnter={() => { if (collapsed) setHoverExpand(true); }}
          onMouseLeave={() => setHoverExpand(false)}
          className={
            "vg-sidebar fixed lg:sticky top-0 z-40 h-screen shrink-0 transition-all duration-300 ease-out flex flex-col " +
            w + " " +
            (narrow ? "vg-sidebar--narrow " : "") +
            (mobileOpen ? "left-0 w-[280px]" : "-left-72 w-[280px]") + " lg:left-0"
          }
        >
          <div className={"vg-sidebar-sticky-top shrink-0 " + (narrow ? "px-2" : "px-3")}>
            <div className={"vg-sidebar-head " + (narrow ? "py-3" : "py-3")}>
              <div className={"flex items-center gap-2 " + (narrow ? "justify-center" : "justify-between")}>
                <button
                  type="button"
                  onClick={handleLogoHome}
                  className={"vg-sidebar-brand vg-sidebar-brand-btn " + (narrow ? "justify-center" : "")}
                  title="Home Dashboard"
                  data-tip="Home Dashboard"
                >
                  <div className="vg-sidebar-brand-mark">
                    <img src={brandLogo} alt="" className="h-5 w-5 object-contain" />
                  </div>
                </button>
                {!narrow && (
                  <button
                    type="button"
                    onClick={() => setCollapsed(true)}
                    className="p-2 rounded-lg opacity-50 hover:opacity-100 hover:bg-white/10 transition"
                    title="Collapse sidebar (⌘B)"
                  >
                    <Icon name="chevronLeft" size={16} />
                  </button>
                )}
              </div>
            </div>

            {!narrow && mods.length > 0 && (
              <div className="vg-sidebar-module-select pb-3">
                <select
                  value={selectedModule || ""}
                  onChange={(e) => selectModule(e.target.value)}
                  className="w-full rounded-lg bg-white/10 border border-white/20 text-sm px-3 py-2 text-white placeholder:opacity-50 hover:bg-white/15 focus:bg-white/20 focus:outline-none focus:border-white/40 transition"
                  aria-label="Select module"
                >
                  {mods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <nav className="vg-sidebar-nav flex-1 overflow-y-auto no-scrollbar py-2 min-h-0">
            {currentModule && sections.length > 0 && (
              <div className={narrow ? "px-1" : "px-2"}>
                {sections.map((s) => {
                  const isCur = activeId === currentModule.id && VG._activeModuleNav && VG._activeModuleNav.section === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => navToSection(s.id)}
                      title={narrow ? s.label : undefined}
                      className={
                        "w-full flex items-center rounded-lg py-2 text-sm transition mb-1 " +
                        (narrow ? "justify-center px-2 " : "gap-2 px-3 text-left ") +
                        (isCur ? "bg-white/15 font-medium" : "opacity-70 hover:opacity-100 hover:bg-white/10")
                      }
                      style={isCur ? { "--item-accent": currentModule.accent } : undefined}
                    >
                      <Icon name={s.icon || "grid"} size={15} className="shrink-0" />
                      {!narrow && <span className="vg-sidebar-item-label truncate">{s.label}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {(!currentModule || sections.length === 0) && !narrow && (
              <div className="px-4 py-8 text-center text-xs opacity-50">
                {mods.length === 0 ? "No modules available" : "Select a module to see options"}
              </div>
            )}
          </nav>

          <div className="vg-sidebar-foot shrink-0">
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
              className={"vg-sidebar-collapse-btn hidden lg:flex " + (narrow ? "justify-center" : "")}
            >
              <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={18} />
              {!narrow && <span>{collapsed ? "Expand" : "Collapse"}</span>}
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

  function Topbar({ roleKey, email, userId, name, mod, onHome, onToggleMobile, theme, setTheme, onLogout, onOpenSearch }) {
    const role = VG.ROLES[roleKey];
    const now = useClock();
    const [open, setOpen] = useState(null);
    const [, setNavTick] = useState(0);
    const [dashChrome, setDashChrome] = useState(() => VG._dashboardChrome || null);
    const db = VG.useDB ? VG.useDB() : VG.store;
    const allowed = useMemo(() => new Set(VG.modulesForRole(roleKey).map((m) => m.id)), [roleKey]);
    const tasks = (db.openTasks ? db.openTasks() : []).filter((t) => allowed.has(t.module));
    const inbox = (db.listNotifications ? db.listNotifications(roleKey) : []).filter((n) => !n.read).slice(0, 8);
    const taskCount = tasks.reduce((s, t) => s + t.count, 0) + inbox.length;

    useEffect(() => {
      const bump = () => setNavTick((t) => t + 1);
      if (!VG._navListeners) VG._navListeners = [];
      VG._navListeners.push(bump);
      return () => { VG._navListeners = (VG._navListeners || []).filter((f) => f !== bump); };
    }, []);

    useEffect(() => {
      if (!VG.onDashboardChromeChange) return;
      return VG.onDashboardChromeChange(() => setDashChrome(VG._dashboardChrome || null));
    }, []);

    const isDashboard = !!(mod && VG._activeModuleNav && VG._activeModuleNav.modId === mod.id && VG._activeModuleNav.section === "dashboard");
    const dashActions = isDashboard && dashChrome && dashChrome.modId === mod.id ? dashChrome : null;
    const subtitle = dashActions && dashActions.subtitle
      ? dashActions.subtitle
      : (mod ? `Veraglo ERP · ${role.label}` : "Veraglo ERP");

    return (
      <header className={"sticky top-0 z-30 app-chrome border-b vg-topbar-shell" + (dashActions && dashActions.actions && dashActions.actions.length ? " vg-topbar-shell--expanded" : "")}>
        <div className="vg-topbar-main h-16 flex items-center gap-3 px-4 sm:px-6">
        <button className="lg:hidden -ml-1 p-2 rounded-lg hover:bg-white/10" onClick={onToggleMobile}><Icon name="menu" size={20} /></button>
        {onOpenSearch && (
          <button type="button" className="md:hidden p-2 rounded-lg hover:bg-white/10" onClick={onOpenSearch} title="Search (⌘K)"><Icon name="search" size={20} /></button>
        )}

        <div className="flex items-center gap-2 min-w-0">
          <span className="grid place-items-center w-8 h-8 rounded-lg text-white shrink-0" style={{ background: "var(--accent)" }}>
            <Icon name={mod ? mod.icon : "grid"} size={16} />
          </span>
          <div className="leading-tight min-w-0">
            <div className="text-sm font-semibold truncate" title={VG.buildId ? "UI build " + VG.buildId : undefined}>{mod ? mod.name : "Home"}</div>
            <div className="text-[11px] opacity-55 truncate">{subtitle}</div>
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
                {tasks.length === 0 && inbox.length === 0 && <li className="text-sm opacity-50 p-2">You're all caught up 🎉</li>}
                {inbox.map((n) => (
                  <li key={n.id}>
                    <button onClick={() => { setOpen(null); if (db.markNotificationRead) db.markNotificationRead(n.id, roleKey); VG.goTo(n.module || "sales", n.section || "commcenter"); }} className="w-full flex items-center gap-2 text-sm rounded-lg p-2 chrome-hover text-left">
                      <span className="mt-0.5 w-2 h-2 rounded-full shrink-0" style={{ background: n.tone || "#60a5fa" }} />
                      <span className="flex-1 min-w-0"><span className="block truncate font-medium">{n.title}</span>{n.body && <span className="block text-[11px] opacity-55 truncate">{n.body}</span>}</span>
                    </button>
                  </li>
                ))}
                {tasks.map((t, i) => (
                  <li key={"t-" + i}>
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

          <AppUserMenu roleKey={roleKey} email={email} userId={userId} name={name} theme={theme} setTheme={setTheme} onHome={onHome} onLogout={onLogout} />
        </div>
        </div>
        {dashActions && dashActions.actions && dashActions.actions.length > 0 && VG.DashboardQuickActionBar && (
          <div className="vg-topbar-actions px-4 sm:px-6 pb-3">
            <VG.DashboardQuickActionBar
              actions={dashActions.actions}
              can={dashActions.can}
              accent={dashActions.accent}
              embedded
            />
          </div>
        )}
      </header>
    );
  }

  /* Global host for the "Add New Item" full-page screen opened from any
     transaction line. Renders INSIDE the workspace content area so the sidebar,
     topbar and theme stay visible; the source form stays mounted underneath so
     its data is preserved, and on save the new item is auto-selected via the
     context onSuccess callback. */
  function ItemFormHost({ roleKey }) {
    const [ctx, setCtx] = useState(() => (VG.getItemFormContext ? VG.getItemFormContext() : { isOpen: false }));
    useEffect(() => {
      if (!VG.onItemFormContextChange) return;
      return VG.onItemFormContextChange(() => setCtx(VG.getItemFormContext()));
    }, []);
    if (!ctx.isOpen || !VG.ItemForm) return null;
    const close = () => VG.closeItemFormContext();
    return (
      <div className="vg-item-form-host" role="region" aria-label="Add New Item">
        <div className="vg-item-form-host-inner">
          <VG.ItemForm
            open
            record={null}
            roleKey={roleKey}
            can={(a) => a === "add" || a === "edit" || VG.can(roleKey, a, "inventory")}
            onClose={close}
            onSaved={(rec) => { const cb = ctx.onSuccess; close(); if (cb) cb(rec); }}
          />
        </div>
      </div>
    );
  }

  /* Global host for the "Add New Customer" full-page screen opened from any
     transaction (Quotation/PI/SO/Invoice/Enquiry/etc.). Same pattern as
     ItemFormHost: renders inside the workspace content area so sidebar/topbar/
     theme stay visible, preserves the source form, and auto-selects the new
     customer on save. */
  function CustomerFormHost({ roleKey }) {
    const [ctx, setCtx] = useState(() => (VG.getCustomerFormContext ? VG.getCustomerFormContext() : { isOpen: false }));
    useEffect(() => {
      if (!VG.onCustomerFormContextChange) return;
      return VG.onCustomerFormContextChange(() => setCtx(VG.getCustomerFormContext()));
    }, []);
    if (!ctx.isOpen || !VG.CustomerForm) return null;
    const close = () => VG.closeCustomerFormContext();
    return (
      <div className="vg-master-form-host" role="region" aria-label="Add New Customer">
        <div className="vg-master-form-host-inner">
          <VG.CustomerForm
            open
            record={null}
            roleKey={roleKey}
            can={(a) => a === "add" || a === "edit" || a === "approve" || VG.can(roleKey, a, "sales")}
            onClose={close}
            onSaved={(rec) => { const cb = ctx.onSuccess; close(); if (cb) cb(rec); }}
          />
        </div>
      </div>
    );
  }

  function Workspace({ roleKey, email, userId, name, moduleId, onOpen, onHome, onLogout, theme, setTheme, onOpenSearch }) {
    const mod = VG.MODULE_BY_ID[moduleId];
    const [collapsed, setCollapsed] = useState(() => {
      try { return localStorage.getItem(SIDEBAR_KEY) === "1"; } catch (e) { return false; }
    });
    const [hoverExpand, setHoverExpand] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => { setAccent(mod ? mod.accent : "#6366f1"); }, [moduleId]);
    useEffect(() => { setMobileOpen(false); }, [moduleId]);
    useEffect(() => { VG.activeUserEmail = email; VG.activeRoleKey = roleKey; VG.activeUserId = userId; }, [email, roleKey, userId]);
    useEffect(() => {
      if (userId && VG.store && VG.store.applyUiDisplay) VG.store.applyUiDisplay(userId);
    }, [userId]);
    useEffect(() => {
      try { localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0"); } catch (e) {}
    }, [collapsed]);

    return (
      <div className={"min-h-screen flex vg-app-shell vg-app-shell-layout"}>
        <Sidebar roleKey={roleKey} activeId={moduleId} onOpen={onOpen} onHome={onHome}
          collapsed={collapsed} setCollapsed={setCollapsed} hoverExpand={hoverExpand} setHoverExpand={setHoverExpand}
          mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
        <div className="vg-shell-column flex-1 min-w-0 flex flex-col">
          <Topbar roleKey={roleKey} email={email} userId={userId} name={name} mod={mod} onHome={onHome} onToggleMobile={() => setMobileOpen(true)}
            theme={theme} setTheme={setTheme} onLogout={onLogout} onOpenSearch={onOpenSearch} />
          <div className="vg-shell-canvas-wrap flex-1 min-h-0 flex flex-col">
            <main id="vg-main-content" className="relative flex-1 w-full min-w-0 max-w-none min-h-0 vg-premium-workspace vg-workspace-canvas overflow-auto">
              {mod ? <VG.ModuleWorkspace key={moduleId} mod={mod} roleKey={roleKey} /> : <div className="opacity-60 vg-workspace-inset">Module not found.</div>}
              <ItemFormHost roleKey={roleKey} />
              <CustomerFormHost roleKey={roleKey} />
            </main>
          </div>
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
    const Shell = VG.LoginWeatherShell || (({ children, header }) => (
      <div className="relative min-h-screen flex items-center justify-center p-6">
        <img src={HERO} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-ink-950/90" />
        <div className="relative z-10 w-full">{header}{children}</div>
      </div>
    ));
    return (
      <Shell
        header={(
          <header className="flex items-center justify-between px-6 sm:px-10 py-6">
            <img src={LOGO} alt="Veraglo" className="h-9 w-auto" />
          </header>
        )}
      >
        <div className="flex items-center justify-center px-6 pb-14">
          <div className="w-full max-w-lg login-panel rounded-2xl p-8 animate-scale-in">
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
      </Shell>
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
        if (!s.lastActiveAt) s.lastActiveAt = s.since || Date.now();
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
    const [setupMode, setSetupMode] = useState("loading");
    const [dataMissing, setDataMissing] = useState(false);
    const [forgotPassword, setForgotPassword] = useState(false);
    const [forgotOrgCode, setForgotOrgCode] = useState(() => (VG.tenant && VG.tenant.currentSlug()) || "default");
    const [mustChangePassword, setMustChangePassword] = useState(false);
    const [resetToken, setResetToken] = useState(() => {
      try {
        const p = new URLSearchParams(window.location.search);
        return p.get("reset") || "";
      } catch (e) { return ""; }
    });

    useEffect(() => {
      if (!resetToken) return;
      setForgotPassword(true);
    }, [resetToken]);

    function closeForgotPassword() {
      setForgotPassword(false);
      setResetToken("");
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("reset");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      } catch (e) {}
    }

    async function refreshSetupMode() {
      if (!VG.store) return;
      const local = VG.store.getSetupStatus ? VG.store.getSetupStatus() : { needsSetup: !VG.store.hasLoginUsers() };
      try {
        const res = await fetch((VG.apiBase || "") + "/api/auth/status");
        if (!res.ok) throw new Error("status " + res.status);
        const data = await res.json();
        setDataMissing(false);
        if (data.dataIntegrityWarning || (local.dataIntegrityWarning && !data.hasUsers)) {
          setSetupMode("integrity");
          setNeedsSetup(false);
          VG.store.audit && VG.store.audit("system", "setup-redirect-blocked", "auth", "-", "Blocked first-admin setup — transactional data exists without login users");
        } else if (data.needsSetup && !data.hasTransactionalData && !data.hasCompanyProfile) {
          setSetupMode("setup");
          setNeedsSetup(true);
        } else {
          setSetupMode("login");
          setNeedsSetup(false);
        }
      } catch (e) {
        if (local.dataIntegrityWarning) {
          setSetupMode("integrity");
          setNeedsSetup(false);
        } else if (local.needsSetup) {
          setSetupMode("setup");
          setNeedsSetup(true);
        } else {
          setSetupMode("login");
          setNeedsSetup(false);
        }
      }
    }

    useEffect(() => {
      if (!VG.store) return;
      refreshSetupMode();
      return VG.store.subscribe(() => {
        const local = VG.store.getSetupStatus ? VG.store.getSetupStatus() : { needsSetup: !VG.store.hasLoginUsers(), dataIntegrityWarning: false };
        if (local.dataIntegrityWarning) {
          setSetupMode("integrity");
          setNeedsSetup(false);
        } else if (local.needsSetup) {
          setSetupMode("setup");
          setNeedsSetup(true);
        } else {
          setSetupMode("login");
          setNeedsSetup(false);
        }
      });
    }, []);

    const setTheme = (t) => { setThemeState(t); applyTheme(t); persist({ theme: t }); };

    function applySavedOrganizationTheme(preferredMode) {
      if (!VG.store || !VG.applyOrganizationTheme) return preferredMode;
      const st = VG.store.settings();
      const ts = st.themeSettings || (VG.defaultThemeSettings ? VG.defaultThemeSettings() : null);
      if (!ts) return preferredMode;
      const mode = ts.allowUserSwitch === false
        ? (ts.defaultMode || preferredMode || "dark")
        : (preferredMode || ts.defaultMode || "dark");
      VG.applyOrganizationTheme(ts, { mode, customThemes: st.customThemes });
      return mode;
    }

    VG.onOrganizationThemeApplied = (mode) => {
      if (mode && mode !== theme) setThemeState(mode);
      applyTheme(mode || theme);
      persist({ theme: mode || theme });
    };
    function persist(patch) {
      try {
        const cur = JSON.parse(localStorage.getItem(STORE) || "{}");
        localStorage.setItem(STORE, JSON.stringify({ ...cur, ...patch }));
      } catch (e) {}
    }

    useEffect(() => {
      const mode = applySavedOrganizationTheme(theme);
      if (mode && mode !== theme) setThemeState(mode);
    }, []);

    useEffect(() => {
      if (!VG.store) return;
      const check = () => setLicensed(VG.store.isLicensed().ok);
      check();
      return VG.store.subscribe(check);
    }, []);

    const logoutGuard = useRef(false);
    const sessionRef = useRef(session);
    useEffect(() => { sessionRef.current = session; }, [session]);

    useEffect(() => {
      if (!session) return;
      let validateTimer;
      const check = () => {
        if (logoutGuard.current) return;
        clearTimeout(validateTimer);
        validateTimer = setTimeout(() => {
          const cur = sessionRef.current;
          if (!cur || !VG.store) return;
          const v = VG.store.validateSession(cur);
          if (!v.ok) {
            logoutGuard.current = true;
            VG.store.audit && VG.store.audit(cur.roleKey || "system", "session-ended", "auth", cur.userId || "-", v.reason || "Session validation failed");
            VG.toast(v.reason || "Session ended", "error");
            logout(true);
          }
        }, 150);
      };
      check();
      const unsub = VG.store.subscribe(check);
      return () => { clearTimeout(validateTimer); unsub(); };
    }, [session && session.userId]);

    useEffect(() => {
      if (!session) return;
      let lastTouch = 0;
      function bumpActivity() {
        const now = Date.now();
        if (now - lastTouch < 15000) return;
        lastTouch = now;
        const cur = sessionRef.current;
        if (!cur) return;
        const next = { ...cur, lastActiveAt: now };
        sessionRef.current = next;
        setSession(next);
        persist(next);
      }
      const events = ["mousedown", "keydown", "scroll", "touchstart", "click"];
      events.forEach((e) => window.addEventListener(e, bumpActivity, { passive: true }));
      return () => events.forEach((e) => window.removeEventListener(e, bumpActivity));
    }, [session && session.userId]);

    useEffect(() => {
      if (!session || !VG.store) return;
      const sid = session.sessionId || ("ses-" + Date.now());
      if (!session.sessionId) persist({ ...session, sessionId: sid });
      const beat = () => {
        const cur = sessionRef.current;
        if (!cur) return;
        const res = VG.store.sessionHeartbeat({
          sessionId: sid, userId: cur.userId, email: cur.email, roleKey: cur.roleKey,
          moduleId: moduleId || "", machineId: VG.getMachineId && VG.getMachineId(),
          machineName: VG.getMachineLabel && VG.getMachineLabel(),
          since: cur.since || Date.now(),
          lastActiveAt: cur.lastActiveAt || cur.since || Date.now(),
        });
        if (res && res.ok === false) logout(true);
      };
      beat();
      const t = setInterval(beat, 60000);
      return () => clearInterval(t);
    }, [session && session.userId, moduleId]);

    async function login(loginId, password, orgSlug) {
      if (VG.tenant && orgSlug) VG.tenant.setSlug(orgSlug);
      if (VG.store && VG.store.init) await VG.store.init();
      const lic = VG.store && VG.store.isLicensed ? VG.store.isLicensed() : { ok: true };
      if (!lic.ok) {
        VG.toast(lic.reason || "License required", "error");
        return false;
      }
      const v = VG.store && VG.store.validateLogin
        ? await VG.store.validateLogin(loginId, password)
        : { ok: false, reason: "Authentication unavailable" };
      if (!v.ok) {
        VG.toast(v.reason || "Sign-in failed", "error");
        return false;
      }
      if (VG.store && VG.store.recordLogin) VG.store.recordLogin(loginId, v.roleKey, true, { user: v.user, ip: "" });
      if (VG.store && VG.store.syncAllRolesToRuntime) VG.store.syncAllRolesToRuntime();
      const roleKey = v.roleKey;
      const role = VG.ROLES[roleKey];
      if (!role || !VG.modulesForRole(roleKey).length) {
        VG.toast("No module access for this role — check Admin → Roles", "error");
        return false;
      }
      const s = {
        userId: v.user.id, roleKey, email: v.email, name: v.user.name, userIdLabel: v.user.userId,
        moduleId: null, uiRev: UI_REV, sessionId: "ses-" + Date.now(), since: Date.now(), lastActiveAt: Date.now(),
      };
      setSession(s); setModuleId(null); persist(s);
      VG.activeUserId = v.user.id;
      if (VG.store && VG.store.applyUiDisplay) VG.store.applyUiDisplay(v.user.id);
      if (v.user.forcePasswordChange) setMustChangePassword(true);
      return true;
    }
    function logout(silent) {
      if (logoutGuard.current && !session) return;
      const sid = session && session.sessionId;
      logoutGuard.current = true;
      if (session && VG.store && VG.store.audit) {
        VG.store.audit(session.roleKey || "system", "logout", "auth", session.userId || "-", silent ? "Session ended" : "User signed out");
      }
      setSession(null); setModuleId(null);
      if (sid && VG.store && VG.store.endSession) VG.store.endSession(sid);
      clearAuthCache();
      setAccent("#6366f1");
      logoutGuard.current = false;
      refreshSetupMode();
      if (!silent) VG.toast("Signed out", "info");
    }

    async function reloadFromServer() {
      if (VG.store && VG.store.init) {
        await VG.store.init();
        await refreshSetupMode();
        VG.toast("Reloaded company data from server");
      }
    }

    async function runAuthRepair() {
      if (!VG.store || !VG.store.repairAuthState) return;
      const res = await VG.store.repairAuthState(session && session.roleKey ? session.roleKey : "admin");
      await refreshSetupMode();
      VG.toast(res.message || "Auth repair completed", res.ok ? "success" : "error");
    }
    async function openModule(id) {
      const allowed = VG.modulesForRole(session.roleKey).some((m) => m.id === id);
      if (!allowed || !VG.can(session.roleKey, "view", id)) {
        VG.toast("You do not have permission to open this module", "error");
        return;
      }
      if (moduleId && moduleId !== id) {
        const ok = await guardedNavigate();
        if (!ok) return;
      }
      if (VG.store && VG.store.recordModuleOpen) {
        VG.store.recordModuleOpen(session.roleKey, id, session.roleKey);
      }
      setModuleId(id); persist({ moduleId: id });
    }
    async function goHome() {
      if (moduleId) {
        const ok = await guardedNavigate();
        if (!ok) return;
      }
      setModuleId(null); persist({ moduleId: null }); setAccent("#6366f1");
    }
    VG._openModule = openModule;
    const openSearch = () => setSearchOpen(true);
    VG._openSearch = openSearch;

    let screen;
    if (!licensed) screen = <ActivationScreen onActivated={() => setLicensed(true)} />;
    else if (!session && dataMissing) screen = <DataMissingScreen theme={theme} setTheme={setTheme} onRetry={reloadFromServer} />;
    else if (!session && setupMode === "integrity") screen = <DataIntegrityScreen theme={theme} setTheme={setTheme} onRetry={reloadFromServer} onRepair={runAuthRepair} />;
    else if (!session && setupMode === "setup" && needsSetup) screen = <InitialSetup onComplete={login} theme={theme} setTheme={setTheme} />;
    else if (!session && setupMode === "loading") screen = (
      <div className="min-h-screen grid place-items-center text-sm opacity-60">Loading sign-in…</div>
    );
    else if (!session && forgotPassword && VG.ForgotPasswordFlow) {
      screen = (
        <VG.ForgotPasswordFlow
          theme={theme}
          setTheme={setTheme}
          onBack={closeForgotPassword}
          initialToken={resetToken}
          initialOrgCode={forgotOrgCode}
        />
      );
    }
    else if (!session) screen = (
      <Login
        onLogin={(e, p) => login(e, p, VG.tenant && VG.tenant.currentSlug())}
        theme={theme}
        setTheme={setTheme}
        needsSetup={needsSetup}
        onForgotPassword={(org) => { setForgotOrgCode(org || (VG.tenant && VG.tenant.currentSlug()) || "default"); setForgotPassword(true); }}
      />
    );
    else if (!moduleId) screen = (VG.WelcomeHome ? <VG.WelcomeHome roleKey={session.roleKey} email={session.email} userId={session.userId} name={session.name} onOpen={openModule} onLogout={logout} theme={theme} setTheme={setTheme} onOpenSearch={openSearch} /> : <Launcher roleKey={session.roleKey} email={session.email} onOpen={openModule} onLogout={logout} theme={theme} setTheme={setTheme} onOpenSearch={openSearch} />);
    else screen = <Workspace roleKey={session.roleKey} email={session.email} userId={session.userId} name={session.name} moduleId={moduleId} onOpen={openModule} onHome={goHome} onLogout={logout} theme={theme} setTheme={setTheme} onOpenSearch={openSearch} />;
    const SearchModal = VG.UniversalSearch;
    const FX = VG.fx;
    return (
      <div id="vg-app-root" className="min-h-screen relative">
        {screen}
        {session && mustChangePassword && (
          <ForcePasswordChangeModal
            open
            userId={session.userId}
            email={session.email}
            roleKey={session.roleKey}
            onComplete={() => setMustChangePassword(false)}
          />
        )}
        {session && SearchModal && <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} roleKey={session.roleKey} />}
        {FX && <FX.Toaster />}
        {FX && <FX.Confirmer />}
        {FX && FX.LeavePageHost && <FX.LeavePageHost />}
        {FX && FX.BannerHost && <FX.BannerHost />}
        {VG.workflowReview && VG.workflowReview.WorkflowReviewHost && <VG.workflowReview.WorkflowReviewHost />}
      </div>
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

  VG.AppUserMenu = AppUserMenu;
  VG.guardedNavigate = guardedNavigate;

  VG.bootApp = function bootApp() {
    if (VG._uiLayout !== "premium-full-page" && VG._uiLayout !== "flat-full-page" && VG._uiLayout !== "full-page") {
      console.error("[Veraglo] Outdated UI detected. Pull latest code and hard-refresh (Cmd+Shift+R). Expected VG._uiLayout premium-full-page.");
      if (VG.toast) VG.toast("Outdated UI scripts loaded — git pull origin main, restart server, hard refresh", "warn");
    }
    const el = document.getElementById("root");
    const root = ReactDOM.createRoot(el);
    root.render(
      <BootErrorBoundary>
        <App />
      </BootErrorBoundary>
    );
  };
})(window.VG);
