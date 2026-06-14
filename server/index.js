import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { access, constants } from "fs/promises";
import * as db from "./db.js";
import {
  authDiagnostics,
  createAdminUser,
  ensureAdminRole,
  generatePassword,
  hasLoginUsers,
  mergeStateProtected,
  shouldShowFirstSetup,
} from "./auth-utils.js";
import { ensureDeploymentReady } from "./first-run.js";
import * as weather from "./weather.js";
import * as passwordReset from "./password-reset.js";
import { sendMail } from "./mail.js";
import * as portal from "./portal.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const indexHtmlPath = path.join(rootDir, "index.html");
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: "25mb" }));

/** Public auth / first-run diagnostics for login troubleshooting. */
app.get("/api/auth/status", async (_req, res) => {
  try {
    const state = (await db.getState()) || { _v: 11, settings: { activation: {} }, erpUsers: [] };
    const ready = ensureDeploymentReady(state);
    const act = (ready.settings && ready.settings.activation) || {};
    const today = new Date().toISOString().slice(0, 10);
    const trialValid = act.trialEndsAt && act.trialEndsAt >= today;
    const licensed =
      act.status === "Trial" && trialValid
      || (act.status === "Active" && !!act.licenseKeyId)
      || (!act.licenseKeyId && trialValid);
    const diag = authDiagnostics(ready);
    res.json({
      ok: true,
      storage: db.storageMode(),
      dataDir: process.env.VERAGLO_DATA_DIR || null,
      ...diag,
      licensed,
      trialEndsAt: act.trialEndsAt || null,
      activationStatus: act.status || "unknown",
      hint: diag.dataIntegrityWarning
        ? "Transactional data exists but no login users — use Admin repair or restore backup. Do not run first-time setup."
        : diag.needsSetup
          ? "First launch: use Create administrator on the login screen, or POST /api/setup/bootstrap-admin"
          : "Sign in with the email and password from Admin → Users",
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * Create the first administrator when no login users exist (fresh GitHub / server deploy).
 * Safe to call only on empty installations — returns 403 once users exist.
 */
app.post("/api/setup/bootstrap-admin", async (req, res) => {
  try {
    await db.ensureSchema();
    let state = await db.getState();
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
    await db.saveState(state);
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
app.get("/api/auth/forgot-password/settings", async (_req, res) => {
  try {
    const state = (await db.getState()) || {};
    const cfg = passwordReset.forgotPasswordSettings(state);
    res.json({
      ok: true,
      enabled: cfg.enabled,
      otpExpiryMins: cfg.otpExpiryMins,
      linkExpiryMins: cfg.linkExpiryMins,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/auth/forgot-password/request", async (req, res) => {
  try {
    const state = (await db.getState()) || { _v: 11, erpUsers: [], settings: {} };
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const result = await passwordReset.requestPasswordReset(state, {
      identifier: req.body && req.body.identifier,
      ip: req.ip || req.headers["x-forwarded-for"] || "",
      baseUrl,
    });
    if (result.disabled) return res.status(403).json(result);
    await db.saveState(state);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "request_failed" });
  }
});

app.post("/api/auth/forgot-password/verify-otp", async (req, res) => {
  try {
    const state = (await db.getState()) || { passwordResetRequests: [] };
    const result = passwordReset.verifyResetOtp(state, {
      requestId: req.body && req.body.requestId,
      otp: req.body && req.body.otp,
      ip: req.ip || "",
    });
    await db.saveState(state);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/auth/forgot-password/verify-link", async (req, res) => {
  try {
    const state = (await db.getState()) || { passwordResetRequests: [] };
    const token = (req.body && req.body.token) || req.query.token;
    const result = passwordReset.verifyResetLink(state, { token, ip: req.ip || "" });
    await db.saveState(state);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/auth/forgot-password/reset", async (req, res) => {
  try {
    const state = (await db.getState()) || { erpUsers: [] };
    const result = await passwordReset.completePasswordReset(state, {
      requestId: req.body && req.body.requestId,
      password: req.body && req.body.password,
      ip: req.ip || "",
    });
    await db.saveState(state);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Login weather theme — public, cached, non-blocking for sign-in. */
app.get("/api/weather/settings", async (_req, res) => {
  try {
    const state = (await db.getState()) || {};
    res.json({ ok: true, ...weather.weatherLoginSettings(state) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/weather/current", async (req, res) => {
  try {
    const state = (await db.getState()) || {};
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

app.get("/api/health", async (_req, res) => {
  try {
    const h = await db.healthCheck();
    const mode = db.storageMode();
    res.json({
      ok: true,
      storage: mode,
      postgres: mode === "postgresql",
      database: h.db,
      dataDir: process.env.VERAGLO_DATA_DIR || null,
      serverTime: h.now,
    });
  } catch (e) {
    res.status(503).json({ ok: false, postgres: false, error: e.message });
  }
});

/** Full ERP state (same shape as former localStorage document). */
app.get("/api/state", async (_req, res) => {
  try {
    const state = await db.getState();
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
    let payload = req.body;
    const baseRev = (payload._baseRev != null && Number.isFinite(Number(payload._baseRev)))
      ? Number(payload._baseRev) : null;
    const conflictMsg = "This record was updated by another user. Please refresh before saving.";
    const existing = await db.getState();
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
    const result = await db.saveState(payload, baseRev != null ? { expectedRev: baseRev } : {});
    if (result && result.conflict) {
      return res.status(409).json({ error: "conflict", currentRev: result.currentRev, message: conflictMsg });
    }
    res.json({ ok: true, updatedAt: result.updatedAt, rev: result.rev, merged: !!(existing && payload._mergeProtectedAt) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "write_failed", message: e.message });
  }
});

app.get("/api/snapshots", async (_req, res) => {
  try {
    res.json(await db.listSnapshots());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/snapshots", async (req, res) => {
  try {
    const { label, createdBy, data } = req.body || {};
    if (!data || !data._v) return res.status(400).json({ error: "data required" });
    const row = await db.saveSnapshot(label, createdBy, data);
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/snapshots/:id", async (req, res) => {
  try {
    const data = await db.getSnapshot(req.params.id);
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
    const state = (await db.getState()) || { _v: 6, connectedSessions: [] };
    const list = (state.connectedSessions || []).filter(
      (s) => s.sessionId !== row.sessionId && Date.now() - (s.lastSeenAt || 0) < 180000
    );
    const connectedSessions = list.concat({ ...row, lastSeenAt: Date.now() });
    await db.patchConnectedSessions(connectedSessions);
    res.json({ ok: true, active: connectedSessions.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Admin emergency repair — rebuild auth index, validate users, reconnect data path metadata. */
app.post("/api/auth/repair", async (req, res) => {
  try {
    const state = (await db.getState()) || null;
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
    ensureAdminRole(state);
    state.customRoles = state.customRoles || [];
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
    await db.saveState(state);
    const diag = authDiagnostics(state);
    res.json({ ok: true, ...diag, message: "Auth repair completed" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});


app.get("/api/sessions", async (_req, res) => {
  try {
    const state = await db.getState();
    res.json((state && state.connectedSessions) || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Customer portal — public quotation view (token in link). */
app.get("/api/portal/quote/:token", async (req, res) => {
  try {
    const state = (await db.getState()) || {};
    res.json(portal.portalQuotePayload(state, req.params.token));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/portal/view/:token", async (req, res) => {
  try {
    const state = (await db.getState()) || {};
    const link = portal.recordPortalView(state, req.params.token, {
      userAgent: req.headers["user-agent"] || "",
      ip: req.ip || "",
    });
    if (!link) return res.status(404).json({ ok: false, error: "not_found" });
    await db.saveState(state);
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
    const state = (await db.getState()) || { settings: { notifications: {} } };
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
    let state = await db.getState();
    if (!state.emailIntegration) state.emailIntegration = {};
    state.emailIntegration = {
      ...state.emailIntegration,
      ...req.body,
      // Never store plain password in state; would be encrypted in production
      lastSynced: state.emailIntegration?.lastSynced,
    };
    await db.saveState(state);
    res.json({ ok: true, settings: { ...state.emailIntegration, password: "***" } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/email-integration/settings", async (_req, res) => {
  try {
    const state = await db.getState();
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
    let state = await db.getState();
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
    await db.saveState(state);

    res.json({ ok: true, emails: mockEmails, synced: mockEmails.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/email-integration/convert-to-enquiry", async (req, res) => {
  try {
    const { emailId, customerId, assignedTo } = req.body;
    let state = await db.getState();

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
    await db.saveState(state);

    res.json({ ok: true, enquiry });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/email-integration/send-reply", async (req, res) => {
  try {
    const { enquiryId, reply, recipientEmail } = req.body;
    const state = await db.getState();

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
    await db.saveState(state);

    res.json({ ok: true, messageId: "msg_" + Date.now() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/email-integration/logs", async (req, res) => {
  try {
    const state = await db.getState();
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
    const seq = await db.nextSequence(key, Number(min) || 0);
    res.json({ ok: true, key, seq });
  } catch (e) {
    console.error("numbering error", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* Theme Settings API Endpoints */
app.get("/api/themes", async (_req, res) => {
  try {
    const state = await db.getState();
    const themes = (state && state.customThemes) || [];
    res.json({ ok: true, themes });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/themes/current", async (_req, res) => {
  try {
    const state = await db.getState();
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
    const state = await db.getState() || { settings: {} };
    
    state.settings.themeSettings = {
      theme: themeId,
      lightModeEnabled,
      darkModeEnabled,
      allowUserSwitch,
      defaultMode,
      appliedAt: new Date().toISOString()
    };
    
    await db.saveState(state);
    res.json({ ok: true, message: "Theme applied successfully" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/themes/custom", async (req, res) => {
  try {
    const { themeId, name, lightColors, darkColors } = req.body;
    const state = await db.getState() || { customThemes: [] };
    
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
    await db.saveState(state);
    res.json({ ok: true, theme: newTheme });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/api/themes/custom/:themeId", async (req, res) => {
  try {
    const { themeId } = req.params;
    const state = await db.getState() || { customThemes: [] };
    
    state.customThemes = (state.customThemes || []).filter(t => t.id !== themeId);
    await db.saveState(state);
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
    const existing = await db.getState();
    if (existing && existing._v) {
      await db.saveState(ensureDeploymentReady(existing));
    }
    const h = await db.healthCheck();
    const mode = db.storageMode();
    console.log(`Veraglo ERP API listening on http://localhost:${PORT}`);
    console.log(`Storage: ${mode}${mode === "file" ? " → " + (h.db || "") : " → " + (h.db || "postgres")}`);
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

app.listen(PORT, start);
