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
}

export function LiveTaskPipeline({ steps, className }: LiveTaskPipelineProps) {
  if (steps.length === 0) return null;

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
              {step.status === "done" && <Check className="w-3.5 h-3.5 text-emerald-500" />}
              {step.status === "active" && (
                <Loader2 className="w-3.5 h-3.5 text-brand animate-spin" />
              )}
              {step.status === "pending" && <Circle className="w-2.5 h-2.5 text-muted/40" />}
            </span>

            {/* Label */}
            <span
              className={cn(
                "text-[11px] leading-tight",
                step.status === "done" && "text-muted/70",
                step.status === "active" && "text-ink font-medium",
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
              <span className="ml-auto text-[9px] font-mono text-muted/50 tabular-nums">
                {(step.elapsedMs / 1000).toFixed(1)}s
              </span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
