import { Link, useSearchParams } from "react-router-dom";
import { GraduationCap, WandSparkles } from "lucide-react";
import { Button, EmptyState, NativeSelect } from "../components/atoms";
import WorkspaceShell from "../components/WorkspaceShell";
import KnowledgeWorkspace from "../components/KnowledgeWorkspace";
import { useAgents } from "../contexts/AgentsContext";

function EmptyTraining() {
  return (
    <div className="grid h-full min-h-[520px] place-items-center py-8">
      <EmptyState
        density="default"
        className="studio-card w-full max-w-[512px] px-8 py-12 text-left sm:px-10"
        icon={<GraduationCap size={30} strokeWidth={1.7} />}
        title="Train the agent."
        description="Add facts, rules, tone, and sources once an agent exists."
        action={<Button asChild><Link to="/studio?create=1"><WandSparkles aria-hidden="true" size={16} />Create agent</Link></Button>}
      />
    </div>
  );
}

export default function KnowledgePage() {
  const [params, setParams] = useSearchParams();
  const { agents, loading } = useAgents();
  const agentId = params.get("agent") || agents[0]?.id || "";
  const populated = !loading && agents.length > 0;

  return (
    <WorkspaceShell
      eyebrow="Operating system"
      title="Training"
      contentClassName={populated ? "pt-5" : "pt-0"}
      action={populated ? <NativeSelect value={agentId} onChange={(event) => setParams({ agent: event.target.value })} aria-label="Choose agent" className="min-w-[230px]">{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</NativeSelect> : undefined}
    >
      {!loading && !agents.length ? <EmptyTraining /> : <KnowledgeWorkspace />}
    </WorkspaceShell>
  );
}
