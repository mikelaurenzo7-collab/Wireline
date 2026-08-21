import { useEffect } from "react";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Link } from "react-router";

import AuthAccessPanel from "../auth/AuthAccessPanel";
import BotMark from "../BotMark";
import { BotBoundLockup } from "../brand/BotBoundBrand";
import LandingFooter from "./LandingFooter";
import { BOT_CHANNELS, BOT_MARKETING_VOICE, BOT_ROLE_TEMPLATES } from "../../lib/bot-product";
import { STRIPE_PLANS } from "../../lib/plan-catalog";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../../data/contact-agents";
import { emitProductEvent, emitProductEventOnce } from "../../lib/product-event-client";

const HERO_DEMO = LANDING_PUBLIC_DEMO_AGENTS[0];
const HERO_CHANNEL_ORDER = ["voice", "text", "email"] as const;
const HERO_CHANNELS = HERO_CHANNEL_ORDER.map((key) => {
  const channel = BOT_CHANNELS.find((candidate) => candidate.key === key);
  if (!channel) throw new Error(`Missing Bot channel: ${key}`);
  return channel.label.toUpperCase();
});
const FEATURED_TEMPLATE_KEYS = [
  "front-desk",
  "sales-rep",
  "customer-support",
  "appointment-setter",
  "property-manager",
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
          <div className="landing-prestige__hero" aria-label="BotBound Phone Bot">
            <div className="landing-prestige__hero-brand">
              <BotBoundLockup size="display" surface="tile" />
            </div>
            <div className="landing-prestige__hero-copy">
              <h1 id="landing-prestige-title">
                <span>PUT YOUR BOT</span>
                <span>ON THE LINE</span>
              </h1>
              <div className="landing-prestige__channels" aria-label="BotBound channels">
                {HERO_CHANNELS.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <p className="landing-prestige__promise">{BOT_MARKETING_VOICE.subline}</p>
            </div>
            <Link
              to="/showcase"
              className="landing-prestige__demo-link"
              aria-label={`Hear ${HERO_DEMO.name} live`}
            >
              <BotMark
                seed={`public-demo:${HERO_DEMO.name}`}
                name={HERO_DEMO.name}
                size={30}
                active
                title={`${HERO_DEMO.name} Bot signal`}
              />
              <span className="landing-prestige__demo-copy">
                <strong className="wl-preserve-case">{HERO_DEMO.name}</strong>
                <small>LIVE PHONE BOT</small>
              </span>
              <span className="landing-prestige__demo-action">
                Hear it live
                <ArrowRight aria-hidden="true" />
              </span>
            </Link>
            <p className="landing-prestige__hero-footnote">
              Build free. Put it on a number when it is ready.
            </p>
          </div>

          <div className="landing-prestige__auth">
            <AuthAccessPanel embedded initialMode="signin" />
            <nav className="landing-prestige__mobile-links" aria-label="Public information">
              <Link to="/privacy">Privacy</Link>
              <Link to="/terms">Terms</Link>
              <Link to="/status">Status</Link>
            </nav>
          </div>
        </section>

        <div className="landing-prestige__desktop-only">
          <section id="solutions" className="landing-prestige__section landing-prestige__roles">
            <div className="landing-prestige__rail">
              <header className="landing-prestige__section-heading">
                <p>STARTERS</p>
                <h2>PICK THE WORK. PUT A BOT ON IT.</h2>
                <span>Start with a proven playbook. Rewrite every rule.</span>
              </header>
              <div className="landing-prestige__role-grid">
                {FEATURED_TEMPLATES.map((template) => (
                  <article key={template.key} className="landing-prestige__role-card">
                    <div className="landing-prestige__role-topline">
                      <h3>{template.name}</h3>
                      <span>{DIRECTION_LABELS[template.direction]}</span>
                    </div>
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
                      to={`/signup?plan=personal&template=${template.key}`}
                      onClick={() => trackSignupIntent("role_starter", template.name)}
                    >
                      Build this role
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="pricing" className="landing-prestige__section landing-prestige__pricing">
            <div className="landing-prestige__rail">
              <header className="landing-prestige__section-heading">
                <p>PRICING</p>
                <h2>BUILD FREE. GO LIVE WHEN IT EARNS THE LINE.</h2>
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
                            : `${plan.voice_minutes_monthly} call minutes`}
                        </li>
                        <li>
                          {free
                            ? "Activate when ready"
                            : `${plan.included_phone_numbers} number${plan.included_phone_numbers === 1 ? "" : "s"} included`}
                        </li>
                      </ul>
                      <Link
                        to={`/signup?plan=${id}`}
                        className={featured ? "is-primary" : undefined}
                        onClick={() => trackSignupIntent("pricing", PLAN_NAMES[id])}
                      >
                        {free ? "Start free" : `Choose ${PLAN_NAMES[id]}`}
                      </Link>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="landing-prestige__trust" aria-label="BotBound trust and control">
            <div className="landing-prestige__rail landing-prestige__trust-inner">
              <div>
                <ShieldCheck aria-hidden="true" />
                <strong>YOUR LINE. YOUR RULES.</strong>
              </div>
              <nav aria-label="Trust links">
                <Link to="/security">Security</Link>
                <Link to="/privacy">Privacy</Link>
                <Link to="/status">Status</Link>
              </nav>
            </div>
          </section>
          <LandingFooter />
        </div>
      </main>
    </div>
  );
}
