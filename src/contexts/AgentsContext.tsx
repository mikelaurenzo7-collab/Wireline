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
  phone_number?: string | null;
}

interface AgentsContextValue {
  agents: WorkspaceAgentSummary[];
  loading: boolean;
  degraded: boolean;
  phoneLookupDegraded: boolean;
  hasAgents: boolean;
  refresh: () => void;
}

const AgentsContext = createContext<AgentsContextValue>({
  agents: [],
  loading: true,
  degraded: false,
  phoneLookupDegraded: false,
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
  phone_number?: string | null;
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

function parsePhoneNumberMap(data: unknown): Map<string, string> {
  const rows = Array.isArray((data as Record<string, unknown>)?.numbers)
    ? ((data as Record<string, unknown>).numbers as unknown[])
    : [];
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const agentId = typeof record.agent_id === "string" ? record.agent_id : "";
    const phoneNumber = typeof record.phone_number === "string" ? record.phone_number : "";
    if (agentId && phoneNumber) map.set(agentId, phoneNumber);
  }
  return map;
}

function parseAgentsPayload(
  data: unknown,
  numbersByAgent = new Map<string, string>(),
): WorkspaceAgentSummary[] {
  const list = Array.isArray((data as Record<string, unknown>)?.agents)
    ? ((data as Record<string, unknown>).agents as unknown[])
    : [];
  return list.filter(isAgentLike).map((agent) => ({
    id: agent.id,
    name: agent.name || "Untitled agent",
    role: agent.role ?? null,
    channel: normalizeChannel(agent.channel),
    is_business_agent: !!agent.isBusinessAgent,
    phone_number: agent.phone_number ?? numbersByAgent.get(agent.id) ?? null,
  }));
}

async function fetchAgentsWithRetry(attempts = 2): Promise<{
  agents: WorkspaceAgentSummary[];
  degraded: boolean;
  phoneLookupDegraded: boolean;
}> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await authFetch("/api/agents");
      const body = await response.json().catch(() => null);
      const numbersResponse = await authFetch("/api/phone-numbers").catch(() => null);
      const numbersBody = numbersResponse?.ok
        ? await numbersResponse.json().catch(() => null)
        : null;
      const phoneLookupDegraded = !numbersResponse?.ok;
      const numbersByAgent = parsePhoneNumberMap(numbersBody);
      if (response.ok && body) {
        return {
          agents: parseAgentsPayload(body, numbersByAgent),
          degraded: body.degraded === true,
          phoneLookupDegraded,
        };
      }
      if (body && (response.status === 503 || body.degraded === true)) {
        return {
          agents: parseAgentsPayload(body, numbersByAgent),
          degraded: true,
          phoneLookupDegraded,
        };
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
  const [phoneLookupDegraded, setPhoneLookupDegraded] = useState(false);
  const [nonce, setNonce] = useState(0);
  const hasLoadedOnceRef = useRef(false);
  const focusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!user) {
      setAgents([]);
      setDegraded(false);
      setPhoneLookupDegraded(false);
      setLoading(false);
      hasLoadedOnceRef.current = false;
      return;
    }

    let cancelled = false;
    if (!hasLoadedOnceRef.current) setLoading(true);

    fetchAgentsWithRetry()
      .then(
        ({
          agents: list,
          degraded: nextDegraded,
          phoneLookupDegraded: nextPhoneLookupDegraded,
        }) => {
          if (cancelled) return;
          setAgents(list);
          setDegraded(nextDegraded);
          setPhoneLookupDegraded(nextPhoneLookupDegraded);
          hasLoadedOnceRef.current = true;
        },
      )
      .catch(() => {
        if (cancelled) return;
        setAgents((current) => (current.length > 0 ? current : []));
        setDegraded(true);
        setPhoneLookupDegraded(true);
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
    () => ({
      agents,
      loading,
      degraded,
      phoneLookupDegraded,
      hasAgents: agents.length > 0,
      refresh,
    }),
    [agents, loading, degraded, phoneLookupDegraded, refresh],
  );

  return <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>;
}

export function useAgents(): AgentsContextValue {
  return useContext(AgentsContext);
}
