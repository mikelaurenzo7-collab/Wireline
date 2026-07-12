import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Contact,
  CreditCard,
  Mail,
  MessageSquareText,
  PhoneCall,
  Puzzle,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import MarketingFooter from "../components/marketing/MarketingFooter";
import MarketingHero from "../components/marketing/MarketingHero";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import { AGENT_NUMBER_PROMISE, MARKETING_VOICE } from "../lib/product-copy";
import { PageMeta } from "../lib/page-meta";

const OPERATING_LOOP = [
  {
    step: "Build",
    title: "Define the employee",
    body: "Choose the job, audience, success criteria, conversation channels, and approval posture.",
  },
  {
    step: "Train",
    title: "Teach the business",
    body: "Set knowledge, tone, objections, routing, escalation, handoffs, and what a good outcome means once.",
  },
  {
    step: "Launch",
    title: "Connect the operation",
    body: "Activate a paid plan, claim the included number, connect SMS, email, tools, and spend controls.",
  },
  {
    step: "Improve",
    title: "Coach one record",
    body: "Review calls, messages, outcomes, follow-up, and coaching signals across every conversation.",
  },
] as const;

const CHANNEL_CAPABILITIES = [
  {
    icon: PhoneCall,
    title: "AI voice employee",
    body: "Answer inbound calls, place outbound calls, qualify, sell, support, book, transfer, recap, and continue follow-up without losing context.",
  },
  {
    icon: MessageSquareText,
    title: "Text / SMS capability",
    body: "Respond, nurture, confirm appointments, send reminders, recover stalled conversations, and escalate under visible consent and spend rules.",
  },
  {
    icon: Mail,
    title: "Email capability",
    body: "Read connected inboxes, classify intent, draft or send approved replies, follow up, and write the result back to the same operating record.",
  },
] as const;

const CORE_FEATURES = [
  {
    icon: Workflow,
    title: "One conversation memory",
    body: "Calls, emails, and texts use the same business knowledge, customer context, rules, approvals, and outcome history.",
  },
  {
    icon: CheckCircle2,
    title: "Work that finishes",
    body: "Book the appointment, update the CRM, send the recap, route the exception, and preserve proof—not just a transcript.",
  },
  {
    icon: CalendarClock,
    title: "Scheduling and handoff",
    body: "Book, route, recap, escalate, or queue the next attempt without asking the customer to repeat context.",
  },
  {
    icon: ShieldCheck,
    title: "Approvals and safety",
    body: "Review risky actions, keep sensitive work behind controls, and audit what happened before and after execution.",
  },
  {
    icon: SlidersHorizontal,
    title: "Training by workflow",
    body: "Tune one employee to sales, support, billing, scheduling, recovery, front desk, or a custom playbook.",
  },
  {
    icon: BarChart3,
    title: "Outcomes over activity",
    body: "See who contacted the business, what happened, what changed, and what needs attention regardless of channel.",
  },
] as const;

const TOOL_STACK = [
  { icon: ShoppingBag, label: "Shopify", status: "Orders" },
  { icon: Store, label: "Square", status: "Customers" },
  { icon: BarChart3, label: "HubSpot", status: "CRM" },
  { icon: CreditCard, label: "Stripe", status: "Billing" },
  { icon: Puzzle, label: "Salesforce", status: "Pipeline" },
  { icon: Mail, label: "Google & Microsoft", status: "Inbox" },
] as const;

const INTEGRATION_STATES = [
  ["Not connected", "Show what the employee will access before the user approves."],
  ["Connected", "Confirm the tool, permissions, channel, and most recent sync."],
  ["Degraded", "Explain what broke, which channel is affected, and how to recover."],
  ["Useful outcome", "Surface the latest booked meeting, reply, ticket, update, or payment event."],
] as const;

const USE_CASES = [
  { title: "Lead response", icon: PhoneCall },
  { title: "Inbox triage", icon: Mail },
  { title: "SMS follow-up", icon: MessageSquareText },
  { title: "Appointments", icon: CalendarClock },
  { title: "Front desk", icon: Contact },
  { title: "Custom workflow", icon: Workflow },
] as const;

const FEATURE_HERO_PROOF = MARKETING_VOICE.channelProof;

export default function Features() {
  return (
    <div className="marketing-surface min-h-screen bg-background text-foreground">
      <PageMeta
        title="Features | Your Wireline AI Voice Employee"
        description="Build and train one AI Voice Employee that calls, texts, emails, books, follows up, updates connected systems, and logs outcomes under shared rules and memory."
        path="/features"
      />
      <PrecisionPublicHeader />
      <main id="main-content" className="pt-16" tabIndex={-1}>
        <MarketingHero
          eyebrow="Features"
          title="One AI Voice Employee. Every customer conversation."
          description="Give one employee the business knowledge, rules, approvals, and connected channels it needs. It calls, texts, emails, books, follows up, updates your systems, and preserves one outcome record."
          primaryAction={{ label: "Build your AI Voice Employee", to: "/signup" }}
          secondaryAction={{ label: "Hear a demo", to: "/showcase", tone: "secondary" }}
          proof={FEATURE_HERO_PROOF}
        />

        <section className="border-b border-border px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-public-rail">
            <div className="mx-auto mb-10 max-w-3xl text-center">
              <p className="wl-overline text-primary">Voice first · multichannel by design</p>
              <h2 className="wl-public-section-heading mt-3">
                Calls, SMS, and email belong to the same employee.
              </h2>
              <p className="wl-public-copy mx-auto mt-5">
                Voice handles the live moment. SMS and email preserve momentum before and after the
                call. Identity, training, memory, approvals, and outcomes remain unified.
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {CHANNEL_CAPABILITIES.map(({ icon: Icon, title, body }) => (
                <FeatureCard key={title} icon={Icon} title={title} body={body} />
              ))}
            </div>
            <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-6 text-muted-foreground">
              {AGENT_NUMBER_PROMISE}
            </p>
          </div>
        </section>

        <section className="border-b border-border bg-card/45 px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-public-rail">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="wl-overline text-primary">Build → Train → Launch → Improve</p>
              <h2 className="wl-public-section-heading mt-3">
                One operating loop across every channel.
              </h2>
            </div>
            <div className="grid overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-border">
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

        <section className="border-b border-border px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-public-rail">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="wl-overline text-primary">Core product</p>
              <h2 className="wl-public-section-heading mt-3">
                The controls that make conversation work reliable.
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CORE_FEATURES.map(({ icon: Icon, title, body }) => (
                <FeatureCard key={title} icon={Icon} title={title} body={body} />
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-card/45 px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-public-rail">
            <div className="mx-auto max-w-3xl text-center">
              <Workflow size={22} className="mx-auto text-primary" aria-hidden="true" />
              <p className="wl-overline mt-5 text-primary">Integrations</p>
              <h2 className="wl-public-section-heading mt-3">
                Connect tools only when they improve the outcome.
              </h2>
              <p className="wl-public-copy mx-auto mt-5">
                Calendars, CRMs, inboxes, payments, and commerce systems should never be decorative
                logos. Each connection needs permission clarity, status, and a useful recent result.
              </p>
            </div>
            <div className="mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-2">
              {INTEGRATION_STATES.map(([title, body]) => (
                <article key={title} className="rounded-[var(--radius-lg)] border border-border bg-card p-5 text-center">
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
                Start with the conversation work you want off your plate.
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
              Your employee. Your playbook. Voice, SMS, email, and completed work.
            </h2>
            <div className="marketing-hero__actions mt-8">
              <Link
                to="/signup"
                className="marketing-btn-primary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
              >
                Build your AI Voice Employee
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
