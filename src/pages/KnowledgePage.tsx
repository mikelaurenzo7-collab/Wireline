import { Link, useSearchParams } from "react-router-dom";
import { Database, WandSparkles } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import KnowledgeWorkspace from "../components/KnowledgeWorkspace";
import { useAgents } from "../contexts/AgentsContext";

function EmptyKnowledge() {
  return (
    <div className="grid h-full min-h-[520px] place-items-center py-8">
      <section className="w-full max-w-[512px] rounded-lg border border-border bg-card px-8 py-12 text-center shadow-[0_1px_3px_rgba(93,63,211,0.04)]">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Database size={30} strokeWidth={1.7} />
        </span>
        <h2 className="mt-7 text-[24px] font-semibold tracking-[-.01em] text-foreground">
          Start with an assistant
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-[16px] leading-6 text-muted-foreground">
          Create an assistant first, then add the facts, preferences, and rules that make it
          genuinely useful to you.
        </p>
        <Link to="/studio?create=1" className="workspace-btn-primary mt-7 px-5 py-2.5">
          <WandSparkles size={16} />
          Open Studio
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
      eyebrow="What your assistant knows"
      title={populated ? "Facts & Rules" : "Knowledge"}
      contentClassName={populated ? "pt-5" : "pt-0"}
      action={
        populated ? (
          <select
            value={agentId}
            onChange={(event) => setParams({ agent: event.target.value })}
            aria-label="Choose assistant"
            className="h-10 min-w-[230px] rounded-sm border border-border bg-card px-3 text-[14px] text-foreground"
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
