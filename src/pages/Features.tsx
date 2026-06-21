import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarClock,
  Check,
  Contact,
  Mic,
  PhoneCall,
  Play,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import { PageMeta } from "../lib/page-meta";

const VOICE_POINTS = [
  "Natural phone voice that adapts as the call goes.",
  "Waits on hold and works through phone menus for you.",
  "Knows when to step back and hand the call to you.",
] as const;

const BOUNDARIES = [
  ["Call rules you set", "Enforced"],
  ["Anything sensitive", "You approve"],
  ["Your personal details", "Stay private"],
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
    <div className="min-h-screen bg-background text-foreground">
      <PageMeta
        title="How Wireline Works"
        description="Wireline calls everyday phone lines, waits on hold, and brings back a clear answer."
        path="/features"
      />
      <PrecisionPublicHeader />

      <main id="main-content" className="pt-16">
        {/* Hero */}
        <section className="border-b border-border bg-[radial-gradient(circle_at_1px_1px,rgba(26,60,52,.08)_1px,transparent_0)] bg-[size:16px_16px] px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-[1040px]">
            <p className="wl-stitch-eyebrow">How it works</p>
            <h1 className="mt-4 max-w-[760px] text-balance text-[clamp(38px,5.4vw,60px)] font-semibold leading-[1.05] tracking-[-.04em] text-foreground">
              The call is handled. Your day is not.
            </h1>
            <p className="mt-6 max-w-[620px] text-[17px] leading-7 text-muted-foreground">
              Wireline makes the routine call, waits through the hold music, and brings back a clear
              answer. No complicated workflow to build before it becomes useful.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/signup?mode=personal"
                className="marketing-btn-primary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
              >
                Start free
              </Link>
              <Link
                to="/showcase"
                className="marketing-btn-secondary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
              >
                <Play size={14} /> Hear an assistant
              </Link>
            </div>
          </div>
        </section>

        {/* Two-up: natural voice + boundaries */}
        <section className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-4 lg:grid-cols-2">
            <article className="wl-stitch-card p-7 sm:p-8">
              <Mic size={22} className="text-primary" />
              <h2 className="mt-5 text-[24px] font-semibold tracking-[-.02em]">
                Calls that sound human
              </h2>
              <p className="mt-3 max-w-md text-[15px] leading-6 text-muted-foreground">
                Wireline speaks naturally and keeps the conversation moving, even through long menus
                and hold music, so the person on the other end never feels like they are talking to
                a robot.
              </p>
              <ul className="mt-7 space-y-3">
                {VOICE_POINTS.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-3 text-[14px] leading-6 text-foreground"
                  >
                    <Check size={16} className="mt-1 shrink-0 text-primary" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7 flex items-center gap-2 border border-border bg-[color:var(--wl-surface-subtle)] px-4 py-3">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[color:var(--wl-status-active)]" />
                <span className="font-mono text-[12px] text-muted-foreground">
                  On the call · waiting on hold
                </span>
              </div>
            </article>

            <article className="wl-stitch-card p-7 sm:p-8">
              <ShieldCheck size={22} className="text-primary" />
              <h2 className="mt-5 text-[24px] font-semibold tracking-[-.02em]">
                You decide the boundaries
              </h2>
              <p className="mt-3 max-w-md text-[15px] leading-6 text-muted-foreground">
                You stay in control. Teach an assistant what it can say, what it should never do,
                and when it should send the conversation back to you.
              </p>
              <dl className="mt-7 divide-y divide-border border border-border">
                {BOUNDARIES.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-4 py-3.5">
                    <dt className="text-[14px] text-foreground">{label}</dt>
                    <dd className="font-mono text-[11px] uppercase tracking-[.06em] text-primary">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          </div>
        </section>

        {/* Actions & integrations diagram */}
        <section className="border-y border-border bg-card px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1040px]">
            <Workflow size={22} className="text-primary" />
            <h2 className="mt-5 max-w-2xl text-[28px] font-semibold tracking-[-.02em] sm:text-[32px]">
              It plugs into the tools you already use.
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-6 text-muted-foreground">
              Wireline doesn&apos;t just talk — it gets things done. It places real phone calls and
              connects to your calendar, contacts, and inbox to finish the task and report back.
            </p>

            <div className="mt-12 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1.2fr_auto_1fr]">
              <FlowNode icon={PhoneCall} label="Real phone call" sub="Places the call for you" />
              <FlowArrow />
              <div className="grid place-items-center border border-primary bg-[color:var(--wl-surface-subtle)] p-6 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-[color:var(--wl-accent-foreground)]">
                  <Workflow size={22} />
                </span>
                <span className="mt-4 text-[15px] font-semibold tracking-[-.01em]">
                  Wireline assistant
                </span>
                <span className="mt-1 font-mono text-[11px] uppercase tracking-[.06em] text-muted-foreground">
                  Listens · decides · acts
                </span>
              </div>
              <FlowArrow />
              <div className="grid gap-3">
                <FlowNode
                  icon={CalendarClock}
                  label="Your calendar"
                  sub="Books and confirms"
                  compact
                />
                <FlowNode icon={Contact} label="Your contacts" sub="Keeps details handy" compact />
              </div>
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:items-end">
            <div>
              <p className="wl-stitch-eyebrow">The calls worth skipping</p>
              <h2 className="mt-3 text-balance text-[28px] font-semibold tracking-[-.02em] sm:text-[32px]">
                Use it for the calls that interrupt everything else.
              </h2>
            </div>
            <p className="max-w-xl text-[15px] leading-7 text-muted-foreground">
              You stay in control. Teach an assistant what it can say, what it should never do, and
              when it should send the conversation back to you.
            </p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map(([title, copy]) => (
              <article key={title} className="wl-stitch-card p-5">
                <h3 className="text-[15px] font-semibold tracking-[-.01em] text-foreground">
                  {title}
                </h3>
                <p className="mt-2 text-[14px] leading-6 text-muted-foreground">{copy}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-border px-4 py-20 text-center sm:px-6">
          <h2 className="mx-auto max-w-2xl text-[28px] font-semibold leading-tight tracking-[-.02em] sm:text-[32px]">
            A personal assistant, not a black box.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-7 text-muted-foreground">
            Set the rules, review the result, and save the time for something else.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/signup?mode=personal"
              className="marketing-btn-primary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
            >
              Start free
            </Link>
            <Link
              to="/for/personal"
              className="marketing-btn-secondary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
            >
              See personal use cases <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-8 text-[13px] text-muted-foreground sm:px-6">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span>
            <strong className="text-foreground">Wireline</strong> · AI voice + messaging
          </span>
          <div className="flex gap-5">
            <Link to="/pricing">Pricing</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/support">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FlowNode({
  icon: Icon,
  label,
  sub,
  compact = false,
}: {
  icon: typeof PhoneCall;
  label: string;
  sub: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 border border-border bg-[color:var(--wl-surface-subtle)] ${
        compact ? "px-4 py-3.5" : "flex-col justify-center px-6 py-6 text-center"
      }`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-card text-primary">
        <Icon size={18} />
      </span>
      <div className={compact ? "" : "mt-1"}>
        <span className="block text-[14px] font-semibold tracking-[-.01em]">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-5 text-muted-foreground">{sub}</span>
      </div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="grid place-items-center text-muted-foreground">
      <ArrowRight size={18} className="hidden md:block" />
      <span className="block h-5 w-px bg-border md:hidden" />
    </div>
  );
}
