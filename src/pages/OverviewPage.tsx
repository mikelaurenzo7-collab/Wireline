import { ArrowRight, Bot, Cable, CheckCircle2, Clock3, Phone, Plus, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Skeleton } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents } from "../contexts/AgentsContext";
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

function agentInitial(name?: string | null) {
  return (name || "A").trim().charAt(0).toUpperCase() || "A";
}

function RosterLoading() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading agents">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="rounded-[12px] border border-border bg-card p-3">
          <div className="flex items-center gap-3">
            <Skeleton shape="circle" className="size-9" />
            <div className="min-w-0 flex-1">
              <Skeleton shape="text" className="h-4 w-28" />
              <Skeleton shape="text" className="mt-1.5 h-3 w-20" />
            </div>
            <Skeleton shape="text" className="h-3 w-12" />
          </div>
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
                Good morning.
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

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="studio-card p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">Your agents</p>
                <h2 className="mt-1 text-sm font-semibold tracking-[-0.01em] text-foreground">
                  Personal and business lines
                </h2>
              </div>
              <Link to="/studio" className="text-xs font-semibold text-primary hover:underline">
                View all →
              </Link>
            </div>

            {loading ? (
              <RosterLoading />
            ) : hasAgents ? (
              <div className="grid gap-2.5">
                {agents.map((agent) => {
                  const enc = encodeURIComponent(agent.id);
                  const ready = agent.phone_number ? "Active" : "Training";
                  return (
                    <Link
                      key={agent.id}
                      to={`/studio?agent=${enc}`}
                      className="group flex min-h-[60px] items-center gap-3 rounded-[12px] border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/30 hover:bg-muted/40"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground">
                        {agentInitial(agent.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">{agent.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{formatAgentRoleLabel(agent.role)} · {agent.channel || "voice"}</span>
                      </span>
                      <span className="hidden items-center gap-1 rounded-full bg-accent px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-primary sm:inline-flex">
                        <CheckCircle2 size={11} aria-hidden="true" />
                        {ready}
                      </span>
                      <ArrowRight className="size-3.5 text-primary opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                    </Link>
                  );
                })}
                <Link to="/studio?create=1" className="flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] border border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground">
                  <Plus size={14} aria-hidden="true" />
                  New agent
                </Link>
              </div>
            ) : (
              <div className="flex min-h-[172px] flex-col items-center justify-center gap-3 rounded-[14px] border border-dashed border-border text-center">
                <Bot aria-hidden="true" className="size-6 text-primary" />
                <p className="text-sm text-muted-foreground">Brief it. Train it. Put it on the line.</p>
                <Button asChild size="sm">
                  <Link to="/studio?create=1">Create agent</Link>
                </Button>
              </div>
            )}
          </div>

          <div className="studio-card p-5 sm:p-6">
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
          </div>
        </section>

        <section className="rounded-[16px] border border-border bg-[var(--wireline-color-ink)] p-6 text-[var(--wireline-color-paper)] shadow-[var(--wireline-elevation-sm)]">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary/70">One continuous line</p>
          <p className="mt-3 font-[var(--wireline-font-family-display)] text-2xl leading-tight tracking-[-0.02em]">
            A call that starts on your phone finishes in your Inbox.
          </p>
        </section>
      </div>
    </WorkspaceShell>
  );
}
