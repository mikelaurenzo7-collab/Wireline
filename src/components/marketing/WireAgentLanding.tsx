import { useState, type KeyboardEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import MarketingFooter from "./MarketingFooter";
import MarketingHero from "./MarketingHero";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import RoiCalculator from "./RoiCalculator";
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

const AUDIENCES = ["Sales", "Marketing", "Support", "Admin"] as const;
const HERO_VISUAL_ITEMS = [
  "Brief the outcome",
  "Train the truth",
  "Give it a number",
  "See the proof",
] as const;

const MODE_OPTIONS: { key: AgentMode; label: string }[] = [
  { key: "outbound", label: AGENT_DIRECTION_MODES.outbound.label },
  { key: "inbound", label: AGENT_DIRECTION_MODES.inbound.label },
  { key: "hybrid", label: AGENT_DIRECTION_MODES.hybrid.label },
];

const MODE_DETAILS: Record<AgentMode, ModeDetail> = {
  outbound: {
    eyebrow: "Sales and growth",
    title: "Your best salesperson, without the commission.",
    lead: "Call warm lists, revive old leads, promote offers, follow up on quotes, book appointments, and log profit-moving outcomes with one tireless employee.",
    bestFor: ["Lead response", "Quote follow-up", "Appointment setting"],
    cta: "Build your best employee",
    ctaPath: "/signup?plan=starter&mode=outbound",
  },
  inbound: {
    eyebrow: "Front desk and support",
    title: "Answer demand before profit leaks.",
    lead: "Handle front desk calls, inbound lead qualification, scheduling, callbacks, overflow, and after-hours coverage with a reachable Wireline number.",
    bestFor: ["Front desk", "Lead qualifier", "Support triage"],
    cta: "Build your best employee",
    ctaPath: "/signup?plan=starter&mode=inbound",
  },
  hybrid: {
    eyebrow: "Right-hand operator",
    title: "The employee who does the follow-through.",
    lead: "When sales, marketing, callbacks, scheduling, recovery, and CRM updates belong in one workflow, Wireline owns the busywork and shows you the result.",
    bestFor: ["Sales desk", "Collections desk", "Appointment desk"],
    cta: "Build your best employee",
    ctaPath: "/signup?plan=starter&mode=hybrid",
  },
};

const LOOP_COPY = [
  "Tell it the outcome, audience, limits, and rules.",
  "Add the offer, voice, objections, approvals, and handoff logic.",
  "Launch the included number, tools, inbox, routing, and spend controls.",
  "Let it answer, call, sell, market, book, recover, follow up, and log what happened.",
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
    body: "Build and train your first Wireline employee privately. Activate any paid plan when you're ready to put it to work.",
    cta: "Start free",
    ctaPath: "/signup?plan=personal",
  },
  {
    name: "Starter",
    price: `$${planCatalog.starter.price_usd_monthly}`,
    period: "/mo",
    body: `${planCatalog.starter.max_agents} live AI employee and ${planCatalog.starter.included_phone_numbers} included number, plus ${planCatalog.starter.voice_minutes_monthly} guaranteed voice minutes for one focused growth lane.`,
    cta: "Start for $9",
    ctaPath: "/signup?plan=starter",
  },
  {
    name: "Pro",
    price: `$${planCatalog.business.price_usd_monthly}`,
    period: "/mo",
    body: `${planCatalog.business.max_agents} live AI employees and ${planCatalog.business.included_phone_numbers} included numbers with CRM sync, analytics, roles, and oversight.`,
    cta: "Go Pro",
    ctaPath: "/signup?plan=business",
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
    <div className="wl-viewport-frame bg-background text-foreground">
      <PrecisionPublicHeader />

      <main id="main-content" className="wl-viewport-scroll pt-16" tabIndex={-1}>
        <MarketingHero
          eyebrow={MARKETING_VOICE.eyebrow}
          title={MARKETING_VOICE.headline}
          description={MARKETING_VOICE.subline}
          primaryAction={{ label: "Build your best employee", to: "/signup" }}
          secondaryAction={{ label: "Hear a demo", to: "/showcase", tone: "secondary" }}
          proof={AUDIENCES}
          visualEyebrow="Brief -> Train -> Launch -> Prove"
          visualTitle="One number. One employee. Every outcome logged."
          visualBody="Tell Wireline what you want done, train it on your rules, give it an included line, then review exactly what moved after every conversation."
          visualItems={HERO_VISUAL_ITEMS}
        />

        <section className="marketing-ink-panel border-b border-border px-5 py-5 text-center">
          <p className="marketing-ink-panel__soft text-[18px] font-[var(--wireline-font-family-display)]">
            Salesperson. Marketer. Front desk. Follow-up machine. {" "}
            <span className="text-[var(--wireline-color-text-primary)]">
              Start with one best employee, then add specialists only when volume proves it.
            </span>
          </p>
        </section>

        <section className="border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">How it works</p>
              <h2 className="wl-display-2 mt-4">Four steps from idea to employee.</h2>
              <p className="mt-4 text-[16px] leading-[1.6] text-muted-foreground">
                Build one AI employee, train the business truth, launch the included number, then
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
          <div className="wl-public-rail grid gap-10 lg:grid-cols-[.82fr_1.18fr] lg:items-start">
            <div>
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">Work lanes</p>
              <h2 className="wl-display-2 mt-4">Choose the outcome. Wireline gives it a line.</h2>
              <p className="mt-4 max-w-[34rem] text-[16px] leading-[1.6] text-muted-foreground">
                Sales, service, or all-purpose follow-through — same product. You choose the first
                business result; Wireline handles the number, handoff, record, and balance. {AGENT_NUMBER_PROMISE}
              </p>
              <div
                className="wl-segmented mt-7"
                role="tablist"
                aria-label="Agent call direction"
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

            <div className="wl-paper rounded-[18px] p-6 sm:p-7">
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
                    <div className="space-y-6">
                      <div>
                        <p className="wl-eyebrow wl-eyebrow--no-rule text-primary">
                          {detail.eyebrow}
                        </p>
                        <h3 className="wl-display-3 mt-3">{detail.title}</h3>
                        <p className="mt-4 text-[15px] leading-[1.65] text-muted-foreground">
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
                        className="marketing-btn-primary min-h-11 justify-center px-5 text-[13px] font-semibold sm:w-fit"
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
              <h2 className="wl-display-2 mt-4">Create first. Fund live work. Scale when ready.</h2>
              <p className="mt-4 text-[16px] leading-[1.6] text-muted-foreground">
                Free Builder starts free. Every paid plan guarantees live voice minutes. Higher
                tiers add employee capacity, included numbers, controls, and shared operations.
              </p>
            </div>
            <div className="mx-auto grid max-w-[960px] gap-5 sm:grid-cols-3">
              {PLAN_PREVIEW.map((plan) => (
                <article
                  key={plan.name}
                  className="wl-paper flex min-h-[260px] flex-col rounded-[16px] p-7 text-center"
                >
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
                    className="marketing-btn-secondary mt-6 min-h-11 justify-center text-[13px] font-semibold"
                  >
                    {plan.cta}
                  </Link>
                </article>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 text-[14px] font-semibold text-primary hover:underline"
              >
                Compare every plan <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section className="px-5 py-4 sm:px-8 lg:px-10">
          <div className="wl-public-rail">
            <RoiCalculator />
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
                <h2 className="wl-display-2 mx-auto max-w-[17ch]">Build your best employee.</h2>
                <p className="marketing-ink-panel__soft mx-auto mt-4 max-w-[520px] text-[16px] leading-[1.6]">
                  Stand up one trained AI employee, claim its included number, and see the outcome
                  after the first real conversation.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    to="/signup"
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--wireline-color-text-primary)] px-7 py-3 text-[15px] font-semibold text-[var(--wireline-color-canvas-default)] transition-all hover:-translate-y-px hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-text-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--wireline-color-canvas-default)] sm:w-auto"
                  >
                    Build your best employee
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  <Link
                    to="/showcase"
                    className="flex min-h-12 w-full items-center justify-center px-7 py-3 text-[15px] font-medium marketing-ink-panel__soft transition-colors hover:text-[var(--wireline-color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-text-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--wireline-color-canvas-default)] sm:w-auto"
                  >
                    Hear a demo
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <TrustSignals />
        <MarketingFooter />
      </main>
    </div>
  );
}
