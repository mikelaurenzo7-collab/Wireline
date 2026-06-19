import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import PublicSiteHeader from "../components/marketing/PublicSiteHeader";
import IntegrationLogos from "../components/layout/IntegrationLogos";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import { PageMeta } from "../lib/page-meta";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";

// Two short hero beats. One consumer cue ("call the pharmacy"), one
// "you can also run a business" cue. Rotates on a slow 5s cadence so
// the page tells both stories in one glance without needing a subtitle.
const HERO_BEATS: ReadonlyArray<{
  kicker: string;
  line1: string;
  line2: string;
  sub: string;
}> = [
  {
    kicker: "LIVE ON THE WIRE",
    line1: "HEY SIRI,",
    line2: "HAVE WIRELINE CALL THE PHARMACY.",
    sub: "Your agent can call the pharmacy, doctor, school, restaurant, landlord, airline, or support line — and report back with the answer.",
  },
  {
    kicker: "CUSTOMIZE AN EMPLOYEE",
    line1: "SALES AGENT? FRONT DESK?",
    line2: "WIRELINE COVERS IT ALL.",
    sub: "Spin up an agent for a side project or a whole business. Same console, same studio — just more minutes, more agents, more workflows.",
  },
];

export default function LandingPage() {
  const csDemo =
    LANDING_PUBLIC_DEMO_AGENTS.find((agent) => agent.name === "Jordan") ||
    LANDING_PUBLIC_DEMO_AGENTS[0];

  const [beatIndex, setBeatIndex] = useState(0);

  useEffect(() => {
    captureSignupIntentFromLocation();
    captureDemoSourceFromLocation();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const id = window.setInterval(() => {
      setBeatIndex((current) => (current + 1) % HERO_BEATS.length);
    }, 5200);
    return () => window.clearInterval(id);
  }, []);

  const beat = HERO_BEATS[beatIndex];

  return (
    <>
      <PageMeta
        title="Wireline | Your AI Call Concierge"
        description="Ask Wireline to call the pharmacy, doctor, school, airline, landlord, restaurant, or support line and report back. Same console runs a business when you want it to."
        image="/og-image.jpg"
      />

      <div className="marketing-launch min-h-screen bg-marketing-surface font-sans text-foreground selection:bg-iris/20 selection:text-foreground overflow-x-hidden">
        <PublicSiteHeader active="home" />

        <main
          id="main-content"
          className="relative mx-auto max-w-6xl space-y-16 px-4 pb-20 pt-20 sm:space-y-20 sm:pt-24 md:px-10"
        >
          <section className="relative pb-8 pt-10 sm:pt-14">
            <div className="max-w-4xl text-left">
              <div
                key={`kicker-${beatIndex}`}
                className="mb-5 inline-flex items-center gap-2 border border-iris/20 bg-iris/5 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-iris motion-safe:animate-[wlRise_0.5s_ease-out_both]"
              >
                <span className="h-px w-3 bg-iris/60" /> {beat.kicker}
              </div>

              <h1
                key={`title-${beatIndex}`}
                className="font-display wl-display-scale tracking-[-0.05em] text-balance text-[#1E1B2E] motion-safe:animate-[wlRise_0.65s_ease-out_both]"
              >
                {beat.line1}
                <br />
                {beat.line2}
              </h1>

              <p
                key={`sub-${beatIndex}`}
                className="mt-6 max-w-[48ch] wl-body-scale tracking-[-0.012em] text-[#1E1B2E]/70 motion-safe:animate-[wlRise_0.8s_ease-out_both]"
              >
                {beat.sub}
              </p>

              <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row">
                <Link
                  to="/signup"
                  className="inline-flex h-14 items-center justify-center gap-3 rounded-xl bg-[#1E1B2E] px-7 text-sm sm:px-8 sm:text-base font-semibold text-white shadow-lg shadow-black/10 transition-all hover:bg-iris hover:shadow-iris/20 active:scale-[0.985]"
                >
                  Start at $7
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/showcase"
                  className="inline-flex h-14 items-center justify-center gap-3 rounded-xl border border-[#1E1B2E]/15 px-7 text-sm sm:px-8 sm:text-base font-medium text-[#1E1B2E] transition hover:border-iris/40 hover:text-iris"
                >
                  Try the call demo
                </Link>
              </div>

              <div className="mt-7 flex flex-wrap justify-start gap-x-6 gap-y-2 text-sm text-[#1E1B2E]/55">
                {["Everyday calls", "Business-ready when needed", "One simple console"].map((t) => (
                  <span key={t} className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-iris" /> {t}
                  </span>
                ))}
              </div>

              <div className="mt-6 flex items-center gap-2" aria-hidden="true">
                {HERO_BEATS.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setBeatIndex(i)}
                    aria-label={`Show hero beat ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      i === beatIndex ? "w-8 bg-iris" : "w-3 bg-[#1E1B2E]/15 hover:bg-[#1E1B2E]/30"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Subtle live-wire motif (editorial accent) */}
            <div className="pointer-events-none absolute -bottom-8 left-1/2 hidden h-px w-[620px] -translate-x-1/2 bg-gradient-to-r from-transparent via-iris/30 to-transparent md:block" />
          </section>

          {/* Demo widget — now secondary, generous breathing room */}
          <section className="max-w-[820px] pt-4">
            <div className="rounded-2xl border border-border bg-white p-2 shadow-xl shadow-black/5">
              <div className="rounded-xl border border-border/60 bg-marketing-surface-2 px-5 py-5 sm:px-7 sm:py-7">
                <div className="flex items-center justify-between pb-5">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-iris">
                      TRY IT
                    </div>
                    <div className="font-display text-2xl tracking-[-0.02em] text-[#1E1B2E] sm:text-3xl">
                      TALK TO A WIRELINE AGENT
                    </div>
                  </div>
                  <div className="hidden text-right text-xs text-[#1E1B2E]/45 md:block">
                    No account required
                  </div>
                </div>
                <BrowserCallWidget agentName={csDemo.name} />
              </div>
            </div>
          </section>

          {/* Quiet integration endorsement */}
          <section className="pt-10 text-left">
            <div className="mb-5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#1E1B2E]/35">
              WORKS WITH YOUR TOOLS
            </div>
            <div className="opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0">
              <IntegrationLogos />
            </div>
          </section>
        </main>

        <footer className="border-t border-[#1E1B2E]/8 bg-marketing-surface px-6 py-12 text-sm text-[#1E1B2E]/45">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 md:flex-row">
            <div>© {new Date().getFullYear()} Wireline</div>
            <div className="flex gap-8">
              <Link className="hover:text-[#1E1B2E]" to="/terms">
                Terms
              </Link>
              <Link className="hover:text-[#1E1B2E]" to="/privacy">
                Privacy
              </Link>
              <Link className="hover:text-[#1E1B2E]" to="/status">
                Status
              </Link>
            </div>
            <div className="inline-flex items-center gap-2 text-xs tracking-[0.14em] uppercase">
              <span className="h-px w-4 bg-[#1E1B2E]/25" /> Systems online
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
