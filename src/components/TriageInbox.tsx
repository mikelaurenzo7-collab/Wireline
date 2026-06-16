/* eslint-disable @typescript-eslint/no-explicit-any -- /api/triage returns five
 * heterogeneous snake_case row shapes (call logs, fleet tasks, agent lessons).
 * They're read defensively here; shared client types belong in
 * contracts/api-types.ts and are tracked separately. */
/**
 * TriagePanel — the live triage inbox inside the Ops cockpit (`/ops?tab=triage`).
 *
 * Reads the real `/api/triage` feed (escalations, hot leads, compliance reviews,
 * pending tasks, and knowledge gaps) and lays them out as a calm, scannable set
 * of category columns on the Rich Cream + Purple system. It honors the embed
 * contract from CommandCenter: it reports its loading state, publishes an
 * attention count for the toolbar badge, and exposes a refresh handle.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  BookOpen,
  Flame,
  ListChecks,
  ShieldCheck,
  Bot,
  RefreshCw,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { EmptyState } from "./ui/EmptyState";
import ClientRouteLoading from "./layout/ClientRouteLoading";

interface TriagePanelProps {
  embedded?: boolean;
  refreshRef?: React.RefObject<(() => void) | null>;
  onAttentionChange?: (count: number) => void;
  onLoadingChange?: (loading: boolean) => void;
}

type CategoryKey = "escalations" | "hot_leads" | "compliance" | "pending_tasks" | "knowledge_gaps";

interface TriageData {
  escalations: any[];
  hot_leads: any[];
  compliance: any[];
  pending_tasks: any[];
  knowledge_gaps: any[];
  counts: Record<CategoryKey, number>;
}

const EMPTY: TriageData = {
  escalations: [],
  hot_leads: [],
  compliance: [],
  pending_tasks: [],
  knowledge_gaps: [],
  counts: {
    escalations: 0,
    hot_leads: 0,
    compliance: 0,
    pending_tasks: 0,
    knowledge_gaps: 0,
  },
};

const CATEGORIES: {
  key: CategoryKey;
  label: string;
  icon: typeof Flame;
  accent: boolean;
}[] = [
  { key: "escalations", label: "Escalations", icon: AlertTriangle, accent: true },
  { key: "hot_leads", label: "Hot leads", icon: Flame, accent: true },
  { key: "compliance", label: "Compliance review", icon: ShieldCheck, accent: false },
  { key: "pending_tasks", label: "Pending tasks", icon: ListChecks, accent: false },
  { key: "knowledge_gaps", label: "Knowledge gaps", icon: BookOpen, accent: false },
];

function relativeTime(value: any): string {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Derive a human title/subtitle/meta from a heterogeneous triage row. */
function describe(key: CategoryKey, row: any): { title: string; subtitle?: string; meta?: string } {
  if (key === "knowledge_gaps") {
    return {
      title: String(row?.lesson ?? "Knowledge gap").replace(/^\[KNOWLEDGE GAP\]\s*/i, ""),
      subtitle: row?.agent_id ? `Agent ${row.agent_id}` : undefined,
      meta: relativeTime(row?.created_at),
    };
  }
  if (key === "compliance" || key === "pending_tasks") {
    return {
      title: String(row?.description || row?.task_type || "Task").replace(/_/g, " "),
      subtitle: row?.priority ? `${row.priority} priority` : row?.task_type?.replace(/_/g, " "),
      meta: relativeTime(row?.created_at),
    };
  }
  // escalations + hot_leads (call logs)
  return {
    title: String(row?.summary || row?.intent_label || "Call").replace(/_/g, " "),
    subtitle: row?.customer_number || (row?.agent_id ? `Agent ${row.agent_id}` : undefined),
    meta:
      [row?.lead_score != null ? `score ${row.lead_score}` : "", relativeTime(row?.created_at)]
        .filter(Boolean)
        .join(" · ") || undefined,
  };
}

export function TriageInbox({
  refreshRef,
  onAttentionChange,
  onLoadingChange,
}: TriagePanelProps = {}) {
  const [data, setData] = useState<TriageData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const onAttentionRef = useRef(onAttentionChange);
  const onLoadingRef = useRef(onLoadingChange);
  onAttentionRef.current = onAttentionChange;
  onLoadingRef.current = onLoadingChange;

  const load = useCallback(async () => {
    setLoading(true);
    onLoadingRef.current?.(true);
    try {
      const r = await authFetch("/api/triage");
      if (!r.ok) throw new Error(String(r.status));
      const json = (await r.json()) as Partial<TriageData>;
      const next: TriageData = { ...EMPTY, ...json, counts: { ...EMPTY.counts, ...json.counts } };
      setData(next);
      setErrored(false);
      const attention = Object.values(next.counts).reduce((a, b) => a + (Number(b) || 0), 0);
      onAttentionRef.current?.(attention);
    } catch {
      setErrored(true);
      onAttentionRef.current?.(0);
    } finally {
      setLoading(false);
      onLoadingRef.current?.(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Expose refresh to the embedding CommandCenter toolbar.
  useEffect(() => {
    if (!refreshRef) return;
    refreshRef.current = load;
    return () => {
      if (refreshRef.current === load) refreshRef.current = null;
    };
  }, [refreshRef, load]);

  const total = useMemo(
    () => Object.values(data.counts).reduce((a, b) => a + (Number(b) || 0), 0),
    [data.counts],
  );

  if (loading && total === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <ClientRouteLoading icon={<ListChecks className="h-6 w-6" />} label="Loading triage" />
      </div>
    );
  }

  if (errored && total === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center px-6">
        <EmptyState
          icon={AlertTriangle}
          eyebrow="Triage"
          title="Couldn't load triage"
          description="We couldn't reach the triage feed. Refresh to try again."
          density="compact"
          withHalo={false}
          actions={[{ label: "Retry", onClick: load, primary: true }]}
        />
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center px-6">
        <EmptyState
          icon={ShieldCheck}
          eyebrow="All clear"
          title="Nothing to triage"
          description="Escalations, hot leads, compliance reviews, and knowledge gaps will surface here as your agents take calls."
          density="compact"
          withHalo={false}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scroll-viewport px-1 pb-2">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {CATEGORIES.map((cat) => {
          const items = (data[cat.key] as any[]) || [];
          const Icon = cat.icon;
          return (
            <section
              key={cat.key}
              className={cn(
                "flex min-h-[180px] flex-col rounded-md border bg-paper/40",
                cat.accent ? "border-brand/20" : "border-border/70",
              )}
              aria-label={cat.label}
            >
              <header className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
                <span className="inline-flex items-center gap-2 min-w-0">
                  <Icon
                    className={cn("h-3.5 w-3.5 shrink-0", cat.accent ? "text-brand" : "text-muted")}
                  />
                  <span className="wl-label truncate text-ink">{cat.label}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px] tabular-nums",
                    items.length > 0
                      ? "border-brand/25 bg-brand/10 text-brand"
                      : "border-border/70 text-muted",
                  )}
                >
                  {items.length}
                </span>
              </header>

              <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto scroll-viewport p-2">
                {items.length === 0 ? (
                  <p className="px-1 py-6 text-center text-[12px] text-muted/70">Clear</p>
                ) : (
                  items.slice(0, 12).map((row, i) => {
                    const d = describe(cat.key, row);
                    return (
                      <motion.div
                        key={row?.id ?? `${cat.key}-${i}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18, delay: Math.min(i * 0.015, 0.2) }}
                        className="rounded-md border border-border/60 bg-background/50 px-2.5 py-2 transition-colors hover:border-brand/25"
                      >
                        <p className="line-clamp-2 text-[13px] leading-snug text-ink/90">
                          {d.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                          {d.subtitle && (
                            <span className="inline-flex items-center gap-1 truncate">
                              <Bot className="h-2.5 w-2.5 shrink-0 text-muted/70" />
                              {d.subtitle}
                            </span>
                          )}
                          {d.meta && (
                            <span className="font-mono tabular-nums text-muted/80">{d.meta}</span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                )}
                {items.length > 12 && (
                  <p className="px-1 pt-1 text-center text-[11px] text-muted/70">
                    +{items.length - 12} more
                  </p>
                )}
              </div>
            </section>
          );
        })}

        {/* Refresh affordance, aligned to the grid rhythm. */}
        <div className="flex items-center justify-center rounded-md border border-dashed border-border/60 bg-paper/20 p-4 lg:col-span-2 2xl:col-span-3">
          <ShadButton
            type="button"
            variant="outline"
            size="sm"
            disableAnimations
            onClick={load}
            disabled={loading}
            className="rounded-full wl-label text-muted hover:text-brand"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh triage
          </ShadButton>
        </div>
      </div>
    </div>
  );
}

export const TriagePanel = TriageInbox;
