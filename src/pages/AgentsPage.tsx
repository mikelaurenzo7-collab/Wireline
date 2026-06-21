import { Link } from "react-router-dom";
import { Bot, CircleAlert, Clock3, MessageSquare, Phone, Plus, Radio, Wrench } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";

const ROLE_HINT: Record<string, string> = {
  sales: "Follows up with leads, books meetings, and keeps conversations moving.",
  scheduler: "Handles scheduling, reminders, and calendar back-and-forth.",
  customer_service: "Answers common questions and escalates what needs a human.",
  receptionist: "Routes calls and captures the details you need.",
  custom: "Trained for the calls, messages, and tasks you describe in Studio.",
};

function roleLabel(role?: string | null) {
  return role?.replace(/_/g, " ") || "Assistant";
}

function agentHint(agent: WorkspaceAgentSummary) {
  return ROLE_HINT[agent.role || "custom"] || ROLE_HINT.custom;
}

function EmptyAgents() {
  return (
    <section className="grid min-h-[480px] flex-1 place-items-center border border-dashed border-border bg-card px-6 text-center">
      <div className="max-w-lg">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Bot size={34} strokeWidth={1.7} />
        </span>
        <h2 className="mt-7 text-[24px] font-semibold tracking-[-.01em] text-foreground">No assistants configured</h2>
        <p className="mx-auto mt-3 max-w-md text-[16px] leading-6 text-muted-foreground">
          Create your first assistant for calls, messages, follow-ups, reminders, or anything else you want off your plate.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/studio?create=1" className="workspace-btn-primary px-5 py-2.5">
            <Plus size={16} /> New assistant
          </Link>
          <Link to="/studio" className="workspace-btn-secondary px-5 py-2.5">
            Go to Studio
          </Link>
        </div>
      </div>
    </section>
  );
}

function LoadingAgents() {
  return (
    <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pb-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="h-[320px] border border-border bg-card p-6">
          <div className="flex items-start justify-between"><div className="h-12 w-12 animate-pulse rounded-lg bg-muted" /><div className="h-6 w-14 animate-pulse bg-muted" /></div>
          <div className="mt-6 h-5 w-2/3 animate-pulse bg-muted" />
          <div className="mt-3 h-4 w-1/2 animate-pulse bg-muted" />
          <div className="mt-7 h-4 w-full animate-pulse bg-muted" />
          <div className="mt-2 h-4 w-4/5 animate-pulse bg-muted" />
          <div className="mt-8 border-t border-border pt-5"><div className="h-4 w-20 animate-pulse bg-muted" /></div>
        </div>
      ))}
    </section>
  );
}

function AgentCard({ agent }: { agent: WorkspaceAgentSummary }) {
  const channel = agent.channel || "voice";
  const isVoice = channel === "voice" || channel === "phone";
  const ChannelIcon = isVoice ? Phone : MessageSquare;

  return (
    <article className="wl-stitch-agent-card flex min-h-[320px] flex-col">
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-start justify-between gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[color:var(--wl-accent-container)] text-[17px] font-semibold text-primary">
            {agent.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="wl-stitch-status-pill wl-stitch-status-pill--live">
            <span className="wl-stitch-status-dot" aria-hidden /> Live
          </span>
        </div>
        <h2 className="mt-5 text-[18px] font-semibold leading-6 tracking-[-.01em] text-foreground">{agent.name}</h2>
        <p className="mt-1 font-mono text-[12px] capitalize tracking-[.02em] text-muted-foreground">{roleLabel(agent.role)}</p>
        <div className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground">
          <ChannelIcon size={14} />
          <span>{isVoice ? "Voice + messaging" : channel}</span>
        </div>
        <p className="mt-5 line-clamp-3 flex-1 text-[14px] leading-5 text-muted-foreground">{agentHint(agent)}</p>
      </div>
      <div className="flex items-center justify-between border-t border-border px-6 py-4">
        <Link to={`/studio?agent=${encodeURIComponent(agent.id)}`} className="inline-flex items-center gap-2 text-[14px] font-medium text-foreground hover:text-primary">
          <Wrench size={15} /> Open Studio
        </Link>
        <Link to={`/actions?agent=${encodeURIComponent(agent.id)}`} className="inline-flex items-center gap-2 text-[14px] text-muted-foreground hover:text-foreground">
          Access
        </Link>
      </div>
    </article>
  );
}

function FleetMetric({ label, value, detail, live }: { label: string; value: string; detail?: string; live?: boolean }) {
  return (
    <div className="border border-border bg-card px-4 py-4">
      <p className="font-mono text-[12px] uppercase tracking-[.02em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        {live ? <span className="h-2 w-2 rounded-full bg-[color:var(--wl-status-active)]" /> : null}
        <strong className="text-[24px] font-semibold leading-7 tracking-[-.02em] text-foreground">{value}</strong>
      </div>
      {detail ? <p className="mt-1 text-[13px] text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

export default function AgentsPage() {
  const { agents, loading, degraded } = useAgents();
  const activeCount = agents.length;

  return (
    <WorkspaceShell
      eyebrow="Fleet management"
      title="Agents"
      contentClassName="pt-6"
      action={<Link to="/studio?create=1" className="workspace-btn-primary px-4 py-2.5"><Plus size={16} /> Create new</Link>}
    >
      <div className="flex h-full min-h-0 flex-col gap-8">
        {degraded ? (
          <div className="flex shrink-0 items-start gap-3 border border-red-300 bg-red-50 px-4 py-4 text-red-800">
            <CircleAlert size={18} className="mt-0.5 shrink-0" />
            <div><p className="font-semibold">Agent fleet connection degraded</p><p className="mt-1 text-[14px] leading-5">Agent data is temporarily unavailable. Your saved configurations are unchanged and will return when the connection restores.</p></div>
          </div>
        ) : null}

        {!loading && agents.length ? (
          <section className="grid shrink-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FleetMetric label="Active assistants" value={String(activeCount)} />
            <FleetMetric label="Conversations" value="—" detail="Across your assistants" />
            <FleetMetric label="Response time" value="—" detail="Available after activity" />
            <FleetMetric label="System health" value="Optimal" live />
          </section>
        ) : null}

        {!loading && !agents.length ? <EmptyAgents /> : null}
        {loading ? <LoadingAgents /> : null}
        {!loading && agents.length ? (
          <section className="min-h-0 flex-1 overflow-y-auto pr-0.5">
            <div className="grid gap-4 pb-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
              <Link to="/studio?create=1" className="flex min-h-[320px] flex-col items-center justify-center border border-dashed border-border bg-card p-8 text-center transition hover:border-[color:var(--wl-accent)] hover:bg-[color:var(--wl-surface-subtle)]">
                <span className="grid h-14 w-14 place-items-center rounded-lg bg-muted text-muted-foreground"><Plus size={26} /></span>
                <span className="mt-5 text-[18px] font-semibold tracking-[-.01em]">Create another assistant</span>
                <span className="mt-2 max-w-[240px] text-[14px] leading-5 text-muted-foreground">Add another purpose-built assistant when you need one.</span>
              </Link>
            </div>
          </section>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
