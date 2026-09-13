import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";
import { FLAT_OVERAGE_PER_MIN_USD, STRIPE_PLANS, type StripePlanId } from "../lib/plan-catalog";
import { signupHrefForPlan } from "../lib/signup-intent";
import { cn } from "../lib/utils";

const TOPUP_RATE = `$${FLAT_OVERAGE_PER_MIN_USD.toFixed(2)}/min`;

const planById = Object.fromEntries(STRIPE_PLANS.map((plan) => [plan.id, plan])) as Record<
  StripePlanId,
  (typeof STRIPE_PLANS)[number]
>;

/** Honest annual savings vs paying monthly for 12 months (every paid tier's annual is 10x monthly, i.e. 2 months free). */
function annualSavingsLabel(monthlyUsd: number, annualUsd: number): string | null {
  if (!(monthlyUsd > 0) || !(annualUsd > 0)) return null;
  const monthsSaved = Math.max(0, Math.round(12 - annualUsd / monthlyUsd));
  if (monthsSaved <= 0) return null;
  return `save ${monthsSaved} month${monthsSaved === 1 ? "" : "s"}`;
}

const PAID_TIERS = [
  {
    plan: planById.starter,
    publicName: "Starter",
    eyebrow: "Put Your Sales Bot Live",
    tagline: "Your sales bot from $19/month",
    detail:
      "One focused Phone Bot for inbound calls, outbound calls, or scheduling, with an included BotBound number.",
    ctaMonthly: "Start for $19",
    ctaAnnual: "Start for $190/yr",
    ctaPath: signupHrefForPlan("starter"),
    highlights: [
      "1 live Bot with its own phone number",
      `${planById.starter.voice_minutes_monthly} voice minutes each month`,
      "Call, text, email, and automatic outcomes",
      `$${planById.starter.runtime_allowance_usd_monthly} Runtime + $${planById.starter.ai_spend_allowance_usd_monthly.toFixed(2)} managed AI allowance`,
      "No automatic overages",
    ],
    featured: false,
    badge: "Lowest Cost Live Plan",
  },
  {
    plan: planById.team,
    publicName: "Starter Plus",
    eyebrow: "Two Roles, One Workspace",
    tagline: "Two Live Bots from $39/month",
    detail: `Two live Bots, two numbers, ${planById.team.voice_minutes_monthly} voice minutes, and fuller Lead Hunt and enrichment.`,
    ctaMonthly: "Choose Starter Plus",
    ctaAnnual: "Choose Starter Plus",
    ctaPath: signupHrefForPlan("team"),
    highlights: [
      "2 live Bots with 2 phone numbers",
      `${planById.team.voice_minutes_monthly} voice minutes each month`,
      "Call, text, email, and full Lead Hunt",
      `$${planById.team.runtime_allowance_usd_monthly} Runtime + $${planById.team.ai_spend_allowance_usd_monthly} managed AI allowance`,
      "No automatic overages",
    ],
    featured: true,
    badge: "Best Founder Value",
  },
  {
    plan: planById.business,
    publicName: "Pro",
    eyebrow: "For a Growing Operation",
    tagline: "Five Specialized Bots. One Workspace",
    detail: "Up to five specialized Bots with shared context, routing, approvals, and analytics.",
    ctaMonthly: "Go Pro",
    ctaAnnual: "Go Pro Annually",
    ctaPath: signupHrefForPlan("business"),
    highlights: [
      "Up to 5 live Bots with 5 phone numbers",
      `${planById.business.voice_minutes_monthly} voice minutes each month`,
      "Lead Hunt, routing, and approvals",
      "Connected calendar, CRM, mailbox, and actions",
      `$${planById.business.runtime_allowance_usd_monthly} Runtime + $${planById.business.ai_spend_allowance_usd_monthly} managed AI allowance; no automatic overages`,
    ],
    featured: false,
    badge: "Multi-Bot",
  },
] as const;

const PAID_PLAN_FEATURES: readonly (readonly string[])[] = PAID_TIERS.map(
  ({ plan }) => plan.features,
);
const SHARED_PAID_FEATURES = PAID_PLAN_FEATURES[0].filter((feature) =>
  PAID_PLAN_FEATURES.every((features) => features.includes(feature)),
);
const FREE_BUILDER_HIGHLIGHTS = [
  "1 private draft Bot",
  "Setup, knowledge, and private simulation",
  `$${planById.personal.ai_spend_allowance_usd_monthly.toFixed(2)} of private AI simulation each month`,
  "Upgrade to a paid plan when you need a live number",
] as const;

const CHANNEL_RULES = [
  {
    title: "Voice + Included Number",
    body: `Every active paid Bot gets its own BotBound phone number. Extra minutes stay prepaid at ${TOPUP_RATE}; live calls never cut mid-conversation.`,
  },
  {
    title: "Text / SMS",
    body: "The same Bot continues by text. Consent and spend stay visible, billed by segment.",
  },
  {
    title: "Email",
    body: "Every active paid Bot gets a BotBound-managed mailbox automatically. Guided custom-domain setup keeps the Bot on your brand after DNS verification; Gmail, Outlook, and iCloud connections remain optional inputs.",
  },
  {
    title: "Lead Hunt",
    body: "Research a niche, enrich targets, and hand them to the same Bot. Available on every paid plan.",
  },
] as const;

const FAQ = [
  [
    "Can your Bot handle voice, text, and email?",
    "Yes. A single BotBound Bot can call, hold natural conversations, text, and email under one identity, memory, rule set, approval posture, and outcome record. Additional Bots add concurrency or specialized roles, not basic channels.",
  ],
  [
    "Is the BotBound number free?",
    "Every active paid Bot gets its own BotBound phone number at no extra line fee within the plan's Bot capacity. Free Builder is a private creation and simulation tier; carrier resources allocate when a Bot becomes paid and active.",
  ],
  [
    "Why are there two Starter plans?",
    "Starter is the lowest-risk way to put one Phone Bot live. Starter Plus adds a second live Bot, a second phone number, more voice minutes, and fuller Lead Hunt and enrichment in the same workspace.",
  ],
  [
    "Does every paid Bot get a phone number?",
    "Yes. Every active paid Bot gets one dedicated BotBound phone number. Numbers are added when a Bot becomes active; unused plan capacity does not allocate a number.",
  ],
  [
    "What happens when included voice minutes run out?",
    `New live work draws prepaid Runtime Balance at ${TOPUP_RATE}, never a surprise postpaid bill. Add balance, wait for renewal, or upgrade. An active call is never cut off; only the next new action pauses until coverage is restored.`,
  ],
  [
    "Are live calls limited to a few seconds?",
    "No. Calls run as long as the conversation needs. Included monthly minutes and prepaid Runtime Balance fund duration; there is no artificial short hard cap for profitability. Separate mid-call web research tools use a short network timeout so callers are not left waiting in silence.",
  ],
  [
    "Why keep live usage prepaid?",
    "Calls and messages carry real operating costs. One subscription unlocks every channel, included capacity gets you live, and extra usage stays prepaid and visible.",
  ],
  [
    "Can I cancel or get a refund?",
    "Yes. Paid plans are month to month by default, with no long-term contract. Cancel from BotBound Billing anytime; access continues through the current billing period. Submit a request to support@botbound.me within 30 days of your first paid invoice. We verify the account and transaction before confirming a first-invoice subscription refund.",
  ],
  [
    "What is the Scale plan?",
    "Scale is a custom committed-usage agreement for organizations needing 25 or more Bots, negotiated channel economics, SSO, custom integrations, security review, retention controls, implementation support, or SLAs. See the Scale card above.",
  ],
] as const;

const pricingJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "OfferCatalog",
      name: "BotBound pricing",
      url: "https://botbound.me/pricing",
      itemListElement: [
        {
          "@type": "Offer",
          name: "BotBound Free Builder",
          price: 0,
          priceCurrency: "USD",
          description: "Build, train, and privately simulate one Phone Bot.",
        },
        ...PAID_TIERS.map(({ plan, publicName, detail }) => ({
          "@type": "Offer",
          name: `BotBound ${publicName}`,
          price: plan.price_usd_monthly,
          priceCurrency: "USD",
          description: detail,
        })),
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ],
};

export default function Pricing() {
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");
  const annual = billingInterval === "year";

  return (
    <MarketingPageFrame className="wl-pricing-page" stickyCta>
      <PageMeta
        title="PRICING | FROM $19/MONTH | BotBound"
        description="Build and test your sales bot free. Activate from $19/month, with included numbers and call minutes, plus clear prepaid usage controls."
        path="/pricing"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />

      <section id="plans" className="marketing-section marketing-section--screen">
        <div className="wl-public-rail mx-auto max-w-[1500px] text-center">
          <div className="mx-auto mb-8 max-w-3xl text-center">
            <p className="wl-eyebrow wl-eyebrow--wired text-primary">Pricing</p>
            <h1 className="marketing-hero-title mx-auto mt-4 max-w-[16ch] text-[clamp(1.9rem,3.4vw,2.9rem)]">
              Start free. Go live from $19.
            </h1>
            <p className="marketing-hero-lead mx-auto mt-4">
              Every active paid Bot gets its own BotBound phone number.
            </p>
            <div className="marketing-hero__actions mt-6">
              <div
                className="inline-flex rounded-full border border-border bg-muted/40 p-1"
                role="group"
                aria-label="Billing interval"
              >
                <button
                  type="button"
                  onClick={() => setBillingInterval("month")}
                  className={cn(
                    "min-h-10 rounded-full px-5 text-xs font-semibold uppercase tracking-[0.14em] transition",
                    billingInterval === "month"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={billingInterval === "month"}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingInterval("year")}
                  className={cn(
                    "min-h-10 rounded-full px-5 text-xs font-semibold uppercase tracking-[0.14em] transition",
                    billingInterval === "year"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={billingInterval === "year"}
                >
                  Annual
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 grid items-stretch gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <article className="flex flex-col rounded-[var(--radius-xl)] border border-border bg-card p-4 text-center">
              <h2 className="wl-card-title">Free Builder</h2>
              <div className="mt-3 flex items-end justify-center gap-1.5">
                <span className="text-[1.85rem] font-semibold leading-none tracking-[-0.04em]">
                  $0
                </span>
                <span className="text-xs text-muted-foreground">forever</span>
              </div>
              <ul className="mx-auto mt-3 w-full flex-1 space-y-1.5 text-left text-[12px] leading-5">
                {FREE_BUILDER_HIGHLIGHTS.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                to={signupHrefForPlan("personal")}
                className="marketing-btn-secondary mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-semibold transition"
              >
                Build Free <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </article>

            {PAID_TIERS.map(
              ({ plan, publicName, ctaMonthly, ctaAnnual, ctaPath, highlights, featured }) => {
                const showAnnual = annual && plan.price_usd_annual > 0;
                const price = showAnnual ? plan.price_usd_annual : plan.price_usd_monthly;
                const priceSuffix = showAnnual ? "/year" : "/month";
                const savings = annualSavingsLabel(plan.price_usd_monthly, plan.price_usd_annual);
                const path = showAnnual ? `${ctaPath}&interval=year` : ctaPath;
                return (
                  <article
                    key={plan.id}
                    className={`relative flex flex-col rounded-[var(--radius-xl)] border p-4 text-center ${
                      featured
                        ? "border-primary/50 bg-card pt-6 ring-2 ring-primary/45"
                        : "border-border bg-card"
                    }`}
                  >
                    {featured ? (
                      <span
                        className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary-foreground shadow-sm"
                        aria-label="Recommended plan"
                      >
                        Recommended
                      </span>
                    ) : null}
                    <h2 className="wl-card-title">{publicName}</h2>
                    <div className="mt-3 flex items-end justify-center gap-1.5">
                      <span className="text-[1.85rem] font-semibold leading-none tracking-[-0.04em]">
                        ${price}
                      </span>
                      <span className="text-xs text-muted-foreground">{priceSuffix}</span>
                    </div>
                    {showAnnual && savings ? (
                      <p className="mt-1 text-xs text-muted-foreground">{savings} vs monthly</p>
                    ) : plan.price_usd_annual > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {savings
                          ? `or $${plan.price_usd_annual}/yr, ${savings}`
                          : `or $${plan.price_usd_annual}/yr`}
                      </p>
                    ) : null}
                    <ul className="mx-auto mt-3 w-full flex-1 space-y-1.5 text-left text-[12px] leading-5">
                      {highlights.map((feature) => (
                        <li key={feature} className="flex gap-2">
                          <Check
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                            aria-hidden="true"
                          />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      to={path}
                      className={`mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-semibold transition ${
                        featured ? "marketing-btn-primary border-0" : "marketing-btn-secondary"
                      }`}
                    >
                      {showAnnual ? ctaAnnual : ctaMonthly}{" "}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </article>
                );
              },
            )}
          </div>

          <p className="mx-auto mt-4 max-w-3xl text-center text-xs leading-5 text-muted-foreground">
            Included usage is shown per month. Extra voice is {TOPUP_RATE}, prepaid. No automatic
            overages. Live phone and email setup depend on account eligibility and availability.
          </p>

          <article
            id="scale"
            className="mt-2 flex scroll-mt-24 flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-border bg-card px-5 py-3 text-center lg:flex-row lg:justify-between lg:text-left"
          >
            <div className="flex items-center gap-2.5">
              <h2 className="wl-card-title">Scale &amp; Enterprise</h2>
              <span className="text-sm text-muted-foreground">Custom</span>
            </div>
            <p className="text-[13px] leading-5 text-muted-foreground lg:flex-1 lg:px-6">
              25+ live Bot capacity, tailored voice, text, email, and data usage, custom telephony
              and integrations, security, rollout, and support plan
            </p>
            <Link
              to="/contact?topic=enterprise"
              className="marketing-btn-secondary inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-semibold transition"
            >
              Design a Scale Plan <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </article>

          <details className="pricing-more group mx-auto mt-2 w-full max-w-5xl text-left">
            <summary className="pricing-more__summary wl-focus-ring-halo mx-auto flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-lg text-center text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground marker:hidden">
              Usage details &amp; FAQs
              <ChevronDown
                className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </summary>
            <div className="pricing-more__body mt-3">
              <p className="mx-auto mb-4 max-w-3xl text-center text-sm leading-6 text-muted-foreground">
                Runtime Allowance covers optional texts and generated work. The managed AI allowance
                covers AI, research, and enrichment. Annual plans receive a full year of Runtime
                Allowance at the start of the billing period.
              </p>
              <p className="mx-auto max-w-4xl text-center text-xs leading-5 text-muted-foreground">
                <span className="font-semibold text-foreground">On every paid plan:</span>{" "}
                {SHARED_PAID_FEATURES.join(". ")}
              </p>
              <h2 className="wl-public-section-heading mx-auto text-center">
                Your Bot. No seat tax. Clear costs.
              </h2>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {CHANNEL_RULES.map(({ title, body }) => (
                  <article
                    key={title}
                    className="rounded-[var(--radius-xl)] border border-border bg-card p-4 text-center"
                  >
                    <h3 className="wl-card-title">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
                  </article>
                ))}
              </div>
              <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-6 text-muted-foreground">
                Every plan enforces calling-hour rules, Do Not Call checks before marketing dials,
                and instant opt-out honoring in the runtime.{" "}
                <Link
                  to="/trust"
                  className="font-semibold text-primary underline underline-offset-4"
                >
                  Read the Trust Center
                </Link>
                .
              </p>
              <h2 className="wl-public-section-heading mx-auto mt-6 text-center">Before launch</h2>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {FAQ.map(([question, answer]) => (
                  <details
                    key={question}
                    className="group h-fit rounded-xl border border-border bg-card px-4 py-3 text-left"
                  >
                    <summary className="cursor-pointer list-none text-[13px] font-semibold leading-5 text-foreground marker:hidden">
                      {question}
                    </summary>
                    <p className="mt-2 text-[13px] leading-[1.6] text-muted-foreground">{answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </details>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
