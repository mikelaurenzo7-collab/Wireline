/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState } from "react";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Mail,
  Calendar,
  UserPlus,
  ListTodo,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx } from "clsx";
import { authFetch } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";

interface ActionItem {
  id: string;
  type: "send_email" | "schedule_calendar" | "update_crm_lead" | "create_internal_task";
  priority: "high" | "medium" | "low";
  status: "pending" | "completed" | "failed";
  description: string;
  created_at: string;
  payload?: any;
  reasoning?: string;
}

export function ActionFeed({
  actions,
  onRefresh,
}: {
  actions: ActionItem[];
  onRefresh?: () => void;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleApprove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessingId(id);
    try {
      const res = await authFetch(`/api/fleet/tasks/${id}/approve`, { method: "POST" });
      if (res.ok) {
        toastSuccess("Action executed", "The autonomous task has been completed successfully.");
        onRefresh?.();
      } else {
        const d = await res.json();
        throw new Error(d.error || "Execution failed");
      }
    } catch (err: any) {
      toastError("Approval failed", err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessingId(id);
    try {
      const res = await authFetch(`/api/fleet/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled", resolution_notes: "Rejected by operator" }),
      });
      if (res.ok) {
        toastSuccess("Action rejected", "The task has been removed from the queue.");
        onRefresh?.();
      } else {
        throw new Error("Rejection failed");
      }
    } catch (err: any) {
      toastError("Error", err.message);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <h3 className="app-section-title flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-brand" />
          Intelligence Hub
        </h3>
        <span className="text-[9px] font-mono text-muted/70 bg-black/5 px-2 py-0.5 rounded-full">
          {actions.filter((a) => a.status === "pending").length} PENDING
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-3 custom-scrollbar">
        {actions.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3 text-center border border-dashed border-black/8 rounded-[2rem] bg-black/[0.01] relative overflow-hidden">
            <div className="relative">
              <span
                aria-hidden
                className="absolute inset-0 -z-10 rounded-full bg-brand/30 blur-2xl scale-150"
              />
              <motion.div
                aria-hidden
                animate={{ scale: [1, 1.18, 1], opacity: [0.25, 0.5, 0.25] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="absolute inset-0 bg-brand/25 rounded-2xl -z-10"
              />
              <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/25 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-brand/70">
                Fleet synchronized
              </p>
              <p className="font-display italic text-lg text-ink leading-tight">All clear</p>
              <p className="text-[11px] text-muted max-w-[200px] leading-relaxed mx-auto">
                Autonomous agents are monitoring signals. No manual intervention required.
              </p>
            </div>
          </div>
        ) : (
          actions.map((action) => {
            const isExpanded = expandedId === action.id;
            const isProcessing = processingId === action.id;

            return (
              <motion.div
                layout
                key={action.id}
                className={clsx(
                  "relative group rounded-2xl border transition-all duration-300 overflow-hidden",
                  action.status === "pending"
                    ? "bg-white/40 border-black/8 hover:border-brand/30 hover:bg-white/60"
                    : "bg-black/[0.02] border-black/4 opacity-60",
                  isExpanded && "border-brand/40 bg-white/80 ring-1 ring-brand/10 shadow-lg",
                )}
                onClick={() => setExpandedId(isExpanded ? null : action.id)}
              >
                {/* Status indicator bar */}
                <div
                  className={clsx(
                    "absolute left-0 top-0 bottom-0 w-1",
                    action.priority === "high"
                      ? "bg-rose-500"
                      : action.priority === "medium"
                        ? "bg-brand"
                        : "bg-muted/30",
                  )}
                />

                <div className="p-4 pl-5 cursor-pointer">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={clsx(
                          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-all",
                          action.type === "send_email" && "bg-brand/10 border-brand/20 text-brand",
                          action.type === "schedule_calendar" &&
                            "bg-brand-2/10 border-brand-2/20 text-brand-2",
                          action.type === "create_internal_task" &&
                            "bg-muted/10 border-muted/20 text-muted",
                        )}
                        style={action.type === "update_crm_lead" ? { background: "rgba(16,185,129,0.10)", borderColor: "rgba(16,185,129,0.20)", color: "#059669" } : undefined}
                      >
                        {action.type === "send_email" && <Mail className="w-4.5 h-4.5" />}
                        {action.type === "schedule_calendar" && (
                          <Calendar className="w-4.5 h-4.5" />
                        )}
                        {action.type === "update_crm_lead" && <UserPlus className="w-4.5 h-4.5" />}
                        {action.type === "create_internal_task" && (
                          <ListTodo className="w-4.5 h-4.5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate leading-snug">
                          {action.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={clsx(
                              "text-[8px] uppercase tracking-[0.2em] font-bold px-1.5 py-0.5 rounded-full border",
                              action.priority === "high"
                                ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                                : "bg-black/5 text-muted border-black/10",
                            )}
                          >
                            {action.priority}
                          </span>
                          <span className="text-[9px] text-muted/70 font-mono">
                            {new Date(action.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {action.status === "completed" ? (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(16,185,129,0.20)" }}>
                          <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#059669" }} />
                        </div>
                      ) : action.status === "pending" ? (
                        <div className="flex items-center gap-1">
                          {isProcessing ? (
                            <Clock className="w-4 h-4 text-brand animate-spin" />
                          ) : (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => handleReject(action.id, e)}
                                className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 flex items-center justify-center transition-colors"
                                title="Reject"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => handleApprove(action.id, e)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                                style={{ background: "rgba(16,185,129,0.10)", color: "#059669" }}
                                title="Approve"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted/70" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted/70" />
                          )}
                        </div>
                      ) : (
                        <AlertCircle className="w-4 h-4 text-muted/70" />
                      )}
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden bg-black/[0.03] border-t border-black/5"
                    >
                      <div className="p-5 space-y-4">
                        {/* Reasoning section */}
                        {action.reasoning && (
                          <div className="space-y-1.5">
                            <h4 className="text-[9px] uppercase tracking-[0.3em] text-brand font-bold flex items-center gap-1.5">
                              <Sparkles className="w-3 h-3" /> AI Reasoning
                            </h4>
                            <p className="text-[11px] text-ink/70 leading-relaxed italic">
                              "{action.reasoning}"
                            </p>
                          </div>
                        )}

                        {/* Payload Preview */}
                        <div className="space-y-2">
                          <h4 className="text-[9px] uppercase tracking-[0.3em] text-muted font-bold">
                            Drafted Content
                          </h4>
                          <div className="rounded-xl bg-white/80 border border-black/5 p-4 overflow-hidden">
                            {action.type === "send_email" ? (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2 pb-2 border-bottom border-black/5">
                                  <span className="text-[10px] font-mono text-muted">TO:</span>
                                  <span className="text-[11px] font-medium text-ink">
                                    {action.payload?.to || "—"}
                                  </span>
                                </div>
                                <div className="text-[11px] text-ink/80 leading-relaxed whitespace-pre-wrap font-sans">
                                  {action.payload?.body || "No content drafted."}
                                </div>
                              </div>
                            ) : action.type === "update_crm_lead" ? (
                              <div className="grid grid-cols-2 gap-3">
                                {Object.entries(action.payload || {}).map(([key, val]) => (
                                  <div key={key} className="flex flex-col gap-1">
                                    <span className="text-[9px] uppercase tracking-wider text-muted/70">
                                      {key}
                                    </span>
                                    <span className="text-[10px] font-medium text-ink truncate">
                                      {String(val)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[10px] font-mono text-muted/70 break-all">
                                {JSON.stringify(action.payload, null, 2)}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Direct action footer */}
                        {action.status === "pending" && (
                          <div className="flex items-center gap-3 pt-2">
                            <button
                              disabled={isProcessing}
                              onClick={(e) => handleReject(action.id, e)}
                              className="flex-1 h-9 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-600 text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-rose-500/10 transition-all disabled:opacity-50"
                            >
                              Dismiss Action
                            </button>
                            <button
                              disabled={isProcessing}
                              onClick={(e) => handleApprove(action.id, e)}
                              className="disabled:opacity-50 disabled:cursor-not-allowed flex-[2] h-9 rounded-xl brutal-btn !py-0 !text-[10px] !tracking-[0.2em] !font-bold flex items-center justify-center gap-2"
                            >
                              {isProcessing ? (
                                <Clock className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              Execute Now
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
