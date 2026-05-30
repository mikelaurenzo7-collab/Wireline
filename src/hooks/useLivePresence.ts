import { useEffect, useState } from "react";
import { authFetch } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

/**
 * useLivePresence — single source of truth for "how many calls are live on
 * the floor right now." Polls /api/fleet/presence on a steady cadence and
 * returns the live count. Used by both the Aurora Rail foot-pulse and the
 * desktop context-bar mission-control pulse so the two never disagree and
 * we never double-instrument the same endpoint with divergent intervals.
 *
 * Non-critical by design: a transient fetch failure leaves the last good
 * count in place rather than flashing the UI back to zero.
 */
export function useLivePresence(intervalMs = 10_000): number {
  const { user } = useAuth();
  const [liveCalls, setLiveCalls] = useState<number>(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchLive = async () => {
      try {
        const r = await authFetch("/api/fleet/presence");
        if (!r.ok || cancelled) return;
        const d = (await r.json()) as { signals?: unknown[] };
        if (!cancelled) setLiveCalls(Array.isArray(d.signals) ? d.signals.length : 0);
      } catch {
        /* non-critical — a stale count is preferable to a flicker to zero */
      }
    };
    fetchLive();
    const id = setInterval(fetchLive, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user, intervalMs]);

  return liveCalls;
}
