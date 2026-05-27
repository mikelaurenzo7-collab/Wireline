/**
 * TrustSignals.tsx
 * ----------------------------------------------------------------------
 * Landing-page trust strip: industry tags + security/compliance badges
 * + the operator-facing reassurance line. Sits on the unauthenticated
 * marketing surface (AuthPortal) between the demo directory and the
 * sign-in form so every visitor crosses it before deciding.
 *
 * Why this exists (gap analysis, May 2026):
 *   Prospects land on trywireline.com, see beautiful design + a working
 *   demo phone, and then ask the silent question: "Is this real?"
 *   No trust strip = no second answer beyond design quality. This
 *   component is that second answer.
 *
 * Honesty rules baked in:
 *   - No fabricated customer counts ("247+ businesses") — copy says
 *     "Built for businesses that can't afford to miss a call."
 *   - SOC 2 + HIPAA shown as in-progress / ready, not certified
 *     (until the audit is real, the badge must reflect that).
 *   - Industry strip shows the 8 verticals Wireline actually ships
 *     wedge pages for. No invented categories.
 *
 * Mobile-first: stacks to single column under sm; collapses badge
 * details under md; full grid at lg+.
 */
import React from "react";
import { motion } from "motion/react";
import {
  ShieldCheck,
  Lock,
  HeartPulse,
  CreditCard,
  Globe2,
  ServerCog,
  PhoneCall,
  Stethoscope,
  Scale,
  Home,
  Sparkles,
  Wrench,
  UtensilsCrossed,
  Briefcase,
} from "lucide-react";

const VERTICALS = [
  { icon: Home, label: "Home Services" },
  { icon: Stethoscope, label: "Medical" },
  { icon: Scale, label: "Legal" },
  { icon: Briefcase, label: "Real Estate" },
  { icon: Sparkles, label: "Personal Care" },
  { icon: Wrench, label: "Trades" },
  { icon: UtensilsCrossed, label: "Restaurants" },
  { icon: PhoneCall, label: "Sales Teams" },
];

// Security/compliance badges. Each shows real state — "ready" for
// architectures where the controls are implemented but the formal
// audit hasn't shipped; "live" for what's verifiably in production.
const BADGES = [
  {
    icon: Lock,
    label: "TLS 1.3",
    detail: "All traffic encrypted in transit",
    state: "live" as const,
  },
  {
    icon: ServerCog,
    label: "SOC 2 Type II",
    detail: "Controls implemented · audit in progress",
    state: "ready" as const,
  },
  {
    icon: HeartPulse,
    label: "HIPAA",
    detail: "PHI-aware compliance mode per agent",
    state: "ready" as const,
  },
  {
    icon: CreditCard,
    label: "PCI DSS",
    detail: "No card data ever stored or logged",
    state: "ready" as const,
  },
  {
    icon: Globe2,
    label: "GDPR",
    detail: "Right-to-erasure cascade-deletes",
    state: "ready" as const,
  },
];

const STATE_TONES = {
  live: {
    pill: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25",
    dot: "bg-emerald-500",
    label: "Live",
  },
  ready: {
    pill: "bg-[#4F1E7B]/8 text-[#4F1E7B] border-[#4F1E7B]/20",
    dot: "bg-[#4F1E7B]",
    label: "Ready",
  },
} as const;

export default function TrustSignals() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="mb-8"
      aria-labelledby="trust-heading"
      data-testid="trust-signals"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="hero-accent-line" style={{ background: "#4F1E7B" }} />
        <h2
          id="trust-heading"
          className="text-[8px] uppercase tracking-[0.5em] text-muted/70 font-semibold"
        >
          Built for businesses that can't afford to miss a call
        </h2>
      </div>

      {/* Vertical industry strip — explicit, honest list of the
          8 wedges Wireline ships landing pages + demo agents for.
          Hover lifts each card subtly for the playful-but-grounded feel. */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-4">
        {VERTICALS.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="group flex flex-col items-center gap-1.5 rounded-lg border border-black/5 bg-[#FAF8F5]/80 py-2.5 px-1 transition-all hover:border-[#4F1E7B]/20 hover:bg-white hover:-translate-y-0.5"
            title={label}
          >
            <Icon
              className="w-3.5 h-3.5 text-[#4F1E7B] group-hover:scale-110 transition-transform"
              strokeWidth={1.8}
            />
            <span className="text-[8px] uppercase tracking-[0.18em] text-muted/65 text-center leading-tight">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Security/compliance badge row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {BADGES.map(({ icon: Icon, label, detail, state }) => {
          const tone = STATE_TONES[state];
          return (
            <div
              key={label}
              className="rounded-lg border border-black/5 bg-[#FAF8F5]/60 p-2.5 transition-all hover:bg-white hover:border-black/10"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <Icon className="w-3.5 h-3.5 text-ink/70" strokeWidth={1.75} />
                <span
                  className={`text-[7px] uppercase tracking-[0.22em] font-semibold px-1.5 py-0.5 rounded-full border leading-none ${tone.pill}`}
                >
                  <span
                    className={`inline-block w-1 h-1 rounded-full mr-1 align-middle ${tone.dot}`}
                  />
                  {tone.label}
                </span>
              </div>
              <p className="text-[11px] font-semibold text-ink leading-none mb-0.5">{label}</p>
              <p className="text-[9px] text-muted/65 leading-tight">{detail}</p>
            </div>
          );
        })}
      </div>

      {/* Status-page deep link — the single most under-rated trust
          signal in B2B SaaS. If we publish uptime, prospects believe
          we run a real shop. */}
      <div className="mt-3 flex items-center justify-end gap-3 text-[9px] uppercase tracking-[0.32em] text-muted/65">
        <a
          href="/status"
          className="inline-flex items-center gap-1.5 hover:text-ink transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dot-online" />
          System status
        </a>
        <span className="text-muted/30">·</span>
        <a href="/pricing" className="hover:text-ink transition-colors">
          Pricing
        </a>
        <span className="text-muted/30">·</span>
        <a href="/compare" className="hover:text-ink transition-colors">
          Compare
        </a>
      </div>
    </motion.section>
  );
}
