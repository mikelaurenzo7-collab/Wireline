import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

const STRUCTURED_SAFETY_ID_DOMAIN = "botbound:structured:";

/**
 * Provider-only end-user identity. Unlike tenantStore, this context never
 * changes database or RLS behavior; workers may safely set it around provider
 * work without accidentally turning unscoped maintenance queries into tenant
 * queries.
 */
export const providerIdentityStore = new AsyncLocalStorage<string>();

/** Run provider work with an authoritative internal tenant/user identity. */
export function runWithProviderIdentity<T>(identity: string, operation: () => T): T {
  const normalized = identity.trim();
  if (!normalized) return operation();
  return providerIdentityStore.run(normalized, operation);
}

/**
 * Stable, privacy-preserving OpenAI safety identifier for the current user.
 * The raw internal id never crosses the provider boundary.
 */
export function currentProviderSafetyIdentifier(): string | undefined {
  const identity = providerIdentityStore.getStore()?.trim();
  if (!identity) return undefined;
  return createHash("sha256").update(`${STRUCTURED_SAFETY_ID_DOMAIN}${identity}`).digest("hex");
}
