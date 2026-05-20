import React, { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Phone, Mail, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import PageShell, { Panel } from "./PageShell";
import { authFetch } from "../lib/api";
import { logFetchError } from "../lib/utils";
import { useToast } from "../contexts/ToastContext";

type Stage = "cold" | "contacted" | "qualified" | "demo" | "won" | "lost";

const STAGES: { id: Stage; label: string; tint: string; help: string }[] = [
  { id: "cold", label: "Cold", tint: "#94a3b8", help: "Not contacted yet" },
  { id: "contacted", label: "Contacted", tint: "#4F1E7B", help: "Reached at least once" },
  { id: "qualified", label: "Qualified", tint: "#4F1E7B", help: "Fit confirmed" },
  { id: "demo", label: "Demo Booked", tint: "#4F1E7B", help: "Meeting on the calendar" },
  { id: "won", label: "Won", tint: "#10B981", help: "Closed-won" },
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
    <PageShell
      eyebrow="Sales · Pipeline"
      title="Pipeline"
      subtitle={`${totalLeads} leads across the funnel · ${conversionRate}% closed-won`}
      actions={
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg glass border border-white/10 text-[11px] uppercase tracking-[0.28em] text-ink/80 hover:text-ink hover:border-white/25 transition-colors disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Refresh
        </button>
      }
    >
      {/* Mobile: vertical stack of columns (no horizontal scroll trap).
       *  Tablet+: horizontal kanban with scroll-snap so dragging a card
       *  between columns is still natural.
       *  Each column collapses height on mobile (max-h-72 with internal
       *  scroll) so the operator can scan every stage without scrolling
       *  through the entire app shell. */}
      <div className="h-full overflow-y-auto md:overflow-x-auto md:overflow-y-hidden pb-1">
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
                      <p className="text-[11px] text-muted/60 italic px-2 py-4 text-center">
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
                        className={`group rounded-xl p-3 cursor-grab active:cursor-grabbing border card-interactive-premium transition-all duration-300 ${
                          draggingId === String(lead.id)
                            ? "border-brand/60 opacity-40 shadow-xl shadow-brand/10 scale-95"
                            : "border-black/5 hover:border-brand/20 hover:shadow-lg hover:shadow-brand/5"
                        }`}
                        style={{
                          background: `linear-gradient(135deg, ${stage.tint}0f, transparent 75%)`,
                        }}
                      >
                        <p className="text-[12px] font-semibold text-ink truncate flex items-center gap-1.5">
                          {lead.customerName || "(no name)"}
                          {lead.demo && (
                            <span
                              className="text-[8px] uppercase tracking-[0.32em] px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-dashed border-amber-500/50 text-amber-700 leading-none shrink-0"
                              title="Seeded showcase record — not a real lead"
                            >
                              Demo
                            </span>
                          )}
                        </p>
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
                          <p className="text-[9px] uppercase tracking-[0.24em] text-brand/80 mt-1.5 truncate">
                            {lead.campaignSource}
                          </p>
                        )}
                        {lead.lastContactSummary && (
                          <p className="text-[10px] text-muted/70 mt-2 line-clamp-2 leading-snug">
                            {lead.lastContactSummary}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[9px] text-muted/60">
                            {lead.attempts ?? 0} attempt{(lead.attempts ?? 0) === 1 ? "" : "s"}
                          </span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {STAGES.filter((s) => s.id !== stage.id)
                              .slice(0, 3)
                              .map((s) => (
                                <button
                                  key={s.id}
                                  onClick={() => moveLead(lead.id, s.id)}
                                  title={`Move to ${s.label}`}
                                  className="text-[8px] uppercase tracking-[0.2em] px-1.5 py-0.5 rounded border border-white/10 text-muted hover:text-ink hover:border-white/30 transition-colors"
                                >
                                  → {s.label}
                                </button>
                              ))}
                            <ChevronRight className="w-3 h-3 text-muted/40" />
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </Panel>
              </div>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}
