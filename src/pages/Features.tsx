import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarClock,
  Check,
  Contact,
  Headphones,
  MessageSquareText,
  PhoneCall,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  Workflow,
} from "lucide-react";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import { PageMeta } from "../lib/page-meta";
import { PRODUCT_VERSATILITY } from "../lib/product-copy";

const VOICE_POINTS = [
  "Calls and messages that follow the guidance you give in plain English.",
  "A natural conversation that can wait on hold, answer routine questions, or collect details.",
  "A short recap that tells you what happened and what needs your attention.",
] as const;

const BOUNDARIES = [
  ["What it can say", "You decide"],
  ["When it must ask you", "Clearly defined"],
  ["What it can access", "Approved only"],
] as const;

const USE_CASES = [
  ["Personal calls", "Call a pharmacy, service desk, school, reservation line, or anyone you do not have time to wait for."],
  ["Appointment coordination", "Confirm details, find a time, manage follow-ups, and bring you back in when a decision is needed."],
  ["Business front desk", "Answer common questions, capture the reason for a call, and route urgent conversations to your team."],
  ["Customer follow-up", "Reach out by phone or message, keep the conversation moving, and save a clear recap."],
  ["Lead qualification", "Collect the details that matter before a representative spends time on the next step."],
  ["Custom workflows", "Build a focused assistant around your knowledge, rules, connected accounts, and approval process."],
] as const;

export default function Features() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageMeta
        title="AI Call & Message Assistant Features | Wireline"
        description="Personal assistants and business agents that handle calls, messages, and follow-ups with the boundaries you define."
        path="/features"
      />
      <PrecisionPublicHeader />

      <main id="main-content" className="pt-16">
        <section className="border-b border-border bg-background px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-[1040px]">
            <p className="wl-stitch-eyebrow">{PRODUCT_VERSATILITY.eyebrow}</p>
            <h1 className="mt-4 max-w-[800px] text-balance text-[clamp(38px,5.4vw,60px)] font-semibold leading-[1.04] tracking-[-.045em] text-foreground">
              Personal assistants and business agents for every conversation you should not chase.
            </h1>
            <p className="mt-6 max-w-[650px] text-[17px] leading-7 text-muted-foreground">
              {PRODUCT_VERSATILITY.tagline} Start with a personal assistant for everyday calls. Add business
              agents when work needs a professional line, policies, and connected accounts.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/signup" className="marketing-btn-primary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]">
                Create your assistant
              </Link>
              <Link to="/showcase" className="marketing-btn-secondary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]">
                <Play size={14} /> Hear a demo
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-4 lg:grid-cols-2">
            <article className="wl-stitch-card p-7 sm:p-8">
              <Headphones size={22} className="text-primary" />
              <h2 className="mt-5 text-[24px] font-semibold tracking-[-.02em] text-foreground">
                Conversations that stay on task
              </h2>
              <p className="mt-3 max-w-md text-[15px] leading-6 text-muted-foreground">
                Wireline handles the actual call or message, not just a summary. It can ask the questions,
                wait on hold, confirm details, and return with a useful outcome.
              </p>
              <ul className="mt-7 space-y-3">
                {VOICE_POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-[14px] leading-6 text-foreground">
                    <Check size={16} className="mt-1 shrink-0 text-primary" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7 flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-3">
                <span className="h-2 w-2 rounded-full bg-[color:var(--wl-status-active)]" />
                <span className="font-mono text-[11px] text-muted-foreground">Call in progress · waiting on hold</span>
              </div>
            </article>

            <article className="wl-stitch-card p-7 sm:p-8">
              <ShieldCheck size={22} className="text-primary" />
              <h2 className="mt-5 text-[24px] font-semibold tracking-[-.02em] text-foreground">
                You decide the boundaries
              </h2>
              <p className="mt-3 max-w-md text-[15px] leading-6 text-muted-foreground">
                Give an assistant clear rules before it does anything: what it can promise, what it should
                collect, and exactly when it should stop and bring you into the conversation.
              </p>
              <dl className="mt-7 divide-y divide-border overflow-hidden rounded-lg border border-border">
                {BOUNDARIES.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 px-4 py-3.5">
                    <dt className="text-[14px] text-foreground">{label}</dt>
                    <dd className="font-mono text-[10px] uppercase tracking-[.06em] text-primary">{value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          </div>
        </section>

        <section className="border-y border-border bg-card px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1040px]">
            <Workflow size={22} className="text-primary" />
            <h2 className="mt-5 max-w-2xl text-[30px] font-semibold tracking-[-.03em] text-foreground sm:text-[36px]">
              Connect a tool only when it makes the outcome better.
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-6 text-muted-foreground">
              Wireline can work with your calendar, inbox, CRM, and business systems. You choose which
              accounts are connected and which actions an assistant is allowed to take.
            </p>

            <div className="mt-12 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1.2fr_auto_1fr]">
              <FlowNode icon={PhoneCall} label="Call or message" sub="A task you hand off" />
              <FlowArrow />
              <div className="grid place-items-center rounded-lg border border-primary bg-secondary p-6 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Workflow size={22} />
                </span>
                <span className="mt-4 text-[15px] font-semibold tracking-[-.01em] text-foreground">Your assistant or agent</span>
                <span className="mt-1 font-mono text-[11px] uppercase tracking-[.06em] text-muted-foreground">Handles · checks · recaps</span>
              </div>
              <FlowArrow />
              <div className="grid gap-3">
                <FlowNode icon={CalendarClock} label="Your calendar" sub="Checks and confirms" compact />
                <FlowNode icon={Contact} label="Your systems" sub="Only the accounts you approve" compact />
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:items-end">
            <div>
              <p className="wl-stitch-eyebrow">Useful on day one</p>
              <h2 className="mt-3 text-balance text-[30px] font-semibold tracking-[-.03em] text-foreground sm:text-[36px]">
                Start with the job you do not want to carry yourself.
              </h2>
            </div>
            <p className="max-w-xl text-[15px] leading-7 text-muted-foreground">
              A personal assistant for pharmacy calls, a business agent for inbound support, and a lead
              follow-up agent all start the same way: a clear job, useful facts, and boundaries you trust.
            </p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map(([title, copy]) => (
              <article key={title} className="wl-stitch-card p-5">
                <SlidersHorizontal size={17} className="text-primary" />
                <h3 className="mt-4 text-[16px] font-semibold tracking-[-.01em] text-foreground">{title}</h3>
                <p className="mt-2 text-[14px] leading-6 text-muted-foreground">{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-border px-4 py-16 text-center sm:px-6">
          <h2 className="mx-auto max-w-2xl text-[30px] font-semibold leading-tight tracking-[-.03em] text-foreground sm:text-[36px]">
            Build personal assistants and business agents in one workspace, then let them handle the next useful thing.
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/signup" className="marketing-btn-primary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]">
              Create your assistant
            </Link>
            <Link to="/pricing" className="marketing-btn-secondary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]">
              See plans <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-8 text-[13px] text-muted-foreground sm:px-6">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span><strong className="text-foreground">Wireline</strong> · personal assistants · business agents</span>
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
    <div className={`flex items-center gap-3 rounded-lg border border-border bg-secondary ${compact ? "px-4 py-3.5" : "flex-col justify-center px-6 py-6 text-center"}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-card text-primary"><Icon size={18} /></span>
      <div className={compact ? "" : "mt-1"}>
        <span className="block text-[14px] font-semibold tracking-[-.01em] text-foreground">{label}</span>
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
