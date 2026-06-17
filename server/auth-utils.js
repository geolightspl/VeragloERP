import crypto from "crypto";

export function newPasswordSalt() {
  return crypto.randomBytes(16).toString("hex");
}

export async function hashPassword(password, salt) {
  const text = `${salt || ""}:${String(password || "")}`;
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(12);
  let pwd = "";
  for (let i = 0; i < 10; i++) pwd += chars[bytes[i] % chars.length];
  return `${pwd}9!`;
}

const BUILTIN_ROLES = [
  { id: "role_admin", key: "admin", label: "Administrator", tag: "Full system access", avatar: "AD", color: "#2563eb", moduleAccess: "all", actions: ["view", "add", "edit", "delete", "approve", "export", "print"], permissions: {}, hierarchy: 10, builtIn: true, active: true },
  { id: "role_hr", key: "hr", label: "HR Manager", tag: "People & payroll", avatar: "HR", color: "#ec4899", moduleAccess: ["hr", "attendance", "reports", "documents", "support"], actions: ["view", "add", "edit", "approve", "export", "print"], permissions: {}, hierarchy: 20, builtIn: true, active: true },
  { id: "role_sales", key: "sales", label: "Sales Team", tag: "Revenue & customers", avatar: "SL", color: "#6366f1", moduleAccess: ["sales", "enquiry", "reports", "documents", "support"], actions: ["view", "add", "edit", "export", "print"], permissions: {}, hierarchy: 30, builtIn: true, active: true },
  { id: "role_inventory", key: "inventory", label: "Inventory Manager", tag: "Stock & procurement", avatar: "IN", color: "#10b981", moduleAccess: ["inventory", "purchase", "supplier", "reports", "documents"], actions: ["view", "add", "edit", "delete", "approve", "export", "print"], permissions: {}, hierarchy: 40, builtIn: true, active: true },
  { id: "role_production", key: "production", label: "Production Team", tag: "Shop floor & WOs", avatar: "PR", color: "#ef4444", moduleAccess: ["production", "inventory", "quality", "reports", "documents"], actions: ["view", "add", "edit", "export", "print"], permissions: {}, hierarchy: 50, builtIn: true, active: true },
  { id: "role_quality", key: "quality", label: "Quality Control", tag: "Inspections & compliance", avatar: "QC", color: "#8b5cf6", moduleAccess: ["quality", "production", "reports", "documents"], actions: ["view", "add", "edit", "approve", "export", "print"], permissions: {}, hierarchy: 60, builtIn: true, active: true },
  { id: "role_accounts", key: "accounts", label: "Accounts", tag: "Finance & GST", avatar: "AC", color: "#0891b2", moduleAccess: ["accounts", "purchase", "reports", "documents"], actions: ["view", "add", "edit", "approve", "export", "print"], permissions: {}, hierarchy: 70, builtIn: true, active: true },
  { id: "role_dispatch", key: "dispatch", label: "Dispatch", tag: "Shipments & logistics", avatar: "DP", color: "#f97316", moduleAccess: ["dispatch", "inventory", "reports", "documents"], actions: ["view", "add", "edit", "export", "print"], permissions: {}, hierarchy: 80, builtIn: true, active: true },
  { id: "role_employee", key: "employee", label: "Employee", tag: "Self-service portal", avatar: "EM", color: "#22c55e", moduleAccess: ["attendance", "support", "documents"], actions: ["view", "add"], permissions: {}, hierarchy: 90, builtIn: true, active: true },
  { id: "role_super", key: "super_admin", label: "Super Admin", tag: "Unrestricted control", avatar: "SA", color: "#dc2626", moduleAccess: "all", actions: ["view", "add", "edit", "delete", "approve", "reject", "print", "export", "import", "email", "settings"], permissions: {}, hierarchy: 1, builtIn: true, active: true },
  { id: "role_viewer", key: "viewer", label: "Viewer / Read Only", tag: "Read-only access", avatar: "RO", color: "#94a3b8", moduleAccess: ["sales", "inventory", "production", "reports"], actions: ["view", "print"], permissions: {}, hierarchy: 900, builtIn: true, active: true },
  { id: "role_auditor", key: "auditor", label: "Auditor", tag: "Audit & reports", avatar: "AU", color: "#64748b", moduleAccess: ["reports", "admin"], actions: ["view", "export", "print"], permissions: {}, hierarchy: 850, builtIn: true, active: true },
];

export function ensureBuiltInRoles(state) {
  state.customRoles = state.customRoles || [];
  for (const role of BUILTIN_ROLES) {
    if (!state.customRoles.some((r) => r.key === role.key)) {
      state.customRoles.push({ ...role });
    }
  }
  state.customRoles.sort((a, b) => (a.hierarchy || 999) - (b.hierarchy || 999));
}

export function ensureAdminRole(state) {
  ensureBuiltInRoles(state);
}

export function roleForUserRecord(state, user) {
  if (!user || !user.roleKey) return null;
  const found = (state.customRoles || []).find((r) => r.key === user.roleKey && r.active !== false);
  if (found) return found;
  return BUILTIN_ROLES.find((r) => r.key === user.roleKey && r.active !== false) || null;
}

export function findUserByLogin(state, loginId) {
  const q = String(loginId || "").trim().toLowerCase();
  if (!q) return null;
  return (state.erpUsers || []).find((u) => !u.isDeleted && (
    String(u.userId || "").toLowerCase() === q
    || String(u.email || "").toLowerCase() === q
    || String(u.username || "").toLowerCase() === q
  )) || null;
}

export function legacyHashPassword(password, salt) {
  const text = `${salt || ""}:${String(password || "")}`;
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h) ^ text.charCodeAt(i);
  return `legacy-${(h >>> 0).toString(16)}`;
}

export function isUserLoginEligibleServer(state, user) {
  if (!user || user.isDeleted) return { ok: false, reason: "inactive" };
  if (user.status !== "Active") return { ok: false, reason: "inactive" };
  if (user.loginAllowed === false) return { ok: false, reason: "inactive" };
  if (!user.roleKey) return { ok: false, reason: "no_role" };
  if (!roleForUserRecord(state, user)) return { ok: false, reason: "role_missing" };
  const sec = (state.settings && state.settings.security) || {};
  if ((user.failedLogins || 0) >= (sec.maxLoginAttempts || 5) || user.status === "Locked") {
    return { ok: false, reason: "locked" };
  }
  if (!user.passwordHash || String(user.passwordHash).length < 9) {
    return { ok: false, reason: "no_password" };
  }
  return { ok: true };
}

export async function verifyPasswordForUser(user, password) {
  const pwd = String(password || "");
  const hash = await hashPassword(pwd, user.passwordSalt || "");
  if (hash === user.passwordHash) return { ok: true, upgraded: false };
  const legacy = legacyHashPassword(pwd, user.passwordSalt || "");
  if (legacy === user.passwordHash) return { ok: true, upgraded: true };
  return { ok: false };
}

const LOGIN_FAIL_MSG = "Invalid email/password or account is inactive.";

export const LOGIN_REASON_MESSAGES = {
  invalid: "Incorrect email or password.",
  inactive: "This account is inactive. Contact your administrator.",
  deleted: "This account has been removed. Contact your administrator.",
  no_role: "No role assigned to this user. Contact your administrator.",
  role_missing: "The assigned role is inactive or missing. Contact your administrator.",
  locked: "Account locked after too many failed login attempts.",
  no_password: "Password not set. Ask an administrator to reset your password.",
  password_expired: "Password has expired. Use Forgot password or contact your administrator.",
  tenant_not_found: "Organization not found. Check the organization code or use default.",
  no_organization: "User is not assigned to any organization.",
  ip_not_allowed: "Access from your network is not permitted.",
  no_state: "Server data not found. Verify data path or contact IT.",
  missing_credentials: "Enter email and password.",
  server_unavailable: "Authentication service unavailable. Try again shortly.",
};

export function loginFailureMessage(reason, fallback) {
  if (reason && LOGIN_REASON_MESSAGES[reason]) return LOGIN_REASON_MESSAGES[reason];
  return fallback || LOGIN_FAIL_MSG;
}

function passwordExpired(user, sec) {
  const days = Number(sec && sec.passwordExpiryDays) || 0;
  if (!days || !user || !user.passwordChangedAt) return false;
  const changed = Number(user.passwordChangedAt) || 0;
  if (!changed) return false;
  const expiryMs = days * 86400000;
  return Date.now() - changed > expiryMs;
}

export async function validateLoginCredentials(state, loginId, password) {
  const user = findUserByLogin(state, loginId);
  if (!user) return { ok: false, reason: "invalid", message: loginFailureMessage("invalid") };
  if (user.isDeleted) return { ok: false, reason: "deleted", message: loginFailureMessage("deleted") };
  const elig = isUserLoginEligibleServer(state, user);
  if (!elig.ok) return { ok: false, reason: elig.reason, message: loginFailureMessage(elig.reason) };
  const sec = (state.settings && state.settings.security) || {};
  if (passwordExpired(user, sec)) {
    return { ok: false, reason: "password_expired", message: loginFailureMessage("password_expired") };
  }
  const pw = await verifyPasswordForUser(user, password);
  if (!pw.ok) return { ok: false, reason: "invalid", message: loginFailureMessage("invalid") };
  return { ok: true, user, roleKey: user.roleKey, email: user.email, upgraded: pw.upgraded };
}

export function userLoginDiagnostic(state, loginId, tenantId) {
  const user = findUserByLogin(state, loginId);
  const sec = (state && state.settings && state.settings.security) || {};
  const role = user ? roleForUserRecord(state, user) : null;
  const orgOk = !tenantId || tenantId === "default" || !!(state && state.company);
  const checks = {
    userExists: !!user && !user.isDeleted,
    active: !!(user && user.status === "Active" && !user.isDeleted),
    loginAllowed: !!(user && user.loginAllowed !== false),
    roleAssigned: !!(user && user.roleKey),
    roleActive: !!role,
    organizationAssigned: orgOk,
    passwordSet: !!(user && user.passwordHash && String(user.passwordHash).length > 8),
    accountLocked: !!(user && (user.status === "Locked" || (user.failedLogins || 0) >= (sec.maxLoginAttempts || 5))),
    forcePasswordChange: !!(user && user.forcePasswordChange),
    passwordExpired: !!(user && passwordExpired(user, sec)),
  };
  const eligible = user ? isUserLoginEligibleServer(state, user) : { ok: false, reason: "invalid" };
  let canLogin = eligible.ok && !checks.passwordExpired;
  if (!orgOk) canLogin = false;
  return {
    ok: canLogin,
    email: user ? user.email : String(loginId || "").trim().toLowerCase(),
    tenantId: tenantId || "default",
    checks,
    failedLogins: user ? (Number(user.failedLogins) || 0) : 0,
    lastLogin: user && user.lastLogin ? user.lastLogin : null,
    roleKey: user ? user.roleKey : "",
    status: user ? user.status : "Not found",
    reason: !user || user.isDeleted ? "invalid"
      : !orgOk ? "no_organization"
      : !eligible.ok ? eligible.reason
      : checks.passwordExpired ? "password_expired"
      : null,
    message: !user || user.isDeleted ? loginFailureMessage("invalid")
      : !orgOk ? loginFailureMessage("no_organization")
      : !eligible.ok ? loginFailureMessage(eligible.reason)
      : checks.passwordExpired ? loginFailureMessage("password_expired")
      : "User can sign in.",
  };
}

export async function applySuccessfulLogin(state, user, password, upgraded) {
  ensureBuiltInRoles(state);
  if (upgraded && password) {
    const salt = user.passwordSalt || newPasswordSalt();
    user.passwordHash = await hashPassword(password, salt);
    user.passwordSalt = salt;
  }
  user.failedLogins = 0;
  if (user.status === "Locked") user.status = "Active";
  state.loginLog = (state.loginLog || []).concat({
    id: "log-" + Date.now(),
    ts: Date.now(),
    email: user.email,
    roleKey: user.roleKey,
    userId: user.userId || "",
    success: true,
    ok: true,
    ip: "",
    device: "",
    browser: "",
    tenantId: "",
  }).slice(-500);
  return state;
}

export function recordFailedLogin(state, loginId, meta) {
  const user = findUserByLogin(state, loginId);
  const sec = (state.settings && state.settings.security) || {};
  const maxAttempts = Number(sec.maxLoginAttempts) || 5;
  const extra = meta || {};
  if (user) {
    user.failedLogins = (Number(user.failedLogins) || 0) + 1;
    if (user.failedLogins >= maxAttempts) user.status = "Locked";
  }
  state.loginLog = (state.loginLog || []).concat({
    id: "log-" + Date.now(),
    ts: Date.now(),
    email: String(loginId || "").trim().toLowerCase(),
    roleKey: user && user.roleKey ? user.roleKey : "",
    success: false,
    ok: false,
    reason: extra.reason || "",
    ip: extra.ip || "",
    device: extra.device || "",
    browser: extra.browser || "",
    tenantId: extra.tenantId || "",
  }).slice(-500);
  return state;
}

export { LOGIN_FAIL_MSG };

export function hasLoginUsers(state) {
  return (state.erpUsers || []).some(
    (u) =>
      !u.isDeleted
      && u.status === "Active"
      && u.loginAllowed !== false
      && u.passwordHash
      && String(u.passwordHash).length > 8
  );
}

const PROTECTED_ARRAY_KEYS = [
  "erpUsers", "customRoles", "salesOrders", "workOrders", "quotations", "invoices",
  "customers", "items", "suppliers", "purchaseOrders", "shipments", "boms",
  "materialRequirements", "employees", "auditLog",
];

export function hasTransactionalData(state) {
  if (!state) return false;
  if ((state.workOrders || []).length > 0) return true;
  if ((state.invoices || []).length > 0) return true;
  if ((state.shipments || []).length > 0) return true;
  const sos = state.salesOrders || [];
  if (sos.length > 1) return true;
  if (sos.some((so) => so.stage && !["Created / Saved", "Confirmed"].includes(so.stage))) return true;
  if ((state.auditLog || []).some((a) => a.action && !["seed"].includes(a.action) && a.actor && a.actor !== "system")) return true;
  if (hasLoginUsers(state)) return true;
  return false;
}

export function hasCompanyProfile(state) {
  if (!state) return false;
  const co = state.company || {};
  if (String(co.gstin || "").trim()) return true;
  if (String(co.tradeName || "").trim() && co.tradeName !== co.name) return true;
  const act = (state.settings && state.settings.activation) || {};
  if (act.serial || act.licenseKeyId) return true;
  return hasTransactionalData(state);
}

/** True only for a genuinely fresh install — never after users, company, or transactions exist. */
export function shouldShowFirstSetup(state) {
  if (!state) return true;
  if (hasLoginUsers(state)) return false;
  if (hasTransactionalData(state)) return false;
  if (hasCompanyProfile(state)) return false;
  return true;
}

export function authDiagnostics(state) {
  const users = (state && state.erpUsers) || [];
  return {
    hasUsers: hasLoginUsers(state),
    needsSetup: shouldShowFirstSetup(state),
    hasTransactionalData: hasTransactionalData(state),
    hasCompanyProfile: hasCompanyProfile(state),
    userCount: users.filter((u) => !u.isDeleted).length,
    loginUserCount: users.filter(
      (u) => !u.isDeleted && u.status === "Active" && u.loginAllowed !== false && u.passwordHash
    ).length,
    dataIntegrityWarning: hasTransactionalData(state) && !hasLoginUsers(state),
  };
}

/**
 * Prevent a stale/empty client snapshot from wiping live ERP data on PUT /api/state.
 */
export function mergeStateProtected(existing, incoming) {
  if (!existing || !incoming) return incoming || existing;
  const out = { ...incoming };
  const warnings = [];

  if (hasLoginUsers(existing)) {
    if (!hasLoginUsers(incoming)) {
      out.erpUsers = existing.erpUsers;
      warnings.push("erpUsers preserved");
    } else {
      const incById = new Map((incoming.erpUsers || []).map((u) => [u.id, u]));
      const merged = (existing.erpUsers || []).map((serverUser) => {
        const inc = incById.get(serverUser.id)
          || (incoming.erpUsers || []).find((u) => String(u.email || "").toLowerCase() === String(serverUser.email || "").toLowerCase());
        if (!inc) return serverUser;
        return {
          ...inc,
          passwordHash: serverUser.passwordHash,
          passwordSalt: serverUser.passwordSalt,
          failedLogins: serverUser.failedLogins,
          status: serverUser.status,
          loginAllowed: serverUser.loginAllowed,
          isDeleted: serverUser.isDeleted,
          roleKey: serverUser.roleKey || inc.roleKey,
        };
      });
      const mergedIds = new Set(merged.map((u) => u.id));
      (incoming.erpUsers || []).forEach((inc) => {
        if (!inc || !inc.id || mergedIds.has(inc.id)) return;
        const email = String(inc.email || "").toLowerCase();
        if (email && merged.some((u) => String(u.email || "").toLowerCase() === email)) return;
        merged.push(inc);
        mergedIds.add(inc.id);
      });
      out.erpUsers = merged;
      warnings.push("erpUsers auth fields preserved from server");
    }
  }

  PROTECTED_ARRAY_KEYS.forEach((key) => {
    const ex = existing[key];
    const inc = incoming[key];
    if (!Array.isArray(ex) || ex.length === 0) return;
    if (!Array.isArray(inc) || inc.length === 0) {
      out[key] = ex;
      warnings.push(key + " preserved");
    }
  });

  if (existing.company && (existing.company.name || existing.company.tradeName)) {
    const incCo = incoming.company || {};
    if (!incCo.name && !incCo.tradeName) out.company = existing.company;
  }

  if (existing.settings && typeof existing.settings === "object") {
    out.settings = { ...existing.settings, ...(incoming.settings || {}) };
    if (existing.settings.activation && !(incoming.settings && incoming.settings.activation)) {
      out.settings.activation = existing.settings.activation;
    }
  }

  if (Array.isArray(existing.revokedSessions) && existing.revokedSessions.length) {
    const incRev = incoming.revokedSessions || [];
    const merged = [...existing.revokedSessions];
    incRev.forEach((r) => {
      if (!merged.some((x) => x.id === r.id || (x.sessionId === r.sessionId && x.revokedAt === r.revokedAt))) {
        merged.push(r);
      }
    });
    out.revokedSessions = merged.slice(-500);
  }

  out._mergeProtectedAt = Date.now();
  if (warnings.length) out._mergeWarnings = warnings;
  return out;
}

export async function createAdminUser(state, { email, password, name }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const displayName = String(name || "System Administrator").trim();
  const pwd = String(password || "");
  if (!normalizedEmail.includes("@")) throw new Error("Valid ADMIN_EMAIL required");
  if (pwd.length < 8) throw new Error("Password must be at least 8 characters");

  state.erpUsers = state.erpUsers || [];
  state.seq = state.seq || {};
  ensureAdminRole(state);

  const stamp = Date.now();
  const adminRoles = new Set(["admin", "super_admin"]);
  state.erpUsers.forEach((u) => {
    const isTarget =
      (!u.isDeleted && adminRoles.has(u.roleKey))
      || (!u.isDeleted && String(u.email || "").toLowerCase() === normalizedEmail);
    if (isTarget) {
      u.isDeleted = true;
      u.status = "Deleted";
      u.loginAllowed = false;
      u.deletedAt = stamp;
      u.deletedBy = "system-reset";
    }
  });

  state.seq.USR = (Number(state.seq.USR) || 0) + 1;
  const userId = `USR-${String(state.seq.USR).padStart(4, "0")}`;
  const salt = newPasswordSalt();
  const passwordHash = await hashPassword(pwd, salt);

  state.erpUsers.push({
    id: `u-admin-${stamp}`,
    userId,
    name: displayName,
    email: normalizedEmail,
    username: normalizedEmail.split("@")[0],
    roleKey: "admin",
    department: "Administration",
    designation: "Administrator",
    locationId: (state.locations && state.locations[0] && state.locations[0].id) || "",
    mobile: "",
    status: "Active",
    loginAllowed: true,
    isDeleted: false,
    forcePasswordChange: false,
    twoFactor: false,
    failedLogins: 0,
    passwordSalt: salt,
    passwordHash,
    createdAt: stamp,
  });

  state.revokedSessions = (state.revokedSessions || []).concat({
    id: `rv-reset-${stamp}`,
    sessionId: "*global*",
    userId: "*",
    email: "",
    revokedAt: stamp,
    by: "system",
    reason: "admin-reset",
  });
  state.connectedSessions = [];
  state._localSavedAt = stamp;

  return { email: normalizedEmail, password: pwd, userId, name: displayName };
}
