/* Veraglo ERP — self-service forgot password flow on login screen. */
(function (VG) {
  const { useState, useEffect } = React;
  const { Icon, Button } = VG.ui;

  const STEPS = ["identify", "verify", "password", "done"];

  async function api(path, body) {
    const base = VG.apiBase != null ? String(VG.apiBase) : "";
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    return res.json();
  }

  function ForgotPasswordFlow({ onBack, theme, setTheme, initialRequestId, initialToken }) {
    const [step, setStep] = useState(initialRequestId && initialToken ? "verify" : initialRequestId ? "password" : "identify");
    const [enabled, setEnabled] = useState(true);
    const [identifier, setIdentifier] = useState("");
    const [requestId, setRequestId] = useState(initialRequestId || "");
    const [otp, setOtp] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [otpMins, setOtpMins] = useState(10);

    useEffect(() => {
      fetch((VG.apiBase || "") + "/api/auth/forgot-password/settings")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (!data) return;
          setEnabled(data.enabled !== false);
          if (data.otpExpiryMins) setOtpMins(data.otpExpiryMins);
        })
        .catch(() => {});
    }, []);

    useEffect(() => {
      if (!initialToken) return;
      setBusy(true);
      api("/api/auth/forgot-password/verify-link", { token: initialToken })
        .then((data) => {
          if (data.ok && data.requestId) {
            setRequestId(data.requestId);
            setStep("password");
            setMessage("");
          } else {
            setMessage(data.reason || "This reset link has expired.");
            setStep("identify");
          }
        })
        .catch(() => setMessage("Could not verify reset link."))
        .finally(() => setBusy(false));
    }, [initialToken]);

    async function submitIdentify(e) {
      e.preventDefault();
      if (busy || !identifier.trim()) return;
      setBusy(true);
      setMessage("");
      try {
        const data = await api("/api/auth/forgot-password/request", { identifier: identifier.trim() });
        if (data.disabled) {
          setMessage(data.message || "Password reset is disabled.");
          return;
        }
        setRequestId(data.requestId || "");
        setMessage(data.message || "If an account matches, instructions have been sent.");
        setStep("verify");
      } catch (err) {
        setMessage("Could not process request. Try again later.");
      } finally {
        setBusy(false);
      }
    }

    async function submitOtp(e) {
      e.preventDefault();
      if (busy || !otp.trim()) return;
      setBusy(true);
      setMessage("");
      try {
        const data = await api("/api/auth/forgot-password/verify-otp", { requestId, otp: otp.trim() });
        if (!data.ok) {
          setMessage(data.reason || "Invalid or expired code.");
          return;
        }
        setStep("password");
        setMessage("");
      } catch (err) {
        setMessage("Verification failed. Try again.");
      } finally {
        setBusy(false);
      }
    }

    async function submitPassword(e) {
      e.preventDefault();
      if (busy) return;
      if (password !== confirm) {
        setMessage("Passwords do not match.");
        return;
      }
      setBusy(true);
      setMessage("");
      try {
        const data = await api("/api/auth/forgot-password/reset", { requestId, password });
        if (!data.ok) {
          setMessage(data.reason || "Could not reset password.");
          return;
        }
        setStep("done");
        setMessage(data.message || "Password updated successfully.");
      } catch (err) {
        setMessage("Reset failed. Try again.");
      } finally {
        setBusy(false);
      }
    }

    const Shell = VG.LoginWeatherShell || (({ children, header }) => (
      <div className="relative min-h-screen"><div className="relative z-10 p-6">{header}{children}</div></div>
    ));

    if (!enabled) {
      return (
        <Shell showWidget={false} header={<BackHeader theme={theme} setTheme={setTheme} onBack={onBack} title="Forgot password" />}>
          <Panel>
            <p className="text-sm login-muted">Self-service password reset is disabled. Contact your administrator.</p>
            <Button variant="soft" className="mt-4 w-full" onClick={onBack}>Back to sign in</Button>
          </Panel>
        </Shell>
      );
    }

    return (
      <Shell
        showWidget={false}
        header={<BackHeader theme={theme} setTheme={setTheme} onBack={onBack} title="Forgot password" />}
      >
        <Panel>
          <StepIndicator step={step} />

          {step === "identify" && (
            <>
              <h2 className="text-xl font-display font-semibold text-slate-900">Reset your password</h2>
              <p className="text-sm login-muted mt-1">Enter your registered email or mobile number.</p>
              <form onSubmit={submitIdentify} className="mt-5 space-y-4">
                <div>
                  <label className="text-xs login-label">Email or mobile</label>
                  <input
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    autoComplete="username"
                    placeholder="you@company.com or 9876543210"
                    className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm"
                  />
                </div>
                {message && <p className="text-xs text-slate-600">{message}</p>}
                <Button type="submit" icon="message" className="w-full !py-3" disabled={busy}>
                  {busy ? "Sending…" : "Send reset instructions"}
                </Button>
              </form>
            </>
          )}

          {step === "verify" && (
            <>
              <h2 className="text-xl font-display font-semibold text-slate-900">Verify your identity</h2>
              <p className="text-sm login-muted mt-1">
                Enter the 6-digit code sent to your email or mobile. Code expires in {otpMins} minutes.
              </p>
              {message && <p className="text-xs text-slate-600 mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200">{message}</p>}
              <form onSubmit={submitOtp} className="mt-5 space-y-4">
                <div>
                  <label className="text-xs login-label">Verification code</label>
                  <input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    placeholder="000000"
                    className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm text-center tracking-[0.35em] font-mono text-lg"
                  />
                </div>
                <Button type="submit" icon="check" className="w-full !py-3" disabled={busy || otp.length < 6}>
                  {busy ? "Verifying…" : "Verify code"}
                </Button>
                <button type="button" className="w-full text-xs login-muted hover:text-slate-700 underline" onClick={() => { setStep("identify"); setOtp(""); setMessage(""); }}>
                  Use a different email or mobile
                </button>
              </form>
            </>
          )}

          {step === "password" && (
            <>
              <h2 className="text-xl font-display font-semibold text-slate-900">Create new password</h2>
              <p className="text-sm login-muted mt-1">Choose a strong password you have not used before.</p>
              <form onSubmit={submitPassword} className="mt-5 space-y-4">
                <div>
                  <label className="text-xs login-label">New password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password"
                    className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm" />
                </div>
                <div>
                  <label className="text-xs login-label">Confirm password</label>
                  <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password"
                    className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm" />
                </div>
                {message && <p className="text-xs text-red-600">{message}</p>}
                <Button type="submit" icon="lock" className="w-full !py-3" disabled={busy}>
                  {busy ? "Saving…" : "Update password"}
                </Button>
              </form>
            </>
          )}

          {step === "done" && (
            <div className="text-center py-2">
              <span className="inline-grid place-items-center w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 mb-4">
                <Icon name="check" size={28} />
              </span>
              <h2 className="text-xl font-display font-semibold text-slate-900">Password updated</h2>
              <p className="text-sm login-muted mt-2">{message || "You have been signed out of all devices. Sign in with your new password."}</p>
              <Button icon="logout" className="mt-6 w-full !py-3" onClick={onBack}>Back to sign in</Button>
            </div>
          )}
        </Panel>
      </Shell>
    );
  }

  function Panel({ children }) {
    return (
      <div className="login-panel rounded-2xl p-7 sm:p-8 w-full max-w-md mx-auto animate-scale-in">
        {children}
      </div>
    );
  }

  function BackHeader({ onBack, theme, setTheme, title }) {
    const { Icon } = VG.ui;
    return (
      <header className="flex items-center justify-between px-2 sm:px-4 py-2">
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900 transition">
          <Icon name="chevronLeft" size={18} />
          <span>{title || "Back"}</span>
        </button>
        <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="vg-sun-chip rounded-xl p-2.5">
          <Icon name={theme === "dark" ? "sun" : "moon"} size={18} className="text-slate-600" />
        </button>
      </header>
    );
  }

  function StepIndicator({ step }) {
    const idx = STEPS.indexOf(step);
    if (idx < 0 || step === "done") return null;
    return (
      <div className="flex gap-1.5 mb-5">
        {STEPS.slice(0, 3).map((s, i) => (
          <div key={s} className={"h-1 flex-1 rounded-full transition-colors " + (i <= idx ? "bg-indigo-500" : "bg-slate-200")} />
        ))}
      </div>
    );
  }

  VG.ForgotPasswordFlow = ForgotPasswordFlow;
})(window.VG);
