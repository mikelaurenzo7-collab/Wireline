/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Phone, Mail, ChevronRight, Loader2, RefreshCw, Kanban } from "lucide-react";
import PageShell, { Panel } from "./PageShell";
import EmptyState from "./EmptyState";
import ClientRouteViewport from "./layout/ClientRouteViewport";
import { authFetch } from "../lib/api";
import { logFetchError } from "../lib/utils";
import { useToast } from "../contexts/ToastContext";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/shadcn/Card";
import { Badge } from "./ui/shadcn/Badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./ui/shadcn/Tooltip";
import { ShadButton } from "./ui/shadcn/ShadButton";

type Stage = "cold" | "contacted" | "qualified" | "demo" | "won" | "lost";

const STAGES: { id: Stage; label: string; tint: string; help: string }[] = [
  { id: "cold", label: "Cold", tint: "#94a3b8", help: "Not contacted yet" },
  { id: "contacted", label: "Contacted", tint: "#8B3FD6", help: "Reached at least once" },
  { id: "qualified", label: "Qualified", tint: "#8B3FD6", help: "Fit confirmed" },
  { id: "demo", label: "Demo Booked", tint: "#8B3FD6", help: "Meeting on the calendar" },
  { id: "won", label: "Won", tint: "#8B3FD6", help: "Closed-won" },
  { id: "lost", label: "Lost", tint: "#f43f5e", help: "Closed-lost" },
];

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
      }
    },
    [load, toastSuccess, toastError],
  );

  const totalLeads = Object.values(counts).reduce((s, n) => s + (n || 0), 0);
  const wonCount = counts.won || 0;
  const conversionRate = totalLeads > 0 ? ((wonCount / totalLeads) * 100).toFixed(1) : "0.0";

  return (
    <ClientRouteViewport>
      <PageShell
        title=""
        eyebrow=""
        subtitle=""
        actions={
          <>
            {totalLeads > 0 && (
              <span className="hidden sm:inline-flex items-center px-3 py-2 rounded-xl glass border border-input text-[11px] uppercase tracking-[0.18em] text-muted">
                Win rate{" "}
                <span className="ml-1.5 text-brand font-semibold tabular-nums">
                  {conversionRate}%
                </span>
              </span>
            )}
            <ShadButton
              onClick={load}
              disabled={loading}
              variant="outline"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl glass border border-input text-[11px] uppercase tracking-[0.22em] text-ink/80 hover:text-ink hover:border-brand/25 transition-colors disabled:opacity-60 h-auto"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Refresh
            </ShadButton>
          </>
        }
      >
        {totalLeads === 0 && !loading && (
          <EmptyState
            icon={Kanban}
            title="No leads in the pipeline"
            description="Pipeline tracks every outbound lead through Cold → Contacted → Qualified → Demo → Won/Lost. Add leads via the Outbound tab — upload a CSV or capture them from an inbound call."
            accent="#8B3FD6"
            actions={[
              { label: "Start outbound", to: "/phone?tab=outbound", primary: true },
              { label: "Connect a webhook", to: "/integrations" },
            ]}
            className="h-full py-10"
          />
        )}
        {/* Mobile: vertical stack of columns (no horizontal scroll trap).
         *  Tablet+: horizontal kanban with scroll-snap so dragging a card
         *  between columns is still natural.
         *  Each column collapses height on mobile (max-h-72 with internal
         *  scroll) so the operator can scan every stage without scrolling
         *  through the entire app shell. */}
        {totalLeads > 0 && (
          <div className="h-full scroll-viewport md:overflow-x-auto md:overflow-y-hidden pb-1">
            <div className="flex flex-col md:flex-row gap-3 h-auto md:h-full pr-0 md:pr-3 md:snap-x md:snap-mandatory">
              {STAGES.map((stage) => {
                const leads = board[stage.id] || [];
                return (
                  <div
                    key={stage.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain");
                      if (id) moveLead(id, stage.id);
                    }}
                    // min-w-[180px] (was 200) so 6 columns + gaps fit
                    // comfortably at 1280px ThinkPad widths without the
                    // rightmost stage getting clipped at the page edge.
                    // Still scrolls horizontally on narrower laptops via
                    // the parent overflow-x-auto, just with much less
                    // chance of triggering it on the operator's main viewport.
                    className="w-full md:min-w-[180px] md:flex-1 md:snap-start flex flex-col md:h-full max-h-[70vh] md:max-h-none"
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
                          <p className="text-[11px] text-ink/40 italic px-2 py-4 text-center">
                            No leads in this stage yet.
                          </p>
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
                            onDragEnd={() => setDraggingId(null)}
                            className={`group relative rounded-xl p-3 cursor-grab active:cursor-grabbing border card-interactive-premium transition-all duration-300 overflow-hidden ${
                              draggingId === String(lead.id)
                                ? "border-brand/60 opacity-40 shadow-xl shadow-brand/10 scale-95"
                                : "border-input hover:border-brand/20 hover:shadow-lg hover:shadow-brand/5"
                            }`}
                            style={{
                              background: `linear-gradient(135deg, ${stage.tint}0f, transparent 75%)`,
                            }}
                          >
                            {/* Attempts-based left urgency strip */}
                            <div
                              className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl"
                              style={{
                                background:
                                  !lead.attempts || lead.attempts === 0
                                    ? "rgba(255,255,255,0.06)"
                                    : lead.attempts <= 2
                                      ? "#8B3FD6"
                                      : lead.attempts <= 4
                                        ? "#8B6FA8"
                                        : "#E8466A",
                              }}
                            />
                            <Card className="border-none bg-transparent shadow-none p-0 text-left rounded-none">
                              <CardHeader className="p-0 pb-1 flex flex-row items-center justify-between space-y-0">
                                <CardTitle className="text-[12px] font-semibold text-ink truncate flex items-center gap-1.5 leading-none">
                                  {lead.customerName || "(no name)"}
                                  {lead.demo && (
                                    <Badge
                                      variant="outline"
                                      className="text-[8px] uppercase tracking-[0.32em] px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-dashed border-amber-500/50 text-amber-700 leading-none shrink-0"
                                      title="Seeded showcase record — not a real lead"
                                    >
                                      Demo
                                    </Badge>
                                  )}
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="p-0 text-[10px] text-muted-foreground leading-normal">
                                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted/80">
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
                                    className="text-[8px] tracking-[0.24em] uppercase text-brand mt-1.5 border-brand/20 bg-brand/10 hover:bg-brand/15"
                                  >
                                    {lead.campaignSource}
                                  </Badge>
                                )}
                                {lead.lastContactSummary && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <p className="text-[10px] text-ink/40 mt-2 line-clamp-2 leading-snug cursor-help text-left">
                                          {lead.lastContactSummary}
                                        </p>
                                      </TooltipTrigger>
                                      <TooltipContent className="bg-popover border border-input p-2.5 max-w-xs text-xs text-ink rounded-lg shadow-xl">
                                        {lead.lastContactSummary}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                <div className="flex items-center justify-between mt-2">
                                  <span className="text-[9px] text-ink/40">
                                    {lead.attempts ?? 0} attempt
                                    {(lead.attempts ?? 0) === 1 ? "" : "s"}
                                  </span>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {STAGES.filter((s) => s.id !== stage.id)
                                      .slice(0, 3)
                                      .map((s) => (
                                        <ShadButton
                                          key={s.id}
                                          onClick={() => moveLead(lead.id, s.id)}
                                          variant="outline"
                                          className="text-[8px] uppercase tracking-[0.2em] px-1.5 py-0.5 rounded border border-input text-muted hover:text-ink hover:border-white/30 transition-colors h-auto"
                                          title={`Move to ${s.label}`}
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
    </ClientRouteViewport>
  );
}
