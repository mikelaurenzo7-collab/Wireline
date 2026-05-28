import React from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { PageMeta } from "../lib/page-meta";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { Check, ArrowRight, Phone, Zap, ShieldCheck, Sparkles } from "lucide-react";

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
    cta: "Start free trial",
    ctaHref: "/signup?plan=personal",
    features: [
      "1 AI voice agent",
      "1 dedicated voice number INCLUDED — no Twilio bill",
      "400 voice minutes / month (~13 min/day headroom)",
      "Unlimited inbound email",
      "Call logs + transcripts + sentiment",
      "Web dashboard, no team seats",
      "Overage at $0.20 / min — rarely triggered",
      "Add extra agents at $49/each",
    ],
    notIncluded: [
      "Outbound campaigns",
      "Slack alerts",
      "Multi-user team",
      "Voice cloning",
      "AI coaching",
    ],
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
      "2 dedicated voice numbers INCLUDED — no Twilio bill",
      "1,200 voice minutes / month (~40 min/day)",
      "Unlimited inbound email",
      "Outbound dialer (CSV upload, auto-dial)",
      "Live call monitor",
      "Up to 5 team seats",
      "Overage at $0.18 / min — only if you exceed",
      "Add extra agents at $45/each",
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
      "5 dedicated voice numbers INCLUDED — no Twilio bill",
      "5,000 voice minutes / month (~165 min/day)",
      "Unlimited inbound email",
      "Outbound dialer + email campaigns",
      "Slack alerts on key events",
      "Up to 25 team seats",
      "Advanced insights + funnel analysis",
      "Webhook + Action Engine",
      "AI voice cloning + custom personalities",
      "Post-call coaching + agent training",
      "Overage at $0.15 / min — best per-minute rate before Business",
      "Add extra agents at $40/each",
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
      "10 dedicated voice numbers INCLUDED — no Twilio bill",
      "12,000 voice minutes / month (~400 min/day)",
      "Unlimited inbound email",
      "SSO + audit log export",
      "Up to 50 team seats",
      "Everything in Pro",
      "Dedicated success manager",
      "Priority support · Slack channel",
      "Overage at $0.14 / min — lowest on platform outside Enterprise",
      "Add extra agents at $35/each",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise & Call Center",
    price: "Custom",
    cadence: "",
    blurb: "Multi-team operators, 100+ seats, SLA-backed. Built for the largest deployments.",
    cta: "Talk to sales",
    ctaHref: "mailto:trywireline@yahoo.com?subject=Enterprise%20%2F%20Call%20Center%20inquiry",
    features: [
      "Up to 100 agents, with custom bundles above that",
      "50,000+ voice minutes with contracted volume pricing",
      "25 numbers included + BYO carrier option",
      "Supervisor cockpit — live floor monitoring roadmap + post-call review today",
      "Call queues with SLA timers + overflow rules on enterprise onboarding",
      "Real-time sentiment + QA scoring on every call",
      "SAML SSO + audit + advanced compliance",
      "BYO carrier (any SIP-compatible provider)",
      "Custom integrations + private model deployment",
      "Dedicated CSM, 99.95% SLA, 24×7 ops paging",
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
  // FAQ schema is built from copy that already lives on this page (the
  // reassurance paragraph + tier blurbs). Keeping it as structured data
  // — not visible UI — lets Google render FAQ rich results without
  // changing the visual design Mike already approved.
  const pricingStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How much does Wireline cost?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Wireline starts at $49/month for Personal (1 agent, 400 voice minutes), $149/month for Starter (3 agents, 1,200 minutes), $499/month for Pro (10 agents, 5,000 minutes), and $1,499/month for Business (25 agents, 12,000 minutes). Enterprise and call-center pricing is custom. All plans include AI voice agents, real-time call logs, sentiment scoring, and the Wireline Demo Line.",
        },
      },
      {
        "@type": "Question",
        name: "Is there a free trial?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Every paid plan starts with a 14-day free trial — no credit card required. You can deploy a real AI voice agent on a real phone number, run live calls, and cancel before the trial ends with no charge.",
        },
      },
      {
        "@type": "Question",
        name: "What happens if I go over my voice-minute allowance?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Voice minutes are pooled across all agents in your workspace. Overage is tier-based and priced near cost, not as a profit center: $0.20/min on Personal, $0.18/min on Starter, $0.15/min on Pro, and $0.14/min on Business. Most teams stay well inside their plan and never see an overage charge.",
        },
      },
      {
        "@type": "Question",
        name: "Can I cancel anytime?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. There are no long-term contracts on any self-serve plan. You can cancel from the dashboard at any time and keep access through the end of your current billing period.",
        },
      },
      {
        "@type": "Question",
        name: "Is email volume included?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Email volume is unlimited on all plans. Wireline only meters voice minutes; inbound and outbound email handled by your AI agents — including triage, replies, follow-ups, and CRM sync — is included.",
        },
      },
      {
        "@type": "Question",
        name: "How fast can I deploy an AI voice agent?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Under 10 minutes. Pick a phone number, point the agent at your business profile (or paste a website URL and Wireline drafts the profile for you), choose a voice, and publish. No developers required.",
        },
      },
      {
        "@type": "Question",
        name: "Which CRMs and integrations does Wireline support?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Wireline integrates with HubSpot, Salesforce, Gmail, Microsoft Outlook, Google Calendar, Slack, Stripe, and Zoom out of the box. Pro and Business plans add webhooks and the Action Engine for custom CRMs and internal tools.",
        },
      },
      {
        "@type": "Question",
        name: "Is Wireline secure and compliant?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Wireline ships SOC 2-ready architecture with encrypted secrets at rest, per-tenant data isolation, full audit logs, configurable data retention, and a documented DNC list. Business and Enterprise plans add SSO and audit-log export.",
        },
      },
    ],
  };

  return (
    <MarketingPageFrame mainClassName="!px-0 pt-20 sm:pt-24 pb-0">
      <PageMeta
        title="Plans & Pricing"
        description="Wireline pricing plans from $49/month Personal to Enterprise custom. Every plan includes AI voice agents, real-time call logs, sentiment scoring, and the Wireline Demo Line. 14-day free trial, no credit card required."
        path="/pricing"
        structuredData={pricingStructuredData}
      />

      {/* Hero */}
      <section className="relative z-10 px-4 sm:px-6 lg:px-10 xl:px-14 pt-4 sm:pt-6 pb-10 max-w-6xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 glass border border-white/8 mb-4"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-eyebrow">Pricing · Start free, upgrade when ready</span>
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
          Wireline Demo Line for testing. Pick the agent + minute volume you need today; add more
          agents à la carte if you outgrow your tier — no forced upgrade to the next bracket.
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
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-eyebrow opacity-90"
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
          <span className="text-muted/70">+ every other vertical</span>
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
              className="glass border border-white/8 p-5 relative overflow-hidden"
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
        {/* Tier grid scales 1 → 2 → 3 → 5. Skipping the previous
            sm:grid-cols-2 jump because 360-390px in 2-col mode forced
            ~160px tier cards that were unreadable. Now: single column
            until md (768px), then 3 across, 5 on wide desktop. */}
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.08, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className={`relative p-4 lg:p-5 flex flex-col ${
                tier.highlight ? "aurora-ring md:scale-[1.02] md:-my-1 md:z-10" : ""
              }`}
            >
              <div
                className={`relative ${
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
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-1 text-eyebrow font-semibold z-10"
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
                    className="mb-2 text-[9px] uppercase tracking-[0.30em] font-medium inline-flex items-center gap-1.5 self-start px-2 py-1 bg-emerald-500/12 border border-emerald-500/30 text-emerald-600"
                    title="No credit card required"
                  >
                    <Check className="w-3 h-3" strokeWidth={2.8} />
                    14-day free trial · no card
                  </p>
                )}
                <a
                  href={tier.ctaHref}
                  className={`group flex w-full min-h-[48px] items-center justify-center text-center py-3.5 text-[11px] uppercase tracking-[0.32em] font-medium transition-all mb-6 ${
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
          className="mt-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 max-w-5xl mx-auto"
        >
          {VALUE_BULLETS.map(({ icon: Icon, text }) => (
            <div key={text} className="glass border border-white/8 p-4 flex items-start gap-3">
              <div
                className="w-8 h-8 flex items-center justify-center shrink-0 border border-white/8"
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
            <p className="text-eyebrow text-brand mb-2">ROI snapshot · vs traditional headcount</p>
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
                tierCost: 499 * 12,
                tierLabel: "$499/mo",
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
                  className="glass border border-white/10 p-5 relative overflow-hidden"
                >
                  <div
                    className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-20 blur-3xl pointer-events-none"
                    style={{ background: "#10B981" }}
                  />
                  <p className="app-section-title opacity-90 mb-1">Replace</p>
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
                    <span className="text-eyebrow text-emerald-600">You save</span>
                    <span className="font-display italic text-2xl text-emerald-600 tabular-nums">
                      ${savings.toLocaleString()}
                      <span className="text-[11px] text-emerald-600/70 ml-1">/yr ({pct}%)</span>
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
          <p className="text-center text-[10px] text-muted/70 mt-4 leading-relaxed">
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
          <p className="text-eyebrow/70">No long-term contracts · Cancel anytime · USD pricing</p>
          <p className="text-[12px] text-muted/65">
            Voice minutes are pooled across all agents in your workspace. Overage is tier-based
            (Personal: $0.20/min · Starter: $0.18/min · Pro: $0.15/min · Business: $0.14/min) —
            priced near our cost, not a profit center. Most teams stay well inside plan. Email
            volume is unlimited on all plans.
          </p>
        </motion.div>
      </section>
    </MarketingPageFrame>
  );
}
