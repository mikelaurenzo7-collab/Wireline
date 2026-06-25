import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Check,
  Eye,
  Gauge,
  Play,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import MarketingFooter from "../components/marketing/MarketingFooter";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import { CONVERSATION_BALANCE_PRESETS_USD } from "../lib/conversation-balance";
import { PageMeta } from "../lib/page-meta";

const PERSONAL_FEATURES = [
  "Build and test personal assistants for free",
  "Add $5 when you are ready to put one to work",
  "Keep personal usage on a prepaid Conversation Balance",
  "Choose when to add more — no automatic reload",
  "Set rules and approvals before an assistant acts externally",
] as const;

type BusinessTier = {
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  features: readonly string[];
  cta: { label: string; to: string };
  featured?: boolean;
};

const BUSINESS_TIERS: readonly BusinessTier[] = [
  {
    name: "Front Desk",
    price: "$29",
    cadence: "/mo",
    blurb: "A real operating layer for a small team that needs reliable coverage.",
    features: [
      "Up to 4 assistants and agents",
      "Dedicated numbers for inbound and outbound",
      "Team handoff and shared inbox",
      "CRM and calendar connections",
      "Conversation Balance for live work",
    ],
    cta: { label: "Start Front Desk", to: "/signup?plan=business-starter" },
  },
  {
    name: "Sales & Reception",
    price: "$59",
    cadence: "/mo",
    blurb: "Routing, campaigns, and shared execution for busier teams.",
    features: [
      "Up to 8 assistants and agents",
      "Intelligent routing and department transfers",
      "Outbound campaign templates",
      "Live activity and collaboration",
      "Conversation Balance alongside the platform plan",
    ],
    cta: { label: "Start Sales & Reception", to: "/signup?plan=starter" },
    featured: true,
  },
  {
    name: "Custom Enterprise",
    price: "Let’s talk",
    cadence: "",
    blurb: "Multi-location scale, custom controls, and dedicated implementation.",
    features: [
      "Unlimited assistants, agents, and lines",
      "CRM deep-sync and custom webhooks",
      "SSO, security review, and compliance",
      "Dedicated implementation and SLA support",
    ],
    cta: { label: "Talk to sales", to: "/contact" },
  },
];

const BALANCE_PROMISES = [
  {
    icon: Wallet,
    title: "Start with $5",
    body: "Personal assistants stay free to build and test. Add only the amount you want when you are ready for live work.",
  },
  {
    icon: Gauge,
    title: "No forced reload",
    body: "Conversation Balance never reloads itself. You decide when the next top-up makes sense for your work.",
  },
  {
    icon: Eye,
    title: "See the money clearly",
    body: "Your Billing workspace keeps your current balance and recent activity in one place, alongside any business plan.",
  },
] as const;

const FAQ = [
  [
    "Do I need a subscription to start?",
    "No. Personal is free to build and test. Add a $5 Conversation Balance only when you are ready to start live work.",
  ],
  [
    "Will Wireline auto-reload my balance?",
    "No. Personal balance does not automatically reload. You decide when and how much to add.",
  ],
  [
    "What does Conversation Balance do?",
    "It is your prepaid live-work balance. Billing shows what is available and the recent movement of money in and out of your account.",
  ],
  [
    "When should a business choose a platform plan?",
    "Choose one when you need professional numbers, shared inboxes, routing, team members, or business integrations. The plan adds the operating layer; balance keeps live work funded.",
  ],
] as const;

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageMeta
        title="Pricing — Start free, add $5 to go live | Wireline"
        description="Personal assistants are free to build and test. Add a $5 Conversation Balance for live work. Business plans add numbers, routing, and team tools."
        path="/pricing"
      />
      <PrecisionPublicHeader />

      <main id="main-content" className="pt-16" tabIndex={-1}>
        <section className="border-b border-border px-5 py-12 sm:px-6 sm:py-20 lg:px-8">
          <div className="wl-measure mx-auto text-center">
            <p className="wl-overline text-primary">Pricing that starts where you do</p>
            <h1 className="mx-auto mt-4 max-w-[820px] text-[clamp(38px,5.6vw,64px)] font-semibold leading-[1.04] tracking-[-.05em] text-foreground">
              Build free. Add $5 when you are ready to go live.
            </h1>
            <p className="mx-auto mt-6 max-w-[650px] text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground sm:text-[var(--wireline-typography-h3-size)] sm:leading-8">
              Personal assistants are free to create and test. Add Conversation Balance before live
              work, then add a business plan when you need numbers, routing, and a shared team
              workspace.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/signup"
                className="marketing-btn-primary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
              >
                Create your assistant
              </Link>
              <Link
                to="/showcase"
                className="marketing-btn-secondary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
              >
                <Play size={15} /> Hear a demo
              </Link>
            </div>
          </div>
        </section>

        <section className="px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-measure mx-auto">
            <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr] lg:items-stretch">
              <article className="wl-stitch-card relative overflow-hidden p-6 sm:p-9">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-5 text-primary" />
                  <span className="wl-overline">Personal · on-demand</span>
                </div>
                <div className="mt-5 flex items-baseline gap-2">
                  <span className="wl-metric-value text-[clamp(2.5rem,6vw,3.5rem)]">$0</span>
                  <span className="wl-overline">/ month</span>
                </div>
                <p className="mt-3 max-w-md text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground">
                  No personal subscription. Add Conversation Balance only when you are ready to move
                  from testing into live work.
                </p>

                <div className="mt-7">
                  <p className="wl-overline mb-3">Add Conversation Balance</p>
                  <div className="flex flex-wrap gap-2">
                    {CONVERSATION_BALANCE_PRESETS_USD.map((amount, index) => (
                      <span
                        key={amount}
                        className={
                          "inline-flex min-w-[64px] items-center justify-center rounded-full border px-4 py-2 text-[var(--wireline-typography-body-size)] font-semibold tabular-nums " +
                          (index === 0
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-card text-foreground")
                        }
                      >
                        ${amount}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-[var(--wireline-typography-caption-size)] text-muted-foreground">
                    Start at $5. Add more only when it makes sense for you.
                  </p>
                </div>

                <ul className="mt-7 space-y-2.5">
                  {PERSONAL_FEATURES.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-[var(--wireline-typography-body-size)] leading-6 text-foreground"
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
                    Start free <ArrowRight size={14} />
                  </Link>
                </div>
              </article>

              <aside className="flex flex-col gap-4">
                {BALANCE_PROMISES.map(({ icon: Icon, title, body }) => (
                  <article key={title} className="wl-stitch-card flex flex-1 gap-4 p-5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-primary/10 text-primary">
                      <Icon size={18} />
                    </span>
                    <div>
                      <h2 className="wl-card-title">{title}</h2>
                      <p className="mt-1 text-[var(--wireline-typography-caption-size)] leading-6 text-muted-foreground">
                        {body}
                      </p>
                    </div>
                  </article>
                ))}
              </aside>
            </div>
          </div>
        </section>

        <section className="border-t border-border px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-measure mx-auto">
            <div className="text-center">
              <div className="inline-flex items-center gap-2">
                <Building2 className="size-5 text-primary" />
                <span className="wl-overline">For business</span>
              </div>
              <h2 className="mx-auto mt-4 max-w-[680px] text-[clamp(28px,3.6vw,42px)] font-semibold leading-[1.1] tracking-[-.04em] text-foreground">
                Add the operating system when your team needs it.
              </h2>
              <p className="mx-auto mt-4 max-w-[600px] text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground">
                Shared inboxes, professional lines, integrations, and routing for teams — with the
                same direct control over when live work is funded.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {BUSINESS_TIERS.map((tier) => (
                <article
                  key={tier.name}
                  className={
                    "wl-stitch-card relative flex flex-col p-6 " +
                    (tier.featured ? "border-primary/40 ring-1 ring-primary/20" : "")
                  }
                >
                  {tier.featured ? (
                    <span className="wl-stitch-status-pill absolute right-4 top-4">Popular</span>
                  ) : null}
                  <h3 className="wl-card-title text-lg">{tier.name}</h3>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="wl-metric-value text-[2rem]">{tier.price}</span>
                    {tier.cadence ? <span className="wl-overline">{tier.cadence}</span> : null}
                  </div>
                  <p className="mt-3 text-[var(--wireline-typography-caption-size)] leading-6 text-muted-foreground">
                    {tier.blurb}
                  </p>
                  <ul className="mt-5 flex-1 space-y-2.5">
                    {tier.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2.5 text-[var(--wireline-typography-caption-size)] leading-6 text-foreground"
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
                      to={tier.cta.to}
                      className={
                        (tier.featured ? "marketing-btn-primary" : "marketing-btn-secondary") +
                        " w-full justify-center px-5 py-3 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
                      }
                    >
                      {tier.cta.label} <ArrowRight size={14} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-measure mx-auto">
            <p className="wl-overline text-center">Questions, answered</p>
            <h2 className="mx-auto mt-3 max-w-xl text-center text-[clamp(26px,3vw,36px)] font-semibold leading-[1.1] tracking-[-.04em] text-foreground">
              Straightforward from the first task onward.
            </h2>
            <div className="mx-auto mt-8 grid max-w-[820px] gap-4 sm:grid-cols-2">
              {FAQ.map(([question, answer]) => (
                <article key={question} className="wl-stitch-card p-5">
                  <h3 className="wl-card-title">{question}</h3>
                  <p className="mt-2 text-[var(--wireline-typography-caption-size)] leading-6 text-muted-foreground">
                    {answer}
                  </p>
                </article>
              ))}
            </div>
            <div className="mt-10 flex flex-col items-center gap-4 text-center">
              <p className="flex items-center gap-2 text-[var(--wireline-typography-caption-size)] text-muted-foreground">
                <ShieldCheck size={15} className="text-primary" /> Stripe-secured payments · Cancel
                any time · You stay in control
              </p>
              <Link
                to="/signup"
                className="marketing-btn-primary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
              >
                Create your assistant <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
