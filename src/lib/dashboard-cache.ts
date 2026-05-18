/**
 * Dashboard Stats Cache
 * ---------------------------------------------------------------------------
 * In-memory TTL cache for dashboard statistics. Dashboard data changes
 * frequently (new calls, appointments) but doesn't need real-time precision.
 *
 * Cache Strategy:
 * - TTL: 60 seconds — short enough for fresh data, long enough to prevent
 *        DB overload from repeated dashboard refreshes
 * - Per-user keys — each user sees only their own cached data
 * - Manual invalidation — callers can clear cache when they know data changed
 * - Max entries: 500 — prevents OOM in multi-tenant deployments
 *
 * Performance Impact:
 * - Reduces dashboard load time from ~200-500ms to ~5-10ms (cache hit)
 * - Reduces DB query load for frequently accessed dashboards
 * - Graceful degradation — cache miss just hits DB as before
 */

export const DASHBOARD_TTL_MS = 60 * 1000; // 60 seconds
const MAX_CACHE_ENTRIES = 500;

interface CacheEntry {
  ts: number;
  data: DashboardCacheData;
}

export interface DashboardCacheData {
  totalAppointments: number;
  totalLeads: number;
  totalCalls: number;
  totalMinutes: number;
  totalCost: string;
  inboundCount: number;
  outboundCount: number;
  conversionRate: string | number;
  avgLeadScore: number;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  week_delta: {
    calls_pct: number | null;
    cost_pct: number | null;
    score_pct: number | null;
  };
  hotLeads: Array<{
    id: string;
    type: "call" | "email";
    contact: string | null;
    score: number;
    intent: string | null;
    summary: string | null;
    date: string;
  }>;
  chartData: Array<{ name: string; signals: number; leads: number }>;
  unitEconomics: {
    costPerMinute: string;
    costPerLead: string;
    efficiencyScore: number;
  };
  agents: Array<{ id: string; name: string | null; channel: string | null; role: string | null }>;
  recentLogs: Array<Record<string, unknown>>;
}

// Track access order for LRU eviction
const accessOrder: string[] = [];
const dashboardCache = new Map<string, CacheEntry>();

/**
 * Build cache key for a user's dashboard
 */
export function buildDashboardKey(userId: string): string {
  return `dashboard:${userId}`;
}

/**
 * Evict least-recently-used entries when cache exceeds max size
 */
function evictLRUIfNeeded(): void {
  while (dashboardCache.size >= MAX_CACHE_ENTRIES && accessOrder.length > 0) {
    const oldestKey = accessOrder.shift();
    if (oldestKey) {
      dashboardCache.delete(oldestKey);
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

/**
 * Get cached dashboard stats for a user
 * Returns null if not cached or expired
 */
export function getCachedDashboard(userId: string): DashboardCacheData | null {
  const key = buildDashboardKey(userId);
  const entry = dashboardCache.get(key);

  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.ts > DASHBOARD_TTL_MS) {
    dashboardCache.delete(key);
    const idx = accessOrder.indexOf(key);
    if (idx !== -1) accessOrder.splice(idx, 1);
    return null;
  }

  // Update LRU order on access
  touchKey(key);
  return entry.data;
}

/**
 * Cache dashboard stats for a user
 */
export function setCachedDashboard(userId: string, data: DashboardCacheData): void {
  const key = buildDashboardKey(userId);

  // Evict oldest entries if at capacity
  evictLRUIfNeeded();

  dashboardCache.set(key, { ts: Date.now(), data });
  touchKey(key);
}

/**
 * Manually invalidate a user's dashboard cache
 * Call this when you know dashboard data has changed (e.g., new call, new lead)
 */
export function invalidateDashboard(userId: string): void {
  const key = buildDashboardKey(userId);
  dashboardCache.delete(key);
  const idx = accessOrder.indexOf(key);
  if (idx !== -1) accessOrder.splice(idx, 1);
}

/**
 * Invalidate all dashboard caches (use sparingly — e.g., during maintenance)
 */
export function invalidateAllDashboards(): void {
  dashboardCache.clear();
  accessOrder.length = 0;
}

/**
 * Get cache statistics for monitoring
 */
export function getDashboardCacheStats(): {
  size: number;
  maxSize: number;
  ttlMs: number;
  hitRate?: number;
} {
  return {
    size: dashboardCache.size,
    maxSize: MAX_CACHE_ENTRIES,
    ttlMs: DASHBOARD_TTL_MS,
  };
}

// Periodic eviction — removes expired entries and enforces size limit
const evictId = setInterval(() => {
  const cutoff = Date.now() - DASHBOARD_TTL_MS;
  const expiredKeys: string[] = [];

  for (const [k, v] of dashboardCache) {
    if (v.ts < cutoff) {
      expiredKeys.push(k);
      dashboardCache.delete(k);
    }
  }

  // Remove expired keys from access order
  for (const k of expiredKeys) {
    const idx = accessOrder.indexOf(k);
    if (idx !== -1) accessOrder.splice(idx, 1);
  }

  // Ensure size limit is enforced
  evictLRUIfNeeded();
}, DASHBOARD_TTL_MS);

// Allow the process to exit cleanly without waiting for this interval
(evictId as any).unref?.();
