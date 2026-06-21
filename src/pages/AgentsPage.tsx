import { Link } from "react-router-dom";
import { ArrowUpRight, Bot, CircleAlert, Plus, ShieldCheck } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";

function roleLabel(role?: string | null) { return role?.replace(/_/g, " ") || "Assistant"; }

const ROLE_HINT: Record<string, string> = {
  sales: "Books meetings and follows up with leads.",
  scheduler: "Handles scheduling and reminders.",
  customer_service: "Answers questions and routes when needed.",
  receptionist: "Routes calls and captures information.",
  custom: "Trained for your specific needs.",
};

function agentHint(agent: WorkspaceAgentSummary) {
  return ROLE_HINT[agent.role || "custom"] || ROLE_HINT.custom;
}

function EmptyAgents() {
  return (
    <div className="grid h-full min-h-0 place-items-center rounded-2xl border border-dashed border-border bg-card/70 px-6 text-center">
      <div>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-muted"><Bot size={20} /></span>
        <h2 className="mt-4 text-lg font-semibold tracking-[-.025em]">Create your first assistant</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Tell it what to do in plain English. We'll handle the rest.</p>
        <Link to="/studio" className="workspace-btn-primary mt-5 px-4 py-2.5"><Plus size={16} />Create assistant</Link>
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: WorkspaceAgentSummary }) {
  return (
    <article className="group flex min-h-[120px] flex-col rounded-xl border border-border/70 bg-card/90 p-3 transition hover:border-border hover:bg-card sm:min-h-[128px] sm:p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-xs font-semibold">{agent.name.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold tracking-[-.025em]">{agent.name}</h2>
          <p className="mt-0.5 truncate text-[11px] capitalize text-muted-foreground">{roleLabel(agent.role)} · {agent.channel || "voice"}</p>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-[11px] leading-[1.45] text-muted-foreground">{agentHint(agent)}</p>
      <div className="mt-auto flex items-center gap-2 pt-2.5">
        <Link to={`/studio?agent=${encodeURIComponent(agent.id)}`} className="workspace-btn-primary px-3 py-1.5 text-xs">Open Studio <ArrowUpRight size={13} /></Link>
        <Link to={`/integrations?agent=${encodeURIComponent(agent.id)}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"><ShieldCheck size={14} />Access</Link>
      </div>
    </article>
  );
}

export default function AgentsPage() {
  const { agents, loading, degraded } = useAgents();
  return (
    <WorkspaceShell eyebrow="Build" title="Agents" contentClassName="pt-2" action={<Link to="/studio" className="workspace-btn-primary px-3.5 py-2.5"><Plus size={16} />New <span className="hidden sm:inline">agent</span></Link>}>
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="wl-stat-strip shrink-0">
          <span><strong>{loading ? "—" : agents.length}</strong> agents</span>
          <span className="wl-dot" aria-hidden />
          <span>Scoped permissions</span>
          <span className="wl-dot" aria-hidden />
          <span>Train before live calls</span>
        </div>
        {degraded ? <div className="flex shrink-0 items-start gap-2 rounded-xl border border-amber-700/15 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"><CircleAlert size={15} className="mt-0.5 shrink-0" />Agent data is temporarily unavailable. Existing configuration is unchanged.</div> : null}
        {!loading && !agents.length ? <EmptyAgents /> : (
          <section className="wl-scroll min-h-0 flex-1 overflow-y-auto pr-0.5">
            <div className="grid gap-3 pb-1 sm:grid-cols-2 2xl:grid-cols-3">
              {loading ? Array.from({ length: 6 }, (_, index) => <div key={index} className="h-[128px] animate-pulse rounded-xl bg-muted/60" />) : agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
            </div>
          </section>
        )}
      </div>
    </WorkspaceShell>
  );
}
