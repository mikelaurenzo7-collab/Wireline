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
import { cn } from "../../lib/utils";
import { authFetch } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";
import { EmptyState } from "../ui/EmptyState";
import { ShadButton } from "../ui/shadcn/ShadButton";
import type { ActionType } from "../../lib/action-types";
import { OPS_COPY, OPS_CHANNEL_EMPTY, WL_OPS_CLASSES } from "../../lib/wireline-ops-design";
import { WL_APP_CLASSES, WL_DIRECTOR_CLASSES } from "../../lib/wireline-director-design";

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
  send_text_message: { icon: MessageSquare, styles: "bg-brand/10 border-brand/20 text-brand" },
  schedule_calendar: { icon: Calendar, styles: "bg-brand/10 border-brand/20 text-brand" },
  update_crm_lead: { icon: UserPlus, styles: "bg-brand/10 border-brand/20 text-brand" },
  create_internal_task: { icon: ListTodo, styles: "bg-muted/10 border-muted/20 text-muted" },
  send_contract: { icon: FileText, styles: "bg-brand/10 border-brand/20 text-brand" },
  prospect_leads: { icon: Users, styles: "bg-brand/10 border-brand/20 text-brand" },
  notify_slack: { icon: Hash, styles: "bg-brand/10 border-brand/20 text-brand" },
  create_payment_link: { icon: Link, styles: "bg-brand/10 border-brand/20 text-brand" },
  send_invoice: { icon: Receipt, styles: "bg-brand/10 border-brand/20 text-brand" },
  check_inventory: { icon: Package, styles: "bg-muted/10 border-muted/20 text-muted" },
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
        <h3 className="wl-label">{OPS_COPY.intelHub}</h3>
        <span className="wl-ops-score-badge">
          {actions.filter((a) => a.status === "pending").length} pending
        </span>
      </div>

      <div className="flex-1 scroll-viewport pr-2 -mr-2 space-y-3 custom-scrollbar">
        {actions.length === 0 ? (
          <div className="min-h-[220px] flex items-center justify-center wl-panel rounded-md">
            <EmptyState
              icon={Sparkles}
              eyebrow={OPS_CHANNEL_EMPTY.intel.eyebrow}
              title={OPS_CHANNEL_EMPTY.intel.title}
              description={OPS_CHANNEL_EMPTY.intel.description}
              actions={[...OPS_CHANNEL_EMPTY.intel.actions]}
              density="compact"
              withHalo={false}
              className="py-6"
            />
          </div>
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
                  "relative group rounded-md border transition-all duration-300 overflow-hidden",
                  action.status === "pending"
                    ? "wl-panel hover:border-brand/30"
                    : "bg-black/[0.02] border-black/4 opacity-60",
                  isExpanded && "border-brand/40 bg-paper/90 ring-1 ring-brand/10 shadow-lg",
                )}
              >
                <div
                  className={clsx(
                    "absolute left-0 top-0 bottom-0 w-1",
                    action.priority === "high"
                      ? "bg-destructive"
                      : action.priority === "medium"
                        ? "bg-brand"
                        : "bg-muted/30",
                  )}
                />

                <div className="p-4 pl-5">
                  <div className="flex items-start justify-between gap-4">
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : action.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedId(isExpanded ? null : action.id);
                        }
                      }}
                    >
                      <div
                        className={clsx(
                          "w-9 h-9 rounded-md flex items-center justify-center shrink-0 border transition-all",
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
                              "wl-label font-bold px-1.5 py-0.5 rounded-full border",
                              action.priority === "high"
                                ? "bg-destructive/10 text-destructive border-destructive/20"
                                : "bg-black/5 text-muted border-black/10",
                            )}
                          >
                            {action.priority}
                          </span>
                          <span className="text-[11px] text-ink/55 font-mono tabular-nums">
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
                        <div className="w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center">
                          <CheckCircle2 className="w-3.5 h-3.5 text-brand" />
                        </div>
                      ) : action.status === "pending" ? (
                        <div className="flex items-center gap-1">
                          {isProcessing ? (
                            <Clock className="w-4 h-4 text-brand animate-spin" />
                          ) : (
                            <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                              <ShadButton
                                type="button"
                                variant="ghost"
                                size="icon"
                                disableAnimations
                                onClick={(e) => handleReject(action.id, e)}
                                className="hit-area-44 min-h-7 w-7 rounded-md text-destructive hover:bg-destructive/10 touch-press hover:scale-[1.02]"
                                title="Reject"
                              >
                                <X className="w-3.5 h-3.5" />
                              </ShadButton>
                              <ShadButton
                                type="button"
                                variant="ghost"
                                size="icon"
                                disableAnimations
                                onClick={(e) => handleApprove(action.id, e)}
                                className="hit-area-44 min-h-7 w-7 rounded-md text-brand hover:bg-brand/10 touch-press hover:scale-[1.02]"
                                title="Approve"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </ShadButton>
                            </div>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-ink/55" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-ink/55" />
                          )}
                        </div>
                      ) : (
                        <AlertCircle className="w-4 h-4 text-ink/55" />
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
                        {action.reasoning && (
                          <div className="space-y-1.5">
                            <h4 className="wl-label text-brand font-bold">AI Reasoning</h4>
                            <p className={cn(WL_APP_CLASSES.bodyCaption, "text-ink/70 italic")}>
                              "{action.reasoning}"
                            </p>
                          </div>
                        )}

                        <div className="space-y-2">
                          <h4 className="wl-label text-muted font-bold">Drafted Content</h4>
                          <div className="rounded-md bg-paper/90 border border-black/5 p-4 overflow-hidden">
                            {action.type === "send_email" ? (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2 pb-2 border-bottom border-black/5">
                                  <span className="wl-label text-muted font-mono">TO:</span>
                                  <span
                                    className={cn(
                                      WL_APP_CLASSES.bodyCaption,
                                      "font-medium text-ink",
                                    )}
                                  >
                                    {action.payload?.to || "—"}
                                  </span>
                                </div>
                                <div
                                  className={cn(
                                    WL_APP_CLASSES.bodyCaption,
                                    "text-ink/80 whitespace-pre-wrap font-sans",
                                  )}
                                >
                                  {action.payload?.body || "No content drafted."}
                                </div>
                              </div>
                            ) : action.type === "send_text_message" ? (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2 pb-2 border-bottom border-black/5">
                                  <span className="wl-label text-muted font-mono">TO:</span>
                                  <span
                                    className={cn(
                                      WL_APP_CLASSES.bodyCaption,
                                      "font-medium text-ink",
                                    )}
                                  >
                                    {action.payload?.to || "—"}
                                  </span>
                                </div>
                                <div
                                  className={cn(
                                    WL_APP_CLASSES.bodyCaption,
                                    "text-ink/80 whitespace-pre-wrap font-sans",
                                  )}
                                >
                                  {action.payload?.message || "No content drafted."}
                                </div>
                              </div>
                            ) : action.type === "notify_slack" ? (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2 pb-2 border-bottom border-black/5">
                                  <span className="wl-label text-muted font-mono">CHANNEL:</span>
                                  <span
                                    className={cn(
                                      WL_APP_CLASSES.bodyCaption,
                                      "font-medium text-ink",
                                    )}
                                  >
                                    {action.payload?.channel || "—"}
                                  </span>
                                </div>
                                <div
                                  className={cn(
                                    WL_APP_CLASSES.bodyCaption,
                                    "text-ink/80 whitespace-pre-wrap font-sans",
                                  )}
                                >
                                  {action.payload?.message || "No content drafted."}
                                </div>
                              </div>
                            ) : action.type === "update_crm_lead" ||
                              action.type === "prospect_leads" ||
                              action.type === "check_inventory" ? (
                              <div className="grid grid-cols-2 gap-3">
                                {Object.entries(action.payload || {}).map(([key, val]) => (
                                  <div key={key} className="flex flex-col gap-1">
                                    <span className="wl-label text-ink/55">{key}</span>
                                    <span
                                      className={cn(
                                        WL_DIRECTOR_CLASSES.metaCaption,
                                        "font-medium text-ink truncate",
                                      )}
                                    >
                                      {String(val)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div
                                className={cn(
                                  WL_DIRECTOR_CLASSES.metaCaption,
                                  "font-mono text-ink/55 break-all",
                                )}
                              >
                                {JSON.stringify(action.payload, null, 2)}
                              </div>
                            )}
                          </div>
                        </div>

                        {action.status === "pending" && (
                          <div className="flex items-center gap-3 pt-2">
                            <ShadButton
                              type="button"
                              variant="outline"
                              disableAnimations
                              disabled={isProcessing}
                              onClick={(e) => handleReject(action.id, e)}
                              className={clsx(
                                "hit-area-44 touch-press flex-1 min-h-9 rounded-md border-destructive/20 text-destructive hover:bg-destructive/10",
                                WL_OPS_CLASSES.filterChip,
                              )}
                            >
                              Dismiss Action
                            </ShadButton>
                            <ShadButton
                              type="button"
                              variant="editorial"
                              disableAnimations
                              disabled={isProcessing}
                              onClick={(e) => handleApprove(action.id, e)}
                              className={clsx(
                                "hit-area-44 touch-press-deep flex-[2] min-h-9 rounded-md hover:scale-[1.01] hover:shadow-md hover:shadow-brand/10",
                                WL_OPS_CLASSES.filterChip,
                              )}
                            >
                              {isProcessing ? (
                                <Clock className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              Execute Now
                            </ShadButton>
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
