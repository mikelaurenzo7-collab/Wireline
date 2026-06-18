/**
 * DirectorTurnActions — the per-turn "mission log": what the Director actually
 * did (research, tools, deep-analysis routing, design renders, recoveries).
 * Renders live (running spinners) and historical (persisted) entries with the
 * LiveTaskPipeline timeline language, nested detail dropdowns, and explicit
 * rose failure states.
 */
import React, { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Brain,
  Check,
  ChevronDown,
  Globe,
  Loader2,
  Palette,
  RefreshCcw,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { DIRECTOR_TURN_LEDGER_COPY, WL_DIRECTOR_CLASSES } from "../../lib/wireline-director-design";
import { ShadButton } from "../ui/shadcn/ShadButton";

export interface TurnActionItem {
  id: string;
  kind: string;
  label: string;
  detail?: string;
  durationMs?: number;
  status: "running" | "done" | "failed";
}

const KIND_ICONS: Record<string, React.ElementType> = {
  research: Globe,
  tool: Wrench,
  deep: Brain,
  design: Palette,
  retry: RefreshCcw,
  compose: Zap,
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
}

function ActionRow({ action }: { action: TurnActionItem }) {
  const reduceMotion = useReducedMotion();
  const [detailOpen, setDetailOpen] = useState(false);
  const Icon = KIND_ICONS[action.kind] ?? Wrench;
  const failed = action.status === "failed";
  const running = action.status === "running";

  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.25 }}
      className={cn(WL_DIRECTOR_CLASSES.actionRow, failed && WL_DIRECTOR_CLASSES.actionRowFailed)}
    >
      {/* Status dot on the timeline rail */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-2 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 bg-card dark:bg-velvet",
          running && "border-brand bg-brand/10 animate-pulse",
          action.status === "done" &&
            "border-[color-mix(in_srgb,var(--wl-signal)_50%,transparent)]",
          failed && "border-rose-500/60",
        )}
      >
        {running && <Loader2 className="w-2 h-2 text-brand animate-spin" />}
        {action.status === "done" && <Check className="w-2 h-2 wl-text-success" />}
        {failed && <X className="w-2 h-2 text-rose-500" />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Icon aria-hidden className={cn("w-3 h-3 shrink-0", failed ? "" : "text-brand/60")} />
          <span
            className={cn(
              "text-[11px] leading-tight",
              running && "font-semibold text-foreground",
              action.status === "done" && "text-foreground/70",
            )}
          >
            {failed && (
              <span className="font-semibold">{DIRECTOR_TURN_LEDGER_COPY.actionFailedPrefix} </span>
            )}
            {action.label}
          </span>
          {typeof action.durationMs === "number" && !running && (
            <span className="wl-micro-badge font-mono text-muted/50 tabular-nums">
              {formatDuration(action.durationMs)}
            </span>
          )}
          {action.detail && (
            <ShadButton
              type="button"
              variant="ghost"
              size="sm"
              disableAnimations
              onClick={() => setDetailOpen((v) => !v)}
              aria-expanded={detailOpen}
              className="h-auto px-1 py-0.5 wl-micro-badge text-muted/60 hover:text-brand hover:bg-brand/5 rounded-md"
            >
              {detailOpen
                ? DIRECTOR_TURN_LEDGER_COPY.actionDetailHide
                : DIRECTOR_TURN_LEDGER_COPY.actionDetailToggle}
              <ChevronDown
                aria-hidden
                className={cn(
                  "w-2.5 h-2.5 transition-transform duration-200",
                  detailOpen && "rotate-180",
                )}
              />
            </ShadButton>
          )}
        </div>
        <AnimatePresence initial={false}>
          {action.detail && detailOpen && (
            <motion.div
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              className="overflow-hidden"
            >
              <p className={WL_DIRECTOR_CLASSES.actionDetail}>{action.detail}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

export function DirectorTurnActions({
  actions,
  className,
}: {
  actions: TurnActionItem[];
  className?: string;
}) {
  if (actions.length === 0) return null;

  return (
    <ul
      aria-live="polite"
      aria-label={DIRECTOR_TURN_LEDGER_COPY.actionsEyebrow}
      className={cn(WL_DIRECTOR_CLASSES.actionLog, "relative list-none", className)}
    >
      <span
        aria-hidden
        className="absolute left-[9px] top-3 bottom-3 w-px bg-gradient-to-b from-brand/30 via-brand/15 to-transparent"
      />
      {actions.map((action) => (
        <ActionRow key={action.id} action={action} />
      ))}
    </ul>
  );
}
