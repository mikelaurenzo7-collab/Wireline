/**
 * DirectorLiveSession — the live "mission control" panel while the Director
 * streams thinking, orchestration steps, integrations, and reply preview.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Brain, Compass, GraduationCap, Loader2, Plug, Sparkles, Zap, Check } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  WL_APP_CLASSES,
  WL_DIRECTOR_CLASSES,
  directorPhaseCopy,
  DIRECTOR_LIVE_STEP_COPY,
} from "../../lib/wireline-director-design";
import type { StreamPhase } from "../../hooks/useStreamingChat";
import { LiveTaskPipeline, type PipelineStep } from "../ui/LiveTaskPipeline";
import { LiveThinkingIndicator } from "../ui/ThinkingDisplay";
import DirectorLiveOrchestra from "./DirectorLiveOrchestra";
import type { IntegrationLiveAction } from "../../lib/integration-live-scripts";

export interface DirectorLiveStep {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  status: "pending" | "active" | "done";
}

export interface DirectorLiveSessionProps {
  phase: StreamPhase;
  isDeep: boolean;
  model?: string;
  modelDisplayLabel?: string;
  coachAgentName?: string | null;
  thinkingText: string;
  thinkingDurationMs?: number;
  replyPreview?: string;
  pipelineSteps: PipelineStep[];
  integrationActions: IntegrationLiveAction[];
  liveSteps: DirectorLiveStep[];
  className?: string;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
}

function LiveReplyPreview({ text }: { text: string }) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const preview = trimmed.length > 1200 ? `…${trimmed.slice(-1200)}` : trimmed;
  const lines = preview.split("\n").slice(-8);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative mt-3 rounded-md border border-brand/12 bg-gradient-to-b from-white/90 to-brand/[0.03] dark:from-black/30 dark:to-brand/5 overflow-hidden",
        WL_DIRECTOR_CLASSES.liveOutput,
      )}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-brand/8 bg-brand/[0.04]">
        <span className={cn(WL_DIRECTOR_CLASSES.microLabel, "text-brand/70")}>Live output</span>
        <span className="inline-flex items-center gap-1 text-[9px] text-muted font-mono tabular-nums">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand/50" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand" />
          </span>
          streaming
        </span>
      </div>
      <div className="relative max-h-36 overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white/95 dark:from-velvet/95 to-transparent z-10" />
        <pre className="px-3 py-2.5 text-[12px] leading-relaxed text-ink/85 whitespace-pre-wrap font-sans">
          {lines.join("\n")}
          <span className="inline-block w-[2px] h-[1em] ml-0.5 align-text-bottom bg-brand animate-pulse" />
        </pre>
      </div>
    </motion.div>
  );
}

function ThinkingStream({ text, isDeep }: { text: string; isDeep: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tail = text.slice(-900);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  if (!tail.trim()) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="relative mt-3 overflow-hidden rounded-md border border-brand/10 bg-black/[0.02] dark:bg-white/[0.03]"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-brand/8">
        {isDeep ? (
          <Brain className="w-3.5 h-3.5 text-brand/80" />
        ) : (
          <Sparkles className="w-3 h-3 text-brand/70" />
        )}
        <span className={cn(WL_DIRECTOR_CLASSES.microLabel, "text-muted font-medium")}>
          {isDeep ? "Deep analysis stream" : "Reasoning stream"}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="relative max-h-28 overflow-y-auto scroll-viewport px-3 py-2.5"
      >
        <div className="pointer-events-none sticky top-0 -mb-6 h-4 bg-gradient-to-b from-paper dark:from-velvet to-transparent z-10" />
        <p
          className={cn(
            WL_DIRECTOR_CLASSES.metaCaption,
            "text-muted/80 whitespace-pre-wrap font-mono",
          )}
        >
          {tail}
        </p>
      </div>
    </motion.div>
  );
}

function OrchestrationStep({ step, index }: { step: DirectorLiveStep; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35 }}
      className={cn(
        WL_DIRECTOR_CLASSES.orchestrationStep,
        "flex items-start gap-3 rounded-md border px-3 py-2.5 transition-all duration-300",
        step.status === "active" &&
          "border-brand/35 bg-brand/[0.06] shadow-[0_0_0_1px_rgba(139,63,214,0.08)]",
        step.status === "done" &&
          "border-[color-mix(in_srgb,var(--wl-signal)_25%,transparent)] bg-[color-mix(in_srgb,var(--wl-signal)_6%,var(--card))]",
        step.status === "pending" && "border-black/5 bg-white/40 dark:bg-black/20 opacity-60",
      )}
      data-status={step.status}
    >
      <div
        className={cn(
          "shrink-0 flex h-7 w-7 items-center justify-center rounded-md",
          step.status === "active" && "bg-brand/15 text-brand",
          step.status === "done" && "bg-brand/15 wl-text-success",
          step.status === "pending" && "bg-black/5 text-muted",
        )}
      >
        {step.status === "active" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : step.status === "done" ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          step.icon
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            WL_APP_CLASSES.bodyCaption,
            "font-medium leading-tight",
            step.status === "active" ? "text-ink" : "text-ink/70",
          )}
        >
          {step.title}
        </p>
        <p className={cn(WL_DIRECTOR_CLASSES.metaCaption, "mt-0.5 leading-snug")}>
          {step.subtitle}
        </p>
      </div>
      {step.status === "active" && (
        <span className="relative shrink-0 flex h-2 w-2 mt-1">
          <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-brand/50" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
        </span>
      )}
    </motion.div>
  );
}

export default function DirectorLiveSession({
  phase,
  isDeep,
  model,
  coachAgentName,
  thinkingText,
  thinkingDurationMs,
  replyPreview,
  pipelineSteps,
  integrationActions,
  liveSteps,
  className,
  modelDisplayLabel,
}: DirectorLiveSessionProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => setElapsedMs(Date.now() - start), 250);
    return () => window.clearInterval(id);
  }, []);

  const phaseCopy = useMemo(() => {
    if (phase === "idle" || phase === "error") return null;
    return directorPhaseCopy({
      phase,
      isDeep,
      coachAgentName,
    });
  }, [phase, isDeep, coachAgentName]);

  const modelLabel =
    modelDisplayLabel?.trim() ||
    (isDeep ? "Opus" : model?.includes("sonnet") ? "Sonnet" : "Director");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className={cn(
        "flex flex-col items-start w-full min-w-[280px]",
        integrationActions.length > 0 ? "max-w-[92%] sm:max-w-[88%]" : "max-w-[75%]",
        className,
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2 ml-1 w-full">
        <span className="wl-orbit" data-active="true">
          <span className="shrink-0 flex w-7 h-7 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-md shadow-brand/20">
            <Compass className="w-3.5 h-3.5" />
          </span>
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="wl-label text-muted">Director</span>
            <span
              className={cn(
                "text-[8px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-full font-semibold",
                isDeep
                  ? WL_DIRECTOR_CLASSES.opusBadge
                  : "bg-brand/10 text-brand/80 border border-brand/15",
              )}
            >
              {modelLabel}
            </span>
            <span className="text-[9px] font-mono text-muted/60 tabular-nums ml-auto">
              {formatElapsed(elapsedMs)}
              {thinkingDurationMs && phase !== "thinking" ? (
                <span className="text-brand/50">
                  {" "}
                  · thought {formatElapsed(thinkingDurationMs)}
                </span>
              ) : null}
            </span>
          </div>
        </div>
      </div>

      {/* Main live panel */}
      <div
        aria-live="polite"
        aria-busy={phase !== "done" && phase !== "idle" && phase !== "error"}
        aria-label="Director live session"
        className={cn(
          "wl-panel relative w-full rounded-md rounded-bl-md px-4 py-4 space-y-3 overflow-hidden",
          WL_DIRECTOR_CLASSES.missionPanel,
        )}
      >
        {/* Ambient shimmer */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35] director-live-shimmer"
          aria-hidden
        />

        {phaseCopy && (
          <div className="relative flex items-start gap-3" role="status">
            <div className="shrink-0 mt-0.5">
              {phase === "replying" || phase === "done" ? (
                <Zap className="w-4 h-4 text-brand animate-pulse" />
              ) : (
                <LiveThinkingIndicator elapsedMs={elapsedMs} isDeep={isDeep} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <AnimatePresence mode="wait">
                <motion.p
                  key={phaseCopy.headline}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-[13px] font-semibold text-ink tracking-[-0.01em]"
                >
                  {phaseCopy.headline}
                </motion.p>
              </AnimatePresence>
              <p className="text-[11px] text-muted/75 mt-0.5">{phaseCopy.sub}</p>
            </div>
          </div>
        )}

        {/* SSE pipeline — hide when fleet channel is showing live actions */}
        {pipelineSteps.length > 0 && integrationActions.length === 0 && (
          <div className="relative rounded-md border border-brand/8 bg-white/50 dark:bg-black/20 px-3 py-2.5">
            <LiveTaskPipeline steps={pipelineSteps} variant="timeline" />
          </div>
        )}

        {/* Fleet channel — runway, spotlight, ticket strips */}
        {integrationActions.length > 0 && (
          <DirectorLiveOrchestra
            actions={integrationActions}
            liveSteps={liveSteps}
            className={WL_DIRECTOR_CLASSES.liveOrchestra}
          />
        )}

        {/* Orchestration steps — full list when no integration runway */}
        {liveSteps.length > 0 && integrationActions.length === 0 && (
          <div className="space-y-2">
            {liveSteps.map((step, i) => (
              <OrchestrationStep key={step.id} step={step} index={i} />
            ))}
          </div>
        )}

        {/* Live thinking stream */}
        {(phase === "thinking" || (thinkingText && phase === "replying")) && (
          <ThinkingStream text={thinkingText} isDeep={isDeep} />
        )}

        {/* Live reply preview */}
        {(phase === "replying" || phase === "done") && replyPreview && (
          <LiveReplyPreview text={replyPreview} />
        )}
      </div>
    </motion.div>
  );
}

/** Build Director-themed orchestration steps for the live panel. */
export function buildDirectorLiveSteps(input: {
  hasIntegrations: boolean;
  coachAgentName?: string | null;
  fleetSize: number;
}): DirectorLiveStep[] {
  const { hasIntegrations, coachAgentName, fleetSize } = input;
  return [
    {
      id: "context",
      icon: <Compass className="w-3.5 h-3.5" />,
      title: coachAgentName
        ? DIRECTOR_LIVE_STEP_COPY.contextCoach(coachAgentName)
        : DIRECTOR_LIVE_STEP_COPY.contextFleet(fleetSize),
      subtitle: DIRECTOR_LIVE_STEP_COPY.contextSub,
      status: "pending",
    },
    {
      id: "integrations",
      icon: <Plug className="w-3.5 h-3.5" />,
      title: hasIntegrations
        ? DIRECTOR_LIVE_STEP_COPY.integrationsOn
        : DIRECTOR_LIVE_STEP_COPY.integrationsOff,
      subtitle: hasIntegrations
        ? DIRECTOR_LIVE_STEP_COPY.integrationsOnSub
        : DIRECTOR_LIVE_STEP_COPY.integrationsOffSub,
      status: "pending",
    },
    {
      id: "execute",
      icon: <Sparkles className="w-3.5 h-3.5" />,
      title: DIRECTOR_LIVE_STEP_COPY.executeTitle,
      subtitle: DIRECTOR_LIVE_STEP_COPY.executeSub,
      status: "pending",
    },
    {
      id: "compose",
      icon: coachAgentName ? (
        <GraduationCap className="w-3.5 h-3.5" />
      ) : (
        <Brain className="w-3.5 h-3.5" />
      ),
      title: coachAgentName
        ? DIRECTOR_LIVE_STEP_COPY.composeCoach
        : DIRECTOR_LIVE_STEP_COPY.composeFleet,
      subtitle: DIRECTOR_LIVE_STEP_COPY.composeSub,
      status: "pending",
    },
  ];
}

export function advanceLiveStepsForPhase(
  steps: DirectorLiveStep[],
  phase: StreamPhase,
): DirectorLiveStep[] {
  if (phase === "connecting") {
    return steps.map((s, i) => ({
      ...s,
      status: i === 0 ? "active" : "pending",
    }));
  }
  if (phase === "thinking") {
    return steps.map((s, i) => ({
      ...s,
      status: i < 2 ? "done" : i === 2 ? "active" : "pending",
    }));
  }
  if (phase === "replying") {
    return steps.map((s, i) => ({
      ...s,
      status: i < 3 ? "done" : "active",
    }));
  }
  if (phase === "done") {
    return steps.map((s) => ({ ...s, status: "done" }));
  }
  return steps;
}
