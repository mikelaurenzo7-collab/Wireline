import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, PhoneCall, Radio } from "lucide-react";

import PublicSiteHeader from "../components/marketing/PublicSiteHeader";
import LandingIntegrationStrip from "../components/marketing/LandingIntegrationStrip";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import { PageMeta } from "../lib/page-meta";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";

const PROOF_POINTS = ["Calls for you", "Waits on hold", "Texts the answer"] as const;

export default function LandingPage() {
  const csDemo = LANDING_PUBLIC_DEMO_AGENTS.find((agent) => agent.name === "Jordan") || LANDING_PUBLIC_DEMO_AGENTS[0];

  useEffect(() => {
    captureSignupIntentFromLocation();
    captureDemoSourceFromLocation();
  }, []);

  return (
    <>
      <PageMeta title="Wireline | Your AI Call Assistant" description="Wireline calls the pharmacy, doctor, school, airline, restaurant, landlord, or support line and texts you the answer." image="/og-image.jpg" />
      <div className="min-h-screen overflow-x-hidden bg-[#f7f7f5] font-sans text-[#1d1d1f] selection:bg-[#1d1d1f] selection:text-white">
        <PublicSiteHeader active="home" />
        <main id="main-content" className="mx-auto max-w-[1380px] px-5 pb-16 pt-24 sm:px-8 sm:pt-28 lg:px-10">
          <section className="grid items-center gap-10 py-7 lg:grid-cols-[minmax(0,0.94fr)_minmax(420px,0.86fr)] lg:gap-14 lg:py-12 xl:gap-20">
            <div className="max-w-[650px]">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#1d1d1f]/15 bg-white px-3.5 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1d1d1f]"><span className="grid h-4 w-4 place-items-center rounded-full bg-[#1d1d1f] text-[9px] text-white">✦</span>Live on the wire</div>
              <h1 className="max-w-[10.5ch] text-balance text-[clamp(3.5rem,6.3vw,5.75rem)] font-semibold leading-[0.94] tracking-[-0.067em] text-[#1d1d1f]">Have Wireline call the <em className="font-normal">pharmacy.</em></h1>
              <p className="mt-6 max-w-[34rem] text-pretty text-[clamp(1.08rem,1.65vw,1.38rem)] font-medium leading-[1.42] tracking-[-0.024em] text-[#4f4f55]">Wireline makes the call, stays on the line, handles the back-and-forth, and texts you what matters.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link to="/pricing" className="marketing-btn-primary min-h-13 w-full px-6 text-[15px] font-semibold sm:w-auto">Start at $9 <ArrowRight className="h-4 w-4" /></Link>
                <Link to="/showcase" className="marketing-btn-secondary min-h-13 w-full px-6 text-[15px] font-semibold sm:w-auto"><PhoneCall className="h-4 w-4" />Hear an assistant</Link>
              </div>
              <div className="mt-8 flex flex-col gap-3 text-[14px] font-medium text-[#5e5e64] sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-3">
                {PROOF_POINTS.map((point) => <span key={point} className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 flex-none text-[#1d1d1f]" />{point}</span>)}
              </div>
              <div className="mt-8 max-w-[38rem] border-t border-[#1d1d1f]/10 pt-5">
                <p className="text-sm leading-6 text-[#5e5e64]">For business, Wireline becomes an AI front office for routing, booking, follow-up, and review.</p>
                <Link to="/pricing" className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[#1d1d1f] underline underline-offset-4">Explore business coverage <ArrowRight className="h-4 w-4" /></Link>
              </div>
            </div>
            <section className="relative">
              <div className="absolute -left-6 -top-5 hidden h-28 w-28 rounded-full border border-black/[.07] lg:block" />
              <div className="relative overflow-hidden rounded-[30px] border border-[#1d1d1f]/12 bg-white p-2 shadow-[0_24px_70px_rgba(29,29,31,0.10)]">
                <div className="rounded-[23px] border border-[#1d1d1f]/8 bg-[#fbfbf9] p-5 sm:p-7">
                  <div className="flex items-start justify-between gap-4 border-b border-black/[.07] pb-5">
                    <div>
                      <div className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6e6e73]"><Radio className="h-3 w-3" />Try it live</div>
                      <div className="mt-2 text-[clamp(1.65rem,2.8vw,2.35rem)] font-semibold leading-none tracking-[-0.05em] text-[#1d1d1f]">Hear a real call.</div>
                    </div>
                    <div className="hidden rounded-full border border-black/[.08] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#67676d] sm:block">No account required</div>
                  </div>
                  <div className="pt-5"><BrowserCallWidget agentName={csDemo.name} /></div>
                  <div className="mt-5 flex items-center justify-between border-t border-black/[.07] pt-4 text-[11px] text-[#68686f]"><span>Calls are handled privately for you.</span><span className="font-semibold text-[#1d1d1f]">Listen in →</span></div>
                </div>
              </div>
            </section>
          </section>
          <section className="pt-12 sm:pt-15"><LandingIntegrationStrip /></section>
        </main>
        <footer className="border-t border-[#1d1d1f]/10 bg-white px-5 py-10 text-sm text-[#6e6e73] sm:px-8"><div className="mx-auto flex max-w-[1380px] flex-col items-center justify-between gap-5 md:flex-row"><div>© {new Date().getFullYear()} Wireline</div><div className="flex gap-7"><Link className="font-medium text-[#4f4f55] hover:text-[#1d1d1f]" to="/terms">Terms</Link><Link className="font-medium text-[#4f4f55] hover:text-[#1d1d1f]" to="/privacy">Privacy</Link><Link className="font-medium text-[#4f4f55] hover:text-[#1d1d1f]" to="/status">Status</Link></div></div></footer>
      </div>
    </>
  );
}