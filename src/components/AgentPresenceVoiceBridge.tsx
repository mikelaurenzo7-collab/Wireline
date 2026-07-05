/**
 * Knowledge Simulator — live voice test with optional LiveAvatar lip-sync.
 *
 * When live video is enabled for the agent, a presenter session starts in the
 * background and agent PCM from LiveVoiceSandbox is piped into repeatAudio().
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { authFetch } from "../lib/api";
import type {
  AgentVideoPresenterConfig,
  LiveAvatarSessionCredentials,
  VideoPresenterSessionResponse,
} from "../lib/video-presenter/types";
import AgentPresenceSlot from "./AgentPresenceSlot";
import LiveVideoPresenter, { type LiveVideoPresenterHandle } from "./LiveVideoPresenter";
import LiveVoiceSandbox from "./LiveVoiceSandbox";

type PresenterPayload = {
  presenter: AgentVideoPresenterConfig;
  fallbackSeed: string;
};

export default function AgentPresenceVoiceBridge({
  agentId,
  agentName,
  role,
  isBusinessAgent = false,
}: {
  agentId: string;
  agentName: string;
  role?: string | null;
  isBusinessAgent?: boolean;
}) {
  const liveRef = useRef<LiveVideoPresenterHandle>(null);
  const [loading, setLoading] = useState(true);
  const [presenterState, setPresenterState] = useState<PresenterPayload | null>(null);
  const [session, setSession] = useState<{
    live: LiveAvatarSessionCredentials;
    fallbackSeed: string;
  } | null>(null);
  const [lipSyncReady, setLipSyncReady] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const liveVideoActive =
    isBusinessAgent &&
    presenterState?.presenter.provider !== "synthetic" &&
    presenterState?.presenter.status === "ready";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void authFetch(`/api/agents/${encodeURIComponent(agentId)}/video-presenter`)
      .then(async (response) => {
        const payload = (await response.json()) as PresenterPayload;
        if (!cancelled && response.ok) setPresenterState(payload);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const connectSession = useCallback(async () => {
    if (!liveVideoActive || session || connecting) return;
    setConnecting(true);
    try {
      const response = await authFetch(
        `/api/agents/${encodeURIComponent(agentId)}/video-presenter/session`,
        { method: "POST" },
      );
      const payload = (await response.json()) as VideoPresenterSessionResponse;
      if (response.ok && payload.configured && payload.live) {
        setSession({ live: payload.live, fallbackSeed: payload.fallbackSeed });
      }
    } catch {
      /* lip-sync is optional — voice test still works */
    } finally {
      setConnecting(false);
    }
  }, [agentId, connecting, liveVideoActive, session]);

  useEffect(() => {
    if (liveVideoActive) void connectSession();
  }, [connectSession, liveVideoActive]);

  const onAgentAudioDelta = useCallback((base64Pcm: string) => {
    liveRef.current?.feedPcmDelta(base64Pcm);
  }, []);

  const onAgentAudioEnd = useCallback(() => {
    liveRef.current?.flushPcm();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Loading presence…
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,220px)_1fr] lg:items-start">
      <div className="wl-presence wl-presence--stage mx-auto w-full max-w-[220px] lg:mx-0">
        {session ? (
          <LiveVideoPresenter
            ref={liveRef}
            credentials={session.live}
            fallbackSeed={session.fallbackSeed}
            agentName={agentName}
            onStreamReady={() => setLipSyncReady(true)}
          />
        ) : (
          <AgentPresenceSlot
            name={agentName}
            agentId={agentId}
            role={role}
            isBusinessAgent={isBusinessAgent}
            variant="stage"
            showWaveform
            presenter={presenterState?.presenter}
          />
        )}
        {liveVideoActive && session && !lipSyncReady ? (
          <p className="mt-2 text-center text-[10px] text-muted-foreground">Connecting lip-sync…</p>
        ) : liveVideoActive && lipSyncReady ? (
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            Voice drives lip-sync on video during this test.
          </p>
        ) : null}
      </div>
      <LiveVoiceSandbox
        agentId={agentId}
        agentName={agentName}
        onAgentAudioDelta={session && lipSyncReady ? onAgentAudioDelta : undefined}
        onAgentAudioEnd={session && lipSyncReady ? onAgentAudioEnd : undefined}
      />
    </div>
  );
}
