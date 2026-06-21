import { Link } from "react-router-dom";
import { ArrowRight, Check, Clock3, MessageSquare, PhoneCall, ShieldCheck, Sparkles } from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";

const STEPS = [
  { number: "01", icon: MessageSquare, title: "Say what you need.", copy: "“Call my pharmacy and ask whether my refill is ready.” Start with a plain-English request." },
  { number: "02", icon: PhoneCall, title: "Wireline handles the call.", copy: "It calls the line, waits on hold, follows the rules you set, and knows when to send something back to you." },
  { number: "03", icon: Check, title: "You get the useful part.", copy: "A clear result and next step—not a recording you need to listen through or a queue you need to rejoin." },
] as const;

const USE_CASES = [
  ["Pharmacy", "Check a refill, hours, or pickup status."],
  ["Doctor", "Confirm an appointment or ask a simple office question."],
  ["School", "Reach the office without spending your morning on hold."],
  ["Travel", "Call an airline, hotel, or rental desk and get an answer back."],
  ["Restaurant", "Ask about a reservation, hours, or a simple request."],
  ["Support", "Get through the first layer of a customer-service call."],
] as const;

export default function Features() {
  return (
    <MarketingPageFrame mainClassName="!px-0 pb-0 pt-20 sm:pt-24">
      <PageMeta title="How Wireline Works" description="Wireline calls everyday phone lines, waits on hold, and brings back a clear answer." path="/features" />

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:px-10">
        <div className="max-w-3xl">
          <p className="wl-stitch-eyebrow">Everyday call help</p>
          <h1 className="wl-stitch-marketing-hero mt-4 text-balance">The call is handled. Your day is not.</h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">
            Wireline makes the routine call, waits through the hold music, and texts you the answer. No complicated workflow to build before it becomes useful.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/pricing" className="marketing-btn-primary min-h-12 px-6 text-[15px] font-semibold">Start at $9 <ArrowRight className="h-4 w-4" /></Link>
            <Link to="/showcase" className="marketing-btn-secondary min-h-12 px-6 text-[15px] font-semibold">Hear an assistant</Link>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card px-5 py-5 sm:px-8 sm:py-7">
        <div className="mx-auto grid max-w-6xl gap-px overflow-hidden border border-border bg-border sm:grid-cols-3">
          {STEPS.map(({ number, icon: Icon, title, copy }) => (
            <article key={number} className="bg-card px-5 py-7 sm:px-7 sm:py-9">
              <div className="flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded bg-muted text-primary"><Icon className="h-4 w-4" /></span>
                <span className="font-mono text-[11px] text-muted-foreground">{number}</span>
              </div>
              <h2 className="mt-6 text-lg font-semibold tracking-[-.025em] text-foreground">{title}</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,.75fr)_minmax(0,1.25fr)] lg:items-end">
          <div>
            <p className="wl-stitch-eyebrow">The calls worth skipping</p>
            <h2 className="wl-stitch-display mt-3 text-balance">Use it for the calls that interrupt everything else.</h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-muted-foreground">You stay in control. Teach an assistant what it can say, what it should never do, and when it should send the conversation back to you.</p>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.map(([title, copy]) => (
            <article key={title} className="wl-stitch-card p-5">
              <h3 className="text-base font-semibold tracking-[-.02em] text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-card px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-9 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" />You decide the boundaries.</p>
            <h2 className="wl-stitch-display mt-4 max-w-2xl text-balance">A personal assistant, not a black box.</h2>
            <div className="mt-5 flex flex-col gap-3 text-sm leading-6 text-muted-foreground sm:flex-row sm:gap-7">
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-primary" />Set clear call rules</span>
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-primary" />Review the result</span>
              <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" />Save the time for something else</span>
            </div>
          </div>
          <Link to="/for/personal" className="marketing-btn-primary min-h-12 px-6 text-[15px] font-semibold">See personal use cases <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
