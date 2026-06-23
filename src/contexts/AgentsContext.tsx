import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import { authFetch } from "../lib/api";

export interface WorkspaceAgentSummary {
  id: string;
  name: string;
  role: string | null;
  channel?: "voice" | "email" | "omnichannel";
  is_business_agent?: boolean;
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

/** Fired after an agent is created or removed so the Studio roster refreshes. */
export const AGENTS_CHANGED_EVENT = "wireline:agents-changed";

function isAgentLike(value: unknown): value is {
  id: string;
  name?: string | null;
  role?: string | null;
  channel?: string | null;
  isBusinessAgent?: boolean | null;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as Record<string, unknown>).id === "string" &&
    (value as Record<string, unknown>).id !== ""
  );
}

function normalizeChannel(raw: string | null | undefined): WorkspaceAgentSummary["channel"] {
  if (raw === "email" || raw === "voice" || raw === "omnichannel") return raw;
  return undefined;
}

function parseAgentsPayload(data: unknown): WorkspaceAgentSummary[] {
  const list = Array.isArray((data as Record<string, unknown>)?.agents)
    ? ((data as Record<string, unknown>).agents as unknown[])
    : [];
  return list.filter(isAgentLike).map((agent) => ({
    id: agent.id,
    name: agent.name || "Untitled agent",
    role: agent.role ?? null,
    channel: normalizeChannel(agent.channel),
    is_business_agent: !!agent.isBusinessAgent,
  }));
}

async function fetchAgentsWithRetry(attempts = 2): Promise<{
  agents: WorkspaceAgentSummary[];
  degraded: boolean;
}> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await authFetch("/api/agents");
      const body = await response.json().catch(() => null);
      if (response.ok && body) {
        return { agents: parseAgentsPayload(body), degraded: body.degraded === true };
      }
      if (body && (response.status === 503 || body.degraded === true)) {
        return { agents: parseAgentsPayload(body), degraded: true };
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts - 1)
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw lastError;
}

export function AgentsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [agents, setAgents] = useState<WorkspaceAgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [nonce, setNonce] = useState(0);
  const hasLoadedOnceRef = useRef(false);
  const focusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!user) {
      setAgents([]);
      setDegraded(false);
      setLoading(false);
      hasLoadedOnceRef.current = false;
      return;
    }

    let cancelled = false;
    if (!hasLoadedOnceRef.current) setLoading(true);

    fetchAgentsWithRetry()
      .then(({ agents: list, degraded: nextDegraded }) => {
        if (cancelled) return;
        setAgents(list);
        setDegraded(nextDegraded);
        hasLoadedOnceRef.current = true;
      })
      .catch(() => {
        if (cancelled) return;
        setAgents((current) => (current.length > 0 ? current : []));
        setDegraded(true);
        hasLoadedOnceRef.current = true;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, nonce]);

  useEffect(() => {
    if (!user) return;
    const onChanged = () => refresh();
    const onFocus = () => {
      if (focusDebounceRef.current) clearTimeout(focusDebounceRef.current);
      focusDebounceRef.current = setTimeout(() => refresh(), 1500);
    };
    window.addEventListener(AGENTS_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(AGENTS_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onFocus);
      if (focusDebounceRef.current) clearTimeout(focusDebounceRef.current);
    };
  }, [user, refresh]);

  const value = useMemo<AgentsContextValue>(
    () => ({ agents, loading, degraded, hasAgents: agents.length > 0, refresh }),
    [agents, loading, degraded, refresh],
  );

  return <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>;
}

export function useAgents(): AgentsContextValue {
  return useContext(AgentsContext);
}
