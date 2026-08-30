const CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF = "ogenlhodmwvyacvnrsnj";
const SUPABASE_DIRECT_HOST = /^db\.([a-z0-9]{20})\.supabase\.co$/u;
const SUPABASE_POOLER_HOST = /^(?:[a-z0-9-]+\.)*pooler\.supabase\.com$/u;

export class ProductionMigrationDatabaseError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProductionMigrationDatabaseError";
  }
}

function parsePostgresUrl(rawDatabaseUrl) {
  let url;
  try {
    url = new URL(String(rawDatabaseUrl || "").trim());
  } catch {
    throw new ProductionMigrationDatabaseError(
      "production migration database must be a valid PostgreSQL URL",
    );
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new ProductionMigrationDatabaseError(
      "production migration database must use PostgreSQL",
    );
  }
  if (!url.username || !url.password) {
    throw new ProductionMigrationDatabaseError(
      "production migration database must include explicit credentials",
    );
  }
  if (Number(url.port || "5432") !== 5432) {
    throw new ProductionMigrationDatabaseError(
      "production migrations require the Supabase direct/session endpoint on port 5432",
    );
  }
  return url;
}

function projectRefFor(url) {
  const hostname = url.hostname.toLowerCase();
  const direct = SUPABASE_DIRECT_HOST.exec(hostname);
  if (direct) return direct[1];

  if (!SUPABASE_POOLER_HOST.test(hostname)) {
    throw new ProductionMigrationDatabaseError(
      "production migrations require a canonical Supabase direct or session-pooler endpoint",
    );
  }
  const username = decodeURIComponent(url.username).toLowerCase();
  const poolerIdentity = /^[^.]+\.([a-z0-9]{20})$/u.exec(username);
  if (!poolerIdentity) {
    throw new ProductionMigrationDatabaseError(
      "Supabase session-pooler username must end with the exact project ref",
    );
  }
  return poolerIdentity[1];
}

/**
 * Keep production DDL on the configured port-5432 session connection while
 * pinning it to Supabase's canonical database name. This repairs accidental
 * UI/CLI status-text contamination in the URL pathname without reading,
 * logging, or rotating the embedded credential.
 */
export function resolveProductionMigrationDatabaseUrl(rawDatabaseUrl) {
  const raw = String(rawDatabaseUrl || "").trim();
  const url = parsePostgresUrl(raw);
  if (projectRefFor(url) !== CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new ProductionMigrationDatabaseError(
      "production migration database does not identify the canonical Supabase project",
    );
  }

  const currentDatabase = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const normalizedDatabaseName = currentDatabase !== "postgres";
  if (!normalizedDatabaseName) {
    return { connectionString: raw, normalizedDatabaseName: false };
  }

  url.pathname = "/postgres";
  return { connectionString: url.toString(), normalizedDatabaseName: true };
}
