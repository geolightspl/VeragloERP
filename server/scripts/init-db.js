/**
 * Apply server/schema.sql to PostgreSQL (idempotent).
 * Usage: cd server && npm run db:init
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import dotenv from "dotenv";
import { createPgPoolOptions } from "../pg-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL in server/.env (see .env.example)");
  process.exit(1);
}

const pool = new pg.Pool(createPgPoolOptions());

async function main() {
  const schemaPath = path.join(__dirname, "../schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  const { rows } = await pool.query(
    "SELECT current_database() AS db, (SELECT COUNT(*) FROM erp_state) AS state_rows"
  );
  console.log("Schema OK — database:", rows[0].db, "· erp_state rows:", rows[0].state_rows);
  await pool.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
