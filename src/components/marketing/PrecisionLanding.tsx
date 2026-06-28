import { useState } from "react";
import { ArrowRight, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import MarketingFooter from "./MarketingFooter";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import { MARKETING_VOICE } from "../../lib/product-copy";
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
      { from: "agent", text: "Got it. I'll let him know. Thanks for calling." },
    ],
    tags: ["✓ Handled", "✓ Message sent to Mike", "✓ Caller logged"],
  };

  const business = {
    initial: "S",
    name: "Sarah — Front Desk",
    role: "Business assistant",
    caller: "Inbound · (630) 555-0198",
    lines: [
      { from: "caller", text: "I'd like to book a service estimate for next week." },
      { from: "agent", text: "Happy to help! Friday at 11:30 works — should I lock it in?" },
      { from: "caller", text: "Yes, Friday is perfect." },
      { from: "agent", text: "Booked. I'll text a confirmation now." },
    ],
    tags: ["✓ Booked Fri 11:30", "✓ SMS sent", "✓ Calendar updated"],
  };

  const data = variant === "personal" ? personal : business;

  return (
    <div className="relative rounded-[20px] border border-border bg-card p-6 shadow-[0_1px_3px_rgba(0,0,0,.03),_0_8px_32px_rgba(0,0,0,.05)]">
      {/* Glow */}
      <div
        className="pointer-events-none absolute inset-[-30px] rounded-[40px] opacity-60"
        style={{
          background: "radial-gradient(ellipse at 60% 30%, rgba(43,85,72,.07), transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-primary font-mono text-[12px] font-bold text-primary-foreground">
              {data.initial}
            </div>
            <div>
              <div className="text-[14px] font-semibold">{data.name}</div>
              <div className="font-mono text-[10px] uppercase tracking-[.12em] text-primary">
                On a call
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5">
            <span className="h-1.5 w-1.5 animate-[pulse_2s_ease-in-out_infinite] rounded-full bg-[#3D9B73]" />
            <span className="font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground">
              Live
            </span>
          </div>
        </div>

        {/* Waveform */}
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-muted px-4 py-3">
          <div className="flex h-6 items-end gap-[2px]">
            {[30, 70, 100, 50, 85, 40, 95, 60].map((h, i) => (
              <div
                key={i}
                className="w-[3px] rounded-sm bg-[#3D9B73]"
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
        <div className="mt-4 flex flex-col gap-2">
          {data.lines.map((line, i) => (
            <div
              key={i}
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
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[#EEF5F1] px-[10px] py-[5px] text-[11px] font-medium text-primary"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Audience toggle ───────────────────────────────────────────────────────
type Audience = "personal" | "business";

const audiences: { key: Audience; label: string }[] = [
  { key: "personal", label: "Personal" },
  { key: "business", label: "Business" },
];

const planCatalog = Object.fromEntries(STRIPE_PLANS.map((plan) => [plan.id, plan])) as Record<
  StripePlanId,
  (typeof STRIPE_PLANS)[number]
>;

const teamExtraAgentPrice = planCatalog.team.extra_agent_price_usd ?? 9;
const businessExtraAgentPrice = planCatalog.business.extra_agent_price_usd ?? 12;

// ─── What it does cards ────────────────────────────────────────────────────
const PERSONAL_CONFIGS = [
  {
    icon: "◉",
    name: "The Gatekeeper",
    body: "Answers unknowns with a real voice. Asks who's calling and why. Takes a detailed message or patches them through — then texts you the play-by-play.",
    plan: "Personal · Day one",
  },
  {
    icon: "◈",
    name: "The Scheduler",
    body: "Books appointments, handles reschedules, texts reminders. Calls your dentist, pharmacy, or landlord so you don't have to sit on hold.",
    plan: "Personal · Live outbound",
  },
  {
    icon: "◫",
    name: "The Operator",
    body: "Your side hustle answering itself. Takes orders, quotes rates, qualifies leads, sends follow-up texts. You build the playbook — it runs it.",
    plan: "Team · Drafting board",
  },
];

const BUSINESS_CONFIGS = [
  {
    icon: "◉",
    name: "Front Desk",
    body: "A live voice agent that answers every call, books appointments, qualifies leads, and texts the outcome — no hold music, no missed opportunities.",
    plan: "Business · Always on",
  },
  {
    icon: "◈",
    name: "Sales Floor",
    body: "Agents that qualify inbound leads, follow up with prospects, and hand off hot opportunities — at the exact moment they're ready.",
    plan: "Business · Outbound + CRM",
  },
  {
    icon: "◫",
    name: "Support Line",
    body: "Handle common questions, book service calls, escalate urgent issues. Your team only picks up when it actually matters.",
    plan: "Business · Full workflows",
  },
];

// ─── How it works steps ────────────────────────────────────────────────────
const STEPS = [
  {
    num: "01",
    title: "Connect",
    body: "Keep your number. Wireline hooks in via the app, Shortcuts, and CarPlay — or provision a dedicated business line.",
  },
  {
    num: "02",
    title: "Build",
    body: "Name it, pick a voice, tell it the job. Chat with Wireline AI to shape the agent — or start from a template.",
  },
  {
    num: "03",
    title: "Train",
    body: "Feed it scripts, FAQs, and hard limits. Run a test call from your browser — hear exactly what callers hear.",
  },
  {
    num: "04",
    title: "Deploy",
    body: "Go live. Read every transcript. Coach the weak spots. Your agent learns from every conversation.",
  },
];

// ─── Pricing ───────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: "Personal",
    sub: "Create first, fund live work",
    price: "$0",
    period: "to create",
    body: "Build and train one agent before billing. Calls, texts, and follow-up draw from Conversation Balance only when live work starts.",
    features: [
      `${planCatalog.personal.max_agents} active agent`,
      `${planCatalog.personal.included_phone_numbers} phone line`,
      "All templates unlocked",
      "Conversation Balance for live work",
    ],
    cta: "Start with Personal",
    featured: false,
  },
  {
    name: "Team",
    sub: "Shared capacity for small teams",
    price: `$${planCatalog.team.price_usd_monthly}`,
    period: "/mo",
    body: "Several agents, shared inbox control, routing, approvals, and connected numbers for a focused team lane.",
    features: [
      `${planCatalog.team.max_agents} active agents`,
      `${planCatalog.team.included_phone_numbers} phone lines`,
      "Routing, approvals, and inbox",
      "Core integrations and follow-up",
      `Extra agents at $${teamExtraAgentPrice}/mo`,
    ],
    cta: "Start Team",
    featured: true,
    badge: "Best next step",
  },
  {
    name: "Business",
    sub: "Revenue and support operations",
    price: `$${planCatalog.business.price_usd_monthly}`,
    period: "/mo",
    body: "A deeper operating layer for inbound, outbound, approvals, analytics, CRM sync, and role-aware controls.",
    features: [
      `${planCatalog.business.max_agents} active agents`,
      `${planCatalog.business.included_phone_numbers} phone lines`,
      "CRM sync and analytics",
      "Policies, roles, and approvals",
      `Extra agents at $${businessExtraAgentPrice}/mo`,
    ],
    cta: "Start Business",
    featured: false,
  },
];

// ─── Main component ────────────────────────────────────────────────────────
export default function PrecisionLanding() {
  const [audience, setAudience] = useState<Audience>("personal");
  const configs = audience === "personal" ? PERSONAL_CONFIGS : BUSINESS_CONFIGS;
  const personalHeadline = MARKETING_VOICE.headline;

  return (
    <div className="wl-viewport-frame bg-background text-foreground">
      <PrecisionPublicHeader />

      <style>{`
        @keyframes waveBar { 0%,100% { transform: scaleY(.3) } 50% { transform: scaleY(1) } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:none } }
      `}</style>

      <main id="main-content" className="wl-viewport-scroll pt-16" tabIndex={-1}>
        {/* ── HERO ──────────────────────────────────────────────── */}
        <section className="border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail grid items-center gap-12 lg:grid-cols-[1.15fr_.85fr]">
            {/* Left copy */}
            <div style={{ animation: "fadeUp .7s ease-out both" }}>
              {/* Audience toggle */}
              <div className="mb-8 inline-flex rounded-lg border border-border bg-card p-1">
                {audiences.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAudience(key)}
                    className={`rounded-md px-5 py-2 text-[13px] font-semibold transition-all ${
                      audience === key
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {audience === "personal" ? (
                <>
                  <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#3D9B73]" />
                    <span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                      {MARKETING_VOICE.eyebrow}
                    </span>
                  </div>
                  <h1
                    aria-label={personalHeadline}
                    className="wl-public-section-heading max-w-none text-[clamp(52px,6vw,72px)] leading-[.95]"
                    style={{
                      fontFamily:
                        "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                      fontWeight: 400,
                      letterSpacing: "-0.035em",
                    }}
                  >
                    Your phone, <em className="not-italic text-primary">finally</em> answering for
                    you.
                  </h1>
                  <p className="wl-public-copy mt-6 max-w-none text-[17px] leading-[1.7]">
                    {MARKETING_VOICE.subline}
                  </p>
                </>
              ) : (
                <>
                  <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#3D9B73]" />
                    <span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                      For business · v1 in beta
                    </span>
                  </div>
                  <h1
                    className="wl-public-section-heading max-w-none text-[clamp(52px,6vw,72px)] leading-[.95]"
                    style={{
                      fontFamily:
                        "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                      fontWeight: 400,
                      letterSpacing: "-0.035em",
                    }}
                  >
                    Your front desk, <em className="not-italic text-primary">open</em> 24/7.
                  </h1>
                  <p className="wl-public-copy mt-6 max-w-none text-[17px] leading-[1.7]">
                    Deploy a fleet of trained voice agents that answer calls, qualify leads, book
                    appointments, and follow up — all under your brand, on your playbook.
                  </p>
                </>
              )}

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  to="/signup"
                  className="marketing-btn-primary flex min-h-11 items-center gap-2 px-6 py-3 text-[15px] font-semibold"
                >
                  Start with Personal <ArrowRight size={16} />
                </Link>
                <button
                  type="button"
                  className="flex min-h-11 items-center gap-2 rounded-[10px] border border-border bg-card px-6 py-3 text-[15px] font-medium text-foreground transition-all hover:border-border/80"
                >
                  <Phone size={15} /> Hear it answer a call
                </button>
              </div>

              <div className="mt-8 flex flex-wrap gap-6">
                {MARKETING_VOICE.proof.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 text-[13px] text-muted-foreground"
                  >
                    <div className="grid h-[18px] w-[18px] place-items-center rounded-full bg-[#EEF5F1] text-[10px] font-bold text-primary">
                      ✓
                    </div>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: live call card */}
            <div style={{ animation: "fadeUp .7s ease-out .15s both" }}>
              <LiveCallCard variant={audience} />
            </div>
          </div>
        </section>

        {/* ── DIFFERENTIATOR STRIP ──────────────────────────────── */}
        <div className="border-b border-border bg-[#1C1C1A] px-5 py-5 text-center">
          <p
            className="text-[18px] text-[rgba(247,246,243,.7)]"
            style={{
              fontFamily: "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
            }}
          >
            Siri silences unknowns.{" "}
            <span className="text-[#F7F6F3]">{MARKETING_VOICE.differentiator}</span>
          </p>
        </div>

        {/* ── WHAT IT DOES ──────────────────────────────────────── */}
        <section className="border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mb-12">
              <p className="font-mono text-[11px] uppercase tracking-[.14em] text-primary">
                02 — {audience === "personal" ? "Configurations" : "Use cases"}
              </p>
              <h2
                className="mt-4 text-[clamp(34px,4vw,46px)] leading-[1.05]"
                style={{
                  fontFamily:
                    "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                  fontWeight: 400,
                  letterSpacing: "-0.025em",
                }}
              >
                {audience === "personal"
                  ? "Configure it for your life."
                  : "Built for real business volume."}
              </h2>
              <p className="mt-4 max-w-[560px] text-[16px] leading-[1.6] text-muted-foreground">
                {audience === "personal"
                  ? "One agent. Configure it however you need — personal errands, side hustle, or a full front desk. The playbook is yours."
                  : "From solo operators to multi-location teams — Wireline agents handle the phones while your team handles the work."}
              </p>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-3">
              {configs.map(({ icon, name, body, plan }) => (
                <div
                  key={name}
                  className="group rounded-[16px] border border-border bg-card p-7 transition-all hover:border-primary/40 hover:shadow-[0_4px_20px_rgba(43,85,72,.06)]"
                >
                  <div className="mb-5 grid h-10 w-10 place-items-center rounded-[10px] bg-[#EEF5F1] text-[18px] text-primary">
                    {icon}
                  </div>
                  <h3
                    className="mb-2 text-[22px] leading-tight"
                    style={{
                      fontFamily:
                        "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                      fontWeight: 400,
                      letterSpacing: "-0.015em",
                    }}
                  >
                    {name}
                  </h3>
                  <p className="mb-5 text-[14px] leading-[1.6] text-muted-foreground">{body}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground/60">
                    {plan}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ──────────────────────────────────────── */}
        <section className="border-b border-border bg-card/40 px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mb-12">
              <p className="font-mono text-[11px] uppercase tracking-[.14em] text-primary">
                03 — Four steps
              </p>
              <h2
                className="mt-4 text-[clamp(34px,4vw,46px)] leading-[1.05]"
                style={{
                  fontFamily:
                    "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                  fontWeight: 400,
                  letterSpacing: "-0.025em",
                }}
              >
                Live before lunch.
              </h2>
            </div>

            <div className="grid divide-x divide-border overflow-hidden rounded-[16px] border border-border sm:grid-cols-4">
              {STEPS.map(({ num, title, body }) => (
                <div key={num} className="bg-card p-8 transition-colors hover:bg-muted/40">
                  <div className="mb-7 font-mono text-[13px] font-bold text-primary">{num}</div>
                  <h3
                    className="mb-2 text-[22px]"
                    style={{
                      fontFamily:
                        "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                      fontWeight: 400,
                      letterSpacing: "-0.015em",
                    }}
                  >
                    {title}
                  </h3>
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
              <p className="font-mono text-[11px] uppercase tracking-[.14em] text-primary">
                Pricing
              </p>
              <h2
                className="mx-auto mt-4 max-w-[18ch] text-[clamp(34px,4vw,46px)] leading-[1.05]"
                style={{
                  fontFamily:
                    "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                  fontWeight: 400,
                  letterSpacing: "-0.025em",
                }}
              >
                Personal balance. Team capacity.
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
                      ? "bg-[#1C1C1A] text-[#F7F6F3] shadow-[0_4px_24px_rgba(0,0,0,.12)]"
                      : "border border-border bg-card"
                  }`}
                >
                  {plan.badge && (
                    <div className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 font-mono text-[10px] uppercase tracking-[.12em] text-primary-foreground">
                      {plan.badge}
                    </div>
                  )}
                  <div
                    className="mb-1 text-[24px]"
                    style={{
                      fontFamily:
                        "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                      fontWeight: 400,
                    }}
                  >
                    {plan.name}
                  </div>
                  <div
                    className={`mb-5 text-[12px] ${plan.featured ? "text-[rgba(247,246,243,.4)]" : "text-muted-foreground"}`}
                  >
                    {plan.sub}
                  </div>
                  <div className="mb-4 flex items-baseline gap-1">
                    <span
                      className="text-[44px] leading-none tracking-[-0.03em]"
                      style={{
                        fontFamily:
                          "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                      }}
                    >
                      {plan.price}
                    </span>
                    <span
                      className={`text-[14px] ${plan.featured ? "text-[rgba(247,246,243,.4)]" : "text-muted-foreground"}`}
                    >
                      {plan.period}
                    </span>
                  </div>
                  <p
                    className={`mb-5 min-h-[60px] text-[13px] leading-[1.55] ${plan.featured ? "text-[rgba(247,246,243,.5)]" : "text-muted-foreground"}`}
                  >
                    {plan.body}
                  </p>
                  <div className="mb-6 flex flex-col gap-2">
                    {plan.features.map((f) => (
                      <div key={f} className="flex items-center gap-2 text-[13px]">
                        <span className={plan.featured ? "text-[#3D9B73]" : "text-primary"}>✓</span>
                        {f}
                      </div>
                    ))}
                  </div>
                  <Link
                    to="/signup"
                    className={`block min-h-11 w-full rounded-lg py-3 text-center text-[13px] font-semibold transition-all ${
                      plan.featured
                        ? "bg-white text-[#1C1C1A] hover:bg-[#F7F6F3]"
                        : "border border-border hover:border-primary hover:text-primary"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ─────────────────────────────────────────── */}
        <section className="px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="relative overflow-hidden rounded-[20px] bg-[#1C1C1A] px-10 py-18 text-center text-[#F7F6F3] sm:py-20">
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 0%, rgba(43,85,72,.2), transparent 60%)",
                }}
              />
              <div className="relative">
                <h2
                  className="mx-auto max-w-[18ch] text-[clamp(34px,4.5vw,50px)] leading-[1.05]"
                  style={{
                    fontFamily:
                      "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                    fontWeight: 400,
                    letterSpacing: "-0.03em",
                  }}
                >
                  Stop ignoring calls.
                  <br />
                  Start delegating them.
                </h2>
                <p className="mx-auto mt-4 max-w-[420px] text-[16px] text-[rgba(247,246,243,.55)]">
                  Create first. Fund live work when the line is ready.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    to="/signup"
                    className="flex min-h-11 items-center gap-2 rounded-[10px] bg-[#F7F6F3] px-7 py-3 text-[15px] font-semibold text-[#1C1C1A] transition-all hover:bg-white hover:-translate-y-px"
                  >
                    Start with Personal <ArrowRight size={16} />
                  </Link>
                  <button
                    type="button"
                    className="min-h-11 px-7 py-3 text-[15px] font-medium text-[rgba(247,246,243,.7)] transition-colors hover:text-[#F7F6F3]"
                  >
                    Hear it answer a call
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
