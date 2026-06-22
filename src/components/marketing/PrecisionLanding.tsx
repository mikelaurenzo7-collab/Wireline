import {
  ArrowRight,
  Bot,
  CalendarCheck2,
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
    <div className="rounded-md border border-border bg-card p-4 shadow-[0_1px_2px_rgba(26,60,52,0.05)] sm:p-6">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[color:var(--wl-accent-container)] text-primary">
          <PhoneCall size={15} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">A real call, handled for you</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Example request · City Dental</p>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-[color:var(--wl-accent-container)] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[.06em] text-primary">
          In progress
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="rounded-md border border-border bg-[color:var(--wl-surface-subtle)] p-5">
          <p className="wl-stitch-label">Your request</p>
          <h2 className="mt-2 text-[18px] font-semibold tracking-[-.02em] text-foreground">
            Move my cleaning to next week.
          </h2>
          <p className="mt-2 max-w-xl text-[14px] leading-6 text-muted-foreground">
            Ask for Tuesday or Wednesday after 4 PM. Keep my current hygienist and text me the final
            time.
          </p>

          <div className="mt-5 space-y-3 border-t border-border pt-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-card text-primary ring-1 ring-border">
                <Clock3 size={13} />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-foreground">Waiting on hold</p>
                <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
                  Wireline stays on the line so you do not have to.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-card text-primary ring-1 ring-border">
                <MessageSquareText size={13} />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-foreground">
                  You get the useful result
                </p>
                <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
                  A recap arrives when the appointment is confirmed or your input is needed.
                </p>
              </div>
            </div>
          </div>
        </div>

        <aside className="rounded-md border border-border bg-card p-5">
          <p className="wl-stitch-label">What you receive</p>
          <div className="mt-4 grid h-12 w-12 place-items-center rounded-full bg-[color:var(--wl-accent-container)] text-primary">
            <CalendarCheck2 size={22} />
          </div>
          <p className="mt-4 text-[14px] font-semibold text-foreground">
            Confirmed for Tuesday, 4:30 PM
          </p>
          <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
            City Dental · with your current hygienist
          </p>
          <div className="mt-5 rounded-sm border border-border bg-[color:var(--wl-surface-subtle)] px-3 py-2.5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
              Recap
            </p>
            <p className="mt-1 text-[12px] leading-5 text-foreground">
              Nothing else needed from you.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PreferenceExample() {
  return (
    <div className="mt-6 space-y-2 rounded-md border border-border bg-[color:var(--wl-surface-subtle)] p-4">
      <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-card px-3 py-2.5">
        <span className="text-[12px] text-muted-foreground">Best time for callbacks</span>
        <span className="text-[12px] font-semibold text-foreground">After 4 PM</span>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-card px-3 py-2.5">
        <span className="text-[12px] text-muted-foreground">Before confirming</span>
        <span className="text-[12px] font-semibold text-foreground">Text me first</span>
      </div>
    </div>
  );
}

function CallResultExample() {
  return (
    <div className="mt-6 rounded-md border border-border bg-[color:var(--wl-surface-subtle)] p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--wl-accent-container)] text-primary">
          <Headphones size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">City Dental called back</p>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            Your cleaning is moved to Tuesday at 4:30 PM.
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-[11px] font-medium text-primary">
        <CheckCircle2 size={14} />
        No follow-up needed
      </div>
    </div>
  );
}

export default function PrecisionLanding() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PrecisionPublicHeader />
      <main id="main-content" className="pt-16">
        <section className="border-b border-border bg-background px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-[1120px] text-center">
            <p className="wl-stitch-label">Wireline AI</p>
            <h1 className="mx-auto mt-4 max-w-[820px] text-balance text-[clamp(42px,6vw,68px)] font-semibold leading-[1.05] tracking-[-.045em] text-primary">
              Reclaim 98% of your time spent on hold and phone calls.
            </h1>
            <p className="mx-auto mt-6 max-w-[620px] text-[17px] leading-7 text-muted-foreground">
              Give Wireline the calls and messages you do not have time for. Resolve appointments, support lines, and follow-ups instantly without the wait.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/pricing"
                className="marketing-btn-primary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
              >
                See plans
              </Link>
              <Link
                to="/showcase"
                className="marketing-btn-secondary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
              >
                <Play size={14} />
                Watch demo
              </Link>
            </div>
            <div className="mt-4 flex items-center justify-center gap-4 text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
              <span className="flex items-center gap-1.5"><CheckCircle2 size={13} /> SOC2 Type II Certified</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 size={13} /> Privacy First</span>
            </div>
            <div className="mx-auto mt-16 max-w-[920px] text-left">
              <ProductFrame />
            </div>
          </div>
        </section>

        <section className="border-b border-border px-4 py-10 text-center sm:px-6">
          <p className="wl-stitch-label">Made for the calls that take your day</p>
          <div className="mt-5 flex flex-wrap justify-center gap-x-10 gap-y-3 text-[16px] font-semibold text-muted-foreground">
            <span>Appointments</span>
            <span>Support lines</span>
            <span>Insurance</span>
            <span>Restaurants</span>
            <span>Follow-ups</span>
          </div>
        </section>

        <section className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-[32px] font-semibold tracking-[-.02em] text-primary">
              Helpful by design
            </h2>
            <p className="mt-3 text-[16px] leading-6 text-muted-foreground">
              Start with an assistant for your own life. Add more only when more help actually makes
              sense.
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            <article className="wl-stitch-card p-6">
              <SlidersHorizontal size={20} className="text-primary" />
              <h3 className="mt-5 text-[20px] font-semibold tracking-[-.02em] text-primary">
                Teach it your way
              </h3>
              <p className="mt-3 text-[14px] leading-5 text-muted-foreground">
                Tell your assistant what matters in plain English. Add facts, preferences, and a
                tone that feels like you.
              </p>
              <PreferenceExample />
            </article>
            <article className="wl-stitch-card p-6">
              <Headphones size={20} className="text-primary" />
              <h3 className="mt-5 text-[20px] font-semibold tracking-[-.02em] text-primary">
                Get the answer, not the hold music
              </h3>
              <p className="mt-3 text-[14px] leading-5 text-muted-foreground">
                Wireline handles the waiting and gives you the useful result, so you can get on with
                your day.
              </p>
              <CallResultExample />
            </article>
            <article className="wl-stitch-card md:col-span-2 p-6">
              <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px] md:items-center">
                <div>
                  <Bot size={20} className="text-primary" />
                  <h3 className="mt-5 text-[20px] font-semibold tracking-[-.02em] text-primary">
                    One assistant now. More help later.
                  </h3>
                  <p className="mt-3 max-w-xl text-[14px] leading-5 text-muted-foreground">
                    Begin with the calls and messages you want handled personally. When life or work
                    gets busier, add purpose-built assistants without learning a different product.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border bg-[color:var(--wl-surface-subtle)] p-5 text-center">
                    <Headphones size={24} className="mx-auto text-primary" />
                    <span className="mt-3 block font-mono text-[12px] text-muted-foreground">
                      Handle today
                    </span>
                  </div>
                  <div className="rounded-md border border-border bg-[color:var(--wl-surface-subtle)] p-5 text-center">
                    <Bot size={24} className="mx-auto text-primary" />
                    <span className="mt-3 block font-mono text-[12px] text-muted-foreground">
                      Expand later
                    </span>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="border-t border-border px-4 py-20 text-center sm:px-6">
          <h2 className="mx-auto max-w-2xl text-[32px] font-semibold leading-tight tracking-[-.02em] text-primary">
            Hand off the calls you keep putting off.
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/pricing"
              className="marketing-btn-primary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
            >
              Choose your plan
            </Link>
            <Link
              to="/features"
              className="marketing-btn-secondary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
            >
              See how it works <ArrowRight size={14} />
            </Link>
          </div>
          <div className="mt-6 flex items-center justify-center gap-4 text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><CheckCircle2 size={13} /> SOC2 Type II Certified</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 size={13} /> Privacy First</span>
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
