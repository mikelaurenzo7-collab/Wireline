import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, MessageCircle, Pause, Play, Volume2 } from "lucide-react";

import { authFetch } from "../../lib/api";
import {
  hasVapiVoiceSample,
  playVoicePreview,
  VAPI_CURATED_VOICES,
  type VoiceOption,
} from "../../lib/voice-catalog";
import { StatusNotice } from "../molecules";

const RECOMMENDED_VOICE_IDS = [
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

type SimpleVoicePickerProps = {
  agentId: string;
  agentName: string;
  onTest: () => void;
};

type AgentVoice = {
  voiceId?: string | null;
  provider?: string | null;
  phoneVoiceId?: string | null;
  phoneVoiceProvider?: string | null;
  effectivePhoneVoiceId?: string | null;
  effectivePhoneVoiceProvider?: string | null;
};

type AgentVoiceResponse = {
  voice?: AgentVoice;
};

export default function SimpleVoicePicker({ agentId, agentName, onTest }: SimpleVoicePickerProps) {
  const voices = useMemo(() => {
    const recommended = RECOMMENDED_VOICE_IDS.map((id) =>
      VAPI_CURATED_VOICES.find((voice) => voice.id === id),
    ).filter((voice): voice is VoiceOption => Boolean(voice));
    const remaining = VAPI_CURATED_VOICES.filter(
      (voice) =>
        hasVapiVoiceSample(voice.id) &&
        !recommended.some((recommendedVoice) => recommendedVoice.id === voice.id),
    );
    return [...recommended, ...remaining];
  }, []);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [phoneVoiceId, setPhoneVoiceId] = useState<string | null>(null);
  const [phoneVoiceProvider, setPhoneVoiceProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingVoiceId, setSavingVoiceId] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [choicesOpen, setChoicesOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const optionsId = useId();

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setLoading(true);
    setSaveError(null);
    authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load the current voice.");
        return (await response.json()) as AgentVoiceResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setSelectedVoiceId(data.voice?.voiceId ?? null);
        setSelectedProvider(data.voice?.provider ?? null);
        setPhoneVoiceId(data.voice?.effectivePhoneVoiceId ?? data.voice?.phoneVoiceId ?? null);
        setPhoneVoiceProvider(
          data.voice?.effectivePhoneVoiceProvider ?? data.voice?.phoneVoiceProvider ?? null,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setSaveError("Could not load the current voice. Choose one below to retry.");
          setChoicesOpen(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(
    () => () => {
      const audio = audioRef.current;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.onplaying = null;
        audio.pause();
      }
      audioRef.current = null;
    },
    [],
  );

  const presenterActive = selectedProvider === "presenter" && Boolean(selectedVoiceId);
  const effectivePhoneVoiceId = presenterActive ? phoneVoiceId : selectedVoiceId;
  const effectivePhoneProvider = presenterActive ? phoneVoiceProvider : selectedProvider;
  const selectedPhoneVoice = VAPI_CURATED_VOICES.find(
    (voice) => voice.id === effectivePhoneVoiceId && effectivePhoneProvider === "vapi",
  );
  const recommendedVoice =
    voices.find((voice) => voice.id === RECOMMENDED_VOICE_ID) ?? voices[0] ?? null;
  const featuredVoice = selectedPhoneVoice ?? recommendedVoice;
  const hasBuiltInPhoneVoice = Boolean(selectedPhoneVoice);
  const featuredHasSample = featuredVoice ? hasVapiVoiceSample(featuredVoice.id) : false;

  function stopPreview() {
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.onplaying = null;
      audio.pause();
      audio.currentTime = 0;
    }
    audioRef.current = null;
    setPlayingVoiceId(null);
    setLoadingPreviewId(null);
  }

  function togglePreview(voice: VoiceOption) {
    if (playingVoiceId === voice.id || loadingPreviewId === voice.id) {
      stopPreview();
      return;
    }

    stopPreview();
    setPreviewError(null);
    setLoadingPreviewId(voice.id);
    let nextAudio: HTMLAudioElement | null = null;
    nextAudio = playVoicePreview(
      voice,
      () => {
        if (audioRef.current !== nextAudio) return;
        audioRef.current = null;
        setPlayingVoiceId(null);
        setLoadingPreviewId(null);
      },
      () => {
        if (audioRef.current !== nextAudio) return;
        audioRef.current = null;
        setPlayingVoiceId(null);
        setLoadingPreviewId(null);
        setPreviewError("That sample is temporarily unavailable. Try again in a moment.");
      },
      () => {
        if (audioRef.current !== nextAudio) return;
        setLoadingPreviewId(null);
        setPlayingVoiceId(voice.id);
      },
    );
    audioRef.current = nextAudio;
  }

  async function selectVoice(voice: VoiceOption) {
    if (!agentId || savingVoiceId) return;
    stopPreview();
    setSavingVoiceId(voice.id);
    setNotice(null);
    setSaveError(null);
    const preservePresenter = selectedProvider === "presenter" && Boolean(selectedVoiceId);
    const payload = preservePresenter
      ? {
          voiceId: selectedVoiceId,
          provider: "presenter",
          phoneVoiceId: voice.id,
          phoneVoiceProvider: "vapi",
        }
      : { voiceId: voice.id, provider: "vapi" };

    try {
      const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}/voice`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as AgentVoiceResponse | null;
      if (!response.ok) throw new Error("Voice could not be saved.");

      if (preservePresenter) {
        setPhoneVoiceId(data?.voice?.phoneVoiceId ?? voice.id);
        setPhoneVoiceProvider(data?.voice?.phoneVoiceProvider ?? "vapi");
        setNotice(`${voice.name} is ready for live calls. Your Studio presenter stays active.`);
      } else {
        setSelectedVoiceId(data?.voice?.voiceId ?? voice.id);
        setSelectedProvider(data?.voice?.provider ?? "vapi");
        setPhoneVoiceId(null);
        setPhoneVoiceProvider(null);
        setNotice(`${voice.name} is ready for ${agentName}.`);
      }
      setChoicesOpen(false);
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Voice could not be saved.");
    } finally {
      setSavingVoiceId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Choose how live calls sound</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Preview the exact phone voice here. Browser conversation testing checks what the
            employee says and how it handles the customer.
          </p>
        </div>
        <button
          type="button"
          onClick={onTest}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          Test conversation
        </button>
      </div>

      {notice ? (
        <StatusNotice tone="success" title="Voice saved">
          {notice}
        </StatusNotice>
      ) : null}
      {saveError ? (
        <StatusNotice tone="destructive" title="Voice not saved">
          {saveError}
        </StatusNotice>
      ) : null}
      {previewError ? (
        <StatusNotice tone="warning" title="Sample unavailable">
          {previewError}
        </StatusNotice>
      ) : null}

      {loading ? (
        <div className="flex min-h-28 items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading current voice…
        </div>
      ) : featuredVoice ? (
        <>
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                  {hasBuiltInPhoneVoice ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    <Volume2 className="size-4" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                    {hasBuiltInPhoneVoice ? "Current phone voice" : "Recommended phone voice"}
                  </span>
                  <span className="mt-1 block text-base font-semibold text-foreground">
                    {featuredVoice.name}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {featuredHasSample
                      ? "Built in for dependable live calls · exact official sample"
                      : "Built in for live calls · official sample unavailable"}
                  </span>
                </span>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {featuredHasSample ? (
                  <PreviewButton
                    voice={featuredVoice}
                    playing={playingVoiceId === featuredVoice.id}
                    loading={loadingPreviewId === featuredVoice.id}
                    onClick={() => togglePreview(featuredVoice)}
                  />
                ) : null}
                {!hasBuiltInPhoneVoice ? (
                  <button
                    type="button"
                    disabled={Boolean(savingVoiceId)}
                    onClick={() => void selectVoice(featuredVoice)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity disabled:cursor-wait disabled:opacity-60"
                  >
                    {savingVoiceId === featuredVoice.id ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Check className="size-4" aria-hidden="true" />
                    )}
                    Use this voice
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <button
            type="button"
            aria-expanded={choicesOpen}
            aria-controls={optionsId}
            onClick={() => setChoicesOpen((open) => !open)}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted/60"
          >
            Change voice
            <ChevronDown
              className={`size-4 text-muted-foreground transition-transform ${choicesOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>

          {choicesOpen ? (
            <div id={optionsId} className="grid gap-2 sm:grid-cols-2">
              {voices.map((voice) => {
                const selected = selectedPhoneVoice?.id === voice.id;
                const saving = savingVoiceId === voice.id;
                return (
                  <div
                    key={voice.id}
                    className={`flex min-h-20 items-center gap-3 rounded-xl border p-3 ${
                      selected ? "border-primary/35 bg-primary/5" : "border-border bg-background"
                    }`}
                  >
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-full ${
                        selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                      }`}
                    >
                      {selected ? (
                        <Check className="size-4" aria-hidden="true" />
                      ) : (
                        <Volume2 className="size-4" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{voice.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {selected ? "Selected for live calls" : "Built-in phone voice"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <PreviewButton
                        voice={voice}
                        compact
                        playing={playingVoiceId === voice.id}
                        loading={loadingPreviewId === voice.id}
                        onClick={() => togglePreview(voice)}
                      />
                      {!selected ? (
                        <button
                          type="button"
                          disabled={Boolean(savingVoiceId)}
                          onClick={() => void selectVoice(voice)}
                          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-60"
                        >
                          {saving ? "Saving…" : "Use"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      ) : (
        <p className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Built-in phone voices are unavailable right now. Try reopening Studio.
        </p>
      )}

      {!loading && presenterActive ? (
        <StatusNotice tone="info" title="Your presenter stays active">
          Voice changes here apply to live phone calls only. Studio video keeps its matched
          presenter voice.
        </StatusNotice>
      ) : !loading && !hasBuiltInPhoneVoice ? (
        <p className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-foreground">
          The current voice uses an optional external provider. Use the recommended built-in voice
          for the simplest launch setup.
        </p>
      ) : null}
    </div>
  );
}

function PreviewButton({
  voice,
  playing,
  loading,
  compact = false,
  onClick,
}: {
  voice: VoiceOption;
  playing: boolean;
  loading: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  const label = loading ? "Loading sample" : playing ? "Stop sample" : "Preview voice";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${voice.name}`}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm font-semibold text-foreground transition-colors hover:bg-muted ${
        compact ? "min-w-11 px-2.5" : "px-4"
      }`}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : playing ? (
        <Pause className="size-4" aria-hidden="true" />
      ) : (
        <Play className="size-4" aria-hidden="true" />
      )}
      {compact ? <span className="sr-only">{label}</span> : label}
    </button>
  );
}
