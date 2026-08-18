import { useEffect } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  Check,
  MessageSquareText,
  PhoneCall,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router";

import PrecisionPublicHeader from "./PrecisionPublicHeader";
import LandingFooter from "./LandingFooter";
import BrowserCallWidget from "./BrowserCallWidget";
import WirelineMark from "../brand/WirelineMark";
import {
  BOT_CHANNELS,
  BOT_MARKETING_VOICE as MARKETING_VOICE,
  BOT_ROLE_TEMPLATES,
  BOT_WORKSPACE_PROMISE,
} from "../../lib/bot-product";
import { STRIPE_PLANS } from "../../lib/plan-catalog";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../../data/contact-agents";
import { emitProductEvent, emitProductEventOnce } from "../../lib/product-event-client";

const HERO_LOOP = MARKETING_VOICE.spine;
const HERO_DEMO_AGENT = LANDING_PUBLIC_DEMO_AGENTS[0];
const PERSONAL_SIGNUP = "/signup?plan=personal";
const STARTER_PRICE =
  STRIPE_PLANS.find((plan) => plan.id === "starter")?.price_usd_monthly ?? 19;
const STARTER_TEMPLATE_KEYS = new Set<string>(["front-desk", "sales-rep", "custom"]);
const STARTER_TEMPLATES = BOT_ROLE_TEMPLATES.filter((template) =>
  STARTER_TEMPLATE_KEYS.has(template.key),
);
const CORE_CHANNELS = BOT_CHANNELS.map(({ label }) => label);

const EXAMPLE_RUN = [
  {
    label: "Call Answered",
    detail: "Need captured",
    icon: PhoneCall,
  },
  {
    label: "Lead Qualified",
    detail: "Right service matched",
    icon: BadgeCheck,
  },
  {
    label: "Appointment Booked",
    detail: "Tuesday at 2:30 PM",
    icon: CalendarCheck2,
  },
  {
    label: "Confirmation Sent",
    detail: "Text and email",
    icon: MessageSquareText,
  },
] as const;

const CAPABILITIES = [
  ...BOT_CHANNELS.map((channel) => ({
    title: channel.label,
    body: channel.description,
  })),
  {
    title: "Knowledge",
    body: "Ground every response in the information you approve.",
  },
  {
    title: "Actions",
    body: "Connect tools, calendars, workflows, approvals, and handoffs.",
  },
  {
    title: "Outcomes",
    body: "Log what happened, what changed, and what comes next.",
  },
] as const;

const CONTROL_POINTS = [
  {
    title: "Role",
    body: "Define the job, goals, tone, boundaries, and success criteria.",
  },
  {
    title: "Channels",
    body: "Turn voice, text, and email on only where the Bot needs them.",
  },
  {
    title: "Approvals",
    body: "Require a person before sensitive actions or commitments.",
  },
  {
    title: "Proof",
    body: "Keep transcripts, outcomes, decisions, and audit history together.",
  },
] as const;

const PUBLIC_PLAN_IDS = ["personal", "starter", "team", "business"] as const;

const PLAN_PRESENTATION = {
  personal: {
    name: "Free Builder",
    description: "Build, train, and privately simulate one Bot in your workspace.",
    cta: "Build Free",
  },
  starter: {
    name: "Starter",
    description: "Put one focused Bot live with the channels its job requires.",
    cta: "Choose Starter",
  },
  team: {
    name: "Starter Plus",
    description: "Run two Bots for different jobs in the same workspace.",
    cta: "Choose Starter Plus",
  },
  business: {
    name: "Pro",
    description: "Operate a supervised team of specialized Bots from one workspace.",
    cta: "Choose Pro",
  },
} as const;

const PLAN_CARDS = PUBLIC_PLAN_IDS.map((id) => {
  const plan = STRIPE_PLANS.find((candidate) => candidate.id === id);
  if (!plan) throw new Error(`Missing public plan: ${id}`);
  return { id, plan, presentation: PLAN_PRESENTATION[id] };
});

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="landing-home__section-heading">
      <p className="wl-eyebrow text-primary">{eyebrow}</p>
      <h2 className="wl-public-section-heading">{title}</h2>
      <p>{body}</p>
    </div>
  );
}

function CompactCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="landing-home__compact-card">
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </article>
  );
}

export default function WireAgentLanding() {
  useEffect(() => {
    emitProductEventOnce({
      event: "landing_viewed",
      surface: "marketing_web",
      metadata: { path: window.location.pathname || "/", scope: "consolidated_home" },
    });
  }, []);

  const selectTemplate = (template: (typeof BOT_ROLE_TEMPLATES)[number]["key"]) => {
    emitProductEvent({
      event: "landing_audience_selected",
      surface: "marketing_web",
      metadata: { audience: template, source: "bot_templates" },
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
                <span className="landing-stage__live-dot" aria-hidden="true" />
                Live Bot Demo
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
                  Hear a Bot Live
                </a>
              </div>

              <div className="landing-stage__economics" aria-label="Plan summary">
                <span>Build Free</span>
                <span>Launch from ${STARTER_PRICE}/mo</span>
                <span>Number Included</span>
                <a href="#pricing">View Pricing</a>
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

              <div className="landing-stage__lane-group">
                <p className="landing-stage__lanes-label">Start With</p>
                <nav className="landing-stage__lanes" aria-label="Bot template lane">
                  {STARTER_TEMPLATES.map((template) => (
                    <a
                      key={template.key}
                      href="#solutions"
                      className="landing-stage__lane"
                      onClick={() => selectTemplate(template.key)}
                    >
                      <strong>{template.name}</strong>
                      <span className="sr-only">
                        {template.summary} {template.outcomes.join(", ")}.
                      </span>
                      <ArrowRight className="landing-stage__lane-arrow" aria-hidden="true" />
                    </a>
                  ))}
                </nav>
              </div>
            </div>

            <div className="landing-stage__proof">
              <div id="hear-a-demo" className="landing-console">
                <header className="landing-console__header">
                  <div className="landing-console__brand">
                    <WirelineMark signal className="landing-console__mark" />
                    <span>Wireline Bot</span>
                  </div>
                  <div className="landing-console__status">
                    <span aria-hidden="true" />
                    Demo Ready
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
                        aria-label="Call the Public Demo Bot"
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
                        <PhoneCall className="size-4" aria-hidden="true" />
                        <span>Call Demo Bot</span>
                      </a>
                    }
                  />

                  <aside
                    className="landing-console__activity"
                    aria-label="Illustrative completed workflow"
                  >
                    <div className="landing-console__activity-heading">
                      <div>
                        <p className="landing-console__activity-kicker">Illustrative Workflow</p>
                        <h2 className="landing-console__activity-title">
                          From first answer to confirmed next step
                        </h2>
                      </div>
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
                  <ul className="landing-console__channels" aria-label="Bot channels">
                    {CORE_CHANNELS.map((label) => (
                      <li key={label}>{label}</li>
                    ))}
                  </ul>
                </footer>
              </div>
            </div>
          </div>
        </section>

        <section id="solutions" className="marketing-section landing-home__section">
          <div className="wl-public-rail">
            <SectionHeading
              eyebrow="Templates"
              title="Start with a Role. Make It Yours"
              body="Choose a proven job or create your own. Business and personal templates are starting points, never separate workspaces."
            />

            <div className="landing-home__solution-grid">
              {BOT_ROLE_TEMPLATES.map((template) => (
                <article key={template.key} className="landing-home__solution-card">
                  <p className="wl-eyebrow">{template.category}</p>
                  <h3>{template.name}</h3>
                  <p>{template.summary}</p>
                  <ul>
                    {template.outcomes.map((outcome) => (
                      <li key={outcome}>
                        <Check aria-hidden="true" />
                        {outcome}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={`${PERSONAL_SIGNUP}&template=${template.key}`}
                    onClick={() => selectTemplate(template.key)}
                  >
                    {template.key === "custom" ? "Create Your Bot" : `Use ${template.name}`}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="features"
          className="marketing-section landing-home__section landing-home__section--tinted"
        >
          <div className="wl-public-rail">
            <SectionHeading
              eyebrow="Configure"
              title="One Bot Across Every Conversation"
              body="Choose voice, text, and email. Add the knowledge, tools, actions, approvals, and outcomes the job requires."
            />

            <div className="landing-home__compact-grid">
              {CAPABILITIES.map((capability) => (
                <CompactCard key={capability.title} {...capability} />
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="marketing-section landing-home__section">
          <div className="wl-public-rail">
            <SectionHeading
              eyebrow="Pricing"
              title="Build Free. Launch When Ready"
              body="Every paid plan includes a Wireline number. No automatic overages."
            />

            <div className="landing-home__pricing-grid">
              {PLAN_CARDS.map(({ id, plan, presentation }) => {
                const free = id === "personal";
                const featured = id === "team";
                const botCount = free
                  ? "1 private Bot"
                  : `${plan.max_agents} live Bot${plan.max_agents === 1 ? "" : "s"}`;
                const capacity = free
                  ? `$${plan.ai_spend_allowance_usd_monthly.toFixed(2)} private simulation`
                  : `${plan.voice_minutes_monthly} voice minutes`;
                const numberCount = free
                  ? "Activate to go live"
                  : `${plan.included_phone_numbers} number${
                      plan.included_phone_numbers === 1 ? "" : "s"
                    } included`;

                return (
                  <article
                    key={id}
                    className={`landing-home__price-card${featured ? " is-featured" : ""}`}
                  >
                    {featured ? (
                      <span className="landing-home__price-badge">Most Popular</span>
                    ) : null}
                    <p className="wl-eyebrow">{presentation.name}</p>
                    <div className="landing-home__price">
                      <strong>${plan.price_usd_monthly}</strong>
                      <span>{free ? "forever" : "/month"}</span>
                    </div>
                    <p className="landing-home__price-description">{presentation.description}</p>
                    <ul>
                      {[botCount, capacity, numberCount].map((fact) => (
                        <li key={fact}>
                          <Check aria-hidden="true" />
                          {fact}
                        </li>
                      ))}
                    </ul>
                    <Link
                      to={`/signup?plan=${id}`}
                      className={featured ? "marketing-btn-primary" : "marketing-btn-secondary"}
                    >
                      {presentation.cta}
                    </Link>
                  </article>
                );
              })}
            </div>

            <div className="landing-home__pricing-note">
              <p>Extra live work uses prepaid Runtime Balance.</p>
              <Link to="/pricing">
                Full Plan Details
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section
          id="trust"
          className="marketing-section landing-home__section landing-home__section--tinted"
        >
          <div className="wl-public-rail landing-home__trust-layout">
            <SectionHeading
              eyebrow="Workspace"
              title={BOT_WORKSPACE_PROMISE.title}
              body={BOT_WORKSPACE_PROMISE.description}
            />

            <div className="landing-home__control-grid">
              {CONTROL_POINTS.map((control) => (
                <CompactCard key={control.title} {...control} />
              ))}
            </div>

            <Link to="/trust" className="marketing-btn-secondary landing-home__trust-link">
              Open Trust Center
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className="marketing-section landing-home__final-section">
          <div className="wl-public-rail landing-home__final-card">
            <WirelineMark signal className="landing-home__final-mark" />
            <p className="wl-eyebrow text-primary">Wireline</p>
            <h2>Build Your Bot</h2>
            <p>Start with a role or create your own. Add the channels the job needs.</p>
            <div>
              <Link to={PERSONAL_SIGNUP} className="marketing-btn-primary">
                Start Free
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link to="/signin" className="marketing-btn-secondary">
                Sign In
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
