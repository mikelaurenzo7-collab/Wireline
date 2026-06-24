import { Link } from "react-router-dom";
import { Bot, CircleAlert, MessageSquare, Phone, Plus, Wrench, Zap } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import PostureBadge from "../components/ui/PostureBadge";
import { useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";
import {
  formatAgentRoleLabel,
  PRODUCT_POSTURE,
  PRODUCT_VERSATILITY,
  rosterSummary,
} from "../lib/product-copy";

const ROLE_HINT: Record<string, string> = {
  sales: "Follows up with leads, books meetings, and keeps useful conversations moving.",
  scheduler: "Handles scheduling, reminders, and calendar back-and-forth.",
  customer_service: "Answers common questions and brings anything important back to you.",
  receptionist: "Handles incoming calls and captures the details you need.",
  custom: "Handles the calls, messages, and tasks you describe in Studio.",
};

function agentHint(agent: WorkspaceAgentSummary) {
  return ROLE_HINT[agent.role || "custom"] || ROLE_HINT.custom;
}

function EmptyRoster() {
  return (
    <section className="grid min-h-[430px] flex-1 place-items-center rounded-[var(--radius-lg)] border border-dashed border-border bg-card px-6 text-center">
      <div className="max-w-lg">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-[var(--radius-lg)] bg-muted text-muted-foreground">
          <Bot size={34} strokeWidth={1.7} />
        </span>
        <h2 className="mt-7 font-[var(--wl-font-display)] text-2xl font-semibold tracking-[-.02em] text-foreground">
          {PRODUCT_VERSATILITY.tagline}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-base leading-6 text-muted-foreground">
          {PRODUCT_POSTURE.personal.emptyBody}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/studio?create=1" className="studio-primary-button">
            <Plus size={16} />
            {PRODUCT_POSTURE.personal.createCta}
          </Link>
          <Link to="/studio?create=1&posture=business" className="studio-secondary-button">
            {PRODUCT_POSTURE.business.createCta}
          </Link>
        </div>
      </div>
    </section>
  );
}

function LoadingRoster() {
  return (
    <section
      className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pb-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      aria-label="Loading roster"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="h-[236px] rounded-[var(--radius-lg)] border border-border bg-card p-5"
        >
          <div className="flex items-start justify-between">
            <div className="h-11 w-11 animate-pulse rounded-[var(--radius-lg)] bg-muted" />
            <div className="h-6 w-14 animate-pulse rounded bg-muted" />
          </div>
          <div className="mt-5 h-5 w-2/3 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="mt-6 h-4 w-full animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-muted" />
          <div className="mt-7 border-t border-border pt-4">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </section>
  );
}

function RosterCard({ agent }: { agent: WorkspaceAgentSummary }) {
  const channel = agent.channel || "voice";
  const isVoice = channel === "voice";
  const ChannelIcon = isVoice ? Phone : MessageSquare;

  return (
    <article className="studio-card flex min-h-[236px] flex-col p-5 transition hover:border-primary/40 hover:shadow-[var(--wl-shadow-md)]">
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-lg)] bg-accent text-lg font-semibold text-primary">
          {agent.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="flex flex-wrap justify-end gap-1.5">
          <PostureBadge isBusiness={Boolean(agent.is_business_agent)} />
          <span className="wl-stitch-status-pill">
            <span className="wl-stitch-status-dot" aria-hidden />
            Ready
          </span>
        </div>
      </div>
      <h2 className="mt-5 font-[var(--wl-font-display)] text-xl font-semibold leading-6 tracking-[-.02em] text-foreground">
        {agent.name}
      </h2>
      <p className="mt-1 inline-flex items-center gap-2 font-mono text-[11px] capitalize tracking-[.02em] text-muted-foreground">
        <span>{formatAgentRoleLabel(agent.role)}</span>
        <ChannelIcon size={13} />
        <span>{channel}</span>
      </p>
      <p className="mt-3 line-clamp-2 flex-1 text-sm leading-5 text-muted-foreground">
        {agentHint(agent)}
      </p>
      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <Link
          to={`/studio?agent=${encodeURIComponent(agent.id)}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-[color:var(--wl-accent-hover)]"
        >
          <Wrench size={15} />
          Open Studio
        </Link>
        <Link
          to={`/connections?agent=${encodeURIComponent(agent.id)}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Zap size={15} />
          Connections
        </Link>
      </div>
    </article>
  );
}

function SetupNote({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="studio-card px-5 py-4">
      <p className="studio-kicker">{label}</p>
      <strong className="mt-2 block font-[var(--wl-font-display)] text-xl font-semibold leading-6 tracking-[-.02em] text-foreground">
        {value}
      </strong>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function RosterSection({
  title,
  agents,
  createHref,
  createLabel,
}: {
  title: string;
  agents: WorkspaceAgentSummary[];
  createHref: string;
  createLabel: string;
}) {
  if (!agents.length) return null;

  return (
    <section className="min-h-0 flex-1">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="studio-kicker">{title}</p>
          <h2 className="mt-1 font-[var(--wl-font-display)] text-lg font-semibold text-foreground">
            {agents.length} ready
          </h2>
        </div>
        <Link to={createHref} className="studio-secondary-button text-sm">
          <Plus size={14} />
          {createLabel}
        </Link>
      </div>
      <div className="grid gap-4 pb-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {agents.map((agent) => (
          <RosterCard key={agent.id} agent={agent} />
        ))}
      </div>
    </section>
  );
}

export default function AgentsPage() {
  const { agents, loading, degraded } = useAgents();
  const personalAgents = agents.filter((agent) => !agent.is_business_agent);
  const businessAgents = agents.filter((agent) => agent.is_business_agent);

  return (
    <WorkspaceShell
      eyebrow={PRODUCT_VERSATILITY.eyebrow}
      title="Personal assistants & business agents"
      contentClassName="pt-6 pb-0"
      action={
        <Link to="/studio?create=1" className="studio-primary-button">
          <Plus size={16} />
          Create an assistant
        </Link>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-5">
        {degraded ? (
          <div className="flex shrink-0 items-start gap-3 rounded-[var(--radius-lg)] border border-[color:color-mix(in_srgb,var(--wl-status-error)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--wl-status-error)_8%,var(--card))] px-4 py-4 text-foreground">
            <CircleAlert size={18} className="mt-0.5 shrink-0 text-[var(--wl-status-error)]" />
            <div>
              <p className="font-semibold text-[var(--wl-status-error)]">
                We cannot load your roster right now
              </p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Your saved setup is safe. Please try again in a moment.
              </p>
            </div>
          </div>
        ) : null}
        {!loading && agents.length ? (
          <section className="grid shrink-0 gap-4 md:grid-cols-3">
            <SetupNote
              label="Roster"
              value={String(agents.length)}
              detail={rosterSummary(personalAgents.length, businessAgents.length)}
            />
            <SetupNote
              label="Personal assistants"
              value={String(personalAgents.length)}
              detail="Everyday calls, scheduling, and follow-ups"
            />
            <SetupNote
              label="Business agents"
              value={String(businessAgents.length)}
              detail="Professional lines, policies, and connected accounts"
            />
          </section>
        ) : null}
        {!loading && !agents.length ? <EmptyRoster /> : null}
        {loading ? <LoadingRoster /> : null}
        {!loading && agents.length ? (
          <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto pr-0.5">
            <RosterSection
              title="Personal assistants"
              agents={personalAgents}
              createHref="/studio?create=1"
              createLabel={PRODUCT_POSTURE.personal.createCta}
            />
            <RosterSection
              title="Business agents"
              agents={businessAgents}
              createHref="/studio?create=1&posture=business"
              createLabel={PRODUCT_POSTURE.business.createCta}
            />
          </div>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
