/**
 * node-pg options for local Postgres vs AWS RDS (SSL required on RDS).
 */
export function pgSslEnabled(connectionString = process.env.DATABASE_URL || "") {
  if (process.env.PG_SSL === "0" || process.env.PG_SSL === "false") return false;
  if (process.env.PG_SSL === "1" || process.env.PG_SSL === "true") return true;
  if (/sslmode=(require|verify-ca|verify-full)/i.test(connectionString)) return true;
  if (/\.rds\.amazonaws\.com/i.test(connectionString)) return true;
  return false;
}

export function createPgPoolOptions(overrides = {}) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const opts = {
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 10),
    ...overrides,
  };

  if (pgSslEnabled(connectionString)) {
    opts.ssl = {
      rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED === "1",
    };
  }

  return opts;
}
