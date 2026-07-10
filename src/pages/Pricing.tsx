import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Check,
  CircleDollarSign,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";
import MarketingFooter from "../components/marketing/MarketingFooter";
import MarketingHero from "../components/marketing/MarketingHero";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import { PageMeta } from "../lib/page-meta";
import { STRIPE_PLANS, type StripePlanId } from "../lib/plan-catalog";
import {
  conversationBalanceMinuteEstimates,
  publishedVoiceRates,
} from "../lib/voice-pricing-display";

const planById = Object.fromEntries(STRIPE_PLANS.map((plan) => [plan.id, plan])) as Record<
  StripePlanId,
  (typeof STRIPE_PLANS)[number]
>;

const PRICING_TIERS = [
  {
    id: "personal",
    name: "Free Builder",
    eyebrow: "Build before billing",
    price: "$0",
    period: "forever",
    annualLabel: null,
    tagline: "Create belief before you create cost.",
    detail:
      "Build, train, and privately simulate your first profit agent. Nothing receives a production number or places a live outbound call until you activate a paid plan.",
    features: [
      "1 private draft profit agent",
      "Agent setup, training, and simulation",
      "No production number until activation",
      "No live outbound calling",
    ],
    cta: "Build free",
    ctaPath: "/signup?plan=personal",
    icon: WalletCards,
    featured: false,
    badge: null,
  },
  {
    id: "starter",
    name: "Starter",
    eyebrow: "For one owner",
    price: `$${planById.starter.price_usd_monthly}`,
    period: "mo",
    annualLabel: `$${planById.starter.price_usd_annual}/yr · 2 months free`,
    tagline: "One profit agent, live and accountable.",
    detail:
      "The focused launch tier for an owner who wants one trained agent, one included number, useful monthly calling capacity, and clean outcome visibility.",
    features: [
      `${planById.starter.max_agents} live AI profit agent`,
      `${planById.starter.included_phone_numbers} included production number`,
      `${planById.starter.voice_minutes_monthly.toLocaleString()} pooled live-call minutes/month`,
      "Call logs, outcomes, and private simulation",
      `Extra usage from Conversation Balance at $${planById.starter.overage_per_min_usd.toFixed(2)}/min`,
      "No automatic overages",
    ],
    cta: "Start Starter",
    ctaPath: "/signup?plan=starter",
    icon: Sparkles,
    featured: true,
    badge: "Founder favorite",
  },
  {
    id: "team",
    name: "Team",
    eyebrow: "For a small business",
    price: `$${planById.team.price_usd_monthly}`,
    period: "mo",
    annualLabel: `$${planById.team.price_usd_annual}/yr · 2 months free`,
    tagline: "Several revenue lanes, one operating surface.",
    detail:
      "Run appointment setting, lead revival, quote follow-up, front desk, or recovery agents with pooled minutes, shared visibility, routing, and approvals.",
    features: [
      `${planById.team.max_agents} live AI profit agents`,
      `${planById.team.included_phone_numbers} included production numbers`,
      `${planById.team.voice_minutes_monthly.toLocaleString()} pooled live-call minutes/month`,
      "Shared inbox, routing, and approvals",
      `Extra usage from Conversation Balance at $${planById.team.overage_per_min_usd.toFixed(2)}/min`,
      "No automatic overages",
    ],
    cta: "Start Team",
    ctaPath: "/signup?plan=team",
    icon: Users,
    featured: false,
    badge: "Founder pricing",
  },
  {
    id: "business",
    name: "Business",
    eyebrow: "For serious operators",
    price: `$${planById.business.price_usd_monthly}`,
    period: "mo",
    annualLabel: `$${planById.business.price_usd_annual}/yr · 2 months free`,
    tagline: "Front desk, revenue, support, and recovery coverage.",
    detail:
      "The operating tier for teams using Wireline across inbound conversion, outbound follow-up, support, CRM workflows, analytics, and governed policies.",
    features: [
      `${planById.business.max_agents} live AI profit agents`,
      `${planById.business.included_phone_numbers} included production numbers`,
      `${planById.business.voice_minutes_monthly.toLocaleString()} pooled live-call minutes/month`,
      "Analytics, CRM controls, roles, and approvals",
      "Priority support posture",
      `Extra usage from Conversation Balance at $${planById.business.overage_per_min_usd.toFixed(2)}/min`,
      "No automatic overages",
    ],
    cta: "Start Business",
    ctaPath: "/signup?plan=business",
    icon: Building2,
    featured: false,
    badge: "Founder pricing",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    eyebrow: "For governed scale",
    price: "Custom",
    period: "annual",
    annualLabel: null,
    tagline: "Committed usage, custom controls, and rollout support.",
    detail:
      "For larger, regulated, or high-volume accounts that need SSO, custom telephony, retention controls, security review, SLAs, or committed usage economics.",
    features: [
      "Custom agent, number, and minute capacity",
      "SSO, audit, and policy controls",
      "Custom integrations, telephony, and retention",
      "Implementation and launch support",
    ],
    cta: "Talk to founder",
    ctaPath: "/contact?topic=enterprise",
    icon: ShieldCheck,
    featured: false,
    badge: null,
  },
] as const;

type PricingTier = (typeof PRICING_TIERS)[number];

const COMMERCIAL_RULES = [
  ["Build free", "Create, train, and privately simulate one profit agent before committing to live usage."],
  [
    "Launch predictably",
    "Paid plans include live agents, dedicated numbers, and a pooled monthly live-call allowance.",
  ],
  [
    "Expand deliberately",
    "Conversation Balance covers controlled extra usage. Auto-refill is optional; postpaid overages are not automatic.",
  ],
] as const;

const BUYER_ASSURANCES = [
  {
    icon: Check,
    label: "Build first",
    detail: "Create and train before a production number or paid plan is required.",
  },
  {
    icon: PhoneCall,
    label: "Included numbers",
    detail: "Every self-serve paid agent includes a dedicated production number.",
  },
  {
    icon: CircleDollarSign,
    label: "No surprise overages",
    detail: "Included minutes are used first, then only prepaid Conversation Balance can fund more.",
  },
  {
    icon: ShieldCheck,
    label: "Calls finish normally",
    detail: "Billing depletion never cuts off an active call; it pauses the next live action instead.",
  },
] as const;

const BUYER_DECISION_ROWS = [
  {
    choice: "Usage-based voice APIs",
    risk: "Low-level minutes are flexible, but the buyer still has to assemble UX, numbers, logs, routing, billing, QA, and support.",
    wireline:
      "A packaged operating loop: build, train, wire, call, review outcomes, and improve from one web workspace.",
  },
  {
    choice: "Generic call-bot tools",
    risk: "Easy to demo, often fragmented once a team needs approvals, handoffs, CRM context, spend controls, and outcome review.",
    wireline:
      "Included numbers and minutes, pooled plan capacity, Conversation Balance, approvals, inbox, analytics, and clear owner control.",
  },
  {
    choice: "Human answering services",
    risk: "Useful coverage, but scripts, reporting, follow-up, availability, and knowledge consistency can fragment across people and vendors.",
    wireline:
      "A trained agent that keeps its rules, transcripts, outcomes, routing, and coaching history inside the workspace.",
  },
  {
    choice: "Avatar or presenter tools",
    risk: "Presentation alone does not run the phone operation or maintain the business workflow behind it.",
    wireline:
      "Voice-first operations with an optional consent-aware presenter layer for higher-trust business moments.",
  },
] as const;

const FAQ = [
  [
    "What can I do on Free Builder?",
    "Create, train, and privately simulate one draft profit agent. Free Builder cannot provision a production number or place live outbound calls.",
  ],
  [
    "What happens when included minutes run out?",
    "A new live call requires enough Conversation Balance for the next billable attempt. You can add balance, wait for the monthly reset, or upgrade. Wireline does not create an automatic postpaid overage invoice.",
  ],
  [
    "Will Wireline cut off an active call?",
    "No. A call already in progress finishes normally. If it exceeds remaining plan minutes and prepaid balance, the completed usage is recorded as completion grace and the next live call stays paused until the balance is restored.",
  ],
  [
    "What is Conversation Balance?",
    "Prepaid credit for extra calls, texts, and provider-backed work after included plan capacity is used. It is designed to keep spending controlled and visible.",
  ],
  [
    "Are phone numbers included?",
    "Yes. Starter includes 1 number, Team includes 4, and Business includes 8. Free Builder receives no production number until activation.",
  ],
  [
    "Can I lock in these prices?",
    "These are Founder Early Access prices. Accounts that subscribe during early access are positioned to retain founder pricing while the launch catalog remains active.",
  ],
] as const;

const VOICE_RATES = publishedVoiceRates();
const BALANCE_MINUTE_ESTIMATES = conversationBalanceMinuteEstimates();
const PRICING_HERO_ITEMS = [
  "Build free",
  "Included numbers",
  "Included minutes",
  "Prepaid extra usage",
] as const;

function offerForPlan(plan: PricingTier) {
  const numericPrice = Number(plan.price.replace("$", ""));
  const hasPrice = Number.isFinite(numericPrice);
  return {
    "@type": "Offer",
    name: `Wireline ${plan.name}`,
    url: `https://trywireline.com${plan.ctaPath}`,
    price: hasPrice ? numericPrice : undefined,
    priceCurrency: hasPrice ? "USD" : undefined,
    availability: "https://schema.org/InStock",
    description: plan.detail,
  };
}

const PRICING_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://trywireline.com/pricing#webpage",
      url: "https://trywireline.com/pricing",
      name: "Wireline founder early-access pricing",
      description:
        "Start free, then launch AI profit agents with included numbers, included monthly live-call minutes, and prepaid Conversation Balance for controlled extra usage.",
    },
    {
      "@type": "OfferCatalog",
      "@id": "https://trywireline.com/pricing#plans",
      name: "Wireline pricing plans",
      itemListElement: PRICING_TIERS.map(offerForPlan),
    },
    {
      "@type": "FAQPage",
      "@id": "https://trywireline.com/pricing#faq",
      mainEntity: FAQ.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      })),
    },
  ],
};

export default function Pricing() {
  return (
    <div className="marketing-surface wl-pricing-page min-h-screen bg-background text-foreground">
      <PageMeta
        title="Pricing | Wireline — Founder early access from $19/month"
        description="Build your first AI profit agent free. Paid plans include live agents, dedicated numbers, monthly live-call minutes, and no automatic overages."
        path="/pricing"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(PRICING_JSON_LD) }}
      />
      <PrecisionPublicHeader />

      <main id="main-content" className="pt-16" tabIndex={-1}>
        <MarketingHero
          eyebrow="Founder Early Access"
          title="Start free. Launch when ready. No surprise overages."
          description="Build and train your first AI profit agent free. Paid plans include live agents, dedicated numbers, and monthly live-call minutes. Extra usage stays controlled with prepaid Conversation Balance."
          primaryAction={{ label: "Build your first profit agent", to: "/signup" }}
          secondaryAction={{ label: "Compare plans", to: "#tiers", tone: "secondary" }}
          proof={BUYER_ASSURANCES.map(({ label }) => label)}
          visualEyebrow="Launch model"
          visualTitle="One predictable plan. One controlled safety balance."
          visualBody="Included minutes are consumed first. Conversation Balance covers only the extra usage you authorize, and active calls always finish normally."
          visualItems={PRICING_HERO_ITEMS}
        />

        <section id="tiers" className="px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail mx-auto grid max-w-[1500px] gap-4 md:grid-cols-2 xl:grid-cols-5 xl:items-stretch">
            {PRICING_TIERS.map((plan) => {
              const Icon = plan.icon;
              return (
                <article
                  key={plan.id}
                  className={`relative flex min-h-[590px] flex-col rounded-[var(--wireline-radius-xl)] border p-6 transition-all sm:p-7 ${
                    plan.featured
                      ? "wl-featured-wire marketing-ink-panel border-primary shadow-[var(--wireline-elevation-lg)]"
                      : "border-border bg-card hover:-translate-y-px hover:shadow-[var(--wireline-elevation-md)]"
                  }`}
                >
                  {plan.badge ? (
                    <span
                      className={`absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3.5 py-1 wl-eyebrow shadow-[var(--wireline-elevation-sm)] ${
                        plan.featured
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-background text-primary"
                      }`}
                    >
                      {plan.badge}
                    </span>
                  ) : null}

                  <div className="mb-8 flex items-center justify-between gap-4">
                    <span
                      className={`wl-eyebrow ${
                        plan.featured ? "text-[rgba(247,246,243,.62)]" : "text-primary"
                      }`}
                    >
                      {plan.eyebrow}
                    </span>
                    <span
                      className={`grid size-10 place-items-center rounded-[var(--wireline-radius-md)] border ${
                        plan.featured
                          ? "border-white/10 bg-white/10 text-[var(--wireline-color-text-primary)]"
                          : "border-border bg-muted text-primary"
                      }`}
                    >
                      <Icon size={17} aria-hidden="true" />
                    </span>
                  </div>

                  <h2
                    className="text-[2rem] leading-none tracking-[-0.025em]"
                    style={{
                      fontFamily:
                        "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                      fontWeight: 400,
                    }}
                  >
                    {plan.name}
                  </h2>
                  <p
                    className={`mt-2 min-h-12 text-sm leading-6 ${
                      plan.featured ? "text-[rgba(247,246,243,.68)]" : "text-muted-foreground"
                    }`}
                  >
                    {plan.tagline}
                  </p>

                  <div className="mt-7 flex items-end gap-2">
                    <span
                      className="text-[clamp(2.7rem,4vw,4rem)] leading-none tracking-[-0.04em]"
                      style={{
                        fontFamily:
                          "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                        fontWeight: 400,
                      }}
                    >
                      {plan.price}
                    </span>
                    <span
                      className={`pb-2 text-sm ${
                        plan.featured ? "text-[rgba(247,246,243,.58)]" : "text-muted-foreground"
                      }`}
                    >
                      {plan.period === "mo" ? "/mo" : plan.period}
                    </span>
                  </div>
                  {plan.annualLabel ? (
                    <p
                      className={`mt-2 text-xs font-medium ${
                        plan.featured ? "text-[rgba(247,246,243,.62)]" : "text-primary"
                      }`}
                    >
                      {plan.annualLabel}
                    </p>
                  ) : null}

                  <p
                    className={`mt-6 min-h-[118px] text-sm leading-6 ${
                      plan.featured ? "text-[rgba(247,246,243,.72)]" : "text-muted-foreground"
                    }`}
                  >
                    {plan.detail}
                  </p>

                  <ul className="mt-7 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className={`flex items-start gap-2.5 text-sm leading-6 ${
                          plan.featured ? "text-[rgba(247,246,243,.9)]" : "text-foreground"
                        }`}
                      >
                        <Check
                          size={15}
                          className="mt-0.5 shrink-0 text-primary"
                          strokeWidth={2.5}
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    to={plan.ctaPath}
                    className={`mt-8 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[var(--wireline-radius-md)] px-5 text-sm font-semibold transition active:scale-[.985] ${
                      plan.featured
                        ? "bg-[var(--wireline-color-text-primary)] text-[var(--wireline-color-canvas-default)] hover:opacity-90"
                        : "marketing-btn-primary"
                    }`}
                  >
                    {plan.cta}
                    <ArrowRight size={14} />
                  </Link>
                </article>
              );
            })}
          </div>
          <p className="wl-public-rail mx-auto mt-6 max-w-[1500px] text-center text-xs leading-6 text-muted-foreground">
            Founder Early Access pricing is the active public launch catalog. Taxes, carrier pass-throughs
            outside standard US usage, and custom enterprise commitments may vary.
          </p>
        </section>

        <section className="border-y border-border bg-card/55 px-5 py-12 sm:px-8 lg:px-10">
          <div className="wl-public-rail mx-auto grid max-w-6xl gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
            <div>
              <p className="wl-overline text-primary">Commercial model</p>
              <h2
                className="mt-3 text-balance text-[clamp(2rem,4vw,3.5rem)] leading-[1.04] tracking-[-0.03em]"
                style={{
                  fontFamily:
                    "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                  fontWeight: 400,
                }}
              >
                Included capacity first. Prepaid control after that.
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {COMMERCIAL_RULES.map(([label, body]) => (
                <div
                  key={label}
                  className="rounded-[var(--wireline-radius-lg)] border border-border bg-background p-5"
                >
                  <p className="wl-eyebrow text-primary">{label}</p>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="voice-rates"
          className="border-b border-border bg-muted/30 px-5 py-14 sm:px-8 sm:py-20 lg:px-10"
        >
          <div className="wl-public-rail mx-auto max-w-6xl">
            <p className="wl-overline text-primary">Extra voice usage</p>
            <h2
              className="mt-3 max-w-3xl text-balance text-[clamp(1.9rem,3.5vw,3rem)] leading-[1.08] tracking-[-0.03em]"
              style={{
                fontFamily:
                  "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                fontWeight: 400,
              }}
            >
              Published rates, prepaid funding, and no surprise invoice.
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              Your plan minutes are used first. When you choose to keep calling, Conversation Balance
              funds extra minutes at the plan rate below. Every completed provider attempt consumes at
              least one billable minute, including busy, rejected, voicemail, and zero-second outcomes.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {VOICE_RATES.map((row) => (
                <div
                  key={row.label}
                  className="rounded-[var(--wireline-radius-lg)] border border-border bg-card p-5"
                >
                  <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                    ${row.rateUsd.toFixed(2)}
                    <span className="text-base font-medium text-muted-foreground">/min</span>
                  </p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{row.label}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{row.detail}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-4 rounded-[var(--wireline-radius-lg)] border border-border bg-background p-5 lg:grid-cols-[1fr_1.25fr]">
              <div>
                <p className="text-sm font-semibold text-foreground">Conversation Balance examples</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Estimates use the Starter extra-usage rate. Team and Business balances last longer.
                </p>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {BALANCE_MINUTE_ESTIMATES.map(({ amountUsd, minutes }) => (
                  <li
                    key={amountUsd}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm text-muted-foreground"
                  >
                    <span>${amountUsd} top-up</span>
                    <span className="font-medium tabular-nums text-foreground">
                      ≈ {minutes.toLocaleString()} extra min
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail mx-auto grid max-w-6xl gap-5 lg:grid-cols-[.9fr_1.1fr] lg:items-stretch">
            <div className="rounded-[var(--wireline-radius-xl)] border border-primary/30 bg-primary/5 p-7">
              <p className="wl-overline text-primary">Live-call continuity</p>
              <h2 className="mt-4 font-[var(--wireline-font-family-display)] text-4xl font-normal leading-tight tracking-[-0.03em]">
                The current call finishes. The next call waits.
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                Wireline does not interrupt an active customer conversation when included minutes or
                prepaid balance run out. The call completes normally, completion grace records any amount
                due, and another live action stays paused until coverage is restored.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {BUYER_ASSURANCES.map(({ icon: Icon, label, detail }) => (
                <div
                  key={label}
                  className="rounded-[var(--wireline-radius-lg)] border border-border bg-card p-5"
                >
                  <Icon size={17} className="text-primary" aria-hidden="true" />
                  <p className="mt-4 text-sm font-semibold text-foreground">{label}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-card/40 px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="wl-overline text-primary">Buying posture</p>
              <h2
                className="mt-3 text-balance text-[clamp(2rem,4vw,3.25rem)] leading-[1.06] tracking-[-0.03em]"
                style={{
                  fontFamily:
                    "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                  fontWeight: 400,
                }}
              >
                More than a bot. More focused than a toolkit.
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
                Wireline is designed to make the entire profit-agent loop understandable: pick a role,
                train the rules, attach the number and tools, run conversations, then review outcomes and
                improve the operation.
              </p>
            </div>
            <div className="mt-10 grid gap-3 md:grid-cols-2">
              {BUYER_DECISION_ROWS.map((row) => (
                <article
                  key={row.choice}
                  className="rounded-[var(--wireline-radius-lg)] border border-border bg-background p-5"
                >
                  <p className="wl-eyebrow text-primary">{row.choice}</p>
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">{row.risk}</p>
                  <p className="mt-4 border-t border-border pt-4 text-sm font-medium leading-6 text-foreground">
                    {row.wireline}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail mx-auto max-w-3xl">
            <div className="text-center">
              <p className="wl-overline">Questions</p>
              <h2
                className="mt-3 text-balance leading-[1.08] tracking-[-0.025em] text-foreground"
                style={{
                  fontFamily:
                    "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                  fontWeight: 400,
                  fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
                }}
              >
                Straight answers before the first live call.
              </h2>
            </div>
            <div className="mt-10 space-y-3">
              {FAQ.map(([question, answer]) => (
                <details key={question} className="group wl-stitch-card overflow-hidden rounded-xl">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-5 px-5 py-4 text-sm font-semibold text-foreground">
                    <span>{question}</span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-lg text-muted-foreground transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="border-t border-border px-5 py-4 text-sm leading-6 text-muted-foreground">
                    {answer}
                  </p>
                </details>
              ))}
            </div>

            <div className="mt-12 flex flex-col items-center gap-5 text-center">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck size={15} className="text-primary" />
                Stripe-secured checkout, prepaid Conversation Balance, and customer portal management.
              </p>
              <Link
                to="/signup"
                className="marketing-btn-primary min-h-12 px-8 text-sm font-semibold tracking-[.05em]"
              >
                Build your first profit agent <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
