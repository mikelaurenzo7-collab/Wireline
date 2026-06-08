/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Phone, Mail, ChevronRight, Loader2, RefreshCw, Kanban, GripVertical } from "lucide-react";
import PageShell, { Panel } from "./PageShell";
import { EmptyState } from "./ui/EmptyState";
import { InlineEmpty } from "./ui/InlineEmpty";
import { OPS_CHANNEL_EMPTY, OPS_CHANNEL_TOOLBAR, OPS_PIPELINE } from "../lib/wireline-ops-design";
import ClientRouteViewport from "./layout/ClientRouteViewport";
import ClientToolbar from "./layout/ClientToolbar";
import ClientRouteLoading from "./layout/ClientRouteLoading";
import { authFetch } from "../lib/api";
import { logFetchError } from "../lib/utils";
import { useToast } from "../contexts/ToastContext";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/shadcn/Card";
import { Badge } from "./ui/shadcn/Badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./ui/shadcn/Tooltip";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { BRAND } from "../constants/brand-colors";
import { cn } from "../lib/utils";

type Stage = "cold" | "contacted" | "qualified" | "demo" | "won" | "lost";

const STAGES: { id: Stage; label: string; tint: string; cardBg: string; help: string }[] = [
  {
    id: "cold",
    label: "Cold",
    tint: BRAND.purpleMuted,
    cardBg: "from-brand/6 to-transparent",
    help: "Not contacted yet",
  },
  {
    id: "contacted",
    label: "Contacted",
    tint: BRAND.purple,
    cardBg: "from-brand/10 to-transparent",
    help: "Reached at least once",
  },
  {
    id: "qualified",
    label: "Qualified",
    tint: BRAND.purple,
    cardBg: "from-brand/10 to-transparent",
    help: "Fit confirmed",
  },
  {
    id: "demo",
    label: "Demo Booked",
    tint: BRAND.purple,
    cardBg: "from-brand/12 to-transparent",
    help: "Meeting on the calendar",
  },
  {
    id: "won",
    label: "Won",
    tint: BRAND.purple,
    cardBg: "from-brand/14 to-transparent",
    help: "Closed-won",
  },
  {
    id: "lost",
    label: "Lost",
    tint: BRAND.rose,
    cardBg: "from-destructive/8 to-transparent",
    help: "Closed-lost",
  },
];

function attemptsUrgencyClass(attempts: number | null | undefined): string {
  if (!attempts || attempts === 0) return "bg-border/40";
  if (attempts <= 2) return "bg-brand";
  if (attempts <= 4) return "bg-brand/60";
  return "bg-destructive";
}

interface Lead {
  id: string | number;
  customerName: string | null;
  customerNumber: string | null;
  email: string | null;
  status: string | null;
  pipelineStage: Stage | null;
  campaignSource: string | null;
  attempts: number | null;
  lastCalledAt: string | null;
  lastContactSummary: string | null;
  demo?: boolean;
}

export default function Pipeline() {
  const { error: toastError, success: toastSuccess } = useToast();
  const [board, setBoard] = useState<Record<Stage, Lead[]>>({} as any);
  const [counts, setCounts] = useState<Record<Stage, number>>({} as any);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch("/api/pipeline");
      if (r.ok) {
        const d = await r.json();
        setBoard(d.board || {});
        setCounts(d.counts || {});
      }
    } catch (e) {
      logFetchError("Failed to load pipeline", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const moveLead = useCallback(
    async (leadId: string | number, target: Stage) => {
      const idStr = String(leadId);
      try {
        const r = await authFetch(`/api/pipeline/lead/${idStr}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pipelineStage: target }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        toastSuccess("Lead moved", `Pipeline stage set to ${target}.`);
        load();
      } catch (e: any) {
        toastError("Move failed", e?.message || "Try again.");
      } finally {
        setDraggingId(null);
        setDragOverStage(null);
      }
    },
    [load, toastSuccess, toastError],
  );

  const totalLeads = Object.values(counts).reduce((s, n) => s + (n || 0), 0);
  const wonCount = counts.won || 0;
  const conversionRate = totalLeads > 0 ? ((wonCount / totalLeads) * 100).toFixed(1) : "0.0";
  const showInitialLoad = loading && totalLeads === 0;

  const toolbarActions = (
    <>
      {totalLeads > 0 && (
        <span className="hidden sm:inline-flex items-center px-3 py-2 rounded-md wl-panel border border-input text-eyebrow">
          Win rate{" "}
          <span className="ml-1.5 text-brand font-semibold tabular-nums">{conversionRate}%</span>
        </span>
      )}
      <ShadButton
        onClick={load}
        disabled={loading}
        variant="outline"
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md wl-panel border border-input text-eyebrow hover:text-ink hover:border-brand/25 transition-colors disabled:opacity-60 h-auto"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <RefreshCw className="w-3.5 h-3.5" />
        )}
        Refresh
      </ShadButton>
    </>
  );

  return (
    <ClientRouteViewport>
      <ClientToolbar
        left={
          <span className="app-toolbar-stat">
            {showInitialLoad
              ? OPS_CHANNEL_TOOLBAR.pipeline.loading
              : `${totalLeads} lead${totalLeads === 1 ? "" : "s"}`}
          </span>
        }
        actions={toolbarActions}
      />
      {showInitialLoad ? (
        <ClientRouteLoading
          icon={<Kanban className="w-7 h-7" />}
          label={OPS_CHANNEL_TOOLBAR.pipeline.loading}
          className="flex-1 min-h-0"
        />
      ) : (
        <PageShell title="" eyebrow="" subtitle="" bodyClassName="flex flex-col min-h-0 min-w-0">
          {totalLeads === 0 && !loading && (
            <EmptyState
              icon={Kanban}
              eyebrow={OPS_CHANNEL_EMPTY.pipeline.eyebrow}
              title={OPS_CHANNEL_EMPTY.pipeline.title}
              description={OPS_CHANNEL_EMPTY.pipeline.description}
              actions={[...OPS_CHANNEL_EMPTY.pipeline.actions]}
              density="compact"
              withHalo={false}
              fill
              className="py-10"
            />
          )}
          {/* Mobile: vertical stack of columns.
           *  Tablet+: fixed-width kanban columns in a horizontally scrollable row. */}
          {totalLeads > 0 && (
            <div className="wl-pipeline-board pb-1">
              <div className="flex flex-col md:flex-row md:flex-nowrap gap-3 h-auto md:h-full md:w-max md:min-h-full md:pr-3 md:snap-x md:snap-mandatory">
                {STAGES.map((stage) => {
                  const leads = board[stage.id] || [];
                  return (
                    <div
                      key={stage.id}
                      role="region"
                      aria-label={`${stage.label} column — drop leads here`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverStage(stage.id);
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDragOverStage((prev) => (prev === stage.id ? null : prev));
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverStage(null);
                        const id = e.dataTransfer.getData("text/plain");
                        if (id) moveLead(id, stage.id);
                      }}
                      className={cn(
                        "w-full md:w-[220px] md:shrink-0 md:snap-start flex flex-col md:h-full max-h-[70vh] md:max-h-none transition-[outline] duration-150",
                        dragOverStage === stage.id &&
                          draggingId &&
                          "wl-pipeline-column--drop-target",
                      )}
                    >
                      <Panel
                        title={stage.label}
                        hint={`${leads.length} · ${stage.help}`}
                        accent={stage.tint}
                        scroll
                        icon={Phone}
                      >
                        <div className="space-y-2">
                          {leads.length === 0 && !loading && (
                            <div className="border border-dashed border-brand/15 rounded-md bg-brand/[0.03] py-1">
                              <InlineEmpty label={OPS_PIPELINE.emptyColumn} className="py-3" />
                              <p className="wl-micro-meta text-center pb-3 px-2">
                                {OPS_PIPELINE.dragHint}
                              </p>
                            </div>
                          )}
                          {leads.map((lead) => (
                            <motion.div
                              key={String(lead.id)}
                              layout
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              whileHover={{ y: -3, scale: 1.01 }}
                              whileTap={{ scale: 0.98 }}
                              draggable
                              onDragStart={(e: any) => {
                                setDraggingId(String(lead.id));
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", String(lead.id));
                              }}
                              onDragEnd={() => {
                                setDraggingId(null);
                                setDragOverStage(null);
                              }}
                              className={cn(
                                "group relative rounded-md p-3 cursor-grab active:cursor-grabbing border card-interactive-premium transition-all duration-300 overflow-hidden bg-gradient-to-br focus-within:ring-2 focus-within:ring-brand/40 focus-within:ring-offset-1 focus-within:ring-offset-background",
                                stage.cardBg,
                                draggingId === String(lead.id)
                                  ? "border-brand/60 opacity-40 shadow-xl shadow-brand/10 scale-95"
                                  : "border-input hover:border-brand/20 hover:shadow-lg hover:shadow-brand/5",
                              )}
                            >
                              {/* Attempts-based left urgency strip */}
                              <div
                                className={cn(
                                  "absolute left-0 top-0 bottom-0 w-0.5 rounded-l-md",
                                  attemptsUrgencyClass(lead.attempts),
                                )}
                                aria-hidden
                              />
                              <Card className="border-none bg-transparent shadow-none p-0 text-left rounded-none">
                                <CardHeader className="p-0 pb-1 flex flex-row items-center justify-between space-y-0 gap-1">
                                  <GripVertical
                                    className="wl-pipeline-card-grip w-3 h-3 shrink-0 text-ink/30"
                                    aria-hidden
                                  />
                                  <CardTitle className="text-[12px] font-semibold text-ink truncate flex items-center gap-1.5 leading-none flex-1 min-w-0">
                                    {lead.customerName || "(no name)"}
                                    {lead.demo && (
                                      <Badge
                                        variant="outline"
                                        className="wl-label px-1.5 py-0.5 rounded-md bg-brand/10 border border-dashed border-brand/40 text-brand-deep leading-none shrink-0"
                                        title="Seeded showcase record — not a real lead"
                                      >
                                        Demo
                                      </Badge>
                                    )}
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0 wl-micro-meta--muted-foreground leading-normal">
                                  <div className="flex items-center gap-2 mt-1 wl-micro-meta--muted">
                                    {lead.customerNumber && (
                                      <span className="inline-flex items-center gap-1 truncate">
                                        <Phone className="w-3 h-3" />
                                        {lead.customerNumber}
                                      </span>
                                    )}
                                    {lead.email && (
                                      <span className="inline-flex items-center gap-1 truncate">
                                        <Mail className="w-3 h-3" />
                                        <span className="truncate max-w-[120px]">{lead.email}</span>
                                      </span>
                                    )}
                                  </div>
                                  {lead.campaignSource && (
                                    <Badge
                                      variant="secondary"
                                      className="wl-label text-brand mt-1.5 border-brand/20 bg-brand/10 hover:bg-brand/15"
                                    >
                                      {lead.campaignSource}
                                    </Badge>
                                  )}
                                  {lead.lastContactSummary && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <p className="wl-micro-meta mt-2 line-clamp-2 leading-snug cursor-help text-left">
                                            {lead.lastContactSummary}
                                          </p>
                                        </TooltipTrigger>
                                        <TooltipContent className="bg-popover border border-input p-2.5 max-w-xs text-xs text-ink rounded-md shadow-xl">
                                          {lead.lastContactSummary}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                  <div className="flex items-center justify-between mt-2">
                                    <span className="wl-micro-meta">
                                      {lead.attempts ?? 0} attempt
                                      {(lead.attempts ?? 0) === 1 ? "" : "s"}
                                    </span>
                                    <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                                      {STAGES.filter((s) => s.id !== stage.id)
                                        .slice(0, 3)
                                        .map((s) => (
                                          <ShadButton
                                            key={s.id}
                                            onClick={() => moveLead(lead.id, s.id)}
                                            variant="outline"
                                            className="wl-label px-1.5 py-0.5 rounded border border-input text-muted hover:text-ink hover:border-brand/30 transition-colors h-auto focus-visible:opacity-100"
                                            title={`Move to ${s.label}`}
                                            aria-label={`Move ${lead.customerName || "lead"} to ${s.label}`}
                                          >
                                            → {s.label}
                                          </ShadButton>
                                        ))}
                                      <ChevronRight className="w-3 h-3 text-ink/40" />
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            </motion.div>
                          ))}
                        </div>
                      </Panel>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </PageShell>
      )}
    </ClientRouteViewport>
  );
}
