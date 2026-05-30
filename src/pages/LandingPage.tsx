import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
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

  // Landing shows skill demos only — not the real employee lines (Sarah/Liam),
  // so curious visitors never escalate to the founder's inbox.
  const demoAgents = LANDING_PUBLIC_DEMO_AGENTS;
  const csDemo = demoAgents.find((a) => a.name === "Jordan") ?? demoAgents[0];
  const salesDemo = demoAgents.find((a) => a.name === "Jake") ?? demoAgents[1];

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
          className="relative flex flex-col justify-center px-6 lg:px-12 pt-20 pb-10 lg:pt-24 lg:pb-14 overflow-hidden"
        >
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

              <h1 className="font-display italic text-[clamp(2.5rem,7vw,5.5rem)] leading-[0.95] tracking-tight text-ink max-w-4xl mx-auto">
                Every conversation, <span className="text-brand">answered like your best rep.</span>
              </h1>

              <p className="mt-6 lg:mt-8 text-[clamp(1rem,1.5vw,1.2rem)] leading-relaxed text-ink/65 max-w-xl mx-auto">
                Wireline deploys AI agents on real phone numbers — inbound support, outbound sales,
                and email follow-ups. Trained on your playbook, improving with every call.
              </p>

              <div className="mt-8 lg:mt-10 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 sm:gap-4">
                {csDemo && (
                  <div className="flex flex-col items-center gap-1.5 border border-ink/10 rounded-2xl p-3 bg-white/20 backdrop-blur-md shadow-sm">
                    <BrowserCallWidget
                      agentName={csDemo.name}
                      buttonLabel={`Talk to ${csDemo.name} (CS)`}
                    />
                    <span className="text-[10px] text-ink/50 font-mono tracking-wider">
                      Or dial:{" "}
                      <a
                        href={`tel:${csDemo.tel}`}
                        className="text-brand hover:underline font-semibold"
                      >
                        {csDemo.display}
                      </a>
                    </span>
                  </div>
                )}
                {salesDemo && (
                  <div className="flex flex-col items-center gap-1.5 border border-ink/10 rounded-2xl p-3 bg-white/20 backdrop-blur-md shadow-sm">
                    <BrowserCallWidget
                      agentName={salesDemo.name}
                      buttonLabel={`Talk to ${salesDemo.name} (Sales)`}
                    />
                    <span className="text-[10px] text-ink/50 font-mono tracking-wider">
                      Or dial:{" "}
                      <a
                        href={`tel:${salesDemo.tel}`}
                        className="text-brand hover:underline font-semibold"
                      >
                        {salesDemo.display}
                      </a>
                    </span>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Trust signals */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="mt-8 lg:mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
            >
              {TRUST_BADGES.map((badge) => (
                <span key={badge} className="font-mono text-[11px] tracking-[0.12em] text-ink/65">
                  {badge}
                </span>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ─── Final CTA ──────────────────────────────────────────── */}
        <section data-testid="final-cta" className="px-6 lg:px-12 py-10 lg:py-14 border-t border-ink/[0.06]">
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
                className="inline-flex items-center gap-2.5 bg-brand text-white font-medium text-sm px-7 py-3.5 hover:bg-[#8B3FD6] transition-colors duration-300"
              >
                Start free trial
                <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>

            {/* Integration logos — moved here: directly under the CTA, above
                the proof claims. Fills the open area and shortens the page. */}
            <div className="mt-8 lg:mt-10 pt-8 lg:pt-10 border-t border-ink/[0.08] max-w-5xl mx-auto">
              <IntegrationLogos compact />
            </div>
          </div>
        </section>

        {/* ─── Proof Tiles ────────────────────────────────────────── */}
        <section data-testid="proof-section" className="px-6 lg:px-12 py-10 lg:py-14 border-t border-ink/[0.06]">
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
