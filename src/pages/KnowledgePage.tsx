import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Database, WandSparkles } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import KnowledgeWorkspace from "../components/KnowledgeWorkspace";
import { useAgents } from "../contexts/AgentsContext";

function EmptyKnowledge() {
  return (
    <div className="grid h-full min-h-[560px] place-items-center py-8">
      <section className="w-full max-w-[512px] rounded-lg border border-border bg-card px-8 py-12 text-center shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-xl bg-muted text-muted-foreground"><Database size={30} strokeWidth={1.7} /></span>
        <h2 className="mt-7 text-[24px] font-semibold tracking-[-.01em] text-foreground">No assistants yet</h2>
        <p className="mx-auto mt-3 max-w-sm text-[16px] leading-6 text-muted-foreground">Create an assistant first to start building its knowledge base.</p>
        <Link to="/studio?create=1" className="workspace-btn-primary mt-7 px-5 py-2.5"><WandSparkles size={16} />Go to Studio</Link>
      </section>
    </div>
  );
}

export default function KnowledgePage() {
  const [params] = useSearchParams();
  const { agents, loading } = useAgents();
  const agentId = params.get("agent") || "";
  return (
    <WorkspaceShell
      eyebrow="Knowledge base"
      title="Knowledge"
      contentClassName="pt-0"
      action={agents.length ? <Link to={agentId ? `/studio?agent=${encodeURIComponent(agentId)}` : "/studio"} className="workspace-btn-secondary px-3 py-2.5 text-sm">Studio <ArrowUpRight size={14} /></Link> : undefined}
    >
      {!loading && !agents.length ? <EmptyKnowledge /> : <KnowledgeWorkspace />}
    </WorkspaceShell>
  );
}
