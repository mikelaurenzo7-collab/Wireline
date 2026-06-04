/**
 * DirectorLiveOrchestra — clever live-action choreography for Director streaming.
 * Runway progress · spotlight card · queue/cleared ticket strips · status ticker.
 */
import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Compass, Loader2, Radio } from "lucide-react";
import { cn } from "../../lib/utils";
import type { IntegrationLiveAction } from "../../lib/integration-live-scripts";
import { INTEGRATION_STYLES } from "../../lib/integration-activities";
import type { ToolIntegration } from "../../lib/agent-capabilities";
import {
  LIVE_FEED_LABELS,
  LIVE_ORCHESTRA_COPY,
  WIRELINE_DIRECTOR_BRAND,
  WL_DIRECTOR_CLASSES,
} from "../../lib/wireline-director-design";
import IntegrationLiveActionCard from "../integrations/live/IntegrationLiveActionCard";
import type { DirectorLiveStep } from "./DirectorLiveSession";

function resolveShortName(integration: IntegrationLiveAction["integration"]) {
  if (integration === "director") return "Director";
  return INTEGRATION_STYLES[integration as ToolIntegration]?.name ?? integration;
}

function RunwayNode({
  action,
  index,
  isLast,
}: {
  action: IntegrationLiveAction;
  index: number;
  isLast: boolean;
}) {
  const brand =
    action.integration === "director"
      ? WIRELINE_DIRECTOR_BRAND.violet
      : (INTEGRATION_STYLES[action.integration as ToolIntegration]?.color ??
        WIRELINE_DIRECTOR_BRAND.violet);
  const state = action.status;

  return (
    <div className="wl-live-orchestra-runway-node flex items-center min-w-0">
      <motion.div
        layout
        className={cn(
          "relative flex flex-col items-center gap-1 min-w-[3.25rem] max-w-[4.5rem]",
          state === "pending" && "opacity-45",
        )}
        data-state={state}
      >
        <div
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-500",
            state === "active" &&
              "wl-live-orchestra-node--active border-brand shadow-lg shadow-brand/25",
            state === "success" &&
              "border-[color-mix(in_srgb,var(--wl-signal)_55%,transparent)] bg-[color-mix(in_srgb,var(--wl-signal)_12%,transparent)]",
            state === "pending" && "border-border bg-card",
          )}
          style={
            state === "active"
              ? {
                  borderColor: brand,
                  boxShadow: `0 0 0 4px color-mix(in srgb, ${brand} 18%, transparent)`,
                }
              : undefined
          }
        >
          {state === "success" ? (
            <Check className="w-3.5 h-3.5 wl-text-success" />
          ) : state === "active" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: brand }} />
          ) : action.integration === "director" ? (
            <Compass className="w-3.5 h-3.5 text-brand/70" />
          ) : (
            <span className="flex [&>svg]:w-3.5 [&>svg]:h-3.5 text-brand/80">
              {INTEGRATION_STYLES[action.integration as ToolIntegration]?.icon}
            </span>
          )}
          {state === "active" && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand/50" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand" />
            </span>
          )}
        </div>
        <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-muted text-center leading-tight line-clamp-2 w-full">
          {resolveShortName(action.integration)}
        </span>
        <span className="text-[7px] font-mono text-muted/50 tabular-nums">{index + 1}</span>
      </motion.div>
      {!isLast && (
        <div
          className={cn(
            "wl-live-orchestra-connector mx-1 sm:mx-1.5 flex-1 min-w-[1.25rem] max-w-[2.5rem] h-0.5 rounded-full",
            state === "success" && "wl-live-orchestra-connector--done",
            state === "active" && "wl-live-orchestra-connector--live",
          )}
          aria-hidden
        />
      )}
    </div>
  );
}

function ActionTicket({
  action,
  tone,
}: {
  action: IntegrationLiveAction;
  tone: "queued" | "cleared";
}) {
  const brand =
    action.integration === "director"
      ? WIRELINE_DIRECTOR_BRAND.violet
      : (INTEGRATION_STYLES[action.integration as ToolIntegration]?.color ??
        WIRELINE_DIRECTOR_BRAND.violet);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92, x: tone === "cleared" ? 12 : -12 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      className={cn(
        "wl-live-orchestra-ticket shrink-0 flex items-center gap-2 rounded-full border px-2.5 py-1.5 max-w-[11rem]",
        tone === "queued" && "border-brand/20 bg-brand/[0.04]",
        tone === "cleared" &&
          "border-[color-mix(in_srgb,var(--wl-signal)_22%,transparent)] bg-[color-mix(in_srgb,var(--wl-signal)_6%,transparent)]",
      )}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: tone === "cleared" ? "var(--wl-signal)" : brand }}
      />
      <span className="text-[10px] font-medium text-ink/85 truncate">{action.title}</span>
      {tone === "cleared" && <Check className="w-2.5 h-2.5 shrink-0 wl-text-success" />}
    </motion.div>
  );
}

export interface DirectorLiveOrchestraProps {
  actions: IntegrationLiveAction[];
  liveSteps?: DirectorLiveStep[];
  className?: string;
}

export default function DirectorLiveOrchestra({
  actions,
  liveSteps = [],
  className,
}: DirectorLiveOrchestraProps) {
  const [tickerIndex, setTickerIndex] = useState(0);

  const active = actions.find((a) => a.status === "active");
  const queued = actions.filter((a) => a.status === "pending");
  const cleared = actions.filter((a) => a.status === "success");
  const isProposal = actions.some((a) => a.source === "proposal");

  const tickerLines = useMemo(() => {
    const lines: string[] = [];
    if (active) lines.push(`${resolveShortName(active.integration)} · ${active.title}`);
    for (const q of queued.slice(0, 3)) {
      lines.push(`${LIVE_ORCHESTRA_COPY.queuedPrefix} ${q.title}`);
    }
    if (cleared.length > 0) {
      lines.push(LIVE_ORCHESTRA_COPY.clearedSummary(cleared.length));
    }
    return lines.length > 0 ? lines : [LIVE_ORCHESTRA_COPY.armSequence];
  }, [active, queued, cleared.length]);

  useEffect(() => {
    if (tickerLines.length <= 1) return;
    const id = window.setInterval(() => {
      setTickerIndex((i) => (i + 1) % tickerLines.length);
    }, 2800);
    return () => window.clearInterval(id);
  }, [tickerLines.length]);

  const activeLiveStep = liveSteps.find((s) => s.status === "active");

  if (actions.length === 0) return null;

  return (
    <div className={cn("wl-live-orchestra relative", className)} aria-live="polite">
      <div className="flex items-start justify-between gap-3 mb-3 px-0.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand/45" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
            </span>
            <span className={cn("wl-label text-brand/80", WL_DIRECTOR_CLASSES.liveFeedHeader)}>
              {isProposal ? LIVE_FEED_LABELS.proposal : LIVE_ORCHESTRA_COPY.eyebrow}
            </span>
          </div>
          <div className="h-5 mt-1 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p
                key={tickerLines[tickerIndex]}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.28 }}
                className="text-[11px] text-ink/75 font-medium truncate"
              >
                {tickerLines[tickerIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[9px] font-mono text-muted/60 tabular-nums">
            <span className="text-brand font-semibold">{cleared.length}</span>/{actions.length}
          </p>
          <p className="text-[8px] uppercase tracking-[0.14em] text-muted/50 mt-0.5">
            {active ? LIVE_ORCHESTRA_COPY.liveNow : isProposal ? "Staged" : "Runway"}
          </p>
        </div>
      </div>

      {isProposal && (
        <p className="mb-3 text-[10px] text-muted/70 italic px-0.5 border-l-2 border-brand/25 pl-2.5">
          {LIVE_FEED_LABELS.proposalHint}
        </p>
      )}

      <div className="wl-live-orchestra-runway mb-4 overflow-x-auto scroll-viewport pb-1 -mx-1 px-1">
        <div className="flex items-center min-w-max py-1">
          {actions.map((action, i) => (
            <RunwayNode
              key={action.id}
              action={action}
              index={i}
              isLast={i === actions.length - 1}
            />
          ))}
        </div>
      </div>

      {activeLiveStep && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mb-3 flex items-center gap-2 rounded-md border border-brand/12 bg-brand/[0.04] px-2.5 py-2"
        >
          <Radio className="w-3 h-3 text-brand shrink-0 animate-pulse" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-ink leading-tight">
              {activeLiveStep.title}
            </p>
            <p className="text-[9px] text-muted/70 truncate">{activeLiveStep.subtitle}</p>
          </div>
        </motion.div>
      )}

      <div className="wl-live-orchestra-spotlight relative">
        <div className="flex items-center justify-between mb-2 px-0.5">
          <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-brand/80">
            {active
              ? LIVE_ORCHESTRA_COPY.spotlightLive
              : cleared.length > 0
                ? LIVE_ORCHESTRA_COPY.spotlightLast
                : LIVE_ORCHESTRA_COPY.spotlightNext}
          </span>
          {active && (
            <span className="inline-flex items-center gap-1 text-[8px] uppercase tracking-[0.16em] text-brand font-semibold">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand/50" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand" />
              </span>
              Signal
            </span>
          )}
        </div>

        <AnimatePresence mode="wait">
          {active ? (
            <motion.div
              key={active.id}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="wl-live-orchestra-spotlight-card"
            >
              <IntegrationLiveActionCard action={active} index={0} variant="spotlight" />
            </motion.div>
          ) : queued[0] ? (
            <motion.div
              key={`next-${queued[0].id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-md border border-dashed border-brand/25 bg-brand/[0.03] px-4 py-6 text-center"
            >
              <p className="text-[11px] font-semibold text-ink/80">{LIVE_ORCHESTRA_COPY.armNext}</p>
              <p className="text-[10px] text-muted/70 mt-1">{queued[0].title}</p>
            </motion.div>
          ) : cleared.length > 0 ? (
            <motion.div
              key={`done-${cleared[cleared.length - 1].id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="opacity-90"
            >
              <IntegrationLiveActionCard
                action={cleared[cleared.length - 1]}
                index={0}
                variant="spotlight"
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {(queued.length > 1 || cleared.length > 0) && (
        <div className="mt-4 space-y-2.5">
          {queued.length > 1 && (
            <div>
              <p className="wl-label text-muted/60 mb-1.5 px-0.5">
                {LIVE_ORCHESTRA_COPY.queueLabel}
              </p>
              <div className="flex gap-2 overflow-x-auto scroll-viewport pb-0.5">
                {queued.slice(active ? 0 : 1).map((a) => (
                  <ActionTicket key={a.id} action={a} tone="queued" />
                ))}
              </div>
            </div>
          )}
          {cleared.length > 0 && (
            <div>
              <p className="wl-label text-muted/60 mb-1.5 px-0.5">
                {LIVE_ORCHESTRA_COPY.clearedLabel}
              </p>
              <div className="flex gap-2 overflow-x-auto scroll-viewport pb-0.5 flex-row-reverse justify-end">
                {cleared.map((a) => (
                  <ActionTicket key={a.id} action={a} tone="cleared" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
