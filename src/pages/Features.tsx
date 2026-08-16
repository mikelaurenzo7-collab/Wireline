import { Link } from "react-router";
import {
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
import MarketingChromeBar from "../components/marketing/MarketingChromeBar";
import MarketingHero from "../components/marketing/MarketingHero";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import { PageMeta } from "../lib/page-meta";

/* Titled with the canonical step names the landing page uses. This list used
   to sit under a "Build. Train. Launch. Improve." headline while its own cards
   were titled "Define the Agent" / "Teach the Business" — one four-step story,
   two vocabularies, on two pages. One vocabulary now. */
const OPERATING_LOOP = [
  {
    title: "Build",
    body: "Choose the job, audience, success criteria, channels, and limits.",
  },
  {
    title: "Train",
    body: "Add knowledge, tone, objections, routing, approvals, and handoff rules.",
  },
  {
    title: "Launch",
    body: "Activate live channels, claim the included number, and set spend controls.",
  },
  {
    title: "Improve",
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
    title: "One Conversation Memory",
    body: "Calls, texts, and email share business knowledge, customer context, rules, and history.",
  },
  {
    icon: CheckCircle2,
    title: "Work That Finishes",
    body: "Book, update, recap, route the exception, and preserve proof. Not just a transcript.",
  },
  {
    icon: CalendarClock,
    title: "Scheduling and Handoff",
    body: "Offer real availability and pass the request without making the customer repeat context.",
  },
  {
    icon: ShieldCheck,
    title: "Approvals and Safety",
    body: "Keep sensitive actions behind controls and audit what happened before and after execution.",
  },
  {
    icon: SlidersHorizontal,
    title: "Training by Workflow",
    body: "Tune one voice agent for sales, support, billing, scheduling, recovery, or a custom playbook.",
  },
  {
    icon: BarChart3,
    title: "Outcomes over Activity",
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
    title: "Lead Response",
    icon: PhoneCall,
    to: "/solutions/sales",
    body: "Answer and qualify new demand before it cools.",
  },
  {
    title: "Inbox Triage",
    icon: Mail,
    to: "/solutions/support",
    body: "Sort, draft, and resolve email without losing context.",
  },
  {
    title: "SMS Follow Up",
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
    title: "Front Desk",
    icon: Contact,
    to: "/solutions/support",
    body: "Catch every call, route the exception, log the outcome.",
  },
  {
    title: "Custom Workflow",
    icon: Workflow,
    to: "/signup",
    body: "Train one voice agent on the conversation work you want off your plate.",
  },
] as const;

export default function Features() {
  return (
    <div className="marketing-surface wl-features-page bg-background text-foreground">
      <PageMeta
        title="Features | Wireline Voice Agents"
        description="Build and train voice agents that call, text, email, book, follow up, update connected systems, and log outcomes under shared rules and memory."
        path="/features"
      />
      <PrecisionPublicHeader />

      <main id="main-content" className="marketing-flow" tabIndex={-1}>
        {/* Screen 1 — what it runs on. The three channel cards carry the
            "every channel, one agent" claim, so the headline that said it in
            words above them is gone: the row is the proof and the sentence. */}
        <section className="marketing-section marketing-section--screen">
          <MarketingHero
            title="Voice agents for every customer conversation"
            primaryAction={{ label: "Build Your Voice Agent", to: "/signup" }}
            secondaryAction={{
              label: "Hear a Demo",
              to: "/showcase",
              tone: "secondary",
            }}
          />
          <div className="wl-public-rail mt-10">
            <div className="grid gap-3 lg:grid-cols-3">
              {CHANNEL_CAPABILITIES.map(({ icon: Icon, title, body }) => (
                <FeatureCard key={title} icon={Icon} title={title} body={body} />
              ))}
            </div>
          </div>
        </section>

        {/* Screen 2 — why it can be trusted with the work. */}
        <section className="marketing-section border-t border-border">
          <div className="wl-public-rail">
            <h2 className="wl-public-section-heading mx-auto text-center">
              The controls that make it reliable
            </h2>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CORE_FEATURES.map(({ icon: Icon, title, body }) => (
                <FeatureCard key={title} icon={Icon} title={title} body={body} />
              ))}
            </div>
          </div>
        </section>

        {/* Screen 3 — the work itself. Each card now renders the body copy it
            has always carried: the six use cases shipped as bare labels with a
            hover-only "Explore", so the data existed and the visitor never saw
            it. Connections ride along at the foot of the same screen — they
            answer "does it reach my systems", which is the question a use case
            raises, and they no longer need a one-word section of their own. */}
        <section className="marketing-section border-t border-border bg-card/45">
          <div className="wl-public-rail">
            <h2 className="wl-public-section-heading mx-auto text-center">
              Start with the work you want off your plate
            </h2>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {USE_CASES.map((useCase) => (
                <Link
                  key={useCase.title}
                  to={useCase.to}
                  className="wl-stitch-card group flex flex-col items-center rounded-xl border border-border bg-card p-5 text-center transition-all hover:border-primary/30 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-primary/5 text-primary transition group-hover:bg-primary/10">
                    <useCase.icon size={18} aria-hidden="true" />
                  </div>
                  <h3 className="wl-card-title">{useCase.title}</h3>
                  <p className="mx-auto mt-2 max-w-[32ch] text-sm leading-6 text-muted-foreground">
                    {useCase.body}
                  </p>
                </Link>
              ))}
            </div>

            <ul className="mt-8 flex flex-wrap items-center justify-center gap-2">
              {TOOL_STACK.map(({ icon: Icon, label, status }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2"
                >
                  <Icon size={15} className="text-primary" aria-hidden="true" />
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                  <span className="wl-overline text-muted-foreground">{status}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Screen 4 — how you get there, in the same four words the landing
            page and the workspace use. The closing CTA band that used to sit
            below this repeated the hero's two buttons verbatim; the loop ends
            on "Improve", which is a better last word than a third Start Free. */}
        <section className="marketing-section border-t border-border">
          <div className="wl-public-rail">
            <ol className="grid gap-px overflow-hidden rounded-[var(--radius-xl)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {OPERATING_LOOP.map(({ title, body }, index) => (
                <li key={title} className="bg-card p-6 text-center">
                  <span className="mx-auto grid h-9 w-9 place-items-center rounded-full border border-border bg-background font-mono text-[12px] font-bold text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="wl-card-title mt-4">{title}</h3>
                  <p className="mx-auto mt-2 max-w-[30ch] text-sm leading-6 text-muted-foreground">
                    {body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <MarketingChromeBar />
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
      {/* Card tier, not section tier. `wl-section-title` clamps up to 2.5rem —
          a page-section scale that, inside a 3-up card, wrapped "One
          conversation memory" onto three lines while its neighbours took two,
          so every body paragraph in the row started on a different baseline. */}
      {/* Two lines are reserved so every body paragraph in a row starts on the
          same baseline whether its title wraps once or not. */}
      <h3 className="wl-card-title mx-auto mt-5 min-h-[2.24em] max-w-[18ch]">{title}</h3>
      <p className="mx-auto mt-4 max-w-[34ch] text-sm leading-6 text-muted-foreground">{body}</p>
    </article>
  );
}
