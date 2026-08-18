import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Check } from "lucide-react";
import MarketingChromeBar from "../components/marketing/MarketingChromeBar";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import { PageMeta } from "../lib/page-meta";
import { FLAT_OVERAGE_PER_MIN_USD, STRIPE_PLANS, type StripePlanId } from "../lib/plan-catalog";
import { cn } from "../lib/utils";

const TOPUP_RATE = `$${FLAT_OVERAGE_PER_MIN_USD.toFixed(2)}/min`;

const planById = Object.fromEntries(STRIPE_PLANS.map((plan) => [plan.id, plan])) as Record<
  StripePlanId,
  (typeof STRIPE_PLANS)[number]
>;

/**
 * The catalog keeps legacy `agent` wording while Stripe products and stored
 * entitlements migrate. Public pricing renders the unified Bot model now.
 */
const BOT_FEATURE_OVERRIDES: Record<string, string> = {
  "1 private draft communications agent": "1 private draft Bot",
  "Agent setup, training, knowledge, and private simulation":
    "Bot setup, playbook, knowledge, and private simulation",
  "1 live communications agent": "1 live Bot in one workspace",
  "Voice, SMS, and email under one agent identity":
    "Voice, text, and email under one Bot identity",
  "2 live agents, personal Concierge + business voice agent":
    "2 live Bots for distinct roles in one workspace",
  "Up to 5 live communications agents": "Up to 5 live Bots in one workspace",
  "Up to 15 live communications agents": "Up to 15 live Bots in one workspace",
  "+$15/mo per additional live agent adds 50 guaranteed voice minutes and 1 number slot":
    "+$15/mo per additional Bot adds 50 guaranteed voice minutes and 1 number slot",
};

function publicFeature(feature: string): string {
  return (
    BOT_FEATURE_OVERRIDES[feature] ??
    feature.replace(/\bagents\b/gi, "Bots").replace(/\bagent\b/gi, "Bot")
  );
}

/** Honest annual savings vs paying monthly for 12 months. */
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
    eyebrow: "One Bot",
    tagline: "One Bot from $19/month",
    detail:
      "One configurable Bot for any role, with voice, text, email, and an included Wireline number.",
    ctaMonthly: "Start for $19",
    ctaAnnual: "Start for $190/yr",
    ctaPath: "/signup?plan=starter",
    featured: false,
    badge: "Lowest Cost Live Plan",
  },
  {
    plan: planById.team,
    publicName: "Starter Plus",
    eyebrow: "More Capacity",
    tagline: "Two Bots. One Workspace. More Capacity",
    detail: `Two configurable Bots for distinct roles, two number slots, ${planById.team.voice_minutes_monthly} voice minutes, Lead Hunt, inbox, text, and email.`,
    ctaMonthly: "Choose Starter Plus",
    ctaAnnual: "Choose Annual Starter Plus",
    ctaPath: "/signup?plan=team",
    featured: true,
    badge: "Best Founder Value",
  },
  {
    plan: planById.business,
    publicName: "Pro",
    eyebrow: "Specialized Roles",
    tagline: "Five Specialized Bots. One Workspace",
    detail: "Up to five specialized Bots with shared routing, approvals, knowledge, and analytics.",
    ctaMonthly: "Go Pro",
    ctaAnnual: "Go Pro Annually",
    ctaPath: "/signup?plan=business",
    featured: false,
    badge: "Multi Bot",
  },
] as const;

const PAID_PLAN_FEATURES: readonly (readonly string[])[] = PAID_TIERS.map(
  ({ plan }) => plan.features,
);
const SHARED_PAID_FEATURES = PAID_PLAN_FEATURES[0].filter((feature) =>
  PAID_PLAN_FEATURES.every((features) => features.includes(feature)),
);
const isSharedPaidFeature = (feature: string) => SHARED_PAID_FEATURES.includes(feature);

const CHANNEL_RULES = [
  {
    title: "Voice + Included Number",
    body: `A Wireline number on every paid plan. Extra minutes stay prepaid at ${TOPUP_RATE}; live calls never cut mid conversation.`,
  },
  {
    title: "Text / SMS",
    body: "The same Bot continues by text. Consent and spend stay visible, billed by segment.",
  },
  {
    title: "Email",
    body: "Connect Gmail, Outlook, iCloud, or your own stack. Your provider's limits stay authoritative.",
  },
  {
    title: "Lead Hunt",
    body: "Research a niche, enrich targets, and hand them to the same Bot. Available on every paid plan.",
  },
] as const;

const FAQ = [
  [
    "Can one Bot handle voice, text, and email?",
    "Yes. One Wireline Bot can call, text, and email under one identity, memory, playbook, rule set, approval posture, and outcome record. Connect only the channels the job needs.",
  ],
  [
    "Why would I add another Bot?",
    "Add another Bot for more concurrency or a genuinely separate role, such as a Receptionist and a Sales Associate. You never need a second Bot just because one use case is personal and another is for work.",
  ],
  [
    "Is the Wireline number free?",
    "Every paid plan includes a Wireline number at no extra line fee. Free Builder is a private creation and simulation tier; production numbers and paid provider actions unlock after activation.",
  ],
  [
    "Why are there two Starter plans?",
    "Starter puts one Bot live. Starter Plus adds a second Bot, a second number slot, more voice capacity, and the fuller Lead Hunt, inbox, text, email, and automation experience in the same workspace.",
  ],
  [
    "Does every Bot automatically create a phone number cost?",
    "No. Plans provide number slots, but Wireline provisions production numbers only when needed. Unused Bot capacity does not create unnecessary carrier spend.",
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
    "Calls and messages carry real carrier and AI costs. One subscription unlocks every channel, included capacity gets you live, and extra provider usage stays prepaid and visible.",
  ],
  [
    "Can I cancel or get a refund?",
    "Yes. Paid plans are month to month by default, with no long-term contract. Cancel in Stripe anytime; access continues through the current billing period. Email support@trywireline.com within 30 days of your first paid invoice if the plan wasn't the right fit.",
  ],
  [
    "What is the Scale plan?",
    "Scale is a custom committed usage agreement for organizations needing 25 or more Bots, negotiated channel economics, SSO, custom integrations, security review, retention controls, implementation support, or SLAs.",
  ],
] as const;

const pricingJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "OfferCatalog",
      name: "Wireline Bot pricing",
      url: "https://trywireline.com/pricing",
      itemListElement: [
        {
          "@type": "Offer",
          name: "Wireline Free Builder",
          price: 0,
          priceCurrency: "USD",
          description: "Build, configure, and privately simulate one Bot.",
        },
        ...PAID_TIERS.map(({ plan, publicName, detail }) => ({
          "@type": "Offer",
          name: `Wireline ${publicName}`,
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
    <div className="marketing-surface wl-pricing-page bg-background text-foreground">
      <PageMeta
        title="Pricing | Build a Wireline Bot from $19/month"
        description="Build a Bot free and launch from $19/month. One workspace, configurable roles, included numbers, voice capacity, text, email, Lead Hunt, and prepaid usage controls."
        path="/pricing"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      <PrecisionPublicHeader />

      <main id="main-content" className="marketing-flow" tabIndex={-1}>
        <section id="plans" className="marketing-section marketing-section--screen">
          <div className="wl-public-rail mx-auto max-w-[1500px]">
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-b border-border pb-3 lg:justify-between">
              <p className="wl-eyebrow text-muted-foreground">Pricing</p>

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

              <p className="text-xs text-muted-foreground">
                Every paid plan includes a Wireline number
              </p>
            </div>

            <div className="mt-4 grid items-stretch gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              <article className="flex flex-col rounded-[var(--radius-xl)] border border-border bg-card p-4 text-center">
                <h3 className="wl-card-title">Free Builder</h3>
                <div className="mt-3 flex items-end justify-center gap-1.5">
                  <span className="text-[1.85rem] font-semibold leading-none tracking-[-0.04em]">
                    $0
                  </span>
                  <span className="text-xs text-muted-foreground">forever</span>
                </div>
                <ul className="mx-auto mt-3 w-full flex-1 space-y-1.5 text-left text-[12px] leading-5">
                  {planById.personal.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span>{publicFeature(feature)}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/signup?plan=personal"
                  className="marketing-btn-secondary mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-semibold transition"
                >
                  Build Free <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </article>

              {PAID_TIERS.map(
                ({ plan, publicName, ctaMonthly, ctaAnnual, ctaPath, featured }) => {
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
                          aria-label="Most popular plan"
                        >
                          Most Popular
                        </span>
                      ) : null}
                      <h3 className="wl-card-title">{publicName}</h3>
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
                        {plan.features
                          .filter((feature) => !isSharedPaidFeature(feature))
                          .map((feature) => (
                            <li key={feature} className="flex gap-2">
                              <Check
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                                aria-hidden="true"
                              />
                              <span>{publicFeature(feature)}</span>
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

            <article
              id="scale"
              className="mt-2 flex scroll-mt-24 flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-border bg-card px-5 py-3 text-center lg:flex-row lg:justify-between lg:text-left"
            >
              <div className="flex items-center gap-2.5">
                <h3 className="wl-card-title">Scale &amp; Enterprise</h3>
                <span className="text-sm text-muted-foreground">Custom</span>
              </div>
              <p className="text-[13px] leading-5 text-muted-foreground lg:flex-1 lg:px-6">
                25+ Bot capacity, committed voice, text, email, and data economics, custom
                telephony and integrations, security, rollout, and support plan
              </p>
              <Link
                to="/contact?topic=enterprise"
                className="marketing-btn-secondary inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-semibold transition"
              >
                Design a Scale Plan <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </article>

            <details className="pricing-more mx-auto mt-2 w-full max-w-5xl text-left">
              <summary className="pricing-more__summary mx-auto flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground marker:hidden">
                Channel Rules and Launch Questions
              </summary>
              <div className="pricing-more__body mt-3">
                <p className="mx-auto max-w-4xl text-center text-xs leading-5 text-muted-foreground">
                  <span className="font-semibold text-foreground">On every paid plan:</span>{" "}
                  {SHARED_PAID_FEATURES.map(publicFeature).join(". ")}
                </p>
                <h2 className="wl-public-section-heading mx-auto text-center">
                  One Bot, Every Channel, Clear Costs
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
                <h2 className="wl-public-section-heading mx-auto mt-6 text-center">Before Launch</h2>
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {FAQ.map(([question, answer]) => (
                    <details
                      key={question}
                      className="group h-fit rounded-xl border border-border bg-card px-4 py-3 text-left"
                    >
                      <summary className="cursor-pointer list-none text-[13px] font-semibold leading-5 text-foreground marker:hidden">
                        {question}
                      </summary>
                      <p className="mt-2 text-[13px] leading-[1.6] text-muted-foreground">
                        {answer}
                      </p>
                    </details>
                  ))}
                </div>
              </div>
            </details>
          </div>
        </section>
      </main>

      <MarketingChromeBar />
    </div>
  );
}
