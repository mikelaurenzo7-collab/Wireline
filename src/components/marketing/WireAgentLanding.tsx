import { useState, type KeyboardEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import MarketingFooter from "./MarketingFooter";
import MarketingHero from "./MarketingHero";
import MarketingStickyCta from "./MarketingStickyCta";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import TrustSignals from "./TrustSignals";
import {
  AGENT_DIRECTION_MODES,
  AGENT_NUMBER_PROMISE,
  MARKETING_VOICE,
} from "../../lib/product-copy";
import { STRIPE_PLANS, type StripePlanId } from "../../lib/plan-catalog";

type AgentMode = "outbound" | "inbound" | "hybrid";

type ModeDetail = {
  eyebrow: string;
  title: string;
  lead: string;
  bestFor: readonly string[];
  cta: string;
  ctaPath: string;
};

const HERO_LOOP = MARKETING_VOICE.proof;
const HERO_CAPABILITIES = MARKETING_VOICE.channelProof.slice(0, 3);

const MODE_OPTIONS: { key: AgentMode; label: string }[] = [
  { key: "outbound", label: AGENT_DIRECTION_MODES.outbound.label },
  { key: "inbound", label: AGENT_DIRECTION_MODES.inbound.label },
  { key: "hybrid", label: AGENT_DIRECTION_MODES.hybrid.label },
];

const MODE_DETAILS: Record<AgentMode, ModeDetail> = {
  outbound: {
    eyebrow: "Sales and growth",
    title: "Your best salesperson, without the commission.",
    lead: "Call warm lists, revive old leads, promote offers, text or email the follow-up, book appointments, and log profit-moving outcomes with one tireless employee.",
    bestFor: ["Lead response", "Quote follow-up", "Appointment setting"],
    cta: "Start on Starter — $9/mo",
    ctaPath: "/signup?plan=starter&mode=outbound",
  },
  inbound: {
    eyebrow: "Front desk and support",
    title: "Answer demand before profit leaks.",
    lead: "Handle front-desk calls, inbound qualification, scheduling, callbacks, overflow, after-hours coverage, and the next SMS or email from one shared customer record.",
    bestFor: ["Front desk", "Lead qualifier", "Support triage"],
    cta: "Start on Starter — $9/mo",
    ctaPath: "/signup?plan=starter&mode=inbound",
  },
  hybrid: {
    eyebrow: "Right-hand employee",
    title: "The employee who does the follow-through.",
    lead: "When sales, service, callbacks, email, SMS, scheduling, recovery, and CRM updates belong in one workflow, Wireline owns the busywork and shows you the result.",
    bestFor: ["Sales desk", "Collections desk", "Appointment desk"],
    cta: "Start on Starter — $9/mo",
    ctaPath: "/signup?plan=starter&mode=hybrid",
  },
};

const LOOP_COPY = [
  "Tell it the outcome, audience, limits, and rules.",
  "Add the offer, voice, knowledge, objections, approvals, and handoff logic.",
  "Activate a paid plan, claim the included number, connect email, SMS, tools, and spend controls.",
  "Let it answer, sell, support, book, follow up, update systems, and log what happened.",
] as const;

const planCatalog = Object.fromEntries(STRIPE_PLANS.map((plan) => [plan.id, plan])) as Record<
  StripePlanId,
  (typeof STRIPE_PLANS)[number]
>;

const PLAN_PREVIEW = [
  {
    name: "Free Builder",
    price: "$0",
    period: "to create",
    body: "Build, train, and privately test your first AI Voice Employee. Activate a paid plan when you are ready for live calling, SMS, email workflows, and a Wireline number.",
    cta: "Start free",
    ctaPath: "/signup?plan=personal",
    highlight: false,
  },
  {
    name: "Starter",
    price: `$${planCatalog.starter.price_usd_monthly}`,
    period: "/mo",
    body: `${planCatalog.starter.max_agents} live AI Voice Employee, ${planCatalog.starter.included_phone_numbers} included Wireline number, and ${planCatalog.starter.voice_minutes_monthly} guaranteed voice minutes—plus connected SMS and email workflows.`,
    cta: "Start for $9",
    ctaPath: "/signup?plan=starter",
    highlight: false,
  },
  {
    name: "Starter Plus",
    price: `$${planCatalog.team.price_usd_monthly}`,
    period: "/mo",
    body: `${planCatalog.team.voice_minutes_monthly} guaranteed voice minutes and the full SMS + Lead Hunt workflow—still one focused AI employee, with room to answer real customer demand.`,
    cta: "Get Starter Plus",
    ctaPath: "/signup?plan=team",
    highlight: true,
  },
  {
    name: "Pro",
    price: `$${planCatalog.business.price_usd_monthly}`,
    period: "/mo",
    body: `${planCatalog.business.max_agents} live AI employees and ${planCatalog.business.included_phone_numbers} included numbers with shared voice, SMS, email, CRM sync, analytics, roles, approvals, and oversight.`,
    cta: "Go Pro",
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

export default function WireAgentLanding() {
  const [mode, setMode] = useState<AgentMode>("outbound");
  const detail = MODE_DETAILS[mode];

  const selectMode = (key: AgentMode, focusAfterSelect = false) => {
    setMode(key);

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
    <div className="marketing-surface wl-viewport-frame bg-background text-foreground">
      <PrecisionPublicHeader />

      <main id="main-content" className="wl-viewport-scroll pt-16" tabIndex={-1}>
        <MarketingHero
          eyebrow={MARKETING_VOICE.eyebrow}
          title={MARKETING_VOICE.headline}
          description={MARKETING_VOICE.subline}
          primaryAction={{ label: MARKETING_VOICE.primaryCta, to: "/signup" }}
          secondaryAction={{ label: "Hear a demo", to: "/showcase", tone: "secondary" }}
          proof={HERO_CAPABILITIES}
        />

        <section className="border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">
                One employee · every channel
              </p>
              <h2 className="wl-display-2 mt-4">Train it once. Put it to work everywhere.</h2>
              <p className="mt-4 text-[16px] leading-[1.6] text-muted-foreground">
                Voice is the front door. SMS and email keep the conversation moving. The same
                employee carries the business knowledge, rules, approvals, memory, and outcome
                history across all three.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Voice", "Answers and places calls, qualifies, books, transfers, and recaps."],
                [
                  "Text / SMS",
                  "Confirms, nurtures, reminds, recovers, and escalates under consent rules.",
                ],
                [
                  "Email",
                  "Reads, drafts, sends approved replies, follows up, and records the result.",
                ],
                [
                  "One operating record",
                  "Every channel shares context, coaching, spend controls, and proof.",
                ],
              ].map(([title, body]) => (
                <article key={title} className="wl-paper rounded-[16px] p-6 text-center">
                  <h3 className="wl-display-4">{title}</h3>
                  <p className="mt-3 text-[13px] leading-[1.6] text-muted-foreground">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">How it works</p>
              <h2 className="wl-display-2 mt-4">Four steps from idea to employee.</h2>
              <p className="mt-4 text-[16px] leading-[1.6] text-muted-foreground">
                Build one AI employee, train the business truth, activate the live channels, then
                improve from a clean record behind every conversation.
              </p>
            </div>
            <div className="grid overflow-hidden rounded-[16px] border border-border bg-card sm:grid-cols-4 sm:divide-x sm:divide-border">
              {HERO_LOOP.map((step, index) => (
                <article
                  key={step}
                  className={`wl-wire-step p-7 text-center transition-colors hover:bg-muted/40 ${
                    index === HERO_LOOP.length - 1 ? "wl-wire-step--settled" : ""
                  }`}
                >
                  <div className="wl-wire-step__marker mb-5">
                    <span className="wl-wire-step__node" aria-hidden="true" />
                  </div>
                  <span className="block font-mono text-[11px] font-semibold uppercase tracking-[.12em] text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="wl-display-4 mt-2">{step}</h3>
                  <p className="mt-3 text-[13px] leading-[1.6] text-muted-foreground">
                    {LOOP_COPY[index]}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-card/40 px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mx-auto max-w-3xl text-center">
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">Work lanes</p>
              <h2 className="wl-display-2 mx-auto mt-4 max-w-[18ch]">
                Choose the outcome. Your employee handles the conversation.
              </h2>
              <p className="mx-auto mt-4 max-w-[46rem] text-[16px] leading-[1.6] text-muted-foreground">
                Start with sales, service, or all-purpose follow-through. Voice, SMS, email,
                handoff, memory, and proof remain one system. {AGENT_NUMBER_PROMISE}
              </p>
              <div
                className="wl-segmented mx-auto mt-7 flex w-fit max-w-full"
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
                      className="wl-segmented__item px-3 sm:px-5"
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
                        <p className="wl-eyebrow wl-eyebrow--no-rule text-primary">
                          {detail.eyebrow}
                        </p>
                        <h3 className="wl-display-3 mx-auto mt-3 max-w-[20ch]">{detail.title}</h3>
                        <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-[1.65] text-muted-foreground">
                          {detail.lead}
                        </p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {detail.bestFor.map((item) => (
                          <div
                            key={item}
                            className="rounded-[12px] border border-border bg-muted px-4 py-3 text-center text-[13px] font-semibold text-foreground"
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                      <Link
                        to={detail.ctaPath}
                        className="marketing-btn-primary mx-auto min-h-11 justify-center px-5 text-[13px] font-semibold sm:w-fit"
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

        <section className="border-b border-border bg-card/40 px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">Pricing</p>
              <h2 className="wl-display-2 mt-4">Build free. Activate live work from $9.</h2>
              <p className="mt-4 text-[16px] leading-[1.6] text-muted-foreground">
                Free Builder lets you create and train privately. Every paid plan includes live
                voice capacity and a Wireline number at no extra line fee, with SMS and email
                available to the same employee under visible usage controls.
              </p>
            </div>
            <div className="mx-auto grid max-w-[1200px] gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {PLAN_PREVIEW.map((plan) => (
                <article
                  key={plan.name}
                  className={`wl-paper relative flex min-h-[260px] flex-col rounded-[16px] p-7 text-center ${
                    plan.highlight ? "ring-2 ring-primary/60 shadow-lg" : ""
                  }`}
                >
                  {plan.highlight ? (
                    <span
                      className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-foreground shadow-sm"
                      aria-label="Most popular plan"
                    >
                      Most popular
                    </span>
                  ) : null}
                  <h3 className="wl-display-4">{plan.name}</h3>
                  <div className="mt-5 flex items-baseline justify-center gap-1">
                    <span className="wl-display-2 leading-none">{plan.price}</span>
                    <span className="text-[13px] text-muted-foreground">{plan.period}</span>
                  </div>
                  <p className="mt-5 flex-1 text-[14px] leading-[1.6] text-muted-foreground">
                    {plan.body}
                  </p>
                  <Link
                    to={plan.ctaPath}
                    className={`mt-6 min-h-11 justify-center text-[13px] font-semibold ${
                      plan.highlight ? "marketing-btn-primary" : "marketing-btn-secondary"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </article>
              ))}
            </div>
            <div className="mt-8 text-center">
              <p className="mx-auto max-w-[52ch] text-[13px] leading-[1.6] text-muted-foreground">
                Included voice minutes are used first. Additional provider-funded voice, SMS, email,
                enrichment, or automation draws from prepaid Conversation Balance you control—never
                a surprise postpaid invoice.
              </p>
              <Link
                to="/pricing"
                className="mt-5 inline-flex items-center gap-2 text-[14px] font-semibold text-primary hover:underline"
              >
                Compare every plan <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section className="px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="wl-featured-wire wl-featured-wire--live relative overflow-hidden rounded-[20px] marketing-ink-panel px-6 py-14 text-center sm:px-10 sm:py-20">
              <div
                className="pointer-events-none absolute inset-0"
                aria-hidden="true"
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 0%, var(--wireline-color-glow-primary), transparent 60%)",
                }}
              />
              <div className="relative">
                <h2 className="wl-display-2 mx-auto max-w-[18ch]">Build your AI Voice Employee.</h2>
                <p className="marketing-ink-panel__soft mx-auto mt-4 max-w-[580px] text-[16px] leading-[1.6]">
                  Train it free. Activate a paid plan to claim the included Wireline number, connect
                  SMS and email, and see the outcome after the first real customer conversation.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    to="/signup"
                    className="marketing-btn-primary min-h-12 w-full justify-center px-7 text-[15px] font-semibold sm:w-auto"
                  >
                    Build your AI Voice Employee
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  <Link
                    to="/showcase"
                    className="marketing-btn-secondary min-h-12 w-full justify-center border-border/40 bg-transparent px-7 text-[15px] font-medium text-[var(--wireline-color-text-secondary)] hover:bg-white/5 hover:text-[var(--wireline-color-text-primary)] sm:w-auto"
                  >
                    Hear a demo
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
