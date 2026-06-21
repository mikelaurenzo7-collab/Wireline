import { Link } from "react-router-dom";
import { ArrowRight, Check, Clock3, MessageSquare, PhoneCall, ShieldCheck } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";

const DIFFERENCES = [
  { icon: PhoneCall, title: "It makes the call.", copy: "Not another reminder or a directory of numbers. Wireline handles the phone conversation you would otherwise need to make yourself." },
  { icon: MessageSquare, title: "You explain it normally.", copy: "Tell your assistant what you need in plain language. Add the rules that matter. Keep the setup simple." },
  { icon: Clock3, title: "You get the answer back.", copy: "Wireline waits through the hold music and returns the useful result, so you can stay focused on your day." },
] as const;

const TABLE_ROWS = [
  ["You have to call during business hours", "Wireline can handle the routine call for you"],
  ["You wait on hold", "Wireline waits and reports back"],
  ["You repeat the same details", "Your assistant keeps the instructions you give it"],
  ["You receive another task", "You get a clear next step"],
] as const;

export default function Compare() {
  return (
    <MarketingPageFrame mainClassName="!px-0 pb-0 pt-20 sm:pt-24">
      <PageMeta title="Why Wireline" description="Wireline is a personal AI call assistant that makes routine phone calls, waits on hold, and brings back a clear answer." path="/compare" />

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:px-10">
        <div className="max-w-3xl">
          <p className="wl-stitch-eyebrow">Why Wireline</p>
          <h1 className="wl-stitch-marketing-hero mt-4 text-balance">Less phone tag. More of your day.</h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">Wireline is built for everyday calls that should not take over your afternoon.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/pricing" className="marketing-btn-primary min-h-12 px-6 text-[15px] font-semibold">Start at $9 <ArrowRight className="h-4 w-4" /></Link>
            <Link to="/showcase" className="marketing-btn-secondary min-h-12 px-6 text-[15px] font-semibold">Hear an assistant</Link>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card px-5 py-5 sm:px-8 sm:py-7">
        <div className="mx-auto grid max-w-6xl gap-px overflow-hidden border border-border bg-border md:grid-cols-3">
          {DIFFERENCES.map(({ icon: Icon, title, copy }) => (
            <article className="bg-card px-5 py-8 sm:px-7 sm:py-10" key={title}>
              <span className="grid h-9 w-9 place-items-center rounded bg-muted text-primary"><Icon className="h-4 w-4" /></span>
              <h2 className="mt-6 text-lg font-semibold tracking-[-.025em] text-foreground">{title}</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,.82fr)_minmax(0,1.18fr)] lg:items-start">
          <div>
            <p className="wl-stitch-eyebrow">A simpler default</p>
            <h2 className="wl-stitch-display mt-3 text-balance">The routine call should not become a project.</h2>
          </div>
          <div className="overflow-hidden border border-border bg-card">
            {TABLE_ROWS.map(([before, after], index) => (
              <div className={`grid gap-5 p-5 sm:grid-cols-2 sm:p-6 ${index ? "border-t border-border" : ""}`} key={before}>
                <p className="text-sm leading-6 text-muted-foreground">{before}</p>
                <p className="flex gap-2 text-sm font-medium leading-6 text-foreground"><Check className="mt-1 h-4 w-4 flex-none text-primary" />{after}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-card px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-9 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" />You set the boundaries.</p>
            <h2 className="wl-stitch-display mt-4 max-w-2xl text-balance">You are still in control of every assistant.</h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">Teach your assistant what it can do, what it cannot do, and when it should hand the conversation back to you.</p>
          </div>
          <Link to="/signup?mode=personal" className="marketing-btn-primary min-h-12 px-6 text-[15px] font-semibold">Create your assistant <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
