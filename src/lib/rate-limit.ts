// Distributed rate limiter — uses Upstash Redis when configured, falls
// back to per-process in-memory state otherwise.
//
// In Vercel serverless every invocation is a fresh process, so the
// in-memory fallback is per-invocation only and gives near-zero
// protection. Operators should set UPSTASH_REDIS_REST_URL +
// UPSTASH_REDIS_REST_TOKEN in production for the limit to be global
// across the fleet.
//
// Algorithm: fixed window with key suffix `:{floor(now / windowMs)}`.
// One INCR + one EXPIRE per request — both are O(1) on Redis.

import { Redis } from "@upstash/redis";

let redis: Redis | null = null;
let warnedNoRedis = false;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

const memBuckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number; // ms until window resets
}

export interface RateLimiterOptions {
  /** Logical bucket name — used to scope keys (e.g. "claude", "oauth"). */
  bucket: string;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Maximum requests allowed in the window. */
  max: number;
}

/** Check + record a hit. Returns whether the caller should be allowed. */
export async function rateLimit(
  key: string,
  opts: RateLimiterOptions,
): Promise<RateLimitResult> {
  const now = Date.now();
  const window = Math.floor(now / opts.windowMs);
  const composite = `wireline:rl:${opts.bucket}:${key}:${window}`;

  const r = getRedis();
  if (r) {
    try {
      const count = (await r.incr(composite)) as number;
      if (count === 1) {
        await r.pexpire(composite, opts.windowMs);
      }
      const remaining = Math.max(0, opts.max - count);
      const resetMs = (window + 1) * opts.windowMs - now;
      return { allowed: count <= opts.max, remaining, resetMs };
    } catch (err) {
      // Fail-OPEN on Redis error — better to serve traffic than to lock
      // out everyone when the Redis quota or network is degraded.
      // eslint-disable-next-line no-console
      console.warn("[rate-limit] redis error, falling back to memory:", (err as Error).message);
    }
  } else if (!warnedNoRedis) {
    warnedNoRedis = true;
    if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
      // eslint-disable-next-line no-console
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL not set — rate limits are per-invocation only " +
          "and provide no real protection in serverless. Configure Upstash Redis for production."
      );
    }
  }

  // In-memory fallback.
  const bucket = memBuckets.get(composite);
  if (!bucket || bucket.resetAt <= now) {
    memBuckets.set(composite, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true, remaining: opts.max - 1, resetMs: opts.windowMs };
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= opts.max,
    remaining: Math.max(0, opts.max - bucket.count),
    resetMs: bucket.resetAt - now,
  };
}

/** Periodic cleanup of stale in-memory buckets — call once at boot. */
export function startMemoryCleanup(intervalMs = 5 * 60_000) {
  const id = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of memBuckets) {
      if (b.resetAt <= now) memBuckets.delete(k);
    }
  }, intervalMs);
  // Don't keep the event loop alive on shutdown.
  (id as any).unref?.();
  return id;
}

export function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}
