import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

const OPENAI_SAFETY_ID_DOMAIN = "botbound:";

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

/** Stable OpenAI safety identifier shared by Responses and Realtime. */
export function openAISafetyIdentifierForIdentity(identity: string): string {
  return createHash("sha256").update(`${OPENAI_SAFETY_ID_DOMAIN}${identity.trim()}`).digest("hex");
}

/**
 * Stable, privacy-preserving OpenAI safety identifier for the current user.
 * The raw internal id never crosses the provider boundary.
 */
export function currentProviderSafetyIdentifier(): string | undefined {
  const identity = providerIdentityStore.getStore()?.trim();
  if (!identity) return undefined;
  return openAISafetyIdentifierForIdentity(identity);
}
