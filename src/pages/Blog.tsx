import { Check, MessageSquare, PhoneCall, ShieldCheck } from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";

const NOTES = [
  { icon: PhoneCall, title: "Start with one repeatable call.", copy: "The best first job is clear and common: check a refill, confirm an appointment, ask about an order, or get through a support queue." },
  { icon: MessageSquare, title: "Write down the boundaries.", copy: "Tell your assistant what it can say, what it should not do, and when it should stop and ask you to take over." },
  { icon: Check, title: "Ask for the useful result.", copy: "A good handoff ends with a plain answer and the next step, not a long transcript you have to decode." },
] as const;

export default function Blog() {
  return (
    <MarketingPageFrame mainClassName="!px-0 pb-0 pt-20 sm:pt-24">
      <PageMeta title="Wireline Notes" description="Practical notes for handing routine phone work to an AI call assistant." path="/blog" />

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:px-10">
        <div className="max-w-3xl">
          <p className="wl-stitch-eyebrow">Wireline Notes</p>
          <h1 className="wl-stitch-marketing-hero mt-4 text-balance">Practical notes for getting time back.</h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">Wireline is keeping this library small until each guide earns its place. Start with the basics that make an assistant useful from day one.</p>
        </div>
      </section>

      <section className="border-y border-border bg-card px-5 py-5 sm:px-8 sm:py-7">
        <div className="mx-auto grid max-w-6xl gap-px overflow-hidden border border-border bg-border md:grid-cols-3">
          {NOTES.map(({ icon: Icon, title, copy }) => (
            <article className="bg-card px-5 py-8 sm:px-7 sm:py-10" key={title}>
              <span className="grid h-9 w-9 place-items-center rounded bg-muted text-primary"><Icon className="h-4 w-4" /></span>
              <h2 className="mt-6 text-lg font-semibold tracking-[-.025em] text-foreground">{title}</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
        <div className="wl-stitch-card border-primary bg-primary p-7 text-primary-foreground sm:p-10">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-sm font-medium text-primary-foreground/75"><ShieldCheck className="h-4 w-4" />A private draft is a good place to begin.</div>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-[-.045em] sm:text-4xl">Teach an assistant the call you keep putting off.</h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-primary-foreground/75">Name it, describe the task in plain language, and refine the rules as you go.</p>
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
