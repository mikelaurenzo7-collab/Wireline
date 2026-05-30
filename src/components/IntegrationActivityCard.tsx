/**
 * IntegrationActivityCard — cinematic live integration visualization.
 *
 * Drop-in execution cards that appear during agent tool calls, showing
 * real-time API activity with proper semantic color coding:
 *   active  → brand purple (pulsing scan line)
 *   success → real emerald green (result expands in)
 *   waiting → muted amber
 *   pending → ghosted gray
 */
import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Loader2, Clock, ExternalLink, AlertCircle } from "lucide-react";
import { cn } from "../lib/utils";

export type IntegrationStatus = "pending" | "active" | "success" | "waiting" | "error";

export interface IntegrationActivityCardProps {
  integration: string;
  icon: React.ReactNode;
  action: string;
  status: IntegrationStatus;
  result?: string;
  link?: string;
  brandColor?: string;
}

const STATUS_STYLES = {
  pending: {
    border: "rgba(0,0,0,0.08)",
    bg: "rgba(0,0,0,0.015)",
    label: "Queued",
    labelBg: "rgba(0,0,0,0.04)",
    labelBorder: "rgba(0,0,0,0.07)",
    labelColor: "#888888",
  },
  active: {
    border: "rgba(139,63,214,0.32)",
    bg: "rgba(139,63,214,0.025)",
    label: "Running",
    labelBg: "rgba(139,63,214,0.08)",
    labelBorder: "rgba(139,63,214,0.22)",
    labelColor: "#8B3FD6",
  },
  success: {
    border: "rgba(16,185,129,0.28)",
    bg: "rgba(16,185,129,0.025)",
    label: "Done",
    labelBg: "rgba(16,185,129,0.08)",
    labelBorder: "rgba(16,185,129,0.22)",
    labelColor: "#059669",
  },
  waiting: {
    border: "rgba(245,158,11,0.28)",
    bg: "rgba(245,158,11,0.025)",
    label: "Waiting",
    labelBg: "rgba(245,158,11,0.08)",
    labelBorder: "rgba(245,158,11,0.22)",
    labelColor: "#d97706",
  },
  error: {
    border: "rgba(232,70,106,0.28)",
    bg: "rgba(232,70,106,0.025)",
    label: "Error",
    labelBg: "rgba(232,70,106,0.08)",
    labelBorder: "rgba(232,70,106,0.22)",
    labelColor: "#E8466A",
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
  const s = STATUS_STYLES[status];
  const accent = brandColor || "#8B3FD6";

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.93 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.96 }}
      transition={{ duration: 0.42, ease: [0.23, 1.0, 0.32, 1.0] }}
      style={{ borderColor: s.border, backgroundColor: s.bg }}
      className="relative overflow-hidden border rounded-xl"
    >
      {/* Active state: animated scan line at top */}
      {status === "active" && (
        <motion.div
          className="absolute inset-x-0 top-0 h-[1.5px] z-10"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${accent} 45%, transparent 100%)`,
          }}
          animate={{ x: ["-80%", "180%"] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
        />
      )}

      {/* Success state: brief green flash overlay */}
      <AnimatePresence>
        {status === "success" && (
          <motion.div
            initial={{ opacity: 0.18 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.8, delay: 0.2, ease: "easeOut" }}
            className="absolute inset-0 pointer-events-none z-10"
            style={{ background: "rgba(16,185,129,0.06)" }}
          />
        )}
      </AnimatePresence>

      <div className="px-3 py-2.5 relative z-0">
        {/* Header: integration branding + status + action */}
        <div className="flex items-start gap-2.5">
          {/* Integration icon — brand-colored pill */}
          <div
            className="shrink-0 flex w-[26px] h-[26px] items-center justify-center rounded-lg shadow-sm mt-0.5"
            style={{
              background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 75%, #000))`,
            }}
          >
            <span className="text-white text-[11px] font-bold leading-none">{icon}</span>
          </div>

          <div className="flex-1 min-w-0">
            {/* Top row: name + status badge */}
            <div className="flex items-center justify-between gap-1.5 mb-0.5">
              <span className="text-[12px] font-semibold text-ink leading-none">{integration}</span>
              <span
                className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider leading-none"
                style={{
                  background: s.labelBg,
                  border: `1px solid ${s.labelBorder}`,
                  color: s.labelColor,
                }}
              >
                {status === "active" && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                {status === "success" && <Check className="w-2.5 h-2.5" />}
                {status === "error" && <AlertCircle className="w-2.5 h-2.5" />}
                {(status === "waiting" || status === "pending") && <Clock className="w-2.5 h-2.5" />}
                {s.label}
              </span>
            </div>

            {/* Action — monospace function-call style */}
            <p
              className="text-[10px] leading-snug truncate"
              style={{
                fontFamily: "var(--font-mono, monospace)",
                color: "rgba(26,22,20,0.55)",
              }}
            >
              {action}
            </p>
          </div>
        </div>

        {/* Active: shimmer progress bar */}
        {status === "active" && (
          <div
            className="mt-2 h-[2px] rounded-full overflow-hidden"
            style={{ background: `${accent}20` }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: accent, width: "35%" }}
              animate={{ x: ["-120%", "400%"] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        )}

        {/* Result — animated expand when success */}
        <AnimatePresence>
          {result && status === "success" && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 8 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div
                className="pt-2 flex items-start gap-2"
                style={{ borderTop: "1px solid rgba(16,185,129,0.14)" }}
              >
                <p
                  className="flex-1 text-[11px] leading-relaxed"
                  style={{ color: "rgba(26,22,20,0.72)" }}
                >
                  {result}
                </p>
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium transition-opacity hover:opacity-70"
                    style={{ color: accent }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    View
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
