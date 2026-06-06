/**
 * Live panel while Google Stitch renders UI (1–3 min) via non-streaming POST.
 */
import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { LayoutTemplate, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import { WL_DIRECTOR_CLASSES } from "../../lib/wireline-director-design";

const STITCH_PHASES = [
  "Connecting to Google Stitch…",
  "Composing layout & typography…",
  "Rendering mobile-first screen…",
  "Polishing colors & spacing…",
  "Packaging HTML + screenshot…",
] as const;

export interface DirectorStitchLiveSessionProps {
  operatorPrompt?: string;
  className?: string;
}

export default function DirectorStitchLiveSession({
  operatorPrompt,
  className,
}: DirectorStitchLiveSessionProps) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const phaseTimer = window.setInterval(() => {
      setPhaseIndex((i) => Math.min(i + 1, STITCH_PHASES.length - 1));
    }, 18_000);
    const clock = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => {
      window.clearInterval(phaseTimer);
      window.clearInterval(clock);
    };
  }, []);

  const phase = STITCH_PHASES[phaseIndex] ?? STITCH_PHASES[0]!;

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
            Google Stitch
          </span>
        </span>
        <span className="text-[10px] font-mono text-muted/70 tabular-nums">{elapsedSec}s</span>
      </div>

      <div className="wl-stitch-device wl-stitch-device--mobile mx-auto wl-stitch-live-shimmer">
        <div className="wl-stitch-device-chrome">
          <span className="wl-stitch-device-dot" />
          <span className="wl-stitch-device-dot wl-stitch-device-dot--mid" />
          <span className="wl-stitch-device-dot wl-stitch-device-dot--dim" />
          <span className="wl-stitch-device-url">rendering…</span>
        </div>
        <div className="wl-stitch-device-screen min-h-[300px] flex flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="relative">
            <LayoutTemplate className="w-10 h-10 text-brand/35" />
            <span className="absolute -inset-3 rounded-full border border-brand/20 animate-ping" />
          </div>
          <p className="text-[12px] font-semibold text-ink/90">{phase}</p>
          <p className="text-[10px] text-muted max-w-[220px] leading-relaxed">
            Stitch typically takes 1–3 minutes. Your company API key is rendering server-side — stay
            on this tab.
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
