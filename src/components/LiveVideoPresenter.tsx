/**
 * LiveVideoPresenter — renders a LiveAvatar LITE session via the official Web SDK.
 *
 * @see https://www.npmjs.com/package/@heygen/liveavatar-web-sdk
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  AgentEventsEnum,
  LiveAvatarSession,
  SessionEvent,
  SessionState,
} from "@heygen/liveavatar-web-sdk";

import type { LiveAvatarSessionCredentials } from "../lib/video-presenter/types";
import AgentFace from "./AgentFace";

function decodeBase64PcmChunks(chunks: string[]): string {
  let binary = "";
  for (const chunk of chunks) {
    if (!chunk) continue;
    binary += atob(chunk);
  }
  return binary;
}

export type LiveVideoPresenterHandle = {
  streamSample: (chunks: string[], eventId: string) => Promise<void>;
  feedPcmDelta: (base64Pcm: string) => void;
  flushPcm: () => void;
  isControlConnected: () => boolean;
  isStreamReady: () => boolean;
};

const LiveVideoPresenter = forwardRef<
  LiveVideoPresenterHandle,
  {
    credentials: LiveAvatarSessionCredentials;
    fallbackSeed: string;
    agentName: string;
    speaking?: boolean;
    className?: string;
    onSpeakingChange?: (speaking: boolean) => void;
    onRetry?: () => void;
    onStreamReady?: () => void;
  }
>(function LiveVideoPresenter(
  {
    credentials,
    fallbackSeed,
    agentName,
    speaking = false,
    className = "",
    onSpeakingChange,
    onRetry,
    onStreamReady: onStreamReadyChange,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<LiveAvatarSession | null>(null);
  const pcmAccumRef = useRef("");
  const [streamReady, setStreamReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lipSyncActive, setLipSyncActive] = useState(false);

  const flushAccumulatedPcm = (force = false) => {
    const session = sessionRef.current;
    if (!session || session.state !== SessionState.CONNECTED) return;
    const minBytes = 4_800;
    if (!force && pcmAccumRef.current.length < minBytes) return;
    if (!pcmAccumRef.current) return;
    session.repeatAudio(pcmAccumRef.current);
    pcmAccumRef.current = "";
  };

  useEffect(() => {
    setFailed(false);
    setStreamReady(false);
    setLipSyncActive(false);
    pcmAccumRef.current = "";

    if (!credentials.sessionToken?.trim()) {
      setFailed(true);
      return;
    }

    const session = new LiveAvatarSession(credentials.sessionToken, {
      voiceChat: false,
    });
    sessionRef.current = session;
    let cancelled = false;

    const handleStreamReady = () => {
      if (cancelled || !videoRef.current) return;
      setStreamReady(true);
      onStreamReadyChange?.();
      session.attach(videoRef.current);
      videoRef.current.muted = true;
    };

    const onSpeakStarted = () => {
      setLipSyncActive(true);
      onSpeakingChange?.(true);
    };

    const onSpeakEnded = () => {
      setLipSyncActive(false);
      onSpeakingChange?.(false);
    };

    session.on(SessionEvent.SESSION_STREAM_READY, handleStreamReady);
    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, onSpeakStarted);
    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, onSpeakEnded);
    session.on(SessionEvent.SESSION_DISCONNECTED, () => {
      if (!cancelled) setFailed(true);
    });

    void session.start().catch(() => {
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
      session.off(SessionEvent.SESSION_STREAM_READY, handleStreamReady);
      session.off(AgentEventsEnum.AVATAR_SPEAK_STARTED, onSpeakStarted);
      session.off(AgentEventsEnum.AVATAR_SPEAK_ENDED, onSpeakEnded);
      void session.stop().catch(() => undefined);
      sessionRef.current = null;
    };
  }, [credentials.sessionToken, onSpeakingChange, onStreamReadyChange]);

  useImperativeHandle(ref, () => ({
    async streamSample(chunks: string[], _eventId: string) {
      const session = sessionRef.current;
      if (!session || session.state !== SessionState.CONNECTED) {
        throw new Error("Live presenter is not connected yet.");
      }
      const pcm = decodeBase64PcmChunks(chunks);
      if (!pcm) {
        throw new Error("Voice sample did not include playable audio.");
      }
      session.repeatAudio(pcm);
    },
    feedPcmDelta(base64Pcm: string) {
      if (!base64Pcm) return;
      try {
        pcmAccumRef.current += atob(base64Pcm);
        flushAccumulatedPcm(false);
      } catch {
        /* ignore malformed deltas */
      }
    },
    flushPcm() {
      flushAccumulatedPcm(true);
    },
    isControlConnected: () => sessionRef.current?.state === SessionState.CONNECTED,
    isStreamReady: () => streamReady,
  }));

  const showSpeaking = speaking || lipSyncActive;

  if (failed) {
    return (
      <div className={`wl-presence__frame wl-presence__frame--ink ${className}`.trim()}>
        <div className="wl-presence__face">
          <AgentFace
            seed={fallbackSeed}
            size={120}
            speaking={showSpeaking}
            title={`${agentName} face`}
          />
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="absolute bottom-3 left-1/2 z-[2] -translate-x-1/2 rounded-lg border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-3 py-1.5 text-[11px] font-semibold text-foreground hover:border-[var(--wireline-color-action-primary-default)]"
          >
            Retry live presenter
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`wl-presence__frame wl-presence__frame--ink wl-presence-live ${className}`.trim()}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="wl-presence-live__video"
        aria-label={`${agentName} live video presenter`}
      />
      {!streamReady ? (
        <div className="wl-presence-live__loading" aria-busy="true">
          Connecting live presenter…
        </div>
      ) : null}
    </div>
  );
});

export default LiveVideoPresenter;
