import React from "react";
import { Link } from "react-router-dom";
import {
  PhoneIncoming,
  PhoneOutgoing,
  MailCheck,
  Radio,
  ArrowRight,
  ShieldCheck,
  Phone,
} from "lucide-react";
import { motion } from "motion/react";
import WirelineMark from "../components/WirelineMark";
import { AuthDemoDirectory } from "../components/auth/AuthDemoDirectory";
import TrustSignals from "../components/marketing/TrustSignals";
import RoiCalculator from "../components/marketing/RoiCalculator";
import { PageMeta } from "../lib/page-meta";
import { WIRELINE_CONTACT_AGENTS, WIRELINE_DEMO_AGENTS } from "../data/contact-agents";

const FEATURES = [
  {
    icon: PhoneIncoming,
    title: "Inbound Support",
    desc: "Agents pick up 24/7 — answer questions, route urgent calls, schedule appointments, and capture intent.",
  },
  {
    icon: PhoneOutgoing,
    title: "Outbound Sales",
    desc: "Upload a CSV, pick a playbook, launch auto-dial campaigns. Qualified meetings on your calendar by morning.",
  },
  {
    icon: MailCheck,
    title: "Email Agents",
    desc: "Agents triage your inbox, reply on-brand, follow up, and escalate the ones you need to see personally.",
  },
  {
    icon: Radio,
    title: "Live Monitor & Insights",
    desc: "Watch every conversation in real time. Sentiment, funnels, topic clusters, leaderboards — one dashboard.",
  },
];

const STATS = [
  { value: "24/7", label: "Always answering" },
  { value: "<10 min", label: "Setup to first call" },
  { value: "100%", label: "Calls picked up" },
  { value: "14 days", label: "Free trial, no card" },
];

const LANDING_WIRELINE_AGENTS = WIRELINE_CONTACT_AGENTS.slice(0, -1);
const LANDING_DEMO_AGENTS = WIRELINE_DEMO_AGENTS.slice(0, -1);

export default function LandingPage() {
  return (
    <>
      <PageMeta
        title="Wireline — AI Voice & Email Agents for Every Business"
        description="Deploy AI voice + email agents on real phone numbers in under 10 minutes. Handle inbound calls, qualify leads, book appointments, send SMS follow-ups, and sync with your CRM."
        path="/"
      />
      <div className="min-h-dvh bg-paper relative overflow-hidden">
        <div className="pointer-events-none fixed inset-0 z-0 bg-paper" />
        <div className="scanline" />

        {/* Nav */}
        <nav className="relative z-20 flex items-center justify-between px-5 sm:px-8 lg:px-12 py-4 lg:py-5">
          <Link to="/" className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: "#4F1E7B",
                boxShadow: "0 6px 20px -6px rgba(79,30,123,0.4)",
              }}
            >
              <WirelineMark className="w-5 h-5 text-on-brand" strokeWidth={130} />
            </div>
            <span className="brand-wordmark text-2xl leading-none !text-[#4F1E7B] !filter-none">
              WIRELINE
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/pricing"
              className="hidden sm:inline-flex text-[11px] uppercase tracking-[0.2em] text-ink/70 hover:text-ink transition-colors px-3 py-2"
            >
              Pricing
            </Link>
            <Link
              to="/about"
              className="hidden sm:inline-flex text-[11px] uppercase tracking-[0.2em] text-ink/70 hover:text-ink transition-colors px-3 py-2"
            >
              About
            </Link>
            <Link
              to="/signin"
              className="text-[11px] uppercase tracking-[0.2em] text-ink/70 hover:text-ink transition-colors px-3 py-2"
            >
              Sign In
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#4F1E7B] text-on-brand text-[11px] uppercase tracking-[0.18em] font-medium hover:bg-[#6A25A3] transition-all shadow-[0_4px_16px_-4px_rgba(79,30,123,0.4)]"
            >
              Get Started <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </nav>

        {/* Hero */}
        <section className="relative z-10 px-5 sm:px-8 lg:px-12 pt-12 sm:pt-16 lg:pt-20 pb-16 lg:pb-24">
          <div className="max-w-5xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-brand/15 bg-white/60 px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-brand mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dot-online" />
                Live demo lines open 24/7
              </div>
              <h1 className="font-display italic text-5xl sm:text-6xl lg:text-7xl leading-[1.0] tracking-tight mb-6 text-balance">
                <span className="text-[#4F1E7B]">AI agents</span>{" "}
                <span className="text-ink">for every</span>
                <br />
                <span className="text-ink">customer conversation</span>
              </h1>
              <p className="text-base sm:text-lg text-ink/70 leading-relaxed max-w-2xl mx-auto mb-8">
                One trained fleet answers, qualifies, follows up, and escalates across phone, SMS,
                and email — with no fake actions and no missed handoff.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  to="/signup"
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#4F1E7B] text-on-brand text-[12px] uppercase tracking-[0.2em] font-medium hover:bg-[#6A25A3] hover:-translate-y-0.5 transition-all shadow-[0_6px_20px_-6px_rgba(79,30,123,0.4)]"
                >
                  Start Free Trial <ArrowRight className="w-4 h-4" />
                </Link>
                <a
                  href="tel:+16305811834"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full border border-black/10 bg-white/60 text-ink text-[12px] uppercase tracking-[0.2em] font-medium hover:border-brand/30 hover:bg-white transition-all"
                >
                  <Phone className="w-4 h-4 text-brand" /> Call a Live Agent
                </a>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Stats */}
        <section className="relative z-10 px-5 sm:px-8 lg:px-12 pb-16 lg:pb-20">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4"
            >
              {STATS.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-black/6 bg-white/50 px-4 py-5 text-center"
                >
                  <p className="font-display italic text-3xl lg:text-4xl leading-none text-ink mb-2">
                    {stat.value}
                  </p>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-ink/60">
                    {stat.label}
                  </p>
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Features */}
        <section className="relative z-10 px-5 sm:px-8 lg:px-12 pb-16 lg:pb-20">
          <div className="max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.55 }}
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="hero-accent-line" style={{ background: "#4F1E7B" }} />
                <span className="text-[11px] uppercase tracking-[0.3em] text-ink/50">
                  One fleet, every channel
                </span>
              </div>
              <h2 className="font-display italic text-3xl sm:text-4xl leading-tight text-ink mb-8">
                Every conversation, handled.
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {FEATURES.map((f) => {
                  const Icon = f.icon;
                  return (
                    <div
                      key={f.title}
                      className="rounded-2xl p-5 border border-black/5 bg-[#FAF8F5]/80 hover:bg-white hover:border-black/8 transition-all"
                    >
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 border border-black/5 bg-[#4F1E7B]/10 text-[#4F1E7B]">
                        <Icon className="w-4 h-4" />
                      </div>
                      <p className="text-sm font-semibold text-ink mb-1">{f.title}</p>
                      <p className="text-[13px] text-ink/65 leading-relaxed">{f.desc}</p>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ROI Calculator */}
        <section className="relative z-10 px-5 sm:px-8 lg:px-12 pb-16 lg:pb-20">
          <div className="max-w-5xl mx-auto">
            <RoiCalculator />
          </div>
        </section>

        {/* Demo Directory */}
        <section className="relative z-10 px-5 sm:px-8 lg:px-12 pb-16 lg:pb-20">
          <div className="max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.55 }}
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="hero-accent-line" style={{ background: "#4F1E7B" }} />
                <span className="text-[11px] uppercase tracking-[0.3em] text-ink/50">
                  Try before you buy
                </span>
              </div>
              <h2 className="font-display italic text-3xl leading-tight text-ink mb-6">
                Call a live agent right now.
              </h2>
              <AuthDemoDirectory
                wirelineAgents={LANDING_WIRELINE_AGENTS}
                demoAgents={LANDING_DEMO_AGENTS}
                defaultExpanded={false}
              />
            </motion.div>
          </div>
        </section>

        {/* Trust Signals */}
        <section className="relative z-10 px-5 sm:px-8 lg:px-12 pb-16 lg:pb-20">
          <div className="max-w-5xl mx-auto">
            <TrustSignals />
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative z-10 px-5 sm:px-8 lg:px-12 pb-20 lg:pb-28">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.55 }}
            >
              <h2 className="font-display italic text-4xl sm:text-5xl leading-tight text-ink mb-4">
                Ready to never miss a call?
              </h2>
              <p className="text-base text-ink/65 mb-8 max-w-lg mx-auto">
                Deploy your first AI agent in under 10 minutes. No credit card required for the
                14-day trial.
              </p>
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#4F1E7B] text-on-brand text-[13px] uppercase tracking-[0.18em] font-medium hover:bg-[#6A25A3] hover:-translate-y-0.5 transition-all shadow-[0_6px_20px_-6px_rgba(79,30,123,0.4)]"
              >
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="relative z-10 border-t border-black/6 px-5 sm:px-8 lg:px-12 py-8">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[11px] uppercase tracking-[0.2em] text-ink/50">
                TLS Encrypted · Carrier-Grade Infra
              </span>
            </div>
            <div className="flex items-center gap-4 text-[11px] uppercase tracking-[0.18em] text-ink/50">
              <Link to="/privacy" className="hover:text-ink transition-colors">
                Privacy
              </Link>
              <Link to="/terms" className="hover:text-ink transition-colors">
                Terms
              </Link>
              <Link to="/status" className="hover:text-ink transition-colors">
                Status
              </Link>
              <Link to="/security" className="hover:text-ink transition-colors">
                Security
              </Link>
              <Link to="/changelog" className="hover:text-ink transition-colors">
                Changelog
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
