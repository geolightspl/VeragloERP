/** Shared helpers for Veraglo ERP API tests (isolated file storage per run). */
import fs from "fs";
import os from "os";
import path from "path";

let testDataDir = null;
let requestPromise = null;

export function getTestDataDir() {
  if (!testDataDir) {
    testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "veraglo-api-test-"));
    process.env.USE_FILE_STORAGE = "1";
    process.env.VERAGLO_DATA_DIR = testDataDir;
    process.env.VERAGLO_DEBUG_RESET = "1";
    process.env.NODE_ENV = "test";
    process.env.VERAGLO_PLATFORM_KEY = "test";
  }
  return testDataDir;
}

export function tenantHeaders() {
  return { "X-Tenant-Slug": "default" };
}

export async function getRequest() {
  if (!requestPromise) {
    getTestDataDir();
    requestPromise = (async () => {
      const supertest = (await import("supertest")).default;
      const { app, start } = await import("../../index.js");
      await start();
      return supertest(app);
    })();
  }
  return requestPromise;
}

export function resetTestDatabase() {
  const dir = getTestDataDir();
  for (const name of ["erp_state.json", "erp_counters.json", "tenants.json"]) {
    const fp = path.join(dir, name);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  const tenantsRoot = path.join(dir, "tenants");
  if (fs.existsSync(tenantsRoot)) fs.rmSync(tenantsRoot, { recursive: true, force: true });
  const snapDir = path.join(dir, "snapshots");
  if (fs.existsSync(snapDir)) fs.rmSync(snapDir, { recursive: true, force: true });
}

export function cleanupTestDatabase() {
  if (testDataDir && fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
  testDataDir = null;
  requestPromise = null;
}

export function emptyState() {
  return {
    _v: 11,
    seq: { USR: 0 },
    erpUsers: [],
    customRoles: [],
    locations: [{ id: "loc1", name: "Main Warehouse", locType: "Warehouse", status: "Active" }],
    settings: {
      activation: { status: "Trial", trialEndsAt: "2099-12-31" },
      security: { minPasswordLength: 8, forgotPasswordEnabled: true },
    },
    connectedSessions: [],
    revokedSessions: [],
    auditLog: [],
    customers: [],
    items: [],
    quotations: [],
    portalLinks: [],
    passwordResetRequests: [],
    passwordResetLog: [],
  };
}

export async function seedState(request, patch = {}) {
  const body = { ...emptyState(), ...patch };
  const res = await request.put("/api/state").send(body);
  if (res.status !== 200) {
    throw new Error("seedState failed: " + res.status + " " + JSON.stringify(res.body));
  }
  return body;
}

export async function bootstrapAdmin(request, overrides = {}) {
  return request.post("/api/setup/bootstrap-admin").send({
    email: "admin@test.veraglo.local",
    password: "TestAdmin9!",
    name: "Test Administrator",
    ...overrides,
  });
}
