import { Redis } from "@upstash/redis";

const KEY_PREFIX = "wireline:twilio:usage-alert:";
const KEY_TTL_SECONDS = 14 * 24 * 60 * 60;

let redis: Redis | null = null;
const developmentClaims = new Set<string>();

export type UsageAlertClaim = "claimed" | "duplicate" | "unavailable";

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

/**
 * Twilio documents that Usage Trigger callbacks can be delivered more than
 * once. Claim the callback in the shared Redis control plane before alerting.
 * Production deliberately refuses to acknowledge an alert when the durable
 * idempotency store is unavailable so Twilio can retry it.
 */
export async function claimTwilioUsageAlert(idempotencyToken: string): Promise<UsageAlertClaim> {
  const token = idempotencyToken.trim();
  if (!token || token.length > 256) return "unavailable";

  const store = getRedis();
  if (store) {
    try {
      const result = await store.set(`${KEY_PREFIX}${token}`, Date.now(), {
        nx: true,
        ex: KEY_TTL_SECONDS,
      });
      return result === "OK" ? "claimed" : "duplicate";
    } catch {
      return "unavailable";
    }
  }

  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    return "unavailable";
  }
  if (developmentClaims.has(token)) return "duplicate";
  developmentClaims.add(token);
  return "claimed";
}

export function resetTwilioUsageAlertClaimsForTests(): void {
  developmentClaims.clear();
  redis = null;
}
