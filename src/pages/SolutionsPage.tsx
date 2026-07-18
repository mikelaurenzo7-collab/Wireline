import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarClock,
  CircleDot,
  Headphones,
  MessageSquareText,
  PhoneOutgoing,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import MarketingHero from "../components/marketing/MarketingHero";

const SOLUTIONS = {
  sales: {
    eyebrow: "Sales conversations",
    title: "Every good lead gets a next step.",
    description:
      "Give one trained employee your offer, qualification rules, calendar, and follow-up. It calls, texts, and emails until the next step is booked or clearly logged.",
    icon: PhoneOutgoing,
    primary: { href: "/signup?posture=business", label: "Create a sales employee" },
    secondary: { href: "/showcase", label: "Hear a demo" },
    sequence: [
      ["A lead reaches out", "One employee responds on the channel the lead already chose."],
      ["It qualifies by your rules", "Your offer, criteria, objections, and escalation path guide the conversation."],
      ["The next step is clear", "Booked, handed off, or logged with the full context attached."],
    ],
    capabilities: [
      ["Your offer in every call", "Use your positioning, tone, qualification rules, and approved claims."],
      ["Follow-up across channels", "Continue by SMS or email without restarting the conversation."],
      ["Calendar-aware booking", "Offer real availability and write the confirmed next step back to the record."],
    ],
    proof: "More qualified conversations move forward. Your team spends time where judgment closes the deal.",
  },
  support: {
    eyebrow: "Customer coverage",
    title: "A front desk that answers before demand goes cold.",
    description:
      "Give one trained employee your policies, calendar, and handoff rules. It answers calls, texts, and email, then resolves or routes the next step.",
    icon: Headphones,
    primary: { href: "/signup?posture=business", label: "Create a front desk employee" },
    secondary: { href: "/showcase", label: "Hear a demo" },
    sequence: [
      ["A customer reaches out", "One employee answers on call, text, or email with the same identity."],
      ["It uses your business truth", "Policies, services, availability, and escalation rules stay consistent."],
      ["It resolves or hands off cleanly", "The right person receives the request with context already attached."],
    ],
    capabilities: [
      ["Your voice and playbook", "Carry your tone, policies, service knowledge, and approved answers."],
      ["Booking that closes the loop", "Schedule, confirm, and continue the conversation across email and text."],
      ["Escalation with context", "Route exceptions with the customer, history, and requested outcome intact."],
    ],
    proof: "Customers get an answer sooner. Your team joins only when its judgment matters.",
  },
} as const;

type SolutionKey = keyof typeof SOLUTIONS;

export default function SolutionsPage() {
  const { wedge = "support" } = useParams<{ wedge: string }>();
  const key = (wedge in SOLUTIONS ? wedge : "support") as SolutionKey;
  const page = SOLUTIONS[key];

  return (
    <MarketingPageFrame mainClassName="!px-0 !pb-0 !pt-16">
      <PageMeta
        title={`${page.title} | Wireline`}
        description={page.description}
        path={`/solutions/${key}`}
      />

      <MarketingHero
        eyebrow={page.eyebrow}
        title={page.title}
        description={page.description}
        primaryAction={{ to: page.primary.href, label: page.primary.label }}
        secondaryAction={{ to: page.secondary.href, label: page.secondary.label, tone: "secondary" }}
        visual={
          <div className="text-center">
            <p className="wl-eyebrow wl-eyebrow--no-rule text-primary">Live preview</p>
            <h2 className="mx-auto mt-4 max-w-[20ch] font-[var(--wireline-font-family-display)] text-[clamp(2rem,3.2vw,3.2rem)] font-semibold leading-[1] tracking-[-.04em] text-foreground">
              Hear the lane before you build it.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-7 text-muted-foreground">
              Preview the conversation, then add your voice, business truth, and handoff rules.
            </p>
            <div className="mt-7 rounded-[16px] border border-border bg-background/70 p-4">
              <BrowserCallWidget agentName={key === "sales" ? "Sales Employee" : "Front Desk"} />
            </div>
          </div>
        }
      />

      <section className="wl-public-rail mx-auto px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="wl-marketing-center mx-auto max-w-2xl">
          <p className="wl-overline text-primary">One clear operating flow</p>
          <h2 className="wl-stitch-display mt-3 text-balance">
            The conversation moves. Your team stays in control.
          </h2>
        </div>
        <ol className="mt-10 grid gap-4 lg:grid-cols-3">
          {page.sequence.map(([title, copy], index) => (
            <li key={title} className="wl-stitch-card relative p-6 text-center sm:p-7">
              <span className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-[color:var(--wireline-color-action-primary-container)] font-mono text-[var(--wireline-typography-caption-size)] font-semibold text-primary">
                0{index + 1}
              </span>
              <h3 className="wl-section-title mx-auto mt-5 max-w-[16ch] text-[clamp(1.15rem,1rem+.45vw,1.35rem)]">
                {title}
              </h3>
              <p className="mx-auto mt-3 max-w-[34ch] text-[var(--wireline-typography-caption-size)] leading-6 text-muted-foreground">
                {copy}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-border bg-card px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="wl-public-rail mx-auto">
          <div className="wl-marketing-center mx-auto max-w-3xl">
            <p className="wl-overline">Built for useful business work</p>
            <h2 className="wl-stitch-display mt-3 text-balance">
              The capabilities that make the conversation operational.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground">
              Start focused. Add another channel or connected tool only when it improves the outcome.
            </p>
          </div>
          <div className="mt-9 grid gap-3 sm:grid-cols-3">
            {page.capabilities.map(([title, copy], index) => {
              const CapabilityIcon = [MessageSquareText, CalendarClock, ShieldCheck][
                index
              ] as LucideIcon;
              return (
                <article key={title} className="wl-stitch-card bg-background p-5 text-center sm:p-6">
                  <CapabilityIcon size={18} className="mx-auto text-primary" aria-hidden="true" />
                  <h3 className="wl-card-title mx-auto mt-4 max-w-[18ch]">{title}</h3>
                  <p className="mx-auto mt-2 max-w-[34ch] text-[var(--wireline-typography-caption-size)] leading-6 text-muted-foreground">
                    {copy}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="wl-public-rail mx-auto px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="wl-stitch-card wl-stitch-card-tinted wl-marketing-center grid justify-items-center gap-6 p-6 sm:p-8">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-primary">
              <CircleDot size={16} aria-hidden="true" />
              <span className="wl-overline text-primary">The Wireline difference</span>
            </div>
            <p className="mt-4 text-[clamp(1.35rem,1.1rem+1vw,1.85rem)] font-semibold leading-[1.15] tracking-[-.035em] text-foreground">
              {page.proof}
            </p>
          </div>
          <Link
            to={page.primary.href}
            className="marketing-btn-primary min-h-12 shrink-0 px-6 text-[var(--wireline-typography-caption-size)] font-semibold"
          >
            Build this employee <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
