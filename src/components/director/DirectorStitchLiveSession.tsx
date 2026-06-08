/**
 * Live panel while Director renders UI via non-streaming POST.
 */
import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { LayoutTemplate, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import { WL_DIRECTOR_CLASSES, WIRELINE_STITCH_UI } from "../../lib/wireline-director-design";

export interface DirectorStitchLiveSessionProps {
  operatorPrompt?: string;
  className?: string;
  /** Studio = multi-pass LLM pipeline (~5 min). Pixel = Google Stitch render (slow). */
  variant?: "studio" | "pixel";
}

export default function DirectorStitchLiveSession({
  operatorPrompt,
  className,
  variant = "studio",
}: DirectorStitchLiveSessionProps) {
  const phases =
    variant === "pixel" ? WIRELINE_STITCH_UI.loadingPhases : WIRELINE_STITCH_UI.studioLoadingPhases;
  const loadingHint =
    variant === "pixel" ? WIRELINE_STITCH_UI.loadingHint : WIRELINE_STITCH_UI.studioLoadingHint;
  const phaseIntervalMs =
    variant === "pixel" ? 18_000 : (WIRELINE_STITCH_UI.studioLoadingPhaseIntervalMs ?? 28_000);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const phaseTimer = window.setInterval(() => {
      setPhaseIndex((i) => Math.min(i + 1, phases.length - 1));
    }, phaseIntervalMs);
    const clock = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => {
      window.clearInterval(phaseTimer);
      window.clearInterval(clock);
    };
  }, [phaseIntervalMs, phases.length]);

  const phase = phases[phaseIndex] ?? phases[0]!;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("w-full wl-stitch-live-session", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-brand/14 to-brand-deep/10 border border-brand/25">
          <Sparkles className="w-3.5 h-3.5 text-brand animate-pulse" />
          <span className={cn(WL_DIRECTOR_CLASSES.microLabel, "text-brand font-bold")}>
            {WIRELINE_STITCH_UI.badgeLabel}
          </span>
        </span>
        <span className="wl-micro-badge font-mono text-muted/70 tabular-nums">{elapsedSec}s</span>
      </div>

      <div className="wl-stitch-device wl-stitch-device--mobile mx-auto wl-stitch-live-shimmer">
        <div className="wl-stitch-device-chrome">
          <span className="wl-stitch-device-dot" />
          <span className="wl-stitch-device-dot wl-stitch-device-dot--mid" />
          <span className="wl-stitch-device-dot wl-stitch-device-dot--dim" />
          <span className="wl-stitch-device-url">{WIRELINE_STITCH_UI.deviceChromeLabel}</span>
        </div>
        <div className="wl-stitch-device-screen min-h-[300px] flex flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="relative">
            <LayoutTemplate className="w-10 h-10 text-brand/35" />
            <span className="absolute -inset-3 rounded-full border border-brand/20 animate-ping" />
          </div>
          <p className="text-[12px] font-semibold text-ink/90">{phase}</p>
          <p className="wl-micro-meta--muted max-w-[240px] leading-relaxed">{loadingHint}</p>
          {operatorPrompt && (
            <p className="wl-micro-meta text-brand/70 line-clamp-2 max-w-[260px] italic">
              “{operatorPrompt}”
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
