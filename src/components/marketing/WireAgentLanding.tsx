import { useEffect, useRef, useState } from "react";
import { ArrowRight, Mail, MessageSquare, Monitor, Phone, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import BotBoundMark from "../brand/BotBoundMark";
import LandingFooter from "./LandingFooter";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
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
    message: "Choose A Voice. Or Clone Your Own.",
  },
  {
    id: "sms",
    label: "SMS",
    icon: MessageSquare,
    message: "Keep The Conversation Going.",
  },
  {
    id: "email",
    label: "Email",
    icon: Mail,
    message: "Your Inbox. Your Knowledge. Your Signature.",
  },
  {
    id: "computer",
    label: "Computer",
    icon: Monitor,
    message: "Research. Compare. Get It Done.",
  },
];

export default function WireAgentLanding() {
  const signedIn = Boolean(useAuth().user);
  const [selected, setSelected] = useState(3);
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
              <span className="landing-prestige__title-line">YOUR VOICE BOT</span>{" "}
              <span className="landing-prestige__title-line landing-prestige__title-accent">
                FOR YOUR WORK.
              </span>
            </h1>
            <p className="landing-prestige__description">
              AI Bots With Their Own Phone Number, Email Address, And Computer.
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
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") setSelected(index);
                }}
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
            <Link to={`/features#${example.id}`} className="landing-prestige__example-link">
              Explore {example.label}
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
