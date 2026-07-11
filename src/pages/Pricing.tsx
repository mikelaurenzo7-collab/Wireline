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
  type LucideIcon,
} from "lucide-react";
import MarketingFooter from "../components/marketing/MarketingFooter";
import MarketingHero from "../components/marketing/MarketingHero";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import { MARKETING_VOICE } from "../lib/product-copy";
import { PageMeta } from "../lib/page-meta";
import { STRIPE_PLANS, type StripePlanId } from "../lib/plan-catalog";

const planById = Object.fromEntries(STRIPE_PLANS.map((plan) => [plan.id, plan])) as Record<
  StripePlanId,
  (typeof STRIPE_PLANS)[number]
>;

type PaidTier = {
  plan: (typeof STRIPE_PLANS)[number];
  publicName: string;
  eyebrow: string;
  tagline: string;
  detail: string;
  cta: string;
  ctaPath: string;
  icon: LucideIcon;
  featured: boolean;
  badge: string;
};

const PAID_TIERS: readonly PaidTier[] = [
  {
    plan: planById.starter,
    publicName: "Starter",
    eyebrow: "Try one live employee",
    tagline: "One AI employee across voice, email, and text/SMS.",
    detail:
      "Launch one tightly focused employee for inbound coverage, follow-up, appointment setting, or lead qualification. Connect the channels the job needs; you do not need separate employees to unlock email or SMS.",
    cta: "Start for $9",
    ctaPath: "/signup?plan=starter",
    icon: Sparkles,
    featured: false,
    badge: "Lowest-cost live plan",
  },
  {
    plan: planById.team,
    publicName: "Starter Plus",
    eyebrow: "More room for one employee",
    tagline: "The strongest one-employee multichannel plan.",
    detail:
      "Keep one employee and add substantially more voice capacity plus the fuller Lead Hunt, enrichment, inbox, email, and text/SMS workflow surface under one shared playbook.",
    cta: "Choose Starter Plus",
    ctaPath: "/signup?plan=team",
    icon: Crosshair,
    featured: true,
    badge: "Best founder value",
  },
  {
    plan: planById.business,
    publicName: "Pro",
    eyebrow: "For simultaneous roles",
    tagline: "Five AI employees, each capable across connected channels.",
    detail:
      "Add employees when volume requires separate owners for inbound conversion, outbound follow-up, lead revival, scheduling, support, or front-desk work—not because voice, email, and SMS require separate products.",
    cta: "Go Pro",
    ctaPath: "/signup?plan=business",
    icon: Users,
    featured: false,
    badge: "Multi-employee capacity",
  },
  {
    plan: planById.enterprise,
    publicName: "Business",
    eyebrow: "For serious operators",
    tagline: "A supervised AI communications workforce.",
    detail:
      "Deploy up to fifteen purpose-built employees across business lines, regions, brands, or queues. Each employee can retain one identity across voice, email, and text/SMS with stronger governance and analytics.",
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
    title: "Voice agent capability",
    body: "Included pooled minutes are used first. Additional completed usage draws only from prepaid Conversation Balance. Active calls finish normally; the next call pauses if coverage is depleted.",
  },
  {
    icon: Mail,
    title: "Email agent capability",
    body: "Connected Gmail, Outlook, Yahoo, iCloud, or customer email infrastructure retains its provider limits and reputation controls. Platform-funded sending or enrichment can draw from prepaid balance.",
  },
  {
    icon: MessageSquareText,
    title: "Text / SMS agent capability",
    body: "Carrier and messaging API usage draws from Conversation Balance by segment. Consent, sender identity, campaign controls, and spend remain visible.",
  },
] as const;

const FAQ = [
  [
    "Do I need three employees for voice, email, and SMS?",
    "No. One Wireline AI employee can work across voice, connected email, and text/SMS using the same business knowledge, rules, approvals, memory, and outcome history. Add employees only when you want simultaneous roles, separate identities, distinct queues, or more capacity.",
  ],
  [
    "Why are there two Starter plans?",
    "Starter is the lowest-risk way to put one employee live. Starter Plus keeps the same one-employee limit but supplies more monthly voice capacity and the fuller lead-hunting and multichannel workflow experience.",
  ],
  [
    "Does every employee automatically create a phone-number cost?",
    "No. Plans provide number slots, but Wireline provisions production numbers when they are actually needed. Email-only or internal workflows do not need to create unnecessary carrier spend.",
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
    "Scale is a custom committed-usage agreement for organizations needing 25 or more employees, negotiated channel economics, SSO, custom integrations, security review, retention controls, implementation support, or SLAs.",
  ],
] as const;

const assurances = [
  {
    icon: Check,
    label: "Build free",
    detail: "Train and simulate one private AI employee before paying.",
  },
  {
    icon: MessageSquareText,
    label: "All three channels",
    detail: "Voice, email, and text/SMS belong to the same employee when connected.",
  },
  {
    icon: CircleDollarSign,
    label: "No surprise overages",
    detail: "Variable provider usage is prepaid, not silently invoiced.",
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
  name: "Wireline AI employee pricing",
  url: "https://trywireline.com/pricing",
  itemListElement: [
    {
      "@type": "Offer",
      name: "Wireline Free Builder",
      price: 0,
      priceCurrency: "USD",
      description: "Build, train, and privately simulate one multichannel AI employee.",
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
        title="Pricing | One Wireline AI employee across voice, email, and SMS"
        description="Build one AI employee free, launch from $9/month, and use connected voice, email, and text/SMS under one playbook. Add employees for capacity and specialization—not channel access."
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
          title="One AI employee. Every conversation channel."
          description="Start with one employee across voice, email, and text/SMS. Expand employee count only when the work needs simultaneous roles, separate identities, or more capacity."
          primaryAction={{ label: "Build your first employee", to: "/signup?plan=personal" }}
          secondaryAction={{ label: "Compare every plan", to: "#plans", tone: "secondary" }}
          proof={MARKETING_VOICE.channels}
        />

        <section id="plans" className="px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail mx-auto max-w-[1500px]">
            <div className="mx-auto max-w-3xl text-center">
              <p className="wl-stitch-label">Plans for different stages</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                Channels are capabilities. Employees are capacity.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Every paid employee can operate across connected voice, email, and text/SMS.
                Higher tiers primarily buy more simultaneous employees, number slots, voice capacity,
                collaboration, analytics, and governance.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <article className="rounded-[28px] border border-border bg-card p-6 text-center shadow-sm">
                <div className="flex flex-col items-center justify-center gap-3">
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
                  Build, train, connect knowledge, and privately simulate one draft employee.
                  Production channels and paid provider actions remain locked until activation.
                </p>
                <PlanFeatures features={planById.personal.features} />
                <Link
                  to="/signup?plan=personal"
                  className="mt-8 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-muted"
                >
                  Build free <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </article>

              {PAID_TIERS.map((tier) => (
                <PlanCard key={tier.plan.id} tier={tier} />
              ))}

              <article className="rounded-[28px] border border-border bg-card p-6 text-center shadow-sm">
                <div className="flex flex-col items-center justify-center gap-3">
                  <div>
                    <p className="wl-stitch-label">25+ employees or custom needs</p>
                    <h3 className="mt-2 text-2xl font-semibold">Scale & Enterprise</h3>
                  </div>
                  <Building2 className="h-6 w-6" aria-hidden="true" />
                </div>
                <p className="mt-5 text-sm leading-6 text-muted-foreground">
                  Custom concurrency, committed channel usage, SSO, data controls, integrations,
                  implementation, security review, and service levels.
                </p>
                <Link
                  to="/contact?intent=enterprise"
                  className="mt-8 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-foreground/90"
                >
                  Talk to Wireline <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </article>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-card/45 px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mx-auto max-w-3xl text-center">
              <p className="wl-stitch-label">One employee, shared context</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                Voice agent. Email agent. Text/SMS agent. One AI employee.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Channel usage has different provider economics, but the employee keeps one identity,
                playbook, approval model, memory, and outcome history.
              </p>
            </div>
            <div className="mx-auto mt-10 grid max-w-5xl gap-4 lg:grid-cols-3">
              {CHANNEL_RULES.map(({ icon: Icon, title, body }) => (
                <article key={title} className="rounded-[22px] border border-border bg-background p-6 text-center">
                  <Icon className="mx-auto h-6 w-6 text-primary" aria-hidden="true" />
                  <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-public-rail">
            <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {assurances.map(({ icon: Icon, label, detail }) => (
                <article key={label} className="rounded-[20px] border border-border bg-card p-5 text-center">
                  <Icon className="mx-auto h-5 w-5 text-primary" aria-hidden="true" />
                  <h3 className="mt-3 text-sm font-semibold">{label}</h3>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
                </article>
              ))}
            </div>

            <div className="mx-auto mt-16 max-w-4xl">
              <div className="text-center">
                <p className="wl-stitch-label">Questions</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Pricing without channel confusion.</h2>
              </div>
              <div className="mt-8 divide-y divide-border rounded-[24px] border border-border bg-card px-6">
                {FAQ.map(([question, answer]) => (
                  <article key={question} className="py-6 text-center sm:text-left">
                    <h3 className="text-base font-semibold">{question}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{answer}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

function PlanFeatures({ features }: { features: readonly string[] }) {
  return (
    <ul className="mx-auto mt-6 max-w-md space-y-3 text-left text-sm">
      {features.map((feature) => (
        <li key={feature} className="flex gap-3">
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  );
}

function PlanCard({ tier }: { tier: PaidTier }) {
  const { plan, publicName, eyebrow, tagline, detail, cta, ctaPath, icon: Icon, featured, badge } =
    tier;
  return (
    <article
      className={`relative rounded-[28px] border p-6 text-center shadow-sm ${
        featured ? "border-foreground bg-foreground text-background" : "border-border bg-card"
      }`}
    >
      <div className="flex flex-col items-center justify-center gap-3">
        <div>
          <p className={`wl-stitch-label ${featured ? "text-background/70" : ""}`}>{eyebrow}</p>
          <h3 className="mt-2 text-2xl font-semibold">{publicName}</h3>
        </div>
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <p className={`mt-3 text-sm font-semibold ${featured ? "text-background" : "text-foreground"}`}>
        {tagline}
      </p>
      <div className="mt-5 flex items-end justify-center gap-2">
        <span className="text-4xl font-semibold tracking-[-0.04em]">${plan.price_usd_monthly}</span>
        <span className={`pb-1 text-sm ${featured ? "text-background/70" : "text-muted-foreground"}`}>
          /month
        </span>
      </div>
      <p className={`mt-2 text-xs ${featured ? "text-background/70" : "text-muted-foreground"}`}>
        ${plan.price_usd_annual}/year · two months free
      </p>
      <p className={`mt-4 text-sm leading-6 ${featured ? "text-background/75" : "text-muted-foreground"}`}>
        {detail}
      </p>
      <PlanFeatures features={plan.features} />
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
      <p className={`mt-3 text-center text-xs ${featured ? "text-background/60" : "text-muted-foreground"}`}>
        {badge}
      </p>
    </article>
  );
}
