/**
 * AgentPresenterStage — the "put a face to your agent" experience.
 *
 * Renders an agent's identity as an on-screen presenter: the deterministic
 * AgentFace framed as a live video stage with a speaking waveform and a
 * caption track. The video-presenter policy (provider, consent, status) comes
 * from lib/agent-identity, so this stage is the exact slot a consented live
 * provider (HeyGen and friends) streams into later — the face stays the
 * always-on fallback.
 */
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import AgentFace from "../AgentFace";
import { buildAgentIdentityPreview, VIDEO_PRESENTER_PROVIDERS } from "../../lib/agent-identity";

type Line = { who: "caller" | "agent"; text: string };

const DEMO_SCRIPT: Line[] = [
  { who: "caller", text: "Hi — do you have any openings this week?" },
  { who: "agent", text: "We do. I can book you Thursday at 2, or Friday morning — which works?" },
  { who: "caller", text: "Thursday at 2 is perfect." },
  { who: "agent", text: "Booked. I've texted you the confirmation and added it to the calendar." },
];

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export default function AgentPresenterStage({
  name = "Sarah",
  role = "scheduler",
  isBusinessAgent = true,
  script = DEMO_SCRIPT,
}: {
  name?: string;
  role?: string;
  isBusinessAgent?: boolean;
  script?: Line[];
}) {
  const identity = buildAgentIdentityPreview({ name, role, isBusinessAgent });
  // Customer-facing label only. The raw provider name (`.label`) never renders.
  const surfaceLabel = VIDEO_PRESENTER_PROVIDERS[identity.video.providerPreference].surfaceLabel;
  const videoSlotCopy = identity.video.consentRequired
    ? `${surfaceLabel}, consent-gated`
    : surfaceLabel;

  // Cycle the caption track. Reduced motion rests on the closing agent line.
  const [idx, setIdx] = useState(script.length - 1);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setIdx(script.length - 1);
      return;
    }
    setIdx(0);
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % script.length);
    }, 2800);
    return () => window.clearInterval(id);
  }, [script]);

  const line = script[idx] ?? script[script.length - 1];
  const speaking = line.who === "agent";

  return (
    <div className="vr">
      <div className={`vr-stage${speaking ? " vr-speaking" : ""}`}>
        <span className="vr-live">
          <span className="vr-live__dot" aria-hidden="true" />
          Live
        </span>
        <span className="vr-provider">Wireline</span>

        <div className="vr-stage__face">
          <AgentFace
            seed={name}
            speaking={speaking}
            size={240}
            className="vr-bob"
            title={`${name}, your agent`}
          />
        </div>

        <div className="vr-wave" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="vr-caption" aria-live="polite">
          <div className="vr-caption__who">{line.who === "agent" ? name : "Caller"}</div>
          <div className="vr-caption__text">
            {line.text}
            {speaking ? <span className="cursor" aria-hidden="true" /> : null}
          </div>
        </div>
      </div>

      <div>
        <p className="wl-eyebrow wl-eyebrow--wired text-primary">Put a face to your agent</p>
        <h2
          className="mt-4 text-[clamp(30px,4vw,44px)] leading-[1.05]"
          style={{
            fontFamily: "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
            fontWeight: 400,
            letterSpacing: "-0.025em",
          }}
        >
          Your agent, on screen — not just on the line.
        </h2>
        <p className="mt-4 max-w-[52ch] text-[15px] leading-[1.65] text-muted-foreground">
          Every agent ships with a face. On your website it becomes a video receptionist that
          greets, qualifies, and books in person — {identity.video.description.toLowerCase()}
        </p>

        <dl className="mt-6 grid max-w-[440px] gap-3 sm:grid-cols-2">
          <div className="rounded-[12px] border border-border bg-card/60 p-3">
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Video slot
            </dt>
            <dd className="mt-1 text-sm text-foreground">{videoSlotCopy}</dd>
          </div>
          <div className="rounded-[12px] border border-border bg-card/60 p-3">
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Always-on fallback
            </dt>
            <dd className="mt-1 text-sm text-foreground">The agent face, on every surface</dd>
          </div>
        </dl>

        <Link
          to="/signup"
          className="marketing-btn-primary mt-7 inline-flex min-h-12 items-center gap-2 px-6 text-[15px] font-semibold"
        >
          Give your agent a face
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
