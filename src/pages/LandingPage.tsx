import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowUpRight, Plus } from "lucide-react";
import PublicSiteHeader from "../components/marketing/PublicSiteHeader";
import IntegrationLogos from "../components/layout/IntegrationLogos";
import HeroCallPreview from "../components/marketing/HeroCallPreview";
import { PageMeta } from "../lib/page-meta";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";

const STATS = [
  { value: "24/7", label: "Availability" },
  { value: "<10m", label: "First agent live" },
  { value: "0", label: "Card required" },
] as const;

const TRUST_BADGES = ["TLS 1.3", "SOC 2 in progress", "HIPAA controls", "Stripe billing"] as const;

const FAQS = [
  {
    q: "What exactly is Wireline?",
    a: "Wireline is a horizontal AI agent platform. One fleet of agents answers your inbound calls, works your outbound list, replies to email, and handles SMS — trained on your playbook, live on real phone numbers, and watched from a single supervisor cockpit. You deploy your first agent in under 10 minutes, no developers required.",
  },
  {
    q: "Will it sound like a robot?",
    a: `No. Each agent has one set personality, voice, and cadence — you pick its vibe (warm, playful, or authoritative) once, and it holds that same character for the entire call instead of lurching between tones. It still adapts to whatever the caller asks, in a natural human voice. End-to-end response latency lands around 700–900 ms, well under the "did they hang up?" threshold, so conversations feel like talking to your sharpest rep.`,
  },
  {
    q: "What happens when the agent can't do something?",
    a: `It tells the truth. Wireline agents run a hard rule: never claim an action they don't have a tool for. Instead of fabricating a booking or a transfer and hanging up, the agent takes a message, escalates to a human, or books a callback — and every one of those moments is visible in the live cockpit.`,
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
    captureDemoSourceFromLocation();
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

        {/* ─── Hero — executive-grade product scene, no purple backdrop or robot wires ─── */}
        <section
          data-testid="hero-section"
          className="relative overflow-hidden border-b border-ink/[0.08] bg-paper px-5 sm:px-6 lg:px-12 pt-24 sm:pt-28 lg:pt-32 pb-14 lg:pb-20"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.34] [background-image:linear-gradient(to_right,rgba(26,22,20,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(26,22,20,0.04)_1px,transparent_1px)] [background-size:72px_72px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-16 h-px bg-ink/[0.08]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-20 h-[34rem] w-px -translate-x-1/2 bg-gradient-to-b from-ink/[0.08] via-ink/[0.035] to-transparent"
          />

          <div className="relative z-10 mx-auto grid w-full max-w-[1440px] grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(460px,0.78fr)] lg:gap-16">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-3xl text-left"
            >
              <span className="inline-flex items-center gap-2 border border-ink/[0.12] bg-white/[0.35] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.24em] text-ink/72 shadow-[0_1px_0_rgba(255,255,255,0.75)_inset]">
                <span className="h-1.5 w-1.5 bg-brand" aria-hidden="true" />
                Phone · Email · SMS
              </span>

              <h1 className="mt-7 max-w-4xl font-display text-[clamp(3rem,7vw,7.1rem)] leading-[0.88] tracking-[-0.075em] text-ink text-balance">
                AI agents that answer every customer like your best rep.
              </h1>

              <p className="mt-7 max-w-2xl text-[clamp(1rem,1.45vw,1.28rem)] leading-relaxed text-ink/68">
                Deploy a trained agent fleet on real phone numbers in minutes. Handle inbound calls,
                qualify leads, book appointments, send follow-ups, and keep every interaction visible
                from one supervisor cockpit.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  to="/signup"
                  data-testid="hero-primary-cta"
                  className="inline-flex min-h-12 items-center justify-center bg-ink px-6 text-[14px] font-semibold text-paper transition-transform duration-200 hover:-translate-y-px"
                >
                  Start free trial
                </Link>
                <Link
                  to="/showcase"
                  data-testid="hero-showcase-link"
                  className="inline-flex min-h-12 items-center justify-center gap-2 border border-ink/[0.14] bg-white/[0.28] px-6 text-[14px] font-semibold text-ink transition-colors hover:bg-white/60"
                >
                  Hear live demos
                  <ArrowUpRight className="h-4 w-4 shrink-0" />
                </Link>
              </div>

              <div
                data-testid="hero-trust-badges"
                className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ink/[0.1] pt-5"
                aria-label="Security and compliance"
              >
                {TRUST_BADGES.map((badge) => (
                  <span
                    key={badge}
                    className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink/58"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            </motion.div>

            <div className="relative lg:pt-7">
              <div
                aria-hidden="true"
                className="absolute -left-4 -top-4 h-16 w-16 border-l border-t border-ink/[0.14]"
              />
              <div
                aria-hidden="true"
                className="absolute -bottom-5 -right-4 h-20 w-20 border-b border-r border-ink/[0.14]"
              />
              <HeroCallPreview />
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 mx-auto mt-12 w-full max-w-4xl"
          >
            <p className="mb-4 text-center font-mono text-[11px] uppercase tracking-[0.24em] text-ink/48">
              Live demo — no signup
            </p>

            <div className="grid grid-cols-1 gap-3 border border-ink/[0.1] bg-[#FBF8F0]/90 p-3 shadow-[0_1px_0_rgba(255,255,255,0.75)_inset] sm:grid-cols-2 sm:p-4">
              {csDemo && (
                <div className="flex flex-col items-center border border-ink/[0.08] bg-white/[0.48] p-4 text-center transition-colors duration-200 hover:bg-white/[0.68]">
                  <p className="mb-3 text-[12px] font-semibold tracking-tight text-ink/70">
                    Jordan · Inbound Support
                  </p>
                  <BrowserCallWidget agentName={csDemo.name} buttonLabel={`Talk to ${csDemo.name}`} />
                  <a
                    href={`tel:${csDemo.tel}`}
                    className="mt-3.5 font-mono text-[13px] tracking-tight text-brand transition-colors hover:text-brand/80"
                  >
                    {csDemo.display}
                  </a>
                </div>
              )}
              {salesDemo && (
                <div className="flex flex-col items-center border border-ink/[0.08] bg-white/[0.48] p-4 text-center transition-colors duration-200 hover:bg-white/[0.68]">
                  <p className="mb-3 text-[12px] font-semibold tracking-tight text-ink/70">
                    Jake · Outbound Sales
                  </p>
                  <BrowserCallWidget agentName={salesDemo.name} buttonLabel={`Talk to ${salesDemo.name}`} />
                  <a
                    href={`tel:${salesDemo.tel}`}
                    className="mt-3.5 font-mono text-[13px] tracking-tight text-brand transition-colors hover:text-brand/80"
                  >
                    {salesDemo.display}
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        </section>

        {/* ─── Proof ──────────────────────────────────────────────── */}
        <section
          data-testid="proof-section"
          className="landing-section landing-section--band landing-section--band-after-hero px-5 sm:px-6 lg:px-12"
        >
          <div className="landing-section-inner max-w-7xl">
            <div className="wl-reveal-stagger grid grid-cols-1 md:grid-cols-3 gap-px bg-ink/[0.08] border border-ink/[0.08] rounded-md overflow-hidden">
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
                    className="stat-value-flip wl-text-gradient font-display italic text-[clamp(2.2rem,5vw,4rem)] leading-none tracking-tight"
                    data-delay={`${0.3 + i * 0.2}s`}
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
        <section
          data-testid="integrations-section"
          className="landing-section px-5 sm:px-6 lg:px-12"
        >
          <div className="landing-section-inner max-w-5xl">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="landing-section-head text-center"
            >
              <p className="inline-flex items-center gap-2 font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.25em] text-ink/65 mb-3">
                <span className="wl-eyebrow-dot" aria-hidden="true" />
                Your stack
              </p>
              <h2 className="font-display italic text-[clamp(1.4rem,3.5vw,2.25rem)] leading-[1.08] text-ink">
                Plugs into the tools you already run.
              </h2>
              <div className="wl-divider-aurora mx-auto mt-6 w-24" aria-hidden="true" />
            </motion.div>
            <IntegrationLogos compact />
          </div>
        </section>

        {/* ─── FAQ ────────────────────────────────────────────────── */}
        <section data-testid="faq-section" className="landing-section px-5 sm:px-6 lg:px-12">
          <div className="landing-section-inner max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="landing-section-head text-center"
            >
              <p className="inline-flex items-center gap-2 font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.25em] text-ink/65 mb-3">
                <span className="wl-eyebrow-dot" aria-hidden="true" />
                Questions, answered
              </p>
              <h2 className="font-display italic text-[clamp(1.6rem,4vw,3rem)] leading-[1.05] text-ink">
                Everything you&rsquo;d ask your best rep.
              </h2>
              <div className="wl-divider-aurora mx-auto mt-6 w-24" aria-hidden="true" />
            </motion.div>

            <div className="border-t border-ink/[0.12] rounded-b-2xl overflow-hidden">
              {FAQS.map((faq, i) => (
                <motion.details
                  key={faq.q}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: Math.min(i * 0.04, 0.2) }}
                  className="wl-faq-item faq-details group border-b border-ink/[0.12] last:border-b-0"
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
                  <summary className="flex items-start justify-between gap-4 py-5 lg:py-6 cursor-pointer list-none select-none px-1 [&::-webkit-details-marker]:hidden">
                    <span className="font-display italic text-base sm:text-lg lg:text-xl text-ink leading-snug pr-4">
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
          className="footer-brand-glow bg-ink text-paper border-t border-paper/[0.08] wl-landing-footer-bg"
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
