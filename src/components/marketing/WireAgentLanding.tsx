import type { CSSProperties } from "react";
import {
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Mail,
  MessageSquareText,
  PhoneCall,
} from "lucide-react";
import { Link } from "react-router";

import MarketingChromeBar from "./MarketingChromeBar";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import WirelineMark from "../brand/WirelineMark";
import { AGENT_DIRECTION_MODES, MARKETING_VOICE } from "../../lib/product-copy";
import { emitProductEvent } from "../../lib/product-event-client";

const PRIMARY_CTA_PATH = "/signup?plan=personal";
const HERO_LOOP = MARKETING_VOICE.proof;

const THEATER_SCENES = [
  {
    lane: AGENT_DIRECTION_MODES.outbound.label,
    task: "Lead Response",
    queue: ["Quote Follow Up", "Appointment Setting"],
    delay: "0s",
  },
  {
    lane: AGENT_DIRECTION_MODES.inbound.label,
    task: "Front Desk",
    queue: ["Lead Qualifier", "Support Triage"],
    delay: "-8s",
  },
  {
    lane: AGENT_DIRECTION_MODES.hybrid.label,
    task: "Sales Desk",
    queue: ["Collections Desk", "Appointment Desk"],
    delay: "-4s",
  },
] as const;

const OUTCOME_SIGNALS = [
  {
    label: "Call Answered",
    detail: "New lead / 00:08",
    icon: PhoneCall,
    position: "answer",
  },
  {
    label: "Lead Qualified",
    detail: "Need confirmed",
    icon: CheckCircle2,
    position: "qualified",
  },
  {
    label: "Meeting Booked",
    detail: "Tomorrow / 10:30",
    icon: CalendarCheck2,
    position: "booked",
  },
] as const;

const CHANNELS = [
  { label: "Call", icon: PhoneCall },
  { label: "Text", icon: MessageSquareText },
  { label: "Email", icon: Mail },
] as const;

const WAVEFORM = [34, 58, 82, 48, 92, 64, 38, 76, 54, 88, 44, 70, 32, 60, 84] as const;

export default function WireAgentLanding() {
  const trackPrimaryCta = () => {
    emitProductEvent({
      event: "landing_primary_cta_clicked",
      surface: "marketing_web",
      metadata: {
        label: "Start Free",
        to: PRIMARY_CTA_PATH,
        source: "landing_product_theater",
      },
    });
  };

  return (
    <div className="marketing-surface wireline-theater-surface bg-background text-foreground">
      <PrecisionPublicHeader />

      <main id="main-content" className="marketing-flow" tabIndex={-1}>
        <section
          className="marketing-section marketing-section--screen wireline-theater"
          aria-labelledby="wireline-theater-title"
        >
          <div className="wireline-theater__mesh" aria-hidden="true" />
          <div className="wireline-theater__grid wl-public-rail">
            <header className="wireline-theater__copy">
              <p className="wl-overline wireline-theater__eyebrow">
                {MARKETING_VOICE.headline}
              </p>
              <h1 id="wireline-theater-title" className="wireline-theater__title">
                <span>Always</span>
                <span>On The Line</span>
              </h1>
              <p className="wireline-theater__subline">{MARKETING_VOICE.subline}</p>

              <div className="marketing-hero__actions wireline-theater__actions">
                <Link
                  to={PRIMARY_CTA_PATH}
                  data-canonical-label={MARKETING_VOICE.primaryCta}
                  className="marketing-btn-primary wireline-theater__primary-action"
                  onClick={trackPrimaryCta}
                >
                  <span>Start Free</span>
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <Link
                  to="/features"
                  className="marketing-btn-secondary wireline-theater__secondary-action"
                >
                  Explore Product
                </Link>
              </div>

              <p className="wireline-theater__activation-note">
                Build free <span aria-hidden="true">/</span> Activate when ready
              </p>
            </header>

            <div className="wireline-theater__stage" aria-label="Agent work lane">
              <div className="wireline-theater__orbit wireline-theater__orbit--outer" aria-hidden="true" />
              <div className="wireline-theater__orbit wireline-theater__orbit--inner" aria-hidden="true" />

              <article
                className="wireline-device"
                aria-label="Animated preview of a Wireline voice agent answering a lead, qualifying the request, and booking the next step"
              >
                <div className="wireline-device__bezel">
                  <div className="wireline-device__screen">
                    <div className="wireline-device__status">
                      <span>Wireline</span>
                      <span className="wireline-device__live">
                        <span aria-hidden="true" />
                        Active
                      </span>
                    </div>

                    <ol className="wireline-device__loop" aria-label="Agent lifecycle">
                      {HERO_LOOP.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>

                    <div className="wireline-device__agent">
                      <div className="wireline-device__avatar" aria-hidden="true">
                        <span className="wireline-device__halo wireline-device__halo--one" />
                        <span className="wireline-device__halo wireline-device__halo--two" />
                        <span className="wireline-device__avatar-core">
                          <WirelineMark className="wireline-device__mark" signal />
                        </span>
                      </div>

                      <div className="wireline-device__scene-stack" aria-hidden="true">
                        {THEATER_SCENES.map((scene) => (
                          <div
                            key={scene.task}
                            className="wireline-device__scene"
                            style={
                              {
                                "--wireline-scene-delay": scene.delay,
                              } as CSSProperties
                            }
                          >
                            <p className="wireline-device__agent-label">{scene.lane}</p>
                            <p className="wireline-device__task">{scene.task}</p>
                            <p className="wireline-device__queue">{scene.queue.join(" / ")}</p>
                          </div>
                        ))}
                      </div>
                      <p className="wireline-device__timer">00:24</p>
                    </div>

                    <div className="wireline-device__waveform" aria-hidden="true">
                      {WAVEFORM.map((height, index) => (
                        <span
                          key={`${height}-${index}`}
                          style={
                            {
                              "--wireline-wave-height": `${height}%`,
                              "--wireline-wave-index": index,
                            } as CSSProperties
                          }
                        />
                      ))}
                    </div>

                    <p className="wireline-device__transcript">
                      I can help with that. What time works best?
                    </p>

                    <div className="wireline-device__outcome">
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      <span>Next Step Booked</span>
                    </div>

                    <ul className="wireline-device__channels" aria-label="Available channels">
                      {CHANNELS.map(({ label, icon: Icon }) => (
                        <li key={label}>
                          <Icon className="size-3.5" aria-hidden="true" />
                          <span>{label}</span>
                        </li>
                      ))}
                    </ul>

                    <Link to="/features" className="wireline-device__explore">
                      See The System
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </article>

              {OUTCOME_SIGNALS.map(({ label, detail, icon: Icon, position }, index) => (
                <div
                  key={label}
                  className={`wireline-theater__signal wireline-theater__signal--${position}`}
                  style={{ "--wireline-signal-index": index } as CSSProperties}
                  aria-hidden="true"
                >
                  <span className="wireline-theater__signal-icon">
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </span>
                </div>
              ))}

              <div className="sr-only">
                <p>Voice agent work lanes:</p>
                <ul>
                  {THEATER_SCENES.map((scene) => (
                    <li key={scene.task}>
                      {scene.lane}: {scene.task}, {scene.queue.join(", ")}
                    </li>
                  ))}
                </ul>
                <p>Example outcomes:</p>
                <ul>
                  {OUTCOME_SIGNALS.map(({ label, detail }) => (
                    <li key={label}>
                      {label}: {detail}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingChromeBar />
    </div>
  );
}

/*
 * Intentional landing exclusions retained as searchable migration notes:
 * "Hear It Live", Live Video, and PLAN_PREVIEW.map belong on /showcase,
 * /features, and /pricing, not in the zero-cost product theater above. Do not
 * restore a public tel: fallback or BrowserCallWidget here.
 */
