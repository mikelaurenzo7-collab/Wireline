import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Phone, Sparkles } from "lucide-react";
import PublicSiteHeader from "../components/marketing/PublicSiteHeader";
import MarketingFooter from "../components/marketing/MarketingFooter";
import MarketingStickyCta from "../components/marketing/MarketingStickyCta";
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

/**
 * Marketing home — scrollable on mobile; viewport-fit split on lg+.
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
      <div className="marketing-surface min-h-dvh lg:h-dvh lg:max-h-dvh flex flex-col bg-paper relative lg:overflow-hidden">
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

        <main className="relative z-10 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden marketing-has-sticky-cta px-5 pb-4 lg:px-8 lg:pb-4">
          <div className="max-w-[1320px] mx-auto lg:h-full grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-6 lg:gap-8 lg:items-stretch lg:min-h-0 py-2 lg:py-0">
            {/* ── Hero column ───────────────────────────────────────── */}
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col justify-center lg:min-h-0 lg:py-2"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="hero-accent-line shrink-0" style={{ background: "#4F1E7B" }} />
                <span className="text-eyebrow">One fleet · phone · SMS · email</span>
              </div>

              <h1 className="font-display italic text-[clamp(2rem,8vw,3.5rem)] leading-[1.02] tracking-tight text-balance text-ink">
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
                <Link to="/signup" className="marketing-btn-primary">
                  Start free trial
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/signin" className="marketing-btn-secondary hidden sm:inline-flex">
                  Sign in
                </Link>
                <a
                  href="tel:+16305811834"
                  className="inline-flex items-center gap-2 px-3 py-2.5 rounded-full text-caption font-medium text-brand hover:underline min-h-[44px]"
                >
                  <Phone className="w-3.5 h-3.5" />
                  Liam · (630) 581-1834
                </a>
              </div>

              <p className="mt-4 text-caption max-w-md lg:hidden">
                Scroll to call any live line — real Wireline agents, no signup required.
              </p>
              <p className="mt-4 text-caption max-w-md hidden lg:block">
                Dial any line on the right from your phone — real Wireline agents, no signup
                required.
              </p>

              <div className="mt-6 lg:mt-auto lg:pt-4 hidden lg:block">
                <IntegrationLogos compact />
              </div>
            </motion.section>

            {/* ── Live agents — full directory ─────────────────────── */}
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col lg:min-h-0 lg:py-2"
            >
              <div className="rounded-2xl border border-black/8 bg-[#FAF8F5]/95 p-3 lg:p-3.5 shadow-[0_12px_40px_-20px_rgba(79,30,123,0.28)] flex flex-col lg:flex-1 lg:min-h-0 lg:overflow-hidden">
                <div className="flex items-center justify-between gap-2 mb-3 lg:mb-2 shrink-0">
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
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                  </span>
                </div>

                <div className="lg:flex-1 lg:min-h-0 lg:overflow-hidden">
                  <AuthDemoDirectory
                    variant="landing"
                    wirelineAgents={[...WIRELINE_CONTACT_AGENTS]}
                    demoAgents={[...WIRELINE_DEMO_AGENTS]}
                    className="lg:h-full"
                  />
                </div>
              </div>

              <div className="mt-4 lg:hidden">
                <IntegrationLogos compact />
              </div>
            </motion.section>
          </div>
        </main>

        <MarketingFooter compact aboveStickyCta className="relative z-10 shrink-0 lg:hidden" />
        <MarketingFooter compact className="relative z-10 shrink-0 hidden lg:block" />

        <MarketingStickyCta />
      </div>
    </>
  );
}
