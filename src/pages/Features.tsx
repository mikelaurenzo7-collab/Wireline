import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Contact,
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
    title: "Define the agent",
    body: "Choose the job, audience, success criteria, channels, and limits.",
  },
  {
    step: "Train",
    title: "Teach the business",
    body: "Add knowledge, tone, objections, routing, approvals, and handoff rules.",
  },
  {
    step: "Launch",
    title: "Connect the operation",
    body: "Activate live channels, claim the included number, and set spend controls.",
  },
  {
    step: "Improve",
    title: "Coach from outcomes",
    body: "Review conversations, completed work, exceptions, and the next action.",
  },
] as const;

const CHANNEL_CAPABILITIES = [
  {
    icon: PhoneCall,
    title: "Voice",
    body: "Answer or place calls, qualify, book, transfer, and recap.",
  },
  {
    icon: MessageSquareText,
    title: "Text / SMS",
    body: "Confirm, nurture, remind, and recover under consent and spend rules.",
  },
  {
    icon: Mail,
    title: "Email",
    body: "Draft or send approved replies, follow up, and record the result.",
  },
] as const;

const CORE_FEATURES = [
  {
    icon: Workflow,
    title: "One conversation memory",
    body: "Calls, texts, and email share business knowledge, customer context, rules, and history.",
  },
  {
    icon: CheckCircle2,
    title: "Work that finishes",
    body: "Book, update, recap, route the exception, and preserve proof — not just a transcript.",
  },
  {
    icon: CalendarClock,
    title: "Scheduling and handoff",
    body: "Offer real availability and pass the request without making the customer repeat context.",
  },
  {
    icon: ShieldCheck,
    title: "Approvals and safety",
    body: "Keep sensitive actions behind controls and audit what happened before and after execution.",
  },
  {
    icon: SlidersHorizontal,
    title: "Training by workflow",
    body: "Tune one voice agent for sales, support, billing, scheduling, recovery, or a custom playbook.",
  },
  {
    icon: BarChart3,
    title: "Outcomes over activity",
    body: "See what happened, what changed, and what needs attention across every channel.",
  },
] as const;

const TOOL_STACK = [
  { icon: ShoppingBag, label: "Shopify", status: "Orders" },
  { icon: Store, label: "Square", status: "Customers" },
  { icon: BarChart3, label: "HubSpot", status: "CRM" },
  { icon: Puzzle, label: "Salesforce", status: "Pipeline" },
  { icon: Mail, label: "Google & Microsoft", status: "Inbox" },
] as const;

const USE_CASES = [
  {
    title: "Lead response",
    icon: PhoneCall,
    to: "/solutions/sales",
    body: "Answer and qualify new demand before it cools.",
  },
  {
    title: "Inbox triage",
    icon: Mail,
    to: "/solutions/support",
    body: "Sort, draft, and resolve email without losing context.",
  },
  {
    title: "SMS follow up",
    icon: MessageSquareText,
    to: "/solutions/sales",
    body: "Keep momentum with consented text that finishes the job.",
  },
  {
    title: "Appointments",
    icon: CalendarClock,
    to: "/solutions/support",
    body: "Offer real availability and book without the phone tag.",
  },
  {
    title: "Front desk",
    icon: Contact,
    to: "/solutions/support",
    body: "Catch every call, route the exception, log the outcome.",
  },
  {
    title: "Custom workflow",
    icon: Workflow,
    to: "/signup",
    body: "Train one voice agent on the conversation work you want off your plate.",
  },
] as const;

const FEATURE_HERO_PROOF = MARKETING_VOICE.channelProof.slice(0, 3);

export default function Features() {
  return (
    <div className="marketing-surface wl-features-page min-h-screen bg-background text-foreground">
      <PageMeta
        title="Features | Wireline AI Voice Agents"
        description="Build and train AI voice agents that call, text, email, book, follow up, update connected systems, and log outcomes under shared rules and memory."
        path="/features"
      />
      <PrecisionPublicHeader />

      <main id="main-content" className="pt-16" tabIndex={-1}>
        <MarketingHero
          eyebrow="Features"
          title="AI Voice Agents for every customer conversation."
          description="Train one voice agent or a coordinated team with your rules and channels. Each agent handles the conversation, finishes the next step, and keeps one outcome record."
          primaryAction={{ label: "Build your voice agent", to: "/signup" }}
          secondaryAction={{ label: "Hear a demo", to: "/showcase", tone: "secondary" }}
          proof={FEATURE_HERO_PROOF}
        />

        <section className="wl-public-section border-b border-border">
          <div className="wl-public-rail">
            <div className="mx-auto mb-10 max-w-3xl text-center">
              <p className="wl-overline text-primary">Voice first · multichannel by design</p>
              <h2 className="wl-public-section-heading mt-3">
                Calls, SMS, and email belong to the same agent.
              </h2>
              <p className="wl-public-copy mx-auto mt-5">
                Voice handles the live moment. Text and email keep momentum — without splitting
                identity, memory, or ownership.
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

        <section className="wl-public-section border-b border-border bg-card/45">
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
                  <h3 className="mx-auto mt-2 max-w-[16ch] text-[1rem] font-semibold tracking-[-.015em] text-foreground">
                    {title}
                  </h3>
                  <p className="mx-auto mt-3 max-w-[30ch] text-sm leading-6 text-muted-foreground">
                    {body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="wl-public-section border-b border-border">
          <div className="wl-public-rail">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="wl-overline text-primary">Core product</p>
              <h2 className="wl-public-section-heading mt-3">
                The controls that make conversation work reliably.
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CORE_FEATURES.map(({ icon: Icon, title, body }) => (
                <FeatureCard key={title} icon={Icon} title={title} body={body} />
              ))}
            </div>
          </div>
        </section>

        <section className="wl-public-section border-b border-border bg-card/45">
          <div className="wl-public-rail">
            <div className="mx-auto max-w-3xl text-center">
              <Workflow size={22} className="mx-auto text-primary" aria-hidden="true" />
              <p className="wl-overline mt-5 text-primary">Approved connections</p>
              <h2 className="wl-public-section-heading mt-3">
                Connect tools only when they improve the outcome.
              </h2>
              <p className="wl-public-copy mx-auto mt-5">
                Each connection shows access, status, and the most recent useful result.
              </p>
            </div>
            <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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

        <section className="wl-public-section border-b border-border">
          <div className="wl-public-rail">
            <div className="mx-auto max-w-2xl text-center">
              <p className="wl-overline text-primary">Useful on day one</p>
              <h2 className="wl-public-section-heading mt-3">
                Start with the conversation work you want off your plate.
              </h2>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {USE_CASES.map((useCase) => (
                <Link
                  key={useCase.title}
                  to={useCase.to}
                  className="wl-stitch-card group flex min-h-[10rem] flex-col items-center justify-center rounded-xl border border-border bg-card p-6 text-center transition-all hover:border-primary/30 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-primary/5 text-primary transition group-hover:bg-primary/10">
                    <useCase.icon size={18} aria-hidden="true" />
                  </div>
                  <h3 className="text-[1.05rem] font-semibold leading-tight tracking-[-0.015em] text-foreground">
                    {useCase.title}
                  </h3>
                  <p className="mt-2 max-w-[28ch] text-sm leading-6 text-muted-foreground">
                    {useCase.body}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-primary opacity-0 transition group-hover:opacity-100">
                    Explore <ArrowRight size={12} aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="wl-public-section">
          <div className="wl-public-rail text-center">
            <p className="wl-overline text-primary">Private to start · ready when you are</p>
            <h2 className="wl-public-section-heading mt-3">
              Train the agent. Test the work. Launch with confidence.
            </h2>
            <div className="marketing-hero__actions mt-8">
              <Link to="/signup" className="marketing-btn-primary px-6 text-sm font-semibold">
                Build your voice agent
              </Link>
              <Link to="/pricing" className="marketing-btn-secondary px-6 text-sm font-semibold">
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
    <article className="wl-stitch-card group flex min-h-[12rem] flex-col items-center rounded-xl p-6 text-center transition-all hover:-translate-y-px hover:shadow-sm sm:p-7">
      <Icon
        size={22}
        className="text-primary transition group-hover:scale-110"
        aria-hidden="true"
      />
      <h3 className="wl-section-title mx-auto mt-5 max-w-[16ch]">{title}</h3>
      <p className="mx-auto mt-4 max-w-[34ch] text-sm leading-6 text-muted-foreground">{body}</p>
    </article>
  );
}
