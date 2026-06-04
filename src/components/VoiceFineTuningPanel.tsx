/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
/**
 * ElevenLabs voice fine-tuning sliders — surfaced inside the carrier
 * signal parameters card in FleetSettings. Four knobs that map 1:1
 * to ElevenLabs's `voice_settings` payload and the matching columns
 * on `wireline_agents`:
 *
 *   stability         (0..1, default 0.5)  — voice consistency
 *   similarity_boost  (0..1, default 0.75) — match to source voice
 *   style             (0..1, default 0.0)  — style exaggeration
 *   speaker_boost     (bool, default true) — perceived loudness
 *
 * Hidden behind a "Show advanced" toggle because the defaults are
 * sane (they exactly match ElevenLabs's defaults) and most operators
 * never need to touch them. Operators with cloned voices flip the
 * advanced toggle, dial the sliders, and the audible difference is
 * immediately apparent on the next test call.
 *
 * Auto-save UX: the slider's `onChange` updates local optimistic
 * state (no API hit), and the commit fires on `onPointerUp` /
 * `onMouseUp` / `onTouchEnd` so the dashboard isn't spamming PUT
 * /api/agents/:id per pixel of drag. Snappy + cheap.
 *
 * Docs:
 *   https://elevenlabs.io/docs/api-reference/text-to-speech/convert#request.body.voice_settings
 */
import { useState } from "react";
import { Sliders, RefreshCw, Info } from "lucide-react";
import { cn } from "../lib/utils";
import { Slider } from "./ui/shadcn/Slider";

const DEFAULTS = {
  voice_stability: 0.5,
  voice_similarity_boost: 0.75,
  voice_style: 0.0,
  voice_speaker_boost: true,
} as const;

/**
 * Coerce a possibly-string numeric column (pg returns numeric as
 * string) into a JS number, falling back to the documented default
 * if the column is null/undefined/non-finite.
 */
function toNum(v: unknown, fallback: number): number {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

interface SliderRowProps {
  label: string;
  value: number;
  defaultValue: number;
  tooltip: string;
  onLocalChange: (v: number) => void;
  onCommit: (v: number) => void;
}

/**
 * One slider row — label + tooltip + live value + range input. Local
 * state moves with every drag pixel; commit only fires on pointer/
 * mouse/touch release so we don't spam the API.
 */
function SliderRow({
  label,
  value,
  defaultValue,
  tooltip,
  onLocalChange,
  onCommit,
}: SliderRowProps) {
  const [showTip, setShowTip] = useState(false);
  const isDefault = Math.abs(value - defaultValue) < 0.005;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[9px] uppercase tracking-[0.3em] text-ink/40 flex items-center gap-1.5">
          {label}
          {/* Help tooltip — hover/focus to reveal. Plain English, one
              line; the comments in this file carry the deep ElevenLabs
              context for operators who go reading the source. */}
          <span
            className="relative inline-flex items-center"
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
            onFocus={() => setShowTip(true)}
            onBlur={() => setShowTip(false)}
            tabIndex={0}
          >
            <Info
              className="w-2.5 h-2.5 text-ink/40 hover:text-brand cursor-help"
              aria-label={`What does ${label} do?`}
            />
            {showTip && (
              <span
                role="tooltip"
                className="absolute left-1/2 -translate-x-1/2 -top-1 -translate-y-full z-50 whitespace-normal w-56 px-2.5 py-1.5 rounded-md bg-ink text-white text-[10px] leading-snug normal-case tracking-normal shadow-lg pointer-events-none"
              >
                {tooltip}
              </span>
            )}
          </span>
        </label>
        <span
          className={cn(
            "text-[10px] font-medium tabular-nums",
            isDefault ? "text-ink/40" : "text-ink",
          )}
        >
          {value.toFixed(2)}
        </span>
      </div>
      <Slider
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onLocalChange(Number(e.target.value))}
        onPointerUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onMouseUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        className="w-full accent-brand cursor-pointer"
        aria-label={label}
      />
    </div>
  );
}

interface VoiceFineTuningPanelProps {
  agent: any;
  /** Patch local state (no API hit) — fires on every drag tick. */
  onLocalChange: (patch: Record<string, unknown>) => void;
  /** Commit to the server (PUT /api/agents/:id) — fires on release. */
  onCommit: (patch: Record<string, unknown>) => void;
}

export default function VoiceFineTuningPanel({
  agent,
  onLocalChange,
  onCommit,
}: VoiceFineTuningPanelProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const stability = toNum(agent?.voice_stability, DEFAULTS.voice_stability);
  const similarity = toNum(agent?.voice_similarity_boost, DEFAULTS.voice_similarity_boost);
  const style = toNum(agent?.voice_style, DEFAULTS.voice_style);
  const speakerBoost =
    agent?.voice_speaker_boost == null
      ? DEFAULTS.voice_speaker_boost
      : Boolean(agent.voice_speaker_boost);

  const atDefaults =
    Math.abs(stability - DEFAULTS.voice_stability) < 0.005 &&
    Math.abs(similarity - DEFAULTS.voice_similarity_boost) < 0.005 &&
    Math.abs(style - DEFAULTS.voice_style) < 0.005 &&
    speakerBoost === DEFAULTS.voice_speaker_boost;

  const resetToDefaults = () => {
    const patch = {
      voice_stability: DEFAULTS.voice_stability.toFixed(2),
      voice_similarity_boost: DEFAULTS.voice_similarity_boost.toFixed(2),
      voice_style: DEFAULTS.voice_style.toFixed(2),
      voice_speaker_boost: DEFAULTS.voice_speaker_boost,
    };
    onLocalChange(patch);
    onCommit(patch);
  };

  return (
    <div className="rounded-lg border border-white/8 bg-black/[0.02]">
      {/* Header — click to expand. Stays compact when closed; the
          "modified" pip surfaces a small visual cue when the operator
          has tuned away from defaults without forcing them to open
          the panel. */}
      <button
        type="button"
        onClick={() => setAdvancedOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={advancedOpen}
      >
        <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.3em] text-ink/40">
          <Sliders className="w-2.5 h-2.5 text-brand" />
          Voice fine-tuning
          {!atDefaults && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-brand"
              aria-label="modified from defaults"
              title="modified from defaults"
            />
          )}
        </span>
        <span className="text-[9px] uppercase tracking-[0.25em] text-ink/40">
          {advancedOpen ? "Hide advanced" : "Show advanced"}
        </span>
      </button>

      {advancedOpen && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-white/8">
          <p className="text-[10px] text-ink/40 leading-relaxed">
            Power-user tuning for ElevenLabs voices. Defaults work for most agents — only worth
            touching if you cloned your own voice and want to dial it in.
          </p>

          <SliderRow
            label="Stability"
            value={stability}
            defaultValue={DEFAULTS.voice_stability}
            tooltip="How steady the voice sounds. Lower = more expressive and emotional. Higher = calmer and more consistent."
            onLocalChange={(v) => onLocalChange({ voice_stability: v.toFixed(2) })}
            onCommit={(v) => onCommit({ voice_stability: v.toFixed(2) })}
          />

          <SliderRow
            label="Similarity"
            value={similarity}
            defaultValue={DEFAULTS.voice_similarity_boost}
            tooltip="How closely the agent matches the original voice. Most useful for cloned voices — keep high to sound like the source recording."
            onLocalChange={(v) => onLocalChange({ voice_similarity_boost: v.toFixed(2) })}
            onCommit={(v) => onCommit({ voice_similarity_boost: v.toFixed(2) })}
          />

          <SliderRow
            label="Style"
            value={style}
            defaultValue={DEFAULTS.voice_style}
            tooltip="Exaggerates the speaker's style. Above zero adds character but slows synthesis. Keep at 0 unless you want a distinctive flair."
            onLocalChange={(v) => onLocalChange({ voice_style: v.toFixed(2) })}
            onCommit={(v) => onCommit({ voice_style: v.toFixed(2) })}
          />

          {/* Speaker boost — boolean toggle in the same visual register as
              the other "yes / no" pills elsewhere in FleetSettings. */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="space-y-0.5 min-w-0">
              <label className="text-[9px] uppercase tracking-[0.3em] text-ink/40 flex items-center gap-1.5">
                Speaker boost
              </label>
              <p className="text-[9px] text-ink/40 leading-relaxed">
                Lifts loudness and presence. Turn off for soft, intimate voices.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !speakerBoost;
                onLocalChange({ voice_speaker_boost: next });
                onCommit({ voice_speaker_boost: next });
              }}
              className={cn(
                "shrink-0 w-10 h-5 rounded-full border transition-colors flex items-center px-0.5 cursor-pointer",
                speakerBoost ? "bg-brand/30 border-brand/50" : "bg-white/5 border-white/15",
              )}
              aria-pressed={speakerBoost}
              aria-label="Toggle speaker boost"
            >
              <span
                className={cn(
                  "w-4 h-4 rounded-full transition-transform",
                  speakerBoost ? "translate-x-[18px] bg-brand" : "translate-x-0 bg-muted/60",
                )}
              />
            </button>
          </div>

          {/* Reset link — sits below the controls so it's discoverable
              but doesn't compete visually with the sliders themselves.
              Disabled when already at defaults — the brand-pip in the
              header is the user's signal that anything is dirty. */}
          <div className="flex items-center justify-end pt-1">
            <button
              type="button"
              onClick={resetToDefaults}
              disabled={atDefaults}
              className={cn(
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] transition-colors",
                atDefaults
                  ? "text-ink/40 cursor-not-allowed"
                  : "text-muted/80 hover:text-brand cursor-pointer",
              )}
            >
              <RefreshCw className="w-2.5 h-2.5" />
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
