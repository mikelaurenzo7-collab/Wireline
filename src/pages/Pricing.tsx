import { Link } from "react-router-dom";
import { ArrowRight, Building2, Check, Play, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import MarketingFooter from "../components/marketing/MarketingFooter";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import { CONVERSATION_BALANCE_PRESETS_USD } from "../lib/conversation-balance";
import { PageMeta } from "../lib/page-meta";

const PERSONAL_FEATURES = [
  "Build and test free",
  "Add balance only for live work",
  "No automatic reload",
  "Your voice, playbook, and approvals stay yours",
] as const;

type BusinessTier = {
  name: string;
  price: string;
  cadence: string;
  features: readonly string[];
  cta: { label: string; to: string };
  featured?: boolean;
};

const BUSINESS_TIERS: readonly BusinessTier[] = [
  {
    name: "Front desk",
    price: "$29",
    cadence: "/mo",
    features: ["Up to 4 assistants", "Dedicated phone lines", "Shared inbox", "Calendar and CRM connections"],
    cta: { label: "Start front desk", to: "/signup?plan=business-starter" },
  },
  {
    name: "Sales & reception",
    price: "$59",
    cadence: "/mo",
    features: ["Up to 8 assistants", "Smart routing", "Campaign templates", "Live team activity"],
    cta: { label: "Start sales & reception", to: "/signup?plan=starter" },
    featured: true,
  },
  {
    name: "Custom enterprise",
    price: "Let’s talk",
    cadence: "",
    features: ["Multi-location coverage", "Custom controls", "Security review", "Implementation support"],
    cta: { label: "Talk to sales", to: "/contact" },
  },
];

const FAQ = [
  ["Do I need a subscription to start?", "No. Build and test a personal assistant for free. Add Conversation Balance only when you are ready for live work."],
  ["Will balance reload automatically?", "No. You decide when to add more. There is no automatic reload."],
  ["What is Conversation Balance?", "It is prepaid funding for the live conversation work your assistant performs."],
  ["When do I need a business plan?", "When you need shared coverage, professional lines, routing, or team connections."],
] as const;

export default function Pricing() {
  return (
    <div className="wl-pricing-page min-h-screen bg-background text-foreground">
      <PageMeta
        title="Pricing | Build free, fund live work when ready | Wireline"
        description="Build a Wireline assistant for free. Fund live conversation work when it is useful. Business plans add shared coverage, routing, and team operations."
        path="/pricing"
      />
      <PrecisionPublicHeader />

      <main id="main-content" className="pt-16" tabIndex={-1}>
        <section className="border-b border-border px-5 py-12 sm:px-8 sm:py-20 lg:px-10">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="wl-overline text-primary">Pricing</p>
              <h1 className="mt-4 text-balance text-[clamp(38px,5.6vw,64px)] font-semibold leading-[1.04] tracking-[-.05em] text-foreground">
                Build it free. Fund it when it goes live.
              </h1>
              <p className="mt-5 max-w-xl text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground sm:text-[var(--wireline-typography-h3-size)] sm:leading-8">
                Start with a real assistant, shaped around your work. Conversation Balance begins only when you ask it to handle live conversations.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to="/signup" className="marketing-btn-primary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]">
                  Create your assistant
                </Link>
                <Link to="/showcase" className="marketing-btn-secondary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]">
                  <Play size={15} /> Hear a demo
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_.9fr] lg:items-stretch">
            <article className="wl-stitch-card p-6 sm:p-9">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                <span className="wl-overline">Personal workspace</span>
              </div>
              <div className="mt-5 flex items-baseline gap-2">
                <span className="wl-metric-value text-[clamp(2.5rem,6vw,3.5rem)]">$0</span>
                <span className="wl-overline">/ month</span>
              </div>
              <p className="mt-3 max-w-md text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground">
                Make the assistant yours first. Add balance when it begins carrying live work.
              </p>
              <div className="mt-7">
                <p className="wl-overline mb-3">Start with Conversation Balance</p>
                <div className="flex flex-wrap gap-2">
                  {CONVERSATION_BALANCE_PRESETS_USD.map((amount, index) => (
                    <span key={amount} className={(index === 0 ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-foreground") + " inline-flex min-w-[64px] items-center justify-center rounded-full border px-4 py-2 text-[var(--wireline-typography-body-size)] font-semibold tabular-nums"}>
                      ${amount}
                    </span>
                  ))}
                </div>
              </div>
              <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
                {PERSONAL_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-[var(--wireline-typography-body-size)] leading-6 text-foreground">
                    <Check size={16} className="mt-0.5 shrink-0 text-primary" strokeWidth={2.5} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link to="/signup" className="marketing-btn-primary w-full justify-center px-6 py-3.5 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em] sm:w-auto">
                  Start free <ArrowRight size={14} />
                </Link>
              </div>
            </article>

            <aside className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                [Wallet, "Start with $5", "Use Conversation Balance only for the live work you choose."],
                [ShieldCheck, "No automatic reload", "Every top-up stays deliberate and visible."],
                [Building2, "A clear operating model", "Balance and activity live in Billing alongside the work itself."],
              ].map(([Icon, title, body]) => {
                const CardIcon = Icon as typeof Wallet;
                return (
                  <article key={String(title)} className="wl-stitch-card flex gap-4 p-5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-primary/10 text-primary"><CardIcon size={18} /></span>
                    <div>
                      <h2 className="wl-card-title">{String(title)}</h2>
                      <p className="mt-1 text-[var(--wireline-typography-caption-size)] leading-6 text-muted-foreground">{String(body)}</p>
                    </div>
                  </article>
                );
              })}
            </aside>
          </div>
        </section>

        <section className="border-t border-border bg-card px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className="wl-overline text-primary">For teams</p>
              <h2 className="mt-4 text-balance text-[clamp(28px,3.6vw,42px)] font-semibold leading-[1.1] tracking-[-.04em] text-foreground">
                Add the operating layer when coverage becomes shared.
              </h2>
              <p className="mt-4 text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground">
                Professional lines, shared context, and deliberate routing for the conversations a team has to keep moving.
              </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {BUSINESS_TIERS.map((tier) => (
                <article key={tier.name} className={(tier.featured ? "border-primary/40 ring-1 ring-primary/20" : "") + " wl-stitch-card relative flex flex-col p-6"}>
                  {tier.featured ? <span className="wl-stitch-status-pill absolute right-4 top-4">Popular</span> : null}
                  <h3 className="wl-card-title text-lg">{tier.name}</h3>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="wl-metric-value text-[2rem]">{tier.price}</span>
                    {tier.cadence ? <span className="wl-overline">{tier.cadence}</span> : null}
                  </div>
                  <ul className="mt-5 flex-1 space-y-2.5">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-[var(--wireline-typography-caption-size)] leading-6 text-foreground">
                        <Check size={15} className="mt-0.5 shrink-0 text-primary" strokeWidth={2.5} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-7">
                    <Link to={tier.cta.to} className={(tier.featured ? "marketing-btn-primary" : "marketing-btn-secondary") + " w-full justify-center px-5 py-3 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"}>
                      {tier.cta.label} <ArrowRight size={14} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
          <div className="mx-auto max-w-4xl">
            <div className="max-w-2xl">
              <p className="wl-overline">Questions</p>
              <h2 className="mt-3 text-[clamp(26px,3vw,36px)] font-semibold leading-[1.1] tracking-[-.04em] text-foreground">Straightforward from the first conversation onward.</h2>
            </div>
            <div className="mt-8 space-y-3">
              {FAQ.map(([question, answer]) => (
                <details key={question} className="group wl-stitch-card overflow-hidden">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-5 px-5 py-4 text-sm font-semibold text-foreground">
                    <span>{question}</span><span aria-hidden="true" className="text-lg text-muted-foreground transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="border-t border-border px-5 py-4 text-sm leading-6 text-muted-foreground">{answer}</p>
                </details>
              ))}
            </div>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <p className="flex items-center gap-2 text-[var(--wireline-typography-caption-size)] text-muted-foreground"><ShieldCheck size={15} className="text-primary" /> Stripe-secured payments. You stay in control.</p>
              <Link to="/signup" className="marketing-btn-primary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]">Create your assistant <ArrowRight size={14} /></Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
