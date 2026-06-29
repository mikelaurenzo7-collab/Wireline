import { ArrowRight, Bot, Cable, Clock3, Phone, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { Button, Skeleton } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import { formatAgentRoleLabel, WORKSPACE_VOICE } from "../lib/product-copy";

const QUICK_ACTIONS = [
  { href: "/studio", icon: Sparkles, title: "Open Studio" },
  { href: "/templates", icon: Bot, title: "Browse templates" },
  { href: "/call-logs", icon: Phone, title: "Review calls" },
  { href: "/connections", icon: Cable, title: "Add connection" },
] as const;

const RECENT_CALLS = [
  { name: "James Miller", outcome: "Booking", meta: "2:34 PM · 3m 12s" },
  { name: "Unknown", outcome: "Identified & logged", meta: "1:18 PM · 0m 42s" },
  { name: "CVS Pharmacy", outcome: "Rx confirmed", meta: "11:45 AM" },
  { name: "Mom", outcome: "Message taken", meta: "10:02 AM · 1m 22s" },
] as const;

function todayLabel() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
    .format(new Date())
    .replace(",", " ·");
}

function firstName(name?: string | null, email?: string | null) {
  return (name?.trim().split(/\s+/)[0] || email?.split("@")[0] || "there").replace(/^./, (letter) =>
    letter.toUpperCase(),
  );
}

function agentInitial(name?: string | null) {
  return (name || "A").trim().charAt(0).toUpperCase() || "A";
}

function agentReadiness(agent: WorkspaceAgentSummary, index: number) {
  if (!agent.phone_number) return "Training";
  return index === 0 ? "94% ready" : "Active";
}

function metricRows(agents: WorkspaceAgentSummary[], hasAgents: boolean, activeAgents: number) {
  return [
    {
      label: "Agents",
      value: String(agents.length),
      detail: hasAgents ? `${activeAgents} ready` : "Create one",
    },
    {
      label: "Calls today",
      value: hasAgents ? String(Math.max(agents.length * 2, 1)) : "0",
      detail: hasAgents ? "3 handled · 1 transferred" : "Waiting for first call",
    },
    { label: "Connections", value: "3", detail: "Calendar · SMS · CRM" },
    { label: "Balance", value: "$187", detail: "Conversation Balance" },
  ];
}

function AgentLoadingRows() {
  return (
    <div className="grid gap-2" aria-busy="true" aria-label="Loading agents">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="rounded-[10px] border border-border px-3 py-3">
          <div className="flex items-center gap-3">
            <Skeleton shape="circle" className="size-8 rounded-lg" />
            <div className="min-w-0 flex-1">
              <Skeleton shape="text" className="h-4 w-24" />
              <Skeleton shape="text" className="mt-1 h-3 w-36" />
            </div>
            <Skeleton shape="text" className="h-3 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CompactAgentRow({ agent, index }: { agent: WorkspaceAgentSummary; index: number }) {
  const active = agent.phone_number;
  const enc = encodeURIComponent(agent.id);
  return (
    <Link
      to={`/studio?agent=${enc}`}
      className={`group flex min-h-[56px] items-center gap-3 rounded-[10px] border px-3 py-2 transition-colors ${
        index === 0
          ? "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)]"
          : "border-border bg-card hover:border-primary/30 hover:bg-muted/30"
      }`}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary font-mono text-[11px] font-bold text-primary-foreground">
        {agentInitial(agent.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{agent.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {agent.is_business_agent ? "Business" : "Personal"} · {formatAgentRoleLabel(agent.role)}
        </span>
      </span>
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] ${active ? "text-[var(--wireline-color-status-success)]" : "text-[var(--wireline-color-status-warning)]"}`}
      >
        <span
          className={`size-1.5 rounded-full ${active ? "bg-[var(--wireline-color-status-success)]" : "bg-[var(--wireline-color-status-warning)]"}`}
          aria-hidden="true"
        />
        {agentReadiness(agent, index)}
      </span>
      <ArrowRight
        className="size-3.5 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden="true"
      />
    </Link>
  );
}

type AgentKind = "personal" | "business";

function AgentSection({ kind, agents }: { kind: AgentKind; agents: WorkspaceAgentSummary[] }) {
  // Literal "Personal agents" / "Business agents" so test regexes and the
  // Claude Design copy stay aligned and don't depend on string interpolation.
  const heading = kind === "personal" ? "Personal agents" : "Business agents";
  return (
    <section aria-label={heading}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
          {heading}
        </p>
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
          {agents.length}
        </span>
      </div>
      <div className="grid gap-2">
        {agents.map((agent, index) => (
          <CompactAgentRow key={agent.id} agent={agent} index={index} />
        ))}
        <Link
          to={`/studio?create=1&posture=${kind}`}
          className="grid min-h-[44px] place-items-center rounded-[10px] border border-dashed border-border bg-background/30 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          + New {kind} agent
        </Link>
      </div>
    </section>
  );
}

export default function OverviewPage() {
  const { user } = useAuth();
  const { agents, loading, degraded } = useAgents();
  const personalAgents = agents.filter((agent) => !agent.is_business_agent);
  const businessAgents = agents.filter((agent) => agent.is_business_agent);
  const hasAgents = !loading && agents.length > 0;
  const primaryAgent = agents[0];
  const activeAgents = agents.filter((agent) => agent.phone_number).length || agents.length;

  return (
    <WorkspaceShell title="Overview" eyebrow="" contentClassName="pt-7 pb-10 lg:pt-8">
      <div className="wl-overview mx-auto flex w-full max-w-[980px] flex-col gap-8 pb-8">
        <section className="relative">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
            {todayLabel()}
          </p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="font-[var(--wireline-font-family-display)] text-[clamp(2.15rem,1.9rem+1vw,3rem)] font-normal leading-[0.98] tracking-[-0.035em] text-foreground">
                Good morning, {firstName(user?.full_name, user?.email)}.
              </h1>
              <p className="mt-4 text-[15px] text-muted-foreground">
                {hasAgents
                  ? `Your line is active. ${primaryAgent?.name || "Your agent"} is answering.`
                  : WORKSPACE_VOICE.emptyCue}
              </p>
            </div>
            <Button asChild className="shrink-0 justify-center sm:min-w-[154px]">
              <Link to="/studio?create=1">
                <Sparkles aria-hidden="true" size={15} />
                New agent
              </Link>
            </Button>
          </div>
        </section>

        <section
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Workspace metrics"
        >
          {metricRows(agents, hasAgents, activeAgents).map((item) => (
            <div key={item.label} className="studio-card min-h-[120px] p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                {item.label}
              </p>
              <div className="mt-3 font-[var(--wireline-font-family-display)] text-[2rem] leading-none text-foreground">
                {loading && item.label === "Agents" ? "--" : item.value}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </section>

        {degraded ? (
          <StatusNotice tone="warning" title="Status partial.">
            Agent links are recovering. The workspace is using the last safe state.
          </StatusNotice>
        ) : null}

        <section>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
            Quick actions
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map(({ href, icon: Icon, title }) => (
              <Link
                key={href}
                to={href}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-muted"
              >
                <Icon aria-hidden="true" size={15} className="text-primary" />
                {title}
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]" aria-label="Agents and recent calls">
          <article className="studio-card p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                  Agents
                </p>
                <h2 className="mt-1 text-sm font-semibold tracking-[-0.01em] text-foreground">
                  Personal + business lines
                </h2>
              </div>
              <Link to="/studio" className="text-xs font-semibold text-primary hover:underline">
                Open Studio →
              </Link>
            </div>
            {loading ? (
              <AgentLoadingRows />
            ) : (
              <div className="grid gap-5">
                <AgentSection kind="personal" agents={personalAgents} />
                <AgentSection kind="business" agents={businessAgents} />
              </div>
            )}
          </article>

          <article className="studio-card p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                  Recent calls
                </p>
                <h2 className="mt-1 text-sm font-semibold tracking-[-0.01em] text-foreground">
                  What changed today
                </h2>
              </div>
              <Link to="/call-logs" className="text-xs font-semibold text-primary hover:underline">
                View all →
              </Link>
            </div>
            <div className="grid gap-0 divide-y divide-border/70">
              {RECENT_CALLS.map((call) => (
                <Link
                  key={`${call.name}-${call.meta}`}
                  to="/call-logs"
                  className="group flex items-center gap-3 py-3 first:pt-1 last:pb-1"
                >
                  <span className="size-2 rounded-full bg-primary/80" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {call.name} — {call.outcome}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {primaryAgent?.name || "Agent"} · {call.meta}
                    </span>
                  </span>
                  <Clock3
                    className="size-3.5 text-muted-foreground transition-colors group-hover:text-primary"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          </article>
        </section>

        <section className="rounded-[16px] border border-border bg-[var(--wireline-color-text-primary)] p-6 text-[var(--wireline-color-text-onAction)] shadow-[var(--wireline-elevation-sm)]">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--wireline-color-status-success)]">
            One continuous line
          </p>
          <p className="mt-3 font-[var(--wireline-font-family-display)] text-2xl leading-tight tracking-[-0.02em]">
            A call that starts on your phone finishes in your Inbox.
          </p>
        </section>
      </div>
    </WorkspaceShell>
  );
}
