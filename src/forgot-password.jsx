/* Veraglo ERP — self-service forgot password flow on login screen. */
(function (VG) {
  const { useState, useEffect, useMemo } = React;
  const { Icon, Button } = VG.ui;

  const STEPS = ["identify", "verify", "questions", "pending", "password", "done"];

  function apiHeaders() {
    return VG.tenant && VG.tenant.headers ? VG.tenant.headers({ "Content-Type": "application/json" }) : { "Content-Type": "application/json" };
  }

  async function api(path, body) {
    const base = VG.apiBase != null ? String(VG.apiBase) : "";
    const res = await fetch(base + path, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(body || {}),
    });
    return res.json();
  }

  async function fetchSettings(orgCode) {
    if (VG.tenant) VG.tenant.setSlug(orgCode || "default");
    const base = VG.apiBase || "";
    const res = await fetch(base + "/api/auth/forgot-password/settings", { headers: apiHeaders() });
    return res.ok ? res.json() : null;
  }

  function passwordStrengthLocal(pwd, policy) {
    if (VG.store && VG.store.passwordStrength) return VG.store.passwordStrength(pwd);
    const text = String(pwd || "");
    if (!text) return { level: "weak", label: "Weak" };
    let score = 0;
    if (text.length >= (policy && policy.minLength) || 8) score++;
    if (text.length >= 12) score++;
    if (/[A-Z]/.test(text)) score++;
    if (/[a-z]/.test(text)) score++;
    if (/\d/.test(text)) score++;
    if (/[^A-Za-z0-9]/.test(text)) score++;
    if (score <= 2) return { level: "weak", label: "Weak" };
    if (score >= 5) return { level: "strong", label: "Strong" };
    return { level: "medium", label: "Medium" };
  }

  function PasswordStrengthBar({ password, policy }) {
    const strength = passwordStrengthLocal(password, policy);
    const colors = { weak: "bg-rose-500", medium: "bg-amber-500", strong: "bg-emerald-500" };
    const widths = { weak: "w-1/3", medium: "w-2/3", strong: "w-full" };
    return (
      <div className="mt-2">
        <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div className={"h-full rounded-full transition-all " + (colors[strength.level] || colors.weak) + " " + (widths[strength.level] || widths.weak)} />
        </div>
        <p className="text-[11px] mt-1 login-muted">Strength: <span className={"font-medium " + (strength.level === "strong" ? "text-emerald-700" : strength.level === "medium" ? "text-amber-700" : "text-rose-700")}>{strength.label}</span></p>
      </div>
    );
  }

  function PolicyHints({ policy }) {
    if (!policy) return null;
    const rules = [];
    if (policy.minLength) rules.push("At least " + policy.minLength + " characters");
    if (policy.requireUpper) rules.push("Uppercase letter");
    if (policy.requireLower) rules.push("Lowercase letter");
    if (policy.requireNumber) rules.push("Number");
    if (policy.requireSpecial) rules.push("Special character");
    return <ul className="text-[11px] login-muted mt-2 space-y-0.5 list-disc list-inside">{rules.map((r) => <li key={r}>{r}</li>)}</ul>;
  }

  function ForgotPasswordFlow({ onBack, theme, setTheme, initialRequestId, initialToken, initialOrgCode }) {
    const [step, setStep] = useState(initialRequestId && initialToken ? "verify" : initialRequestId ? "password" : "identify");
    const [enabled, setEnabled] = useState(true);
    const [email, setEmail] = useState("");
    const [employeeId, setEmployeeId] = useState("");
    const [mobile, setMobile] = useState("");
    const [orgCode, setOrgCode] = useState(initialOrgCode || (VG.tenant && VG.tenant.currentSlug()) || "default");
    const [requestId, setRequestId] = useState(initialRequestId || "");
    const [otp, setOtp] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [answers, setAnswers] = useState({});
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [otpMins, setOtpMins] = useState(10);
    const [methods, setMethods] = useState({ emailOtp: true, mobileOtp: true, securityQuestions: false, adminApproval: false });
    const [policy, setPolicy] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [verificationMode, setVerificationMode] = useState("otp");
    const [multiOrg, setMultiOrg] = useState(false);
    const [tenants, setTenants] = useState([]);

    useEffect(() => {
      fetchSettings(orgCode).then((data) => {
        if (!data) return;
        setEnabled(data.enabled !== false);
        if (data.otpExpiryMins) setOtpMins(data.otpExpiryMins);
        if (data.methods) setMethods(data.methods);
        if (data.passwordPolicy) setPolicy(data.passwordPolicy);
      }).catch(() => {});
      if (VG.tenant && VG.tenant.listTenants) {
        VG.tenant.listTenants().then((list) => {
          setTenants(list || []);
          setMultiOrg((list || []).length > 1);
        }).catch(() => {});
      }
    }, [orgCode]);

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

    useEffect(() => {
      if (step !== "pending" || !requestId) return;
      const timer = setInterval(() => {
        api("/api/auth/forgot-password/approval-status", { requestId }).then((data) => {
          if (data.approved) {
            setStep("password");
            setMessage("Your reset request was approved. Create a new password below.");
          }
        }).catch(() => {});
      }, 5000);
      return () => clearInterval(timer);
    }, [step, requestId]);

    const availableMethods = useMemo(() => {
      const list = [];
      if (methods.emailOtp || methods.mobileOtp) list.push({ id: "otp", label: "Email / Mobile OTP" });
      if (methods.securityQuestions) list.push({ id: "security-questions", label: "Security questions" });
      if (methods.adminApproval) list.push({ id: "admin-approval", label: "Administrator approval" });
      return list.length ? list : [{ id: "otp", label: "Email / Mobile OTP" }];
    }, [methods]);

    async function submitIdentify(e) {
      e.preventDefault();
      if (busy || !email.trim()) return;
      if (VG.tenant) VG.tenant.setSlug(orgCode || "default");
      setBusy(true);
      setMessage("");
      try {
        const data = await api("/api/auth/forgot-password/request", {
          email: email.trim(),
          employeeId: employeeId.trim() || undefined,
          mobile: mobile.trim() || undefined,
          verificationMode,
        });
        if (data.disabled) {
          setMessage(data.message || "Password reset is disabled.");
          return;
        }
        if (data.methods) setMethods(data.methods);
        setRequestId(data.requestId || "");
        setMessage(data.message || "If an account matches, instructions have been sent.");
        if (data.nextStep === "admin-pending") setStep("pending");
        else if (data.nextStep === "security-questions") {
          setQuestions(data.questions || []);
          setStep("questions");
        } else setStep("verify");
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

    async function submitQuestions(e) {
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      setMessage("");
      try {
        const data = await api("/api/auth/forgot-password/verify-questions", { requestId, answers });
        if (!data.ok) {
          setMessage(data.reason || "Incorrect answers.");
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
      <Shell showWidget={false} header={<BackHeader theme={theme} setTheme={setTheme} onBack={onBack} title="Forgot password" />}>
        <Panel>
          <StepIndicator step={step} />

          {step === "identify" && (
            <>
              <h2 className="text-xl font-display font-semibold text-slate-900">Password recovery</h2>
              <p className="text-sm login-muted mt-1">Verify your identity to reset your password.</p>
              <form onSubmit={submitIdentify} className="mt-5 space-y-4">
                {(multiOrg || orgCode !== "default") && (
                  <div>
                    <label className="text-xs login-label">Organization</label>
                    {tenants.length > 1 ? (
                      <select value={orgCode} onChange={(e) => setOrgCode(e.target.value)} className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm">
                        {tenants.map((t) => <option key={t.slug} value={t.slug}>{t.name || t.slug}</option>)}
                      </select>
                    ) : (
                      <input value={orgCode} onChange={(e) => setOrgCode(e.target.value)} placeholder="default"
                        className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm font-mono" />
                    )}
                  </div>
                )}
                <div>
                  <label className="text-xs login-label">Registered email <span className="text-rose-600">*</span></label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username"
                    placeholder="you@company.com" className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm" />
                </div>
                <div>
                  <label className="text-xs login-label">Employee ID <span className="opacity-60">(optional)</span></label>
                  <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="EMP000001"
                    className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm" />
                </div>
                <div>
                  <label className="text-xs login-label">Mobile number <span className="opacity-60">(optional)</span></label>
                  <input value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" placeholder="9876543210"
                    className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm" />
                </div>
                {availableMethods.length > 1 && (
                  <div>
                    <label className="text-xs login-label">Verification method</label>
                    <select value={verificationMode} onChange={(e) => setVerificationMode(e.target.value)}
                      className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm">
                      {availableMethods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  </div>
                )}
                {message && <p className="text-xs text-slate-600">{message}</p>}
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="soft" className="flex-1 !py-3" onClick={onBack} disabled={busy}>Cancel</Button>
                  <Button type="submit" icon="shield" className="flex-1 !py-3" disabled={busy}>
                    {busy ? "Verifying…" : "Verify user"}
                  </Button>
                </div>
              </form>
            </>
          )}

          {step === "verify" && (
            <>
              <h2 className="text-xl font-display font-semibold text-slate-900">Verify your identity</h2>
              <p className="text-sm login-muted mt-1">
                Enter the 6-digit code sent to your registered email or mobile. Expires in {otpMins} minutes.
              </p>
              {message && <p className="text-xs text-slate-600 mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200">{message}</p>}
              <form onSubmit={submitOtp} className="mt-5 space-y-4">
                <div>
                  <label className="text-xs login-label">Verification code</label>
                  <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required placeholder="000000"
                    className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm text-center tracking-[0.35em] font-mono text-lg" />
                </div>
                <Button type="submit" icon="check" className="w-full !py-3" disabled={busy || otp.length < 6}>
                  {busy ? "Verifying…" : "Verify code"}
                </Button>
                {methods.securityQuestions && (
                  <button type="button" className="w-full text-xs login-muted hover:text-slate-700 underline"
                    onClick={() => { setStep("questions"); setMessage(""); }}>
                    Use security questions instead
                  </button>
                )}
                <button type="button" className="w-full text-xs login-muted hover:text-slate-700 underline"
                  onClick={() => { setStep("identify"); setOtp(""); setMessage(""); }}>
                  Start over
                </button>
              </form>
            </>
          )}

          {step === "questions" && (
            <>
              <h2 className="text-xl font-display font-semibold text-slate-900">Security questions</h2>
              <p className="text-sm login-muted mt-1">Answer the questions configured by your administrator.</p>
              <form onSubmit={submitQuestions} className="mt-5 space-y-4">
                {(questions.length ? questions : [{ id: "q1", question: "Security question" }]).map((q) => (
                  <div key={q.id}>
                    <label className="text-xs login-label">{q.question}</label>
                    <input value={answers[q.id] || ""} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                      required className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm" />
                  </div>
                ))}
                {message && <p className="text-xs text-red-600">{message}</p>}
                <Button type="submit" icon="check" className="w-full !py-3" disabled={busy}>{busy ? "Verifying…" : "Verify answers"}</Button>
              </form>
            </>
          )}

          {step === "pending" && (
            <div className="text-center py-4">
              <span className="inline-grid place-items-center w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 mb-4">
                <Icon name="clock" size={28} />
              </span>
              <h2 className="text-xl font-display font-semibold text-slate-900">Awaiting administrator approval</h2>
              <p className="text-sm login-muted mt-2">{message || "An administrator will review your request. You will receive a reset link once approved."}</p>
              <p className="text-xs login-muted mt-3">This page checks for approval every few seconds.</p>
              <Button variant="soft" className="mt-6 w-full !py-3" onClick={onBack}>Back to sign in</Button>
            </div>
          )}

          {step === "password" && (
            <>
              <h2 className="text-xl font-display font-semibold text-slate-900">Create new password</h2>
              <p className="text-sm login-muted mt-1">Choose a strong password you have not used before.</p>
              <PolicyHints policy={policy} />
              <form onSubmit={submitPassword} className="mt-5 space-y-4">
                <div>
                  <label className="text-xs login-label">New password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password"
                    className="login-input mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm" />
                  <PasswordStrengthBar password={password} policy={policy} />
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
    const flow = ["identify", "verify", "password"];
    const idx = flow.indexOf(step === "questions" || step === "pending" ? "verify" : step);
    if (idx < 0 || step === "done") return null;
    return (
      <div className="flex gap-1.5 mb-5">
        {flow.map((s, i) => (
          <div key={s} className={"h-1 flex-1 rounded-full transition-colors " + (i <= idx ? "bg-indigo-500" : "bg-slate-200")} />
        ))}
      </div>
    );
  }

  VG.ForgotPasswordFlow = ForgotPasswordFlow;
})(window.VG);
