import { usePresenceSignals } from "./usePresenceSignals";

/**
 * useLivePresence — single source of truth for "how many calls are live on
 * the floor right now." Shares the SSE + polling presence hook with Call ops
 * so the sidebar pulse and floor presenter never disagree.
 */
export function useLivePresence(pollMs = 10_000): number {
  const signals = usePresenceSignals({ pollMs });
  return signals.length;
}
