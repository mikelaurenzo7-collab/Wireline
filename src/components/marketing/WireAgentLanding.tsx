import { useEffect } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  Check,
  ClipboardCheck,
  Headphones,
  Mail,
  MessageSquareText,
  Phone,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";

import PrecisionPublicHeader from "./PrecisionPublicHeader";
import MarketingChromeBar from "./MarketingChromeBar";
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

const CORE_CHANNELS = [
  { label: "Voice", icon: PhoneCall },
  { label: "Text", icon: MessageSquareText },
  { label: "Email", icon: Mail },
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

const CAPABILITIES = [
  {
    title: "Voice",
    body: "Answer, call, qualify, book, transfer, and recap.",
    icon: PhoneCall,
  },
  {
    title: "Text",
    body: "Confirm, remind, nurture, and recover under consent rules.",
    icon: MessageSquareText,
  },
  {
    title: "Email",
    body: "Follow up, reply, and preserve the conversation record.",
    icon: Mail,
  },
  {
    title: "Shared Memory",
    body: "One identity, knowledge base, history, and rule set.",
    icon: Workflow,
  },
  {
    title: "Approvals",
    body: "Keep sensitive actions behind explicit owner control.",
    icon: ClipboardCheck,
  },
  {
    title: "Outcomes",
    body: "Log what happened, what changed, and what comes next.",
    icon: BadgeCheck,
  },
] as const;

const CONTROL_POINTS = [
  {
    title: "Approvals",
    body: "Require a person before sensitive actions.",
    icon: ClipboardCheck,
  },
  {
    title: "Spend",
    body: "Set prepaid limits with no automatic overages.",
    icon: WalletCards,
  },
  {
    title: "Handoffs",
    body: "Escalate with context, not a cold transfer.",
    icon: Users,
  },
  {
    title: "Proof",
    body: "Keep transcripts, outcomes, and audit history.",
    icon: ShieldCheck,
  },
] as const;

const PUBLIC_PLAN_IDS = ["personal", "starter", "team", "business"] as const;

const PLAN_PRESENTATION = {
  personal: {
    name: "Free Builder",
    description: "Build, train, and privately simulate one draft agent.",
    cta: "Build Free",
  },
  starter: {
    name: "Starter",
    description: "Put one focused communications agent live.",
    cta: "Choose Starter",
  },
  team: {
    name: "Starter Plus",
    description: "Run a personal and business agent together.",
    cta: "Choose Starter Plus",
  },
  business: {
    name: "Pro",
    description: "Operate a supervised team of specialized agents.",
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

function CompactCard({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <article className="landing-home__compact-card">
      <span className="landing-home__compact-icon">
        <Icon aria-hidden="true" />
      </span>
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

  const selectAudience = (audience: (typeof AUDIENCES)[number]["key"]) => {
    emitProductEvent({
      event: "landing_audience_selected",
      surface: "marketing_web",
      metadata: { audience, source: "solutions_section" },
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
                Live Voice Demo
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
                <span>Build free</span>
                <span>Launch from ${STARTER_PRICE}/mo</span>
                <span>Number included</span>
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
                <nav className="landing-stage__lanes" aria-label="Agent work lane">
                  {AUDIENCES.map((audience) => {
                    const Icon = audience.icon;
                    return (
                      <a
                        key={audience.key}
                        href="#solutions"
                        className="landing-stage__lane"
                        onClick={() => selectAudience(audience.key)}
                      >
                        <Icon className="landing-stage__lane-icon" aria-hidden="true" />
                        <strong>{audience.label}</strong>
                        <span className="sr-only">
                          {audience.detail}. {audience.uses.join(", ")}.
                        </span>
                        <ArrowRight className="landing-stage__lane-arrow" aria-hidden="true" />
                      </a>
                    );
                  })}
                </nav>
              </div>
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
                        aria-label="Call the Public Demo Line"
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
                        <span>Call Demo Line</span>
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
                  <ul className="landing-console__channels" aria-label="Core agent channels">
                    {CORE_CHANNELS.map((channel) => {
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
        </section>

        <section id="solutions" className="marketing-section landing-home__section">
          <div className="wl-public-rail">
            <SectionHeading
              eyebrow="Solutions"
              title="Start with one job"
              body="Choose the work. Wireline keeps every channel, rule, and outcome together."
            />

            <div className="landing-home__solution-grid">
              {AUDIENCES.map((audience) => {
                const Icon = audience.icon;
                return (
                  <article key={audience.key} className="landing-home__solution-card">
                    <span className="landing-home__solution-icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <p className="wl-eyebrow">{audience.label}</p>
                    <h3>{audience.detail}</h3>
                    <ul>
                      {audience.uses.map((use) => (
                        <li key={use}>
                          <Check aria-hidden="true" />
                          {use}
                        </li>
                      ))}
                    </ul>
                    <Link to={audience.href} onClick={() => selectAudience(audience.key)}>
                      Start Here
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="features" className="marketing-section landing-home__section landing-home__section--tinted">
          <div className="wl-public-rail">
            <SectionHeading
              eyebrow="Product"
              title="One agent across every conversation"
              body="Voice, text, email, memory, approvals, and proof stay in one operating system."
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
              title="Build free. Launch when ready"
              body="Every paid plan includes a Wireline number. No automatic overages."
            />

            <div className="landing-home__pricing-grid">
              {PLAN_CARDS.map(({ id, plan, presentation }) => {
                const free = id === "personal";
                const featured = id === "team";
                const agentCount = free
                  ? "1 private draft"
                  : `${plan.max_agents} live agent${plan.max_agents === 1 ? "" : "s"}`;
                const capacity = free
                  ? "$1.50 private simulation"
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
                    {featured ? <span className="landing-home__price-badge">Most Popular</span> : null}
                    <p className="wl-eyebrow">{presentation.name}</p>
                    <div className="landing-home__price">
                      <strong>${plan.price_usd_monthly}</strong>
                      <span>{free ? "forever" : "/month"}</span>
                    </div>
                    <p className="landing-home__price-description">{presentation.description}</p>
                    <ul>
                      {[agentCount, capacity, numberCount].map((fact) => (
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

        <section id="trust" className="marketing-section landing-home__section landing-home__section--tinted">
          <div className="wl-public-rail landing-home__trust-layout">
            <SectionHeading
              eyebrow="Trust"
              title="Control stays with you"
              body="Wireline can act. You decide where it stops, asks, escalates, and records proof."
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
            <h2>Build your voice agent</h2>
            <p>Start free. Go live when the work is ready.</p>
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

      <MarketingChromeBar />
    </div>
  );
}
