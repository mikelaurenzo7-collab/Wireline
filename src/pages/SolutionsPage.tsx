import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarClock,
  Check,
  CircleDot,
  Headphones,
  MessageSquareText,
  PhoneOutgoing,
  ShieldCheck,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";

const SOLUTIONS = {
  sales: {
    eyebrow: "Sales conversations",
    title: "Every qualified lead gets a next step.",
    description:
      "Wireline gives your team an assistant that responds across phone, email, and text, qualifies the opportunity, and moves the right person toward a meeting—without losing the context.",
    icon: PhoneOutgoing,
    primary: { href: "/signup?posture=business", label: "Create a sales agent" },
    secondary: { href: "/showcase", label: "Hear a demo" },
    sequence: [
      ["A lead reaches out", "Phone, email, or an opted-in text reply starts the conversation."],
      [
        "Your agent qualifies",
        "It asks the questions you define, follows your positioning, and respects the guardrails.",
      ],
      [
        "Your team gets momentum",
        "Qualified opportunities are booked, handed off, or captured with a clear next action.",
      ],
    ],
    capabilities: [
      [
        "Fast lead response",
        "Reply to new inquiries while the prospect is still interested, then keep the conversation moving.",
      ],
      [
        "SMS follow-up that earns a reply",
        "Run approved, opt-in outreach, nurture active opportunities, and revive stalled conversations without losing your brand voice.",
      ],
      [
        "Appointments that show up",
        "Offer real availability, schedule the meeting, and send the right confirmation or reminder.",
      ],
    ],
    proof: "Your team spends time with qualified people—not a pile of unanswered inquiries.",
  },
  support: {
    eyebrow: "Customer coverage",
    title: "A front desk that is ready when customers are.",
    description:
      "Wireline becomes the reliable first response for your business: answer routine questions, collect the context that matters, schedule the next step, and bring a person in when the conversation needs one.",
    icon: Headphones,
    primary: { href: "/signup?posture=business", label: "Create a front desk agent" },
    secondary: { href: "/showcase", label: "Hear a demo" },
    sequence: [
      [
        "A customer reaches out",
        "Your agent responds on the business line, inbox, or approved text thread.",
      ],
      [
        "The issue gets context",
        "It follows your knowledge and policies to answer, triage, or ask the right next question.",
      ],
      [
        "The right handoff happens",
        "Urgent cases reach your team; routine ones end with a complete answer, appointment, or follow-up.",
      ],
    ],
    capabilities: [
      [
        "A dependable first response",
        "Cover after-hours questions, inbound calls, and common requests without making customers wait.",
      ],
      [
        "Appointments and confirmations",
        "Find an available time, confirm the details, and keep the customer informed by text or email.",
      ],
      [
        "Your policies, not generic scripts",
        "Give each agent its own approved language, service rules, escalation thresholds, and connected accounts.",
      ],
    ],
    proof: "Customers get a useful answer sooner. Your team only joins when its judgment matters.",
  },
} as const;

type SolutionKey = keyof typeof SOLUTIONS;
type Solution = (typeof SOLUTIONS)[SolutionKey];

export default function SolutionsPage() {
  const { wedge = "support" } = useParams<{ wedge: string }>();
  const key = (wedge in SOLUTIONS ? wedge : "support") as SolutionKey;
  const page = SOLUTIONS[key];
  const Icon = page.icon;

  return (
    <MarketingPageFrame mainClassName="!px-0 !pb-0 !pt-16">
      <PageMeta
        title={`${page.title} — Wireline`}
        description={page.description}
        path={`/solutions/${key}`}
      />

      <section className="border-b border-border px-5 py-12 sm:px-6 sm:py-20 lg:px-8">
        <div className="wl-measure mx-auto grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,.75fr)] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
              <Icon size={14} className="text-primary" />
              <span className="wl-overline text-foreground">{page.eyebrow}</span>
            </div>
            <h1 className="wl-page-title mt-6 max-w-[13ch] text-balance">{page.title}</h1>
            <p className="mt-6 max-w-2xl text-[17px] leading-7 text-muted-foreground sm:text-[18px] sm:leading-8">
              {page.description}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to={page.primary.href}
                className="marketing-btn-primary min-h-12 px-6 text-[13px] font-semibold uppercase tracking-[.05em]"
              >
                {page.primary.label} <ArrowRight size={15} />
              </Link>
              <Link
                to={page.secondary.href}
                className="marketing-btn-secondary min-h-12 px-6 text-[13px] font-semibold uppercase tracking-[.05em]"
              >
                {page.secondary.label}
              </Link>
            </div>
          </div>

          <WorkflowPanel page={page} />
        </div>
      </section>

      <section className="wl-measure mx-auto px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="max-w-2xl">
          <p className="wl-overline text-primary">One clear operating flow</p>
          <h2 className="wl-stitch-display mt-3 text-balance">
            The conversation moves. Your team stays in control.
          </h2>
        </div>
        <ol className="mt-10 grid gap-4 lg:grid-cols-3">
          {page.sequence.map(([title, copy], index) => (
            <li key={title} className="wl-stitch-card relative p-6 sm:p-7">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--wireline-color-action-primary-container)] font-mono text-[12px] font-semibold text-primary">
                0{index + 1}
              </span>
              <h3 className="wl-section-title mt-5 text-[clamp(1.15rem,1rem+.45vw,1.35rem)]">
                {title}
              </h3>
              <p className="mt-3 text-[15px] leading-6 text-muted-foreground">{copy}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-border bg-card px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="wl-measure mx-auto grid gap-8 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)] lg:items-end">
          <div>
            <p className="wl-overline">Built for useful business work</p>
            <h2 className="wl-stitch-display mt-3 text-balance">
              The capabilities that make a conversation operational.
            </h2>
            <p className="mt-4 max-w-lg text-[15px] leading-7 text-muted-foreground">
              Start with a focused assignment. Expand into the next channel, connected account, or
              workflow only when it makes the outcome better.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {page.capabilities.map(([title, copy], index) => {
              const CapabilityIcon = [MessageSquareText, CalendarClock, ShieldCheck][
                index
              ] as LucideIcon;
              return (
                <article key={title} className="wl-stitch-card bg-background p-5">
                  <CapabilityIcon size={18} className="text-primary" />
                  <h3 className="wl-card-title mt-4">{title}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{copy}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="wl-measure mx-auto px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="wl-stitch-card grid gap-6 border-primary/25 bg-[color:var(--wireline-color-action-primary-container)] p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-primary">
              <CircleDot size={16} />
              <span className="wl-overline text-primary">The Wireline difference</span>
            </div>
            <p className="mt-4 text-[clamp(1.35rem,1.1rem+1vw,1.85rem)] font-semibold leading-[1.15] tracking-[-.035em] text-foreground">
              {page.proof}
            </p>
          </div>
          <Link
            to={page.primary.href}
            className="marketing-btn-primary min-h-12 shrink-0 px-6 text-[13px] font-semibold uppercase tracking-[.05em]"
          >
            Build your agent <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </MarketingPageFrame>
  );
}

function WorkflowPanel({ page }: { page: Solution }) {
  return (
    <aside className="wl-stitch-card overflow-hidden p-0">
      <div className="border-b border-border bg-secondary px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-[var(--radius-md)] bg-card text-primary">
            <Workflow size={16} />
          </span>
          <div>
            <p className="wl-overline">Wireline flow</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              From first message to next step
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-4 p-5">
        {page.sequence.map(([title, copy], index) => (
          <div key={title} className="flex gap-3">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-primary/25 bg-[color:var(--wireline-color-action-primary-container)] font-mono text-[10px] font-semibold text-primary">
              {index + 1}
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{copy}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-5 py-4 text-[13px] leading-5 text-muted-foreground">
        <Check size={15} className="mr-2 inline text-primary" />
        You choose what the agent can say, access, and escalate.
      </div>
    </aside>
  );
}
