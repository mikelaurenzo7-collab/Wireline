/**
 * LiveTaskPipeline — Shows a multi-step task visualization for complex
 * requests that trigger sequential operations.
 *
 * Renders as a vertical timeline:
 *   ✓ Analyzed request
 *   ✓ Searched knowledge base
 *   → Generating document...
 *   ○ Formatting output
 */
import { WL_DIRECTOR_CLASSES } from "../../lib/wireline-design-system";
import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Loader2, Circle } from "lucide-react";
import { cn } from "../../lib/utils";

export type PipelineStepStatus = "done" | "active" | "pending";

export interface PipelineStep {
  id: string;
  label: string;
  status: PipelineStepStatus;
  detail?: string;
  elapsedMs?: number;
}

export interface LiveTaskPipelineProps {
  steps: PipelineStep[];
  className?: string;
  /** timeline = vertical connected rail (Director live session) */
  variant?: "default" | "timeline";
}

export function LiveTaskPipeline({ steps, className, variant = "default" }: LiveTaskPipelineProps) {
  if (steps.length === 0) return null;

  if (variant === "timeline") {
    return (
      <div className={cn("relative pl-1", className)}>
        <div
          className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-brand/30 via-brand/15 to-transparent"
          aria-hidden
        />
        <AnimatePresence>
          {steps.map((step, i) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.28, delay: i * 0.06 }}
              className="relative flex items-start gap-3 py-1.5 pl-4"
            >
              <span
                className={cn(
                  "absolute left-0 top-2.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 bg-card dark:bg-card",
                  step.status === "done" &&
                    "border-[color-mix(in_srgb,var(--wireline-signal)_50%,transparent)]",
                  step.status === "active" && "border-brand bg-brand/10",
                  step.status === "pending" && "border-white/10",
                )}
              >
                {step.status === "done" && <Check className="w-2 h-2 wl-text-success" />}
                {step.status === "active" && (
                  <Loader2 className="w-2 h-2 text-brand animate-spin" />
                )}
                {step.status === "pending" && <Circle className="w-1.5 h-1.5 text-muted/40" />}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p
                  className={cn(
                    "text-[length:var(--wireline-typography-overline-size)] leading-tight",
                    step.status === "active" && "font-semibold text-foreground",
                    step.status === "done" && "text-foreground/50",
                    step.status === "pending" && "text-muted/50",
                  )}
                >
                  {step.label}
                </p>
                {step.status === "active" && step.detail && (
                  <p className={cn(WL_DIRECTOR_CLASSES.metaCaption, "mt-0.5")}>{step.detail}</p>
                )}
              </div>
              {step.status === "active" && step.elapsedMs != null && step.elapsedMs > 800 && (
                <span className="wl-micro-badge font-mono text-muted/45 tabular-nums shrink-0">
                  {(step.elapsedMs / 1000).toFixed(1)}s
                </span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      <AnimatePresence>
        {steps.map((step, i) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: -8, height: 0 }}
            animate={{ opacity: 1, x: 0, height: "auto" }}
            exit={{ opacity: 0, x: -8, height: 0 }}
            transition={{ duration: 0.25, delay: i * 0.05 }}
            className="flex items-center gap-2 py-0.5"
          >
            {/* Status icon */}
            <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
              {step.status === "done" && <Check className="w-3.5 h-3.5 wl-text-success" />}
              {step.status === "active" && (
                <Loader2 className="w-3.5 h-3.5 text-brand animate-spin" />
              )}
              {step.status === "pending" && <Circle className="w-2.5 h-2.5 text-muted/40" />}
            </span>

            {/* Label */}
            <span
              className={cn(
                "text-[length:var(--wireline-typography-overline-size)] leading-tight",
                step.status === "done" && "text-foreground/55",
                step.status === "active" && "text-foreground font-medium",
                step.status === "pending" && "text-muted/50",
              )}
            >
              {step.label}
              {step.detail && step.status === "active" && (
                <span className="ml-1 text-muted/60">— {step.detail}</span>
              )}
            </span>

            {/* Elapsed time (only for active step) */}
            {step.status === "active" && step.elapsedMs != null && step.elapsedMs > 1000 && (
              <span className="ml-auto wl-micro-badge font-mono text-muted/50 tabular-nums">
                {(step.elapsedMs / 1000).toFixed(1)}s
              </span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
