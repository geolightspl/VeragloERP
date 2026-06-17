/**
 * Diagnose a user's login eligibility against server data (no password required).
 * Usage: cd server && node scripts/check-user-login.js geolightspl@gmail.com
 * Optional: --tenant default --password "YourPass" to verify password hash
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import * as db from "../db.js";
import {
  findUserByLogin,
  userLoginDiagnostic,
  validateLoginCredentials,
  ensureBuiltInRoles,
} from "../auth-utils.js";
import { ensureDeploymentReady } from "../first-run.js";
import { DEFAULT_TENANT } from "../tenant.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

function parseArgs(argv) {
  const out = { tenant: DEFAULT_TENANT };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tenant" && argv[i + 1]) out.tenant = argv[++i];
    else if (a === "--password" && argv[i + 1]) out.password = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
    else if (!a.startsWith("-")) positional.push(a);
  }
  out.email = positional[0] || "";
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.email) {
    console.log("Usage: node scripts/check-user-login.js <email> [--tenant default] [--password \"pass\"]");
    process.exit(args.help ? 0 : 1);
  }
  await db.ensureSchema();
  const tenant = args.tenant || DEFAULT_TENANT;
  let state = await db.getState(tenant);
  if (!state) {
    console.error("No state for tenant:", tenant);
    process.exit(2);
  }
  state = ensureDeploymentReady(state);
  ensureBuiltInRoles(state);
  const user = findUserByLogin(state, args.email);
  const diag = userLoginDiagnostic(state, args.email, tenant);
  console.log(JSON.stringify({
    storage: db.storageMode(),
    dataDir: process.env.VERAGLO_DATA_DIR || null,
    tenant,
    diagnostic: diag,
    user: user ? {
      id: user.id,
      userId: user.userId,
      email: user.email,
      status: user.status,
      loginAllowed: user.loginAllowed,
      roleKey: user.roleKey,
      tenantId: user.tenantId || "default",
      failedLogins: user.failedLogins || 0,
      hasPassword: !!(user.passwordHash && user.passwordHash.length > 8),
    } : null,
  }, null, 2));
  if (args.password) {
    const result = await validateLoginCredentials(state, args.email, args.password, tenant);
    console.log("passwordCheck:", result.ok ? "VALID" : result.message);
    process.exit(result.ok ? 0 : 3);
  }
  process.exit(diag.ok ? 0 : 4);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
