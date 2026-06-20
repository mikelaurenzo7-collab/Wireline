import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, PhoneCall } from "lucide-react";

import PublicSiteHeader from "../components/marketing/PublicSiteHeader";
import IntegrationLogos from "../components/layout/IntegrationLogos";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import { PageMeta } from "../lib/page-meta";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";

const PROOF_POINTS = ["Calls for you", "Waits on hold", "Texts the answer"] as const;

export default function LandingPage() {
  const csDemo =
    LANDING_PUBLIC_DEMO_AGENTS.find((agent) => agent.name === "Jordan") ||
    LANDING_PUBLIC_DEMO_AGENTS[0];

  useEffect(() => {
    captureSignupIntentFromLocation();
    captureDemoSourceFromLocation();
  }, []);

  return (
    <>
      <PageMeta
        title="Wireline | Your AI Call Assistant"
        description="Wireline calls the pharmacy, doctor, school, airline, restaurant, landlord, or support line and texts you the answer."
        image="/og-image.jpg"
      />

      <div className="min-h-screen overflow-x-hidden bg-[#f7f7f5] font-sans text-[#1d1d1f] selection:bg-[#1d1d1f] selection:text-white">
        <PublicSiteHeader active="home" />

        <main id="main-content" className="mx-auto max-w-6xl px-5 pb-16 pt-28 sm:px-8 sm:pt-32 lg:px-10">
          <section className="max-w-4xl py-8 sm:py-14">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#1d1d1f]/15 bg-white px-3.5 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1d1d1f]">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-[#1d1d1f] text-[9px] text-white">✦</span>
              Live on the wire
            </div>

            <h1 className="max-w-[11ch] text-balance text-[clamp(3.4rem,13vw,6.9rem)] font-semibold leading-[0.92] tracking-[-0.065em] text-[#1d1d1f]">
              Have Wireline call the <em className="font-normal">pharmacy.</em>
            </h1>

            <p className="mt-7 max-w-[31rem] text-pretty text-[clamp(1.2rem,4.9vw,1.6rem)] font-medium leading-[1.36] tracking-[-0.025em] text-[#4f4f55]">
              Wireline calls, waits on hold, and texts you the answer.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/pricing"
                className="marketing-btn-primary min-h-14 w-full px-7 text-base font-semibold sm:w-auto"
              >
                Start at $9
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/showcase"
                className="marketing-btn-secondary min-h-14 w-full px-7 text-base font-semibold sm:w-auto"
              >
                <PhoneCall className="h-5 w-5" />
                Hear an assistant
              </Link>
            </div>

            <div className="mt-9 flex flex-col gap-3 text-[15px] font-medium text-[#5e5e64] sm:flex-row sm:flex-wrap sm:gap-x-7 sm:gap-y-3">
              {PROOF_POINTS.map((point) => (
                <span key={point} className="inline-flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 flex-none text-[#1d1d1f]" />
                  {point}
                </span>
              ))}
            </div>
          </section>

          <section className="max-w-[820px] pt-7 sm:pt-10">
            <div className="rounded-[24px] border border-[#1d1d1f]/12 bg-white p-2 shadow-[0_18px_48px_rgba(29,29,31,0.08)]">
              <div className="rounded-[18px] border border-[#1d1d1f]/8 bg-[#fbfbf9] px-5 py-6 sm:px-7 sm:py-8">
                <div className="flex items-start justify-between gap-4 pb-5">
                  <div>
                    <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6e6e73]">Try it</div>
                    <div className="mt-2 text-[clamp(1.6rem,6vw,2.2rem)] font-semibold leading-none tracking-[-0.045em] text-[#1d1d1f]">
                      Hear a real call.
                    </div>
                  </div>
                  <div className="hidden pt-1 text-right text-xs font-medium text-[#6e6e73] sm:block">No account required</div>
                </div>
                <BrowserCallWidget agentName={csDemo.name} />
              </div>
            </div>
          </section>

          <section className="pt-14 sm:pt-16">
            <div className="mb-5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6e6e73]">Works with your tools</div>
            <div className="opacity-65 grayscale transition hover:opacity-100 hover:grayscale-0">
              <IntegrationLogos />
            </div>
          </section>
        </main>

        <footer className="border-t border-[#1d1d1f]/10 bg-white px-5 py-10 text-sm text-[#6e6e73] sm:px-8">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 md:flex-row">
            <div>© {new Date().getFullYear()} Wireline</div>
            <div className="flex gap-7">
              <Link className="font-medium text-[#4f4f55] hover:text-[#1d1d1f]" to="/terms">Terms</Link>
              <Link className="font-medium text-[#4f4f55] hover:text-[#1d1d1f]" to="/privacy">Privacy</Link>
              <Link className="font-medium text-[#4f4f55] hover:text-[#1d1d1f]" to="/status">Status</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
