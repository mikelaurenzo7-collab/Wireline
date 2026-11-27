import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Play, RotateCcw, Square, Volume2 } from "lucide-react";

import { authFetch } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import type { BotMarkKey } from "../../lib/bot-mark";
import { OPENAI_REALTIME_VOICES } from "../../lib/voice-catalog";
import { PHONE_VOICES, PHONE_VOICE_PROVIDER, phoneVoiceDescription } from "../../lib/phone-voices";
import OpenAILiveVoiceSandbox from "../OpenAILiveVoiceSandbox";
import { StatusNotice } from "../molecules";
import LiveVoiceCloneStudio, { LIVE_VOICE_ANCHOR_ID } from "./LiveVoiceCloneStudio";
import VoiceClonePanel from "./VoiceClonePanel";
import PhoneVoiceCatalog from "./PhoneVoiceCatalog";
import CallDeliverySettings, {
  type CallDeliveryView,
  type GreetingPreview,
} from "./CallDeliverySettings";
import type { CatalogPhoneVoice } from "../../lib/phone-voice-catalog";

type SimpleVoicePickerProps = {
  agentId: string;
  agentName: string;
  markKey?: BotMarkKey | null;
  /** The Bot's phone number, so owners can place a test call after cloning. */
  botPhone?: string | null;
};

/** The voice callers actually hear when phone calls run on another provider. */
type PhoneCallVoice = { provider: string; voice: string } | null;

/** One built-in voice in the list. Its name reads "Carina · Soft & Soothing". */
type PickerVoice = {
  id: string;
  name: string;
  provider: "openai" | typeof PHONE_VOICE_PROVIDER;
  gender?: "female" | "male" | "neutral";
};

/** The saved ten, listed when calls cannot speak the phone catalog. */
const SAVED_VOICES: readonly PickerVoice[] = OPENAI_REALTIME_VOICES.map(({ id, name, gender }) => ({
  id,
  name,
  provider: "openai",
  gender,
}));
/** Every built-in phone voice, each picked by its own name. */
const PHONE_CATALOG_VOICES: readonly PickerVoice[] = PHONE_VOICES.map((voice) => ({
  id: voice.id,
  name: `${voice.name} · ${phoneVoiceDescription(voice)}`,
  provider: PHONE_VOICE_PROVIDER,
  gender: voice.gender,
}));

const VOICE_FILTERS = [
  { id: "all", label: "All" },
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
] as const;
type VoiceFilter = (typeof VOICE_FILTERS)[number]["id"];

/**
 * Query for a sample that sounds like the call. It changes whenever the saved
 * pace or pronunciations do, so a replayed sample is never a stale one.
 */
function sampleDeliveryQuery(delivery: CallDeliveryView | null): string {
  if (!delivery) return "";
  let hash = 0;
  for (const char of JSON.stringify([delivery.speakingRate, delivery.pronunciations]))
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `&pace=${delivery.speakingRate}&rev=${(hash >>> 0).toString(36)}`;
}

type AgentVoiceResponse = {
  voice?: {
    voiceId?: string | null;
    provider?: string | null;
    phoneVoiceId?: string | null;
    phoneVoiceProvider?: string | null;
    phoneCall?: PhoneCallVoice;
    phoneCallReady?: boolean | null;
    catalogVoice?: CatalogPhoneVoice | null;
    /** Whether calls can speak the phone catalog at all. */
    phoneVoiceCatalog?: boolean;
    /** The catalog voice in effect; absent when the saved voice has no certain match. */
    phoneVoice?: string | null;
    delivery?: CallDeliveryView | null;
    greeting?: GreetingPreview | null;
    /** Rehearsal speaks the same stock phone voice callers hear. */
    rehearsalHearsPhoneVoice?: boolean;
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
}: SimpleVoicePickerProps) {
  const { user } = useAuth();
  const ownerId = user?.id ?? null;
  const [phoneCatalog, setPhoneCatalog] = useState(false);
  const [voiceFilter, setVoiceFilter] = useState<VoiceFilter>("all");
  const [delivery, setDelivery] = useState<CallDeliveryView | null>(null);
  const [greeting, setGreeting] = useState<GreetingPreview | null>(null);
  const builtInVoices = phoneCatalog ? PHONE_CATALOG_VOICES : SAVED_VOICES;
  const visibleVoices = useMemo(
    () =>
      voiceFilter === "all"
        ? builtInVoices
        : builtInVoices.filter((voice) => voice.gender === voiceFilter),
    [builtInVoices, voiceFilter],
  );
  const voiceListRef = useRef<HTMLDivElement | null>(null);
  const greetingReadAt = useRef(0);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingVoiceId, setSavingVoiceId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [phoneCall, setPhoneCall] = useState<PhoneCallVoice>(null);
  const [phoneCallReady, setPhoneCallReady] = useState<boolean | null>(null);
  const [rehearsalHearsPhoneVoice, setRehearsalHearsPhoneVoice] = useState(false);
  const [clonedVoiceName, setClonedVoiceName] = useState<string | null>(null);
  const [catalogVoice, setCatalogVoice] = useState<CatalogPhoneVoice | null>(null);
  const handleActiveClone = useCallback((name: string | null) => {
    setClonedVoiceName(name);
    if (name) setCatalogVoice(null);
  }, []);
  const [cloneCardEpoch, setCloneCardEpoch] = useState(0);
  // The voice that was live before the last pick, so a mis-tap is one tap to undo.
  const [undoVoice, setUndoVoice] = useState<PickerVoice | null>(null);
  const [sampleVoiceId, setSampleVoiceId] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleNeedsTap, setSampleNeedsTap] = useState(false);
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
    setPhoneCall(null);
    setRehearsalHearsPhoneVoice(false);
    setCatalogVoice(null);
    setPhoneCatalog(false);
    setVoiceFilter("all");
    setDelivery(null);
    setGreeting(null);
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
        // Calls that can speak the phone catalog list it, with the voice in effect selected.
        const phoneVoice = PHONE_CATALOG_VOICES.find(
          (voice) => voice.id === agentData.voice?.phoneVoice?.trim().toLowerCase(),
        );
        setPhoneCatalog(agentData.voice?.phoneVoiceCatalog === true);
        setDelivery(agentData.voice?.delivery ?? null);
        setGreeting(agentData.voice?.greeting ?? null);
        setSelectedVoiceId(phoneVoice?.id ?? managedVoice?.id ?? storedVoiceId);
        setPhoneCall(agentData.voice?.phoneCall ?? null);
        setRehearsalHearsPhoneVoice(agentData.voice?.rehearsalHearsPhoneVoice === true);
        setCatalogVoice(agentData.voice?.catalogVoice ?? null);
        setPhoneCallReady(
          typeof agentData.voice?.phoneCallReady === "boolean"
            ? agentData.voice.phoneCallReady
            : null,
        );
        setSelectedProvider(
          phoneVoice
            ? phoneVoice.provider
            : managedVoice && (!storedProvider || storedProvider === "openai")
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
    setSampleNeedsTap(false);
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
      setSampleNeedsTap(false);
    },
    [agentId, ownerId],
  );

  async function startLoadedSample(audio: HTMLAudioElement, request: number) {
    setSampleNeedsTap(false);
    try {
      await audio.play();
    } catch (reason) {
      if (request !== sampleRequestRef.current) return;
      if (reason instanceof DOMException && reason.name === "NotAllowedError") {
        // The fetch can outlast the browser's activation window. Keep the audio
        // ready so the next click can play it immediately without another fetch.
        setSampleNeedsTap(true);
        return;
      }
      stopSample();
      setError("That sample could not play. Try again.");
    }
  }

  async function playSample(voice: PickerVoice) {
    if (sampleVoiceId === voice.id) {
      if (sampleNeedsTap && sampleAudioRef.current) {
        await startLoadedSample(sampleAudioRef.current, sampleRequestRef.current);
      } else {
        stopSample();
      }
      return;
    }
    stopSample();
    const request = ++sampleRequestRef.current;
    setSampleVoiceId(voice.id);
    setSampleLoading(true);
    setError(null);
    try {
      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(agentId)}/voice/sample?voice=${encodeURIComponent(voice.id)}&provider=${voice.provider}${sampleDeliveryQuery(delivery)}`,
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
      await startLoadedSample(audio, request);
    } catch (reason) {
      if (request !== sampleRequestRef.current) return;
      stopSample();
      setError(reason instanceof Error ? reason.message : "That sample could not play.");
    }
  }

  async function selectVoice(voice: PickerVoice, options: { undo?: boolean } = {}) {
    if (!agentId || !ownerId || savingVoiceId) return;
    const previousVoice =
      builtInVoices.find(
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
          body: JSON.stringify({ voiceId: voice.id, provider: voice.provider }),
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
          phoneVoice?: string | null;
          rehearsalHearsPhoneVoice?: boolean;
        };
      } | null;
      if (!response.ok) throw new Error(body?.error || "Voice could not be saved.");
      if (!isCurrentSave()) return;
      setCatalogVoice(null);
      setPhoneCall(body?.voice?.phoneCall ?? null);
      setRehearsalHearsPhoneVoice(body?.voice?.rehearsalHearsPhoneVoice === true);
      setPhoneCallReady(
        typeof body?.voice?.phoneCallReady === "boolean" ? body.voice.phoneCallReady : null,
      );
      const savedPrimaryProvider = body?.voice?.provider?.trim().toLowerCase() || null;
      const savedPrimaryVoiceId = body?.voice?.voiceId?.trim() || null;
      const savedWithPhoneFallback = savedPrimaryProvider === "presenter";
      // A phone catalog pick is the voice itself; the saved voice behind it is its backup.
      const pickedByName = voice.provider === PHONE_VOICE_PROVIDER;
      setSelectedVoiceId(
        pickedByName
          ? voice.id
          : savedWithPhoneFallback
            ? (body?.voice?.phoneVoiceId ?? voice.id)
            : (savedPrimaryVoiceId ?? voice.id),
      );
      setSelectedProvider(
        pickedByName
          ? voice.provider
          : savedWithPhoneFallback
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

  // The greeting's words and the recording setting are edited elsewhere on
  // this page, so the two openings are read again whenever the owner opens the
  // panel or comes back to them, at most once every few seconds.
  function refreshGreeting() {
    if (Date.now() - greetingReadAt.current < 3_000) return;
    greetingReadAt.current = Date.now();
    const requestedAgentId = agentId;
    authFetch(`/api/agent-config/${encodeURIComponent(requestedAgentId)}`)
      .then(async (response) =>
        response.ok ? ((await response.json()) as AgentVoiceResponse) : null,
      )
      .then((agentData) => {
        if (agentData?.voice?.greeting && activeAgentIdRef.current === requestedAgentId)
          setGreeting(agentData.voice.greeting);
      })
      .catch(() => undefined);
  }

  function renderVoice(voice: PickerVoice) {
    const selected =
      !clonedVoiceName &&
      !catalogVoice &&
      selectedVoiceId === voice.id &&
      selectedProvider === voice.provider;
    const saving = savingVoiceId === voice.id;
    const sampleActive = sampleVoiceId === voice.id && !sampleNeedsTap;
    return (
      <div
        key={`${voice.provider}:${voice.id}`}
        data-selected={selected || undefined}
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
            aria-label={`${sampleActive ? "Stop" : "Play"} ${voice.name.split("·")[0].trim()} sample`}
            aria-pressed={sampleActive}
            className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground wl-focus-ring-halo"
          >
            {sampleActive && sampleLoading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : sampleActive ? (
              <Square className="size-3.5 fill-current" aria-hidden="true" />
            ) : (
              <Play className="size-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
    );
  }

  const selectedVoice = builtInVoices.find(
    (voice) => voice.id === selectedVoiceId && voice.provider === selectedProvider,
  );
  const selectedIsAvailable = Boolean(selectedVoice);

  // The long list opens on the voice in use, without moving the page around it.
  useEffect(() => {
    const list = voiceListRef.current;
    const card = list?.querySelector<HTMLElement>("[data-selected]");
    if (list && card) list.scrollTop = Math.max(0, card.offsetTop - 8);
  }, [loading, phoneCatalog]);

  return (
    <div className="min-w-0 space-y-3">
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
      {sampleNeedsTap ? (
        <StatusNotice tone="info">The sample is ready. Select Play again to listen.</StatusNotice>
      ) : null}

      {loading ? (
        <div className="flex min-h-24 items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading…
        </div>
      ) : (
        // Every built-in voice is listed in view: owners looking for "a voice"
        // must find the catalog first, with cloning offered after it.
        <section
          aria-labelledby={`voice-choices-${agentId}`}
          className="min-w-0 space-y-3 rounded-xl border border-border bg-background p-2 sm:p-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-0.5">
            <div className="min-w-0 flex-1">
              <h4
                id={`voice-choices-${agentId}`}
                className="break-words text-sm font-semibold text-foreground"
              >
                {clonedVoiceName || catalogVoice
                  ? `Built-In Voice · ${selectedVoice?.name.split("·")[0].trim() || "Choose"}`
                  : selectedVoice
                    ? `Voice · ${selectedVoice.name.split("·")[0].trim()}`
                    : selectedVoiceId
                      ? "Unavailable Voice"
                      : "Choose a Voice"}
              </h4>
              {selectedVoice ? (
                <p className="mt-0.5 break-words text-xs text-muted-foreground">
                  {selectedVoice.name.split("·").slice(1).join("·").trim()}
                </p>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {builtInVoices.length} Built-In Voices ·{" "}
              {clonedVoiceName ? "Choosing one replaces your clone." : "Saves when you pick."}
            </p>
          </div>
          {phoneCatalog ? (
            <div role="group" aria-label="Filter Voices" className="flex flex-wrap gap-1.5">
              {VOICE_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={voiceFilter === filter.id}
                  onClick={() => setVoiceFilter(filter.id)}
                  className={`min-h-11 rounded-full border px-4 text-xs font-semibold transition-colors wl-focus-ring-halo ${
                    voiceFilter === filter.id
                      ? "border-primary/40 bg-primary/5 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          ) : null}
          <div
            ref={voiceListRef}
            className={`grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-2 ${
              // The padding keeps a card's focus ring from being cut off at the list's edge.
              phoneCatalog
                ? "relative -mx-1 max-h-[26rem] overflow-y-auto overscroll-contain p-1"
                : ""
            }`}
          >
            {visibleVoices.map(renderVoice)}
          </div>
        </section>
      )}

      {!loading && ownerId ? (
        <PhoneVoiceCatalog
          key={`catalog:${ownerId}:${agentId}`}
          agentId={agentId}
          selected={catalogVoice}
          onSelected={(voice) => {
            stopSample();
            setCatalogVoice(voice);
            setClonedVoiceName(null);
            setUndoVoice(null);
            setNotice("Phone Voice Saved.");
            setCloneCardEpoch((epoch) => epoch + 1);
          }}
        />
      ) : null}

      {!loading && ownerId && phoneCatalog && delivery ? (
        <CallDeliverySettings
          key={`delivery:${ownerId}:${agentId}`}
          agentId={agentId}
          agentName={agentName}
          initial={delivery}
          onSaved={(saved) => {
            stopSample();
            setDelivery(saved);
          }}
          otherVoiceAnswers={Boolean(catalogVoice || clonedVoiceName)}
          greeting={greeting}
          onOpen={refreshGreeting}
          sample={
            selectedVoice && phoneCall && !clonedVoiceName && !catalogVoice
              ? {
                  playing: sampleVoiceId === selectedVoice.id && !sampleNeedsTap,
                  loading: sampleVoiceId === selectedVoice.id && sampleLoading,
                  toggle: () => void playSample(selectedVoice),
                }
              : null
          }
        />
      ) : null}

      {!loading && !selectedIsAvailable && !clonedVoiceName && !catalogVoice ? (
        <StatusNotice tone="warning">Choose a voice before the next call.</StatusNotice>
      ) : null}

      <p className="text-xs leading-5 text-muted-foreground">
        {catalogVoice
          ? `Callers Hear ${catalogVoice.name}. Rehearsal Uses Your Built-In Voice.`
          : clonedVoiceName
            ? `Callers hear ${clonedVoiceName}. Rehearsals use the built-in voice.`
            : phoneCall && phoneCallReady === false
              ? "Finish phone setup to use this voice."
              : phoneCallVoiceName(phoneCall)
                ? rehearsalHearsPhoneVoice
                  ? `Callers and rehearsals hear ${phoneCallVoiceName(phoneCall)}.`
                  : `Callers hear ${phoneCallVoiceName(phoneCall)}, the closest phone voice to your rehearsal voice.`
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
          anchorId={LIVE_VOICE_ANCHOR_ID}
          onActiveVoiceChange={handleActiveClone}
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
