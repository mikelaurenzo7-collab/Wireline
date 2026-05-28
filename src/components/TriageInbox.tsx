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
import { cn } from "../lib/utils";
import { formatDate, formatDateTime } from "../lib/safe-date";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import CsvExportButton from "./CsvExportButton";
import PageShell, { Panel } from "./PageShell";
import WidgetBoundary from "./WidgetBoundary";

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
      className="h-full min-h-[260px]"
    >
      {loading && !data ? (
        <div className="h-full flex flex-col items-center justify-center gap-2 py-6">
          <Loader2 className="w-5 h-5 animate-spin text-brand" />
          <p className="text-eyebrow">Scanning…</p>
        </div>
      ) : fetchErr ? (
        <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center py-6">
          <p className="text-[10px] uppercase tracking-[0.35em] text-rose-500">{fetchErr}</p>
          <button
            onClick={fetchData}
            className="text-[10px] uppercase tracking-[0.3em] text-muted hover:text-brand transition-colors"
          >
            Retry
          </button>
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
    <PageShell
      eyebrow={`Today's Inbox · ${totalAttention} items`}
      title="Triage"
      subtitle="Every signal that needs your attention, side-by-side. Hot leads, compliance flags, knowledge gaps, open tasks, escalations — one glance, no tabs."
      actions={
        <>
          <CsvExportButton type="tasks" label="CSV" />
          <button
            onClick={fetchData}
            disabled={loading}
            className="h-9 px-3 rounded-full glass border border-white/10 text-eyebrow hover:text-brand hover:border-brand/40 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Refresh
          </button>
        </>
      }
    >
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
          "h-full min-h-0 overflow-y-auto lg:overflow-hidden",
          "grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
          // Two-row grid on lg+: Hot Leads + Escalations on row 1,
          // Compliance + Tasks + Gaps share row 2.
          "lg:[grid-template-rows:minmax(0,1.15fr)_minmax(0,1fr)]",
          "auto-rows-fr",
        )}
        data-testid="triage-grid"
      >
        {/* Hot Leads — hero, spans 2 columns on lg+ */}
        <div className="lg:col-span-2">
          {bucketPanel(
            "Hot Leads",
            Flame,
            counts.hot_leads ? `${counts.hot_leads} ready to close` : "Cold floor",
            <WidgetBoundary label="Hot Leads">
              <HotLeads items={data?.hot_leads || []} />
            </WidgetBoundary>,
            "#F59E0B",
          )}
        </div>

        {/* Escalations — full-height right tower on lg+ */}
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

        {/* Row 2: Compliance · Tasks · Gaps */}
        {bucketPanel(
          "Compliance",
          ShieldAlert,
          counts.compliance ? `${counts.compliance} flags` : "Clean",
          <WidgetBoundary label="Compliance">
            <ComplianceList items={data?.compliance || []} />
          </WidgetBoundary>,
          "#E8466A",
        )}
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
          "#4F1E7B",
        )}
        {/* Knowledge gaps — second row, third column */}
        <div className="lg:col-start-2 lg:row-start-2 hidden lg:block">
          {/* Empty cell - reserved so the next card lands in col 3.
              On smaller screens it never renders. */}
        </div>
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
            "#10B981",
          )}
        </div>
      </div>
    </PageShell>
  );
}

/* ─────────────────────────  Hot leads  ─────────────────────────── */

function HotLeads({ items }: { items: HotLead[] }) {
  if (items.length === 0)
    return <Empty icon={Flame} label="No hot leads right now — keep dialing." />;
  return (
    <ul className="divide-y divide-black/8">
      {items.map((c) => (
        <li
          key={c.id}
          className="group px-4 py-3.5 flex items-center gap-3 hover:bg-white/3 transition-all relative active:bg-white/5 active:scale-[0.99] duration-100"
        >
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
                stroke="rgba(0,0,0,0.08)"
                strokeWidth="4"
              />
              <circle
                r="16"
                cx="22"
                cy="22"
                fill="none"
                stroke={c.lead_score >= 80 ? "#10B981" : c.lead_score >= 60 ? "#F59E0B" : "#E8466A"}
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

          <div className="min-w-0 flex-1 relative z-10 pointer-events-none">
            <span className="font-display italic text-base text-ink leading-tight block truncate group-hover:text-brand transition-colors">
              {c.customer_number || "Unknown caller"}
            </span>
            <p className="text-[11px] text-muted/70 truncate">{c.summary}</p>
            <div className="flex items-center gap-2 mt-1 text-[8px] uppercase tracking-[0.26em] text-muted/65">
              <span>{formatDate(c.created_at)}</span>
              <span className="w-1 h-1 rounded-full bg-white/15" />
              <span
                className="text-brand/80"
                style={{ textShadow: "0 0 10px rgba(79, 30, 123 ,0.5)" }}
              >
                {c.intent_label} intent
              </span>
              {c.sentiment && (
                <span className="px-1 py-px rounded bg-white/10 text-[7px] tracking-normal">
                  {c.sentiment}
                </span>
              )}
            </div>
            {c.coaching_note && (
              <p className="text-[10px] text-muted/60 mt-0.5 line-clamp-1 pr-2">
                {c.coaching_note}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 relative z-20">
            <ClaudeRecipeButton
              recipe="enrich-lead"
              initial={{
                customerNumber: c.customer_number,
                context: `High-intent (${c.lead_score}) lead from prior call. Summary: ${c.summary}`,
              }}
              label="Enrich"
            />
            <div className="w-8 h-8 rounded-xl glass border border-white/8 flex items-center justify-center text-ink/50 transition-all group-hover:border-white/15 group-hover:text-brand">
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>
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
    <ul className="divide-y divide-black/8">
      {items.map((t) => (
        <li
          key={t.id}
          className={cn(
            "relative px-4 py-3 flex items-start gap-3",
            t.priority === "high"
              ? "bg-rose-500/8 border-l-2 border-rose-500/50"
              : t.priority === "medium"
                ? "bg-amber-500/6 border-l-2 border-amber-500/30"
                : "bg-rose-500/3",
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
          <div className="flex-1 min-w-0">
            <div
              className={cn(
                "text-[8px] uppercase tracking-[0.28em] mb-0.5 flex items-center justify-between",
                t.priority === "high"
                  ? "text-rose-500"
                  : t.priority === "medium"
                    ? "text-amber-500"
                    : "text-rose-400",
              )}
            >
              <span>Compliance · {t.priority}</span>
              {t.priority === "high" && (
                <span className="text-[8px] font-bold text-rose-400 uppercase tracking-widest animate-pulse">
                  URGENT
                </span>
              )}
            </div>
            <p className="text-[12px] text-ink/90 leading-snug">{t.description}</p>
            <div className="text-[8px] uppercase tracking-[0.28em] text-muted mt-1">
              {formatDateTime(t.created_at)}
            </div>
          </div>
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
    <ul className="divide-y divide-black/8">
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

  const promote = async () => {
    setBusy(true);
    try {
      const r = await authFetch(`/api/knowledge-gaps/${gap.id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customContent: editing ? content : undefined }),
      });
      if (r.ok) onPromoted();
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
        setDiscarding(false);
      }
    } catch {
      setDiscarding(false);
    }
  };

  return (
    <motion.li
      layout
      exit={{ opacity: 0, height: 0, overflow: "hidden" }}
      transition={{ duration: 0.18 }}
      className="px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <BookOpen className="w-4 h-4 text-brand shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-[8px] uppercase tracking-[0.28em] text-brand mb-0.5">
            Captured gap
          </div>
          {editing ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={2}
              className="w-full px-2 py-1.5 rounded-lg bg-black/5 border border-brand/20 outline-none text-ink text-[12px] focus:border-brand/50 transition-all resize-none"
            />
          ) : (
            <p className="text-[12px] text-ink/90 leading-snug">{cleaned}</p>
          )}
          <div className="text-[8px] uppercase tracking-[0.28em] text-muted mt-1">
            Agent · <span className="font-mono">{gap.agent_id?.substring(0, 12)}</span> ·{" "}
            {formatDate(gap.created_at)}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              setEditing(!editing);
              setContent(cleaned);
            }}
            className="w-7 h-7 rounded-full text-muted hover:text-ink transition-colors flex items-center justify-center"
            title={editing ? "Cancel" : "Edit before promoting"}
            aria-label={editing ? "Cancel edit" : "Edit gap content"}
          >
            {editing ? <X className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
          </button>
          <button
            onClick={discard}
            disabled={discarding || busy}
            className="w-7 h-7 rounded-full text-muted hover:text-rose-400 hover:bg-rose-500/8 transition-colors flex items-center justify-center disabled:opacity-40"
            title="Discard this gap"
            aria-label="Discard knowledge gap"
          >
            {discarding ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
          </button>
          <button
            onClick={promote}
            disabled={busy || discarding}
            className="disabled:opacity-50 disabled:cursor-not-allowed brutal-btn !py-1.5 !px-3 !text-[9px] !tracking-[0.28em]"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Promote
          </button>
        </div>
      </div>
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
    <ul className="divide-y divide-black/8">
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
      className="px-4 py-3 flex items-start gap-3 group"
    >
      {/* Mark complete button — replaces the static priority badge */}
      <button
        onClick={complete}
        disabled={completing}
        className={cn(
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "shrink-0 w-5 h-5 rounded-full border transition-all mt-0.5 flex items-center justify-center",
          completing
            ? "border-emerald-500/60 bg-emerald-500/20"
            : "border-white/20 hover:border-emerald-500/60 hover:bg-emerald-500/10 group-hover:border-white/35",
        )}
        aria-label="Mark task complete"
        title="Mark complete"
      >
        {completing ? (
          <Loader2 className="w-2.5 h-2.5 animate-spin text-emerald-400" />
        ) : (
          <Check className="w-2.5 h-2.5 text-muted/55 group-hover:text-emerald-400 group-active:text-emerald-400 transition-colors" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={cn(
              "shrink-0 px-1.5 py-0.5 rounded-full text-[8px] uppercase tracking-[0.28em] border leading-none",
              task.priority === "high" && "bg-rose-500/15 text-rose-500 border-rose-500/30",
              task.priority === "medium" && "bg-brand/15 text-brand border-brand/30",
              task.priority === "low" && "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
            )}
          >
            {task.priority}
          </span>
        </div>
        <p className="text-[12px] text-ink/90 leading-snug">{task.description}</p>
        <div className="text-[8px] uppercase tracking-[0.28em] text-muted mt-1 flex items-center gap-2">
          <span>{task.target_channel || "manual"}</span>
          <span>·</span>
          <span>{formatDateTime(task.created_at)}</span>
        </div>
      </div>
    </motion.li>
  );
};

/* ───────────────────────  Escalations  ─────────────────────────── */

function Escalations({ items }: { items: EscalationCall[] }) {
  if (items.length === 0)
    return <Empty icon={AlertOctagon} label="No escalations on file." green />;
  return (
    <ul className="divide-y divide-black/8">
      {items.map((c) => (
        <li
          key={c.id}
          className="group px-4 py-3 flex items-start gap-3 bg-rose-500/3 relative hover:bg-rose-500/6 active:bg-rose-500/8 transition-all duration-100"
        >
          {/* Absolute overlay link covering the entire row target */}
          <Link
            to={`/contact/${encodeURIComponent(c.customer_number || "unknown")}`}
            className="absolute inset-0 z-0"
            aria-label={`View contact profile for ${c.customer_number || "unknown caller"}`}
          />

          <AlertOctagon className="w-4 h-4 text-rose-500 shrink-0 mt-0.5 relative z-10 pointer-events-none" />
          <div className="flex-1 min-w-0 relative z-10 pointer-events-none">
            <span className="font-display italic text-base text-ink block truncate group-hover:text-brand transition-colors">
              {c.customer_number || "Unknown caller"}
            </span>
            <p className="text-[11px] text-ink/70 truncate">{c.summary}</p>
            <div className="text-[8px] uppercase tracking-[0.28em] text-muted mt-0.5">
              {formatDateTime(c.created_at)}
            </div>
            {c.coaching_note && (
              <p className="text-[10px] text-rose-500/80 mt-0.5 line-clamp-1 pr-2">
                {c.coaching_note}
              </p>
            )}
          </div>
          <div className="relative z-20">
            <ClaudeRecipeButton recipe="coach" callId={c.id} label="Coach" variant="compact" />
          </div>
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
    <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
      <Icon className={cn("w-10 h-10", green ? "text-emerald-500/60" : "text-muted/65")} />
      <p
        className={cn(
          "text-[10px] uppercase tracking-[0.4em]",
          green ? "text-emerald-500/80" : "text-muted",
        )}
      >
        {label}
      </p>
    </div>
  );
}
