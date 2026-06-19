/** Training — Stitch-style agent architect workspace. */
import { useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { GraduationCap } from "lucide-react";
import AgentStudioCanvas from "../components/AgentStudioCanvas";
import { clientLog } from "../lib/client-log";
import { useAgents } from "../contexts/AgentsContext";
import ClientRouteViewport from "../components/layout/ClientRouteViewport";
import ClientRouteLoading from "../components/layout/ClientRouteLoading";
import { EmptyState } from "../components/ui/EmptyState";
import { OPS_CHANNEL_EMPTY, OPS_CHANNEL_TOOLBAR } from "../lib/wireline-ops-design";

export default function Training() {
  const [searchParams] = useSearchParams();
  const { agents, loading, degraded, refresh } = useAgents();
  const selectedAgentId = searchParams.get("agent") || (agents[0]?.id ?? "");
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];

  if (loading && agents.length === 0) {
    return (
      <ClientRouteViewport className="bg-[#0a0a0c]">
        <ClientRouteLoading icon={<GraduationCap className="h-7 w-7" />} label={OPS_CHANNEL_TOOLBAR.training.loading} />
      </ClientRouteViewport>
    );
  }

  if (!loading && degraded && agents.length === 0) {
    return (
      <ClientRouteViewport className="bg-[#0a0a0c]">
        <EmptyState
          framed
          fill
          icon={GraduationCap}
          title="Couldn't load your agents"
          description="The server returned a partial response. Check your connection and try again."
          density="compact"
          withHalo={false}
          actions={[{ label: "Retry", onClick: () => refresh(), primary: true }]}
        />
      </ClientRouteViewport>
    );
  }

  if (agents.length === 0) {
    return (
      <ClientRouteViewport className="bg-[#0a0a0c]">
        <EmptyState
          framed
          fill
          icon={GraduationCap}
          eyebrow={OPS_CHANNEL_EMPTY.training.eyebrow}
          title={OPS_CHANNEL_EMPTY.training.title}
          description={OPS_CHANNEL_EMPTY.training.description}
          density="compact"
          withHalo={false}
          actions={[...OPS_CHANNEL_EMPTY.training.actions]}
        />
      </ClientRouteViewport>
    );
  }

  return (
    <ClientRouteViewport className="bg-[#0a0a0c] p-0">
      <motion.div
        key={selectedAgent?.id ?? "agent-studio"}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="h-full min-h-0"
      >
        <AgentStudioCanvas
          agentId={selectedAgent?.id ?? selectedAgentId}
          agentName={selectedAgent?.name ?? "New Agent"}
          onPublish={() => {
            clientLog.debug("[Training]", "Deploy agent from Stitch architect", { agentId: selectedAgent?.id ?? selectedAgentId });
          }}
        />
      </motion.div>
    </ClientRouteViewport>
  );
}
