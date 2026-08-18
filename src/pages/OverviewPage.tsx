import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  CalendarCheck2,
  Clock3,
  Inbox,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Link } from "react-router";

import ActivationChecklist from "../components/ActivationChecklist";
import AgentFace from "../components/AgentFace";
import OutboundDialDialog from "../components/OutboundDialDialog";
import OutcomeLedger from "../components/OutcomeLedger";
import WorkspaceRecovery from "../components/WorkspaceRecovery";
import WorkspaceShell from "../components/WorkspaceShell";
import { Button, EmptyState, Skeleton } from "../components/atoms";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import { StatusNotice } from "../components/molecules";
import { useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";
import { authFetch } from "../lib/api";
import { agentReadinessLabel } from "../lib/agent-readiness";
import { formatAgentRoleLabel } from "../lib/product-copy";

type ConversationChannel = "voice" | "email" | "sms";

type RecentConversation = {
  id: string;
  channel: ConversationChannel;
  contact: string;
  headline?: string | null;
  summary?: string | null;
  occurred_at: string;
  duration_seconds?: number | null;
  agent_name?: string | null;
};

type OverviewMetrics = {
  conversationsToday: number;
  highIntentToday: number;
  appointmentsBooked: number;
  activeWork: number;
};

const EMPTY_METRICS: OverviewMetrics = {
  conversationsToday: 0,
  highIntentToday: 0,
  appointmentsBooked: 0,
  activeWork: 0,
};

function channelLabel(channel: ConversationChannel) {
  if (channel === "email") return "Email";
  if (channel === "sms") return "Text";
  return "Voice";
}

function channelHref(channel: ConversationChannel) {
  if (channel === "email") return "/inbox?tab=email";
  if (channel === "sms") return "/inbox?tab=sms";
  return "/phone?tab=logs";
}

function channelIcon(channel: ConversationChannel) {
  if (channel === "email") return Mail;
  if (channel === "sms") return MessageSquare;
  return Phone;
}

function formatConversationTime(value: string, durationSeconds?: number | null) {
  if (!value) return "";
  const date = new Date(value);
  const time = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (!durationSeconds) return time;
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  const duration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  return [time, duration].filter(Boolean).join(" · ");
}

function conversationPreview(conversation: RecentConversation) {
  return (
    conversation.headline?.trim() ||
    conversation.summary?.trim() ||
    "Conversation recorded. Open the thread for the full details."
  );
}

function DashboardLoadingState() {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.65fr)]">
      <div className="wl-paper wl-paper-elevated min-h-[520px] p-5" aria-hidden="true">
        <div className="flex items-center justify-between gap-3">
          <Skeleton shape="text" className="h-5 w-40" />
          <Skeleton shape="text" className="h-9 w-24" />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(15rem,0.82fr)_minmax(0,1.18fr)]">
          <div className="grid gap-2">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="rounded-xl border border-border p-3">
                <Skeleton shape="text" className="h-4 w-32" />
                <Skeleton shape="text" className="mt-2 h-3 w-48" />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border p-5">
            <Skeleton shape="text" className="h-4 w-24" />
            <Skeleton shape="text" className="mt-4 h-7 w-48" />
            <Skeleton shape="text" className="mt-3 h-3 w-full" />
            <Skeleton shape="text" className="mt-2 h-3 w-4/5" />
          </div>
        </div>
      </div>
      <div className="grid gap-4">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="wl-paper wl-paper-elevated p-5" aria-hidden="true">
            <Skeleton shape="text" className="h-4 w-32" />
            <Skeleton shape="text" className="mt-5 h-24 w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

function FirstRunWorkspace() {
  const roleStarters = [
    "Receptionist",
    "Sales Associate",
    "Support Specialist",
    "Scheduler",
    "Personal Assistant",
  ];

  return (
    <section className="wl-paper wl-paper-elevated overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.12fr)_minmax(20rem,0.88fr)]">
        <div className="relative overflow-hidden p-6 sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
              <Sparkles size={13} aria-hidden="true" />
              One workspace
            </span>
            <h1 className="mt-5 max-w-[15ch] font-[var(--wireline-font-family-display)] text-[clamp(2rem,5vw,4rem)] font-semibold leading-[0.94] tracking-[-0.045em] text-foreground">
              Build Your Bot
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              Start with a proven role or create your own. Configure voice, text, email,
              knowledge, tools, guardrails, approvals, and handoffs without choosing a
              personal or business workspace.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button asChild className="justify-center sm:min-w-[170px]">
                <Link to="/studio?create=1">
                  <Plus size={15} aria-hidden="true" />
                  Create Your Own
                </Link>
              </Button>
              <Button asChild variant="secondary" className="justify-center sm:min-w-[170px]">
                <Link to="/templates">
                  Browse Templates
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <div className="mt-7 flex flex-wrap gap-2" aria-label="Example Bot roles">
              {roleStarters.map((role) => (
                <span
                  key={role}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  {role}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border bg-muted/25 p-5 sm:p-7 lg:border-l lg:border-t-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Configure once
          </p>
          <ol className="mt-4 grid gap-3">
            {[
              [
                "1",
                "Choose the job",
                "Pick a business role, a personal starter, or a blank canvas.",
              ],
              [
                "2",
                "Connect the channels",
                "Use voice, text, and email together or only where the workflow needs them.",
              ],
              [
                "3",
                "Launch with control",
                "Set knowledge, tools, approvals, consent rules, handoffs, and stopping conditions.",
              ],
            ].map(([number, title, detail]) => (
              <li key={number} className="flex gap-3 rounded-xl border border-border bg-card p-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 font-mono text-xs font-semibold text-primary">
                  {number}
                </span>
                <span className="min-w-0">
                  <strong className="block text-sm font-semibold text-foreground">{title}</strong>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function BotRoster({
  bots,
  phoneLookupDegraded,
}: {
  bots: WorkspaceAgentSummary[];
  phoneLookupDegraded: boolean;
}) {
  return (
    <section className="wl-paper wl-paper-elevated p-5" aria-labelledby="overview-bots-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Workspace
          </p>
          <h2 id="overview-bots-title" className="mt-1 text-base font-semibold text-foreground">
            Bots
          </h2>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] font-semibold text-muted-foreground">
          {bots.length}
        </span>
      </div>

      <div className="mt-4 grid gap-2">
        {bots.slice(0, 4).map((bot) => {
          const readiness = agentReadinessLabel(bot, phoneLookupDegraded);
          const live = Boolean(bot.phone_number);
          return (
            <Link
              key={bot.id}
              to={`/studio?agent=${encodeURIComponent(bot.id)}&section=setup`}
              className="group flex min-h-[56px] min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/30 hover:bg-muted/30 wl-focus-ring-halo"
            >
              <AgentFace
                seed={bot.name || bot.id}
                size={32}
                title={`${bot.name} face`}
                className="shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {bot.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {formatAgentRoleLabel(bot.role)}
                </span>
              </span>
              <span className={`wl-chip wl-chip--${live ? "success" : "warning"} shrink-0`}>
                <span className="wl-chip__dot" aria-hidden="true" />
                {readiness}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button asChild variant="secondary" size="sm" className="justify-center">
          <Link to="/studio">All Bots</Link>
        </Button>
        <Button asChild size="sm" className="justify-center">
          <Link to="/studio?create=1">
            <Plus size={14} aria-hidden="true" />
            New Bot
          </Link>
        </Button>
      </div>
    </section>
  );
}

function ConfigureCard({ bot }: { bot?: WorkspaceAgentSummary }) {
  const setupHref = bot
    ? `/studio?agent=${encodeURIComponent(bot.id)}&section=setup`
    : "/studio?create=1";
  const links = [
    {
      label: "Playbook & Voice",
      detail: "Role, behavior, tone, and voice",
      href: setupHref,
      icon: Bot,
    },
    {
      label: "Channels & Tools",
      detail: "Voice, text, email, calendar, and CRM",
      href: "/connections",
      icon: Workflow,
    },
    {
      label: "Knowledge",
      detail: "Facts, files, policies, and preferences",
      href: "/knowledge",
      icon: ShieldCheck,
    },
  ];

  return (
    <section className="wl-paper wl-paper-elevated p-5" aria-labelledby="overview-config-title">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Configure
      </p>
      <h2 id="overview-config-title" className="mt-1 text-base font-semibold text-foreground">
        One control surface
      </h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Every Bot uses the same building blocks. Start from a role, then shape the workflow.
      </p>
      <div className="mt-4 grid gap-1">
        {links.map(({ label, detail, href, icon: Icon }) => (
          <Link
            key={label}
            to={href}
            className="group flex min-h-[54px] items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-muted/50 wl-focus-ring-halo"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Icon size={15} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{label}</span>
              <span className="block truncate text-xs text-muted-foreground">{detail}</span>
            </span>
            <ArrowRight
              size={14}
              className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}

function MetricsCard({ metrics }: { metrics: OverviewMetrics }) {
  const rows = [
    {
      label: "Customer conversations today",
      value: metrics.conversationsToday,
      href: "/inbox",
      icon: Inbox,
    },
    {
      label: "High-intent today",
      value: metrics.highIntentToday,
      href: "/insights",
      icon: Sparkles,
    },
    {
      label: "Appointments booked",
      value: metrics.appointmentsBooked,
      href: "/phone?tab=appointments",
      icon: CalendarCheck2,
    },
    {
      label: "Needs attention",
      value: metrics.activeWork,
      href: "/approvals",
      icon: ShieldCheck,
    },
  ];
  const maximum = Math.max(1, ...rows.map((row) => row.value));

  return (
    <section className="wl-paper wl-paper-elevated p-5" aria-labelledby="overview-metrics-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Today
          </p>
          <h2 id="overview-metrics-title" className="mt-1 text-base font-semibold text-foreground">
            Today&apos;s Overview
          </h2>
        </div>
        <Clock3 size={16} className="text-primary" aria-hidden="true" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {rows.map(({ label, value, href, icon: Icon }) => (
          <Link
            key={label}
            to={href}
            className="rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/30 hover:bg-muted/30 wl-focus-ring-halo"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-medium leading-4 text-muted-foreground">
                {label}
              </span>
              <Icon size={14} className="shrink-0 text-primary" aria-hidden="true" />
            </div>
            <strong className="mt-2 block font-[var(--wireline-font-family-display)] text-2xl font-semibold leading-none text-foreground tabular-nums">
              {value}
            </strong>
            <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${Math.max(value > 0 ? 12 : 0, (value / maximum) * 100)}%` }}
              />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function UnifiedInbox({
  conversations,
  selectedId,
  onSelect,
  loading,
  unavailable,
}: {
  conversations: RecentConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  unavailable: boolean;
}) {
  const selected =
    conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0];
  const SelectedIcon = selected ? channelIcon(selected.channel) : Inbox;

  return (
    <section className="wl-paper wl-paper-elevated overflow-hidden" aria-labelledby="unified-inbox-title">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            Voice · Text · Email
          </p>
          <h2 id="unified-inbox-title" className="mt-1 text-lg font-semibold text-foreground">
            Unified Inbox
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            ["All", "/inbox"],
            ["Calls", "/inbox?tab=voice"],
            ["Texts", "/inbox?tab=sms"],
            ["Email", "/inbox?tab=email"],
          ].map(([label, href], index) => (
            <Link
              key={label}
              to={href}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                index === 0
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid min-h-[430px] lg:grid-cols-[minmax(17rem,0.82fr)_minmax(0,1.18fr)]">
        <div className="border-b border-border p-3 lg:border-b-0 lg:border-r">
          {loading ? (
            <div className="grid gap-2" aria-busy="true" aria-label="Loading conversations">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="rounded-xl border border-border p-3">
                  <Skeleton shape="text" className="h-4 w-32" />
                  <Skeleton shape="text" className="mt-2 h-3 w-full" />
                </div>
              ))}
            </div>
          ) : unavailable ? (
            <StatusNotice tone="warning" title="Inbox preview unavailable">
              Open Inbox or refresh to try again. Your conversation history is unchanged.
            </StatusNotice>
          ) : conversations.length === 0 ? (
            <EmptyState
              density="compact"
              titleTone="ui"
              icon={<Inbox aria-hidden="true" />}
              title="No conversations yet"
              action={
                <Button asChild size="sm">
                  <Link to="/studio">Test a Bot</Link>
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-1.5" aria-label="Recent customer conversations">
              {conversations.map((conversation) => {
                const Icon = channelIcon(conversation.channel);
                const active = selected?.id === conversation.id;
                return (
                  <li key={`${conversation.channel}-${conversation.id}`}>
                    <button
                      type="button"
                      onClick={() => onSelect(conversation.id)}
                      aria-pressed={active}
                      className={`flex min-h-[72px] w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors wl-focus-ring-halo ${
                        active
                          ? "border-primary/30 bg-primary/5"
                          : "border-transparent hover:border-border hover:bg-muted/35"
                      }`}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Icon size={16} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-3">
                          <strong className="truncate text-sm font-semibold text-foreground">
                            {conversation.contact || "Unknown contact"}
                          </strong>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatConversationTime(conversation.occurred_at)}
                          </span>
                        </span>
                        <span className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground">
                          {conversationPreview(conversation)}
                        </span>
                        <span className="mt-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
                          {channelLabel(conversation.channel)}
                          {conversation.agent_name ? ` · ${conversation.agent_name}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Button asChild variant="secondary" size="sm" className="mt-3 w-full justify-center">
            <Link to="/inbox">
              Open Inbox
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <div className="min-w-0 p-5 sm:p-6">
          {selected ? (
            <div className="flex h-full min-h-[300px] flex-col">
              <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <SelectedIcon size={20} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                      {channelLabel(selected.channel)} conversation
                    </p>
                    <h3 className="mt-1 truncate text-xl font-semibold text-foreground">
                      {selected.contact || "Unknown contact"}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        selected.agent_name,
                        formatConversationTime(selected.occurred_at, selected.duration_seconds),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                <Button asChild variant="secondary" size="sm" className="shrink-0 justify-center">
                  <Link to={channelHref(selected.channel)}>Open Thread</Link>
                </Button>
              </div>

              <div className="flex flex-1 flex-col justify-between gap-6 py-6">
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Conversation summary
                  </p>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-foreground">
                    {conversationPreview(selected)}
                  </p>
                  {selected.headline &&
                  selected.summary &&
                  selected.headline !== selected.summary ? (
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
                      {selected.summary}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    ["Channel", channelLabel(selected.channel)],
                    ["Handled By", selected.agent_name || "Wireline Bot"],
                    ["Status", "Recorded"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-border bg-muted/25 p-3">
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        {label}
                      </span>
                      <strong className="mt-1.5 block truncate text-sm font-semibold text-foreground">
                        {value}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              density="compact"
              titleTone="ui"
              icon={<MessageSquare aria-hidden="true" />}
              title="Select a conversation"
            />
          )}
        </div>
      </div>
    </section>
  );
}

export default function OverviewPage() {
  const { agents, loading, degraded, phoneLookupDegraded, refresh } = useAgents();
  const [showOutboundDial, setShowOutboundDial] = useState(false);
  const [metrics, setMetrics] = useState<OverviewMetrics>(EMPTY_METRICS);
  const [conversations, setConversations] = useState<RecentConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [dashboardUnavailable, setDashboardUnavailable] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const loadedOnceRef = useRef(false);

  useEffect(() => {
    let timer: number | null = null;
    const onFocus = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setRefreshTick((value) => value + 1), 1_500);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      if (!loadedOnceRef.current) setLoadingDashboard(true);
      setDashboardUnavailable(false);
      const dayBoundary = new Date();
      dayBoundary.setHours(0, 0, 0, 0);
      const since = dayBoundary.toISOString();

      const [recentResponse, metricsResponse] = await Promise.all([
        authFetch("/api/overview/recent-conversations").catch(() => null),
        authFetch(`/api/overview/operating-metrics?since=${encodeURIComponent(since)}`).catch(
          () => null,
        ),
      ]);

      if (cancelled) return;

      if (recentResponse?.ok) {
        const body = await recentResponse.json().catch(() => null);
        const nextConversations = Array.isArray(body?.conversations)
          ? (body.conversations as RecentConversation[]).slice(0, 8)
          : [];
        setConversations(nextConversations);
        setSelectedConversationId((current) => {
          if (current && nextConversations.some((item) => item.id === current)) return current;
          return nextConversations[0]?.id ?? null;
        });
      } else {
        setDashboardUnavailable(true);
      }

      if (metricsResponse?.ok) {
        const body = await metricsResponse.json().catch(() => null);
        setMetrics({
          conversationsToday: Number(body?.conversationsToday ?? 0),
          highIntentToday: Number(body?.highIntentToday ?? 0),
          appointmentsBooked: Number(body?.appointmentsBooked ?? 0),
          activeWork: Number(body?.activeWork ?? 0),
        });
      } else {
        setDashboardUnavailable(true);
      }

      setLoadingDashboard(false);
      loadedOnceRef.current = true;
    }

    void loadOverview();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const primaryBot = agents[0];
  const hasBots = agents.length > 0;
  const hasLiveLine = agents.some((bot) => Boolean(bot.phone_number));
  const isFirstRun = !loading && !degraded && !hasBots;
  const primaryStudioHref = primaryBot
    ? `/studio?agent=${encodeURIComponent(primaryBot.id)}&section=setup`
    : "/studio?create=1";

  const selectedConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  return (
    <WorkspaceShell contentClassName="pt-3 pb-5 lg:pt-4">
      <WorkspacePageFrame mode="operate" className="wl-overview">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
              One workspace
            </p>
            <h1 className="wl-app-page-title mt-1">Overview</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Build and operate Bots for business roles, personal work, or any custom workflow.
              Voice, text, email, knowledge, tools, and outcomes stay together.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="secondary" className="justify-center">
              <Link to="/templates">Browse Templates</Link>
            </Button>
            {hasLiveLine ? (
              <Button
                type="button"
                className="justify-center"
                onClick={() => setShowOutboundDial(true)}
              >
                <Phone size={15} aria-hidden="true" />
                Start a Call
              </Button>
            ) : (
              <Button asChild className="justify-center">
                <Link to={hasBots ? primaryStudioHref : "/studio?create=1"}>
                  {hasBots ? (
                    <Sparkles size={15} aria-hidden="true" />
                  ) : (
                    <Plus size={15} aria-hidden="true" />
                  )}
                  {hasBots ? "Configure Bot" : "Create Bot"}
                </Link>
              </Button>
            )}
          </div>
        </header>

        {isFirstRun ? (
          <FirstRunWorkspace />
        ) : degraded && !hasBots ? (
          <WorkspaceRecovery onRetry={refresh} />
        ) : loading && !hasBots ? (
          <DashboardLoadingState />
        ) : (
          <>
            <ActivationChecklist className="mb-0" />

            {degraded ? (
              <StatusNotice tone="warning" title="Bot roster partial">
                Wireline is showing the last safe Bot roster while account data recovers.
              </StatusNotice>
            ) : null}
            {phoneLookupDegraded ? (
              <StatusNotice tone="warning" title="Line status unavailable">
                We could not verify attached phone numbers. Your lines and Bots are unchanged.
              </StatusNotice>
            ) : null}
            {dashboardUnavailable && !loadingDashboard ? (
              <StatusNotice tone="warning" title="Overview data partial">
                Some metrics or conversation previews could not be refreshed. Open Inbox for the
                full record.
              </StatusNotice>
            ) : null}

            <section
              className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.65fr)]"
              aria-label="Customer demand and outcomes"
            >
              <UnifiedInbox
                conversations={conversations}
                selectedId={selectedConversation?.id ?? null}
                onSelect={setSelectedConversationId}
                loading={loadingDashboard}
                unavailable={dashboardUnavailable && conversations.length === 0}
              />
              <aside className="grid content-start gap-4" aria-label="Workspace summary">
                {loadingDashboard ? (
                  <div className="wl-paper wl-paper-elevated p-5" aria-busy="true">
                    <Skeleton shape="text" className="h-4 w-32" />
                    <Skeleton shape="text" className="mt-5 h-28 w-full" />
                  </div>
                ) : (
                  <MetricsCard metrics={metrics} />
                )}
                <BotRoster bots={agents} phoneLookupDegraded={phoneLookupDegraded} />
                <ConfigureCard bot={primaryBot} />
              </aside>
            </section>

            <section className="wl-paper wl-paper-elevated p-5 sm:p-6" aria-label="Outcome ledger">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Proof of work
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-foreground">Outcomes</h2>
                </div>
                <Button asChild variant="secondary" size="sm">
                  <Link to="/insights">Open Analytics</Link>
                </Button>
              </div>
              <OutcomeLedger limit={5} showViewAll followUpsHref="/approvals" />
            </section>
          </>
        )}
      </WorkspacePageFrame>
      <OutboundDialDialog open={showOutboundDial} onClose={() => setShowOutboundDial(false)} />
    </WorkspaceShell>
  );
}
