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

import LandingFooter from "./LandingFooter";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
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
      metadata: { path: window.location.pathname || "/", scope: "voice_bot_home" },
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
        <section className="landing-prestige__entrance" aria-labelledby="landing-prestige-title">
          <div className="landing-prestige__hero">
            <div className="landing-prestige__hero-copy">
              <p className="landing-prestige__eyebrow">{BOT_MARKETING_VOICE.eyebrow}</p>
              <h1 id="landing-prestige-title" aria-label={BOT_MARKETING_VOICE.headline}>
                <span className="landing-prestige__title-line">Voice Bots.</span>
                <span className="landing-prestige__title-line landing-prestige__title-accent">
                  Business Numbers.
                </span>
              </h1>
              <p className="landing-prestige__promise">{BOT_MARKETING_VOICE.subline}</p>
              <nav
                className="landing-prestige__hero-actions"
                aria-label="Get started with BotBound"
              >
                <Link
                  className="marketing-btn-primary landing-prestige__primary-action"
                  to={signupHrefForPlan("personal")}
                  onClick={() => trackSignupIntent("hero_primary", BOT_MARKETING_VOICE.primaryCta)}
                >
                  {BOT_MARKETING_VOICE.primaryCta}
                  <ArrowRight aria-hidden="true" />
                </Link>
                <Link
                  className="marketing-btn-secondary landing-prestige__secondary-action"
                  to="/features"
                >
                  See What It Can Do
                  <ArrowRight aria-hidden="true" />
                </Link>
              </nav>
              <p className="landing-prestige__disclosure">{BOT_MARKETING_VOICE.activationLine}</p>
              <p className="landing-prestige__availability" role="status" aria-live="polite">
                {notice}
              </p>
            </div>

            <figure className="landing-prestige__hero-art">
              <span className="landing-prestige__hero-signal" aria-hidden="true" />
              <img
                src="/brand/botbound-operator-polished.png"
                alt="BotBound's platinum operator holding a violet receiver"
                width="1280"
                height="1280"
                fetchPriority="high"
                decoding="async"
              />
            </figure>
          </div>
        </section>

        <div className="landing-prestige__content">
          <section id="solutions" className="landing-prestige__section landing-prestige__roles">
            <div className="landing-prestige__rail">
              <header className="landing-prestige__section-heading">
                <p>BUILT AROUND THE WORK</p>
                <h2>Bots Built Around Real Work</h2>
                <span>Start with a role, then shape its knowledge, voice, and next steps.</span>
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
                <h2>Choose Your Channels</h2>
                <span>Compare included channels and monthly capacity before you decide.</span>
                <p className="landing-prestige__availability">{notice}</p>
              </header>
              <div className="landing-prestige__price-grid">
                {PUBLIC_PLANS.map(({ id, plan }) => {
                  const free = id === "personal";
                  const featured = id === "voice-email-regular";
                  const available = !free && canActivate(id);
                  const actionLabel = free
                    ? "Start free"
                    : available
                      ? `Choose ${PLAN_NAMES[id]}`
                      : "View plan";
                  return (
                    <article
                      key={id}
                      className={`landing-prestige__price-card${featured ? " is-featured" : ""}`}
                    >
                      <div>
                        <p>{PLAN_NAMES[id]}</p>
                        {!free ? (
                          <span>{plan.capacityTier === "light" ? "Light" : "Regular"}</span>
                        ) : null}
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
                            : plan.voice_minutes_monthly > 0
                              ? `${plan.voice_minutes_monthly} call minutes/month`
                              : "1 branded BotBound email inbox"}
                        </li>
                        <li>
                          {free
                            ? "Upgrade for live work"
                            : id === "email"
                              ? "AI and email allowance included"
                              : id === "voice-email-regular"
                                ? "1 business number + 1 branded email inbox"
                                : "1 local business number included"}
                        </li>
                      </ul>
                      <Link
                        to={free || available ? signupHrefForPlan(id) : "/pricing"}
                        className={featured ? "is-primary" : undefined}
                        onClick={
                          free || available
                            ? () => trackSignupIntent("pricing", PLAN_NAMES[id])
                            : undefined
                        }
                      >
                        {actionLabel}
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
                <strong className="landing-prestige__trust-message">
                  Your Line. <span>Your Rules.</span>
                </strong>
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
