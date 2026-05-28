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
        {/* Background Image with Overlay per Design Guidelines */}
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
          <div className="absolute inset-0 bg-[url('https://static.prod-images.emergentagent.com/jobs/26ac8abe-def8-4ce8-8d65-083fd6e14d41/images/1a79a223b290c74aab773e441bf50bb4bbfd115490cc4ab1a7f3b8e2da5fbdd1.png')] bg-cover bg-center opacity-30 mix-blend-overlay" />
          <div className="absolute inset-0 bg-gradient-to-b from-paper/80 via-paper/90 to-paper" />
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

        <main className="relative z-10 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden marketing-has-sticky-cta px-4 sm:px-6 pb-8 lg:px-8 lg:pb-4">
          <div className="max-w-[1320px] mx-auto lg:h-full grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-8 lg:gap-8 lg:items-stretch lg:min-h-0 py-6 lg:py-0">
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

              <div className="mt-8 flex flex-wrap gap-3">
                {PROOF.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-black/8 bg-white/60 px-4 py-3 min-w-[5.5rem] flex-1 sm:flex-none shadow-[0_2px_10px_-4px_rgba(79,30,123,0.1)] backdrop-blur-md"
                  >
                    <p className="font-display italic text-xl leading-none text-ink">
                      {item.value}
                    </p>
                    <p className="text-eyebrow mt-1.5 !text-[0.65rem] !tracking-[0.15em] text-muted-soft">
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
                <Link to="/signup" className="marketing-btn-primary w-full sm:w-auto text-center" data-testid="start-free-trial-btn">
                  Start free trial
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/signin" className="marketing-btn-secondary hidden sm:inline-flex" data-testid="sign-in-btn">
                  Sign in
                </Link>
                <a
                  href="tel:+16305811834"
                  className="inline-flex justify-center items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold text-brand bg-brand/5 border border-brand/15 hover:bg-brand/10 active:scale-[0.98] transition-all min-h-[48px] w-full sm:w-auto"
                  data-testid="call-demo-btn"
                >
                  <Phone className="w-4 h-4" />
                  Liam · (630) 581-1834
                </a>
              </div>

              <p className="mt-4 text-caption max-w-md lg:hidden">
                Scroll to call any live line — real Wireline agents, no signup required.
              </p>
              <p className="mt-4 text-caption max-w-md hidden lg:block">
                Dial any line on the right from your phone — real Wireline agents, no signup required.
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
              className="flex flex-col lg:min-h-0 lg:py-2 mt-6 lg:mt-0"
            >
              <div className="rounded-[1.5rem] border border-black/8 bg-white/70 backdrop-blur-2xl p-4 sm:p-5 lg:p-6 shadow-[0_12px_40px_-20px_rgba(79,30,123,0.28)] flex flex-col lg:flex-1 lg:min-h-0 lg:overflow-hidden relative">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center shrink-0 border border-brand/20 shadow-sm">
                      <Sparkles className="w-5 h-5 text-brand" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-ink leading-tight">
                        Call a live agent
                      </p>
                      <p className="text-xs sm:text-sm text-muted mt-0.5 leading-snug truncate">
                        {WIRELINE_CONTACT_AGENTS.length + WIRELINE_DEMO_AGENTS.length} real lines ·
                        tap to dial
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] uppercase tracking-wider font-bold text-emerald-800 self-start sm:self-auto shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live Nodes
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

              <div className="mt-8 lg:hidden">
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
