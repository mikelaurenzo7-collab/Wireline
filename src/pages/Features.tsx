import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarClock,
  Check,
  Contact,
  MessageSquareText,
  PhoneCall,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  Workflow,
} from "lucide-react";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import MarketingFooter from "../components/marketing/MarketingFooter";
import { PageMeta } from "../lib/page-meta";

const CHANNEL_POINTS = [
  "Inbound calls, emails, and texts that follow the guidance you give in plain English.",
  "Answer routine questions, qualify a new lead, offer availability, and send the appropriate next message.",
  "A clear activity record and recap that tells your team what happened and what needs attention.",
] as const;

const BOUNDARIES = [
  ["What it can say", "You decide"],
  ["When it must ask you", "Clearly defined"],
  ["What it can access", "Approved only"],
] as const;

const USE_CASES = [
  [
    "Personal calls",
    "Call a pharmacy, service desk, school, reservation line, or anyone you do not have time to wait for.",
  ],
  [
    "Appointment coordination",
    "Offer times, book the right slot, send text confirmations and reminders, and bring your team in when a decision is needed.",
  ],
  [
    "Business front desk",
    "Answer common questions, capture the reason for a call or text, and route urgent conversations to your team.",
  ],
  [
    "SMS marketing + sales follow-up",
    "Reach opted-in contacts at the right moment, reply to new inquiries, keep sales conversations warm, and revive stalled opportunities.",
  ],
  [
    "Lead qualification",
    "Reply across call, email, or text, collect the details that matter, and book qualified opportunities for your team.",
  ],
  [
    "Custom workflows",
    "Build a custom voice agent around your knowledge, voice, tools, and approval process.",
  ],
] as const;

export default function Features() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageMeta
        title="AI Voice, Email & SMS Agent Features | Wireline"
        description="Personal assistants and business agents for calls, email, and SMS—qualify leads, schedule appointments, and follow up with the boundaries you define."
        path="/features"
      />
      <PrecisionPublicHeader />

      <main id="main-content" className="pt-16" tabIndex={-1}>
        <section className="border-b border-border bg-background px-5 py-12 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-[1040px]">
            <p className="wl-stitch-eyebrow">How it works</p>
            <h1 className="mt-4 max-w-[760px] text-[clamp(38px,5.4vw,60px)] font-semibold leading-[1.04] tracking-[-.05em] text-foreground">
              Give every conversation a clear next step.
            </h1>
            <p className="mt-6 max-w-[520px] text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground">
              Handles conversations inside your boundaries. Returns the outcome.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/signup"
                className="marketing-btn-primary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
              >
                Create your assistant
              </Link>
              <Link
                to="/showcase"
                className="marketing-btn-secondary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
              >
                <Play size={15} /> Hear a demo
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="grid gap-4 lg:grid-cols-2">
            <article className="wl-stitch-card p-6 sm:p-8">
              <MessageSquareText size={22} className="text-primary" />
              <h2 className="wl-section-title mt-5">Calls and texts that stay on task</h2>
              <p className="mt-3 max-w-md text-[var(--wireline-typography-body-size)] leading-6 text-muted-foreground">
                Handles the full conversation and drives the next step.
              </p>
              <ul className="mt-7 space-y-3">
                {CHANNEL_POINTS.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-3 text-[var(--wireline-typography-body-size)] leading-6 text-foreground"
                  >
                    <Check size={16} className="mt-1 shrink-0 text-primary" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7 flex items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-secondary px-4 py-3">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-xs text-muted-foreground">
                  New lead · qualified · appointment offered
                </span>
              </div>
            </article>

            <article className="wl-stitch-card p-6 sm:p-8">
              <ShieldCheck size={22} className="text-primary" />
              <h2 className="wl-section-title mt-5">You decide the boundaries</h2>
              <p className="mt-3 max-w-md text-[var(--wireline-typography-body-size)] leading-6 text-muted-foreground">
                Custom boundaries and escalation — exactly as you define.
              </p>
              <dl className="mt-7 divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border">
                {BOUNDARIES.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 px-4 py-3.5">
                    <dt className="text-[var(--wireline-typography-body-size)] text-foreground">
                      {label}
                    </dt>
                    <dd className="wl-overline text-primary">{value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          </div>
        </section>

        <section className="border-y border-border bg-card px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-[1040px]">
            <Workflow size={22} className="text-primary" />
            <h2 className="wl-stitch-display mt-5 max-w-2xl">
              Connect a tool only when it makes the outcome better.
            </h2>
            <p className="mt-3 max-w-2xl text-[var(--wireline-typography-body-size)] leading-6 text-muted-foreground">
              Wireline can work with your calendar, inbox, CRM, and business systems. You choose
              which accounts are connected and which actions an assistant is allowed to take.
            </p>

            <div className="mt-10 grid items-stretch gap-3 md:mt-12 md:grid-cols-[1fr_auto_1.2fr_auto_1fr]">
              <FlowNode
                icon={PhoneCall}
                label="Call, email, or text"
                sub="A lead, request, or task"
              />
              <FlowArrow />
              <div className="grid place-items-center rounded-[var(--radius-xl)] border border-primary bg-secondary p-6 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Workflow size={22} />
                </span>
                <span className="mt-4 text-[var(--wireline-typography-body-size)] font-semibold tracking-[-.01em] text-foreground">
                  Your assistant or agent
                </span>
                <span className="wl-overline mt-2">Handles · qualifies · books</span>
              </div>
              <FlowArrow />
              <div className="grid gap-3">
                <FlowNode
                  icon={CalendarClock}
                  label="Your calendar"
                  sub="Checks, books, and confirms"
                  compact
                />
                <FlowNode
                  icon={Contact}
                  label="Your systems"
                  sub="Only the accounts you approve"
                  compact
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:items-end">
            <div>
              <p className="wl-stitch-eyebrow">Useful on day one</p>
              <h2 className="wl-stitch-display mt-3 text-balance">
                Start with the job you do not want to carry yourself.
              </h2>
            </div>
            <p className="max-w-xl text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground">
              Each agent is built for its job — with the exact facts, tools, and boundaries it
              needs. It applies them consistently whether the customer calls, texts, or emails.
            </p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map(([title, copy]) => (
              <article key={title} className="wl-stitch-card p-5">
                <SlidersHorizontal size={17} className="text-primary" />
                <h3 className="wl-card-title mt-4">{title}</h3>
                <p className="mt-2 text-[var(--wireline-typography-body-size)] leading-6 text-muted-foreground">
                  {copy}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-border px-5 py-12 text-center sm:px-6 sm:py-16">
          <p className="wl-stitch-eyebrow">Build specialized agents</p>
          <h2 className="mx-auto mt-3 max-w-2xl text-[clamp(28px,4vw,42px)] font-semibold leading-[1.08] tracking-[-.04em] text-foreground">
            Custom voice agents with your knowledge and voice. Works the same across channels.
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/signup"
              className="marketing-btn-primary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
            >
              Create your assistant
            </Link>
            <Link
              to="/pricing"
              className="marketing-btn-secondary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
            >
              See plans <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
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
      className={`flex items-center gap-3 rounded-[var(--radius-xl)] border border-border bg-secondary ${compact ? "px-4 py-3.5" : "flex-col justify-center px-6 py-6 text-center"}`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-card text-primary">
        <Icon size={18} />
      </span>
      <div className={compact ? "" : "mt-1"}>
        <span className="block text-[var(--wireline-typography-body-size)] font-semibold tracking-[-.01em] text-foreground">
          {label}
        </span>
        <span className="mt-0.5 block text-[var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">
          {sub}
        </span>
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
