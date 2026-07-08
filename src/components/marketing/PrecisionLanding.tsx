import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { ArrowRight, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import MarketingFooter from "./MarketingFooter";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import TrustSignals from "./TrustSignals";
import RoiCalculator from "./RoiCalculator";
import { BUSINESS_MARKETING_VOICE, MARKETING_VOICE, OUTBOUND_WEDGE } from "../../lib/product-copy";
import { STRIPE_PLANS, type StripePlanId } from "../../lib/plan-catalog";

function LiveCallCard({ variant }: { variant: "personal" | "business" }) {
  const personal = {
    initial: "M",
    name: "Mike's Negotiator",
    role: "Outbound negotiation agent",
    caller: "Outbound · Wireless provider",
    lines: [
      { from: "agent", text: "Hi, I'm calling on behalf of Mike about his current plan and recent bill." },
      { from: "caller", text: "I can take a look. What seems off?" },
      { from: "agent", text: "The rate increased after promotion expiry. Can retention match the prior rate or apply a loyalty offer?" },
      { from: "caller", text: "I can add a 12-month loyalty credit and remove the extra line fee." },
    ],
    tags: ["Negotiated", "$28/mo saved", "Reference logged"],
  };

  const business = {
    initial: "W",
    name: "Wireline — Outbound Desk",
    role: "Outbound sales agent",
    caller: "Outbound · Acme Cloud",
    lines: [
      { from: "agent", text: "Hi Jordan, this is Wireline. I saw your team is hiring SDRs and thought this might be timely." },
      { from: "caller", text: "What is this about?" },
      { from: "agent", text: "Outbound call agents that qualify lists, handle objections, book meetings, and log outcomes. Is outbound capacity a priority this quarter?" },
      { from: "caller", text: "Yes. Send details and book something with our revenue ops lead." },
    ],
    tags: ["Qualified", "Meeting booked", "CRM updated"],
  };

  const data = variant === "personal" ? personal : business;

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
              Dialing
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
            Calling · transcribing
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-2" role="list" aria-label="Example outbound call transcript">
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

type Audience = "personal" | "business";

const audiences: { key: Audience; label: string }[] = [
  { key: "personal", label: "Personal" },
  { key: "business", label: "Outbound" },
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
    cta: "Wire negotiator",
    ctaPath: "/signup?plan=personal",
    demo: "Hear negotiation call",
    note: "For bill negotiation, appointment booking, errands, follow-up, vendor calls, and personal admin.",
    stripLead: "Personal admin still needs somebody to call.",
    stripWin: "Wireline dials, waits, negotiates, confirms, and reports back.",
  },
  business: {
    cta: "Wire outbound agent",
    ctaPath: "/signup?plan=business",
    demo: "Hear outbound call",
    note: "For sales teams, marketing re-engagement, billing recovery, customer surveys, renewals, and appointment campaigns.",
    stripLead: OUTBOUND_WEDGE.beforeStrip,
    stripWin: BUSINESS_MARKETING_VOICE.differentiator,
  },
};

const HERO_OUTCOMES = ["Calls the list", "Handles objections", "Logs outcomes"] as const;

const planCatalog = Object.fromEntries(STRIPE_PLANS.map((plan) => [plan.id, plan])) as Record<
  StripePlanId,
  (typeof STRIPE_PLANS)[number]
>;

const PERSONAL_CONFIGS = [
  {
    icon: "◉",
    name: "Bill Negotiator",
    body: "Calls providers, escalates to retention, disputes charges, confirms new terms, and logs the reference number.",
    plan: "Personal · Negotiation",
  },
  {
    icon: "◈",
    name: "Errand Caller",
    body: "Books, confirms, reschedules, waits on hold, captures details, and reports the next step.",
    plan: "Personal · Outbound admin",
  },
  {
    icon: "◫",
    name: "Follow-up Agent",
    body: "Calls vendors, clinics, service desks, and offices until the answer is captured or the handoff is clear.",
    plan: "Personal · Persistent follow-up",
  },
];

const BUSINESS_CONFIGS = [
  {
    icon: "◉",
    name: "Sales SDR",
    body: "Dials target accounts, opens cleanly, qualifies pain, handles objections, and books the meeting.",
    plan: "Business · Sales outbound",
  },
  {
    icon: "◈",
    name: "Billing Recovery",
    body: "Makes compliant reminder calls, offers approved payment paths, documents promises, and routes hardship cases.",
    plan: "Business · Collections",
  },
  {
    icon: "◫",
    name: "Re-engagement",
    body: "Calls dormant customers, learns why they left, presents what changed, and books the right return path.",
    plan: "Business · Marketing",
  },
];

const STEPS = [
  {
    num: "01",
    title: "List",
    body: "Upload or connect the people to call, with context, source, priority, and consent/compliance posture.",
  },
  {
    num: "02",
    title: "Script",
    body: "Train the opener, objections, escalation rules, approved offers, compliance language, and success criteria.",
  },
  {
    num: "03",
    title: "Dial",
    body: "Wire the number, schedule the cadence, call live, wait through hold, and adapt to the conversation.",
  },
  {
    num: "04",
    title: "Log",
    body: "Write the outcome, update the CRM or workspace, send the recap, and queue the next attempt.",
  },
];

const PLANS = [
  {
    name: "Personal",
    sub: "For one person",
    price: "$0",
    period: "to create",
    body: "Build and train one agent for free. Live negotiation, errands, scheduling, and follow-up draw from prepaid Conversation Balance.",
    features: planCatalog.personal.features,
    cta: "Start with Personal",
    ctaPath: "/signup?plan=personal",
    featured: false,
  },
  {
    name: "Team",
    sub: "For one outbound lane",
    price: `$${planCatalog.team.price_usd_monthly}`,
    period: "/mo",
    body: "Shared outbound capacity for a focused list: sales, reminders, reactivation, surveys, or collections.",
    features: planCatalog.team.features,
    cta: "Start Team",
    ctaPath: "/signup?plan=team",
    featured: true,
    badge: "Best next step",
  },
  {
    name: "Business",
    sub: "For outbound operations",
    price: `$${planCatalog.business.price_usd_monthly}`,
    period: "/mo",
    body: "Multiple agents, numbers, CRM sync, analytics, roles, approvals, and campaign oversight across outbound lanes.",
    features: planCatalog.business.features,
    cta: "Start Business",
    ctaPath: "/signup?plan=business",
    featured: false,
  },
];

export default function PrecisionLanding() {
  const [audience, setAudience] = useState<Audience>("business");
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
                      data-active={selected ? "true" : undefined}
                      onClick={() => selectAudience(key)}
                      className="wl-segmented__item px-4 sm:px-5"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5">
                <span className="marketing-live-dot h-1.5 w-1.5 rounded-full" aria-hidden="true" />
                <span className="wl-eyebrow wl-eyebrow--no-rule text-muted-foreground">
                  {audience === "business" ? OUTBOUND_WEDGE.eyebrow : MARKETING_VOICE.eyebrow}
                </span>
              </div>

              <h1
                id="wireline-hero-title"
                aria-label={OUTBOUND_WEDGE.headline}
                className="wl-display-1 max-w-[10ch] text-[clamp(3.25rem,12vw,7.5rem)] uppercase leading-[.84] tracking-[-.07em] sm:max-w-[9ch] lg:max-w-[10ch]"
              >
                OUTBOUND <span className="text-primary">AGENTS</span>
              </h1>

              <p className="wl-lead mt-6 max-w-[42rem]">
                {audience === "business" ? OUTBOUND_WEDGE.subline : MARKETING_VOICE.subline}
              </p>

              <p
                id="wireline-audience-note"
                className="mt-3 max-w-[38rem] text-[14px] leading-[1.6] text-muted-foreground"
              >
                {heroCopy.note}
              </p>

              <ol
                className="mt-6 grid max-w-[32rem] grid-cols-4 overflow-hidden rounded-[14px] border border-border bg-card"
                aria-label="Wireline outbound loop"
              >
                {OUTBOUND_WEDGE.loop.map((item, index) => (
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

        <section className="border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mb-12">
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">
                Outbound playbooks · {audience === "personal" ? "personal" : "business"}
              </p>
              <h2 className="wl-display-2 mt-4">
                {audience === "personal" ? "Delegate the calls you avoid." : "Built for outbound volume."}
              </h2>
              <p className="mt-4 max-w-[560px] text-[16px] leading-[1.6] text-muted-foreground">
                {audience === "personal"
                  ? "The personal wedge is still outbound: negotiate bills, book appointments, chase answers, and report back with proof."
                  : "The business wedge is outbound outcomes: qualify, collect, reactivate, survey, renew, schedule, and update the system of record."}
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
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">How outbound runs</p>
              <h2 className="wl-display-2 mt-4">List. Script. Dial. Log.</h2>
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

        <section className="border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mb-12 text-center">
              <p className="wl-eyebrow wl-eyebrow--wired text-primary">Pricing</p>
              <h2 className="wl-display-2 mx-auto mt-4 max-w-[18ch]">
                Start outbound. Scale the lane.
              </h2>
              <p className="mx-auto mt-4 max-w-[560px] text-[16px] leading-[1.6] text-muted-foreground">
                Create for free, fund live calls with Conversation Balance, then move into Team or
                Business capacity when outbound becomes an operating lane.
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
                  {audience === "business" ? (
                    <>
                      Stop staring at lists.
                      <br />
                      Start completing calls.
                    </>
                  ) : (
                    <>
                      Stop making the call.
                      <br />
                      Start getting the outcome.
                    </>
                  )}
                </h2>
                <p className="mx-auto mt-4 max-w-[460px] text-[16px] marketing-ink-panel__soft">
                  {audience === "business"
                    ? "Stand up a trained outbound agent for sales, collections, reactivation, surveys, renewals, scheduling, or follow-up."
                    : "Create first. Train the call. Fund live outbound work when the agent is ready."}
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
