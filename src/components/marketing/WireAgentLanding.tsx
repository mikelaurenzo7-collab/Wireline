import { useEffect, type ReactNode } from "react";
import { Headphones, LayoutGrid, Layers, Phone, PhoneCall, Sparkles, UserRound } from "lucide-react";
import { Link } from "react-router";

import PrecisionPublicHeader from "./PrecisionPublicHeader";
import BrowserCallWidget from "./BrowserCallWidget";
import { DialogTrigger } from "../atoms";
import WirelineMark from "../brand/WirelineMark";
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
    tone: "sales" as const,
    icon: PhoneCall,
  },
  {
    key: "inbound" as const,
    label: AGENT_DIRECTION_MODES.inbound.label,
    href: SERVICE_SIGNUP,
    uses: ["Front Desk", "Lead Qualifier", "Support Triage"],
    tone: "service" as const,
    icon: Headphones,
  },
  {
    key: "hybrid" as const,
    label: AGENT_DIRECTION_MODES.hybrid.label,
    href: HYBRID_SIGNUP,
    uses: ["Sales Desk", "Collections Desk", "Appointment Desk"],
    tone: "hybrid" as const,
    icon: Sparkles,
  },
] as const;

const CHANNELS = ["Voice", "Text", "Email", "Live Video"] as const;

const LEGAL_LINKS = [
  { to: "/trust", label: "Trust" },
  { to: "/status", label: "Status" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
] as const;

function OsApp({
  to,
  label,
  caption,
  hint,
  tone,
  onClick,
  children,
}: {
  to: string;
  label: string;
  caption?: string;
  hint?: string;
  tone: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`landing-os__app landing-os__app--${tone}`}
      aria-label={caption ? label : undefined}
      onClick={onClick}
    >
      <span className="landing-os__icon" aria-hidden="true">
        {children}
      </span>
      <span className="landing-os__label">{caption ?? label}</span>
      {hint ? <span className="sr-only">{hint}</span> : null}
    </Link>
  );
}

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
    <div className="marketing-surface landing-home landing-os bg-background text-foreground">
      <PrecisionPublicHeader chrome="hidden">
        <main id="main-content" className="marketing-flow" tabIndex={-1}>
          <section className="marketing-section marketing-section--screen landing-stage">
            <div id="hear-a-demo" className="landing-stage__device">
              <BrowserCallWidget
                variant="phone"
                agentName={HERO_DEMO_AGENT.name}
                buttonLabel="Hear It Live"
                island={
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="landing-phone__island"
                      aria-label="Wireline menu"
                      aria-controls="wireline-mobile-navigation"
                    >
                      <WirelineMark signal className="landing-phone__mark" />
                      <span className="landing-phone__wordmark">Wireline</span>
                    </button>
                  </DialogTrigger>
                }
                heading={
                  <div className="landing-stage__whisper">
                    <h1 aria-label={MARKETING_VOICE.headline} className="landing-stage__title">
                      {MARKETING_VOICE.headline}
                    </h1>
                    <div className="sr-only">
                      <h2>How Wireline works</h2>
                      <ol className="landing-stage__loop">
                        {HERO_LOOP.map((step, index) => (
                          <li
                            key={step}
                            className={
                              index === HERO_LOOP.length - 1 ? "wl-wire-step--settled" : undefined
                            }
                          >
                            <span className="wl-overline text-foreground">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                }
                dock={
                  <div className="landing-stage__dock">
                    <nav className="landing-stage__lanes" aria-label="Agent work lane">
                      {AUDIENCES.map((audience) => {
                        const Icon = audience.icon;
                        return (
                          <OsApp
                            key={audience.key}
                            to={audience.href}
                            label={audience.label}
                            tone={audience.tone}
                            hint={audience.uses.join(", ")}
                            onClick={() => selectAudience(audience.key)}
                          >
                            <Icon className="landing-os__glyph" />
                          </OsApp>
                        );
                      })}
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
                        Channels unlock at activation. Paid plans include a Wireline number. Extra
                        usage is prepaid Runtime Balance.
                      </span>
                    </p>

                    <div className="landing-os__tray">
                      <OsApp
                        to={PERSONAL_SIGNUP}
                        label={MARKETING_VOICE.primaryCta}
                        caption="Build"
                        tone="build"
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
                        <WirelineMark signal className="landing-os__mark" />
                      </OsApp>
                      <OsApp to="/pricing" label="See Plans" caption="Plans" tone="plans">
                        <Layers className="landing-os__glyph" />
                      </OsApp>
                      <DialogTrigger asChild>
                        <button
                          type="button"
                          className="landing-os__app landing-os__app--apps"
                          aria-label="Open navigation"
                          aria-controls="wireline-mobile-navigation"
                        >
                          <span className="landing-os__icon" aria-hidden="true">
                            <LayoutGrid className="landing-os__glyph" />
                          </span>
                          <span className="landing-os__label">Apps</span>
                        </button>
                      </DialogTrigger>
                      <OsApp to="/signin" label="Sign In" tone="signin">
                        <UserRound className="landing-os__glyph" />
                      </OsApp>
                    </div>
                  </div>
                }
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
          </section>
        </main>

        <nav className="sr-only" aria-label="Legal">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
        </nav>
      </PrecisionPublicHeader>
    </div>
  );
}
