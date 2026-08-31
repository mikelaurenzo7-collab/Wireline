import { useEffect } from "react";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Link } from "react-router";

import AuthAccessPanel from "../auth/AuthAccessPanel";
import { BotBoundLockup } from "../brand/BotBoundBrand";
import BrowserCallWidget from "./BrowserCallWidget";
import LandingFooter from "./LandingFooter";
import { BOT_MARKETING_VOICE, BOT_ROLE_TEMPLATES } from "../../lib/bot-product";
import { STRIPE_PLANS } from "../../lib/plan-catalog";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../../data/contact-agents";
import { emitProductEvent, emitProductEventOnce } from "../../lib/product-event-client";
import { signupHrefForPlan } from "../../lib/signup-intent";

const HERO_DEMO = LANDING_PUBLIC_DEMO_AGENTS[0];
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
              <BotBoundLockup
                size="display"
                surface="bare"
                className="landing-prestige__hero-lockup"
              />
            </div>
            <div className="landing-prestige__hero-copy">
              <h1 id="landing-prestige-title">
                <span>PUT YOUR BOT</span>
                <span>ON THE LINE</span>
              </h1>
              <p className="landing-prestige__promise">{BOT_MARKETING_VOICE.activationLine}</p>
            </div>
            <div className="landing-prestige__demo">
              <BrowserCallWidget
                agentName={HERO_DEMO.name}
                variant="inline"
                buttonLabel={`Talk to ${HERO_DEMO.name}`}
                fallback={
                  <Link
                    to="/showcase"
                    className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline wl-focus-ring-halo"
                  >
                    Open browser demo
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                }
              />
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
                      to={signupHrefForPlan("personal", { template: template.key })}
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
                        to={signupHrefForPlan(id)}
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
