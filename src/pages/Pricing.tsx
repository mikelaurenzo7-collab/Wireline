import React from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { PageMeta } from "../lib/page-meta";
import WirelineMark from "../components/WirelineMark";
import {
  Check,
  Waves,
  ArrowRight,
  Phone,
  Bot,
  BarChart3,
  Users,
  Zap,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type Tier = {
  id: string;
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  cta: string;
  ctaHref: string;
  highlight?: boolean;
  features: string[];
  notIncluded?: string[];
};

const TIERS: Tier[] = [
  {
    id: "personal",
    name: "Personal",
    price: "$49",
    cadence: "/ month",
    blurb: "For solo operators. Sized so 95% of customers never see an overage.",
    cta: "Start with Personal",
    ctaHref: "/signup?plan=personal",
    features: [
      "1 AI voice agent",
      "400 voice minutes / month (~13 min/day headroom)",
      "1 connected mailbox (Gmail or Outlook)",
      "Call logs + transcripts + sentiment",
      "Web dashboard, no team seats",
      "Overage at $0.20 / min — rarely triggered",
    ],
    notIncluded: ["Outbound campaigns", "Slack alerts", "Multi-user team"],
  },
  {
    id: "starter",
    name: "Starter",
    price: "$149",
    cadence: "/ month",
    blurb: "For small teams shipping calls today, with breathing room to grow.",
    cta: "Start free trial",
    ctaHref: "/signup?plan=starter",
    features: [
      "3 AI voice agents",
      "1,500 voice minutes / month (~50 min/day)",
      "3 connected mailboxes",
      "Outbound dialer (CSV upload, auto-dial)",
      "Live call monitor",
      "Up to 5 team seats",
      "Overage at $0.15 / min — only if you exceed",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$499",
    cadence: "/ month",
    blurb: "Growth-stage teams running real campaigns at scale.",
    cta: "Start free trial",
    ctaHref: "/signup?plan=pro",
    highlight: true,
    features: [
      "10 AI voice agents",
      "6,000 voice minutes / month (~200 min/day)",
      "10 connected mailboxes",
      "Outbound dialer + email campaigns",
      "Slack alerts on key events",
      "Up to 25 team seats",
      "Advanced insights + funnel analysis",
      "Webhook + Action Engine",
      "Overage at $0.12 / min — best per-minute rate before Business",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: "$1,499",
    cadence: "/ month",
    blurb: "Multi-team operators who need SSO, audit, and serious volume.",
    cta: "Start free trial",
    ctaHref: "/signup?plan=business",
    features: [
      "25 AI voice agents",
      "15,000 voice minutes / month (~500 min/day)",
      "25 connected mailboxes",
      "SSO + audit log export",
      "Up to 50 team seats",
      "Everything in Pro",
      "Priority support · Slack channel",
      "Overage at $0.10 / min — lowest on platform outside Enterprise",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    cadence: "",
    blurb: "Custom volume, dedicated CSM, SLA-backed uptime.",
    cta: "Talk to sales",
    ctaHref: "mailto:trywireline@yahoo.com?subject=Enterprise%20inquiry",
    features: [
      "Unlimited agents + minutes",
      "Unlimited mailboxes + seats",
      "SAML SSO + advanced compliance",
      "99.95% SLA + dedicated CSM",
      "BYO Twilio / RingCentral / 8x8",
      "Custom integrations + private model deployment",
      "Net-30 invoicing",
    ],
  },
  {
    id: "callcenter",
    name: "Call Center",
    price: "Custom",
    cadence: "",
    blurb: "100+ seats, supervisor cockpit, team routing.",
    cta: "Talk to call-center sales",
    ctaHref: "mailto:trywireline@yahoo.com?subject=Call%20Center%20inquiry",
    features: [
      "100+ AI agent seats with team-based routing",
      "Supervisor cockpit — live floor monitoring + listen-in",
      "Call queues with SLA timers + overflow rules",
      "Per-team SMS sender + manager escalation routing",
      "Real-time sentiment + QA scoring on every call",
      "Dedicated CSM + 24×7 ops paging",
      "BYO carrier (Twilio / RingCentral / 8x8 / sip trunk)",
      "Custom MSA + Net-30 invoicing",
    ],
  },
];

const VALUE_BULLETS = [
  { icon: Phone, text: "Call our demo line — (630) 581-1834 — Liam picks up 24/7" },
  { icon: ShieldCheck, text: "SOC 2-ready architecture, encrypted secrets at rest" },
  { icon: Sparkles, text: "Powered by Wireline's premium AI brain + studio-grade voices" },
  { icon: Zap, text: "Setup in under 10 minutes — no devs required" },
];

export default function Pricing() {
  return (
    <div className="min-h-screen relative">
      <PageMeta
        title="Plans & Pricing"
        description="Wireline pricing plans from $29/month Personal to Enterprise custom. Every plan includes AI voice agents, real-time call logs, sentiment scoring, and the Wireline Demo Line. 14-day free trial, no credit card required."
      />
      {/* Aurora backdrop — toned down so the tier cards win the eye.
          Previously 60vw at 0.18 opacity dominated the hero on 1366×768
          laptops; now 40vw at 0.10 reads as ambient accent. */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <motion.div
          className="absolute -top-[25%] -left-[15%] w-[40vw] h-[40vw] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(79, 30, 123 ,0.10), transparent 65%)",
          }}
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-[20%] -right-[15%] w-[40vw] h-[40vw] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(79, 30, 123 ,0.10), transparent 65%)",
          }}
          animate={{ x: [0, -25, 0], y: [0, 25, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Top brand bar (minimal — public page, no app nav) */}
      <header className="relative z-10 px-6 lg:px-10 py-5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: "#4F1E7B",
              boxShadow:
                "0 4px 14px -4px rgba(79, 30, 123 ,0.55), 0 0 0 1px rgba(255,255,255,0.22) inset",
            }}
          >
            <WirelineMark className="w-4 h-4 text-paper" strokeWidth={130} />
          </div>
          <span className="brand-wordmark text-[16px] leading-none">WIRELINE</span>
        </Link>
        <Link
          to="/"
          className="text-[11px] uppercase tracking-[0.32em] text-muted hover:text-ink transition-colors"
        >
          Sign in →
        </Link>
      </header>

      {/* Hero */}
      <section className="relative z-10 px-6 lg:px-10 pt-4 pb-8 max-w-5xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass border border-white/8 mb-4"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-[10px] uppercase tracking-[0.42em] text-muted">
            Pricing · Start free, upgrade when ready
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="font-display italic text-4xl sm:text-5xl lg:text-6xl leading-[1.05] sm:leading-[0.95] tracking-tight mb-4 text-balance"
        >
          <span className="text-aurora">Plans that scale</span>
          <br />
          <span className="text-ink">with your fleet</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="text-muted/80 text-base max-w-xl mx-auto"
        >
          Every plan includes the dashboard, real-time call logs, sentiment scoring, and the
          Wireline Demo Line for testing. Pick the agent + minute volume you need today; upgrade or
          downgrade any time.
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.22, duration: 0.6 }}
          className="text-[11px] uppercase tracking-[0.3em] text-brand/85 mt-5 mb-1"
        >
          Built for every service business
        </motion.p>
        {/* Industry strip — every wedge page lives at /for/<slug>; this row
            also acts as a directory for visitors who land on /pricing
            without industry context. Keeps the platform positioning loud
            (any vertical works) while still surfacing the wedge URLs that
            DMs use for narrow outbound. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.28, duration: 0.6 }}
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[10px] uppercase tracking-[0.28em] text-muted/70"
        >
          <Link to="/for/home-services" className="hover:text-brand transition-colors">
            Home Services
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/for/medical" className="hover:text-brand transition-colors">
            Medical
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/for/legal" className="hover:text-brand transition-colors">
            Legal
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/for/real-estate" className="hover:text-brand transition-colors">
            Real Estate
          </Link>
          <span aria-hidden="true">·</span>
          <span className="text-muted/55">+ every other vertical</span>
        </motion.div>
      </section>

      {/* Why Wireline — moat strip above the tier grid. Each card frames a
          differentiator competitors don't lead with: multi-channel agents in
          one console, supervisor visibility into agent reasoning, and TCPA
          compliance as auditable code (not a black-box vendor). */}
      <section className="relative z-10 px-4 lg:px-10 max-w-6xl mx-auto pb-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: "Voice + SMS + Email — one agent",
              blurb:
                "One conversation, three channels. Most platforms make you stitch separate vendors together.",
              accent: "#4F1E7B",
            },
            {
              title: "Supervisor cockpit with agent transparency",
              blurb:
                "See what your agents are about to do BEFORE they do it — draft vs. auto autonomy per action.",
              accent: "#4F1E7B",
            },
            {
              title: "TCPA compliance in code",
              blurb:
                "Per-state opt-in rules, append-only consent ledger, automatic DNC. Your lawyers can read the rules.",
              accent: "#4F1E7B",
            },
          ].map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl glass border border-white/8 p-5 relative overflow-hidden"
            >
              <div
                className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-25 blur-3xl pointer-events-none"
                style={{ background: c.accent }}
              />
              <p
                className="text-[9px] uppercase tracking-[0.36em] mb-2"
                style={{ color: c.accent }}
              >
                Why Wireline
              </p>
              <h3 className="font-display italic text-lg text-ink leading-tight mb-1.5">
                {c.title}
              </h3>
              <p className="text-[12px] text-muted/85 leading-relaxed">{c.blurb}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Tier grid */}
      <section className="relative z-10 px-4 sm:px-6 lg:px-10 max-w-7xl mx-auto pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.08, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className={`relative rounded-3xl p-4 lg:p-5 flex flex-col ${
                tier.highlight ? "aurora-ring md:scale-[1.02] md:-my-1 md:z-10" : ""
              }`}
            >
              <div
                className={`relative rounded-3xl ${
                  tier.highlight
                    ? "glass-strong border-2 border-brand/40"
                    : "glass border border-white/8"
                } p-5 flex flex-col flex-1 overflow-hidden`}
                style={
                  tier.highlight
                    ? {
                        boxShadow:
                          "0 0 60px -15px rgba(79, 30, 123 ,0.55), 0 24px 48px -16px rgba(79, 30, 123 ,0.35), 0 0 0 1px rgba(255,255,255,0.08) inset",
                      }
                    : undefined
                }
              >
                {tier.highlight && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full text-[10px] uppercase tracking-[0.35em] font-semibold z-10"
                    style={{
                      background: "#4F1E7B",
                      color: "#fff",
                      boxShadow: "0 6px 18px -4px rgba(79, 30, 123 ,0.6)",
                    }}
                  >
                    Most popular
                  </span>
                )}

                <div className="mb-4">
                  <h2 className="font-display italic text-2xl text-ink mb-1">{tier.name}</h2>
                  <p className="text-[11px] text-muted/75 leading-snug">{tier.blurb}</p>
                </div>

                <div className="mb-5 flex items-baseline gap-1">
                  <span className="font-display italic text-4xl text-ink">{tier.price}</span>
                  {tier.cadence && (
                    <span className="text-[10px] text-muted/70">{tier.cadence}</span>
                  )}
                </div>

                {tier.cta === "Start free trial" && (
                  <p
                    className="mb-2 text-[9px] uppercase tracking-[0.30em] font-medium inline-flex items-center gap-1.5 self-start px-2 py-1 rounded-md bg-emerald-500/12 border border-emerald-500/30 text-emerald-600"
                    title="No credit card required"
                  >
                    <Check className="w-3 h-3" strokeWidth={2.8} />
                    14-day free trial · no card
                  </p>
                )}
                <a
                  href={tier.ctaHref}
                  className={`group block w-full text-center py-3 rounded-xl text-[11px] uppercase tracking-[0.32em] font-medium transition-all mb-6 ${
                    tier.highlight
                      ? "text-on-brand hover:opacity-90"
                      : "border border-white/15 text-ink hover:border-white/30 hover:bg-white/5"
                  }`}
                  style={
                    tier.highlight
                      ? {
                          background: "#4F1E7B",
                          boxShadow: "0 6px 20px -6px rgba(79, 30, 123 ,0.55)",
                        }
                      : undefined
                  }
                >
                  <span className="inline-flex items-center gap-2">
                    {tier.cta}
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </a>

                <ul className="space-y-2.5 text-[12px] text-ink/80 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check
                        className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500"
                        strokeWidth={2.6}
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                  {tier.notIncluded?.map((f) => (
                    <li key={f} className="flex items-start gap-2 opacity-40">
                      <span className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted">—</span>
                      <span className="line-through">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Value bullets */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.6 }}
          className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 max-w-5xl mx-auto"
        >
          {VALUE_BULLETS.map(({ icon: Icon, text }) => (
            <div
              key={text}
              className="rounded-2xl glass border border-white/8 p-4 flex items-start gap-3"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-white/8"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(79, 30, 123 ,0.18), rgba(79, 30, 123 ,0.12))",
                }}
              >
                <Icon className="w-4 h-4 text-brand" strokeWidth={2.2} />
              </div>
              <p className="text-[12px] text-ink/80 leading-snug">{text}</p>
            </div>
          ))}
        </motion.div>

        {/* ROI calculator — concrete savings narrative. Slim 3-card row
            comparing Wireline tiers vs the human-headcount they replace.
            Numbers grounded in real US median compensation for these roles
            (BLS 2025). Static so it never breaks on the public page. */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85, duration: 0.6 }}
          className="mt-14 max-w-5xl mx-auto"
        >
          <div className="text-center mb-6">
            <p className="text-[10px] uppercase tracking-[0.42em] text-brand mb-2">
              ROI snapshot · vs traditional headcount
            </p>
            <h3 className="font-display italic text-2xl text-ink leading-tight">
              How much you save replacing one human role
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                role: "1 Inbound CS Rep",
                humanCost: 52000,
                humanCostLabel: "US median CS salary",
                tier: "Personal",
                tierCost: 49 * 12,
                tierLabel: "$49/mo",
              },
              {
                role: "1 Outbound SDR",
                humanCost: 75000,
                humanCostLabel: "US median SDR comp",
                tier: "Pro",
                tierCost: 399 * 12,
                tierLabel: "$399/mo",
              },
              {
                role: "5-seat call center",
                humanCost: 260000,
                humanCostLabel: "5 × $52k median",
                tier: "Business",
                tierCost: 1499 * 12,
                tierLabel: "$1,499/mo",
              },
            ].map((row, i) => {
              const savings = row.humanCost - row.tierCost;
              const pct = ((savings / row.humanCost) * 100).toFixed(0);
              return (
                <motion.div
                  key={row.role}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.95 + i * 0.06, duration: 0.5 }}
                  className="rounded-2xl glass border border-white/10 p-5 relative overflow-hidden"
                >
                  <div
                    className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-20 blur-3xl pointer-events-none"
                    style={{ background: "#10B981" }}
                  />
                  <p className="text-[10px] uppercase tracking-[0.32em] text-muted/70 mb-1">
                    Replace
                  </p>
                  <p className="text-[14px] font-semibold text-ink mb-3">{row.role}</p>
                  <div className="space-y-1.5 mb-3 text-[11px]">
                    <div className="flex justify-between text-muted/80">
                      <span>Human ({row.humanCostLabel})</span>
                      <span className="tabular-nums line-through">
                        ${row.humanCost.toLocaleString()}/yr
                      </span>
                    </div>
                    <div className="flex justify-between text-ink/90">
                      <span>
                        Wireline {row.tier} ({row.tierLabel})
                      </span>
                      <span className="tabular-nums">${row.tierCost.toLocaleString()}/yr</span>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-white/10 flex items-baseline justify-between">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-emerald-600">
                      You save
                    </span>
                    <span className="font-display italic text-2xl text-emerald-600 tabular-nums">
                      ${savings.toLocaleString()}
                      <span className="text-[11px] text-emerald-600/70 ml-1">/yr ({pct}%)</span>
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
          <p className="text-center text-[10px] text-muted/55 mt-4 leading-relaxed">
            Salary figures from US BLS 2025 medians. Wireline pricing excludes any voice-minute
            overage. Most teams stay inside plan.
          </p>
        </motion.div>

        {/* FAQ-ish reassurance */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.6 }}
          className="mt-14 max-w-3xl mx-auto text-center space-y-3"
        >
          <p className="text-[10px] uppercase tracking-[0.42em] text-muted/70">
            No long-term contracts · Cancel anytime · USD pricing
          </p>
          <p className="text-[12px] text-muted/65">
            Voice minutes are pooled across all agents in your workspace. Overage is tier-based
            (Personal: $0.25/min · Starter: $0.20/min · Pro: $0.18/min · Business: $0.16/min) —
            priced at our cost, not a profit center. Most teams stay well inside plan. Email volume
            is unlimited on all plans.
          </p>
        </motion.div>
      </section>
    </div>
  );
}
