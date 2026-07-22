import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Check,
  CircleDollarSign,
  Crosshair,
  Mail,
  MessageSquareText,
  PhoneCall,
  Radio,
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

const planById = Object.fromEntries(STRIPE_PLANS.map((plan) => [plan.id, plan])) as Record<
  StripePlanId,
  (typeof STRIPE_PLANS)[number]
>;

/** Honest annual savings vs paying monthly for 12 months (Starter is 1 month, most tiers 2). */
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
    eyebrow: "Put one employee live",
    tagline: "Your AI Voice Employee from $9/month.",
    detail:
      "Launch one focused employee for inbound coverage, outbound follow-up, appointment setting, lead qualification, SMS, or email—with an included Wireline number at no extra line fee.",
    cta: "Start for $9",
    ctaPath: "/signup?plan=starter",
    icon: Sparkles,
    featured: false,
    badge: "Lowest-cost live plan",
  },
  {
    plan: planById.team,
    publicName: "Starter Plus",
    eyebrow: "Best one-employee value",
    tagline: "2× the voice minutes, full SMS + Lead Hunt workflow — for $10 more.",
    detail:
      "Keep one AI Voice Employee, but add substantially more voice capacity plus Lead Hunt, enrichment, inbox, email, SMS, and follow-up workflows under one memory and one set of rules.",
    cta: "Choose Starter Plus",
    ctaPath: "/signup?plan=team",
    icon: Crosshair,
    featured: true,
    badge: "Best founder value",
  },
  {
    plan: planById.business,
    publicName: "Pro",
    eyebrow: "For a growing operation",
    tagline: "Five specialized employees. One supervised workspace.",
    detail:
      "Add dedicated employees for inbound conversion, outbound follow-up, lead revival, scheduling, support, or front-desk work while preserving shared routing, approvals, channel controls, and analytics.",
    cta: "Go Pro",
    ctaPath: "/signup?plan=business",
    icon: Users,
    featured: false,
    badge: "Multi-employee",
  },
  {
    plan: planById.enterprise,
    publicName: "Business",
    eyebrow: "For serious operators",
    tagline: "A complete AI conversation workforce.",
    detail:
      "Deploy up to fifteen purpose-built employees across sales, service, operations, recovery, support, and multiple business lines with stronger governance, analytics, and oversight.",
    cta: "Start Business",
    ctaPath: "/signup?plan=enterprise",
    icon: Building2,
    featured: false,
    badge: "High capacity",
  },
] as const;

const CHANNEL_RULES = [
  {
    icon: PhoneCall,
    title: "Voice + included number",
    body: "Every paid plan includes a Wireline number at no extra line fee and pooled voice minutes. Additional completed usage draws only from prepaid Conversation Balance. Active calls finish normally; new work pauses if coverage is depleted.",
  },
  {
    icon: MessageSquareText,
    title: "Text / SMS",
    body: "The same employee can continue the conversation by SMS. Carrier and messaging API usage draws from Conversation Balance by segment, keeping consent and campaign spend visible.",
  },
  {
    icon: Mail,
    title: "Email",
    body: "Connect Gmail, Outlook, iCloud, or customer email infrastructure. Yahoo inbox sync is planned. Provider limits and reputation controls remain authoritative; platform-funded sending or enrichment can draw from prepaid balance.",
  },
  {
    icon: Crosshair,
    title: "Lead Hunt",
    body: "Available on every paid plan. Wireline can research a niche, define prospect criteria, enrich connected data, and hand qualified targets to the same employee. Paid provider work is prepaid or customer-connected.",
  },
] as const;

const FAQ = [
  [
    "Does one employee handle voice, SMS, and email?",
    "Yes. A single Wireline employee can call, text, and email under one business identity, memory, rule set, approval posture, and outcome record. Additional employees are for concurrency or specialized roles—not to unlock basic channels.",
  ],
  [
    "Is the Wireline number free?",
    "Every paid plan includes a Wireline number at no extra line fee. Free Builder is a private creation and simulation tier; production numbers and paid provider actions unlock after activation.",
  ],
  [
    "Why are there two Starter plans?",
    "Starter is the lowest-risk way to put one AI Voice Employee live. Starter Plus keeps the same one-employee limit but supplies much more monthly voice capacity and the fuller Lead Hunt, inbox, email, SMS, and automation experience.",
  ],
  [
    "Does every employee automatically create a phone-number cost?",
    "No. Plans provide number slots, but Wireline provisions production numbers only when needed. Unused employee capacity does not create unnecessary carrier spend.",
  ],
  [
    "What happens when included voice minutes run out?",
    "New live work uses prepaid Conversation Balance. Wireline does not silently add a postpaid metered line item. Add balance, wait for renewal, or upgrade. An active call is never cut off for billing — only the next new action pauses until coverage is restored.",
  ],
  [
    "Are live calls limited to a few seconds?",
    "No. Calls run as long as the conversation needs. Included monthly minutes and prepaid Conversation Balance fund duration; there is no artificial short hard-cap for profitability. Separate mid-call web research tools use a short network timeout so callers are not left waiting in silence.",
  ],
  [
    "Why keep live usage prepaid?",
    "Calls and messages carry real carrier and AI costs. One subscription unlocks every channel, included capacity gets you live, and extra provider usage stays prepaid and visible.",
  ],
  [
    "Can I cancel or get a refund?",
    "Yes. Every paid plan is month-to-month by default with no long-term contract, and you can cancel from Stripe at any time — access continues through the end of the current billing period. Reach out at support@trywireline.com within 30 days of your first paid invoice if a plan wasn't the right fit and we'll make it right.",
  ],
  [
    "What is the Scale plan?",
    "Scale is a custom committed-usage agreement for organizations needing 25 or more employees, negotiated channel economics, SSO, custom integrations, security review, retention controls, implementation support, or SLAs. See the Scale card above.",
  ],
] as const;

const assurances = [
  {
    icon: WalletCards,
    label: "Build free",
    detail: "Train and simulate one private AI Voice Employee before paying.",
  },
  {
    icon: PhoneCall,
    label: "Number included",
    detail: "Every paid employee can claim a Wireline number at no extra line fee.",
  },
  {
    icon: CircleDollarSign,
    label: "No surprise bills",
    detail: "Variable provider usage is prepaid, not silently invoiced.",
  },
  {
    icon: ShieldCheck,
    label: "Spend controls",
    detail: "Approvals, consent, spend controls, logs, and outcomes remain visible.",
  },
  {
    icon: Radio,
    label: "Cancel anytime",
    detail: "Month-to-month by default. Cancel in Stripe with no lock-in.",
  },
] as const;

const pricingJsonLd = {
  "@context": "https://schema.org",
  "@type": "OfferCatalog",
  name: "Wireline AI Voice Employee pricing",
  url: "https://trywireline.com/pricing",
  itemListElement: [
    {
      "@type": "Offer",
      name: "Wireline Free Builder",
      price: 0,
      priceCurrency: "USD",
      description: "Build, train, and privately simulate one AI Voice Employee.",
    },
    ...PAID_TIERS.map(({ plan, publicName, detail }) => ({
      "@type": "Offer",
      name: `Wireline ${publicName}`,
      price: plan.price_usd_monthly,
      priceCurrency: "USD",
      description: detail,
    })),
  ],
};

export default function Pricing() {
  return (
    <div className="marketing-surface wl-pricing-page min-h-screen bg-background text-foreground">
      <PageMeta
        title="Pricing | Wireline AI Voice Employee from $9/month"
        description="Build an AI Voice Employee free, then launch from $9/month with an included Wireline number, voice capacity, SMS, email, Lead Hunt, and prepaid usage controls."
        path="/pricing"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      <PrecisionPublicHeader />

      <main id="main-content" className="pt-16" tabIndex={-1}>
        <MarketingHero
          eyebrow="Founder Early Access"
          title="Build Free. Launch for $9. Scale When It Pays."
          description="One subscription unlocks calls, texts, email, follow-up, and Lead Hunt—plus a number on every paid plan. Extra usage stays prepaid, never a surprise bill."
          primaryAction={{ label: "Launch for $9/mo", to: "/signup?plan=starter" }}
          secondaryAction={{
            label: "Build free first",
            to: "/signup?plan=personal",
            tone: "secondary",
          }}
          proof={assurances.slice(0, 3).map(({ label }) => label)}
        />

        <section id="plans" className="px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail mx-auto max-w-[1500px]">
            <div className="mx-auto max-w-3xl text-center">
              <p className="wl-overline text-primary">Plans for different stages</p>
              <h2 className="wl-public-section-heading mt-3">
                Start with one employee. Add specialists when demand earns them.
              </h2>
              <p className="wl-public-copy mx-auto mt-4">
                Every paid plan supports voice, SMS, and email for the same employee and includes a
                Wireline number slot. Higher tiers primarily buy more simultaneous roles, voice
                capacity, number slots, collaboration, analytics, and governance.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <article className="rounded-[28px] border border-border bg-card p-6 text-center shadow-sm">
                <div className="flex flex-col items-center justify-center gap-3 text-center">
                  <div>
                    <p className="wl-stitch-label">Build before billing</p>
                    <h3 className="mt-2 text-2xl font-semibold">Free Builder</h3>
                  </div>
                  <WalletCards className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="mt-6 flex items-end justify-center gap-2">
                  <span className="text-4xl font-semibold tracking-[-0.04em]">$0</span>
                  <span className="pb-1 text-sm text-muted-foreground">forever</span>
                </div>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Build, train, connect knowledge, and privately simulate one AI Voice Employee.
                  Production numbers and paid provider actions remain locked until activation.
                </p>
                <ul className="mx-auto mt-6 max-w-md space-y-3 text-left text-sm">
                  {planById.personal.features.map((feature) => (
                    <li key={feature} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/signup?plan=personal"
                  className="mt-8 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-muted"
                >
                  Build free <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </article>

              {PAID_TIERS.map(
                ({
                  plan,
                  publicName,
                  eyebrow,
                  tagline,
                  detail,
                  cta,
                  ctaPath,
                  icon: Icon,
                  featured,
                  badge,
                }) => (
                  <article
                    key={plan.id}
                    className={`relative rounded-[28px] border p-6 text-center shadow-sm ${
                      featured
                        ? "border-primary/50 bg-card ring-2 ring-primary/45 shadow-lg xl:-translate-y-1"
                        : "border-border bg-card"
                    }`}
                  >
                    {featured ? (
                      <span
                        className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-foreground shadow-sm"
                        aria-label="Most popular plan"
                      >
                        Most popular
                      </span>
                    ) : null}
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <div>
                        <p className="wl-stitch-label">{eyebrow}</p>
                        <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                          {publicName}
                        </h3>
                      </div>
                      <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-foreground">{tagline}</p>
                    <div className="mt-5 flex items-end justify-center gap-2">
                      <span className="text-4xl font-semibold tracking-[-0.04em]">
                        ${plan.price_usd_monthly}
                      </span>
                      <span className="pb-1 text-sm text-muted-foreground">/month</span>
                    </div>
                    {plan.price_usd_annual > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {(() => {
                          const savings = annualSavingsLabel(
                            plan.price_usd_monthly,
                            plan.price_usd_annual,
                          );
                          return savings
                            ? `or $${plan.price_usd_annual}/yr · ${savings}`
                            : `or $${plan.price_usd_annual}/yr`;
                        })()}
                      </p>
                    ) : null}
                    <p className="mt-4 text-sm leading-6 text-muted-foreground">{detail}</p>
                    <ul className="mx-auto mt-6 max-w-md space-y-3 text-left text-sm">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex gap-3">
                          <Check
                            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                            aria-hidden="true"
                          />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      to={ctaPath}
                      className={`mt-8 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${
                        featured
                          ? "marketing-btn-primary border-0"
                          : "bg-foreground text-background hover:bg-foreground/90"
                      }`}
                    >
                      {cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    <p className="mt-3 text-center text-xs text-muted-foreground">
                      {featured ? "Cancel anytime · no long-term contract" : badge}
                    </p>
                  </article>
                ),
              )}

              <article
                id="scale"
                className="rounded-[28px] border border-border bg-card p-6 text-center shadow-sm scroll-mt-24"
              >
                <div className="flex flex-col items-center justify-center gap-3 text-center">
                  <div>
                    <p className="wl-stitch-label">25+ employees or custom needs</p>
                    <h3 className="mt-2 text-2xl font-semibold">Scale &amp; Enterprise</h3>
                  </div>
                  <ShieldCheck className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="mt-6 text-4xl font-semibold tracking-[-0.04em]">Custom</div>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Committed usage, negotiated channel economics, advanced governance, SSO, custom
                  integrations, implementation support, security review, retention controls, and
                  SLAs.
                </p>
                <ul className="mx-auto mt-6 max-w-md space-y-3 text-left text-sm">
                  {[
                    "25+ live employee capacity",
                    "Committed voice, SMS, email, and data economics",
                    "Custom telephony and integrations",
                    "Security, rollout, and support plan",
                  ].map((feature) => (
                    <li key={feature} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/contact?topic=enterprise"
                  className="mt-8 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-muted"
                >
                  Design a scale plan <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </article>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-muted/35 px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail mx-auto max-w-[1400px]">
            <div className="mx-auto max-w-3xl text-center">
              <p className="wl-overline text-primary">Channel economics</p>
              <h2 className="wl-public-section-heading mt-3">
                One employee. No channel seat tax. Clear usage costs.
              </h2>
              <p className="wl-public-copy mx-auto mt-4">
                One employee can call, text, and email under a single subscription. Costs track the
                real boundaries: numbers, calls, message segments, delivery, enrichment, and data.
              </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {CHANNEL_RULES.map(({ icon: Icon, title, body }) => (
                <article
                  key={title}
                  className="rounded-3xl border border-border bg-card p-6 text-center"
                >
                  <Icon className="mx-auto h-6 w-6" aria-hidden="true" />
                  <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail mx-auto max-w-[1000px]">
            <div className="mx-auto max-w-3xl text-center">
              <p className="wl-overline text-primary">Questions before launch</p>
              <h2 className="wl-public-section-heading mt-3">
                Predictable enough for owners. Flexible enough to grow.
              </h2>
              <p className="wl-public-copy mx-auto mt-4">
                Your subscription funds employee capacity. Prepaid balance funds variable provider
                work.
              </p>
            </div>
            <div className="mx-auto mt-10 max-w-3xl space-y-3">
              {FAQ.map(([question, answer]) => (
                <details
                  key={question}
                  className="group rounded-2xl border border-border bg-card p-5 text-center"
                >
                  <summary className="cursor-pointer list-none text-sm font-semibold">
                    {question}
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 pb-16 sm:px-8 sm:pb-24 lg:px-10">
          <div className="wl-public-rail mx-auto max-w-[1200px] rounded-[32px] marketing-ink-panel p-8 sm:p-12">
            <div className="grid justify-items-center gap-8 text-center">
              <div className="mx-auto max-w-3xl">
                <p className="wl-overline text-primary">Founder Early Access</p>
                <h2 className="wl-public-section-heading mt-3 text-[var(--wireline-color-text-primary)]">
                  Build the employee first. Let real demand choose the plan.
                </h2>
                <p className="marketing-ink-panel__soft mx-auto mt-4 max-w-2xl text-base leading-7">
                  Start with a private build, launch your AI Voice Employee for $9 with an included
                  number, then upgrade when completed work justifies more capacity or specialists.
                </p>
              </div>
              <Link
                to="/signup?plan=personal"
                className="marketing-btn-primary min-h-12 justify-center px-6 text-sm font-semibold"
              >
                Build your AI Voice Employee <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
