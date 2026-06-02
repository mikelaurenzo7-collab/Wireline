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
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Clock3,
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
  Eye,
  MessagesSquare,
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

// Security/compliance badges. Each shows real state: "live" for what
// is in production, "in progress" for implemented controls that still
// need external attestation or contract setup.
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
    detail: "Controls implemented · audit target Q4",
    state: "progress" as const,
  },
  {
    icon: HeartPulse,
    label: "HIPAA",
    detail: "PHI-aware mode · Enterprise BAA path",
    state: "progress" as const,
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

const PROOF_NOTES = [
  {
    icon: Clock3,
    title: "Live in under 10 minutes",
    detail: "Your first agent goes from idea to real number without a dev sprint.",
  },
  {
    icon: MessagesSquare,
    title: "Honest handoffs",
    detail: "Agents escalate, take a message, or schedule a callback instead of bluffing.",
  },
  {
    icon: Eye,
    title: "Supervisor visible",
    detail: "Every important moment shows up in the cockpit so operators stay in control.",
  },
] as const;

const QUICK_LINKS = [
  { to: "/status", label: "System status", accent: "Live uptime" },
  { to: "/security", label: "Security", accent: "Controls + posture" },
  { to: "/changelog", label: "Changelog", accent: "Recent shipping cadence" },
] as const;

const STATE_TONES = {
  live: {
    pill: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25",
    dot: "bg-emerald-500",
    label: "Live",
  },
  ready: {
    pill: "bg-[#8B3FD6]/8 text-[#8B3FD6] border-[#8B3FD6]/20",
    dot: "bg-[#8B3FD6]",
    label: "Ready",
  },
  progress: {
    pill: "bg-amber-500/10 text-amber-700 border-amber-500/25",
    dot: "bg-amber-500",
    label: "In progress",
  },
} as const;

export default function TrustSignals() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="mb-8 md:mb-10"
      aria-labelledby="trust-heading"
      data-testid="trust-signals"
    >
      <div className="relative aurora-ring rounded-[2rem]">
        <div className="relative overflow-hidden rounded-[2rem] glass-strong border border-black/8 px-5 py-6 md:px-8 md:py-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(139,63,214,0.14),transparent_70%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 h-36 w-36 rounded-full bg-brand/10 blur-3xl"
          />

          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:items-start lg:gap-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="hero-accent-line" style={{ background: "#8B3FD6" }} />
                <h2
                  id="trust-heading"
                  className="text-[8px] uppercase tracking-[0.5em] text-muted/70 font-semibold"
                >
                  Built for businesses that can't afford to miss a call
                </h2>
              </div>

              <h3 className="font-display italic text-[clamp(1.5rem,3vw,2.35rem)] leading-[1.05] text-ink max-w-2xl">
                Beautiful on first glance. Credible on the second one.
              </h3>
              <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink/68 md:text-[15px]">
                The homepage now answers the quiet follow-up every buyer has: how fast does this go
                live, what happens when the AI hits an edge case, and can I trust the operator
                behind it?
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {PROOF_NOTES.map(({ icon: Icon, title, detail }) => (
                  <div
                    key={title}
                    className="rounded-[1.35rem] border border-black/6 bg-white/[0.56] p-4 shadow-[0_12px_30px_-20px_rgba(26,22,20,0.3)]"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand/[0.08] text-brand">
                      <Icon className="h-4 w-4" strokeWidth={1.9} />
                    </div>
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/48">
                      {title}
                    </p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink/72">{detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.65rem] border border-black/7 bg-white/[0.62] p-4 shadow-[0_18px_44px_-24px_rgba(26,22,20,0.32)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink/45">
                    Operator brief
                  </p>
                  <p className="mt-2 font-display italic text-2xl leading-none text-ink">
                    Verify the shop.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dot-online" />
                  Live demos
                </span>
              </div>

              <div className="mt-4 space-y-2.5">
                {QUICK_LINKS.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="group flex items-center justify-between gap-3 rounded-2xl border border-black/6 bg-paper/60 px-4 py-3 transition-all hover:border-brand/18 hover:bg-paper"
                  >
                    <div>
                      <p className="text-[12px] font-semibold text-ink">{link.label}</p>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">
                        {link.accent}
                      </p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-ink/35 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand" />
                  </Link>
                ))}
              </div>

              <p className="mt-4 text-[11px] leading-relaxed text-ink/58">
                No inflated customer counters. No vague “enterprise-grade” filler. Just the exact
                surfaces a skeptical operator will click before they trust the system.
              </p>
            </div>
          </div>

          <div className="relative mt-6 space-y-5 border-t border-black/7 pt-6 md:mt-8 md:space-y-6 md:pt-7">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink/45 mb-3">
                Built for
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
                {VERTICALS.map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="group flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border border-black/5 bg-[#FAF8F5]/82 px-2 py-3 text-center transition-all hover:-translate-y-0.5 hover:border-[#8B3FD6]/20 hover:bg-[#FAF8F5]"
                    title={label}
                  >
                    <Icon
                      className="w-4 h-4 text-[#8B3FD6] transition-transform group-hover:scale-110"
                      strokeWidth={1.8}
                    />
                    <span className="text-[9px] uppercase tracking-[0.16em] text-muted/70 leading-tight">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink/45">
                  Security posture
                </p>
                <Link
                  to="/compare"
                  className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.22em] text-ink/45 transition-colors hover:text-brand"
                >
                  Compare Wireline
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-5">
                {BADGES.map(({ icon: Icon, label, detail, state }) => {
                  const tone = STATE_TONES[state];
                  return (
                    <div
                      key={label}
                      className="rounded-[1.35rem] border border-black/5 bg-[#FAF8F5]/70 p-3 transition-all hover:border-black/10 hover:bg-[#FAF8F5]"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-white/75 text-ink/72">
                          <Icon className="w-4 h-4" strokeWidth={1.75} />
                        </div>
                        <span
                          className={`text-[7px] uppercase tracking-[0.22em] font-semibold px-1.5 py-0.5 rounded-full border leading-none ${tone.pill}`}
                        >
                          <span
                            className={`inline-block w-1 h-1 rounded-full mr-1 align-middle ${tone.dot}`}
                          />
                          {tone.label}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-ink leading-none mb-1">
                        {label}
                      </p>
                      <p className="text-[10px] text-muted/70 leading-tight">{detail}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
