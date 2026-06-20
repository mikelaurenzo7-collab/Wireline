import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, MessageSquare, Phone, Volume2 } from "lucide-react";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import { PageMeta } from "../lib/page-meta";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";

const STEPS = [
  ["Try it", "Start a private browser conversation."],
  ["Ask normally", "Say what you need help with."],
  ["Hear the result", "Get a feel for how Wireline listens and responds."],
] as const;

export default function Showcase() {
  const primaryDemo = LANDING_PUBLIC_DEMO_AGENTS[0];

  useEffect(() => {
    captureDemoSourceFromLocation();
  }, []);

  return (
    <MarketingPageFrame mainClassName="!px-0 pb-0 pt-20 sm:pt-24">
      <PageMeta
        title="Try Wireline"
        description="Hear Wireline in your browser before you create your AI call assistant."
        path="/showcase"
      />

      <section className="mx-auto max-w-6xl px-5 pb-14 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:px-10">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6e6e73]">Try Wireline</p>
          <h1 className="mt-4 text-balance text-[clamp(3rem,8vw,5.8rem)] font-semibold leading-[0.94] tracking-[-0.065em] text-[#1d1d1f]">
            Hear a call assistant<br />
            <em className="font-normal">before you need one.</em>
          </h1>
          <p className="mt-7 max-w-2xl text-pretty text-[clamp(1.18rem,2.5vw,1.5rem)] font-medium leading-[1.42] tracking-[-0.02em] text-[#4f4f55]">
            Try a short conversation in your browser. No account required.
          </p>
        </div>

        <div className="mt-11 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
          <section className="rounded-[24px] border border-[#1d1d1f]/12 bg-white p-2 shadow-[0_18px_48px_rgba(29,29,31,0.08)]">
            <div className="flex min-h-[300px] flex-col justify-between rounded-[18px] border border-[#1d1d1f]/8 bg-[#fbfbf9] p-6 sm:p-8">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-[#1d1d1f]"><Volume2 className="h-4 w-4" />Live browser preview</div>
                <h2 className="mt-5 text-[clamp(1.9rem,4vw,2.8rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#1d1d1f]">Talk to an assistant.</h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-[#5e5e64]">Ask a simple question, describe a task, or just say hello. Your microphone only turns on after you choose to start.</p>
              </div>
              <div className="mt-10"><BrowserCallWidget agentName={primaryDemo.name} /></div>
            </div>
          </section>

          <aside className="rounded-[24px] border border-[#1d1d1f]/12 bg-[#1d1d1f] p-6 text-white sm:p-8">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">What to expect</p>
            <ol className="mt-6 space-y-5">
              {STEPS.map(([title, copy], index) => (
                <li className="flex gap-4" key={title}>
                  <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-white/12 text-xs font-semibold">{index + 1}</span>
                  <span><strong className="block text-sm font-semibold">{title}</strong><span className="mt-1 block text-sm leading-6 text-white/68">{copy}</span></span>
                </li>
              ))}
            </ol>
            <p className="mt-9 border-t border-white/12 pt-5 text-sm leading-6 text-white/64">A demo is just a preview. In Agent Studio, you decide the job, rules, and handoff limits.</p>
          </aside>
        </div>
      </section>

      <section className="border-y border-[#1d1d1f]/10 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6e6e73]">More examples</p>
              <h2 className="mt-4 text-balance text-[clamp(2.25rem,5vw,4rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-[#1d1d1f]">Call a demo line.</h2>
              <p className="mt-4 max-w-md text-base leading-7 text-[#5e5e64]">These are role-play examples. They never route you to a real business or person.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {LANDING_PUBLIC_DEMO_AGENTS.map((agent) => (
                <a key={agent.tel} href={`tel:${agent.tel}`} className="group rounded-2xl border border-[#1d1d1f]/12 bg-[#f7f7f5] p-5 transition hover:border-[#1d1d1f]/30 hover:bg-white">
                  <div className="flex items-start justify-between gap-4"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#1d1d1f] text-white"><Phone className="h-4 w-4" /></span><ArrowRight className="h-5 w-5 text-[#6e6e73] transition group-hover:translate-x-0.5 group-hover:text-[#1d1d1f]" /></div>
                  <h3 className="mt-7 text-lg font-semibold tracking-[-0.03em] text-[#1d1d1f]">{agent.name}</h3>
                  <p className="mt-1 text-sm text-[#5e5e64]">{agent.role}</p>
                  <p className="mt-4 font-mono text-sm font-semibold text-[#1d1d1f]">{agent.display}</p>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
        <div className="rounded-[28px] bg-[#f2f2ef] p-7 sm:p-10 lg:flex lg:items-center lg:justify-between lg:gap-10">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-sm font-medium text-[#4f4f55]"><Check className="h-4 w-4 text-[#1d1d1f]" />Your assistant starts as a private draft.</div>
            <h2 className="mt-4 text-balance text-[clamp(2.1rem,4vw,3.5rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#1d1d1f]">Ready to make the routine call disappear?</h2>
          </div>
          <Link to="/pricing" className="mt-7 inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-[#1d1d1f] px-7 text-base font-semibold text-white transition hover:bg-black active:scale-[0.985] lg:mt-0 lg:flex-none">Start at $7 <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
