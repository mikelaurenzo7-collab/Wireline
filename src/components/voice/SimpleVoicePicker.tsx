import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Loader2,
  MessageCircle,
  Pause,
  Play,
  Volume2,
} from "lucide-react";

import { authFetch } from "../../lib/api";
import {
  normalizeApiVoices,
  VAPI_CURATED_VOICES,
  type VoiceOption,
} from "../../lib/voice-catalog";
import { StatusNotice } from "../molecules";
import VoiceCloningStudio, { type PrivateVoice } from "./VoiceCloningStudio";

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

type SimpleVoicePickerProps = {
  agentId: string;
  agentName: string;
  onTest: () => void;
};

type AgentVoiceResponse = {
  voice?: {
    voiceId?: string | null;
    provider?: string | null;
  };
};

type VoiceLibraryResponse = {
  configured?: boolean;
  canManageVoices?: boolean;
  voices?: unknown;
  privateVoices?: PrivateVoice[];
};

export default function SimpleVoicePicker({
  agentId,
  agentName,
  onTest,
}: SimpleVoicePickerProps) {
  const includedVoices = useMemo(
    () =>
      RECOMMENDED_VOICE_IDS.map((id) =>
        VAPI_CURATED_VOICES.find((voice) => voice.id === id),
      )
        .filter((voice): voice is VoiceOption => Boolean(voice))
        .map((voice) => ({ ...voice, provider: "vapi" as const })),
    [],
  );
  const [studioVoices, setStudioVoices] = useState<VoiceOption[]>([]);
  const [privateVoices, setPrivateVoices] = useState<PrivateVoice[]>([]);
  const [studioConfigured, setStudioConfigured] = useState(false);
  const [canManageVoices, setCanManageVoices] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingVoiceId, setSavingVoiceId] = useState<string | null>(null);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadVoiceLibrary = useCallback(async () => {
    const response = await authFetch("/api/voices");
    if (!response.ok)
      throw new Error("Studio voices are temporarily unavailable.");
    const data = (await response.json()) as VoiceLibraryResponse;
    setStudioVoices(normalizeApiVoices(data.voices));
    setPrivateVoices(
      Array.isArray(data.privateVoices) ? data.privateVoices : [],
    );
    setStudioConfigured(data.configured === true);
    setCanManageVoices(data.canManageVoices === true);
    setError(null);
  }, []);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`).then(
        async (response) => {
          if (!response.ok)
            throw new Error("Could not load the current voice.");
          return (await response.json()) as AgentVoiceResponse;
        },
      ),
      loadVoiceLibrary().catch((reason) => {
        if (!cancelled) {
          setStudioVoices([]);
          setPrivateVoices([]);
          setStudioConfigured(false);
          setCanManageVoices(false);
          setError(
            reason instanceof Error
              ? reason.message
              : "Studio voices are unavailable.",
          );
        }
      }),
    ])
      .then(([agentData]) => {
        if (cancelled) return;
        setSelectedVoiceId(agentData.voice?.voiceId ?? null);
        setSelectedProvider(agentData.voice?.provider ?? null);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load the current voice.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, loadVoiceLibrary]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  async function selectVoice(voice: VoiceOption) {
    if (!agentId || savingVoiceId) return;
    setSavingVoiceId(voice.id);
    setNotice(null);
    setError(null);
    try {
      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(agentId)}/voice`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceId: voice.id, provider: voice.provider }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        voice?: { voiceId?: string | null; provider?: string | null };
      } | null;
      if (!response.ok)
        throw new Error(body?.error || "Voice could not be saved.");
      setSelectedVoiceId(body?.voice?.voiceId ?? voice.id);
      setSelectedProvider(body?.voice?.provider ?? voice.provider);
      setNotice(`${voice.name} is ready for ${agentName}.`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Voice could not be saved.",
      );
    } finally {
      setSavingVoiceId(null);
    }
  }

  function previewVoice(voice: VoiceOption) {
    audioRef.current?.pause();
    if (previewingVoiceId === voice.id) {
      audioRef.current = null;
      setPreviewingVoiceId(null);
      return;
    }
    if (!voice.preview_url) return;
    setError(null);
    const audio = new Audio(voice.preview_url);
    audioRef.current = audio;
    setPreviewingVoiceId(voice.id);
    const stop = () => {
      audioRef.current = null;
      setPreviewingVoiceId(null);
    };
    audio.onended = stop;
    audio.onerror = () => {
      stop();
      setError("Voice preview is temporarily unavailable.");
    };
    void audio.play().catch(() => {
      stop();
      setError("Voice preview could not play.");
    });
  }

  function renderVoice(voice: VoiceOption) {
    const selected =
      selectedVoiceId === voice.id && selectedProvider === voice.provider;
    const saving = savingVoiceId === voice.id;
    const previewing = previewingVoiceId === voice.id;
    return (
      <div
        key={`${voice.provider}:${voice.id}`}
        className={`flex min-h-16 items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
          selected
            ? "border-primary/40 bg-primary/5"
            : "border-border bg-background"
        }`}
      >
        <button
          type="button"
          onClick={() => void selectVoice(voice)}
          disabled={Boolean(savingVoiceId)}
          aria-pressed={selected}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left disabled:cursor-wait disabled:opacity-70"
        >
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-full ${
              selected
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            }`}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : selected ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Volume2 className="size-4" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">
              {voice.name}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {selected
                ? "Live"
                : voice.category === "cloned"
                  ? "Private"
                  : "Choose"}
            </span>
          </span>
        </button>
        {voice.preview_url ? (
          <button
            type="button"
            onClick={() => previewVoice(voice)}
            disabled={Boolean(savingVoiceId)}
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label={`${previewing ? "Pause" : "Preview"} ${voice.name}`}
          >
            {previewing ? (
              <Pause className="size-4" aria-hidden="true" />
            ) : (
              <Play className="ml-0.5 size-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
    );
  }

  const selectedIsAvailable = [...includedVoices, ...studioVoices].some(
    (voice) =>
      voice.id === selectedVoiceId && voice.provider === selectedProvider,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Voice</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose how live calls sound.
          </p>
        </div>
        <button
          type="button"
          onClick={onTest}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          Test response
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Browser tests the words. Place a real call to verify the selected audio.
      </p>

      {notice ? (
        <StatusNotice tone="success" title="Voice saved">
          {notice}
        </StatusNotice>
      ) : null}
      {error ? (
        <StatusNotice tone="destructive" title="Voice unavailable">
          {error}
        </StatusNotice>
      ) : null}

      {loading ? (
        <div className="flex min-h-24 items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading…
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Included
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {includedVoices.map(renderVoice)}
            </div>
          </div>

          {studioVoices.length ? (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Studio
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {studioVoices.map(renderVoice)}
              </div>
            </div>
          ) : null}

          <VoiceCloningStudio
            configured={studioConfigured}
            canManage={canManageVoices}
            voices={privateVoices}
            onChanged={loadVoiceLibrary}
          />
        </>
      )}

      {!loading && !selectedIsAvailable ? (
        <StatusNotice tone="warning" title="Choose a live voice">
          Select a voice before the next call.
        </StatusNotice>
      ) : null}
    </div>
  );
}
