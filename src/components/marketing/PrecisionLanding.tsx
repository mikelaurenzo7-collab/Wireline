import { useState, type KeyboardEvent } from "react";
import { ArrowRight, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import MarketingFooter from "./MarketingFooter";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import TrustSignals from "./TrustSignals";
import RoiCalculator from "./RoiCalculator";
import { BUSINESS_MARKETING_VOICE, MARKETING_VOICE } from "../../lib/product-copy";
import { STRIPE_PLANS, type StripePlanId } from "../../lib/plan-catalog";

// ─── Live call card (hero illustration) ────────────────────────────────────
function LiveCallCard({ variant }: { variant: "personal" | "business" }) {
  const personal = {
    initial: "M",
    name: "Mike's Agent",
    role: "Personal assistant",
    caller: "Unknown · (312) 555-0182",
    lines: [
      { from: "caller", text: "Hi, is this Mike? I'm calling about your car warranty." },
      { from: "agent", text: "Mike isn't available. Can I ask what this is regarding?" },
      { from: "caller", text: "It's about an expiring warranty offer." },
      { from: "agent", text: "Handled. I'll text Mike the summary now." },
    ],
    tags: ["Screened", "Message sent", "Caller logged"],
  };

  const business = {
    initial: "S",
    name: "Sarah — Front Desk",
    role: "Call center agent",
    caller: "Inbound · (630) 555-0198",
    lines: [
      { from: "caller", text: "I'd like to book a service estimate for next week." },
      { from: "agent", text: "Happy to help. Friday at 11:30 works — should I lock it in?" },
      { from: "caller", text: "Yes, Friday is perfect." },
      { from: "agent", text: "Booked. I'll text a confirmation and route the note." },
    ],
    tags: ["Booked Fri 11:30", "SMS sent", "Calendar updated"],
  };

  const data = variant === "personal" ? personal : business;

  return (
    <aside
      className="relative rounded-[20px] border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,.03),_0_8px_32px_rgba(0,0,0,.05)] sm:p-6"
      aria-label={`${data.role} live call preview`}
    >
      {/* Glow */}
      <div
        className="pointer-events-none absolute inset-[-30px] rounded-[40px] opacity-60"
        aria-hidden="true"
        style={{
          background: "radial-gradient(ellipse at 60% 30%, rgba(43,85,72,.07), transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      <div className="relative">
        {/* Header */}
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
              <div className="wl-eyebrow text-primary">{data.role}</div>
              <div className="mt-1 truncate text-[12px] text-muted-foreground">{data.caller}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-border px-3 py-1.5">
            <span
              className="marketing-live-dot h-1.5 w-1.5 animate-[pulse_2s_ease-in-out_infinite] rounded-full"
              aria-hidden="true"
            />
            <span className="font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground">
              Live
            </span>
          </div>
        </div>

        {/* Waveform */}
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-muted px-4 py-3">
          <div className="flex h-6 items-end gap-[2px]" aria-hidden="true">
            {[30, 70, 100, 50, 85, 40, 95, 60].map((h, i) => (
              <div
                key={i}
                className="wireline-wave-bar w-[3px] rounded-sm bg-[var(--wireline-color-status-success)]"
                style={{
                  height: `${h}%`,
                  animation: `waveBar 1.2s ease-in-out infinite`,
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground">
            Answering · transcribing
          </span>
        </div>

        {/* Transcript */}
        <div className="mt-4 flex flex-col gap-2" role="list" aria-label="Example call transcript">
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

        {/* Tags */}
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

// ─── Audience toggle ───────────────────────────────────────────────────────
type Audience = "personal" | "business";

const audiences: { key: Audience; label: string }[] = [
  { key: "personal", label: "Personal" },
  { key: "business", label: "Business" },
];

function getAudienceTabId(key: Audience) {
  return `wireline-${key}-audience-tab`;
}

function getAudiencePanelId(key: Audience) {
  return `wireline-${key}-audience-panel`;
}

const HERO_AUDIENCE_COPY: Record<
  Audience,
  { cta: string; ctaPath: string; demo: string; note: string; stripLead: string; stripWin: string }
> = {
  personal: {
    cta: "Wire personal agent",
    ctaPath: "/signup?plan=personal",
    demo: "Hear a personal call",
    note: "For unknown callers, appointments, errands, reminders, and side-hustle intake.",
    stripLead: "Missed calls become missed context.",
    stripWin: MARKETING_VOICE.differentiator,
  },
  business: {
    cta: "Wire business agent",
    ctaPath: "/signup?plan=business",
    demo: "Hear a front desk call",
    note: "For call centers, sales teams, booking lines, support queues, and after-hours coverage.",
    stripLead: BUSINESS_MARKETING_VOICE.beforeStrip,
    stripWin: BUSINESS_MARKETING_VOICE.differentiator,
  },
};

const HERO_OUTCOMES = ["Answers live", "Routes the handoff", "Texts the recap"] as const;

const planCatalog = Object.fromEntries(STRIPE_PLANS.map((plan) => [plan.id, plan])) as Record<
  StripePlanId,
  (typeof STRIPE_PLANS)[number]
>;

// ─── What it does cards ────────────────────────────────────────────────────
const PERSONAL_CONFIGS = [
  {
    icon: "◉",
    name: "Gatekeeper",
    body: "Screens unknowns, asks intent, patches through only when needed, and texts the recap.",
    plan: "Personal · Day one",
  },
  {
    icon: "◈",
    name: "Scheduler",
    body: "Books, reschedules, confirms, and waits on hold with the services you already call.",
    plan: "Personal · Live outbound",
  },
  {
    icon: "◫",
    name: "Operator",
    body: "Turns a side hustle into a front desk: quotes, intake, follow-up, and handoff.",
    plan: "Team · Drafting board",
  },
];

const BUSINESS_CONFIGS = [
  {
    icon: "◉",
    name: "Front Desk",
    body: "Answers every call, books appointments, qualifies leads, and texts the outcome.",
    plan: "Business · Always on",
  },
  {
    icon: "◈",
    name: "Sales Floor",
    body: "Qualifies inbound demand, follows up fast, and hands hot opportunities to the right rep.",
    plan: "Business · Outbound + CRM",
  },
  {
    icon: "◫",
    name: "Support Line",
    body: "Handles common questions, books service calls, and escalates urgent issues cleanly.",
    plan: "Business · Full workflows",
  },
];

// ─── How it works steps ────────────────────────────────────────────────────
const STEPS = [
  {
    num: "01",
    title: "Connect",
    body: "Keep your number or provision a business line. Wireline becomes the trained layer on top.",
  },
  {
    num: "02",
    title: "Build",
    body: "Name it, pick a voice, define the job, and start from a personal or business playbook.",
  },
  {
    num: "03",
    title: "Train",
    body: "Feed scripts, FAQs, limits, and handoff rules. Test the call before it goes live.",
  },
  {
    num: "04",
    title: "Deploy",
    body: "Read transcripts, coach weak spots, and keep improving the line after every call.",
  },
];

// ─── Pricing ───────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: "Personal",
    sub: "For one person",
    price: "$0",
    period: "to create",
    body: "Build and train one agent for free. When it starts answering real calls, texts, or follow-up, live work draws from prepaid Conversation Balance.",
    features: planCatalog.personal.features,
    cta: "Start with Personal",
    ctaPath: "/signup?plan=personal",
    featured: false,
  },
  {
    name: "Team",
    sub: "For a small team",
    price: `$${planCatalog.team.price_usd_monthly}`,
    period: "/mo",
    body: "Several agents, connected numbers, shared inbox control, routing, and approvals for a team that needs one clean operating surface.",
    features: planCatalog.team.features,
    cta: "Start Team",
    ctaPath: "/signup?plan=team",
    featured: true,
    badge: "Best next step",
  },
  {
    name: "Business",
    sub: "Best operating tier",
    price: `$${planCatalog.business.price_usd_monthly}`,
    period: "/mo",
    body: "The serious business tier: more agents, more lines, CRM sync, analytics, roles, and approvals across inbound, outbound, and follow-up.",
    features: planCatalog.business.features,
    cta: "Start Business",
    ctaPath: "/signup?plan=business",
    featured: false,
  },
];

// ─── Main component ────────────────────────────────────────────────────────
export default function PrecisionLanding() {
  const [audience, setAudience] = useState<Audience>("personal");
  const configs = audience === "personal" ? PERSONAL_CONFIGS : BUSINESS_CONFIGS;
  const heroCopy = HERO_AUDIENCE_COPY[audience];

  const selectAudience = (key: Audience, focusAfterSelect = false) => {
    setAudience(key);

    if (focusAfterSelect) {
      window.requestAnimationFrame(() => document.getElementById(getAudienceTabId(key))?.focus());
    }
  };

  const handleAudienceKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = audiences.findIndex(({ key }) => key === audience);
    const lastIndex = audiences.length - 1;
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
    selectAudience(audiences[nextIndex].key, true);
  };

  return (
    <div className="wl-viewport-frame bg-background text-foreground">
      <PrecisionPublicHeader />

      <style>{`
        @keyframes waveBar { 0%,100% { transform: scaleY(.3) } 50% { transform: scaleY(1) } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:none } }
        @media (prefers-reduced-motion: reduce) {
          .wireline-hero-motion,
          .wireline-wave-bar { animation: none !important; transform: none !important; }
        }
      `}</style>

      <main id="main-content" className="wl-viewport-scroll pt-16" tabIndex={-1}>
        {/* ── HERO ──────────────────────────────────────────────── */}
        <section
          className="marketing-hero border-b border-border px-5 py-12 sm:px-8 sm:py-16 lg:px-10 lg:py-20"
          aria-labelledby="wireline-hero-title"
        >
          <div className="wl-public-rail grid items-center gap-10 lg:grid-cols-[1.12fr_.88fr] lg:gap-12">
            {/* Left copy */}
            <div className="wireline-hero-motion" style={{ animation: "fadeUp .7s ease-out both" }}>
              <div
                className="mb-6 inline-flex rounded-lg border border-border bg-card p-1 shadow-[var(--wireline-elevation-xs)]"
                role="tablist"
                aria-label="Audience mode"
                onKeyDown={handleAudienceKeyDown}
              >
                {audiences.map(({ key, label }) => {
                  const selected = audience === key;
                  return (
                    <button
                      key={key}
                      id={getAudienceTabId(key)}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls={getAudiencePanelId(key)}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => selectAudience(key)}
                      className={`min-h-10 rounded-md px-4 text-[13px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:px-5 ${
                        selected
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5">
                <span className="marketing-live-dot h-1.5 w-1.5 rounded-full" aria-hidden="true" />
                <span className="wl-eyebrow text-muted-foreground">
                  {audience === "business"
                    ? BUSINESS_MARKETING_VOICE.eyebrow
                    : MARKETING_VOICE.eyebrow}
                </span>
              </div>

              <h1
                id="wireline-hero-title"
                aria-label={MARKETING_VOICE.headline}
                className="wl-display-1 max-w-[10ch] text-[clamp(3.25rem,12vw,7.5rem)] uppercase leading-[.84] tracking-[-.07em] sm:max-w-[9ch] lg:max-w-[10ch]"
              >
                WIRE YOUR <span className="text-primary">AGENT</span>
              </h1>

              <p className="wl-lead mt-6 max-w-[42rem]">{MARKETING_VOICE.subline}</p>

              <p
                id="wireline-audience-note"
                className="mt-3 max-w-[38rem] text-[14px] leading-[1.6] text-muted-foreground"
              >
                {heroCopy.note}
              </p>

              <ul className="mt-6 flex flex-wrap gap-2" aria-label="Designed for">
                {MARKETING_VOICE.proof.map((item) => (
                  <li
                    key={item}
                    className="rounded-full border border-border bg-card px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground"
                  >
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  to={heroCopy.ctaPath}
                  className="marketing-btn-primary min-h-12 w-full px-6 py-3 text-[15px] font-semibold sm:w-auto"
                  aria-describedby="wireline-audience-note"
                >
                  {heroCopy.cta}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link
                  to="/showcase"
                  className="marketing-btn-secondary min-h-12 w-full px-6 py-3 text-[15px] font-semibold sm:w-auto"
                >
                  <Phone size={15} aria-hidden="true" />
                  {heroCopy.demo}
                </Link>
              </div>

              <ul className="mt-7 grid gap-2 sm:grid-cols-3" aria-label="Core outcomes">
                {HERO_OUTCOMES.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 text-[13px] text-muted-foreground"
                  >
                    <span className="marketing-proof-chip h-[18px] w-[18px]" aria-hidden="true">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: live call card */}
            <div
              className="wireline-hero-motion"
              style={{ animation: "fadeUp .7s ease-out .15s both" }}
            >
              {audiences.map(({ key, label }) => (
                <div
                  key={key}
                  id={getAudiencePanelId(key)}
                  role="tabpanel"
                  aria-labelledby={getAudienceTabId(key)}
                  aria-label={`${label} agent preview`}
                  hidden={audience !== key}
                >
                  {audience === key ? <LiveCallCard variant={key} /> : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── DIFFERENTIATOR STRIP ──────────────────────────────── */}
        <div className="marketing-ink-panel border-b border-border px-5 py-5 text-center">
          <p
            className="marketing-ink-panel__soft text-[18px]"
            style={{
              fontFamily: "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
            }}
          >
            {heroCopy.stripLead}{" "}
            <span className="text-[var(--wireline-color-text-primary)]">{heroCopy.stripWin}</span>
          </p>
        </div>

        {/* ── WHAT IT DOES ──────────────────────────────────────── */}
        <section className="border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mb-12">
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">
                Agent playbooks · {audience === "personal" ? "personal" : "business"}
              </p>
              <h2 className="wl-display-2 mt-4">
                {audience === "personal"
                  ? "Configure it for real life."
                  : "Built for real call volume."}
              </h2>
              <p className="mt-4 max-w-[560px] text-[16px] leading-[1.6] text-muted-foreground">
                {audience === "personal"
                  ? "One agent. Your rules. Personal errands, unknown callers, appointments, and side-hustle intake all run from the same playbook."
                  : "From solo operators to multi-location teams, Wireline agents keep the phones moving while your team handles the work."}
              </p>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-3">
              {configs.map(({ icon, name, body, plan }) => (
                <div
                  key={name}
                  className="group rounded-[16px] border border-border bg-card p-7 transition-all hover:border-primary/40 hover:shadow-[0_4px_20px_rgba(43,85,72,.06)]"
                >
                  <div
                    className="mb-5 grid h-10 w-10 place-items-center rounded-[10px] bg-[var(--wireline-color-action-primary-container)] text-[18px] text-primary"
                    aria-hidden="true"
                  >
                    {icon}
                  </div>
                  <h3 className="wl-display-4 mb-2">{name}</h3>
                  <p className="mb-5 text-[14px] leading-[1.6] text-muted-foreground">{body}</p>
                  <p className="wl-eyebrow text-muted-foreground">{plan}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ──────────────────────────────────────── */}
        <section className="border-b border-border bg-card/40 px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mb-12">
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">How it works</p>
              <h2 className="wl-display-2 mt-4">Live before lunch.</h2>
            </div>

            <div className="grid overflow-hidden rounded-[16px] border border-border sm:grid-cols-4 sm:divide-x sm:divide-border">
              {STEPS.map(({ num, title, body }, idx) => (
                <div
                  key={num}
                  className={`wl-wire-step bg-card p-8 transition-colors hover:bg-muted/40 ${
                    idx === STEPS.length - 1 ? "wl-wire-step--settled" : ""
                  }`}
                >
                  <div className="wl-wire-step__marker mb-7">
                    <span className="wl-wire-step__node" aria-hidden="true" />
                    <span className="font-mono text-[13px] font-bold text-primary">{num}</span>
                  </div>
                  <h3 className="wl-display-4 mb-2">{title}</h3>
                  <p className="text-[13px] leading-[1.6] text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PRICING ───────────────────────────────────────────── */}
        <section className="border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mb-12 text-center">
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">Pricing</p>
              <h2 className="wl-display-2 mx-auto mt-4 max-w-[18ch]">
                Start wiring. Scale the line.
              </h2>
              <p className="mx-auto mt-4 max-w-[560px] text-[16px] leading-[1.6] text-muted-foreground">
                Create for free, fund live work with Conversation Balance, then move into Team or
                Business capacity when Wireline becomes an operating lane.
              </p>
            </div>

            <div className="mx-auto grid max-w-[960px] items-start gap-5 sm:grid-cols-3">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className={`relative rounded-[14px] p-8 ${
                    plan.featured
                      ? "wl-featured-wire marketing-ink-panel shadow-[var(--wireline-elevation-lg)]"
                      : "border border-border bg-card"
                  }`}
                >
                  {plan.badge && (
                    <div className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 wl-eyebrow text-primary-foreground">
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
                  <ul className="mb-6 flex flex-col gap-2">
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

        {/* ── ROI CALCULATOR ──────────────────────────────────────── */}
        <section className="px-5 py-4 sm:px-8 lg:px-10">
          <div className="wl-public-rail">
            <RoiCalculator />
          </div>
        </section>

        {/* ── FINAL CTA ─────────────────────────────────────────── */}
        <section className="px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="wl-featured-wire wl-featured-wire--live relative overflow-hidden rounded-[20px] marketing-ink-panel px-6 py-14 text-center sm:px-10 sm:py-20">
              <div
                className="pointer-events-none absolute inset-0"
                aria-hidden="true"
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 0%, rgba(43,85,72,.2), transparent 60%)",
                }}
              />
              <div className="relative">
                <h2 className="wl-display-2 mx-auto max-w-[18ch]">
                  {audience === "business" ? (
                    <>
                      Stop missing calls.
                      <br />
                      Start booking them.
                    </>
                  ) : (
                    <>
                      Stop ignoring calls.
                      <br />
                      Start delegating them.
                    </>
                  )}
                </h2>
                <p className="mx-auto mt-4 max-w-[460px] text-[16px] marketing-ink-panel__soft">
                  {audience === "business"
                    ? "Stand up a front desk in an afternoon. Fund live calls with Conversation Balance."
                    : "Create first. Train the call. Fund live work when the line is ready."}
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    to={heroCopy.ctaPath}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--wireline-color-text-primary)] px-7 py-3 text-[15px] font-semibold text-[var(--wireline-color-canvas-default)] transition-all hover:-translate-y-px hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-text-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--wireline-color-canvas-default)] sm:w-auto"
                  >
                    {heroCopy.cta}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  <Link
                    to="/showcase"
                    className="flex min-h-12 w-full items-center justify-center px-7 py-3 text-[15px] font-medium marketing-ink-panel__soft transition-colors hover:text-[var(--wireline-color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-text-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--wireline-color-canvas-default)] sm:w-auto"
                  >
                    {heroCopy.demo}
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
