/**
 * AgentsContext — a single, shared fetch of the operator's agents.
 *
 * Two consumers need the same list: (1) the nav, which hides the "Chat"
 * surface entirely when the operator has zero agents (so an empty page
 * never takes up space), and (2) the per-agent chat page rail. Fetching
 * once here keeps them in sync and avoids duplicate /api/agents calls.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { authFetch } from "../lib/api";

export interface WorkspaceAgentSummary {
  id: string;
  name: string;
  role: string | null;
}

interface AgentsContextValue {
  agents: WorkspaceAgentSummary[];
  loading: boolean;
  hasAgents: boolean;
  refresh: () => void;
}

const AgentsContext = createContext<AgentsContextValue>({
  agents: [],
  loading: true,
  hasAgents: false,
  refresh: () => {},
});

/**
 * Fired by any flow that creates/deletes an agent (e.g. FleetSettings).
 * The provider listens and refetches so a newly added agent pops into the
 * chat rail — and the rest of the app — without a full reload.
 */
export const AGENTS_CHANGED_EVENT = "wireline:agents-changed";

export function AgentsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [agents, setAgents] = useState<WorkspaceAgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!user) {
      setAgents([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    authFetch("/api/agents")
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.agents) ? data.agents : [];
        setAgents(
          list
            .filter((a: { id?: unknown }) => typeof a?.id === "string" && a.id)
            .map((a: { id: string; name?: string; role?: string }) => ({
              id: a.id,
              name: a.name || "Untitled agent",
              role: a.role ?? null,
            })),
        );
      })
      .catch(() => {
        if (!cancelled) setAgents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, nonce]);

  // Refetch when an agent is created/deleted elsewhere, and whenever the
  // browser tab regains focus — both are cheap and keep the rail honest.
  useEffect(() => {
    if (!user) return;
    const onChanged = () => refresh();
    const onFocus = () => refresh();
    window.addEventListener(AGENTS_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(AGENTS_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, refresh]);

  // Landing on the chat surface always pulls a fresh roster so an agent
  // added moments ago on another screen is already in the rail.
  useEffect(() => {
    if (user && location.pathname.startsWith("/chat")) refresh();
  }, [location.pathname, user, refresh]);

  const value = useMemo<AgentsContextValue>(
    () => ({ agents, loading, hasAgents: agents.length > 0, refresh }),
    [agents, loading, refresh],
  );

  return <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>;
}

export function useAgents(): AgentsContextValue {
  return useContext(AgentsContext);
}
