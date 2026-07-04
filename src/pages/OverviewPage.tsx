import { useEffect, useState } from "react";
import { ArrowRight, Bot, Cable, Clock3, Phone, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { Button, Skeleton } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";
import AgentFace from "../components/AgentFace";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import { useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import { formatAgentRoleLabel } from "../lib/product-copy";
import { authFetch } from "../lib/api";
import type { CallLog } from "../types/api";

const QUICK_ACTIONS = [
  { href: "/studio", icon: Sparkles, title: "Open Studio" },
  { href: "/templates", icon: Bot, title: "Browse templates" },
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

function firstName(name?: string | null, email?: string | null) {
  // Prefer the real full_name first token. Falls through to the email local
  // part with username noise stripped — trailing digits ("mike97" -> "Mike"),
  // dot/underscore segments ("mike.laurenzo" -> "Mike"), and a length guard
  // so a 14-char username doesn't dominate the greeting. Anything that still
  // looks unfriendly degrades to "there" so we never greet a username.
  const fromName = name?.trim().split(/\s+/)[0];
  if (fromName) return fromName.replace(/^./, (letter) => letter.toUpperCase());
  const local = email?.split("@")[0]?.trim();
  if (!local) return "there";
  const cleaned = local
    .split(/[._-]/)[0]
    .replace(/\d+$/, "")
    .replace(/[^A-Za-z]/g, "");
  if (!cleaned || cleaned.length < 2 || cleaned.length > 14) return "there";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

function agentReadiness(agent: WorkspaceAgentSummary) {
  return agent.phone_number ? "Active" : "Training";
}

function metricRows(
  agents: WorkspaceAgentSummary[],
  hasAgents: boolean,
  activeAgents: number,
  callsCount: number,
  callsDetail: string,
  connectionsCount: number,
  connectionsDetail: string,
  balanceUsd: number | null,
) {
  return [
    {
      label: "Agents",
      value: String(agents.length),
      detail: hasAgents ? `${activeAgents} active` : "Create one",
    },
    {
      label: "Calls today",
      value: String(callsCount),
      detail: callsDetail,
    },
    {
      label: "Connections",
      value: String(connectionsCount),
      detail: connectionsDetail,
    },
    {
      label: "Balance",
      value: balanceUsd !== null ? `$${balanceUsd.toFixed(2)}` : "--",
      detail: "Conversation Balance",
    },
  ];
}

function MetricSkeleton() {
  return (
    <div className="studio-card min-h-[120px] p-5" aria-hidden="true">
      <Skeleton shape="text" className="h-3 w-16" />
      <Skeleton shape="text" className="mt-5 h-8 w-12" />
      <Skeleton shape="text" className="mt-4 h-3 w-28" />
    </div>
  );
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
      <AgentFace
        seed={agent.name || agent.id}
        size={32}
        title={`${agent.name} face`}
        className="shrink-0"
      />
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
  // Literal "Personal agents" / "Business agents" so test regexes and the
  // Claude Design copy stay aligned and don't depend on string interpolation.
  const heading = kind === "personal" ? "Personal agents" : "Business agents";
  return (
    <section aria-label={heading}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {heading}
        </p>
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
          className="grid min-h-[44px] place-items-center rounded-[10px] border border-dashed border-border bg-background/30 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          + New {kind} agent
        </Link>
      </div>
    </section>
  );
}

function formatCallMeta(createdAt: string, durationSeconds?: number | null) {
  if (!createdAt) return "";
  const date = new Date(createdAt);
  const timeStr = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (durationSeconds) {
    const min = Math.floor(durationSeconds / 60);
    const sec = durationSeconds % 60;
    const durationStr = min > 0 ? `${min}m ${sec}s` : `${sec}s`;
    return `${timeStr} · ${durationStr}`;
  }
  return timeStr;
}

export default function OverviewPage() {
  const { user } = useAuth();
  const { agents, loading, degraded } = useAgents();

  const [callsCount, setCallsCount] = useState<number>(0);
  const [callsDetail, setCallsDetail] = useState<string>("Waiting for first call");
  const [connectionsCount, setConnectionsCount] = useState<number>(0);
  const [connectionsDetail, setConnectionsDetail] = useState<string>("Checking connections...");
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);
  const [recentCalls, setRecentCalls] = useState<CallLog[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoadingDashboard(true);
      try {
        const [statsRes, crmRes, calendarRes, balanceRes] = await Promise.all([
          authFetch("/api/dashboard/stats"),
          authFetch("/api/oauth/crm/status"),
          authFetch("/api/calendar/accounts"),
          authFetch("/api/conversation-balance"),
        ]);

        if (cancelled) return;

        if (statsRes.ok) {
          const data = await statsRes.json();
          const logs: CallLog[] = data.recentLogs || [];
          setRecentCalls(logs.slice(0, 4));

          const todayStr = new Date().toISOString().slice(0, 10);
          const todayLogs = logs.filter((log) => log.created_at?.slice(0, 10) === todayStr);
          const count = todayLogs.length;
          setCallsCount(count);
          if (count > 0) {
            const inbound = todayLogs.filter((log) => log.direction === "inbound").length;
            const outbound = todayLogs.filter((log) => log.direction === "outbound").length;
            setCallsDetail(`${inbound} inbound · ${outbound} outbound`);
          } else {
            setCallsDetail(
              logs.length > 0 ? "No calls today · line active" : "Waiting for first call",
            );
          }
        }

        if (crmRes.ok) {
          const data = await crmRes.json();
          const activeProviders = Object.entries(data as Record<string, { connected?: boolean }>)
            .filter(([, conn]) => conn?.connected)
            .map(([name]) =>
              name.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
            );
          // Only real links count: a linked calendar account and a live phone
          // line (which carries SMS). No decorative placeholder connections.
          const core: string[] = [];
          if (calendarRes.ok) {
            const calendarData = await calendarRes.json().catch(() => null);
            if (Array.isArray(calendarData?.accounts) && calendarData.accounts.length > 0) {
              core.push("Calendar");
            }
          }
          if (agents.some((agent) => agent.phone_number)) core.push("SMS");
          const allConns = [...core, ...activeProviders];
          setConnectionsCount(allConns.length);
          setConnectionsDetail(
            allConns.length ? allConns.join(" · ") : "Connect tools in Connections",
          );
        } else if (!cancelled) {
          setConnectionsCount(0);
          setConnectionsDetail("Connect tools in Connections");
        }

        if (balanceRes.ok) {
          const data = await balanceRes.json();
          setBalanceUsd(data.balance_usd ?? 0);
        }
      } catch {
        if (!cancelled) {
          setConnectionsDetail("Connect tools in Connections");
        }
      } finally {
        if (!cancelled) setLoadingDashboard(false);
      }
    }

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [agents]);

  const personalAgents = agents.filter((agent) => !agent.is_business_agent);
  const businessAgents = agents.filter((agent) => agent.is_business_agent);
  const hasAgents = !loading && agents.length > 0;
  const primaryAgent = agents[0];
  const activeAgents = agents.filter((agent) => agent.phone_number).length || agents.length;

  return (
    <WorkspaceShell contentClassName="pt-7 pb-10 lg:pt-8">
      <WorkspacePageFrame className="wl-overview">
        <section className="relative text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {todayLabel()}
          </p>
          <div className="mt-3 flex flex-col items-center gap-5">
            <div className="max-w-prose">
              <h1 className="wl-display-2 text-balance">
                {dayGreeting()}, {firstName(user?.full_name, user?.email)}.
              </h1>
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
          {loadingDashboard && loading
            ? Array.from({ length: 4 }, (_, index) => <MetricSkeleton key={index} />)
            : metricRows(
                agents,
                hasAgents,
                activeAgents,
                callsCount,
                callsDetail,
                connectionsCount,
                connectionsDetail,
                balanceUsd,
              ).map((item) => (
                <div key={item.label} className="studio-card flex min-h-[120px] flex-col p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {item.label}
                  </p>
                  <div className="mt-auto pt-3 font-[var(--wireline-font-family-display)] text-[2rem] leading-none text-foreground">
                    {loading && item.label === "Agents" ? "—" : item.value}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{item.detail}</p>
                </div>
              ))}
        </section>

        {degraded ? (
          <StatusNotice tone="warning" title="Status partial.">
            Agent links are recovering — showing the last safe state.
          </StatusNotice>
        ) : null}

        <section aria-label="Quick actions">
          <div className="flex flex-wrap justify-center gap-2">
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
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Agents
              </p>
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
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Recent calls
              </p>
              <Link to="/call-logs" className="text-xs font-semibold text-primary hover:underline">
                View all →
              </Link>
            </div>
            <div className="grid gap-0 divide-y divide-border/70">
              {loadingDashboard ? (
                <div className="grid gap-3 py-2" aria-busy="true" aria-label="Loading recent calls">
                  {Array.from({ length: 3 }, (_, index) => (
                    <div key={index} className="flex items-center gap-3 py-2">
                      <Skeleton shape="circle" className="size-2 rounded-full" />
                      <div className="min-w-0 flex-1">
                        <Skeleton shape="text" className="h-4 w-48" />
                        <Skeleton shape="text" className="mt-1.5 h-3 w-32" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentCalls.length > 0 ? (
                recentCalls.map((call) => (
                  <Link
                    key={call.id}
                    to="/call-logs"
                    className="group flex min-h-[52px] items-center gap-3 py-3 first:pt-1 last:pb-1"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full bg-primary/80"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {call.customer_number || "Unknown caller"} —{" "}
                        {call.intent_label || call.summary || "Call logged"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {call.agent_name || primaryAgent?.name || "Agent"} ·{" "}
                        {formatCallMeta(call.created_at, call.duration_seconds)}
                      </span>
                    </span>
                    <Clock3
                      className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                      aria-hidden="true"
                    />
                  </Link>
                ))
              ) : (
                <div className="flex min-h-[180px] flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <Phone className="mb-3 size-8 text-muted-foreground/30" aria-hidden="true" />
                  <p className="text-sm font-medium text-foreground">No calls yet</p>
                  {!hasAgents ? (
                    <Button asChild size="sm" className="mt-4">
                      <Link to="/studio?create=1">Create agent</Link>
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          </article>
        </section>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
