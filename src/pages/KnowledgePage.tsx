import { Link, useSearchParams } from "react-router-dom";
import { Database, WandSparkles } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import KnowledgeWorkspace from "../components/KnowledgeWorkspace";
import { useAgents } from "../contexts/AgentsContext";

function EmptyKnowledge() {
  return (
    <div className="grid h-full min-h-[520px] place-items-center py-8">
      <section className="studio-card w-full max-w-[512px] px-8 py-12 text-center sm:px-10">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-[var(--radius-xl)] bg-muted text-muted-foreground">
          <Database size={30} strokeWidth={1.7} />
        </span>
        <p className="studio-kicker mt-7">Source of truth</p>
        <h2 className="wl-section-title mt-2 text-[clamp(1.5rem,1.25rem+1vw,2rem)]">
          Give your assistant the right context.
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-[16px] leading-6 text-muted-foreground">
          Create an assistant first, then add the facts, policies, and rules it needs to represent you well.
        </p>
        <Link to="/studio?create=1" className="studio-primary-button mt-7">
          <WandSparkles size={16} />
          Create an assistant
        </Link>
      </section>
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
      eyebrow="Workspace"
      title="Knowledge"
      contentClassName={populated ? "pt-5" : "pt-0"}
      action={
        populated ? (
          <select
            value={agentId}
            onChange={(event) => setParams({ agent: event.target.value })}
            aria-label="Choose assistant"
            className="wl-agent-select min-w-[230px]"
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        ) : undefined
      }
    >
      {!loading && !agents.length ? <EmptyKnowledge /> : <KnowledgeWorkspace />}
    </WorkspaceShell>
  );
}
