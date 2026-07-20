/**
 * AgentsContext — a single, shared fetch of the operator's agents.
 *
 * Two consumers need the same list: (1) the nav, which hides the "Chat"
 * surface entirely when the operator has zero agents (so an empty page
 * never takes up space), and (2) the per-agent chat page rail. Fetching
 * once here keeps them in sync and avoids duplicate /api/agents calls.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  degraded: boolean;
  hasAgents: boolean;
  refresh: () => void;
}

const AgentsContext = createContext<AgentsContextValue>({
  agents: [],
  loading: true,
  degraded: false,
  hasAgents: false,
  refresh: () => {},
});

/**
 * Fired by any flow that creates/deletes an agent (e.g. FleetSettings).
 * The provider listens and refetches so a newly added agent pops into the
 * chat rail — and the rest of the app — without a full reload.
 */
export const AGENTS_CHANGED_EVENT = "wireline:agents-changed";

/** Hydrate roster from Director fleet when /api/agents is temporarily empty. */
export const AGENTS_HYDRATE_EVENT = "wireline:agents-hydrate";

function parseAgentsPayload(data: unknown): WorkspaceAgentSummary[] {
  const list = Array.isArray((data as { agents?: unknown[] })?.agents)
    ? (data as { agents: unknown[] }).agents
    : [];
  return list
    .filter(
      (a: unknown) => typeof (a as { id?: unknown })?.id === "string" && (a as { id: string }).id,
    )
    .map((a: unknown) => {
      const typed = a as { id: string; name?: string; role?: string };
      return {
        id: typed.id,
        name: typed.name || "Untitled agent",
        role: typed.role ?? null,
      };
    });
}

function parseFleetPayload(fleet: unknown): WorkspaceAgentSummary[] {
  if (!Array.isArray(fleet)) return [];
  return fleet
    .filter((a: { id?: unknown }) => typeof a?.id === "string" && a.id)
    .map((a: { id: string; name?: string | null; role?: string | null }) => ({
      id: a.id,
      name: a.name || "Untitled agent",
      role: a.role ?? null,
    }));
}

async function fetchAgentsWithRetry(attempts = 2): Promise<{
  agents: WorkspaceAgentSummary[];
  degraded: boolean;
}> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await authFetch("/api/agents");
      const body = r.ok ? await r.json().catch(() => null) : await r.json().catch(() => null);
      if (r.ok && body) {
        return {
          agents: parseAgentsPayload(body),
          degraded: body.degraded === true,
        };
      }
      if (body && (r.status === 503 || body.degraded === true)) {
        return {
          agents: parseAgentsPayload(body),
          degraded: true,
        };
      }
      lastError = new Error(`HTTP ${r.status}`);
    } catch (e) {
      lastError = e;
    }
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 400 * (i + 1)));
    }
  }
  throw lastError;
}

/** Push fleet rows into AgentsContext when the agents API is empty. */
export function hydrateAgentsFromFleet(fleet: WorkspaceAgentSummary[]): void {
  if (typeof window === "undefined" || fleet.length === 0) return;
  window.dispatchEvent(new CustomEvent(AGENTS_HYDRATE_EVENT, { detail: fleet }));
}

export function AgentsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [agents, setAgents] = useState<WorkspaceAgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [nonce, setNonce] = useState(0);
  const hasLoadedOnceRef = useRef(false);
  const bootstrapRanRef = useRef(false);
  const bootstrapAttemptsRef = useRef(0);
  const focusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const runBootstrap = useCallback(() => {
    void authFetch("/api/auth/bootstrap")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.founderSeeded) refresh();
      })
      .catch(() => {
        if (bootstrapAttemptsRef.current < 2) {
          bootstrapAttemptsRef.current += 1;
          window.setTimeout(runBootstrap, 2000);
        }
      });
  }, [refresh]);

  useEffect(() => {
    if (!user) {
      setAgents([]);
      setDegraded(false);
      setLoading(false);
      hasLoadedOnceRef.current = false;
      bootstrapRanRef.current = false;
      bootstrapAttemptsRef.current = 0;
      return;
    }

    if (!bootstrapRanRef.current) {
      bootstrapRanRef.current = true;
      runBootstrap();
    }

    let cancelled = false;
    const isBackgroundRefresh = hasLoadedOnceRef.current;
    if (!isBackgroundRefresh) setLoading(true);

    fetchAgentsWithRetry()
      .then(({ agents: list, degraded: fetchDegraded }) => {
        if (cancelled) return;
        setAgents(list);
        setDegraded(fetchDegraded);
        hasLoadedOnceRef.current = true;
      })
      .catch(() => {
        if (cancelled) return;
        setAgents((prev) => (prev.length > 0 ? prev : []));
        setDegraded(true);
        hasLoadedOnceRef.current = true;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, nonce, refresh, runBootstrap]);

  useEffect(() => {
    if (!user) return;
    const onChanged = () => refresh();
    const onFocus = () => {
      if (focusDebounceRef.current) clearTimeout(focusDebounceRef.current);
      focusDebounceRef.current = setTimeout(() => refresh(), 1500);
    };
    const onHydrate = (event: Event) => {
      const fleet = parseFleetPayload((event as CustomEvent<unknown>).detail);
      if (fleet.length === 0) return;
      setAgents((prev) => (prev.length > 0 ? prev : fleet));
      setDegraded(false);
    };
    window.addEventListener(AGENTS_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onFocus);
    window.addEventListener(AGENTS_HYDRATE_EVENT, onHydrate);
    return () => {
      window.removeEventListener(AGENTS_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(AGENTS_HYDRATE_EVENT, onHydrate);
      if (focusDebounceRef.current) clearTimeout(focusDebounceRef.current);
    };
  }, [user, refresh]);

  useEffect(() => {
    if (user && location.pathname.startsWith("/chat")) refresh();
  }, [location.pathname, user, refresh]);

  const value = useMemo<AgentsContextValue>(
    () => ({ agents, loading, degraded, hasAgents: agents.length > 0, refresh }),
    [agents, loading, degraded, refresh],
  );

  return <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>;
}

export function useAgents(): AgentsContextValue {
  return useContext(AgentsContext);
}
