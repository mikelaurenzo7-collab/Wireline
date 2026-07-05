import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, Play, Sparkles } from "lucide-react";

import { Badge, Button } from "../atoms";
import { authFetch } from "../../lib/api";
import { WL_APP_CLASSES } from "../../lib/wireline-design-system";
import {
  normalizeApiVoices,
  playVoicePreview,
  providerLabel,
  VAPI_CURATED_VOICES,
  voiceFamilyLabel,
  WIRELINE_LIVE_VOICES,
  type VoiceCatalogProviders,
  type VoiceOption,
  type VoiceProvider,
} from "../../lib/voice-catalog";

export type VoicePickerValue =
  | { mode: "auto" }
  | { mode: "custom"; voiceId: string; provider: VoiceProvider };

type VoicePickerFieldProps = {
  value: VoicePickerValue;
  onChange: (next: VoicePickerValue) => void;
  className?: string;
};

export default function VoicePickerField({
  value,
  onChange,
  className = "",
}: VoicePickerFieldProps) {
  const [libraryVoices, setLibraryVoices] = useState<VoiceOption[]>([]);
  const [providers, setProviders] = useState<VoiceCatalogProviders>({
    elevenlabs: false,
    wirelineLive: false,
    vapi: false,
  });
  const [catalogReady, setCatalogReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void authFetch("/api/voices")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        setLibraryVoices(normalizeApiVoices(data?.voices));
        setCatalogReady(data?.configured !== false);
        if (data?.providers) {
          setProviders({
            elevenlabs: Boolean(data.providers.elevenlabs),
            wirelineLive: Boolean(data.providers.wirelineLive),
            vapi: Boolean(data.providers.vapi),
          });
        }
      })
      .catch(() => {
        if (!cancelled) setLibraryVoices([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const liveVoices = useMemo(
    () => (providers.wirelineLive ? [...WIRELINE_LIVE_VOICES] : []),
    [providers.wirelineLive],
  );

  const phoneVoices = useMemo(
    () => (providers.vapi ? [...VAPI_CURATED_VOICES] : []),
    [providers.vapi],
  );

  const needle = search.trim().toLowerCase();
  const filterVoices = (voices: readonly VoiceOption[]) =>
    voices.filter((voice) => !needle || voice.name.toLowerCase().includes(needle));

  const filteredLive = filterVoices(liveVoices);
  const filteredPhone = filterVoices(phoneVoices);
  const filteredLibrary = filterVoices(libraryVoices);

  const selectedId = value.mode === "custom" ? value.voiceId : null;

  function selectVoice(voice: VoiceOption) {
    onChange({ mode: "custom", voiceId: voice.id, provider: voice.provider });
  }

  function togglePreview(voice: VoiceOption) {
    if (playingId === voice.id) {
      window.speechSynthesis?.cancel?.();
      setPlayingId(null);
      return;
    }
    setPlayingId(voice.id);
    playVoicePreview(voice, () => setPlayingId(null));
  }

  return (
    <div className={`grid gap-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={WL_APP_CLASSES.wiredEyebrow}>Voice</p>
        <div className="flex flex-wrap gap-1.5">
          {providers.wirelineLive ? <Badge variant="outline">Live</Badge> : null}
          {providers.elevenlabs ? <Badge variant="outline">Voice library</Badge> : null}
          {providers.vapi ? <Badge variant="outline">Phone line</Badge> : null}
        </div>
      </div>

      <label className="grid gap-1.5">
        <span className="sr-only">Search voices</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search voices…"
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
        />
      </label>

      <button
        type="button"
        onClick={() => onChange({ mode: "auto" })}
        className={`rounded-xl border px-4 py-3 text-left transition-colors ${
          value.mode === "auto"
            ? "border-primary/35 bg-primary/5"
            : "border-border bg-card hover:border-primary/25"
        }`}
      >
        <p className="text-sm font-semibold text-foreground">Auto voice</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Wireline picks a polished default from your connected providers.
        </p>
      </button>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading voice catalog…
        </div>
      ) : (
        <div className="grid max-h-[min(340px,42vh)] gap-4 overflow-y-auto pr-1 lg:grid-cols-2">
          {filteredLive.length ? (
            <VoiceGroup
              title="Wireline Live"
              icon={<Sparkles size={13} className="text-primary" aria-hidden="true" />}
              voices={filteredLive}
              selectedId={selectedId}
              playingId={playingId}
              onSelect={selectVoice}
              onPreview={togglePreview}
            />
          ) : null}

          {filteredPhone.length ? (
            <VoiceGroup
              title="Wireline Phone"
              voices={filteredPhone}
              selectedId={selectedId}
              playingId={playingId}
              onSelect={selectVoice}
              onPreview={togglePreview}
            />
          ) : null}

          <VoiceGroup
            title="Wireline Voice library"
            voices={filteredLibrary}
            selectedId={selectedId}
            playingId={playingId}
            onSelect={selectVoice}
            onPreview={togglePreview}
            emptyMessage={
              catalogReady
                ? "No library voices matched your search."
                : "Voice library offline — connect ElevenLabs or use Live / Phone voices above."
            }
            className={filteredLive.length && filteredPhone.length ? "lg:col-span-2" : ""}
          />
        </div>
      )}

      {value.mode === "custom" ? (
        <p className="text-xs text-muted-foreground">
          Selected · {resolveSelectionLabel(value, libraryVoices)} · {providerLabel(value.provider)}
        </p>
      ) : null}
    </div>
  );
}

function resolveSelectionLabel(
  value: Extract<VoicePickerValue, { mode: "custom" }>,
  library: VoiceOption[],
): string {
  const pools = [...WIRELINE_LIVE_VOICES, ...VAPI_CURATED_VOICES, ...library];
  return pools.find((voice) => voice.id === value.voiceId)?.name ?? value.voiceId;
}

function VoiceGroup({
  title,
  icon,
  voices,
  selectedId,
  playingId,
  onSelect,
  onPreview,
  emptyMessage = "No voices in this group.",
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  voices: readonly VoiceOption[];
  selectedId: string | null;
  playingId: string | null;
  onSelect: (voice: VoiceOption) => void;
  onPreview: (voice: VoiceOption) => void;
  emptyMessage?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </p>
      </div>
      <div className="grid gap-2">
        {voices.length ? (
          voices.map((voice) => {
            const selected = selectedId === voice.id;
            const playing = playingId === voice.id;
            return (
              <div
                key={`${voice.provider}-${voice.id}`}
                className={`flex flex-col gap-2 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between ${
                  selected ? "border-primary/30 bg-primary/5" : "border-border bg-background"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(voice)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-sm font-semibold text-foreground">{voice.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {voiceFamilyLabel(voice.provider)}
                    {voice.owned_by_user ? " · Your clone" : ""}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onPreview(voice)}
                  >
                    <Play size={12} aria-hidden="true" />
                    {playing ? "Stop" : "Preview"}
                  </Button>
                  <Button type="button" size="sm" onClick={() => onSelect(voice)}>
                    {selected ? "Selected" : "Use"}
                  </Button>
                </div>
              </div>
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            {emptyMessage}
          </p>
        )}
      </div>
    </div>
  );
}
