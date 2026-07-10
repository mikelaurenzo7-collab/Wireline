import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Check,
  CircleDollarSign,
  PhoneCall,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import MarketingFooter from "../components/marketing/MarketingFooter";
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
    name: "Personal",
    eyebrow: "For one person",
    price: "$0",
    period: "to create",
    tagline: "Start the line before billing starts.",
    detail:
      "Build and train one AI phone employee for free. When it starts answering real calls, texts, or follow-up, live work draws from prepaid Conversation Balance.",
    features: [
      "1 active phone employee",
      "1 phone line when live",
      "All templates unlocked",
      "Conversation Balance funds usage",
    ],
    cta: "Start with Personal",
    ctaPath: "/signup?plan=personal",
    icon: WalletCards,
    featured: false,
  },
  {
    id: "team",
    name: "Team",
    eyebrow: "For a small team",
    price: `$${planById.team.price_usd_monthly}`,
    period: "mo",
    tagline: "Shared capacity for a focused lane.",
    detail:
      "Several phone employees, connected numbers, shared inbox control, routing, and approvals for a team that needs one clean operating surface.",
    features: [
      `${planById.team.max_agents} active phone employees`,
      `${planById.team.included_phone_numbers} phone lines included`,
      `Extra employees at ${planById.team.extra_agent_price_usd}/mo`,
      "Routing, approvals, and team inbox",
    ],
    cta: "Start Team",
    ctaPath: "/signup?plan=team",
    icon: Users,
    featured: false,
  },
  {
    id: "business",
    name: "Business",
    eyebrow: "Best operating tier",
    price: `$${planById.business.price_usd_monthly}`,
    period: "mo",
    tagline: "Front desk, revenue, and support coverage.",
    detail:
      "The serious business tier: more phone employees, more lines, CRM sync, analytics, roles, and approvals across inbound, outbound, and follow-up.",
    features: [
      `${planById.business.max_agents} active phone employees`,
      `${planById.business.included_phone_numbers} phone lines included`,
      `Extra employees at ${planById.business.extra_agent_price_usd}/mo`,
      "CRM sync, analytics, roles, approvals",
    ],
    cta: "Start Business",
    ctaPath: "/signup?plan=business",
    icon: Building2,
    featured: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    eyebrow: "For scale",
    price: "Custom",
    period: "annual",
    tagline: "Governed rollouts and custom telephony.",
    detail:
      "Annual committed usage, SSO, audit support, BYO SIP, security review, and rollout planning for larger teams.",
    features: [
      "Custom employee and line capacity",
      "SSO, audit, and policy controls",
      "Custom integrations and telephony",
      "Implementation and launch support",
    ],
    cta: "Talk to Wireline",
    ctaPath: "/contact?topic=enterprise",
    icon: ShieldCheck,
    featured: false,
  },
] as const;

type PricingTier = (typeof PRICING_TIERS)[number];

const COMMERCIAL_RULES = [
  ["Build", "Templates, voices, and setup are unlocked before billing."],
  ["Fund", "Conversation Balance pays for calls, texts, and provider-backed actions."],
  ["Scale", "Team and Business add agents, lines, approvals, routing, and reliability."],
] as const;

const BUYER_ASSURANCES = [
  {
    icon: Check,
    label: "Build first",
    detail: "Create and train before a live line or paid plan is required.",
  },
  {
    icon: CircleDollarSign,
    label: "Predict spend",
    detail: "Conversation Balance and published rates keep live work budgetable.",
  },
  {
    icon: PhoneCall,
    label: "Go live deliberately",
    detail: "Provision numbers only when the agent is ready for real conversations.",
  },
  {
    icon: ShieldCheck,
    label: "Operational controls",
    detail: "Plans add approvals, roles, analytics, compliance, and support posture.",
  },
] as const;

const BUYER_DECISION_ROWS = [
  {
    choice: "Usage-based API minutes plus model and line economics",
    risk: "Great for engineers, but the buyer still has to assemble UX, logs, routing, billing, QA, and support.",
    wireline:
      "A packaged phone operation: build, train, launch, improve, review, and bill from one product surface.",
  },
  {
    choice: "Generic call bot tools",
    risk: "Easy to demo, often messy once teams need approvals, handoffs, CRM context, and spend controls.",
    wireline:
      "Team and Business capacity with numbers, approvals, inbox, analytics, and Conversation Balance.",
  },
  {
    choice: "Human answering services",
    risk: "Useful coverage, but context, consistency, reporting, and follow-up often fragment across vendors.",
    wireline:
      "A trained agent that keeps scripts, outcomes, transcripts, routing, and coaching in the workspace.",
  },
  {
    choice: "Avatar/video tools",
    risk: "Presentation alone does not run the phone operation or maintain the business workflow behind it.",
    wireline:
      "Voice-first operations with an optional presenter layer for higher-trust business moments.",
  },
] as const;

const FAQ = [
  [
    "Does Personal require a subscription?",
    "No. Personal is free to create and train. Live calls, texts, and follow-up are funded through Conversation Balance.",
  ],
  [
    "What is Conversation Balance?",
    "Prepaid Stripe credit for real voice work and provider-backed actions. It keeps personal usage flexible and gives teams a clear operating wallet.",
  ],
  [
    "What makes Business different from Team?",
    "Business is the operating tier: more agents, more phone lines, CRM sync, analytics, role-aware controls, and approvals for a real front desk or revenue lane.",
  ],
  [
    "Can Wireline provision phone numbers?",
    "Yes. Dedicated numbers are included by plan, and extra agent or line capacity can be added as the account grows.",
  ],
] as const;

const VOICE_RATES = publishedVoiceRates();
const BALANCE_MINUTE_ESTIMATES = conversationBalanceMinuteEstimates();

function offerForPlan(plan: PricingTier) {
  const numericPrice = Number(plan.price.replace("$", ""));
  return {
    "@type": "Offer",
    name: `Wireline ${plan.name}`,
    url: `https://trywireline.com${plan.ctaPath}`,
    price: Number.isFinite(numericPrice) ? numericPrice : undefined,
    priceCurrency: Number.isFinite(numericPrice) ? "USD" : undefined,
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
      name: "Wireline pricing",
      description:
        "Wireline pricing for Personal, Team, Business, and Enterprise voice agents with Conversation Balance for live work.",
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
        title="Pricing | Wireline - Personal, team, business, and enterprise AI phone employees"
        description="Build and train a personal AI phone employee for free, fund live work with Conversation Balance, or move into Team and Business capacity when Wireline becomes an operating lane."
        path="/pricing"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(PRICING_JSON_LD) }}
      />
      <PrecisionPublicHeader />

      <main id="main-content" className="pt-16 safe-area-insets" tabIndex={-1}>
        <section className="border-b border-border px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail text-center">
            <p className="wl-overline text-primary">Pricing</p>
            <h1
              className="mx-auto mt-4 max-w-4xl text-balance leading-[1.02] tracking-[-0.035em] text-foreground"
              style={{
                fontFamily:
                  "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                fontWeight: 400,
                fontSize: "clamp(2.7rem, 6vw, 5.6rem)",
              }}
            >
              Start with one phone employee. Scale into a phone operation.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Personal is balance-led. Team and Business add operating capacity: employees, numbers,
              routing, approvals, integrations, support, and reliability.
            </p>
            <div className="mx-auto mt-8 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {BUYER_ASSURANCES.map(({ icon: Icon, label, detail }) => (
                <div
                  key={label}
                  className="rounded-[var(--wireline-radius-lg)] border border-border bg-card/70 p-4 text-left"
                >
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold text-foreground">{label}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/signup"
                className="marketing-btn-primary min-h-12 px-6 text-sm font-semibold"
              >
                Build your first employee <ArrowRight size={14} />
              </Link>
              <a
                href="#tiers"
                className="inline-flex min-h-12 items-center gap-2 rounded-[var(--wireline-radius-md)] border border-border bg-card px-5 text-sm font-semibold text-foreground transition hover:bg-muted"
              >
                Compare plans
              </a>
            </div>
          </div>
        </section>

        <section id="tiers" className="px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail mx-auto grid max-w-[1360px] gap-4 lg:grid-cols-4 lg:items-stretch">
            {PRICING_TIERS.map((plan) => {
              const Icon = plan.icon;
              return (
                <article
                  key={plan.id}
                  className={`relative flex min-h-[520px] flex-col rounded-[var(--wireline-radius-xl)] border p-6 transition-all sm:p-7 ${
                    plan.featured
                      ? "wl-featured-wire marketing-ink-panel border-primary shadow-[var(--wireline-elevation-lg)]"
                      : "border-border bg-card hover:-translate-y-px hover:shadow-[var(--wireline-elevation-md)]"
                  }`}
                >
                  {plan.featured ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3.5 py-1 wl-eyebrow text-primary-foreground shadow-[var(--wireline-elevation-sm)]">
                      Most useful
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
                    className={`mt-2 text-sm leading-6 ${
                      plan.featured ? "text-[rgba(247,246,243,.68)]" : "text-muted-foreground"
                    }`}
                  >
                    {plan.tagline}
                  </p>

                  <div className="mt-8 flex items-end gap-2">
                    <span
                      className="text-[clamp(2.7rem,5vw,4.2rem)] leading-none tracking-[-0.04em]"
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

                  <p
                    className={`mt-6 min-h-[96px] text-sm leading-6 ${
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
        </section>

        <section
          id="voice-rates"
          className="border-y border-border bg-muted/30 px-5 py-12 sm:px-8 lg:px-10"
        >
          <div className="wl-public-rail mx-auto max-w-5xl">
            <p className="wl-overline text-primary">Voice economics</p>
            <h2
              className="mt-3 max-w-2xl text-balance text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.08] tracking-[-0.03em]"
              style={{
                fontFamily:
                  "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                fontWeight: 400,
              }}
            >
              Clear per-minute rates — no surprise math after the call.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Many phone stacks split platform, carrier, model, and add-on costs across separate
              invoices. Wireline publishes one voice rate per funding path so you can budget before
              going live.
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
            <div className="mt-6 rounded-[var(--wireline-radius-lg)] border border-border bg-background p-5">
              <p className="text-sm font-semibold text-foreground">Conversation Balance examples</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {BALANCE_MINUTE_ESTIMATES.map(({ amountUsd, minutes }) => (
                  <li
                    key={amountUsd}
                    className="flex items-center justify-between gap-3 text-sm text-muted-foreground"
                  >
                    <span>${amountUsd} top-up</span>
                    <span className="font-medium tabular-nums text-foreground">
                      ≈ {minutes.toLocaleString()} min
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-card/55 px-5 py-12 sm:px-8 lg:px-10">
          <div className="wl-public-rail mx-auto grid max-w-6xl gap-8 lg:grid-cols-[.75fr_1fr] lg:items-center">
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
                Balance pays for live work. Plans add the business layer.
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

        <section className="px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail mx-auto grid max-w-5xl gap-5 lg:grid-cols-[.9fr_1.1fr] lg:items-stretch">
            <div className="rounded-[var(--wireline-radius-xl)] border border-border bg-card p-7">
              <p className="wl-overline text-primary">Phone numbers</p>
              <h2 className="mt-4 font-[var(--wireline-font-family-display)] text-4xl font-normal leading-tight tracking-[-0.03em]">
                Numbers should feel easy to claim.
              </h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Wireline can provision dedicated numbers during setup, attach them to an agent, and
                make the account feel operational immediately.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [
                  "Included lines",
                  "Team and Business include dedicated phone numbers so you never wire a carrier yourself.",
                ],
                [
                  "Expansion",
                  "Extra agents and additional line capacity can become clean add-ons instead of hidden usage surprises.",
                ],
                [
                  "Retention",
                  "Once a number, voice, playbook, transcripts, and outcomes live in Wireline, the account has a real operating asset.",
                ],
                [
                  "Trust",
                  "Clear billing language matters: platform plan for capacity, Conversation Balance for live work.",
                ],
              ].map(([title, body]) => (
                <div
                  key={title}
                  className="rounded-[var(--wireline-radius-lg)] border border-border bg-background p-5"
                >
                  <PhoneCall size={16} className="text-primary" aria-hidden="true" />
                  <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-card/40 px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail mx-auto max-w-6xl">
            <div className="max-w-2xl">
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
                The winning wedge is not more feature noise. It is the cleanest way for a buyer to
                build a phone employee, train its rules, launch the number and tools, then improve
                the operation with visibility and spend control.
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
            <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
              Pricing claims on public competitor pages change often. This page keeps Wireline's
              durable positioning tied to the tier cards above plus{" "}
              <span className="text-foreground">docs/business-usage-pricing-decision.md</span>.
            </p>
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
                Straight answers before you wire the first line.
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
                Stripe-secured checkout, prepaid balance, and customer portal management.
              </p>
              <Link
                to="/signup"
                className="marketing-btn-primary min-h-12 px-8 text-sm font-semibold tracking-[.05em]"
              >
                Start with one agent <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
