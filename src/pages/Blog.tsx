import { Check, MessageSquare, PhoneCall, ShieldCheck } from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";

const NOTES = [
  {
    icon: PhoneCall,
    title: "Start with one repeatable call.",
    copy: "The best first job is clear and common: check a refill, confirm an appointment, ask about an order, or get through a support queue.",
  },
  {
    icon: MessageSquare,
    title: "Write down the boundaries.",
    copy: "Tell your assistant what it can say, what it should not do, and when it should stop and ask you to take over.",
  },
  {
    icon: Check,
    title: "Ask for the useful result.",
    copy: "A good handoff ends with a plain answer and the next step, not a long transcript you have to decode.",
  },
] as const;

export default function Blog() {
  return (
    <MarketingPageFrame mainClassName="!px-0 pb-0 pt-20 sm:pt-24">
      <PageMeta
        title="Wireline Notes"
        description="Practical notes for handing routine phone work to an AI call assistant."
        path="/blog"
      />

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20 lg:px-10">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6e6e73]">Wireline Notes</p>
          <h1 className="mt-4 text-balance text-[clamp(3rem,8vw,5.8rem)] font-semibold leading-[0.94] tracking-[-0.065em] text-[#1d1d1f]">
            Practical notes for<br />
            <em className="font-normal">getting time back.</em>
          </h1>
          <p className="mt-7 max-w-2xl text-pretty text-[clamp(1.18rem,2.5vw,1.5rem)] font-medium leading-[1.42] tracking-[-0.02em] text-[#4f4f55]">
            Wireline is keeping this library small until each guide earns its place. Start with the basics that make an assistant useful from day one.
          </p>
        </div>
      </section>

      <section className="border-y border-[#1d1d1f]/10 bg-white">
        <div className="mx-auto grid max-w-6xl gap-px bg-[#1d1d1f]/10 md:grid-cols-3">
          {NOTES.map(({ icon: Icon, title, copy }) => (
            <article className="bg-white px-5 py-9 sm:px-7 sm:py-11" key={title}>
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#f2f2ef] text-[#1d1d1f]"><Icon className="h-5 w-5" /></span>
              <h2 className="mt-7 text-[1.4rem] font-semibold leading-tight tracking-[-0.035em] text-[#1d1d1f]">{title}</h2>
              <p className="mt-3 max-w-sm text-sm leading-6 text-[#5e5e64]">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24 lg:px-10">
        <div className="rounded-[28px] bg-[#f2f2ef] p-7 sm:p-10">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-sm font-medium text-[#4f4f55]"><ShieldCheck className="h-4 w-4 text-[#1d1d1f]" />A private draft is a good place to begin.</div>
            <h2 className="mt-4 text-balance text-[clamp(2.1rem,4vw,3.5rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#1d1d1f]">Teach an assistant the call you keep putting off.</h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-[#5e5e64]">You can name it, describe the task in plain language, and refine the rules as you go.</p>
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
