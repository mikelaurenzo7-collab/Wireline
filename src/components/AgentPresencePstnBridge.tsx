/**
 * PSTN / Vapi live-call lip-sync — pipes Vapi listenUrl PCM into LiveAvatar LITE.
 *
 * Browser connects to our authenticated supervisor listen WebSocket, which relays
 * binary frames from Vapi's monitor.listenUrl stored on signal_presence.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { authFetch } from "../lib/api";
import { vapiListenPcmToLiveAvatarBase64 } from "../lib/voice/pcm-resample";
import type {
  AgentVideoPresenterConfig,
  LiveAvatarSessionCredentials,
  VideoPresenterSessionResponse,
} from "../lib/video-presenter/types";
import AgentPresenceSlot from "./AgentPresenceSlot";
import LiveVideoPresenter, { type LiveVideoPresenterHandle } from "./LiveVideoPresenter";

type PresenterPayload = {
  presenter: AgentVideoPresenterConfig;
  fallbackSeed: string;
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return vapiListenPcmToLiveAvatarBase64(buffer);
}

function listenWebSocketUrl(vapiCallId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({ callId: vapiCallId, mode: "listen" });
  return `${proto}//${window.location.host}/api/supervisor/stream?${params.toString()}`;
}

export default function AgentPresencePstnBridge({
  vapiCallId,
  agentId,
  agentName,
  isBusinessAgent = true,
  compact = false,
}: {
  vapiCallId: string;
  agentId: string;
  agentName: string;
  isBusinessAgent?: boolean;
  compact?: boolean;
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
      /* optional lip-sync */
    } finally {
      setConnecting(false);
    }
  }, [agentId, connecting, liveVideoActive, session]);

  useEffect(() => {
    if (liveVideoActive) void connectSession();
  }, [connectSession, liveVideoActive]);

  const onPcmDelta = useCallback((base64Pcm: string) => {
    liveRef.current?.feedPcmDelta(base64Pcm);
  }, []);

  useEffect(() => {
    if (!liveVideoActive || !session || !lipSyncReady || !vapiCallId) return;

    const ws = new WebSocket(listenWebSocketUrl(vapiCallId));
    ws.binaryType = "arraybuffer";
    const presenter = liveRef.current;

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        onPcmDelta(arrayBufferToBase64(event.data));
      }
    };

    ws.onclose = () => {
      presenter?.flushPcm();
    };

    return () => {
      presenter?.flushPcm();
      ws.close();
    };
  }, [liveVideoActive, lipSyncReady, onPcmDelta, session, vapiCallId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Loading live presenter…
      </div>
    );
  }

  const frameClass = compact
    ? "wl-presence wl-presence--inline mx-auto w-full max-w-[140px]"
    : "wl-presence wl-presence--stage mx-auto w-full max-w-[220px]";

  return (
    <div className={frameClass}>
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
          isBusinessAgent={isBusinessAgent}
          variant={compact ? "inline" : "stage"}
          showWaveform
          presenter={presenterState?.presenter}
        />
      )}
      {liveVideoActive && session && lipSyncReady ? (
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Live call audio drives lip-sync.
        </p>
      ) : null}
    </div>
  );
}
