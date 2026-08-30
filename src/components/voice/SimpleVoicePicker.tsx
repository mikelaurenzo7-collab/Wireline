import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, MessageCircle, Volume2 } from "lucide-react";

import { authFetch } from "../../lib/api";
import {
  OPENAI_REALTIME_VOICES,
  type VoiceOption,
} from "../../lib/voice-catalog";
import { StatusNotice } from "../molecules";
import VoiceCloningStudio, { type PrivateVoice } from "./VoiceCloningStudio";

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
  privateVoices?: PrivateVoice[];
};

export default function SimpleVoicePicker({ agentId, agentName, onTest }: SimpleVoicePickerProps) {
  const includedVoices = useMemo(() => {
    return [...OPENAI_REALTIME_VOICES];
  }, []);
  const [privateVoices, setPrivateVoices] = useState<PrivateVoice[]>([]);
  const [studioConfigured, setStudioConfigured] = useState(false);
  const [canManageVoices, setCanManageVoices] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingVoiceId, setSavingVoiceId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadVoiceLibrary = useCallback(async () => {
    const response = await authFetch("/api/voices");
    if (!response.ok) throw new Error("Studio voices are temporarily unavailable.");
    const data = (await response.json()) as VoiceLibraryResponse;
    setPrivateVoices(Array.isArray(data.privateVoices) ? data.privateVoices : []);
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
      authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`).then(async (response) => {
        if (!response.ok) throw new Error("Could not load the current voice.");
        return (await response.json()) as AgentVoiceResponse;
      }),
      loadVoiceLibrary().catch((reason) => {
        if (!cancelled) {
          setPrivateVoices([]);
          setStudioConfigured(false);
          setCanManageVoices(false);
          setError(reason instanceof Error ? reason.message : "Studio voices are unavailable.");
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
          setError(reason instanceof Error ? reason.message : "Could not load the current voice.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, loadVoiceLibrary]);

  async function selectVoice(voice: VoiceOption) {
    if (!agentId || savingVoiceId) return;
    setSavingVoiceId(voice.id);
    setNotice(null);
    setError(null);
    try {
      const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}/voice`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: voice.id, provider: voice.provider }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        voice?: { voiceId?: string | null; provider?: string | null };
      } | null;
      if (!response.ok) throw new Error(body?.error || "Voice could not be saved.");
      setSelectedVoiceId(body?.voice?.voiceId ?? voice.id);
      setSelectedProvider(body?.voice?.provider ?? voice.provider);
      setNotice(`${voice.name} is ready for ${agentName}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Voice could not be saved.");
    } finally {
      setSavingVoiceId(null);
    }
  }

  function renderVoice(voice: VoiceOption) {
    const selected = selectedVoiceId === voice.id && selectedProvider === voice.provider;
    const saving = savingVoiceId === voice.id;
    return (
      <div
        key={`${voice.provider}:${voice.id}`}
        className={`flex min-h-16 items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
          selected ? "border-primary/40 bg-primary/5" : "border-border bg-background"
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
              selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
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
              {voice.name.split("·")[0].trim()}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {selected
                ? "Selected"
                : voice.category === "cloned"
                  ? "Private"
                  : voice.name.split("·").slice(1).join("·").trim() || "Choose"}
            </span>
          </span>
        </button>
      </div>
    );
  }

  const selectedIsAvailable = includedVoices.some(
    (voice) => voice.id === selectedVoiceId && voice.provider === selectedProvider,
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onTest}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          Test
        </button>
      </div>

      {notice ? <StatusNotice tone="success">{notice}</StatusNotice> : null}
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
              OpenAI Realtime voices
            </p>
            <p className="text-xs text-muted-foreground">
              This one voice is used consistently in browser tests and live phone calls.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">{includedVoices.map(renderVoice)}</div>
          </div>

          <VoiceCloningStudio
            configured={studioConfigured}
            canManage={canManageVoices}
            voices={privateVoices}
            onChanged={loadVoiceLibrary}
          />
        </>
      )}

      {!loading && !selectedIsAvailable ? (
        <StatusNotice tone="warning">Choose a voice before the next call.</StatusNotice>
      ) : null}
    </div>
  );
}
