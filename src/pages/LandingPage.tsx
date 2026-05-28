import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Phone, ArrowUpRight } from "lucide-react";
import PublicSiteHeader from "../components/marketing/PublicSiteHeader";
import IntegrationLogos from "../components/layout/IntegrationLogos";
import { PageMeta } from "../lib/page-meta";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { WIRELINE_CONTACT_AGENTS, WIRELINE_DEMO_AGENTS } from "../data/contact-agents";
import type { ContactAgent } from "../data/contact-agents";

const STATS = [
  { value: "24/7", label: "Availability" },
  { value: "<10m", label: "First agent live" },
  { value: "0", label: "Card required" },
] as const;

const TRUST_BADGES = ["TLS 1.3", "SOC 2 path", "HIPAA-ready", "Stripe billing"] as const;

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
  isDemo,
  featured = false,
  delay = 0,
}: {
  agent: ContactAgent;
  isDemo: boolean;
  featured?: boolean;
  delay?: number;
}) {
  return (
    <motion.a
      href={`tel:${agent.tel}`}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      data-testid={`agent-card-${agent.name.toLowerCase()}`}
      className="group block border border-ink/[0.12] hover:border-ink/30 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(26,22,20,0.07)] transition-all duration-300"
      style={{ background: "#EFE9DC" }}
    >
      <div
        className={
          featured
            ? "p-6 md:p-8 flex flex-col justify-between h-full min-h-[220px]"
            : "p-5 md:p-6 flex flex-col justify-between h-full min-h-[180px]"
        }
      >
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span
              className={`font-display italic ${featured ? "text-2xl lg:text-3xl" : "text-lg lg:text-xl"} text-ink leading-none`}
            >
              {agent.name}
            </span>
            <span
              className={`font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-0.5 leading-none ${
                isDemo
                  ? "text-ink/50 border border-ink/12"
                  : "text-brand bg-brand/8 border border-brand/20"
              }`}
            >
              {isDemo ? "Demo" : "Team"}
            </span>
          </div>
          <p
            className={`text-ink/60 leading-relaxed ${featured ? "text-sm max-w-sm" : "text-[13px]"}`}
          >
            {agent.role}
          </p>
        </div>
        <div className="flex items-end justify-between gap-4 mt-4">
          <span
            className={`font-mono tabular-nums text-brand ${featured ? "text-lg" : "text-sm"} font-medium`}
          >
            {agent.display}
          </span>
          <span className="flex items-center gap-1.5 text-ink/40 group-hover:text-brand transition-colors text-[11px] font-mono uppercase tracking-[0.15em]">
            Call
            <ArrowUpRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </motion.a>
  );
}

export default function LandingPage() {
  useEffect(() => {
    captureSignupIntentFromLocation();
  }, []);

  const allAgents = [
    ...WIRELINE_CONTACT_AGENTS.map((a) => ({ agent: a, isDemo: false })),
    ...WIRELINE_DEMO_AGENTS.map((a) => ({ agent: a, isDemo: true })),
  ];
  const featured = allAgents[0];
  const rest = allAgents.slice(1);

  return (
    <>
      <PageMeta
        title="Wireline — AI Voice & Email Agents for Every Business"
        description="Deploy AI voice + email agents on real phone numbers in under 10 minutes. Inbound, outbound, and inbox — one fleet, your playbook, 24/7."
        path="/"
      />
      <div className="marketing-surface min-h-dvh bg-paper relative">
        {/* ─── Header ─────────────────────────────────────────────── */}
        <PublicSiteHeader active="home" />

        {/* ─── Hero ───────────────────────────────────────────────── */}
        <section
          data-testid="hero-section"
          className="relative min-h-[85vh] flex flex-col justify-center px-6 lg:px-12 pt-24 pb-16 lg:pt-28 lg:pb-24 overflow-hidden"
        >
          <div className="max-w-7xl mx-auto w-full">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink/50 mb-6 lg:mb-8">
                Voice + Email + SMS — One fleet
              </p>

              <h1 className="font-display italic text-[clamp(2.5rem,7vw,5.5rem)] leading-[0.95] tracking-tight text-ink max-w-4xl mx-auto">
                Every conversation, <span className="text-brand">answered like your best rep.</span>
              </h1>

              <p className="mt-6 lg:mt-8 text-[clamp(1rem,1.5vw,1.2rem)] leading-relaxed text-ink/65 max-w-xl mx-auto">
                Wireline deploys AI agents on real phone numbers — inbound support, outbound sales,
                and email follow-ups. Trained on your playbook, improving with every call.
              </p>

              <div className="mt-8 lg:mt-10 flex flex-wrap items-center justify-center gap-4">
                <Link
                  to="/signup"
                  data-testid="hero-cta-primary"
                  className="inline-flex items-center gap-2.5 bg-brand text-white font-medium text-sm px-7 py-3.5 hover:bg-[#3d1660] transition-colors duration-300"
                >
                  Start free trial
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <a
                  href={`tel:${WIRELINE_CONTACT_AGENTS[0]?.tel || "+16305811834"}`}
                  data-testid="hero-cta-call"
                  className="inline-flex items-center gap-2 text-ink/60 hover:text-brand transition-colors text-sm font-medium"
                >
                  <Phone className="w-4 h-4" />
                  <span>Talk to {WIRELINE_CONTACT_AGENTS[0]?.name || "us"} now</span>
                </a>
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
                <span key={badge} className="font-mono text-[11px] tracking-[0.12em] text-ink/40">
                  {badge}
                </span>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ─── Integration Logos Ribbon ────────────────────────────── */}
        <section className="border-y border-ink/[0.08] py-10 lg:py-12 px-6 lg:px-12">
          <div className="max-w-7xl mx-auto">
            <IntegrationLogos compact />
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
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink/45 mt-3">
                    {stat.label}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Agent Directory — Bento Grid ───────────────────────── */}
        <section data-testid="agent-directory" className="px-6 lg:px-12 pb-24 lg:pb-32">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="mb-10 lg:mb-14"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink/45 mb-3">
                Live right now
              </p>
              <h2 className="font-display italic text-[clamp(1.8rem,4vw,3rem)] leading-[1.05] text-ink max-w-2xl">
                Call any agent from your phone.{" "}
                <span className="text-ink/40">No signup required.</span>
              </h2>
            </motion.div>

            {/* Asymmetric bento grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-px bg-ink/[0.08]">
              {/* Featured agent — spans 8 cols */}
              <div className="md:col-span-8">
                <AgentCard agent={featured.agent} isDemo={featured.isDemo} featured delay={0} />
              </div>
              {/* Second agent — spans 4 cols */}
              {rest[0] && (
                <div className="md:col-span-4">
                  <AgentCard agent={rest[0].agent} isDemo={rest[0].isDemo} delay={0.05} />
                </div>
              )}
              {/* Remaining agents — alternating 4-col grid */}
              {rest.slice(1).map(({ agent, isDemo }, i) => (
                <div key={agent.tel} className="md:col-span-4">
                  <AgentCard agent={agent} isDemo={isDemo} delay={0.05 + (i + 1) * 0.03} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Final CTA ──────────────────────────────────────────── */}
        <section data-testid="final-cta" className="px-6 lg:px-12 pb-24 lg:pb-32">
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
              <p className="text-ink/55 text-lg max-w-lg mx-auto mb-8">
                14-day free trial. No credit card. Your first agent goes live in under 10 minutes.
              </p>
              <Link
                to="/signup"
                data-testid="final-cta-button"
                className="inline-flex items-center gap-2.5 bg-brand text-white font-medium text-sm px-7 py-3.5 hover:bg-[#3d1660] transition-colors duration-300"
              >
                Start free trial
                <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>
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
                <p className="text-[13px] text-paper/45 leading-relaxed max-w-xs">
                  AI voice + email agents for every business. One fleet, your playbook, 24/7.
                </p>
              </div>
              {FOOTER_COLS.map((col) => (
                <div key={col.title}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/35 mb-4">
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
              <p className="font-mono text-[11px] text-paper/30 tracking-[0.08em]">
                &copy; {new Date().getFullYear()} Wireline Inc.
              </p>
              <div className="flex items-center gap-4">
                <Link
                  to="/signin"
                  data-testid="footer-signin"
                  className="text-[13px] text-paper/45 hover:text-paper transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  data-testid="footer-signup"
                  className="text-[13px] text-paper/45 hover:text-paper transition-colors"
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
