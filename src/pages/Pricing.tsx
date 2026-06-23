import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Play,
  Sparkles,
  Building2,
  ShieldCheck,
  Wallet,
  Gauge,
  Eye,
} from "lucide-react";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import { PageMeta } from "../lib/page-meta";

/* Conversation Balance top-up amounts — mirror conversation-balance.ts. */
const BALANCE_PRESETS = [5, 10, 25, 50] as const;

const PERSONAL_FEATURES = [
  "Build and test your assistant for free",
  "Add $5 to handle your first live conversation",
  "Spend across voice, email, and text from one balance",
  "Set a hard budget — no surprise charges, no auto-reload",
  "Approve every external action, or auto-approve the ones you trust",
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
    blurb: "One live assistant with a number and inbox, ready for a small team.",
    features: [
      "Up to 4 assistants",
      "Dedicated numbers for inbound & outbound",
      "Team handoff & shared inbox",
      "CRM & calendar integrations",
      "Then Conversation Balance for usage",
    ],
    cta: { label: "Start Front Desk", to: "/signup?plan=business-starter" },
  },
  {
    name: "Sales & Reception",
    price: "$59",
    cadence: "/mo",
    blurb: "Routing, campaigns, and a live activity view for busier teams.",
    features: [
      "Up to 8 assistants",
      "Intelligent routing & department transfers",
      "Outbound campaign templates",
      "Live activity dashboard & collaboration",
      "Lower usage rate on your balance",
    ],
    cta: { label: "Start Sales & Reception", to: "/signup?plan=starter" },
    featured: true,
  },
  {
    name: "Custom Enterprise",
    price: "Let's talk",
    cadence: "",
    blurb: "Multi-location scale, compliance, and dedicated implementation.",
    features: [
      "Unlimited assistants & lines",
      "Full CRM deep-sync & custom webhooks",
      "SSO, security review & compliance",
      "Dedicated implementation & SLA support",
    ],
    cta: { label: "Talk to sales", to: "/contact" },
  },
];

const BALANCE_PROMISES = [
  {
    icon: Wallet,
    title: "One balance, every channel",
    body: "Voice, email, and text all draw from the same Conversation Balance. Heavier work like a long hold or premium voice simply uses a little more.",
  },
  {
    icon: Gauge,
    title: "A budget you control",
    body: "Before any live task, Wireline shows a quick estimate and pauses if it reaches your cap. You set the ceiling.",
  },
  {
    icon: Eye,
    title: "See what each conversation used",
    body: "Every conversation reports exactly what it spent, so your balance is never a mystery.",
  },
] as const;

const FAQ = [
  [
    "Do I need a subscription to start?",
    "No. Personal is free to build and test. When you're ready for a live conversation, add a $5 Conversation Balance — that's it.",
  ],
  [
    "What can $5 handle?",
    "A real task: drafting and sending email, a text follow-up, a short voice call or voicemail workflow, and a recap of what happened.",
  ],
  [
    "Will I get surprise charges?",
    "No. There's no auto-reload unless you turn it on, and Wireline pauses a task before it exceeds the budget you set.",
  ],
  [
    "When should a business pick a plan instead?",
    "When you need numbers, shared inboxes, routing, team members, and integrations. Business plans add the operating system; usage still runs on your balance.",
  ],
] as const;

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageMeta
        title="Pricing — Start free, add $5 to go live | Wireline"
        description="Wireline Personal is free to build and test. Add a $5 Conversation Balance to handle live calls, email, and text. Business plans add numbers, routing, and team tools."
        path="/pricing"
      />
      <PrecisionPublicHeader />

      <main id="main-content" className="pt-16">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="border-b border-border px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="wl-measure text-center">
            <p className="wl-stitch-label">Pricing</p>
            <h1 className="mx-auto mt-4 max-w-[900px] text-balance text-[clamp(38px,5.6vw,64px)] font-semibold leading-[1.04] tracking-[-.045em] text-foreground">
              Start free. Add $5 when you're ready to go live.
            </h1>
            <p className="mx-auto mt-6 max-w-[640px] text-[17px] leading-7 text-muted-foreground">
              Build and test your assistant for nothing. When you have a conversation worth
              handling, top up a small balance and let Wireline take it from there — across voice,
              email, and text.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/signup"
                className="marketing-btn-primary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
              >
                Create your assistant
              </Link>
              <Link
                to="/showcase"
                className="marketing-btn-secondary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
              >
                <Play size={14} /> Hear a demo
              </Link>
            </div>
          </div>
        </section>

        {/* ── Personal — on-demand ─────────────────────────────────────── */}
        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="wl-measure">
            <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr] lg:items-stretch">
              {/* Personal plan card */}
              <article className="wl-stitch-card relative overflow-hidden p-7 sm:p-9">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-5 text-primary" />
                  <span className="wl-stitch-eyebrow">Personal · On-demand</span>
                </div>
                <div className="mt-5 flex items-baseline gap-2">
                  <span className="text-[clamp(40px,6vw,56px)] font-semibold leading-none tracking-[-.04em] text-foreground">
                    $0
                  </span>
                  <span className="text-[13px] font-medium uppercase tracking-[.1em] text-muted-foreground">
                    / month
                  </span>
                </div>
                <p className="mt-3 max-w-md text-[15px] leading-7 text-muted-foreground">
                  No subscription. Add a Conversation Balance only when you want live work handled.
                </p>

                <div className="mt-6">
                  <p className="wl-stitch-label mb-2">Add a Conversation Balance</p>
                  <div className="flex flex-wrap gap-2">
                    {BALANCE_PRESETS.map((amount, i) => (
                      <span
                        key={amount}
                        className={
                          "inline-flex min-w-[64px] items-center justify-center rounded-full border px-4 py-2 text-[15px] font-semibold tabular-nums " +
                          (i === 0
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-card text-foreground")
                        }
                      >
                        ${amount}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    Start at $5. Top up more anytime — your balance never expires.
                  </p>
                </div>

                <ul className="mt-6 space-y-2.5">
                  {PERSONAL_FEATURES.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2.5 text-[14px] leading-6 text-foreground"
                    >
                      <Check size={16} className="mt-0.5 shrink-0 text-primary" strokeWidth={2.5} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <Link
                    to="/signup"
                    className="marketing-btn-primary w-full justify-center px-6 py-3.5 text-[12px] font-semibold uppercase tracking-[.05em] sm:w-auto"
                  >
                    Start free <ArrowRight size={14} />
                  </Link>
                </div>
              </article>

              {/* How the balance works */}
              <aside className="flex flex-col gap-4">
                {BALANCE_PROMISES.map(({ icon: Icon, title, body }) => (
                  <div key={title} className="wl-stitch-card flex gap-4 p-5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon size={18} />
                    </span>
                    <div>
                      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
                      <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{body}</p>
                    </div>
                  </div>
                ))}
              </aside>
            </div>
          </div>
        </section>

        {/* ── Business ─────────────────────────────────────────────────── */}
        <section className="border-t border-border px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="wl-measure">
            <div className="text-center">
              <div className="inline-flex items-center gap-2">
                <Building2 className="size-5 text-primary" />
                <span className="wl-stitch-eyebrow">For business</span>
              </div>
              <h2 className="mx-auto mt-4 max-w-[680px] text-balance text-[clamp(28px,3.6vw,40px)] font-semibold leading-tight tracking-[-.035em] text-foreground">
                The operating system for your team's conversations.
              </h2>
              <p className="mx-auto mt-4 max-w-[600px] text-[15px] leading-7 text-muted-foreground">
                Numbers, shared inboxes, routing, and integrations — plus the same Conversation
                Balance for usage, at a lower rate as you grow.
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
                  {tier.featured && (
                    <span className="absolute right-4 top-4 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.1em] text-primary">
                      Popular
                    </span>
                  )}
                  <h3 className="text-[15px] font-semibold uppercase tracking-[.08em] text-foreground">
                    {tier.name}
                  </h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-[34px] font-semibold leading-none tracking-[-.03em] text-foreground">
                      {tier.price}
                    </span>
                    {tier.cadence && (
                      <span className="text-[12px] font-medium uppercase tracking-[.1em] text-muted-foreground">
                        {tier.cadence}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-[13px] leading-6 text-muted-foreground">{tier.blurb}</p>
                  <ul className="mt-5 flex-1 space-y-2.5">
                    {tier.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2.5 text-[13px] leading-6 text-foreground"
                      >
                        <Check
                          size={15}
                          className="mt-0.5 shrink-0 text-primary"
                          strokeWidth={2.5}
                        />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-7">
                    <Link
                      to={tier.cta.to}
                      className={
                        (tier.featured ? "marketing-btn-primary" : "marketing-btn-secondary") +
                        " w-full justify-center px-5 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
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

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <section className="border-t border-border px-4 py-16 sm:px-6 lg:px-8">
          <div className="wl-measure">
            <h2 className="text-center text-[clamp(24px,3vw,34px)] font-semibold tracking-[-.03em] text-foreground">
              Questions, answered
            </h2>
            <div className="mx-auto mt-8 grid max-w-[820px] gap-4 sm:grid-cols-2">
              {FAQ.map(([q, a]) => (
                <div key={q} className="wl-stitch-card p-5">
                  <h3 className="text-[14px] font-semibold text-foreground">{q}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{a}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 flex flex-col items-center gap-3 text-center">
              <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <ShieldCheck size={15} className="text-primary" />
                Stripe-secured payments · Cancel anytime · You stay in control
              </p>
              <Link
                to="/signup"
                className="marketing-btn-primary px-6 py-3.5 text-[12px] font-semibold uppercase tracking-[.05em]"
              >
                Create your assistant <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-8 text-[13px] text-muted-foreground sm:px-6">
        <div className="wl-measure flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span>
            <strong className="text-foreground">Wireline</strong> · voice + email + text, handled
          </span>
          <div className="flex gap-5">
            <Link to="/features">Features</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/support">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
