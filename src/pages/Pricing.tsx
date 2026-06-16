import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Check, Phone, ShieldCheck, Sparkles, Zap } from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { AnimatedCounter } from "../components/ui/AnimatedCounter";
import { PageMeta } from "../lib/page-meta";
import { STRIPE_PLANS, type StripePlan } from "../lib/plan-catalog";

const PRICING_SECTION_LINKS = [
  { id: "pricing-why", label: "Why Wireline" },
  { id: "pricing-plans", label: "Plans" },
  { id: "pricing-economics", label: "Economics" },
] as const;

const PLAN_BLURBS: Record<string, string> = {
  personal: "The paid personal entry point: one agent, one number, enough minutes for light coverage.",
  starter: "For small teams that need real phone coverage without a four-figure SaaS bill.",
  pro: "For growth teams running outbound, email follow-up, coaching, and real pipeline work.",
  business: "For multi-team operators that need SSO, audit, support, and serious monthly volume.",
  enterprise: "Custom volume, security, procurement, integrations, and SLA-backed deployment support.",
};

const VALUE_BULLETS = [
  { icon: Phone, text: "Call the live demo first — no account needed before you buy." },
  { icon: ShieldCheck, text: "SOC 2-ready architecture, encrypted secrets, tenant isolation." },
  { icon: Sparkles, text: "Premium AI reasoning + studio-grade voices on every paid tier." },
  { icon: Zap, text: "Paid setup stays lightweight: pick a plan, deploy in minutes." },
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
  const selfServePlans = STRIPE_PLANS.filter((p) => p.id !== "enterprise");
  const enterprisePlan = STRIPE_PLANS.find((p) => p.id === "enterprise")!;
  const allPlans = [...selfServePlans, enterprisePlan];

  const pricingStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How much does Wireline cost?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `Wireline starts at ${formatUsd(personal.price_usd_monthly)}/month for Personal. Starter is $89/month, Pro is $299/month, Business is $899/month, and Enterprise is custom. Self-serve tiers are paid from day one; prospects can call live demos before buying.`,
        },
      },
      {
        "@type": "Question",
        name: "Is there a free trial?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. Wireline uses lower paid-entry pricing instead of a free trial. You can test live demo agents without signing up, then start on a paid plan when you are ready to deploy your own number and agent.",
        },
      },
      {
        "@type": "Question",
        name: "What happens if I go over my voice-minute allowance?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Voice minutes are pooled across all agents in your workspace. Overage rates are tier-based and stay above variable cost: Personal $0.24/min, Starter $0.22/min, Pro $0.19/min, and Business $0.16/min.",
        },
      },
      {
        "@type": "Question",
        name: "Can I cancel anytime?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. There are no long-term contracts on any self-serve plan. You can cancel from the dashboard and keep access through the end of your current billing period.",
        },
      },
    ],
  };

  return (
    <MarketingPageFrame mainClassName="!px-0 pt-20 sm:pt-24 pb-0" sectionLinks={[...PRICING_SECTION_LINKS]}>
      <PageMeta
        title="Plans & Pricing"
        description="Wireline pricing starts at $19/month. Paid self-serve plans replace the free trial with a lower entry price, live demo access, AI voice agents, call logs, sentiment, and dedicated numbers."
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
            Pricing · Lower paid entry · No free trial
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="font-display italic text-[clamp(2.25rem,5vw,4rem)] leading-[1.05] tracking-tight mb-4 text-balance"
        >
          <span className="wl-brand-display">Start cheaper.</span>
          <br />
          <span className="text-ink">Scale only when volume proves it.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="text-ink/65 text-base leading-relaxed max-w-2xl mx-auto"
        >
          Wireline now uses paid-from-day-one pricing instead of a free trial. Test the live demos
          first, then start at $19/month when you are ready to deploy your own AI voice agent,
          dedicated number, transcripts, sentiment, and email support.
        </motion.p>
      </section>

      <section id="pricing-why" className="relative z-10 px-4 scroll-mt-28 lg:px-10 max-w-6xl mx-auto pb-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-ink/[0.08] border border-ink/[0.08]">
          {[
            {
              title: "No trial cliff",
              blurb:
                "The entry plan is cheap enough to buy, but capped tightly enough to protect voice economics.",
            },
            {
              title: "Demo before payment",
              blurb:
                "Prospects can call live demo agents without creating an account, then buy when they need their own agent.",
            },
            {
              title: "Upgrade math stays obvious",
              blurb:
                "Minute pools and overage rates improve with tier, so successful customers naturally move up.",
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
              <h3 className="font-display italic text-lg text-ink leading-tight mb-1.5">{card.title}</h3>
              <p className="text-[12px] text-ink/65 leading-relaxed">{card.blurb}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="relative z-10 px-4 sm:px-6 lg:px-10 max-w-7xl mx-auto pb-6">
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setBillingInterval("month")}
            className={`touch-press px-4 py-2 font-mono text-[11px] uppercase tracking-[0.28em] font-medium border transition-all ${
              billingInterval === "month"
                ? "bg-brand/15 border-brand/40 text-brand"
                : "border-ink/10 text-ink/60 hover:text-ink hover:border-brand/25"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingInterval("year")}
            className={`touch-press px-4 py-2 font-mono text-[11px] uppercase tracking-[0.28em] font-medium border transition-all ${
              billingInterval === "year"
                ? "bg-brand/15 border-brand/40 text-brand"
                : "border-ink/10 text-ink/60 hover:text-ink hover:border-brand/25"
            }`}
          >
            Annual
            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[10px] uppercase tracking-[0.2em] font-bold bg-brand/12 border border-brand/30 text-brand">
              Save 20%
            </span>
          </button>
        </div>
      </section>

      <section id="pricing-plans" className="relative z-10 px-4 scroll-mt-28 sm:px-6 lg:px-10 wl-measure-wide pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 2xl:gap-5">
          {allPlans.map((plan, index) => {
            const isEnterprise = plan.id === "enterprise";
            const isHighlighted = plan.id === "pro";
            const price = planPrice(plan, billingInterval);
            const cadence = planCadence(plan, billingInterval);
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + index * 0.08, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                className={`relative p-4 lg:p-5 flex flex-col ${
                  isHighlighted ? "wl-purple-ring tier-spotlight md:scale-[1.02] md:-my-1 md:z-10" : ""
                }`}
              >
                <div
                  className={`relative transition-all duration-300 wl-card-shine ${
                    isHighlighted
                      ? "wl-panel-elevated border-2 border-brand/40 wl-pricing-tier--highlight"
                      : "wl-panel border border-ink/[0.08] hover:border-brand/30"
                  } p-5 flex flex-col flex-1 overflow-hidden`}
                >
                  {isHighlighted && (
                    <p className="mb-3 wl-label text-brand inline-flex items-center gap-1.5 self-start px-2 py-1 bg-brand/12 border border-brand/30">
                      <Sparkles className="w-3 h-3" strokeWidth={2.8} /> Best growth plan
                    </p>
                  )}
                  <div className="mb-4">
                    <h2 className="font-display italic text-2xl text-ink mb-1">{plan.name}</h2>
                    <p className="text-[11px] text-ink/65 leading-snug">{PLAN_BLURBS[plan.id]}</p>
                  </div>

                  <div className="mb-5 flex items-baseline gap-1">
                    <span className="font-display italic text-4xl text-ink">{price}</span>
                    {cadence && <span className="text-[10px] text-ink/55">{cadence}</span>}
                  </div>

                  {!isEnterprise && (
                    <p className="mb-2 wl-label text-brand inline-flex items-center gap-1.5 self-start px-2 py-1 bg-brand/12 border border-brand/30">
                      <Check className="w-3 h-3" strokeWidth={2.8} /> Paid plan · no free trial
                    </p>
                  )}

                  {isEnterprise ? (
                    <a
                      href="mailto:trywireline@yahoo.com?subject=Enterprise%20%2F%20Call%20Center%20inquiry"
                      className="group flex w-full min-h-[48px] items-center justify-center text-center py-3.5 text-[11px] uppercase tracking-[0.32em] font-medium transition-colors duration-300 mb-6 border border-ink/15 text-ink hover:border-brand/30 hover:bg-ink/[0.03]"
                    >
                      <span className="inline-flex items-center gap-2">
                        Talk to sales
                        <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </a>
                  ) : (
                    <Link
                      to={signupHref(plan)}
                      className={`group flex w-full min-h-[48px] items-center justify-center text-center py-3.5 text-[11px] uppercase tracking-[0.32em] font-medium transition-colors duration-300 mb-6 ${
                        isHighlighted
                          ? "bg-brand text-white hover:bg-brand-deep"
                          : "border border-ink/15 text-ink hover:border-brand/30 hover:bg-ink/[0.03]"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        Start paid plan
                        <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  )}

                  <ul className="space-y-2.5 text-[12px] text-ink/80 flex-1">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-brand" strokeWidth={2.6} />
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
            <div key={text} className="wl-panel border border-ink/[0.08] p-4 flex items-start gap-3 transition-all duration-300 hover:border-brand/30">
              <div className="w-8 h-8 flex items-center justify-center shrink-0 border border-brand/15 bg-brand/[0.06]">
                <Icon className="w-4 h-4 text-brand" strokeWidth={2.2} />
              </div>
              <p className="text-[12px] text-ink/75 leading-snug">{text}</p>
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85, duration: 0.6 }}
          id="pricing-economics"
          className="mt-14 max-w-5xl mx-auto"
        >
          <div className="text-center mb-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink/65 mb-2.5">
              ROI snapshot · vs traditional headcount
            </p>
            <h3 className="font-display italic text-[clamp(1.5rem,3vw,2rem)] text-ink leading-[1.05]">
              How much you save replacing one human role
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { role: "1 Inbound CS Rep", humanCost: 52_000, tier: "Personal", tierCost: 19 * 12, tierLabel: "$19/mo" },
              { role: "1 Outbound SDR", humanCost: 75_000, tier: "Pro", tierCost: 299 * 12, tierLabel: "$299/mo" },
              { role: "5-seat call center", humanCost: 260_000, tier: "Business", tierCost: 899 * 12, tierLabel: "$899/mo" },
            ].map((row, index) => {
              const savings = row.humanCost - row.tierCost;
              const pct = ((savings / row.humanCost) * 100).toFixed(0);
              return (
                <motion.div
                  key={row.role}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.95 + index * 0.06, duration: 0.5 }}
                  className="wl-panel border border-ink/[0.08] p-5 relative overflow-hidden transition-all duration-300 hover:border-brand/30"
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/55 mb-1">Replace</p>
                  <p className="text-[14px] font-semibold text-ink mb-3">{row.role}</p>
                  <div className="space-y-1.5 mb-3 text-[11px]">
                    <div className="flex justify-between text-ink/60">
                      <span>Human cost</span>
                      <span className="tabular-nums line-through">${row.humanCost.toLocaleString()}/yr</span>
                    </div>
                    <div className="flex justify-between text-ink/90">
                      <span>
                        Wireline {row.tier} ({row.tierLabel})
                      </span>
                      <span className="tabular-nums">${row.tierCost.toLocaleString()}/yr</span>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-ink/10 flex items-baseline justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-[0.25em] wl-text-success">You save</span>
                    <span className="font-display italic text-2xl wl-text-success tabular-nums">
                      $<AnimatedCounter value={savings} />
                      <span className="text-[11px] text-brand/70 ml-1">/yr ({pct}%)</span>
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.6 }}
          className="mt-12 max-w-3xl mx-auto text-center space-y-3"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink/65">
            No free trial · No long-term contracts · Cancel anytime · USD pricing
          </p>
          <p className="text-[12px] text-ink/65 leading-relaxed">
            Voice minutes are pooled across all agents in your workspace. Overage is tier-based
            (Personal: $0.24/min · Starter: $0.22/min · Pro: $0.19/min · Business: $0.16/min) —
            priced above variable cost so the lower ladder still makes money. Email volume is
            unlimited on all plans.
          </p>
        </motion.div>
      </section>
    </MarketingPageFrame>
  );
}
