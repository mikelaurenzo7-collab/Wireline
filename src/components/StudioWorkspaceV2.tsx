import { useSearchParams } from "react-router-dom";
import { useAgents } from "../contexts/AgentsContext";
import AgentWorkspace from "./AgentWorkspace";

export default function StudioWorkspaceV2() {
  const { agents, loading } = useAgents();
  const [params] = useSearchParams();
  const requestedId = params.get("agent");
  const active = agents.find((agent) => agent.id === requestedId) || agents[0];

  if (loading) {
    return <main className="grid min-h-[60vh] place-items-center bg-surface px-6 text-sm text-on-surface-variant">Loading your workspace…</main>;
  }

  if (!active) {
    return <main className="grid min-h-[60vh] place-items-center bg-surface px-6 text-center"><div><p className="wl-label">Studio</p><h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-on-surface">Create your first assistant</h1><p className="mt-2 max-w-md text-sm leading-6 text-on-surface-variant">Create an assistant to open a focused workspace for training, calls, and connections.</p></div></main>;
  }

  return <AgentWorkspace agentId={active.id} agentName={active.name} />;
}
