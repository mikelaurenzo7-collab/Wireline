/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Flame,
  ShieldAlert,
  BookOpen,
  ListTodo,
  AlertOctagon,
  ChevronRight,
  Compass,
  Loader2,
  Plus,
  RefreshCw,
  Pencil,
  X,
  Check,
  Trash2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { cn } from "../lib/utils";
import { BRAND } from "../constants/brand-colors";
import { formatDate, formatDateTime } from "../lib/safe-date";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import CsvExportButton from "./CsvExportButton";
import PageShell, { Panel } from "./PageShell";
import WidgetBoundary from "./WidgetBoundary";
import ClientRouteViewport from "./layout/ClientRouteViewport";
import ClientToolbar from "./layout/ClientToolbar";
import { Card } from "./ui/shadcn/Card";
import { Badge } from "./ui/shadcn/Badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./ui/shadcn/Tooltip";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { InlineEmpty } from "./ui/InlineEmpty";
import ClientRouteLoading from "./layout/ClientRouteLoading";

interface HotLead {
  id: string;
  agent_id: string;
  customer_number: string | null;
  lead_score: number;
  intent_label: string | null;
  summary: string | null;
  sentiment?: string | null;
  coaching_note?: string | null;
  created_at: string;
}

interface FleetTask {
  id: string;
  agent_id: string | null;
  description: string | null;
  priority: "high" | "medium" | "low";
  task_type: string;
  target_channel: string | null;
  status: string;
  created_at: string;
}

interface KnowledgeGap {
  id: string;
  agent_id: string;
  lesson: string;
  created_at: string;
}

interface EscalationCall {
  id: string;
  agent_id: string;
  customer_number: string | null;
  lead_score: number | null;
  summary: string | null;
  coaching_note?: string | null;
  created_at: string;
}

interface TriageData {
  hot_leads: HotLead[];
  compliance: FleetTask[];
  pending_tasks: FleetTask[];
  knowledge_gaps: KnowledgeGap[];
  escalations: EscalationCall[];
  counts: Record<string, number>;
}

export default function TriageInbox() {
  const [data, setData] = useState<TriageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setFetchErr(null);
    try {
      const r = await authFetch("/api/triage");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData(d);
    } catch (e: any) {
      if (e?.name !== "AbortError") setFetchErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const counts = data?.counts || ({} as Record<string, number>);
  const totalAttention = Object.values(counts).reduce((s, n) => s + n, 0);

  // Per-bucket panel renderer — shared error / loading shell so every
  // card on the dense triage grid behaves identically. Each Panel is
  // `scroll` so the page itself never grows; the cards handle their
  // own overflow.
  const bucketPanel = (
    title: string,
    icon: React.ComponentType<{ className?: string }>,
    hint: string,
    body: React.ReactNode,
    accent?: string,
  ) => (
    <Panel
      icon={icon}
      hint={hint}
      title={title}
      scroll
      flush
      accent={accent}
      className="h-full min-h-[160px] sm:min-h-[260px]"
    >
      {loading && !data ? (
        <ClientRouteLoading
          icon={<Compass className="w-6 h-6 animate-spin-slow" />}
          label="Scanning…"
          className="py-6"
        />
      ) : fetchErr ? (
        <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center py-6">
          <p className="text-[10px] uppercase tracking-[0.35em] text-rose-500">{fetchErr}</p>
          <ShadButton
            onClick={fetchData}
            variant="ghost"
            className="text-[10px] uppercase tracking-[0.3em] text-muted hover:text-brand"
          >
            Retry
          </ShadButton>
        </div>
      ) : (
        body
      )}
    </Panel>
  );

  // Optimistic removes let the operator feel instant responsiveness while the
  // network request resolves. On failure we re-fetch so state stays accurate.
  const removeTask = (id: string) =>
    setData((prev) =>
      prev
        ? {
            ...prev,
            pending_tasks: prev.pending_tasks.filter((t) => t.id !== id),
            counts: {
              ...prev.counts,
              pending_tasks: Math.max(0, (prev.counts.pending_tasks ?? 0) - 1),
            },
          }
        : prev,
    );

  const removeGap = (id: string) =>
    setData((prev) =>
      prev
        ? {
            ...prev,
            knowledge_gaps: prev.knowledge_gaps.filter((g) => g.id !== id),
            counts: {
              ...prev.counts,
              knowledge_gaps: Math.max(0, (prev.counts.knowledge_gaps ?? 0) - 1),
            },
          }
        : prev,
    );

  return (
    <ClientRouteViewport>
      <ClientToolbar
        left={
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted">
            <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
            {totalAttention} need attention
          </span>
        }
        actions={
          <>
            <CsvExportButton type="tasks" label="CSV" />
            <ShadButton
              onClick={fetchData}
              disabled={loading}
              variant="outline"
              className="h-9 px-3 rounded-full wl-panel border border-input text-eyebrow hover:text-brand hover:border-brand/40 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              Refresh
            </ShadButton>
          </>
        }
      />
      <PageShell title="" eyebrow="" subtitle="">
        {/* ────────────────────────────────────────────────────────────
          Dense triage grid — five buckets visible simultaneously.
          Replaces the tabbed layout (which buried 4 of 5 buckets and
          left an empty Panel below the active list when items were
          short).
          
          Layout:
            - base / sm   : 1 column stack
            - md          : 2 columns
            - lg          : 3 columns; hot leads spans 2, escalations
                            spans 1 full-height tower on the right
            - xl          : same 3 columns but with taller rows
          
          Each card scrolls internally → the page itself never scrolls.
          ──────────────────────────────────────────────────────────── */}
        <div
          className={cn(
            "h-full min-h-0 overflow-y-auto lg:overflow-hidden stagger-children",
            "grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
            "lg:[grid-template-rows:minmax(0,1.15fr)_minmax(0,1fr)]",
            // Dense flow packs the row-span-2 escalations tower + 4 cards into
            // exactly the two explicit rows; without it the tower leaves a gap
            // that spills a card into an implicit (auto-rows-fr) 3rd row, leaving
            // dead space at the bottom of the grid on tall screens.
            "auto-rows-fr lg:grid-flow-row-dense",
          )}
          data-testid="triage-grid"
        >
          {/* Column 1, Row 1: Hot Leads */}
          <div className="lg:col-span-1">
            {bucketPanel(
              "Hot Leads",
              Flame,
              counts.hot_leads ? `${counts.hot_leads} ready to close` : "Cold floor",
              <WidgetBoundary label="Hot Leads">
                <HotLeads items={data?.hot_leads || []} />
              </WidgetBoundary>,
              "#8B6FA8",
            )}
          </div>

          {/* Column 2, Row 1: Open Tasks */}
          <div>
            {bucketPanel(
              "Open Tasks",
              ListTodo,
              counts.pending_tasks ? `${counts.pending_tasks} open` : "Queue clear",
              <WidgetBoundary label="Open Tasks">
                <OpenTasks
                  items={data?.pending_tasks || []}
                  onCompleted={removeTask}
                  onFetchFailed={fetchData}
                />
              </WidgetBoundary>,
              "#8B3FD6",
            )}
          </div>

          {/* Column 3, Row 1 & 2: Escalations */}
          <div className="lg:row-span-2">
            {bucketPanel(
              "Escalations",
              AlertOctagon,
              counts.escalations ? `${counts.escalations} pending` : "All clear",
              <WidgetBoundary label="Escalations">
                <Escalations items={data?.escalations || []} />
              </WidgetBoundary>,
              "#E8466A",
            )}
          </div>

          {/* Column 1, Row 2: Compliance */}
          <div>
            {bucketPanel(
              "Compliance",
              ShieldAlert,
              counts.compliance ? `${counts.compliance} flags` : "Clean",
              <WidgetBoundary label="Compliance">
                <ComplianceList items={data?.compliance || []} />
              </WidgetBoundary>,
              "#E8466A",
            )}
          </div>

          {/* Column 2, Row 2: Knowledge Gaps */}
          <div className="md:col-span-2 lg:col-span-1">
            {bucketPanel(
              "Knowledge Gaps",
              BookOpen,
              counts.knowledge_gaps ? `${counts.knowledge_gaps} to capture` : "Up to date",
              <WidgetBoundary label="Knowledge Gaps">
                <KnowledgeGaps
                  items={data?.knowledge_gaps || []}
                  onPromoted={fetchData}
                  onDiscard={removeGap}
                />
              </WidgetBoundary>,
              "#8B3FD6",
            )}
          </div>
        </div>
      </PageShell>
    </ClientRouteViewport>
  );
}

/* ────────────────────────  Hot leads  ─────────────────────────── */

function HotLeads({ items }: { items: HotLead[] }) {
  if (items.length === 0)
    return <Empty icon={Flame} label="No hot leads right now — keep dialing." />;
  return (
    <ul className="p-2 space-y-2 list-none stagger-children">
      {items.map((c) => (
        <li key={c.id} className="relative list-none group">
          <Card className="bg-black/10 border-white/5 hover:border-brand/20 transition-all p-3 flex items-center gap-3 rounded-md relative">
            {/* Absolute overlay link covering the entire row target */}
            <Link
              to={`/contact/${encodeURIComponent(c.customer_number || "unknown")}`}
              className="absolute inset-0 z-0"
              aria-label={`View contact profile for ${c.customer_number || "unknown caller"}`}
            />

            <div className="shrink-0 w-11 h-11 flex items-center justify-center text-ink relative z-10 pointer-events-none">
              <svg width="44" height="44" viewBox="0 0 44 44">
                <circle
                  r="16"
                  cx="22"
                  cy="22"
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="4"
                />
                <circle
                  r="16"
                  cx="22"
                  cy="22"
                  fill="none"
                  stroke={
                    c.lead_score >= 80 ? "#8B3FD6" : c.lead_score >= 60 ? "#8B6FA8" : "#E8466A"
                  }
                  strokeWidth="4"
                  strokeDasharray={`${(c.lead_score / 100) * 100.53} 100.53`}
                  strokeLinecap="round"
                  transform="rotate(-90 22 22)"
                />
                <text
                  x="22"
                  y="26"
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill="currentColor"
                >
                  {c.lead_score}
                </text>
              </svg>
            </div>

            <div className="min-w-0 flex-1 relative z-10 pointer-events-none text-left">
              <span className="font-display italic text-base text-ink leading-tight block truncate group-hover:text-brand transition-colors font-normal">
                {c.customer_number || "Unknown caller"}
              </span>
              {c.summary && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-[11px] text-muted/70 truncate cursor-help text-left max-w-full">
                        {c.summary}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent className="bg-popover border border-input p-2.5 max-w-xs text-xs text-ink rounded-md shadow-xl">
                      {c.summary}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <div className="flex items-center gap-2 mt-1.5 text-[8px] uppercase tracking-[0.26em] text-muted/70">
                <span>{formatDate(c.created_at)}</span>
                <span className="w-1 h-1 rounded-full bg-white/15" />
                <Badge
                  variant="secondary"
                  className="text-[8px] uppercase tracking-[0.26em] text-brand border-brand/20 bg-brand/10 hover:bg-brand/15 leading-none px-1.5 py-0.5 rounded"
                >
                  {c.intent_label} intent
                </Badge>
                {c.sentiment && (
                  <Badge
                    variant="outline"
                    className="px-1.5 py-0.5 text-[7px] tracking-normal border-input rounded text-muted-foreground"
                  >
                    {c.sentiment}
                  </Badge>
                )}
              </div>
              {c.coaching_note && (
                <p className="text-[10px] text-muted/70 mt-1.5 line-clamp-1 pr-2">
                  {c.coaching_note}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0 relative z-20">
              <ClaudeRecipeButton
                recipe="enrich-lead"
                initial={{
                  customerNumber: c.customer_number,
                  context: `High-intent (${c.lead_score}) lead from prior call. Summary: ${c.summary}`,
                }}
                label="Enrich"
              />
              <ShadButton
                variant="outline"
                size="icon"
                className="w-8 h-8 rounded-md bg-background/50 border border-input flex items-center justify-center text-ink/70 transition-all hover:border-brand/25 hover:text-brand p-0"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </ShadButton>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────  Compliance flags  ────────────────────── */

function ComplianceList({ items }: { items: FleetTask[] }) {
  if (items.length === 0)
    return <Empty icon={ShieldAlert} label="All clear — no compliance flags." green />;
  return (
    <ul className="p-2 space-y-2 list-none">
      {items.map((t) => (
        <li key={t.id} className="relative list-none">
          <Card
            className={cn(
              "p-3 flex items-start gap-3 rounded-md transition-all",
              t.priority === "high"
                ? "bg-rose-950/15 border-rose-500/20 hover:border-rose-500/40"
                : t.priority === "medium"
                  ? "bg-amber-950/10 border-amber-500/20 hover:border-amber-500/40"
                  : "bg-black/10 border-white/5 hover:border-white/10",
            )}
          >
            <ShieldAlert
              className={cn(
                "w-4 h-4 shrink-0 mt-0.5",
                t.priority === "high"
                  ? "text-rose-500"
                  : t.priority === "medium"
                    ? "text-amber-500"
                    : "text-rose-400",
              )}
            />
            <div className="flex-1 min-w-0 text-left">
              <div
                className={cn(
                  "text-[8px] uppercase tracking-[0.28em] flex items-center justify-between mb-1.5",
                  t.priority === "high"
                    ? "text-rose-500"
                    : t.priority === "medium"
                      ? "text-amber-500"
                      : "text-rose-400",
                )}
              >
                <span>Compliance · {t.priority}</span>
                {t.priority === "high" && (
                  <Badge
                    variant="destructive"
                    className="text-[8px] font-bold uppercase tracking-widest animate-pulse leading-none py-0.5 px-1.5 rounded"
                  >
                    URGENT
                  </Badge>
                )}
              </div>
              <p className="text-[12px] text-ink/90 leading-snug">{t.description}</p>
              <div className="text-[8px] uppercase tracking-[0.28em] text-muted mt-1.5 flex items-center gap-2">
                <span>{formatDateTime(t.created_at)}</span>
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────  Knowledge gaps  ──────────────────────── */

function KnowledgeGaps({
  items,
  onPromoted,
  onDiscard,
}: {
  items: KnowledgeGap[];
  onPromoted: () => void;
  onDiscard: (id: string) => void;
}) {
  if (items.length === 0)
    return (
      <Empty
        icon={BookOpen}
        label="No captured knowledge gaps. Your agents are answering everything."
        green
      />
    );
  return (
    <ul className="p-2 space-y-2 list-none">
      <AnimatePresence initial={false}>
        {items.map((g) => (
          <KnowledgeGapRow key={g.id} gap={g} onPromoted={onPromoted} onDiscard={onDiscard} />
        ))}
      </AnimatePresence>
    </ul>
  );
}

const KnowledgeGapRow: React.FC<{
  gap: KnowledgeGap;
  onPromoted: () => void;
  onDiscard: (id: string) => void;
}> = ({ gap, onPromoted, onDiscard }) => {
  const cleaned = gap.lesson.replace(/^\[KNOWLEDGE GAP\]\s*/, "");
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(cleaned);
  const [busy, setBusy] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const { toast } = useToast();

  const promote = async () => {
    setBusy(true);
    try {
      const r = await authFetch(`/api/knowledge-gaps/${gap.id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customContent: editing ? content : undefined }),
      });
      if (r.ok) {
        onPromoted();
      } else {
        toast({ title: "Couldn't promote knowledge gap", type: "error" });
      }
    } catch {
      toast({ title: "Couldn't promote knowledge gap", type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    setDiscarding(true);
    try {
      const r = await authFetch(`/api/agents/${gap.agent_id}/lessons/${gap.id}`, {
        method: "DELETE",
      });
      if (r.ok) {
        onDiscard(gap.id);
      } else {
        toast({ title: "Couldn't discard knowledge gap", type: "error" });
        setDiscarding(false);
      }
    } catch {
      toast({ title: "Couldn't discard knowledge gap", type: "error" });
      setDiscarding(false);
    }
  };

  return (
    <motion.li
      layout
      exit={{ opacity: 0, height: 0, overflow: "hidden" }}
      transition={{ duration: 0.18 }}
      className="mb-2 list-none"
    >
      <Card className="bg-black/10 border-white/5 hover:border-brand/20 transition-all p-3 flex items-start gap-3 rounded-md">
        <div className="flex items-start gap-3 w-full">
          <BookOpen className="w-4 h-4 text-brand shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-left">
            <div className="text-[8px] uppercase tracking-[0.28em] text-brand mb-0.5">
              Captured gap
            </div>
            {editing ? (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-md bg-black/25 border border-input outline-none text-ink text-[12px] focus:ring-1 focus:ring-brand/40 focus:border-brand/40 transition-all resize-none"
              />
            ) : (
              <p className="text-[12px] text-ink/90 leading-snug">{cleaned}</p>
            )}
            <div className="text-[8px] uppercase tracking-[0.28em] text-muted mt-1.5">
              Agent · <span className="font-mono">{gap.agent_id?.substring(0, 12)}</span> ·{" "}
              {formatDate(gap.created_at)}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ShadButton
              variant="ghost"
              size="icon"
              onClick={() => {
                setEditing(!editing);
                setContent(cleaned);
              }}
              className="w-7 h-7 rounded-full text-muted hover:text-ink hover:bg-white/5 transition-all flex items-center justify-center p-0"
              title={editing ? "Cancel" : "Edit before promoting"}
              aria-label={editing ? "Cancel edit" : "Edit gap content"}
            >
              {editing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            </ShadButton>
            <ShadButton
              variant="ghost"
              size="icon"
              onClick={discard}
              disabled={discarding || busy}
              className="w-7 h-7 rounded-full text-muted hover:text-rose-400 hover:bg-rose-500/8 transition-all flex items-center justify-center disabled:opacity-40 p-0"
              title="Discard this gap"
              aria-label="Discard knowledge gap"
            >
              {discarding ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </ShadButton>
            <ShadButton
              variant="default"
              size="sm"
              onClick={promote}
              disabled={busy || discarding}
              className="h-7 rounded-md bg-brand/20 hover:bg-brand/35 border border-brand/40 text-brand px-3 text-[9px] uppercase tracking-[0.28em] font-normal transition-all flex items-center gap-1"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Promote
            </ShadButton>
          </div>
        </div>
      </Card>
    </motion.li>
  );
};

/* ────────────────────────  Open tasks  ─────────────────────────── */

function OpenTasks({
  items,
  onCompleted,
  onFetchFailed,
}: {
  items: FleetTask[];
  onCompleted: (id: string) => void;
  onFetchFailed: () => void;
}) {
  if (items.length === 0)
    return <Empty icon={ListTodo} label="Inbox zero. You're caught up." green />;
  return (
    <ul className="p-2 space-y-2 list-none">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <OpenTaskRow
            key={t.id}
            task={t}
            onCompleted={onCompleted}
            onFetchFailed={onFetchFailed}
          />
        ))}
      </AnimatePresence>
    </ul>
  );
}

const OpenTaskRow: React.FC<{
  task: FleetTask;
  onCompleted: (id: string) => void;
  onFetchFailed: () => void;
}> = ({ task, onCompleted, onFetchFailed }) => {
  const [completing, setCompleting] = useState(false);

  const complete = async () => {
    setCompleting(true);
    // Optimistic remove first — feels instant.
    onCompleted(task.id);
    try {
      const r = await authFetch(`/api/fleet/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!r.ok) {
        // Roll back on failure by re-fetching.
        onFetchFailed();
      }
    } catch {
      onFetchFailed();
    }
  };

  return (
    <motion.li
      layout
      exit={{ opacity: 0, height: 0, overflow: "hidden" }}
      transition={{ duration: 0.18 }}
      className="mb-2 list-none"
    >
      <Card className="bg-black/10 border-white/5 hover:border-brand/20 transition-all p-3 flex items-start gap-3 rounded-md">
        <ShadButton
          variant="outline"
          size="icon"
          onClick={complete}
          disabled={completing}
          className={cn(
            "shrink-0 w-6 h-6 rounded-full border transition-all mt-0.5 flex items-center justify-center p-0",
            completing
              ? "border-brand/60 bg-brand/20"
              : "border-input bg-background/50 hover:border-brand/50 hover:bg-brand/10 hover:text-brand",
          )}
          aria-label="Mark task complete"
          title="Mark complete"
        >
          {completing ? (
            <Loader2 className="w-3 h-3 animate-spin text-brand" />
          ) : (
            <Check className="w-3 h-3 text-muted/70 hover:text-brand transition-colors" />
          )}
        </ShadButton>

        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 mb-1.5">
            <Badge
              variant={
                task.priority === "high"
                  ? "destructive"
                  : task.priority === "medium"
                    ? "secondary"
                    : "outline"
              }
              className={cn(
                "text-[8px] uppercase tracking-[0.28em] font-normal px-2 py-0.5 rounded leading-none",
                task.priority === "high" &&
                  "bg-rose-500/15 text-rose-500 border-rose-500/30 hover:bg-rose-500/20",
                task.priority === "medium" &&
                  "bg-brand/15 text-brand border-brand/30 hover:bg-brand/20",
                task.priority === "low" &&
                  "bg-zinc-500/15 text-zinc-300 border-zinc-500/30 hover:bg-zinc-500/20",
              )}
            >
              {task.priority}
            </Badge>
          </div>
          <p className="text-[12px] text-ink/90 leading-snug">{task.description}</p>
          <div className="text-[8px] uppercase tracking-[0.28em] text-muted mt-1.5 flex items-center gap-2">
            <span>{task.target_channel || "manual"}</span>
            <span className="w-1 h-1 rounded-full bg-white/10" />
            <span>{formatDateTime(task.created_at)}</span>
          </div>
        </div>
      </Card>
    </motion.li>
  );
};

/* ───────────────────────  Escalations  ─────────────────────────── */

function Escalations({ items }: { items: EscalationCall[] }) {
  if (items.length === 0)
    return <Empty icon={AlertOctagon} label="No escalations on file." green />;
  return (
    <ul className="p-2 space-y-2 list-none">
      {items.map((c) => (
        <li key={c.id} className="relative list-none group">
          <Card className="bg-rose-950/10 border-rose-500/10 hover:border-rose-500/30 transition-all p-3 flex items-start gap-3 rounded-md relative">
            {/* Absolute overlay link covering the entire row target */}
            <Link
              to={`/contact/${encodeURIComponent(c.customer_number || "unknown")}`}
              className="absolute inset-0 z-0"
              aria-label={`View contact profile for ${c.customer_number || "unknown caller"}`}
            />

            <AlertOctagon className="w-4 h-4 text-rose-500 shrink-0 mt-0.5 relative z-10 pointer-events-none" />
            <div className="flex-1 min-w-0 relative z-10 pointer-events-none text-left">
              <span className="font-display italic text-base text-ink block truncate group-hover:text-brand transition-colors">
                {c.customer_number || "Unknown caller"}
              </span>
              <p className="text-[11px] text-ink/70 truncate">{c.summary}</p>
              <div className="text-[8px] uppercase tracking-[0.28em] text-muted mt-1.5 flex items-center gap-2">
                <span>{formatDateTime(c.created_at)}</span>
                {c.lead_score !== null && c.lead_score !== undefined && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-white/10" />
                    <Badge
                      variant="outline"
                      className="text-[7px] tracking-normal border-rose-500/20 text-rose-400 bg-rose-500/5 px-1 py-0 rounded"
                    >
                      Score: {c.lead_score}
                    </Badge>
                  </>
                )}
              </div>
              {c.coaching_note && (
                <p className="text-[10px] text-rose-400/80 mt-1.5 line-clamp-1 pr-2">
                  {c.coaching_note}
                </p>
              )}
            </div>
            <div className="relative z-20 shrink-0">
              <ClaudeRecipeButton recipe="coach" callId={c.id} label="Coach" variant="compact" />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function Empty({
  icon: Icon,
  label,
  green,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  green?: boolean;
}) {
  return (
    <div className="h-full flex items-center justify-center">
      <InlineEmpty icon={Icon} label={label} accent={green ? BRAND.purple : undefined} />
    </div>
  );
}
