/**
 * Public marketing home at /. Auth (sign-in / sign-up) lives at
 * /login and /signup so conversion pages stay above the fold.
 */
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowRight,
  PhoneIncoming,
  PhoneOutgoing,
  MailCheck,
  Radio,
  LogIn,
  UserPlus,
} from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import WirelineMark from "../components/WirelineMark";
import { AuthDemoDirectory } from "../components/auth/AuthDemoDirectory";
import RoiCalculator from "../components/marketing/RoiCalculator";
import TrustSignals from "../components/marketing/TrustSignals";
import { WIRELINE_CONTACT_AGENTS, WIRELINE_DEMO_AGENTS } from "../data/contact-agents";
import { WIRELINE_ONE_LINER } from "../data/wireline-knowledge";

const LANDING_WIRELINE_AGENTS = WIRELINE_CONTACT_AGENTS.slice(0, -1);
const LANDING_DEMO_AGENTS = WIRELINE_DEMO_AGENTS.slice(0, -1);

const STATS = [
  { value: "24/7", label: "Always answering" },
  { value: "<10 min", label: "To first call" },
  { value: "14 days", label: "Free trial · no card" },
] as const;

const PILLARS = [
  {
    icon: PhoneIncoming,
    title: "Inbound support",
    desc: "Answer, qualify, schedule, and escalate — without missing after-hours revenue.",
  },
  {
    icon: PhoneOutgoing,
    title: "Outbound sales",
    desc: "Upload a list, pick a playbook, launch campaigns. Qualified meetings by morning.",
  },
  {
    icon: MailCheck,
    title: "Email agents",
    desc: "Triage inboxes, reply on-brand, follow up, and surface only what needs you.",
  },
  {
    icon: Radio,
    title: "Live monitor",
    desc: "Watch every conversation in real time — sentiment, funnels, and handoffs in one place.",
  },
] as const;

function LandingHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-black/6 bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5 min-w-0" aria-label="Wireline home">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "#4F1E7B" }}
          >
            <WirelineMark className="h-4 w-4 text-on-brand" strokeWidth={130} />
          </div>
          <span className="brand-wordmark text-xl leading-none !text-[#4F1E7B] !filter-none">
            WIRELINE
          </span>
        </Link>
        <nav className="hidden items-center gap-6 sm:flex">
          <Link
            to="/pricing"
            className="text-[10px] uppercase tracking-[0.32em] text-muted/70 hover:text-ink transition-colors"
          >
            Pricing
          </Link>
          <Link
            to="/showcase"
            className="text-[10px] uppercase tracking-[0.32em] text-muted/70 hover:text-ink transition-colors"
          >
            Showcase
          </Link>
          <Link
            to="/compare"
            className="text-[10px] uppercase tracking-[0.32em] text-muted/70 hover:text-ink transition-colors"
          >
            Compare
          </Link>
        </nav>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/60 px-3.5 py-2 text-[10px] uppercase tracking-[0.28em] text-ink hover:border-brand/25 transition-colors"
            data-testid="landing-sign-in"
          >
            <LogIn className="h-3.5 w-3.5" />
            Sign in
          </Link>
          <Link
            to="/signup"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#4F1E7B] px-3.5 py-2 text-[10px] uppercase tracking-[0.28em] text-on-brand hover:bg-[#6A25A3] transition-colors shadow-[0_4px_12px_-4px_rgba(79,30,123,0.35)]"
            data-testid="landing-start-trial"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Start trial
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function LandingPage() {
  return (
    <>
      <PageMeta
        title="Wireline — AI Voice & Email Agents for Every Business"
        description="Deploy AI voice + email agents on real phone numbers in under 10 minutes. Handle inbound calls, qualify leads, book appointments, and sync with your CRM."
        path="/"
      />
      <div className="relative min-h-dvh bg-paper overflow-x-hidden">
        <div className="pointer-events-none fixed inset-0 z-0 bg-paper" />
        <div className="scanline" />
        <LandingHeader />

        <main className="relative z-10 mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
          {/* Hero */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="pt-10 pb-12 sm:pt-14 sm:pb-16 lg:pt-16"
            data-testid="landing-hero"
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="hero-accent-line" style={{ background: "#4F1E7B" }} />
              <span className="text-[8px] uppercase tracking-[0.5em] text-muted/70">
                One fleet, every channel
              </span>
            </div>
            <h1 className="font-display italic text-4xl sm:text-5xl lg:text-6xl leading-[1.02] tracking-tight text-balance max-w-3xl">
              <span className="text-[#4F1E7B]">AI agents for every</span>{" "}
              <span className="text-ink">customer conversation</span>
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] sm:text-base text-muted/82 leading-relaxed">
              {WIRELINE_ONE_LINER}
            </p>

            <div className="mt-8 grid grid-cols-3 gap-3 max-w-xl">
              {STATS.map((s) => (
                <div
                  key={s.value}
                  className="rounded-xl border border-black/8 bg-white/55 px-3 py-3 text-center"
                >
                  <p className="font-display italic text-xl sm:text-2xl leading-none text-ink">
                    {s.value}
                  </p>
                  <p className="mt-1.5 text-[8px] uppercase tracking-[0.18em] text-muted/65 leading-tight">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-full bg-[#4F1E7B] px-6 py-3.5 text-[11px] uppercase tracking-[0.3em] font-medium text-on-brand hover:bg-[#6A25A3] hover:-translate-y-px transition-all shadow-[0_4px_12px_-2px_rgba(79,30,123,0.3)]"
              >
                Start 14-day free trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-6 py-3.5 text-[11px] uppercase tracking-[0.3em] text-ink hover:border-brand/25 transition-colors"
              >
                Sign in
              </Link>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand/15 bg-brand/[0.04] px-3 py-2 text-[9px] uppercase tracking-[0.26em] text-brand">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dot-online" />
                Live demo lines open 24/7
              </span>
            </div>
          </motion.section>

          {/* Product pillars */}
          <section className="mb-12" aria-labelledby="pillars-heading">
            <h2 id="pillars-heading" className="sr-only">
              Product capabilities
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {PILLARS.map((p) => {
                const Icon = p.icon;
                return (
                  <div
                    key={p.title}
                    className="rounded-xl p-4 border border-black/5 bg-[#FAF8F5]/80"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 border border-black/5 bg-[#4F1E7B]/10 text-[#4F1E7B]">
                      <Icon className="w-4 h-4" />
                    </div>
                    <p className="text-[12px] font-medium text-ink mb-1">{p.title}</p>
                    <p className="text-[11px] text-muted/70 leading-snug">{p.desc}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <AuthDemoDirectory
            wirelineAgents={LANDING_WIRELINE_AGENTS}
            demoAgents={LANDING_DEMO_AGENTS}
            defaultExpanded={false}
            className="mb-10"
          />

          <RoiCalculator />

          <TrustSignals />

          <section className="mt-12 rounded-2xl border border-brand/15 bg-gradient-to-br from-brand/[0.06] to-transparent p-6 sm:p-8 text-center">
            <p className="font-display italic text-2xl sm:text-3xl text-ink mb-3">
              Ready when you are.
            </p>
            <p className="text-sm text-muted/75 max-w-md mx-auto mb-6">
              Deploy your first agent in under ten minutes. No credit card for the trial.
            </p>
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-[#4F1E7B] px-6 py-3.5 text-[11px] uppercase tracking-[0.3em] font-medium text-on-brand hover:bg-[#6A25A3] transition-all"
            >
              Create free account
              <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        </main>

        <footer className="relative z-10 border-t border-black/6 py-6 text-center">
          <p className="text-[9px] uppercase tracking-[0.42em] text-muted/50">
            TLS encrypted ·{" "}
            <Link to="/security" className="hover:text-ink transition-colors">
              Security
            </Link>{" "}
            ·{" "}
            <Link to="/privacy" className="hover:text-ink transition-colors">
              Privacy
            </Link>
          </p>
        </footer>
      </div>
    </>
  );
}
