/**
 * IntegrationActivityCard — Claude-style live integration visualization
 *
 * Shows real-time integration actions as expanding grid boxes with:
 * - Integration icon/branding
 * - Action description
 * - Status indicator (active, success, waiting)
 * - Result display when complete
 *
 * Used in AgentWorkspace during live reasoning to show exactly what the
 * agent is doing with connected services (Shopify, HubSpot, Cal.com, etc.)
 */
import React from "react";
import { motion } from "motion/react";
import { Check, Loader2, Clock, ExternalLink } from "lucide-react";
import { cn } from "../lib/utils";

export type IntegrationStatus = "pending" | "active" | "success" | "waiting";

export interface IntegrationActivityCardProps {
  /** Name of the integration service (e.g., "Shopify", "HubSpot") */
  integration: string;
  /** Icon component for the integration */
  icon: React.ReactNode;
  /** What the agent is doing (e.g., "Fetching order #4821") */
  action: string;
  /** Current status */
  status: IntegrationStatus;
  /** Result/output when complete */
  result?: string;
  /** Optional link to view the integration result */
  link?: string;
  /** Custom integration brand color (hex) */
  brandColor?: string;
}

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    iconClass: "text-muted",
    borderClass: "border-black/5",
    bgClass: "bg-white/60",
    label: "Waiting",
  },
  active: {
    icon: Loader2,
    iconClass: "text-blue-500 animate-spin",
    borderClass: "border-blue-400/30",
    bgClass: "bg-blue-50/70",
    label: "Processing",
  },
  success: {
    icon: Check,
    iconClass: "text-emerald-500",
    borderClass: "border-emerald-400/30",
    bgClass: "bg-emerald-50/70",
    label: "Complete",
  },
  waiting: {
    icon: Clock,
    iconClass: "text-amber-500",
    borderClass: "border-amber-400/30",
    bgClass: "bg-amber-50/70",
    label: "Waiting",
  },
} as const;

export default function IntegrationActivityCard({
  integration,
  icon,
  action,
  status,
  result,
  link,
  brandColor,
}: IntegrationActivityCardProps) {
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{
        duration: 0.4,
        ease: [0.23, 1.0, 0.32, 1.0],
      }}
      className={cn(
        "rounded-2xl border px-4 py-3 text-xs transition-all",
        config.borderClass,
        config.bgClass,
      )}
    >
      {/* Header: Integration branding + action */}
      <div className="flex items-start gap-3 mb-2">
        {/* Integration icon with brand color accent */}
        <div
          className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-sm"
          style={{
            background: brandColor
              ? `linear-gradient(135deg, ${brandColor}, ${brandColor}dd)`
              : "linear-gradient(135deg, #6B2B99, #6B2B99)",
          }}
        >
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          {/* Integration name + status label */}
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-ink text-sm">{integration}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium uppercase tracking-wider",
                config.iconClass.includes("text-") ? config.iconClass.split(" ")[0] : "text-muted",
              )}
              style={{
                background:
                  status === "active"
                    ? "rgba(59, 130, 246, 0.08)"
                    : status === "success"
                      ? "rgba(16, 185, 129, 0.08)"
                      : status === "waiting"
                        ? "rgba(251, 191, 36, 0.08)"
                        : "rgba(0, 0, 0, 0.03)",
                border:
                  status === "active"
                    ? "1px solid rgba(59, 130, 246, 0.15)"
                    : status === "success"
                      ? "1px solid rgba(16, 185, 129, 0.15)"
                      : status === "waiting"
                        ? "1px solid rgba(251, 191, 36, 0.15)"
                        : "1px solid rgba(0, 0, 0, 0.05)",
              }}
            >
              <StatusIcon className="w-2.5 h-2.5" />
              {config.label}
            </span>
          </div>

          {/* Action description */}
          <p className="text-muted leading-tight">{action}</p>
        </div>
      </div>

      {/* Result display (when complete) */}
      {result && status === "success" && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mt-2 pt-2 border-t border-black/5"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-ink/80 leading-relaxed">{result}</p>
            </div>
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-brand hover:text-brand-deep transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                View
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </motion.div>
      )}

      {/* Progress indicator for active state */}
      {status === "active" && (
        <div className="mt-2 h-1 w-full rounded-full bg-blue-200/50 overflow-hidden">
          <motion.div
            className="h-full bg-blue-500"
            initial={{ width: "0%" }}
            animate={{ width: "75%" }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />
        </div>
      )}
    </motion.div>
  );
}
