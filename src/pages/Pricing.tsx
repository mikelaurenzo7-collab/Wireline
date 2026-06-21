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
      className={`wl-stitch-pricing-card ${recommended ? "wl-stitch-pricing-card--featured" : ""}`}
    >
      {recommended && <span className="wl-stitch-pricing-badge">Recommended</span>}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-[-0.035em] text-foreground">{plan.name}</h2>
      </div>
      <p className="mt-3 min-h-[72px] text-sm leading-6 text-muted-foreground">
        {PLAN_COPY[plan.id]}
      </p>

      <div className="mt-8 flex items-end gap-1">
        <span className="text-5xl font-semibold leading-none tracking-[-0.065em] text-foreground">
          {price(plan, interval)}
        </span>
        <span className="pb-1.5 text-xs text-muted-foreground">{cadence(interval)}</span>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        {plan.max_agents} included agent{plan.max_agents === 1 ? "" : "s"} ·{" "}
        {plan.voice_minutes_monthly.toLocaleString("en-US")} minutes · {plan.included_phone_numbers}{" "}
        number{plan.included_phone_numbers === 1 ? "" : "s"}
      </p>

      <Link
        to={signup(plan)}
        className={`mt-8 min-h-12 px-5 text-sm active:scale-[0.985] ${
          recommended ? "workspace-btn-primary" : "workspace-btn-secondary"
        }`}
      >
        {plan.id === "personal" ? "Choose Personal" : `Start ${plan.name}`}
        <ArrowRight className="h-4 w-4" />
      </Link>

      <ul className="mt-7 space-y-3 border-t border-border pt-6 text-sm leading-5 text-muted-foreground">
        {plan.features.slice(0, 6).map((feature) => (
          <li className="flex gap-2.5" key={feature}>
            <Check className="mt-0.5 h-4 w-4 flex-none text-primary" />
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
          <p className="wl-stitch-eyebrow">Simple, usable pricing</p>
          <h1 className="wl-stitch-marketing-hero mt-4 text-balance">
            Choose the plan that fits your call volume.
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg font-medium leading-relaxed tracking-[-0.02em] text-muted-foreground">
            Start with included coverage, then add assistants and minutes as the work grows. No
            cluttered bundles. No fake unlimited promises.
          </p>
        </div>

        <div className="wl-stitch-interval-toggle mt-10" aria-label="Billing interval">
          {(["month", "year"] as const).map((option) => (
            <button
              type="button"
              key={option}
              aria-pressed={interval === option}
              onClick={() => setInterval(option)}
              className="min-h-10 rounded-full px-4 text-sm font-semibold transition text-muted-foreground hover:text-foreground"
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
        <section className="border-y border-border bg-card px-5 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="wl-stitch-eyebrow">Personal</p>
              <h2 className="wl-stitch-display mt-4 text-balance">
                Give your day a call assistant.
              </h2>
              <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
                Use Wireline to make the call, wait on hold, capture the answer, and hand the next
                step back to you.
              </p>
              <div className="mt-7 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                A light-use plan built for real life.
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
          <p className="wl-stitch-eyebrow">Business</p>
          <h2 className="wl-stitch-display mt-4 text-balance">
            Put an AI front office on every conversation.
          </h2>
          <p className="mt-5 max-w-2xl text-lg font-medium leading-8 tracking-[-0.02em] text-muted-foreground">
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

        <div className="mt-7 rounded-xl border border-border bg-muted p-5 text-sm leading-6 text-muted-foreground sm:flex sm:items-center sm:justify-between sm:gap-8">
          <span>
            <strong className="text-foreground">Need a custom rollout?</strong> Multi-brand
            deployment, security review, SSO, and custom integrations are scoped with your operating
            model.
          </span>
          <Link
            className="mt-3 inline-flex shrink-0 items-center gap-2 font-semibold text-primary underline underline-offset-4 sm:mt-0"
            to="/contact?intent=sales"
          >
            Talk to Wireline <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="border-y border-border bg-card px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Coverage that stays understandable
            </div>
            <h2 className="wl-stitch-headline mt-4 text-balance">
              Start with coverage. Scale through usage.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-6 text-muted-foreground">
              Every plan includes a defined number of assistants, phone numbers, and voice minutes. Add
              capacity only when it produces useful coverage.
            </p>
          </div>
          <div className="grid gap-3">
            {FAQS.map(([question, answer]) => (
              <article className="wl-stitch-card p-5" key={question}>
                <h3 className="font-semibold tracking-[-0.02em] text-foreground">{question}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
