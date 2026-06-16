/**
 * Reset the ERP administrator account and generate new login credentials.
 * Usage: cd server && npm run db:reset-admin
 * Optional env: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import * as db from "../db.js";
import { createAdminUser, generatePassword } from "../auth-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

async function main() {
  const email = String(process.env.ADMIN_EMAIL || "admin@veraglo.com").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || generatePassword());
  const name = String(process.env.ADMIN_NAME || "System Administrator").trim();

  await db.ensureSchema();
  let state = await db.getState();
  if (!state || !state._v) {
    state = {
      _v: 11,
      seq: { USR: 0 },
      erpUsers: [],
      customRoles: [],
      locations: [{ id: "loc1", name: "Main Warehouse", locType: "Warehouse", status: "Active" }],
      settings: {
        security: { minPasswordLength: 8, maxLoginAttempts: 5, sessionTimeoutMins: 60 },
        activation: { status: "Trial", trialEndsAt: null },
      },
      connectedSessions: [],
      revokedSessions: [],
      auditLog: [],
    };
  }

  const before = (state.erpUsers || []).filter((u) => !u.isDeleted && ["admin", "super_admin"].includes(u.roleKey)).length;
  const creds = await createAdminUser(state, { email, password, name });
  state.auditLog = (state.auditLog || []).concat({
    id: `A-reset-${Date.now()}`,
    ts: Date.now(),
    actor: "system",
    action: "password-reset",
    entity: "erpUsers",
    refId: creds.userId,
    summary: `Administrator reset — new login ${creds.email}`,
  });

  await db.saveState(state);
  console.log("");
  console.log("Administrator account reset successfully.");
  console.log("Storage:", db.storageMode());
  console.log("Removed previous admin accounts:", before);
  console.log("");
  console.log("  Login ID (email):", creds.email);
  console.log("  Password:        ", creds.password);
  console.log("  User ID:         ", creds.userId);
  console.log("");
  console.log("All active sessions were revoked — sign in again at http://localhost:3000");
  console.log("");
  await db.closePool();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
