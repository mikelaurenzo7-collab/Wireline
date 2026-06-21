import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";
import { STRIPE_PLANS, type StripePlan } from "../lib/plan-catalog";

type Interval = "month" | "year";

const PLAN_COPY: Record<string, string> = {
  personal: "For the calls, waits, and follow-ups that keep stealing time from your day.",
  "business-starter":
    "For a business that needs every inbound conversation handled professionally.",
  starter: "For a growing operation that needs coverage, routing, and visibility across the team.",
  scale: "For multi-location, high-volume, or multi-department conversation operations.",
};

const FAQS = [
  [
    "What is the difference between Personal and Business?",
    "Personal is light call delegation for one person. Business adds dedicated coverage, customer routing, team workflows, review, and operational controls.",
  ],
  [
    "Can I add agents instead of changing plans?",
    "Yes. Every paid plan includes a practical starting bundle, then you can add agents as coverage expands. You are not locked into a hard agent ceiling.",
  ],
  [
    "What happens when I use all included minutes?",
    "Your assistant keeps working. Additional minutes are billed at the plan’s published overage rate, so usage stays visible and predictable.",
  ],
  [
    "Can I change plans later?",
    "Yes. Start with the capacity you need now and change as your call volume or operating coverage changes.",
  ],
] as const;

function usd(amount: number) {
  return `$${amount.toLocaleString("en-US")}`;
}

function price(plan: StripePlan, interval: Interval) {
  return usd(interval === "year" ? plan.price_usd_annual : plan.price_usd_monthly);
}

function cadence(interval: Interval) {
  return interval === "year" ? "/ year" : "/ month";
}

function signup(plan: StripePlan) {
  return `/signup?plan=${encodeURIComponent(plan.id)}`;
}

function PlanCard({
  plan,
  interval,
  recommended = false,
}: {
  plan: StripePlan;
  interval: Interval;
  recommended?: boolean;
}) {
  return (
    <article
      className={`flex min-h-full flex-col rounded-2xl border p-6 sm:p-7 ${
        recommended
          ? "border-[#1d1d1f] bg-[#1d1d1f] text-white shadow-[0_20px_50px_rgba(29,29,31,0.16)]"
          : "border-[#1d1d1f]/12 bg-white text-[#1d1d1f]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-[-0.035em]">{plan.name}</h2>
        {recommended && (
          <span className="rounded-full bg-white/14 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
            Recommended
          </span>
        )}
      </div>
      <p
        className={`mt-3 min-h-[72px] text-sm leading-6 ${recommended ? "text-white/76" : "text-[#5e5e64]"}`}
      >
        {PLAN_COPY[plan.id]}
      </p>

      <div className="mt-8 flex items-end gap-1">
        <span className="text-5xl font-semibold leading-none tracking-[-0.065em]">
          {price(plan, interval)}
        </span>
        <span className={`pb-1.5 text-xs ${recommended ? "text-white/65" : "text-[#6e6e73]"}`}>
          {cadence(interval)}
        </span>
      </div>
      <p className={`mt-3 text-xs leading-5 ${recommended ? "text-white/65" : "text-[#6e6e73]"}`}>
        {plan.max_agents} included agent{plan.max_agents === 1 ? "" : "s"} ·{" "}
        {plan.voice_minutes_monthly.toLocaleString("en-US")} minutes · {plan.included_phone_numbers}{" "}
        number{plan.included_phone_numbers === 1 ? "" : "s"}
      </p>

      <Link
        to={signup(plan)}
        className={`mt-8 min-h-12 px-5 text-sm active:scale-[0.985] ${
          recommended ? "marketing-btn-secondary" : "marketing-btn-primary"
        }`}
      >
        {plan.id === "personal" ? "Choose Personal" : `Start ${plan.name}`}
        <ArrowRight className="h-4 w-4" />
      </Link>

      <ul
        className={`mt-7 space-y-3 border-t pt-6 text-sm leading-5 ${recommended ? "border-white/14 text-white/78" : "border-[#1d1d1f]/10 text-[#515158]"}`}
      >
        {plan.features.slice(0, 6).map((feature) => (
          <li className="flex gap-2.5" key={feature}>
            <Check
              className={`mt-0.5 h-4 w-4 flex-none ${recommended ? "text-white" : "text-[#1d1d1f]"}`}
            />
            {feature}
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function Pricing() {
  const [interval, setInterval] = useState<Interval>("month");
  const personal = STRIPE_PLANS.find((plan) => plan.id === "personal");
  const business = STRIPE_PLANS.filter((plan) =>
    ["business-starter", "starter", "scale"].includes(plan.id),
  );

  return (
    <MarketingPageFrame mainClassName="!px-0 pb-0 pt-20 sm:pt-24">
      <PageMeta
        title="Wireline Pricing | Personal and Business AI Coverage"
        description="Choose the Wireline plan that fits your call volume: personal call delegation or business AI front-office coverage."
        path="/pricing"
      />

      <section className="mx-auto max-w-6xl px-5 pb-12 pt-14 sm:px-8 sm:pb-16 sm:pt-20 lg:px-10">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6e6e73]">
            Simple, usable pricing
          </p>
          <h1 className="mt-4 text-balance text-[clamp(3rem,8vw,5.8rem)] font-semibold leading-[0.94] tracking-[-0.065em] text-[#1d1d1f]">
            Choose the plan that fits your call volume.
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-[clamp(1.18rem,2.4vw,1.5rem)] font-medium leading-[1.42] tracking-[-0.02em] text-[#4f4f55]">
            Start with included coverage, then add agents and minutes as the work grows. No
            cluttered bundles. No fake unlimited promises.
          </p>
        </div>

        <div
          className="mt-10 inline-flex rounded-full border border-[#1d1d1f]/14 bg-white p-1"
          aria-label="Billing interval"
        >
          {(["month", "year"] as const).map((option) => (
            <button
              type="button"
              key={option}
              onClick={() => setInterval(option)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${interval === option ? "bg-[#1d1d1f] text-white" : "text-[#5e5e64] hover:text-[#1d1d1f]"}`}
            >
              {option === "month" ? "Monthly" : "Annual"}
              {option === "year" && (
                <span className="ml-1.5 text-xs opacity-75">Save about 20%</span>
              )}
            </button>
          ))}
        </div>
      </section>

      {personal && (
        <section className="border-y border-[#1d1d1f]/10 bg-white px-5 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6e6e73]">
                Personal
              </p>
              <h2 className="mt-4 text-balance text-[clamp(2.4rem,5vw,4.3rem)] font-semibold leading-[0.98] tracking-[-0.06em] text-[#1d1d1f]">
                Give your day a call assistant.
              </h2>
              <p className="mt-5 max-w-md text-base leading-7 text-[#515158]">
                Use Wireline to make the call, wait on hold, capture the answer, and hand the next
                step back to you.
              </p>
              <div className="mt-7 flex items-center gap-2 text-sm font-medium text-[#4f4f55]">
                <ShieldCheck className="h-4 w-4 text-[#1d1d1f]" />A light-use plan built for real
                life.
              </div>
            </div>
            <div className="max-w-xl">
              <PlanCard plan={personal} interval={interval} />
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24 lg:px-10">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6e6e73]">
            Business
          </p>
          <h2 className="mt-4 text-balance text-[clamp(2.6rem,6vw,4.9rem)] font-semibold leading-[0.96] tracking-[-0.065em] text-[#1d1d1f]">
            Put an AI front office on every conversation.
          </h2>
          <p className="mt-5 max-w-2xl text-lg font-medium leading-8 tracking-[-0.02em] text-[#4f4f55]">
            Answer calls, qualify demand, book the next step, route exceptions, follow up, and
            review what happened—without burying your team in another dashboard.
          </p>
        </div>

        <div className="mt-11 grid gap-4 lg:grid-cols-3">
          {business.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              interval={interval}
              recommended={plan.id === "business-starter"}
            />
          ))}
        </div>

        <div className="mt-7 rounded-2xl border border-[#1d1d1f]/10 bg-[#f2f2ef] p-5 text-sm leading-6 text-[#4f4f55] sm:flex sm:items-center sm:justify-between sm:gap-8">
          <span>
            <strong className="text-[#1d1d1f]">Need a custom rollout?</strong> Multi-brand
            deployment, security review, SSO, and custom integrations are scoped with your operating
            model.
          </span>
          <Link
            className="mt-3 inline-flex shrink-0 items-center gap-2 font-semibold text-[#1d1d1f] underline underline-offset-4 sm:mt-0"
            to="/contact?intent=sales"
          >
            Talk to Wireline <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="border-y border-[#1d1d1f]/10 bg-white px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 text-sm font-medium text-[#4f4f55]">
              <ShieldCheck className="h-4 w-4 text-[#1d1d1f]" />
              Coverage that stays understandable
            </div>
            <h2 className="mt-4 text-balance text-[clamp(2.2rem,5vw,4rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-[#1d1d1f]">
              Start with coverage. Scale through usage.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-6 text-[#5e5e64]">
              Every plan includes a defined number of agents, phone numbers, and voice minutes. Add
              capacity only when it produces useful coverage.
            </p>
          </div>
          <div className="grid gap-3">
            {FAQS.map(([question, answer]) => (
              <article
                className="rounded-xl border border-[#1d1d1f]/10 bg-[#f7f7f5] p-5"
                key={question}
              >
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
