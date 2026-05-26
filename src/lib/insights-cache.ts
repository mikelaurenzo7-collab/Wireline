/* eslint-disable @typescript-eslint/no-explicit-any -- audit metadata and aggregate stats are stored as Postgres jsonb. */
/**
 * src/lib/insights-cache.ts
 *
 * In-memory TTL + LRU cache for the Claude-powered insights endpoints.
 * Extracted from server.ts so extracted route files can use it without
 * creating a circular import back to the monolith.
 *
 * Key schema: "<endpoint>:<userId>"  (e.g. "topics:abc-123")
 * TTL: 1 hour — plenty for data that only changes when calls land.
 * Max entries: 1000 — prevents OOM in long-lived processes.
 */

export const INSIGHT_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 1000;

// Track access order for LRU eviction
const accessOrder: string[] = [];
const insightCache = new Map<string, { ts: number; data: any }>();

/**
 * Evict least-recently-used entries when cache exceeds max size
 */
function evictLRUIfNeeded(): void {
  while (insightCache.size >= MAX_CACHE_ENTRIES && accessOrder.length > 0) {
    const oldestKey = accessOrder.shift();
    if (oldestKey) {
      insightCache.delete(oldestKey);
    }
  }
}

/**
 * Update access order for LRU tracking
 */
function touchKey(key: string): void {
  const idx = accessOrder.indexOf(key);
  if (idx !== -1) {
    accessOrder.splice(idx, 1);
  }
  accessOrder.push(key);
}

export function cachedInsight(key: string): any | null {
  const entry = insightCache.get(key);
  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.ts > INSIGHT_TTL_MS) {
    insightCache.delete(key);
    const idx = accessOrder.indexOf(key);
    if (idx !== -1) accessOrder.splice(idx, 1);
    return null;
  }

  // Update LRU order on access
  touchKey(key);
  return entry.data;
}

export function setCachedInsight(key: string, data: any): void {
  // Evict oldest entries if at capacity
  evictLRUIfNeeded();

  insightCache.set(key, { ts: Date.now(), data });
  touchKey(key);
}

// Periodic eviction — removes expired entries and enforces size limit
const evictId = setInterval(() => {
  const cutoff = Date.now() - INSIGHT_TTL_MS;
  const expiredKeys: string[] = [];

  for (const [k, v] of insightCache) {
    if (v.ts < cutoff) {
      expiredKeys.push(k);
      insightCache.delete(k);
    }
  }

  // Remove expired keys from access order
  for (const k of expiredKeys) {
    const idx = accessOrder.indexOf(k);
    if (idx !== -1) accessOrder.splice(idx, 1);
  }

  // Ensure size limit is enforced
  evictLRUIfNeeded();
}, INSIGHT_TTL_MS);
// Allow the process to exit cleanly without waiting for this interval.
(evictId as any).unref?.();
