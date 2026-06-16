/** Self-service password reset — OTP, reset link, rate limits, audit. */

import crypto from "crypto";
import { hashPassword, newPasswordSalt } from "./auth-utils.js";
import { sendMail } from "./mail.js";
import { sendSms } from "./sms.js";
import { passwordPolicy, validatePassword } from "./password-policy.js";

const GENERIC_MSG = "If an account matches the details provided, reset instructions have been sent.";
const INVALID_CODE_MSG = "Invalid or expired verification code.";
const INVALID_RESET_MSG = "This reset link or session has expired. Please start again.";

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function normalizeMobile(m) {
  return String(m || "").replace(/\D/g, "").slice(-10);
}

function securitySettings(state) {
  return (state && state.settings && state.settings.security) || {};
}

export function forgotPasswordSettings(state) {
  const sec = securitySettings(state);
  return {
    enabled: sec.forgotPasswordEnabled !== false,
    otpExpiryMins: Number(sec.forgotPasswordOtpExpiryMins) || 10,
    linkExpiryMins: Number(sec.forgotPasswordLinkExpiryMins) || 60,
    maxAttemptsPerHour: Number(sec.forgotPasswordMaxAttemptsPerHour) || 5,
    delivery: sec.forgotPasswordDelivery || "both",
    emailOtp: sec.forgotPasswordEmailOtp !== false,
    mobileOtp: sec.forgotPasswordMobileOtp !== false,
    securityQuestions: !!sec.forgotPasswordSecurityQuestions,
    adminApproval: !!sec.forgotPasswordAdminApproval,
    passwordPolicy: passwordPolicy(sec),
    securityQuestionsList: (sec.securityQuestions || []).filter((q) => q && q.question),
    loginCaptchaAfterFailures: Number(sec.loginCaptchaAfterFailures) || 0,
    forcePasswordChangeOnFirstLogin: sec.forcePasswordChangeOnFirstLogin !== false,
  };
}

function ensureArrays(state) {
  if (!Array.isArray(state.passwordResetRequests)) state.passwordResetRequests = [];
  if (!Array.isArray(state.passwordResetLog)) state.passwordResetLog = [];
}

function pruneRequests(state) {
  const now = Date.now();
  state.passwordResetRequests = (state.passwordResetRequests || []).filter(
    (r) => !r.usedAt && r.expiresAt > now - 86400000
  ).slice(-100);
  if ((state.passwordResetLog || []).length > 500) {
    state.passwordResetLog = state.passwordResetLog.slice(-500);
  }
}

function appendLog(state, entry) {
  ensureArrays(state);
  state.passwordResetLog.push({
    id: "prl-" + Date.now() + "-" + crypto.randomBytes(3).toString("hex"),
    ts: Date.now(),
    ...entry,
  });
  pruneRequests(state);
}

function countRecentAttempts(state, { ip, identifierHash }) {
  const hourAgo = Date.now() - 3600000;
  const cfg = forgotPasswordSettings(state);
  const max = cfg.maxAttemptsPerHour || 5;
  const logs = (state.passwordResetLog || []).filter((l) => l.ts > hourAgo && l.action === "request");
  const byIp = ip ? logs.filter((l) => l.ip === ip).length : 0;
  const byId = identifierHash ? logs.filter((l) => l.identifierHash === identifierHash).length : 0;
  return { byIp, byId, max, blocked: byIp >= max || byId >= max };
}

function findUserByIdentifier(state, identifier) {
  const q = String(identifier || "").trim();
  if (!q) return null;
  const users = (state.erpUsers || []).filter((u) => !u.isDeleted);

  if (q.includes("@")) {
    const email = q.toLowerCase();
    return users.find((u) => String(u.email || "").toLowerCase() === email) || null;
  }

  const mobile = normalizeMobile(q);
  if (mobile.length >= 10) {
    return users.find((u) => normalizeMobile(u.mobile) === mobile) || null;
  }

  const low = q.toLowerCase();
  return users.find(
    (u) => String(u.userId || "").toLowerCase() === low || String(u.username || "").toLowerCase() === low
  ) || null;
}

function findUserForReset(state, payload) {
  if (!payload || typeof payload !== "object") return findUserByIdentifier(state, payload);
  const email = String(payload.email || payload.identifier || "").trim().toLowerCase();
  if (!email) return findUserByIdentifier(state, payload.identifier);
  let candidates = (state.erpUsers || []).filter(
    (u) => !u.isDeleted && String(u.email || "").toLowerCase() === email
  );
  if (!candidates.length) return null;

  const employeeId = String(payload.employeeId || "").trim().toLowerCase();
  if (employeeId) {
    candidates = candidates.filter((u) => {
      if (String(u.userId || "").toLowerCase() === employeeId) return true;
      if (String(u.username || "").toLowerCase() === employeeId) return true;
      if (u.employeeId) {
        const emp = (state.employees || []).find((e) => e.id === u.employeeId);
        if (emp && String(emp.code || "").toLowerCase() === employeeId) return true;
      }
      return false;
    });
    if (!candidates.length) return null;
  }

  const mobile = normalizeMobile(payload.mobile);
  if (mobile.length >= 10) {
    candidates = candidates.filter((u) => normalizeMobile(u.mobile) === mobile);
    if (!candidates.length) return null;
  }

  return candidates[0] || null;
}

function isUserResetEligible(user) {
  if (!user || user.isDeleted) return false;
  if (user.status !== "Active") return false;
  if (user.loginAllowed === false) return false;
  if (!user.passwordHash) return false;
  return true;
}

function revokeUserSessions(state, user, reason) {
  const stamp = Date.now();
  const userId = user.id;
  const sessions = (state.connectedSessions || []).filter(
    (s) => s.userId === userId || s.email === user.email
  );
  sessions.forEach((s) => {
    state.revokedSessions = (state.revokedSessions || []).concat({
      id: "rv-" + stamp + "-" + crypto.randomBytes(2).toString("hex"),
      sessionId: s.sessionId,
      userId,
      email: user.email,
      revokedAt: stamp,
      by: "system",
      reason: reason || "password-reset",
    });
  });
  state.revokedSessions = (state.revokedSessions || []).concat({
    id: "rv-" + stamp + "-all",
    sessionId: "*",
    userId,
    email: user.email,
    revokedAt: stamp,
    by: "system",
    reason: reason || "password-reset",
  });
  state.connectedSessions = (state.connectedSessions || []).filter(
    (s) => s.userId !== userId && s.email !== user.email
  );
  if ((state.revokedSessions || []).length > 500) {
    state.revokedSessions = state.revokedSessions.slice(-500);
  }
}

function getRequest(state, requestId) {
  return (state.passwordResetRequests || []).find((r) => r.id === requestId) || null;
}

function notifyAdminsResetRequest(state, user, requestId) {
  const admins = (state.erpUsers || []).filter(
    (u) => !u.isDeleted && u.status === "Active" && (u.roleKey === "admin" || u.roleKey === "superadmin")
  );
  const inbox = state.notificationInbox || (state.notificationInbox = []);
  admins.forEach((admin) => {
    inbox.push({
      id: "ni-pr-" + Date.now() + "-" + crypto.randomBytes(2).toString("hex"),
      ts: Date.now(),
      userId: admin.id,
      type: "password-reset-approval",
      title: "Password reset approval required",
      body: `${user.name || user.email} requested a password reset (request ${requestId}).`,
      refId: requestId,
      read: false,
    });
  });
  if (inbox.length > 200) state.notificationInbox = inbox.slice(-200);
}

function resolveVerificationMode(cfg, preferred) {
  const modes = [];
  if (cfg.emailOtp || cfg.mobileOtp) modes.push("otp");
  if (cfg.securityQuestions) modes.push("security-questions");
  if (cfg.adminApproval) modes.push("admin-approval");
  if (!modes.length) modes.push("otp");
  if (preferred && modes.includes(preferred)) return preferred;
  return modes[0];
}

export async function requestPasswordReset(state, payload) {
  ensureArrays(state);
  const { ip, baseUrl, verificationMode } = payload || {};
  const cfg = forgotPasswordSettings(state);
  if (!cfg.enabled) {
    return { ok: false, disabled: true, message: "Password reset is disabled. Contact your administrator." };
  }

  const email = String(payload.email || payload.identifier || "").trim().toLowerCase();
  const idHash = hashValue(email || String(payload.identifier || "").trim().toLowerCase());
  const limits = countRecentAttempts(state, { ip, identifierHash: idHash });
  if (limits.blocked) {
    appendLog(state, {
      action: "rate-limited",
      ip: ip || "",
      identifierHash: idHash,
      detail: "Too many reset attempts",
    });
    return { ok: true, message: GENERIC_MSG, requestId: generateToken().slice(0, 16) };
  }

  const requestId = "prr-" + crypto.randomBytes(8).toString("hex");
  const user = findUserForReset(state, payload);
  const mode = resolveVerificationMode(cfg, verificationMode);

  appendLog(state, {
    action: "request",
    ip: ip || "",
    identifierHash: idHash,
    userId: user ? user.id : "",
    email: user ? user.email : "",
    detail: user ? `Reset requested (${mode})` : "No matching active user",
  });

  if (!user || !isUserResetEligible(user)) {
    return {
      ok: true,
      message: GENERIC_MSG,
      requestId,
      methods: {
        emailOtp: cfg.emailOtp,
        mobileOtp: cfg.mobileOtp,
        securityQuestions: cfg.securityQuestions,
        adminApproval: cfg.adminApproval,
      },
    };
  }

  const now = Date.now();
  const expiresAt = now + cfg.linkExpiryMins * 60000;
  const req = {
    id: requestId,
    userId: user.id,
    email: user.email,
    mobile: user.mobile || "",
    otpHash: null,
    linkTokenHash: null,
    otpExpiresAt: 0,
    expiresAt,
    verifiedAt: null,
    usedAt: null,
    attempts: 0,
    createdAt: now,
    ip: ip || "",
    verificationMode: mode,
    pendingApproval: false,
    approvedAt: null,
    approvedBy: null,
  };

  if (mode === "admin-approval") {
    req.pendingApproval = true;
    req.verificationMode = "admin-approval";
    state.passwordResetRequests.push(req);
    notifyAdminsResetRequest(state, user, requestId);
    appendLog(state, {
      action: "admin-pending",
      ip: ip || "",
      userId: user.id,
      email: user.email,
      detail: "Awaiting administrator approval",
    });
    return {
      ok: true,
      message: "Your reset request has been sent to an administrator for approval.",
      requestId,
      nextStep: "admin-pending",
      methods: {
        emailOtp: cfg.emailOtp,
        mobileOtp: cfg.mobileOtp,
        securityQuestions: cfg.securityQuestions,
        adminApproval: cfg.adminApproval,
      },
    };
  }

  if (mode === "security-questions") {
    state.passwordResetRequests.push(req);
    return {
      ok: true,
      message: GENERIC_MSG,
      requestId,
      nextStep: "security-questions",
      questions: cfg.securityQuestionsList.map((q) => ({ id: q.id, question: q.question })),
      methods: {
        emailOtp: cfg.emailOtp,
        mobileOtp: cfg.mobileOtp,
        securityQuestions: cfg.securityQuestions,
        adminApproval: cfg.adminApproval,
      },
    };
  }

  const otp = generateOtp();
  const linkToken = generateToken();
  req.otpHash = hashValue(otp);
  req.linkTokenHash = hashValue(linkToken);
  req.otpExpiresAt = now + cfg.otpExpiryMins * 60000;
  req.verificationMode = "otp";
  state.passwordResetRequests.push(req);

  const resetLink = `${baseUrl}/?reset=${linkToken}`;
  const delivery = cfg.delivery || "both";
  const sendEmail = cfg.emailOtp && (delivery === "email" || delivery === "both");
  const sendText = cfg.mobileOtp && (delivery === "sms" || delivery === "both");

  const emailBody = [
    `Hello ${user.name || user.email},`,
    "",
    "You requested a password reset for your Veraglo ERP account.",
    "",
    `Verification code (expires in ${cfg.otpExpiryMins} minutes): ${otp}`,
    "",
    `Or reset using this link (expires in ${cfg.linkExpiryMins} minutes):`,
    resetLink,
    "",
    "If you did not request this, ignore this email.",
  ].join("\n");

  if (sendEmail && user.email) {
    try {
      await sendMail(state, {
        to: user.email,
        subject: "Veraglo ERP — Password reset",
        text: emailBody,
      });
      appendLog(state, { action: "otp-sent", ip: ip || "", userId: user.id, email: user.email, detail: "Email OTP sent" });
    } catch (e) {
      console.error("[password-reset] email failed:", e.message);
    }
  }

  if (sendText && user.mobile) {
    const smsBody = `Veraglo ERP reset code: ${otp}. Valid ${cfg.otpExpiryMins} min. Link: ${resetLink}`;
    try {
      await sendSms(state, { to: user.mobile, message: smsBody });
      appendLog(state, { action: "otp-sent", ip: ip || "", userId: user.id, email: user.email, detail: "SMS OTP sent" });
    } catch (e) {
      console.error("[password-reset] sms failed:", e.message);
    }
  }

  if (process.env.VERAGLO_DEBUG_RESET === "1") {
    console.log("[password-reset] DEBUG OTP for", user.email, ":", otp);
    console.log("[password-reset] DEBUG link:", resetLink);
  }

  return {
    ok: true,
    message: GENERIC_MSG,
    requestId,
    nextStep: "otp",
    methods: {
      emailOtp: cfg.emailOtp,
      mobileOtp: cfg.mobileOtp,
      securityQuestions: cfg.securityQuestions,
      adminApproval: cfg.adminApproval,
    },
  };
}

export function verifyResetOtp(state, { requestId, otp, ip }) {
  ensureArrays(state);
  const req = getRequest(state, requestId);
  if (!req || req.usedAt) {
    return { ok: false, reason: INVALID_CODE_MSG };
  }
  if (Date.now() > req.otpExpiresAt) {
    return { ok: false, reason: INVALID_CODE_MSG };
  }
  req.attempts = (req.attempts || 0) + 1;
  if (req.attempts > 5) {
    appendLog(state, { action: "failed", ip, userId: req.userId, email: req.email, detail: "Too many OTP attempts" });
    return { ok: false, reason: INVALID_CODE_MSG };
  }
  if (hashValue(String(otp || "").trim()) !== req.otpHash) {
    appendLog(state, { action: "failed", ip, userId: req.userId, email: req.email, detail: "Invalid OTP" });
    return { ok: false, reason: INVALID_CODE_MSG };
  }
  req.verifiedAt = Date.now();
  appendLog(state, { action: "verify-otp", ip, userId: req.userId, email: req.email, detail: "OTP verified" });
  return { ok: true, requestId: req.id };
}

export function verifySecurityQuestions(state, { requestId, answers, ip }) {
  ensureArrays(state);
  const cfg = forgotPasswordSettings(state);
  const req = getRequest(state, requestId);
  if (!req || req.usedAt || req.verificationMode !== "security-questions") {
    return { ok: false, reason: "Invalid reset session." };
  }
  if (Date.now() > req.expiresAt) {
    return { ok: false, reason: INVALID_RESET_MSG };
  }
  const expected = (cfg.securityQuestionsList || []).filter((q) => q.answerHash);
  if (!expected.length) {
    return { ok: false, reason: "Security questions are not configured." };
  }
  const provided = answers && typeof answers === "object" ? answers : {};
  const allOk = expected.every((q) => {
    const ans = String(provided[q.id] || "").trim().toLowerCase();
    return ans && hashValue(ans) === q.answerHash;
  });
  if (!allOk) {
    req.attempts = (req.attempts || 0) + 1;
    appendLog(state, { action: "failed", ip, userId: req.userId, email: req.email, detail: "Invalid security answers" });
    return { ok: false, reason: "One or more answers are incorrect." };
  }
  req.verifiedAt = Date.now();
  appendLog(state, { action: "verify-questions", ip, userId: req.userId, email: req.email, detail: "Security questions verified" });
  return { ok: true, requestId: req.id };
}

export function checkResetApprovalStatus(state, { requestId }) {
  const req = getRequest(state, requestId);
  if (!req || req.usedAt) return { ok: false, reason: INVALID_RESET_MSG };
  if (!req.pendingApproval) return { ok: true, approved: !!req.verifiedAt, requestId };
  if (req.verifiedAt) return { ok: true, approved: true, requestId };
  return { ok: true, approved: false, pending: true, requestId };
}

export function approvePasswordReset(state, { requestId, actor, baseUrl }) {
  ensureArrays(state);
  const req = getRequest(state, requestId);
  if (!req || req.usedAt) return { ok: false, reason: "Reset request not found." };
  if (!req.pendingApproval) return { ok: false, reason: "Request is not pending approval." };
  const linkToken = generateToken();
  req.linkTokenHash = hashValue(linkToken);
  req.pendingApproval = false;
  req.verifiedAt = Date.now();
  req.approvedAt = Date.now();
  req.approvedBy = actor || "admin";
  const user = (state.erpUsers || []).find((u) => u.id === req.userId);
  const resetLink = `${baseUrl}/?reset=${linkToken}`;
  if (user && user.email) {
    sendMail(state, {
      to: user.email,
      subject: "Veraglo ERP — Password reset approved",
      text: [
        `Hello ${user.name || user.email},`,
        "",
        "Your password reset request was approved by an administrator.",
        "",
        `Reset your password using this link:`,
        resetLink,
      ].join("\n"),
    }).catch((e) => console.error("[password-reset] approval email failed:", e.message));
  }
  appendLog(state, {
    action: "admin-approved",
    userId: req.userId,
    email: req.email,
    detail: "Administrator approved reset · " + (actor || "admin"),
  });
  state.auditLog = (state.auditLog || []).concat({
    id: "A-prapprove-" + Date.now(),
    ts: Date.now(),
    actor: actor || "admin",
    action: "password-reset-approve",
    entity: "erpUsers",
    refId: user ? user.userId : req.userId,
    summary: "Approved password reset for " + (req.email || ""),
  });
  return { ok: true, requestId, resetLink: process.env.VERAGLO_DEBUG_RESET === "1" ? resetLink : undefined };
}

export function rejectPasswordReset(state, { requestId, actor, reason }) {
  ensureArrays(state);
  const req = getRequest(state, requestId);
  if (!req || req.usedAt) return { ok: false, reason: "Reset request not found." };
  req.usedAt = Date.now();
  req.pendingApproval = false;
  appendLog(state, {
    action: "admin-rejected",
    userId: req.userId,
    email: req.email,
    detail: reason || "Administrator rejected reset",
  });
  state.auditLog = (state.auditLog || []).concat({
    id: "A-prreject-" + Date.now(),
    ts: Date.now(),
    actor: actor || "admin",
    action: "password-reset-reject",
    entity: "erpUsers",
    refId: req.userId,
    summary: "Rejected password reset for " + (req.email || ""),
  });
  return { ok: true };
}

export function listPendingPasswordResets(state) {
  return (state.passwordResetRequests || []).filter((r) => r.pendingApproval && !r.usedAt);
}

export function verifyResetLink(state, { token, ip }) {
  ensureArrays(state);
  const hash = hashValue(String(token || "").trim());
  const req = (state.passwordResetRequests || []).find(
    (r) => r.linkTokenHash === hash && !r.usedAt && Date.now() <= r.expiresAt
  );
  if (!req) {
    appendLog(state, { action: "failed", ip, detail: "Invalid reset link" });
    return { ok: false, reason: INVALID_RESET_MSG };
  }
  req.verifiedAt = Date.now();
  appendLog(state, { action: "verify-link", ip, userId: req.userId, email: req.email, detail: "Link verified" });
  return { ok: true, requestId: req.id };
}

export async function completePasswordReset(state, { requestId, password, ip }) {
  ensureArrays(state);
  const sec = securitySettings(state);
  const check = validatePassword(password, sec);
  if (!check.ok) {
    return { ok: false, reason: check.errors[0] || "Password does not meet policy requirements." };
  }

  const req = getRequest(state, requestId);
  if (!req || req.usedAt || !req.verifiedAt) {
    return { ok: false, reason: INVALID_RESET_MSG };
  }
  if (Date.now() > req.expiresAt) {
    return { ok: false, reason: INVALID_RESET_MSG };
  }

  const user = (state.erpUsers || []).find((u) => u.id === req.userId);
  if (!user || !isUserResetEligible(user)) {
    return { ok: false, reason: INVALID_RESET_MSG };
  }

  const salt = newPasswordSalt();
  const passwordHash = await hashPassword(String(password), salt);
  user.passwordSalt = salt;
  user.passwordHash = passwordHash;
  user.forcePasswordChange = false;
  user.failedLogins = 0;
  if (user.status === "Locked") user.status = "Active";
  req.usedAt = Date.now();

  revokeUserSessions(state, user, "password-reset");

  state.auditLog = (state.auditLog || []).concat({
    id: "A-pwreset-" + Date.now(),
    ts: Date.now(),
    actor: "self-service",
    action: "password-reset",
    entity: "erpUsers",
    refId: user.userId,
    summary: "Password reset via forgot-password flow for " + user.email,
  });

  appendLog(state, {
    action: "complete",
    ip: ip || "",
    userId: user.id,
    email: user.email,
    detail: "Password changed successfully",
  });

  return { ok: true, message: "Password updated. You can sign in with your new password." };
}

export function listPasswordResetLog(state, limit) {
  return (state.passwordResetLog || []).slice().reverse().slice(0, limit || 100);
}
