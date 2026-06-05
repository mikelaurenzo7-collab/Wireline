/**
 * Nav badge counts cache — lightweight TTL cache for `/api/nav-counts`.
 * Sidebar polls this endpoint frequently; 30s TTL cuts repeated COUNT(*) load.
 */

export const NAV_COUNTS_TTL_MS = 30 * 1000;
const MAX_CACHE_ENTRIES = 500;

export type NavCounts = Record<string, number>;

interface CacheEntry {
  ts: number;
  data: NavCounts;
}

const cache = new Map<string, CacheEntry>();

function evictOldestIfNeeded(): void {
  if (cache.size < MAX_CACHE_ENTRIES) return;
  const oldestKey = cache.keys().next().value;
  if (oldestKey) cache.delete(oldestKey);
}

export function getCachedNavCounts(userId: string): NavCounts | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.ts > NAV_COUNTS_TTL_MS) {
    cache.delete(userId);
    return null;
  }
  return entry.data;
}

export function setCachedNavCounts(userId: string, data: NavCounts): void {
  evictOldestIfNeeded();
  cache.set(userId, { ts: Date.now(), data });
}

export function invalidateNavCounts(userId: string): void {
  cache.delete(userId);
}
