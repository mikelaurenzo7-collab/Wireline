import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, MessageCircle, Volume2 } from "lucide-react";

import { authFetch } from "../../lib/api";
import { VAPI_CURATED_VOICES, type VoiceOption } from "../../lib/voice-catalog";
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

export default function SimpleVoicePicker({
  agentId,
  agentName,
  onTest,
}: SimpleVoicePickerProps) {
  const voices = useMemo(
    () =>
      RECOMMENDED_VOICE_IDS.map((id) =>
        VAPI_CURATED_VOICES.find((voice) => voice.id === id),
      ).filter((voice): voice is VoiceOption => Boolean(voice)),
    [],
  );
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingVoiceId, setSavingVoiceId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setLoading(true);
    authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load the current voice.");
        return (await response.json()) as AgentVoiceResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setSelectedVoiceId(data.voice?.voiceId ?? null);
        setSelectedProvider(data.voice?.provider ?? null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the current voice. Choose one below to retry.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  async function selectVoice(voice: VoiceOption) {
    if (!agentId || savingVoiceId) return;
    setSavingVoiceId(voice.id);
    setNotice(null);
    setError(null);
    try {
      const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}/voice`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: voice.id, provider: "vapi" }),
      });
      if (!response.ok) throw new Error("Voice could not be saved.");
      setSelectedVoiceId(voice.id);
      setSelectedProvider("vapi");
      setNotice(`${voice.name} is ready for ${agentName}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Voice could not be saved.");
    } finally {
      setSavingVoiceId(null);
    }
  }

  const hasManagedPhoneVoice =
    selectedProvider === "vapi" && voices.some((voice) => voice.id === selectedVoiceId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Choose a voice</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Test the response here, then call the line to verify audio.
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

      {notice ? (
        <StatusNotice tone="success" title="Voice saved">
          {notice}
        </StatusNotice>
      ) : null}
      {error ? (
        <StatusNotice tone="destructive" title="Voice not saved">
          {error}
        </StatusNotice>
      ) : null}

      {loading ? (
        <div className="flex min-h-24 items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading current voice…
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {voices.map((voice) => {
            const selected = selectedVoiceId === voice.id && selectedProvider === "vapi";
            const saving = savingVoiceId === voice.id;
            return (
              <button
                key={voice.id}
                type="button"
                onClick={() => void selectVoice(voice)}
                disabled={Boolean(savingVoiceId)}
                aria-pressed={selected}
                className={`flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-wait disabled:opacity-70 ${
                  selected
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-background hover:bg-muted/60"
                }`}
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
                    {voice.name}
                  </span>
                  {selected ? (
                    <span className="mt-0.5 block text-xs text-primary">Selected</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!loading && !hasManagedPhoneVoice ? (
        <StatusNotice tone="warning" title="Choose a managed voice">
          This voice agent has a legacy voice setting. Select one of the included voices above before
          placing the next live call.
        </StatusNotice>
      ) : null}
    </div>
  );
}
