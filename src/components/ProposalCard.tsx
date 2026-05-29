/**
 * ProposalCard — the approval card used everywhere a chat surface proposes a
 * live action the operator must confirm before it fires.
 *
 * Shared by AgentWorkspace (per-agent config changes, capability toggles,
 * call/email/text actions) and DirectorWorkspace (account-level call/email/text
 * actions routed through the relevant agent). Nothing here executes anything —
 * it renders the proposal, an optional TCPA consent tick for calls, a live
 * progress bar while the parent runs it, and a resolved (done/dismissed) state.
 */
import React from "react";
import { motion } from "motion/react";
import { Check, X, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

export interface ProposalCardProps {
  icon: React.ReactNode;
  tone: "brand" | "emerald" | "amber";
  title: string;
  detail?: string;
  state?: "done" | "dismissed";
  busy: boolean;
  busyLabel?: string;
  approveLabel: string;
  consent?: { checked: boolean; onChange: (v: boolean) => void };
  onApprove: () => void;
  onDismiss: () => void;
}

const TONE_CLASSES: Record<ProposalCardProps["tone"], string> = {
  brand: "border-brand/25 bg-brand/[0.04]",
  emerald: "border-emerald-500/25 bg-emerald-500/[0.04]",
  amber: "border-amber-500/30 bg-amber-500/[0.05]",
};

export default function ProposalCard({
  icon,
  tone,
  title,
  detail,
  state,
  busy,
  busyLabel,
  approveLabel,
  consent,
  onApprove,
  onDismiss,
}: ProposalCardProps) {
  const approveDisabled = busy || (!!consent && !consent.checked);
  return (
    <motion.div
      layout
      animate={
        state ? { scale: 0.98, opacity: state === "dismissed" ? 0.5 : 1 } : { scale: 1, opacity: 1 }
      }
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "rounded-xl border px-3 py-2.5 text-ink transition-colors",
        state === "dismissed" ? "border-black/8 bg-black/3" : TONE_CLASSES[tone],
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-ink/70">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium leading-snug">{title}</p>
          {detail && (
            <p className="mt-0.5 text-[11px] text-muted whitespace-pre-wrap break-words leading-relaxed">
              {detail}
            </p>
          )}
        </div>
      </div>
      {/* Live execution progress bar */}
      {busy && (
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          className="mt-2 h-0.5 rounded-full bg-brand/20 overflow-hidden origin-left"
        >
          <motion.div
            className="h-full bg-brand rounded-full"
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            style={{ width: "40%" }}
          />
        </motion.div>
      )}
      {state ? (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "mt-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em]",
            state === "done" ? "text-emerald-600" : "text-muted/70",
          )}
        >
          {state === "done" ? (
            <>
              <Check className="w-3 h-3" />
              <span>Successfully executed</span>
            </>
          ) : (
            <span>Dismissed</span>
          )}
        </motion.div>
      ) : (
        <>
          {consent && (
            <label className="mt-2.5 flex items-start gap-2 text-[11px] text-muted leading-snug cursor-pointer">
              <input
                type="checkbox"
                checked={consent.checked}
                onChange={(e) => consent.onChange(e.target.checked)}
                className="mt-0.5 accent-brand"
              />
              <span>
                I confirm we have prior express written consent to call this number (TCPA).
              </span>
            </label>
          )}
          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={onApprove}
              disabled={approveDisabled}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand text-on-brand text-[11px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {busy ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {busyLabel || "Executing…"}
                </>
              ) : (
                <>
                  <Check className="w-3 h-3" />
                  {approveLabel}
                </>
              )}
            </button>
            <button
              onClick={onDismiss}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-muted hover:text-ink hover:bg-black/5 transition-colors disabled:opacity-40"
            >
              <X className="w-3 h-3" />
              Dismiss
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
