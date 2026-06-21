/**
 * Admin Repair — single-organization ERP.
 * Finds the admin user, activates it, ensures admin role, and (optionally) resets the password.
 * Creates a fresh admin if none exists.
 *
 * Usage:
 *   cd server && npm run repair-admin -- --diagnose
 *   cd server && npm run repair-admin -- --email admin@company.com --password "NewPass9!"
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import * as db from "../db.js";
import {
  findUserByLogin,
  hasLoginUsers,
  ensureBuiltInRoles,
  ensureAdminRole,
  hashPassword,
  newPasswordSalt,
  createAdminUser,
} from "../auth-utils.js";
import { ensureDeploymentReady } from "../first-run.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

function parseArgs(argv) {
  const out = { diagnose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email" && argv[i + 1]) out.email = argv[++i];
    else if (a === "--password" && argv[i + 1]) out.password = argv[++i];
    else if (a === "--name" && argv[i + 1]) out.name = argv[++i];
    else if (a === "--org" && argv[i + 1]) i++; // accepted but ignored (single-org)
    else if (a === "--diagnose" || a === "-d") out.diagnose = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

async function loadState() {
  let state = await db.getState();
  if (!state || !state._v) {
    state = {
      _v: 11, seq: { USR: 0 }, erpUsers: [], customRoles: [],
      settings: { activation: { status: "Trial" }, security: { minPasswordLength: 8 } },
      connectedSessions: [], revokedSessions: [], auditLog: [],
      company: { id: "default", name: "Organization" },
    };
  }
  state = ensureDeploymentReady(state);
  ensureBuiltInRoles(state);
  return state;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: npm run repair-admin -- --diagnose | --email <e> --password <p>");
    process.exit(0);
  }
  await db.ensureSchema();
  const state = await loadState();
  const adminRoles = new Set(["admin", "super_admin"]);
  const users = state.erpUsers || [];
  const admins = users.filter((u) => adminRoles.has(u.roleKey));

  if (args.diagnose) {
    console.log("\n=== Admin Repair Diagnostic (single-org) ===\n");
    console.log("Storage:", db.storageMode(), "| Data:", process.env.VERAGLO_DATA_DIR || "(default)");
    console.log("Total users:", users.filter((u) => !u.isDeleted).length);
    console.log("Has valid login users:", hasLoginUsers(state));
    console.log("Admin / Super Admin accounts:", admins.length);
    for (const u of admins) {
      const flags = [u.isDeleted ? "DELETED" : u.status, u.loginAllowed === false ? "login-disabled" : "", (u.passwordHash && u.passwordHash.length > 8) ? "" : "NO-PASSWORD"].filter(Boolean).join(", ");
      console.log(`  - ${u.email} (${u.roleKey}) [${flags}]`);
    }
    if (!admins.length) console.log("  (no admin accounts — run with --email and --password to create one)");
    process.exit(0);
  }

  if (!args.email) {
    console.error("Error: --email is required (or use --diagnose)");
    process.exit(1);
  }
  const email = String(args.email).trim().toLowerCase();
  let user = findUserByLogin(state, email);

  if (user) {
    console.log(`Found user: ${user.email} (${user.userId}) status=${user.status} role=${user.roleKey} deleted=${!!user.isDeleted}`);
    user.status = "Active";
    user.loginAllowed = true;
    user.isDeleted = false;
    if (!adminRoles.has(user.roleKey)) user.roleKey = "admin";
    user.failedLogins = 0;
    user.name = args.name || user.name || "Administrator";
    if (args.password) {
      const salt = newPasswordSalt();
      user.passwordHash = await hashPassword(args.password, salt);
      user.passwordSalt = salt;
      user.passwordChangedAt = Date.now();
      console.log("Password has been reset.");
    }
    state.revokedSessions = (state.revokedSessions || []).concat({
      id: "rv-repair-" + Date.now(), sessionId: "*global*", userId: user.id,
      email: user.email, revokedAt: Date.now(), by: "repair-admin", reason: "admin-repair",
    }).slice(-500);
    state.connectedSessions = [];
    state.auditLog = (state.auditLog || []).concat({
      id: "A-repair-" + Date.now(), ts: Date.now(), actor: "system", action: "repair",
      entity: "erpUsers", refId: user.userId, summary: "Admin repaired: " + user.email,
    }).slice(-500);
    await db.saveState(state);
    console.log(`\n✅ Admin repaired: ${user.email}`);
    console.log(`   Status: Active · Login allowed · Role: ${user.roleKey}`);
    if (args.password) console.log(`   Password: ${args.password}`);
  } else if (args.password) {
    console.log(`User not found — creating new admin: ${email}`);
    ensureAdminRole(state);
    const creds = await createAdminUser(state, { email, password: args.password, name: args.name || "System Administrator" });
    state.auditLog = (state.auditLog || []).concat({
      id: "A-repair-create-" + Date.now(), ts: Date.now(), actor: "system", action: "repair-create",
      entity: "erpUsers", refId: creds.userId, summary: "Admin created via repair: " + creds.email,
    }).slice(-500);
    await db.saveState(state);
    console.log(`\n✅ Admin created: ${creds.email} (${creds.userId})`);
    console.log(`   Password: ${creds.password}`);
  } else {
    console.error(`User ${email} not found. Add --password to create the account.`);
    process.exit(3);
  }
  console.log(`\nSign in at http://YOUR_SERVER:3000 with Email + Password.`);
}

main().catch((e) => { console.error("[repair-admin]", e); process.exit(1); });
