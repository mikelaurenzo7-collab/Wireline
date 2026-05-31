import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import PublicSiteHeader from "../components/marketing/PublicSiteHeader";
import IntegrationLogos from "../components/layout/IntegrationLogos";
import { HeroDecorations } from "../components/marketing/HeroDecorations";
import { PageMeta } from "../lib/page-meta";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";
import type { ContactAgent } from "../data/contact-agents";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import { SectionHeader } from "../components/ui/SectionHeader";

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
    a: "Two ways. Call any live demo agent from your phone right now — no signup. Or start a 14-day free trial with no credit card, deploy a real agent on a real number, run live calls, and cancel before the trial ends with no charge.",
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

function AgentCard({
  agent,
  featured = false,
  delay = 0,
  badge = "Live demo",
}: {
  agent: ContactAgent;
  featured?: boolean;
  delay?: number;
  badge?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      data-testid={`agent-card-${agent.name.toLowerCase()}`}
      className="group block border border-ink/15 bg-paper/80 transition-all duration-300 overflow-hidden hover:shadow-[0_8px_32px_rgba(157,78,221,0.05)]"
    >
      <div
        className={
          featured
            ? "p-6 md:p-8 flex flex-col justify-between h-full min-h-[260px]"
            : "p-5 md:p-6 flex flex-col justify-between h-full min-h-[220px]"
        }
      >
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span
              className={`font-display italic ${featured ? "text-2xl lg:text-3xl" : "text-lg lg:text-xl"} text-ink leading-none`}
            >
              {agent.name}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-0.5 leading-none text-brand bg-brand/8 border border-brand/20">
              {badge}
            </span>
          </div>
          <p
            className={`text-ink/70 leading-relaxed ${featured ? "text-sm max-w-sm" : "text-[13px]"}`}
          >
            {agent.role}
          </p>
          <p className="mt-2 text-[12px] text-ink/55 leading-relaxed">
            Tell {agent.name} your company name and any scenario details — services, hours, or what
            you want to hear.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mt-6 border-t border-ink/5 pt-4">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-wider text-ink/40 font-mono">
              Dial via phone
            </span>
            <a
              href={`tel:${agent.tel}`}
              className={`font-mono tabular-nums text-brand ${featured ? "text-base" : "text-xs"} font-semibold hover:underline`}
            >
              {agent.display}
            </a>
          </div>
          <div className="shrink-0 flex items-center justify-end">
            <BrowserCallWidget agentName={agent.name} buttonLabel={`Talk to ${agent.name}`} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function LandingPage() {
  useEffect(() => {
    captureSignupIntentFromLocation();
  }, []);

  // Landing shows skill demos only — not the real employee lines (Sarah/Liam),
  // so curious visitors never escalate to the founder's inbox.
  const demoAgents = LANDING_PUBLIC_DEMO_AGENTS;
  const csDemo = demoAgents.find((a) => a.name === "Jordan") ?? demoAgents[0];
  const salesDemo = demoAgents.find((a) => a.name === "Jake") ?? demoAgents[1];
  const demoColsClass =
    demoAgents.length <= 1
      ? ""
      : demoAgents.length === 2
        ? "sm:grid-cols-2"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <>
      <PageMeta
        title="Wireline — AI Voice & Email Agents for Every Business"
        description="Deploy AI voice + email agents on real phone numbers in under 10 minutes. Inbound, outbound, and inbox — one fleet, your playbook, 24/7."
        path="/"
        structuredData={FAQ_STRUCTURED_DATA}
      />
      <div className="marketing-surface min-h-dvh bg-paper relative">
        {/* ─── Header ─────────────────────────────────────────────── */}
        <PublicSiteHeader active="home" />

        {/* ─── Hero ───────────────────────────────────────────────── */}
        <section
          data-testid="hero-section"
          className="relative min-h-[85svh] flex flex-col justify-center px-6 lg:px-12 pt-24 pb-16 lg:pt-28 lg:pb-24 overflow-hidden"
        >
          {/* 3D spheres backdrop — subtle brand element at 5-8% opacity */}
          <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.06] mix-blend-multiply">
            <img
              src="https://static.prod-images.emergentagent.com/jobs/54584c6e-3405-4f20-a1e6-8648db882043/images/2d4d0bfed009adc6b8a18e9dc585a7a7c7f7a94b4abe19de936073f3ca1a4607.png"
              alt=""
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] max-w-none"
            />
          </div>
          <HeroDecorations />
          <div className="relative z-10 max-w-7xl mx-auto w-full">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              <span className="inline-flex items-center border border-ink/15 bg-ink/[0.03] px-5 py-2.5 mb-7 lg:mb-9">
                <span className="font-mono text-[13px] uppercase tracking-[0.22em] text-ink/85">
                  Phone + Email + SMS
                </span>
              </span>

              <h1 className="marketing-hero-title">
                Every conversation, <span className="italic text-brand">answered.</span>
              </h1>

              <p className="mt-6 lg:mt-8 text-[clamp(1rem,1.5vw,1.2rem)] leading-relaxed text-ink/65 max-w-xl mx-auto">
                Wireline deploys AI agents on real phone numbers — inbound support, outbound sales,
                and email follow-ups. Trained on your playbook, improving with every call.
              </p>

              <div className="mt-8 lg:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                <Link
                  to="/signup"
                  data-testid="hero-cta-primary"
                  className="marketing-btn-primary"
                >
                  Start free trial
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>

            {/* Trust signals */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="mt-12 lg:mt-16 flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
            >
              {TRUST_BADGES.map((badge) => (
                <span key={badge} className="font-mono text-[11px] tracking-[0.12em] text-ink/65">
                  {badge}
                </span>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ─── Agent Directory — Bento Grid ───────────────────────── */}
        <section data-testid="agent-directory" className="px-6 lg:px-12 pt-4 pb-20 lg:pb-28">
          <div className="max-w-7xl mx-auto">
            <SectionHeader
              eyebrow="Live right now"
              title="Call inbound CS or outbound sales."
              description="Use your company name in the demo."
              className="mb-10 lg:mb-14 text-center"
            />

            <div className={`grid grid-cols-1 ${demoColsClass} gap-4 max-w-5xl mx-auto`}>
              {demoAgents.map((agent, i) => (
                <AgentCard
                  key={agent.tel}
                  agent={agent}
                  delay={i * 0.05}
                  badge={agent.name === "Jake" ? "Sales demo" : "CS demo"}
                />
              ))}
            </div>

            {/* Full vertical demo catalog lives on /showcase */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mt-8 text-center"
            >
              <Link
                to="/showcase"
                data-testid="agent-directory-demos-link"
                className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink/65 hover:text-brand transition-colors"
              >
                Want an agent for your industry? Hear a live demo
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </motion.div>
          </div>
        </section>

        {/* ─── Final CTA ──────────────────────────────────────────── */}
        <section data-testid="final-cta" className="px-6 lg:px-12 pb-16 lg:pb-20">
          <div className="max-w-7xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="font-display italic text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.05] text-ink mb-6">
                Ready to run your fleet?
              </h2>
              <p className="text-ink/65 text-lg max-w-lg mx-auto mb-8">
                14-day free trial. No credit card. Your first agent goes live in under 10 minutes.
              </p>
              <Link
                to="/signup"
                data-testid="final-cta-button"
                className="marketing-btn-primary"
              >
                Start free trial
                <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>

            {/* Integration logos — moved here: directly under the CTA, above
                the proof claims. Fills the open area and shortens the page. */}
            <div className="mt-16 lg:mt-20 pt-10 lg:pt-12 border-t border-ink/[0.08] max-w-5xl mx-auto">
              <IntegrationLogos compact />
            </div>
          </div>
        </section>

        {/* ─── Proof Tiles ────────────────────────────────────────── */}
        <section data-testid="proof-section" className="px-6 lg:px-12 py-20 lg:py-28">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-ink/[0.08] border border-ink/[0.08]">
              {STATS.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  className="bg-paper p-8 md:p-10 lg:p-12"
                >
                  <p className="font-display italic text-[clamp(2.5rem,5vw,4rem)] leading-none text-ink tracking-tight">
                    {stat.value}
                  </p>
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink/65 mt-3">
                    {stat.label}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FAQ — top-of-funnel objection handling ──────────────── */}
        <section
          data-testid="faq-section"
          className="px-6 lg:px-12 py-20 lg:py-28 border-t border-ink/[0.08]"
        >
          <div className="max-w-3xl mx-auto">
            <SectionHeader
              eyebrow="Questions, answered"
              title="Everything you'd ask your best rep."
              className="mb-10 lg:mb-14 text-center"
            />

            <div className="border-t border-ink/[0.12]">
              {FAQS.map((faq, i) => (
                <motion.details
                  key={faq.q}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: Math.min(i * 0.04, 0.2) }}
                  className="group border-b border-ink/[0.12]"
                  data-testid={`faq-item-${i}`}
                >
                  <summary className="flex items-start justify-between gap-4 py-5 lg:py-6 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
                    <span className="font-display italic text-lg lg:text-xl text-ink leading-snug">
                      {faq.q}
                    </span>
                    <Plus
                      aria-hidden="true"
                      className="w-5 h-5 shrink-0 mt-1 text-ink/45 transition-transform duration-300 group-open:rotate-45 group-hover:text-brand"
                    />
                  </summary>
                  <p className="text-ink/70 leading-relaxed text-[15px] pb-6 pr-8 max-w-prose">
                    {faq.a}
                  </p>
                </motion.details>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Footer — Inverse ───────────────────────────────────── */}
        <footer
          data-testid="landing-footer"
          className="bg-ink text-paper"
          style={{ background: "#1A1614" }}
        >
          <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16 lg:py-20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12 mb-16">
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
              <div className="flex items-center gap-4">
                <Link
                  to="/signin"
                  data-testid="footer-signin"
                  className="text-[13px] text-paper/55 hover:text-paper transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  data-testid="footer-signup"
                  className="text-[13px] text-paper/55 hover:text-paper transition-colors"
                >
                  Create account
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
