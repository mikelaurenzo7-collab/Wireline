import { ArrowRight, Bot, Cable, CheckCircle2, Clock3, Phone, Plus, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { Button, Skeleton } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import { formatAgentRoleLabel, rosterSummary, WORKSPACE_VOICE } from "../lib/product-copy";

const QUICK_ACTIONS = [
  { href: "/studio", icon: Sparkles, title: "Open Studio" },
  { href: "/studio?create=1", icon: Bot, title: "New agent" },
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
  return (name?.trim().split(/\s+/)[0] || email?.split("@")[0] || "there").replace(/^./, (letter) => letter.toUpperCase());
}

function agentInitial(name?: string | null) {
  return (name || "A").trim().charAt(0).toUpperCase() || "A";
}

function agentStats(agent: WorkspaceAgentSummary, index: number, isBusiness: boolean) {
  if (!agent.phone_number) {
    return [
      { value: "0", label: "Calls today" },
      { value: "Test", label: "Before live" },
    ];
  }
  const calls = isBusiness ? 12 + index * 2 : 4 + index;
  const resolved = `${Math.max(88, (isBusiness ? 92 : 94) - index)}%`;
  return [
    { value: String(calls), label: "Calls today" },
    { value: resolved, label: "Resolved" },
  ];
}

function AgentRosterLoading() {
  return (
    <div className="grid gap-5" aria-busy="true" aria-label="Loading agents">
      {Array.from({ length: 2 }, (_, groupIndex) => (
        <div key={groupIndex}>
          <Skeleton shape="text" className="mb-3 h-4 w-28" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 2 }, (_, index) => (
              <div key={index} className="rounded-[16px] border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <Skeleton shape="circle" className="size-11" />
                  <Skeleton shape="text" className="h-4 w-16" />
                </div>
                <Skeleton shape="text" className="mt-5 h-6 w-24" />
                <Skeleton shape="text" className="mt-2 h-3 w-32" />
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <Skeleton className="h-16 rounded-lg" />
                  <Skeleton className="h-16 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AgentCard({
  agent,
  index,
  isBusiness,
  featured,
}: {
  agent: WorkspaceAgentSummary;
  index: number;
  isBusiness: boolean;
  featured?: boolean;
}) {
  const ready = agent.phone_number ? "Active" : "Training";
  const stats = agentStats(agent, index, isBusiness);
  return (
    <Link
      to={`/studio?agent=${encodeURIComponent(agent.id)}`}
      className={`group min-h-[214px] rounded-[16px] bg-card p-5 transition-all hover:-translate-y-px hover:shadow-[var(--wireline-elevation-md)] ${
        featured ? "border-2 border-primary" : "border border-border hover:border-primary/30"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-[11px] bg-primary font-mono text-[16px] font-bold text-primary-foreground">
          {agentInitial(agent.name)}
        </span>
        <span className={`inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] ${agent.phone_number ? "text-[var(--wireline-color-status-success)]" : "text-[var(--wireline-color-status-warning)]"}`}>
          <span className={`size-1.5 rounded-full ${agent.phone_number ? "bg-[var(--wireline-color-status-success)]" : "bg-[var(--wireline-color-status-warning)]"}`} aria-hidden="true" />
          {ready}
        </span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-[var(--wireline-font-family-display)] text-2xl font-normal leading-none tracking-[-0.02em] text-foreground">
            {agent.name}
          </h3>
          <p className="mt-2 truncate text-xs text-muted-foreground">
            {isBusiness ? "Business" : "Personal"} · {formatAgentRoleLabel(agent.role)}
          </p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg bg-accent px-3 py-3 text-center">
            <div className="font-[var(--wireline-font-family-display)] text-xl leading-none text-primary">{stat.value}</div>
            <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.1em] text-primary/70">{stat.label}</div>
          </div>
        ))}
      </div>
    </Link>
  );
}

function AddAgentCard({ kind }: { kind: "personal" | "business" }) {
  return (
    <Link
      to="/studio?create=1"
      className="flex min-h-[214px] flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-border bg-background/30 p-5 text-center transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      <span className="grid size-10 place-items-center rounded-[10px] bg-accent text-primary">
        <Sparkles size={18} aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-semibold text-muted-foreground">
        Add {kind} agent
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground/80">
        {kind === "personal" ? "Start with Fast Start or a template" : "Front desk, SDR, support, scheduler"}
      </p>
    </Link>
  );
}

function AgentGroupSection({
  title,
  agents,
  kind,
}: {
  title: "Personal" | "Business";
  agents: WorkspaceAgentSummary[];
  kind: "personal" | "business";
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {title}
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] tracking-normal text-muted-foreground">{agents.length}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent, index) => (
          <AgentCard key={agent.id} agent={agent} index={index} isBusiness={kind === "business"} featured={kind === "personal" && index === 0} />
        ))}
        <AddAgentCard kind={kind} />
      </div>
    </section>
  );
}

export default function OverviewPage() {
  const { user } = useAuth();
  const { agents, loading, degraded } = useAgents();
  const personalAgents = agents.filter((agent) => !agent.is_business_agent);
  const businessAgents = agents.filter((agent) => agent.is_business_agent);
  const personalCount = personalAgents.length;
  const businessCount = businessAgents.length;
  const hasAgents = !loading && agents.length > 0;
  const primaryAgent = agents[0];
  const activeAgents = agents.filter((agent) => agent.phone_number).length || agents.length;

  return (
    <WorkspaceShell title="" eyebrow="" contentClassName="pt-7 pb-10 lg:pt-8">
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
                  ? `${primaryAgent?.name || "Your agent"} is answering. ${rosterSummary(personalCount, businessCount)}.`
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

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Workspace metrics">
          {[
            { label: "Agents", value: loading ? "--" : String(agents.length), detail: hasAgents ? `${activeAgents} ready` : "Create one" },
            { label: "Calls today", value: hasAgents ? String(Math.max(agents.length * 2, 1)) : "0", detail: hasAgents ? "Handled automatically" : "Waiting for first call" },
            { label: "Connections", value: "3", detail: "Calendar · SMS · CRM" },
            { label: "Minutes left", value: "313", detail: "Plan allowance" },
          ].map((item) => (
            <div key={item.label} className="studio-card min-h-[120px] p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">{item.label}</p>
              <div className="mt-3 font-[var(--wireline-font-family-display)] text-[2rem] leading-none text-foreground">{item.value}</div>
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

        <section className="studio-card p-5 sm:p-6" aria-label="Personal and business agent roster">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-[var(--wireline-font-family-display)] text-[clamp(2rem,3vw,2.75rem)] font-normal leading-none tracking-[-0.035em] text-foreground">
                Agents
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {loading ? "Loading agents..." : `${agents.length} active · ${personalCount} personal · ${businessCount} business`}
              </p>
            </div>
            <Button asChild className="shrink-0">
              <Link to="/studio?create=1">
                <Sparkles size={15} aria-hidden="true" />
                New agent
              </Link>
            </Button>
          </div>

          {loading ? (
            <AgentRosterLoading />
          ) : (
            <div className="grid gap-7">
              <AgentGroupSection title="Personal" agents={personalAgents} kind="personal" />
              <AgentGroupSection title="Business" agents={businessAgents} kind="business" />
            </div>
          )}
        </section>

        <section className="studio-card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">Recent calls</p>
              <h2 className="mt-1 text-sm font-semibold tracking-[-0.01em] text-foreground">What changed today</h2>
            </div>
            <Link to="/call-logs" className="text-xs font-semibold text-primary hover:underline">
              View all →
            </Link>
          </div>
          <div className="grid gap-0 divide-y divide-border/70">
            {RECENT_CALLS.map((call) => (
              <Link key={`${call.name}-${call.meta}`} to="/call-logs" className="group flex items-center gap-3 py-3 first:pt-1 last:pb-1">
                <span className="size-2 rounded-full bg-primary/80" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{call.name} — {call.outcome}</span>
                  <span className="block truncate text-xs text-muted-foreground">{primaryAgent?.name || "Agent"} · {call.meta}</span>
                </span>
                <Clock3 className="size-3.5 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-[16px] border border-border bg-[var(--wireline-color-text-primary)] p-6 text-[var(--wireline-color-text-onAction)] shadow-[var(--wireline-elevation-sm)]">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--wireline-color-status-success)]">One continuous line</p>
          <p className="mt-3 font-[var(--wireline-font-family-display)] text-2xl leading-tight tracking-[-0.02em]">
            A call that starts on your phone finishes in your Inbox.
          </p>
        </section>
      </div>
    </WorkspaceShell>
  );
}
