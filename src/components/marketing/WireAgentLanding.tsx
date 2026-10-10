import { useEffect } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Headphones,
  PhoneIncoming,
  PhoneOutgoing,
  ShieldCheck,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";

import BotBoundMark from "../brand/BotBoundMark";
import LandingFooter from "./LandingFooter";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import { BOT_BRAND, BOT_MARKETING_VOICE, BOT_ROLE_TEMPLATES } from "../../lib/bot-product";
import { DIRECT_OUTBOUND_AVAILABILITY } from "../../lib/outbound-call-purpose";
import { STRIPE_PLANS } from "../../lib/plan-catalog";
import { MARKETING_CALLS_NOTICE } from "../../lib/product-copy";
import { emitProductEvent, emitProductEventOnce } from "../../lib/product-event-client";
import { signupHrefForPlan } from "../../lib/signup-intent";
import { usePaidPlanAvailability } from "../../hooks/usePaidPlanAvailability";

const FEATURED_TEMPLATE_KEYS = [
  "sales-rep",
  "front-desk",
  "recruiter",
  "appointment-setter",
  "customer-support",
  "custom",
] as const;
const FEATURED_TEMPLATES = FEATURED_TEMPLATE_KEYS.map((key) => {
  const template = BOT_ROLE_TEMPLATES.find((candidate) => candidate.key === key);
  if (!template) throw new Error(`Missing Bot template: ${key}`);
  return template;
});
const DIRECTION_LABELS = {
  inbound: "Inbound",
  outbound: "Outbound",
  hybrid: "Inbound + outbound",
} as const;
const ROLE_ICONS: Record<string, LucideIcon> = {
  "sales-rep": PhoneOutgoing,
  "front-desk": PhoneIncoming,
  recruiter: BriefcaseBusiness,
  "appointment-setter": CalendarDays,
  "customer-support": Headphones,
  custom: WandSparkles,
};
const PUBLIC_PLAN_IDS = ["personal", "email", "voice-regular", "voice-email-regular"] as const;
const PLAN_NAMES: Record<(typeof PUBLIC_PLAN_IDS)[number], string> = {
  personal: "Free Builder",
  email: "Email",
  "voice-regular": "Calls",
  "voice-email-regular": "Calls + Email",
};
const PUBLIC_PLANS = PUBLIC_PLAN_IDS.map((id) => {
  const plan = STRIPE_PLANS.find((candidate) => candidate.id === id);
  if (!plan) throw new Error(`Missing public plan: ${id}`);
  return { id, plan };
});

export default function WireAgentLanding() {
  const { canActivate, notice } = usePaidPlanAvailability();
  useEffect(() => {
    emitProductEventOnce({
      event: "landing_viewed",
      surface: "marketing_web",
      metadata: { path: window.location.pathname || "/", scope: "prestige_access_home" },
    });
  }, []);

  const trackSignupIntent = (source: string, label: string) =>
    emitProductEvent({
      event: "landing_primary_cta_clicked",
      surface: "marketing_web",
      metadata: { source, label },
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
            <p className="landing-prestige__eyebrow">{BOT_BRAND.slogan}</p>
            <h1 id="landing-prestige-title">
              <span className="landing-prestige__title-line">
                <span>Voice Bots</span> <span>With a Computer,</span>
              </span>{" "}
              <span className="landing-prestige__title-line is-accent">
                <span>Phone Number,</span> <span>and Branded Email.</span>
              </span>
            </h1>
            <p className="landing-prestige__promise">
              {BOT_MARKETING_VOICE.activationLine} Then it finishes the work on its own cloud
              computer and follows up from its own inbox.
            </p>
            <div className="landing-prestige__actions">
              <Link
                to={signupHrefForPlan("personal")}
                className="landing-prestige__cta is-primary"
                onClick={() => trackSignupIntent("hero_primary", "Start Free")}
              >
                Start Free <ArrowRight aria-hidden="true" />
              </Link>
              <Link to="/signin" className="landing-prestige__cta">
                Sign In
              </Link>
            </div>
            <p className="landing-prestige__reassurance">
              <span>Build and test free.</span> <span>No card required.</span>
            </p>
            <nav className="landing-prestige__directions" aria-label="Choose Bot direction">
              <Link
                className="landing-prestige__direction is-inbound"
                to={signupHrefForPlan("personal", { template: "front-desk" })}
                onClick={() => trackSignupIntent("hero_direction", "Inbound Front Desk")}
              >
                <span className="landing-prestige__direction-label">
                  <PhoneIncoming aria-hidden="true" /> Inbound
                </span>
                <strong>Answer. Qualify. Route.</strong>
                <span className="landing-prestige__direction-action">
                  Build a Front Desk <ArrowRight aria-hidden="true" />
                </span>
              </Link>
              <Link
                className="landing-prestige__direction is-outbound"
                to={signupHrefForPlan("personal", { template: "sales-rep" })}
                onClick={() => trackSignupIntent("hero_direction", "Outbound Sales Rep")}
              >
                <span className="landing-prestige__direction-label">
                  <PhoneOutgoing aria-hidden="true" /> Outbound
                </span>
                <strong>Find. Call. Book.</strong>
                <span className="landing-prestige__direction-action">
                  Build a Sales Rep <ArrowRight aria-hidden="true" />
                </span>
              </Link>
            </nav>
            {DIRECT_OUTBOUND_AVAILABILITY.available ? null : (
              <p className="landing-prestige__reassurance">
                <span>{MARKETING_CALLS_NOTICE}</span> <span>Build and test a Sales Rep free.</span>
              </p>
            )}
          </div>
        </section>

        <section id="solutions" className="landing-prestige__section landing-prestige__roles">
          <div className="landing-prestige__rail">
            <header className="landing-prestige__section-heading">
              <p>Inbound + Outbound</p>
              <h2>
                <span>Pick the Work.</span> <span>Put a Bot on It.</span>
              </h2>
              <span>Start with a role. Make its knowledge, voice, and next steps your own.</span>
              {DIRECT_OUTBOUND_AVAILABILITY.available ? null : (
                <span className="landing-prestige__outbound-note">
                  {MARKETING_CALLS_NOTICE} Outbound roles build and test free today.
                </span>
              )}
            </header>
            <div className="landing-prestige__role-grid">
              {FEATURED_TEMPLATES.map((template) => {
                const Icon = ROLE_ICONS[template.key] ?? WandSparkles;
                return (
                  <article key={template.key} className="landing-prestige__role-card">
                    <div className="landing-prestige__role-topline">
                      <Icon aria-hidden="true" />
                      <span>{DIRECTION_LABELS[template.direction]}</span>
                    </div>
                    <h3>{template.name}</h3>
                    <p>{template.summary}</p>
                    <ul>
                      {template.moves.map((move) => (
                        <li key={move}>
                          <Check aria-hidden="true" />
                          <span>{move}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      to={signupHrefForPlan("personal", { template: template.key })}
                      onClick={() => trackSignupIntent("role_starter", template.name)}
                    >
                      Build This Role
                      <span className="sr-only">: {template.name}</span>
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="pricing" className="landing-prestige__section landing-prestige__pricing">
          <div className="landing-prestige__rail">
            <header className="landing-prestige__section-heading">
              <p>Pricing</p>
              <h2>
                <span>Build Free.</span> <span>Go Live on Your Terms.</span>
              </h2>
              <span>Choose your channels and monthly capacity.</span>
              <span className="landing-prestige__activation" role="status">
                {notice}
              </span>
            </header>
            <div className="landing-prestige__price-grid">
              {PUBLIC_PLANS.map(({ id, plan }) => {
                const free = id === "personal";
                const featured = id === "voice-email-regular";
                return (
                  <article
                    key={id}
                    className={`landing-prestige__price-card${featured ? " is-featured" : ""}`}
                  >
                    <div>
                      <p>{PLAN_NAMES[id]}</p>
                      <span>
                        {free ? "Private" : plan.capacityTier === "light" ? "Light" : "Regular"}
                      </span>
                      <div className="landing-prestige__price-number">
                        <strong>${plan.price_usd_monthly}</strong>
                        <span>{free ? "forever" : "/mo"}</span>
                      </div>
                    </div>
                    <ul>
                      <li>
                        <Check aria-hidden="true" />
                        {free
                          ? "1 private Bot"
                          : `${plan.max_agents} live Bot${plan.max_agents === 1 ? "" : "s"}`}
                      </li>
                      <li>
                        <Check aria-hidden="true" />
                        {free
                          ? "Private simulation"
                          : plan.voice_minutes_monthly > 0
                            ? `${plan.voice_minutes_monthly} call minutes/month`
                            : "1 managed email inbox"}
                      </li>
                      <li>
                        <Check aria-hidden="true" />
                        {free
                          ? "Upgrade for live work"
                          : id === "email"
                            ? "AI and email allowance included"
                            : id === "voice-email-regular"
                              ? "1 number + 1 email inbox"
                              : "1 local number included"}
                      </li>
                    </ul>
                    <Link
                      to={signupHrefForPlan(id)}
                      className={featured ? "is-primary" : undefined}
                      onClick={() => trackSignupIntent("pricing", PLAN_NAMES[id])}
                    >
                      {free
                        ? "Start Free"
                        : `${canActivate(id) ? "Choose" : "Set Up"} ${PLAN_NAMES[id]}`}
                    </Link>
                  </article>
                );
              })}
            </div>
            <div className="landing-prestige__pricing-more">
              <Link to="/pricing">
                Compare plans &amp; usage
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section className="landing-prestige__closing" aria-labelledby="landing-prestige-closing">
          <div className="landing-prestige__rail">
            <h2 id="landing-prestige-closing">
              <span>Put Your First Bot</span> <span>to Work.</span>
            </h2>
            <p>Build and test it free. Go live when it sounds like your business.</p>
            <div className="landing-prestige__actions">
              <Link
                to={signupHrefForPlan("personal")}
                className="landing-prestige__cta is-primary"
                onClick={() => trackSignupIntent("closing_primary", "Start Free")}
              >
                Start Free <ArrowRight aria-hidden="true" />
              </Link>
              <Link to="/features" className="landing-prestige__cta">
                How It Works
              </Link>
            </div>
          </div>
        </section>

        <section className="landing-prestige__trust" aria-label="BotBound trust and control">
          <div className="landing-prestige__rail landing-prestige__trust-inner">
            <div>
              <ShieldCheck aria-hidden="true" />
              <strong>Your Line. Your Rules.</strong>
            </div>
            <nav aria-label="Trust links">
              <Link to="/security">Security</Link>
              <Link to="/privacy">Privacy</Link>
              <Link to="/support">Support</Link>
            </nav>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
