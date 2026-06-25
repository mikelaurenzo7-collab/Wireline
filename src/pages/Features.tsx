import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarClock,
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

const OUTCOMES = ["Answer", "Qualify", "Schedule"] as const;
const BOUNDARIES = [
  ["What it can say", "You decide"],
  ["When it asks you", "Clearly defined"],
  ["What it can access", "Approved only"],
] as const;
const USE_CASES = ["Personal calls", "Appointments", "Business front desk", "SMS follow-up", "Lead qualification", "Custom workflows"] as const;

export default function Features() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageMeta title="AI Voice, Email & SMS Agent Features | Wireline" description="AI assistants for calls, email, and SMS. Set the rules, keep the outcome." path="/features" />
      <PrecisionPublicHeader />
      <main id="main-content" className="pt-16" tabIndex={-1}>
        <section className="border-b border-border px-5 py-12 sm:px-6 sm:py-20 lg:px-8">
          <div className="wl-public-rail">
            <p className="wl-overline text-primary">How it works</p>
            <h1 className="mt-4 max-w-[13ch] font-[var(--wireline-font-display)] text-[clamp(38px,5.4vw,60px)] font-semibold leading-[1.04] tracking-[-.05em] text-foreground">Give every conversation a clear next step.</h1>
            <p className="wl-public-copy mt-5">Set the boundaries. Keep the outcome.</p>
            <div className="marketing-hero__actions mt-8">
              <Link to="/signup" className="marketing-btn-primary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]">Create your assistant</Link>
              <Link to="/showcase" className="marketing-btn-secondary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"><Play size={15} /> Hear a demo</Link>
            </div>
          </div>
        </section>

        <section className="border-b border-border px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-public-rail grid gap-4 lg:grid-cols-2">
            <article className="wl-stitch-card flex min-h-[16rem] flex-col p-6 sm:p-8">
              <MessageSquareText size={22} className="text-primary" />
              <h2 className="wl-section-title mt-5 max-w-[16ch]">Conversations that stay on task.</h2>
              <div className="mt-auto flex flex-wrap gap-2 pt-8">{OUTCOMES.map((outcome) => <span key={outcome} className="rounded-full border border-border bg-secondary px-3 py-1.5 text-sm font-medium text-foreground">{outcome}</span>)}</div>
            </article>
            <article className="wl-stitch-card flex min-h-[16rem] flex-col p-6 sm:p-8">
              <ShieldCheck size={22} className="text-primary" />
              <h2 className="wl-section-title mt-5">You decide the boundaries.</h2>
              <dl className="mt-auto divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border">{BOUNDARIES.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 px-4 py-3.5"><dt className="text-[var(--wireline-typography-body-size)] text-foreground">{label}</dt><dd className="wl-overline text-primary">{value}</dd></div>)}</dl>
            </article>
          </div>
        </section>

        <section className="border-b border-border bg-card px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-public-rail">
            <Workflow size={22} className="text-primary" />
            <p className="wl-overline mt-5 text-primary">Connections</p>
            <h2 className="wl-public-section-heading mt-3">Connect a tool only when it improves the outcome.</h2>
            <p className="wl-public-copy mt-5">Calendars, inboxes, and systems—only when you approve them.</p>
            <div className="mt-10 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1.2fr_auto_1fr]">
              <FlowNode icon={PhoneCall} label="Conversation" sub="Call, email, or text" />
              <FlowArrow />
              <div className="flex items-center gap-3 rounded-[var(--radius-xl)] border border-primary bg-secondary p-6">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Workflow size={22} /></span>
                <div><span className="block text-[var(--wireline-typography-body-size)] font-semibold tracking-[-.01em] text-foreground">Your assistant</span><span className="wl-overline mt-2 block">Handles · qualifies · books</span></div>
              </div>
              <FlowArrow />
              <div className="grid gap-3"><FlowNode icon={CalendarClock} label="Calendar" sub="Check and book" compact /><FlowNode icon={Contact} label="Systems" sub="Approved access" compact /></div>
            </div>
          </div>
        </section>

        <section className="border-b border-border px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-public-rail">
            <p className="wl-overline text-primary">Useful on day one</p>
            <h2 className="wl-public-section-heading mt-3">Start with the job you want off your plate.</h2>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{USE_CASES.map((title) => <article key={title} className="wl-stitch-card flex min-h-[9.5rem] flex-col justify-between p-5"><SlidersHorizontal size={17} className="text-primary" /><h3 className="wl-card-title mt-6">{title}</h3></article>)}</div>
          </div>
        </section>

        <section className="px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-public-rail">
            <p className="wl-overline text-primary">Build your assistant</p>
            <h2 className="wl-public-section-heading mt-3">Your knowledge. Your rules. Every channel.</h2>
            <div className="marketing-hero__actions mt-8"><Link to="/signup" className="marketing-btn-primary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]">Create your assistant</Link><Link to="/pricing" className="marketing-btn-secondary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]">See plans <ArrowRight size={15} /></Link></div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

function FlowNode({ icon: Icon, label, sub, compact = false }: { icon: typeof PhoneCall; label: string; sub: string; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-[var(--radius-xl)] border border-border bg-secondary ${compact ? "px-4 py-3.5" : "px-6 py-6"}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-card text-primary"><Icon size={18} /></span>
      <div><span className="block text-[var(--wireline-typography-body-size)] font-semibold tracking-[-.01em] text-foreground">{label}</span><span className="mt-0.5 block text-[var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">{sub}</span></div>
    </div>
  );
}

function FlowArrow() {
  return <div className="grid place-items-center text-muted-foreground"><ArrowRight size={18} className="hidden md:block" /><span className="block h-5 w-px bg-border md:hidden" /></div>;
}
