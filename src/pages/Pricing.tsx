import React from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
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
    price: "$29",
    cadence: "/ month",
    blurb: "For solo operators trying Wireline.",
    cta: "Start with Personal",
    ctaHref: "/signup?plan=personal",
    features: [
      "1 AI voice agent",
      "100 voice minutes / month",
      "1 connected mailbox (Gmail or Outlook)",
      "Call logs + transcripts + sentiment",
      "Web dashboard, no team seats",
    ],
    notIncluded: ["Outbound campaigns", "Slack alerts", "Multi-user team"],
  },
  {
    id: "starter",
    name: "Starter",
    price: "$99",
    cadence: "/ month",
    blurb: "For small teams who want their first agents shipping calls today.",
    cta: "Start free trial",
    ctaHref: "/signup?plan=starter",
    features: [
      "3 AI voice agents",
      "1,000 voice minutes / month",
      "3 connected mailboxes",
      "Outbound dialer (CSV upload, auto-dial)",
      "Live call monitor",
      "Up to 5 team seats",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$399",
    cadence: "/ month",
    blurb: "Growth-stage teams running real campaigns at scale.",
    cta: "Start free trial",
    ctaHref: "/signup?plan=pro",
    highlight: true,
    features: [
      "10 AI voice agents",
      "5,000 voice minutes / month",
      "10 connected mailboxes",
      "Outbound dialer + email campaigns",
      "Slack alerts on key events",
      "Up to 25 team seats",
      "Advanced insights + funnel analysis",
      "Webhook + Action Engine",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    cadence: "",
    blurb: "Custom volume, dedicated CSM, SLA-backed uptime.",
    cta: "Talk to sales",
    ctaHref: "mailto:sales@wireline.app?subject=Enterprise%20inquiry",
    features: [
      "Unlimited agents + minutes",
      "Unlimited mailboxes + seats",
      "SAML SSO + audit log export",
      "99.9% SLA + dedicated CSM",
      "BYO Twilio / RingCentral / 8x8",
      "Custom integrations + private model deployment",
      "Net-30 invoicing",
    ],
  },
];

const VALUE_BULLETS = [
  { icon: Phone, text: "Call our demo line — (630) 581-1834 — Liam picks up 24/7" },
  { icon: ShieldCheck, text: "SOC 2-ready architecture, encrypted secrets at rest" },
  { icon: Sparkles, text: "Powered by Claude Opus + ElevenLabs voices" },
  { icon: Zap, text: "Setup in under 10 minutes — no devs required" },
];

export default function Pricing() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Aurora backdrop */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <motion.div
          className="absolute -top-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(10,200,212,0.18), transparent 60%)" }}
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-[15%] -right-[10%] w-[55vw] h-[55vw] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(224,64,192,0.18), transparent 60%)" }}
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
              background: "linear-gradient(135deg, #0AC8D4 0%, #9B59F5 50%, #E040C0 100%)",
              boxShadow:
                "0 4px 14px -4px rgba(10,200,212,0.55), 0 0 0 1px rgba(255,255,255,0.22) inset",
            }}
          >
            <Waves className="w-4 h-4 text-paper" strokeWidth={2.5} />
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
      <section className="relative z-10 px-6 lg:px-10 pt-8 pb-12 max-w-6xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass border border-white/8 mb-6"
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
          className="font-display italic text-5xl md:text-6xl lg:text-7xl leading-[0.92] tracking-tight mb-5"
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
      </section>

      {/* Tier grid */}
      <section className="relative z-10 px-4 lg:px-10 max-w-7xl mx-auto pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.08, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className={`relative rounded-3xl p-6 lg:p-7 flex flex-col ${
                tier.highlight ? "aurora-ring" : ""
              }`}
            >
              <div
                className={`relative rounded-3xl ${
                  tier.highlight
                    ? "glass-strong border-2 border-brand/40"
                    : "glass border border-white/8"
                } p-6 lg:p-7 flex flex-col flex-1 overflow-hidden`}
                style={
                  tier.highlight
                    ? {
                        boxShadow:
                          "0 16px 40px -16px rgba(10,200,212,0.4), 0 0 0 1px rgba(255,255,255,0.06) inset",
                      }
                    : undefined
                }
              >
                {tier.highlight && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[9px] uppercase tracking-[0.42em] font-medium"
                    style={{
                      background: "linear-gradient(135deg, #0AC8D4, #9B59F5)",
                      color: "#fff",
                      boxShadow: "0 4px 12px -4px rgba(10,200,212,0.5)",
                    }}
                  >
                    Most popular
                  </span>
                )}

                <div className="mb-4">
                  <h2 className="font-display italic text-3xl text-ink mb-1">{tier.name}</h2>
                  <p className="text-[12px] text-muted/75 leading-snug">{tier.blurb}</p>
                </div>

                <div className="mb-5 flex items-baseline gap-1">
                  <span className="font-display italic text-5xl text-ink">{tier.price}</span>
                  {tier.cadence && (
                    <span className="text-[11px] text-muted/70">{tier.cadence}</span>
                  )}
                </div>

                <a
                  href={tier.ctaHref}
                  className={`group block w-full text-center py-3 rounded-xl text-[11px] uppercase tracking-[0.32em] font-medium transition-all mb-6 ${
                    tier.highlight
                      ? "text-paper hover:opacity-90"
                      : "border border-white/15 text-ink hover:border-white/30 hover:bg-white/5"
                  }`}
                  style={
                    tier.highlight
                      ? {
                          background: "linear-gradient(135deg, #0AC8D4, #9B59F5)",
                          boxShadow: "0 6px 20px -6px rgba(10,200,212,0.55)",
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
          className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto"
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
                    "linear-gradient(135deg, rgba(10,200,212,0.18), rgba(155,89,245,0.12))",
                }}
              >
                <Icon className="w-4 h-4 text-brand" strokeWidth={2.2} />
              </div>
              <p className="text-[12px] text-ink/80 leading-snug">{text}</p>
            </div>
          ))}
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
            Voice minutes are pooled across all agents in your workspace. Overage billed at $0.08 /
            min. Email volume is unlimited on all plans.
          </p>
        </motion.div>
      </section>
    </div>
  );
}
