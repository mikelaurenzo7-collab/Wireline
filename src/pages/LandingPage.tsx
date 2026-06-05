import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowUpRight, Plus } from "lucide-react";
import PublicSiteHeader from "../components/marketing/PublicSiteHeader";
import IntegrationLogos from "../components/layout/IntegrationLogos";
import { HeroDecorations } from "../components/marketing/HeroDecorations";
import { PageMeta } from "../lib/page-meta";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";

const STATS = [
  { value: "24/7", label: "Availability" },
  { value: "<10m", label: "First agent live" },
  { value: "0", label: "Card required" },
] as const;

const TRUST_BADGES = ["TLS 1.3", "SOC 2 in progress", "HIPAA controls", "Stripe billing"] as const;

/**
 * Top-of-funnel FAQ — the questions a prospect asks before they ever reach
 * pricing. Deliberately distinct from the billing-focused FAQ on /pricing:
 * these handle product objections (quality, the never-fabricate rule, speed,
 * fit, security). The visible copy below and the FAQPage JSON-LD are built
 * from this single source so the structured data can never drift from what a
 * human actually reads — a requirement for Google FAQ rich results.
 */
const FAQS = [
  {
    q: "What exactly is Wireline?",
    a: "Wireline is a horizontal AI agent platform. One fleet of agents answers your inbound calls, works your outbound list, replies to email, and handles SMS — trained on your playbook, live on real phone numbers, and watched from a single supervisor cockpit. You deploy your first agent in under 10 minutes, no developers required.",
  },
  {
    q: "Will it sound like a robot?",
    a: 'No. Each agent has one set personality, voice, and cadence — you pick its vibe (warm, playful, or authoritative) once, and it holds that same character for the entire call instead of lurching between tones. It still adapts to whatever the caller asks, in a natural human voice. End-to-end response latency lands around 700–900 ms, well under the "did they hang up?" threshold, so conversations feel like talking to your sharpest rep.',
  },
  {
    q: "What happens when the agent can't do something?",
    a: "It tells the truth. Wireline agents run a hard rule: never claim an action they don't have a tool for. Instead of fabricating a booking or a transfer and hanging up, the agent takes a message, escalates to a human, or books a callback — and every one of those moments is visible in the live cockpit.",
  },
  {
    q: "Does it work for my industry?",
    a: "Yes. The platform is horizontal, but the onboarding is vertical: home services, medical, legal, real estate, insurance, restaurants, and outbound sales all have purpose-built starting points. Paste your website URL and Wireline drafts the business profile, FAQs, and escalation rules for you to approve.",
  },
  {
    q: "Can I try it before I buy?",
    a: "Two ways. Call Jordan or Jake from the hero above — no signup. Or start a 14-day free trial from the header: no credit card, deploy a real agent on a real number, run live calls, and cancel before the trial ends with no charge.",
  },
  {
    q: "Is my data secure?",
    a: "Wireline ships SOC 2-ready architecture with TLS 1.3 in transit, encrypted secrets at rest, per-tenant data isolation, full audit logs, configurable data retention, and a documented Do-Not-Call list. Business and Enterprise plans add SSO and audit-log export.",
  },
] as const;

const FAQ_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: { "@type": "Answer", text: faq.a },
  })),
};

const FOOTER_COLS = [
  {
    title: "Product",
    links: [
      { to: "/pricing", label: "Pricing" },
      { to: "/showcase", label: "Demos" },
      { to: "/compare", label: "Compare" },
      { to: "/status", label: "Status" },
    ],
  },
  {
    title: "Company",
    links: [
      { to: "/about", label: "About" },
      { to: "/security", label: "Security" },
      { to: "/support", label: "Support" },
      { to: "/changelog", label: "Changelog" },
    ],
  },
  {
    title: "Legal",
    links: [
      { to: "/privacy", label: "Privacy" },
      { to: "/terms", label: "Terms" },
    ],
  },
];

export default function LandingPage() {
  useEffect(() => {
    captureSignupIntentFromLocation();
  }, []);

  const csDemo = LANDING_PUBLIC_DEMO_AGENTS.find((a) => a.name === "Jordan");
  const salesDemo = LANDING_PUBLIC_DEMO_AGENTS.find((a) => a.name === "Jake");

  return (
    <>
      <PageMeta
        title="Wireline — AI Voice & Email Agents for Every Business"
        description="Deploy AI voice + email agents on real phone numbers in under 10 minutes. Inbound, outbound, and inbox — one fleet, your playbook, 24/7."
        path="/"
        structuredData={FAQ_STRUCTURED_DATA}
      />
      <div className="marketing-surface min-h-dvh bg-paper relative paper-texture">
        <PublicSiteHeader active="home" />

        {/* ─── Hero ───────────────────────────────────────────────── */}
        <section
          data-testid="hero-section"
          className="relative px-6 lg:px-12 pt-24 pb-10 lg:pt-28 lg:pb-12 overflow-x-hidden"
        >
          <HeroDecorations />
          <div className="relative z-10 max-w-7xl mx-auto w-full">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              <motion.span
                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="hero-badge inline-flex items-center border border-ink/15 bg-ink/[0.03] px-5 py-2.5 mb-7 lg:mb-9"
              >
                <span className="font-mono text-[11px] sm:text-[13px] uppercase tracking-[0.22em] text-ink/85">
                  Phone + Email + SMS
                </span>
              </motion.span>

              <h1 className="hero-word-reveal hero-headline hero-headline-glow text-ink max-w-4xl mx-auto">
                <span>Every conversation,</span>
                <span className="text-brand hero-headline-accent">
                  answered like your best rep.
                </span>
              </h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="mt-6 lg:mt-8 text-[clamp(0.9rem,1.5vw,1.2rem)] leading-relaxed text-ink/65 max-w-xl mx-auto"
              >
                Wireline deploys AI agents on real phone numbers — inbound support, outbound sales,
                and email follow-ups. Trained on your playbook, improving with every call.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.9, ease: [0.16, 1, 0.3, 1] }}
                className="mt-10 lg:mt-12 max-w-2xl mx-auto"
              >
                <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-ink/50 mb-4">
                  Live demo — no signup
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 rounded-md border border-ink/10 bg-white/25 backdrop-blur-sm p-4 sm:p-5 shadow-sm">
                  {csDemo && (
                    <div className="flex flex-col items-center gap-2 text-center">
                      <p className="text-[11px] font-medium text-ink/70">
                        Jordan · inbound support
                      </p>
                      <BrowserCallWidget
                        agentName={csDemo.name}
                        buttonLabel={`Talk to ${csDemo.name}`}
                      />
                      <a
                        href={`tel:${csDemo.tel}`}
                        className="text-[11px] font-mono text-ink/50 hover:text-brand transition-colors"
                      >
                        {csDemo.display}
                      </a>
                    </div>
                  )}
                  {salesDemo && (
                    <div className="flex flex-col items-center gap-2 text-center sm:border-l sm:border-ink/[0.08] sm:pl-4">
                      <p className="text-[11px] font-medium text-ink/70">Jake · outbound sales</p>
                      <BrowserCallWidget
                        agentName={salesDemo.name}
                        buttonLabel={`Talk to ${salesDemo.name}`}
                      />
                      <a
                        href={`tel:${salesDemo.tel}`}
                        className="text-[11px] font-mono text-ink/50 hover:text-brand transition-colors"
                      >
                        {salesDemo.display}
                      </a>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-[13px] leading-snug text-ink/60">
                  <Link
                    to="/showcase"
                    data-testid="hero-showcase-link"
                    className="inline-flex items-center gap-1 text-ink/70 hover:text-brand transition-colors"
                  >
                    Hear medical, legal, real estate &amp; more
                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                  </Link>
                  <span className="hidden sm:inline text-ink/25" aria-hidden="true">
                    ·
                  </span>
                  <p className="text-center sm:text-left">
                    14-day trial from the header · no card required
                  </p>
                </div>

                <div
                  data-testid="hero-trust-badges"
                  className="wl-reveal-stagger mt-6 pt-4 border-t border-ink/10 flex flex-wrap items-center justify-center gap-x-2.5 sm:gap-x-4 gap-y-2"
                  aria-label="Security and compliance"
                >
                  {TRUST_BADGES.map((badge, i) => (
                    <span key={badge} className="inline-flex items-center gap-2.5 sm:gap-4">
                      {i > 0 && (
                        <span
                          className="text-ink/35 hidden sm:inline font-mono text-[13px] leading-none"
                          aria-hidden="true"
                        >
                          ·
                        </span>
                      )}
                      <span className="font-mono text-[12px] sm:text-[13px] uppercase tracking-[0.16em] text-ink/78 font-medium">
                        {badge}
                      </span>
                    </span>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ─── Proof ──────────────────────────────────────────────── */}
        <section
          data-testid="proof-section"
          className="landing-section landing-section--band landing-section--band-after-hero px-6 lg:px-12"
        >
          <div className="landing-section-inner max-w-7xl">
            <div className="wl-reveal-stagger grid grid-cols-1 md:grid-cols-3 gap-px bg-ink/[0.08] border border-ink/[0.08]">
              {STATS.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20, scale: 0.96 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  className="wl-stat-glow bg-paper p-8 md:p-10 lg:p-12 group stat-shimmer"
                >
                  <p
                    className="stat-value-flip font-display italic text-[clamp(2.2rem,5vw,4rem)] leading-none text-ink tracking-tight"
                    style={{ animationDelay: `${0.3 + i * 0.2}s` }}
                  >
                    {stat.value}
                  </p>
                  <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-ink/65 mt-3">
                    {stat.label}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Integrations ───────────────────────────────────────── */}
        <section data-testid="integrations-section" className="landing-section px-6 lg:px-12">
          <div className="landing-section-inner max-w-5xl">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="landing-section-head text-center"
            >
              <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.25em] text-ink/65 mb-3">
                Your stack
              </p>
              <h2 className="font-display italic text-[clamp(1.4rem,3.5vw,2.25rem)] leading-[1.08] text-ink">
                Plugs into the tools you already run.
              </h2>
            </motion.div>
            <IntegrationLogos compact />
          </div>
        </section>

        {/* ─── FAQ ────────────────────────────────────────────────── */}
        <section data-testid="faq-section" className="landing-section px-6 lg:px-12">
          <div className="landing-section-inner max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="landing-section-head text-center"
            >
              <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.25em] text-ink/65 mb-3">
                Questions, answered
              </p>
              <h2 className="font-display italic text-[clamp(1.6rem,4vw,3rem)] leading-[1.05] text-ink">
                Everything you&rsquo;d ask your best rep.
              </h2>
            </motion.div>

            <div className="border-t border-ink/[0.12]">
              {FAQS.map((faq, i) => (
                <motion.details
                  key={faq.q}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: Math.min(i * 0.04, 0.2) }}
                  className="wl-faq-item faq-details group border-b border-ink/[0.12]"
                  data-testid={`faq-item-${i}`}
                  onToggle={(e: React.ToggleEvent<HTMLDetailsElement>) => {
                    const el = e.currentTarget;
                    if (el.open) {
                      el.setAttribute("data-open", "true");
                    } else {
                      el.removeAttribute("data-open");
                    }
                  }}
                >
                  <summary className="flex items-start justify-between gap-4 py-5 lg:py-6 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
                    <span className="font-display italic text-base sm:text-lg lg:text-xl text-ink leading-snug">
                      {faq.q}
                    </span>
                    <Plus
                      aria-hidden="true"
                      className="w-5 h-5 shrink-0 mt-1 text-ink/45 transition-transform duration-300 group-open:rotate-45 group-hover:text-brand"
                    />
                  </summary>
                  <p className="text-ink/70 leading-relaxed text-[13px] sm:text-[15px] pb-6 pr-8 max-w-prose">
                    {faq.a}
                  </p>
                </motion.details>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Footer ─────────────────────────────────────────────── */}
        <footer
          data-testid="landing-footer"
          className="footer-brand-glow bg-ink text-paper border-t border-paper/[0.08]"
          style={{ background: "#1A1614" }}
        >
          <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16 lg:py-20">
            <div className="wl-reveal-stagger grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12 mb-16">
              <div className="col-span-2 md:col-span-1">
                <p className="font-display italic text-2xl text-paper/90 mb-3">Wireline</p>
                <p className="text-[13px] text-paper/55 leading-relaxed max-w-xs">
                  AI voice + email agents for every business. One fleet, your playbook, 24/7.
                </p>
              </div>
              {FOOTER_COLS.map((col) => (
                <div key={col.title}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/45 mb-4">
                    {col.title}
                  </p>
                  <ul className="space-y-2.5">
                    {col.links.map((link) => (
                      <li key={link.to}>
                        <Link
                          to={link.to}
                          className="text-[13px] text-paper/60 hover:text-paper transition-colors"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="border-t border-paper/[0.08] pt-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <p className="font-mono text-[11px] text-paper/40 tracking-[0.08em]">
                &copy; {new Date().getFullYear()} Wireline Inc.
              </p>
              <Link
                to="/signin"
                data-testid="footer-signin"
                className="text-[13px] text-paper/55 hover:text-paper transition-colors"
              >
                Sign in
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
