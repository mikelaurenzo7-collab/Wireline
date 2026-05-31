"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const messages = [
  { speaker: "Caller" as const, text: "Hi, I need to schedule a plumbing appointment" },
  { speaker: "Agent" as const, text: "I'd be happy to help! What day works best?" },
  { speaker: "Caller" as const, text: "Thursday morning would be great" },
];

const delays = [0, 2000, 4000];
const RESET_DELAY = 3000;

export default function HeroLiveDemo() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [cycleKey, setCycleKey] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    delays.forEach((delay, i) => {
      timers.push(
        setTimeout(() => {
          setVisibleCount(i + 1);
        }, delay),
      );
    });

    const totalDuration = delays[delay.length - 1] + RESET_DELAY;
    timers.push(
      setTimeout(() => {
        setVisibleCount(0);
        setCycleKey((k) => k + 1);
      }, totalDuration),
    );

    return () => timers.forEach(clearTimeout);
  }, [cycleKey]);

  return (
    <div className="glass border border-brand/15 overflow-hidden w-full max-w-sm">
      <div className="bg-brand-deep/90 flex items-center gap-2 px-4 py-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/80">
          Live Demo
        </span>
      </div>

      <div className="flex items-end justify-center gap-1 px-4 py-4">
        {[0, 0.15, 0.3, 0.45, 0.6].map((delay, i) => (
          <div
            key={i}
            className={cn(
              "w-1 bg-brand/60 rounded-full animate-[waveform-bar_1.2s_ease-in-out_infinite]",
              i === 0 && "h-3",
              i === 1 && "h-5",
              i === 2 && "h-7",
              i === 3 && "h-4",
              i === 4 && "h-3",
            )}
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2 px-4 pb-4">
        {messages.map((msg, i) => {
          if (i >= visibleCount) return null;
          const isCaller = msg.speaker === "Caller";
          return (
            <motion.div
              key={`${cycleKey}-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className={cn("flex flex-col gap-0.5", isCaller ? "items-end" : "items-start")}
            >
              <span className="font-mono text-[9px] tracking-wider text-muted">{msg.speaker}</span>
              <div
                className={cn(
                  "rounded-xl px-3 py-2 text-sm",
                  isCaller ? "bg-brand/10 border border-brand/15" : "glass border border-black/8",
                )}
              >
                {msg.text}
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="border-t border-black/5 px-4 py-2 text-center">
        <span className="font-mono text-[9px] text-muted tracking-wider">
          Real AI agent · No script
        </span>
      </div>

      <style>{`
        @keyframes waveform-bar {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
