import { CalendarCheck2, MessageSquareText, PhoneCall } from "lucide-react";
import type { ReactNode } from "react";

import AgentFace from "../AgentFace";
import { cn } from "../../lib/utils";

const OUTCOME_ICONS = [PhoneCall, MessageSquareText, CalendarCheck2] as const;
const OUTCOME_KICKERS = ["Now Calling", "Following Up", "Next Step"] as const;
const WAVE_BARS = [22, 36, 58, 42, 72, 48, 84, 56, 34, 66, 92, 62, 40, 76, 50, 28] as const;

type LandingCallStageProps = {
  agentName: string;
  modeLabel: string;
  promise: string;
  summary: string;
  outcomes: readonly string[];
  workflow: readonly string[];
  control: ReactNode;
  className?: string;
};

/**
 * A singular homepage object: the trained voice agent is visibly on the line.
 * The visual is intentionally a call interface, not a video-presenter claim.
 * The real browser or phone demo control remains inside the device so the
 * composition is interactive even when the browser voice key is unavailable.
 */
export default function LandingCallStage({
  agentName,
  modeLabel,
  promise,
  summary,
  outcomes,
  workflow,
  control,
  className,
}: LandingCallStageProps) {
  return (
    <div className={cn("wl-landing-call-stage", className)}>
      <div className="wl-landing-call-stage__halo" aria-hidden="true" />
      <div className="wl-landing-call-stage__wire" aria-hidden="true">
        <span />
      </div>

      <div className="wl-landing-call-stage__outcomes" aria-hidden="true">
        {outcomes.slice(0, 3).map((outcome, index) => {
          const Icon = OUTCOME_ICONS[index] ?? PhoneCall;
          return (
            <div key={outcome} className="wl-landing-call-stage__outcome">
              <span className="wl-landing-call-stage__outcome-icon">
                <Icon aria-hidden="true" />
              </span>
              <span>
                <small>{OUTCOME_KICKERS[index] ?? "In Motion"}</small>
                <strong>{outcome}</strong>
              </span>
            </div>
          );
        })}
      </div>

      <article
        className="wl-landing-call-stage__phone"
        aria-label={`${agentName}, ${modeLabel} voice agent demo`}
      >
        <header className="wl-landing-call-stage__topbar">
          <span className="wl-landing-call-stage__status">
            <span aria-hidden="true" />
            Ready
          </span>
          <span className="wl-landing-call-stage__mode">{modeLabel}</span>
        </header>

        <div className="wl-landing-call-stage__identity">
          <div className="wl-landing-call-stage__avatar">
            <span className="wl-landing-call-stage__avatar-ring" aria-hidden="true" />
            <span className="wl-landing-call-stage__avatar-ring" aria-hidden="true" />
            <AgentFace
              seed={`landing-stage:${agentName}`}
              size={144}
              className="wl-landing-call-stage__face"
              title={`${agentName} voice agent`}
            />
          </div>
          <p className="wl-landing-call-stage__kind">Voice Agent</p>
          <p className="wl-landing-call-stage__name wl-preserve-case">{agentName}</p>
          <p className="wl-landing-call-stage__promise">{promise}</p>
        </div>

        <div className="wl-landing-call-stage__task">
          <span>Now Handling</span>
          <strong>{outcomes[0]}</strong>
        </div>

        <div className="wl-landing-call-stage__wave" aria-hidden="true">
          {WAVE_BARS.map((height, index) => (
            <span
              key={`${height}-${index}`}
              style={{ height: `${height}%`, animationDelay: `${index * -0.07}s` }}
            />
          ))}
        </div>
        <p className="wl-landing-call-stage__listening">Ready When You Are</p>

        <ol className="wl-landing-call-stage__workflow" aria-label="Wireline workflow">
          {workflow.map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>

        <div className="wl-landing-call-stage__control">{control}</div>
        <p className="sr-only">{summary}</p>
      </article>
    </div>
  );
}
