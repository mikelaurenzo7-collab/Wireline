import { invalidateNavCounts } from "./nav-counts-cache";

/**
 * Bust the `/api/nav-counts` TTL cache after writes that change sidebar badges.
 */
export function touchNavCounts(userId: string | null | undefined): void {
  if (!userId) return;
  invalidateNavCounts(userId);
}
