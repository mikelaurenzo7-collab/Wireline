import { useState, type KeyboardEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import MarketingFooter from "./MarketingFooter";
import MarketingHero from "./MarketingHero";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import RoiCalculator from "./RoiCalculator";
import TrustSignals from "./TrustSignals";
import { AGENT_DIRECTION_MODES, MARKETING_VOICE } from "../../lib/product-copy";
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

const AUDIENCES = ["Sales", "Scheduling", "Intake", "Support"] as const;
const HERO_VISUAL_ITEMS = [
  "Create the employee",
  "Train the playbook",
  "Wire the number",
  "Run the work",
] as const;

const MODE_OPTIONS: { key: AgentMode; label: string }[] = [
  { key: "outbound", label: AGENT_DIRECTION_MODES.outbound.label },
  { key: "inbound", label: AGENT_DIRECTION_MODES.inbound.label },
  { key: "hybrid", label: AGENT_DIRECTION_MODES.hybrid.label },
];

const MODE_DETAILS: Record<AgentMode, ModeDetail> = {
  outbound: {
    eyebrow: "Sales follow-up",
    title: "Sales follow-up without another hire.",
    lead: "Qualify warm leads, revive quotes, book the next step, collect the context, and log the result from one AI phone employee.",
    bestFor: ["Lead response", "Quote follow-up", "Appointment setting"],
    cta: "Start sales follow-up",
    ctaPath: "/signup?plan=business&mode=outbound",
  },
  inbound: {
    eyebrow: "Front desk",
    title: "Answer demand before it leaks.",
    lead: "Handle front desk calls, lead qualification, support triage, scheduling, callbacks, overflow, and after-hours coverage.",
    bestFor: ["Front desk", "Lead qualifier", "Support triage"],
    cta: "Start front desk",
    ctaPath: "/signup?plan=business&mode=inbound",
  },
  hybrid: {
    eyebrow: "Revenue desk",
    title: "Answer, follow up, and keep moving.",
    lead: "When callbacks, outbound follow-up, scheduling, and CRM updates belong in one workflow, one AI phone employee owns the handoff.",
    bestFor: ["Revenue desk", "Collections desk", "Appointment desk"],
    cta: "Start revenue desk",
    ctaPath: "/signup?plan=business&mode=hybrid",
  },
};

const LOOP_COPY = [
  "Name the employee, job, audience, and business result.",
  "Add voice, rules, approvals, facts, and handoff logic.",
  "Connect the number, tools, inbox, routing, and spend controls.",
  "Answer, qualify, book, follow up, log outcomes, and improve the next run.",
] as const;

const planCatalog = Object.fromEntries(STRIPE_PLANS.map((plan) => [plan.id, plan])) as Record<
  StripePlanId,
  (typeof STRIPE_PLANS)[number]
>;

const PLAN_PREVIEW = [
  {
    name: "Personal",
    price: "$0",
    period: "to create",
    body: "Build and train one AI phone employee. Live work draws from Conversation Balance.",
    cta: "Start Personal",
    ctaPath: "/signup?plan=personal",
  },
  {
    name: "Team",
    price: `$${planCatalog.team.price_usd_monthly}`,
    period: "/mo",
    body: "Shared capacity for one focused revenue lane with approvals and a team inbox.",
    cta: "Start Team",
    ctaPath: "/signup?plan=team",
  },
  {
    name: "Business",
    price: `$${planCatalog.business.price_usd_monthly}`,
    period: "/mo",
    body: "More employees, numbers, CRM sync, analytics, roles, and oversight for real operations.",
    cta: "Start Business",
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
          primaryAction={{ label: "Build your first employee", to: "/signup" }}
          secondaryAction={{ label: "Hear a demo", to: "/showcase", tone: "secondary" }}
          proof={AUDIENCES}
          visualEyebrow="Create -> Train -> Wire -> Run"
          visualTitle="One line from idea to outcome."
          visualBody="Define the job, teach the playbook, connect the number, then review exactly what happened after every conversation."
          visualItems={HERO_VISUAL_ITEMS}
        />

        <section className="marketing-ink-panel border-b border-border px-5 py-5 text-center">
          <p className="marketing-ink-panel__soft text-[18px] font-[var(--wireline-font-family-display)]">
            Sales follow-up without another hire. {" "}
            <span className="text-[var(--wireline-color-text-primary)]">
              Every lead gets a next step.
            </span>
          </p>
        </section>

        <section className="border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">How it works</p>
              <h2 className="wl-display-2 mt-4">Four steps from blank role to live phone work.</h2>
              <p className="mt-4 text-[16px] leading-[1.6] text-muted-foreground">
                Build the employee, train it, launch the channel, then improve with a clean record
                behind every conversation.
              </p>
            </div>
            <div className="grid overflow-hidden rounded-[16px] border border-border bg-card sm:grid-cols-4 sm:divide-x sm:divide-border">
              {HERO_LOOP.map((step, index) => (
                <article
                  key={step}
                  className="wl-wire-step p-7 text-center transition-colors hover:bg-muted/40"
                >
                  <div className="mx-auto mb-6 grid h-10 w-10 place-items-center rounded-full border border-border bg-background font-mono text-[12px] font-bold text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <h3 className="wl-display-4">{step}</h3>
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
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">Phone employee lanes</p>
              <h2 className="wl-display-2 mt-4">Pick the job. Wireline handles the line.</h2>
              <p className="mt-4 max-w-[34rem] text-[16px] leading-[1.6] text-muted-foreground">
                Outbound, inbound, or hybrid — same product. You choose the business result;
                Wireline handles the number, handoff, record, and balance.
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
                Personal starts free. Conversation Balance funds usage. Team and Business add
                capacity, numbers, and controls.
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
                <h2 className="wl-display-2 mx-auto max-w-[17ch]">Launch the first phone employee.</h2>
                <p className="marketing-ink-panel__soft mx-auto mt-4 max-w-[520px] text-[16px] leading-[1.6]">
                  Stand up one trained role, connect one phone lane, and see the outcome after the
                  first real conversation.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    to="/signup"
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--wireline-color-text-primary)] px-7 py-3 text-[15px] font-semibold text-[var(--wireline-color-canvas-default)] transition-all hover:-translate-y-px hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-text-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--wireline-color-canvas-default)] sm:w-auto"
                  >
                    Build your first employee
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
