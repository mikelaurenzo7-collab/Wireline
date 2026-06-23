import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  Headphones,
  MessageSquareText,
  PhoneCall,
  Play,
  SlidersHorizontal,
} from "lucide-react";
import { Link } from "react-router-dom";
import PrecisionPublicHeader from "./PrecisionPublicHeader";

function ProductFrame() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-primary">
          <PhoneCall size={16} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">Personal call assistant</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">A useful task in progress</p>
        </div>
        <span className="ml-auto shrink-0 rounded-full border border-border bg-secondary px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[.06em] text-primary">
          Calling now
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="rounded-lg border border-border bg-secondary p-5">
          <p className="wl-stitch-label">Your request</p>
          <h2 className="mt-2 text-[20px] font-semibold tracking-[-.03em] text-foreground">
            Call my pharmacy, wait on hold, and text me when my prescription is ready.
          </h2>
          <p className="mt-3 max-w-xl text-[14px] leading-6 text-muted-foreground">
            Wireline handles the conversation, follows your instructions, and brings back the exact
            answer instead of asking you to stay by the phone.
          </p>

          <div className="mt-5 space-y-3 border-t border-border pt-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-card text-primary ring-1 ring-border">
                <Clock3 size={13} />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-foreground">Waits through the hold time</p>
                <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
                  It stays on the line so you do not have to.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-card text-primary ring-1 ring-border">
                <MessageSquareText size={13} />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-foreground">Sends back the result</p>
                <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
                  You get a concise text with the answer and anything that needs you.
                </p>
              </div>
            </div>
          </div>
        </div>

        <aside className="rounded-lg border border-border bg-card p-5">
          <p className="wl-stitch-label">Outcome</p>
          <div className="mt-4 grid h-12 w-12 place-items-center rounded-full bg-accent text-primary">
            <MessageSquareText size={22} />
          </div>
          <p className="mt-4 text-[14px] font-semibold text-foreground">A text is ready for you</p>
          <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
            Prescription available after 4:30 PM. Bring photo ID.
          </p>
          <div className="mt-5 rounded-sm border border-border bg-secondary px-3 py-2.5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
              Saved to recap
            </p>
            <p className="mt-1 text-[12px] leading-5 text-foreground">
              Call summary and next step are available when you need them.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function RuleExample() {
  return (
    <div className="mt-6 space-y-2 rounded-lg border border-border bg-secondary p-4">
      <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-card px-3 py-2.5">
        <span className="text-[12px] text-muted-foreground">What it can say</span>
        <span className="text-[12px] font-semibold text-foreground">Use my preferred name</span>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-card px-3 py-2.5">
        <span className="text-[12px] text-muted-foreground">When to hand off</span>
        <span className="text-[12px] font-semibold text-foreground">Anything sensitive or unclear</span>
      </div>
    </div>
  );
}

function ResultExample() {
  return (
    <div className="mt-6 rounded-lg border border-border bg-secondary p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-primary">
          <Headphones size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">Follow-up completed</p>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            The customer confirmed a Tuesday appointment. A short recap is ready for review.
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-[11px] font-medium text-primary">
        <CheckCircle2 size={14} />
        You remain in control
      </div>
    </div>
  );
}

export default function PrecisionLanding() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PrecisionPublicHeader />
      <main id="main-content" className="pt-16">
        <section className="border-b border-border bg-background px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-[1120px] text-center">
            <p className="wl-stitch-label">Wireline</p>
            <h1 className="mx-auto mt-4 max-w-[860px] text-balance text-[clamp(42px,6vw,68px)] font-semibold leading-[1.04] tracking-[-.05em] text-foreground">
              Give Wireline a task. It handles the conversation and tells you what happened.
            </h1>
            <p className="mx-auto mt-6 max-w-[650px] text-[17px] leading-7 text-muted-foreground">
              Make calls, manage messages, follow up, and keep the details straight. Start with one
              useful job for your day, then expand into a front desk or business workflow when you need it.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/signup"
                className="marketing-btn-primary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
              >
                Create your assistant
              </Link>
              <Link
                to="/showcase"
                className="marketing-btn-secondary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
              >
                <Play size={14} /> Hear a demo
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-primary" /> You choose the boundaries
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-primary" /> You approve connected actions
              </span>
            </div>
            <div className="mx-auto mt-14 max-w-[920px] text-left">
              <ProductFrame />
            </div>
          </div>
        </section>

        <section className="border-b border-border px-4 py-9 text-center sm:px-6">
          <p className="wl-stitch-label">Built around useful outcomes</p>
          <div className="mt-5 flex flex-wrap justify-center gap-x-10 gap-y-3 text-[15px] font-semibold text-muted-foreground">
            <span>Calls handled</span>
            <span>Messages followed up</span>
            <span>Appointments coordinated</span>
            <span>Answers brought back</span>
            <span>Recaps saved</span>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="wl-stitch-label">One assistant, your rules</p>
            <h2 className="mt-3 text-[34px] font-semibold tracking-[-.03em] text-foreground">
              Start personal. Expand when the work calls for it.
            </h2>
            <p className="mt-3 text-[16px] leading-6 text-muted-foreground">
              Wireline is useful on the first call. Train an assistant in plain English, connect only
              the accounts it needs, and review the outcome without giving up control.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <article className="wl-stitch-card p-6 sm:p-7">
              <SlidersHorizontal size={20} className="text-primary" />
              <h3 className="mt-5 text-[22px] font-semibold tracking-[-.02em] text-foreground">
                Clear boundaries from the start
              </h3>
              <p className="mt-3 text-[14px] leading-6 text-muted-foreground">
                Tell your assistant what it can say, what it should collect, and exactly when it should
                bring you back into the conversation.
              </p>
              <RuleExample />
            </article>
            <article className="wl-stitch-card p-6 sm:p-7">
              <Headphones size={20} className="text-primary" />
              <h3 className="mt-5 text-[22px] font-semibold tracking-[-.02em] text-foreground">
                A useful recap, not another inbox
              </h3>
              <p className="mt-3 text-[14px] leading-6 text-muted-foreground">
                Every call, follow-up, and handoff returns to you with the context and next step you need.
              </p>
              <ResultExample />
            </article>
            <article className="wl-stitch-card md:col-span-2 p-6 sm:p-7">
              <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px] md:items-center">
                <div>
                  <Bot size={20} className="text-primary" />
                  <h3 className="mt-5 text-[22px] font-semibold tracking-[-.02em] text-foreground">
                    Grow from one useful task to a reliable team workflow
                  </h3>
                  <p className="mt-3 max-w-xl text-[14px] leading-6 text-muted-foreground">
                    Use the same foundation for a personal assistant, a business front desk, or a focused
                    follow-up workflow. The job changes; your control stays the same.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-secondary p-5 text-center">
                    <PhoneCall size={24} className="mx-auto text-primary" />
                    <span className="mt-3 block font-mono text-[11px] text-muted-foreground">Handle a call</span>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary p-5 text-center">
                    <MessageSquareText size={24} className="mx-auto text-primary" />
                    <span className="mt-3 block font-mono text-[11px] text-muted-foreground">Follow up</span>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="border-t border-border px-4 py-16 text-center sm:px-6">
          <h2 className="mx-auto max-w-2xl text-[34px] font-semibold leading-tight tracking-[-.03em] text-foreground">
            Start with the call or message you do not have time to chase.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-7 text-muted-foreground">
            Create one assistant, give it a clear brief, and let Wireline handle the next useful step.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/signup"
              className="marketing-btn-primary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
            >
              Create your assistant
            </Link>
            <Link
              to="/features"
              className="marketing-btn-secondary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
            >
              Explore how it works <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-border px-4 py-8 text-[13px] text-muted-foreground sm:px-6">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span>
            <strong className="text-foreground">Wireline</strong> · calls + messages, handled
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
