import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router";

import { cn } from "../lib/utils";
import { usePresenceSignals } from "../hooks/usePresenceSignals";
import { Download, Phone, Zap } from "lucide-react";

import { authFetch } from "../lib/api";
import { formatPhone } from "../lib/safe-number";
import AgentFace from "./AgentFace";
import CallOpsAnalytics from "./CallOpsAnalytics";
import LiveFloorPresence from "./LiveFloorPresence";
import { WL_APP_CLASSES } from "../lib/wireline-design-system";
import { WorkspaceTabStrip } from "./layout/WorkspaceTabStrip";
import OutboundDialDialog from "./OutboundDialDialog";
import { Button } from "./atoms";
import { CardRowSkeleton } from "./atoms/skeleton-presets";
import { EmptyState } from "./ui/EmptyState";

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

type CallOpsMetrics = {
  today: number;
  pending: number;
  agents: number;
  escalations: number;
  since: string;
};

type TabId = "floor" | "intel" | "triage" | "analytics";

const tabs: Array<{
  id: TabId;
  label: string;
  shortLabel?: string;
  ariaLabel?: string;
}> = [
  { id: "floor", label: "Floor" },
  { id: "intel", label: "Intel" },
  { id: "triage", label: "Triage" },
  { id: "analytics", label: "Analytics", shortLabel: "Stats", ariaLabel: "Analytics" },
];

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return "N/A";
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

function humanizeTaxonomy(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim();
  if (!normalized || /^(unknown|other)$/i.test(normalized)) return fallback;
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function outcomeStatusStyle(tag: string | null | undefined): {
  color: string;
  background: string;
} {
  const normalized = (tag || "").toLowerCase();
  if (/unreachable|no.?answer|failed|busy|voicemail/.test(normalized)) {
    return {
      color: "var(--wireline-color-status-warning)",
      background: "color-mix(in srgb, var(--wireline-color-status-warning) 14%, transparent)",
    };
  }
  // Escalations/handoffs are warning-level everywhere else (the amber
  // Escalations KPI, the Triage tab), so the row pill carries the same amber
  // instead of reading as a neutral outcome.
  if (/escalat|handoff|transfer/.test(normalized)) {
    return {
      color: "var(--wireline-color-status-warning)",
      background: "color-mix(in srgb, var(--wireline-color-status-warning) 14%, transparent)",
    };
  }
  if (/booked|qualified|success|completed/.test(normalized)) {
    return {
      color: "var(--wireline-color-status-success)",
      background: "var(--wireline-color-feedback-success-surface)",
    };
  }
  // Neutral outcomes share the same pill anatomy as the semantic ones — a
  // quiet tint rather than a bare label, so the three chips read as one
  // component family (green booked / amber escalation / gray informational).
  return {
    color: "var(--wireline-color-text-tertiary)",
    background: "color-mix(in srgb, var(--wireline-color-text-tertiary) 10%, transparent)",
  };
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

// Floor tab reveal batch size — also used as the increment for both the
// client-side "already fetched but hidden" reveal and the server-side
// offset when /api/calls reports more rows exist than we've fetched.
const FLOOR_PAGE_SIZE = 12;

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
  const [metrics, setMetrics] = useState<CallOpsMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [visibleFloorCount, setVisibleFloorCount] = useState(FLOOR_PAGE_SIZE);
  const [showOutboundDial, setShowOutboundDial] = useState(false);
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
      return match?.agent_name || "Voice agent";
    },
    [calls],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    authFetch("/api/calls?limit=100&offset=0")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Couldn't load calls. Try again in a moment.");
        }
        return response.json() as Promise<CallsResponse>;
      })
      .then((body) => {
        if (cancelled) return;
        setCalls(Array.isArray(body?.calls) ? body.calls : []);
        setHasMore(Boolean(body?.hasMore));
      })
      .catch(() => {
        if (cancelled) return;
        setCalls([]);
        setError("Couldn't load calls. Try again in a moment.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMetricsLoading(true);
    setMetricsError(false);
    const since = new Date(todayBoundary()).toISOString();
    authFetch(`/api/call-ops/metrics?since=${encodeURIComponent(since)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load Call Ops metrics.");
        return response.json() as Promise<CallOpsMetrics>;
      })
      .then((body) => {
        if (cancelled) return;
        setMetrics(body);
      })
      .catch(() => {
        if (cancelled) return;
        setMetrics(null);
        setMetricsError(true);
      })
      .finally(() => {
        if (!cancelled) setMetricsLoading(false);
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

  // Same priority chain the Floor tab renders (live > today > everything),
  // kept unsliced here so pagination can reason about the real bucket size
  // instead of the display cap.
  const floorList = live.length > 0 ? live : today.length > 0 ? today : calls;
  // More already-fetched-but-hidden rows exist in this bucket — reveal them
  // client-side, no network call needed.
  const floorHasMoreVisible = live.length === 0 && floorList.length > visibleFloorCount;
  // The visible bucket is exhausted but /api/calls said more rows exist
  // server-side (hasMore, from the offset/limit pagination it already
  // supports — see src/routes/dashboard-routes.ts). Older rows fetched this
  // way can still land in `today` (or even `live`, in principle), since they
  // flow back through the same `calls` state and the memos above.
  const floorHasMoreServer = live.length === 0 && !floorHasMoreVisible && hasMore;
  const floorCanLoadMore = floorHasMoreVisible || floorHasMoreServer;

  const loadMoreFloorCalls = useCallback(() => {
    if (floorHasMoreVisible) {
      setVisibleFloorCount((prev) => prev + FLOOR_PAGE_SIZE);
      return;
    }
    if (!floorHasMoreServer || loadingMore) return;
    setLoadingMore(true);
    authFetch(`/api/calls?limit=${FLOOR_PAGE_SIZE}&offset=${calls.length}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Couldn't load more calls.");
        return response.json() as Promise<CallsResponse>;
      })
      .then((body) => {
        const nextCalls = Array.isArray(body.calls) ? body.calls : [];
        setCalls((prev) => [...prev, ...nextCalls]);
        setHasMore(Boolean(body.hasMore));
        setVisibleFloorCount((prev) => prev + FLOOR_PAGE_SIZE);
      })
      .catch(() => {
        setError("Couldn't load more calls. Try again in a moment.");
      })
      .finally(() => setLoadingMore(false));
  }, [calls.length, floorHasMoreVisible, floorHasMoreServer, loadingMore]);

  // KPI tiles reflect exact operational state. The Intel/Triage tabs below
  // remain paginated call classifications by design; they are evidence feeds,
  // not substitutes for workspace-wide pending/escalation queues.
  const kpis = [
    { label: "Today", value: metrics?.today ?? 0, accent: "default" as const },
    { label: "Pending", value: metrics?.pending ?? 0, accent: "default" as const },
    { label: "Agents", value: metrics?.agents ?? 0, accent: "default" as const },
    { label: "Escalations", value: metrics?.escalations ?? 0, accent: "warning" as const },
  ];

  return (
    <div className={cn(WL_APP_CLASSES.operateSurface, "flex h-full min-h-0 flex-col")}>
      <div className="flex items-center justify-end gap-3 border-b border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-5 py-3">
        <h2 className="sr-only">Call ops</h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={() => setShowOutboundDial(true)}
          aria-label="Place outbound call"
        >
          <Phone className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Place outbound call</span>
        </Button>
      </div>
      <section
        aria-label="Call ops metrics"
        className="grid grid-cols-2 gap-2 border-b border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-5 py-3 sm:grid-cols-4"
      >
        {kpis.map((kpi) => {
          const isWarning = kpi.accent === "warning";
          return (
            <article key={kpi.label} className="wl-metric-tile wl-metric-tile--compact">
              <p
                className="wl-metric-tile__label"
                style={isWarning ? { color: "var(--wireline-color-status-warning)" } : undefined}
              >
                {kpi.label}
              </p>
              <div
                className="wl-metric-tile__value tabular-nums"
                style={isWarning ? { color: "var(--wireline-color-status-warning)" } : undefined}
              >
                {metricsLoading || metricsError ? "N/A" : kpi.value}
              </div>
            </article>
          );
        })}
      </section>

      <div className="flex items-center gap-3 border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-5 py-2.5">
        <WorkspaceTabStrip
          ariaLabel="Call ops tabs"
          tabs={tabs}
          activeId={activeTab}
          onSelect={(id) => setActiveTab(id as TabId)}
          density="compact"
          className="mb-0 flex-1 border-b-0 pb-0"
        />
        {/* Server-side export: tenant-scoped, audited, cookie-authenticated. */}
        <a
          href="/api/export/calls.csv"
          download
          aria-label="Export calls as CSV"
          title="Export CSV"
          className="inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40 sm:min-h-[44px] sm:px-4"
        >
          <Download size={15} aria-hidden="true" />
          <span className="hidden sm:inline">Export CSV</span>
        </a>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-[10px] border border-[var(--wireline-color-feedback-error-border)] bg-[var(--wireline-color-feedback-error-surface)] px-4 py-3 text-[13px] text-[var(--wireline-color-status-error)]"
          >
            {error}
          </div>
        ) : null}
        {activeTab === "floor" ? (
          <>
            <LiveFloorPresence signals={presenceSignals} agentNameForId={agentNameForId} />
            <FloorTab
              calls={live.length > 0 ? floorList : floorList.slice(0, visibleFloorCount)}
              loading={loading}
              loadFailed={Boolean(error)}
              hasLive={live.length > 0 || presenceSignals.length > 0}
              onOutboundCall={() => setShowOutboundDial(true)}
              canLoadMore={floorCanLoadMore}
              loadingMore={loadingMore}
              onLoadMore={loadMoreFloorCalls}
            />
          </>
        ) : null}
        {activeTab === "intel" ? (
          <IntelTab items={intel} loading={loading} loadFailed={Boolean(error)} />
        ) : null}
        {activeTab === "triage" ? (
          <TriageTab items={escalations} loading={loading} loadFailed={Boolean(error)} />
        ) : null}
        {activeTab === "analytics" ? <AnalyticsTab /> : null}
      </div>
      <OutboundDialDialog open={showOutboundDial} onClose={() => setShowOutboundDial(false)} />
    </div>
  );
}

function FloorTab({
  calls,
  loading,
  loadFailed,
  hasLive,
  onOutboundCall,
  canLoadMore,
  loadingMore,
  onLoadMore,
}: {
  calls: Call[];
  loading: boolean;
  loadFailed: boolean;
  hasLive: boolean;
  onOutboundCall: () => void;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (loading) return <CardRowSkeleton />;
  // Primary fetch failed with an empty list — show the banner only, not a fake empty inventory.
  if (loadFailed && !calls.length) return null;
  if (!calls.length) {
    return (
      <EmptyState
        fill
        titleTone="ui"
        title="No call history yet"
        description="Calls appear here with summaries, outcomes, and follow-ups."
        density="compact"
        withHalo={false}
        action={
          <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Button asChild size="sm">
              <Link to="/studio?create=1">Create voice agent</Link>
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onOutboundCall}>
              Place outbound call
            </Button>
          </div>
        }
      />
    );
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
            className="wl-paper flex items-center gap-4 px-5 py-4 transition-colors hover:border-[var(--wireline-color-action-primary-default)]"
          >
            <AgentFace
              seed={call.agent_name || call.agent_id || "agent"}
              size={40}
              speaking={isLive(call)}
              title={call.agent_name ? `${call.agent_name} on call` : "Voice agent on call"}
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="whitespace-nowrap font-[var(--wireline-font-mono)] text-sm font-semibold text-[var(--wireline-color-text-primary)]">
                  {formatPhone(call.customer_number, "Unknown caller")}
                </span>
                <span className="font-[var(--wireline-font-mono)] text-[10px] text-[var(--wireline-color-text-tertiary)]">
                  {formatTime(call.created_at)}
                </span>
              </div>
              <div className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[var(--wireline-color-text-secondary)]">
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
                className="mt-1 inline-flex items-center justify-end gap-1 rounded px-1.5 py-0.5 font-[var(--wireline-font-mono)] text-[9px] uppercase tracking-[0.1em]"
                style={{
                  color: isLive(call)
                    ? "var(--wireline-color-status-success)"
                    : outcomeStatusStyle(call.outcome_tag).color,
                  background: isLive(call)
                    ? "var(--wireline-color-feedback-success-surface)"
                    : outcomeStatusStyle(call.outcome_tag).background,
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
                {isLive(call) ? "Live" : humanizeTaxonomy(call.outcome_tag, "Done")}
              </div>
            </div>
            {isLive(call) ? <Wave /> : null}
          </li>
        ))}
      </ul>
      {canLoadMore ? (
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading…" : "Show more"}
          </Button>
        </div>
      ) : null}
    </>
  );
}

function IntelTab({
  items,
  loading,
  loadFailed,
}: {
  items: Call[];
  loading: boolean;
  loadFailed: boolean;
}) {
  if (loading) return <CardRowSkeleton />;
  if (loadFailed && !items.length) return null;
  if (!items.length) {
    return (
      <EmptyState
        title="No follow-ups queued"
        description="High-value and callback-tagged calls land here."
        density="compact"
        withHalo={false}
      />
    );
  }
  return (
    <>
      <div
        className="mb-4 inline-flex items-center gap-2 wl-eyebrow wl-eyebrow--wired wl-eyebrow--wired--app"
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
              className="grid size-9 shrink-0 place-items-center rounded-[var(--wireline-radius-md)] text-base"
              style={{
                background: "var(--wireline-color-action-primary-container)",
                color: "var(--wireline-color-action-primary-default)",
              }}
              aria-hidden="true"
            >
              <Zap className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-[var(--wireline-color-text-primary)]">
                {humanizeTaxonomy(call.intent_label, call.summary || "Follow up requested")}
              </div>
              <div className="mt-0.5 truncate text-xs text-[var(--wireline-color-text-tertiary)]">
                {call.agent_name || "Voice agent"} · {formatTime(call.created_at)}
              </div>
            </div>
            <span
              className="font-[var(--wireline-font-mono)] text-[9px] uppercase tracking-[0.1em] rounded px-2 py-1"
              style={{
                background: "var(--wireline-color-action-primary-container)",
                color: "var(--wireline-color-action-primary-default)",
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

function TriageTab({
  items,
  loading,
  loadFailed,
}: {
  items: Call[];
  loading: boolean;
  loadFailed: boolean;
}) {
  if (loading) return <CardRowSkeleton />;
  if (loadFailed && !items.length) return null;
  if (!items.length) {
    return (
      <EmptyState
        title="Nothing to triage"
        description="Escalations and negative-sentiment calls surface here."
        density="compact"
        withHalo={false}
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
                {humanizeTaxonomy(call.outcome_tag, "Voice")}
              </span>
              <span className="whitespace-nowrap font-[var(--wireline-font-mono)] text-sm font-semibold text-[var(--wireline-color-text-primary)]">
                {formatPhone(call.customer_number, "Unknown caller")}
              </span>
              <span className="ml-auto font-[var(--wireline-font-mono)] text-xs text-[var(--wireline-color-text-tertiary)]">
                {formatTime(call.created_at)}
              </span>
            </div>
            <div className="text-[13px] leading-relaxed text-[var(--wireline-color-text-secondary)]">
              {call.summary || call.coaching_note || "No summary yet. Open the call to review."}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-[var(--wireline-color-text-tertiary)]">
                {call.agent_name || "Voice agent"}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function AnalyticsTab() {
  return <CallOpsAnalytics />;
}
