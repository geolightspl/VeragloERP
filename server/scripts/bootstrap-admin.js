/**
 * One-time secured Super Admin bootstrap (production-safe).
 * Usage: cd server && npm run bootstrap-admin -- --email admin@company.com --password "securepassword"
 * Env: BOOTSTRAP_ENABLED=1, BOOTSTRAP_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, VERAGLO_PRODUCTION=1
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import * as db from "../db.js";
import {
  bootstrapEnabledEnv,
  expectedBootstrapSecret,
  isProductionMode,
} from "../bootstrap-status.js";
import { runSystemBootstrap } from "../system-bootstrap.js";
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
    else if (a === "--org" && argv[i + 1]) out.organizationName = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function usage() {
  console.log(`
Veraglo ERP — one-time Super Admin bootstrap

  npm run bootstrap-admin -- --email admin@company.com --password "YourSecurePass9"

Required env:
  BOOTSTRAP_ENABLED=1
  BOOTSTRAP_SECRET=<long-random-secret>

Optional env:
  VERAGLO_PRODUCTION=1
  ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME
  VERAGLO_DATA_DIR (file storage) or DATABASE_URL (PostgreSQL)
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  if (!bootstrapEnabledEnv()) {
    console.error("BOOTSTRAP_ENABLED is not set. Export BOOTSTRAP_ENABLED=1 for one-time setup.");
    process.exit(1);
  }
  if (!expectedBootstrapSecret()) {
    console.error("BOOTSTRAP_SECRET is not configured.");
    process.exit(1);
  }

  const email = String(args.email || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(args.password || process.env.ADMIN_PASSWORD || "");
  const name = String(args.name || process.env.ADMIN_NAME || "Super Administrator").trim();
  const organizationName = String(args.organizationName || process.env.ORGANIZATION_NAME || "Organization").trim();

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

  const result = await runSystemBootstrap({
    ...helpers,
    tenantId: DEFAULT_TENANT,
    email,
    password,
    name,
    organizationName,
    completedBy: "cli",
  });

  console.log("");
  console.log("Bootstrap completed — lock is permanent.");
  console.log("Environment:", isProductionMode() ? "production" : "development");
  console.log("Storage:", db.storageMode());
  console.log("");
  console.log("  Organization:", organizationName);
  console.log("  Super Admin:", result.creds.email);
  console.log("  User ID:", result.creds.userId);
  console.log("");
  console.log("Bootstrap is locked. New users must be created from Admin → Users.");
  console.log("Sign in at http://localhost:" + (process.env.PORT || 3000));
  console.log("");
  await db.closePool();
}

main().catch((e) => {
  console.error("Bootstrap failed:", e.message || e);
  process.exit(1);
});
