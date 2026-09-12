import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Volume2 } from "lucide-react";

import { authFetch } from "../../lib/api";
import { OPENAI_REALTIME_VOICES, type VoiceOption } from "../../lib/voice-catalog";
import OpenAILiveVoiceSandbox from "../OpenAILiveVoiceSandbox";
import { StatusNotice } from "../molecules";

type SimpleVoicePickerProps = {
  agentId: string;
  agentName: string;
};

type AgentVoiceResponse = {
  voice?: {
    voiceId?: string | null;
    provider?: string | null;
    phoneVoiceId?: string | null;
    phoneVoiceProvider?: string | null;
  };
};

export default function SimpleVoicePicker({ agentId, agentName }: SimpleVoicePickerProps) {
  const includedVoices = useMemo(() => {
    return [...OPENAI_REALTIME_VOICES];
  }, []);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingVoiceId, setSavingVoiceId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [choicesOpen, setChoicesOpen] = useState(false);
  const activeAgentIdRef = useRef(agentId);
  const saveOperationRef = useRef(0);

  useLayoutEffect(() => {
    activeAgentIdRef.current = agentId;
    saveOperationRef.current += 1;
  }, [agentId]);

  useEffect(() => {
    setSavingVoiceId(null);
    setSelectedVoiceId(null);
    setSelectedProvider(null);
    setNotice(null);
    setChoicesOpen(false);
    if (!agentId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreviewOpen(false);
    authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load the current voice.");
        return (await response.json()) as AgentVoiceResponse;
      })
      .then((agentData) => {
        if (cancelled) return;
        const storedPrimaryVoiceId = agentData.voice?.voiceId?.trim() || null;
        const storedPrimaryProvider = agentData.voice?.provider?.trim().toLowerCase() || null;
        const usesSeparatePhoneVoice = storedPrimaryProvider === "presenter";
        const storedVoiceId = usesSeparatePhoneVoice
          ? agentData.voice?.phoneVoiceId?.trim() || null
          : storedPrimaryVoiceId;
        const storedProvider = usesSeparatePhoneVoice
          ? agentData.voice?.phoneVoiceProvider?.trim().toLowerCase() || null
          : storedPrimaryProvider;
        const managedVoice = OPENAI_REALTIME_VOICES.find(
          (voice) => voice.id.toLowerCase() === storedVoiceId?.toLowerCase(),
        );
        setSelectedVoiceId(managedVoice?.id ?? storedVoiceId);
        setSelectedProvider(
          managedVoice && (!storedProvider || storedProvider === "openai")
            ? "openai"
            : storedProvider,
        );
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
  }, [agentId]);

  async function selectVoice(voice: VoiceOption) {
    if (!agentId || savingVoiceId) return;
    const requestedAgentId = agentId;
    const saveOperation = ++saveOperationRef.current;
    const isCurrentSave = () =>
      activeAgentIdRef.current === requestedAgentId && saveOperationRef.current === saveOperation;
    setSavingVoiceId(voice.id);
    setNotice(null);
    setError(null);
    try {
      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(requestedAgentId)}/voice`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceId: voice.id, provider: "openai" }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        voice?: {
          voiceId?: string | null;
          provider?: string | null;
          phoneVoiceId?: string | null;
          phoneVoiceProvider?: string | null;
        };
      } | null;
      if (!response.ok) throw new Error(body?.error || "Voice could not be saved.");
      if (!isCurrentSave()) return;
      const savedPrimaryProvider = body?.voice?.provider?.trim().toLowerCase() || null;
      const savedPrimaryVoiceId = body?.voice?.voiceId?.trim() || null;
      const savedWithPhoneFallback = savedPrimaryProvider === "presenter";
      setSelectedVoiceId(
        savedWithPhoneFallback
          ? (body?.voice?.phoneVoiceId ?? voice.id)
          : (savedPrimaryVoiceId ?? voice.id),
      );
      setSelectedProvider(
        savedWithPhoneFallback
          ? (body?.voice?.phoneVoiceProvider ?? voice.provider)
          : (savedPrimaryProvider ?? voice.provider),
      );
      setPreviewOpen(false);
      setNotice(`${voice.name} is ready for ${agentName}.`);
    } catch (reason) {
      if (isCurrentSave()) {
        setError(reason instanceof Error ? reason.message : "Voice could not be saved.");
      }
    } finally {
      if (isCurrentSave()) setSavingVoiceId(null);
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
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg text-left wl-focus-ring-halo disabled:cursor-wait disabled:opacity-70"
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
              {selected ? "Selected" : voice.name.split("·").slice(1).join("·").trim() || "Choose"}
            </span>
          </span>
        </button>
      </div>
    );
  }

  const selectedVoice = includedVoices.find(
    (voice) => voice.id === selectedVoiceId && voice.provider === selectedProvider,
  );
  const selectedIsAvailable = Boolean(selectedVoice);

  useEffect(() => {
    if (!loading && !selectedIsAvailable) setChoicesOpen(true);
  }, [loading, selectedIsAvailable]);

  return (
    <div className="space-y-3">
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
        <details
          className="group rounded-xl border border-border bg-background"
          open={choicesOpen}
          onToggle={(event) => setChoicesOpen(event.currentTarget.open)}
        >
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-3 wl-focus-ring-halo">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">
                {selectedVoice
                  ? selectedVoice.name.split("·")[0].trim()
                  : selectedVoiceId
                    ? "Unavailable voice"
                    : "Choose a voice"}
              </span>
              {selectedVoice ? (
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {selectedVoice.name.split("·").slice(1).join("·").trim()}
                </span>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
              Change voice
              <ChevronDown
                className="size-4 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </span>
          </summary>
          <div className="space-y-3 border-t border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{includedVoices.length} built-in voices</span>
              <span>Saves automatically</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">{includedVoices.map(renderVoice)}</div>
          </div>
        </details>
      )}

      {!loading && !selectedIsAvailable ? (
        <StatusNotice tone="warning">Choose a voice before the next call.</StatusNotice>
      ) : null}

      <p className="text-xs leading-5 text-muted-foreground">
        Used for calls and browser tests. Preview starts a private voice session.
      </p>
      <button
        type="button"
        onClick={() => setPreviewOpen((open) => !open)}
        disabled={loading || Boolean(savingVoiceId) || !selectedIsAvailable}
        aria-expanded={previewOpen}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted wl-focus-ring-halo"
      >
        <Volume2 className="size-4" aria-hidden="true" />
        {previewOpen ? "Close preview" : "Preview voice"}
      </button>

      {previewOpen && selectedIsAvailable ? (
        <OpenAILiveVoiceSandbox
          key={`${selectedProvider}:${selectedVoiceId}`}
          agentId={agentId}
          agentName={agentName}
        />
      ) : null}
    </div>
  );
}
