import { useSearchParams } from "react-router-dom";

import AgentLaunchReadinessCard from "../components/AgentLaunchReadinessCard";
import CrmConnectionCard from "../components/CrmConnectionCard";
import IntegrationOperatingMap from "../components/integrations/IntegrationOperatingMap";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents } from "../contexts/AgentsContext";

export default function ConnectionsPage() {
  const [params] = useSearchParams();
  const { agents } = useAgents();
  const activeAgent = agents.find((agent) => agent.id === params.get("agent")) || agents[0];
  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame className="max-w-[1080px] gap-4">
        {activeAgent ? <AgentLaunchReadinessCard agent={activeAgent} /> : null}
        <IntegrationOperatingMap />
        <CrmConnectionCard />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
