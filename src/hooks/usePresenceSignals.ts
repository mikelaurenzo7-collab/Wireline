import { useEffect, useState } from "react";

import type { LiveSignalPresence } from "../components/LiveFloorPresence";
import { useAuth } from "../contexts/AuthContext";
import { authFetch } from "../lib/api";

type PresencePayload = { type?: string; signals?: LiveSignalPresence[] };

function normalizeSignals(body: PresencePayload | null | undefined): LiveSignalPresence[] {
  return Array.isArray(body?.signals) ? body.signals : [];
}

/**
 * Live signal_presence rows for the signed-in tenant.
 *
 * Prefers the SSE snapshot at /api/Assistants/presence/stream (real-time on
 * long-lived Node hosts). Vercel closes the stream after the first snapshot,
 * so we fall back to steady polling — same cadence Call ops used before.
 */
export function usePresenceSignals(options?: { enabled?: boolean; pollMs?: number }) {
  const { user } = useAuth();
  const enabled = options?.enabled ?? true;
  const pollMs = options?.pollMs ?? 5000;
  const [signals, setSignals] = useState<LiveSignalPresence[]>([]);

  useEffect(() => {
    if (!user || !enabled) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let sseReceived = false;

    const applyPayload = (body: PresencePayload | null | undefined) => {
      if (cancelled) return;
      setSignals(normalizeSignals(body));
    };

    const startPolling = () => {
      if (pollTimer || cancelled) return;

      const poll = () => {
        void authFetch("/api/Assistants/presence")
          .then((response) => (response.ok ? response.json() : null))
          .then((body: PresencePayload | null) => applyPayload(body))
          .catch(() => {
            /* keep last good snapshot */
          });
      };

      poll();
      pollTimer = setInterval(poll, pollMs);
    };

    const es = new EventSource("/api/Assistants/presence/stream", { withCredentials: true });

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as PresencePayload;
        if (data?.type === "presence") {
          sseReceived = true;
          applyPayload(data);
        }
      } catch {
        /* ignore malformed frames */
      }
    };

    es.onerror = () => {
      es.close();
      if (!cancelled) startPolling();
    };

    // Safety net for hosts that never open SSE (auth failure, proxy drop).
    const bootstrapTimer = window.setTimeout(() => {
      if (!cancelled && !sseReceived && !pollTimer) startPolling();
    }, 2500);

    return () => {
      cancelled = true;
      es.close();
      window.clearTimeout(bootstrapTimer);
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, [user, enabled, pollMs]);

  return signals;
}
