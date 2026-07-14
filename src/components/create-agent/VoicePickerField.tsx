import { useEffect, useMemo, type ReactNode } from "react";
import { Check, ChevronDown, PhoneCall } from "lucide-react";

import { Badge, Button } from "../atoms";
import {
  VAPI_CURATED_VOICES,
  voiceFamilyLabel,
  type VoiceOption,
  type VoiceProvider,
} from "../../lib/voice-catalog";
import { WL_APP_CLASSES } from "../../lib/wireline-design-system";

export type VoicePickerValue =
  | { mode: "auto" }
  | { mode: "custom"; voiceId: string; provider: VoiceProvider };

type VoicePickerFieldProps = {
  value: VoicePickerValue;
  onChange: (next: VoicePickerValue) => void;
  /** Retained for caller compatibility; presenter voices are configured later in Studio. */
  suggestedPresenterVoice?: { voiceId: string; name: string } | null;
  className?: string;
};

const FAST_START_VOICE_IDS = [
  "Savannah",
  "Elliot",
  "Emma",
  "Clara",
  "Nico",
  "Sid",
  "Layla",
  "Neil",
] as const;

const RECOMMENDED_VOICE_ID = "Savannah";

function fastStartVoices() {
  return FAST_START_VOICE_IDS.map((id) =>
    VAPI_CURATED_VOICES.find((voice) => voice.id === id),
  ).filter((voice): voice is VoiceOption => Boolean(voice));
}

export default function VoicePickerField({
  value,
  onChange,
  className = "",
}: VoicePickerFieldProps) {
  const voices = useMemo(() => fastStartVoices(), []);
  const recommended =
    voices.find((voice) => voice.id === RECOMMENDED_VOICE_ID) ?? voices[0] ?? null;

  useEffect(() => {
    if (value.mode !== "auto" || !recommended) return;
    onChange({ mode: "custom", voiceId: recommended.id, provider: "vapi" });
  }, [onChange, recommended, value.mode]);

  const selectedId = value.mode === "custom" ? value.voiceId : recommended?.id ?? null;
  const selectedProvider = value.mode === "custom" ? value.provider : "vapi";

  function selectVoice(voice: VoiceOption) {
    onChange({ mode: "custom", voiceId: voice.id, provider: "vapi" });
  }

  return (
    <div className={`grid gap-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={WL_APP_CLASSES.wiredEyebrow}>Phone voice</p>
        <Badge variant="outline">Built in</Badge>
      </div>

      {recommended ? (
        <button
          type="button"
          onClick={() => selectVoice(recommended)}
          className={`w-full rounded-xl border px-4 py-4 text-left transition-colors ${
            selectedId === recommended.id && selectedProvider === "vapi"
              ? "border-primary/40 bg-primary/5"
              : "border-border bg-card hover:border-primary/30"
          }`}
        >
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                {recommended.name}
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Recommended default for dependable phone calls. No ElevenLabs or xAI account needed.
              </span>
            </span>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-4" aria-hidden="true" />
            </span>
          </span>
        </button>
      ) : (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          The built-in phone voice catalog is unavailable. You can choose a voice in Studio after
          creation.
        </p>
      )}

      <details className="group rounded-xl border border-border bg-background">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-foreground">
          Choose another built-in voice
          <ChevronDown
            className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-2">
          {voices.map((voice) => {
            const selected = selectedId === voice.id && selectedProvider === "vapi";
            return (
              <VoiceChoice
                key={voice.id}
                voice={voice}
                selected={selected}
                onSelect={() => selectVoice(voice)}
              />
            );
          })}
        </div>
      </details>

      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-3 text-xs leading-5 text-muted-foreground">
        <PhoneCall className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>
          You will hear the selected voice during a test call. External voice libraries and video
          presenter voices remain optional advanced settings in Studio.
        </span>
      </div>
    </div>
  );
}

function VoiceChoice({
  voice,
  selected,
  onSelect,
  icon,
}: {
  voice: VoiceOption;
  selected: boolean;
  onSelect: () => void;
  icon?: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={selected ? "default" : "secondary"}
      onClick={onSelect}
      className="h-auto min-h-14 justify-start gap-3 px-3 py-2 text-left"
    >
      <span
        className={`grid size-7 shrink-0 place-items-center rounded-full ${
          selected ? "bg-primary-foreground/15" : "bg-background"
        }`}
      >
        {icon ?? (selected ? <Check className="size-3.5" aria-hidden="true" /> : null)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{voice.name}</span>
        <span className="block text-[10px] font-normal opacity-75">
          {voiceFamilyLabel("vapi")}
        </span>
      </span>
    </Button>
  );
}
