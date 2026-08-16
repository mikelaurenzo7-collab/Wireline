import { useState, type KeyboardEvent } from "react";
import { Mail, MessageSquareText, Phone, PhoneCall, Video } from "lucide-react";
import { Link } from "react-router";

import MarketingChromeBar from "./MarketingChromeBar";
import MarketingHero from "./MarketingHero";
import MarketingStickyCta from "./MarketingStickyCta";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import BrowserCallWidget from "./BrowserCallWidget";
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
  /** Carries the wedge into signup so the flow opens on the lane the visitor picked. */
  ctaPath: string;
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
    ctaPath: "/signup?plan=starter&mode=outbound",
  },
  inbound: {
    title: "Answer every valuable call",
    lead: "Catch the call, qualify the need, schedule the next step, and cover after hours from one record.",
    bestFor: ["Front Desk", "Lead Qualifier", "Support Triage"],
    ctaPath: "/signup?plan=starter&mode=inbound",
  },
  hybrid: {
    title: "One agent for the work between conversations",
    lead: "Keep sales, service, callbacks, scheduling, and CRM updates moving in one visible workflow.",
    bestFor: ["Sales Desk", "Collections Desk", "Appointment Desk"],
    ctaPath: "/signup?plan=starter&mode=hybrid",
  },
};

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
    facts: ["1 private draft agent", "Channels unlock at activation"],
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
      `${planCatalog.starter.included_phone_numbers} Wireline number`,
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
          The whole landing page, on one screen.

          It was four: a hero, an outcome picker, a Live Video panel, and a plan
          grid, 2.96 viewports, and 5.16 before this branch. What a visitor
          needs in order to decide is what it is, proof they can hear, which
          lane it runs in, and what it costs. All four are above the fold now,
          so none of them is behind a scroll.

          Nothing was dropped to get here; it was re-ranked. The outcome picker
          is a segmented control that swaps one line and retargets the CTA's
          wedge, rather than a full panel with its own headline and card. Live
          Video is a channel chip and a line in the plan note, which is where a
          $19 add-on belongs. The plan cards carry the two facts a visitor
          actually compares on (capacity and the included number) and
          /pricing owns the rest.
        */}
        <section className="marketing-section marketing-section--screen">
          <MarketingHero
            title={MARKETING_VOICE.headline}
            primaryAction={{ label: MARKETING_VOICE.primaryCta, to: detail.ctaPath }}
            secondaryAction={{ label: "See Plans", to: "#plans", tone: "secondary" }}
          />

          <div className="wl-public-rail mt-3 text-center">
            {/* The lane picker sits with the CTA it retargets: choosing a lane
                changes the promise and the wedge the signup flow opens on, and
                that relationship is invisible when the control lives a screen
                away from the button. */}
            <div
              className="wl-segmented mx-auto flex w-fit max-w-full"
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
                  <>
                    <p className="mx-auto mt-3 max-w-[64ch] text-sm leading-[1.55] text-muted-foreground">
                      {detail.lead}
                    </p>
                    <ul className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                      {detail.bestFor.map((item, index) => (
                        <li key={item} className="flex items-center gap-2">
                          {index > 0 ? (
                            <span aria-hidden="true" className="text-xs text-muted-foreground">
                              /
                            </span>
                          ) : null}
                          <span className="wl-overline text-muted-foreground">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            ))}

            {/* Proof you can hear, on the same screen as the claim. */}
            <div id="hear-a-demo" className="mt-3.5 flex flex-col items-center gap-2">
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

              {/* Four words for what used to be a headline and four cards. */}
              <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                {HERO_LOOP.map((step, index) => (
                  <li key={step} className="flex items-center gap-2">
                    {index > 0 ? (
                      <span aria-hidden="true" className="text-xs text-muted-foreground">
                        /
                      </span>
                    ) : null}
                    <span className="wl-overline text-foreground">{step}</span>
                  </li>
                ))}
              </ol>

              <ul className="flex flex-wrap items-center justify-center gap-2">
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

            {/* The price, on the same screen as the pitch. Two facts per card:
                what you can run, and what comes with it. */}
            <div
              id="plans"
              className="mx-auto mt-4 grid max-w-[1100px] items-stretch gap-2.5 sm:grid-cols-2 lg:grid-cols-4"
            >
              {PLAN_PREVIEW.map((plan) => (
                <article
                  key={plan.name}
                  className={`wl-paper relative flex flex-col rounded-[14px] p-3 text-center ${
                    plan.highlight ? "ring-2 ring-primary/60" : ""
                  }`}
                >
                  {plan.highlight ? (
                    <span
                      className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary-foreground"
                      aria-label="Most popular plan"
                    >
                      Most Popular
                    </span>
                  ) : null}
                  <h2 className="wl-card-title">{plan.name}</h2>
                  <div className="mt-2 flex items-baseline justify-center gap-1">
                    <span className="text-[1.6rem] font-semibold leading-none tracking-[-.04em] text-foreground">
                      {plan.price}
                    </span>
                    <span className="text-xs text-muted-foreground">{plan.period}</span>
                  </div>
                  <ul
                    className="mt-2.5 flex-1 space-y-0.5 text-[13px] leading-5 text-muted-foreground"
                    aria-label={`${plan.name} highlights`}
                  >
                    {plan.facts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                  <Link
                    to={plan.ctaPath}
                    className={`mt-2.5 min-h-8 justify-center text-[13px] font-semibold ${
                      plan.highlight ? "marketing-btn-primary" : "marketing-btn-secondary"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </article>
              ))}
            </div>

            <p className="mt-2.5 text-center text-xs leading-5 text-muted-foreground">
              Prepaid Runtime Balance you control. Live Video adds ${LIVE_VIDEO_ADDON_PRICE_USD}/mo.{" "}
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
