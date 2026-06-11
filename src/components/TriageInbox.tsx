/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Flame,
  ShieldAlert,
  BookOpen,
  ListTodo,
  AlertOctagon,
  Compass,
  Loader2,
  Plus,
  RefreshCw,
  Pencil,
  Sparkles,
  X,
  Check,
  Trash2,
  type LucideIcon,
  CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { cn } from "../lib/utils";
import { formatDate, formatDateTime } from "../lib/safe-date";
import CsvExportButton from "./CsvExportButton";
import PageShell, { Panel } from "./PageShell";
import WidgetBoundary from "./WidgetBoundary";
import ClientRouteViewport from "./layout/ClientRouteViewport";
import ClientToolbar from "./layout/ClientToolbar";
import { Card } from "./ui/shadcn/Card";
import { Badge } from "./ui/shadcn/Badge";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { EmptyState } from "./ui/EmptyState";
import { WL_APP_CLASSES } from "../lib/wireline-director-design";
import {
  OPS_TRIAGE_EMPTY,
  OPS_TRIAGE_ACCENTS,
  OPS_CHANNEL_TOOLBAR,
  OPS_TRIAGE_COPY,
  WL_OPS_CLASSES,
  directorPromptHref,
} from "../lib/wireline-ops-design";
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

export type TriagePanelProps = {
  /** When true, renders inside Live Ops — no page chrome or duplicate toolbar. */
  embedded?: boolean;
  onAttentionChange?: (count: number) => void;
  onLoadingChange?: (loading: boolean) => void;
  refreshRef?: React.MutableRefObject<(() => void) | null>;
};

export function TriagePanel({
  embedded = false,
  onAttentionChange,
  onLoadingChange,
  refreshRef,
}: TriagePanelProps) {
  const [data, setData] = useState<TriageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
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
  }, []);

  const counts = data?.counts || ({} as Record<string, number>);
  // Hot leads are worked autonomously by the fleet — they're a signal, not
  // operator work, so they don't inflate the "needs attention" count.
  const totalAttention = Object.entries(counts).reduce(
    (s, [k, n]) => (k === "hot_leads" ? s : s + n),
    0,
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    onAttentionChange?.(totalAttention);
  }, [totalAttention, onAttentionChange]);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  useEffect(() => {
    if (!refreshRef) return;
    refreshRef.current = fetchData;
    return () => {
      refreshRef.current = null;
    };
  }, [fetchData, refreshRef]);

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
          label={OPS_CHANNEL_TOOLBAR.triage.loading}
          className="py-6"
        />
      ) : fetchErr ? (
        <div className="h-full flex items-center justify-center px-4 py-6">
          <EmptyState
            icon={AlertOctagon}
            eyebrow="Triage unavailable"
            title="Couldn't load inbox"
            description={fetchErr}
            density="compact"
            withHalo={false}
            actions={[{ label: "Retry", onClick: fetchData, primary: true }]}
          />
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

  // "All clear" must not contradict the hot-lead strip directly below it. When
  // hot leads are in play the strip itself carries the signal ("agents are on
  // it"), so the green banner only appears when the board is genuinely empty.
  const hasHotLeads = (data?.hot_leads?.length ?? 0) > 0;
  const allClearBanner =
    !loading && data && !fetchErr && totalAttention === 0 && !hasHotLeads ? (
      <div
        role="status"
        className={cn(
          "mb-3 rounded-md border px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2",
          WL_APP_CLASSES.statusSuccess,
        )}
      >
        <div className="flex items-start gap-3 flex-1 min-w-[12rem] text-left">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 wl-text-success" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-ink">{OPS_TRIAGE_COPY.allClearBannerTitle}</p>
            <p className="text-xs text-muted mt-0.5">{OPS_TRIAGE_COPY.allClearBannerBody}</p>
          </div>
        </div>
        <Link to="/ops?tab=floor" className="app-micro-cta touch-press hover:scale-[1.02] shrink-0">
          {OPS_TRIAGE_COPY.allClearBannerCta}
        </Link>
      </div>
    ) : null;

  const hotLeadStrip =
    !loading && data && !fetchErr && hasHotLeads ? (
      <WidgetBoundary label="Hot Leads">
        <HotLeadStrip items={data.hot_leads} />
      </WidgetBoundary>
    ) : null;

  const triageGrid = (
    <div
      className={cn(
        "h-full min-h-0 overflow-y-auto lg:overflow-hidden stagger-children",
        WL_OPS_CLASSES.triageGrid,
        // Equal-viewport board: stacked on phones, 2-up on tablets, a balanced
        // 2×2 on laptops, and a full-height 4-lane triage board on wide desktops
        // so 1440px+ screens read as a proper command board — not two stretched tiles.
        "grid gap-3 xl:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4",
        "auto-rows-fr lg:grid-rows-2 xl:grid-rows-1",
      )}
      data-testid="triage-grid"
    >
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
          OPS_TRIAGE_ACCENTS.openTasks,
        )}
      </div>

      <div>
        {bucketPanel(
          "Escalations",
          AlertOctagon,
          counts.escalations ? `${counts.escalations} pending` : "All clear",
          <WidgetBoundary label="Escalations">
            <Escalations items={data?.escalations || []} />
          </WidgetBoundary>,
          OPS_TRIAGE_ACCENTS.escalations,
        )}
      </div>

      <div>
        {bucketPanel(
          "Compliance",
          ShieldAlert,
          counts.compliance ? `${counts.compliance} flags` : "Clean",
          <WidgetBoundary label="Compliance">
            <ComplianceList items={data?.compliance || []} />
          </WidgetBoundary>,
          OPS_TRIAGE_ACCENTS.compliance,
        )}
      </div>

      <div>
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
          OPS_TRIAGE_ACCENTS.knowledgeGaps,
        )}
      </div>
    </div>
  );

  if (embedded) {
    return (
      <section className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div
          className={cn(
            WL_OPS_CLASSES.floorFrame,
            "flex-1 min-h-0 flex flex-col overflow-hidden p-2 sm:p-3",
          )}
        >
          {allClearBanner}
          {hotLeadStrip}
          {triageGrid}
        </div>
      </section>
    );
  }

  return (
    <ClientRouteViewport>
      <ClientToolbar
        left={
          <span className="app-toolbar-stat">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                !loading && data && totalAttention === 0
                  ? "bg-[var(--wl-signal)]"
                  : "bg-brand animate-pulse",
              )}
              aria-hidden
            />
            {loading && !data
              ? OPS_CHANNEL_TOOLBAR.triage.loading
              : OPS_CHANNEL_TOOLBAR.triage.stat(totalAttention)}
          </span>
        }
        actions={
          <>
            <CsvExportButton type="tasks" label="CSV" />
            <ShadButton
              type="button"
              onClick={fetchData}
              disabled={loading}
              variant="outline"
              size="sm"
              disableAnimations
              className={cn(
                "h-9 rounded-full text-muted hover:text-brand hover:border-brand/40 touch-press",
                WL_OPS_CLASSES.filterChip,
              )}
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {OPS_CHANNEL_TOOLBAR.triage.refresh}
            </ShadButton>
          </>
        }
      />
      <PageShell title="" eyebrow="" subtitle="">
        {allClearBanner}
        {hotLeadStrip}
        {triageGrid}
      </PageShell>
    </ClientRouteViewport>
  );
}

export default function TriageInbox() {
  return <TriagePanel />;
}

/* ──────────────────  Hot leads — signal strip  ─────────────────── */
/* Agents work hot leads autonomously; the operator only needs a slim
   signal strip — count, compact lead chips, and a one-tap Director
   handoff — instead of a full-height panel. */

function HotLeadStrip({ items }: { items: HotLead[] }) {
  return (
    <div
      role="status"
      className="mb-3 rounded-md border border-brand/20 bg-brand/[0.05] px-3 py-2 flex items-center gap-3 min-w-0"
    >
      <div className="flex items-center gap-2 shrink-0">
        <Flame className="w-4 h-4 text-brand" aria-hidden />
        <span className="wl-label text-brand whitespace-nowrap">
          {OPS_TRIAGE_COPY.hotStripLabel(items.length)}
        </span>
        <span className="hidden sm:inline text-[11px] text-muted whitespace-nowrap">
          {OPS_TRIAGE_COPY.hotStripHint}
        </span>
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
        {items.map((c) => (
          <Link
            key={c.id}
            to={`/contact/${encodeURIComponent(c.customer_number || "unknown")}`}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md wl-panel border border-border hover:border-brand/30 text-[11px] text-ink/85 hover:text-brand transition-colors touch-press hit-area-44"
            aria-label={`View contact profile for ${c.customer_number || "unknown caller"} (lead score ${c.lead_score})`}
          >
            <span className="font-mono font-bold text-brand tabular-nums">{c.lead_score}</span>
            <span className="truncate max-w-[9rem]">{c.customer_number || "Unknown caller"}</span>
            {c.intent_label && (
              <span className="hidden md:inline wl-label text-muted/70 whitespace-nowrap">
                {c.intent_label.replace(/_/g, " ")}
              </span>
            )}
          </Link>
        ))}
      </div>
      <Link
        to={directorPromptHref(OPS_TRIAGE_COPY.hotStripPrompt(items.length))}
        className="app-micro-cta touch-press hover:scale-[1.02] shrink-0"
      >
        {OPS_TRIAGE_COPY.hotStripCta}
      </Link>
    </div>
  );
}

/* ───────────────────────  Compliance flags  ────────────────────── */

function ComplianceList({ items }: { items: FleetTask[] }) {
  if (items.length === 0)
    return <TriagePanelEmpty icon={ShieldAlert} config={OPS_TRIAGE_EMPTY.compliance} positive />;
  return (
    <ul className="p-2 space-y-2 list-none">
      {items.map((t) => (
        <li key={t.id} className="relative list-none">
          <Card
            className={cn(
              "p-3 flex items-start gap-3 rounded-md transition-all wl-panel touch-press hover:scale-[1.02]",
              t.priority === "high"
                ? "bg-destructive/8 border-destructive/25 hover:border-destructive/40"
                : t.priority === "medium"
                  ? "bg-brand/[0.06] border-brand/20 hover:border-brand/35"
                  : "border-black/8 hover:border-black/12",
            )}
          >
            <ShieldAlert
              className={cn(
                "w-4 h-4 shrink-0 mt-0.5",
                t.priority === "high"
                  ? "text-destructive"
                  : t.priority === "medium"
                    ? "text-brand"
                    : "text-muted",
              )}
            />
            <div className="flex-1 min-w-0 text-left">
              <div
                className={cn(
                  "wl-label flex items-center justify-between mb-1.5",
                  t.priority === "high"
                    ? "text-destructive"
                    : t.priority === "medium"
                      ? "text-brand"
                      : "text-muted",
                )}
              >
                <span>Compliance · {t.priority}</span>
                {t.priority === "high" && (
                  <Badge
                    variant="destructive"
                    className="wl-label font-bold animate-pulse leading-none py-0.5 px-1.5 rounded"
                  >
                    URGENT
                  </Badge>
                )}
              </div>
              <p className="text-[12px] text-ink/90 leading-snug">{t.description}</p>
              <div className="wl-label text-muted mt-1.5 flex items-center gap-2">
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
    return <TriagePanelEmpty icon={BookOpen} config={OPS_TRIAGE_EMPTY.knowledgeGaps} positive />;
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
      <Card className="wl-panel border-black/8 hover:border-brand/25 transition-all p-3 flex items-start gap-3 rounded-md touch-press hover:scale-[1.02]">
        <div className="flex items-start gap-3 w-full">
          <BookOpen className="w-4 h-4 text-brand shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-left">
            <div className="wl-label text-brand mb-0.5">Captured gap</div>
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
            <div className="wl-label text-muted mt-1.5">
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
              className="w-7 h-7 rounded-full text-muted hover:text-ink hover:bg-black/5 transition-all flex items-center justify-center p-0"
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
              className="w-7 h-7 rounded-full text-muted hover:text-destructive hover:bg-destructive/8 transition-all flex items-center justify-center disabled:opacity-40 p-0"
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
              className="h-7 rounded-md bg-brand/20 hover:bg-brand/35 border border-brand/40 text-brand px-3 wl-label font-normal transition-all flex items-center gap-1"
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
    return <TriagePanelEmpty icon={ListTodo} config={OPS_TRIAGE_EMPTY.openTasks} positive />;
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
      <Card className="wl-panel border-black/8 hover:border-brand/25 transition-all p-3 flex items-start gap-3 rounded-md touch-press hover:scale-[1.02]">
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
                "wl-label font-normal px-2 py-0.5 rounded leading-none",
                task.priority === "high" &&
                  "bg-destructive/12 text-destructive border-destructive/30 hover:bg-destructive/18",
                task.priority === "medium" &&
                  "bg-brand/15 text-brand border-brand/30 hover:bg-brand/20",
                task.priority === "low" &&
                  "bg-black/[0.04] text-muted border-black/10 hover:bg-black/[0.06]",
              )}
            >
              {task.priority}
            </Badge>
          </div>
          <p className="text-[12px] text-ink/90 leading-snug">{task.description}</p>
          <div className="wl-label text-muted mt-1.5 flex items-center gap-2">
            <span>{task.target_channel || "manual"}</span>
            <span className={WL_OPS_CLASSES.dotSep} aria-hidden />
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
    return <TriagePanelEmpty icon={AlertOctagon} config={OPS_TRIAGE_EMPTY.escalations} positive />;
  return (
    <ul className="p-2 space-y-2 list-none">
      {items.map((c) => (
        <li key={c.id} className="relative list-none group">
          <Card className="bg-destructive/6 border-destructive/15 hover:border-destructive/30 transition-all p-3 flex items-start gap-3 rounded-md relative wl-panel touch-press hover:scale-[1.02]">
            {/* Absolute overlay link covering the entire row target */}
            <Link
              to={`/contact/${encodeURIComponent(c.customer_number || "unknown")}`}
              className="absolute inset-0 z-0"
              aria-label={`View contact profile for ${c.customer_number || "unknown caller"}`}
            />

            <AlertOctagon className="w-4 h-4 text-destructive shrink-0 mt-0.5 relative z-10 pointer-events-none" />
            <div className="flex-1 min-w-0 relative z-10 pointer-events-none text-left">
              <span className="text-sm font-semibold text-ink block truncate group-hover:text-brand transition-colors">
                {c.customer_number || "Unknown caller"}
              </span>
              <p className="text-[11px] text-ink/70 truncate">{c.summary}</p>
              <div className="wl-label text-muted mt-1.5 flex items-center gap-2">
                <span>{formatDateTime(c.created_at)}</span>
                {c.lead_score !== null && c.lead_score !== undefined && (
                  <>
                    <span className={WL_OPS_CLASSES.dotSep} aria-hidden />
                    <Badge
                      variant="outline"
                      className="text-[7px] tracking-normal border-brand/20 text-brand bg-brand/5 px-1 py-0 rounded"
                    >
                      Score: {c.lead_score}
                    </Badge>
                  </>
                )}
              </div>
              {c.coaching_note && (
                <p className="text-caption text-destructive/80 mt-1.5 line-clamp-1 pr-2">
                  {c.coaching_note}
                </p>
              )}
            </div>
            <div className="relative z-20 shrink-0">
              <Link
                to={directorPromptHref(
                  OPS_TRIAGE_COPY.escalationCoachPrompt(
                    c.customer_number || "an unknown caller",
                    c.summary || "No summary captured.",
                  ),
                )}
                className="w-9 h-9 rounded-full border border-brand/30 text-brand hover:bg-brand/10 flex items-center justify-center transition-colors touch-press hit-area-44"
                title="Coach in Director"
                aria-label="Coach this escalation in Director chat"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </Link>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function TriagePanelEmpty({
  icon: Icon,
  config,
  positive,
}: {
  icon: LucideIcon;
  config: {
    eyebrow: string;
    title: string;
    description: string;
    actions?: readonly { label: string; to: string; primary?: boolean }[];
  };
  /** Positive empty — no outbound pressure, softer layout */
  positive?: boolean;
}) {
  return (
    // m-auto inside a scrollable flex parent: centers when there's room,
    // degrades to scroll instead of clipping the CTA on short laptop panels.
    <div className="h-full min-h-0 overflow-y-auto flex py-4 px-2">
      <EmptyState
        icon={Icon}
        eyebrow={config.eyebrow}
        title={config.title}
        description={config.description}
        actions={config.actions ? [...config.actions] : undefined}
        density="compact"
        withHalo={!positive}
        className="py-4 m-auto"
      />
    </div>
  );
}
