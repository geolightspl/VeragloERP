/**
 * One-time production system bootstrap — organization, super admin, defaults, lock.
 */
import {
  appendBootstrapAudit,
  bootstrapEnabledEnv,
  DEFAULT_TENANT,
  isBootstrapLocked,
  isProductionMode,
  loadBootstrapStatus,
  saveBootstrapStatus,
  verifyDataPathAccessible,
} from "./bootstrap-status.js";
import {
  createAdminUser,
  ensureAdminRole,
  hasLoginUsers,
  hasTransactionalData,
  hasCompanyProfile,
  shouldShowFirstSetup,
} from "./auth-utils.js";
import { ensureDeploymentReady } from "./first-run.js";
import { ensureDefaultTenant, listTenants } from "./tenant-registry.js";
import { emptyTenantState } from "./tenant.js";

function serverEnvironmentLabel() {
  return process.env.VERAGLO_ENV || process.env.NODE_ENV || "development";
}

function ensureSuperAdminRole(state) {
  ensureAdminRole(state);
  state.customRoles = state.customRoles || [];
  if (!state.customRoles.some((r) => r.key === "super_admin")) {
    state.customRoles.unshift({
      id: "role_super",
      key: "super_admin",
      label: "Super Admin",
      tag: "Unrestricted control",
      avatar: "SA",
      color: "#dc2626",
      moduleAccess: "all",
      actions: ["view", "add", "edit", "delete", "approve", "reject", "print", "export", "import", "email", "settings"],
      permissions: {},
      hierarchy: 1,
      builtIn: true,
      active: true,
    });
  }
}

export function buildInitialProductionState(orgName) {
  const base = emptyTenantState();
  const state = ensureDeploymentReady({
    ...base,
    company: {
      ...base.company,
      id: DEFAULT_TENANT,
      tenantId: DEFAULT_TENANT,
      name: orgName || "Organization",
      tradeName: orgName || "Organization",
      legalName: orgName || "Organization",
    },
    documentTemplates: [
      {
        id: "tpl_bootstrap_qtn",
        docType: "Quotation",
        name: "Standard Quotation",
        isDefault: true,
        active: true,
        themeId: "modern",
      },
    ],
    numberSeries: [],
    settings: {
      ...(base.settings || {}),
      activation: { status: "Trial" },
      security: { minPasswordLength: 8, maxLoginAttempts: 5, sessionTimeoutMins: 60 },
      themeSettings: { defaultMode: "dark", allowUserSwitch: true },
      typography: { fontFamily: "Inter, sans-serif" },
      bootstrap: { completed: false },
    },
    auditLog: [],
  });
  return state;
}

export async function syncBootstrapLockFromExistingData(queryFn, getState, tenantId = DEFAULT_TENANT) {
  let status = await loadBootstrapStatus(queryFn);
  if (isBootstrapLocked(status)) return status;
  const state = await getState(tenantId);
  if (!state || !hasLoginUsers(state)) return status;
  const admin = (state.erpUsers || []).find(
    (u) => !u.isDeleted && u.passwordHash && ["admin", "super_admin"].includes(u.roleKey)
  ) || (state.erpUsers || []).find((u) => !u.isDeleted && u.passwordHash);
  status = appendBootstrapAudit(status, {
    action: "bootstrap_auto_locked",
    actor: "system",
    summary: "Bootstrap locked — existing login users detected on server",
    admin_user_id: admin?.userId || null,
  });
  return saveBootstrapStatus({
    ...status,
    bootstrap_completed: true,
    bootstrap_locked: true,
    completed_at: status.completed_at || new Date().toISOString(),
    completed_by: status.completed_by || "auto-detect",
    server_environment: status.server_environment || serverEnvironmentLabel(),
    organization_id: tenantId,
    admin_user_id: admin?.userId || null,
  }, queryFn);
}

export function evaluateBootstrapGate(state, status, dataPath) {
  const locked = isBootstrapLocked(status);
  const hasUsers = hasLoginUsers(state);
  const production = isProductionMode();
  const pathOk = dataPath.ok !== false;
  const firstSetupEligible = shouldShowFirstSetup(state);
  const allowClientSetupUi = !production && !locked && !hasUsers && pathOk && firstSetupEligible;
  const setupRequired = !locked && !hasUsers && pathOk && firstSetupEligible;

  return {
    bootstrap_completed: locked,
    bootstrap_locked: locked,
    production_mode: production,
    bootstrap_enabled: bootstrapEnabledEnv(),
    data_path_ok: pathOk,
    data_path: dataPath.path || null,
    data_path_message: dataPath.message || null,
    has_users: hasUsers,
    setup_required: setupRequired,
    allow_client_setup: allowClientSetupUi,
    needs_setup: allowClientSetupUi,
    has_transactional_data: hasTransactionalData(state),
    has_company_profile: hasCompanyProfile(state),
    recovery_available: locked && production,
  };
}

export async function recordBootstrapFailure(queryFn, req, reason) {
  let status = await loadBootstrapStatus(queryFn);
  status = appendBootstrapAudit(status, {
    action: "bootstrap_failed",
    actor: "system",
    summary: reason,
    ip: req?.ip || null,
  });
  return saveBootstrapStatus({
    ...status,
    failed_attempts: (Number(status.failed_attempts) || 0) + 1,
    last_attempt_at: new Date().toISOString(),
    last_attempt_ip: req?.ip || null,
  }, queryFn);
}

export async function runSystemBootstrap({
  queryFn,
  getState,
  saveState,
  tenantId = DEFAULT_TENANT,
  email,
  password,
  name,
  organizationName,
  completedBy = "cli",
  req = null,
}) {
  const dataPath = verifyDataPathAccessible();
  if (!dataPath.ok) {
    throw new Error(dataPath.message || "Data path not accessible");
  }

  let status = await loadBootstrapStatus(queryFn);
  status = await syncBootstrapLockFromExistingData(queryFn, getState, tenantId);
  if (isBootstrapLocked(status)) {
    const err = new Error("Bootstrap is locked — administrator already exists.");
    err.code = "bootstrap_locked";
    throw err;
  }

  if (isProductionMode() && !bootstrapEnabledEnv()) {
    const err = new Error("Bootstrap is disabled. Set BOOTSTRAP_ENABLED=1 to allow one-time setup.");
    err.code = "bootstrap_disabled";
    throw err;
  }

  const tenants = await listTenants(queryFn);
  if (tenants.length > 1) {
    const err = new Error("Bootstrap blocked — multiple organizations already exist.");
    err.code = "organizations_exist";
    throw err;
  }

  await ensureDefaultTenant(queryFn);

  let state = await getState(tenantId);
  if (!state || !state._v) {
    state = buildInitialProductionState(organizationName);
  } else {
    state = ensureDeploymentReady(state);
  }

  if (!shouldShowFirstSetup(state) || hasLoginUsers(state)) {
    await syncBootstrapLockFromExistingData(queryFn, getState, tenantId);
    const err = new Error("Bootstrap not allowed — users, company data, or transactions already exist.");
    err.code = "data_exists";
    throw err;
  }

  status = appendBootstrapAudit(status, {
    action: "bootstrap_started",
    actor: completedBy,
    summary: "System bootstrap started",
    ip: req?.ip || null,
    email,
  });
  await saveBootstrapStatus(status, queryFn);

  ensureSuperAdminRole(state);
  const creds = await createAdminUser(state, {
    email,
    password,
    name: name || "Super Administrator",
    roleKey: "super_admin",
  });

  const stamp = Date.now();
  state.auditLog = (state.auditLog || []).concat({
    id: "A-bootstrap-" + stamp,
    ts: stamp,
    actor: "system",
    action: "bootstrap",
    entity: "system",
    refId: creds.userId,
    summary: "Production bootstrap completed — Super Admin: " + creds.email,
    ip: req?.ip || "",
    device: completedBy,
  });
  state.settings = state.settings || {};
  state.settings.bootstrap = {
    completed: true,
    completedAt: new Date().toISOString(),
    completedBy,
    adminUserId: creds.userId,
  };

  await saveState(state, tenantId);

  status = appendBootstrapAudit(status, {
    action: "bootstrap_completed",
    actor: completedBy,
    summary: "Super Admin created: " + creds.email,
    admin_user_id: creds.userId,
    organization_id: tenantId,
    ip: req?.ip || null,
  });
  status = await saveBootstrapStatus({
    ...status,
    bootstrap_completed: true,
    bootstrap_locked: true,
    completed_at: new Date().toISOString(),
    completed_by: completedBy,
    server_environment: serverEnvironmentLabel(),
    organization_id: tenantId,
    admin_user_id: creds.userId,
  }, queryFn);

  return { creds, status, state };
}

export async function runAdminRecovery({
  queryFn,
  getState,
  saveState,
  tenantId = DEFAULT_TENANT,
  email,
  password,
  name,
  completedBy = "recovery-cli",
  req = null,
}) {
  const status = await loadBootstrapStatus(queryFn);
  if (!isBootstrapLocked(status)) {
    const err = new Error("Recovery requires completed bootstrap. Use bootstrap-admin for first-time setup.");
    err.code = "bootstrap_not_completed";
    throw err;
  }

  let state = await getState(tenantId);
  if (!state) {
    const err = new Error("No ERP state found for recovery.");
    err.code = "no_state";
    throw err;
  }

  ensureSuperAdminRole(state);
  const creds = await createAdminUser(state, {
    email,
    password,
    name: name || "Super Administrator",
    roleKey: "super_admin",
  });

  const stamp = Date.now();
  state.auditLog = (state.auditLog || []).concat({
    id: "A-recovery-" + stamp,
    ts: stamp,
    actor: "system",
    action: "admin-recovery",
    entity: "erpUsers",
    refId: creds.userId,
    summary: "Admin recovery — new Super Admin: " + creds.email,
    ip: req?.ip || "",
    device: completedBy,
  });
  await saveState(state, tenantId);

  const nextStatus = appendBootstrapAudit(status, {
    action: "admin_recovery",
    actor: completedBy,
    summary: "Super Admin recovered: " + creds.email,
    admin_user_id: creds.userId,
    ip: req?.ip || null,
  });
  await saveBootstrapStatus({
    ...nextStatus,
    admin_user_id: creds.userId,
    completed_by: completedBy,
  }, queryFn);

  return { creds, status: nextStatus };
}
