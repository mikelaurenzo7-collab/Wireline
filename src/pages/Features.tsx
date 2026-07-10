import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Contact,
  CreditCard,
  Mail,
  MessageSquareText,
  PhoneCall,
  Play,
  Puzzle,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import MarketingFooter from "../components/marketing/MarketingFooter";
import { PageMeta } from "../lib/page-meta";

const OPERATING_LOOP = [
  {
    step: "Build",
    title: "Define the job",
    body: "Choose the employee, role, audience, call lane, success criteria, and approval posture.",
  },
  {
    step: "Train",
    title: "Teach the rules",
    body: "Set voice, objections, routing, escalation, handoff notes, and what a good outcome means.",
  },
  {
    step: "Launch",
    title: "Connect the operation",
    body: "Provision or attach the number, connect tools, fund live work, and define when it can act.",
  },
  {
    step: "Improve",
    title: "Coach the work",
    body: "Review outcomes, transcripts, follow-up, and coaching signals so every next conversation gets better.",
  },
] as const;

const CORE_FEATURES = [
  {
    icon: MessageSquareText,
    title: "Conversation control",
    body: "Scripts, tone, qualifying questions, objections, and guardrails stay visible and editable.",
  },
  {
    icon: PhoneCall,
    title: "Phone operation",
    body: "Inbound, outbound, and hybrid lanes share the same number, transcript, outcome, and follow-up model.",
  },
  {
    icon: CalendarClock,
    title: "Scheduling and handoff",
    body: "Book, route, recap, escalate, or queue the next attempt without making users re-enter context.",
  },
  {
    icon: ShieldCheck,
    title: "Approvals and safety",
    body: "Teams can review risky actions, keep sensitive work behind controls, and audit what happened.",
  },
  {
    icon: SlidersHorizontal,
    title: "Training by workflow",
    body: "Tune the agent to sales, support, billing, scheduling, personal errands, or custom playbooks.",
  },
  {
    icon: BarChart3,
    title: "Outcomes over noise",
    body: "See the useful record: who called, what happened, what changed, and what needs attention.",
  },
] as const;

const TOOL_STACK = [
  { icon: ShoppingBag, label: "Shopify", status: "Orders" },
  { icon: Store, label: "Square", status: "Customers" },
  { icon: BarChart3, label: "HubSpot", status: "CRM" },
  { icon: CreditCard, label: "Stripe", status: "Billing" },
  { icon: Puzzle, label: "Salesforce", status: "Pipeline" },
  { icon: Mail, label: "Resend", status: "Email" },
] as const;

const INTEGRATION_STATES = [
  ["Not connected", "Show what it will access before the user approves."],
  ["Connected", "Confirm the tool, permissions, and most recent sync."],
  ["Degraded", "Explain what broke and how to recover without mystery."],
  ["Useful outcome", "Surface the latest booked meeting, update, ticket, or payment event."],
] as const;

const USE_CASES = [
  { title: "Personal calls", icon: PhoneCall },
  { title: "Appointments", icon: CalendarClock },
  { title: "Front desk", icon: Contact },
  { title: "SMS follow-up", icon: MessageSquareText },
  { title: "Lead qualification", icon: SlidersHorizontal },
  { title: "Custom workflow", icon: Workflow },
] as const;

export default function Features() {
  return (
    <div className="marketing-surface min-h-screen bg-background text-foreground">
      <PageMeta
        title="Features | Wireline AI phone employees"
        description="Build, train, launch, and improve AI phone employees for calls, SMS, scheduling, handoffs, integrations, and follow-up."
        path="/features"
      />
      <PrecisionPublicHeader />
      <main id="main-content" className="pt-16 safe-area-insets" tabIndex={-1}>
        <section className="border-b border-border px-5 py-12 sm:px-6 sm:py-20 lg:px-8">
          <div className="wl-public-rail text-center">
            <p className="wl-overline text-primary">Features</p>
            <h1 className="mx-auto mt-4 max-w-[15ch] font-[var(--wireline-font-display)] text-[clamp(38px,5.4vw,64px)] font-semibold leading-[1.02] tracking-[-.055em] text-foreground [text-wrap:balance]">
              Everything your agent needs to finish the call.
            </h1>
            <p className="wl-public-copy mt-5">
              Wireline keeps the product simple: build the employee, train the workflow, launch the
              number and tools, then improve the work from every recorded outcome.
            </p>
            <div className="marketing-hero__actions mt-8">
              <Link
                to="/signup"
                className="marketing-btn-primary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
              >
                Build an employee
              </Link>
              <Link
                to="/showcase"
                className="marketing-btn-secondary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
              >
                <Play size={15} aria-hidden="true" /> Hear a demo
              </Link>
            </div>
          </div>
        </section>

        <section className="border-b border-border px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-public-rail">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="wl-overline text-primary">Build → Train → Launch → Improve</p>
              <h2 className="wl-public-section-heading mt-3">
                One operating loop across every feature.
              </h2>
            </div>
            <div className="grid overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card sm:grid-cols-4 sm:divide-x sm:divide-border">
              {OPERATING_LOOP.map(({ step, title, body }, index) => (
                <article key={step} className="p-6 text-center transition-colors hover:bg-muted/40">
                  <span className="mx-auto grid h-10 w-10 place-items-center rounded-full border border-border bg-background font-mono text-[12px] font-bold text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="wl-overline mt-5 text-primary">{step}</p>
                  <h3 className="mt-2 text-[1rem] font-semibold tracking-[-.015em] text-foreground">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-card/45 px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-public-rail">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="wl-overline text-primary">Core product</p>
              <h2 className="wl-public-section-heading mt-3">
                Only the features that make the call work.
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CORE_FEATURES.map(({ icon: Icon, title, body }) => (
                <FeatureCard key={title} icon={Icon} title={title} body={body} />
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-public-rail grid gap-10 lg:grid-cols-[.82fr_1.18fr] lg:items-center">
            <div className="text-center lg:text-left">
              <Workflow size={22} className="mx-auto text-primary lg:mx-0" aria-hidden="true" />
              <p className="wl-overline mt-5 text-primary">Integrations</p>
              <h2 className="wl-public-section-heading mt-3">
                Connect tools only when they improve the outcome.
              </h2>
              <p className="wl-public-copy mt-5">
                Calendars, CRMs, email, payments, and commerce systems should never be decorative
                logos. Each connection needs permission clarity, status, and a useful recent result.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {INTEGRATION_STATES.map(([title, body]) => (
                <article
                  key={title}
                  className="rounded-[var(--radius-lg)] border border-border bg-card p-5"
                >
                  <p className="wl-overline text-primary">{title}</p>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-card px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-public-rail">
            <div className="mx-auto max-w-2xl text-center">
              <p className="wl-overline text-primary">Works with your stack</p>
              <h2 className="wl-public-section-heading mt-3">
                Approved context, not manual cleanup.
              </h2>
              <p className="wl-public-copy mt-5">
                Wireline can read and write to the systems that already run the business after the
                user approves the connection.
              </p>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {TOOL_STACK.map(({ icon: Icon, label, status }) => (
                <div
                  key={label}
                  className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-background p-4 text-center transition-all hover:-translate-y-0.5 hover:border-primary/20"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/5 text-primary">
                    <Icon size={18} aria-hidden="true" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">{label}</span>
                  <span className="wl-overline text-muted-foreground">{status}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-public-rail">
            <div className="mx-auto max-w-2xl text-center">
              <p className="wl-overline text-primary">Useful on day one</p>
              <h2 className="wl-public-section-heading mt-3">
                Start with the job you want off your plate.
              </h2>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {USE_CASES.map((useCase) => (
                <article
                  key={useCase.title}
                  className="wl-stitch-card group flex min-h-[10rem] flex-col items-center justify-center rounded-xl border border-border bg-card p-6 text-center transition-all hover:border-primary/30 hover:shadow-sm"
                >
                  <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-primary/5 text-primary transition group-hover:bg-primary/10">
                    <useCase.icon size={18} aria-hidden="true" />
                  </div>
                  <h3 className="text-[1.05rem] font-semibold leading-tight tracking-[-0.015em] text-foreground">
                    {useCase.title}
                  </h3>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-public-rail text-center">
            <p className="wl-overline text-primary">Build -&gt; Train -&gt; Launch -&gt; Improve</p>
            <h2 className="wl-public-section-heading mt-3">
              Your training. Your playbook. Every channel.
            </h2>
            <div className="marketing-hero__actions mt-8">
              <Link
                to="/signup"
                className="marketing-btn-primary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
              >
                Build an employee
              </Link>
              <Link
                to="/pricing"
                className="marketing-btn-secondary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
              >
                See plans <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <article className="wl-stitch-card group flex min-h-[13rem] flex-col items-center rounded-xl p-6 text-center transition-all hover:-translate-y-px hover:shadow-sm sm:p-7">
      <Icon
        size={22}
        className="text-primary transition group-hover:scale-110"
        aria-hidden="true"
      />
      <h3 className="wl-section-title mt-5 max-w-[16ch]">{title}</h3>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{body}</p>
    </article>
  );
}
