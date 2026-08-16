import { useEffect } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  Headphones,
  Mail,
  MessageSquareText,
  Phone,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";
import { Link } from "react-router";

import PrecisionPublicHeader from "./PrecisionPublicHeader";
import BrowserCallWidget from "./BrowserCallWidget";
import WirelineMark from "../brand/WirelineMark";
import { AGENT_DIRECTION_MODES, MARKETING_VOICE } from "../../lib/product-copy";
import { STRIPE_PLANS } from "../../lib/plan-catalog";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../../data/contact-agents";
import { emitProductEvent, emitProductEventOnce } from "../../lib/product-event-client";

const HERO_LOOP = MARKETING_VOICE.spine;
const HERO_DEMO_AGENT = LANDING_PUBLIC_DEMO_AGENTS[0];
const PERSONAL_SIGNUP = "/signup?plan=personal";
const STARTER_PRICE =
  STRIPE_PLANS.find((plan) => plan.id === "starter")?.price_usd_monthly ?? 19;

const AUDIENCES = [
  {
    key: "outbound" as const,
    label: AGENT_DIRECTION_MODES.outbound.label,
    detail: "Lead response and follow through",
    uses: ["Lead Response", "Quote Follow Up", "Appointment Setting"],
    href: "/signup?plan=starter&mode=outbound",
    icon: PhoneCall,
  },
  {
    key: "inbound" as const,
    label: AGENT_DIRECTION_MODES.inbound.label,
    detail: "Front desk and support triage",
    uses: ["Front Desk", "Lead Qualifier", "Support Triage"],
    href: "/signup?plan=starter&mode=inbound",
    icon: Headphones,
  },
  {
    key: "hybrid" as const,
    label: AGENT_DIRECTION_MODES.hybrid.label,
    detail: "Daily calls, booking, and handoffs",
    uses: ["Sales Desk", "Collections Desk", "Appointment Desk"],
    href: "/signup?plan=starter&mode=hybrid",
    icon: Sparkles,
  },
] as const;

const CHANNELS = [
  { label: "Voice", icon: PhoneCall },
  { label: "Text", icon: MessageSquareText },
  { label: "Email", icon: Mail },
  { label: "Live Video Add-On", icon: Video },
] as const;

const EXAMPLE_RUN = [
  {
    label: "Call answered",
    detail: "Need captured",
    icon: PhoneCall,
  },
  {
    label: "Lead qualified",
    detail: "Right service matched",
    icon: BadgeCheck,
  },
  {
    label: "Appointment booked",
    detail: "Tuesday at 2:30 PM",
    icon: CalendarCheck2,
  },
  {
    label: "Confirmation sent",
    detail: "Text and email",
    icon: MessageSquareText,
  },
] as const;

const LEGAL_LINKS = [
  { to: "/trust", label: "Trust" },
  { to: "/status", label: "Status" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
] as const;

export default function WireAgentLanding() {
  useEffect(() => {
    emitProductEventOnce({
      event: "landing_viewed",
      surface: "marketing_web",
      metadata: { path: window.location.pathname || "/", scope: "home_hero" },
    });
  }, []);

  const selectAudience = (audience: (typeof AUDIENCES)[number]["key"]) => {
    emitProductEvent({
      event: "landing_audience_selected",
      surface: "marketing_web",
      metadata: { audience, source: "hero_work_lane" },
    });
  };

  const trackPrimaryAction = () => {
    emitProductEvent({
      event: "landing_primary_cta_clicked",
      surface: "marketing_web",
      metadata: {
        label: MARKETING_VOICE.primaryCta,
        destination: PERSONAL_SIGNUP,
        source: "marketing_hero",
      },
    });
  };

  return (
    <div className="marketing-surface landing-home bg-background text-foreground">
      <PrecisionPublicHeader />

      <main id="main-content" className="marketing-flow landing-home__flow" tabIndex={-1}>
        <section className="marketing-section marketing-section--screen landing-stage">
          <div className="landing-stage__ambient" aria-hidden="true" />

          <div className="landing-stage__rail">
            <div className="landing-stage__copy">
              <div className="landing-stage__eyebrow">
                <span className="landing-stage__live-label">
                  <span className="landing-stage__live-dot" aria-hidden="true" />
                  Live Product Demo
                </span>
                <span className="landing-stage__eyebrow-detail">Voice, text, and email</span>
              </div>

              <h1 className="landing-stage__title">{MARKETING_VOICE.headline}</h1>
              <p className="landing-stage__subline">{MARKETING_VOICE.subline}</p>

              <div className="landing-stage__actions">
                <Link
                  to={PERSONAL_SIGNUP}
                  className="marketing-btn-primary landing-stage__primary"
                  onClick={trackPrimaryAction}
                >
                  {MARKETING_VOICE.primaryCta}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <a href="#hear-a-demo" className="marketing-btn-secondary landing-stage__secondary">
                  Hear It Live
                </a>
              </div>

              <div className="landing-stage__economics" aria-label="Plan summary">
                <span>Start free.</span>
                <span>Go live from ${STARTER_PRICE}/mo</span>
                <span>Wireline number on paid plans</span>
                <Link to="/pricing">See Plans</Link>
                <span className="sr-only">
                  Channels unlock at activation. Paid plans include a Wireline number. Extra usage
                  uses prepaid Runtime Balance.
                </span>
              </div>

              <h2 className="sr-only">How Wireline works</h2>
              <ol className="landing-stage__spine" aria-label="How Wireline works">
                {HERO_LOOP.map((step, index) => (
                  <li key={step}>
                    <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    {step}
                  </li>
                ))}
              </ol>

              <nav className="landing-stage__lanes" aria-label="Agent work lane">
                {AUDIENCES.map((audience) => {
                  const Icon = audience.icon;
                  return (
                    <Link
                      key={audience.key}
                      to={audience.href}
                      className="landing-stage__lane"
                      onClick={() => selectAudience(audience.key)}
                    >
                      <Icon className="landing-stage__lane-icon" aria-hidden="true" />
                      <span>
                        <strong>{audience.label}</strong>
                        <small className="wl-preserve-case">{audience.detail}</small>
                        <span className="sr-only">{audience.uses.join(", ")}</span>
                      </span>
                      <ArrowRight className="landing-stage__lane-arrow" aria-hidden="true" />
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="landing-stage__proof">
              <div id="hear-a-demo" className="landing-console">
                <header className="landing-console__header">
                  <div className="landing-console__brand">
                    <WirelineMark signal className="landing-console__mark" />
                    <span>Wireline Live</span>
                  </div>
                  <div className="landing-console__status">
                    <span aria-hidden="true" />
                    Public Demo
                  </div>
                </header>

                <div className="landing-console__body">
                  <BrowserCallWidget
                    variant="stage"
                    agentName={HERO_DEMO_AGENT.name}
                    buttonLabel="Hear It Live"
                    fallback={
                      <a
                        href={`tel:${HERO_DEMO_AGENT.tel}`}
                        className="landing-demo__button"
                        aria-label="Hear It Live"
                        onClick={() =>
                          emitProductEvent({
                            event: "landing_demo_clicked",
                            surface: "marketing_web",
                            metadata: {
                              agent: HERO_DEMO_AGENT.name,
                              mode: "phone",
                            },
                          })
                        }
                      >
                        <Phone className="size-4" aria-hidden="true" />
                        <span>Hear It Live</span>
                      </a>
                    }
                  />

                  <aside
                    className="landing-console__activity"
                    aria-label="Example completed workflow"
                  >
                    <div className="landing-console__activity-heading">
                      <div>
                        <p className="landing-console__activity-kicker">Example Run</p>
                        <h2 className="landing-console__activity-title">
                          One call. A completed next step.
                        </h2>
                      </div>
                      <span className="landing-console__duration">00:42</span>
                    </div>

                    <ol className="landing-console__events">
                      {EXAMPLE_RUN.map((event, index) => {
                        const Icon = event.icon;
                        return (
                          <li key={event.label}>
                            <span className="landing-console__event-icon">
                              <Icon aria-hidden="true" />
                            </span>
                            <span className="landing-console__event-copy">
                              <strong>{event.label}</strong>
                              <small>{event.detail}</small>
                            </span>
                            <span className="landing-console__event-index" aria-hidden="true">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                          </li>
                        );
                      })}
                    </ol>

                    <div className="landing-console__outcome">
                      <span>Outcome</span>
                      <strong>Booked and logged</strong>
                    </div>
                  </aside>
                </div>

                <footer className="landing-console__footer">
                  <div className="landing-console__control-note">
                    <ShieldCheck aria-hidden="true" />
                    <span>You set the rules, approvals, spend, and handoffs.</span>
                  </div>
                  <ul className="landing-console__channels" aria-label="Agent channels">
                    {CHANNELS.map((channel) => {
                      const Icon = channel.icon;
                      return (
                        <li key={channel.label}>
                          <Icon aria-hidden="true" />
                          {channel.label}
                        </li>
                      );
                    })}
                  </ul>
                </footer>
              </div>
            </div>
          </div>

          <footer className="landing-stage__footer">
            <p>One trained voice agent across conversations, follow through, and proof.</p>
            <nav aria-label="Legal">
              {LEGAL_LINKS.map((link) => (
                <Link key={link.to} to={link.to}>
                  {link.label}
                </Link>
              ))}
            </nav>
          </footer>
        </section>
      </main>
    </div>
  );
}
