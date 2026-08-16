import type { CSSProperties } from "react";
import {
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquareText,
  Mic,
  PhoneCall,
  PhoneOff,
  ShieldCheck,
  Volume2,
} from "lucide-react";
import { Link } from "react-router";

import { useProtectedPublicDemo } from "../../hooks/useProtectedPublicDemo";
import { emitProductEvent } from "../../lib/product-event-client";
import { AGENT_DIRECTION_MODES, MARKETING_VOICE } from "../../lib/product-copy";
import WirelineMark from "../brand/WirelineMark";
import MarketingChromeBar from "./MarketingChromeBar";
import PrecisionPublicHeader from "./PrecisionPublicHeader";

const PRIMARY_CTA_PATH = "/signup?plan=personal";
const HERO_LOOP = MARKETING_VOICE.proof;
const LANDING_DEMO_AGENT = "Liam";

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
  const demo = useProtectedPublicDemo(LANDING_DEMO_AGENT, "landing_product_theater");

  const trackPrimaryCta = (source = "landing_product_theater") => {
    emitProductEvent({
      event: "landing_primary_cta_clicked",
      surface: "marketing_web",
      metadata: {
        label: "Start Free",
        to: PRIMARY_CTA_PATH,
        source,
      },
    });
  };

  const demoButtonLabel = demo.connecting
    ? "Connecting"
    : demo.callActive
      ? "End Demo"
      : "Talk Live";

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
                  onClick={() => trackPrimaryCta()}
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
                data-demo-active={demo.callActive ? "true" : undefined}
                aria-label="Animated preview and protected live demo of a Wireline voice agent answering, qualifying, and booking the next step"
              >
                <div className="wireline-device__bezel">
                  <div className="wireline-device__screen">
                    <div className="wireline-device__status">
                      <span>Wireline</span>
                      <span className="wireline-device__live">
                        <span aria-hidden="true" />
                        {demo.callActive ? "Live" : "Active"}
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

                      {demo.callActive || demo.connecting ? (
                        <div className="wireline-device__scene-stack" aria-live="polite">
                          <div className="wireline-device__scene wireline-device__scene--live">
                            <p className="wireline-device__agent-label">Live Demo</p>
                            <p className="wireline-device__task">
                              {demo.connecting ? "Connecting" : "Your Turn"}
                            </p>
                            <p className="wireline-device__queue">
                              Ask me to answer, qualify, follow up, or book
                            </p>
                          </div>
                        </div>
                      ) : (
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
                      )}
                      <p className="wireline-device__timer">
                        {demo.callActive
                          ? `≤ 00:${demo.maxDurationSeconds}`
                          : demo.completed
                            ? "Demo Complete"
                            : "00:24"}
                      </p>
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
                      {demo.callActive
                        ? demo.speakerActive
                          ? "Agent speaking. Interrupt naturally at any time."
                          : "Listening. Give me a real situation to handle."
                        : demo.completed
                          ? "That was live. Build yours free and train it for your work."
                          : "I can help with that. What time works best?"}
                    </p>

                    <div className="wireline-device__demo-control">
                      {demo.completed ? (
                        <Link
                          to={PRIMARY_CTA_PATH}
                          className="wireline-device__demo-button"
                          onClick={() => trackPrimaryCta("landing_live_demo_complete")}
                        >
                          <span>Build Yours</span>
                          <ArrowRight className="size-3.5" aria-hidden="true" />
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="wireline-device__demo-button"
                          data-active={demo.callActive ? "true" : undefined}
                          onClick={demo.toggle}
                          disabled={demo.connecting}
                          aria-busy={demo.connecting}
                          aria-label={demoButtonLabel}
                        >
                          {demo.connecting ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          ) : demo.callActive ? (
                            <PhoneOff className="size-3.5" aria-hidden="true" />
                          ) : (
                            <Mic className="size-3.5" aria-hidden="true" />
                          )}
                          <span>{demoButtonLabel}</span>
                        </button>
                      )}

                      <div className="wireline-device__demo-status" aria-live="polite">
                        {demo.callActive ? (
                          <>
                            <Volume2 className="size-3" aria-hidden="true" />
                            <span>{demo.speakerActive ? "Speaking" : "Listening"}</span>
                            <span className="wireline-device__live-bars" aria-hidden="true">
                              {[1, 2, 3].map((bar) => (
                                <i
                                  key={bar}
                                  style={{
                                    transform: `scaleY(${Math.max(
                                      0.3,
                                      Math.min(1, demo.volume * (1 + bar * 0.35)),
                                    )})`,
                                  }}
                                />
                              ))}
                            </span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="size-3" aria-hidden="true" />
                            <span>{demo.maxDurationSeconds} Sec Protected Demo</span>
                          </>
                        )}
                      </div>
                    </div>

                    {demo.error ? (
                      <p className="wireline-device__demo-error" role="alert">
                        {demo.error}
                      </p>
                    ) : null}

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
 * /features, and /pricing. The landing uses a protected proxy instead of a
 * public tel: fallback or BrowserCallWidget.
 */
