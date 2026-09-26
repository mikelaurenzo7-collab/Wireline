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

import AuthAccessPanel from "../auth/AuthAccessPanel";
import { BotBoundLockup } from "../brand/BotBoundBrand";
import LandingFooter from "./LandingFooter";
import { BOT_MARKETING_VOICE, BOT_ROLE_TEMPLATES } from "../../lib/bot-product";
import { STRIPE_PLANS } from "../../lib/plan-catalog";
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
const PUBLIC_PLAN_IDS = ["personal", "starter", "team", "business"] as const;
const PLAN_NAMES: Record<(typeof PUBLIC_PLAN_IDS)[number], string> = {
  personal: "Free Builder",
  starter: "Starter",
  team: "Starter Plus",
  business: "Pro",
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
      <main id="main-content" className="landing-prestige__main" tabIndex={-1}>
        <section className="landing-prestige__entrance" aria-labelledby="landing-prestige-title">
          <div className="landing-prestige__hero" aria-label="BotBound">
            <Link className="landing-prestige__hero-brand" to="/" aria-label="BotBound home">
              <BotBoundLockup
                size="display"
                surface="bare"
                className="landing-prestige__hero-lockup"
              />
            </Link>
            <div className="landing-prestige__hero-copy">
              <p className="landing-prestige__eyebrow">
                AI VOICE BOTS. BUILT AROUND YOUR BUSINESS.
              </p>
              <h1 id="landing-prestige-title">
                <span>Your Next Hire</span>
                <span>Is a Bot</span>
              </h1>
              <p className="landing-prestige__promise">{BOT_MARKETING_VOICE.activationLine}</p>
              <nav className="landing-prestige__directions" aria-label="Choose Bot direction">
                <Link
                  className="landing-prestige__direction is-outbound"
                  to={signupHrefForPlan("personal", { template: "sales-rep" })}
                  onClick={() => trackSignupIntent("hero_direction", "Outbound Sales Rep")}
                >
                  <span className="landing-prestige__direction-label">
                    <PhoneOutgoing aria-hidden="true" /> OUTBOUND
                  </span>
                  <strong className="wl-preserve-case">Find. Call. Book.</strong>
                  <span className="landing-prestige__direction-action">
                    Build a Sales Rep <ArrowRight aria-hidden="true" />
                  </span>
                </Link>
                <Link
                  className="landing-prestige__direction is-inbound"
                  to={signupHrefForPlan("personal", { template: "front-desk" })}
                  onClick={() => trackSignupIntent("hero_direction", "Inbound Front Desk")}
                >
                  <span className="landing-prestige__direction-label">
                    <PhoneIncoming aria-hidden="true" /> INBOUND
                  </span>
                  <strong className="wl-preserve-case">Answer. Qualify. Route.</strong>
                  <span className="landing-prestige__direction-action">
                    Build a Front Desk <ArrowRight aria-hidden="true" />
                  </span>
                </Link>
              </nav>
              <div className="landing-prestige__explore">
                <p>Build &amp; test free. Explore live plans.</p>
                <nav aria-label="Explore BotBound">
                  <Link to="/features">
                    How it works <ArrowRight aria-hidden="true" />
                  </Link>
                  <Link to="/pricing">
                    Explore pricing <ArrowRight aria-hidden="true" />
                  </Link>
                </nav>
              </div>
            </div>
          </div>

          <div className="landing-prestige__auth">
            <AuthAccessPanel embedded initialMode="signup" showBrand={false} />
            <nav className="landing-prestige__mobile-links" aria-label="Public information">
              <Link to="/privacy">Privacy</Link>
              <Link to="/terms">Terms</Link>
              <Link to="/trust">Trust</Link>
            </nav>
          </div>
        </section>

        <div className="landing-prestige__desktop-only">
          <section id="solutions" className="landing-prestige__section landing-prestige__roles">
            <div className="landing-prestige__rail">
              <header className="landing-prestige__section-heading">
                <p>OUTBOUND + INBOUND</p>
                <h2>Pick the Work. Put a Bot on It</h2>
                <span>Start with a role. Make its knowledge, voice, and next steps your own.</span>
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
                        Build this role
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
                <p>PRICING</p>
                <h2>Build Free. Go Live on Your Terms</h2>
                <span>One private Bot to start. More live Bots as your business grows.</span>
                <span>{notice}</span>
              </header>
              <div className="landing-prestige__price-grid">
                {PUBLIC_PLANS.map(({ id, plan }) => {
                  const free = id === "personal";
                  const featured = id === "team";
                  return (
                    <article
                      key={id}
                      className={`landing-prestige__price-card${featured ? " is-featured" : ""}`}
                    >
                      <div>
                        <p>{PLAN_NAMES[id]}</p>
                        <div className="landing-prestige__price-number">
                          <strong>${plan.price_usd_monthly}</strong>
                          <span>{free ? "forever" : "/mo"}</span>
                        </div>
                      </div>
                      <ul>
                        <li>
                          {free
                            ? "1 private Bot"
                            : `${plan.max_agents} live Bot${plan.max_agents === 1 ? "" : "s"}`}
                        </li>
                        <li>
                          {free
                            ? "Private simulation"
                            : `${plan.voice_minutes_monthly} call minutes/month`}
                        </li>
                        <li>
                          {free
                            ? "Upgrade for live work"
                            : `${plan.included_phone_numbers} number${plan.included_phone_numbers === 1 ? "" : "s"} included`}
                        </li>
                      </ul>
                      <Link
                        to={signupHrefForPlan(id)}
                        className={featured ? "is-primary" : undefined}
                        onClick={() => trackSignupIntent("pricing", PLAN_NAMES[id])}
                      >
                        {free
                          ? "Start free"
                          : `${canActivate(id) ? "Choose" : "Set up"} ${PLAN_NAMES[id]}`}
                      </Link>
                    </article>
                  );
                })}
              </div>
              <div className="mt-6 flex justify-center">
                <Link
                  to="/pricing"
                  className="wl-focus-ring-halo inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Compare plans &amp; usage
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </section>

          <section className="landing-prestige__trust" aria-label="BotBound trust and control">
            <div className="landing-prestige__rail landing-prestige__trust-inner">
              <div>
                <ShieldCheck aria-hidden="true" />
                <strong className="wl-preserve-case">Your Line. Your Rules.</strong>
              </div>
              <nav aria-label="Trust links">
                <Link to="/security">Security</Link>
                <Link to="/privacy">Privacy</Link>
                <Link to="/support">Support</Link>
              </nav>
            </div>
          </section>
          <LandingFooter />
        </div>
      </main>
    </div>
  );
}
