import { Link } from "react-router-dom";
import { ArrowUpRight, Bot, CircleAlert, KeyRound, Plus, Wrench } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";

function roleLabel(role?: string | null) {
  return role?.replace(/_/g, " ") || "Assistant";
}

const ROLE_HINT: Record<string, string> = {
  sales: "Follows up with leads and books meetings when you are busy.",
  scheduler: "Handles scheduling, reminders, and calendar back-and-forth.",
  customer_service: "Answers common questions and escalates when needed.",
  receptionist: "Routes calls and captures the details you need.",
  custom: "Trained for the calls and tasks you describe in Studio.",
};

function agentHint(agent: WorkspaceAgentSummary) {
  return ROLE_HINT[agent.role || "custom"] || ROLE_HINT.custom;
}

function EmptyAgents() {
  return (
    <div className="grid h-full min-h-0 place-items-center rounded-2xl border border-dashed border-border bg-card/70 px-6 text-center">
      <div>
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-border bg-card">
          <Plus size={24} className="text-muted-foreground" />
        </span>
        <h2 className="mt-5 text-lg font-semibold tracking-[-.025em]">Create your first assistant</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Tell Wireline what to call, what to ask, and what to text you back. We handle the hold music.
        </p>
        <Link to="/studio" className="workspace-btn-primary mt-5 px-4 py-2.5">
          <Plus size={16} />
          Create assistant
        </Link>
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: WorkspaceAgentSummary }) {
  const channel = agent.channel || "voice";
  const isVoice = channel === "voice" || channel === "phone";
  return (
    <article className="wl-stitch-agent-card group">
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/10 text-base font-semibold text-primary">
            {agent.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="wl-stitch-status-pill wl-stitch-status-pill--live">
            <span className="wl-stitch-status-dot" aria-hidden />
            Ready
          </span>
        </div>
        <h2 className="text-base font-semibold tracking-[-.03em] text-foreground group-hover:text-primary">{agent.name}</h2>
        <p className="mt-1 text-[13px] capitalize text-muted-foreground">{roleLabel(agent.role)}</p>
        <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-border/50 bg-muted/40 px-2.5 py-2">
          <Bot size={15} className="shrink-0 text-muted-foreground" />
          <span className="font-mono text-[13px] font-medium text-foreground">
            {isVoice ? "Voice calls" : channel}
          </span>
        </div>
        <p className="mt-4 line-clamp-2 flex-1 text-[13px] leading-relaxed text-muted-foreground">{agentHint(agent)}</p>
      </div>
      <div className="flex items-center justify-between border-t border-border/60 bg-card/50 px-4 py-3 backdrop-blur-sm">
        <Link
          to={`/studio?agent=${encodeURIComponent(agent.id)}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:text-primary/80"
        >
          <Wrench size={15} />
          Open Studio
        </Link>
        <Link
          to={`/integrations?agent=${encodeURIComponent(agent.id)}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          <KeyRound size={15} />
          Access
        </Link>
      </div>
    </article>
  );
}

export default function AgentsPage() {
  const { agents, loading, degraded } = useAgents();
  const activeCount = agents.length;

  return (
    <WorkspaceShell
      eyebrow="Assistants"
      title="Agents"
      contentClassName="pt-3"
      action={
        <Link to="/studio" className="workspace-btn-primary px-3.5 py-2.5">
          <Plus size={16} />
          New <span className="hidden sm:inline">assistant</span>
        </Link>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-5">
        <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
          <p className="max-w-xl text-[13px] leading-6 text-muted-foreground">
            Personal and business assistants live here. Train each one in Studio, then grant only the actions it needs.
          </p>
          <div className="wl-stitch-stat-box shrink-0">
            <div>
              <span className="wl-stitch-label block">Total</span>
              <strong>{loading ? "—" : activeCount}</strong>
            </div>
            <div className="h-10 w-px bg-border/60" aria-hidden />
            <div>
              <span className="wl-stitch-label block text-[color:var(--wl-status-active)]">Ready</span>
              <strong className="text-[color:var(--wl-status-active)]">{loading ? "—" : activeCount}</strong>
            </div>
          </div>
        </div>
        {degraded ? (
          <div className="flex shrink-0 items-start gap-2 rounded-lg border border-amber-700/15 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <CircleAlert size={15} className="mt-0.5 shrink-0" />
            Assistant data is temporarily unavailable. Your saved setup is unchanged.
          </div>
        ) : null}
        {!loading && !agents.length ? (
          <EmptyAgents />
        ) : (
          <section className="wl-scroll min-h-0 flex-1 overflow-y-auto pr-0.5">
            <div className="grid gap-4 pb-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {loading
                ? Array.from({ length: 6 }, (_, index) => (
                    <div key={index} className="h-[280px] animate-pulse rounded-2xl bg-muted/50" />
                  ))
                : agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
              {!loading ? (
                <Link
                  to="/studio"
                  className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/20 p-8 text-center transition hover:border-primary/40 hover:bg-card"
                >
                  <span className="mb-4 grid h-14 w-14 place-items-center rounded-full border border-border bg-card text-muted-foreground">
                    <Plus size={26} />
                  </span>
                  <span className="text-base font-semibold tracking-[-.02em]">Create assistant</span>
                  <span className="mt-2 max-w-[200px] text-[13px] leading-relaxed text-muted-foreground">
                    Add another assistant for a different kind of call.
                  </span>
                </Link>
              ) : null}
            </div>
          </section>
        )}
      </div>
    </WorkspaceShell>
  );
}
