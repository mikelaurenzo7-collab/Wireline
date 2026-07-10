export type DatabaseConnectionSource = "DATABASE_POOL_URL" | "POSTGRES_URL";

export type DatabaseConnectionSelection = {
  connectionString: string;
  source: DatabaseConnectionSource;
  ignoredInvalidPoolUrl: boolean;
};

type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

export function isPostgresConnectionString(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    return (
      POSTGRES_PROTOCOLS.has(url.protocol) &&
      Boolean(url.hostname) &&
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
 */
export function resolveDatabaseConnection(
  env: DatabaseEnvironment = process.env,
): DatabaseConnectionSelection {
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

  throw new Error("Database connection is not configured with a valid PostgreSQL URL.");
}
