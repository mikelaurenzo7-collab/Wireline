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
  MessageSquare,
  FileText,
  Users,
  Hash,
  Link,
  Receipt,
  Package,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx } from "clsx";
import { authFetch } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";
import { InlineEmpty } from "../ui/InlineEmpty";
import type { ActionType } from "../../lib/action-types";

interface ActionItem {
  id: string;
  type: ActionType;
  priority: "high" | "medium" | "low";
  status: "pending" | "completed" | "failed";
  description: string;
  created_at: string;
  payload?: any;
  reasoning?: string;
}

const ACTION_DISPLAY_CONFIG: Record<ActionType, { icon: React.ElementType; styles: string }> = {
  send_email: { icon: Mail, styles: "bg-brand/10 border-brand/20 text-brand" },
  send_text_message: {
    icon: MessageSquare,
    styles: "bg-violet-500/10 border-violet-500/20 text-violet-600",
  },
  schedule_calendar: { icon: Calendar, styles: "bg-brand-2/10 border-brand-2/20 text-brand-2" },
  update_crm_lead: {
    icon: UserPlus,
    styles: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
  },
  create_internal_task: { icon: ListTodo, styles: "bg-muted/10 border-muted/20 text-muted" },
  send_contract: { icon: FileText, styles: "bg-amber-500/10 border-amber-500/20 text-amber-600" },
  prospect_leads: { icon: Users, styles: "bg-blue-500/10 border-blue-500/20 text-blue-600" },
  notify_slack: { icon: Hash, styles: "bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-600" },
  create_payment_link: {
    icon: Link,
    styles: "bg-indigo-500/10 border-indigo-500/20 text-indigo-600",
  },
  send_invoice: { icon: Receipt, styles: "bg-teal-500/10 border-teal-500/20 text-teal-600" },
  check_inventory: { icon: Package, styles: "bg-slate-500/10 border-slate-500/20 text-slate-600" },
};

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
        <h3 className="wl-label flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-brand" />
          Intelligence Hub
        </h3>
        <span className="text-[9px] font-mono text-ink/40 bg-black/5 px-2 py-0.5 rounded-full">
          {actions.filter((a) => a.status === "pending").length} PENDING
        </span>
      </div>

      <div className="flex-1 scroll-viewport pr-2 -mr-2 space-y-3 custom-scrollbar">
        {actions.length === 0 ? (
          <InlineEmpty
            icon={Sparkles}
            label="All clear — no manual intervention required."
            className="h-64"
          />
        ) : (
          actions.map((action) => {
            const isExpanded = expandedId === action.id;
            const isProcessing = processingId === action.id;

            const displayConfig = ACTION_DISPLAY_CONFIG[action.type] || {
              icon: AlertCircle,
              styles: "bg-muted/10 border-muted/20 text-muted",
            };
            const Icon = displayConfig.icon;

            return (
              <motion.div
                layout
                key={action.id}
                className={clsx(
                  "relative group rounded-2xl border transition-all duration-300 overflow-hidden",
                  action.status === "pending"
                    ? "wl-panel hover:border-brand/30"
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
                          displayConfig.styles,
                        )}
                      >
                        <Icon className="w-4.5 h-4.5" />
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
                          <span className="text-[9px] text-ink/40 font-mono">
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
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                      ) : action.status === "pending" ? (
                        <div className="flex items-center gap-1">
                          {isProcessing ? (
                            <Clock className="w-4 h-4 text-brand animate-spin" />
                          ) : (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => handleReject(action.id, e)}
                                className="hit-area-44 w-7 h-7 rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 flex items-center justify-center transition-colors relative"
                                title="Reject"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => handleApprove(action.id, e)}
                                className="hit-area-44 w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 flex items-center justify-center transition-colors relative"
                                title="Approve"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-ink/40" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-ink/40" />
                          )}
                        </div>
                      ) : (
                        <AlertCircle className="w-4 h-4 text-ink/40" />
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
                            <h4 className="wl-label text-brand font-bold flex items-center gap-1.5">
                              <Sparkles className="w-3 h-3" /> AI Reasoning
                            </h4>
                            <p className="text-[11px] text-ink/70 leading-relaxed italic">
                              "{action.reasoning}"
                            </p>
                          </div>
                        )}

                        {/* Payload Preview */}
                        <div className="space-y-2">
                          <h4 className="wl-label text-muted font-bold">Drafted Content</h4>
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
                            ) : action.type === "send_text_message" ? (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2 pb-2 border-bottom border-black/5">
                                  <span className="text-[10px] font-mono text-muted">TO:</span>
                                  <span className="text-[11px] font-medium text-ink">
                                    {action.payload?.to || "—"}
                                  </span>
                                </div>
                                <div className="text-[11px] text-ink/80 leading-relaxed whitespace-pre-wrap font-sans">
                                  {action.payload?.message || "No content drafted."}
                                </div>
                              </div>
                            ) : action.type === "notify_slack" ? (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2 pb-2 border-bottom border-black/5">
                                  <span className="text-[10px] font-mono text-muted">CHANNEL:</span>
                                  <span className="text-[11px] font-medium text-ink">
                                    {action.payload?.channel || "—"}
                                  </span>
                                </div>
                                <div className="text-[11px] text-ink/80 leading-relaxed whitespace-pre-wrap font-sans">
                                  {action.payload?.message || "No content drafted."}
                                </div>
                              </div>
                            ) : action.type === "update_crm_lead" ||
                              action.type === "prospect_leads" ||
                              action.type === "check_inventory" ? (
                              <div className="grid grid-cols-2 gap-3">
                                {Object.entries(action.payload || {}).map(([key, val]) => (
                                  <div key={key} className="flex flex-col gap-1">
                                    <span className="text-[9px] uppercase tracking-wider text-ink/40">
                                      {key}
                                    </span>
                                    <span className="text-[10px] font-medium text-ink truncate">
                                      {String(val)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[10px] font-mono text-ink/40 break-all">
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
                              className="hit-area-44 touch-press flex-1 h-9 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-600 text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-rose-500/10 transition-all disabled:opacity-50 relative"
                            >
                              Dismiss Action
                            </button>
                            <button
                              disabled={isProcessing}
                              onClick={(e) => handleApprove(action.id, e)}
                              className="hit-area-44 touch-press disabled:opacity-50 disabled:cursor-not-allowed flex-[2] h-9 rounded-xl brutal-btn !py-0 !text-[10px] !tracking-[0.2em] !font-bold flex items-center justify-center gap-2 relative"
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
