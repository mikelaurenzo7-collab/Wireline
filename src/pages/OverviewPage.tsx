import {
  ArrowRight,
  Bot,
  Briefcase,
  Cable,
  CheckCircle2,
  FileText,
  Inbox,
  Plus,
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

const WORKSPACE_MOVES = [
  { href: "/inbox", icon: Inbox, title: "Inbox", label: "Approvals and follow-up" },
  {
    href: "/training",
    icon: FileText,
    title: "Training",
    label: "Rules, sources, and evaluation",
  },
  { href: "/actions", icon: Cable, title: "Wire", label: "Numbers, routing, and integrations" },
] as const;

function RosterLoading() {
  return (
    <div
      className="grid gap-3 pt-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      aria-busy="true"
      aria-label="Loading roster"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="studio-card min-h-[172px] p-4">
          <div className="flex items-start justify-between gap-3">
            <Skeleton shape="circle" className="size-9" />
            <Skeleton shape="text" className="h-3 w-12" />
          </div>
          <Skeleton shape="text" className="mt-5 h-5 w-3/4" />
          <Skeleton shape="text" className="mt-2 h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export default function OverviewPage() {
  const { agents, loading, degraded } = useAgents();
  const personalCount = agents.filter((agent) => !agent.is_business_agent).length;
  const businessCount = agents.filter((agent) => agent.is_business_agent).length;
  const hasAgents = !loading && agents.length > 0;

  return (
    <WorkspaceShell
      title="Overview"
      eyebrow="Workspace"
      action={
        <Button asChild size="sm">
          <Link to="/studio?create=1">
            <Plus aria-hidden="true" size={16} />
            New agent
          </Link>
        </Button>
      }
      contentClassName="py-5"
    >
      <div className="wl-overview flex w-full max-w-none flex-col pb-8">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.85fr)]">
          <div className="wl-overview-hero studio-card flex flex-col justify-between border-primary/20 bg-secondary p-6 sm:p-7">
            <div>
              <p className="studio-kicker">{"Create -> Train -> Run"}</p>
              <h2 className="wl-section-title mt-3 max-w-[18ch] text-[clamp(1.75rem,1.4rem+1.6vw,2.5rem)]">
                {hasAgents ? "Run the work." : "Create one useful agent."}
              </h2>
              <p className="wl-overview-hero-copy mt-3">
                {hasAgents
                  ? "Studio runs calls, texts, follow-up, approvals, and handoff. Training owns the heavy setup."
                  : "Start with a short intake. Train the deeper rules after the agent exists."}
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <Link to={hasAgents ? "/studio" : "/studio?create=1"}>
                  {hasAgents ? "Open Studio" : "Create agent"}
                  <ArrowRight aria-hidden="true" size={16} />
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
            <div>
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
          <StatusNotice tone="warning" title="Workspace status is partially unavailable.">
            Roster details may be stale until the affected connection recovers.
          </StatusNotice>
        ) : null}

        {!loading && !agents.length ? (
          <section className="grid gap-4 md:grid-cols-2">
            <article className="studio-card flex min-h-[178px] flex-col justify-between p-6">
              <span className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                <User aria-hidden="true" size={19} />
              </span>
              <div className="mt-5">
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
              <div className="mt-5">
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
            <div>
              <p className="studio-kicker">Workspace</p>
              <h2 className="wl-section-title mt-2">Where to work next.</h2>
            </div>
            {hasAgents ? (
              <Button asChild variant="link" className="h-auto px-0 text-sm">
                <Link to="/agents">
                  View agents <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </Button>
            ) : null}
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            {WORKSPACE_MOVES.map(({ href, icon: Icon, title, label }) => (
              <Link
                key={href}
                to={href}
                className="wl-overview-shortcut studio-card wl-card-action group flex flex-col p-5 text-left"
              >
                <Icon aria-hidden="true" className="size-5 text-primary" />
                <div className="mt-auto flex items-end justify-between gap-3">
                  <div>
                    <h3 className="wl-card-title">{title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{label}</p>
                  </div>
                  <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-primary" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="studio-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
            <div>
              <p className="studio-kicker">Your agents</p>
              <h2 className="wl-section-title mt-2">
                {hasAgents ? "Ready for work" : "No agents yet"}
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
            <div className="grid gap-3 pt-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {agents.slice(0, 8).map((agent) => (
                <Link
                  key={agent.id}
                  to={`/studio?agent=${encodeURIComponent(agent.id)}`}
                  className="wl-overview-roster-card studio-card wl-card-action group p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                      <Bot aria-hidden="true" size={18} />
                    </span>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="wl-overline text-[var(--wireline-typography-overline-size)]">
                        {agent.channel || "voice"}
                      </span>
                      <PostureBadge isBusiness={Boolean(agent.is_business_agent)} compact />
                    </div>
                  </div>
                  <h3 className="wl-card-title">{agent.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatAgentRoleLabel(agent.role)}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[152px] flex-col items-start justify-center gap-3 py-6">
              <Sparkles aria-hidden="true" className="size-6 text-primary" />
              <p className="text-sm text-muted-foreground">
                Create your first agent from a focused brief.
              </p>
            </div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
