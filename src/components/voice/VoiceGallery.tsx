import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, Sparkles } from "lucide-react";

import { Badge, Button } from "../atoms";
import { StatusNotice } from "../molecules";
import { authFetch } from "../../lib/api";
import {
  normalizeApiVoices,
  playVoicePreview,
  providerLabel,
  resolveVoiceLabel,
  VAPI_CURATED_VOICES,
  voiceFamilyLabel,
  WIRELINE_LIVE_VOICES,
  type VoiceOption,
} from "../../lib/voice-catalog";
import { VoicePreviewButton } from "../DeployAgentModal";

type VoiceGalleryProps = {
  agentId: string;
  agentName?: string;
  className?: string;
  /** Studio deep editor — denser layout, no page chrome. */
  embedded?: boolean;
  searchInputId?: string;
};

export default function VoiceGallery({
  agentId,
  agentName,
  className = "",
  embedded = false,
  searchInputId,
}: VoiceGalleryProps) {
  const [libraryVoices, setLibraryVoices] = useState<VoiceOption[]>([]);
  const [catalogReady, setCatalogReady] = useState(true);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingSelection, setLoadingSelection] = useState(true);
  const [voiceSearch, setVoiceSearch] = useState("");
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [applyingVoiceId, setApplyingVoiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setLoadingSelection(true);
    authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setSelectedVoiceId(data.voice?.voiceId ?? null);
        setSelectedProvider(data.voice?.provider ?? null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the current voice for this agent.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSelection(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(() => {
    let cancelled = false;
    setLoadingCatalog(true);
    authFetch("/api/voices")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        setLibraryVoices(normalizeApiVoices(data?.voices));
        setCatalogReady(data?.configured !== false);
      })
      .catch(() => {
        if (!cancelled) setLibraryVoices([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredLive = useMemo(
    () =>
      WIRELINE_LIVE_VOICES.filter(
        (voice) => !voiceSearch || voice.name.toLowerCase().includes(voiceSearch.toLowerCase()),
      ),
    [voiceSearch],
  );

  const filteredPhone = useMemo(
    () =>
      VAPI_CURATED_VOICES.filter(
        (voice) => !voiceSearch || voice.name.toLowerCase().includes(voiceSearch.toLowerCase()),
      ),
    [voiceSearch],
  );

  const filteredLibrary = useMemo(
    () =>
      libraryVoices.filter(
        (voice) => !voiceSearch || voice.name.toLowerCase().includes(voiceSearch.toLowerCase()),
      ),
    [libraryVoices, voiceSearch],
  );

  function playVoice(voice: VoiceOption) {
    if (playingVoiceId === voice.id) {
      window.speechSynthesis?.cancel?.();
      setPlayingVoiceId(null);
      return;
    }
    setPlayingVoiceId(voice.id);
    playVoicePreview(voice, () => setPlayingVoiceId(null));
  }

  async function applyVoice(voice: VoiceOption) {
    if (!agentId) return;
    setApplyingVoiceId(voice.id);
    setError(null);
    setNotice(null);
    try {
      const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}/voice`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId: voice.id,
          provider: voice.provider,
        }),
      });
      if (!response.ok) throw new Error("Voice could not be saved.");
      setSelectedVoiceId(voice.id);
      setSelectedProvider(voice.provider);
      setNotice(`${voice.name} is now assigned to ${agentName || "this agent"}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Voice could not be saved.");
    } finally {
      setApplyingVoiceId(null);
    }
  }

  const currentLabel = resolveVoiceLabel(selectedVoiceId);
  const searchId = searchInputId ?? (embedded ? "voice-search" : undefined);

  return (
    <div className={`flex flex-col ${embedded ? "gap-3" : "gap-5"} ${className}`}>
      {!embedded ? (
        <section className="studio-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="wl-overline">Current</p>
              {loadingSelection ? (
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Loading…
                </div>
              ) : (
                <>
                  <p className="mt-2 font-[var(--wireline-font-family-display)] text-2xl tracking-[-0.02em] text-foreground">
                    {currentLabel}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {providerLabel(selectedProvider)}
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {notice ? (
        <StatusNotice tone="success" title="Voice updated">
          {notice}
        </StatusNotice>
      ) : null}
      {error ? (
        <StatusNotice tone="destructive" title="Voice unavailable">
          {error}
        </StatusNotice>
      ) : null}

      <section className={embedded ? "" : "studio-card p-5 sm:p-6"}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          {!embedded ? <p className="wl-overline">Gallery</p> : null}
          <label
            className={`grid w-full gap-1.5 ${embedded ? "sm:ml-auto sm:max-w-xs" : "max-w-xs sm:w-auto"}`}
            htmlFor={searchId}
          >
            {!embedded ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Search
              </span>
            ) : (
              <span className="sr-only">Search voices</span>
            )}
            <input
              id={searchId}
              type="search"
              value={voiceSearch}
              onChange={(event) => setVoiceSearch(event.target.value)}
              placeholder="Filter voices…"
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>
        </div>

        <div className={`grid gap-5 ${embedded ? "mt-4" : "mt-6"} lg:grid-cols-2`}>
          <div>
            <div className="mb-3 flex items-center justify-center gap-2 lg:justify-start">
              <Sparkles size={14} className="text-primary" aria-hidden="true" />
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Wireline Live
              </p>
              <Badge variant="outline">Built-in</Badge>
            </div>
            <div className="grid gap-2">
              {filteredLive.map((voice) => {
                const isSelected = selectedVoiceId === voice.id;
                const isPlaying = playingVoiceId === voice.id;
                const isApplying = applyingVoiceId === voice.id;
                return (
                  <div
                    key={voice.id}
                    className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                      isSelected ? "border-primary/30 bg-primary/5" : "border-border bg-background"
                    }`}
                  >
                    <div className="min-w-0 text-left">
                      <p className="text-sm font-semibold text-foreground">{voice.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {voiceFamilyLabel(voice.provider)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => playVoice(voice)}
                      >
                        <Play size={12} aria-hidden="true" />
                        {isPlaying ? "Stop" : "Preview"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={isApplying}
                        onClick={() => void applyVoice(voice)}
                      >
                        {isApplying ? "Saving…" : isSelected ? "Selected" : "Use"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Wireline Phone
              </p>
              <Badge variant="outline">Line included</Badge>
            </div>
            <div className="mb-5 grid max-h-40 gap-2 overflow-y-auto pr-1">
              {filteredPhone.map((voice) => {
                const isSelected = selectedVoiceId === voice.id;
                const isPlaying = playingVoiceId === voice.id;
                const isApplying = applyingVoiceId === voice.id;
                return (
                  <div
                    key={`phone-${voice.id}`}
                    className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                      isSelected ? "border-primary/30 bg-primary/5" : "border-border bg-background"
                    }`}
                  >
                    <div className="min-w-0 text-left">
                      <p className="text-sm font-semibold text-foreground">{voice.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {voiceFamilyLabel(voice.provider)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => playVoice(voice)}
                      >
                        <Play size={12} aria-hidden="true" />
                        {isPlaying ? "Stop" : "Preview"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={isApplying}
                        onClick={() => void applyVoice(voice)}
                      >
                        {isApplying ? "Saving…" : isSelected ? "Selected" : "Use"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Wireline Voice library
              </p>
              {!catalogReady ? (
                <Badge variant="warning">Library offline</Badge>
              ) : (
                <Badge variant="outline">Live catalog</Badge>
              )}
            </div>
            <div
              className={
                embedded
                  ? "max-h-48 space-y-2 overflow-y-auto pr-1"
                  : "max-h-[360px] space-y-2 overflow-y-auto pr-1"
              }
            >
              {loadingCatalog ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Loading voice library…
                </div>
              ) : filteredLibrary.length ? (
                filteredLibrary.map((voice) => {
                  const isSelected = selectedVoiceId === voice.id;
                  const isApplying = applyingVoiceId === voice.id;
                  return (
                    <div
                      key={voice.id}
                      className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                        isSelected
                          ? "border-primary/30 bg-primary/5"
                          : "border-border bg-background"
                      }`}
                    >
                      <div className="min-w-0 text-left">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {voice.name}
                          {voice.owned_by_user ? (
                            <span className="ml-2 text-[10px] font-medium text-primary">
                              Your clone
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">Wireline Voice · Flash</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <VoicePreviewButton voiceId={voice.id} voiceName={voice.name} />
                        <Button
                          type="button"
                          size="sm"
                          disabled={isApplying}
                          onClick={() => void applyVoice(voice)}
                        >
                          {isApplying ? "Saving…" : isSelected ? "Selected" : "Use"}
                        </Button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  {catalogReady
                    ? "No Wireline Voice options matched your search."
                    : "The expanded voice library is unavailable right now. Wireline Live voices still work."}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
