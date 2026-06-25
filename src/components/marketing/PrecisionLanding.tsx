import {
  ArrowRight,
  CheckCircle2,
  Mail,
  MessageSquareText,
  PhoneCall,
  Play,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import MarketingFooter from "./MarketingFooter";
import PrecisionPublicHeader from "./PrecisionPublicHeader";

const channels = [
  {
    label: "Voice",
    title: "Calls handled on your terms",
    body: "Build a custom voice agent with your specific brief, boundaries, and escalation path. It handles the conversation and brings back the answer.",
    icon: PhoneCall,
  },
  {
    label: "Email",
    title: "Inbox motion with guardrails",
    body: "Create an email agent with your context, approval limits, and rules. It keeps follow-ups moving and surfaces the next step.",
    icon: Mail,
  },
  {
    label: "Text",
    title: "Text that turns interest into action",
    body: "Your text agent follows the exact rules you set: reply to leads, run follow-up, book appointments, and keep your team informed.",
    icon: MessageSquareText,
  },
];

function OperatingModel() {
  return (
    <aside className="marketing-operating-model" aria-label="How Wireline works">
      <div className="marketing-operating-model__header">
        <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-primary text-primary-foreground">
          <Sparkles size={17} />
        </span>
        <div>
          <p className="wl-overline text-primary">Your agent's brief</p>
          <p className="mt-1 font-[var(--wireline-font-display)] text-[17px] font-semibold tracking-[-.02em]">
            Home services after-hours coverage
          </p>
        </div>
      </div>
      <div className="marketing-operating-model__body">
        <div className="marketing-operating-model__row">
          <span>It can handle</span>
          <strong>Calls · Email · Text</strong>
        </div>
        <div className="marketing-operating-model__row">
          <span>It follows</span>
          <strong>That agent's specific rules and approvals</strong>
        </div>
        <div className="marketing-operating-model__row">
          <span>It returns</span>
          <strong>Qualified lead · next step</strong>
        </div>
      </div>
      <div className="marketing-operating-model__outcome">
        <CheckCircle2 size={17} />
        <div>
          <p className="wl-overline">Outcome</p>
          <p className="mt-1 text-sm font-semibold">
            The agent followed your exact rules and qualified the lead for your team.
          </p>
        </div>
      </div>
    </aside>
  );
}

export default function PrecisionLanding() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      <PrecisionPublicHeader />
      <main id="main-content" className="pt-16" tabIndex={-1}>
        <section className="marketing-hero border-b border-border px-5 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <div className="wl-measure mx-auto grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(330px,.72fr)] lg:gap-14">
            <div className="max-w-[760px] text-center lg:text-left">
              <p className="wl-overline text-primary">Personal + business AI assistants</p>
              <h1 className="mt-4 font-[var(--wireline-font-display)] text-[clamp(42px,5vw,66px)] font-semibold leading-[1.03] tracking-[-.055em] text-foreground sm:mt-5">
                Every conversation, handled.
              </h1>
              <p className="mt-5 text-[14px] font-semibold tracking-[.08em] text-primary sm:text-[15px]">
                Voice + Email + Text
              </p>
              <p className="mt-5 max-w-[650px] text-[17px] leading-7 text-muted-foreground sm:text-[18px] sm:leading-8 lg:mx-0">
                Create specialized agents with their own knowledge, tools, voice, and approval
                rules. Each one handles calls, inboxes, and texts the same way — exactly as you
                configured it.
              </p>
              <div className="mt-8 grid gap-3 sm:max-w-none sm:grid-cols-2 lg:max-w-[510px]">
                <Link
                  to="/signup"
                  className="marketing-btn-primary min-h-12 px-6 text-[13px] font-semibold uppercase tracking-[.05em]"
                >
                  Create your assistant <ArrowRight size={16} />
                </Link>
                <Link
                  to="/showcase"
                  className="marketing-btn-secondary min-h-12 px-6 text-[13px] font-semibold uppercase tracking-[.05em]"
                >
                  <Play size={15} /> Hear a demo
                </Link>
              </div>
              <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[12px] font-medium text-muted-foreground lg:justify-start">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-primary" /> You define the boundaries
                </span>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-primary" /> You approve connected actions
                </span>
              </div>
            </div>
            <OperatingModel />
          </div>
        </section>
        <section className="wl-measure mx-auto px-5 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="wl-overline text-primary">Your agent. Every channel.</p>
              <h2 className="mt-2 font-[var(--wireline-font-display)] text-[clamp(26px,3vw,38px)] font-semibold leading-[1.1] tracking-[-.04em]">
                Custom rules, applied the same way.
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Build a specialized agent with its own knowledge, boundaries, tools, and voice. It
              applies those exact rules whether the conversation starts as a call, an email, or a
              text.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {channels.map(({ label, title, body, icon: Icon }) => (
              <article
                key={label}
                className="wl-stitch-card marketing-channel-card flex min-h-[224px] flex-col p-6 sm:p-7"
              >
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <p className="wl-overline mt-5 text-primary">{label}</p>
                <h2 className="wl-section-title mt-2 text-[clamp(22px,4vw,26px)]">{title}</h2>
                <p className="mt-3 text-[15px] leading-6 text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="border-t border-border px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-measure mx-auto text-center">
            <p className="wl-overline">Start with one specialized agent</p>
            <h2 className="mx-auto mt-3 max-w-2xl font-[var(--wireline-font-display)] text-[clamp(30px,4vw,44px)] font-semibold leading-[1.08] tracking-[-.045em] text-foreground">
              Build it your way. It works the same across every channel.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[16px] leading-7 text-muted-foreground">
              Start with one focused agent — a scheduling specialist, a lead qualifier, or
              after-hours support. Give it the exact knowledge and rules it needs. Expand to more
              specialized agents as you grow.
            </p>
            <div className="mt-7">
              <Link
                to="/for/personal"
                className="marketing-btn-secondary min-h-12 px-6 text-[13px] font-semibold uppercase tracking-[.05em]"
              >
                Explore how it works <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
