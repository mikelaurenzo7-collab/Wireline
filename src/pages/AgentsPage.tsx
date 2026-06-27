import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  Brain,
  Database,
  MessageSquare,
  Mic2,
  Phone,
  Plus,
  Search,
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
} from "../lib/product-copy";

function EmptyRoster() {
  return (
    <section className="wl-setup-surface place-items-start sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
      <span className="grid size-12 place-items-center rounded-[var(--radius-lg)] bg-accent text-primary">
        <Bot size={23} strokeWidth={1.8} />
      </span>
      <div className="text-center">
        <p className="wl-setup-surface__eyebrow">First agent</p>
        <h2 className="wl-setup-surface__title mt-2">Start simple.</h2>
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
      className="grid grid-cols-1 gap-4 pb-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      aria-label="Loading roster"
      aria-busy="true"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="rounded-[var(--radius-xl)] border border-border bg-card p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Skeleton shape="circle" className="size-10" />
            <div className="flex-1 space-y-2">
              <div className="flex gap-1.5">
                <Skeleton shape="text" className="h-5 w-16" />
                <Skeleton shape="text" className="h-5 w-12" />
              </div>
              <Skeleton shape="text" className="h-[19px] w-3/4" />
              <Skeleton shape="text" className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton shape="text" className="mt-3 h-7 w-full" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Skeleton shape="text" className="h-[42px] w-full" />
            <Skeleton shape="text" className="h-[42px] w-full" />
          </div>
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
      <div className="text-center">
        <p className="studio-kicker">Flow</p>
        <h2 className="mt-1 max-w-3xl font-[var(--wireline-font-family-display)] text-[clamp(1.5rem,2.8vw,2rem)] font-semibold leading-[.95] tracking-[-0.03em] text-foreground">
          Create. Train. Run.
        </h2>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {controls.map(({ label, detail, icon: Icon, to }) => (
          <Link
            key={label}
            to={to}
            className="group flex min-h-[74px] items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-background px-4 py-3 text-left transition-all hover:border-primary/30 hover:bg-accent"
          >
            <span>
              <span className="block text-sm font-semibold text-foreground">{label}</span>
              <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[.05em] text-muted-foreground">
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
    <article className="studio-card wl-card-action group flex flex-col p-4 sm:p-5 transition-colors hover:border-primary/15">
      {/* Identity row — name always prominent and readable */}
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-accent text-base font-semibold text-primary">
          {agent.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <PostureBadge isBusiness={Boolean(agent.is_business_agent)} />
            <Badge variant="success">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
              Ready
            </Badge>
          </div>
          <h2 className="mt-2 font-[var(--wireline-font-family-display)] text-[var(--wireline-typography-h3-size)] font-semibold leading-6 tracking-[-0.015em] text-foreground">
            {agent.name}
          </h2>
          <p className="mt-0.5 inline-flex min-w-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.04em] text-muted-foreground">
            <span className="capitalize">{formatAgentRoleLabel(agent.role)}</span>
            <span className="text-[10px]">·</span>
            <span className="inline-flex items-center gap-1">
              <ChannelIcon size={11} /> {channel}
            </span>
          </p>
        </div>
      </div>

      {/* Compact essentials row — avoids cramp and overflow */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border/60 bg-background/50 px-3 py-[7px] text-xs">
        <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <span className="font-medium text-[10px] uppercase tracking-wider">Line</span>
          <Link
            to="/settings/apps"
            className="max-w-[13ch] truncate font-semibold text-foreground group-hover:text-primary"
            title={agent.phone_number || undefined}
          >
            {agent.phone_number || "Configure number"}
          </Link>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="font-medium text-[10px] uppercase tracking-wider">Wire</span>
          <Link
            to={`/actions?agent=${encodeURIComponent(agent.id)}`}
            className="font-semibold text-foreground group-hover:text-primary"
          >
            Manage
          </Link>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="font-medium text-[10px] uppercase tracking-wider">Usage</span>
          <Link to="/settings/billing" className="font-semibold text-foreground group-hover:text-primary">
            Balance
          </Link>
        </div>
      </div>

      {/* Primary actions — spacious, no overlay, clear labels */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {controlLinks.map(({ label, icon: Icon, to }) => (
          <Link
            key={label}
            to={to}
            className="flex min-h-[42px] items-center gap-2 rounded-[var(--radius-md)] border border-border bg-card px-3 text-sm font-semibold text-foreground transition-all hover:border-primary/25 hover:bg-accent hover:shadow-sm"
          >
            <Icon aria-hidden="true" size={15} />
            <span>{label}</span>
          </Link>
        ))}
      </div>

      {/* Footer actions — always reachable, clean */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/70 pt-3 text-sm">
        <Button asChild variant="link" className="h-auto justify-start px-0 text-sm font-medium">
          <Link to={`/studio?agent=${encodedAgentId}`}>
            <Wrench aria-hidden="true" size={15} className="mr-1" />
            Studio
          </Link>
        </Button>
        <Button
          asChild
          variant="link"
          className="h-auto justify-start px-0 text-sm text-muted-foreground hover:text-foreground"
        >
          <Link to={`/training?agent=${encodedAgentId}`}>
            <Database aria-hidden="true" size={15} className="mr-1" />
            Training
          </Link>
        </Button>
        <Button
          asChild
          variant="link"
          className="h-auto justify-start px-0 text-sm text-muted-foreground hover:text-foreground"
        >
          <Link to={`/actions?agent=${encodedAgentId}`}>
            <Zap aria-hidden="true" size={15} className="mr-1" />
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
      <div className="mb-3 flex items-center justify-between gap-3 text-center">
        <div className="w-full">
          <p className="studio-kicker text-center">{title}</p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link to={createHref}>
            <Plus aria-hidden="true" size={13} />
            {createLabel}
          </Link>
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {agents.map((agent) => (
          <RosterCard key={agent.id} agent={agent} />
        ))}
      </div>
    </section>
  );
}

export default function AgentsPage() {
  const { agents, loading, degraded } = useAgents();
  const [search, setSearch] = useState("");

  const filtered = agents.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    formatAgentRoleLabel(a.role).toLowerCase().includes(search.toLowerCase())
  );

  const personalAgents = filtered.filter((agent) => !agent.is_business_agent);
  const businessAgents = filtered.filter((agent) => agent.is_business_agent);
  const totalFiltered = filtered.length;
  const isFiltering = search.trim().length > 0;

  return (
    <WorkspaceShell
      eyebrow={PRODUCT_VERSATILITY.eyebrow}
      title="Fleet"
      contentClassName="pt-1 pb-8"
      action={
        <Button asChild size="sm">
          <Link to="/studio?create=1">
            <Plus aria-hidden="true" size={16} />
            Create agent
          </Link>
        </Button>
      }
    >
      <div className="flex w-full flex-col gap-5 pb-6">
        {degraded ? (
          <StatusNotice tone="destructive" title="Roster unavailable">
            Saved agents are unchanged. Try again in a moment.
          </StatusNotice>
        ) : null}

        {!loading && agents.length ? <AgentFlowPanel agent={agents[0]} /> : null}

        {!loading && agents.length ? (
          <section className="grid gap-3 md:grid-cols-3">
            <MetricCard label="Roster" value={String(agents.length)} />
            <MetricCard label="Personal" value={String(agents.filter((a) => !a.is_business_agent).length)} />
            <MetricCard label="Business" value={String(agents.filter((a) => a.is_business_agent).length)} />
          </section>
        ) : null}

        {!loading && !agents.length ? <EmptyRoster /> : null}
        {loading ? <LoadingRoster /> : null}

        {!loading && agents.length ? (
          <div className="flex flex-col gap-7">
            {/* Purposeful, functional search bar */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search agents or roles..."
                  className="w-full rounded-[var(--radius-md)] border border-border bg-background pl-9 pr-3 py-[7px] text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30 focus-visible:ring-offset-1"
                  aria-label="Search agents"
                />
              </div>
              {isFiltering && (
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  {totalFiltered} of {agents.length}
                </span>
              )}
            </div>

            <RosterSection
              title="Personal"
              agents={personalAgents}
              createHref="/studio?create=1"
              createLabel="New"
            />
            <RosterSection
              title="Business"
              agents={businessAgents}
              createHref="/studio?create=1&posture=business"
              createLabel="New"
            />

            {isFiltering && totalFiltered === 0 && (
              <div className="py-4 text-sm text-muted-foreground">
                No agents match “{search}”. <button onClick={() => setSearch("")} className="underline hover:no-underline">Clear search</button>.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
