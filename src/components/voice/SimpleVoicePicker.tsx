import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Mic, Play, RotateCcw, Square, Volume2 } from "lucide-react";

import { authFetch } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import type { BotMarkKey } from "../../lib/bot-mark";
import { OPENAI_REALTIME_VOICES, type VoiceOption } from "../../lib/voice-catalog";
import OpenAILiveVoiceSandbox from "../OpenAILiveVoiceSandbox";
import { StatusNotice } from "../molecules";
import LiveVoiceCloneStudio, { LIVE_VOICE_ANCHOR_ID } from "./LiveVoiceCloneStudio";
import VoiceClonePanel from "./VoiceClonePanel";

type SimpleVoicePickerProps = {
  agentId: string;
  agentName: string;
  markKey?: BotMarkKey | null;
  /** The Bot's phone number, so owners can place a test call after cloning. */
  botPhone?: string | null;
  /** Setup and the workspace can be mounted together; focus the local clone flow. */
  cloneAnchorId?: string;
};

/** The voice callers actually hear when phone calls run on another provider. */
type PhoneCallVoice = { provider: string; voice: string } | null;

type AgentVoiceResponse = {
  voice?: {
    voiceId?: string | null;
    provider?: string | null;
    phoneVoiceId?: string | null;
    phoneVoiceProvider?: string | null;
    phoneCall?: PhoneCallVoice;
    phoneCallReady?: boolean | null;
  };
};

function phoneCallVoiceName(phoneCall: PhoneCallVoice): string | null {
  if (!phoneCall?.voice) return null;
  return phoneCall.voice.charAt(0).toUpperCase() + phoneCall.voice.slice(1);
}

export default function SimpleVoicePicker({
  agentId,
  agentName,
  markKey,
  botPhone,
  cloneAnchorId = LIVE_VOICE_ANCHOR_ID,
}: SimpleVoicePickerProps) {
  const { user } = useAuth();
  const ownerId = user?.id ?? null;
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
  const [phoneCall, setPhoneCall] = useState<PhoneCallVoice>(null);
  const [phoneCallReady, setPhoneCallReady] = useState<boolean | null>(null);
  const [clonedVoiceName, setClonedVoiceName] = useState<string | null>(null);
  const [cloneCardEpoch, setCloneCardEpoch] = useState(0);
  // The voice that was live before the last pick, so a mis-tap is one tap to undo.
  const [undoVoice, setUndoVoice] = useState<VoiceOption | null>(null);
  const [sampleVoiceId, setSampleVoiceId] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);
  const sampleUrlRef = useRef<string | null>(null);
  const sampleRequestRef = useRef(0);
  const activeAgentIdRef = useRef(agentId);
  const activeOwnerIdRef = useRef(ownerId);
  const saveOperationRef = useRef(0);

  useLayoutEffect(() => {
    activeAgentIdRef.current = agentId;
    activeOwnerIdRef.current = ownerId;
    saveOperationRef.current += 1;
  }, [agentId, ownerId]);

  useEffect(() => {
    setSavingVoiceId(null);
    setSelectedVoiceId(null);
    setSelectedProvider(null);
    setNotice(null);
    setUndoVoice(null);
    setChoicesOpen(false);
    setPhoneCall(null);
    if (!agentId || !ownerId) {
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
        setPhoneCall(agentData.voice?.phoneCall ?? null);
        setPhoneCallReady(
          typeof agentData.voice?.phoneCallReady === "boolean"
            ? agentData.voice.phoneCallReady
            : null,
        );
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
  }, [agentId, ownerId]);

  function stopSample() {
    sampleRequestRef.current += 1;
    sampleAudioRef.current?.pause();
    sampleAudioRef.current = null;
    if (sampleUrlRef.current) URL.revokeObjectURL(sampleUrlRef.current);
    sampleUrlRef.current = null;
    setSampleVoiceId(null);
    setSampleLoading(false);
  }

  // A sample never keeps playing after the owner switches Bots or leaves.
  useEffect(
    () => () => {
      sampleRequestRef.current += 1;
      sampleAudioRef.current?.pause();
      sampleAudioRef.current = null;
      if (sampleUrlRef.current) URL.revokeObjectURL(sampleUrlRef.current);
      sampleUrlRef.current = null;
      setSampleVoiceId(null);
      setSampleLoading(false);
    },
    [agentId, ownerId],
  );

  async function playSample(voice: VoiceOption) {
    if (sampleVoiceId === voice.id) {
      stopSample();
      return;
    }
    stopSample();
    const request = ++sampleRequestRef.current;
    setSampleVoiceId(voice.id);
    setSampleLoading(true);
    setError(null);
    try {
      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(agentId)}/voice/sample?voice=${encodeURIComponent(voice.id)}`,
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "That sample could not play.");
      }
      const blob = await response.blob();
      if (request !== sampleRequestRef.current) return;
      const url = URL.createObjectURL(blob);
      sampleUrlRef.current = url;
      const audio = new Audio(url);
      sampleAudioRef.current = audio;
      audio.onended = () => {
        if (request === sampleRequestRef.current) stopSample();
      };
      setSampleLoading(false);
      await audio.play();
    } catch (reason) {
      if (request !== sampleRequestRef.current) return;
      stopSample();
      setError(reason instanceof Error ? reason.message : "That sample could not play.");
    }
  }

  async function selectVoice(voice: VoiceOption, options: { undo?: boolean } = {}) {
    if (!agentId || !ownerId || savingVoiceId) return;
    const previousVoice =
      includedVoices.find(
        (candidate) => candidate.id === selectedVoiceId && candidate.provider === selectedProvider,
      ) ?? null;
    const requestedAgentId = agentId;
    const requestedOwnerId = ownerId;
    const saveOperation = ++saveOperationRef.current;
    const isCurrentSave = () =>
      activeAgentIdRef.current === requestedAgentId &&
      activeOwnerIdRef.current === requestedOwnerId &&
      saveOperationRef.current === saveOperation;
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
        customVoiceCleared?: boolean;
        voice?: {
          phoneCallReady?: boolean | null;
          voiceId?: string | null;
          provider?: string | null;
          phoneVoiceId?: string | null;
          phoneVoiceProvider?: string | null;
          phoneCall?: PhoneCallVoice;
        };
      } | null;
      if (!response.ok) throw new Error(body?.error || "Voice could not be saved.");
      if (!isCurrentSave()) return;
      setPhoneCall(body?.voice?.phoneCall ?? null);
      setPhoneCallReady(
        typeof body?.voice?.phoneCallReady === "boolean" ? body.voice.phoneCallReady : null,
      );
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
      if (body?.customVoiceCleared) {
        // The server switched the Bot off its cloned voice; refresh the clone card.
        setClonedVoiceName(null);
        setCloneCardEpoch((epoch) => epoch + 1);
      }
      const shortName = voice.name.split("·")[0].trim();
      if (options.undo) {
        setUndoVoice(null);
        setNotice(`Switched back to ${shortName}. Saved for ${agentName}.`);
      } else {
        setUndoVoice(previousVoice && previousVoice.id !== voice.id ? previousVoice : null);
        setNotice(`Saved. ${shortName} answers ${agentName}'s next call.`);
      }
    } catch (reason) {
      if (isCurrentSave()) {
        setError(reason instanceof Error ? reason.message : "Voice could not be saved.");
      }
    } finally {
      if (isCurrentSave()) setSavingVoiceId(null);
    }
  }

  function scrollToClone() {
    const target = document.getElementById(cloneAnchorId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.focus({ preventScroll: true });
  }

  function renderVoice(voice: VoiceOption) {
    const selected =
      !clonedVoiceName && selectedVoiceId === voice.id && selectedProvider === voice.provider;
    const saving = savingVoiceId === voice.id;
    return (
      <div
        key={`${voice.provider}:${voice.id}`}
        className={`flex min-h-16 min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2.5 transition-colors sm:px-3 ${
          selected ? "border-primary/40 bg-primary/5" : "border-border bg-background"
        }`}
      >
        <button
          type="button"
          onClick={() => void selectVoice(voice)}
          disabled={Boolean(savingVoiceId)}
          aria-pressed={selected}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg text-left wl-focus-ring-halo disabled:cursor-wait disabled:opacity-70"
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
            <span className="block break-words text-sm font-semibold text-foreground">
              {voice.name.split("·")[0].trim()}
            </span>
            <span className="mt-0.5 block break-words text-xs text-muted-foreground">
              {selected ? "Selected" : voice.name.split("·").slice(1).join("·").trim() || "Choose"}
            </span>
          </span>
        </button>
        {phoneCall ? (
          <button
            type="button"
            onClick={() => void playSample(voice)}
            aria-label={`${sampleVoiceId === voice.id ? "Stop" : "Play"} ${voice.name.split("·")[0].trim()} sample`}
            aria-pressed={sampleVoiceId === voice.id}
            className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground wl-focus-ring-halo"
          >
            {sampleVoiceId === voice.id && sampleLoading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : sampleVoiceId === voice.id ? (
              <Square className="size-3.5 fill-current" aria-hidden="true" />
            ) : (
              <Play className="size-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
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
    <div className="min-w-0 space-y-3">
      {ownerId && !clonedVoiceName ? (
        <button
          type="button"
          onClick={scrollToClone}
          className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-left text-sm font-semibold text-foreground transition-colors hover:bg-primary/10 wl-focus-ring-halo"
        >
          <Mic className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">Clone Voice</span>
        </button>
      ) : null}
      <div aria-live="polite">
        {notice ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <StatusNotice tone="success">{notice}</StatusNotice>
            </div>
            {undoVoice ? (
              <button
                type="button"
                onClick={() => void selectVoice(undoVoice, { undo: true })}
                disabled={Boolean(savingVoiceId)}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted wl-focus-ring-halo disabled:cursor-wait disabled:opacity-70"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Undo
                <span className="sr-only">
                  , switch back to {undoVoice.name.split("·")[0].trim()}
                </span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? (
        <StatusNotice tone="destructive" title="Voice Unavailable">
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
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-2.5 py-3 wl-focus-ring-halo sm:px-3">
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-semibold text-foreground">
                {clonedVoiceName
                  ? `Built-In Voice · ${selectedVoice?.name.split("·")[0].trim() || "Choose"}`
                  : selectedVoice
                    ? selectedVoice.name.split("·")[0].trim()
                    : selectedVoiceId
                      ? "Unavailable Voice"
                      : "Choose Voice"}
              </span>
              {selectedVoice ? (
                <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                  {selectedVoice.name.split("·").slice(1).join("·").trim()}
                </span>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="hidden sm:inline">Change Voice</span>
              <ChevronDown
                className="size-4 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </span>
          </summary>
          <div className="min-w-0 space-y-3 border-t border-border p-2 sm:p-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{includedVoices.length} Built-In Voices</span>
              <span>
                {clonedVoiceName ? "Choosing one replaces your clone." : "Saves when you pick."}
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-2">
              {includedVoices.map(renderVoice)}
            </div>
          </div>
        </details>
      )}

      {!loading && !selectedIsAvailable && !clonedVoiceName ? (
        <StatusNotice tone="warning">Choose a voice before the next call.</StatusNotice>
      ) : null}

      <p className="text-xs leading-5 text-muted-foreground">
        {clonedVoiceName
          ? `Callers hear ${clonedVoiceName}. Rehearsals use the built-in voice.`
          : phoneCall && phoneCallReady === false
            ? "Finish phone setup to use this voice."
            : phoneCallVoiceName(phoneCall)
              ? `Callers hear ${phoneCallVoiceName(phoneCall)}, the closest phone voice to your rehearsal voice.`
              : "Used for phone calls and browser rehearsals."}
      </p>
      <button
        type="button"
        onClick={() => setPreviewOpen((open) => !open)}
        disabled={loading || Boolean(savingVoiceId) || !selectedIsAvailable}
        aria-expanded={previewOpen}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted wl-focus-ring-halo"
      >
        <Volume2 className="size-4" aria-hidden="true" />
        {previewOpen ? "Close Rehearsal" : "Rehearse"}
      </button>

      {previewOpen && selectedIsAvailable ? (
        <OpenAILiveVoiceSandbox
          key={`${selectedProvider}:${selectedVoiceId}`}
          agentId={agentId}
          agentName={agentName}
          markKey={markKey}
        />
      ) : null}
      {ownerId ? (
        <LiveVoiceCloneStudio
          key={`live:${ownerId}:${agentId}:${cloneCardEpoch}`}
          agentId={agentId}
          agentName={agentName}
          stockVoiceId={phoneCall?.voice ?? selectedVoiceId}
          botPhone={botPhone}
          anchorId={cloneAnchorId}
          onActiveVoiceChange={setClonedVoiceName}
        />
      ) : null}
      {ownerId ? (
        <VoiceClonePanel
          key={`${ownerId}:${agentId}`}
          ownerId={ownerId}
          agentId={agentId}
          agentName={agentName}
        />
      ) : null}
    </div>
  );
}
