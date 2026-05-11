/**
 * src/lib/insights-cache.ts
 *
 * Tiny in-memory TTL cache for the Claude-powered insights endpoints.
 * Extracted from server.ts so extracted route files can use it without
 * creating a circular import back to the monolith.
 *
 * Key schema: "<endpoint>:<userId>"  (e.g. "topics:abc-123")
 * TTL: 1 hour — plenty for data that only changes when calls land.
 */

const insightCache = new Map<string, { ts: number; data: any }>();
export const INSIGHT_TTL_MS = 60 * 60 * 1000;

export function cachedInsight(key: string): any | null {
  const entry = insightCache.get(key);
  return entry && Date.now() - entry.ts < INSIGHT_TTL_MS ? entry.data : null;
}

export function setCachedInsight(key: string, data: any): void {
  insightCache.set(key, { ts: Date.now(), data });
}

// Periodic eviction — prevents unbounded memory growth in long-lived
// processes (local dev, Railway, Render). Not needed in Vercel serverless
// but harmless.
const evictId = setInterval(() => {
  const cutoff = Date.now() - INSIGHT_TTL_MS;
  for (const [k, v] of insightCache) {
    if (v.ts < cutoff) insightCache.delete(k);
  }
}, INSIGHT_TTL_MS);
// Allow the process to exit cleanly without waiting for this interval.
(evictId as any).unref?.();
