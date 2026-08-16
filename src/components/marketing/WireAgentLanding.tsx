import { useState, type KeyboardEvent } from "react";
import { ArrowRight, Mail, MessageSquareText, Phone, PhoneCall, Video } from "lucide-react";
import { Link } from "react-router";

import MarketingChromeBar from "./MarketingChromeBar";
import MarketingHero from "./MarketingHero";
import MarketingStickyCta from "./MarketingStickyCta";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import BrowserCallWidget from "./BrowserCallWidget";
import LiveVideoStage from "./LiveVideoStage";
import { AGENT_DIRECTION_MODES, MARKETING_VOICE } from "../../lib/product-copy";
import { STRIPE_PLANS, type StripePlanId } from "../../lib/plan-catalog";
import { LIVE_VIDEO_ADDON_PRICE_USD } from "../../lib/video-presenter/live-video-policy";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../../data/contact-agents";
import { emitProductEvent } from "../../lib/product-event-client";

type AgentMode = "outbound" | "inbound" | "hybrid";

type ModeDetail = {
  title: string;
  lead: string;
  bestFor: readonly string[];
};

const HERO_LOOP = MARKETING_VOICE.proof;
const MODE_OPTIONS: { key: AgentMode; label: string }[] = [
  { key: "outbound", label: AGENT_DIRECTION_MODES.outbound.label },
  { key: "inbound", label: AGENT_DIRECTION_MODES.inbound.label },
  { key: "hybrid", label: AGENT_DIRECTION_MODES.hybrid.label },
];

/* Titles lost their terminal periods with the rest of the cased title tier: a
   period closes a sentence, and these render at display size in caps, where a
   trailing dot reads as a typo. The internal beat in a staccato line ("Every
   channel. One voice agent") is a deliberate voice device and stays. */
const MODE_DETAILS: Record<AgentMode, ModeDetail> = {
  outbound: {
    title: "A sales agent that follows through",
    lead: "Call warm lists, revive leads, send the follow up, book the meeting, and log the outcome.",
    bestFor: ["Lead Response", "Quote Follow Up", "Appointment Setting"],
  },
  inbound: {
    title: "Answer every valuable call",
    lead: "Catch the call, qualify the need, schedule the next step, and cover after hours from one record.",
    bestFor: ["Front Desk", "Lead Qualifier", "Support Triage"],
  },
  hybrid: {
    title: "One agent for the work between conversations",
    lead: "Keep sales, service, callbacks, scheduling, and CRM updates moving in one visible workflow.",
    bestFor: ["Sales Desk", "Collections Desk", "Appointment Desk"],
  },
};

/* One line each. These used to run to two sentences and 90 characters inside a
   card 300px wide, which is what turned a four-step strip into a 240px band. */
const LOOP_COPY = [
  "Set the outcome, audience, and limits.",
  "Add voice, knowledge, objections, and approvals.",
  "Claim the number and connect the channels.",
  "Let it answer, book, follow up, and log the result.",
] as const;

const CHANNELS = [
  { label: "Voice", icon: PhoneCall },
  { label: "Text", icon: MessageSquareText },
  { label: "Email", icon: Mail },
  { label: "Live Video", icon: Video },
] as const;

const planCatalog = Object.fromEntries(STRIPE_PLANS.map((plan) => [plan.id, plan])) as Record<
  StripePlanId,
  (typeof STRIPE_PLANS)[number]
>;

/* Three facts per card, not four or five. The plan grid is the one block on the
   page a visitor reads comparatively, and an uneven fact count is what made the
   four cards render at four different heights. */
const PLAN_PREVIEW = [
  {
    name: "Free Builder",
    price: "$0",
    period: "to create",
    facts: ["1 private draft agent", "Training and simulation", "Channels unlock at activation"],
    cta: "Start Free",
    ctaPath: "/signup?plan=personal",
    highlight: false,
  },
  {
    name: "Starter",
    price: `$${planCatalog.starter.price_usd_monthly}`,
    period: "/mo",
    facts: [
      `${planCatalog.starter.max_agents} live voice agent`,
      `${planCatalog.starter.voice_minutes_monthly} voice minutes a month`,
      "SMS, email, and Lead Hunt",
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
      `${planCatalog.team.voice_minutes_monthly} voice minutes a month`,
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
      `${planCatalog.business.voice_minutes_monthly} voice minutes a month`,
      "Shared channels and approvals",
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
      window.requestAnimationFrame(() => document.getElementById(modeTabId(key))?.focus());
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
    <div className="marketing-surface bg-background text-foreground">
      <PrecisionPublicHeader />

      <main id="main-content" className="marketing-flow" tabIndex={-1}>
        {/*
          Screen 1 — what it is, what it costs you to try, and proof you can
          hear in ten seconds. Everything a first-time visitor needs to decide
          is above the fold; the four screens below are for the ones who want
          more, not for the ones who have already decided.

          What was cut from this screen: a 180px bordered panel that held one
          button, and a duplicate of both hero CTAs 4,000px lower down.
        */}
        <section className="marketing-section marketing-section--screen">
          <MarketingHero
            title={MARKETING_VOICE.headline}
            primaryAction={{
              label: MARKETING_VOICE.primaryCta,
              to: "/signup?plan=personal",
            }}
            secondaryAction={{
              label: "See Plans",
              to: "#plans",
              tone: "secondary",
            }}
          />

          {/* The demo is the proof, so it sits in the hero as a live control
              rather than behind a scroll and a second click. */}
          <div
            id="hear-a-demo"
            className="mx-auto mt-8 flex w-full max-w-xl flex-col items-center gap-4"
          >
            <BrowserCallWidget
              agentName={HERO_DEMO_AGENT.name}
              buttonLabel="Hear It Live"
              fallback={
                <a
                  href={`tel:${HERO_DEMO_AGENT.tel}`}
                  className="marketing-btn-secondary inline-flex min-h-11 items-center justify-center gap-2 px-5 text-[15px] font-semibold"
                  onClick={() =>
                    emitProductEvent({
                      event: "landing_demo_clicked",
                      surface: "marketing_web",
                      metadata: { agent: HERO_DEMO_AGENT.name, mode: "phone" },
                    })
                  }
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  Hear It Live
                </a>
              }
            />

            {/* The channel rail replaces a whole "every channel, one agent"
                section: four words carry what a headline plus three cards did. */}
            <ul
              className="flex flex-wrap items-center justify-center gap-2"
              aria-label="Agent channels"
            >
              {CHANNELS.map(({ label, icon: Icon }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground"
                >
                  <Icon className="size-3.5 text-primary" aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/*
          Screen 2 — the work, chosen by the visitor. The four-step loop sits in
          the same screen as the outcome picker because they answer one
          question in sequence: what do you want done, and what does it take to
          get there. They used to be two full sections a screen apart.
        */}
        <section className="marketing-section border-t border-border bg-card/40">
          <div className="wl-public-rail">
            <h2 className="wl-public-section-heading mx-auto text-center">Choose the outcome</h2>

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

            <div className="wl-paper mx-auto mt-6 max-w-3xl rounded-[18px] p-6 text-center">
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
                    <div className="space-y-5">
                      <div>
                        <h3 className="wl-display-4 mx-auto max-w-[24ch]">{detail.title}</h3>
                        <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-[1.6] text-muted-foreground">
                          {detail.lead}
                        </p>
                      </div>
                      <ul className="grid gap-2 sm:grid-cols-3">
                        {detail.bestFor.map((item) => (
                          <li
                            key={item}
                            className="rounded-[12px] border border-border bg-muted px-4 py-2.5 text-sm font-semibold text-foreground"
                          >
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {/* The loop is one row, not four cards: it is a sequence, and a
                sequence reads faster laid out as one. */}
            <ol className="mt-8 grid gap-px overflow-hidden rounded-[16px] border border-border bg-border sm:grid-cols-4">
              {HERO_LOOP.map((step, index) => (
                <li key={step} className="bg-card p-5 text-center">
                  <span className="block font-mono text-[11px] font-semibold tracking-[.08em] text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="wl-display-4 mt-1.5">{step}</h3>
                  <p className="mt-2 text-[13px] leading-[1.55] text-muted-foreground">
                    {LOOP_COPY[index]}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/*
          Screen 3 — Live Video. A paid product surface with a real visual,
          standing where an empty bordered box used to sit on screen one.
        */}
        <section className="marketing-section border-t border-border">
          <div className="wl-public-rail">
            <div className="grid items-center gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
              <div className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
                <p className="wl-eyebrow wl-eyebrow--wired text-primary">Live Video</p>
                <h2 className="wl-public-section-heading mt-4 lg:mx-0">
                  Your voice agent, now on screen
                </h2>
                <p className="mx-auto mt-4 max-w-[46ch] text-[15px] leading-[1.65] text-muted-foreground lg:mx-0">
                  {`The same agent that answers your calls, with the same training and approved knowledge — on camera. Add Live Video to a paid business agent for $${LIVE_VIDEO_ADDON_PRICE_USD}/mo.`}
                </p>
                <Link
                  to="/signup?plan=starter"
                  className="marketing-btn-primary mx-auto mt-6 min-h-11 justify-center px-5 text-sm font-semibold sm:w-fit lg:mx-0"
                >
                  Build a Business Agent
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>

              <LiveVideoStage />
            </div>
          </div>
        </section>

        {/*
          Screen 4 — plans, and the close. The closing call to action lives on
          the plan cards where the decision is actually made; the separate
          full-width CTA band that repeated the hero verbatim is gone.
        */}
        <section id="plans" className="marketing-section border-t border-border">
          <div className="wl-public-rail">
            <h2 className="wl-public-section-heading mx-auto text-center">
              Start free, scale when it pays
            </h2>

            <div className="mx-auto mt-7 grid max-w-[1200px] items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PLAN_PREVIEW.map((plan) => (
                <article
                  key={plan.name}
                  className={`wl-paper relative flex flex-col rounded-[16px] p-6 text-center ${
                    plan.highlight ? "ring-2 ring-primary/60" : ""
                  }`}
                >
                  {plan.highlight ? (
                    <span
                      className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground"
                      aria-label="Most popular plan"
                    >
                      Most Popular
                    </span>
                  ) : null}
                  <h3 className="wl-display-4">{plan.name}</h3>
                  <div className="mt-4 flex items-baseline justify-center gap-1">
                    <span className="wl-display-2 leading-none">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
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
                    className={`mt-5 min-h-11 justify-center text-sm font-semibold ${
                      plan.highlight ? "marketing-btn-primary" : "marketing-btn-secondary"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </article>
              ))}
            </div>

            <p className="mx-auto mt-6 max-w-[62ch] text-center text-sm leading-[1.6] text-muted-foreground">
              Included minutes are used first. Extra voice, SMS, and enrichment draw from prepaid
              Runtime Balance that you control — never a surprise invoice.{" "}
              <Link to="/pricing" className="font-semibold text-primary hover:underline">
                Compare every plan
              </Link>
            </p>
          </div>
        </section>
      </main>

      <MarketingChromeBar />
      <MarketingStickyCta />
    </div>
  );
}
