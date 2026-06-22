import { Link } from "react-router-dom";
import { Bot, CircleAlert, MessageSquare, Phone, Plus, Wrench, Zap } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";

const ROLE_HINT: Record<string, string> = {
  sales:
    "Follows up with leads, books meetings, and keeps conversations moving when you use Wireline for work.",
  scheduler: "Handles scheduling, reminders, and calendar back-and-forth.",
  customer_service: "Answers common questions and brings anything important back to you.",
  receptionist: "Handles incoming calls and captures the details you need.",
  custom: "Handles the calls, messages, and tasks you describe in Studio.",
};

function roleLabel(role?: string | null) {
  return role?.replace(/_/g, " ") || "Assistant";
}

function agentHint(agent: WorkspaceAgentSummary) {
  return ROLE_HINT[agent.role || "custom"] || ROLE_HINT.custom;
}

function EmptyAssistants() {
  return (
    <section className="grid min-h-[430px] flex-1 place-items-center rounded-lg border border-dashed border-border bg-card px-6 text-center">
      <div className="max-w-lg">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Bot size={34} strokeWidth={1.7} />
        </span>
        <h2 className="mt-7 font-serif text-[24px] font-semibold tracking-[-.02em] text-primary">
          Meet your first assistant
        </h2>
        <p className="mx-auto mt-3 max-w-md text-[16px] leading-6 text-muted-foreground">
          Give it a name, explain what you need, and Wireline will help turn it into someone who can
          take care of the calls and follow-ups you do not want to chase.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/studio?create=1" className="workspace-btn-primary px-5 py-2.5">
            <Plus size={16} />
            Create assistant
          </Link>
          <Link to="/studio" className="workspace-btn-secondary px-5 py-2.5">
            Open Studio
          </Link>
        </div>
      </div>
    </section>
  );
}

function LoadingAssistants() {
  return (
    <section
      className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pb-1 sm:grid-cols-2 xl:grid-cols-4"
      aria-label="Loading assistants"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="h-[270px] rounded-lg border border-border bg-card p-6 shadow-[0_1px_2px_rgba(26,60,52,0.05)]"
        >
          <div className="flex items-start justify-between">
            <div className="h-12 w-12 animate-pulse rounded-lg bg-muted" />
            <div className="h-6 w-14 animate-pulse bg-muted" />
          </div>
          <div className="mt-6 h-5 w-2/3 animate-pulse bg-muted" />
          <div className="mt-3 h-4 w-1/2 animate-pulse bg-muted" />
          <div className="mt-7 h-4 w-full animate-pulse bg-muted" />
          <div className="mt-2 h-4 w-4/5 animate-pulse bg-muted" />
          <div className="mt-8 border-t border-border pt-5">
            <div className="h-4 w-20 animate-pulse bg-muted" />
          </div>
        </div>
      ))}
    </section>
  );
}

function AssistantCard({ agent }: { agent: WorkspaceAgentSummary }) {
  const channel = agent.channel || "voice";
  const isVoice = channel === "voice";
  const ChannelIcon = isVoice ? Phone : MessageSquare;
  return (
    <article className="wl-stitch-agent-card flex min-h-[270px] flex-col p-6">
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[color:var(--wl-accent-container)] text-[17px] font-semibold text-primary">
          {agent.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="wl-stitch-status-pill">
          <span className="wl-stitch-status-dot" aria-hidden />
          Ready
        </span>
      </div>
      <h2 className="mt-5 font-serif text-[20px] font-semibold leading-6 tracking-[-.02em] text-primary">
        {agent.name}
      </h2>
      <p className="mt-1 inline-flex items-center gap-2 font-mono text-[12px] capitalize tracking-[.02em] text-muted-foreground">
        <span>{roleLabel(agent.role)}</span>
        <ChannelIcon size={13} />
      </p>
      <p className="mt-4 line-clamp-3 flex-1 text-[14px] leading-5 text-muted-foreground">
        {agentHint(agent)}
      </p>
      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <Link
          to={`/studio?agent=${encodeURIComponent(agent.id)}`}
          className="inline-flex items-center gap-2 text-[14px] font-medium text-foreground hover:text-primary"
        >
          <Wrench size={15} />
          Open Studio
        </Link>
        <Link
          to={`/actions?agent=${encodeURIComponent(agent.id)}`}
          className="inline-flex items-center gap-2 text-[14px] text-muted-foreground hover:text-foreground"
        >
          <Zap size={15} />
          Actions
        </Link>
      </div>
    </article>
  );
}

function SetupNote({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-4 shadow-[0_1px_2px_rgba(26,60,52,0.05)]">
      <p className="font-mono text-[12px] uppercase tracking-[.02em] text-muted-foreground">
        {label}
      </p>
      <strong className="mt-2 block font-serif text-[20px] font-semibold leading-6 tracking-[-.02em] text-primary">
        {value}
      </strong>
      <p className="mt-1 text-[13px] text-muted-foreground">{detail}</p>
    </div>
  );
}

export default function AgentsPage() {
  const { agents, loading, degraded } = useAgents();
  const assistantCount = agents.length;

  return (
    <WorkspaceShell
      eyebrow="Your assistants"
      title="Assistants"
      contentClassName="pt-5"
      action={
        <Link to="/studio?create=1" className="workspace-btn-primary px-4 py-2.5">
          <Plus size={16} />
          Create assistant
        </Link>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-5">
        {degraded ? (
          <div className="flex shrink-0 items-start gap-3 rounded-[var(--radius-lg)] border border-[color:color-mix(in_srgb,var(--wl-status-error)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--wl-status-error)_8%,var(--card))] px-4 py-4 text-foreground">
            <CircleAlert size={18} className="mt-0.5 shrink-0 text-[var(--wl-status-error)]" />
            <div>
              <p className="font-semibold text-[var(--wl-status-error)]">
                We cannot load your assistants right now
              </p>
              <p className="mt-1 text-[14px] leading-5 text-muted-foreground">
                Your saved setup is safe. Please try again in a moment.
              </p>
            </div>
          </div>
        ) : null}
        {!loading && agents.length ? (
          <section className="grid shrink-0 gap-4 md:grid-cols-3">
            <SetupNote
              label="Assistants"
              value={String(assistantCount)}
              detail="Ready for the work you have given them"
            />
            <SetupNote
              label="Teach them"
              value="In Studio"
              detail="Add the details that make each assistant useful"
            />
            <SetupNote
              label="Actions"
              value="Your way"
              detail="Choose the accounts and actions they can use"
            />
          </section>
        ) : null}
        {!loading && !agents.length ? <EmptyAssistants /> : null}
        {loading ? <LoadingAssistants /> : null}
        {!loading && agents.length ? (
          <section className="min-h-0 flex-1 overflow-y-auto pr-0.5">
            <div className="grid gap-4 pb-1 sm:grid-cols-2 xl:grid-cols-4">
              {agents.map((agent) => (
                <AssistantCard key={agent.id} agent={agent} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
