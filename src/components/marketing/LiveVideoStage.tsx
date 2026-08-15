/**
 * LiveVideoStage — the landing-page depiction of a Live Video session.
 *
 * What it replaces: a static grey person-shaped icon that demonstrated nothing
 * about the product. Live Video is a *voice* product with a face attached, so
 * the showcase is carried by the voice: the agent takes turns, the meter runs,
 * and the session cap counts down in the open exactly as it does in Studio
 * (see LiveVideoStudioPage's `role="timer"` readout).
 *
 * Deliberately not rendered here:
 *   - A caption/transcript track. The medium is synthesized speech (ElevenLabs
 *     and xAI voices), and a page-long subtitle reads as a chat product.
 *   - AgentFace. That badge documents itself as a recognition marker and
 *     explicitly not a video presenter.
 *   - Any likeness. The presenter catalog is real human video that this page
 *     ships no local asset for, so the feed stays a soft-focus camera
 *     treatment and never implies a specific person is on the call.
 *
 * Every number on screen is read from live-video-policy, so the marketing
 * surface cannot drift from the metering the runtime enforces.
 */
import { useEffect, useMemo, useState } from "react";
import { Video } from "lucide-react";

import {
  LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY,
  LIVE_VIDEO_MAX_SESSION_SECONDS,
} from "../../lib/video-presenter/live-video-policy";

/** A turn-taking rhythm, so the waveform reads as conversation not decoration. */
const SPEAKING_MS = 2800;
const LISTENING_MS = 1600;
const WAVE_BARS = 9;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export default function LiveVideoStage() {
  const reducedMotion = useReducedMotion();
  const [speaking, setSpeaking] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(LIVE_VIDEO_MAX_SESSION_SECONDS);

  useEffect(() => {
    if (reducedMotion) return;
    const id = setTimeout(
      () => setSpeaking((value) => !value),
      speaking ? SPEAKING_MS : LISTENING_MS,
    );
    return () => clearTimeout(id);
  }, [speaking, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    const id = setInterval(() => {
      setSecondsLeft((value) => (value <= 1 ? LIVE_VIDEO_MAX_SESSION_SECONDS : value - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [reducedMotion]);

  const bars = useMemo(() => Array.from({ length: WAVE_BARS }, (_, index) => index), []);
  const animating = speaking && !reducedMotion;

  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div
        className="pointer-events-none absolute -inset-14 opacity-70"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(circle at 50% 44%, var(--wireline-color-glow-primary), transparent 62%)",
        }}
      />

      <div className={`vr-panel relative${animating ? " vr-speaking" : ""}`}>
        <div className="vr-panel__bar">
          <span className="vr-panel__who">
            <span className="vr-panel__badge" aria-hidden="true">
              <Video className="size-3.5" />
            </span>
            <span>
              <span className="vr-panel__name wl-preserve-case">Northside Roofing</span>
              <span className="vr-panel__sub">Live Video session</span>
            </span>
          </span>
          <span className="vr-panel__sub">Wireline voice</span>
        </div>

        <div className="vr-panel__stage">
          <span className="vr-live">
            <span className="vr-live__dot" aria-hidden="true" />
            Live
          </span>
          <span className="vr-provider" role="timer" aria-label="Time left in this session">
            {formatClock(secondsLeft)} left
          </span>

          <div className="vr-feed" aria-hidden="true">
            <span className="vr-feed__key" />
            <span className={`vr-feed__figure${reducedMotion ? "" : " vr-bob"}`} />
            <span className="vr-feed__rim" />
            <span className="vr-feed__grain" />
          </div>

          <div className="vr-voice" aria-hidden="true">
            <div className="vr-wave">
              {bars.map((bar) => (
                <span key={bar} />
              ))}
            </div>
            <p className="vr-voice__state">{animating ? "Agent speaking" : "Listening"}</p>
          </div>
        </div>

        <div className="vr-meter" role="list" aria-label="Live Video session limits">
          <span role="listitem">
            <strong>{LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY}</strong> min/month included
          </span>
          <span role="listitem">
            <strong>{formatClock(LIVE_VIDEO_MAX_SESSION_SECONDS)}</strong> max per session
          </span>
          <span role="listitem">Pauses at the limit</span>
        </div>
      </div>

      <p className="sr-only">
        Illustration of a Wireline Live Video session: the agent takes its turn in a spoken
        conversation while the {LIVE_VIDEO_MAX_SESSION_SECONDS / 60}-minute session cap counts down.
      </p>
    </div>
  );
}
