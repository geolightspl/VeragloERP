/**
 * Secured Super Admin recovery — does not reopen bootstrap.
 * Usage: cd server && npm run recover-admin -- --email admin@company.com --password "newpassword"
 * Env: RECOVERY_SECRET (or BOOTSTRAP_SECRET), ADMIN_EMAIL, ADMIN_PASSWORD
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import * as db from "../db.js";
import { expectedRecoverySecret } from "../bootstrap-status.js";
import { runAdminRecovery } from "../system-bootstrap.js";
import { DEFAULT_TENANT } from "../tenant.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email" && argv[i + 1]) out.email = argv[++i];
    else if (a === "--password" && argv[i + 1]) out.password = argv[++i];
    else if (a === "--name" && argv[i + 1]) out.name = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function usage() {
  console.log(`
Veraglo ERP — secured Super Admin recovery (bootstrap stays locked)

  npm run recover-admin -- --email admin@company.com --password "NewSecurePass9"

Required env:
  RECOVERY_SECRET=<long-random-secret>
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  if (!expectedRecoverySecret()) {
    console.error("RECOVERY_SECRET (or BOOTSTRAP_SECRET) is not configured.");
    process.exit(1);
  }

  const email = String(args.email || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(args.password || process.env.ADMIN_PASSWORD || "");
  const name = String(args.name || process.env.ADMIN_NAME || "Super Administrator").trim();

  if (!email || !email.includes("@")) {
    console.error("Provide --email or ADMIN_EMAIL.");
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error("Provide --password or ADMIN_PASSWORD (minimum 8 characters).");
    process.exit(1);
  }

  await db.ensureSchema();
  const helpers = {
    queryFn: db.query,
    getState: (tenantId) => db.getState(tenantId),
    saveState: (state, tenantId) => db.saveState(state, { tenantId }),
  };

  const result = await runAdminRecovery({
    ...helpers,
    tenantId: DEFAULT_TENANT,
    email,
    password,
    name,
    completedBy: "recovery-cli",
  });

  console.log("");
  console.log("Admin recovery completed (bootstrap remains locked).");
  console.log("Storage:", db.storageMode());
  console.log("  Super Admin:", result.creds.email);
  console.log("  User ID:", result.creds.userId);
  console.log("");
  await db.closePool();
}

main().catch((e) => {
  console.error("Recovery failed:", e.message || e);
  process.exit(1);
});
