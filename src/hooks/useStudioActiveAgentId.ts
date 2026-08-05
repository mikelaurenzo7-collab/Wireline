import { useMemo } from "react";
import { useSearchParams } from "react-router";

import { useAgents } from "../contexts/AgentsContext";
import { resolveStudioActiveAgentId } from "../lib/studio-agent-preference";

/** Shared MRU-aware active agent resolution for shell chrome and canvas. */
export function useStudioActiveAgentId() {
  const [params] = useSearchParams();
  const { agents } = useAgents();
  const requestedId = params.get("agent");
  const agentIds = useMemo(() => agents.map((agent) => agent.id), [agents]);
  const resolvedId = useMemo(
    () => resolveStudioActiveAgentId(requestedId, agentIds),
    [requestedId, agentIds],
  );

  return { requestedId, resolvedId, agents };
}
