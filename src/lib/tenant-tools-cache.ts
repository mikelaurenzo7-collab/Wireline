/**
 * Short-TTL cache for tenant tool definitions resolved at assistant-request time.
 * buildRoleToolDefsForTenant hits CRM connection rows on every inbound call connect;
 * caching cuts repeated DB reads for the same tenant within a call burst.
 */

import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import { log } from "./server-context";

const CACHE_TTL_SECONDS = 120;
// v2 requires explicit recipient confirmation in the customer-email tool schema.
const CACHE_KEY_PREFIX = "wireline:tenant-tools:v2:";

const memoryCache = new Map<string, { data: object[]; expiresAt: number }>();

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

function buildCacheKey(
  userId: string,
  role: string,
  enabledTools: unknown,
  aiTier: string | null | undefined,
  tenantFlags: { twilioMessaging?: boolean; twilioLookup?: boolean } | undefined,
): string {
  const sig = createHash("sha256")
    .update(
      JSON.stringify({
        role,
        enabledTools: enabledTools ?? null,
        aiTier: aiTier ?? null,
        twilioMessaging: !!tenantFlags?.twilioMessaging,
        twilioLookup: !!tenantFlags?.twilioLookup,
      }),
    )
    .digest("hex")
    .slice(0, 16);
  return `${CACHE_KEY_PREFIX}${userId}:${sig}`;
}

export async function getCachedTenantToolDefs(
  userId: string,
  role: string,
  enabledTools: unknown,
  aiTier: string | null | undefined,
  tenantFlags: { twilioMessaging?: boolean; twilioLookup?: boolean } | undefined,
): Promise<object[] | null> {
  const cacheKey = buildCacheKey(userId, role, enabledTools, aiTier, tenantFlags);

  const r = getRedis();
  if (r) {
    try {
      const cached = await r.get<object[]>(cacheKey);
      if (cached) return cached;
    } catch (err) {
      log.warn("Tenant tools cache Redis read failed", { error: (err as Error).message });
    }
  }

  const entry = memoryCache.get(cacheKey);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  if (entry) memoryCache.delete(cacheKey);
  return null;
}

export async function setCachedTenantToolDefs(
  userId: string,
  role: string,
  enabledTools: unknown,
  aiTier: string | null | undefined,
  tenantFlags: { twilioMessaging?: boolean; twilioLookup?: boolean } | undefined,
  tools: object[],
): Promise<void> {
  const cacheKey = buildCacheKey(userId, role, enabledTools, aiTier, tenantFlags);

  const r = getRedis();
  if (r) {
    try {
      await r.set(cacheKey, tools, { ex: CACHE_TTL_SECONDS });
      return;
    } catch (err) {
      log.warn("Tenant tools cache Redis write failed", { error: (err as Error).message });
    }
  }

  memoryCache.set(cacheKey, {
    data: tools,
    expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000,
  });
  if (memoryCache.size > 500) {
    const oldest = memoryCache.keys().next().value;
    if (oldest) memoryCache.delete(oldest);
  }
}
