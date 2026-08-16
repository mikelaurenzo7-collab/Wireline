import { useEffect } from "react";
import { Phone } from "lucide-react";
import { Link } from "react-router";

import PrecisionPublicHeader from "./PrecisionPublicHeader";
import BrowserCallWidget from "./BrowserCallWidget";
import { AGENT_DIRECTION_MODES, MARKETING_VOICE } from "../../lib/product-copy";
import { STRIPE_PLANS } from "../../lib/plan-catalog";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../../data/contact-agents";
import { emitProductEvent, emitProductEventOnce } from "../../lib/product-event-client";

const HERO_LOOP = MARKETING_VOICE.spine;
const HERO_DEMO_AGENT = LANDING_PUBLIC_DEMO_AGENTS[0];
const PERSONAL_SIGNUP = "/signup?plan=personal";
const SALES_SIGNUP = "/signup?plan=starter&mode=outbound";
const SERVICE_SIGNUP = "/signup?plan=starter&mode=inbound";
const HYBRID_SIGNUP = "/signup?plan=starter&mode=hybrid";
const STARTER_PRICE =
  STRIPE_PLANS.find((plan) => plan.id === "starter")?.price_usd_monthly ?? 19;

const AUDIENCES = [
  {
    key: "outbound" as const,
    label: AGENT_DIRECTION_MODES.outbound.label,
    href: SALES_SIGNUP,
    uses: ["Lead Response", "Quote Follow Up", "Appointment Setting"],
  },
  {
    key: "inbound" as const,
    label: AGENT_DIRECTION_MODES.inbound.label,
    href: SERVICE_SIGNUP,
    uses: ["Front Desk", "Lead Qualifier", "Support Triage"],
  },
  {
    key: "hybrid" as const,
    label: AGENT_DIRECTION_MODES.hybrid.label,
    href: HYBRID_SIGNUP,
    uses: ["Sales Desk", "Collections Desk", "Appointment Desk"],
  },
] as const;

const CHANNELS = ["Voice", "Text", "Email", "Live Video"] as const;

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

  return (
    <div className="marketing-surface landing-home bg-background text-foreground">
      <PrecisionPublicHeader />

      <main id="main-content" className="marketing-flow" tabIndex={-1}>
        <section className="marketing-section marketing-section--screen landing-stage">
          <div className="landing-stage__whisper">
            <h1 aria-label={MARKETING_VOICE.headline} className="landing-stage__title">
              {MARKETING_VOICE.headline}
            </h1>
            <h2 className="sr-only">How Wireline works</h2>
            <ol className="landing-stage__loop">
              {HERO_LOOP.map((step, index) => (
                <li
                  key={step}
                  className={index === HERO_LOOP.length - 1 ? "wl-wire-step--settled" : undefined}
                >
                  <span className="wl-overline text-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div id="hear-a-demo" className="landing-stage__device">
            <BrowserCallWidget
              variant="phone"
              agentName={HERO_DEMO_AGENT.name}
              buttonLabel="Hear It Live"
              fallback={
                <a
                  href={`tel:${HERO_DEMO_AGENT.tel}`}
                  className="landing-phone__call"
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
                  <Phone className="h-5 w-5" aria-hidden="true" />
                </a>
              }
            />
          </div>

          <div className="landing-stage__dock">
            <div className="landing-stage__actions">
              <Link
                to={PERSONAL_SIGNUP}
                className="marketing-btn-primary landing-stage__cta min-h-11 px-5 text-sm font-semibold"
                onClick={() =>
                  emitProductEvent({
                    event: "landing_primary_cta_clicked",
                    surface: "marketing_web",
                    metadata: {
                      label: MARKETING_VOICE.primaryCta,
                      destination: PERSONAL_SIGNUP,
                      source: "marketing_hero",
                    },
                  })
                }
              >
                {MARKETING_VOICE.primaryCta}
              </Link>
              <Link
                to="/pricing"
                className="marketing-btn-secondary landing-stage__cta min-h-11 px-5 text-sm font-semibold"
              >
                See Plans
              </Link>
            </div>

            <nav className="landing-stage__lanes" aria-label="Agent work lane">
              {AUDIENCES.map((audience) => (
                <Link
                  key={audience.key}
                  to={audience.href}
                  onClick={() => selectAudience(audience.key)}
                  className="landing-stage__lane"
                >
                  {audience.label}
                  <span className="sr-only">{audience.uses.join(", ")}</span>
                </Link>
              ))}
            </nav>

            <ul className="landing-stage__channels" aria-label="Agent channels">
              {CHANNELS.map((label) => (
                <li key={label} className="landing-stage__channel">
                  {label}
                </li>
              ))}
            </ul>

            <p className="landing-stage__note">
              Start free. Live from ${STARTER_PRICE}/mo.
              <span className="sr-only">
                {" "}
                Channels unlock at activation. Paid plans include a Wireline number. Extra usage is
                prepaid Runtime Balance.
              </span>
            </p>
          </div>
        </section>
      </main>

      <nav className="sr-only" aria-label="Legal">
        {LEGAL_LINKS.map((link) => (
          <Link key={link.to} to={link.to}>
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
