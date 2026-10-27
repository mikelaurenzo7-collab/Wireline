import { useEffect, useRef, useState } from "react";
import { ArrowRight, Mail, MessageSquare, Monitor, Phone, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import BotBoundMark from "../brand/BotBoundMark";
import MarketingChromeBar from "./MarketingChromeBar";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import WireSignalArt from "./WireSignalArt";
import { emitProductEvent, emitProductEventOnce } from "../../lib/product-event-client";
import { useAuth } from "../../contexts/AuthContext";

const EXAMPLES: readonly {
  id: string;
  label: string;
  icon: LucideIcon;
  message: string;
}[] = [
  {
    id: "calls",
    label: "Calls",
    icon: Phone,
    message: "Choose a voice, or clone your own.",
  },
  {
    id: "sms",
    label: "SMS",
    icon: MessageSquare,
    message: "Keep the conversation going.",
  },
  {
    id: "email",
    label: "Email",
    icon: Mail,
    message: "Reply in your own voice.",
  },
  {
    id: "computer",
    label: "Computer",
    icon: Monitor,
    message: "Research it, then finish it.",
  },
];

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
      metadata: { source: "hero_primary", label: "Get Started" },
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
              <span className="landing-prestige__title-line">Your Voice Bot</span>{" "}
              <span className="landing-prestige__title-line landing-prestige__title-accent">
                for Your Work.
              </span>
            </h1>
            <p className="landing-prestige__identity-line">
              A phone number, an email address, and a computer.
            </p>
            <div className="landing-prestige__actions">
              <Link
                to={signedIn ? "/studio" : "/signup"}
                className="landing-prestige__cta is-primary"
                onClick={trackSignupIntent}
              >
                {signedIn ? "Open Workspace" : "Get Started"} <ArrowRight aria-hidden="true" />
              </Link>
              <Link to="/pricing" className="landing-prestige__cta is-text">
                See Pricing
              </Link>
            </div>
          </div>
        </section>
        <section
          className="landing-prestige__examples landing-prestige__rail"
          aria-label="Explore BotBound"
        >
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
                aria-controls="capability-example"
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
            id="capability-example"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby={`capability-${example.id}`}
            className="landing-prestige__example"
          >
            <h2>{example.message}</h2>
            <WireSignalArt
              variant={example.id === "computer" ? "pulse" : "wave"}
              className="landing-prestige__signal"
            />
            <Link to={`/features#${example.id}`} className="landing-prestige__example-link">
              Explore {example.label}
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <MarketingChromeBar />
    </div>
  );
}

