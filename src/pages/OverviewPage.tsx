import { ArrowRight, Bot, Cable, Phone, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { Button, Skeleton } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import { formatAgentRoleLabel, WORKSPACE_VOICE } from "../lib/product-copy";

const QUICK_ACTIONS = [
  { href: "/studio", icon: Sparkles, title: "Open studio" },
  { href: "/showcase", icon: Bot, title: "See examples" },
  { href: "/call-logs", icon: Phone, title: "Review calls" },
  { href: "/connections", icon: Cable, title: "Add connection" },
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

function dayGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function titleCaseFirstGrapheme(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "there";
  const [first = "", ...rest] = Array.from(trimmed);
  return `${first.toLocaleUpperCase()}${rest.join("")}`;
}

function firstName(name?: string | null, email?: string | null) {
  const fromName = name?.trim().split(/\s+/u)[0];
  if (fromName) return titleCaseFirstGrapheme(fromName);

  const local = email?.split("@")[0]?.trim();
  if (!local) return "there";

  const firstSegment = local.split(/[._-]/u)[0]?.replace(/\p{Number}+$/u, "") ?? "";
  const lettersOnly = Array.from(firstSegment).every((char) => /\p{Letter}/u.test(char));
  if (!lettersOnly || firstSegment.length < 2 || firstSegment.length > 14) return "there";

  return titleCaseFirstGrapheme(firstSegment.toLocaleLowerCase());
}

function agentInitial(name?: string | null) {
  const [first = "A"] = Array.from((name || "A").trim());
  return first.toLocaleUpperCase() || "A";
}

function agentReadiness(agent: WorkspaceAgentSummary) {
  return agent.phone_number ? "Active" : "Training";
}

function metricRows(agents: WorkspaceAgentSummary[], loading: boolean) {
  const activeAgents = agents.filter((agent) => agent.phone_number).length;
  return [
    {
      label: "Agents",
      value: loading ? "--" : String(agents.length),
      detail: agents.length ? `${activeAgents} active · ${agents.length - activeAgents} training` : "Create one",
    },
    {
      label: "Calls today",
      value: "0",
      detail: "Connect call logs to populate",
    },
    {
      label: "Connections",
      value: "0",
      detail: "Add Calendar, SMS, or CRM",
    },
    {
      label: "Balance",
      value: "--",
      detail: "Shown after billing sync",
    },
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

function CompactAgentRow({ agent }: { agent: WorkspaceAgentSummary }) {
  const active = !!agent.phone_number;
  const enc = encodeURIComponent(agent.id);
  return (
    <Link
      to={`/studio?agent=${enc}`}
      className={`group flex min-h-[56px] items-center gap-3 rounded-[10px] border px-3 py-2 transition-colors ${
        active
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
        {agentReadiness(agent)}
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
  const heading = kind === "personal" ? "Personal agents" : "Business agents";
  return (
    <section aria-label={heading}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="wl-eyebrow">{heading}</p>
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
          {agents.length}
        </span>
      </div>
      <div className="grid gap-2">
        {agents.map((agent) => (
          <CompactAgentRow key={agent.id} agent={agent} />
        ))}
        <Link
          to={`/studio?create=1&posture=${kind}`}
          className="grid min-h-[42px] place-items-center rounded-[10px] border border-dashed border-border bg-background/30 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
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

  return (
    <WorkspaceShell title="Overview" eyebrow="" contentClassName="pt-5 pb-10 lg:pt-6">
      <div className="wl-overview mx-auto flex w-full max-w-[1040px] flex-col gap-6 pb-8">
        <section className="relative">
          <p className="wl-eyebrow">{todayLabel()}</p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="wl-display-2">{dayGreeting()}, {firstName(user?.full_name, user?.email)}.</h1>
              <p className="wl-lead mt-2.5 max-w-prose">
                {hasAgents
                  ? `${primaryAgent?.name || "Your agent"} is ready to train, run, and report back.`
                  : WORKSPACE_VOICE.emptyCue}
              </p>
            </div>
            <Button asChild className="shrink-0 justify-center sm:min-w-[148px]">
              <Link to="/studio?create=1">
                <Sparkles aria-hidden="true" size={15} />
                New agent
              </Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Workspace metrics">
          {metricRows(agents, loading).map((item) => (
            <div key={item.label} className="studio-card min-h-[112px] p-4 lg:p-5">
              <p className="wl-eyebrow">{item.label}</p>
              <div className="mt-2.5 font-[var(--wireline-font-family-display)] text-[2.1rem] leading-none text-foreground lg:text-[2.25rem]">
                {item.value}
              </div>
              <p className="mt-2.5 text-xs leading-5 text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </section>

        {degraded ? (
          <StatusNotice tone="warning" title="Status partial">
            Agent links are recovering. The workspace is using the last safe state.
          </StatusNotice>
        ) : null}

        <section>
          <p className="wl-eyebrow mb-3">Quick actions</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map(({ href, icon: Icon, title }) => (
              <Link
                key={href}
                to={href}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-border bg-card px-3.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-muted"
              >
                <Icon aria-hidden="true" size={15} className="text-primary" />
                {title}
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.04fr_0.96fr]" aria-label="Agents and recent calls">
          <article className="studio-card p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="wl-eyebrow">Agents</p>
                <h2 className="wl-card-heading mt-1">Personal and business lines</h2>
              </div>
              <Link to="/studio" className="text-xs font-semibold text-primary hover:underline">
                Open studio →
              </Link>
            </div>
            {loading ? (
              <AgentLoadingRows />
            ) : (
              <div className="grid gap-4">
                <AgentSection kind="personal" agents={personalAgents} />
                <AgentSection kind="business" agents={businessAgents} />
              </div>
            )}
          </article>

          <article className="studio-card p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="wl-eyebrow">Recent calls</p>
                <h2 className="wl-card-heading mt-1">What changed today</h2>
              </div>
              <Link to="/call-logs" className="text-xs font-semibold text-primary hover:underline">
                View all →
              </Link>
            </div>
            <div className="grid min-h-[164px] place-items-center rounded-[12px] border border-dashed border-border bg-background/40 px-5 py-7 text-center">
              <div>
                <p className="text-sm font-semibold text-foreground">No calls logged yet</p>
                <p className="mt-2 max-w-[30ch] text-xs leading-relaxed text-muted-foreground">
                  Real call activity will appear here after your first connected line runs.
                </p>
              </div>
            </div>
          </article>
        </section>

        <section className="rounded-[16px] border border-border bg-[var(--wireline-color-text-primary)] p-6 text-[var(--wireline-color-text-onAction)] shadow-[var(--wireline-elevation-sm)]">
          <p className="wl-eyebrow text-[var(--wireline-color-status-success)]">One continuous line</p>
          <p className="mt-3 font-[var(--wireline-font-family-display)] text-2xl leading-tight tracking-[-0.02em]">
            A call that starts on your phone finishes in your inbox.
          </p>
        </section>
      </div>
    </WorkspaceShell>
  );
}
