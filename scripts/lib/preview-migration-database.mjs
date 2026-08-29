const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/u;
const POOLER_HOST_PATTERN = /^(?:[a-z0-9-]+\.)*pooler\.supabase\.com$/u;
const SESSION_POOLER_HOST_PATTERN = /^[a-z0-9-]+\.pooler\.supabase\.com$/u;

export class PreviewMigrationDatabaseError extends Error {
  constructor(message) {
    super(message);
    this.name = "PreviewMigrationDatabaseError";
  }
}

function parsePostgresUrl(rawDatabaseUrl) {
  let url;
  try {
    url = new URL(String(rawDatabaseUrl || "").trim());
  } catch {
    throw new PreviewMigrationDatabaseError("database URL must be a valid PostgreSQL URL");
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new PreviewMigrationDatabaseError("database URL must use PostgreSQL");
  }

  return url;
}

function normalizeProjectRef(projectRef) {
  const normalized = String(projectRef || "")
    .trim()
    .toLowerCase();
  if (!PROJECT_REF_PATTERN.test(normalized)) {
    throw new PreviewMigrationDatabaseError(
      "project ref must be the exact 20-character Supabase project ref",
    );
  }
  return normalized;
}

function databaseIdentity(url) {
  const hostname = url.hostname.toLowerCase();
  const directEndpoint = /^db\.([a-z0-9]{20})\.supabase\.co$/u.exec(hostname);
  if (directEndpoint) {
    return { kind: "direct", projectRef: directEndpoint[1] };
  }

  if (!POOLER_HOST_PATTERN.test(hostname)) {
    throw new PreviewMigrationDatabaseError(
      "database must use a Supabase direct or pooler endpoint",
    );
  }

  const username = decodeURIComponent(url.username).toLowerCase();
  const poolerUsername = /^postgres\.([a-z0-9]{20})$/u.exec(username);
  if (!poolerUsername) {
    throw new PreviewMigrationDatabaseError(
      "Supabase pooler username must be postgres.<project-ref>",
    );
  }

  return { kind: "pooler", projectRef: poolerUsername[1] };
}

export function assertIsolatedPreviewDatabaseUrl({ databaseUrl, projectRef }) {
  const normalizedProjectRef = normalizeProjectRef(projectRef);
  const url = parsePostgresUrl(databaseUrl);
  const identity = databaseIdentity(url);

  if (identity.projectRef !== normalizedProjectRef) {
    throw new PreviewMigrationDatabaseError(
      "database identity does not match the isolated Preview project ref",
    );
  }

  return { identity, url };
}

/**
 * Resolve a migration-safe connection without ever requiring the transaction
 * pooler's password to leave the deployment environment. A configured 5432
 * direct/session connection is left unchanged. A 6543 Supabase transaction
 * pooler URL is converted in-memory to the exact project's session-pooler
 * identity using only a reviewed, non-secret hostname.
 */
export function resolvePreviewMigrationDatabaseUrl({ databaseUrl, projectRef, sessionPoolerHost }) {
  const normalizedProjectRef = normalizeProjectRef(projectRef);
  const { url } = assertIsolatedPreviewDatabaseUrl({
    databaseUrl,
    projectRef: normalizedProjectRef,
  });
  const port = Number(url.port || "5432");

  if (port === 5432) {
    return String(databaseUrl).trim();
  }

  if (port !== 6543) {
    throw new PreviewMigrationDatabaseError(
      "migrations require a Supabase direct/session connection on port 5432 or a transaction pooler on port 6543",
    );
  }

  const normalizedSessionPoolerHost = String(sessionPoolerHost || "")
    .trim()
    .toLowerCase();
  if (!SESSION_POOLER_HOST_PATTERN.test(normalizedSessionPoolerHost)) {
    throw new PreviewMigrationDatabaseError(
      "transaction-pooler migration requires a reviewed Supabase session-pooler hostname",
    );
  }

  url.hostname = normalizedSessionPoolerHost;
  url.port = "5432";
  url.username = `postgres.${normalizedProjectRef}`;
  url.searchParams.delete("pgbouncer");

  return url.toString();
}
