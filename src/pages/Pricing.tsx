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

const PAID_TIERS = [
  {
    plan: planById.starter,
    publicName: "Starter",
    eyebrow: "Try one live lane",
    tagline: "A real agent at a price almost any owner can test.",
    detail:
      "Launch one tightly focused agent for inbound coverage, follow-up, appointment setting, or lead qualification without committing to a larger operating plan.",
    cta: "Start for $9",
    ctaPath: "/signup?plan=starter",
    icon: Sparkles,
    featured: false,
    badge: "Lowest-cost live plan",
  },
  {
    plan: planById.team,
    publicName: "Starter Plus",
    eyebrow: "More room for one agent",
    tagline: "The strongest one-agent launch plan.",
    detail:
      "Keep one agent, but add substantially more voice capacity plus the full Lead Hunt, enrichment, inbox, email, and SMS workflow surface.",
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
    tagline: "Five specialized agents, one supervised workspace.",
    detail:
      "Run separate agents for inbound conversion, outbound follow-up, lead revival, scheduling, support, or front-desk work with shared routing and approvals.",
    cta: "Go Pro",
    ctaPath: "/signup?plan=business",
    icon: Users,
    featured: false,
    badge: "Multi-agent",
  },
  {
    plan: planById.enterprise,
    publicName: "Business",
    eyebrow: "For serious operators",
    tagline: "A complete AI communications workforce.",
    detail:
      "Deploy up to fifteen purpose-built agents across sales, service, operations, recovery, support, and multiple business lines with stronger governance and analytics.",
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
    title: "Voice",
    body: "Included pooled minutes are used first. Additional completed usage draws only from prepaid Conversation Balance. Active calls finish normally; the next call pauses if coverage is depleted.",
  },
  {
    icon: MessageSquareText,
    title: "SMS",
    body: "Carrier and messaging API usage draws from Conversation Balance by segment. This protects both sides from unlimited-message economics and keeps campaign spend visible.",
  },
  {
    icon: Mail,
    title: "Email",
    body: "Connected Gmail, Outlook, Yahoo, iCloud, or customer email infrastructure retains its provider limits and reputation controls. Platform-funded sending or enrichment can draw from prepaid balance.",
  },
  {
    icon: Crosshair,
    title: "Lead Hunt",
    body: "Available on every paid plan. Wireline can research a precise niche, build tailored prospect criteria, enrich connected data, and hand qualified targets to sales agents. Paid data-provider work is prepaid or customer-connected.",
  },
] as const;

const FAQ = [
  [
    "Why are there two Starter plans?",
    "Starter is the lowest-risk way to put one agent live. Starter Plus keeps the same one-agent limit but supplies much more monthly voice capacity and the fuller lead-hunting and multichannel workflow experience.",
  ],
  [
    "Does every agent automatically create a phone-number cost?",
    "No. Plans provide number slots, but Wireline provisions production numbers when they are actually needed. Unused agent capacity does not need to create unnecessary carrier spend.",
  ],
  [
    "Is Lead Hunt included?",
    "Lead Hunt access is included with every paid plan. Research and qualification can use Wireline intelligence, connected customer sources, or prepaid provider-backed data and enrichment.",
  ],
  [
    "What happens when included voice minutes run out?",
    "New live work uses prepaid Conversation Balance. Wireline does not silently add a postpaid metered line item. You can add balance, enable an auto-refill rule, wait for renewal, or upgrade.",
  ],
  [
    "Can Wireline send unlimited email or SMS?",
    "No responsible communications platform should promise uncontrolled outreach. Email follows the connected provider's limits and reputation policies. SMS and provider-funded actions are metered through prepaid balance, with consent and compliance controls remaining authoritative.",
  ],
  [
    "What is the Scale plan?",
    "Scale is a custom committed-usage agreement for organizations needing 25 or more agents, negotiated channel economics, SSO, custom integrations, security review, retention controls, implementation support, or SLAs.",
  ],
] as const;

const assurances = [
  {
    icon: Check,
    label: "Build free",
    detail: "Train and simulate one private draft agent before paying.",
  },
  {
    icon: CircleDollarSign,
    label: "No surprise overages",
    detail: "Variable provider usage is prepaid, not silently invoiced.",
  },
  {
    icon: Crosshair,
    label: "Lead Hunt on paid plans",
    detail: "Research, qualify, enrich, then hand prospects to sales agents.",
  },
  {
    icon: ShieldCheck,
    label: "Controlled execution",
    detail: "Approvals, consent, spend controls, logs, and outcomes remain visible.",
  },
] as const;

const pricingJsonLd = {
  "@context": "https://schema.org",
  "@type": "OfferCatalog",
  name: "Wireline founder pricing",
  url: "https://trywireline.com/pricing",
  itemListElement: [
    {
      "@type": "Offer",
      name: "Wireline Free Builder",
      price: 0,
      priceCurrency: "USD",
      description: "Build, train, and privately simulate one AI communications agent.",
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
        title="Pricing | Wireline — Build free, go live from $9/month"
        description="Build an AI communications agent free, launch from $9/month, and scale across voice, text, email, and tailored lead hunting with prepaid usage controls."
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
          title="Build free. Launch for $9. Scale when it pays for itself."
          description="Pick the smallest plan that does real work today. Every call, text, and email runs on included usage plus prepaid Conversation Balance — the bill never surprises you, and you scale only when the results earn it."
          primaryAction={{ label: "Build your first agent", to: "/signup?plan=personal" }}
          secondaryAction={{ label: "Compare every plan", to: "#plans", tone: "secondary" }}
          proof={assurances.map(({ label }) => label)}
        />

        <section id="plans" className="px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail mx-auto max-w-[1500px]">
            <div className="mx-auto max-w-3xl text-center">
              <p className="wl-stitch-label">Plans for different stages</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                Start narrow. Add specialists when demand earns them.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Every paid plan can hunt leads and operate across connected channels. Higher tiers
                primarily buy more simultaneous agent roles, number slots, voice capacity,
                collaboration, analytics, and governance.
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
                  Build, train, connect knowledge, and privately simulate one draft agent.
                  Production numbers and paid provider actions remain locked until activation.
                </p>
                <ul className="mx-auto mt-6 max-w-md space-y-3 text-left text-sm">
                  {planById.personal.features.map((feature) => (
                    <li key={feature} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
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
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card"
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <div>
                        <p className={`wl-stitch-label ${featured ? "text-background/70" : ""}`}>
                          {eyebrow}
                        </p>
                        <h3 className="mt-2 text-2xl font-semibold">{publicName}</h3>
                      </div>
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <p
                      className={`mt-3 text-sm font-semibold ${featured ? "text-background" : "text-foreground"}`}
                    >
                      {tagline}
                    </p>
                    <div className="mt-5 flex items-end justify-center gap-2">
                      <span className="text-4xl font-semibold tracking-[-0.04em]">
                        ${plan.price_usd_monthly}
                      </span>
                      <span
                        className={`pb-1 text-sm ${featured ? "text-background/70" : "text-muted-foreground"}`}
                      >
                        /month
                      </span>
                    </div>
                    <p
                      className={`mt-2 text-xs ${featured ? "text-background/70" : "text-muted-foreground"}`}
                    >
                      ${plan.price_usd_annual}/year · two months free
                    </p>
                    <p
                      className={`mt-4 text-sm leading-6 ${featured ? "text-background/75" : "text-muted-foreground"}`}
                    >
                      {detail}
                    </p>
                    <ul className="mx-auto mt-6 max-w-md space-y-3 text-left text-sm">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex gap-3">
                          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      to={ctaPath}
                      className={`mt-8 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${
                        featured
                          ? "bg-background text-foreground hover:bg-background/90"
                          : "bg-foreground text-background hover:bg-foreground/90"
                      }`}
                    >
                      {cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    <p
                      className={`mt-3 text-center text-xs ${featured ? "text-background/60" : "text-muted-foreground"}`}
                    >
                      {badge}
                    </p>
                  </article>
                ),
              )}

              <article className="rounded-[28px] border border-border bg-card p-6 text-center shadow-sm">
                <div className="flex flex-col items-center justify-center gap-3 text-center">
                  <div>
                    <p className="wl-stitch-label">25+ agents or custom needs</p>
                    <h3 className="mt-2 text-2xl font-semibold">Scale & Enterprise</h3>
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
                    "25+ live agent capacity",
                    "Committed voice, SMS, email, and data economics",
                    "Custom telephony and integrations",
                    "Security, rollout, and support plan",
                  ].map((feature) => (
                    <li key={feature} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
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
              <p className="wl-stitch-label">Channel economics</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                Clear limits where real vendor costs exist.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Wireline does not punish users for creating useful specialized agents. It protects
                margin—and customer budgets—at the actual cost boundaries: numbers, calls, message
                segments, delivery infrastructure, enrichment, and external data.
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
              <p className="wl-stitch-label">Questions before launch</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                Predictable enough for owners. Flexible enough to grow.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Subscription revenue funds the platform and agent capacity. Prepaid balance funds
                variable provider work, keeping the offer clear without surprise overages.
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
          <div className="wl-public-rail mx-auto max-w-[1200px] rounded-[32px] border border-border bg-foreground p-8 text-background sm:p-12">
            <div className="grid justify-items-center gap-8 text-center">
              <div className="mx-auto max-w-3xl">
                <p className="wl-stitch-label text-background/65">Founder Early Access</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                  Build the agent first. Let real demand choose the plan.
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-background/70">
                  Start with a private build, launch one useful lane for $9, or select the capacity
                  your business already needs. Upgrade when agents are producing enough work to
                  justify it.
                </p>
              </div>
              <Link
                to="/signup?plan=personal"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-background px-6 text-sm font-semibold text-foreground transition hover:bg-background/90"
              >
                Build free <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
