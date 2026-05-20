import { useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * Compact tap-to-play voice samples — sized to sit beside the
 * "Call our demo line" box in the AuthPortal demo grid. Two small
 * rows (Mira / Casey). Click streams the ElevenLabs preview MP3 via
 * the public /api/voices/:id/preview endpoint (no auth).
 *
 * Lower-friction than dialing the demo line: a visitor hears what a
 * Wireline agent sounds like in one tap, without picking up a phone.
 */

type Sample = { key: string; name: string; sub: string; voiceId: string };

const SAMPLES: Sample[] = [
  { key: "mira", name: "Mira", sub: "Warm receptionist", voiceId: "21m00Tcm4TlvDq8ikWAM" },
  { key: "casey", name: "Casey", sub: "Energetic sales", voiceId: "TX3LPaxmHKxFdv7VOQHJ" },
];

export default function AuthPortalVoiceSamples() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const toggle = async (s: Sample) => {
    if (playing === s.key) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    audioRef.current = null;
    setLoading(s.key);
    try {
      const audio = new Audio(`/api/voices/${encodeURIComponent(s.voiceId)}/preview`);
      audio.onended = () => setPlaying(null);
      audio.onerror = () => {
        setPlaying(null);
        setLoading(null);
      };
      audioRef.current = audio;
      await audio.play();
      setPlaying(s.key);
      if (typeof window !== "undefined" && (window as any).plausible) {
        (window as any).plausible("AuthPortalVoiceSamplePlay", { props: { agent: s.name } });
      }
    } catch {
      setPlaying(null);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-paper/40 p-2 flex flex-col justify-center gap-1.5">
      {SAMPLES.map((s) => {
        const isPlaying = playing === s.key;
        const isLoading = loading === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => toggle(s)}
            disabled={isLoading}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors text-left",
              isPlaying ? "bg-[#4F1E7B]/15" : "hover:bg-white/5",
            )}
          >
            <span
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors",
                isPlaying ? "bg-[#4F1E7B] text-on-brand" : "bg-[#4F1E7B]/15 text-[#4F1E7B]",
              )}
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5 ml-0.5" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-[12px] font-medium text-ink leading-tight">
                {s.name}
                <span className="text-[9px] uppercase tracking-[0.18em] text-muted/60 ml-1.5">
                  {isPlaying ? "Playing" : "Tap to play"}
                </span>
              </span>
              <span className="block text-[10px] text-muted/70 leading-tight">{s.sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
