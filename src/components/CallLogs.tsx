/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  FileText,
  Search,
  Loader2,
  MessageCircle,
  Database,
  Activity,
  Signal,
  ExternalLink,
  Download,
  Filter,
  SmilePlus,
  Meh,
  Frown,
  MessageSquare,
  Star,
  Sparkles,
  Phone,
  ArrowLeft,
  Volume2,
  Play,
  Pause,
  SkipForward,
} from "lucide-react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { resolveBrandAccent } from "../lib/brand-token";
import { BRAND } from "../constants/brand-colors";
import { formatDate, formatTime } from "../lib/safe-date";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import CsvExportButton from "./CsvExportButton";
import PageShell, { Panel } from "./PageShell";
import ClientToolbar from "./layout/ClientToolbar";
import ClientRouteLoading from "./layout/ClientRouteLoading";
import { ChannelListColHeader } from "./layout/ChannelInbox";
import { PanelSkeleton } from "./Skeleton";
import { EmptyState } from "./ui/EmptyState";
import { OPS_CHANNEL_EMPTY, OPS_CHANNEL_TOOLBAR } from "../lib/wireline-ops-design";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/shadcn/Select";
import { useToast } from "../contexts/ToastContext";
import type { CallLog } from "../types/api";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";

export default function CallLogs({ embedded = false }: { embedded?: boolean }) {
  const { error: toastError } = useToast();
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;
  const [selectedCall, setSelectedCall] = useState<CallLog | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "inbound" | "outbound">("all");

  const fetchCalls = async (currentOffset: number = 0, append: boolean = false) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await authFetch(`/api/calls?offset=${currentOffset}&limit=${LIMIT}`);
      const data: { calls: CallLog[]; hasMore: boolean; total?: number } = await res.json();
      if (append) setCalls((prev) => [...prev, ...(data.calls || [])]);
      else setCalls(data.calls || []);
      setHasMore(data.hasMore);
      setOffset(currentOffset + (data.calls?.length || 0));
    } catch {
      toastError(
        "Call logs unavailable",
        append
          ? "Could not load more calls. Please try again."
          : "Could not load call history. Please refresh.",
      );
    } finally {
      if (!append) setLoading(false);
      else setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchCalls(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time fetch on mount
  }, []);

  // Auto-select first call on initial load only — preserve user deselection.
  const initialSelectionDone = React.useRef(false);
  useEffect(() => {
    if (!initialSelectionDone.current && calls.length > 0 && !selectedCall) {
      setSelectedCall(calls[0]);
      initialSelectionDone.current = true;
    }
  }, [calls, selectedCall]);

  const loadMore = () => {
    if (!loadingMore && hasMore) fetchCalls(offset, true);
  };

  const filteredCalls = calls.filter((call) => {
    const matchesSearch =
      call.customer_number?.includes(search) ||
      call.summary?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || call.direction === filter;
    return matchesSearch && matchesFilter;
  });

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const actions = (
    <div className="flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto">
      <div className="relative min-w-0 flex-1 sm:flex-none">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <Input
          type="search"
          aria-label="Search calls"
          placeholder="Search signals…"
          className="h-9 w-full sm:w-44 lg:w-60 pl-8 pr-3 rounded-full wl-panel text-[11px] text-ink placeholder:text-ink/40 focus:border-brand/40 focus:outline-none transition-all"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="relative">
        <Filter className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-10" />
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger
            aria-label="Filter by call direction"
            className="h-9 pl-8 pr-3 rounded-full wl-panel wl-filter-trigger text-ink"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="inbound">Inbound</SelectItem>
            <SelectItem value="outbound">Outbound</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <CsvExportButton type="calls" label="CSV" />
    </div>
  );

  const body = (
    <PageShell
      eyebrow={embedded ? undefined : "Communications · Voice"}
      title={embedded ? "" : "Call Logs"}
      subtitle={embedded ? undefined : "Recorded calls and agent responses"}
      actions={embedded ? undefined : actions}
    >
      <div className="h-full min-h-0 grid grid-cols-12 gap-3 overflow-hidden">
        {/* List pane — hidden on mobile when a call is selected so the
            detail pane gets the full viewport. The detail's "Back" affordance
            (rendered below in the empty-detail branch + inside CallDetail)
            clears selectedCall to bring the list back. */}
        <div
          className={cn(
            "col-span-12 md:col-span-6 lg:col-span-5 xl:col-span-4 h-full min-h-0 flex flex-col overflow-hidden",
            selectedCall && "hidden md:block",
          )}
        >
          <Panel
            title={`${filteredCalls.length} calls`}
            hint={loading ? "Loading…" : "All calls"}
            icon={Database}
            scroll
            flush
            actions={
              hasMore && (
                <ShadButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  disableAnimations
                  onClick={loadMore}
                  disabled={loadingMore}
                  aria-label="Load more calls"
                  className="h-auto px-0 text-[9px] uppercase tracking-[0.3em] text-muted hover:text-ink"
                >
                  {loadingMore ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Signal className="w-3 h-3" />
                  )}
                  More
                </ShadButton>
              )
            }
          >
            {loading ? (
              <PanelSkeleton rows={8} />
            ) : filteredCalls.length === 0 ? (
              calls.length === 0 ? (
                <EmptyState
                  icon={Phone}
                  eyebrow={OPS_CHANNEL_EMPTY.phone.eyebrow}
                  title={OPS_CHANNEL_EMPTY.phone.title}
                  description={OPS_CHANNEL_EMPTY.phone.description}
                  actions={[...OPS_CHANNEL_EMPTY.phone.actions]}
                  density="compact"
                  withHalo={false}
                  fill
                  className="py-10"
                />
              ) : (
                <EmptyState
                  icon={Search}
                  eyebrow={OPS_CHANNEL_EMPTY.phoneNoMatch.eyebrow}
                  title={OPS_CHANNEL_EMPTY.phoneNoMatch.title}
                  description={OPS_CHANNEL_EMPTY.phoneNoMatch.description}
                  density="compact"
                  withHalo={false}
                  actions={[
                    ...(search.trim()
                      ? [{ label: "Clear search", onClick: () => setSearch(""), primary: true }]
                      : []),
                    ...(filter !== "all"
                      ? [{ label: "Show all directions", onClick: () => setFilter("all") }]
                      : []),
                  ]}
                  fill
                  className="py-10"
                />
              )
            ) : (
              <>
                <ChannelListColHeader
                  columns={[
                    { label: "Contact" },
                    { label: "Signal" },
                    { label: "Time", className: "text-right" },
                  ]}
                />
                <ul className="divide-y divide-black/6">
                  {filteredCalls.map((call) => (
                    <li key={call.id}>
                      <ShadButton
                        type="button"
                        variant="ghost"
                        disableAnimations
                        onClick={() => setSelectedCall(call)}
                        aria-label={`Open signal from ${call.customer_number || "Sim Test"}: ${call.summary || "no summary"}`}
                        className={cn(
                          "group touch-press w-full h-auto justify-start text-left flex items-center gap-3 px-3 py-3 relative rounded-none",
                          selectedCall?.id === call.id
                            ? "bg-brand/8 hover:bg-brand/8"
                            : "hover:bg-black/3",
                        )}
                      >
                        {/* Active indicator bar */}
                        {selectedCall?.id === call.id && (
                          <div
                            className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r-full bg-brand"
                            aria-hidden="true"
                          />
                        )}

                        {/* Direction icon */}
                        <div
                          className={cn(
                            "w-9 h-9 rounded-md flex items-center justify-center shrink-0 border transition-all",
                            call.direction === "inbound"
                              ? "bg-brand/8 border-brand/25 text-brand"
                              : "bg-brand-2/8 border-brand-2/25 text-brand-2",
                            selectedCall?.id === call.id && "scale-105",
                          )}
                        >
                          {call.direction === "inbound" ? (
                            <PhoneIncoming className="w-4 h-4" />
                          ) : (
                            <PhoneOutgoing className="w-4 h-4" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-display italic text-sm text-ink truncate">
                              {call.customer_number || "Sim Test"}
                            </span>
                            {/* Lead score badge */}
                            <span
                              className={cn(
                                "shrink-0 px-1.5 py-0 rounded-full text-[8px] font-mono leading-tight border",
                                (call.lead_score || 0) >= 80
                                  ? "bg-brand/12 text-brand border-brand/20"
                                  : (call.lead_score || 0) >= 50
                                    ? "bg-brand/8 text-brand/80 border-brand/15"
                                    : "bg-black/[0.06] text-ink/40 border-transparent",
                              )}
                            >
                              {call.lead_score || 0}
                            </span>
                            {/* QA score badge */}
                            {call.qa_score != null && (
                              <span
                                className={cn(
                                  "shrink-0 px-1.5 py-0 rounded-full text-[8px] font-mono leading-tight border",
                                  call.qa_score >= 75
                                    ? "bg-brand/8 text-brand border-brand/20"
                                    : call.qa_score >= 50
                                      ? "bg-brand/5 text-brand/70 border-brand/15"
                                      : "bg-destructive/8 text-destructive border-destructive/20",
                                )}
                              >
                                ★{call.qa_score}
                              </span>
                            )}
                            <SentimentDot sentiment={call.sentiment} />
                          </div>
                          <p className="text-[10px] text-ink/40 truncate leading-tight">
                            {call.summary || "Decoding…"}
                          </p>
                        </div>

                        {/* Date/time */}
                        <div className="text-right shrink-0">
                          <div className="text-[9px] text-muted/80">
                            {formatDate(call.created_at)}
                          </div>
                          <div className="text-[8px] text-ink/40 uppercase tracking-[0.2em]">
                            {formatTime(call.created_at, { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </ShadButton>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </div>

        {/* Detail pane — hidden on mobile when nothing is selected so the
            list takes the full viewport. */}
        <div
          className={cn(
            "col-span-12 md:col-span-6 lg:col-span-7 xl:col-span-8 h-full min-h-0 flex flex-col overflow-hidden",
            !selectedCall && "hidden md:block",
          )}
        >
          {selectedCall ? (
            <CallDetail
              call={selectedCall}
              formatDuration={formatDuration}
              onBack={() => setSelectedCall(null)}
            />
          ) : (
            <Panel title="Call Detail" hint="Select a call" icon={FileText}>
              <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-16 h-16 rounded-md wl-panel flex items-center justify-center">
                  <FileText className="w-8 h-8 text-ink/40" />
                </div>
                <div>
                  <p className="text-sm font-display italic text-ink/70 mb-1">No call selected</p>
                  <p className="text-[10px] text-ink/40 leading-relaxed max-w-[200px]">
                    Click any call on the left to view the full transcript, summary, and QA
                    analysis.
                  </p>
                </div>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </PageShell>
  );

  const showInitialLoad = loading && calls.length === 0;

  return (
    <div className="h-full flex flex-col min-h-0">
      <ClientToolbar
        left={
          <span className="app-toolbar-stat">
            {showInitialLoad
              ? OPS_CHANNEL_TOOLBAR.phone.loading
              : OPS_CHANNEL_TOOLBAR.phone.stat(filteredCalls.length)}
          </span>
        }
        actions={actions}
      />
      {showInitialLoad ? (
        <ClientRouteLoading
          icon={<Phone className="w-7 h-7" />}
          label={OPS_CHANNEL_TOOLBAR.phone.loading}
          className="flex-1 min-h-0"
        />
      ) : (
        body
      )}
    </div>
  );
}

function SentimentDot({ sentiment }: { sentiment?: string | null }) {
  const s = (sentiment || "neutral").toLowerCase();
  if (s === "positive")
    return <SmilePlus className="w-3 h-3 text-brand shrink-0" aria-label="Positive sentiment" />;
  if (s === "negative")
    return <Frown className="w-3 h-3 text-destructive shrink-0" aria-label="Negative sentiment" />;
  return <Meh className="w-3 h-3 text-ink/40 shrink-0" aria-label="Neutral sentiment" />;
}

function CallDetail({
  call,
  formatDuration,
  onBack,
}: {
  call: any;
  formatDuration: (s: number) => string;
  onBack?: () => void;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  type DTab = "summary" | "transcript" | "record";
  const [tab, setTab] = useState<DTab>("summary");
  const [scoring, setScoring] = useState(false);
  const [qaScore, setQaScore] = useState<number | null>(call.qa_score ?? null);
  const [qaBreakdown, setQaBreakdown] = useState<any>(call.qa_breakdown ?? null);

  // Reset QA state when call changes
  React.useEffect(() => {
    setQaScore(call.qa_score ?? null);
    setQaBreakdown(call.qa_breakdown ?? null);
  }, [call.id, call.qa_score, call.qa_breakdown]);

  const handleScoreQa = async () => {
    setScoring(true);
    try {
      const r = await authFetch(`/api/qa/score/${call.id}`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Scoring failed");
      setQaScore(d.score);
      setQaBreakdown(d.breakdown);
      toastSuccess("QA scored", `Call scored ${d.score}/100.`);
    } catch (e: any) {
      toastError("QA scoring failed", e.message);
    } finally {
      setScoring(false);
    }
  };

  const transcriptLines = (call.transcript || "")
    .split("\n")
    .filter((l: string) => l.trim() !== "");

  const QA_DIMS = [
    { key: "greeting", label: "Opening" },
    { key: "discovery", label: "Discovery" },
    { key: "solution", label: "Solution" },
    { key: "objection", label: "Objections" },
    { key: "closing", label: "Closing" },
  ];

  const qaDimBarClass = (val: number) => {
    const pct = val / 20;
    if (pct >= 0.8) return "bg-brand";
    if (pct >= 0.6) return "bg-brand/70";
    return "bg-destructive";
  };

  const qaColor = (score: number) => {
    const brand = resolveBrandAccent();
    return score >= 60 ? brand : score >= 40 ? BRAND.purpleMuted : BRAND.rose;
  };

  return (
    <Panel
      title={
        <Link
          to={`/contact/${encodeURIComponent(call.customer_number || "unknown")}`}
          className="inline-flex items-center gap-1.5 hover:text-brand transition-colors group"
        >
          <span>{call.customer_number || "Simulator"}</span>
          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      }
      hint={`Trace ${call.vapi_call_id?.substring(0, 12) || ""}`}
      icon={call.direction === "inbound" ? PhoneIncoming : PhoneOutgoing}
      flush
      actions={
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {onBack && (
            <ShadButton
              type="button"
              variant="outline"
              size="sm"
              disableAnimations
              onClick={onBack}
              aria-label="Back to call list"
              className="lg:hidden h-7 px-2 rounded-full text-[9px] uppercase tracking-[0.22em] text-muted"
            >
              <ArrowLeft className="w-2.5 h-2.5" /> Back
            </ShadButton>
          )}
          <ShadButton
            type="button"
            variant={qaScore !== null ? "outline" : "default"}
            size="sm"
            disableAnimations
            onClick={handleScoreQa}
            disabled={scoring}
            title="Run AI quality scoring"
            className={cn(
              "h-7 px-2.5 rounded-full text-[9px] uppercase tracking-[0.22em]",
              qaScore !== null
                ? "text-muted hover:text-brand hover:border-brand/30"
                : "bg-brand/10 border-brand/30 text-brand hover:bg-brand/20",
            )}
          >
            {scoring ? (
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
            ) : (
              <Star className="w-2.5 h-2.5" />
            )}
            {qaScore !== null ? `QA ${qaScore}` : "Score QA"}
          </ShadButton>
          <ClaudeRecipeButton recipe="coach" callId={call.id} label="Coach" />
          <ClaudeRecipeButton recipe="qualify" callId={call.id} label="Qualify" />
        </div>
      }
    >
      <div className="h-full flex flex-col">
        {/* Sub-tabs */}
        <div
          className="shrink-0 px-3 pt-2.5 pb-2 border-b border-black/8 flex items-center gap-1.5"
          role="tablist"
        >
          {(
            [
              { id: "summary", label: "Summary", icon: FileText },
              { id: "transcript", label: "Transcript", icon: MessageCircle },
              { id: "record", label: "Record", icon: Activity },
            ] as const
          ).map((t) => {
            const active = t.id === tab;
            return (
              <ShadButton
                key={t.id}
                type="button"
                variant="ghost"
                size="sm"
                disableAnimations
                role="tab"
                aria-selected={active}
                aria-controls={`call-panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={cn(
                  "h-auto px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-[0.22em]",
                  active
                    ? "bg-black/[0.06] border-brand/40 text-ink hover:bg-black/[0.06]"
                    : "border-black/8 text-muted hover:text-ink",
                )}
              >
                <t.icon className={cn("w-3 h-3", active ? "text-brand" : "")} />
                {t.label}
              </ShadButton>
            );
          })}
          <div className="ml-auto flex items-center gap-2 text-[9px] uppercase tracking-[0.3em] text-muted">
            <Clock className="w-3 h-3" />
            <span>{formatDuration(call.duration_seconds || 0)}</span>
            <span className="w-1 h-1 rounded-full bg-white/15" />
            <span className="text-destructive/80">${Number(call.cost ?? 0).toFixed(4)}</span>
          </div>
        </div>

        {/* Sub-tab body */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            {tab === "summary" && (
              <motion.div
                key="s"
                id="call-panel-summary"
                role="tabpanel"
                tabIndex={0}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="h-full scroll-viewport scrollbar-hide p-4 space-y-3"
              >
                <div className="rounded-md wl-panel p-4">
                  <div className="text-[9px] uppercase tracking-[0.3em] text-brand mb-2 flex items-center gap-1.5">
                    <FileText className="w-3 h-3" /> Mission summary
                  </div>
                  <p className="text-ink/90 font-display italic text-lg md:text-xl leading-snug">
                    {call.summary || "Pending inference…"}
                  </p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Stat
                    label="Duration"
                    value={formatDuration(call.duration_seconds || 0)}
                    icon={Clock}
                  />
                  <Stat label="Cost" value={`$${Number(call.cost ?? 0).toFixed(4)}`} />
                  <Stat label="Lead score" value={`${call.lead_score ?? 0}`} />
                  <Stat
                    label="Sentiment"
                    value={
                      <span
                        className={cn(
                          "capitalize text-base",
                          (call.sentiment || "neutral") === "positive"
                            ? "text-brand"
                            : (call.sentiment || "neutral") === "negative"
                              ? "text-destructive"
                              : "text-ink/40",
                        )}
                      >
                        {call.sentiment || "neutral"}
                      </span>
                    }
                  />
                </div>
                {call.coaching_note && (
                  <div className="rounded-md wl-panel border border-brand/20 p-4">
                    <div className="text-[9px] uppercase tracking-[0.3em] text-brand mb-2 flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3" /> AI coaching note
                    </div>
                    <p className="text-[12px] text-ink/80 leading-relaxed">{call.coaching_note}</p>
                  </div>
                )}
                {/* QA Scorecard */}
                {qaScore !== null && qaBreakdown ? (
                  <div className="rounded-md wl-panel p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div
                        className="text-[9px] uppercase tracking-[0.3em] flex items-center gap-1.5"
                        style={{ color: qaColor(qaScore) }}
                      >
                        <Star className="w-3 h-3" /> QA Scorecard
                      </div>
                      <div
                        className="font-display italic text-2xl leading-none"
                        style={{ color: qaColor(qaScore) }}
                      >
                        {qaScore}
                        <span className="text-xs text-ink/40 ml-1 not-italic">/100</span>
                      </div>
                    </div>
                    <div className="space-y-2 mb-3">
                      {QA_DIMS.map(({ key, label }) => {
                        const val = qaBreakdown[key] ?? 0;
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <span className="text-[9px] uppercase tracking-[0.22em] text-muted w-20 shrink-0">
                              {label}
                            </span>
                            <div className="flex-1 h-1.5 rounded-full bg-black/10 overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(val / 20) * 100}%` }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                                className={cn("h-full rounded-full", qaDimBarClass(val))}
                              />
                            </div>
                            <span className="text-[9px] font-mono text-ink w-8 text-right shrink-0">
                              {val}/20
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {qaBreakdown.notes && (
                      <p className="text-[11px] text-ink/65 leading-relaxed border-t border-black/8 pt-2 mt-2">
                        <Sparkles className="w-3 h-3 inline mr-1 text-brand" />
                        {qaBreakdown.notes}
                      </p>
                    )}
                  </div>
                ) : (
                  <ShadButton
                    type="button"
                    variant="outline"
                    disableAnimations
                    onClick={handleScoreQa}
                    disabled={scoring}
                    className="w-full h-auto rounded-md border border-brand/20 hover:border-brand/40 p-3 justify-start gap-3"
                  >
                    <div className="w-8 h-8 rounded-md bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0">
                      {scoring ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                      ) : (
                        <Star className="w-3.5 h-3.5 text-brand" />
                      )}
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.28em] text-brand">
                        {scoring ? "Scoring…" : "Run QA Scoring"}
                      </p>
                      <p className="text-[9px] text-ink/40 mt-0.5">
                        Wireline AI evaluates this call across 5 quality dimensions
                      </p>
                    </div>
                  </ShadButton>
                )}
              </motion.div>
            )}
            {tab === "transcript" && (
              <motion.div
                key="t"
                id="call-panel-transcript"
                role="tabpanel"
                tabIndex={0}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="h-full scroll-viewport scrollbar-hide p-4 space-y-2"
              >
                {transcriptLines.length === 0 ? (
                  <p className="text-ink/40 text-[10px] uppercase tracking-[0.4em] text-center py-12">
                    No transcript available
                  </p>
                ) : (
                  transcriptLines.map((line: string, i: number) => {
                    // Parse "Speaker: content" — real Vapi transcripts use the
                    // actual agent name (e.g. "Liam:") not the canonical "AI:".
                    // Match any leading "Word:" and bucket by known patterns so
                    // every line shows a meaningful label instead of "System".
                    const prefixMatch = line.match(/^([A-Z][A-Za-z\s_-]{0,30}):\s*(.*)$/);
                    const rawSpeaker = prefixMatch?.[1]?.trim() ?? "";
                    const body = prefixMatch?.[2] ?? line;
                    const speaker = rawSpeaker.toLowerCase();
                    const callerWords = [
                      "user",
                      "human",
                      "caller",
                      "customer",
                      "client",
                      "prospect",
                      "lead",
                    ];
                    const systemWords = ["system", "operator"];
                    const isUser = callerWords.includes(speaker);
                    const isSystem = systemWords.includes(speaker);
                    // Anything left with a name prefix is the AGENT side
                    // (the agent's name, "AI", "Agent", "Assistant", etc.).
                    const isAI = !!rawSpeaker && !isUser && !isSystem;
                    const label = !rawSpeaker
                      ? "Transcript"
                      : isUser
                        ? "Caller"
                        : isSystem
                          ? "System"
                          : rawSpeaker; // show the real agent name
                    return (
                      <div
                        key={i}
                        className={cn(
                          "p-3 rounded-md border text-[12px] leading-snug max-w-[85%]",
                          isAI
                            ? "bg-black/[0.03] border-black/8 text-ink mr-auto"
                            : isUser
                              ? "bg-brand/8 border-brand/20 text-ink ml-auto"
                              : "bg-black/[0.05] border-black/8 text-muted text-center mx-auto",
                        )}
                      >
                        <div
                          className={cn(
                            "text-[8px] uppercase tracking-[0.32em] mb-1",
                            isAI ? "text-muted" : isUser ? "text-brand" : "text-ink",
                          )}
                        >
                          {label}
                        </div>
                        {body}
                      </div>
                    );
                  })
                )}
              </motion.div>
            )}
            {tab === "record" && (
              <motion.div
                key="r"
                id="call-panel-record"
                role="tabpanel"
                tabIndex={0}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="h-full scroll-viewport scrollbar-hide p-4 space-y-3"
              >
                {call.recording_url ? (
                  <RecordingPlayer url={call.recording_url} />
                ) : (
                  <div className="h-full min-h-[200px] flex flex-col items-center justify-center gap-2">
                    <Activity className="w-6 h-6 text-ink/40" />
                    <p className="text-eyebrow/60">No recording available</p>
                    <p className="text-[10px] text-ink/40">
                      Recordings are stored by the voice carrier when enabled
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Panel>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-md wl-panel p-2.5">
      <div className="text-[8px] uppercase tracking-[0.28em] text-brand mb-1 flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <div className="font-display italic text-lg text-ink leading-none truncate">{value}</div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 *  RecordingPlayer — inline audio playback with seek, speed, and download
 * ──────────────────────────────────────────────────────────────────── */

const SPEEDS = [1, 1.25, 1.5, 2] as const;

function RecordingPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [loadError, setLoadError] = useState(false);

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().catch(() => setLoadError(true));
    } else {
      a.pause();
    }
  }, []);

  const cycleSpeed = useCallback(() => {
    setSpeedIdx((prev) => {
      const next = (prev + 1) % SPEEDS.length;
      const a = audioRef.current;
      if (a) a.playbackRate = SPEEDS[next];
      return next;
    });
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = pct * a.duration;
  }, []);

  const skip = useCallback((delta: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + delta));
  }, []);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (loadError) {
    return (
      <div className="rounded-md wl-panel border border-destructive/20 p-4 text-center space-y-2">
        <Activity className="w-5 h-5 text-destructive mx-auto" />
        <p className="text-[10px] text-destructive">
          Recording could not be loaded. It may have expired.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.28em] text-muted hover:text-ink transition-colors"
        >
          <ExternalLink className="w-3 h-3" /> Try opening directly
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-md wl-panel p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-[9px] uppercase tracking-[0.3em] text-brand flex items-center gap-1.5">
          <Volume2 className="w-3 h-3" />
          Call Recording
        </div>
        <a
          href={url}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.28em] text-muted hover:text-ink transition-colors"
          aria-label="Download recording"
        >
          <Download className="w-3 h-3" /> Download
        </a>
      </div>

      {/* Hidden HTML5 audio element */}
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={() => {
          const a = audioRef.current;
          if (a) setDuration(a.duration);
        }}
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (a) setCurrent(a.currentTime);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setLoadError(true)}
      />

      {/* Progress bar */}
      <div
        className="group relative h-2 rounded-full bg-black/10 cursor-pointer overflow-hidden"
        onClick={handleSeek}
        role="slider"
        aria-label="Seek through recording"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
      >
        {/* Filled track */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, var(--color-brand), #7B3FA0)",
          }}
        />
        {/* Hover thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-brand shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-2">
        {/* Skip back 10s */}
        <ShadButton
          type="button"
          variant="outline"
          size="icon"
          disableAnimations
          onClick={() => skip(-10)}
          aria-label="Rewind 10 seconds"
          className="w-7 h-7 rounded-full text-muted hover:text-ink"
        >
          <SkipForward className="w-3 h-3 rotate-180" />
        </ShadButton>

        <ShadButton
          type="button"
          variant="default"
          size="icon"
          disableAnimations
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="w-10 h-10 rounded-full bg-brand text-on-brand hover:bg-brand/90 shadow-lg hover:scale-105 active:scale-95"
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </ShadButton>

        <ShadButton
          type="button"
          variant="outline"
          size="icon"
          disableAnimations
          onClick={() => skip(10)}
          aria-label="Forward 10 seconds"
          className="w-7 h-7 rounded-full text-muted hover:text-ink"
        >
          <SkipForward className="w-3 h-3" />
        </ShadButton>

        {/* Time */}
        <span className="text-[10px] font-mono text-muted tabular-nums ml-1">
          {fmtTime(currentTime)}
          <span className="text-ink/40 mx-0.5">/</span>
          {fmtTime(duration)}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Speed toggle */}
        <ShadButton
          type="button"
          variant="outline"
          size="sm"
          disableAnimations
          onClick={cycleSpeed}
          aria-label={`Playback speed: ${SPEEDS[speedIdx]}x`}
          className="h-6 px-2 rounded-full text-[9px] font-mono text-muted hover:text-ink"
        >
          {SPEEDS[speedIdx]}x
        </ShadButton>
      </div>
    </div>
  );
}
