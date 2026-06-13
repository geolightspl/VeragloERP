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

export function ensureAdminRole(state) {
  state.customRoles = state.customRoles || [];
  if (!state.customRoles.some((r) => r.key === "admin")) {
    state.customRoles.unshift({
      id: "role_admin",
      key: "admin",
      label: "Administrator",
      tag: "Full system access",
      avatar: "AD",
      color: "#2563eb",
      moduleAccess: "all",
      actions: ["view", "add", "edit", "delete", "approve", "export", "print"],
      permissions: {},
      hierarchy: 10,
      builtIn: true,
      active: true,
    });
  }
}

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

  if (hasLoginUsers(existing) && !hasLoginUsers(incoming)) {
    out.erpUsers = existing.erpUsers;
    warnings.push("erpUsers preserved");
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
