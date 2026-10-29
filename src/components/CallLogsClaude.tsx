import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Loader2,
  Mic,
  Phone,
  RefreshCw,
} from "lucide-react";

import { authFetch } from "../lib/api";
import {
  callOutcomeDetail,
  callOutcomeLabel,
  classifyCallOutcome,
  type CallOutcome,
} from "../lib/call-outcome";
import { formatPhone } from "../lib/safe-number";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { Button, EmptyState, Skeleton } from "./atoms";
import OutboundDialDialog from "./OutboundDialDialog";
import { SearchField, StatusNotice } from "./molecules";
import WorkspaceResizablePanel from "./layout/WorkspaceResizablePanel";

type Call = {
  id: string;
  agent_id?: string | null;
  agent_name?: string | null;
  direction?: string | null;
  customer_number?: string | null;
  duration_seconds?: number | null;
  summary?: string | null;
  transcript?: string | null;
  recording_url?: string | null;
  sentiment?: string | null;
  outcome_tag?: string | null;
  ended_reason?: string | null;
  happened?: CallOutcome | null;
  demo?: boolean | null;
  created_at?: string | null;
};

type CallsResponse = {
  calls?: Call[];
  total?: number;
  hasMore?: boolean;
};

const CALL_LIST_PANEL_STORAGE_KEY = "wireline:calls-history-pane:v1";
const CALL_PAGE_SIZE = 100;

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return "";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function humanize(value: string | null | undefined, fallback = "Unclassified") {
  const text = value?.trim();
  if (!text || /^(unknown|other)$/i.test(text)) return fallback;
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function reportHappened(call: Call): CallOutcome {
  if (call.happened) return call.happened;
  return classifyCallOutcome({
    outcomeTag: call.outcome_tag,
    endedReason: call.ended_reason,
    hasTranscript: Boolean(call.transcript?.trim()),
    hasSummary: Boolean(call.summary?.trim()),
    durationSeconds: call.duration_seconds,
  });
}

function statusTone(value: string | null | undefined) {
  const normalized = String(value || "").toLowerCase();
  if (/pending/.test(normalized)) {
    return "text-[var(--wireline-color-status-warning)]";
  }
  if (/email|booked|message/.test(normalized)) {
    return "text-[var(--wireline-color-status-success)]";
  }
  if (/missed|failed|busy|unreachable|voicemail|do not call/.test(normalized)) {
    return "text-[var(--wireline-color-status-warning)]";
  }
  return "text-muted-foreground";
}

export function readableCallSummary(
  summary: string | null | undefined,
  transcript: string | null | undefined,
) {
  const text = summary?.trim();
  if (!text) return "No summary is available for this call yet.";
  // Some older calls stored a clipped transcript in the summary field. Show
  // the full transcript once, under its own disclosure, instead of duplicating it.
  const excerpt = text.replace(/…$/, "").replace(/\s+/g, " ");
  if (excerpt.length >= 120 && transcript?.replace(/\s+/g, " ").startsWith(excerpt)) {
    return "A short summary isn't available for this call. Open Transcript below to review it.";
  }
  return text;
}

type DialogueTurn = {
  speaker: "bot" | "caller" | "system";
  speakerName: string;
  text: string;
};

export function parseDialogue(
  transcript: string | null | undefined,
  botName?: string | null,
): DialogueTurn[] {
  if (!transcript?.trim()) return [];
  const lines = transcript
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const turns: DialogueTurn[] = [];

  for (const line of lines) {
    const match = line.match(
      /^(Bot|Agent|Assistant|Caller|User|Customer|Human|System):\s*(.*)$/i,
    );
    if (match) {
      const rawRole = match[1].toLowerCase();
      const text = match[2].trim();
      const isBot = ["bot", "agent", "assistant"].includes(rawRole);
      const isSystem = rawRole === "system";
      turns.push({
        speaker: isBot ? "bot" : isSystem ? "system" : "caller",
        speakerName: isBot ? botName || "Bot" : isSystem ? "System" : "Caller",
        text,
      });
    } else {
      if (turns.length > 0) {
        turns[turns.length - 1].text += ` ${line}`;
      } else {
        turns.push({
          speaker: "caller",
          speakerName: "Caller",
          text: line,
        });
      }
    }
  }

  return turns;
}

export default function CallLogsClaude({ agentId }: { agentId?: string | null }) {
  const callLabel = "New Call";
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showOutboundDial, setShowOutboundDial] = useState(false);
  const [query, setQuery] = useState("");
  const desktop = useMediaQuery("(min-width: 1024px)");
  const requestState = useRef({ generation: 0, pageInFlight: false });

  const loadCalls = useCallback(async () => {
    if (requestState.current.pageInFlight) return;
    const generation = ++requestState.current.generation;
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({ limit: String(CALL_PAGE_SIZE), offset: "0" });
      const endpoint = agentId
        ? `/api/agents/${encodeURIComponent(agentId)}/calls?${queryParams.toString()}`
        : `/api/calls?${queryParams.toString()}`;
      const response = await authFetch(endpoint);
      if (!response.ok) throw new Error("Could not load calls.");
      const body = (await response.json()) as CallsResponse;
      if (generation !== requestState.current.generation) return;
      const nextCalls = Array.isArray(body.calls) ? body.calls : [];
      const nextTotal =
        typeof body.total === "number" && Number.isFinite(body.total)
          ? Math.max(nextCalls.length, body.total)
          : nextCalls.length;
      setCalls(nextCalls);
      setTotal(nextTotal);
      setHasMore(body.hasMore === true || nextCalls.length < nextTotal);
      setLoadMoreError(null);
      setSelectedId((current) =>
        current && nextCalls.some((call) => call.id === current) ? current : null,
      );
    } catch (reason) {
      if (generation !== requestState.current.generation) return;
      setError(reason instanceof Error ? reason.message : "Could not load calls.");
    } finally {
      if (generation === requestState.current.generation) setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    const requests = requestState.current;
    setCalls([]);
    setTotal(0);
    setHasMore(false);
    setLoadingMore(false);
    setLoadMoreError(null);
    setSelectedId(null);
    setQuery("");
    void loadCalls();
    return () => {
      requests.generation++;
      requests.pageInFlight = false;
    };
  }, [loadCalls]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || requestState.current.pageInFlight || !hasMore) return;
    const generation = requestState.current.generation;
    requestState.current.pageInFlight = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const queryParams = new URLSearchParams({
        limit: String(CALL_PAGE_SIZE),
        offset: String(calls.length),
      });
      const endpoint = agentId
        ? `/api/agents/${encodeURIComponent(agentId)}/calls?${queryParams.toString()}`
        : `/api/calls?${queryParams.toString()}`;
      const response = await authFetch(endpoint);
      if (!response.ok) throw new Error("Could not load more calls.");
      const body = (await response.json()) as CallsResponse;
      if (generation !== requestState.current.generation) return;
      const page = Array.isArray(body.calls) ? body.calls : [];
      const nextTotal =
        typeof body.total === "number" && Number.isFinite(body.total)
          ? Math.max(calls.length + page.length, body.total)
          : Math.max(total, calls.length + page.length);
      setCalls((current) => {
        const knownIds = new Set(current.map((call) => call.id));
        return [...current, ...page.filter((call) => !knownIds.has(call.id))];
      });
      setTotal(nextTotal);
      setHasMore(body.hasMore === true || calls.length + page.length < nextTotal);
    } catch (reason) {
      if (generation !== requestState.current.generation) return;
      setLoadMoreError(reason instanceof Error ? reason.message : "Could not load more calls.");
    } finally {
      if (generation === requestState.current.generation) {
        requestState.current.pageInFlight = false;
        setLoadingMore(false);
      }
    }
  }, [agentId, calls.length, hasMore, loading, loadingMore, total]);

  const selected = useMemo(
    () => calls.find((call) => call.id === selectedId) || null,
    [calls, selectedId],
  );
  const visibleCalls = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return calls;
    return calls.filter((call) =>
      [
        call.customer_number,
        call.agent_name,
        call.summary,
        call.outcome_tag,
        call.happened ? callOutcomeLabel(call.happened) : null,
        call.direction,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [calls, query]);

  useEffect(() => {
    if (!desktop || selectedId || !visibleCalls.length) return;
    setSelectedId(visibleCalls[0].id);
  }, [desktop, selectedId, visibleCalls]);

  const paginationControl =
    hasMore || loadMoreError ? (
      <div className="border-t border-border p-3">
        {loadMoreError ? (
          <StatusNotice
            tone="warning"
            title="More Calls Unavailable"
            action={
              <Button type="button" variant="secondary" size="sm" onClick={loadMore}>
                Try Again
              </Button>
            }
          >
            {loadMoreError} The calls already shown remain available.
          </StatusNotice>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full justify-center"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {loadingMore ? "Loading More" : "Load More Calls"}
          </Button>
        )}
      </div>
    ) : null;

  const listBody = (
    <>
      {loading && !calls.length ? (
        <div className="space-y-1 p-3" aria-busy="true">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="rounded-xl border border-border p-3">
              <Skeleton shape="text" className="h-4 w-32" />
              <Skeleton shape="text" className="mt-2 h-3 w-20" />
            </div>
          ))}
        </div>
      ) : !calls.length && !error ? (
        <EmptyState
          icon={<Phone className="size-5" aria-hidden="true" />}
          title={agentId ? "No calls for this Bot" : "No calls yet"}
          density="compact"
          titleTone="ui"
          withHalo={false}
          action={
            <Button type="button" size="sm" onClick={() => setShowOutboundDial(true)}>
              {callLabel}
            </Button>
          }
        />
      ) : error && !calls.length ? null : !visibleCalls.length ? (
        <>
          <EmptyState
            title={`No matches in ${calls.length} loaded calls`}
            density="compact"
            titleTone="ui"
            withHalo={false}
          />
          {paginationControl}
        </>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {visibleCalls.map((call) => {
              const active = call.id === selectedId;
              // A missed call has no duration to show: the provider's
              // ring/attempt seconds on missed rows (29s, 6s, 4s) read as
              // talk time the call never had. The outcome is the taxonomy's
              // (reportHappened, same row) — suppress on the missed set.
              const meta = [
                call.agent_name,
                reportHappened(call) === "missed" ? "" : formatDuration(call.duration_seconds),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={call.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(call.id)}
                    aria-pressed={active}
                    className={`w-full px-3.5 py-2.5 text-left transition-colors border-l-2 ${
                      active
                        ? "bg-primary/8 border-primary text-foreground"
                        : "border-transparent hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong
                        className={`truncate font-mono text-xs font-semibold ${
                          active ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {formatPhone(call.customer_number, "Unknown caller")}
                      </strong>
                      <span className="shrink-0 text-[10px] text-muted-foreground/75">
                        {formatTime(call.created_at)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="wl-preserve-case block truncate text-[11px] text-muted-foreground">
                        {meta || humanize(call.direction, "Call")}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {call.recording_url ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
                            <Mic className="size-2.5" aria-hidden="true" />
                          </span>
                        ) : null}
                        <span
                          className={`text-[10px] font-medium ${statusTone(callOutcomeLabel(reportHappened(call)))}`}
                        >
                          {callOutcomeLabel(reportHappened(call))}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {paginationControl}
        </>
      )}
    </>
  );

  const reportBody = !selected ? (
    <EmptyState title="Select a Call" density="compact" titleTone="ui" withHalo={false} />
  ) : (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6 space-y-6">
      <button
        type="button"
        onClick={() => setSelectedId(null)}
        className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary lg:hidden"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Calls
      </button>

      <header className="rounded-2xl border border-border/80 bg-card/60 p-4 sm:p-5 shadow-xs">
        <p className="text-xs font-semibold text-primary">Call report</p>
        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="font-mono text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
              {formatPhone(selected.customer_number, "Unknown Caller")}
            </h3>
            <p className="wl-preserve-case mt-1 text-xs text-muted-foreground">
              {[
                selected.agent_name,
                formatTime(selected.created_at),
                formatDuration(selected.duration_seconds),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span
              className={`inline-flex items-center rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold ${statusTone(callOutcomeLabel(reportHappened(selected)))}`}
            >
              {callOutcomeLabel(reportHappened(selected))}
            </span>
            {selected.duration_seconds ? (
              <span className="inline-flex items-center rounded-lg border border-border bg-card px-2.5 py-1 font-mono text-xs font-medium text-muted-foreground">
                {formatDuration(selected.duration_seconds)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setShowOutboundDial(true)}
            className="gap-1.5 text-xs"
          >
            <Phone className="size-3.5" aria-hidden="true" />
            Call Back
          </Button>
          {selected.recording_url ? (
            <a
              href={selected.recording_url}
              download
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Download className="size-3.5" aria-hidden="true" />
              Download Audio
            </a>
          ) : null}
        </div>
      </header>

      {selected.recording_url ? (
        <section aria-label="Call recording" className="rounded-2xl border border-border/80 bg-card/60 p-4 shadow-xs">
          <div className="flex items-center justify-between pb-2">
            <h4 className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Mic className="size-3.5 text-primary" aria-hidden="true" />
              Recording
            </h4>
            <a
              href={selected.recording_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-primary hover:underline"
            >
              Open
            </a>
          </div>
          <audio
            key={selected.id}
            controls
            preload="none"
            src={selected.recording_url}
            className="w-full accent-primary"
          />
        </section>
      ) : null}

      <section className="rounded-2xl border border-border/80 bg-card/60 p-4 sm:p-5 shadow-xs space-y-4">
        <div>
          <h4 className="text-xs font-semibold tracking-[0.08em] uppercase text-muted-foreground">
            {selected.summary?.trim().startsWith("Caller:") ? "Caller Excerpt" : "Summary"}
          </h4>
          <p className="wl-preserve-case mt-2 text-sm leading-6 text-foreground">
            {readableCallSummary(selected.summary, selected.transcript)}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-3 border-t border-border/60">
          {[
            ["Outcome", callOutcomeLabel(reportHappened(selected))],
            ["What happened", callOutcomeDetail(reportHappened(selected))],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border/70 bg-background/50 p-3">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {label}
              </span>
              <strong className="mt-1 block text-sm font-semibold text-foreground">
                {value}
              </strong>
            </div>
          ))}
        </div>
      </section>

      {selected.transcript ? (
        <section className="rounded-2xl border border-border/80 bg-card/60 p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <h4 className="text-xs font-semibold tracking-[0.08em] uppercase text-muted-foreground">
              Transcript
            </h4>
            <span className="text-[11px] text-muted-foreground">
              {parseDialogue(selected.transcript, selected.agent_name).length > 1
                ? "Dialogue turns"
                : "Continuous transcript"}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {(() => {
              const turns = parseDialogue(selected.transcript, selected.agent_name);
              if (turns.length > 1) {
                return turns.map((turn, index) => {
                  const isBot = turn.speaker === "bot";
                  return (
                    <div
                      key={index}
                      className={`flex flex-col gap-1 ${isBot ? "items-start" : "items-end"}`}
                    >
                      <span className="px-1 text-[11px] font-medium text-muted-foreground">
                        {turn.speakerName}
                      </span>
                      <div
                        className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          isBot
                            ? "bg-muted/70 text-foreground rounded-tl-xs border border-border/60"
                            : "bg-primary/10 text-foreground rounded-tr-xs border border-primary/20"
                        }`}
                      >
                        {turn.text}
                      </div>
                    </div>
                  );
                });
              }
              return (
                <div className="wl-preserve-case whitespace-pre-wrap rounded-xl border border-border/60 bg-background/60 p-4 text-sm leading-6 text-foreground">
                  {selected.transcript}
                </div>
              );
            })()}
          </div>
        </section>
      ) : null}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-5">
        <span className="text-xs font-medium text-muted-foreground">
          {loading && calls.length === 0 ? (
            // Avoid flashing "0 calls" before the first page arrives.
            <>
              <span
                className="inline-block h-3 w-14 animate-pulse rounded bg-muted align-middle"
                aria-hidden="true"
              />
              <span className="sr-only">Loading calls</span>
            </>
          ) : query.trim() ? (
            `${visibleCalls.length} ${visibleCalls.length === 1 ? "match" : "matches"} in ${calls.length} loaded`
          ) : total > calls.length ? (
            `${calls.length} of ${total} calls`
          ) : agentId ? (
            `${calls.length} for this Bot`
          ) : (
            `${calls.length} ${calls.length === 1 ? "call" : "calls"}`
          )}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadCalls()}
            disabled={loading || loadingMore}
            aria-label="Refresh calls"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
          {!agentId ? (
            <a
              href="/api/export/calls.csv"
              download
              aria-label="Export calls as CSV"
              className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Download className="size-4" aria-hidden="true" />
            </a>
          ) : null}
          <Button type="button" size="sm" onClick={() => setShowOutboundDial(true)}>
            <Phone className="size-4" aria-hidden="true" />
            {callLabel}
          </Button>
        </div>
      </div>

      {error ? (
        <StatusNotice tone="destructive" title="Call History Unavailable" className="m-3 sm:m-4">
          {error}
        </StatusNotice>
      ) : null}

      {desktop ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <WorkspaceResizablePanel
            storageKey={CALL_LIST_PANEL_STORAGE_KEY}
            side="left"
            defaultSize={300}
            minSize={260}
            maxSize={400}
            collapsedSize={44}
            resizeHandleLabel="Resize call list"
            className="border-r border-border bg-card/20"
          >
            {({ collapsed, toggleCollapsed }) =>
              collapsed ? (
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="flex h-full w-full flex-col items-center gap-3 py-3 text-muted-foreground transition-colors hover:bg-muted/45 hover:text-foreground wl-focus-ring-halo"
                  aria-label="Open call list"
                  title="Open call list"
                >
                  <ChevronsRight className="size-4" aria-hidden="true" />
                  <span
                    className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ writingMode: "vertical-rl" }}
                  >
                    Calls
                  </span>
                </button>
              ) : (
                <section className="flex h-full min-h-0 w-full flex-col" aria-label="Calls">
                  <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
                    <SearchField
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onClear={() => setQuery("")}
                      placeholder="Search calls"
                      aria-label="Search calls"
                      className="min-w-0 flex-1"
                    />
                    <button
                      type="button"
                      onClick={toggleCollapsed}
                      className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground wl-focus-ring-halo"
                      aria-label="Collapse call list"
                      title="Collapse call list"
                    >
                      <ChevronsLeft className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">{listBody}</div>
                </section>
              )
            }
          </WorkspaceResizablePanel>
          <section className="min-h-0 min-w-0 flex-1 overflow-y-auto" aria-label="Call report">
            {reportBody}
          </section>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          <section
            className={`${selected ? "hidden" : "block"} h-full min-h-0 overflow-y-auto`}
            aria-label="Calls"
          >
            <div className="border-b border-border px-3 py-2">
              <SearchField
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onClear={() => setQuery("")}
                placeholder="Search calls"
                aria-label="Search calls"
              />
            </div>
            {listBody}
          </section>
          <section
            className={`${selected ? "block" : "hidden"} h-full min-h-0 overflow-y-auto`}
            aria-label="Call report"
          >
            {reportBody}
          </section>
        </div>
      )}

      <OutboundDialDialog
        open={showOutboundDial}
        onClose={() => setShowOutboundDial(false)}
        initialAgentId={agentId || undefined}
      />
    </div>
  );
}
