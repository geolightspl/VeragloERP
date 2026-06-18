/**
 * Admin Repair — fixes contradictory auth state.
 * Finds admin users across tenants, maps them to default org, activates, and optionally resets password.
 * Protected by RECOVERY_SECRET.
 *
 * Usage:
 *   cd server && npm run repair-admin -- --email admin@company.com --password "NewPass9!" --org default
 *   cd server && npm run repair-admin -- --diagnose
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import * as db from "../db.js";
import {
  findUserByLogin,
  hasLoginUsers,
  ensureBuiltInRoles,
  hashPassword,
  newPasswordSalt,
  isUserLoginEligibleServer,
  createAdminUser,
} from "../auth-utils.js";
import { ensureDeploymentReady } from "../first-run.js";
import { DEFAULT_TENANT } from "../tenant.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

function parseArgs(argv) {
  const out = { tenant: DEFAULT_TENANT, diagnose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email" && argv[i + 1]) out.email = argv[++i];
    else if (a === "--password" && argv[i + 1]) out.password = argv[++i];
    else if (a === "--name" && argv[i + 1]) out.name = argv[++i];
    else if (a === "--org" && argv[i + 1]) out.tenant = argv[++i];
    else if (a === "--diagnose" || a === "-d") out.diagnose = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

async function diagnoseAllTenants() {
  const results = [];
  const tenantsToCheck = [DEFAULT_TENANT, "13"];
  for (const tid of tenantsToCheck) {
    try {
      const state = await db.getState(tid);
      if (!state) { results.push({ tenant: tid, status: "no-data" }); continue; }
      const ready = ensureDeploymentReady(state);
      ensureBuiltInRoles(ready);
      const users = (ready.erpUsers || []);
      const activeAdmins = users.filter((u) =>
        !u.isDeleted && u.status === "Active" && u.loginAllowed !== false &&
        (u.roleKey === "admin" || u.roleKey === "super_admin") &&
        u.passwordHash && String(u.passwordHash).length > 8
      );
      const allAdmins = users.filter((u) => u.roleKey === "admin" || u.roleKey === "super_admin");
      results.push({
        tenant: tid,
        status: activeAdmins.length ? "ok" : allAdmins.length ? "broken" : "no-admins",
        totalUsers: users.filter((u) => !u.isDeleted).length,
        allAdmins: allAdmins.length,
        activeAdmins: activeAdmins.length,
        adminEmails: activeAdmins.map((u) => u.email),
        allAdminDetails: allAdmins.map((u) => ({
          email: u.email,
          userId: u.userId,
          status: u.status,
          loginAllowed: u.loginAllowed,
          isDeleted: u.isDeleted,
          roleKey: u.roleKey,
          tenantId: u.tenantId || DEFAULT_TENANT,
          passwordSet: !!(u.passwordHash && u.passwordHash.length > 8),
        })),
        hasLoginUsers: hasLoginUsers(ready),
      });
    } catch (e) {
      results.push({ tenant: tid, status: "error", error: e.message });
    }
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`
Veraglo ERP — Admin Repair Tool

  npm run repair-admin -- --diagnose
  npm run repair-admin -- --email admin@company.com --password "NewPass9!" [--org default]
`);
    process.exit(0);
  }

  await db.ensureSchema();

  if (args.diagnose) {
    const results = await diagnoseAllTenants();
    console.log("\n=== Admin Repair Diagnostic ===\n");
    for (const r of results) {
      console.log(`Tenant '${r.tenant}': ${r.status}`);
      if (r.totalUsers != null) console.log(`  Total users: ${r.totalUsers}, Admins: ${r.allAdmins}, Active admins: ${r.activeAdmins}`);
      if (r.adminEmails && r.adminEmails.length) console.log(`  Active admin emails: ${r.adminEmails.join(", ")}`);
      if (r.allAdminDetails) {
        for (const u of r.allAdminDetails) {
          const flags = [u.isDeleted ? "DELETED" : u.status, u.loginAllowed === false ? "login-disabled" : "", !u.passwordSet ? "NO-PASSWORD" : ""].filter(Boolean).join(", ");
          console.log(`  - ${u.email} (${u.roleKey}) [${flags}] tenant=${u.tenantId}`);
        }
      }
      if (r.error) console.log(`  Error: ${r.error}`);
    }

    const brokenTenants = results.filter((r) => r.status === "broken");
    if (brokenTenants.length) {
      console.log("\n=== ACTION NEEDED ===");
      console.log("Some tenants have admin users that are inactive/deleted/broken.");
      console.log("Run: npm run repair-admin -- --email <email> --password '<pass>' --org default");
    }
    process.exit(0);
  }

  if (!args.email) {
    console.error("Error: --email is required");
    process.exit(1);
  }

  const tid = args.tenant || DEFAULT_TENANT;
  const diagResults = await diagnoseAllTenants();
  console.log("\n=== Pre-repair diagnostic ===");
  for (const r of diagResults) {
    console.log(`Tenant '${r.tenant}': ${r.status} (${r.activeAdmins || 0} active admins)`);
    if (r.allAdminDetails) {
      for (const u of r.allAdminDetails) {
        console.log(`  - ${u.email} status=${u.status} loginAllowed=${u.loginAllowed} deleted=${u.isDeleted} tenant=${u.tenantId}`);
      }
    }
  }

  let state = await db.getState(tid);
  if (!state) {
    console.log(`Creating empty state for tenant: ${tid}`);
    state = { _v: 11, seq: { USR: 0 }, erpUsers: [], customRoles: [], settings: { activation: { status: "Trial" } }, connectedSessions: [], revokedSessions: [], auditLog: [] };
  }
  state = ensureDeploymentReady(state);
  ensureBuiltInRoles(state);

  const existingEmail = String(args.email || "").trim().toLowerCase();
  let user = findUserByLogin(state, existingEmail);

  if (user) {
    console.log(`\nFound user: ${user.email} (${user.userId}) status=${user.status} role=${user.roleKey} deleted=${user.isDeleted}`);
    user.status = "Active";
    user.loginAllowed = true;
    user.isDeleted = false;
    user.roleKey = "admin";
    user.tenantId = tid;
    user.failedLogins = 0;
    user.name = args.name || user.name || "Administrator";
    if (args.password) {
      const salt = newPasswordSalt();
      user.passwordHash = await hashPassword(args.password, salt);
      user.passwordSalt = salt;
      user.passwordChangedAt = Date.now();
      console.log("Password reset.");
    }
    state.revokedSessions = (state.revokedSessions || []).concat({
      id: "rv-repair-" + Date.now(), sessionId: "*global*", userId: user.id,
      email: user.email, revokedAt: Date.now(), by: "repair-admin", reason: "admin-repair",
    }).slice(-500);
    state.connectedSessions = [];
    state.auditLog = (state.auditLog || []).concat({
      id: "A-repair-" + Date.now(), ts: Date.now(), actor: "system", action: "repair",
      entity: "erpUsers", refId: user.userId, summary: "Admin repair: " + user.email + " → tenant " + tid,
    }).slice(-500);
    await db.saveState(state, { tenantId: tid });
    console.log(`\n✅ Admin repaired: ${user.email} (${user.userId})`);
    console.log(`  Tenant: ${tid}`);
    console.log(`  Status: Active, Login allowed: true, Role: admin`);
    console.log(`  Sign in at: http://YOUR_SERVER:3000`);
    console.log(`  Email: ${user.email}`);
    if (args.password) console.log(`  Password: ${args.password}`);
  } else if (args.password) {
    console.log(`\nUser not found — creating new admin: ${existingEmail}`);
    const creds = await createAdminUser(state, {
      email: existingEmail,
      password: args.password,
      name: args.name || "System Administrator",
    });
    state.auditLog = (state.auditLog || []).concat({
      id: "A-repair-create-" + Date.now(), ts: Date.now(), actor: "system", action: "repair-create",
      entity: "erpUsers", refId: creds.userId, summary: "Admin created via repair: " + creds.email,
    }).slice(-500);
    await db.saveState(state, { tenantId: tid });
    console.log(`\n✅ Admin created: ${creds.email} (${creds.userId})`);
    console.log(`  Tenant: ${tid}`);
    console.log(`  Sign in at: http://YOUR_SERVER:3000`);
    console.log(`  Email: ${creds.email}`);
    console.log(`  Password: ${creds.password}`);
  } else {
    console.error(`\nUser ${existingEmail} not found in tenant ${tid}. Add --password to create them.`);
    process.exit(3);
  }
}

main().catch((e) => {
  console.error("[repair-admin]", e);
  process.exit(1);
});
