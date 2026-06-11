import { cn } from "../../lib/utils";

interface VoiceOrbProps {
  /** Agent display name — its initial is rendered in the core. */
  agentName: string;
  /** Live volume amplitude from Vapi (0..1). */
  volume: number;
  /** True while the agent is actively speaking (vs. listening). */
  speaking: boolean;
  /** Accent color (purple family) used for halo + rings. */
  color: string;
}

/**
 * VoiceOrb — the live, audio-reactive centerpiece of the in-browser call.
 *
 * Honors the Aurora Cream "Medallion + Halo" motif (the only sanctioned
 * non-zero radius is a true circle) and makes the agent's voice *visible*:
 * concentric rings ripple outward and the gradient core throbs in lockstep
 * with Vapi's real-time `volume-level` stream. When merely listening, the
 * core breathes gently and the rings settle.
 *
 * CSP-safe: the live amplitude is published through `data-orb-pulse` and read
 * back in CSS via `attr(... type(<number>))` — mirroring the existing
 * `wl-call-volume-bar[data-pct]` pattern. No inline styles, no churn.
 */
export default function VoiceOrb({ agentName, volume, speaking, color }: VoiceOrbProps) {
  // Clamp + lightly shape the amplitude so quiet speech still registers
  // visibly while loud peaks don't blow out the layout.
  const pulse = Math.min(1, Math.max(0, volume));
  const orbPulse = speaking ? Math.round(pulse * 100) / 100 : 0;
  const initial = agentName.trim().charAt(0).toUpperCase() || "•";

  return (
    <div
      className="wl-voice-orb relative grid place-items-center h-28 w-28 select-none wl-call-color"
      data-call-color={color}
      data-orb-pulse={orbPulse}
      data-speaking={speaking ? "true" : "false"}
      aria-hidden="true"
    >
      {/* Ambient halo */}
      <span className="wl-voice-orb-halo absolute inset-0 rounded-full" />

      {/* Reactive concentric rings */}
      {[1, 2, 3].map((ring) => (
        <span
          key={ring}
          className="wl-voice-orb-ring absolute inset-0 rounded-full"
          data-ring={ring}
        />
      ))}

      {/* Gradient core */}
      <span
        className={cn(
          "wl-voice-orb-core relative grid place-items-center h-16 w-16 rounded-full",
          "font-display text-2xl text-white",
        )}
      >
        {initial}
      </span>
    </div>
  );
}
