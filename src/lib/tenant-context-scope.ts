const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TenantDatabaseScope = { kind: "root" } | { kind: "tenant"; userId: string };

/**
 * Classify the AsyncLocalStorage tenant value before a pooled DB connection is
 * checked out.
 *
 * An absent/empty value is an intentional system scope used by signed provider
 * callbacks and signup bootstrap before a user UUID exists. A non-empty value
 * is a tenant claim and must be a UUID; treating malformed claims as root would
 * silently upgrade an upstream identity bug to the postgres owner connection.
 */
export function resolveTenantDatabaseScope(userId: string | undefined): TenantDatabaseScope {
  if (!userId) return { kind: "root" };
  if (!UUID_RE.test(userId)) throw new Error("INVALID_TENANT_CONTEXT");
  return { kind: "tenant", userId };
}
