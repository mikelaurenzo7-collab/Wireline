import { useEffect, useMemo, useState, useCallback } from "react";

import { cn } from "../lib/utils";
import { usePresenceSignals } from "../hooks/usePresenceSignals";
import { Download } from "lucide-react";

import { authFetch } from "../lib/api";
import AgentFace from "./AgentFace";
import LiveFloorPresence from "./LiveFloorPresence";
import { WiredEyebrow } from "./ui/WiredEyebrow";
import { WL_APP_CLASSES } from "../lib/wireline-design-system";
import { WorkspaceTabStrip } from "./layout/WorkspaceTabStrip";

/**
 * CallLogsClaude — Operate surface in the Claude Design ground truth.
 *
 * KPI hero row + Floor / Intel / Triage / Analytics tabs, all bound to the
 * real /api/calls record. Wireline tailoring: the prototype's "live floor"
 * and "ops log" map to the call_logs table's `outcome_tag`, `sentiment`,
 * `qa_score`, and `lead_score` columns — no fabricated state.
 */

type Call = {
  id: string;
  agent_id?: string | null;
  agent_name?: string | null;
  direction?: string | null;
  customer_number?: string | null;
  duration_seconds?: number | null;
  summary?: string | null;
  sentiment?: string | null;
  outcome_tag?: string | null;
  intent_label?: string | null;
  lead_score?: number | null;
  qa_score?: number | null;
  coaching_note?: string | null;
  created_at?: string | null;
};

type CallsResponse = {
  calls?: Call[];
  total?: number;
  hasMore?: boolean;
};

type TabId = "floor" | "intel" | "triage" | "analytics";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "floor", label: "Floor" },
  { id: "intel", label: "Intel" },
  { id: "triage", label: "Triage" },
  { id: "analytics", label: "Analytics" },
];

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutesAgo = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutesAgo < 1) return "just now";
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  const hoursAgo = Math.round(minutesAgo / 60);
  if (hoursAgo < 24) return `${hoursAgo}h ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function isLive(call: Call): boolean {
  if (!call.created_at) return false;
  const ts = new Date(call.created_at).getTime();
  if (!ts) return false;
  return Date.now() - ts < 5 * 60_000;
}

function isEscalation(call: Call): boolean {
  if (call.outcome_tag && /escalat|handoff|transfer/i.test(call.outcome_tag)) return true;
  if (call.sentiment && /(negative|angry|frustrat)/i.test(call.sentiment)) return true;
  return false;
}

function isActionItem(call: Call): boolean {
  if (isEscalation(call)) return false;
  if (typeof call.lead_score === "number" && call.lead_score >= 70) return true;
  if (call.outcome_tag && /(followup|callback|book|schedule)/i.test(call.outcome_tag)) return true;
  return false;
}

function todayBoundary(): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

function Wave() {
  return (
    <div className="flex h-5 items-end gap-[2px]" aria-hidden="true">
      {[30, 80, 50, 95, 40].map((height, index) => (
        <span
          key={index}
          className="w-[2px] rounded-sm"
          style={{
            height: `${height}%`,
            background: "var(--wireline-color-status-success)",
            animation: "wlCallWave 1.2s ease-in-out infinite",
            animationDelay: `${index * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function CallLogsClaude() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = (function useTabState() {
    const url = new URL(typeof window !== "undefined" ? window.location.href : "http://x/");
    const get = url.searchParams.get("tab") as TabId | null;
    const initial: TabId = tabs.some((tab) => tab.id === get) ? (get as TabId) : "floor";
    const [state, set] = useState<TabId>(initial);
    function update(next: TabId) {
      set(next);
      if (typeof window !== "undefined") {
        const u = new URL(window.location.href);
        u.searchParams.set("tab", next);
        window.history.replaceState({}, "", u.toString());
      }
    }
    return [state, update] as const;
  })();
  const activeTab = params;
  const setActiveTab = setParams;
  const presenceSignals = usePresenceSignals({ enabled: activeTab === "floor" });

  const agentNameForId = useCallback(
    (agentId: string) => {
      const match = calls.find((call) => call.agent_id === agentId);
      return match?.agent_name || "Agent";
    },
    [calls],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    authFetch("/api/calls?limit=100")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: CallsResponse | null) => {
        if (cancelled) return;
        setCalls(Array.isArray(body?.calls) ? body!.calls! : []);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load calls. Try again in a moment.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = useMemo(() => {
    const boundary = todayBoundary();
    return calls.filter((call) => {
      if (!call.created_at) return false;
      const ts = new Date(call.created_at).getTime();
      return ts >= boundary;
    });
  }, [calls]);

  const live = useMemo(() => calls.filter(isLive), [calls]);
  const escalations = useMemo(() => calls.filter(isEscalation), [calls]);
  const intel = useMemo(() => calls.filter(isActionItem), [calls]);
  const fleet = useMemo(() => {
    const ids = new Set<string>();
    for (const call of calls) if (call.agent_id) ids.add(call.agent_id);
    return ids.size;
  }, [calls]);

  const kpis = [
    { label: "Today", value: today.length, accent: "default" as const },
    { label: "Pending", value: intel.length, accent: "default" as const },
    { label: "Fleet", value: fleet, accent: "default" as const },
    { label: "Escalations", value: escalations.length, accent: "warning" as const },
  ];

  return (
    <div className={cn(WL_APP_CLASSES.operateSurface, "flex h-full min-h-0 flex-col")}>
      <div className="border-b border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-5 py-3">
        <WiredEyebrow>Call ops</WiredEyebrow>
      </div>
      <section
        aria-label="Call ops metrics"
        className="grid grid-cols-2 border-b border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] sm:flex sm:items-stretch sm:divide-x sm:divide-[var(--wireline-color-border-default)]"
      >
        {kpis.map((kpi, index) => {
          const accent =
            kpi.accent === "warning"
              ? "var(--wireline-color-status-warning)"
              : "var(--wireline-color-text-primary)";
          // On phones, 2×2 grid with borders between cells; from sm up,
          // a single equal-width row with vertical dividers.
          const phoneBorders = [
            "border-b border-r border-[var(--wireline-color-border-default)] sm:border-b-0 sm:border-r-0",
            "border-b border-[var(--wireline-color-border-default)] sm:border-b-0",
            "border-r border-[var(--wireline-color-border-default)] sm:border-r-0",
            "",
          ][index];
          return (
            <div
              key={kpi.label}
              className={`px-4 py-3 sm:flex-1 sm:px-5 sm:py-3.5 ${phoneBorders}`}
            >
              <div
                className={cn(WL_APP_CLASSES.wiredEyebrow)}
                style={
                  kpi.accent === "warning"
                    ? { color: "var(--wireline-color-status-warning)" }
                    : undefined
                }
              >
                {kpi.label}
              </div>
              <div
                className="font-[var(--wireline-font-family-display)] text-[clamp(1.5rem,1.2rem+0.6vw,2rem)] leading-none tracking-[-0.02em]"
                style={{ color: accent }}
              >
                {loading ? "—" : kpi.value}
              </div>
            </div>
          );
        })}
      </section>

      <div className="flex items-center gap-3 border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-5 py-2.5">
        <WorkspaceTabStrip
          ariaLabel="Call ops tabs"
          tabs={tabs}
          activeId={activeTab}
          onSelect={(id) => setActiveTab(id as TabId)}
          className="mb-0 flex-1 border-b-0 pb-0"
        />
        {/* Server-side export: tenant-scoped, audited, cookie-authenticated. */}
        <a
          href="/api/export/calls.csv"
          download
          className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40"
        >
          <Download size={15} aria-hidden="true" />
          Export CSV
        </a>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {error ? (
          <div
            role="alert"
            className="rounded-[10px] border border-[var(--wireline-color-feedback-error-border)] bg-[var(--wireline-color-feedback-error-surface)] px-4 py-3 text-[13px] text-[var(--wireline-color-status-error)]"
          >
            {error}
          </div>
        ) : null}
        {!error && activeTab === "floor" ? (
          <>
            <LiveFloorPresence signals={presenceSignals} agentNameForId={agentNameForId} />
            <FloorTab
              calls={
                live.length > 0 ? live : today.length > 0 ? today.slice(0, 12) : calls.slice(0, 12)
              }
              loading={loading}
              hasLive={live.length > 0 || presenceSignals.length > 0}
            />
          </>
        ) : null}
        {!error && activeTab === "intel" ? <IntelTab items={intel} loading={loading} /> : null}
        {!error && activeTab === "triage" ? (
          <TriageTab items={escalations} loading={loading} />
        ) : null}
        {!error && activeTab === "analytics" ? <AnalyticsTab /> : null}
      </div>
    </div>
  );
}

function FloorTab({
  calls,
  loading,
  hasLive,
}: {
  calls: Call[];
  loading: boolean;
  hasLive: boolean;
}) {
  if (loading) return <RowSkeleton />;
  if (!calls.length) {
    return <EmptyState title="Floor is quiet." body="Live calls appear here." />;
  }
  return (
    <>
      <div
        className="mb-4 inline-flex items-center gap-2 wl-eyebrow wl-eyebrow--wired wl-eyebrow--wired--app"
        style={{ color: "var(--wireline-color-action-primary-default)" }}
      >
        <span
          className="size-1.5 rounded-full"
          style={{
            background: hasLive
              ? "var(--wireline-color-status-success)"
              : "var(--wireline-color-text-tertiary)",
            animation: hasLive ? "wlPulse 2s infinite" : undefined,
          }}
          aria-hidden="true"
        />
        {hasLive ? "Live Floor" : "Recent Activity"}
      </div>
      <ul className="flex flex-col gap-2.5">
        {calls.map((call) => (
          <li
            key={call.id}
            className="flex items-center gap-4 rounded-[12px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-5 py-4 transition-colors hover:border-[var(--wireline-color-action-primary-default)]"
          >
            <AgentFace
              seed={call.agent_name || call.agent_id || "agent"}
              size={40}
              speaking={isLive(call)}
              title={call.agent_name ? `${call.agent_name} on call` : "Agent on call"}
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold text-[var(--wireline-color-text-primary)]">
                  {call.customer_number || "Unknown caller"}
                </span>
                <span className="font-[var(--wireline-font-mono)] text-[10px] text-[var(--wireline-color-text-tertiary)]">
                  {formatTime(call.created_at)}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[13px] text-[var(--wireline-color-text-secondary)]">
                {call.summary || call.intent_label || "No summary yet."}
                {call.agent_name ? (
                  <>
                    {" · "}
                    <span className="text-[var(--wireline-color-text-tertiary)]">
                      {call.agent_name}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-[var(--wireline-font-mono)] text-[12px] font-semibold text-[var(--wireline-color-text-primary)]">
                {formatDuration(call.duration_seconds)}
              </div>
              <div
                className="mt-1 inline-flex items-center justify-end gap-1 font-[var(--wireline-font-mono)] text-[9px] uppercase tracking-[0.1em]"
                style={{
                  color: isLive(call)
                    ? "var(--wireline-color-status-success)"
                    : "var(--wireline-color-text-tertiary)",
                }}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{
                    background: isLive(call)
                      ? "var(--wireline-color-status-success)"
                      : "var(--wireline-color-text-tertiary)",
                    animation: isLive(call) ? "wlPulse 2s infinite" : undefined,
                  }}
                  aria-hidden="true"
                />
                {isLive(call) ? "Live" : call.outcome_tag || "Done"}
              </div>
            </div>
            {isLive(call) ? <Wave /> : null}
          </li>
        ))}
      </ul>
    </>
  );
}

function IntelTab({ items, loading }: { items: Call[]; loading: boolean }) {
  if (loading) return <RowSkeleton />;
  if (!items.length) {
    return (
      <EmptyState
        title="No follow-ups queued."
        body="High-value and callback-tagged calls land here."
      />
    );
  }
  return (
    <>
      <div
        className="mb-4 wl-eyebrow "
        style={{ color: "var(--wireline-color-action-primary-default)" }}
      >
        Action Feed
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((call) => (
          <li
            key={call.id}
            className="flex items-center gap-3.5 rounded-[12px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-5 py-4 transition-colors hover:border-[var(--wireline-color-action-primary-default)]"
          >
            <div
              className="grid size-9 shrink-0 place-items-center rounded-[9px] text-base"
              style={{
                background: "var(--wireline-color-feedback-success-surface)",
                color: "var(--wireline-color-action-primary-pressed)",
              }}
              aria-hidden="true"
            >
              ⚡
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-[var(--wireline-color-text-primary)]">
                {call.intent_label || call.summary || "Follow up requested"}
              </div>
              <div className="mt-0.5 truncate text-xs text-[var(--wireline-color-text-tertiary)]">
                {call.agent_name || "Agent"} · {formatTime(call.created_at)}
              </div>
            </div>
            <span
              className="font-[var(--wireline-font-mono)] text-[9px] uppercase tracking-[0.1em] rounded px-2 py-1"
              style={{
                background: "var(--wireline-color-feedback-success-surface)",
                color: "var(--wireline-color-action-primary-pressed)",
              }}
            >
              {call.lead_score && call.lead_score >= 85 ? "High" : "Med"}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function TriageTab({ items, loading }: { items: Call[]; loading: boolean }) {
  if (loading) return <RowSkeleton />;
  if (!items.length) {
    return (
      <EmptyState
        title="Nothing to triage."
        body="Escalations and negative-sentiment calls surface here."
      />
    );
  }
  return (
    <>
      <div
        className="mb-4 inline-flex items-center gap-2 wl-eyebrow wl-eyebrow--wired wl-eyebrow--wired--app"
        style={{ color: "var(--wireline-color-status-warning)" }}
      >
        <span
          className="size-1.5 rounded-full"
          style={{
            background: "var(--wireline-color-status-warning)",
            animation: "wlPulse 2s infinite",
          }}
          aria-hidden="true"
        />
        Needs attention
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((call) => (
          <li
            key={call.id}
            className="rounded-[12px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-5 py-4 transition-colors hover:border-[var(--wireline-color-status-warning)]"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className="font-[var(--wireline-font-mono)] text-[9px] uppercase tracking-[0.1em] rounded px-2 py-1"
                style={{
                  background:
                    "color-mix(in srgb, var(--wireline-color-status-warning) 14%, transparent)",
                  color: "var(--wireline-color-status-warning)",
                }}
              >
                {call.outcome_tag || "Voice"}
              </span>
              <span className="text-sm font-semibold text-[var(--wireline-color-text-primary)]">
                {call.customer_number || "Unknown caller"}
              </span>
              <span className="ml-auto text-xs text-[var(--wireline-color-text-tertiary)]">
                {formatTime(call.created_at)}
              </span>
            </div>
            <div className="text-[13px] leading-relaxed text-[var(--wireline-color-text-secondary)]">
              {call.summary || call.coaching_note || "No summary yet — open the call to review."}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-[var(--wireline-color-text-tertiary)]">
                {call.agent_name || "Agent"}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function AnalyticsTab() {
  return (
    <div className="grid place-items-center rounded-[14px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-7 py-16 text-center">
      <p className="font-[var(--wireline-font-family-display)] text-[22px] leading-tight tracking-[-0.02em] text-[var(--wireline-color-text-primary)]">
        Charts when you have call history
      </p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid place-items-center py-16 text-center">
      <div className="max-w-md">
        <div className="font-[var(--wireline-font-family-display)] text-[22px] tracking-[-0.01em] text-[var(--wireline-color-text-primary)]">
          {title}
        </div>
        <p className="mt-2 text-[13px] text-[var(--wireline-color-text-secondary)]">{body}</p>
      </div>
    </div>
  );
}

function RowSkeleton() {
  return (
    <ul className="flex flex-col gap-2.5" aria-busy="true" aria-label="Loading calls">
      {Array.from({ length: 4 }, (_, index) => (
        <li
          key={index}
          className="h-[76px] animate-pulse rounded-[12px] bg-[var(--wireline-color-surface-subtle)]"
        />
      ))}
    </ul>
  );
}
