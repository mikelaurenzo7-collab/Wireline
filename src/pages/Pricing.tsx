import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Activity, ArrowRight, Check, Phone, ShieldCheck, Sparkles, Zap, HelpCircle } from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { ShadButton } from "../components/ui/shadcn/ShadButton";
import { Input } from "../components/ui/shadcn/Input";
import { Slider } from "../components/ui/shadcn/Slider";
import { PageMeta } from "../lib/page-meta";
import { STRIPE_PLANS, type StripePlan } from "../lib/plan-catalog";

const PRICING_SECTION_LINKS = [
  { id: "pricing-plans", label: "Plans" },
  { id: "pricing-calculator", label: "ROI Calculator" },
  { id: "pricing-comparison", label: "Peering vs. Middleware" },
] as const;

const PLAN_BLURBS: Record<string, string> = {
  personal: "A much lower personal assistant lane for light, occasional call coverage.",
  starter: "A business entry point for small teams that need routing, monitoring, and add-on agents.",
  pro: "For teams running outbound, email follow-up, coaching, and pipeline workflows.",
  business: "For multi-team operators that need routing, controls, support, and scale.",
  enterprise: "Custom volume, security, procurement, integrations, and SLA-backed deployment support.",
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
  const [minutes, setMinutes] = useState(50000);
  const [markup, setMarkup] = useState(0.012);

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

  const savings = Math.round(minutes * markup);

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

      {/* Hero Header */}
      <section className="relative z-10 px-6 lg:px-12 pt-4 pb-12 max-w-5xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 border border-brand/20 bg-brand/5 px-4 py-1.5 mb-6 rounded-sm"
        >
          <Sparkles className="w-3.5 h-3.5 text-brand" />
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand font-semibold">
            THE VALUE OF DIRECT ACCESS
          </span>
        </motion.div>
        
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="font-display italic text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.05] tracking-tight mb-6 text-ink"
        >
          <span>The Cost of Sovereignty.</span>
        </motion.h1>
        
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="text-ink/75 text-lg leading-relaxed max-w-2xl mx-auto"
        >
          Replace opaque middleware markups with transparent, carrier-grade pricing. Direct peering means your data travels fewer hops, for less cost.
        </motion.p>
      </section>

      {/* Plans Section */}
      <section
        id="pricing-plans"
        className="relative z-10 px-6 lg:px-12 scroll-mt-28 max-w-7xl mx-auto pb-20"
      >
        {/* Toggle Interval */}
        <div className="flex items-center justify-center gap-3 mb-10">
          {(["month", "year"] as const).map((interval) => (
            <ShadButton
              key={interval}
              type="button"
              variant="ghost"
              disableAnimations
              onClick={() => setBillingInterval(interval)}
              className={`touch-press h-auto px-4 py-2 font-mono text-[11px] uppercase tracking-[0.28em] font-medium border transition-all rounded-sm ${
                billingInterval === interval
                  ? "bg-brand/15 border-brand/45 text-brand"
                  : "border-black/8 text-ink/60 hover:text-ink hover:border-brand/25 bg-paper"
              }`}
            >
              {interval === "month" ? "Monthly" : "Annual"}
              {interval === "year" && (
                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] font-bold bg-brand/12 border border-brand/30 text-brand">
                  Save 20%
                </span>
              )}
            </ShadButton>
          ))}
        </div>

        {/* 5-Column responsive Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-6">
          {plans.map((plan, index) => {
            const isEnterprise = plan.id === "enterprise";
            const isHighlighted = plan.id === "starter";
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + index * 0.06, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                className={`relative flex flex-col ${
                  isHighlighted ? "md:scale-[1.03] md:-my-1 md:z-10" : ""
                }`}
              >
                <div
                  className={`relative transition-all duration-300 ${
                    isHighlighted
                      ? "border-2 border-brand bg-paper shadow-lg"
                      : "border border-outline-variant/40 bg-paper hover:border-brand/35 hover:shadow-sm"
                  } p-6 rounded-md flex flex-col flex-1 overflow-hidden`}
                >
                  {isHighlighted && (
                    <span className="absolute -top-3 right-6 bg-brand text-white px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-sm shadow-sm">
                      Recommended
                    </span>
                  )}
                  <div className="mb-4">
                    <h3 className="font-display italic text-2xl text-ink mb-1">{plan.name}</h3>
                    <p className="text-[11px] text-ink/65 leading-snug min-h-[36px]">
                      {PLAN_BLURBS[plan.id]}
                    </p>
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
                    <span className="mb-4 text-[10px] text-brand font-semibold inline-flex items-center gap-1.5 self-start px-2 py-0.5 bg-brand/10 border border-brand/20 rounded-sm">
                      <Check className="w-3 h-3" strokeWidth={2.8} /> Base bundle + add-ons
                    </span>
                  )}

                  {isEnterprise ? (
                    <ShadButton variant="outline" className="w-full mb-6 py-5 rounded-sm" asChild>
                      <a href="mailto:sales@trywireline.com?subject=Enterprise%20inquiry" className="font-mono text-[10px] uppercase tracking-wider">
                        Talk to sales <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    </ShadButton>
                  ) : (
                    <ShadButton
                      variant={isHighlighted ? "editorial" : "outline"}
                      className="w-full mb-6 py-5 rounded-sm"
                      asChild
                    >
                      <Link to={signupHref(plan)} className="font-mono text-[10px] uppercase tracking-wider">
                        Select Plan <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </ShadButton>
                  )}

                  <ul className="space-y-2.5 text-xs text-ink/80 flex-1 border-t border-outline-variant/20 pt-4">
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

        {/* Value Bullets */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="mt-16 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto"
        >
          {VALUE_BULLETS.map(({ icon: Icon, text }) => (
            <div
              key={text}
              className="wl-panel border border-ink/[0.08] p-5 flex items-start gap-3 bg-paper-warm/10 rounded-md hover:border-brand/35 transition-all shadow-sm"
            >
              <div className="w-8 h-8 flex items-center justify-center shrink-0 border border-brand/15 bg-brand/[0.06] rounded-sm" aria-hidden="true">
                <Icon className="w-4 h-4 text-brand" strokeWidth={2.2} />
              </div>
              <p className="text-xs text-ink/75 leading-relaxed">{text}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ROI Calculator Section */}
      <section
        id="pricing-calculator"
        className="bg-paper-warm/30 py-20 border-y border-ink/[0.08] scroll-mt-28"
      >
        <div className="max-w-5xl mx-auto px-6 lg:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand font-semibold block mb-2">
                Carrier Math
              </span>
              <h2 className="font-display italic text-3xl sm:text-4xl text-ink mb-4">
                Interactive ROI Calculator
              </h2>
              <p className="text-ink/70 text-sm sm:text-base leading-relaxed mb-10">
                See how much you lose to middleware markup each month. Our direct peering model passes carrier savings directly to you.
              </p>

              <div className="space-y-10">
                <div>
                  <div className="flex justify-between mb-3">
                    <label className="font-mono text-xs text-ink font-semibold uppercase tracking-wider">Total Monthly Minutes</label>
                    <span className="font-mono text-sm text-brand font-bold">
                      {minutes.toLocaleString("en-US")}
                    </span>
                  </div>
                  <Slider
                    min="1000"
                    max="500000"
                    step="1000"
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                    className="w-full h-1 bg-ink/10 rounded-md appearance-none cursor-pointer accent-brand"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-6">
                  <div className="flex-1">
                    <label className="font-mono text-xs text-ink block mb-2 uppercase tracking-wider font-semibold">Markup-per-minute ($)</label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0.001"
                      max="0.1"
                      value={markup}
                      onChange={(e) => setMarkup(Number(e.target.value))}
                      className="w-full bg-paper border border-ink/15 px-4 py-2.5 text-sm font-mono text-ink rounded-md focus:outline-none focus:border-brand"
                    />
                    <span className="text-[10px] text-ink/50 mt-1 uppercase tracking-wider block font-semibold">Average middleware markup</span>
                  </div>
                  <div className="flex-1">
                    <div className="p-5 bg-paper border border-brand/20 rounded-md shadow-sm">
                      <span className="font-mono text-[10px] text-brand uppercase tracking-wider font-bold block mb-2">Monthly Savings</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-ink font-mono text-lg font-semibold">$</span>
                        <span className="text-brand font-display italic text-4xl leading-none">
                          {savings.toLocaleString("en-US")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="aspect-square bg-brand rounded-md p-8 sm:p-10 flex flex-col justify-center overflow-hidden relative shadow-xl border border-brand-deep/20">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl" aria-hidden="true" />
                <h3 className="font-display italic text-2xl sm:text-3xl text-white mb-4 relative z-10">
                  Efficiency as a Competitive Advantage
                </h3>
                <p className="text-white/80 text-sm leading-relaxed mb-8 relative z-10">
                  By eliminating the "Wrapper Tax", high-volume operators reclaim up to 40% of their operational telecom budget.
                </p>
                <div className="space-y-3 relative z-10 border-t border-white/20 pt-6">
                  <div className="flex justify-between items-center py-2 border-b border-white/10">
                    <span className="text-white/60 font-mono text-xs uppercase tracking-wider">Network Latency</span>
                    <span className="text-white font-mono text-xs font-semibold">-180ms</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/10">
                    <span className="text-white/60 font-mono text-xs uppercase tracking-wider">System Uptime</span>
                    <span className="text-white font-mono text-xs font-semibold">99.999%</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-white/60 font-mono text-xs uppercase tracking-wider">Integration Friction</span>
                    <span className="text-white font-mono text-xs font-semibold">Zero</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section
        id="pricing-comparison"
        className="max-w-5xl mx-auto px-6 lg:px-12 py-20 scroll-mt-28"
      >
        <div className="mb-12 text-center max-w-2xl mx-auto">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand font-semibold block mb-2">
            Architectural Audit
          </span>
          <h2 className="font-display italic text-3xl sm:text-4xl text-ink">
            Direct Peering vs. Middleware Wrappers
          </h2>
          <p className="text-ink/65 text-sm sm:text-base mt-3 leading-relaxed">
            Understand the architectural difference between a true carrier network and a simplified API layer.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Wireline Side */}
          <div className="space-y-6">
            <div className="wl-panel p-8 rounded-md bg-paper border border-brand/20 shadow-sm border-l-4 border-l-brand">
              <div className="flex items-center gap-3.5 mb-6">
                <span className="w-10 h-10 flex items-center justify-center bg-brand/10 text-brand rounded-full" aria-hidden="true">
                  <Activity className="w-5 h-5" />
                </span>
                <h3 className="font-display italic text-xl text-ink">Sovereign Carrier Network</h3>
              </div>
              <ul className="space-y-6">
                <li className="flex gap-3">
                  <Check className="w-4 h-4 text-brand mt-1 shrink-0" strokeWidth={2.6} />
                  <div>
                    <h4 className="font-mono text-xs text-ink font-semibold uppercase tracking-wider">Zero-Hop Routing</h4>
                    <p className="text-xs sm:text-sm text-ink/70 leading-relaxed mt-0.5">
                      Calls are routed directly to Tier-1 PSTN gateways without passing through third-party cloud intermediaries.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <Check className="w-4 h-4 text-brand mt-1 shrink-0" strokeWidth={2.6} />
                  <div>
                    <h4 className="font-mono text-xs text-ink font-semibold uppercase tracking-wider">Carrier-Grade SLAs</h4>
                    <p className="text-xs sm:text-sm text-ink/70 leading-relaxed mt-0.5">
                      Hardware-level guarantees on packet delivery and jitter, backed by legal carrier status.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <Check className="w-4 h-4 text-brand mt-1 shrink-0" strokeWidth={2.6} />
                  <div>
                    <h4 className="font-mono text-xs text-ink font-semibold uppercase tracking-wider">Bypassed Middleware</h4>
                    <p className="text-xs sm:text-sm text-ink/70 leading-relaxed mt-0.5">
                      Remove the latency and security risks of multi-tenant API wrappers like Twilio or Vapi.
                    </p>
                  </div>
                </li>
              </ul>
            </div>
            
            {/* Diagram */}
            <div className="rounded-md overflow-hidden border border-outline-variant/35 shadow-sm">
              <img
                alt="Direct Peering Architecture"
                className="w-full object-cover grayscale hover:grayscale-0 transition-all duration-500"
                src="https://lh3.googleusercontent.com/aida/AP1WRLtYP2nesXC77WzZ8Vs7bU6RdJvUeTi5D80IaOS8lOBQXKVGrTjXAefaJmG_LZFCrDaKCZbULxR9NxSyWcIPv3xa5qLBSwhz-DuR-ozfR1jEv1dXSUtIlvsOVi9awcEN2jqr-a8xhWwb0IeHAcbXwnHoM95V4xrAgAhJTQ-MXTYl2QDxAQaFyUwzcnEumNhrKpWfuj4B_W8o8s5CdNo4IUnYwOZ4xS_RThAZMSpNsfJ3dkhHw9aWp3KbkA"
              />
            </div>
          </div>

          {/* Opponent Side */}
          <div className="wl-panel p-8 rounded-md bg-paper border border-outline-variant/40 shadow-sm">
            <div className="flex items-center gap-3.5 mb-6">
              <span className="w-10 h-10 flex items-center justify-center bg-black/5 text-ink/50 rounded-full" aria-hidden="true">
                <HelpCircle className="w-5 h-5" />
              </span>
              <h3 className="font-display italic text-xl text-ink/65">Standard Middleware Wrappers</h3>
            </div>
            <ul className="space-y-6">
              <li className="relative pl-6 border-l border-outline-variant/40">
                <div className="absolute left-[-4px] top-1.5 w-2 h-2 rounded-full bg-outline-variant" />
                <h4 className="font-mono text-xs text-ink/60 font-semibold uppercase tracking-wider">Triple-Markup Pricing</h4>
                <p className="text-xs sm:text-sm text-ink/65 leading-relaxed mt-0.5">
                  You pay the carrier rate + the API provider markup + the middleware orchestration fee.
                </p>
              </li>
              <li className="relative pl-6 border-l border-outline-variant/40">
                <div className="absolute left-[-4px] top-1.5 w-2 h-2 rounded-full bg-outline-variant" />
                <h4 className="font-mono text-xs text-ink/60 font-semibold uppercase tracking-wider">Shared Cloud Overhead</h4>
                <p className="text-xs sm:text-sm text-ink/65 leading-relaxed mt-0.5">
                  Traffic is funneled through generic public cloud regions, adding 200ms+ of preventable latency.
                </p>
              </li>
              <li className="relative pl-6 border-l border-outline-variant/40">
                <div className="absolute left-[-4px] top-1.5 w-2 h-2 rounded-full bg-outline-variant" />
                <h4 className="font-mono text-xs text-ink/60 font-semibold uppercase tracking-wider">Opaque Failure Points</h4>
                <p className="text-xs sm:text-sm text-ink/65 leading-relaxed mt-0.5">
                  When a call drops, troubleshooting involves multiple vendor dashboards and shifting blame.
                </p>
              </li>
            </ul>
            <div className="mt-8 p-5 bg-paper-warm/20 rounded-md border border-dashed border-outline-variant/70">
              <p className="text-xs sm:text-sm text-ink/75 italic text-center leading-relaxed">
                "While wrappers offer ease of use for prototypes, high-scale production requires the architectural integrity of a sovereign network."
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 pb-20 pt-8 text-center">
        <h2 className="font-display italic text-3xl sm:text-5xl text-ink mb-4 text-balance">
          Let's get your front desk back.
        </h2>
        <p className="text-sm sm:text-base text-ink/70 max-w-xl mx-auto mb-8 leading-relaxed">
          14-day free trial. Phone number included. No credit card. Cancel anytime.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <ShadButton variant="editorial" size="lg" asChild>
            <Link to="/signup" className="inline-flex items-center gap-2">
              Start free trial
              <ArrowRight className="w-4 h-4" />
            </Link>
          </ShadButton>
          <ShadButton variant="outline" size="lg" asChild>
            <a href="tel:+16305811834" className="inline-flex items-center gap-2 text-ink">
              <Phone className="w-4 h-4" />
              Call demo line
            </a>
          </ShadButton>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
