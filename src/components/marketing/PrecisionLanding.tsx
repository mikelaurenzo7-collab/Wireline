import { ArrowRight, Bot, Headphones, Play, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import BrowserCallWidget from "./BrowserCallWidget";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../../data/contact-agents";

function ProductFrame() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-[0_1px_2px_rgba(26,60,52,0.05)] sm:p-6">
      <div className="flex h-7 items-center gap-2 border-b border-border pb-4">
        <span className="h-4 w-4 rounded-full bg-muted" />
        <span className="h-2 w-24 bg-muted" />
        <span className="ml-auto h-4 w-16 bg-[color:var(--wl-accent-container)]" />
        <span className="h-4 w-5 bg-muted" />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-h-[220px] rounded-md border border-border bg-[color:var(--wl-surface-subtle)] p-5">
          <span className="h-4 w-28 bg-[color:var(--wl-surface-variant)]" />
          <div className="mt-7 space-y-4">
            <span className="block h-3 w-11/12 bg-[color:var(--wl-surface-variant)]" />
            <span className="block h-3 w-4/5 bg-[color:var(--wl-surface-variant)]" />
            <span className="block h-3 w-3/4 bg-[color:var(--wl-surface-variant)]" />
          </div>
        </div>
        <div className="grid gap-4">
          <div className="grid min-h-[130px] place-items-center rounded-md border border-border bg-[color:var(--wl-surface-subtle)]">
            <Headphones size={46} className="text-primary" />
          </div>
          <div className="rounded-md border border-border bg-[color:var(--wl-surface-subtle)] p-4">
            <span className="block h-3 w-20 bg-[color:var(--wl-surface-variant)]" />
            <span className="mt-3 block h-3 w-full bg-[color:var(--wl-surface-variant)]" />
            <span className="mt-2 block h-3 w-4/5 bg-[color:var(--wl-surface-variant)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PrecisionLanding() {
  const demoAgent =
    LANDING_PUBLIC_DEMO_AGENTS.find((agent) => agent.name === "Jordan") ||
    LANDING_PUBLIC_DEMO_AGENTS[0];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PrecisionPublicHeader />
      <main id="main-content" className="pt-16">
        <section className="border-b border-border bg-background px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-[1120px] text-center">
            <p className="wl-stitch-label">Wireline AI</p>
            <h1 className="mx-auto mt-4 max-w-[820px] font-serif text-balance text-[clamp(42px,6vw,68px)] font-semibold leading-[1.05] tracking-[-.045em] text-primary">
              Never wait on hold again.
              <br />
              Wireline will.
            </h1>
            <p className="mx-auto mt-6 max-w-[620px] text-[17px] leading-7 text-muted-foreground">
              Your AI call assistant for appointments, answers, and follow-ups. Clear, dependable help for the calls and messages you want off your plate.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/pricing" className="marketing-btn-primary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]">
                See plans
              </Link>
              <Link to="/showcase" className="marketing-btn-secondary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]">
                <Play size={14} />
                Watch demo
              </Link>
            </div>
            <div className="mx-auto mt-16 max-w-[920px] text-left"><ProductFrame /></div>
          </div>
        </section>

        <section className="border-b border-border px-4 py-10 text-center sm:px-6">
          <p className="wl-stitch-label">Made for the calls that take your day</p>
          <div className="mt-5 flex flex-wrap justify-center gap-x-10 gap-y-3 text-[16px] font-semibold text-muted-foreground">
            <span>Appointments</span><span>Support lines</span><span>Insurance</span><span>Restaurants</span><span>Follow-ups</span>
          </div>
        </section>

        <section className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-serif text-[32px] font-semibold tracking-[-.02em] text-primary">Helpful by design</h2>
            <p className="mt-3 text-[16px] leading-6 text-muted-foreground">Start with an assistant for your own life. Add more only when more help actually makes sense.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            <article className="wl-stitch-card p-6">
              <SlidersHorizontal size={20} className="text-primary" />
              <h3 className="mt-5 font-serif text-[20px] font-semibold tracking-[-.02em] text-primary">Teach it your way</h3>
              <p className="mt-3 text-[14px] leading-5 text-muted-foreground">Tell your assistant what matters in plain English. Add facts, preferences, and a tone that feels like you.</p>
              <div className="mt-6 rounded-md border border-border bg-[color:var(--wl-surface-subtle)] p-5"><span className="block h-7 w-24 rounded-sm border border-border bg-card" /><span className="mt-6 block h-7 w-24 rounded-sm border border-border bg-card" /></div>
            </article>
            <article className="wl-stitch-card p-6">
              <Headphones size={20} className="text-primary" />
              <h3 className="mt-5 font-serif text-[20px] font-semibold tracking-[-.02em] text-primary">Get the answer, not the hold music</h3>
              <p className="mt-3 text-[14px] leading-5 text-muted-foreground">Wireline handles the waiting and gives you the useful result, so you can get on with your day.</p>
              <div className="mt-6 rounded-md border border-border bg-[color:var(--wl-surface-subtle)] p-5"><BrowserCallWidget agentName={demoAgent.name} /></div>
            </article>
            <article className="wl-stitch-card md:col-span-2 p-6">
              <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px] md:items-center">
                <div>
                  <Bot size={20} className="text-primary" />
                  <h3 className="mt-5 font-serif text-[20px] font-semibold tracking-[-.02em] text-primary">One assistant now. More help later.</h3>
                  <p className="mt-3 max-w-xl text-[14px] leading-5 text-muted-foreground">Begin with the calls and messages you want handled personally. When life or work gets busier, add purpose-built assistants without learning a different product.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border bg-[color:var(--wl-surface-subtle)] p-5 text-center"><Headphones size={24} className="mx-auto text-primary" /><span className="mt-3 block font-mono text-[12px] text-muted-foreground">Today</span></div>
                  <div className="rounded-md border border-border bg-[color:var(--wl-surface-subtle)] p-5 text-center"><Bot size={24} className="mx-auto text-primary" /><span className="mt-3 block font-mono text-[12px] text-muted-foreground">When you need it</span></div>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="border-t border-border px-4 py-20 text-center sm:px-6">
          <h2 className="mx-auto max-w-2xl font-serif text-[32px] font-semibold leading-tight tracking-[-.02em] text-primary">Hand off the calls you keep putting off.</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/pricing" className="marketing-btn-primary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]">Choose your plan</Link>
            <Link to="/features" className="marketing-btn-secondary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]">See how it works <ArrowRight size={14} /></Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-border px-4 py-8 text-[13px] text-muted-foreground sm:px-6">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span><strong className="font-serif text-foreground">Wireline</strong> · calls + messages, handled</span>
          <div className="flex gap-5"><Link to="/pricing">Pricing</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/support">Contact</Link></div>
        </div>
      </footer>
    </div>
  );
}
