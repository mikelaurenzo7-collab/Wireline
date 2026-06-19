import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Check, Phone, ShieldCheck, Sparkles, Zap } from "lucide-react";

import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { ShadButton } from "../components/ui/shadcn/ShadButton";
import { PageMeta } from "../lib/page-meta";
import { STRIPE_PLANS, type StripePlan } from "../lib/plan-catalog";

const PRICING_SECTION_LINKS = [
  { id: "pricing-plans", label: "Plans" },
  { id: "pricing-value", label: "Included" },
  { id: "pricing-faq", label: "FAQ" },
] as const;

const PLAN_BLURBS: Record<string, string> = {
  personal: "One agent for everyday calls: pharmacy, doctor, school, restaurant, support line.",
  "personal-plus": "More minutes and two agents for home, family, side projects, or work.",
  "business-starter": "The full studio: configure agents for personal or business workflows.",
  starter: "Higher call volume, more agents, live call review, analytics, and team sharing.",
  scale:
    "Talk to sales for special business packages, high volume, security, or custom integrations.",
};

const VALUE_BULLETS = [
  {
    icon: Phone,
    title: "Real call delegation",
    text: "Every self-serve plan includes minutes, a phone number, summaries, and a simple console.",
  },
  {
    icon: Sparkles,
    title: "Agent Studio",
    text: "Start with a plain-language setup, then tune instructions, hours, routing, memory, and handoffs.",
  },
  {
    icon: ShieldCheck,
    title: "Use it however you want",
    text: "The same agent can call a pharmacy, handle a landlord, or run a small business front desk.",
  },
  {
    icon: Zap,
    title: "Capacity scales",
    text: "Upgrade for more agents, minutes, phone numbers, workflows, and review tools.",
  },
] as const;

const FAQS = [
  {
    question: "Can I add more agents later?",
    answer:
      "Yes. Paid plans include a starter bundle and support add-on agents when you need more roles, departments, or workflows.",
  },
  {
    question: "Do I have to choose personal or business?",
    answer:
      "No. Wireline is one console. Use your agents for everyday life, a side project, or a business; higher plans simply add capacity and customization.",
  },
  {
    question: "Do I need a credit card to start?",
    answer:
      "The launch flow supports a free trial path, and plans can be selected when you are ready to activate billing.",
  },
] as const;

function formatUsd(amount: number) {
  return `$${amount.toLocaleString("en-US")}`;
}

function planPrice(plan: StripePlan, interval: "month" | "year") {
  if (plan.price_usd_monthly === 0) return "Custom";
  return formatUsd(interval === "year" ? plan.price_usd_annual : plan.price_usd_monthly);
}

function planCadence(plan: StripePlan, interval: "month" | "year") {
  if (plan.price_usd_monthly === 0) return "";
  return interval === "year" ? "/ year" : "/ month";
}

function signupHref(plan: StripePlan) {
  return `/signup?plan=${encodeURIComponent(plan.id)}`;
}

export default function Pricing() {
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");
  const personal = STRIPE_PLANS.find((plan) => plan.id === "personal")!;

  const pricingStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How much does Wireline cost?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `Wireline starts at ${formatUsd(personal.price_usd_monthly)}/month for Everyday. Plus is $15/month, Studio is $29/month, Operator is $59/month, and Custom packages are available for specialized business use.`,
        },
      },
      ...FAQS.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    ],
  };

  return (
    <MarketingPageFrame
      mainClassName="!px-0 pt-20 sm:pt-24 pb-0"
      sectionLinks={[...PRICING_SECTION_LINKS]}
    >
      <PageMeta
        title="Simple Wireline Pricing"
        description="Wireline starts at $7/month. Use one console to set up agents for everyday calls, side projects, or business workflows."
        path="/pricing"
        structuredData={pricingStructuredData}
      />

      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-12 pt-4 text-left lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/8 px-3 py-1.5"
        >
          <Sparkles className="h-3.5 w-3.5 text-brand" />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
            Simple pricing
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-[clamp(3rem,8vw,5.75rem)] italic leading-[0.98] tracking-[-0.045em] text-foreground text-balance"
        >
          START WITH ONE AGENT. SCALE WHEN YOU NEED TO.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="mt-6 max-w-2xl text-lg leading-8 text-foreground/70"
        >
          Use Wireline for the pharmacy, the doctor, the landlord, or your business. One console,
          more agents and minutes only when you need them.
        </motion.p>
      </section>

      <section
        id="pricing-plans"
        className="relative z-10 mx-auto max-w-7xl scroll-mt-28 px-6 pb-20 lg:px-12"
      >
        <div className="mb-10 flex items-center justify-start gap-3">
          {(["month", "year"] as const).map((interval) => (
            <button
              key={interval}
              type="button"
              onClick={() => setBillingInterval(interval)}
              className={`min-h-[42px] rounded-md border px-4 text-sm font-semibold transition ${
                billingInterval === interval
                  ? "border-brand bg-brand text-white"
                  : "border-ink/10 bg-card text-foreground/65 hover:border-brand/30 hover:text-foreground"
              }`}
            >
              {interval === "month" ? "Monthly" : "Annual"}
              {interval === "year" && <span className="ml-2 text-xs opacity-80">save 20%</span>}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
          {STRIPE_PLANS.map((plan, index) => {
            const isHighlighted = plan.id === "business-starter";
            const isContactSales = plan.price_usd_monthly === 0;
            return (
              <motion.article
                key={plan.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + index * 0.04, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className={`relative flex flex-col rounded-md border bg-card p-6 shadow-[0_18px_50px_-44px_rgba(30,27,46,0.55)] ${
                  isHighlighted ? "border-brand ring-1 ring-brand/20" : "border-ink/10"
                }`}
              >
                {isHighlighted && (
                  <span className="mb-4 inline-flex self-start rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand">
                    Best value
                  </span>
                )}

                <h2 className="font-display text-2xl italic text-foreground">{plan.name}</h2>
                <p className="mt-2 min-h-[44px] text-sm leading-6 text-foreground/64">
                  {PLAN_BLURBS[plan.id]}
                </p>

                <div className="my-6 flex items-end gap-1">
                  <span className="font-display text-4xl italic leading-none text-foreground">
                    {planPrice(plan, billingInterval)}
                  </span>
                  {planCadence(plan, billingInterval) && (
                    <span className="pb-1 text-xs text-foreground/55">
                      {planCadence(plan, billingInterval)}
                    </span>
                  )}
                </div>

                <p className="mb-5 rounded-sm border border-brand/15 bg-brand/8 px-3 py-2 text-xs font-semibold text-brand">
                  {isContactSales
                    ? "Custom agents · custom minutes · custom support"
                    : `${plan.max_agents} agent${plan.max_agents === 1 ? "" : "s"} · ${plan.voice_minutes_monthly.toLocaleString("en-US")} minutes · ${plan.included_phone_numbers} number${plan.included_phone_numbers === 1 ? "" : "s"}`}
                </p>

                <div className="mb-6">
                  <ShadButton
                    variant={isHighlighted ? "editorial" : "outline"}
                    className="w-full"
                    asChild
                  >
                    <Link
                      to={isContactSales ? "/contact?intent=sales" : signupHref(plan)}
                      className="inline-flex items-center justify-center gap-2"
                    >
                      {isContactSales ? "Talk to sales" : "Select plan"}{" "}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </ShadButton>
                </div>

                <ul className="mt-auto space-y-3 border-t border-ink/10 pt-5 text-sm text-foreground/72">
                  {plan.features.slice(0, 7).map((feature) => (
                    <li key={feature} className="flex gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" strokeWidth={2.6} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </motion.article>
            );
          })}
        </div>
      </section>

      <section
        id="pricing-value"
        className="border-y border-ink/10 bg-card-warm/25 py-20 scroll-mt-28"
      >
        <div className="mx-auto max-w-6xl px-6 lg:px-12">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
              WHAT SCALES WITH YOU
            </p>
            <h2 className="mt-3 font-display text-4xl italic text-foreground">
              ONE PRODUCT, MORE CAPACITY.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            {VALUE_BULLETS.map(({ icon: Icon, title, text }) => (
              <article
                key={title}
                className="rounded-md border border-ink/10 bg-card p-6 shadow-sm"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-md border border-brand/15 bg-brand/8 text-brand">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-2xl italic text-foreground">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-foreground/66">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing-faq" className="mx-auto max-w-4xl scroll-mt-28 px-6 py-20 lg:px-12">
        <div className="mb-10 text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
            FAQ
          </p>
          <h2 className="mt-3 font-display text-4xl italic text-foreground">
            STRAIGHT ANSWERS BEFORE CHECKOUT.
          </h2>
        </div>
        <div className="space-y-4">
          {FAQS.map((item) => (
            <article key={item.question} className="rounded-md border border-ink/10 bg-card p-6">
              <h3 className="text-base font-semibold text-foreground">{item.question}</h3>
              <p className="mt-2 text-sm leading-7 text-foreground/66">{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-20 pt-4 text-center">
        <h2 className="font-display text-4xl italic text-foreground sm:text-5xl text-balance">
          LAUNCH YOUR FIRST AGENT TODAY.
        </h2>
        <p className="mx-auto mb-8 mt-4 max-w-xl text-base leading-7 text-foreground/70">
          Start with the everyday plan. Upgrade for more minutes, more agents, or specialized
          business support when the use case proves itself.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <ShadButton variant="editorial" size="lg" asChild>
            <Link to="/signup" className="inline-flex items-center gap-2">
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </ShadButton>
          <ShadButton variant="outline" size="lg" asChild>
            <a href="tel:+16305811834" className="inline-flex items-center gap-2 text-foreground">
              <Phone className="h-4 w-4" />
              Call demo line
            </a>
          </ShadButton>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
