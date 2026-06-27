import {
  ArrowRight,
  Bot,
  Briefcase,
  Cable,
  CheckCircle2,
  FileText,
  Inbox,
  PlayCircle,
  Plus,
  SlidersHorizontal,
  Sparkles,
  User,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Button, Skeleton } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";
import PostureBadge from "../components/ui/PostureBadge";
import { useAgents } from "../contexts/AgentsContext";
import { formatAgentRoleLabel, rosterSummary } from "../lib/product-copy";

const CREATE_TRAIN_RUN = "Create -> Train -> Run";

const WORKSPACE_MOVES = [
  { href: "/inbox", icon: Inbox, title: "Inbox", label: "Approve. Follow up." },
  {
    href: "/training",
    icon: FileText,
    title: "Training",
    label: "Facts. Rules. Voice.",
  },
  { href: "/actions", icon: Cable, title: "Wire", label: "Connect everything." },
  {
    href: "/settings/customization",
    icon: SlidersHorizontal,
    title: "Customize",
    label: "One voice. Everywhere.",
  },
] as const;

function operatingSteps(activeAgentId: string | null) {
  const encodedAgentId = activeAgentId ? encodeURIComponent(activeAgentId) : null;
  return [
    {
      step: "01",
      label: "Create",
      title: "Brief it.",
      detail: "Name. Role. Voice. Done.",
      href: "/studio?create=1",
      action: "Create agent",
      icon: Plus,
    },
    {
      step: "02",
      label: "Train",
      title: "Forge it.",
      detail: "Facts. Rules. Voice. Memory.",
      href: encodedAgentId ? `/training?agent=${encodedAgentId}` : "/training",
      action: "Open Training",
      icon: FileText,
    },
    {
      step: "03",
      label: "Run",
      title: "Task it.",
      detail: "Calls. Texts. Handoff.",
      href: encodedAgentId ? `/studio?agent=${encodedAgentId}&mode=workroom` : "/studio?create=1",
      action: "Open Studio",
      icon: PlayCircle,
    },
  ] as const;
}

function RosterLoading() {
  return (
    <div
      className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      aria-busy="true"
      aria-label="Loading roster"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="studio-card min-h-[168px] p-4">
          <div className="flex items-start justify-between gap-3">
            <Skeleton shape="circle" className="size-9" />
            <Skeleton shape="text" className="h-3 w-12" />
          </div>
          <Skeleton shape="text" className="mt-4 h-5 w-3/4" />
          <Skeleton shape="text" className="mt-1.5 h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function OperatingPath({ activeAgentId }: { activeAgentId: string | null }) {
  const steps = operatingSteps(activeAgentId);
  return (
    <section className="studio-card grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(220px,.65fr)_minmax(0,1fr)] xl:items-center">
      <div className="text-center">
        <p className="studio-kicker">Loop</p>
        <h2 className="mt-1 font-semibold tracking-[-0.02em]">Create. Train. Run.</h2>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {steps.map(({ step, label, title, detail, href, action, icon: Icon }) => (
          <Link
            key={label}
            to={href}
            className="group flex min-h-[148px] flex-col justify-between rounded-[var(--radius-lg)] border border-border bg-background p-4 text-left transition-colors hover:border-primary/25 hover:bg-accent"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                {step} / {label}
              </span>
              <span className="grid size-8 place-items-center rounded-md bg-muted text-foreground transition-colors group-hover:bg-card">
                <Icon aria-hidden="true" size={15} />
              </span>
            </div>
            <div className="mt-3.5">
              <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
              <p className="mt-1 text-xs leading-snug text-muted-foreground">{detail}</p>
              <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                {action} <ArrowRight aria-hidden="true" size={13} className="transition group-hover:translate-x-px" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function OverviewPage() {
  const { agents, loading, degraded } = useAgents();
  const personalCount = agents.filter((agent) => !agent.is_business_agent).length;
  const businessCount = agents.filter((agent) => agent.is_business_agent).length;
  const hasAgents = !loading && agents.length > 0;
  const activeAgentId = agents[0]?.id || null;

  return (
    <WorkspaceShell
      title="Home"
      eyebrow="Workspace"
      action={
        <Button asChild size="sm">
          <Link to="/studio?create=1">
            <Plus aria-hidden="true" size={16} />
            New agent
          </Link>
        </Button>
      }
      contentClassName="pt-0.5 pb-8"
    >
      <div className="wl-overview flex w-full max-w-none flex-col pb-8">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.85fr)]">
          <div className="wl-overview-hero studio-card flex flex-col justify-between border-primary/20 bg-secondary p-6 sm:p-7">
            <div className="text-center sm:text-left">
              <p className="studio-kicker">{CREATE_TRAIN_RUN}</p>
              <h2 className="mt-2 max-w-[18ch] font-[var(--wireline-font-family-display)] text-[clamp(1.6rem,1.3rem+1.4vw,2.2rem)] font-semibold leading-tight tracking-[-0.03em] text-center sm:text-left">
                {hasAgents ? "Run the work." : "Build your agent."}
              </h2>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link to={hasAgents ? "/studio" : "/studio?create=1"}>
                  {hasAgents ? "Open Studio" : "Create agent"}
                  <ArrowRight aria-hidden="true" size={15} />
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to={hasAgents ? "/training" : "/studio?create=1&posture=business"}>
                  {hasAgents ? "Training" : "Business agent"}
                </Link>
              </Button>
            </div>
          </div>

          <aside className="studio-card flex flex-col justify-between p-6 sm:p-7">
            <div className="text-center">
              <p className="studio-kicker">Workspace status</p>
              <div className="mt-5 flex items-end gap-2">
                <span className="wl-metric-value">{loading ? "--" : agents.length}</span>
                <span className="pb-0.5 text-sm text-muted-foreground">
                  {agents.length === 1 ? "agent" : "agents"}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {degraded
                  ? "Check your connections."
                  : hasAgents
                    ? rosterSummary(personalCount, businessCount)
                    : "No agents yet."}
              </p>
            </div>
            <div className="mt-6 border-t border-border pt-4">
              {degraded ? (
                <Badge variant="warning">Needs a check</Badge>
              ) : (
                <Badge variant="success">
                  <CheckCircle2 aria-hidden="true" className="size-3.5" />
                  {hasAgents ? "Ready" : "Ready to begin"}
                </Badge>
              )}
            </div>
          </aside>
        </section>

        {degraded ? (
          <StatusNotice tone="warning" title="Status partial.">
            Connections recovering.
          </StatusNotice>
        ) : null}

        <OperatingPath activeAgentId={activeAgentId} />

        {!loading && !agents.length ? (
          <section className="grid gap-4 md:grid-cols-2">
            <article className="studio-card flex min-h-[178px] flex-col justify-between p-6">
              <span className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                <User aria-hidden="true" size={19} />
              </span>
              <div className="mt-5 text-center">
                <p className="studio-kicker">For you</p>
                <h2 className="wl-section-title mt-2 text-[clamp(1.25rem,1.1rem+.55vw,1.5rem)]">
                  Personal agent
                </h2>
              </div>
              <Button asChild variant="secondary" size="sm" className="mt-6 w-fit">
                <Link to="/studio?create=1">Start personal</Link>
              </Button>
            </article>
            <article className="studio-card flex min-h-[178px] flex-col justify-between p-6">
              <span className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                <Briefcase aria-hidden="true" size={19} />
              </span>
              <div className="mt-5 text-center">
                <p className="studio-kicker">For business</p>
                <h2 className="wl-section-title mt-2 text-[clamp(1.25rem,1.1rem+.55vw,1.5rem)]">
                  Business agent
                </h2>
              </div>
              <Button asChild variant="secondary" size="sm" className="mt-6 w-fit">
                <Link to="/studio?create=1&posture=business">Start business</Link>
              </Button>
            </article>
          </section>
        ) : null}

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="text-center sm:text-left">
              <p className="studio-kicker">Next</p>
              <h2 className="wl-section-title mt-1">Work here.</h2>
            </div>
            {hasAgents ? (
              <Button asChild variant="link" className="h-auto px-0 text-sm">
                <Link to="/agents">
                  View agents <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </Button>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {WORKSPACE_MOVES.map(({ href, icon: Icon, title, label }) => (
              <Link
                key={href}
                to={href}
                className="wl-overview-shortcut studio-card wl-card-action group flex flex-col p-5 text-center transition-colors hover:border-primary/20"
              >
                <Icon aria-hidden="true" className="size-5 text-primary mx-auto" />
                <div className="mt-auto flex flex-col items-center gap-3">
                  <div>
                    <h3 className="wl-card-title tracking-[-0.01em] text-center">{title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground text-center">{label}</p>
                  </div>
                  <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="studio-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
            <div className="text-center sm:text-left w-full sm:w-auto">
              <p className="studio-kicker">Your agents</p>
              <h2 className="wl-section-title mt-2 text-center sm:text-left">
                {hasAgents ? "Ready for work." : "No agents yet."}
              </h2>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link to={hasAgents ? "/agents" : "/studio?create=1"}>
                {hasAgents ? "Manage" : "Create agent"}
              </Link>
            </Button>
          </div>

          {loading ? (
            <RosterLoading />
          ) : hasAgents ? (
            <div className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {agents.slice(0, 8).map((agent) => (
                <Link
                  key={agent.id}
                  to={`/studio?agent=${encodeURIComponent(agent.id)}`}
                  className="wl-overview-roster-card studio-card wl-card-action group flex flex-col p-4 transition-colors hover:border-primary/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                      <Bot aria-hidden="true" size={18} />
                    </span>
                    <div className="flex flex-col items-end gap-1">
                      <span className="wl-overline text-[var(--wireline-typography-overline-size)]">
                        {agent.channel || "voice"}
                      </span>
                      <PostureBadge isBusiness={Boolean(agent.is_business_agent)} compact />
                    </div>
                  </div>
                  <h3 className="mt-2 wl-card-title tracking-[-0.01em]">{agent.name}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {formatAgentRoleLabel(agent.role)}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[152px] flex-col items-center justify-center gap-3 py-6 text-center">
              <Sparkles aria-hidden="true" className="size-6 text-primary" />
              <p className="text-sm text-muted-foreground">
                Brief it. Run it.
              </p>
            </div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
