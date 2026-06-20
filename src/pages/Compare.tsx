import { Link } from "react-router-dom";
import { ArrowRight, Check, Clock3, MessageSquare, PhoneCall, ShieldCheck } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";

const DIFFERENCES = [
  {
    icon: PhoneCall,
    title: "It makes the call.",
    copy: "Not another reminder. Not a directory of numbers. Wireline handles the phone conversation you would otherwise need to make yourself.",
  },
  {
    icon: MessageSquare,
    title: "You explain it normally.",
    copy: "Tell your agent what you need in plain language. Add the rules that matter. Skip the complicated workflow builder.",
  },
  {
    icon: Clock3,
    title: "You get the answer back.",
    copy: "Wireline waits through the hold music and brings back the useful result, so you can stay focused on your day.",
  },
] as const;

const TABLE_ROWS = [
  ["You have to call during business hours", "Wireline can handle the routine call for you"],
  ["You wait on hold", "Wireline waits and reports back"],
  ["You repeat the same details", "Your agent keeps the instructions you give it"],
  ["You receive another task", "You get a clear next step"],
] as const;

export default function Compare() {
  return (
    <MarketingPageFrame mainClassName="!px-0 pb-0 pt-20 sm:pt-24">
      <PageMeta
        title="Why Wireline"
        description="Wireline is a personal AI call assistant that makes routine phone calls, waits on hold, and brings back a clear answer."
        path="/compare"
      />

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20 lg:px-10">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6e6e73]">Why Wireline</p>
          <h1 className="mt-4 text-balance text-[clamp(3rem,8vw,5.8rem)] font-semibold leading-[0.94] tracking-[-0.065em] text-[#1d1d1f]">
            Less phone tag.<br />
            <em className="font-normal">More of your day.</em>
          </h1>
          <p className="mt-7 max-w-2xl text-pretty text-[clamp(1.18rem,2.5vw,1.5rem)] font-medium leading-[1.42] tracking-[-0.02em] text-[#4f4f55]">
            Wireline is built for everyday calls that should not take over your afternoon.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link to="/pricing" className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-[#1d1d1f] px-7 text-base font-semibold text-white transition hover:bg-black active:scale-[0.985]">
              Start at $7 <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/showcase" className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full border border-[#1d1d1f]/16 bg-white px-7 text-base font-semibold text-[#1d1d1f] transition hover:bg-[#f2f2ef] active:scale-[0.985]">
              Hear an assistant
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y border-[#1d1d1f]/10 bg-white">
        <div className="mx-auto grid max-w-6xl gap-px bg-[#1d1d1f]/10 md:grid-cols-3">
          {DIFFERENCES.map(({ icon: Icon, title, copy }) => (
            <article className="bg-white px-5 py-9 sm:px-7 sm:py-11" key={title}>
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#f2f2ef] text-[#1d1d1f]"><Icon className="h-5 w-5" /></span>
              <h2 className="mt-7 text-[1.4rem] font-semibold leading-tight tracking-[-0.035em] text-[#1d1d1f]">{title}</h2>
              <p className="mt-3 max-w-sm text-sm leading-6 text-[#5e5e64]">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6e6e73]">A simpler default</p>
            <h2 className="mt-4 text-balance text-[clamp(2.25rem,5vw,4rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-[#1d1d1f]">
              The routine call should not become a project.
            </h2>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[#1d1d1f]/12 bg-white">
            {TABLE_ROWS.map(([before, after], index) => (
              <div className={`grid gap-5 p-5 sm:grid-cols-2 sm:p-6 ${index ? "border-t border-[#1d1d1f]/10" : ""}`} key={before}>
                <p className="text-sm leading-6 text-[#6e6e73]">{before}</p>
                <p className="flex gap-2 text-sm font-medium leading-6 text-[#1d1d1f]"><Check className="mt-1 h-4 w-4 flex-none" />{after}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#1d1d1f]/10 bg-[#1d1d1f] px-5 py-16 text-white sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-9 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-sm font-medium text-white/72"><ShieldCheck className="h-4 w-4" />You set the boundaries.</div>
            <h2 className="mt-4 max-w-2xl text-balance text-[clamp(2.2rem,5vw,4rem)] font-semibold leading-[0.98] tracking-[-0.055em]">You are still in control of every assistant.</h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/70">Teach your agent what it can do, what it cannot do, and when it should hand the conversation back to you.</p>
          </div>
          <Link to="/agents" className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-white px-7 text-base font-semibold text-[#1d1d1f] transition hover:bg-[#f2f2ef] active:scale-[0.985]">
            Open Agent Studio <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
