import React, { useState, useEffect } from "react";
import {
  PhoneIncoming, PhoneOutgoing, Clock, FileText, Search, Loader2,
  MessageCircle, ChevronRight, Database, Activity, Signal, ExternalLink,
  Download, Filter, SmilePlus, Meh, Frown, MessageSquare,
} from "lucide-react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import CsvExportButton from "./CsvExportButton";
import PageShell, { Panel } from "./PageShell";

export default function CallLogs() {
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;
  const [selectedCall, setSelectedCall] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "inbound" | "outbound">("all");

  const fetchCalls = async (currentOffset: number = 0, append: boolean = false) => {
    if (!append) setLoading(true); else setLoadingMore(true);
    try {
      const res = await authFetch(`/api/calls?offset=${currentOffset}&limit=${LIMIT}`);
      const data = await res.json();
      if (append) setCalls(prev => [...prev, ...(data.calls || [])]);
      else setCalls(data.calls || []);
      setHasMore(data.hasMore);
      setOffset(currentOffset + (data.calls?.length || 0));
    } catch (e) {
      console.error("Failed to fetch calls:", e);
    } finally {
      if (!append) setLoading(false); else setLoadingMore(false);
    }
  };

  useEffect(() => { fetchCalls(0, false); }, []);

  // Auto-select first call on initial load only — preserve user deselection.
  const initialSelectionDone = React.useRef(false);
  useEffect(() => {
    if (!initialSelectionDone.current && calls.length > 0 && !selectedCall) {
      setSelectedCall(calls[0]);
      initialSelectionDone.current = true;
    }
  }, [calls, selectedCall]);

  const loadMore = () => { if (!loadingMore && hasMore) fetchCalls(offset, true); };

  const filteredCalls = calls.filter(call => {
    const matchesSearch = call.customer_number?.includes(search) ||
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
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          type="text"
          placeholder="Search signals…"
          className="h-9 w-44 lg:w-60 pl-8 pr-3 rounded-full glass border border-white/10 text-[11px] text-ink placeholder:text-muted/60 focus:border-brand/40 focus:outline-none transition-all"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="relative">
        <Filter className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <select
          className="h-9 pl-8 pr-7 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.22em] text-ink appearance-none focus:border-brand/40 focus:outline-none transition-all cursor-pointer"
          value={filter}
          onChange={e => setFilter(e.target.value as any)}
        >
          <option value="all">All</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
        </select>
        <ChevronRight className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-muted pointer-events-none" />
      </div>
      <CsvExportButton type="calls" label="CSV" />
    </div>
  );

  return (
    <PageShell
      eyebrow="Signal Channels · Voice"
      title="Voice Archive"
      subtitle="Carrier signal threads and tactical fleet responses"
      actions={actions}
    >
      <div className="h-full grid grid-cols-12 gap-3">
        {/* List pane */}
        <div className="col-span-12 lg:col-span-5 xl:col-span-4 h-full">
          <Panel
            title={`${filteredCalls.length} signals`}
            hint={loading ? "Loading…" : "Archive"}
            icon={Database}
            scroll
            flush
            actions={
              hasMore && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-[9px] uppercase tracking-[0.3em] text-muted hover:text-ink transition-colors flex items-center gap-1"
                >
                  {loadingMore ? <Loader2 className="w-3 h-3 animate-spin" /> : <Signal className="w-3 h-3" />}
                  More
                </button>
              )
            }
          >
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-brand" />
                <span className="text-[9px] uppercase tracking-[0.4em] text-muted">Extracting</span>
              </div>
            ) : filteredCalls.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center px-4">
                <p className="text-[9px] uppercase tracking-[0.5em] text-muted/60">No signals recorded</p>
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {filteredCalls.map(call => (
                  <li key={call.id}>
                    <button
                      onClick={() => setSelectedCall(call)}
                      aria-label={`Open signal from ${call.customer_number || "Sim Test"}: ${call.summary || "no summary"}`}
                      className={cn(
                        "w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-white/3 transition-all",
                        selectedCall?.id === call.id && "bg-brand/8 ring-1 ring-inset ring-brand/30"
                      )}
                    >
                      <div className={cn(
                        "w-9 h-9 rounded-xl glass border flex items-center justify-center shrink-0",
                        call.direction === 'inbound' ? "border-brand/30 text-brand" : "border-brand-2/30 text-brand-2"
                      )}>
                        {call.direction === 'inbound' ? <PhoneIncoming className="w-4 h-4" /> : <PhoneOutgoing className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-display italic text-sm text-ink truncate">{call.customer_number || "Sim Test"}</span>
                          <span className={cn(
                            "px-1.5 py-0 rounded-full text-[8px] font-mono leading-tight shrink-0",
                            (call.lead_score || 0) >= 80 ? "bg-rose-500/15 text-rose-500" :
                            (call.lead_score || 0) >= 50 ? "bg-brand/15 text-brand" :
                            "bg-white/5 text-muted"
                          )}>
                            {call.lead_score || 0}
                          </span>
                          <SentimentDot sentiment={call.sentiment} />
                        </div>
                        <p className="text-[10px] text-muted truncate leading-tight">{call.summary || "Decoding…"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[9px] text-muted">{new Date(call.created_at).toLocaleDateString()}</div>
                        <div className="text-[8px] text-muted/60 uppercase tracking-[0.22em]">{new Date(call.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Detail pane */}
        <div className="col-span-12 lg:col-span-7 xl:col-span-8 h-full">
          {selectedCall ? <CallDetail call={selectedCall} formatDuration={formatDuration} /> : (
            <Panel title="Detail" hint="Select a signal" icon={FileText}>
              <div className="h-full flex items-center justify-center text-muted/60 text-[10px] uppercase tracking-[0.5em]">
                Awaiting selection
              </div>
            </Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function SentimentDot({ sentiment }: { sentiment?: string }) {
  const s = (sentiment || 'neutral').toLowerCase();
  if (s === 'positive') return <SmilePlus className="w-3 h-3 text-emerald-400 shrink-0" />;
  if (s === 'negative') return <Frown className="w-3 h-3 text-rose-400 shrink-0" />;
  return <Meh className="w-3 h-3 text-muted/40 shrink-0" />;
}

function CallDetail({ call, formatDuration }: { call: any; formatDuration: (s: number) => string }) {
  type DTab = "summary" | "transcript" | "record";
  const [tab, setTab] = useState<DTab>("summary");

  const transcriptLines = (call.transcript || "").split('\n').filter((l: string) => l.trim() !== '');

  return (
    <Panel
      title={
        <Link to={`/contact/${encodeURIComponent(call.customer_number || "unknown")}`}
          className="inline-flex items-center gap-1.5 hover:text-brand transition-colors group">
          <span>{call.customer_number || "Simulator"}</span>
          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      }
      hint={`Trace ${call.vapi_call_id?.substring(0, 12) || ""}`}
      icon={call.direction === "inbound" ? PhoneIncoming : PhoneOutgoing}
      flush
      actions={
        <div className="flex items-center gap-1">
          <ClaudeRecipeButton recipe="coach"   callId={call.id} label="Coach"   />
          <ClaudeRecipeButton recipe="qualify" callId={call.id} label="Qualify" />
        </div>
      }
    >
      <div className="h-full flex flex-col">
        {/* Sub-tabs */}
        <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-white/5 flex items-center gap-1.5">
          {([
            { id: "summary",   label: "Summary",    icon: FileText },
            { id: "transcript",label: "Transcript", icon: MessageCircle },
            { id: "record",    label: "Record",     icon: Activity },
          ] as const).map(t => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-[0.22em] transition-all",
                  active ? "bg-white/8 border-brand/40 text-ink" : "border-white/8 text-muted hover:text-ink"
                )}
              >
                <t.icon className={cn("w-3 h-3", active ? "text-brand" : "")} />
                {t.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2 text-[9px] uppercase tracking-[0.3em] text-muted">
            <Clock className="w-3 h-3" />
            <span>{formatDuration(call.duration_seconds || 0)}</span>
            <span className="w-1 h-1 rounded-full bg-white/15" />
            <span className="text-rose-500/80">${(call.cost ?? 0).toFixed(4)}</span>
          </div>
        </div>

        {/* Sub-tab body */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            {tab === "summary" && (
              <motion.div key="s" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="h-full overflow-y-auto scrollbar-hide p-4 space-y-3">
                <div className="rounded-xl glass border border-white/8 p-4">
                  <div className="text-[9px] uppercase tracking-[0.3em] text-brand mb-2 flex items-center gap-1.5">
                    <FileText className="w-3 h-3" /> Mission summary
                  </div>
                  <p className="text-ink/90 font-display italic text-lg md:text-xl leading-snug">
                    {call.summary || "Pending inference…"}
                  </p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Stat label="Duration"   value={formatDuration(call.duration_seconds || 0)} accent="#7DF9FF" icon={Clock} />
                  <Stat label="Cost"       value={`$${(call.cost ?? 0).toFixed(4)}`}          accent="#FF6BD9" />
                  <Stat label="Lead score" value={`${call.lead_score ?? 0}`}                  accent="#C58BFF" />
                  <Stat label="Sentiment"  value={
                    <span className={cn(
                      "capitalize text-base",
                      (call.sentiment || 'neutral') === 'positive' ? "text-emerald-400" :
                      (call.sentiment || 'neutral') === 'negative' ? "text-rose-400" : "text-muted/70"
                    )}>
                      {call.sentiment || "neutral"}
                    </span>
                  } accent="#4DFFC4" />
                </div>
                {call.coaching_note && (
                  <div className="rounded-xl glass border border-brand/20 p-4">
                    <div className="text-[9px] uppercase tracking-[0.3em] text-brand mb-2 flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3" /> AI coaching note
                    </div>
                    <p className="text-[12px] text-ink/80 leading-relaxed">{call.coaching_note}</p>
                  </div>
                )}
              </motion.div>
            )}
            {tab === "transcript" && (
              <motion.div key="t" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="h-full overflow-y-auto scrollbar-hide p-4 space-y-2">
                {transcriptLines.length === 0 ? (
                  <p className="text-muted/60 text-[10px] uppercase tracking-[0.4em] text-center py-12">
                    No transcript available
                  </p>
                ) : transcriptLines.map((line: string, i: number) => {
                  const isAI   = line.startsWith('AI:') || line.startsWith('Agent:');
                  const isUser = line.startsWith('User:') || line.startsWith('Human:');
                  return (
                    <div key={i} className={cn(
                      "p-3 rounded-xl border text-[12px] leading-snug max-w-[85%]",
                      isAI   ? "bg-white/3 border-white/8 text-ink mr-auto" :
                      isUser ? "bg-brand/8 border-brand/20 text-ink ml-auto" :
                               "bg-paper/40 border-white/8 text-muted text-center mx-auto"
                    )}>
                      <div className={cn(
                        "text-[8px] uppercase tracking-[0.32em] mb-1",
                        isAI ? "text-muted" : isUser ? "text-brand" : "text-ink"
                      )}>
                        {isAI ? 'Agent' : isUser ? 'Carrier' : 'System'}
                      </div>
                      {line.replace(/^(AI|Agent|User|Human|System):\s*/i, '')}
                    </div>
                  );
                })}
              </motion.div>
            )}
            {tab === "record" && (
              <motion.div key="r" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="h-full overflow-y-auto scrollbar-hide p-4 space-y-3">
                {call.recording_url ? (
                  <div className="rounded-xl glass border border-white/8 p-4 space-y-3">
                    <div className="text-[9px] uppercase tracking-[0.3em] text-brand flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                      Decrypted signal buffer
                    </div>
                    <audio controls className="w-full h-9">
                      <source src={call.recording_url} type="audio/mpeg" />
                    </audio>
                    <a href={call.recording_url} download target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.28em] text-muted hover:text-ink transition-colors">
                      <Download className="w-3 h-3" /> Download
                    </a>
                  </div>
                ) : (
                  <div className="h-full min-h-[200px] flex flex-col items-center justify-center gap-2">
                    <Activity className="w-6 h-6 text-muted/40" />
                    <p className="text-[9px] uppercase tracking-[0.4em] text-muted/60">No recording available</p>
                    <p className="text-[10px] text-muted/40">Recordings are stored by Vapi when enabled</p>
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

function Stat({ label, value, accent, icon: Icon }: { label: string; value: React.ReactNode; accent: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg glass border border-white/8 p-2.5">
      <div className="text-[8px] uppercase tracking-[0.28em] text-muted mb-1 flex items-center gap-1" style={{ color: accent }}>
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <div className="font-display italic text-lg text-ink leading-none truncate">{value}</div>
    </div>
  );
}
