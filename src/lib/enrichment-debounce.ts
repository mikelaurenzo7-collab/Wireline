/**
 * Debounce proactive_lead_enrichment jobs — at most once per caller per 24h.
 */

import { Redis } from "@upstash/redis";
import { log } from "./server-context";

const DEBOUNCE_TTL_SECONDS = 24 * 60 * 60;
const KEY_PREFIX = "wireline:enrich-debounce:";

const memorySeen = new Map<string, number>();

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

function normalizeKey(userId: string, customerNumber: string): string {
  const digits = customerNumber.replace(/\D/g, "");
  return `${KEY_PREFIX}${userId}:${digits || customerNumber}`;
}

/**
 * Returns true if enrichment should be enqueued (not seen in the last 24h).
 * Marks the key when returning true so concurrent webhooks dedupe.
 */
export async function claimLeadEnrichmentSlot(
  userId: string,
  customerNumber: string,
): Promise<boolean> {
  const key = normalizeKey(userId, customerNumber);

  const r = getRedis();
  if (r) {
    try {
      const set = await r.set(key, "1", { nx: true, ex: DEBOUNCE_TTL_SECONDS });
      return set === "OK";
    } catch (err) {
      log.warn("Enrichment debounce Redis failed, allowing enqueue", {
        error: (err as Error).message,
      });
    }
  }

  const now = Date.now();
  const expiresAt = memorySeen.get(key);
  if (expiresAt && expiresAt > now) return false;
  memorySeen.set(key, now + DEBOUNCE_TTL_SECONDS * 1000);
  if (memorySeen.size > 2000) {
    const oldest = memorySeen.keys().next().value;
    if (oldest) memorySeen.delete(oldest);
  }
  return true;
}
