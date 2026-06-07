import type { PoolConfig } from "pg";

/**
 * Resolve the correct SSL configuration for a `pg` Pool/Client.
 *
 * Managed Postgres providers (Supabase's pooler, Neon, RDS, etc.) require TLS
 * but present certificates that are not in Node's default CA bundle — Supabase's
 * transaction pooler in particular uses a self-signed cert. Connecting with no
 * SSL config is rejected by the server with `ECONNRESET`, while strict
 * verification fails with `SELF_SIGNED_CERT_IN_CHAIN`. The accepted setup is to
 * negotiate TLS with `rejectUnauthorized: false`.
 *
 * Local development databases (localhost / 127.0.0.1) typically run without TLS,
 * so SSL is disabled for them to avoid handshake failures.
 *
 * `PGSSLMODE=disable` forces SSL off for any host (useful for self-hosted
 * Postgres without TLS).
 */
export function resolvePgSsl(connectionString = process.env.POSTGRES_URL ?? ""): PoolConfig["ssl"] {
  if (process.env.PGSSLMODE === "disable") return false;

  const isLocal = /(?:@|\/\/)(?:localhost|127\.0\.0\.1|::1)\b/.test(connectionString);
  if (isLocal) return false;

  return { rejectUnauthorized: false };
}
