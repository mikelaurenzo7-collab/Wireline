import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";
import { STRIPE_PLANS, type StripePlan } from "../lib/plan-catalog";

const PLAN_COPY: Record<string, string> = {
  personal: "For everyday calls you do not have time to make.",
  "personal-plus": "More capacity for home, family, and a side project.",
  "business-starter": "For a small team that needs a dependable call assistant.",
  starter: "More agents and minutes for a growing operation.",
  scale: "A tailored plan for larger teams or higher volume.",
};

const FAQS = [
  ["Can I change plans?", "Yes. Start with the plan that fits your call volume, then adjust as your needs change."],
  ["Can I add agents?", "Yes. Higher plans include more agents, and additional capacity is available when you need it."],
  ["What is included?", "Each paid plan includes agent setup, call capacity, and a clear place to review and teach your assistants."],
] as const;

function usd(amount: number) {
  return `$${amount.toLocaleString("en-US")}`;
}

function price(plan: StripePlan, interval: "month" | "year") {
  if (plan.price_usd_monthly === 0) return "Custom";
  return usd(interval === "year" ? plan.price_usd_annual : plan.price_usd_monthly);
}

function cadence(plan: StripePlan, interval: "month" | "year") {
  if (plan.price_usd_monthly === 0) return "";
  return interval === "year" ? "/ year" : "/ month";
}

function signup(plan: StripePlan) {
  return plan.price_usd_monthly === 0
    ? "/contact?intent=sales"
    : `/signup?plan=${encodeURIComponent(plan.id)}`;
}

export default function Pricing() {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const personal = STRIPE_PLANS.find((plan) => plan.id === "personal") ?? STRIPE_PLANS[0];

  return (
    <MarketingPageFrame mainClassName="!px-0 pb-0 pt-20 sm:pt-24">
      <PageMeta
        title="Wireline Pricing"
        description="Wireline starts at $7 per month for an AI call assistant that handles everyday phone work."
        path="/pricing"
      />

      <section className="mx-auto max-w-6xl px-5 pb-12 pt-14 sm:px-8 sm:pb-16 sm:pt-20 lg:px-10">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6e6e73]">Simple pricing</p>
          <h1 className="mt-4 text-balance text-[clamp(3rem,8vw,5.8rem)] font-semibold leading-[0.94] tracking-[-0.065em] text-[#1d1d1f]">
            Start with one call assistant.
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-[clamp(1.18rem,2.4vw,1.5rem)] font-medium leading-[1.42] tracking-[-0.02em] text-[#4f4f55]">
            Pick the capacity you need today. Change it when your life or your work changes.
          </p>
        </div>

        <div className="mt-10 inline-flex rounded-full border border-[#1d1d1f]/14 bg-white p-1" aria-label="Billing interval">
          {(["month", "year"] as const).map((option) => (
            <button
              type="button"
              key={option}
              onClick={() => setInterval(option)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${
                interval === option ? "bg-[#1d1d1f] text-white" : "text-[#5e5e64] hover:text-[#1d1d1f]"
              }`}
            >
              {option === "month" ? "Monthly" : "Annual"}
              {option === "year" && <span className="ml-1.5 text-xs opacity-75">Save 20%</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 sm:pb-24 lg:px-10">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {STRIPE_PLANS.map((plan) => {
            const recommended = plan.id === "personal";
            const contact = plan.price_usd_monthly === 0;
            return (
              <article
                key={plan.id}
                className={`flex min-h-full flex-col rounded-2xl border p-5 ${
                  recommended ? "border-[#1d1d1f] bg-[#1d1d1f] text-white" : "border-[#1d1d1f]/12 bg-white text-[#1d1d1f]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-[-0.03em]">{plan.name}</h2>
                  {recommended && <span className="rounded-full bg-white/14 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">Start here</span>}
                </div>
                <p className={`mt-3 min-h-[63px] text-sm leading-6 ${recommended ? "text-white/72" : "text-[#5e5e64]"}`}>
                  {PLAN_COPY[plan.id] ?? "A plan built around your call volume."}
                </p>
                <div className="mt-7 flex items-end gap-1">
                  <span className="text-4xl font-semibold leading-none tracking-[-0.055em]">{price(plan, interval)}</span>
                  {cadence(plan, interval) && <span className={`pb-1 text-xs ${recommended ? "text-white/65" : "text-[#6e6e73]"}`}>{cadence(plan, interval)}</span>}
                </div>
                {!contact && (
                  <p className={`mt-3 text-xs leading-5 ${recommended ? "text-white/65" : "text-[#6e6e73]"}`}>
                    {plan.max_agents} agent{plan.max_agents === 1 ? "" : "s"} · {plan.voice_minutes_monthly.toLocaleString("en-US")} call minutes
                  </p>
                )}
                <Link
                  to={signup(plan)}
                  className={`mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition active:scale-[0.985] ${
                    recommended ? "bg-white text-[#1d1d1f] hover:bg-[#f2f2ef]" : "bg-[#1d1d1f] text-white hover:bg-black"
                  }`}
                >
                  {contact ? "Talk to us" : "Choose plan"}<ArrowRight className="h-4 w-4" />
                </Link>
                <ul className={`mt-6 space-y-3 border-t pt-5 text-sm leading-5 ${recommended ? "border-white/14 text-white/74" : "border-[#1d1d1f]/10 text-[#5e5e64]"}`}>
                  {plan.features.slice(0, 5).map((feature) => (
                    <li className="flex gap-2" key={feature}><Check className={`mt-0.5 h-4 w-4 flex-none ${recommended ? "text-white" : "text-[#1d1d1f]"}`} />{feature}</li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-[#1d1d1f]/10 bg-white px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 text-sm font-medium text-[#4f4f55]"><ShieldCheck className="h-4 w-4 text-[#1d1d1f]" />No complicated setup required</div>
            <h2 className="mt-4 text-balance text-[clamp(2.2rem,5vw,4rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-[#1d1d1f]">Choose a plan. Teach an agent. Get time back.</h2>
            {personal && <p className="mt-5 text-sm leading-6 text-[#5e5e64]">Everyday starts at {usd(personal.price_usd_monthly)} per month.</p>}
          </div>
          <div className="grid gap-3">
            {FAQS.map(([question, answer]) => (
              <article className="rounded-xl border border-[#1d1d1f]/10 bg-[#f7f7f5] p-5" key={question}>
                <h3 className="font-semibold tracking-[-0.02em] text-[#1d1d1f]">{question}</h3>
                <p className="mt-2 text-sm leading-6 text-[#5e5e64]">{answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
