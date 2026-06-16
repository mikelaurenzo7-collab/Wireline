import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Check, Phone, ShieldCheck, Sparkles, Zap } from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { ShadButton } from "../components/ui/shadcn/ShadButton";
import { PageMeta } from "../lib/page-meta";
import { STRIPE_PLANS, type StripePlan } from "../lib/plan-catalog";

const PRICING_SECTION_LINKS = [
  { id: "pricing-why", label: "Why Wireline" },
  { id: "pricing-plans", label: "Plans" },
] as const;

const PLAN_BLURBS: Record<string, string> = {
  personal: "A much lower personal assistant lane for light, occasional call coverage.",
  starter:
    "A business entry point for small teams that need routing, monitoring, and add-on agents.",
  pro: "For teams running outbound, email follow-up, coaching, and pipeline workflows.",
  business: "For multi-team operators that need routing, controls, support, and scale.",
  enterprise:
    "Custom volume, security, procurement, integrations, and SLA-backed deployment support.",
};

const VALUE_BULLETS = [
  { icon: Phone, text: "Personal stays cheap because most personal users route very few calls." },
  {
    icon: ShieldCheck,
    text: "Business pays for operations: routing, seats, coaching, QA, and controls.",
  },
  {
    icon: Sparkles,
    text: "Every paid plan can choose Grok, Gemini, OpenAI, Anthropic, or OpenRouter.",
  },
  {
    icon: Zap,
    text: "Default AI favors Grok or Gemini Flash to protect margin without feeling dumb.",
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
  const personal = STRIPE_PLANS.find((p) => p.id === "personal")!;
  const plans = STRIPE_PLANS;

  const pricingStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How much does Wireline cost?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `Wireline starts at ${formatUsd(personal.price_usd_monthly)}/month for Personal. Business Starter is $79/month, Business Pro is $249/month, Business Scale is $699/month, and Enterprise is custom.`,
        },
      },
      {
        "@type": "Question",
        name: "Are there agent limits?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Plans include a base number of agents, and customers can add more agents for a monthly add-on price.",
        },
      },
    ],
  };

  return (
    <MarketingPageFrame
      mainClassName="!px-0 pt-20 sm:pt-24 pb-0"
      sectionLinks={[...PRICING_SECTION_LINKS]}
    >
      <PageMeta
        title="Plans & Pricing"
        description="Wireline pricing starts at $9/month for Personal. Business plans start at $79/month, agents are add-on based, and every paid tier can choose its AI model setup in Agent Studio."
        path="/pricing"
        structuredData={pricingStructuredData}
      />

      <section className="relative z-10 px-4 sm:px-6 lg:px-10 xl:px-14 pt-4 sm:pt-6 pb-9 max-w-6xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 border border-ink/15 bg-ink/[0.03] px-4 py-1.5 mb-6"
        >
          <span className="wl-eyebrow-dot" aria-hidden="true" />
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink/70">
            Personal $9 · Business $79 · Add agents anytime
          </span>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="font-display italic text-[clamp(2.25rem,5vw,4rem)] leading-[1.05] tracking-tight mb-4 text-balance"
        >
          <span className="wl-brand-display">Personal is cheap.</span>
          <br />
          <span className="text-ink">Business scales when it earns it.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="text-ink/65 text-base leading-relaxed max-w-2xl mx-auto"
        >
          Personal is for light coverage. Business is for operations. Every plan includes a base
          agent bundle, then users can add more agents for a monthly add-on price. Agent Studio
          keeps model choice open on every paid tier.
        </motion.p>
      </section>

      <section
        id="pricing-why"
        className="relative z-10 px-4 scroll-mt-28 lg:px-10 max-w-6xl mx-auto pb-10"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-ink/[0.08] border border-ink/[0.08]">
          {[
            {
              title: "Personal is separate",
              blurb:
                "A $9 lane works because personal users need occasional coverage, not a call-center platform.",
            },
            {
              title: "Agents are add-on based",
              blurb: "The plan includes a base bundle; more agents are bought only when needed.",
            },
            {
              title: "Model choice is open",
              blurb:
                "Default low-cost models protect margin, while Agent Studio can select premium models.",
            },
          ].map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="bg-paper p-6 lg:p-7 wl-card-shine"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand mb-2.5">
                Pricing thesis
              </p>
              <h3 className="font-display italic text-lg text-ink leading-tight mb-1.5">
                {card.title}
              </h3>
              <p className="text-[12px] text-ink/65 leading-relaxed">{card.blurb}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="relative z-10 px-4 sm:px-6 lg:px-10 max-w-7xl mx-auto pb-6">
        <div className="flex items-center justify-center gap-3">
          {(["month", "year"] as const).map((interval) => (
            <ShadButton
              key={interval}
              type="button"
              variant="ghost"
              disableAnimations
              onClick={() => setBillingInterval(interval)}
              className={`touch-press h-auto px-4 py-2 font-mono text-[11px] uppercase tracking-[0.28em] font-medium border transition-all ${billingInterval === interval ? "bg-brand/15 border-brand/40 text-brand" : "border-ink/10 text-ink/60 hover:text-ink hover:border-brand/25"}`}
            >
              {interval === "month" ? "Monthly" : "Annual"}
              {interval === "year" && (
                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[10px] uppercase tracking-[0.2em] font-bold bg-brand/12 border border-brand/30 text-brand">
                  Save 20%
                </span>
              )}
            </ShadButton>
          ))}
        </div>
      </section>

      <section
        id="pricing-plans"
        className="relative z-10 px-4 scroll-mt-28 sm:px-6 lg:px-10 wl-measure-wide pb-16"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 2xl:gap-5">
          {plans.map((plan, index) => {
            const isEnterprise = plan.id === "enterprise";
            const isHighlighted = plan.id === "starter";
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + index * 0.08, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                className={`relative p-4 lg:p-5 flex flex-col ${isHighlighted ? "wl-purple-ring tier-spotlight md:scale-[1.02] md:-my-1 md:z-10" : ""}`}
              >
                <div
                  className={`relative transition-all duration-300 wl-card-shine ${isHighlighted ? "wl-panel-elevated border-2 border-brand/40 wl-pricing-tier--highlight" : "wl-panel border border-ink/[0.08] hover:border-brand/30"} p-5 flex flex-col flex-1 overflow-hidden`}
                >
                  {isHighlighted && (
                    <p className="mb-3 wl-label text-brand inline-flex items-center gap-1.5 self-start px-2 py-1 bg-brand/12 border border-brand/30">
                      <Sparkles className="w-3 h-3" strokeWidth={2.8} /> Best business entry
                    </p>
                  )}
                  <div className="mb-4">
                    <h2 className="font-display italic text-2xl text-ink mb-1">{plan.name}</h2>
                    <p className="text-[11px] text-ink/65 leading-snug">{PLAN_BLURBS[plan.id]}</p>
                  </div>
                  <div className="mb-5 flex items-baseline gap-1">
                    <span className="font-display italic text-4xl text-ink">
                      {planPrice(plan, billingInterval)}
                    </span>
                    {planCadence(plan, billingInterval) && (
                      <span className="text-[10px] text-ink/55">
                        {planCadence(plan, billingInterval)}
                      </span>
                    )}
                  </div>
                  {!isEnterprise && (
                    <p className="mb-2 wl-label text-brand inline-flex items-center gap-1.5 self-start px-2 py-1 bg-brand/12 border border-brand/30">
                      <Check className="w-3 h-3" strokeWidth={2.8} /> Base bundle + paid add-ons
                    </p>
                  )}
                  {isEnterprise ? (
                    <a
                      href="mailto:trywireline@yahoo.com?subject=Enterprise%20inquiry"
                      className="group flex w-full min-h-[48px] items-center justify-center text-center py-3.5 text-[11px] uppercase tracking-[0.32em] font-medium transition-colors duration-300 mb-6 border border-ink/15 text-ink hover:border-brand/30 hover:bg-ink/[0.03]"
                    >
                      <span className="inline-flex items-center gap-2">
                        Talk to sales{" "}
                        <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </a>
                  ) : (
                    <Link
                      to={signupHref(plan)}
                      className={`group flex w-full min-h-[48px] items-center justify-center text-center py-3.5 text-[11px] uppercase tracking-[0.32em] font-medium transition-colors duration-300 mb-6 ${isHighlighted ? "bg-brand text-white hover:bg-brand-deep" : "border border-ink/15 text-ink hover:border-brand/30 hover:bg-ink/[0.03]"}`}
                    >
                      <span className="inline-flex items-center gap-2">
                        Start paid plan{" "}
                        <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  )}
                  <ul className="space-y-2.5 text-[12px] text-ink/80 flex-1">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check
                          className="w-3.5 h-3.5 mt-0.5 shrink-0 text-brand"
                          strokeWidth={2.6}
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.6 }}
          className="mt-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 max-w-5xl mx-auto wl-reveal-stagger"
        >
          {VALUE_BULLETS.map(({ icon: Icon, text }) => (
            <div
              key={text}
              className="wl-panel border border-ink/[0.08] p-4 flex items-start gap-3 transition-all duration-300 hover:border-brand/30"
            >
              <div className="w-8 h-8 flex items-center justify-center shrink-0 border border-brand/15 bg-brand/[0.06]">
                <Icon className="w-4 h-4 text-brand" strokeWidth={2.2} />
              </div>
              <p className="text-[12px] text-ink/75 leading-snug">{text}</p>
            </div>
          ))}
        </motion.div>
      </section>
    </MarketingPageFrame>
  );
}
