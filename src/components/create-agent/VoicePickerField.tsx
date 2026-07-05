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
  voiceRoutingHint,
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
  /** When a catalog presenter face exposes a default voice, surface a one-tap apply CTA. */
  suggestedPresenterVoice?: { voiceId: string; name: string } | null;
  className?: string;
};

export default function VoicePickerField({
  value,
  onChange,
  suggestedPresenterVoice = null,
  className = "",
}: VoicePickerFieldProps) {
  const [libraryVoices, setLibraryVoices] = useState<VoiceOption[]>([]);
  const [providers, setProviders] = useState<VoiceCatalogProviders>({
    elevenlabs: false,
    wirelineLive: false,
    vapi: false,
    presenter: false,
  });
  const [presenterVoices, setPresenterVoices] = useState<VoiceOption[]>([]);
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
        setPresenterVoices(normalizeApiVoices(data?.presenterVoices));
        setCatalogReady(data?.configured !== false);
        if (data?.providers) {
          setProviders({
            elevenlabs: Boolean(data.providers.elevenlabs),
            wirelineLive: Boolean(data.providers.wirelineLive),
            vapi: Boolean(data.providers.vapi),
            presenter: Boolean(data.providers.presenter),
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

  const filteredPresenter = filterVoices(presenterVoices);

  const selectedId = value.mode === "custom" ? value.voiceId : null;
  const selectedProvider = value.mode === "custom" ? value.provider : null;
  const routingHint = value.mode === "custom" ? voiceRoutingHint(value.provider) : null;
  const suggestedApplied =
    suggestedPresenterVoice &&
    value.mode === "custom" &&
    value.provider === "presenter" &&
    value.voiceId === suggestedPresenterVoice.voiceId;

  function voicePlayKey(voice: VoiceOption): string {
    return `${voice.provider}:${voice.id}`;
  }

  function selectVoice(voice: VoiceOption) {
    onChange({ mode: "custom", voiceId: voice.id, provider: voice.provider });
  }

  function togglePreview(voice: VoiceOption) {
    const key = voicePlayKey(voice);
    if (playingId === key) {
      setPlayingId(null);
      return;
    }
    setPlayingId(key);
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
          {providers.presenter ? <Badge variant="outline">Presenter</Badge> : null}
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

      {suggestedPresenterVoice && !suggestedApplied ? (
        <button
          type="button"
          onClick={() =>
            onChange({
              mode: "custom",
              voiceId: suggestedPresenterVoice.voiceId,
              provider: "presenter",
            })
          }
          className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-left transition-colors hover:border-primary/45"
        >
          <p className="text-sm font-semibold text-foreground">
            Use presenter&apos;s matched voice
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {suggestedPresenterVoice.name} — lip-sync aligned with your catalog face pick.
          </p>
        </button>
      ) : null}

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
              selectedProvider={selectedProvider}
              playingId={playingId}
              onSelect={selectVoice}
              onPreview={togglePreview}
              voicePlayKey={voicePlayKey}
            />
          ) : null}

          {filteredPhone.length ? (
            <VoiceGroup
              title="Wireline Phone"
              voices={filteredPhone}
              selectedId={selectedId}
              selectedProvider={selectedProvider}
              playingId={playingId}
              onSelect={selectVoice}
              onPreview={togglePreview}
              voicePlayKey={voicePlayKey}
            />
          ) : null}

          {filteredPresenter.length ? (
            <VoiceGroup
              title="Presenter voice (video)"
              voices={filteredPresenter}
              selectedId={selectedId}
              selectedProvider={selectedProvider}
              playingId={playingId}
              onSelect={selectVoice}
              onPreview={togglePreview}
              voicePlayKey={voicePlayKey}
            />
          ) : null}

          <VoiceGroup
            title="Wireline Voice library"
            voices={filteredLibrary}
            selectedId={selectedId}
            selectedProvider={selectedProvider}
            playingId={playingId}
            onSelect={selectVoice}
            onPreview={togglePreview}
            voicePlayKey={voicePlayKey}
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
        <div className="grid gap-1">
          <p className="text-xs text-muted-foreground">
            Selected · {resolveSelectionLabel(value, libraryVoices, presenterVoices)} ·{" "}
            {providerLabel(value.provider)}
          </p>
          {routingHint ? (
            <p className="text-xs leading-relaxed text-[var(--wireline-color-action-primary-default)]">
              {routingHint}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function resolveSelectionLabel(
  value: Extract<VoicePickerValue, { mode: "custom" }>,
  library: VoiceOption[],
  presenter: VoiceOption[],
): string {
  const pools = [...WIRELINE_LIVE_VOICES, ...VAPI_CURATED_VOICES, ...presenter, ...library];
  return (
    pools.find((voice) => voice.id === value.voiceId && voice.provider === value.provider)?.name ??
    pools.find((voice) => voice.id === value.voiceId)?.name ??
    value.voiceId
  );
}

function VoiceGroup({
  title,
  icon,
  voices,
  selectedId,
  selectedProvider,
  playingId,
  onSelect,
  onPreview,
  voicePlayKey,
  emptyMessage = "No voices in this group.",
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  voices: readonly VoiceOption[];
  selectedId: string | null;
  selectedProvider: VoiceProvider | null;
  playingId: string | null;
  onSelect: (voice: VoiceOption) => void;
  onPreview: (voice: VoiceOption) => void;
  voicePlayKey: (voice: VoiceOption) => string;
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
            const selected = selectedId === voice.id && selectedProvider === voice.provider;
            const playing = playingId === voicePlayKey(voice);
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
