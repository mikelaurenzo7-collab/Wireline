import { Link } from "react-router-dom";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import MarketingFooter from "../components/marketing/MarketingFooter";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import { PageMeta } from "../lib/page-meta";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 9,
    period: "mo",
    tagline: "Your personal agent, live.",
    features: [
      "1 active agent",
      "Personal number included",
      "Voice + text handling",
      "Call summaries via text",
      "Booking and message-taking",
      "Email follow-up",
    ],
    cta: "Start 7-day trial",
    ctaPath: "/signup?plan=starter",
    featured: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    period: "mo",
    tagline: "More agents. More coverage.",
    badge: "Most popular",
    features: [
      "3 active agents",
      "Dedicated numbers per agent",
      "Custom voice and persona",
      "Workflow automation",
      "CRM and calendar sync",
      "Priority support",
    ],
    cta: "Start 7-day trial",
    ctaPath: "/signup?plan=pro",
    featured: true,
  },
  {
    id: "business",
    name: "Business",
    price: 79,
    period: "mo",
    tagline: "The full front desk.",
    features: [
      "Unlimited agents",
      "Team inbox and routing",
      "Roles and approvals",
      "Analytics dashboard",
      "SSO and audit logs",
      "Dedicated onboarding",
    ],
    cta: "Start 7-day trial",
    ctaPath: "/signup?plan=business",
    featured: false,
  },
] as const;

const FAQ = [
  [
    "Is there a free plan?",
    "No free tier — but every plan starts with a 7-day trial, no card required. You get the full experience from day one.",
  ],
  [
    "Can I switch plans later?",
    "Yes. Upgrade or downgrade anytime from your account settings. Changes take effect at the start of your next billing cycle.",
  ],
  [
    "What counts as an agent?",
    "Each agent is a separately configured voice persona with its own number, brief, and workflow. You can run them simultaneously.",
  ],
  [
    "Do you support team accounts?",
    "Business plan includes shared inbox, team roles, and routing. For larger rollouts with custom governance, contact us.",
  ],
] as const;

export default function Pricing() {
  return (
    <div className="marketing-surface wl-pricing-page min-h-screen bg-background text-foreground">
      <PageMeta
        title="Pricing | Wireline — Phone agents for personal and business"
        description="Start your 7-day free trial. Wireline offers three plans — Starter at $9, Pro at $29, and Business at $79 — for personal and professional voice AI coverage."
        path="/pricing"
      />
      <PrecisionPublicHeader />

      <main id="main-content" className="pt-16 safe-area-insets" tabIndex={-1}>
        {/* Hero */}
        <section className="border-b border-border px-5 py-12 sm:px-8 sm:py-20 lg:px-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="wl-overline text-primary">Pricing</p>
            <h1
              className="mt-4 text-balance leading-[1.03] tracking-[-0.025em] text-foreground"
              style={{
                fontFamily: "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                fontWeight: 400,
                fontSize: "clamp(2.25rem, 5vw, 4rem)",
              }}
            >
              Simple pricing. Real coverage.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              Every plan includes a 7-day free trial. No card required to start. Cancel anytime.
            </p>
          </div>
        </section>

        {/* Plans */}
        <section className="px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-3 lg:items-stretch">
            {PLANS.map((plan) =>
              plan.featured ? (
                <article
                  key={plan.id}
                  className="relative flex flex-col rounded-2xl p-7 sm:p-9"
                  style={{
                    background: "var(--wireline-color-text-primary)",
                    color: "var(--wireline-color-canvas-default)",
                  }}
                >
                  {plan.badge && (
                    <span
                      className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full px-3.5 py-1 text-xs font-semibold uppercase tracking-wider"
                      style={{
                        background: "var(--wireline-color-action-primary-default)",
                        color: "var(--wireline-color-text-onAction)",
                      }}
                    >
                      {plan.badge}
                    </span>
                  )}
                  <p
                    className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "rgba(247,246,243,0.55)" }}
                  >
                    {plan.name}
                  </p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span
                      className="text-[clamp(2.5rem,5vw,3.25rem)] font-light leading-none tracking-[-0.04em]"
                      style={{
                        fontFamily: "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                        color: "var(--wireline-color-canvas-default)",
                      }}
                    >
                      ${plan.price}
                    </span>
                    <span className="text-sm" style={{ color: "rgba(247,246,243,0.55)" }}>
                      /{plan.period}
                    </span>
                  </div>
                  <p
                    className="mt-2 text-sm leading-6"
                    style={{ color: "rgba(247,246,243,0.7)" }}
                  >
                    {plan.tagline}
                  </p>
                  <ul className="mt-7 flex-1 space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm leading-6">
                        <Check
                          size={15}
                          className="mt-0.5 shrink-0"
                          style={{ color: "var(--wireline-color-action-primary-default)" }}
                          strokeWidth={2.5}
                        />
                        <span style={{ color: "rgba(247,246,243,0.88)" }}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-9">
                    <Link
                      to={plan.ctaPath}
                      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full text-sm font-semibold uppercase tracking-[.05em] transition hover:-translate-y-px"
                      style={{
                        background: "var(--wireline-color-action-primary-default)",
                        color: "var(--wireline-color-text-onAction)",
                      }}
                    >
                      {plan.cta} <ArrowRight size={14} />
                    </Link>
                  </div>
                </article>
              ) : (
                <article
                  key={plan.id}
                  className="wl-stitch-card group flex flex-col rounded-2xl border border-border bg-card p-7 transition-all hover:-translate-y-px hover:shadow-md sm:p-9"
                >
                  <p className="wl-overline text-primary">{plan.name}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span
                      className="text-[clamp(2.5rem,5vw,3.25rem)] font-light leading-none tracking-[-0.04em] text-foreground"
                      style={{
                        fontFamily: "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                      }}
                    >
                      ${plan.price}
                    </span>
                    <span className="text-sm text-muted-foreground">/{plan.period}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{plan.tagline}</p>
                  <ul className="mt-7 flex-1 space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm leading-6 text-foreground">
                        <Check
                          size={15}
                          className="mt-0.5 shrink-0 text-primary"
                          strokeWidth={2.5}
                        />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-9">
                    <Link
                      to={plan.ctaPath}
                      className="marketing-btn-primary flex min-h-[48px] w-full items-center justify-center gap-2 px-5 text-sm font-semibold uppercase tracking-[.05em]"
                    >
                      {plan.cta} <ArrowRight size={14} />
                    </Link>
                  </div>
                </article>
              )
            )}
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            All plans billed monthly. Annual billing saves 20% — available at checkout.
          </p>
        </section>

        {/* Differentiator strip */}
        <section
          className="px-5 py-14 sm:px-8 sm:py-16"
          style={{ background: "var(--wireline-color-text-primary)" }}
        >
          <div className="mx-auto max-w-4xl text-center">
            <h2
              className="text-balance leading-[1.06] tracking-[-0.025em]"
              style={{
                fontFamily: "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                fontWeight: 400,
                fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)",
                color: "var(--wireline-color-canvas-default)",
              }}
            >
              Your phone answers every call.
              <br />
              <span style={{ color: "var(--wireline-color-action-primary-default)" }}>
                You never miss what matters.
              </span>
            </h2>
            <p
              className="mx-auto mt-5 max-w-xl text-base leading-7"
              style={{ color: "rgba(247,246,243,0.65)" }}
            >
              Wireline agents pick up, handle the call, and text you a summary — whether it's a spam
              caller being dismissed or a client appointment being booked.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-border px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <p className="wl-overline">Questions</p>
              <h2
                className="mt-3 text-balance leading-[1.08] tracking-[-0.025em] text-foreground"
                style={{
                  fontFamily: "var(--wireline-font-family-display), 'Instrument Serif', Georgia, serif",
                  fontWeight: 400,
                  fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
                }}
              >
                Straight answers before you start.
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
                Stripe-secured billing. Cancel anytime — no questions asked.
              </p>
              <Link
                to="/signup"
                className="marketing-btn-primary min-h-12 px-8 text-sm font-semibold uppercase tracking-[.05em]"
              >
                Start your free trial <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
