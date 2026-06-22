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
  "Natural phone voice that adapts to business scenarios and custom instructions.",
  "Answers inbound receptionist calls or handles outbound outreach campaigns.",
  "Knows when to warm-transfer high-value leads directly to your representatives.",
] as const;

const BOUNDARIES = [
  ["Custom scripts & guidelines", "Enforced"],
  ["Live lead qualification", "Always synced"],
  ["Your company knowledge & FAQs", "Fully guarded"],
] as const;

const USE_CASES = [
  [
    "Front Desk Receptionist",
    "Answer FAQs, handle calls, schedule appointments, and route inquiries 24/7.",
  ],
  [
    "Outbound Sales Qualified",
    "Qualify prospects over SMS/phone, register deal pipelines, and book callbacks.",
  ],
  [
    "Automated Support",
    "Resolve tier-1 support calls, look up business data, or update customer tickets.",
  ],
  [
    "Inbound Lead Gen",
    "Capture details of callers from social, search, or print media directly into your CRM.",
  ],
  [
    "Meeting Scheduling",
    "Coordinate calendars dynamically for consultations, demo bookings, or appointments.",
  ],
  [
    "Custom AI Workflows",
    "Build fully customizable agents trained on your proprietary PDFs, APIs, and system rules.",
  ],
] as const;

export default function Features() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageMeta
        title="AI Business Front Desk & Sales Agents — Features"
        description="Deploy fully customizable AI business agents that handle inbound front desk reception, outbound sales, and custom workflows across voice, SMS, and email."
        path="/features"
      />
      <PrecisionPublicHeader />

      <main id="main-content" className="pt-16">
        <section className="border-b border-border bg-background px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-[1040px]">
            <p className="wl-stitch-eyebrow">Capabilities & Integrations</p>
            <h1 className="mt-4 max-w-[760px] text-balance text-[clamp(38px,5.4vw,60px)] font-semibold leading-[1.05] tracking-[-.04em] text-foreground">
              Fully customizable business agents. Instantly deployed.
            </h1>
            <p className="mt-6 max-w-[620px] text-[17px] leading-7 text-muted-foreground">
              Deploy specialized front desk receptionists, outbound sales reps, or custom AI agents.
              They handle your phone lines, texts, and emails so your team never misses a lead.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
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
                <Play size={14} /> Hear an agent demo
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-4 lg:grid-cols-2">
            <article className="wl-stitch-card p-7 sm:p-8">
              <Mic size={22} className="text-primary" />
              <h2 className="mt-5 text-[24px] font-semibold tracking-[-.02em]">
                Conversations that sound human
              </h2>
              <p className="mt-3 max-w-md text-[15px] leading-6 text-muted-foreground">
                Wireline speaks naturally and keeps the conversation moving, answering customer
                questions, resolving calendar bookings, and registering leads so callers always feel
                valued.
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
                  Active agent · qualifying inbound lead
                </span>
              </div>
            </article>

            <article className="wl-stitch-card p-7 sm:p-8">
              <ShieldCheck size={22} className="text-primary" />
              <h2 className="mt-5 text-[24px] font-semibold tracking-[-.02em]">
                You decide the boundaries
              </h2>
              <p className="mt-3 max-w-md text-[15px] leading-6 text-muted-foreground">
                You stay in complete control. Train each agent on what it can promise, what details
                it must collect, and exactly when to warm-transfer a live caller to your staff.
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

        <section className="border-y border-border bg-card px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1040px]">
            <Workflow size={22} className="text-primary" />
            <h2 className="mt-5 max-w-2xl text-[28px] font-semibold tracking-[-.02em] sm:text-[32px]">
              It plugs into the tools you already use.
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-6 text-muted-foreground">
              Wireline doesn&apos;t just talk — it gets things done. It answers or places real
              calls, manages SMS and email, and connects to your calendar, CRM, and inbox to qualify
              prospects, schedule appointments, and log conversations.
            </p>

            <div className="mt-12 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1.2fr_auto_1fr]">
              <FlowNode
                icon={PhoneCall}
                label="Inbound/Outbound call"
                sub="Answers or dials automatically"
              />
              <FlowArrow />
              <div className="grid place-items-center border border-primary bg-[color:var(--wl-surface-subtle)] p-6 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-[color:var(--wl-accent-foreground)]">
                  <Workflow size={22} />
                </span>
                <span className="mt-4 text-[15px] font-semibold tracking-[-.01em]">
                  Customizable agent
                </span>
                <span className="mt-1 font-mono text-[11px] uppercase tracking-[.06em] text-muted-foreground">
                  Qualifies · Books · Syncs
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
                <FlowNode icon={Contact} label="Your CRM" sub="Salesforce, HubSpot, APIs" compact />
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:items-end">
            <div>
              <p className="wl-stitch-eyebrow">Automated operational excellence</p>
              <h2 className="mt-3 text-balance text-[28px] font-semibold tracking-[-.02em] sm:text-[32px]">
                Automate your front desk receptionist and outbound sales workflows.
              </h2>
            </div>
            <p className="max-w-xl text-[15px] leading-7 text-muted-foreground">
              Your agents operate with complete predictability. Train each customizable agent on
              your explicit business guidelines, and define custom transfer triggers.
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

        <section className="border-t border-border px-4 py-20 text-center sm:px-6">
          <h2 className="mx-auto max-w-2xl text-[28px] font-semibold leading-tight tracking-[-.02em] sm:text-[32px]">
            A brand-aligned business agent, fully in your control.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-7 text-muted-foreground">
            Configure guidelines, connect your calendars and CRM, and let your digital front desk
            receptionist and sales agents handle the volume.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/pricing"
              className="marketing-btn-primary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
            >
              See plans
            </Link>
            <Link
              to="/solutions/support"
              className="marketing-btn-secondary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
            >
              See front desk solutions <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-8 text-[13px] text-muted-foreground sm:px-6">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
