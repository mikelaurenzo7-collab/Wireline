import { useMemo } from "react";
import { useSearchParams } from "react-router";

import { useAccount } from "../contexts/AccountContext";
import { useAgents } from "../contexts/AgentsContext";
import { resolveStudioActiveAgentId } from "../lib/studio-agent-preference";

/**
 * Shared MRU-aware Bot resolution for shell chrome and Studio.
 *
 * `is_business_agent` remains in persisted records for backward compatibility,
 * provider defaults, and legacy billing logic. The customer workspace no longer
 * splits its roster by that field. At the UI boundary every record inherits the
 * current account capability profile, so one workspace always shows every Bot.
 */
export function useStudioActiveAgentId() {
  const [params] = useSearchParams();
  const { accountType } = useAccount();
  const { agents } = useAgents();
  const requestedId = params.get("agent");
  const workspaceAgents = useMemo(
    () =>
      agents.map((agent) => ({
        ...agent,
        is_business_agent: accountType === "business",
      })),
    [accountType, agents],
  );
  const agentIds = useMemo(() => workspaceAgents.map((agent) => agent.id), [workspaceAgents]);
  const resolvedId = useMemo(
    () => resolveStudioActiveAgentId(requestedId, agentIds),
    [requestedId, agentIds],
  );

  return { requestedId, resolvedId, agents: workspaceAgents };
}
