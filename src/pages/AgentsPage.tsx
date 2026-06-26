import { Link } from "react-router-dom";
import {
  Bot,
  Brain,
  Database,
  MessageSquare,
  Mic2,
  Phone,
  Plus,
  ShieldCheck,
  Wrench,
  Zap,
} from "lucide-react";
import { Badge, Button, Skeleton } from "../components/atoms";
import WorkspaceShell from "../components/WorkspaceShell";
import { MetricCard, StatusNotice } from "../components/molecules";
import PostureBadge from "../components/ui/PostureBadge";
import { useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";
import {
  formatAgentRoleLabel,
  PRODUCT_POSTURE,
  PRODUCT_VERSATILITY,
  rosterSummary,
} from "../lib/product-copy";

function EmptyRoster() {
  return (
    <section className="wl-setup-surface place-items-start sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
      <span className="grid size-12 place-items-center rounded-[var(--radius-lg)] bg-accent text-primary">
        <Bot size={23} strokeWidth={1.8} />
      </span>
      <div>
        <p className="wl-setup-surface__eyebrow">Your first agent</p>
        <h2 className="wl-setup-surface__title mt-2">Start with one useful job.</h2>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/studio?create=1">
              <Plus aria-hidden="true" size={16} />
              {PRODUCT_POSTURE.personal.createCta}
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/studio?create=1&posture=business">{PRODUCT_POSTURE.business.createCta}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function LoadingRoster() {
  return (
    <section
      className="grid grid-cols-1 gap-4 pb-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      aria-label="Loading roster"
      aria-busy="true"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="rounded-[var(--radius-xl)] border border-border bg-card p-5">
          <div className="flex items-start justify-between">
            <Skeleton shape="circle" className="size-10" />
            <Skeleton shape="text" className="h-6 w-14" />
          </div>
          <Skeleton shape="text" className="mt-5 h-5 w-2/3" />
          <Skeleton shape="text" className="mt-3 h-4 w-1/2" />
          <Skeleton shape="text" className="mt-6 h-4 w-full" />
        </div>
      ))}
    </section>
  );
}

function AgentFlowPanel({ agent }: { agent: WorkspaceAgentSummary }) {
  const encodedAgentId = encodeURIComponent(agent.id);
  const controls = [
    {
      label: "Knowledge",
      detail: "Facts",
      icon: Database,
      to: `/training?agent=${encodedAgentId}&section=facts`,
    },
    {
      label: "Instructions",
      detail: "Rules",
      icon: ShieldCheck,
      to: `/training?agent=${encodedAgentId}&section=guidance`,
    },
    {
      label: "Voice",
      detail: "Sound",
      icon: Mic2,
      to: `/studio?agent=${encodedAgentId}&tab=training&sub=voices`,
    },
    {
      label: "Memory",
      detail: "Recall",
      icon: Brain,
      to: `/studio?agent=${encodedAgentId}&tab=memory`,
    },
  ] as const;

  return (
    <section className="studio-card grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,.7fr)] lg:items-center">
      <div>
        <p className="studio-kicker">Agent flow</p>
        <h2 className="mt-2 max-w-3xl font-[var(--wireline-font-family-display)] text-[clamp(2rem,4vw,4.75rem)] font-semibold leading-[.9] tracking-[-.065em] text-foreground">
          Create. Train. Run.
        </h2>
        <p className="mt-4 max-w-2xl text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground">
          Start simple, then make the agent sharper where it matters: knowledge, instructions,
          voice, and memory.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {controls.map(({ label, detail, icon: Icon, to }) => (
          <Link
            key={label}
            to={to}
            className="group flex min-h-20 items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-background px-4 py-3 text-left transition-colors hover:border-primary/35 hover:bg-accent"
          >
            <span>
              <span className="block text-sm font-semibold text-foreground">{label}</span>
              <span className="mt-1 block font-mono text-[var(--wireline-typography-overline-size)] uppercase tracking-[.045em] text-muted-foreground">
                {detail}
              </span>
            </span>
            <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-muted text-foreground transition-colors group-hover:bg-card">
              <Icon aria-hidden="true" size={16} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function RosterCard({ agent }: { agent: WorkspaceAgentSummary }) {
  const channel = agent.channel || "voice";
  const ChannelIcon = channel === "voice" ? Phone : MessageSquare;
  const encodedAgentId = encodeURIComponent(agent.id);
  const controlLinks = [
    {
      label: "Knowledge",
      icon: Database,
      to: `/training?agent=${encodedAgentId}&section=facts`,
    },
    {
      label: "Instructions",
      icon: ShieldCheck,
      to: `/training?agent=${encodedAgentId}&section=guidance`,
    },
    {
      label: "Voice",
      icon: Mic2,
      to: `/studio?agent=${encodedAgentId}&tab=training&sub=voices`,
    },
    {
      label: "Memory",
      icon: Brain,
      to: `/studio?agent=${encodedAgentId}&tab=memory`,
    },
  ] as const;
  return (
    <article className="studio-card wl-card-action flex min-h-[300px] flex-col p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-accent text-base font-semibold text-primary">
          {agent.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <PostureBadge isBusiness={Boolean(agent.is_business_agent)} />
            <Badge variant="success">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
              Ready
            </Badge>
          </div>
          <h2 className="mt-3 truncate font-[var(--wireline-font-family-display)] text-[var(--wireline-typography-h3-size)] font-semibold leading-6 tracking-[-.02em] text-[var(--wireline-color-text-primary)]">
            {agent.name}
          </h2>
          <p className="mt-1 inline-flex min-w-0 items-center gap-2 font-mono text-[var(--wireline-typography-overline-size)] capitalize tracking-[.035em] text-[var(--wireline-color-text-secondary)]">
            <span>{formatAgentRoleLabel(agent.role)}</span>
            <ChannelIcon size={12} />
            <span>{channel}</span>
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 rounded-[var(--radius-lg)] border border-border bg-background p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Line</span>
          <Link to="/settings/apps" className="font-semibold text-foreground hover:text-primary">
            {agent.phone_number || "Configure number"}
          </Link>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Integrations</span>
          <Link
            to={`/actions?agent=${encodeURIComponent(agent.id)}`}
            className="font-semibold text-foreground hover:text-primary"
          >
            Manage
          </Link>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Usage</span>
          <Link to="/settings/billing" className="font-semibold text-foreground hover:text-primary">
            Balance
          </Link>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {controlLinks.map(({ label, icon: Icon, to }) => (
          <Link
            key={label}
            to={to}
            className="flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-accent"
          >
            <Icon aria-hidden="true" size={15} />
            {label}
          </Link>
        ))}
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-3.5 sm:flex sm:items-center sm:justify-between">
        <Button asChild variant="link" className="h-auto justify-start px-0 text-sm">
          <Link to={`/studio?agent=${encodedAgentId}`}>
            <Wrench aria-hidden="true" size={15} />
            Studio
          </Link>
        </Button>
        <Button
          asChild
          variant="link"
          className="h-auto justify-start px-0 text-sm text-muted-foreground hover:text-foreground"
        >
          <Link to={`/training?agent=${encodedAgentId}`}>
            <Database aria-hidden="true" size={15} />
            Training
          </Link>
        </Button>
        <Button
          asChild
          variant="link"
          className="h-auto justify-start px-0 text-sm text-muted-foreground hover:text-foreground"
        >
          <Link to={`/actions?agent=${encodedAgentId}`}>
            <Zap aria-hidden="true" size={15} />
            Wire
          </Link>
        </Button>
      </div>
    </article>
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
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="studio-kicker">{title}</p>
          <h2 className="wl-route-section-heading mt-1">{agents.length} active</h2>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link to={createHref}>
            <Plus aria-hidden="true" size={14} />
            {createLabel}
          </Link>
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
      title="Agents"
      contentClassName="py-6"
      action={
        <Button asChild size="sm">
          <Link to="/studio?create=1">
            <Plus aria-hidden="true" size={16} />
            Create agent
          </Link>
        </Button>
      }
    >
      <div className="flex w-full flex-col gap-6 pb-8">
        {degraded ? (
          <StatusNotice tone="destructive" title="Roster unavailable">
            Saved agents are unchanged. Try again in a moment.
          </StatusNotice>
        ) : null}
        {!loading && agents.length ? <AgentFlowPanel agent={agents[0]} /> : null}
        {!loading && agents.length ? (
          <section className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Roster"
              value={String(agents.length)}
              footer={rosterSummary(personalAgents.length, businessAgents.length)}
            />
            <MetricCard
              label="Personal"
              value={String(personalAgents.length)}
              footer="Your tasks"
            />
            <MetricCard
              label="Business"
              value={String(businessAgents.length)}
              footer="Your coverage"
            />
          </section>
        ) : null}
        {!loading && !agents.length ? <EmptyRoster /> : null}
        {loading ? <LoadingRoster /> : null}
        {!loading && agents.length ? (
          <div className="flex flex-col gap-9">
            <RosterSection
              title="Personal"
              agents={personalAgents}
              createHref="/studio?create=1"
              createLabel={PRODUCT_POSTURE.personal.createCta}
            />
            <RosterSection
              title="Business"
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
