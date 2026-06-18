import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { access, constants } from "fs/promises";
import * as db from "./db.js";
import {
  authDiagnostics,
  buildSystemAuthDiagnostic,
  applySuccessfulLogin,
  createAdminUser,
  ensureAdminRole,
  ensureBuiltInRoles,
  findUserByLogin,
  generatePassword,
  hasLoginUsers,
  LOGIN_FAIL_MSG,
  loginFailureMessage,
  mergeStateProtected,
  recordFailedLogin,
  roleForUserRecord,
  shouldShowFirstSetup,
  userLoginDiagnostic,
  validateLoginCredentials,
} from "./auth-utils.js";
import { ensureDeploymentReady } from "./first-run.js";
import * as weather from "./weather.js";
import * as passwordReset from "./password-reset.js";
import { sendMail } from "./mail.js";
import * as portal from "./portal.js";
import { tenantMiddleware, DEFAULT_TENANT, platformKeyOk } from "./tenant.js";
import { listTenants, createTenant, ensureDefaultTenant, getTenant, getLoginOrganizations, getDefaultTenantSlug, setDefaultTenantSlug } from "./tenant-registry.js";
import * as ipAccess from "./ip-access.js";
import {
  bootstrapEnabledEnv,
  checkBootstrapSecret,
  checkRecoverySecret,
  isProductionMode,
  loadBootstrapStatus,
  verifyDataPathAccessible,
} from "./bootstrap-status.js";
import {
  evaluateBootstrapGate,
  recordBootstrapFailure,
  runAdminRecovery,
  runSystemBootstrap,
  syncBootstrapLockFromExistingData,
} from "./system-bootstrap.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const rootDir = path.join(__dirname, "..");
const indexHtmlPath = path.join(rootDir, "index.html");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const app = express();
app.set("trust proxy", true);
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: "25mb" }));
app.use((req, res, next) => {
  tenantMiddleware(req, res, () => {
    req.db = {
      getState: () => db.getState(req.tenantId),
      saveState: (data, opts) => db.saveState(data, { ...(opts || {}), tenantId: req.tenantId }),
      nextSequence: (key, min) => db.nextSequence(key, min, req.tenantId),
      listSnapshots: (limit) => db.listSnapshots(limit, req.tenantId),
      saveSnapshot: (label, createdBy, data) => db.saveSnapshot(label, createdBy, data, req.tenantId),
      getSnapshot: (id) => db.getSnapshot(id, req.tenantId),
      patchConnectedSessions: (sessions) => db.patchConnectedSessions(sessions, req.tenantId),
    };
    enforceIpAccess(req, res, next);
  });
});

async function enforceIpAccess(req, res, next) {
  if (process.env.VERAGLO_IP_BYPASS === "1") return next();
  const path = (req.path || "").split("?")[0];
  if (ipAccess.IP_EXEMPT_PATHS.has(path)) return next();
  try {
    const state = (await req.db.getState()) || {};
    const ip = ipAccess.clientIp(req);
    const check = ipAccess.checkIpAccess(state, ip);
    if (check.ok) return next();
    if (path.startsWith("/api/")) {
      return res.status(403).json({
        ok: false,
        error: "ip_not_allowed",
        message: check.reason,
        clientIp: ip,
      });
    }
    return res.status(403).type("html").send(ipAccess.accessDeniedHtml(ip));
  } catch (e) {
    return next(e);
  }
}

/** Client IP discovery for Admin → Security whitelisting (always public). */
app.get("/api/auth/client-ip", (req, res) => {
  res.json({ ok: true, ip: ipAccess.clientIp(req) });
});

/** IP access policy status for the current request (respects whitelist when enabled). */
app.get("/api/auth/ip-access", async (req, res) => {
  try {
    const state = (await req.db.getState()) || {};
    const ip = ipAccess.clientIp(req);
    const cfg = ipAccess.ipAccessSettings(state);
    const check = ipAccess.checkIpAccess(state, ip);
    res.json({
      ok: true,
      enabled: cfg.enabled,
      clientIp: ip,
      allowed: check.ok,
      reason: check.ok ? null : check.reason,
      whitelistCount: cfg.whitelist.length,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Organizations available on login screen (public). */
app.get("/api/auth/login-organizations", async (_req, res) => {
  try {
    await db.ensureSchema();
    const { getState } = bootstrapDbHelpers();
    const data = await getLoginOrganizations(db.query, getState);
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Set default organization for login (admin). */
app.put("/api/tenants/default", async (req, res) => {
  try {
    const slug = (req.body && (req.body.slug || req.body.tenantSlug)) || "";
    if (!String(slug).trim()) return res.status(400).json({ ok: false, error: "slug_required" });
    const id = await setDefaultTenantSlug(slug, db.query);
    res.json({ ok: true, defaultTenantSlug: id });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

/** List organizations for login / admin (public names and codes only). */
app.get("/api/tenants", async (_req, res) => {
  try {
    await db.ensureSchema();
    const rows = await listTenants(db.query);
    res.json({
      ok: true,
      tenants: rows.map((t) => ({ id: t.id, slug: t.slug, name: t.name, status: t.status })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Current tenant from request context. */
app.get("/api/tenants/current", async (req, res) => {
  try {
    await db.ensureSchema();
    const row = await getTenant(req.tenantId, db.query);
    if (!row) return res.status(404).json({ ok: false, error: "tenant_not_found" });
    res.json({ ok: true, tenant: row });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Create a new organization (platform key required in production). */
app.post("/api/tenants", async (req, res) => {
  try {
    if (!platformKeyOk(req)) {
      return res.status(403).json({ ok: false, error: "platform_key_required" });
    }
    await db.ensureSchema();
    const body = req.body || {};
    const row = await createTenant({ slug: body.slug || body.code, name: body.name }, db.query);
    await ensureDefaultTenant(db.query);
    res.status(201).json({ ok: true, tenant: row });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

function bootstrapDbHelpers() {
  return {
    queryFn: db.query,
    getState: (tenantId) => db.getState(tenantId),
    saveState: (state, tenantId) => db.saveState(state, { tenantId }),
  };
}

/** Public auth / first-run diagnostics for login troubleshooting. */
app.get("/api/auth/system-diagnostic", async (req, res) => {
  try {
    await db.ensureSchema();
    const { getState } = bootstrapDbHelpers();
    const tenantId = req.tenantId || DEFAULT_TENANT;
    await syncBootstrapLockFromExistingData(db.query, getState, tenantId);
    const state = ensureDeploymentReady((await req.db.getState()) || { erpUsers: [] });
    ensureBuiltInRoles(state);
    const orgData = await getLoginOrganizations(db.query, getState);
    const defaultSlug = orgData.defaultTenantSlug || DEFAULT_TENANT;
    const defaultOrg = (orgData.organizations || []).find((o) => o.slug === defaultSlug) || { slug: defaultSlug, name: "Default Organization" };
    const h = await db.healthCheck().catch(() => ({}));
    const diag = buildSystemAuthDiagnostic(state, {
      tenantId: defaultSlug,
      storage: db.storageMode(),
      dataPath: process.env.VERAGLO_DATA_DIR || null,
      database: h.db || null,
      totalOrganizations: (orgData.organizations || []).length,
      defaultOrgName: defaultOrg.name,
    });
    console.log("[auth-diagnostic]", JSON.stringify({
      ts: new Date().toISOString(),
      tenant: tenantId,
      defaultOrg: diag.defaultOrganization,
      activeAdmins: diag.activeAdminCount,
      adminEmails: (diag.adminUsers || []).map((u) => u.email),
      dataPath: diag.dataPath,
      environment: diag.environment,
    }));
    res.json({ ok: true, ...diag });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Public auth / first-run diagnostics for login troubleshooting. */
app.get("/api/auth/status", async (req, res) => {
  try {
    await db.ensureSchema();
    const { getState } = bootstrapDbHelpers();
    await syncBootstrapLockFromExistingData(db.query, getState, req.tenantId);
    const state = (await req.db.getState()) || { _v: 11, settings: { activation: {} }, erpUsers: [] };
    const ready = ensureDeploymentReady(state);
    const act = (ready.settings && ready.settings.activation) || {};
    const today = new Date().toISOString().slice(0, 10);
    const trialValid = act.trialEndsAt && act.trialEndsAt >= today;
    const licensed =
      act.status === "Trial" && trialValid
      || (act.status === "Active" && !!act.licenseKeyId)
      || (!act.licenseKeyId && trialValid);
    const diag = authDiagnostics(ready);
    const status = await loadBootstrapStatus(db.query);
    const dataPath = verifyDataPathAccessible();
    const gate = evaluateBootstrapGate(ready, status, dataPath);
    let hint = "Sign in with the email and password from Admin → Users";
    if (diag.dataIntegrityWarning) {
      hint = "Transactional data exists but no login users — use secured admin recovery or restore backup. Do not run first-time setup.";
    } else if (!gate.data_path_ok) {
      hint = gate.data_path_message || "Production database not found. Please verify data path or restore backup.";
    } else if (gate.setup_required && !gate.allow_client_setup) {
      hint = "Production first-time setup: run server bootstrap (cd server && npm run bootstrap-admin) or POST /api/system/bootstrap-admin with BOOTSTRAP_SECRET.";
    } else if (gate.allow_client_setup) {
      hint = "First launch (development): use Create administrator on the login screen.";
    }
    res.json({
      ok: true,
      storage: db.storageMode(),
      tenantId: req.tenantId,
      dataDir: process.env.VERAGLO_DATA_DIR || null,
      ...diag,
      ...gate,
      needsSetup: gate.allow_client_setup,
      licensed,
      trialEndsAt: act.trialEndsAt || null,
      activationStatus: act.status || "unknown",
      hint,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Authoritative sign-in — verifies credentials against server database (production-safe). */
app.post("/api/auth/login", async (req, res) => {
  try {
    const tenantRow = await getTenant(req.tenantId, db.query);
    if (!tenantRow && req.tenantId !== DEFAULT_TENANT) {
      return res.status(404).json({
        ok: false,
        error: "tenant_not_found",
        reason: "tenant_not_configured",
        message: loginFailureMessage("tenant_not_configured"),
        tenantId: req.tenantId,
      });
    }

    let state = await req.db.getState();
    if (!state) {
      const configured = tenantRow || req.tenantId === DEFAULT_TENANT;
      if (!configured) {
        return res.status(404).json({
          ok: false,
          error: "tenant_not_configured",
          reason: "tenant_not_configured",
          message: loginFailureMessage("tenant_not_configured"),
          tenantId: req.tenantId,
        });
      }
      return res.status(503).json({
        ok: false,
        error: "no_state",
        reason: "no_state",
        message: loginFailureMessage("no_state"),
      });
    }
    state = ensureDeploymentReady(state);
    ensureBuiltInRoles(state);

    const ip = ipAccess.clientIp(req);
    const ipCheck = ipAccess.checkIpAccess(state, ip);
    if (!ipCheck.ok) {
      return res.status(403).json({
        ok: false,
        error: "ip_not_allowed",
        reason: "ip_not_allowed",
        message: ipCheck.reason || loginFailureMessage("ip_not_allowed"),
        clientIp: ip,
      });
    }

    const body = req.body || {};
    const loginId = body.email || body.loginId || body.username || "";
    const password = body.password || "";
    const clientMeta = {
      ip: body.clientIp || ip,
      device: String(body.device || body.userAgent || req.headers["user-agent"] || "").slice(0, 120),
      browser: String(body.browser || "").slice(0, 80),
      tenantId: req.tenantId,
    };
    if (!String(loginId).trim() || !password) {
      return res.status(400).json({
        ok: false,
        error: "missing_credentials",
        reason: "missing_credentials",
        message: loginFailureMessage("missing_credentials"),
      });
    }

    const result = await validateLoginCredentials(state, loginId, password, req.tenantId);
    if (!result.ok) {
      recordFailedLogin(state, loginId, { ...clientMeta, reason: result.reason });
      state.auditLog = (state.auditLog || []).concat({
        id: "A-login-fail-" + Date.now(),
        ts: Date.now(),
        actor: "system",
        action: "login-failed",
        entity: "auth",
        refId: String(loginId).trim().toLowerCase(),
        summary: "Failed sign-in: " + (result.reason || "unknown") + (clientMeta.device ? " · " + clientMeta.device.slice(0, 40) : ""),
        ip: clientMeta.ip,
      }).slice(-500);
      await req.db.saveState(state);
      return res.status(401).json({
        ok: false,
        error: "login_failed",
        reason: result.reason || "invalid",
        message: result.message || loginFailureMessage(result.reason),
      });
    }

    const user = result.user;
    const sec = (state.settings && state.settings.security) || {};
    if (sec.allowMultipleDevices === false) {
      state.connectedSessions = (state.connectedSessions || []).filter(
        (s) => s.userId !== user.id && s.email !== user.email
      );
      state.revokedSessions = (state.revokedSessions || []).concat({
        id: "rv-single-" + Date.now(),
        sessionId: "*user-" + user.id + "*",
        userId: user.id,
        email: user.email,
        revokedAt: Date.now(),
        by: "system",
        reason: "single-device-login",
      }).slice(-500);
    }

    await applySuccessfulLogin(state, user, password, result.upgraded);
    const loginIp = clientMeta.ip;
    const lastLog = state.loginLog[state.loginLog.length - 1];
    if (lastLog) {
      lastLog.ip = loginIp;
      lastLog.device = clientMeta.device;
      lastLog.browser = clientMeta.browser;
      lastLog.tenantId = req.tenantId;
      lastLog.userId = user.userId || "";
    }
    user.lastLogin = Date.now();
    state.auditLog = (state.auditLog || []).concat({
      id: "A-login-" + Date.now(),
      ts: Date.now(),
      actor: user.roleKey || "user",
      action: "login",
      entity: "auth",
      refId: user.userId,
      summary: "Signed in: " + user.email + (clientMeta.device ? " · " + clientMeta.device.slice(0, 40) : ""),
      ip: loginIp,
    }).slice(-500);
    await req.db.saveState(state);

    res.json({
      ok: true,
      user: {
        id: user.id,
        userId: user.userId,
        email: user.email,
        name: user.name,
        roleKey: user.roleKey,
        forcePasswordChange: !!user.forcePasswordChange,
      },
      tenantId: req.tenantId,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      ok: false,
      error: "login_error",
      reason: "server_unavailable",
      message: loginFailureMessage("server_unavailable"),
    });
  }
});

/** Public user login diagnostic (no password required). */
app.get("/api/auth/diagnose-user", async (req, res) => {
  try {
    const email = String(req.query.email || req.query.loginId || "").trim();
    if (!email) {
      return res.status(400).json({ ok: false, error: "missing_email", message: "Email is required." });
    }
    const tenantRow = await getTenant(req.tenantId, db.query);
    if (!tenantRow && req.tenantId !== DEFAULT_TENANT) {
      return res.status(404).json({
        ok: false,
        error: "tenant_not_found",
        reason: "tenant_not_found",
        message: loginFailureMessage("tenant_not_found"),
        tenantId: req.tenantId,
      });
    }
    const state = ensureDeploymentReady((await req.db.getState()) || { erpUsers: [] });
    ensureBuiltInRoles(state);
    const diag = userLoginDiagnostic(state, email, req.tenantId);
    res.json({
      ok: true,
      storage: db.storageMode(),
      tenantId: req.tenantId,
      ...diag,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Admin credential test — verifies password without creating a session. */
app.post("/api/auth/test-credentials", async (req, res) => {
  try {
    const tenantRow = await getTenant(req.tenantId, db.query);
    if (!tenantRow && req.tenantId !== DEFAULT_TENANT) {
      return res.status(404).json({
        ok: false,
        error: "tenant_not_found",
        message: loginFailureMessage("tenant_not_found"),
      });
    }
    const state = ensureDeploymentReady((await req.db.getState()) || { erpUsers: [] });
    ensureBuiltInRoles(state);
    const body = req.body || {};
    const loginId = body.email || body.loginId || "";
    const password = body.password || "";
    if (!String(loginId).trim() || !password) {
      return res.status(400).json({ ok: false, error: "missing_credentials" });
    }
    const diag = userLoginDiagnostic(state, loginId, req.tenantId);
    const result = await validateLoginCredentials(state, loginId, password, req.tenantId);
    res.json({
      ok: result.ok,
      passwordValid: result.ok,
      reason: result.ok ? null : result.reason,
      message: result.ok ? "Credentials are valid." : (result.message || loginFailureMessage(result.reason)),
      diagnostic: diag,
      tenantId: req.tenantId,
      storage: db.storageMode(),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Public bootstrap lock status (no secrets). */
app.get("/api/system/bootstrap-status", async (req, res) => {
  try {
    await db.ensureSchema();
    const { getState } = bootstrapDbHelpers();
    await syncBootstrapLockFromExistingData(db.query, getState, req.tenantId);
    const status = await loadBootstrapStatus(db.query);
    const state = (await req.db.getState()) || { erpUsers: [] };
    const dataPath = verifyDataPathAccessible();
    const gate = evaluateBootstrapGate(ensureDeploymentReady(state), status, dataPath);
    res.json({
      ok: true,
      ...status,
      ...gate,
      failed_attempts: status.failed_attempts || 0,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * Secured one-time production bootstrap.
 * Requires BOOTSTRAP_ENABLED=true and matching BOOTSTRAP_SECRET.
 */
app.post("/api/system/bootstrap-admin", async (req, res) => {
  try {
    await db.ensureSchema();
    if (!bootstrapEnabledEnv()) {
      return res.status(403).json({
        ok: false,
        error: "bootstrap_disabled",
        message: "Bootstrap is disabled. Set BOOTSTRAP_ENABLED=1 for one-time setup.",
      });
    }
    const secretCheck = checkBootstrapSecret(req);
    if (!secretCheck.ok) {
      await recordBootstrapFailure(db.query, req, secretCheck.reason);
      return res.status(401).json({
        ok: false,
        error: secretCheck.reason,
        message: "Invalid or missing bootstrap secret.",
      });
    }
    const body = req.body || {};
    const helpers = bootstrapDbHelpers();
    const result = await runSystemBootstrap({
      ...helpers,
      tenantId: req.tenantId,
      email: body.email || process.env.ADMIN_EMAIL,
      password: body.password || process.env.ADMIN_PASSWORD,
      name: body.name || process.env.ADMIN_NAME,
      organizationName: body.organizationName || body.orgName,
      completedBy: "api",
      req,
    });
    res.status(201).json({
      ok: true,
      email: result.creds.email,
      userId: result.creds.userId,
      organizationId: result.status.organization_id,
      bootstrap_completed: true,
      message: "Super Administrator created — bootstrap is now locked. Sign in and change the password in Admin → Users.",
      ...(process.env.VERAGLO_RETURN_BOOTSTRAP_PASSWORD === "1"
        ? { password: result.creds.password }
        : {}),
    });
  } catch (e) {
    console.error(e);
    await recordBootstrapFailure(db.query, req, e.message).catch(() => {});
    const code = e.code || "bootstrap_failed";
    const status = code === "bootstrap_locked" || code === "data_exists" || code === "organizations_exist"
      ? 403
      : code === "bootstrap_disabled"
        ? 403
        : 500;
    res.status(status).json({ ok: false, error: code, message: e.message });
  }
});

/**
 * Secured admin recovery — does not reopen bootstrap.
 * Requires RECOVERY_SECRET (falls back to BOOTSTRAP_SECRET).
 */
app.post("/api/system/recover-admin", async (req, res) => {
  try {
    await db.ensureSchema();
    const secretCheck = checkRecoverySecret(req);
    if (!secretCheck.ok) {
      await recordBootstrapFailure(db.query, req, "recovery:" + secretCheck.reason);
      return res.status(401).json({
        ok: false,
        error: secretCheck.reason,
        message: "Invalid or missing recovery secret.",
      });
    }
    const body = req.body || {};
    const helpers = bootstrapDbHelpers();
    const result = await runAdminRecovery({
      ...helpers,
      tenantId: req.tenantId,
      email: body.email || process.env.ADMIN_EMAIL,
      password: body.password || process.env.ADMIN_PASSWORD,
      name: body.name || process.env.ADMIN_NAME,
      completedBy: "recovery-api",
      req,
    });
    res.status(201).json({
      ok: true,
      email: result.creds.email,
      userId: result.creds.userId,
      message: "Super Administrator recovered — sign in and verify access.",
      ...(process.env.VERAGLO_RETURN_BOOTSTRAP_PASSWORD === "1"
        ? { password: result.creds.password }
        : {}),
    });
  } catch (e) {
    console.error(e);
    const code = e.code || "recovery_failed";
    const status = code === "bootstrap_not_completed" || code === "no_state" ? 403 : 500;
    res.status(status).json({ ok: false, error: code, message: e.message });
  }
});

/**
 * Create the first administrator when no login users exist (fresh GitHub / server deploy).
 * Safe to call only on empty installations — returns 403 once users exist.
 */
app.post("/api/setup/bootstrap-admin", async (req, res) => {
  try {
    if (isProductionMode()) {
      return res.status(403).json({
        ok: false,
        error: "bootstrap_disabled_in_production",
        message: "Public bootstrap is disabled in production. Use: cd server && npm run bootstrap-admin",
      });
    }
    await db.ensureSchema();
    await ensureDefaultTenant(db.query);
    let state = await req.db.getState();
    if (!state || !state._v) {
      state = {
        _v: 11,
        seq: { USR: 0 },
        erpUsers: [],
        customRoles: [],
        locations: [{ id: "loc1", name: "Main Warehouse", locType: "Warehouse", status: "Active" }],
        settings: { activation: { status: "Trial" }, security: { minPasswordLength: 8 } },
        connectedSessions: [],
        revokedSessions: [],
        auditLog: [],
      };
    }
    state = ensureDeploymentReady(state);
    if (!shouldShowFirstSetup(state)) {
      return res.status(403).json({
        error: "users_exist",
        message: "Setup is not allowed — users, company profile, or transactional data already exist.",
      });
    }
    const body = req.body || {};
    const creds = await createAdminUser(state, {
      email: body.email || process.env.ADMIN_EMAIL || "admin@veraglo.com",
      password: body.password || process.env.ADMIN_PASSWORD || generatePassword(),
      name: body.name || process.env.ADMIN_NAME || "System Administrator",
    });
    state.auditLog = (state.auditLog || []).concat({
      id: "A-bootstrap-" + Date.now(),
      ts: Date.now(),
      actor: "system",
      action: "create",
      entity: "erpUsers",
      refId: creds.userId,
      summary: "Bootstrap administrator: " + creds.email,
    });
    await req.db.saveState(state);
    const helpers = bootstrapDbHelpers();
    await syncBootstrapLockFromExistingData(db.query, helpers.getState, req.tenantId);
    res.status(201).json({
      ok: true,
      email: creds.email,
      password: creds.password,
      userId: creds.userId,
      message: "Administrator created — sign in with these credentials and change the password in Admin → Users",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "bootstrap_failed", message: e.message });
  }
});

/** Forgot password — public, rate-limited, no user enumeration. */
app.get("/api/auth/forgot-password/settings", async (req, res) => {
  try {
    const state = (await req.db.getState()) || {};
    const cfg = passwordReset.forgotPasswordSettings(state);
    res.json({
      ok: true,
      enabled: cfg.enabled,
      otpExpiryMins: cfg.otpExpiryMins,
      linkExpiryMins: cfg.linkExpiryMins,
      methods: {
        emailOtp: cfg.emailOtp,
        mobileOtp: cfg.mobileOtp,
        securityQuestions: cfg.securityQuestions,
        adminApproval: cfg.adminApproval,
      },
      passwordPolicy: cfg.passwordPolicy,
      loginCaptchaAfterFailures: cfg.loginCaptchaAfterFailures,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/auth/forgot-password/request", async (req, res) => {
  try {
    const state = (await req.db.getState()) || { _v: 11, erpUsers: [], settings: {} };
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const body = req.body || {};
    const result = await passwordReset.requestPasswordReset(state, {
      email: body.email,
      employeeId: body.employeeId,
      mobile: body.mobile,
      identifier: body.identifier,
      verificationMode: body.verificationMode,
      ip: req.ip || req.headers["x-forwarded-for"] || "",
      baseUrl,
    });
    if (result.disabled) return res.status(403).json(result);
    await req.db.saveState(state);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "request_failed" });
  }
});

app.post("/api/auth/forgot-password/verify-otp", async (req, res) => {
  try {
    const state = (await req.db.getState()) || { passwordResetRequests: [] };
    const result = passwordReset.verifyResetOtp(state, {
      requestId: req.body && req.body.requestId,
      otp: req.body && req.body.otp,
      ip: req.ip || "",
    });
    await req.db.saveState(state);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/auth/forgot-password/verify-questions", async (req, res) => {
  try {
    const state = (await req.db.getState()) || { passwordResetRequests: [] };
    const result = passwordReset.verifySecurityQuestions(state, {
      requestId: req.body && req.body.requestId,
      answers: req.body && req.body.answers,
      ip: req.ip || "",
    });
    await req.db.saveState(state);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/auth/forgot-password/approval-status", async (req, res) => {
  try {
    const state = (await req.db.getState()) || { passwordResetRequests: [] };
    const result = passwordReset.checkResetApprovalStatus(state, {
      requestId: req.body && req.body.requestId,
    });
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/auth/forgot-password/verify-link", async (req, res) => {
  try {
    const state = (await req.db.getState()) || { passwordResetRequests: [] };
    const token = (req.body && req.body.token) || req.query.token;
    const result = passwordReset.verifyResetLink(state, { token, ip: req.ip || "" });
    await req.db.saveState(state);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/auth/forgot-password/reset", async (req, res) => {
  try {
    const state = (await req.db.getState()) || { erpUsers: [] };
    const result = await passwordReset.completePasswordReset(state, {
      requestId: req.body && req.body.requestId,
      password: req.body && req.body.password,
      ip: req.ip || "",
    });
    await req.db.saveState(state);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Login weather theme — public, cached, non-blocking for sign-in. */
app.get("/api/weather/settings", async (req, res) => {
  try {
    const state = (await req.db.getState()) || {};
    res.json({ ok: true, ...weather.weatherLoginSettings(state) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/weather/current", async (req, res) => {
  try {
    const state = (await req.db.getState()) || {};
    const cfg = weather.weatherLoginSettings(state);
    if (!cfg.enabled) {
      return res.json({ ok: false, disabled: true, reason: "Weather login theme disabled" });
    }
    const source = req.query.source || cfg.locationSource || "company";
    const data = await weather.getCurrentWeather({
      source,
      state,
      manualCity: req.query.city || cfg.manualCity,
      lat: req.query.lat,
      lon: req.query.lon,
      city: req.query.city,
    });
    res.json({ ...data, settings: { wallpapers: cfg.wallpapers, defaultWallpaper: cfg.defaultWallpaper } });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message, unavailable: true });
  }
});

app.get("/api/health", async (req, res) => {
  try {
    const h = await db.healthCheck();
    const mode = db.storageMode();
    res.json({
      ok: true,
      storage: mode,
      postgres: mode === "postgresql",
      multiTenant: true,
      tenantId: req.tenantId,
      tenantCount: h.tenantCount || 1,
      database: h.db,
      dataDir: process.env.VERAGLO_DATA_DIR || null,
      serverTime: h.now,
    });
  } catch (e) {
    res.status(503).json({ ok: false, postgres: false, error: e.message });
  }
});

/** Full ERP state (same shape as former localStorage document). */
app.get("/api/state", async (req, res) => {
  try {
    const row = await getTenant(req.tenantId, db.query);
    if (!row && req.tenantId !== DEFAULT_TENANT) {
      return res.status(404).json({
        error: "tenant_not_found",
        message: 'Organization code not found. Use "default" for single-company installs.',
        tenantId: req.tenantId,
      });
    }
    const state = await req.db.getState();
    if (!state) {
      return res.status(404).json({ error: "no_state", message: "Database empty — client will seed on first sync" });
    }
    res.json(state);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "read_failed", message: e.message });
  }
});

app.put("/api/state", async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object" || !req.body._v) {
      return res.status(400).json({ error: "invalid_body", message: "Expected ERP state object with _v" });
    }
    const tenantRow = await getTenant(req.tenantId, db.query);
    if (!tenantRow && req.tenantId !== DEFAULT_TENANT) {
      return res.status(400).json({
        error: "tenant_not_found",
        message: 'Organization code not found. Use "default" for single-company installs.',
        tenantId: req.tenantId,
      });
    }
    let payload = req.body;
    const baseRev = (payload._baseRev != null && Number.isFinite(Number(payload._baseRev)))
      ? Number(payload._baseRev) : null;
    const conflictMsg = "This record was updated by another user. Please refresh before saving.";
    const existing = await req.db.getState();
    if (existing) {
      // Optimistic locking — reject stale overwrites so concurrent users can't
      // silently clobber each other's changes.
      if (baseRev != null && existing._rev != null && baseRev !== existing._rev) {
        return res.status(409).json({ error: "conflict", currentRev: existing._rev, message: conflictMsg });
      }
      payload = mergeStateProtected(existing, payload);
      if (payload._mergeWarnings && payload._mergeWarnings.length) {
        payload.auditLog = (payload.auditLog || []).concat({
          id: "A-merge-" + Date.now(),
          ts: Date.now(),
          actor: "system",
          action: "state-merge-protected",
          entity: "system",
          refId: "-",
          summary: "Protected server data from stale client overwrite: " + payload._mergeWarnings.join(", "),
        });
      }
    }
    delete payload._mergeWarnings;
    const result = await req.db.saveState(payload, baseRev != null ? { expectedRev: baseRev } : {});
    if (result && result.conflict) {
      return res.status(409).json({ error: "conflict", currentRev: result.currentRev, message: conflictMsg });
    }
    res.json({ ok: true, updatedAt: result.updatedAt, rev: result.rev, merged: !!(existing && payload._mergeProtectedAt) });
  } catch (e) {
    console.error(e);
    if (e.code === "tenant_not_found") {
      return res.status(400).json({ error: "tenant_not_found", message: e.message });
    }
    res.status(500).json({ error: "write_failed", message: e.message });
  }
});

app.get("/api/snapshots", async (req, res) => {
  try {
    res.json(await req.db.listSnapshots());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/snapshots", async (req, res) => {
  try {
    const { label, createdBy, data } = req.body || {};
    if (!data || !data._v) return res.status(400).json({ error: "data required" });
    const row = await req.db.saveSnapshot(label, createdBy, data);
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/snapshots/:id", async (req, res) => {
  try {
    const data = await req.db.getSnapshot(req.params.id);
    if (!data) return res.status(404).json({ error: "not_found" });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Multi-user session heartbeat (stored in erp_state JSON). */
app.post("/api/sessions/heartbeat", async (req, res) => {
  try {
    const row = req.body || {};
    const state = (await req.db.getState()) || { _v: 6, connectedSessions: [] };
    const list = (state.connectedSessions || []).filter(
      (s) => s.sessionId !== row.sessionId && Date.now() - (s.lastSeenAt || 0) < 180000
    );
    const connectedSessions = list.concat({ ...row, lastSeenAt: Date.now() });
    await req.db.patchConnectedSessions(connectedSessions);
    res.json({ ok: true, active: connectedSessions.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Admin emergency repair — rebuild auth index, validate users, reconnect data path metadata. */
app.post("/api/auth/repair", async (req, res) => {
  try {
    const state = (await req.db.getState()) || null;
    if (!state) {
      return res.status(404).json({
        ok: false,
        error: "no_state",
        message: "Existing company data not found. Please verify data path before continuing.",
      });
    }
    const stamp = Date.now();
    state.erpUsers = (state.erpUsers || []).map((u) => {
      const user = { ...u };
      if (user.isDeleted == null) user.isDeleted = false;
      if (user.isDeleted) {
        user.status = user.status || "Deleted";
        user.loginAllowed = false;
      }
      if (user.status === "Active" && user.loginAllowed !== false && user.passwordHash) {
        user.failedLogins = 0;
      }
      return user;
    });
    ensureBuiltInRoles(state);
    (state.erpUsers || []).forEach((u) => {
      if (!u.isDeleted && u.status === "Active" && u.loginAllowed !== false && u.roleKey) {
        if (!roleForUserRecord(state, u)) {
          u.roleKey = "employee";
        }
      }
    });
    if (!state.settings) state.settings = {};
    if (!state.settings.dataPath) state.settings.dataPath = {};
    state.settings.dataPath.lastValidatedAt = stamp;
    state.settings.dataPath.readOk = true;
    state.settings.dataPath.writeOk = true;
    state.auditLog = (state.auditLog || []).concat({
      id: "A-repair-" + stamp,
      ts: stamp,
      actor: (req.body && req.body.actor) || "admin",
      action: "auth-repair",
      entity: "system",
      refId: "-",
      summary: "Auth index repair — users: " + (state.erpUsers || []).filter((u) => !u.isDeleted).length,
    });
    await req.db.saveState(state);
    const diag = authDiagnostics(state);
    res.json({ ok: true, ...diag, message: "Auth repair completed" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});


app.get("/api/sessions", async (req, res) => {
  try {
    const state = await req.db.getState();
    res.json((state && state.connectedSessions) || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Customer portal — public quotation view (token in link). */
app.get("/api/portal/quote/:token", async (req, res) => {
  try {
    const state = (await req.db.getState()) || {};
    res.json(portal.portalQuotePayload(state, req.params.token));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/portal/view/:token", async (req, res) => {
  try {
    const state = (await req.db.getState()) || {};
    const link = portal.recordPortalView(state, req.params.token, {
      userAgent: req.headers["user-agent"] || "",
      ip: req.ip || "",
    });
    if (!link) return res.status(404).json({ ok: false, error: "not_found" });
    await req.db.saveState(state);
    res.json({ ok: true, views: (link.views || []).length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Send notification email via SMTP settings in ERP state. */
app.post("/api/notifications/send", async (req, res) => {
  try {
    const { to, subject, text, html } = req.body || {};
    if (!to || !subject) return res.status(400).json({ ok: false, error: "to and subject are required" });
    const state = (await req.db.getState()) || { settings: { notifications: {} } };
    const result = await sendMail(state, { to, subject, text: text || "", html });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Validate local/network data folder (server-side when path exists on host). */
app.post("/api/datapath/validate", async (req, res) => {
  const folder = String((req.body && req.body.path) || "").trim();
  if (!folder) return res.json({ path: "", readOk: false, writeOk: false, companies: [] });
  try {
    await access(folder, constants.R_OK);
    const testFile = path.join(folder, ".veraglo-write-test");
    fs.writeFileSync(testFile, "ok");
    fs.unlinkSync(testFile);
    const companies = fs.readdirSync(folder, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({ id: d.name, name: d.name, folder: path.join(folder, d.name) }));
    res.json({ path: folder, readOk: true, writeOk: true, type: folder.startsWith("\\\\") ? "network" : "local", companies });
  } catch (e) {
    res.json({ path: folder, readOk: false, writeOk: false, error: e.message, companies: [] });
  }
});

/** Serve React app + assets — disable aggressive caching so UI updates show immediately. */
app.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html") || req.path.endsWith(".jsx")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
  }
  next();
});

/* ============ Email Integration API ============ */
app.post("/api/email-integration/settings", async (req, res) => {
  try {
    let state = await req.db.getState();
    if (!state.emailIntegration) state.emailIntegration = {};
    state.emailIntegration = {
      ...state.emailIntegration,
      ...req.body,
      // Never store plain password in state; would be encrypted in production
      lastSynced: state.emailIntegration?.lastSynced,
    };
    await req.db.saveState(state);
    res.json({ ok: true, settings: { ...state.emailIntegration, password: "***" } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/email-integration/settings", async (req, res) => {
  try {
    const state = await req.db.getState();
    const settings = state.emailIntegration || {};
    res.json({
      ok: true,
      settings: { ...settings, password: settings.password ? "***" : "", appPassword: "***" },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/email-integration/sync", async (req, res) => {
  try {
    let state = await req.db.getState();
    if (!state.emailIntegration || !state.emailIntegration.email) {
      return res.status(400).json({ ok: false, error: "Email integration not configured" });
    }

    // Placeholder: actual email sync would happen here
    // For now, return mock data
    const mockEmails = [
      {
        id: "email_1",
        from: "customer@example.com",
        fromName: "ABC Corp",
        subject: "RFQ: Steel components",
        date: new Date().toISOString(),
        preview: "We need 1000 units of steel...",
        status: "pending_review",
      },
    ];

    state.emailIntegration.lastSynced = new Date().toISOString();
    state.pendingEmailEnquiries = state.pendingEmailEnquiries || [];
    await req.db.saveState(state);

    res.json({ ok: true, emails: mockEmails, synced: mockEmails.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/email-integration/convert-to-enquiry", async (req, res) => {
  try {
    const { emailId, customerId, assignedTo } = req.body;
    let state = await req.db.getState();

    // Mock: create enquiry from email
    const enquiry = {
      id: "enq" + Date.now().toString(36),
      no: "ENQ-" + Date.now().toString(36).slice(-6).toUpperCase(),
      customerId,
      assignedTo,
      status: "New Enquiry",
      date: new Date().toISOString().slice(0, 10),
      emailSource: emailId,
      source: "Email",
      lines: [],
      timeline: [],
      documents: [],
    };

    if (!state.enquiries) state.enquiries = [];
    state.enquiries.push(enquiry);

    state.pendingEmailEnquiries = (state.pendingEmailEnquiries || []).filter((e) => e.id !== emailId);
    await req.db.saveState(state);

    res.json({ ok: true, enquiry });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/email-integration/send-reply", async (req, res) => {
  try {
    const { enquiryId, reply, recipientEmail } = req.body;
    const state = await req.db.getState();

    // In production, would use email service to send
    // For now, just log
    console.log(`[Email] Sending reply to ${recipientEmail}:`, reply);

    const log = {
      ts: Date.now(),
      action: "email_reply_sent",
      enquiryId,
      to: recipientEmail,
      subject: "RE: Inquiry",
    };

    if (!state.emailLogs) state.emailLogs = [];
    state.emailLogs.push(log);
    await req.db.saveState(state);

    res.json({ ok: true, messageId: "msg_" + Date.now() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/email-integration/logs", async (req, res) => {
  try {
    const state = await req.db.getState();
    const logs = state.emailLogs || [];
    res.json({
      ok: true,
      logs: logs.slice(-100), // Last 100 entries
      total: logs.length,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.use(express.static(rootDir, { etag: false, maxAge: 0, setHeaders(res, filePath) {
  if (filePath.endsWith(".html") || filePath.endsWith(".jsx")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  }
}}));

app.get("/portal.html", (_req, res) => {
  const portalPath = path.join(rootDir, "portal.html");
  if (fs.existsSync(portalPath)) res.sendFile(portalPath);
  else res.status(404).send("Portal not found");
});

/**
 * Atomic server-side document numbering.
 * POST /api/numbering/next { key, min? }  ->  { ok, key, seq }
 * The sequence is reserved with a single atomic DB upsert, so two users
 * creating documents simultaneously can never receive the same number.
 * `min` seeds the counter from the client's current max so existing numbers
 * are never reused when the server counter is first initialised.
 */
app.post("/api/numbering/next", async (req, res) => {
  try {
    const { key, min } = req.body || {};
    if (!key || typeof key !== "string") {
      return res.status(400).json({ ok: false, error: "key required" });
    }
    const seq = await req.db.nextSequence(key, Number(min) || 0);
    res.json({ ok: true, key, seq });
  } catch (e) {
    console.error("numbering error", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* Theme Settings API Endpoints */
app.get("/api/themes", async (req, res) => {
  try {
    const state = await req.db.getState();
    const themes = (state && state.customThemes) || [];
    res.json({ ok: true, themes });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/themes/current", async (req, res) => {
  try {
    const state = await req.db.getState();
    const settings = (state && state.settings) || {};
    const themeSettings = settings.themeSettings || {
      theme: "classicEnterprise",
      lightModeEnabled: true,
      darkModeEnabled: true,
      allowUserSwitch: true,
      defaultMode: "light"
    };
    res.json({ ok: true, themeSettings });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/themes/apply", async (req, res) => {
  try {
    const { themeId, lightModeEnabled, darkModeEnabled, allowUserSwitch, defaultMode } = req.body;
    const state = await req.db.getState() || { settings: {} };
    
    state.settings.themeSettings = {
      theme: themeId,
      lightModeEnabled,
      darkModeEnabled,
      allowUserSwitch,
      defaultMode,
      appliedAt: new Date().toISOString()
    };
    
    await req.db.saveState(state);
    res.json({ ok: true, message: "Theme applied successfully" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/themes/custom", async (req, res) => {
  try {
    const { themeId, name, lightColors, darkColors } = req.body;
    const state = await req.db.getState() || { customThemes: [] };
    
    if (!state.customThemes) state.customThemes = [];
    
    const newTheme = {
      id: themeId || `custom_${Date.now()}`,
      name,
      isCustom: true,
      light: lightColors,
      dark: darkColors,
      createdAt: new Date().toISOString()
    };
    
    state.customThemes.push(newTheme);
    await req.db.saveState(state);
    res.json({ ok: true, theme: newTheme });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/api/themes/custom/:themeId", async (req, res) => {
  try {
    const { themeId } = req.params;
    const state = await req.db.getState() || { customThemes: [] };
    
    state.customThemes = (state.customThemes || []).filter(t => t.id !== themeId);
    await req.db.saveState(state);
    res.json({ ok: true, message: "Theme deleted" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("*", (_req, res) => {
  if (!fs.existsSync(indexHtmlPath)) {
    res.status(503).type("html").send(
      "<!doctype html><html><body><h1>Frontend not found</h1>"
      + "<p>Expected <code>index.html</code> at " + indexHtmlPath + "</p>"
      + "<p>Run the server from the repository root branch and use <code>cd server && npm start</code>.</p>"
      + "</body></html>"
    );
    return;
  }
  res.sendFile(indexHtmlPath);
});

async function start() {
  try {
    if (!fs.existsSync(indexHtmlPath)) {
      console.error("FATAL: index.html not found at " + indexHtmlPath);
      console.error("  Run from the Veraglo ERP repo root. Expected layout: index.html + src/ + server/");
      process.exit(1);
    }
    await db.ensureSchema();
    await ensureDefaultTenant(db.query);
    const helpers = bootstrapDbHelpers();
    await syncBootstrapLockFromExistingData(db.query, helpers.getState, DEFAULT_TENANT);
    const existing = await db.getState(DEFAULT_TENANT);
    if (existing && existing._v) {
      await db.saveState(ensureDeploymentReady(existing), { tenantId: DEFAULT_TENANT });
    }
    const bootStatus = await loadBootstrapStatus(db.query);
    if (bootStatus.bootstrap_completed) {
      console.log("[bootstrap] locked — Super Admin bootstrap already completed");
    } else if (isProductionMode() && !hasLoginUsers(existing || {})) {
      console.log("[bootstrap] production mode — run: cd server && npm run bootstrap-admin");
    }
    const h = await db.healthCheck();
    const mode = db.storageMode();
    console.log(`Veraglo ERP API listening on http://${HOST}:${PORT}`);
    console.log(`Storage: ${mode}${mode === "file" ? " → " + (h.db || "") : " → " + (h.db || "postgres")}`);
    console.log(`Multi-tenant: enabled (default org: ${DEFAULT_TENANT}, ${h.tenantCount || 1} tenant(s))`);
    console.log(`Open http://localhost:${PORT}`);
  } catch (e) {
    console.error("Server startup failed:", e.message);
    if (db.storageMode() === "postgresql") {
      console.error("");
      console.error("Fix options:");
      console.error("  1. Start Postgres:  docker compose up -d");
      console.error("  2. No Docker:       USE_FILE_STORAGE=1 ./start.sh");
      console.error("  3. Diagnose:        ./scripts/check-localhost.sh");
    }
    process.exit(1);
  }
}

export { app, start };

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  app.listen(PORT, HOST, () => {
    start().catch((e) => {
      console.error("Server startup failed:", e && e.message ? e.message : e);
      process.exit(1);
    });
  });
}
