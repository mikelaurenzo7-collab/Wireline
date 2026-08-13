import { useState, type KeyboardEvent } from "react";
import { ArrowRight, Volume2 } from "lucide-react";
import { Link } from "react-router";

import MarketingFooter from "./MarketingFooter";
import MarketingHero from "./MarketingHero";
import MarketingStickyCta from "./MarketingStickyCta";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import TrustSignals from "./TrustSignals";
import BrowserCallWidget from "./BrowserCallWidget";
import LiveVideoSpotlight from "./LiveVideoSpotlight";
import { AGENT_DIRECTION_MODES, MARKETING_VOICE } from "../../lib/product-copy";
import { STRIPE_PLANS, type StripePlanId } from "../../lib/plan-catalog";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../../data/contact-agents";
import { emitProductEvent } from "../../lib/product-event-client";

type AgentMode = "outbound" | "inbound" | "hybrid";

type ModeDetail = {
  title: string;
  lead: string;
  bestFor: readonly string[];
  cta: string;
  ctaPath: string;
};

const HERO_LOOP = MARKETING_VOICE.proof;
const MODE_OPTIONS: { key: AgentMode; label: string }[] = [
  { key: "outbound", label: AGENT_DIRECTION_MODES.outbound.label },
  { key: "inbound", label: AGENT_DIRECTION_MODES.inbound.label },
  { key: "hybrid", label: AGENT_DIRECTION_MODES.hybrid.label },
];

const MODE_DETAILS: Record<AgentMode, ModeDetail> = {
  outbound: {
    title: "A sales agent that follows through.",
    lead: "Call warm lists, revive leads, promote offers, send the follow up, book the meeting, and log the outcome.",
    bestFor: ["Lead response", "Quote follow up", "Appointment setting"],
    cta: "Start with Starter",
    ctaPath: "/signup?plan=starter&mode=outbound",
  },
  inbound: {
    title: "Answer every valuable call.",
    lead: "Catch the call, qualify the need, schedule the next step, cover after hours, and continue by text or email from one record.",
    bestFor: ["Front desk", "Lead qualifier", "Support triage"],
    cta: "Start with Starter",
    ctaPath: "/signup?plan=starter&mode=inbound",
  },
  hybrid: {
    title: "One agent for the work between conversations.",
    lead: "Keep sales, service, callbacks, scheduling, and CRM updates moving in one visible workflow.",
    bestFor: ["Sales desk", "Collections desk", "Appointment desk"],
    cta: "Start with Starter",
    ctaPath: "/signup?plan=starter&mode=hybrid",
  },
};

const LOOP_COPY = [
  "Set the outcome, audience, limits, and rules.",
  "Add voice, knowledge, objections, approvals, and handoff logic.",
  "Choose a paid plan, claim the number, connect channels, and set spend controls.",
  "Let it answer, sell, support, book, follow up, and log the result.",
] as const;

const planCatalog = Object.fromEntries(
  STRIPE_PLANS.map((plan) => [plan.id, plan]),
) as Record<StripePlanId, (typeof STRIPE_PLANS)[number]>;

const PLAN_PREVIEW = [
  {
    name: "Free Builder",
    price: "$0",
    period: "to create",
    facts: [
      "1 private draft agent",
      "Training and private simulation",
      "Live channels unlock after activation",
    ],
    cta: "Start free",
    ctaPath: "/signup?plan=personal",
    highlight: false,
  },
  {
    name: "Starter",
    price: `$${planCatalog.starter.price_usd_monthly}`,
    period: "/mo",
    facts: [
      `${planCatalog.starter.max_agents} live voice agent`,
      `${planCatalog.starter.included_phone_numbers} Wireline number`,
      `${planCatalog.starter.voice_minutes_monthly} voice minutes each month`,
      "SMS, email, and Lead Hunt access",
    ],
    cta: "Choose Starter",
    ctaPath: "/signup?plan=starter",
    highlight: false,
  },
  {
    name: "Starter Plus",
    price: `$${planCatalog.team.price_usd_monthly}`,
    period: "/mo",
    facts: [
      `${planCatalog.team.max_agents} live agents`,
      `${planCatalog.team.included_phone_numbers} Wireline numbers`,
      `${planCatalog.team.voice_minutes_monthly} voice minutes each month`,
      "Full Lead Hunt and enrichment",
    ],
    cta: "Choose Starter Plus",
    ctaPath: "/signup?plan=team",
    highlight: true,
  },
  {
    name: "Pro",
    price: `$${planCatalog.business.price_usd_monthly}`,
    period: "/mo",
    facts: [
      `${planCatalog.business.max_agents} live voice agents`,
      `${planCatalog.business.included_phone_numbers} Wireline numbers`,
      `${planCatalog.business.voice_minutes_monthly} voice minutes each month`,
      "Shared channels, analytics, and approvals",
    ],
    cta: "Choose Pro",
    ctaPath: "/signup?plan=business",
    highlight: false,
  },
] as const;

function modeTabId(key: AgentMode) {
  return `wire-agent-${key}-tab`;
}

function modePanelId(key: AgentMode) {
  return `wire-agent-${key}-panel`;
}

const HERO_DEMO_AGENT = LANDING_PUBLIC_DEMO_AGENTS[0];
const LIVE_VIDEO_BRIDGE = "Every channel. One agent.";

export default function WireAgentLanding() {
  const [mode, setMode] = useState<AgentMode>("outbound");
  const detail = MODE_DETAILS[mode];

  const selectMode = (key: AgentMode, focusAfterSelect = false) => {
    setMode(key);
    emitProductEvent({
      event: "landing_audience_selected",
      surface: "marketing_web",
      metadata: { audience: key, source: "hero_work_lane" },
    });

    if (focusAfterSelect) {
      window.requestAnimationFrame(() =>
        document.getElementById(modeTabId(key))?.focus(),
      );
    }
  };

  const handleModeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = MODE_OPTIONS.findIndex(({ key }) => key === mode);
    const lastIndex = MODE_OPTIONS.length - 1;
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    } else {
      return;
    }

    event.preventDefault();
    selectMode(MODE_OPTIONS[nextIndex].key, true);
  };

  return (
    <div className="marketing-surface wl-viewport-frame bg-background text-foreground">
      <PrecisionPublicHeader />

      <main
        id="main-content"
        className="wl-viewport-scroll pt-16"
        tabIndex={-1}
      >
        <MarketingHero
          title={MARKETING_VOICE.headline}
          primaryAction={{
            label: MARKETING_VOICE.primaryCta,
            to: "/signup?plan=personal",
          }}
          secondaryAction={{
            label: "Hear it live",
            to: "#hear-a-demo",
            tone: "secondary",
          }}
          visual={
            <div
              id="hear-a-demo"
              className="flex flex-col justify-between text-center"
            >
              <div>
                <div className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
                  <Volume2
                    className="h-4 w-4 text-primary"
                    aria-hidden="true"
                  />
                  Live browser demo
                </div>
              </div>
              <div className="mt-6 rounded-[16px] border border-border bg-background/70 p-4 sm:p-5">
                <BrowserCallWidget
                  agentName={HERO_DEMO_AGENT.name}
                  buttonLabel="Start the live demo"
                  fallback={
                    <div className="text-center">
                      <a
                        href={`tel:${HERO_DEMO_AGENT.tel}`}
                        className="marketing-btn-secondary inline-flex min-h-11 justify-center px-5 text-[15px] font-semibold"
                      >
                        Call demo
                      </a>
                    </div>
                  }
                />
              </div>
            </div>
          }
        />

        <LiveVideoSpotlight bridgeLabel={LIVE_VIDEO_BRIDGE} />

        <section className="wl-public-section border-b border-border">
          <div className="wl-public-rail">
            <div className="mx-auto mb-8 max-w-2xl text-center">
              <h2 className="wl-display-2">Build. Train. Launch. Improve.</h2>
            </div>
            <div className="grid overflow-hidden rounded-[16px] border border-border bg-card sm:grid-cols-4 sm:divide-x sm:divide-border">
              {HERO_LOOP.map((step, index) => (
                <article
                  key={step}
                  className={`wl-wire-step p-7 text-center transition-colors hover:bg-muted/40 ${
                    index === HERO_LOOP.length - 1
                      ? "wl-wire-step--settled"
                      : ""
                  }`}
                >
                  <div className="wl-wire-step__marker mb-5">
                    <span className="wl-wire-step__node" aria-hidden="true" />
                  </div>
                  <span className="block font-mono text-xs font-semibold tracking-[.08em] text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="wl-display-4 mt-2">{step}</h3>
                  <p className="mt-3 text-sm leading-[1.65] text-muted-foreground">
                    {LOOP_COPY[index]}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="wl-public-section border-b border-border bg-card/40">
          <div className="wl-public-rail">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="wl-display-2 mx-auto max-w-[18ch]">
                Choose the outcome.
              </h2>
              <div
                className="wl-segmented mx-auto mt-6 flex w-fit max-w-full"
                role="tablist"
                aria-label="Agent work lane"
                onKeyDown={handleModeKeyDown}
              >
                {MODE_OPTIONS.map(({ key, label }) => {
                  const selected = mode === key;
                  return (
                    <button
                      key={key}
                      id={modeTabId(key)}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls={modePanelId(key)}
                      tabIndex={selected ? 0 : -1}
                      data-active={selected ? "true" : undefined}
                      onClick={() => selectMode(key)}
                      className="wl-segmented__item px-4 sm:px-5"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="wl-paper mx-auto mt-8 max-w-3xl rounded-[18px] p-6 text-center sm:p-8">
              {MODE_OPTIONS.map(({ key, label }) => (
                <div
                  key={key}
                  id={modePanelId(key)}
                  role="tabpanel"
                  aria-labelledby={modeTabId(key)}
                  aria-label={`${label} agent details`}
                  hidden={mode !== key}
                >
                  {mode === key ? (
                    <div className="space-y-6 text-center">
                      <div>
                        <h3 className="wl-display-3 mx-auto max-w-[20ch]">
                          {detail.title}
                        </h3>
                        <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-[1.65] text-muted-foreground">
                          {detail.lead}
                        </p>
                      </div>
                      <div>
                        <ul className="grid gap-2 sm:grid-cols-3">
                          {detail.bestFor.map((item) => (
                            <li
                              key={item}
                              className="rounded-[12px] border border-border bg-muted px-4 py-3 text-center text-sm font-semibold text-foreground"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <Link
                        to={detail.ctaPath}
                        className="marketing-btn-primary mx-auto min-h-11 justify-center px-5 text-sm font-semibold sm:w-fit"
                      >
                        {detail.cta}
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="wl-public-section border-b border-border">
          <div className="wl-public-rail">
            <div className="mx-auto mb-8 max-w-2xl text-center">
              <h2 className="wl-display-2">Build free. Go live from $19.</h2>
            </div>
            <div className="mx-auto grid max-w-[1200px] gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {PLAN_PREVIEW.map((plan) => (
                <article
                  key={plan.name}
                  className={`wl-paper relative flex min-h-[310px] flex-col rounded-[16px] p-7 text-center ${
                    plan.highlight ? "ring-2 ring-primary/60 shadow-lg" : ""
                  }`}
                >
                  {plan.highlight ? (
                    <span
                      className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm"
                      aria-label="Most popular plan"
                    >
                      Most popular
                    </span>
                  ) : null}
                  <h3 className="wl-display-4">{plan.name}</h3>
                  <div className="mt-5 flex items-baseline justify-center gap-1">
                    <span className="wl-display-2 leading-none">
                      {plan.price}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {plan.period}
                    </span>
                  </div>
                  <ul
                    className="wl-info-list mx-auto w-full max-w-[30ch] flex-1"
                    aria-label={`${plan.name} highlights`}
                  >
                    {plan.facts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                  <Link
                    to={plan.ctaPath}
                    className={`mt-6 min-h-11 justify-center text-sm font-semibold ${
                      plan.highlight
                        ? "marketing-btn-primary"
                        : "marketing-btn-secondary"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </article>
              ))}
            </div>
            <div className="mt-8 text-center">
              <p className="mx-auto max-w-[50ch] text-sm leading-[1.65] text-muted-foreground">
                Included minutes are used first. Extra voice, SMS, and
                enrichment draw from prepaid Runtime Balance that you control.
                There is no surprise postpaid invoice.
              </p>
              <Link
                to="/pricing"
                className="mt-5 inline-flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-primary hover:underline"
              >
                Compare every plan <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section className="wl-public-section">
          <div className="wl-public-rail">
            <div className="wl-featured-wire wl-featured-wire--live relative overflow-hidden rounded-[20px] marketing-ink-panel px-6 py-14 text-center sm:px-10 sm:py-16">
              <div
                className="pointer-events-none absolute inset-0"
                aria-hidden="true"
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 0%, var(--wireline-color-glow-primary), transparent 60%)",
                }}
              />
              <div className="relative">
                <h2 className="wl-display-2 mx-auto max-w-[18ch]">
                  Put your first voice agent to work.
                </h2>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    to="/signup?plan=personal"
                    className="marketing-btn-primary min-h-12 w-full justify-center px-7 text-[15px] font-semibold sm:w-auto"
                  >
                    Build your voice agent
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  <Link
                    to="/showcase"
                    className="marketing-btn-secondary min-h-12 w-full justify-center border-border/40 bg-transparent px-7 text-[15px] font-medium text-[var(--wireline-color-text-secondary)] hover:bg-white/5 hover:text-[var(--wireline-color-text-primary)] sm:w-auto"
                  >
                    Hear it live
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <TrustSignals />
        <MarketingFooter aboveStickyCta />
      </main>
      <MarketingStickyCta />
    </div>
  );
}
