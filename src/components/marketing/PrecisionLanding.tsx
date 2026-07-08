import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { ArrowRight, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import MarketingFooter from "./MarketingFooter";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import TrustSignals from "./TrustSignals";
import RoiCalculator from "./RoiCalculator";
import {
  AGENT_DIRECTION_MODES,
  BUSINESS_MARKETING_VOICE,
  MARKETING_VOICE,
  OUTBOUND_WEDGE,
} from "../../lib/product-copy";
import { STRIPE_PLANS, type StripePlanId } from "../../lib/plan-catalog";

type AgentMode = "outbound" | "inbound" | "hybrid";

function LiveCallCard({ mode }: { mode: AgentMode }) {
  const outbound = {
    initial: "W",
    name: "Wireline — Outbound Desk",
    role: "Outbound sales agent",
    caller: "Outbound · Acme Cloud",
    status: "Dialing",
    meter: "Calling · transcribing",
    lines: [
      { from: "agent", text: "Hi Jordan, this is Wireline. I saw your team is hiring SDRs and thought this might be timely." },
      { from: "caller", text: "What is this about?" },
      { from: "agent", text: "Outbound call agents that qualify lists, handle objections, book meetings, and log outcomes. Is outbound capacity a priority this quarter?" },
      { from: "caller", text: "Yes. Send details and book something with our revenue ops lead." },
    ],
    tags: ["Qualified", "Meeting booked", "CRM updated"],
  };

  const inbound = {
    initial: "F",
    name: "Wireline — Front Desk",
    role: "Inbound call agent",
    caller: "Inbound · New prospect",
    status: "Answering",
    meter: "Answering · routing",
    lines: [
      { from: "caller", text: "Hi, do you have availability for a consultation this week?" },
      { from: "agent", text: "I can help. Is this for sales, support, or scheduling?" },
      { from: "caller", text: "Sales. We need pricing and implementation timing." },
      { from: "agent", text: "Great. I’ll capture the fit, book the right handoff, and send the recap now." },
    ],
    tags: ["Answered live", "Booked intake", "Recap sent"],
  };

  const hybrid = {
    initial: "H",
    name: "Wireline — Revenue Desk",
    role: "Hybrid call agent",
    caller: "Callback · Warm opportunity",
    status: "Handling",
    meter: "Answering · following up",
    lines: [
      { from: "caller", text: "I missed your call earlier. Can someone explain the renewal options?" },
      { from: "agent", text: "Absolutely. I can answer the basics, confirm fit, and queue the renewal specialist if needed." },
      { from: "caller", text: "Can you call me again Friday if I don’t finish the form?" },
      { from: "agent", text: "Done. I’ll send the link, log today’s intent, and schedule a Friday follow-up." },
    ],
    tags: ["Answered", "Follow-up queued", "CRM synced"],
  };

  const data = { outbound, inbound, hybrid }[mode];

  return (
    <aside
      className="wl-paper wl-paper-elevated relative rounded-[20px] p-5 sm:p-6"
      aria-label={`${data.role} live call preview`}
    >
      <div
        className="pointer-events-none absolute inset-[-30px] rounded-[40px] opacity-55"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse at 60% 30%, var(--wireline-color-glow-primarySoft), transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-primary font-mono text-[12px] font-bold text-primary-foreground"
              aria-hidden="true"
            >
              {data.initial}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold">{data.name}</div>
              <div className="wl-eyebrow wl-eyebrow--no-rule text-primary">{data.role}</div>
              <div className="mt-1 truncate text-[12px] text-muted-foreground">{data.caller}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-border px-3 py-1.5">
            <span
              className="marketing-live-dot h-1.5 w-1.5 animate-[pulse_2s_ease-in-out_infinite] rounded-full"
              aria-hidden="true"
            />
            <span className="font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground">
              {data.status}
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-muted px-4 py-3">
          <div className="flex h-6 items-end gap-[2px]" aria-hidden="true">
            {[30, 70, 100, 50, 85, 40, 95, 60].map((h, i) => (
              <div
                key={i}
                className="wireline-wave-bar w-[3px] rounded-sm bg-[var(--wireline-color-status-success)]"
                style={
                  {
                    height: `${h}%`,
                    "--wl-wave-delay": `${i * 0.1}s`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground">
            {data.meter}
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-2" role="list" aria-label={`Example ${mode} call transcript`}>
          {data.lines.map((line, i) => (
            <div
              key={i}
              role="listitem"
              className={`max-w-[88%] rounded-[14px] px-[14px] py-[10px] text-[13px] leading-[1.5] ${
                line.from === "agent"
                  ? "self-end rounded-br-[4px] bg-primary text-primary-foreground"
                  : "self-start rounded-bl-[4px] bg-muted text-muted-foreground"
              }`}
            >
              {line.text}
            </div>
          ))}
        </div>

        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Call outcomes">
          {data.tags.map((tag) => (
            <li key={tag} className="marketing-tag-success inline-flex items-center gap-1.5">
              <span aria-hidden="true">✓</span>
              {tag}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

const modes: { key: AgentMode; label: string }[] = [
  { key: "outbound", label: AGENT_DIRECTION_MODES.outbound.label },
  { key: "inbound", label: AGENT_DIRECTION_MODES.inbound.label },
  { key: "hybrid", label: AGENT_DIRECTION_MODES.hybrid.label },
];

function getModeTabId(key: AgentMode) {
  return `wireline-${key}-mode-tab`;
}

function getModePanelId(key: AgentMode) {
  return `wireline-${key}-mode-panel`;
}

const MODE_COPY: Record<
  AgentMode,
  {
    cta: string;
    ctaPath: string;
    demo: string;
    note: string;
    stripLead: string;
    stripWin: string;
    title: string;
    lead: string;
    loopLabel: string;
    outcomes: readonly string[];
  }
> = {
  outbound: {
    cta: "Wire outbound agent",
    ctaPath: "/signup?plan=business&mode=outbound",
    demo: "Hear outbound call",
    note: "For sales teams, marketing re-engagement, billing recovery, customer surveys, renewals, appointment campaigns, and follow-up.",
    stripLead: OUTBOUND_WEDGE.beforeStrip,
    stripWin: BUSINESS_MARKETING_VOICE.differentiator,
    title: "OUTBOUND AGENTS",
    lead: OUTBOUND_WEDGE.subline,
    loopLabel: "Wireline outbound loop",
    outcomes: ["Calls the list", "Handles objections", "Logs outcomes"],
  },
  inbound: {
    cta: "Wire inbound agent",
    ctaPath: "/signup?plan=business&mode=inbound",
    demo: "Hear inbound call",
    note: "For front desks, inbound sales, support triage, scheduling, callbacks, overflow, after-hours coverage, and lead qualification.",
    stripLead: "Not every agent starts with a list.",
    stripWin: "Wireline can answer live demand, qualify intent, route handoffs, and log the call.",
    title: "INBOUND AGENTS",
    lead: "Choose inbound when the work starts with the customer: answer the call, understand intent, resolve or route, and leave a clean record behind.",
    loopLabel: "Wireline inbound loop",
    outcomes: ["Answers live", "Routes handoff", "Sends recap"],
  },
  hybrid: {
    cta: "Wire hybrid agent",
    ctaPath: "/signup?plan=business&mode=hybrid",
    demo: "Hear hybrid call",
    note: "For teams that need both sides: answer callbacks, make follow-ups, chase missing context, schedule next steps, and update the system of record.",
    stripLead: "Most real call work is not one-way.",
    stripWin: "Wireline can answer, act, call back, and sync the outcome when the workflow crosses directions.",
    title: "HYBRID AGENTS",
    lead: "Choose hybrid when one workflow needs inbound coverage and outbound persistence: answer, act, follow up, and keep every next step moving.",
    loopLabel: "Wireline hybrid loop",
    outcomes: ["Answers callbacks", "Follows up", "Syncs outcomes"],
  },
};

const planCatalog = Object.fromEntries(STRIPE_PLANS.map((plan) => [plan.id, plan])) as Record<
  StripePlanId,
  (typeof STRIPE_PLANS)[number]
>;

const MODE_CONFIGS: Record<AgentMode, { icon: string; name: string; body: string; plan: string }[]> = {
  outbound: [
    {
      icon: "◉",
      name: "Sales SDR",
      body: "Dials target accounts, opens cleanly, qualifies pain, handles objections, and books the meeting.",
      plan: "Outbound · Sales",
    },
    {
      icon: "◈",
      name: "Billing Recovery",
      body: "Makes compliant reminder calls, offers approved payment paths, documents promises, and routes hardship cases.",
      plan: "Outbound · Collections",
    },
    {
      icon: "◫",
      name: "Re-engagement",
      body: "Calls dormant customers, learns why they left, presents what changed, and books the right return path.",
      plan: "Outbound · Marketing",
    },
  ],
  inbound: [
    {
      icon: "◉",
      name: "Front Desk",
      body: "Answers live calls, captures intent, books the right next step, and keeps the brand calm on the line.",
      plan: "Inbound · Reception",
    },
    {
      icon: "◈",
      name: "Lead Qualifier",
      body: "Turns inbound demand into structured fit notes, routing decisions, and booked handoffs.",
      plan: "Inbound · Revenue",
    },
    {
      icon: "◫",
      name: "Support Triage",
      body: "Handles common questions, verifies context, escalates sensitive issues, and writes a useful ticket summary.",
      plan: "Inbound · Support",
    },
  ],
  hybrid: [
    {
      icon: "◉",
      name: "Revenue Desk",
      body: "Answers buyer callbacks, qualifies intent, books meetings, and makes the follow-up call when momentum stalls.",
      plan: "Hybrid · Sales",
    },
    {
      icon: "◈",
      name: "Collections Desk",
      body: "Answers payment questions, makes reminder calls, logs promises, and escalates disputes or hardship cases.",
      plan: "Hybrid · Recovery",
    },
    {
      icon: "◫",
      name: "Appointment Desk",
      body: "Confirms inbound requests, calls no-shows or pending leads, reschedules, and updates calendars.",
      plan: "Hybrid · Scheduling",
    },
  ],
};

const PLANS = [
  {
    name: "Personal",
    sub: "For one person",
    price: "$0",
    period: "to create",
    body: "Build and train one agent for free. Live negotiation, errands, scheduling, inbound screening, and follow-up draw from prepaid Conversation Balance.",
    features: planCatalog.personal.features,
    cta: "Start with Personal",
    ctaPath: "/signup?plan=personal",
    featured: false,
  },
  {
    name: "Team",
    sub: "For one call lane",
    price: `$${planCatalog.team.price_usd_monthly}`,
    period: "/mo",
    body: "Shared capacity for one focused lane: outbound, inbound, or hybrid call work with approvals and a team inbox.",
    features: planCatalog.team.features,
    cta: "Start Team",
    ctaPath: "/signup?plan=team",
    featured: true,
    badge: "Best next step",
  },
  {
    name: "Business",
    sub: "For call operations",
    price: `$${planCatalog.business.price_usd_monthly}`,
    period: "/mo",
    body: "Multiple agents, numbers, CRM sync, analytics, roles, approvals, and oversight across outbound, inbound, and hybrid lanes.",
    features: planCatalog.business.features,
    cta: "Start Business",
    ctaPath: "/signup?plan=business",
    featured: false,
  },
];

export default function PrecisionLanding() {
  const [mode, setMode] = useState<AgentMode>("outbound");
  const configs = MODE_CONFIGS[mode];
  const modeCopy = MODE_COPY[mode];
  const loop = AGENT_DIRECTION_MODES[mode].loop;

  const selectMode = (key: AgentMode, focusAfterSelect = false) => {
    setMode(key);

    if (focusAfterSelect) {
      window.requestAnimationFrame(() => document.getElementById(getModeTabId(key))?.focus());
    }
  };

  const handleModeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = modes.findIndex(({ key }) => key === mode);
    const lastIndex = modes.length - 1;
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
    selectMode(modes[nextIndex].key, true);
  };

  return (
    <div className="wl-viewport-frame bg-background text-foreground">
      <PrecisionPublicHeader />

      <main id="main-content" className="wl-viewport-scroll pt-16" tabIndex={-1}>
        <section
          className="marketing-hero border-b border-border px-5 py-12 sm:px-8 sm:py-16 lg:px-10 lg:py-20"
          aria-labelledby="wireline-hero-title"
        >
          <div className="wl-public-rail grid items-center gap-9 lg:grid-cols-[1.08fr_.92fr] lg:gap-12">
            <div className="wireline-hero-motion">
              <div
                className="wl-segmented mb-6"
                role="tablist"
                aria-label="Agent call direction"
                onKeyDown={handleModeKeyDown}
              >
                {modes.map(({ key, label }) => {
                  const selected = mode === key;
                  return (
                    <button
                      key={key}
                      id={getModeTabId(key)}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls={getModePanelId(key)}
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

              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5">
                <span className="marketing-live-dot h-1.5 w-1.5 rounded-full" aria-hidden="true" />
                <span className="wl-eyebrow wl-eyebrow--no-rule text-muted-foreground">
                  {AGENT_DIRECTION_MODES[mode].eyebrow}
                </span>
              </div>

              <h1
                id="wireline-hero-title"
                aria-label={modeCopy.title}
                className="wl-display-1 max-w-[10ch] text-[clamp(3.25rem,12vw,7.5rem)] uppercase leading-[.84] tracking-[-.07em] sm:max-w-[9ch] lg:max-w-[10ch]"
              >
                {modeCopy.title.split(" ")[0]} <span className="text-primary">AGENTS</span>
              </h1>

              <p className="wl-lead mt-6 max-w-[42rem]">{modeCopy.lead}</p>

              <p
                id="wireline-mode-note"
                className="mt-3 max-w-[38rem] text-[14px] leading-[1.6] text-muted-foreground"
              >
                {modeCopy.note}
              </p>

              <ol
                className="mt-6 grid max-w-[32rem] grid-cols-4 overflow-hidden rounded-[14px] border border-border bg-card"
                aria-label={modeCopy.loopLabel}
              >
                {loop.map((item, index) => (
                  <li
                    key={item}
                    className="border-r border-border px-2 py-3 text-center last:border-r-0"
                  >
                    <span className="block font-mono text-[10px] font-semibold uppercase tracking-[.12em] text-primary">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="mt-1 block text-[12px] font-semibold text-muted-foreground">
                      {item}
                    </span>
                  </li>
                ))}
              </ol>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  to={modeCopy.ctaPath}
                  className="marketing-btn-primary min-h-12 w-full px-6 py-3 text-[15px] font-semibold sm:w-auto"
                  aria-describedby="wireline-mode-note"
                >
                  {modeCopy.cta}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link
                  to="/showcase"
                  className="marketing-btn-secondary min-h-12 w-full px-6 py-3 text-[15px] font-semibold sm:w-auto"
                >
                  <Phone size={15} aria-hidden="true" />
                  {modeCopy.demo}
                </Link>
              </div>

              <ul className="mt-7 grid gap-2 sm:grid-cols-3" aria-label="Core outcomes">
                {modeCopy.outcomes.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <span className="marketing-proof-chip h-[18px] w-[18px]" aria-hidden="true">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="wireline-hero-motion wireline-hero-motion--delay">
              {modes.map(({ key, label }) => (
                <div
                  key={key}
                  id={getModePanelId(key)}
                  role="tabpanel"
                  aria-labelledby={getModeTabId(key)}
                  aria-label={`${label} agent preview`}
                  hidden={mode !== key}
                >
                  {mode === key ? <LiveCallCard mode={key} /> : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="marketing-ink-panel border-b border-border px-5 py-5 text-center">
          <p
            className="marketing-ink-panel__soft text-[18px]"
            style={{
              fontFamily: "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
            }}
          >
            {modeCopy.stripLead}{" "}
            <span className="text-[var(--wireline-color-text-primary)]">{modeCopy.stripWin}</span>
          </p>
        </div>

        <section className="border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mb-12">
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">
                Call playbooks · {AGENT_DIRECTION_MODES[mode].label.toLowerCase()}
              </p>
              <h2 className="wl-display-2 mt-4">
                {mode === "outbound"
                  ? "Built for outbound volume."
                  : mode === "inbound"
                    ? "Clear coverage when customers call."
                    : "One agent can work both directions."}
              </h2>
              <p className="mt-4 max-w-[560px] text-[16px] leading-[1.6] text-muted-foreground">
                {mode === "outbound"
                  ? "The wedge remains outbound outcomes: qualify, collect, reactivate, survey, renew, schedule, and update the system of record."
                  : mode === "inbound"
                    ? "Inbound roles are first-class when the user wants live coverage, lead qualification, support triage, scheduling, or after-hours routing."
                    : "Hybrid roles are for real operations where inbound callbacks, outbound follow-up, scheduling, collections, and CRM updates happen in the same workflow."}
              </p>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-3">
              {configs.map(({ icon, name, body, plan }) => (
                <div
                  key={name}
                  className="wl-paper group rounded-[16px] p-7 transition-all hover:border-primary/40 hover:shadow-[0_4px_20px_var(--wireline-color-glow-primarySoft)]"
                >
                  <div
                    className="mb-5 grid h-10 w-10 place-items-center rounded-[10px] bg-[var(--wireline-color-action-primary-container)] text-[18px] text-primary"
                    aria-hidden="true"
                  >
                    {icon}
                  </div>
                  <h3 className="wl-display-4 mb-2">{name}</h3>
                  <p className="mb-5 text-[14px] leading-[1.6] text-muted-foreground">{body}</p>
                  <p className="wl-eyebrow wl-eyebrow--no-rule text-muted-foreground">{plan}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-card/40 px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mb-12">
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">How it runs</p>
              <h2 className="wl-display-2 mt-4">{loop.join(". ")}.</h2>
            </div>

            <div className="grid overflow-hidden rounded-[16px] border border-border sm:grid-cols-4 sm:divide-x sm:divide-border">
              {loop.map((title, idx) => (
                <div
                  key={title}
                  className={`wl-wire-step bg-card p-8 transition-colors hover:bg-muted/40 ${
                    idx === loop.length - 1 ? "wl-wire-step--settled" : ""
                  }`}
                >
                  <div className="wl-wire-step__marker mb-7">
                    <span className="wl-wire-step__node" aria-hidden="true" />
                    <span className="font-mono text-[13px] font-bold text-primary">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="wl-display-4 mb-2">{title}</h3>
                  <p className="text-[13px] leading-[1.6] text-muted-foreground">
                    {mode === "outbound" && idx === 0
                      ? "Upload or connect the people to call, with context, source, priority, and compliance posture."
                      : mode === "outbound" && idx === 1
                        ? "Train the opener, objections, escalation rules, approved offers, and success criteria."
                        : mode === "outbound" && idx === 2
                          ? "Wire the number, schedule the cadence, call live, and adapt to the conversation."
                          : mode === "outbound"
                            ? "Write the outcome, update the workspace or CRM, send the recap, and queue the next attempt."
                            : mode === "inbound" && idx === 0
                              ? "Classify the call by intent, urgency, customer type, and the right destination."
                              : mode === "inbound" && idx === 1
                                ? "Answer with brand-safe context, ask the right first question, and keep the caller moving."
                                : mode === "inbound" && idx === 2
                                  ? "Book, answer, route, escalate, or capture the ticket without making the caller repeat themselves."
                                  : mode === "inbound"
                                    ? "Write the summary, route the handoff, and leave a clean record."
                                    : mode === "hybrid" && idx === 0
                                      ? "Pick up live calls or callbacks with the same context used for outbound work."
                                      : mode === "hybrid" && idx === 1
                                        ? "Book, qualify, collect, answer, schedule, or escalate based on the workflow."
                                        : mode === "hybrid" && idx === 2
                                          ? "Call back, chase missing context, retry no-answers, and keep the task alive."
                                          : "Sync transcripts, outcomes, next steps, CRM updates, and owner handoffs."}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mb-12 text-center">
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">Pricing</p>
              <h2 className="wl-display-2 mx-auto mt-4 max-w-[18ch]">
                Start outbound. Add inbound when needed.
              </h2>
              <p className="mx-auto mt-4 max-w-[560px] text-[16px] leading-[1.6] text-muted-foreground">
                Create for free, fund live calls with Conversation Balance, then move into Team or
                Business capacity for outbound, inbound, or hybrid call lanes.
              </p>
            </div>

            <div className="mx-auto grid max-w-[960px] items-stretch gap-5 sm:grid-cols-3">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className={`relative flex flex-col rounded-[14px] p-8 ${
                    plan.featured
                      ? "wl-featured-wire marketing-ink-panel shadow-[var(--wireline-elevation-lg)]"
                      : "wl-paper"
                  }`}
                >
                  {plan.badge && (
                    <div className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 wl-eyebrow wl-eyebrow--no-rule text-primary-foreground">
                      {plan.badge}
                    </div>
                  )}
                  <div className="wl-display-4 mb-1">{plan.name}</div>
                  <div
                    className={`mb-5 text-[12px] ${plan.featured ? "marketing-ink-panel__muted" : "text-muted-foreground"}`}
                  >
                    {plan.sub}
                  </div>
                  <div className="mb-4 flex items-baseline gap-1">
                    <span className="wl-display-2 leading-none">{plan.price}</span>
                    <span
                      className={`text-[14px] ${plan.featured ? "marketing-ink-panel__muted" : "text-muted-foreground"}`}
                    >
                      {plan.period}
                    </span>
                  </div>
                  <p
                    className={`mb-5 min-h-[60px] text-[13px] leading-[1.55] ${plan.featured ? "marketing-ink-panel__soft" : "text-muted-foreground"}`}
                  >
                    {plan.body}
                  </p>
                  <ul className="mb-6 flex flex-1 flex-col gap-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-[13px]">
                        <span
                          aria-hidden="true"
                          className={
                            plan.featured
                              ? "text-[var(--wireline-color-status-success)]"
                              : "text-primary"
                          }
                        >
                          ✓
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={plan.ctaPath}
                    className={`block min-h-11 w-full rounded-lg py-3 text-center text-[13px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                      plan.featured
                        ? "bg-[var(--wireline-color-text-primary)] text-[var(--wireline-color-canvas-default)] hover:opacity-90"
                        : "border border-border hover:border-primary hover:text-primary"
                    }`}
                    aria-label={`${plan.cta} plan`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
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
                <h2 className="wl-display-2 mx-auto max-w-[18ch]">
                  {mode === "outbound" ? (
                    <>
                      Stop staring at lists.
                      <br />
                      Start completing calls.
                    </>
                  ) : mode === "inbound" ? (
                    <>
                      Stop missing demand.
                      <br />
                      Start answering cleanly.
                    </>
                  ) : (
                    <>
                      Stop splitting workflows.
                      <br />
                      Start running the desk.
                    </>
                  )}
                </h2>
                <p className="mx-auto mt-4 max-w-[460px] text-[16px] marketing-ink-panel__soft">
                  {mode === "outbound"
                    ? "Stand up a trained outbound agent for sales, collections, reactivation, surveys, renewals, scheduling, or follow-up."
                    : mode === "inbound"
                      ? "Stand up a trained inbound agent for front desk, lead qualification, support triage, scheduling, or after-hours coverage."
                      : "Stand up a trained hybrid agent that answers callbacks, makes follow-up calls, and keeps every outcome synced."}
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    to={modeCopy.ctaPath}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--wireline-color-text-primary)] px-7 py-3 text-[15px] font-semibold text-[var(--wireline-color-canvas-default)] transition-all hover:-translate-y-px hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-text-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--wireline-color-canvas-default)] sm:w-auto"
                  >
                    {modeCopy.cta}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  <Link
                    to="/showcase"
                    className="flex min-h-12 w-full items-center justify-center px-7 py-3 text-[15px] font-medium marketing-ink-panel__soft transition-colors hover:text-[var(--wireline-color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-text-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--wireline-color-canvas-default)] sm:w-auto"
                  >
                    {modeCopy.demo}
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
