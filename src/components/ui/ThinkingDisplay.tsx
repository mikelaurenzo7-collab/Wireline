/**
 * ThinkingDisplay — A shared component that renders Claude's adaptive thinking
 * with a "top echelon" UX: collapsible accordion, typewriter reveal, duration
 * badge, and step-by-step breakdown.
 *
 * Used by both DirectorWorkspace and AgentWorkspace.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, ChevronDown, Brain, Clock } from "lucide-react";
import { cn } from "../../lib/utils";
import { ShadButton } from "./shadcn/ShadButton";

export interface ThinkingDisplayProps {
  /** The full reasoning text from Claude's adaptive thinking. */
  reasoning: string;
  /** Approximate thinking duration in ms (shown as badge). */
  thinkingDurationMs?: number;
  /** Whether this is a "deep" (Opus) vs "quick" (Sonnet) reasoning. */
  isDeep?: boolean;
  /** Whether to animate the reveal (true for new messages, false for loaded history). */
  animate?: boolean;
}

/** Parse reasoning into logical steps (numbered items, paragraphs, or bullet points). */
function parseReasoningSteps(text: string): string[] {
  // Try numbered list first
  const numbered = text.split(/\n(?=\d+[.)]\s)/);
  if (numbered.length > 1) return numbered.map((s) => s.trim()).filter(Boolean);

  // Try bullet points
  const bullets = text.split(/\n(?=[-•*]\s)/);
  if (bullets.length > 1) return bullets.map((s) => s.trim()).filter(Boolean);

  // Fall back to paragraph breaks
  const paragraphs = text.split(/\n\n+/);
  if (paragraphs.length > 1) return paragraphs.map((s) => s.trim()).filter(Boolean);

  // Single block
  return [text.trim()];
}

/** Generate a brief summary line from the full reasoning. */
function summarizeReasoning(text: string): string {
  const firstLine = text.split("\n")[0]?.trim() || "";
  if (firstLine.length <= 80) return firstLine;
  return firstLine.slice(0, 77) + "…";
}

export function ThinkingDisplay({
  reasoning,
  thinkingDurationMs,
  isDeep = false,
  animate = false,
}: ThinkingDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [revealedCount, setRevealedCount] = useState(animate ? 0 : Infinity);

  const steps = useMemo(() => parseReasoningSteps(reasoning), [reasoning]);
  const summary = useMemo(() => summarizeReasoning(reasoning), [reasoning]);
  const durationLabel = thinkingDurationMs
    ? thinkingDurationMs >= 1000
      ? `${(thinkingDurationMs / 1000).toFixed(1)}s`
      : `${thinkingDurationMs}ms`
    : null;

  // Typewriter reveal for steps (one step at a time with delay)
  useEffect(() => {
    if (!animate || !isExpanded) return;
    if (revealedCount >= steps.length) return;

    const timer = setTimeout(() => setRevealedCount((c) => c + 1), 120 + Math.random() * 80);
    return () => clearTimeout(timer);
  }, [animate, isExpanded, revealedCount, steps.length]);

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => {
      if (!prev && animate && revealedCount === 0) {
        setRevealedCount(1);
      }
      return !prev;
    });
  }, [animate, revealedCount]);

  const visibleSteps = animate ? steps.slice(0, revealedCount) : steps;

  return (
    <div className="mb-2 pb-2 border-b border-brand/10">
      {/* Header — clickable to expand/collapse */}
      <ShadButton
        type="button"
        disableAnimations
        variant="ghost"
        onClick={handleToggle}
        className={cn(
          "w-full h-auto justify-start gap-2 group rounded-md -mx-1 px-1 py-0.5",
          "hover:bg-brand/5 active:bg-brand/8",
        )}
      >
        {/* Icon with shimmer for deep thinking */}
        <span
          className={cn("relative flex items-center justify-center", isDeep && "animate-pulse")}
        >
          {isDeep ? (
            <Brain className="w-3.5 h-3.5 text-brand/70" />
          ) : (
            <Sparkles className="w-3 h-3 text-brand/60" />
          )}
        </span>

        {/* Label */}
        <span className="text-[9px] uppercase tracking-[0.16em] text-brand/60 font-medium">
          {isDeep ? "Deep Analysis" : "Reasoning"}
        </span>

        {/* Duration badge */}
        {durationLabel && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-brand/8 text-[8px] text-brand/70 font-mono tabular-nums">
            <Clock className="w-2.5 h-2.5" />
            {durationLabel}
          </span>
        )}

        {/* Summary (when collapsed) */}
        {!isExpanded && (
          <span className="flex-1 text-left text-[10px] text-muted/70 truncate ml-1">
            {summary}
          </span>
        )}

        {/* Expand/collapse chevron */}
        <ChevronDown
          className={cn(
            "w-3 h-3 text-muted/50 transition-transform duration-200",
            isExpanded && "rotate-180",
          )}
        />
      </ShadButton>

      {/* Expanded content — step-by-step timeline */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-2 pl-2 border-l-2 border-brand/15 space-y-1.5">
              {visibleSteps.map((step, i) => (
                <motion.div
                  key={i}
                  initial={animate ? { opacity: 0, x: -4 } : false}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: animate ? i * 0.05 : 0 }}
                  className="relative"
                >
                  {/* Timeline dot */}
                  <span
                    className={cn(
                      "absolute -left-[9px] top-1.5 w-2 h-2 rounded-full border-2",
                      i < visibleSteps.length - 1 || !animate
                        ? "border-brand/40 bg-brand/20"
                        : "border-brand bg-brand/40 animate-pulse",
                    )}
                  />
                  <p className="text-[11px] text-muted leading-relaxed pl-2">{step}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * LiveThinkingIndicator — Multi-stage animated thinking indicator.
 * Replaces the simple "Thinking…" with staged progress.
 */
export interface LiveThinkingIndicatorProps {
  /** How long the thinking has been active (ms). */
  elapsedMs?: number;
  /** Whether this is deep analysis mode. */
  isDeep?: boolean;
}

const THINKING_STAGES = [
  { label: "Analyzing", minMs: 0 },
  { label: "Reasoning", minMs: 2000 },
  { label: "Composing", minMs: 5000 },
] as const;

export function LiveThinkingIndicator({
  elapsedMs = 0,
  isDeep = false,
}: LiveThinkingIndicatorProps) {
  const [elapsed, setElapsed] = useState(elapsedMs);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 500), 500);
    return () => clearInterval(interval);
  }, []);

  const currentStage =
    THINKING_STAGES.filter((s) => elapsed >= s.minMs).pop() ?? THINKING_STAGES[0];

  return (
    <div className="flex items-center gap-2.5">
      <span className="relative flex h-2 w-2">
        <span
          className={cn(
            "animate-ping absolute inline-flex h-full w-full rounded-full",
            isDeep ? "bg-amber-500/60" : "bg-brand/60",
          )}
        />
        <span
          className={cn(
            "relative inline-flex rounded-full h-2 w-2",
            isDeep ? "bg-amber-500" : "bg-brand",
          )}
        />
      </span>
      <AnimatePresence mode="wait">
        <motion.span
          key={currentStage.label}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="text-[12px] text-muted font-medium"
        >
          {currentStage.label}…
        </motion.span>
      </AnimatePresence>
      {isDeep && (
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium">
          Deep
        </span>
      )}
    </div>
  );
}
