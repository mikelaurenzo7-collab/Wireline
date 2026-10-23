import { useEffect } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Headphones,
  PhoneIncoming,
  House,
  ShieldCheck,
  UserRound,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";

import BotBoundMark from "../brand/BotBoundMark";
import LandingFooter from "./LandingFooter";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import { BOT_ROLE_TEMPLATES } from "../../lib/bot-product";
import { STRIPE_PLANS } from "../../lib/plan-catalog";
import { getPlanCapacityLabel, getPlanDisplayName } from "../../lib/plan-display";
import { emitProductEvent, emitProductEventOnce } from "../../lib/product-event-client";
import { signupHrefForPlan } from "../../lib/signup-intent";
import { usePaidPlanAvailability } from "../../hooks/usePaidPlanAvailability";
import { useAuth } from "../../contexts/AuthContext";

const FEATURED_TEMPLATE_KEYS = [
  "personal-assistant",
  "family-concierge",
  "front-desk",
  "appointment-setter",
  "customer-support",
  "custom",
] as const;
const FEATURED_TEMPLATES = FEATURED_TEMPLATE_KEYS.map((key) => {
  const template = BOT_ROLE_TEMPLATES.find((candidate) => candidate.key === key);
  if (!template) throw new Error(`Missing Bot template: ${key}`);
  return template;
});
const ROLE_ICONS: Record<string, LucideIcon> = {
  "personal-assistant": UserRound,
  "family-concierge": House,
  "front-desk": PhoneIncoming,
  "appointment-setter": CalendarDays,
  "customer-support": Headphones,
  custom: WandSparkles,
};
const PUBLIC_PLAN_IDS = ["personal", "email", "voice", "voice-email"] as const;
const PUBLIC_PLANS = PUBLIC_PLAN_IDS.map((id) => {
  const plan = STRIPE_PLANS.find((candidate) => candidate.id === id);
  if (!plan) throw new Error(`Missing public plan: ${id}`);
  return { id, plan };
});

export default function WireAgentLanding() {
  const { available, canActivate, needsEmailSetupReview, notice } = usePaidPlanAvailability();
  const signedIn = Boolean(useAuth().user);
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
            <h1 id="landing-prestige-title">
              <span className="landing-prestige__title-line">VOICE BOTS.</span>{" "}
              <span className="landing-prestige__title-line is-accent">REAL WORK.</span>
            </h1>
            <p className="landing-prestige__description">
              YOUR BOT GETS THEIR OWN PHONE NUMBER, EMAIL ADDRESS, AND COMPUTER.
            </p>
            <p className="landing-prestige__channel-choice">Choose the channels you need.</p>
            <div className="landing-prestige__actions">
              {signedIn ? (
                <Link to="/studio" className="landing-prestige__cta is-primary">
                  Open Workspace <ArrowRight aria-hidden="true" />
                </Link>
              ) : (
                <>
                  <Link
                    to="/signup"
                    className="landing-prestige__cta is-primary"
                    onClick={() => trackSignupIntent("hero_primary", "Get Started")}
                  >
                    Get Started <ArrowRight aria-hidden="true" />
                  </Link>
                  <Link to="/signin" className="landing-prestige__cta">
                    Sign In
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>

        <section id="solutions" className="landing-prestige__section landing-prestige__roles">
          <div className="landing-prestige__rail">
            <header className="landing-prestige__section-heading">
              <h2>Make it yours.</h2>
              <span>Start with a role. Give it your way of doing things.</span>
            </header>
            <div className="landing-prestige__role-grid">
              {FEATURED_TEMPLATES.map((template) => {
                const Icon = ROLE_ICONS[template.key] ?? WandSparkles;
                return (
                  <article key={template.key} className="landing-prestige__role-card">
                    <div className="landing-prestige__role-topline">
                      <Icon aria-hidden="true" />
                    </div>
                    <h3>{template.name}</h3>
                    <p>{template.summary}</p>
                    <Link
                      to={`/signup?template=${encodeURIComponent(template.key)}`}
                      onClick={() => trackSignupIntent("role_starter", template.name)}
                    >
                      Use this role
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
              <h2>Choose your setup.</h2>
              <span>
                Every paid plan includes Computer access. Usage comes from its AI allowance.
              </span>
              {!available ? (
                <span className="landing-prestige__activation" role="status">
                  {notice}
                </span>
              ) : null}
            </header>
            <div className="landing-prestige__price-grid">
              {PUBLIC_PLANS.map(({ id, plan }) => {
                const planName = getPlanDisplayName(plan);
                const featured = id === "voice-email";
                const emailSetupReview = needsEmailSetupReview(id);
                return (
                  <article
                    key={id}
                    aria-label={`${planName} plan`}
                    className={`landing-prestige__price-card${featured ? " is-featured" : ""}`}
                  >
                    <div>
                      <p>{planName}</p>
                      <span>{getPlanCapacityLabel(plan)}</span>
                      <div className="landing-prestige__price-number">
                        <strong>${plan.price_usd_monthly}</strong>
                        <span>/mo</span>
                      </div>
                    </div>
                    <ul>
                      <li>
                        <Check aria-hidden="true" />
                        {`${plan.max_agents} live Bot${plan.max_agents === 1 ? "" : "s"}`}
                      </li>
                      <li>
                        <Check aria-hidden="true" />
                        {plan.voice_minutes_monthly > 0
                          ? `${plan.voice_minutes_monthly} call minutes/month`
                          : "1 managed email inbox"}
                      </li>
                      <li>
                        <Check aria-hidden="true" />
                        {id === "email"
                          ? "AI and email allowance included"
                          : id === "voice-email"
                            ? "1 number + 1 email inbox"
                            : id === "personal"
                              ? "1 number + connected inbox"
                              : "1 local number included"}
                      </li>
                    </ul>
                    {emailSetupReview ? (
                      <p className="landing-prestige__price-note">
                        Email activation has a <Link to="/contact?topic=email">setup review</Link>.
                      </p>
                    ) : null}
                    <Link
                      to={signupHrefForPlan(id)}
                      className={featured ? "is-primary" : undefined}
                      onClick={() => trackSignupIntent("pricing", planName)}
                    >
                      {emailSetupReview
                        ? `Choose ${planName}`
                        : `${canActivate(id) ? "Choose" : "Set Up"} ${planName}`}
                    </Link>
                  </article>
                );
              })}
            </div>
            <div className="landing-prestige__pricing-more">
              <Link to="/pricing">
                Compare all channels and usage
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section className="landing-prestige__closing" aria-labelledby="landing-prestige-closing">
          <div className="landing-prestige__rail">
            <h2 id="landing-prestige-closing">
              <span>LESS BUSYWORK.</span> <span>MORE ROOM.</span>
            </h2>
            <p>Your next task is a good place to start.</p>
            <div className="landing-prestige__actions">
              {signedIn ? (
                <Link to="/studio" className="landing-prestige__cta is-primary">
                  Open Workspace <ArrowRight aria-hidden="true" />
                </Link>
              ) : (
                <Link
                  to="/signup"
                  className="landing-prestige__cta is-primary"
                  onClick={() => trackSignupIntent("closing_primary", "Get Started")}
                >
                  Get Started <ArrowRight aria-hidden="true" />
                </Link>
              )}
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
