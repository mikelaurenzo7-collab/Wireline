import { Link } from "react-router-dom";
import { ArrowRight, Building2, Check, ShieldCheck, Users, WalletCards } from "lucide-react";
import MarketingFooter from "../components/marketing/MarketingFooter";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import { PageMeta } from "../lib/page-meta";
import { STRIPE_PLANS, type StripePlanId } from "../lib/plan-catalog";

const planById = Object.fromEntries(STRIPE_PLANS.map((plan) => [plan.id, plan])) as Record<
  StripePlanId,
  (typeof STRIPE_PLANS)[number]
>;

const PRICING_TIERS = [
  {
    id: "personal",
    name: "Personal",
    eyebrow: "For one person",
    price: "$0",
    period: "to create",
    tagline: "Fund live work with Conversation Balance.",
    detail:
      "Create and train one phone agent before billing. When it starts answering real calls, texts, and follow-up, spend comes from prepaid Conversation Balance.",
    features: [
      "1 active agent",
      "1 phone line",
      "Templates unlocked",
      "Conversation Balance for live work",
    ],
    cta: "Start with Personal",
    ctaPath: "/signup?plan=personal",
    icon: WalletCards,
    featured: false,
  },
  {
    id: "team",
    name: "Team",
    eyebrow: "For small teams",
    price: `$${planById.team.price_usd_monthly}`,
    period: "mo",
    tagline: "Shared capacity for a real operating lane.",
    detail:
      "Several agents, one inbox, connected numbers, approvals, and core integrations for teams moving beyond a single personal line.",
    features: [
      `${planById.team.max_agents} active agents`,
      `${planById.team.included_phone_numbers} phone lines included`,
      `Extra agents at $${planById.team.extra_agent_price_usd}/mo`,
      "Routing, approvals, and team inbox",
    ],
    cta: "Start Team",
    ctaPath: "/signup?plan=team",
    icon: Users,
    featured: false,
  },
  {
    id: "business",
    name: "Business",
    eyebrow: "Best operating tier",
    price: `$${planById.business.price_usd_monthly}`,
    period: "mo",
    tagline: "Front desk, revenue, and support coverage.",
    detail:
      "The serious business tier: more agents, more lines, CRM sync, analytics, roles, and approvals for inbound, outbound, and follow-up.",
    features: [
      `${planById.business.max_agents} active agents`,
      `${planById.business.included_phone_numbers} phone lines included`,
      `Extra agents at $${planById.business.extra_agent_price_usd}/mo`,
      "CRM sync, analytics, roles, and approvals",
    ],
    cta: "Start Business",
    ctaPath: "/signup?plan=business",
    icon: Building2,
    featured: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    eyebrow: "For scale",
    price: "Custom",
    period: "annual",
    tagline: "Governed rollouts and custom telephony.",
    detail:
      "Annual committed usage, SSO, audit support, BYO SIP, security review, and rollout planning for larger teams.",
    features: [
      "Custom agent and line capacity",
      "SSO, audit, and governed policy controls",
      "Custom integrations and telephony",
      "Implementation and launch support",
    ],
    cta: "Talk to Wireline",
    ctaPath: "/contact?topic=enterprise",
    icon: ShieldCheck,
    featured: false,
  },
] as const;

const FAQ = [
  [
    "Does Personal require a subscription?",
    "No. Personal is free to create and train. Live calls, texts, and follow-up are funded through Conversation Balance.",
  ],
  [
    "What is Conversation Balance?",
    "Prepaid Stripe credit for live voice work and provider-backed actions. It keeps personal usage flexible and gives teams a clear operating wallet.",
  ],
  [
    "Can I switch into Team or Business later?",
    "Yes. Start with one agent, then move into shared capacity when the phone line becomes a team workflow.",
  ],
  [
    "Are templates locked by plan?",
    "No. Templates stay unlocked. Pricing is based on operating capacity: agents, lines, routing, approvals, collaboration, and reliability.",
  ],
] as const;

export default function Pricing() {
  return (
    <div className="marketing-surface wl-pricing-page min-h-screen bg-background text-foreground">
      <PageMeta
        title="Pricing | Wireline - Personal, team, business, and enterprise phone agents"
        description="Create and train a personal phone agent for free, fund live work with Conversation Balance, or move into Team and Business capacity when Wireline becomes an operating lane."
        path="/pricing"
      />
      <PrecisionPublicHeader />

      <main id="main-content" className="pt-16 safe-area-insets" tabIndex={-1}>
        <section className="border-b border-border px-5 py-12 sm:px-8 sm:py-20 lg:px-10">
          <div className="mx-auto max-w-4xl text-center">
            <p className="wl-overline text-primary">Pricing</p>
            <h1
              className="mx-auto mt-4 max-w-4xl text-balance leading-[1.03] tracking-[-0.025em] text-foreground"
              style={{
                fontFamily:
                  "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                fontWeight: 400,
                fontSize: "clamp(2.4rem, 6vw, 5.5rem)",
              }}
            >
              Personal first. Team when the phones become an operation.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Start with one agent and a prepaid balance. Add shared capacity when Wireline is
              handling front desk, revenue, support, or follow-up for more than one person.
            </p>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="mx-auto grid max-w-[1360px] gap-4 lg:grid-cols-4 lg:items-stretch">
            {PRICING_TIERS.map((plan) => {
              const Icon = plan.icon;
              return (
                <article
                  key={plan.id}
                  className={`relative flex min-h-[520px] flex-col rounded-[var(--wireline-radius-xl)] border p-6 transition-all sm:p-7 ${
                    plan.featured
                      ? "border-primary bg-[var(--wireline-color-text-primary)] text-[var(--wireline-color-canvas-default)] shadow-[var(--wireline-elevation-lg)]"
                      : "border-border bg-card hover:-translate-y-px hover:shadow-[var(--wireline-elevation-md)]"
                  }`}
                >
                  {plan.featured ? (
                    <span className="absolute right-5 top-5 rounded-full bg-primary px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[.12em] text-primary-foreground">
                      Most useful
                    </span>
                  ) : null}

                  <div className="mb-8 flex items-center justify-between gap-4">
                    <span
                      className={`font-mono text-[10px] font-semibold uppercase tracking-[.14em] ${
                        plan.featured ? "text-[rgba(247,246,243,.62)]" : "text-primary"
                      }`}
                    >
                      {plan.eyebrow}
                    </span>
                    <span
                      className={`grid size-10 place-items-center rounded-[var(--wireline-radius-md)] border ${
                        plan.featured
                          ? "border-white/10 bg-white/10 text-[var(--wireline-color-canvas-default)]"
                          : "border-border bg-muted text-primary"
                      }`}
                    >
                      <Icon size={17} aria-hidden="true" />
                    </span>
                  </div>

                  <h2
                    className="text-[2rem] leading-none tracking-[-0.025em]"
                    style={{
                      fontFamily:
                        "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                      fontWeight: 400,
                    }}
                  >
                    {plan.name}
                  </h2>
                  <p
                    className={`mt-2 text-sm leading-6 ${
                      plan.featured ? "text-[rgba(247,246,243,.68)]" : "text-muted-foreground"
                    }`}
                  >
                    {plan.tagline}
                  </p>

                  <div className="mt-8 flex items-end gap-2">
                    <span
                      className="text-[clamp(2.7rem,5vw,4.2rem)] leading-none tracking-[-0.04em]"
                      style={{
                        fontFamily:
                          "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                        fontWeight: 400,
                      }}
                    >
                      {plan.price}
                    </span>
                    <span
                      className={`pb-2 text-sm ${
                        plan.featured ? "text-[rgba(247,246,243,.58)]" : "text-muted-foreground"
                      }`}
                    >
                      {plan.period === "mo" ? "/mo" : plan.period}
                    </span>
                  </div>

                  <p
                    className={`mt-6 min-h-[96px] text-sm leading-6 ${
                      plan.featured ? "text-[rgba(247,246,243,.72)]" : "text-muted-foreground"
                    }`}
                  >
                    {plan.detail}
                  </p>

                  <ul className="mt-7 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className={`flex items-start gap-2.5 text-sm leading-6 ${
                          plan.featured ? "text-[rgba(247,246,243,.9)]" : "text-foreground"
                        }`}
                      >
                        <Check
                          size={15}
                          className={`mt-0.5 shrink-0 ${plan.featured ? "text-primary" : "text-primary"}`}
                          strokeWidth={2.5}
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    to={plan.ctaPath}
                    className={`mt-8 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[var(--wireline-radius-md)] px-5 text-sm font-semibold transition active:scale-[.985] ${
                      plan.featured
                        ? "bg-[var(--wireline-color-canvas-default)] text-[var(--wireline-color-text-primary)] hover:bg-white"
                        : "marketing-btn-primary"
                    }`}
                  >
                    {plan.cta}
                    <ArrowRight size={14} />
                  </Link>
                </article>
              );
            })}
          </div>
        </section>

        <section className="border-y border-border bg-card/55 px-5 py-12 sm:px-8 lg:px-10">
          <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[.72fr_1fr] lg:items-center">
            <div>
              <p className="wl-overline text-primary">Conversation Balance</p>
              <h2
                className="mt-3 text-balance text-[clamp(2rem,4vw,3.25rem)] leading-[1.04] tracking-[-0.025em]"
                style={{
                  fontFamily:
                    "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                  fontWeight: 400,
                }}
              >
                Balance pays for the live work. Plans add operating capacity.
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Start", "Create and train before the first recurring plan."],
                ["Fund", "Top up prepaid credit for calls, texts, and follow-up."],
                ["Scale", "Move into Team or Business when more people need the lane."],
              ].map(([label, body]) => (
                <div
                  key={label}
                  className="rounded-[var(--wireline-radius-lg)] border border-border bg-background p-5"
                >
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[.14em] text-primary">
                    {label}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <p className="wl-overline">Questions</p>
              <h2
                className="mt-3 text-balance leading-[1.08] tracking-[-0.025em] text-foreground"
                style={{
                  fontFamily:
                    "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                  fontWeight: 400,
                  fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
                }}
              >
                Straight answers before you wire the first line.
              </h2>
            </div>
            <div className="mt-10 space-y-3">
              {FAQ.map(([question, answer]) => (
                <details key={question} className="group wl-stitch-card overflow-hidden rounded-xl">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-5 px-5 py-4 text-sm font-semibold text-foreground">
                    <span>{question}</span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-lg text-muted-foreground transition-transform group-open:rotate-45"
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

            <div className="mt-12 flex flex-col items-center gap-5 text-center">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck size={15} className="text-primary" />
                Stripe-secured checkout, prepaid balance, and customer portal management.
              </p>
              <Link
                to="/signup"
                className="marketing-btn-primary min-h-12 px-8 text-sm font-semibold tracking-[.05em]"
              >
                Start with one agent <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
