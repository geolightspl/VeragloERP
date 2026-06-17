/**
 * Veraglo ERP — Node.js API integration tests (Express + file storage).
 * Run: npm run test:api
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  bootstrapAdmin,
  cleanupTestDatabase,
  emptyState,
  getRequest,
  loginApi,
  resetTestDatabase,
  securedBootstrapAdmin,
  seedState,
  tenantHeaders,
} from "./helpers.mjs";

let request;

before(async () => {
  request = await getRequest();
});

beforeEach(() => {
  resetTestDatabase();
});

after(() => {
  cleanupTestDatabase();
});

describe("GET /api/health", () => {
  it("returns ok with storage metadata", async () => {
    const res = await request.get("/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.storage, "file");
    assert.equal(res.body.postgres, false);
    assert.equal(res.body.multiTenant, true);
    assert.equal(res.body.tenantId, "default");
    assert.ok(res.body.serverTime);
  });
});

describe("GET /api/auth/status", () => {
  it("reports needsSetup on empty database", async () => {
    const res = await request.get("/api/auth/status");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.needsSetup, true);
    assert.equal(res.body.hasUsers, false);
    assert.equal(res.body.storage, "file");
  });

  it("reports hasUsers after bootstrap", async () => {
    await bootstrapAdmin(request);
    const res = await request.get("/api/auth/status");
    assert.equal(res.body.hasUsers, true);
    assert.equal(res.body.needsSetup, false);
    assert.equal(res.body.bootstrap_completed, true);
    assert.equal(res.body.allow_client_setup, false);
  });
});

describe("GET /api/system/bootstrap-status", () => {
  it("reports unlocked status on empty database", async () => {
    const res = await request.get("/api/system/bootstrap-status");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.bootstrap_completed, false);
    assert.equal(res.body.setup_required, true);
  });
});

describe("POST /api/system/bootstrap-admin", () => {
  it("creates super admin with valid secret", async () => {
    const res = await securedBootstrapAdmin(request);
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.email, "admin@test.veraglo.local");
    assert.ok(res.body.userId);
    assert.equal(res.body.bootstrap_completed, true);
  });

  it("rejects invalid bootstrap secret", async () => {
    const res = await securedBootstrapAdmin(request, {}, "wrong-secret");
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "invalid_bootstrap_secret");
  });

  it("rejects second secured bootstrap when locked", async () => {
    await securedBootstrapAdmin(request);
    const res = await securedBootstrapAdmin(request, { email: "other@test.veraglo.local" });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, "bootstrap_locked");
  });
});

describe("POST /api/auth/login", () => {
  it("rejects login before any user exists", async () => {
    const res = await loginApi(request, "nobody@test.veraglo.local", "TestAdmin9!");
    assert.equal(res.status, 503);
    assert.equal(res.body.error, "no_state");
  });

  it("authenticates after bootstrap", async () => {
    await bootstrapAdmin(request);
    const res = await loginApi(request, "admin@test.veraglo.local", "TestAdmin9!");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.user.email, "admin@test.veraglo.local");
    assert.equal(res.body.user.roleKey, "admin");
  });

  it("rejects wrong password with specific reason", async () => {
    await bootstrapAdmin(request);
    const res = await loginApi(request, "admin@test.veraglo.local", "WrongPass9!");
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "login_failed");
    assert.equal(res.body.reason, "invalid");
    assert.match(res.body.message, /Incorrect email or password/i);
  });

  it("diagnoses user login eligibility", async () => {
    await bootstrapAdmin(request);
    const res = await request.get("/api/auth/diagnose-user?email=admin@test.veraglo.local").set(tenantHeaders());
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.checks.userExists, true);
    assert.equal(res.body.checks.active, true);
    assert.equal(res.body.checks.passwordSet, true);
  });

  it("tests credentials without creating session", async () => {
    await bootstrapAdmin(request);
    const ok = await request.post("/api/auth/test-credentials").set(tenantHeaders()).send({
      email: "admin@test.veraglo.local",
      password: "TestAdmin9!",
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.passwordValid, true);
    const bad = await request.post("/api/auth/test-credentials").set(tenantHeaders()).send({
      email: "admin@test.veraglo.local",
      password: "wrong",
    });
    assert.equal(bad.body.passwordValid, false);
    assert.equal(bad.body.reason, "invalid");
  });

  it("lists login organizations with default", async () => {
    await bootstrapAdmin(request);
    const res = await request.get("/api/auth/login-organizations");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(Array.isArray(res.body.organizations));
    assert.ok(res.body.organizations.some((o) => o.slug === "default"));
    assert.equal(res.body.defaultTenantSlug, "default");
  });

  it("rejects login when user not assigned to organization", async () => {
    await bootstrapAdmin(request);
    const admin = await request.get("/api/state").set(tenantHeaders());
    const base = admin.body;
    const { hashPassword, newPasswordSalt } = await import("../../auth-utils.js");
    const salt = newPasswordSalt();
    const hash = await hashPassword("OtherOrg9!", salt);
    base.erpUsers = (base.erpUsers || []).concat({
      id: "u-other-org",
      userId: "USR-0099",
      name: "Other Org User",
      email: "other@test.veraglo.local",
      username: "other",
      roleKey: "employee",
      tenantId: "acme-other",
      status: "Active",
      loginAllowed: true,
      isDeleted: false,
      passwordSalt: salt,
      passwordHash: hash,
      failedLogins: 0,
    });
    await request.put("/api/state").set(tenantHeaders()).send(base);
    const res = await loginApi(request, "other@test.veraglo.local", "OtherOrg9!");
    assert.equal(res.status, 401);
    assert.equal(res.body.reason, "not_in_organization");
    assert.match(res.body.message, /not assigned to this organization/i);
  });

  it("includes built-in roles for sales user login", async () => {
    await bootstrapAdmin(request);
    const state = emptyState();
    state.company = { name: "Test Co", tradeName: "Test Co" };
    const admin = await request.get("/api/state").set(tenantHeaders());
    const base = admin.body;
    base.customRoles = (base.customRoles || []).concat({
      id: "role_sales", key: "sales", label: "Sales Team", moduleAccess: ["sales"], actions: ["view"], active: true, hierarchy: 30,
    });
    base.erpUsers = (base.erpUsers || []).concat({
      id: "u-sales-1",
      userId: "USR-0002",
      name: "Sales User",
      email: "sales@test.veraglo.local",
      username: "sales",
      roleKey: "sales",
      status: "Active",
      loginAllowed: true,
      isDeleted: false,
      passwordSalt: "abc123",
      passwordHash: "pending",
      failedLogins: 0,
    });
    const { hashPassword, newPasswordSalt } = await import("../../auth-utils.js");
    const salt = newPasswordSalt();
    const hash = await hashPassword("SalesPass9!", salt);
    base.erpUsers[base.erpUsers.length - 1].passwordSalt = salt;
    base.erpUsers[base.erpUsers.length - 1].passwordHash = hash;
    await request.put("/api/state").set(tenantHeaders()).send(base);
    const res = await loginApi(request, "sales@test.veraglo.local", "SalesPass9!");
    assert.equal(res.status, 200);
    assert.equal(res.body.user.roleKey, "sales");
  });
});

describe("POST /api/setup/bootstrap-admin", () => {
  it("creates first administrator on fresh install", async () => {
    const res = await bootstrapAdmin(request);
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.email, "admin@test.veraglo.local");
    assert.ok(res.body.userId);
    assert.ok(res.body.password);
  });

  it("rejects second bootstrap with 403", async () => {
    await bootstrapAdmin(request);
    const res = await bootstrapAdmin(request, { email: "other@test.veraglo.local" });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, "users_exist");
  });

  it("rejects password shorter than 8 characters", async () => {
    const res = await bootstrapAdmin(request, { password: "short" });
    assert.equal(res.status, 500);
    assert.equal(res.body.error, "bootstrap_failed");
  });
});

describe("GET/PUT /api/state", () => {
  it("GET returns 404 when database is empty", async () => {
    const res = await request.get("/api/state");
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "no_state");
  });

  it("PUT saves ERP state and GET returns it", async () => {
    const state = emptyState();
    state.company = { name: "Test Co", tradeName: "Test Co" };
    const put = await request.put("/api/state").send(state);
    assert.equal(put.status, 200);
    assert.equal(put.body.ok, true);

    const get = await request.get("/api/state");
    assert.equal(get.status, 200);
    assert.equal(get.body.company.name, "Test Co");
  });

  it("PUT rejects body without _v", async () => {
    const res = await request.put("/api/state").send({ company: { name: "X" } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "invalid_body");
  });

  it("PUT merge protects erpUsers from empty client overwrite", async () => {
    await bootstrapAdmin(request);
    const current = await request.get("/api/state");
    const stale = { ...current.body, erpUsers: [], _baseRev: current.body._rev };
    const res = await request.put("/api/state").send(stale);
    assert.equal(res.status, 200);
    const after = await request.get("/api/state");
    assert.ok((after.body.erpUsers || []).length >= 1);
  });
});

describe("POST /api/sessions/heartbeat", () => {
  it("records active session heartbeat", async () => {
    const res = await request.post("/api/sessions/heartbeat").send({
      sessionId: "ses-test-1",
      userId: "u1",
      email: "admin@test.veraglo.local",
      roleKey: "admin",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.active, 1);

    const sessions = await request.get("/api/sessions");
    assert.equal(sessions.status, 200);
    assert.equal(sessions.body.length, 1);
    assert.equal(sessions.body[0].sessionId, "ses-test-1");
  });
});

describe("POST /api/auth/repair", () => {
  it("returns 404 when no state exists", async () => {
    const res = await request.post("/api/auth/repair").send({ actor: "admin" });
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "no_state");
  });

  it("repairs auth index when state exists", async () => {
    await bootstrapAdmin(request);
    const res = await request.post("/api/auth/repair").send({ actor: "admin" });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.hasUsers, true);
  });
});

describe("POST /api/numbering/next", () => {
  it("returns sequential numbers for the same key", async () => {
    const a = await request.post("/api/numbering/next").send({ key: "QT", min: 100 });
    const b = await request.post("/api/numbering/next").send({ key: "QT", min: 100 });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.body.ok, true);
    assert.equal(b.body.seq, a.body.seq + 1);
  });

  it("requires key", async () => {
    const res = await request.post("/api/numbering/next").send({});
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "key required");
  });

  it("respects min seed value", async () => {
    const res = await request.post("/api/numbering/next").send({ key: "SO", min: 500 });
    assert.equal(res.body.seq, 501);
  });
});

describe("Snapshots API", () => {
  it("creates, lists, and retrieves snapshots", async () => {
    const state = emptyState();
    state.company = { name: "Snap Co" };

    const create = await request.post("/api/snapshots").send({
      label: "Before change",
      createdBy: "admin",
      data: state,
    });
    assert.equal(create.status, 201);
    assert.ok(create.body.id);

    const list = await request.get("/api/snapshots");
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body));
    assert.equal(list.body.length, 1);

    const get = await request.get("/api/snapshots/" + create.body.id);
    assert.equal(get.status, 200);
    assert.equal(get.body.company.name, "Snap Co");
  });

  it("returns 404 for missing snapshot", async () => {
    const res = await request.get("/api/snapshots/missing-id");
    assert.equal(res.status, 404);
  });

  it("POST rejects payload without data._v", async () => {
    const res = await request.post("/api/snapshots").send({ label: "Bad" });
    assert.equal(res.status, 400);
  });
});

describe("Forgot password API", () => {
  it("GET settings returns public config", async () => {
    const res = await request.get("/api/auth/forgot-password/settings");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(typeof res.body.enabled, "boolean");
    assert.ok(res.body.methods);
    assert.ok(res.body.passwordPolicy);
  });

  it("POST request returns generic message without user enumeration", async () => {
    await bootstrapAdmin(request);
    const res = await request.post("/api/auth/forgot-password/request").send({
      email: "admin@test.veraglo.local",
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.message || res.body.ok !== false);
  });

  it("POST request accepts email with optional employee id", async () => {
    await bootstrapAdmin(request);
    const res = await request.post("/api/auth/forgot-password/request").send({
      email: "admin@test.veraglo.local",
      employeeId: "USR0001",
      mobile: "",
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.requestId);
  });

  it("POST verify-otp rejects invalid otp", async () => {
    const res = await request.post("/api/auth/forgot-password/verify-otp").send({
      requestId: "missing",
      otp: "000000",
    });
    assert.equal(res.status, 400);
  });

  it("POST reset rejects weak password", async () => {
    const res = await request.post("/api/auth/forgot-password/reset").send({
      requestId: "missing",
      password: "weak",
    });
    assert.equal(res.status, 400);
  });
});

describe("IP whitelisting", () => {
  it("GET /api/auth/client-ip returns client address", async () => {
    const res = await request.get("/api/auth/client-ip");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.ip);
  });

  it("blocks /api/state when IP restriction enabled and IP not whitelisted", async () => {
    await seedState(request, {
      settings: {
        activation: { status: "Trial", trialEndsAt: "2099-12-31" },
        security: {
          ipRestriction: true,
          ipAllowLocalhost: false,
          allowedIps: "203.0.113.99",
        },
      },
    });
    const res = await request.get("/api/state").set(tenantHeaders());
    assert.equal(res.status, 403);
    assert.equal(res.body.error, "ip_not_allowed");
  });

  it("allows /api/state when localhost is permitted", async () => {
    await seedState(request, {
      settings: {
        activation: { status: "Trial", trialEndsAt: "2099-12-31" },
        security: {
          ipRestriction: true,
          ipAllowLocalhost: true,
          allowedIps: "203.0.113.99",
        },
      },
    });
    const res = await request.get("/api/state").set(tenantHeaders());
    assert.equal(res.status, 200);
  });

  it("GET /api/auth/ip-access reports policy status", async () => {
    const res = await request.get("/api/auth/ip-access").set(tenantHeaders());
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(typeof res.body.enabled, "boolean");
    assert.ok(res.body.clientIp);
  });
});

describe("Weather API", () => {
  it("GET settings returns weather login config", async () => {
    const res = await request.get("/api/weather/settings");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it("GET current responds when weather is disabled", async () => {
    await seedState(request, {
      settings: {
        activation: { status: "Trial", trialEndsAt: "2099-12-31" },
        weatherLogin: { enabled: false },
      },
    });
    const res = await request.get("/api/weather/current");
    assert.equal(res.status, 200);
    assert.equal(res.body.disabled, true);
  });
});

describe("Themes API", () => {
  it("GET /api/themes returns custom theme list", async () => {
    const res = await request.get("/api/themes");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(Array.isArray(res.body.themes));
  });

  it("GET /api/themes/current returns defaults on empty state", async () => {
    const res = await request.get("/api/themes/current");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.themeSettings.theme);
  });

  it("POST /api/themes/apply persists theme settings", async () => {
    const res = await request.post("/api/themes/apply").send({
      themeId: "classicEnterprise",
      lightModeEnabled: true,
      darkModeEnabled: true,
      allowUserSwitch: true,
      defaultMode: "dark",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    const current = await request.get("/api/themes/current");
    assert.equal(current.body.themeSettings.defaultMode, "dark");
  });

  it("POST /api/themes/custom creates and DELETE removes theme", async () => {
    const create = await request.post("/api/themes/custom").send({
      name: "QA Theme",
      lightColors: { primary: "#111111" },
      darkColors: { primary: "#eeeeee" },
    });
    assert.equal(create.status, 200);
    assert.ok(create.body.theme.id);

    const del = await request.delete("/api/themes/custom/" + create.body.theme.id);
    assert.equal(del.status, 200);

    const list = await request.get("/api/themes");
    assert.ok(!(list.body.themes || []).some((t) => t.id === create.body.theme.id));
  });
});

describe("Email integration API", () => {
  it("GET/POST settings mask passwords", async () => {
    await seedState(request);
    const post = await request.post("/api/email-integration/settings").send({
      email: "sales@test.veraglo.local",
      password: "secret123",
      provider: "gmail",
    });
    assert.equal(post.status, 200);
    assert.equal(post.body.settings.password, "***");

    const get = await request.get("/api/email-integration/settings");
    assert.equal(get.status, 200);
    assert.equal(get.body.settings.password, "***");
  });

  it("POST sync requires configuration", async () => {
    await seedState(request);
    const res = await request.post("/api/email-integration/sync").send({});
    assert.equal(res.status, 400);
  });

  it("POST convert-to-enquiry creates enquiry record", async () => {
    await seedState(request, { customers: [{ id: "c1", name: "Acme" }] });
    await request.post("/api/email-integration/settings").send({
      email: "inbox@test.veraglo.local",
    });
    await request.post("/api/email-integration/sync").send({});

    const res = await request.post("/api/email-integration/convert-to-enquiry").send({
      emailId: "email_1",
      customerId: "c1",
      assignedTo: "admin",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.enquiry.no);
  });
});

describe("Customer portal API", () => {
  it("GET quote returns not_found for invalid token", async () => {
    const res = await request.get("/api/portal/quote/invalid-token");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.error, "not_found");
  });

  it("GET quote returns sanitized payload for valid token", async () => {
    await seedState(request, {
      customers: [{ id: "c1", name: "Portal Customer" }],
      quotations: [{
        id: "q1",
        no: "QT-9001",
        customerId: "c1",
        date: "2026-06-01",
        lines: [{ sku: "SKU1", name: "Widget", qty: 2, rate: 100, taxPct: 18 }],
        totals: { grand: 236 },
        status: "Sent",
      }],
      portalLinks: [{
        token: "portal-test-token",
        entityId: "q1",
        active: true,
        allowDownload: true,
        views: [],
      }],
      company: { name: "Veraglo Test", tradeName: "Veraglo Test" },
    });

    const res = await request.get("/api/portal/quote/portal-test-token");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.quotation.no, "QT-9001");
    assert.equal(res.body.company.name, "Veraglo Test");
  });

  it("POST view records portal view count", async () => {
    await seedState(request, {
      customers: [{ id: "c1", name: "Portal Customer" }],
      quotations: [{ id: "q1", no: "QT-9001", customerId: "c1", lines: [] }],
      portalLinks: [{ token: "view-token", entityId: "q1", active: true, views: [] }],
    });

    const res = await request.post("/api/portal/view/view-token").send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.views, 1);
  });
});

describe("Notifications API", () => {
  it("POST send rejects missing to/subject", async () => {
    const res = await request.post("/api/notifications/send").send({ text: "hello" });
    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
  });
});

describe("Data path API", () => {
  it("POST validate returns empty result for blank path", async () => {
    const res = await request.post("/api/datapath/validate").send({ path: "" });
    assert.equal(res.status, 200);
    assert.equal(res.body.readOk, false);
    assert.equal(res.body.writeOk, false);
  });
});

describe("Multi-tenant API", () => {
  it("GET /api/tenants lists default organization", async () => {
    const res = await request.get("/api/tenants");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(Array.isArray(res.body.tenants));
    assert.ok(res.body.tenants.some((t) => t.slug === "default"));
  });

  it("POST /api/tenants creates isolated org with platform key", async () => {
    const create = await request.post("/api/tenants")
      .set("X-Platform-Key", "test")
      .send({ slug: "acme-test", name: "Acme Test Co" });
    assert.equal(create.status, 201);
    assert.equal(create.body.tenant.slug, "acme-test");

    const state = emptyState();
    state.company = { name: "Acme Only", tradeName: "Acme" };
    const put = await request.put("/api/state")
      .set("X-Tenant-Slug", "acme-test")
      .send(state);
    assert.equal(put.status, 200);

    const getDefault = await request.get("/api/state").set("X-Tenant-Slug", "default");
    const getAcme = await request.get("/api/state").set("X-Tenant-Slug", "acme-test");
    if (getDefault.status === 200 && getAcme.status === 200) {
      assert.notEqual(getDefault.body.company.name, getAcme.body.company.name);
    } else {
      assert.equal(getAcme.status, 200);
      assert.equal(getAcme.body.company.name, "Acme Only");
    }
  });

  it("PUT /api/state rejects unknown organization", async () => {
    const state = emptyState();
    const put = await request.put("/api/state")
      .set("X-Tenant-Slug", "no-such-org-xyz")
      .send(state);
    assert.equal(put.status, 400);
    assert.equal(put.body.error, "tenant_not_found");

    const get = await request.get("/api/state").set("X-Tenant-Slug", "no-such-org-xyz");
    assert.equal(get.status, 404);
    assert.equal(get.body.error, "tenant_not_found");
  });
});

describe("Static UI", () => {
  it("GET / serves index.html", async () => {
    const res = await request.get("/");
    assert.equal(res.status, 200);
    assert.match(res.text, /Veraglo ERP/i);
  });
});
