import { useEffect, useRef, useState } from "react";
import { ArrowRight, Mail, MessageSquare, Monitor, Phone, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import BotBoundMark from "../brand/BotBoundMark";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import { emitProductEvent, emitProductEventOnce } from "../../lib/product-event-client";
import { useAuth } from "../../contexts/AuthContext";

type CapabilityId = "calls" | "sms" | "email" | "computer";

const EXAMPLES: readonly {
  id: CapabilityId;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "calls", label: "Calls", icon: Phone },
  { id: "sms", label: "SMS", icon: MessageSquare },
  { id: "email", label: "Email", icon: Mail },
  { id: "computer", label: "Computer", icon: Monitor },
];

const WAVEFORM = [
  12, 19, 29, 18, 35, 24, 14, 30, 20, 36, 23, 15, 28, 18, 32, 21, 12, 25, 34, 17, 27, 14,
];

function CapabilityPreview({ channel }: { channel: CapabilityId }) {
  if (channel === "calls") {
    return (
      <div className="landing-prestige__demo landing-prestige__demo--calls">
        <div className="landing-prestige__call-contact">
          <span className="landing-prestige__call-mark" aria-hidden="true">
            <Phone />
          </span>
          <span className="landing-prestige__call-copy">
            <strong>Customer call</strong>
            <span>Outbound example</span>
          </span>
        </div>
        <div className="landing-prestige__waveform" aria-hidden="true">
          {WAVEFORM.map((height, index) => (
            <i key={index} style={{ height: `${height}px` }} />
          ))}
        </div>
      </div>
    );
  }

  if (channel === "sms") {
    return (
      <div className="landing-prestige__demo landing-prestige__demo--sms">
        <p className="landing-prestige__message landing-prestige__message--incoming">
          Could I book for Thursday?
        </p>
        <p className="landing-prestige__message landing-prestige__message--outgoing">
          Absolutely. What time works?
        </p>
      </div>
    );
  }

  if (channel === "email") {
    return (
      <div className="landing-prestige__demo landing-prestige__demo--email">
        <div className="landing-prestige__email-heading">
          <span className="landing-prestige__email-avatar" aria-hidden="true">
            C
          </span>
          <span className="landing-prestige__email-copy">
            <strong>Customer question</strong>
            <span>Can I book an appointment?</span>
          </span>
          <span className="landing-prestige__email-mark" aria-hidden="true">
            <Mail />
          </span>
        </div>
        <p className="landing-prestige__email-reply">Happy to help. What time works best?</p>
      </div>
    );
  }

  return (
    <div className="landing-prestige__demo landing-prestige__demo--computer">
      <div className="landing-prestige__browser-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>Appointments</span>
      </div>
      <div className="landing-prestige__browser-content">
        <span className="landing-prestige__browser-label">THIS WEEK</span>
        <strong>Find an open time</strong>
        <div className="landing-prestige__time-options" aria-hidden="true">
          <span>
            Tue <b>10:30</b>
          </span>
          <span className="is-selected">
            Wed <b>2:00</b>
          </span>
          <span>
            Thu <b>11:15</b>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function WireAgentLanding() {
  const signedIn = Boolean(useAuth().user);
  const [selected, setSelected] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const example = EXAMPLES[selected]!;

  useEffect(() => {
    emitProductEventOnce({
      event: "landing_viewed",
      surface: "marketing_web",
      metadata: { path: window.location.pathname || "/", scope: "prestige_access_home" },
    });
  }, []);

  const trackSignupIntent = () =>
    emitProductEvent({
      event: "landing_primary_cta_clicked",
      surface: "marketing_web",
      metadata: { source: "hero_primary", label: "GET STARTED" },
    });

  return (
    <div className="marketing-surface landing-prestige bg-background text-foreground">
      <PrecisionPublicHeader />
      <main id="main-content" className="landing-prestige__main" tabIndex={-1}>
        <section className="landing-prestige__hero" aria-labelledby="landing-prestige-title">
          <div className="landing-prestige__hero-inner">
            <div className="landing-prestige__hero-mark" aria-hidden="true">
              <BotBoundMark className="landing-prestige__hero-bot" />
            </div>
            <h1 id="landing-prestige-title">
              <span className="landing-prestige__title-line">Your next hire</span>{" "}
              <span className="landing-prestige__title-line landing-prestige__title-accent">
                is a bot.
              </span>
            </h1>
            <p className="landing-prestige__identity-line">
              Phone Number. Email Address. Computer Use
            </p>
            <div className="landing-prestige__actions">
              <Link
                to={signedIn ? "/studio" : "/signup"}
                className="landing-prestige__cta is-primary"
                onClick={trackSignupIntent}
              >
                {signedIn ? "Open Workspace" : "GET STARTED"} <ArrowRight aria-hidden="true" />
              </Link>
              <Link to="/pricing" className="landing-prestige__cta is-text">
                See Pricing
              </Link>
            </div>
          </div>
        </section>

        <section className="landing-prestige__showcase" aria-label="Explore BotBound capabilities">
          <div className="landing-prestige__tabs" role="tablist" aria-label="Bot capabilities">
            {EXAMPLES.map(({ id, label, icon: Icon }, index) => (
              <button
                key={id}
                ref={(el) => {
                  tabs.current[index] = el;
                }}
                id={`capability-${id}`}
                role="tab"
                type="button"
                aria-selected={selected === index}
                aria-controls="capability-preview"
                tabIndex={selected === index ? 0 : -1}
                onClick={() => setSelected(index)}
                onKeyDown={(event) => {
                  const next =
                    event.key === "ArrowRight"
                      ? (index + 1) % EXAMPLES.length
                      : event.key === "ArrowLeft"
                        ? (index + EXAMPLES.length - 1) % EXAMPLES.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? EXAMPLES.length - 1
                            : null;
                  if (next === null) return;
                  event.preventDefault();
                  setSelected(next);
                  tabs.current[next]?.focus();
                }}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div
            id="capability-preview"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby={`capability-${example.id}`}
            className="landing-prestige__preview"
          >
            <CapabilityPreview channel={example.id} />
          </div>
        </section>
      </main>
    </div>
  );
}
