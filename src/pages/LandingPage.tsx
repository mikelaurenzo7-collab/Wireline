import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Phone, Sparkles } from "lucide-react";
import PublicSiteHeader from "../components/marketing/PublicSiteHeader";
import { AuthDemoDirectory } from "../components/auth/AuthDemoDirectory";
import IntegrationLogos from "../components/layout/IntegrationLogos";
import { PageMeta } from "../lib/page-meta";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { WIRELINE_CONTACT_AGENTS, WIRELINE_DEMO_AGENTS } from "../data/contact-agents";

const PROOF = [
  { value: "24/7", label: "Always on" },
  { value: "<10 min", label: "First agent live" },
  { value: "No card", label: "14-day trial" },
] as const;

const TRUST_PILLS = [
  "TLS 1.3",
  "SOC 2 path",
  "HIPAA-ready",
  "Stripe billing",
  "Public status",
] as const;

/**
 * Marketing home — fits laptop/desktop viewport without scroll.
 * Auth lives at /signup and /signin (slim AuthPortal).
 */
export default function LandingPage() {
  useEffect(() => {
    captureSignupIntentFromLocation();
  }, []);

  return (
    <>
      <PageMeta
        title="Wireline — AI Voice & Email Agents for Every Business"
        description="Deploy AI voice + email agents on real phone numbers in under 10 minutes. Inbound, outbound, and inbox — one fleet, your playbook, 24/7."
        path="/"
      />
      <div className="marketing-surface h-dvh max-h-dvh flex flex-col overflow-hidden bg-paper relative">
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
          <div
            className="absolute -top-32 -right-24 w-[min(520px,55vw)] h-[min(520px,55vw)] rounded-full opacity-50"
            style={{
              background: "radial-gradient(closest-side, rgba(79,30,123,0.16), transparent 72%)",
              filter: "blur(40px)",
            }}
          />
          <div
            className="absolute bottom-0 left-0 w-[min(480px,50vw)] h-[min(360px,40vh)] rounded-full opacity-40"
            style={{
              background: "radial-gradient(closest-side, rgba(217,119,82,0.12), transparent 70%)",
              filter: "blur(48px)",
            }}
          />
        </div>

        <PublicSiteHeader active="home" />

        <main className="relative z-10 flex-1 min-h-0 px-5 pb-3 lg:px-8 lg:pb-4">
          <div className="h-full max-w-[1320px] mx-auto grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-5 lg:gap-8 items-stretch min-h-0">
            {/* ── Hero column ───────────────────────────────────────── */}
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col justify-center min-h-0 py-1 lg:py-2"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="hero-accent-line shrink-0" style={{ background: "#4F1E7B" }} />
                <span className="text-eyebrow">One fleet · phone · SMS · email</span>
              </div>

              <h1 className="font-display italic text-[clamp(2rem,3.8vw,3.5rem)] leading-[1.02] tracking-tight text-balance text-ink">
                <span className="text-brand">Every conversation</span>
                <br />
                answered like your best rep.
              </h1>

              <p className="text-lead mt-3 max-w-md">
                Wireline runs inbound support, outbound sales, and email follow-ups on real numbers
                — trained on your playbook, improving with every call.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {PROOF.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-black/8 bg-white/55 px-3.5 py-2 min-w-[5rem]"
                  >
                    <p className="font-display italic text-lg leading-none text-ink">
                      {item.value}
                    </p>
                    <p className="text-eyebrow mt-0.5 !text-[0.625rem] !tracking-[0.14em]">
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <Link
                  to="/signup"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-brand text-on-brand text-sm font-semibold hover:bg-[#6A25A3] transition-all shadow-[0_6px_20px_-6px_rgba(79,30,123,0.55)]"
                >
                  Start free trial
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/signin"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-black/12 bg-white/50 text-sm font-semibold text-ink hover:bg-white transition-colors"
                >
                  Sign in
                </Link>
                <a
                  href="tel:+16305811834"
                  className="inline-flex items-center gap-2 px-3 py-2.5 rounded-full text-caption font-medium text-brand hover:underline"
                >
                  <Phone className="w-3.5 h-3.5" />
                  Liam · (630) 581-1834
                </a>
              </div>

              <p className="mt-4 text-caption max-w-md hidden lg:block">
                Dial any line on the right from your phone — real Vapi agents, no signup required.
              </p>

              <div className="mt-auto pt-4 hidden lg:block">
                <IntegrationLogos compact />
              </div>
            </motion.section>

            {/* ── Live agents — full directory, no scroll ───────────── */}
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col min-h-0 py-1 lg:py-2"
            >
              <div className="rounded-2xl border border-black/8 bg-[#FAF8F5]/95 p-3 lg:p-3.5 shadow-[0_12px_40px_-20px_rgba(79,30,123,0.28)] flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-4 h-4 text-brand shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink leading-tight">
                        Call a live agent
                      </p>
                      <p className="text-caption leading-snug">
                        {WIRELINE_CONTACT_AGENTS.length + WIRELINE_DEMO_AGENTS.length} real lines ·
                        tap to dial
                      </p>
                    </div>
                  </div>
                  <span className="hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                  </span>
                </div>

                <div className="flex-1 min-h-0 overflow-hidden">
                  <AuthDemoDirectory
                    variant="landing"
                    wirelineAgents={[...WIRELINE_CONTACT_AGENTS]}
                    demoAgents={[...WIRELINE_DEMO_AGENTS]}
                    className="h-full"
                  />
                </div>
              </div>
            </motion.section>
          </div>
        </main>

        <footer className="relative z-10 shrink-0 border-t border-black/6 px-5 py-2.5 lg:px-8">
          <div className="max-w-[1320px] mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {TRUST_PILLS.map((label) => (
                <span
                  key={label}
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-black/8 bg-white/40 text-ink/80"
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption font-medium">
              <Link to="/showcase" className="hover:text-ink">
                Personas
              </Link>
              <Link to="/status" className="hover:text-ink inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Status
              </Link>
              <Link to="/security" className="hover:text-ink">
                Security
              </Link>
              <Link to="/pricing" className="hover:text-ink">
                Pricing
              </Link>
              <Link to="/compare" className="hover:text-ink">
                Compare
              </Link>
            </div>
          </div>
          <div className="lg:hidden mt-2 max-w-[1320px] mx-auto">
            <IntegrationLogos compact />
          </div>
        </footer>
      </div>
    </>
  );
}
