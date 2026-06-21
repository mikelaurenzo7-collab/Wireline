import { useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import { PageMeta } from "../lib/page-meta";
import { STRIPE_PLANS, type StripePlan } from "../lib/plan-catalog";

type Interval = "month" | "year";

const descriptions: Record<string, string> = {
  personal: "Personal call delegation for the waits, follow-ups, and life admin you want back.",
  "business-starter": "Reliable front-office coverage for conversations that should never go unanswered.",
  starter: "Expanded coverage, routing, and review for growing teams.",
  scale: "Custom operating coverage for multi-location or high-volume teams.",
};

function currency(amount: number) { return `$${amount.toLocaleString("en-US")}`; }
function amount(plan: StripePlan, interval: Interval) { return interval === "year" ? plan.price_usd_annual : plan.price_usd_monthly; }
function signup(plan: StripePlan) { return `/signup?plan=${encodeURIComponent(plan.id)}`; }

function PlanCard({ plan, interval, featured }: { plan: StripePlan; interval: Interval; featured?: boolean }) {
  const price = amount(plan, interval);
  return <article className={`relative flex min-h-[450px] flex-col rounded-lg border bg-card p-8 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${featured ? "border-2 border-primary" : "border-border"}`}>
    {featured ? <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-black bg-primary px-4 py-1 font-mono text-[11px] font-medium uppercase tracking-[.05em] text-primary-foreground">Recommended</span> : null}
    <p className="font-mono text-[12px] font-medium uppercase tracking-[.12em] text-muted-foreground">{plan.name}</p>
    <div className="mt-4 flex items-end gap-1"><span className="text-[36px] font-semibold leading-none tracking-[-.04em] text-foreground">{price === 0 ? "Free" : currency(price)}</span>{price > 0 ? <span className="pb-1 text-[14px] text-muted-foreground">/ {interval === "year" ? "year" : "month"}</span> : null}</div>
    <p className="mt-4 min-h-[44px] text-[14px] leading-5 text-muted-foreground">{descriptions[plan.id] || "Reliable coverage designed around your operating model."}</p>
    <ul className="mt-7 space-y-3 text-[14px] leading-5 text-foreground">{plan.features.slice(0, 5).map((feature) => <li className="flex gap-3" key={feature}><Check size={16} className="mt-0.5 shrink-0 text-primary" />{feature}</li>)}</ul>
    <Link to={signup(plan)} className={`mt-auto min-h-11 justify-center px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[.05em] ${featured ? "workspace-btn-primary" : "workspace-btn-secondary"}`}>{plan.id === "scale" ? "Contact sales" : plan.id === "personal" ? "Get started" : "Start plan"}</Link>
  </article>;
}

export default function Pricing() {
  const [interval, setInterval] = useState<Interval>("month");
  const personal = STRIPE_PLANS.find((plan) => plan.id === "personal");
  const business = STRIPE_PLANS.filter((plan) => ["business-starter", "starter", "scale"].includes(plan.id));
  const displayPlans = [personal, ...business].filter(Boolean) as StripePlan[];
  return <div className="min-h-screen bg-background text-foreground"><PrecisionPublicHeader /><main className="pt-16"><PageMeta title="Wireline Pricing | Personal and Business AI Coverage" description="Clear Wireline pricing for personal call delegation and business conversation coverage." path="/pricing" />
    <section className="border-b border-border px-5 pb-10 pt-16 text-center sm:px-8 sm:pt-20"><div className="mx-auto max-w-3xl"><h1 className="text-[clamp(34px,4vw,48px)] font-semibold tracking-[-.03em] text-foreground">Operator-grade pricing</h1><p className="mx-auto mt-4 max-w-2xl text-[16px] leading-6 text-muted-foreground">Start with the assistant you need today. Add phone coverage, workflows, and specialist assistants as your life or business grows.</p><div className="mt-7 inline-flex rounded border border-border bg-card p-1" aria-label="Billing interval">{(["month", "year"] as const).map((item) => <button type="button" aria-pressed={interval === item} onClick={() => setInterval(item)} key={item} className={`min-h-9 rounded-sm px-4 text-[12px] font-medium uppercase tracking-[.05em] ${interval === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{item === "month" ? "Monthly" : "Annual"}</button>)}</div></div></section>
    <section className="mx-auto max-w-[1280px] px-5 py-10 sm:px-8 lg:px-10"><div className={`grid gap-4 ${displayPlans.length > 3 ? "xl:grid-cols-4" : "lg:grid-cols-3"}`}>{displayPlans.map((plan) => <PlanCard key={plan.id} plan={plan} interval={interval} featured={plan.id === "business-starter"} />)}</div>
      <section className="mt-10 overflow-hidden rounded-lg border border-border bg-card"><h2 className="border-b border-border px-5 py-5 text-[20px] font-semibold tracking-[-.01em]">Coverage comparison</h2><div className="overflow-x-auto"><table className="w-full min-w-[680px] border-collapse text-left text-[14px]"><thead className="border-b border-border font-mono text-[11px] uppercase tracking-[.05em] text-muted-foreground"><tr><th className="px-5 py-4 font-medium">Capability</th>{displayPlans.map((plan) => <th key={plan.id} className="px-5 py-4 font-medium">{plan.name}</th>)}</tr></thead><tbody>{[["Assistants", (plan: StripePlan) => plan.max_agents === 999 ? "Unlimited" : `Up to ${plan.max_agents}`],["Voice minutes", (plan: StripePlan) => plan.voice_minutes_monthly.toLocaleString("en-US")],["Phone numbers", (plan: StripePlan) => String(plan.included_phone_numbers)],["Channels", (plan: StripePlan) => plan.features.find((feature) => /voice|sms|email/i.test(feature)) || "Voice"]].map(([label, value]) => <tr className="border-b border-border last:border-0" key={String(label)}><td className="px-5 py-4 font-medium text-foreground">{String(label)}</td>{displayPlans.map((plan) => <td className="px-5 py-4 text-muted-foreground" key={plan.id}>{(value as (plan: StripePlan) => string)(plan)}</td>)}</tr>)}</tbody></table></div></section></section>
  </main><footer className="border-t border-border px-5 py-8 text-[13px] text-muted-foreground sm:px-8"><div className="mx-auto flex max-w-[1280px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><span><strong className="text-foreground">Wireline</strong> · AI voice + messaging</span><div className="flex gap-5"><Link to="/for/personal">Product</Link><Link to="/features">Features</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div></div></footer></div>;
}
