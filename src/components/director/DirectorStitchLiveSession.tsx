/**
 * Live panel while Director renders UI (1–3 min) via non-streaming POST.
 */
import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, FileText, ImageDown, LayoutTemplate, Palette, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import { WL_DIRECTOR_CLASSES, WIRELINE_STITCH_UI } from "../../lib/wireline-director-design";

export interface DirectorStitchLiveSessionProps {
  operatorPrompt?: string;
  className?: string;
}

export default function DirectorStitchLiveSession({
  operatorPrompt,
  className,
}: DirectorStitchLiveSessionProps) {
  const phases = WIRELINE_STITCH_UI.loadingPhases;
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const phaseTimer = window.setInterval(() => {
      setPhaseIndex((i) => Math.min(i + 1, phases.length - 1));
    }, 18_000);
    const clock = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => {
      window.clearInterval(phaseTimer);
      window.clearInterval(clock);
    };
  }, [phases.length]);

  const phase = phases[phaseIndex] ?? phases[0]!;
  const steps = [
    { label: "Design brief", detail: "Extracting audience, sections, and CTA", icon: FileText },
    { label: "Brand system", detail: "Applying colors, spacing, and tone", icon: Palette },
    { label: "Stitch render", detail: "Generating the responsive screen", icon: LayoutTemplate },
    { label: "Preview assets", detail: "Packaging HTML and screenshot", icon: ImageDown },
  ];

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
        <span className="text-[10px] font-mono text-muted/70 tabular-nums">
          {elapsedSec}s · usually 3–5m
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const stepIndex = Math.min(phaseIndex, steps.length - 1);
          const done = index < stepIndex;
          const active = index === stepIndex;
          return (
            <div
              key={step.label}
              className={cn(
                "rounded-md border px-2.5 py-2 min-w-0",
                active && "border-brand/30 bg-brand/[0.06]",
                done && "border-emerald-500/20 bg-emerald-500/[0.05]",
                !active && !done && "border-brand/8 bg-white/45 dark:bg-black/20 opacity-70",
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={cn(
                    "shrink-0 flex h-5 w-5 items-center justify-center rounded-full",
                    done ? "bg-emerald-500/15 text-emerald-600" : "bg-brand/10 text-brand",
                  )}
                >
                  {done ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                </span>
                <span className="text-[10px] font-semibold text-ink truncate">{step.label}</span>
              </div>
              <p className="mt-1 text-[9px] text-muted/70 leading-snug line-clamp-2">
                {step.detail}
              </p>
            </div>
          );
        })}
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
          <p className="text-[10px] text-muted max-w-[240px] leading-relaxed">
            {WIRELINE_STITCH_UI.loadingHint}
          </p>
          {operatorPrompt && (
            <p className="text-[10px] text-brand/70 line-clamp-2 max-w-[260px] italic">
              “{operatorPrompt}”
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
