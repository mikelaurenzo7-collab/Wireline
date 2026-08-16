import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  Check,
  Crosshair,
  Mail,
  MessageSquareText,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";
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
    eyebrow: "Put your voice agent live",
    tagline: "Your Voice Agent from $19/month.",
    detail:
      "One focused voice agent for inbound, outbound, or scheduling, with an included Wireline number.",
    ctaMonthly: "Start for $19",
    ctaAnnual: "Start for $190/yr",
    ctaPath: "/signup?plan=starter",
    icon: Sparkles,
    featured: false,
    badge: "Lowest cost live plan",
  },
  {
    plan: planById.team,
    publicName: "Starter Plus",
    eyebrow: "Founder hybrid",
    tagline: "Personal Concierge + business voice agent from $39/month.",
    detail: `Two live agents, two numbers, ${planById.team.voice_minutes_monthly} voice minutes, Lead Hunt, inbox, SMS, and email.`,
    ctaMonthly: "Choose Starter Plus",
    ctaAnnual: "Choose annual Starter Plus",
    ctaPath: "/signup?plan=team",
    icon: Crosshair,
    featured: true,
    badge: "Best founder value",
  },
  {
    plan: planById.business,
    publicName: "Pro",
    eyebrow: "For a growing operation",
    tagline: "Five specialized agents. One supervised workspace.",
    detail: "Up to five specialized agents with shared routing, approvals, and analytics.",
    ctaMonthly: "Go Pro",
    ctaAnnual: "Go Pro annually",
    ctaPath: "/signup?plan=business",
    icon: Users,
    featured: false,
    badge: "Multi agent",
  },
] as const;

/**
 * Features every paid tier lists verbatim, computed rather than hand-listed so
 * a catalog edit cannot leave this out of step.
 *
 * Three lines (the +$15/mo add-agent rate, the post-call record, and "no
 * automatic overages") were printed identically on Starter, Starter Plus and
 * Pro. At four columns each wrapped to two or three lines, so one shared fact
 * cost roughly 130 vertical pixels three times over, and a visitor comparing
 * plans had to read the same sentence three times to discover it did not
 * differentiate them. Stated once, under the grid, it reads as what it is: a
 * property of the product, not of a tier.
 */
const PAID_PLAN_FEATURES: readonly (readonly string[])[] = PAID_TIERS.map(
  ({ plan }) => plan.features,
);
const SHARED_PAID_FEATURES = PAID_PLAN_FEATURES[0].filter((feature) =>
  PAID_PLAN_FEATURES.every((features) => features.includes(feature)),
);
const isSharedPaidFeature = (feature: string) => SHARED_PAID_FEATURES.includes(feature);

const CHANNEL_RULES = [
  {
    icon: PhoneCall,
    title: "Voice + included number",
    body: `A Wireline number on every paid plan. Extra minutes stay prepaid at ${TOPUP_RATE}; live calls never cut mid conversation.`,
  },
  {
    icon: MessageSquareText,
    title: "Text / SMS",
    body: "The same agent continues by text. Consent and spend stay visible, billed by segment.",
  },
  {
    icon: Mail,
    title: "Email",
    body: "Connect Gmail, Outlook, iCloud, or your own stack. Your provider's limits stay authoritative.",
  },
  {
    icon: Crosshair,
    title: "Lead Hunt",
    body: "Research a niche, enrich targets, and hand them to the same agent. On every paid plan.",
  },
] as const;

const FAQ = [
  [
    "Does one agent handle voice, SMS, and email?",
    "Yes. A single Wireline agent can call, text, and email under one business identity, memory, rule set, approval posture, and outcome record. Additional agents add concurrency or specialized roles, not basic channels.",
  ],
  [
    "Is the Wireline number free?",
    "Every paid plan includes a Wireline number at no extra line fee. Free Builder is a private creation and simulation tier; production numbers and paid provider actions unlock after activation.",
  ],
  [
    "Why are there two Starter plans?",
    "Starter is the lowest risk way to put one Voice Agent live. Starter Plus is the founder hybrid: personal Concierge plus a business voice agent, two number slots, more voice minutes, and the fuller Lead Hunt, inbox, email, SMS, and automation experience.",
  ],
  [
    "Does every agent automatically create a phone number cost?",
    "No. Plans provide number slots, but Wireline provisions production numbers only when needed. Unused agent capacity does not create unnecessary carrier spend.",
  ],
  [
    "What happens when included voice minutes run out?",
    `New live work draws prepaid Runtime Balance at ${TOPUP_RATE}, never a surprise postpaid bill. Add balance, wait for renewal, or upgrade. An active call is never cut off; only the next new action pauses until coverage is restored.`,
  ],
  [
    "Are live calls limited to a few seconds?",
    "No. Calls run as long as the conversation needs. Included monthly minutes and prepaid Runtime Balance fund duration; there is no artificial short hard cap for profitability. Separate mid call web research tools use a short network timeout so callers are not left waiting in silence.",
  ],
  [
    "What is Live Video?",
    "Live Video is an optional $19/month add-on for paid business workspaces. It puts a selected business agent on screen with 60 reserved allowance minutes each month, a five-minute wall-clock ceiling per session, and no automatic overage. The default Wireline voice reserves five allowance minutes per session; optional presenter-managed modes can reserve ten.",
  ],
  [
    "Why keep live usage prepaid?",
    "Calls and messages carry real carrier and AI costs. One subscription unlocks every channel, included capacity gets you live, and extra provider usage stays prepaid and visible.",
  ],
  [
    "Can I cancel or get a refund?",
    "Yes. Paid plans are month to month by default, with no long term contract. Cancel in Stripe anytime; access continues through the current billing period. Email support@trywireline.com within 30 days of your first paid invoice if the plan wasn't the right fit.",
  ],
  [
    "What is the Scale plan?",
    "Scale is a custom committed usage agreement for organizations needing 25 or more agents, negotiated channel economics, SSO, custom integrations, security review, retention controls, implementation support, or SLAs. See the Scale card above.",
  ],
] as const;

const pricingJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "OfferCatalog",
      name: "Wireline Voice Agents pricing",
      url: "https://trywireline.com/pricing",
      itemListElement: [
        {
          "@type": "Offer",
          name: "Wireline Free Builder",
          price: 0,
          priceCurrency: "USD",
          description: "Build, train, and privately simulate one Voice Agent.",
        },
        ...PAID_TIERS.map(({ plan, publicName, detail }) => ({
          "@type": "Offer",
          name: `Wireline ${publicName}`,
          price: plan.price_usd_monthly,
          priceCurrency: "USD",
          description: detail,
        })),
        {
          "@type": "Offer",
          name: "Wireline Live Video add-on",
          price: 19,
          priceCurrency: "USD",
          description:
            "Optional business-agent Live Video with 60 reserved allowance minutes monthly, five-minute wall-clock session ceilings, and a disclosed five- or ten-minute allowance reservation depending on voice mode.",
        },
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
        title="Pricing | Wireline Voice Agents from $19/month"
        description="Build a voice agent free, launch from $19/month, and optionally add Live Video for business agents. Included numbers, voice capacity, SMS, email, Lead Hunt, and prepaid usage controls stay clear."
        path="/pricing"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      <PrecisionPublicHeader />

      <main id="main-content" className="marketing-flow" tabIndex={-1}>
        {/*
          The pricing page has no hero, on purpose.

          It used to open with a three-line display headline carrying the whole
          price story ("Build free. Go live from $19/mo. Scale when it pays"),
          its own pair of CTAs, and then a *second* full-size headline directly
          beneath it: roughly 450 vertical pixels spent restating, in prose,
          numbers that four cards state exactly, eight hundred pixels further
          down. On a pricing page the plans are the content and the plan buttons
          are the call to action; a hero can only delay both.

          What stands in its place is a mast: the page's name, the one control
          it owns, and the one fact that is true of every card and printed on
          none of them. It uses the full width, it is 44px tall, and every plan
          is above the fold behind it.
        */}
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

              {/* The one thing true of every paid card and printed on none of
                  them. It earns the third slot of the mast because it answers
                  the question the grid otherwise leaves open. */}
              <p className="text-xs text-muted-foreground">
                Every paid plan includes a Wireline number
              </p>
            </div>

            <div className="mt-4 grid items-stretch gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              <article className="flex flex-col rounded-[var(--radius-xl)] border border-border bg-card p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <WalletCards className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h3 className="wl-card-title">Free Builder</h3>
                </div>
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
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/signup?plan=personal"
                  className="marketing-btn-secondary mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-semibold transition"
                >
                  Build free <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </article>

              {PAID_TIERS.map(
                ({ plan, publicName, ctaMonthly, ctaAnnual, ctaPath, icon: Icon, featured }) => {
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
                      <div className="flex items-center justify-center gap-2">
                        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                        <h3 className="wl-card-title">{publicName}</h3>
                      </div>
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
                          .filter((f) => !isSharedPaidFeature(f))
                          .map((feature) => (
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

            <article
              id="scale"
              className="mt-2 flex scroll-mt-24 flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-border bg-card px-5 py-3 text-center lg:flex-row lg:justify-between lg:text-left"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <h3 className="wl-card-title">Scale &amp; Enterprise</h3>
                <span className="text-sm text-muted-foreground">Custom</span>
              </div>
              <p className="text-[13px] leading-5 text-muted-foreground lg:flex-1 lg:px-6">
                25+ live agent capacity, committed voice, SMS, email, and data economics, custom
                telephony and integrations, security, rollout, and support plan
              </p>
              <Link
                to="/contact?topic=enterprise"
                className="marketing-btn-secondary inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-semibold transition"
              >
                Design a Scale Plan <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </article>

            <div className="mx-auto mt-2 flex max-w-3xl flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card/60 px-4 py-2 text-center text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Live Video $19/mo</span>
              <span>60 reserved minutes</span>
              <span>5-minute session max</span>
              <span>no automatic overage</span>
            </div>

            <details className="pricing-more mx-auto mt-2 w-full max-w-5xl text-left">
              <summary className="pricing-more__summary mx-auto flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground marker:hidden">
                Channel rules and launch questions
              </summary>
              <div className="pricing-more__body mt-3">
                <p className="mx-auto max-w-4xl text-center text-xs leading-5 text-muted-foreground">
                  <span className="font-semibold text-foreground">On every paid plan:</span>{" "}
                  {SHARED_PAID_FEATURES.join(". ")}
                </p>
                <h2 className="wl-public-section-heading mx-auto text-center">
                  One voice agent. No seat tax. Clear costs
                </h2>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {CHANNEL_RULES.map(({ icon: Icon, title, body }) => (
                    <article
                      key={title}
                      className="rounded-[var(--radius-xl)] border border-border bg-card p-4 text-center"
                    >
                      <Icon className="mx-auto h-5 w-5 text-primary" aria-hidden="true" />
                      <h3 className="wl-card-title mt-2">{title}</h3>
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
