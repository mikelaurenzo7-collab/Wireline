import { useEffect, useState, type KeyboardEvent } from "react";
import { ArrowRight, Mail, MessageSquareText, Phone, PhoneCall, Video } from "lucide-react";
import { Link } from "react-router";

import BrowserCallWidget from "./BrowserCallWidget";
import LandingCallStage from "./LandingCallStage";
import MarketingChromeBar from "./MarketingChromeBar";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../../data/contact-agents";
import { emitProductEvent, emitProductEventOnce } from "../../lib/product-event-client";
import { STRIPE_PLANS, type StripePlanId } from "../../lib/plan-catalog";
import { AGENT_DIRECTION_MODES, MARKETING_VOICE } from "../../lib/product-copy";
import { LIVE_VIDEO_ADDON_PRICE_USD } from "../../lib/video-presenter/live-video-policy";

type AgentMode = "outbound" | "inbound" | "hybrid";

type ModeDetail = {
  title: string;
  lead: string;
  bestFor: readonly string[];
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

/* The homepage names the two buying thresholds and lets /pricing own the
   comparison. The supporting facts stay in accessible labels without turning
   the opening frame back into a plan grid. */
const PLAN_PREVIEW = [
  {
    name: "Free Builder",
    label: "Start Free",
    detail: "Channels unlock at activation",
    ctaPath: "/signup?plan=personal",
  },
  {
    name: "Starter",
    label: `Go Live $${planCatalog.starter.price_usd_monthly}/mo`,
    detail: `${planCatalog.starter.included_phone_numbers} Wireline number included`,
    ctaPath: "/signup?plan=starter",
  },
] as const;

function modeTabId(key: AgentMode) {
  return `wire-agent-${key}-tab`;
}

function modePanelId(key: AgentMode) {
  return `wire-agent-${key}-panel`;
}

export default function WireAgentLanding() {
  const [mode, setMode] = useState<AgentMode>("outbound");
  const detail = MODE_DETAILS[mode];
  const selectedModeLabel = MODE_OPTIONS.find((option) => option.key === mode)?.label ?? "Sales";
  const HERO_DEMO_AGENT =
    mode === "outbound" ? LANDING_PUBLIC_DEMO_AGENTS[1]! : LANDING_PUBLIC_DEMO_AGENTS[0]!;

  useEffect(() => {
    emitProductEventOnce({
      event: "landing_viewed",
      surface: "marketing_web",
      metadata: { path: window.location.pathname || "/", scope: "home_call_stage" },
    });
  }, []);

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

  const trackPrimaryCta = () => {
    emitProductEvent({
      event: "landing_primary_cta_clicked",
      surface: "marketing_web",
      metadata: {
        label: MARKETING_VOICE.primaryCta,
        to: detail.ctaPath,
        source: "landing_call_stage",
        mode,
      },
    });
  };

  return (
    <div className="marketing-surface bg-background text-foreground">
      <PrecisionPublicHeader />

      <main id="main-content" className="marketing-flow" tabIndex={-1}>
        <section className="marketing-section marketing-section--screen wl-landing-stage-section">
          <div className="wl-landing-stage-layout">
            <div className="wl-landing-stage-copy !text-left">
              <p className="wl-landing-stage__eyebrow wl-overline">On The Line</p>
              <h1 className="wl-landing-stage__headline wl-stitch-display">
                {MARKETING_VOICE.headline}
              </h1>
              <p className="wl-landing-stage__lead">
                One trained voice agent calls, answers, texts, emails, books, and follows through.
              </p>

              <div className="wl-landing-stage__tabs">
                <div
                  className="wl-segmented flex w-fit max-w-full"
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

              {MODE_OPTIONS.map(({ key, label }) => (
                <div
                  key={key}
                  id={modePanelId(key)}
                  role="tabpanel"
                  aria-labelledby={modeTabId(key)}
                  aria-label={`${label} agent details`}
                  className="sr-only"
                  hidden={mode !== key}
                >
                  {MODE_DETAILS[key].lead}
                </div>
              ))}

              <div className="wl-landing-stage__actions">
                <Link
                  to={detail.ctaPath}
                  className="marketing-btn-primary wl-landing-stage__primary"
                  onClick={trackPrimaryCta}
                >
                  {MARKETING_VOICE.primaryCta}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>

                <nav className="wl-landing-stage__price-rail" aria-label="Starting plans">
                  {PLAN_PREVIEW.map((plan) => (
                    <Link
                      key={plan.name}
                      to={plan.ctaPath}
                      className="wl-landing-stage__price-link"
                      aria-label={`${plan.label}. ${plan.detail}`}
                    >
                      {plan.label}
                    </Link>
                  ))}
                </nav>
              </div>

              <ul className="wl-landing-stage__channels" aria-label="Agent channels">
                {CHANNELS.map(({ label, icon: Icon }) => (
                  <li
                    key={label}
                    aria-label={
                      label === "Live Video"
                        ? `Live Video, $${LIVE_VIDEO_ADDON_PRICE_USD} per month add on`
                        : label
                    }
                  >
                    <Icon aria-hidden="true" />
                    {label}
                  </li>
                ))}
              </ul>
              <p className="sr-only">Paid plans use a prepaid Runtime Balance you control.</p>
            </div>

            <div id="hear-a-demo" className="wl-landing-stage-visual">
              <LandingCallStage
                key={`${mode}-${HERO_DEMO_AGENT.name}`}
                agentName={HERO_DEMO_AGENT.name}
                modeLabel={selectedModeLabel}
                promise={detail.title}
                summary={detail.lead}
                outcomes={detail.bestFor}
                workflow={HERO_LOOP}
                control={
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
                }
              />
            </div>
          </div>
        </section>
      </main>

      <MarketingChromeBar />
    </div>
  );
}
