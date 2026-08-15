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
  /** Seconds of presenter the viewer actually watched, for allowance settlement. */
  watchedSeconds: () => number;
};

/** How a session finished. Only `failed` is an error the customer must act on. */
export type LiveVideoSessionEndReason = "expired" | "failed" | "stopped";

/**
 * Longest wait between a minted token and a watchable frame before the stage
 * admits the connection is not coming. Restrictive corporate networks block
 * the provider's WebRTC media path while leaving the token mint reachable, so
 * without a deadline the customer stares at "Connecting…" forever.
 */
const CONNECT_DEADLINE_MS = 20_000;

/**
 * A provider disconnect within this margin of the session cap is the cap doing
 * its job, not a fault. Rendering the two identically is what made every
 * successful five-minute session end on the word "Fallback".
 */
const EXPIRY_MARGIN_SECONDS = 15;

/**
 * Ceiling on buffered lip-sync PCM. The accumulator only drains while the
 * session is CONNECTED; without a bound, a stalled or reconnecting session
 * grows it for the rest of the call and then dumps the whole backlog into one
 * speak command, which the presenter renders as a burst of stale audio.
 * 96 000 bytes is two seconds at 24 kHz signed 16-bit mono.
 */
const MAX_BUFFERED_PCM_BYTES = 96_000;

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
    /** Fires once per session with why it ended and how much was watched. */
    onSessionEnded?: (info: { reason: LiveVideoSessionEndReason; watchedSeconds: number }) => void;
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
    onSessionEnded,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<LiveAvatarSession | null>(null);
  const pcmAccumRef = useRef("");
  const onSpeakingChangeRef = useRef(onSpeakingChange);
  const onStreamReadyRef = useRef(onStreamReadyChange);
  const onSessionEndedRef = useRef(onSessionEnded);
  /** Wall clock of the first watchable frame; null until the customer sees video. */
  const watchStartedAtRef = useRef<number | null>(null);
  const watchedSecondsRef = useRef(0);
  const endReportedRef = useRef(false);
  const [streamReady, setStreamReady] = useState(false);
  /** Distinct from streamReady: the provider track is attached AND painting. */
  const [firstFrame, setFirstFrame] = useState(false);
  const [failure, setFailure] = useState<null | "connect_timeout" | "dropped" | "start_failed">(
    null,
  );
  const [expired, setExpired] = useState(false);
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
  onSessionEndedRef.current = onSessionEnded;

  const watchedSecondsNow = () => {
    const startedAt = watchStartedAtRef.current;
    if (startedAt == null) return watchedSecondsRef.current;
    return watchedSecondsRef.current + (Date.now() - startedAt) / 1000;
  };

  /**
   * Report the outcome exactly once. The allowance settlement on the other end
   * is single-use, and a session that both times out and then disconnects must
   * not look like two sessions.
   */
  const reportSessionEnd = (reason: LiveVideoSessionEndReason) => {
    if (endReportedRef.current) return;
    endReportedRef.current = true;
    const watched = watchedSecondsNow();
    watchedSecondsRef.current = watched;
    watchStartedAtRef.current = null;
    onSessionEndedRef.current?.({ reason, watchedSeconds: watched });
  };

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
    setFailure(null);
    setExpired(false);
    setStreamReady(false);
    setFirstFrame(false);
    setLipSyncActive(false);
    setSoundBlocked(false);
    pcmAccumRef.current = "";
    watchStartedAtRef.current = null;
    watchedSecondsRef.current = 0;
    endReportedRef.current = false;

    if (!sessionToken?.trim()) {
      setFailure("start_failed");
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
    const sessionOpenedAt = Date.now();
    const maxSessionSeconds = credentials.maxSessionSeconds ?? 0;

    // The customer is only "watching" once a frame has actually painted.
    // SESSION_STREAM_READY fires when the track is attachable, one or more
    // paints before <video> has anything to show — removing the overlay there
    // is what put a black rectangle where the presenter should be.
    // Held locally rather than read back off the ref in cleanup: by teardown
    // the ref may already point at a different node (or null).
    let attachedElement: HTMLVideoElement | null = null;

    const markFirstFrame = () => {
      if (cancelled || watchStartedAtRef.current != null) return;
      watchStartedAtRef.current = Date.now();
      setFirstFrame(true);
    };

    // Set when the deadline fires, so the still-pending start() knows the stage
    // has given up. LiveAvatarSession.stop() no-ops while CONNECTING, so the
    // stop below can miss a session that connects a moment later — without this
    // flag that session would stay open and metered behind the failure card
    // until the provider cap, having already been settled as zero watched time.
    let abandonedAfterDeadline = false;

    const connectDeadline = window.setTimeout(() => {
      if (cancelled || watchStartedAtRef.current != null) return;
      abandonedAfterDeadline = true;
      setFailure("connect_timeout");
      reportSessionEnd("failed");
      void session.stop().catch(() => undefined);
    }, CONNECT_DEADLINE_MS);

    const handleStreamReady = () => {
      if (cancelled || !videoRef.current) return;
      setStreamReady(true);
      onStreamReadyRef.current?.();
      const element = videoRef.current;
      attachedElement = element;
      element.addEventListener("playing", markFirstFrame);
      element.addEventListener("loadeddata", markFirstFrame);
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

    const handleDisconnected = () => {
      if (cancelled) return;
      window.clearTimeout(connectDeadline);
      // A disconnect at (or just before) the cap is the product's own five
      // minute ceiling closing the session. That is a completed session, not a
      // fault, and it must not be offered a "Retry" that silently spends
      // another slice of the monthly allowance.
      const elapsedSeconds = (Date.now() - sessionOpenedAt) / 1000;
      const atCap =
        maxSessionSeconds > 0 && elapsedSeconds >= maxSessionSeconds - EXPIRY_MARGIN_SECONDS;
      if (atCap) {
        setExpired(true);
        reportSessionEnd("expired");
        return;
      }
      setFailure("dropped");
      reportSessionEnd("failed");
    };

    session.on(SessionEvent.SESSION_STREAM_READY, handleStreamReady);
    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, onSpeakStarted);
    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, onSpeakEnded);
    session.on(SessionEvent.SESSION_DISCONNECTED, handleDisconnected);

    void (async () => {
      try {
        await session.start();
        // LiveAvatarSession.stop() intentionally no-ops while CONNECTING. If
        // this component unmounted during start() — or the connect deadline
        // already gave up on it — the earlier stop could therefore miss the
        // provider session. Close it again after connect so an abandoned UI can
        // never leave a metered session running.
        if (cancelled || abandonedAfterDeadline) await session.stop().catch(() => undefined);
      } catch {
        if (!cancelled) {
          setFailure("start_failed");
          reportSessionEnd("failed");
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(connectDeadline);
      attachedElement?.removeEventListener("playing", markFirstFrame);
      attachedElement?.removeEventListener("loadeddata", markFirstFrame);
      session.off(SessionEvent.SESSION_STREAM_READY, handleStreamReady);
      session.off(AgentEventsEnum.AVATAR_SPEAK_STARTED, onSpeakStarted);
      session.off(AgentEventsEnum.AVATAR_SPEAK_ENDED, onSpeakEnded);
      session.off(SessionEvent.SESSION_DISCONNECTED, handleDisconnected);
      // Unmount without an explicit stop() is still the end of the session —
      // report it so the reserved minutes this session never used go back.
      reportSessionEnd("stopped");
      void session.stop().catch(() => undefined);
      if (sessionRef.current === session) sessionRef.current = null;
    };
    // wirelineDrivesAudio and maxSessionSeconds are derived from the same
    // server response as the token, so for a given token they cannot change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- session lifetime is keyed to the minted token only
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
        // Drop the oldest audio rather than the newest: while the session is
        // not CONNECTED nothing drains, and an unbounded buffer would later
        // flush the whole backlog as one command — the presenter speaking
        // several seconds of stale audio over the live conversation.
        if (pcmAccumRef.current.length > MAX_BUFFERED_PCM_BYTES) {
          pcmAccumRef.current = pcmAccumRef.current.slice(-MAX_BUFFERED_PCM_BYTES);
        }
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
      reportSessionEnd("stopped");
      if (!session) return;
      sessionRef.current = null;
      setStreamReady(false);
      setFirstFrame(false);
      setLipSyncActive(false);
      onSpeakingChangeRef.current?.(false);
      await session.stop().catch(() => undefined);
    },
    isControlConnected: () => sessionRef.current?.state === SessionState.CONNECTED,
    isStreamReady: () => streamReady,
    watchedSeconds: () => watchedSecondsNow(),
  }));

  const showSpeaking = speaking || lipSyncActive;
  const frameClass =
    `wl-presence__frame wl-presence__frame--ink wl-presence-live ${layoutClass} ${className}`.trim();

  if (expired || failure) {
    // Two different endings, told apart in words the customer can act on. The
    // cap closing a completed session is not an error and never says "Retry".
    const heading = expired
      ? "Session complete"
      : failure === "connect_timeout"
        ? "Could not reach the presenter"
        : failure === "dropped"
          ? "Presenter disconnected"
          : "Presenter could not start";
    const detail = expired
      ? `${agentName} reached the ${Math.round((credentials.maxSessionSeconds ?? 0) / 60)}-minute session limit.`
      : failure === "connect_timeout"
        ? "The video stream never arrived. A network that blocks video calling is the usual cause."
        : failure === "dropped"
          ? "The video stream ended early."
          : "The presenter session could not be opened.";
    const actionLabel = expired ? "Start another session" : "Try again";

    return (
      <div
        className={`${frameClass} ${expired ? "wl-presence-live--ended" : "wl-presence-live--offline"}`}
      >
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
          {expired ? "Ended" : "Offline"}
        </div>
        <div className="wl-presence-live__ending">
          <p className="wl-presence-live__ending-title">{heading}</p>
          <p className="wl-presence-live__ending-detail">{detail}</p>
          {onRetry ? (
            <button type="button" onClick={onRetry} className="wl-presence-live__action">
              {actionLabel}
            </button>
          ) : null}
        </div>
        <p role={expired ? "status" : "alert"} className="sr-only">
          {heading}. {detail}
        </p>
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
      {firstFrame && soundBlocked ? (
        <div className="wl-presence-live__actions">
          <button
            type="button"
            onClick={() => {
              const element = videoRef.current;
              if (!element) return;
              element.muted = false;
              void element.play().catch(() => undefined);
              setSoundBlocked(false);
            }}
            className="wl-presence-live__action"
          >
            Turn on sound
          </button>
        </div>
      ) : null}
      {firstFrame ? (
        <div className="wl-presence__live">
          <span className="wl-presence__live-dot" aria-hidden="true" />
          Live
        </div>
      ) : (
        // Held until a frame has actually painted. Releasing on stream-ready
        // uncovered the <video> element before it had anything to show, so the
        // first thing a customer saw was a black rectangle.
        <div className="wl-presence-live__loading" aria-busy="true">
          <div className="space-y-2 text-center">
            <span className="mx-auto block size-5 animate-pulse rounded-full border border-primary/40 bg-primary/15" />
            <span className="block">Connecting live presenter…</span>
          </div>
        </div>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {firstFrame ? `${agentName} is live on screen.` : "Connecting the live presenter."}
      </p>
    </div>
  );
});

export default LiveVideoPresenter;
