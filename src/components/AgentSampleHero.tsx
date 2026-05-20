import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Play, Pause, Loader2, Sparkles } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * Hero "meet our agents" widget — a playful tile that lets first-time
 * visitors hear what a Wireline agent actually sounds like before they
 * sign up. Streams the ElevenLabs preview MP3 (~12s) for the picked
 * voice via the existing public /api/voices/:id/preview endpoint —
 * no auth required, served the same way the deploy-modal preview is.
 *
 * Mike's brief: "playful and high energy Wireline representative
 * agents" on the home page. Two personas — Mira (warm conversational
 * female) and Casey (confident energetic male) — give visitors a
 * choice + double the chance one resonates.
 */

type SampleAgent = {
  key: "mira" | "casey";
  name: string;
  tagline: string;
  voiceId: string;
  accent: string;
};

const SAMPLES: SampleAgent[] = [
  {
    key: "mira",
    name: "Mira",
    tagline: "Warm · conversational · books appointments before you hang up",
    voiceId: "21m00Tcm4TlvDq8ikWAM",
    accent: "from-rose-500/15 to-brand/10",
  },
  {
    key: "casey",
    name: "Casey",
    tagline: "Confident · high-energy · runs outbound campaigns at scale",
    voiceId: "TX3LPaxmHKxFdv7VOQHJ",
    accent: "from-brand/15 to-emerald-500/10",
  },
];

export function AgentSampleHero() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      // Tear down audio on unmount so a sample doesn't keep playing if
      // the visitor navigates away mid-preview.
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const toggle = async (sample: SampleAgent) => {
    if (playing === sample.key) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    audioRef.current = null;
    setLoading(sample.key);
    try {
      const audio = new Audio(`/api/voices/${encodeURIComponent(sample.voiceId)}/preview`);
      audio.onended = () => setPlaying(null);
      audio.onerror = () => {
        setPlaying(null);
        setLoading(null);
      };
      audioRef.current = audio;
      await audio.play();
      setPlaying(sample.key);
      if (typeof window !== "undefined" && (window as any).plausible) {
        (window as any).plausible("HeroAgentSamplePlay", {
          props: { agent: sample.name },
        });
      }
    } catch {
      setPlaying(null);
    } finally {
      setLoading(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="mt-8 rounded-2xl glass border border-black/8 p-4 sm:p-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "#4F1E7B" }}
        >
          <Sparkles className="w-3.5 h-3.5 text-on-brand" strokeWidth={2.5} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.32em] text-brand">Hear our agents</div>
          <div className="text-[12px] text-ink/65 leading-tight">
            Curious what an AI receptionist actually sounds like? Click to play.
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {SAMPLES.map((sample) => {
          const isPlaying = playing === sample.key;
          const isLoading = loading === sample.key;
          return (
            <button
              key={sample.key}
              type="button"
              onClick={() => toggle(sample)}
              disabled={isLoading}
              className={cn(
                "group text-left rounded-xl border p-3 transition-all flex items-start gap-3",
                "bg-gradient-to-br",
                sample.accent,
                isPlaying
                  ? "border-brand/40 shadow-md shadow-brand/10"
                  : "border-black/8 hover:border-brand/30",
              )}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform",
                  isPlaying ? "bg-brand text-on-brand scale-105" : "bg-paper text-brand",
                )}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium text-ink">{sample.name}</span>
                  <span className="text-[9px] uppercase tracking-[0.28em] text-muted/70">
                    {isPlaying ? "Playing" : "Tap to play"}
                  </span>
                </div>
                <p className="text-[11px] text-ink/65 leading-relaxed mt-0.5">{sample.tagline}</p>
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
