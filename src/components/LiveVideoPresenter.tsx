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

import {
  sessionExpectsWirelineAudio,
  type LiveAvatarSessionCredentials,
} from "../lib/video-presenter/types";
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
  streamSampleBinary: (pcmBinary: string, eventId: string) => Promise<void>;
  feedPcmDelta: (base64Pcm: string) => void;
  flushPcm: () => void;
  stop: () => Promise<void>;
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
    layout?: "portrait" | "stage";
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
    layout = "portrait",
    onSpeakingChange,
    onRetry,
    onStreamReady: onStreamReadyChange,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<LiveAvatarSession | null>(null);
  const pcmAccumRef = useRef("");
  const onSpeakingChangeRef = useRef(onSpeakingChange);
  const onStreamReadyRef = useRef(onStreamReadyChange);
  const [streamReady, setStreamReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lipSyncActive, setLipSyncActive] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const layoutClass = layout === "stage" ? "wl-presence-live--stage" : "";
  const sessionToken = credentials.sessionToken;
  // In a Wireline-driven LITE session, Wireline's own voice surface captures
  // the microphone and plays the agent audio; the provider track is lip-sync
  // only. In provider-driven modes (Studio-voice connector or FULL), the
  // provider owns both directions: it needs the caller's microphone and its
  // audio track is the only speech there is.
  const wirelineDrivesAudio = sessionExpectsWirelineAudio(credentials);

  // Parent pages intentionally pass small UI callbacks. Those callbacks can be
  // recreated during ordinary renders; a paid provider session must not be.
  // Keep the current callbacks in refs so session lifetime is keyed only to the
  // minted session token.
  onSpeakingChangeRef.current = onSpeakingChange;
  onStreamReadyRef.current = onStreamReadyChange;

  const flushAccumulatedPcm = (force = false) => {
    const session = sessionRef.current;
    if (!session || session.state !== SessionState.CONNECTED) return;
    // LiveAvatar's own LITE-mode chunker uses a 400 ms first PCM frame at
    // 24 kHz, signed 16-bit mono: 24_000 * 0.4 * 2 = 19_200 bytes. Matching
    // that boundary avoids turning every ~100 ms browser audio callback into a
    // separate speak/speak_end command while keeping lip-sync latency bounded.
    const minBytes = 19_200;
    if (!force && pcmAccumRef.current.length < minBytes) return;
    if (!pcmAccumRef.current) return;
    session.repeatAudio(pcmAccumRef.current);
    pcmAccumRef.current = "";
  };

  useEffect(() => {
    setFailed(false);
    setStreamReady(false);
    setLipSyncActive(false);
    setSoundBlocked(false);
    pcmAccumRef.current = "";

    if (!sessionToken?.trim()) {
      setFailed(true);
      return;
    }

    const session = new LiveAvatarSession(sessionToken, {
      // Wireline-driven sessions must not open a second microphone capture —
      // the Wireline voice surface already owns the mic. Provider-driven
      // sessions converse on the provider side, so the SDK publishes the mic.
      voiceChat: !wirelineDrivesAudio,
    });
    sessionRef.current = session;
    let cancelled = false;

    const handleStreamReady = () => {
      if (cancelled || !videoRef.current) return;
      setStreamReady(true);
      onStreamReadyRef.current?.();
      const element = videoRef.current;
      session.attach(element);
      // Wireline-driven: provider track is lip-sync only; agent audio plays
      // through the Wireline voice surface, so stay muted to avoid doubling.
      // Provider-driven: the provider track is the only speech — unmute, and
      // if the browser blocks unmuted playback, offer a tap-to-listen control
      // instead of a silent presenter.
      element.muted = wirelineDrivesAudio;
      if (!wirelineDrivesAudio) {
        void element.play().catch(() => {
          if (!cancelled) setSoundBlocked(true);
        });
      }
    };

    const onSpeakStarted = () => {
      setLipSyncActive(true);
      onSpeakingChangeRef.current?.(true);
    };

    const onSpeakEnded = () => {
      setLipSyncActive(false);
      onSpeakingChangeRef.current?.(false);
    };

    session.on(SessionEvent.SESSION_STREAM_READY, handleStreamReady);
    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, onSpeakStarted);
    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, onSpeakEnded);
    session.on(SessionEvent.SESSION_DISCONNECTED, () => {
      if (!cancelled) setFailed(true);
    });

    void (async () => {
      try {
        await session.start();
        // LiveAvatarSession.stop() intentionally no-ops while CONNECTING. If
        // this component unmounted during start(), cleanup's early stop could
        // therefore miss the provider session. Close it again after connect so
        // an abandoned UI can never leave a metered session running.
        if (cancelled) await session.stop().catch(() => undefined);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      session.off(SessionEvent.SESSION_STREAM_READY, handleStreamReady);
      session.off(AgentEventsEnum.AVATAR_SPEAK_STARTED, onSpeakStarted);
      session.off(AgentEventsEnum.AVATAR_SPEAK_ENDED, onSpeakEnded);
      void session.stop().catch(() => undefined);
      if (sessionRef.current === session) sessionRef.current = null;
    };
    // wirelineDrivesAudio is derived from the same server response as the
    // token, so for a given token it can never change mid-session.
  }, [sessionToken, wirelineDrivesAudio]);

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
    async streamSampleBinary(pcmBinary: string, _eventId: string) {
      const session = sessionRef.current;
      if (!session || session.state !== SessionState.CONNECTED) {
        throw new Error("Live presenter is not connected yet.");
      }
      if (!pcmBinary) {
        throw new Error("Voice sample did not include playable audio.");
      }
      session.repeatAudio(pcmBinary);
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
    async stop() {
      const session = sessionRef.current;
      pcmAccumRef.current = "";
      if (!session) return;
      sessionRef.current = null;
      setStreamReady(false);
      setLipSyncActive(false);
      onSpeakingChangeRef.current?.(false);
      await session.stop().catch(() => undefined);
    },
    isControlConnected: () => sessionRef.current?.state === SessionState.CONNECTED,
    isStreamReady: () => streamReady,
  }));

  const showSpeaking = speaking || lipSyncActive;
  const frameClass =
    `wl-presence__frame wl-presence__frame--ink wl-presence-live ${layoutClass} ${className}`.trim();

  if (failed) {
    return (
      <div className={frameClass}>
        <div className="wl-presence__face">
          <AgentFace
            seed={fallbackSeed}
            size={layout === "stage" ? 168 : 120}
            speaking={showSpeaking}
            title={`${agentName} face`}
          />
        </div>
        <div className="wl-presence__live">
          <span className="wl-presence__live-dot" aria-hidden="true" />
          Fallback
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="absolute bottom-3 left-1/2 z-[2] min-h-11 -translate-x-1/2 rounded-lg border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-4 py-2 text-xs font-semibold text-foreground shadow-sm hover:border-[var(--wireline-color-action-primary-default)]"
          >
            Retry presenter
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={frameClass}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={wirelineDrivesAudio}
        className="wl-presence-live__video"
        aria-label={`${agentName} live video presenter`}
      />
      {streamReady && soundBlocked ? (
        <button
          type="button"
          onClick={() => {
            const element = videoRef.current;
            if (!element) return;
            element.muted = false;
            void element.play().catch(() => undefined);
            setSoundBlocked(false);
          }}
          className="absolute bottom-3 left-1/2 z-[2] min-h-11 -translate-x-1/2 rounded-lg border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-4 py-2 text-xs font-semibold text-foreground shadow-sm hover:border-[var(--wireline-color-action-primary-default)]"
        >
          Tap to hear the presenter
        </button>
      ) : null}
      {streamReady ? (
        <div className="wl-presence__live">
          <span className="wl-presence__live-dot" aria-hidden="true" />
          Live
        </div>
      ) : (
        <div className="wl-presence-live__loading" aria-busy="true">
          <div className="space-y-2 text-center">
            <span className="mx-auto block size-5 animate-pulse rounded-full border border-primary/40 bg-primary/15" />
            <span className="block">Connecting live presenter…</span>
          </div>
        </div>
      )}
    </div>
  );
});

export default LiveVideoPresenter;
