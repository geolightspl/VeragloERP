/**
 * Import a Veraglo ERP JSON export into PostgreSQL erp_state.
 * Usage: node scripts/import-state.js /path/to/veraglo-backup.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import * as db from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/import-state.js <backup.json>");
    process.exit(1);
  }
  const raw = fs.readFileSync(path.resolve(file), "utf8");
  const data = JSON.parse(raw);
  if (!data._v) {
    console.error("Invalid file: missing _v version field");
    process.exit(1);
  }
  await db.ensureSchema();
  const saved = await db.saveState(data);
  console.log("Imported version", data._v, "→ erp_state updated_at", saved && saved.updatedAt);
  await db.closePool();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
