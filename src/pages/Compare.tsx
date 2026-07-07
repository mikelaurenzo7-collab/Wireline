import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Clock3,
  MessageSquare,
  PhoneCall,
  ShieldCheck,
  Brain,
  CalendarCheck,
  Sparkles,
  Workflow,
  Globe,
  BarChart3,
} from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";

const DIFFERENCES = [
  {
    icon: PhoneCall,
    title: "It makes the call.",
    copy: "Handles the conversation — voice, email, or text.",
  },
  {
    icon: MessageSquare,
    title: "You explain it normally.",
    copy: "Your voice, playbook, and Training — no scripts, no flowcharts.",
  },
  {
    icon: Clock3,
    title: "You get the answer back.",
    copy: "A clear next step: booked, handed off, or logged.",
  },
  {
    icon: Brain,
    title: "It remembers what you taught it.",
    copy: "Every lesson, objection, and preference stays in the agent's memory.",
  },
  {
    icon: CalendarCheck,
    title: "It books real time on your calendar.",
    copy: "Availability checks, timezone-aware, no double-booking.",
  },
  {
    icon: Workflow,
    title: "It works across channels.",
    copy: "Starts on voice, follows up by email or text — connected and coherent.",
  },
  {
    icon: Globe,
    title: "It handles after-hours coverage.",
    copy: "24/7 without overtime, burnout, or missed calls.",
  },
  {
    icon: BarChart3,
    title: "You see every outcome.",
    copy: "Transcripts, summaries, and analytics for every conversation.",
  },
  {
    icon: Sparkles,
    title: "It improves with every call.",
    copy: "Post-call review in Studio captures lessons today — the automated learning loop is in beta.",
  },
] as const;

const TABLE_ROWS = [
  ["Call during business hours", "Your agent can handle routine coverage"],
  ["Wait on hold", "Your agent waits and reports back"],
  ["Repeat the same details", "Your agent keeps the instructions"],
  ["Receive another task", "You get a clear next step"],
  ["Miss after-hours calls", "Your agent picks up 24/7, no voicemail tag"],
  ["Train a new receptionist", "Your agent ships with your playbook on day one"],
  ["Log calls manually in a CRM", "Your agent writes the summary and syncs the record"],
  [
    "Follow up on every inbound lead",
    "Your agent qualifies, books, or hands off — nothing falls through",
  ],
] as const;

export default function Compare() {
  return (
    <MarketingPageFrame mainClassName="!px-0 pb-0 pt-20 sm:pt-24">
      <PageMeta
        title="Why Wireline"
        description="Wireline handles routine phone conversations around your voice, priorities, and playbook, then returns a clear outcome."
        path="/compare"
      />

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 text-center sm:px-8 sm:pb-20 sm:pt-20 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <p className="wl-stitch-eyebrow">Why Wireline</p>
          <h1 className="wl-stitch-marketing-hero mt-4 text-balance">
            Less phone tag. More of your day.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-lg leading-8 text-muted-foreground">
            Make the call. Keep the result.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/pricing"
              className="marketing-btn-primary min-h-12 px-6 text-[var(--wireline-typography-body-size)] font-semibold"
            >
              Start free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/showcase"
              className="marketing-btn-secondary min-h-12 px-6 text-[var(--wireline-typography-body-size)] font-semibold"
            >
              Hear an agent
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card px-5 py-5 sm:px-8 sm:py-7">
        <div className="mx-auto grid max-w-6xl gap-px overflow-hidden border border-border bg-border md:grid-cols-3">
          {DIFFERENCES.map(({ icon: Icon, title, copy }) => (
            <article className="bg-card px-5 py-8 text-center sm:px-7 sm:py-10" key={title}>
              <span className="mx-auto grid h-9 w-9 place-items-center rounded bg-muted text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <h2 className="mt-6 text-lg font-semibold tracking-[-.025em] text-foreground">
                {title}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                {copy}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
        <div className="mx-auto grid max-w-4xl gap-8">
          <div className="text-center">
            <p className="wl-stitch-eyebrow">A simpler default</p>
            <h2 className="wl-stitch-display mt-3 text-balance">
              The routine call should not become a project.
            </h2>
          </div>
          <div className="overflow-hidden border border-border bg-card">
            {TABLE_ROWS.map(([before, after], index) => (
              <div
                className={
                  (index ? "border-t border-border " : "") + "grid gap-5 p-5 sm:grid-cols-2 sm:p-6"
                }
                key={before}
              >
                <p className="text-sm leading-6 text-muted-foreground">{before}</p>
                <p className="flex gap-2 text-sm font-medium leading-6 text-foreground">
                  <Check className="mt-1 h-4 w-4 flex-none text-primary" />
                  {after}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-card px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-4xl justify-items-center gap-9 text-center">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              You shape the agent.
            </p>
            <h2 className="wl-stitch-display mx-auto mt-4 max-w-2xl text-balance">
              You stay in control of every agent.
            </h2>
          </div>
          <Link
            to="/signup?mode=personal"
            className="marketing-btn-primary min-h-12 px-6 text-[var(--wireline-typography-body-size)] font-semibold"
          >
            Wire agent <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
