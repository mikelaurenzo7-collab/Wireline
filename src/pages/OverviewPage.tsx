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
import {
  formatAgentRoleLabel,
  PRODUCT_POSTURE,
  PRODUCT_VERSATILITY,
  rosterSummary,
} from "../lib/product-copy";

const WORKSPACE_MOVES = [
  {
    href: "/inbox",
    icon: Inbox,
    title: "Review the outcome",
    body: "See conversations, handoffs, and the next approved step in one place.",
    label: "Open inbox",
  },
  {
    href: "/knowledge",
    icon: FileText,
    title: "Keep context current",
    body: "Give every assistant the facts, policies, and language it needs before it speaks for you.",
    label: "Open knowledge",
  },
  {
    href: "/actions",
    icon: Cable,
    title: "Connect useful actions",
    body: "Bring in calendars, inboxes, and systems only when they make a real job easier to complete.",
    label: "Review connections",
  },
] as const;

function RosterLoading() {
  return (
    <div
      className="grid gap-3 pt-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      aria-busy="true"
      aria-label="Loading roster"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="studio-card min-h-[190px] p-4">
          <div className="flex items-start justify-between gap-3">
            <Skeleton shape="circle" className="size-9" />
            <Skeleton shape="text" className="h-3 w-12" />
          </div>
          <Skeleton shape="text" className="mt-5 h-5 w-3/4" />
          <Skeleton shape="text" className="mt-2 h-4 w-1/2" />
          <Skeleton shape="text" className="mt-6 h-4 w-24" />
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
            New assistant
          </Link>
        </Button>
      }
      contentClassName="py-6"
    >
      <div className="flex w-full max-w-none flex-col gap-5 pb-8">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.85fr)]">
          <div className="studio-card flex flex-col justify-between border-primary/20 bg-secondary p-6 sm:p-7">
            <div>
              <p className="studio-kicker">Your workspace</p>
              <h2 className="wl-section-title mt-3 max-w-[25ch] text-[clamp(1.75rem,1.4rem+1.6vw,2.5rem)]">
                {hasAgents
                  ? "Keep every useful conversation moving."
                  : "Start with one conversation worth delegating."}
              </h2>
              <p className="wl-page-copy mt-3">
                {hasAgents
                  ? "Review the outcome, adjust the rules, and give each assistant only the context and actions it needs to do its job well."
                  : "Give Wireline a focused brief. It can handle a personal task or a business conversation while you keep the boundaries and the final decision."}
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <Link to={hasAgents ? "/inbox" : "/studio?create=1"}>
                  {hasAgents ? "Review inbox" : "Create an assistant"}
                  <ArrowRight aria-hidden="true" size={16} />
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to={hasAgents ? "/agents" : "/studio?create=1&posture=business"}>
                  {hasAgents ? "Manage assistants" : "Create a business agent"}
                </Link>
              </Button>
            </div>
          </div>

          <aside className="studio-card flex flex-col justify-between p-6 sm:p-7">
            <div>
              <p className="studio-kicker">Workspace status</p>
              <div className="mt-5 flex items-end gap-2">
                <span className="wl-metric-value">{loading ? "–" : agents.length}</span>
                <span className="pb-0.5 text-sm text-muted-foreground">
                  {agents.length === 1 ? "assistant" : "assistants"}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {degraded
                  ? "Some workspace information could not be refreshed. Check the connections your agents depend on before relying on them."
                  : hasAgents
                    ? rosterSummary(personalCount, businessCount)
                    : "A focused first brief is enough to start. You can add channels, context, and connected actions later."}
              </p>
            </div>
            <div className="mt-6 border-t border-border pt-4">
              {degraded ? (
                <Badge variant="warning">Needs a quick check</Badge>
              ) : (
                <Badge variant="success">
                  <CheckCircle2 aria-hidden="true" className="size-3.5" />
                  {hasAgents ? "Ready for refinement" : "Ready to begin"}
                </Badge>
              )}
            </div>
          </aside>
        </section>

        {degraded ? (
          <StatusNotice tone="warning" title="Workspace status is partially unavailable.">
            Any roster details shown here may be stale until the affected connection recovers.
          </StatusNotice>
        ) : null}

        {!loading && !agents.length ? (
          <section className="grid gap-4 md:grid-cols-2">
            <article className="studio-card flex min-h-[232px] flex-col p-6">
              <span className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                <User aria-hidden="true" size={19} />
              </span>
              <h2 className="wl-section-title mt-5 text-[clamp(1.25rem,1.1rem+.55vw,1.5rem)]">
                {PRODUCT_POSTURE.personal.createCta}
              </h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                {PRODUCT_POSTURE.personal.emptyBody}
              </p>
              <Button asChild variant="secondary" size="sm" className="mt-6 w-fit">
                <Link to="/studio?create=1">Start personal</Link>
              </Button>
            </article>
            <article className="studio-card flex min-h-[232px] flex-col p-6">
              <span className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                <Briefcase aria-hidden="true" size={19} />
              </span>
              <h2 className="wl-section-title mt-5 text-[clamp(1.25rem,1.1rem+.55vw,1.5rem)]">
                {PRODUCT_POSTURE.business.createCta}
              </h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                {PRODUCT_POSTURE.business.emptyBody}
              </p>
              <Button asChild variant="secondary" size="sm" className="mt-6 w-fit">
                <Link to="/studio?create=1&posture=business">Start business</Link>
              </Button>
            </article>
          </section>
        ) : null}

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="studio-kicker">Operating system</p>
              <h2 className="wl-section-title mt-2">The three places that keep work useful.</h2>
            </div>
            {hasAgents ? (
              <Button asChild variant="link" className="h-auto px-0 text-sm">
                <Link to="/agents">
                  View assistants <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </Button>
            ) : null}
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            {WORKSPACE_MOVES.map(({ href, icon: Icon, title, body, label }) => (
              <Link
                key={href}
                to={href}
                className="studio-card wl-card-action group flex min-h-[198px] flex-col p-5 text-left"
              >
                <Icon aria-hidden="true" className="size-5 text-primary" />
                <h3 className="wl-card-title mt-5 text-[var(--wireline-typography-body-size)]">
                  {title}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{body}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                  {label} <ArrowRight aria-hidden="true" size={15} />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="studio-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
            <div>
              <p className="studio-kicker">Your roster</p>
              <h2 className="wl-section-title mt-2">
                {hasAgents ? "Assistants ready for work" : PRODUCT_POSTURE.personal.emptyTitle}
              </h2>
              {!hasAgents ? (
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {PRODUCT_VERSATILITY.tagline} Start personal, then add business agents when the
                  work needs a professional line.
                </p>
              ) : null}
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link to={hasAgents ? "/agents" : "/studio?create=1"}>
                {hasAgents ? "Manage assistants" : "Create an assistant"}
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
                  className="studio-card wl-card-action group min-h-[190px] p-4"
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
                  <h3 className="wl-card-title mt-5">{agent.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatAgentRoleLabel(agent.role)}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    Open Studio <ArrowRight aria-hidden="true" size={15} />
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[190px] flex-col items-start justify-center gap-3 py-8">
              <Sparkles aria-hidden="true" className="size-6 text-primary" />
              <p className="max-w-lg text-sm leading-6 text-muted-foreground">
                Choose the first job, add what the assistant needs to know, and only then connect
                the actions it should be allowed to take.
              </p>
            </div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
