export type DatabaseConnectionSource = "DATABASE_POOL_URL" | "POSTGRES_URL";

export type DatabaseConnectionSelection = {
  connectionString: string;
  source: DatabaseConnectionSource;
  ignoredInvalidPoolUrl: boolean;
};

type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function isLikelyResolvableDatabaseHost(hostname: string | null | undefined): boolean {
  const host = hostname?.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (!host) return false;
  if (LOCAL_DATABASE_HOSTS.has(host)) return true;
  if (IPV4_RE.test(host)) return true;
  if (host.includes(":")) return true; // IPv6 literal.
  return host.includes(".");
}

export function isPostgresConnectionString(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    return (
      POSTGRES_PROTOCOLS.has(url.protocol) &&
      Boolean(url.hostname) &&
      isLikelyResolvableDatabaseHost(url.hostname) &&
      Boolean(url.pathname && url.pathname !== "/")
    );
  } catch {
    return false;
  }
}

/**
 * Prefer the transaction-mode pooler when it is valid, but never let a
 * malformed optional override take the database offline. POSTGRES_URL is the
 * required, validated recovery path.
 *
 * The host check intentionally rejects single-label hostnames such as `base`.
 * Vercel runtime logs showed `getaddrinfo ENOTFOUND base`, which is syntactically
 * parseable as part of a postgres URL but not a deployable production database
 * endpoint. Local development can still use localhost or an IP literal.
 */
export function tryResolveDatabaseConnection(
  env: DatabaseEnvironment = process.env,
): DatabaseConnectionSelection | null {
  const poolUrl = env.DATABASE_POOL_URL?.trim();
  if (isPostgresConnectionString(poolUrl)) {
    return {
      connectionString: poolUrl!,
      source: "DATABASE_POOL_URL",
      ignoredInvalidPoolUrl: false,
    };
  }

  const postgresUrl = env.POSTGRES_URL?.trim();
  if (isPostgresConnectionString(postgresUrl)) {
    return {
      connectionString: postgresUrl!,
      source: "POSTGRES_URL",
      ignoredInvalidPoolUrl: Boolean(poolUrl),
    };
  }

  return null;
}

/**
 * Strict resolver for paths that cannot operate without a database.
 * Import-time server wiring uses the optional selector above so deployments
 * with deliberately isolated credentials can boot and fail at request time.
 */
export function resolveDatabaseConnection(
  env: DatabaseEnvironment = process.env,
): DatabaseConnectionSelection {
  const selected = tryResolveDatabaseConnection(env);
  if (selected) return selected;

  throw new Error("Database connection is not configured with a valid PostgreSQL URL.");
}
