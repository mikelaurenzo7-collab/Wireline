import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { authFetch } from "../lib/api";
import type { BotMarkKey } from "../lib/bot-mark";
import { Badge } from "./atoms";
import OpenAILiveVoiceSandbox from "./OpenAILiveVoiceSandbox";
import TestCallLink from "./voice/TestCallLink";

export function studioVoiceStartId(agentId: string) {
  return `studio-voice-start-${agentId}`;
}

type ActiveClone = { id: string; name: string; speaksOnCalls: boolean };

/** The cloned voice callers hear on this Bot, if any (quietly null on any error). */
function useActiveClone(agentId: string): ActiveClone | null {
  const [active, setActive] = useState<ActiveClone | null>(null);
  useEffect(() => {
    let live = true;
    void authFetch("/api/voice/live-voices", { timeoutMs: 15_000 })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { voices?: Array<ActiveClone & { inUseByAgentIds?: string[] }> } | null) => {
        if (!live) return;
        const voice = body?.voices?.find((item) => item.inUseByAgentIds?.includes(agentId));
        setActive(
          voice ? { id: voice.id, name: voice.name, speaksOnCalls: voice.speaksOnCalls } : null,
        );
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [agentId]);
  return active;
}

export default function StudioVoiceRehearsal({
  agentId,
  agentName,
  markKey,
  phoneNumber,
}: {
  agentId: string;
  agentName: string;
  markKey?: BotMarkKey | null;
  phoneNumber?: string | null;
}) {
  const phone = phoneNumber?.trim();
  const dialable = phone && /^\+?[\d ().-]{7,32}$/.test(phone) ? phone : null;
  const clone = useActiveClone(agentId);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const previewRequest = useRef<AbortController | null>(null);
  const previewGeneration = useRef(0);

  const stop = useCallback(() => {
    previewGeneration.current += 1;
    previewRequest.current?.abort();
    previewRequest.current = null;
    if (audio.current) {
      audio.current.onended = null;
      audio.current.onerror = null;
      audio.current.pause();
    }
    audio.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setPlaying(false);
  }, []);
  useEffect(() => stop, [stop]);

  async function playClone() {
    if (!clone) return;
    if (previewRequest.current) return stop();
    const request = new AbortController();
    const generation = ++previewGeneration.current;
    previewRequest.current = request;
    const isCurrent = () =>
      previewGeneration.current === generation &&
      previewRequest.current === request &&
      !request.signal.aborted;
    setPlaying(true);
    try {
      const params = new URLSearchParams({ variant: "clone", agentName });
      const response = await authFetch(
        `/api/voice/live-voices/${encodeURIComponent(clone.id)}/preview?${params}`,
        { timeoutMs: 30_000, signal: request.signal },
      );
      if (!isCurrent()) return;
      if (!response.ok) throw new Error("preview");
      const blob = await response.blob();
      if (!isCurrent()) return;
      url.current = URL.createObjectURL(blob);
      const element = new Audio(url.current);
      audio.current = element;
      element.onended = element.onerror = () => {
        if (isCurrent()) stop();
      };
      await element.play();
    } catch {
      // A stopped preview may reject after another preview has already started.
      if (isCurrent()) stop();
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 px-3 py-4 sm:px-5">
      {clone ? (
        <div
          className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
          data-testid="rehearsal-voice-label"
        >
          <p className="break-words text-sm leading-5 text-foreground [overflow-wrap:anywhere]">
            Rehearsal speaks in a stock voice.{" "}
            {clone.speaksOnCalls === false ? (
              <>
                Press play to hear <strong>{clone.name}</strong>.
              </>
            ) : (
              <>
                Callers hear <strong>{clone.name}</strong>.
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => void playClone()}
            aria-pressed={playing}
            aria-label={playing ? `Pause Preview: ${clone.name}` : `Hear Voice: ${clone.name}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground hover:bg-muted wl-focus-ring-halo"
          >
            {playing ? (
              <Pause className="size-4" aria-hidden="true" />
            ) : (
              <Play className="size-4" aria-hidden="true" />
            )}
            {playing ? "Pause Preview" : "Hear Voice"}
          </button>
        </div>
      ) : null}
      <OpenAILiveVoiceSandbox
        agentId={agentId}
        agentName={agentName}
        markKey={markKey}
        compact
        startButtonId={studioVoiceStartId(agentId)}
      />
      {dialable ? (
        <div className="space-y-2 rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">Call Your Live Bot</p>
            <Badge variant="warning" className="max-w-full whitespace-normal">
              Actions Enabled
            </Badge>
          </div>
          <TestCallLink phone={dialable} label="Call" />
        </div>
      ) : null}
    </div>
  );
}
