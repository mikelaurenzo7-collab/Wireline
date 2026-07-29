import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bot,
  CalendarCheck2,
  Clock3,
  Flame,
  ListTodo,
  Phone,
  Play,
  PlugZap,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

import ActivationChecklist from "../components/ActivationChecklist";
import OutcomeLedger from "../components/OutcomeLedger";
import { Button, EmptyState, Skeleton } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";
import AgentFace from "../components/AgentFace";
import OutboundDialDialog from "../components/OutboundDialDialog";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import { useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import { useAccount } from "../contexts/AccountContext";
import { customerAgentLanguage, formatAgentRoleLabel } from "../lib/product-copy";
import { workspaceFirstName } from "../lib/user-display";
import { authFetch } from "../lib/api";
import { isoToLocalDateKey, localDateKey } from "../lib/date-display";
import type { CallLog } from "../types/api";

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

function agentReadiness(agent: WorkspaceAgentSummary) {
  return agent.phone_number ? "Live" : "Needs setup";
}

function metricRows(
  callsCount: number,
  callsDetail: string,
  hotLeadsCount: number,
  totalAppointments: number,
  pendingFollowUps: number,
) {
  return [
    {
      label: "Customer conversations today",
      value: String(callsCount),
      detail: callsDetail,
      tone: callsCount > 0 ? ("success" as const) : ("neutral" as const),
      href: "/phone?tab=logs",
      icon: Phone,
    },
    {
      label: "Priority leads",
      value: String(hotLeadsCount),
      detail: hotLeadsCount > 0 ? "Latest high-intent conversations" : "No priority leads yet",
      tone: hotLeadsCount > 0 ? ("primary" as const) : ("neutral" as const),
      href: "/insights",
      icon: Flame,
    },
    {
      label: "Appointments booked",
      value: String(totalAppointments),
      detail: totalAppointments > 0 ? "Total appointments on record" : "Connect a calendar to book",
      tone: totalAppointments > 0 ? ("wire" as const) : ("neutral" as const),
      href: totalAppointments > 0 ? "/phone?tab=appointments" : "/connections",
      icon: CalendarCheck2,
    },
    {
      label: "Follow-ups waiting",
      value: String(pendingFollowUps),
      detail: pendingFollowUps > 0 ? "Review before they go out" : "Nothing waiting for approval",
      tone: pendingFollowUps > 0 ? ("warning" as const) : ("success" as const),
      href: "/approvals",
      icon: ListTodo,
    },
  ];
}

function MetricSkeleton() {
  return (
    <div className="wl-metric-tile" aria-hidden="true">
      <Skeleton shape="text" className="h-3 w-28" />
      <Skeleton shape="text" className="mt-5 h-8 w-12" />
      <Skeleton shape="text" className="mt-4 h-3 w-36" />
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

function FirstRunLaunchpad({ posture }: { posture: "personal" | "business" }) {
  const language = customerAgentLanguage(posture);
  const steps =
    posture === "personal"
      ? [
          {
            title: "Choose one personal job",
            detail:
              "Start with screening unknown callers, booking appointments, or taking messages for you.",
            icon: Bot,
          },
          {
            title: "Connect your line",
            detail:
              "Activate a paid plan, then claim an included Wireline number so your agent can answer and text you.",
            icon: Phone,
          },
          {
            title: "Review the first outcome",
            detail: "See who called, what your agent handled, and what needs your attention.",
            icon: Sparkles,
          },
        ]
      : [
          {
            title: "Choose one real job",
            detail:
              "Start with missed calls, appointment booking, lead qualification, or customer support.",
            icon: Bot,
          },
          {
            title: "Connect the customer line",
            detail:
              "Activate a paid plan, then claim an included Wireline number—or route calls customers already make to your business.",
            icon: Phone,
          },
          {
            title: "Review the first outcome",
            detail:
              "See what the customer needed, what Wireline completed, and what needs your approval.",
            icon: Sparkles,
          },
        ];

  return (
    <section
      className="wl-paper wl-paper-elevated overflow-hidden p-5 sm:p-7"
      aria-labelledby="first-run-title"
    >
      <div className="grid gap-7 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-center">
        <div>
          <p className="wl-eyebrow wl-eyebrow--primary">
            {posture === "personal" ? "Start with your calls" : "Start with demand"}
          </p>
          <h2
            id="first-run-title"
            className="mt-2 text-xl font-semibold text-foreground sm:text-2xl"
          >
            {posture === "personal"
              ? "Put one personal job to work today."
              : "Put one customer-facing job to work today."}
          </h2>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
            Give one {language.singular} a clear job, test it, then connect only the channels that
            job needs.
          </p>
          <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Button asChild className="w-full justify-center sm:w-auto">
              <Link
                to={
                  posture === "personal"
                    ? "/studio?create=1&posture=personal"
                    : "/studio?create=1&posture=business"
                }
              >
                {language.createCta}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </Button>
            <Link
              to="/showcase"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
            >
              See a live demo first
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Reliable voice and behavior defaults are already selected.
          </p>
        </div>

        <ol
          className="grid gap-2"
          aria-label={
            posture === "personal"
              ? "First personal-agent workflow"
              : "First customer-demand workflow"
          }
        >
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className={`flex items-start gap-3 rounded-[var(--wireline-radius-md)] border px-4 py-3 ${
                  index === 0 ? "border-primary/35 bg-primary/5" : "border-border bg-card"
                }`}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted font-mono text-[10px] font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <Icon className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{step.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {step.detail}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function WorkspaceRecovery({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="wl-paper wl-paper-elevated p-6 sm:p-8" aria-label="Workspace recovery">
      <StatusNotice tone="warning" title="Your workspace is reconnecting">
        We could not load your agent roster. Your agents and customer data are unchanged.
      </StatusNotice>
      <Button type="button" variant="secondary" className="mt-4" onClick={onRetry}>
        Retry workspace
      </Button>
    </section>
  );
}

function DemandReadinessCard({
  hasLiveLine,
  hasConversationHistory,
  callsCount,
  pendingFollowUps,
  connectionsCount,
  connectionsDetail,
  setupHref,
  testHref,
  subjectLabel,
}: {
  hasLiveLine: boolean;
  hasConversationHistory: boolean;
  callsCount: number;
  pendingFollowUps: number;
  connectionsCount: number;
  connectionsDetail: string;
  setupHref: string;
  testHref: string;
  subjectLabel: string;
}) {
  const state = !hasLiveLine
    ? {
        eyebrow: "Demand path incomplete",
        title: "Connect a phone line to start capturing real demand.",
        detail:
          "Add it to your site and business listings, or forward missed calls from your current number.",
        primaryHref: "/settings/phone",
        primaryLabel: "Connect phone",
        secondaryHref: testHref,
        secondaryLabel: `Test the ${subjectLabel} first`,
      }
    : !hasConversationHistory
      ? {
          eyebrow: "Line ready",
          title: "Your line is live. Put it where customers already call.",
          detail:
            "Publish the number or forward unanswered calls, then place one real inbound call.",
          primaryHref: "/settings/phone",
          primaryLabel: "Review phone setup",
          secondaryHref: testHref,
          secondaryLabel: "Run a test conversation",
        }
      : pendingFollowUps > 0
        ? {
            eyebrow: "Action required",
            title: `${pendingFollowUps} customer follow-up${pendingFollowUps === 1 ? " needs" : "s need"} your decision.`,
            detail: "Approve, edit, or decline each next step while the context is fresh.",
            primaryHref: "/approvals",
            primaryLabel: "Review follow-ups",
            secondaryHref: "/phone?tab=logs",
            secondaryLabel: "Open conversations",
          }
        : {
            eyebrow: callsCount > 0 ? "Customer demand today" : "Line ready",
            title:
              callsCount > 0
                ? "Wireline is handling conversations and recording what happened."
                : "No new conversations today. Your customer line is still ready.",
            detail: "Review customer outcomes to decide what to improve next.",
            primaryHref: "/phone?tab=logs",
            primaryLabel: "Review conversations",
            secondaryHref: setupHref,
            secondaryLabel: `Improve the ${subjectLabel}`,
          };

  return (
    <section
      className="wl-paper wl-paper-elevated overflow-hidden p-5 sm:p-6"
      aria-label="Demand readiness"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <PlugZap size={17} aria-hidden="true" />
            </span>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
              {state.eyebrow}
            </p>
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {state.title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{state.detail}</p>
          {connectionsCount > 0 ? (
            <p
              className="mt-3 truncate text-xs font-medium text-muted-foreground"
              aria-label={`Live connections: ${connectionsDetail}`}
              title={`Live: ${connectionsDetail}`}
            >
              Live: {connectionsDetail}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          <Button asChild>
            <Link to={state.primaryHref}>{state.primaryLabel}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to={state.secondaryHref}>{state.secondaryLabel}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function CompactAgentRow({ agent }: { agent: WorkspaceAgentSummary }) {
  const live = Boolean(agent.phone_number);
  const enc = encodeURIComponent(agent.id);
  const language = customerAgentLanguage(agent.is_business_agent ? "business" : "personal");
  return (
    <Link
      to={`/studio?agent=${enc}`}
      className={`group flex min-h-[56px] min-w-0 items-center gap-3 rounded-[var(--wireline-radius-md)] border px-3 py-2 wl-press wl-focus-ring-halo ${
        live
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
        className={`wl-chip wl-chip--${live ? "success" : "warning"} shrink-0`}
        aria-label={`${language.singular} status: ${agentReadiness(agent)}`}
      >
        <span className="wl-chip__dot" aria-hidden="true" />
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
  const language = customerAgentLanguage(kind);
  const heading = language.plural.replace(/^./, (letter) => letter.toUpperCase());
  if (agents.length === 0) return null;

  return (
    <section className="min-w-0" aria-label={heading}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {heading}
        </p>
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
          {agents.length}
        </span>
      </div>
      <div className="grid min-w-0 gap-2">
        {agents.map((agent) => (
          <CompactAgentRow key={agent.id} agent={agent} />
        ))}
        <Link
          to={`/studio?create=1&posture=${kind}`}
          className="grid min-h-[44px] min-w-0 place-items-center rounded-[10px] border border-dashed border-border bg-background/30 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          + New {language.singular}
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
  const { accountType } = useAccount();
  const { agents, loading, degraded, refresh } = useAgents();
  const language = customerAgentLanguage(accountType);
  const [showOutboundDial, setShowOutboundDial] = useState(false);

  const [callsCount, setCallsCount] = useState(0);
  const [callsDetail, setCallsDetail] = useState("Waiting for first conversation");
  const [connectionsCount, setConnectionsCount] = useState(0);
  const [connectionsDetail, setConnectionsDetail] = useState("Checking connections…");
  const [hotLeadsCount, setHotLeadsCount] = useState(0);
  const [totalAppointments, setTotalAppointments] = useState(0);
  const [pendingFollowUps, setPendingFollowUps] = useState(0);
  const [recentCalls, setRecentCalls] = useState<CallLog[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [statsUnavailable, setStatsUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoadingDashboard(true);
      setStatsUnavailable(false);
      try {
        const [statsRes, crmRes, calendarRes, navCountsRes] = await Promise.all([
          authFetch("/api/dashboard/stats"),
          authFetch("/api/oauth/crm/status"),
          authFetch("/api/calendar/accounts"),
          authFetch("/api/nav-counts"),
        ]);

        if (cancelled) return;

        if (statsRes.ok) {
          const data = await statsRes.json();
          const logs: CallLog[] = Array.isArray(data?.recentLogs) ? data.recentLogs : [];
          setRecentCalls(logs.slice(0, 4));
          setHotLeadsCount(Array.isArray(data?.hotLeads) ? data.hotLeads.length : 0);
          setTotalAppointments(Number(data?.totalAppointments ?? 0));

          const todayStr = localDateKey(new Date());
          const todayLogs = logs.filter((log) => isoToLocalDateKey(log.created_at) === todayStr);
          const count = todayLogs.length;
          setCallsCount(count);
          if (count > 0) {
            const inbound = todayLogs.filter((log) => log.direction === "inbound").length;
            const outbound = todayLogs.filter((log) => log.direction === "outbound").length;
            setCallsDetail(`${inbound} inbound · ${outbound} outbound`);
          } else {
            setCallsDetail(
              logs.length > 0 ? "No new calls today" : "Waiting for first conversation",
            );
          }
        } else {
          // Don't present initial zeros as real business data when the metrics
          // API fails — flag it so the UI can say the numbers aren't current.
          setStatsUnavailable(true);
        }

        if (navCountsRes.ok) {
          const data = await navCountsRes.json();
          setPendingFollowUps(Number(data?.["/overview"] ?? 0));
        }

        const activeProviders: string[] = [];
        if (crmRes.ok) {
          const data = await crmRes.json();
          activeProviders.push(
            ...Object.entries(data as Record<string, { connected?: boolean }>)
              .filter(([, connection]) => connection?.connected)
              .map(([name]) =>
                name.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
              ),
          );
        }

        const coreConnections: string[] = [];
        if (calendarRes.ok) {
          const calendarData = await calendarRes.json().catch(() => null);
          if (Array.isArray(calendarData?.accounts) && calendarData.accounts.length > 0) {
            coreConnections.push("Calendar");
          }
        }
        if (agents.some((agent) => agent.phone_number)) coreConnections.push("Phone + SMS");

        const allConnections = [...new Set([...coreConnections, ...activeProviders])];
        setConnectionsCount(allConnections.length);
        setConnectionsDetail(
          allConnections.length ? allConnections.join(" · ") : "Connect tools in Connections",
        );
      } catch {
        if (!cancelled) {
          setConnectionsDetail("Connect tools in Connections");
          setStatsUnavailable(true);
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
  const isFirstRun = !loading && !degraded && agents.length === 0;
  const missingFounderPairPosture =
    hasAgents &&
    ((personalAgents.length === 0 && businessAgents.length > 0) ||
      (businessAgents.length === 0 && personalAgents.length > 0));
  const founderPairHref =
    personalAgents.length === 0
      ? "/studio?create=1&posture=personal"
      : "/studio?create=1&posture=business";
  const founderPairLabel =
    personalAgents.length === 0 ? "Create personal agent" : "Add business voice agent";
  const founderPairDetail =
    personalAgents.length === 0
      ? "Add a personal Concierge for screening, booking, and private briefings alongside your business coverage."
      : "Add a business voice agent for customer calls, texts, and follow-up alongside your personal agent.";
  const primaryAgent = agents[0];
  const hasLiveLine = agents.some((agent) => Boolean(agent.phone_number));
  const hasConversationHistory = recentCalls.length > 0;
  const emptyStudioHref =
    accountType === "personal"
      ? "/studio?create=1&posture=personal"
      : "/studio?create=1&posture=business";
  const primaryStudioHref = primaryAgent
    ? `/studio?agent=${encodeURIComponent(primaryAgent.id)}&section=setup`
    : emptyStudioHref;
  const primaryTestHref = primaryAgent
    ? `/studio?agent=${encodeURIComponent(primaryAgent.id)}&section=test`
    : emptyStudioHref;

  return (
    <WorkspaceShell contentClassName="pt-7 pb-10 lg:pt-8">
      <WorkspacePageFrame mode="standard" className="wl-overview">
        <section
          className={`relative wl-overview-greeting ${hasAgents ? "text-left" : "text-center"}`}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {todayLabel()}
          </p>
          <div className={`mt-3 flex flex-col gap-5 ${hasAgents ? "items-start" : "items-center"}`}>
            <div className="max-w-2xl">
              <h1 className="wl-display-2 text-balance">
                {isFirstRun
                  ? `Let's put your first ${language.singular} to work.`
                  : `${dayGreeting()}, ${workspaceFirstName(user?.full_name, user?.email)}.`}
              </h1>
            </div>
            <div
              className={`flex flex-wrap items-center gap-2 ${hasAgents ? "justify-start" : "justify-center"}`}
            >
              {hasAgents ? (
                <>
                  <Button asChild className="shrink-0 justify-center sm:min-w-[170px]">
                    <Link to={primaryStudioHref}>
                      <Sparkles aria-hidden="true" size={15} />
                      Manage {language.navLabel}
                    </Link>
                  </Button>
                  {hasLiveLine ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0 justify-center sm:min-w-[154px]"
                      onClick={() => setShowOutboundDial(true)}
                    >
                      <Phone aria-hidden="true" size={15} />
                      Start a call
                    </Button>
                  ) : (
                    <Button
                      asChild
                      variant="secondary"
                      className="shrink-0 justify-center sm:min-w-[154px]"
                    >
                      <Link to={primaryTestHref}>
                        <Play aria-hidden="true" size={15} />
                        Test {language.navShort.toLowerCase()}
                      </Link>
                    </Button>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </section>

        {isFirstRun ? (
          <FirstRunLaunchpad posture={accountType} />
        ) : degraded && !hasAgents ? (
          <WorkspaceRecovery onRetry={refresh} />
        ) : (
          <>
            <ActivationChecklist className="mb-2" />

            <DemandReadinessCard
              hasLiveLine={hasLiveLine}
              hasConversationHistory={hasConversationHistory}
              callsCount={callsCount}
              pendingFollowUps={pendingFollowUps}
              connectionsCount={connectionsCount}
              connectionsDetail={connectionsDetail}
              setupHref={primaryStudioHref}
              testHref={primaryTestHref}
              subjectLabel={language.navShort.toLowerCase()}
            />

            <section
              className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
              aria-label="Customer demand and outcomes"
            >
              {loadingDashboard
                ? Array.from({ length: 4 }, (_, index) => <MetricSkeleton key={index} />)
                : metricRows(
                    callsCount,
                    callsDetail,
                    hotLeadsCount,
                    totalAppointments,
                    pendingFollowUps,
                  ).map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.label}
                        to={item.href}
                        className={`wl-metric-tile wl-metric-tile--compact wl-reveal wl-reveal-${index + 1} group wl-focus-ring-halo`}
                        data-tone={item.tone}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="wl-metric-tile__label">{item.label}</p>
                          <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                        </div>
                        <div className="wl-metric-tile__value">{item.value}</div>
                        <p className="wl-metric-tile__detail hidden sm:block">{item.detail}</p>
                      </Link>
                    );
                  })}
            </section>

            {degraded ? (
              <StatusNotice tone="warning" title="Status partial">
                Agent links are recovering — showing the last safe state.
              </StatusNotice>
            ) : null}

            {statsUnavailable && !loadingDashboard ? (
              <StatusNotice tone="warning" title="Live metrics unavailable">
                We couldn&apos;t load your latest calls, appointments, and leads. Refresh to try
                again — the numbers above may not be current.
              </StatusNotice>
            ) : null}

            <section
              className="wl-paper wl-paper-elevated p-5 sm:p-6"
              aria-label="Customer outcomes"
            >
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Customer outcomes
                  </p>
                </div>
              </div>
              <OutcomeLedger limit={5} showViewAll followUpsHref="/approvals" />
            </section>

            <section
              className="grid gap-4 lg:grid-cols-[1fr_1fr]"
              aria-label="Agents and recent customer conversations"
            >
              <article className="wl-paper wl-paper-elevated p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Agents
                  </p>
                  <Link to="/studio" className="text-xs font-semibold text-primary hover:underline">
                    Manage →
                  </Link>
                </div>
                {loading ? (
                  <AgentLoadingRows />
                ) : hasAgents ? (
                  <div className="grid gap-5">
                    <AgentSection kind="personal" agents={personalAgents} />
                    <AgentSection kind="business" agents={businessAgents} />
                    {missingFounderPairPosture ? (
                      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                        <p className="text-sm font-semibold text-foreground">
                          Complete your founder pair
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {founderPairDetail} Starter Plus and above include both; Starter can add
                          an Extra Agent (+$15) or upgrade.
                        </p>
                        <Button asChild size="sm" className="mt-3">
                          <Link to={founderPairHref}>{founderPairLabel}</Link>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <EmptyState
                    density="compact"
                    titleTone="ui"
                    withHalo={false}
                    icon={<Bot aria-hidden="true" />}
                    title={`No ${language.plural} yet`}
                    description={
                      accountType === "business"
                        ? "Create one for a specific customer-facing job — or start the founder pair with personal + business."
                        : "Create one for a call, appointment, or personal task."
                    }
                    action={
                      <Button asChild size="sm">
                        <Link to={emptyStudioHref}>{language.createCta}</Link>
                      </Button>
                    }
                  />
                )}
              </article>

              <article className="wl-paper wl-paper-elevated p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Recent customer conversations
                  </p>
                  <Link
                    to="/phone?tab=logs"
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    View all →
                  </Link>
                </div>
                <div className="grid gap-0">
                  {loadingDashboard ? (
                    <div
                      className="grid gap-3 py-2"
                      aria-busy="true"
                      aria-label="Loading recent customer conversations"
                    >
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
                        to="/phone?tab=logs"
                        className="wl-data-row wl-data-row--divided group"
                      >
                        <span className="wl-data-row__leading" aria-hidden="true">
                          <span className="size-2 rounded-full bg-[var(--wireline-color-action-primary-default)]" />
                        </span>
                        <span className="wl-data-row__main">
                          <span className="wl-data-row__title">
                            {call.customer_number || "Unknown caller"}
                          </span>
                          <span className="wl-data-row__detail wl-data-row__detail--clamp">
                            {[
                              call.agent_name || primaryAgent?.name || language.singular,
                              formatCallMeta(call.created_at, call.duration_seconds),
                              call.summary || call.intent_label,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <span className="wl-data-row__trailing">
                          <Clock3
                            className="size-3.5 transition-colors group-hover:text-[var(--wireline-color-action-primary-default)]"
                            aria-hidden="true"
                          />
                        </span>
                      </Link>
                    ))
                  ) : (
                    <EmptyState
                      density="compact"
                      titleTone="ui"
                      icon={<Phone aria-hidden="true" />}
                      title={
                        hasLiveLine ? "No customer calls yet" : "Connect a line to receive calls"
                      }
                      description={
                        hasLiveLine
                          ? "Place one real inbound call, then review the outcome here."
                          : `Test the ${language.navShort.toLowerCase()} first, then connect a phone number when it is ready.`
                      }
                      action={
                        <Button asChild size="sm">
                          <Link to={hasLiveLine ? primaryTestHref : "/settings/phone"}>
                            {hasLiveLine ? "Run test conversation" : "Connect phone"}
                          </Link>
                        </Button>
                      }
                    />
                  )}
                </div>
              </article>
            </section>
          </>
        )}
      </WorkspacePageFrame>
      <OutboundDialDialog open={showOutboundDial} onClose={() => setShowOutboundDial(false)} />
    </WorkspaceShell>
  );
}
