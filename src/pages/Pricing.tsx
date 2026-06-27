import { Link } from "react-router-dom";
import { ArrowRight, Building2, Check, Play, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import MarketingFooter from "../components/marketing/MarketingFooter";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import { CONVERSATION_BALANCE_PRESETS_USD } from "../lib/conversation-balance";
import { PageMeta } from "../lib/page-meta";

const PERSONAL_FEATURES = [
  "All templates unlocked",
  "1 active agent shaped around your brief",
  "Training stays first-class before anything goes live",
  "Conversation Balance funds live work only when you choose",
] as const;

const CAPACITY_TIERS = [
  {
    name: "Wireline Team",
    eyebrow: "Shared coverage",
    body: "Multi-agent coverage with shared inbox and routing.",
    features: [
      "Multi-agent coverage",
      "Shared inbox and follow-up",
      "Routing and approvals",
      "Core integrations and numbers",
    ],
  },
  {
    name: "Wireline Business",
    eyebrow: "Operating capacity",
    body: "CRM, roles, analytics, and pooled usage.",
    features: [
      "CRM and policy controls",
      "Team roles and approvals",
      "Analytics and usage visibility",
      "Pooled Conversation Balance",
    ],
  },
  {
    name: "Wireline Enterprise",
    eyebrow: "Governed rollout",
    body: "SSO, SCIM, audit, and custom governance.",
    features: [
      "SSO, SCIM, and audit support",
      "Custom policy and governance",
      "BYO telephony and rollout support",
      "Committed annual usage",
    ],
  },
] as const;

const FAQ = [
  [
    "Do I need a subscription to start?",
    "No. Create and train an agent first. Personal live work starts only when you add Conversation Balance.",
  ],
  ["Are templates locked by plan?", "No. Templates are product capabilities, not pricing walls."],
  [
    "What is Conversation Balance?",
    "It is customer-controlled funding for live calls, texts, and follow-up work.",
  ],
  [
    "When do I move beyond Personal?",
    "When coverage becomes shared and you need routing, approvals, integrations, governance, or pooled usage.",
  ],
] as const;

export default function Pricing() {
  return (
    <div className="marketing-surface wl-pricing-page min-h-screen bg-background text-foreground">
      <PageMeta
        title="Pricing | Create free, fund live work when ready | Wireline"
        description="Create and train a Wireline agent for free. Fund live work with Conversation Balance and move into Team, Business, or Enterprise capacity when operations become shared."
        path="/pricing"
      />
      <PrecisionPublicHeader />

      <main id="main-content" className="pt-16 safe-area-insets" tabIndex={-1}>
        <section className="border-b border-border px-5 py-12 sm:px-8 sm:py-20 lg:px-10">
          <div className="wl-marketing-rail wl-section-stack text-center">
            <div className="mx-auto max-w-3xl">
              <p className="wl-overline text-primary">Pricing</p>
              <h1 className="mt-4 text-balance text-[clamp(38px,5.6vw,64px)] font-semibold leading-[1.04] tracking-[-.05em] text-foreground">
                Create free. Train deeply. Fund live work when it matters.
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground sm:text-[var(--wireline-typography-h3-size)] sm:leading-8">
                Wireline sells operating capacity, not template access. Create and train for free,
                fund live calls and texts through Conversation Balance, and move into Team or
                Business capacity when work becomes shared.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  to="/signup"
                  className="marketing-btn-primary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
                >
                  Create agent
                </Link>
                <Link
                  to="/showcase"
                  className="marketing-btn-secondary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
                >
                  <Play size={15} /> Hear a demo
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_.9fr] lg:items-stretch">
            <article className="wl-stitch-card group flex flex-col rounded-2xl border border-border bg-card p-6 text-center transition-all hover:-translate-y-px hover:shadow-md sm:p-9">
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="size-5 text-primary" />
                <span className="wl-overline">Wireline Personal</span>
              </div>
              <div className="mt-5 flex items-baseline gap-2">
                <span className="wl-metric-value text-[clamp(2.5rem,6vw,3.5rem)]">$0</span>
                <span className="wl-overline">to create and train</span>
              </div>
              <p className="mx-auto mt-3 max-w-md text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground">
                Start with one live agent, one number, and a short intake. Add Conversation Balance
                only when you are ready for real work.
              </p>
              <div className="mt-7">
                <p className="wl-overline mb-3">Suggested first top-ups</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {CONVERSATION_BALANCE_PRESETS_USD.map((amount, index) => (
                    <span
                      key={amount}
                      className={
                        (index === 0
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-card text-foreground") +
                        " inline-flex min-w-[64px] items-center justify-center rounded-full border px-4 py-2 text-[var(--wireline-typography-body-size)] font-semibold tabular-nums"
                      }
                    >
                      ${amount}
                    </span>
                  ))}
                </div>
              </div>
              <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
                {PERSONAL_FEATURES.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start justify-center gap-2.5 text-[var(--wireline-typography-body-size)] leading-6 text-foreground"
                  >
                    <Check size={16} className="mt-0.5 shrink-0 text-primary" strokeWidth={2.5} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link
                  to="/signup"
                  className="marketing-btn-primary w-full justify-center px-6 py-3.5 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em] sm:w-auto"
                >
                  Start Personal <ArrowRight size={14} />
                </Link>
              </div>
            </article>

            <aside className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                [Wallet, "Conversation Balance", "Top up only when you want live work to run."],
                [
                  ShieldCheck,
                  "No template lock",
                  "Every template stays available regardless of tier.",
                ],
                [
                  Building2,
                  "Capacity when shared",
                  "Move into Team, Business, or Enterprise once routing and governance become shared.",
                ],
              ].map(([Icon, title, body]) => {
                const CardIcon = Icon as typeof Wallet;
                return (
                  <article
                    key={String(title)}
                    className="wl-stitch-card group flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-5 text-center transition-all hover:-translate-y-px hover:shadow-md"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-primary/10 text-primary">
                      <CardIcon size={18} />
                    </span>
                    <div>
                      <h2 className="wl-card-title">{String(title)}</h2>
                      <p className="mt-1 text-[var(--wireline-typography-caption-size)] leading-6 text-muted-foreground">
                        {String(body)}
                      </p>
                    </div>
                  </article>
                );
              })}
            </aside>
          </div>
        </section>

        <section className="border-t border-border bg-card px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="wl-overline text-primary">Capacity tiers</p>
              <h2 className="mt-4 text-balance text-[clamp(28px,3.6vw,42px)] font-semibold leading-[1.1] tracking-[-.04em] text-foreground">
                Shared operations should buy capacity, not vague unlimited promises.
              </h2>
              <p className="mt-4 text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground">
                Team, Business, and Enterprise are for shared coverage, approvals, routing, and
                governance. Live work still reconciles through Conversation Balance.
              </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {CAPACITY_TIERS.map((tier) => (
                <article
                  key={tier.name}
                  className="wl-stitch-card group flex flex-col rounded-xl border border-border bg-card p-6 text-center transition-all hover:-translate-y-px hover:shadow-md"
                >
                  <p className="wl-overline text-primary">{tier.eyebrow}</p>
                  <h3 className="wl-card-title mt-4 text-lg">{tier.name}</h3>
                  <p className="mt-4 flex-1 text-[var(--wireline-typography-caption-size)] leading-6 text-muted-foreground">
                    {tier.body}
                  </p>
                  <ul className="mt-5 space-y-2.5">
                    {tier.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start justify-center gap-2.5 text-[var(--wireline-typography-caption-size)] leading-6 text-foreground"
                      >
                        <Check
                          size={15}
                          className="mt-0.5 shrink-0 text-primary"
                          strokeWidth={2.5}
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-7">
                    <Link
                      to="/contact"
                      className="marketing-btn-secondary w-full justify-center px-5 py-3 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
                    >
                      Talk to sales <ArrowRight size={14} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
          <div className="mx-auto max-w-4xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="wl-overline">Questions</p>
              <h2 className="mt-3 text-[clamp(26px,3vw,36px)] font-semibold leading-[1.1] tracking-[-.04em] text-foreground">
                Straightforward before anything goes live.
              </h2>
            </div>
            <div className="mt-8 space-y-3">
              {FAQ.map(([question, answer]) => (
                <details key={question} className="group wl-stitch-card overflow-hidden">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-5 px-5 py-4 text-sm font-semibold text-foreground">
                    <span>{question}</span>
                    <span
                      aria-hidden="true"
                      className="text-lg text-muted-foreground transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="border-t border-border px-5 py-4 text-sm leading-6 text-muted-foreground">
                    {answer}
                  </p>
                </details>
              ))}
            </div>
            <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row sm:items-center">
              <p className="flex items-center gap-2 text-[var(--wireline-typography-caption-size)] text-muted-foreground">
                <ShieldCheck size={15} className="text-primary" /> Stripe-secured web billing. You
                stay in control.
              </p>
              <Link
                to="/signup"
                className="marketing-btn-primary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
              >
                Create agent <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
