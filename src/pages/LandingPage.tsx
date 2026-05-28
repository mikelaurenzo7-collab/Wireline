import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowRight,
  MailCheck,
  PhoneIncoming,
  PhoneOutgoing,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { AuthDemoDirectory } from "../components/auth/AuthDemoDirectory";
import RoiCalculator from "../components/marketing/RoiCalculator";
import TrustSignals from "../components/marketing/TrustSignals";
import WirelineMark from "../components/WirelineMark";
import { WIRELINE_CONTACT_AGENTS, WIRELINE_DEMO_AGENTS } from "../data/contact-agents";
import { PageMeta } from "../lib/page-meta";

const FEATURES = [
  {
    icon: PhoneIncoming,
    title: "Inbound Support",
    desc: "Answer, route, schedule, and capture intent without dropping urgent calls.",
  },
  {
    icon: PhoneOutgoing,
    title: "Outbound Sales",
    desc: "Launch call campaigns from a CSV and send qualified meetings to your calendar.",
  },
  {
    icon: MailCheck,
    title: "Email Follow-ups",
    desc: "Reply on-brand, follow up, and escalate only the threads that need a human.",
  },
  {
    icon: Radio,
    title: "Live Monitor",
    desc: "Review conversations, outcomes, sentiment, and handoffs from one console.",
  },
];

const LANDING_WIRELINE_AGENTS = WIRELINE_CONTACT_AGENTS.slice(0, -1);
const LANDING_DEMO_AGENTS = WIRELINE_DEMO_AGENTS.slice(0, -1);

export default function LandingPage() {
  return (
    <>
      <PageMeta
        title="Wireline — AI Voice & Email Agents for Every Business"
        description="Deploy AI voice + email agents on real phone numbers. Handle inbound calls, qualify leads, book appointments, send SMS follow-ups, and sync with your CRM."
        path="/"
      />
      <main className="relative min-h-dvh overflow-hidden bg-paper">
        <div className="pointer-events-none fixed inset-0 z-0 bg-paper" />
        <div className="scanline" />

        <section className="relative z-10 mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8 xl:px-10">
          <nav className="flex items-center justify-between gap-4">
            <Link to="/" className="flex items-center gap-3.5" aria-label="Wireline home">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background: "#4F1E7B",
                  boxShadow: "0 8px 24px -8px rgba(79,30,123,0.4)",
                }}
              >
                <WirelineMark className="w-5 h-5 text-on-brand" strokeWidth={130} />
              </div>
              <div>
                <span className="brand-wordmark text-3xl leading-none !text-[#4F1E7B] !filter-none">
                  WIRELINE
                </span>
                <p className="text-[8px] tracking-[0.42em] uppercase text-muted mt-1">
                  AI Voice + Email Platform
                </p>
              </div>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                to="/signin"
                className="hidden sm:inline-flex min-h-10 items-center rounded-full px-4 text-[10px] uppercase tracking-[0.26em] text-muted hover:text-ink transition-colors"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#4F1E7B] px-4 sm:px-5 text-[10px] uppercase tracking-[0.22em] text-on-brand hover:bg-[#3B154C] transition-colors"
              >
                Start free
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </nav>

          <div className="grid flex-1 items-center gap-7 py-7 lg:grid-cols-[minmax(0,1fr)_minmax(340px,440px)] lg:gap-10 xl:gap-14">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="mb-4 flex items-center gap-2">
                <span className="hero-accent-line" style={{ background: "#4F1E7B" }} />
                <span className="text-[8px] uppercase tracking-[0.5em] text-muted/70">
                  One fleet, every channel
                </span>
              </div>
              <h1 className="font-display italic text-5xl sm:text-6xl xl:text-7xl leading-[0.95] tracking-tight text-balance">
                <span className="text-[#4F1E7B]">AI agents for every</span>
                <br />
                <span className="text-ink">customer conversation</span>
              </h1>
              <p className="mt-5 max-w-2xl text-[15px] sm:text-base text-muted/82 leading-relaxed">
                Wireline answers inbound support, outbound sales, and email follow-ups from one
                trained fleet. Keep the marketing story here; keep signup fast on the next screen.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/signup"
                  className="native-tap-squish inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#4F1E7B] px-6 text-[11px] uppercase tracking-[0.24em] text-on-brand hover:bg-[#3B154C] transition-colors"
                >
                  Create account
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/signin"
                  className="native-tap-squish inline-flex min-h-12 items-center justify-center rounded-full border border-brand/20 bg-white/55 px-6 text-[11px] uppercase tracking-[0.24em] text-brand hover:bg-white transition-colors"
                >
                  I already have access
                </Link>
              </div>

              <div className="mt-7 grid grid-cols-2 gap-3 lg:max-w-2xl">
                {FEATURES.map(({ icon: Icon, title, desc }) => (
                  <div
                    key={title}
                    className="rounded-2xl border border-black/5 bg-[#FAF8F5]/80 p-3.5"
                  >
                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl border border-black/5 bg-[#4F1E7B]/10 text-[#4F1E7B]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-[12px] font-semibold text-ink">{title}</p>
                    <p className="mt-1 text-[10px] leading-snug text-muted/70">{desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            <aside className="space-y-4">
              <div className="rounded-3xl border border-brand/15 bg-[#FAF8F5]/85 p-4 shadow-[0_20px_60px_-32px_rgba(79,30,123,0.35)]">
                <div className="mb-3 flex items-center gap-2 text-[9px] uppercase tracking-[0.28em] text-brand font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  See the math before signup
                </div>
                <RoiCalculator compact />
              </div>
              <AuthDemoDirectory
                wirelineAgents={LANDING_WIRELINE_AGENTS}
                demoAgents={LANDING_DEMO_AGENTS}
                defaultExpanded={false}
              />
            </aside>
          </div>

          <TrustSignals />
        </section>
      </main>
    </>
  );
}
