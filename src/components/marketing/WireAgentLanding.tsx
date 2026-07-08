import { useState, type KeyboardEvent } from "react";
import { ArrowRight, Check, PhoneCall, PlayCircle } from "lucide-react";
import { Link } from "react-router-dom";

import MarketingFooter from "./MarketingFooter";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import RoiCalculator from "./RoiCalculator";
import TrustSignals from "./TrustSignals";
import { AGENT_DIRECTION_MODES } from "../../lib/product-copy";
import { STRIPE_PLANS, type StripePlanId } from "../../lib/plan-catalog";

type AgentMode = "outbound" | "inbound" | "hybrid";

type ModeDetail = {
  eyebrow: string;
  title: string;
  lead: string;
  bestFor: readonly string[];
  transcript: readonly { from: "agent" | "caller"; text: string }[];
  outcomes: readonly string[];
  cta: string;
  ctaPath: string;
};

const HERO_LOOP = ["Create", "Train", "Wire", "Run"] as const;

const AUDIENCES = ["Personal assistants", "Call centers", "Sales teams"] as const;

const MODE_OPTIONS: { key: AgentMode; label: string }[] = [
  { key: "outbound", label: AGENT_DIRECTION_MODES.outbound.label },
  { key: "inbound", label: AGENT_DIRECTION_MODES.inbound.label },
  { key: "hybrid", label: AGENT_DIRECTION_MODES.hybrid.label },
];

const MODE_DETAILS: Record<AgentMode, ModeDetail> = {
  outbound: {
    eyebrow: "Outbound lane",
    title: "Call the list. Book the next step.",
    lead: "For sales, reactivation, collections, surveys, renewals, appointment campaigns, and follow-up that needs persistence without chaos.",
    bestFor: ["Sales SDR", "Billing recovery", "Re-engagement"],
    transcript: [
      {
        from: "agent",
        text: "Hi Jordan — I’m calling from Wireline. Your team is hiring SDRs, so this may be timely.",
      },
      { from: "caller", text: "What is this about?" },
      {
        from: "agent",
        text: "A trained call agent that qualifies lists, handles objections, books meetings, and logs the outcome.",
      },
      { from: "caller", text: "Send details and book time with revenue ops." },
    ],
    outcomes: ["Qualified", "Meeting booked", "CRM updated"],
    cta: "Wire outbound",
    ctaPath: "/signup?plan=business&mode=outbound",
  },
  inbound: {
    eyebrow: "Inbound lane",
    title: "Answer live demand cleanly.",
    lead: "For front desks, lead qualification, support triage, scheduling, callbacks, overflow, and after-hours coverage.",
    bestFor: ["Front desk", "Lead qualifier", "Support triage"],
    transcript: [
      { from: "caller", text: "Do you have availability for a consultation this week?" },
      { from: "agent", text: "I can help. Is this for sales, support, or scheduling?" },
      { from: "caller", text: "Sales. We need pricing and implementation timing." },
      { from: "agent", text: "Great — I’ll capture fit, book the handoff, and send the recap now." },
    ],
    outcomes: ["Answered live", "Booked intake", "Recap sent"],
    cta: "Wire inbound",
    ctaPath: "/signup?plan=business&mode=inbound",
  },
  hybrid: {
    eyebrow: "Hybrid lane",
    title: "Answer, follow up, and keep moving.",
    lead: "For real operations where inbound callbacks, outbound follow-up, scheduling, collections, and CRM updates live in the same workflow.",
    bestFor: ["Revenue desk", "Collections desk", "Appointment desk"],
    transcript: [
      { from: "caller", text: "I missed your call. Can someone explain renewal options?" },
      {
        from: "agent",
        text: "Absolutely. I can answer basics, confirm fit, and queue the renewal specialist if needed.",
      },
      { from: "caller", text: "Can you call me Friday if I do not finish the form?" },
      { from: "agent", text: "Done. I’ll send the link, log intent, and schedule a Friday follow-up." },
    ],
    outcomes: ["Answered", "Follow-up queued", "CRM synced"],
    cta: "Wire hybrid",
    ctaPath: "/signup?plan=business&mode=hybrid",
  },
};

const SYSTEM_WINS = [
  ["One clear promise", "The homepage now leads with Wire your agent instead of forcing buyers to decode product modes first."],
  ["One operating loop", "Create, Train, Wire, Run repeats across the page so the product feels learnable and memorable."],
  ["One obvious action", "Start free stays primary; demos and pricing support the decision without competing for attention."],
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
    body: "Build and train one agent first. Live work draws from Conversation Balance.",
    cta: "Start Personal",
    ctaPath: "/signup?plan=personal",
  },
  {
    name: "Team",
    price: `$${planCatalog.team.price_usd_monthly}`,
    period: "/mo",
    body: "Shared capacity for one focused call lane with approvals and a team inbox.",
    cta: "Start Team",
    ctaPath: "/signup?plan=team",
  },
  {
    name: "Business",
    price: `$${planCatalog.business.price_usd_monthly}`,
    period: "/mo",
    body: "More agents, numbers, CRM sync, analytics, roles, and oversight for real operations.",
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

function LiveAgentPreview({ mode }: { mode: AgentMode }) {
  const detail = MODE_DETAILS[mode];

  return (
    <aside
      className="wl-paper wl-paper-elevated relative overflow-hidden rounded-[20px] p-5 sm:p-6"
      aria-label={`${detail.eyebrow} live call preview`}
    >
      <div
        className="pointer-events-none absolute inset-[-35px] opacity-60"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse at 58% 18%, var(--wireline-color-glow-primarySoft), transparent 70%)",
          filter: "blur(42px)",
        }}
      />
      <div className="relative grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-primary text-primary-foreground">
              <PhoneCall size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-foreground">Wireline live desk</p>
              <p className="wl-eyebrow wl-eyebrow--no-rule mt-1 text-primary">{detail.eyebrow}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
            <span className="marketing-live-dot h-1.5 w-1.5 animate-[pulse_2s_ease-in-out_infinite] rounded-full" />
            <span className="font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground">
              Running
            </span>
          </div>
        </div>

        <div className="rounded-[14px] border border-border bg-muted px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[.12em] text-primary">
              Create → Train → Wire → Run
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
              live
            </span>
          </div>
          <div className="mt-3 flex h-6 items-end gap-[3px]" aria-hidden="true">
            {[28, 72, 96, 48, 86, 42, 92, 58, 76, 34].map((height, index) => (
              <span
                key={`${height}-${index}`}
                className="wireline-wave-bar w-[3px] rounded-sm bg-[var(--wireline-color-status-success)]"
                style={{
                  height: `${height}%`,
                  "--wl-wave-delay": `${index * 0.08}s`,
                }}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-2" role="list" aria-label={`Example ${mode} transcript`}>
          {detail.transcript.map((line, index) => (
            <div
              key={`${line.from}-${index}`}
              role="listitem"
              className={`max-w-[90%] rounded-[14px] px-[14px] py-[10px] text-[13px] leading-[1.48] ${
                line.from === "agent"
                  ? "justify-self-end rounded-br-[4px] bg-primary text-primary-foreground"
                  : "justify-self-start rounded-bl-[4px] bg-muted text-muted-foreground"
              }`}
            >
              {line.text}
            </div>
          ))}
        </div>

        <ul className="flex flex-wrap gap-1.5" aria-label="Call outcomes">
          {detail.outcomes.map((outcome) => (
            <li key={outcome} className="marketing-tag-success inline-flex items-center gap-1.5">
              <Check size={12} aria-hidden="true" />
              {outcome}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
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
        <section
          className="marketing-hero border-b border-border px-5 py-12 sm:px-8 sm:py-16 lg:px-10 lg:py-20"
          aria-labelledby="wireline-hero-title"
        >
          <div className="wl-public-rail grid items-center gap-9 lg:grid-cols-[1.02fr_.98fr] lg:gap-12">
            <div className="wireline-hero-motion text-center lg:text-left">
              <div className="mx-auto mb-5 inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 lg:mx-0">
                <span className="marketing-live-dot h-1.5 w-1.5 rounded-full" aria-hidden="true" />
                <span className="wl-eyebrow wl-eyebrow--no-rule text-muted-foreground">
                  From personal assistants to call centers and sales teams
                </span>
              </div>

              <h1
                id="wireline-hero-title"
                className="wl-display-1 mx-auto max-w-[9ch] text-[clamp(3.25rem,13vw,8rem)] uppercase leading-[.82] tracking-[-.075em] lg:mx-0"
              >
                Wire your <span className="text-primary">agent</span>
              </h1>

              <p className="wl-lead mx-auto mt-6 max-w-[42rem] lg:mx-0">
                Create the agent, train the rules, wire the number, and run the work from one clean operating surface.
              </p>

              <div className="mt-6 grid max-w-[35rem] grid-cols-4 overflow-hidden rounded-[14px] border border-border bg-card lg:mx-0">
                {HERO_LOOP.map((step, index) => (
                  <div key={step} className="border-r border-border px-2 py-3 text-center last:border-r-0">
                    <span className="block font-mono text-[10px] font-semibold uppercase tracking-[.12em] text-primary">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="mt-1 block text-[12px] font-semibold text-muted-foreground">
                      {step}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center lg:justify-start">
                <Link
                  to="/signup"
                  className="marketing-btn-primary min-h-12 w-full px-6 py-3 text-[15px] font-semibold sm:w-auto"
                >
                  Start free agent
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link
                  to="/showcase"
                  className="marketing-btn-secondary min-h-12 w-full px-6 py-3 text-[15px] font-semibold sm:w-auto"
                >
                  <PlayCircle size={16} aria-hidden="true" />
                  Hear a demo
                </Link>
              </div>

              <ul
                className="mx-auto mt-7 grid max-w-[40rem] gap-2 sm:grid-cols-3 lg:mx-0"
                aria-label="Wireline audiences"
              >
                {AUDIENCES.map((audience) => (
                  <li key={audience} className="flex items-center justify-center gap-2 text-[13px] text-muted-foreground lg:justify-start">
                    <span className="marketing-proof-chip h-[18px] w-[18px]" aria-hidden="true">
                      ✓
                    </span>
                    {audience}
                  </li>
                ))}
              </ul>
            </div>

            <div className="wireline-hero-motion wireline-hero-motion--delay">
              <LiveAgentPreview mode={mode} />
            </div>
          </div>
        </section>

        <section className="marketing-ink-panel border-b border-border px-5 py-5 text-center">
          <p className="marketing-ink-panel__soft text-[18px] font-[var(--wireline-font-family-display)]">
            One line, one trained agent, one visible outcome.{" "}
            <span className="text-[var(--wireline-color-text-primary)]">
              Less setup sprawl, more completed work.
            </span>
          </p>
        </section>

        <section className="border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">Operating loop</p>
              <h2 className="wl-display-2 mt-4">The product should feel obvious in thirty seconds.</h2>
              <p className="mt-4 text-[16px] leading-[1.6] text-muted-foreground">
                Every page should reinforce the same mental model: make the agent, teach it, connect it, then let it complete the work with a clean record behind it.
              </p>
            </div>
            <div className="grid overflow-hidden rounded-[16px] border border-border bg-card sm:grid-cols-4 sm:divide-x sm:divide-border">
              {HERO_LOOP.map((step, index) => (
                <article key={step} className="wl-wire-step p-7 text-center transition-colors hover:bg-muted/40">
                  <div className="mx-auto mb-6 grid h-10 w-10 place-items-center rounded-full border border-border bg-background font-mono text-[12px] font-bold text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <h3 className="wl-display-4">{step}</h3>
                  <p className="mt-3 text-[13px] leading-[1.6] text-muted-foreground">
                    {index === 0
                      ? "Start with the role, goal, audience, and success criteria."
                      : index === 1
                        ? "Give it voice, rules, approvals, context, and handoff logic."
                        : index === 2
                          ? "Attach the number, tools, inbox, routing, and spend controls."
                          : "Call, answer, follow up, log outcomes, and improve the next run."}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-card/40 px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail grid gap-10 lg:grid-cols-[.82fr_1.18fr] lg:items-start">
            <div>
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">Choose the lane</p>
              <h2 className="wl-display-2 mt-4">Modes are choices, not complexity.</h2>
              <p className="mt-4 max-w-[34rem] text-[16px] leading-[1.6] text-muted-foreground">
                Buyers should not need to understand telephony architecture. They pick the work pattern; Wireline handles the line, handoff, record, and balance.
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
                    <div className="grid gap-6">
                      <div>
                        <p className="wl-eyebrow wl-eyebrow--no-rule text-primary">{detail.eyebrow}</p>
                        <h3 className="wl-display-3 mt-3">{detail.title}</h3>
                        <p className="mt-4 text-[15px] leading-[1.65] text-muted-foreground">
                          {detail.lead}
                        </p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {detail.bestFor.map((item) => (
                          <div key={item} className="rounded-[12px] border border-border bg-muted px-4 py-3 text-center text-[13px] font-semibold text-foreground">
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

        <section className="border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">Polish principles</p>
              <h2 className="wl-display-2 mt-4">Simpler pages convert better.</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {SYSTEM_WINS.map(([title, body]) => (
                <article key={title} className="wl-paper rounded-[16px] p-7 text-center">
                  <span className="marketing-proof-chip mx-auto h-8 w-8 text-[13px]" aria-hidden="true">
                    ✓
                  </span>
                  <h3 className="wl-display-4 mt-5">{title}</h3>
                  <p className="mt-3 text-[14px] leading-[1.6] text-muted-foreground">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-card/40 px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">Pricing</p>
              <h2 className="wl-display-2 mt-4">Create first. Fund live work. Scale the operation.</h2>
              <p className="mt-4 text-[16px] leading-[1.6] text-muted-foreground">
                Personal starts free. Conversation Balance funds usage. Team and Business add capacity, numbers, controls, and reliability.
              </p>
            </div>
            <div className="mx-auto grid max-w-[960px] gap-5 sm:grid-cols-3">
              {PLAN_PREVIEW.map((plan) => (
                <article key={plan.name} className="wl-paper flex min-h-[260px] flex-col rounded-[16px] p-7 text-center">
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
              <Link to="/pricing" className="inline-flex items-center gap-2 text-[14px] font-semibold text-primary hover:underline">
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
                <h2 className="wl-display-2 mx-auto max-w-[16ch]">Wire the first line.</h2>
                <p className="marketing-ink-panel__soft mx-auto mt-4 max-w-[480px] text-[16px] leading-[1.6]">
                  Stand up one trained agent, connect one phone lane, and see one clean outcome after the first real conversation.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    to="/signup"
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--wireline-color-text-primary)] px-7 py-3 text-[15px] font-semibold text-[var(--wireline-color-canvas-default)] transition-all hover:-translate-y-px hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-text-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--wireline-color-canvas-default)] sm:w-auto"
                  >
                    Start free agent
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
